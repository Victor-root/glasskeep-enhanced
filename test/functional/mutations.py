#!/usr/bin/env python3
# Mesure ce que valent les scénarios fonctionnels.
#
# Un test qui passe ne prouve rien tant qu'on n'a pas vérifié qu'il sait
# échouer. Ce script casse une promesse du serveur à la fois, joue le
# scénario censé s'en apercevoir, et compte les vérifications tombées. Une
# mutation qui ne fait rien tomber désigne un trou dans la couverture.
#
#     python3 test/functional/mutations.py
#
# Le fichier server/index.js est restauré à l'identique dans tous les cas,
# y compris sur interruption. Par précaution le script refuse de démarrer
# s'il y a des modifications non validées dedans: en cas de coupure
# brutale, `git checkout server/index.js` suffit alors à tout remettre.
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "server", "index.js")

# (scénario, promesse cassée, texte cherché, texte de remplacement)
MUTATIONS = [
    ("f1", "la couleur d'une note",
     "    color: r.color,", '    color: "default",'),
    ("f1", "la restauration depuis la corbeille",
     "UPDATE notes SET trashed = 0, archived = 0, position = ?",
     "UPDATE notes SET trashed = 1, archived = 0, position = ?"),
    ("f1", "le sens de la demande d'archivage",
     "updateArchived.run(archived ? 1 : 0,", "updateArchived.run(1,"),
    ("f1", "l'épinglage personnel",
     "      pinned = !!ov.pinned;", "      pinned = false;"),
    ("f2", "les étiquettes dans l'export",
     "      tags: JSON.parse(getUserTags(r.id, req.user.id)),", "      tags: [],"),
    ("f2", "le dédoublonnage à l'import",
     "        if (seenFingerprints.has(fp)) {", "        if (false) {"),
    ("f3", "le partage en lecture seule",
     'const access = req.body?.access === "read" ? "read" : "write";', 'const access = "write";'),
    ("f3", "le cloisonnement entre comptes",
     "  WHERE n.id = ? AND (n.user_id = ? OR nc.user_id IS NOT NULL)\n`));",
     "  WHERE n.id = ? AND (n.user_id = ? OR nc.user_id IS NOT NULL OR 1=1)\n`));"),
    ("f4", "la liste des rappels à venir",
     "  res.json({ reminders });", "  res.json({ reminders: [] });"),
    ("f4", "la révocation des sessions au changement de mot de passe",
     '"UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?",',
     '"UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",'),
    ("f5", "la porte du panneau d'administration",
     '  if (!row || !row.is_admin) return res.status(403).json({ error: "Admin only" });',
     "  if (false) return null;"),
    ("f5", "le cloisonnement de la bibliothèque de logos",
     "`SELECT id, name, src, created_at FROM logos WHERE user_id = ? ORDER BY created_at ASC`",
     "`SELECT id, name, src, created_at FROM logos WHERE ? IS NOT NULL ORDER BY created_at ASC`"),

    # Les correctifs de la sauvegarde: chacun doit rester tenu.
    ("f2", "l'épingle personnelle dans l'export",
     "        pinned: perso ? !!perso.pinned : !!r.pinned,", "        pinned: !!r.pinned,"),
    ("f2", "la relecture de l'icône à l'import",
     "        if (n.icon && typeof n.icon.src === \"string\") {\n          runSetUserIcon(id, req.user.id, n.icon);\n        }",
     "        if (false) {\n          runSetUserIcon(id, req.user.id, n.icon);\n        }"),
    ("f2", "la restauration d'une note déjà présente",
     "  const restaurerAttributs = (row, n) => {\n    let touche = false;",
     "  const restaurerAttributs = (row, n) => {\n    let touche = false;\n    return false;"),
    ("f3", "les étiquettes du retiré sur sa copie",
     "    if (userTagsJson && userTagsJson !== \"[]\") {\n      runUpsertUserTags(copyNoteId, userIdToRemove, userTagsJson);\n    }",
     "    if (false) {\n      runUpsertUserTags(copyNoteId, userIdToRemove, userTagsJson);\n    }"),

    # Les correctifs des droits.
    ("f3", "le refus d'un droit de partage inconnu",
     "  if (req.body?.access !== undefined\n      && req.body.access !== \"read\" && req.body.access !== \"write\") {",
     "  if (false) {"),
    ("f3", "le départage entre appareils sur la corbeille partagée",
     "  if (!isNewerOrEqual(tsResult.ms, cible.client_updated_at)) {\n    return res.json({ ok: true, stale: true, note: serializeNote(cible, req.user.id) });\n  }",
     "  if (false) {\n    return res.json({ ok: true, stale: true, note: serializeNote(cible, req.user.id) });\n  }"),
    ("f5", "le garde-fou du dernier administrateur face à un « non » écrit autrement",
     "  if (id === req.user.id && is_admin !== undefined && !is_admin) {",
     "  if (id === req.user.id && is_admin === false) {"),

    # Les trois chemins de départ d'une note partagée, même défaut que D4.
    ("f3", "les étiquettes du collaborateur qui jette une note partagée",
     "    if (userTagsJson && userTagsJson !== \"[]\") {\n      runUpsertUserTags(trashedCopyId, req.user.id, userTagsJson);\n    }",
     "    if (false) {\n      runUpsertUserTags(trashedCopyId, req.user.id, userTagsJson);\n    }"),
    ("f3", "les étiquettes du propriétaire qui passe la main",
     "    if (tagsProprietaire && tagsProprietaire !== \"[]\") {\n      runUpsertUserTags(trashedCopyId, req.user.id, tagsProprietaire);\n    }",
     "    if (false) {\n      runUpsertUserTags(trashedCopyId, req.user.id, tagsProprietaire);\n    }"),
    # Les cinq « ça fait l'inverse ».
    ("f1", "le refus d'une demande d'archivage tronquée",
     "  if (typeof archived !== \"boolean\") {\n    return res.status(400).json({ error: \"archived must be a boolean\" });\n  }",
     "  if (false) {\n    return res.status(400).json({ error: \"archived must be a boolean\" });\n  }"),
    ("f1", "l'inaction sur une restauration déjà appliquée",
     "  if (!existing.trashed) {\n    return res.json({ ok: true, note: serializeNote(existing, req.user.id) });\n  }",
     "  if (false) {\n    return res.json({ ok: true, note: serializeNote(existing, req.user.id) });\n  }"),
    ("f1", "le retour d'une note restaurée dans la liste active",
     "    UPDATE notes SET trashed = 0, archived = 0, position = ?, client_updated_at = ? WHERE id = ? AND user_id = ?",
     "    UPDATE notes SET trashed = 0, position = ?, client_updated_at = ? WHERE id = ? AND user_id = ?"),
    ("f1", "la conversion de type par modification partielle",
     "    type=COALESCE(@type,type),\n", ""),

    ("f3", "les étiquettes conservées quand personne ne reprend la note",
     "      db.prepare(\"DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?\").run(id, req.user.id);\n      broadcastNoteUpdated(id);\n      const trashedSelf = getNoteById.get(id);",
     "      db.prepare(\"DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?\").run(id, req.user.id);\n      db.prepare(\"DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?\").run(id, req.user.id);\n      broadcastNoteUpdated(id);\n      const trashedSelf = getNoteById.get(id);"),
]

