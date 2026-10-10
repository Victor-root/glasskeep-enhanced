// Remplace React et le cache IndexedDB par des doublures, pour exécuter
// la couche de synchronisation hors navigateur.
const STUBS = {
  react: new URL("./react.mjs", import.meta.url).href,
  "./localDb.js": new URL("./localDb.mjs", import.meta.url).href,
};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub && (specifier === "react" || context.parentURL?.includes("/src/sync/"))) {
    return { url: stub, shortCircuit: true };
  }
  return next(specifier, context);
}
