// Chaque écriture attend que le test l'autorise: c'est la fenêtre dans
// laquelle une modification locale peut commencer.
export const db = { writes: [], pending: false };

function gated() {
  let release;
  const done = new Promise((resolve) => { release = resolve; });
  db.writes.push(release);
  return done;
}

export const putNote = () => gated();
export const deleteNote = () => gated();
export const hasPendingChanges = async () => db.pending;