SCENARIOS = {
    "f1": "f1-notes.mjs",
    "f2": "f2-etiquettes-import-export.mjs",
    "f3": "f3-collaboration.mjs",
    "f4": "f4-compte-reglages-rappels.mjs",
    "f5": "f5-administration.mjs",
}


def refuser_si_travail_en_cours():
    sortie = subprocess.run(["git", "status", "--porcelain", "--", SRC],
                            cwd=ROOT, capture_output=True, text=True)
    if sortie.stdout.strip():
        print("server/index.js porte des modifications non validées.")
        print("Validez-les ou mettez-les de côté avant de lancer la campagne.")
        sys.exit(2)


def main():
    refuser_si_travail_en_cours()
    original = open(SRC, encoding="utf-8").read()
    sauvegarde = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8")
    sauvegarde.write(original)
    sauvegarde.close()

    resultats = []
    try:
        for scenario, promesse, avant, apres in MUTATIONS:
            if original.count(avant) == 0:
                # Le code a bougé: la mutation ne veut plus rien dire, il
                # faut la réécrire plutôt que la croire réussie.
                resultats.append((scenario, promesse, None, "motif introuvable"))
                print(f"[{scenario}] {promesse}: MOTIF INTROUVABLE", flush=True)
                continue

            open(SRC, "w", encoding="utf-8").write(original.replace(avant, apres, 1))
            joue = subprocess.run(
                ["node", os.path.join(ROOT, "test", "functional", SCENARIOS[scenario])],
                capture_output=True, text=True, timeout=900)
            shutil.copy(sauvegarde.name, SRC)

            echecs = [l for l in joue.stdout.splitlines() if l.startswith(" ÉCHEC")]
            premier = echecs[0].replace(" ÉCHEC  ", "").split("  ·")[0].strip() if echecs else ""
            resultats.append((scenario, promesse, len(echecs), premier))
            print(f"[{scenario}] {promesse}: {len(echecs)} vérification(s) tombée(s)", flush=True)
    finally:
        shutil.copy(sauvegarde.name, SRC)
        os.unlink(sauvegarde.name)

    print("\n──────── récapitulatif ────────")
    manques = 0
    for scenario, promesse, tombees, premier in resultats:
        if not tombees:
            manques += 1
            print(f"NON DÉTECTÉ  {scenario}  {promesse}  ({premier or 'aucune vérification tombée'})")
        else:
            print(f"détecté      {scenario}  {promesse}  ({tombees}, dont « {premier} »)")
    print(f"\n{len(resultats) - manques}/{len(resultats)} mutations détectées.")
    return 1 if manques else 0


if __name__ == "__main__":
    sys.exit(main())
