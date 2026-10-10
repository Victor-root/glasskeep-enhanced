// Une copie du serveur n'écrase jamais une modification locale commencée
// pendant qu'on l'appliquait.
//
// TROUVÉ EN CONDITIONS RÉELLES: en tapant vite dans une liste à cocher,
// une ligne tout juste écrite disparaissait parfois. La réponse du
// serveur à l'enregistrement précédent vérifiait que la note n'était pas
// en cours d'édition, attendait l'écriture dans le cache local, puis
// remplaçait la note sans revérifier. Une frappe arrivée pendant cette
// attente était effacée par une copie plus ancienne qu'elle.
//
// La règle vérifiée ici: juste avant de remplacer la note, on revérifie
// qu'aucune modification n'a commencé depuis.
import { register } from "node:module";
import { runner } from "../federation/lib.mjs";

register("./resolve-like-vite.mjs", import.meta.url);
register("./t20-stubs/hooks.mjs", import.meta.url);

const { db } = await import("./t20-stubs/localDb.mjs");
const { default: useLocalLeases } = await import("../../src/sync/useLocalLeases.js");
const { reconcileSyncResult } = await import("../../src/sync/reconcileSyncResult.js");

const t = runner("Une copie du serveur n'écrase pas une modification locale");

const local = { id: "n1", title: "frappe locale", updated_at: "2026-01-01T00:00:02Z" };
const server = { id: "n1", title: "copie du serveur", updated_at: "2026-01-01T00:00:01Z" };

async function applyServerAnswer({ editMeanwhile, editFinished }) {
  const leases = useLocalLeases();
  let notes = [local];
  const ctx = {
    userId: 1,
    sessionId: "s",
    viewFilter: () => null,
    setNotes: (update) => { notes = typeof update === "function" ? update(notes) : update; },
    leases,
    onNoteGone: () => {},
    reloadCurrentView: () => {},
  };
  db.writes.length = 0;
  const done = reconcileSyncResult(
    { type: "update", noteId: "n1" },
    { ok: true, note: server },
    ctx,
  );
  while (db.writes.length === 0) await new Promise((r) => setTimeout(r, 0));
  if (editMeanwhile) {
    const lease = leases.acquireLocalLease("n1");
    if (editFinished) leases.releaseLocalLease("n1", lease);
  }
  db.writes[0]();
  await done;
  return notes[0].title;
}

t.check("sans frappe entre-temps, la copie du serveur est appliquée",
        await applyServerAnswer({ editMeanwhile: false }) === server.title);
t.check("une frappe en cours pendant l'écriture du cache est gardée",
        await applyServerAnswer({ editMeanwhile: true, editFinished: false }) === local.title);
t.check("une frappe déjà terminée pendant cette attente est gardée aussi",
        await applyServerAnswer({ editMeanwhile: true, editFinished: true }) === local.title);

process.exit(t.summary() ? 0 : 1);
