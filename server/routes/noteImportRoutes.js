// server/routes/noteImportRoutes.js
//
// Importing a backup: new notes are created, notes already present are
// not duplicated but get back what the backup still holds for them.

const crypto = require("crypto");
const { uid } = require("../utils/ids");
const { validateAudioContent } = require("../utils/audioContent");
const { nowISO, parseIsoTimestamp, normalizeDisplayTimestamp } = require("../utils/timestamps");

function attachNoteImportRoutes(app, deps) {
  const {
    db,
    auth,
    decryptRows,
    runInsertNote,
    runPatchNoteSensitiveCollab,
    getUserTags,
    runUpsertUserTags,
    getUserIcon,
    runSetUserIcon,
    getUserPosition,
    upsertUserPosition,
    sendEventToUser,
  } = deps;

  app.post("/api/notes/import", auth, (req, res) => {
    const payload = req.body || {};
    const src = Array.isArray(payload.notes)
      ? payload.notes
      : Array.isArray(payload)
        ? payload
        : [];
    if (!src.length) return res.status(400).json({ error: "No notes to import." });

    // Check EVERY note id in the database, not just the importing
    // user's. notes.id is the global PRIMARY KEY, so an id that's
    // already in use by ANOTHER user (typical case: same .json
    // exported from user A and re-imported into user B) would still
    // collide on insert. Query the whole id column once and let the
    // existing collision-rewrite logic below handle it transparently.
    const allRows = db.prepare("SELECT id FROM notes").all();
    const existing = new Set(allRows.map((r) => r.id));

    // Deduplication: re-importing the same .json (typical case: a user
    // re-imports their own GlassKeep export, or pulls Google Takeout
    // twice) used to multiply every note. Build a fingerprint of the
    // importing user's existing notes and skip any incoming note whose
    // fingerprint matches an existing one (or a sibling earlier in the
    // same batch).
    //
    // The fingerprint normalises two things that would otherwise look
    // different across re-imports of the same content:
    //
    //   - checklist items: each import allocates fresh per-item ids
    //     (uid()), so the raw items_json shifts every time. Strip ids
    //     and keep only { text, done } for the hash.
    //   - images: same story for image ids, but the src data-URLs are
    //     huge: running them through SHA-1 (crypto is already imported
    //     above) yields a short stable digest. Without this an
    //     image-only note (no title, no body) had an empty fingerprint
    //     `text||` and only the FIRST one survived: typical Google
    //     Keep import case.
    // Pull all columns so the decryptRows() helper can transparently
    // decrypt rows when at-rest encryption is unlocked.
    const userRows = decryptRows(
      db.prepare("SELECT * FROM notes WHERE user_id = ?").all(req.user.id),
    );
    const sha1Short = (s) =>
      crypto.createHash("sha1").update(s || "").digest("base64").slice(0, 22);
    const normItems = (jsonOrArr) => {
      let arr;
      if (typeof jsonOrArr === "string") {
        try { arr = JSON.parse(jsonOrArr); } catch { arr = []; }
      } else {
        arr = Array.isArray(jsonOrArr) ? jsonOrArr : [];
      }
      return JSON.stringify(
        arr.map((it) => ({ text: String(it?.text || ""), done: !!it?.done })),
      );
    };
    const normImagesHash = (jsonOrArr) => {
      let arr;
      if (typeof jsonOrArr === "string") {
        try { arr = JSON.parse(jsonOrArr); } catch { arr = []; }
      } else {
        arr = Array.isArray(jsonOrArr) ? jsonOrArr : [];
      }
      if (!arr.length) return "";
      // Hash the concatenation of (name, src) per image so two notes
      // with the same images get identical fingerprints regardless of
      // image-id ordering / per-import id reallocation.
      return sha1Short(
        arr
          .map((im) => `${String(im?.name || "")}${String(im?.src || "")}`)
          .join(""),
      );
    };
    const fingerprintFromRow = (r) => {
      const title = String(r.title || "").trim();
      const type = r.type === "checklist" ? "checklist"
                : r.type === "draw" ? "draw" : "text";
      const imgs = normImagesHash(r.images_json);
      if (type === "checklist") return `cl|${title}|${normItems(r.items_json)}|${imgs}`;
      return `${type}|${title}|${r.content || ""}|${imgs}`;
    };
    const fingerprintFromIncoming = (n) => {
      const title = String(n.title || "").trim();
      const type = n.type === "checklist" ? "checklist"
                : n.type === "draw" ? "draw" : "text";
      const imgs = normImagesHash(n.images);
      if (type === "checklist") return `cl|${title}|${normItems(n.items)}|${imgs}`;
      return `${type}|${title}|${String(n.content || "")}|${imgs}`;
    };
    // On retient la note existante derrière chaque empreinte, et pas
    // seulement l'empreinte: une sauvegarde restaurée doit pouvoir rendre à
    // une note ce qu'elle avait perdu, ce qu'un simple « déjà vue » ne
    // permet pas.
    const noteParEmpreinte = new Map();
    for (const r of userRows) {
      const fp = fingerprintFromRow(r);
      if (!noteParEmpreinte.has(fp)) noteParEmpreinte.set(fp, r);
    }
    const seenFingerprints = new Set(noteParEmpreinte.keys());

    const aLeChamp = (n, cle) => Object.prototype.hasOwnProperty.call(n, cle);

    // Ce qu'une note déjà présente peut récupérer d'une sauvegarde: tout ce
    // qui ne fait pas partie de son texte, donc précisément ce que
    // l'empreinte ignore et qu'un simple saut perdait pour de bon.
    //
    // Rien n'est écrit si rien ne diffère: réimporter deux fois le même
    // fichier reste sans effet, ce qui est la raison d'être du
    // dédoublonnage. Un champ absent du fichier n'efface rien, pour qu'une
    // sauvegarde ancienne ou venue d'ailleurs ne vide pas ce qu'elle ne
    // connaît pas.
    const restaurerAttributs = (row, n) => {
      let touche = false;

      if (Array.isArray(n.tags)) {
        const voulues = JSON.stringify(n.tags);
        if (voulues !== "[]" && voulues !== getUserTags(row.id, req.user.id)) {
          runUpsertUserTags(row.id, req.user.id, voulues);
          touche = true;
        }
      }

      if (typeof n.color === "string" && n.color !== row.color) {
        // Passe par le chemin d'écriture normal: la couleur fait partie de
        // ce qui est chiffré au repos, l'écrire en colonne la perdrait.
        runPatchNoteSensitiveCollab(row.id, req.user.id, { color: n.color });
        touche = true;
      }

      if (aLeChamp(n, "pinned") || typeof n.position === "number") {
        const perso = getUserPosition(row.id, req.user.id);
        const epingleActuelle = perso ? !!perso.pinned : !!row.pinned;
        const rangActuel = perso ? perso.position : row.position;
        const epingleVoulue = aLeChamp(n, "pinned") ? !!n.pinned : epingleActuelle;
        const rangVoulu = typeof n.position === "number" ? n.position : rangActuel;
        if (epingleVoulue !== epingleActuelle || rangVoulu !== rangActuel) {
          upsertUserPosition.run({
            note_id: row.id, user_id: req.user.id,
            position: rangVoulu, pinned: epingleVoulue ? 1 : 0,
          });
          touche = true;
        }
      }

      if (n.icon && typeof n.icon.src === "string") {
        const actuelle = getUserIcon(row.id, req.user.id);
        if (JSON.stringify(actuelle) !== JSON.stringify(n.icon)) {
          runSetUserIcon(row.id, req.user.id, n.icon);
          touche = true;
        }
      }

      return touche;
    };

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let rejected = 0;
    const idsImportes = [];
    try {
      const tx = db.transaction((arr) => {
        for (const n of arr) {
          const fp = fingerprintFromIncoming(n);
          if (seenFingerprints.has(fp)) {
            // Une note archivée ou à la corbeille n'est pas touchée: on ne
            // ressuscite pas discrètement ce que l'utilisateur a rangé ou
            // jeté, on se contente de ne pas le dupliquer.
            const dejaLa = noteParEmpreinte.get(fp);
            if (dejaLa && !dejaLa.archived && !dejaLa.trashed && restaurerAttributs(dejaLa, n)) {
              updated++;
            } else {
              skipped++;
            }
            continue;
          }
          seenFingerprints.add(fp);
          // Une note sans identifiant recevait l'identifiant littéral
          // "undefined", faute de vérifier sa présence avant de la convertir
          // en chaîne. Un fichier venu d'un autre outil créait donc une note
          // fantôme portant ce nom, et cet identifiant, désormais pris,
          // bloquait tous les imports suivants du même genre.
          const idPropose = n.id === undefined || n.id === null || n.id === ""
            ? uid() : String(n.id);
          const id = existing.has(idPropose) ? uid() : idPropose;
          existing.add(id);
          const importedTags = JSON.stringify(Array.isArray(n.tags) ? n.tags : []);
          const importedType =
            n.type === "checklist" ? "checklist"
              : n.type === "draw" ? "draw"
                : n.type === "audio" ? "audio"
                  : "text";
          if (importedType === "audio") {
            // Une note refusée n'est pas un doublon: la compter avec eux
            // présentait une perte de données comme un saut volontaire, et
            // le client n'avait aucun moyen de prévenir.
            const audioErr = validateAudioContent(String(n.content || ""));
            if (audioErr) { rejected++; continue; }
          }
          runInsertNote({
            id,
            user_id: req.user.id,
            type: importedType,
            title: String(n.title || ""),
            content: importedType === "checklist" ? "" : String(n.content || ""),
            items_json: JSON.stringify(Array.isArray(n.items) ? n.items : []),
            tags_json: "[]",
            images_json: JSON.stringify(Array.isArray(n.images) ? n.images : []),
            color: typeof n.color === "string" ? n.color : "default",
            pinned: n.pinned ? 1 : 0,
            position: typeof n.position === "number" ? n.position : Date.now(),
            timestamp: normalizeDisplayTimestamp(n.timestamp).iso || nowISO(),
            client_updated_at: (parseIsoTimestamp(n.client_updated_at || n.timestamp) || {}).iso || nowISO(),
          });
          if (importedTags !== "[]") runUpsertUserTags(id, req.user.id, importedTags);
          // L'icône est personnelle comme les étiquettes: l'export l'écrit
          // déjà, l'import ne la relisait pas et elle se perdait à chaque
          // aller-retour de sauvegarde.
          if (n.icon && typeof n.icon.src === "string") {
            runSetUserIcon(id, req.user.id, n.icon);
          }
          idsImportes.push(id);
          imported++;
        }
      });
      tx(src);
      // Prévenir les autres appareils. Une création ordinaire les prévient,
      // un import ne disait rien: restaurer une sauvegarde depuis
      // l'ordinateur ne faisait rien apparaître sur le téléphone avant un
      // rechargement à la main. Un seul signal pour tout le lot, les autres
      // sessions rechargeant leur vue d'un coup plutôt que note par note.
      if (idsImportes.length > 0 || updated > 0) {
        sendEventToUser(req.user.id, {
          type: "notes_imported",
          imported: idsImportes.length,
          updated,
        });
      }
      res.json({ ok: true, imported, updated, skipped, rejected });
    } catch (err) {
      // The raw message can name tables and columns, so it stays in the
      // server log and never rides the response. The client maps the bare
      // string to its localized errImportFailed either way.
      console.error("[Import] Failed:", err.message);
      res.status(500).json({ error: "Import failed" });
    }
  });
}

module.exports = { attachNoteImportRoutes };
