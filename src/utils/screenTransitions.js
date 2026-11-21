// Moves between the sign-in screens ("auth") and the notes ("app"): the
// screen going away plays its exit before the next one is mounted, and the
// next one plays its entrance. Driven by data-gk-screen on <html>; the
// animations live in styles/global/shell.js.

const LEAVE_MS = 260;
const ENTER_MS = 1100;

let enterTimer = null;

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Plays the exit of the "auth" or "app" screen, if it is the one shown,
// and resolves once it has played.
export function leaveScreen(kind) {
  const selector = kind === "auth" ? ".auth-shell" : ".gk-app-screen";
  if (reducedMotion() || !document.querySelector(selector)) return Promise.resolve();
  clearTimeout(enterTimer);
  document.documentElement.dataset.gkScreen = `leaving-${kind}`;
  return new Promise((resolve) => setTimeout(resolve, LEAVE_MS));
}

// The "auth" or "app" screen just mounted: plays its entrance.
export function enterScreen(kind) {
  const root = document.documentElement;
  clearTimeout(enterTimer);
  if (reducedMotion()) {
    delete root.dataset.gkScreen;
    return;
  }
  const state = `entering-${kind}`;
  root.dataset.gkScreen = state;
  enterTimer = setTimeout(() => {
    if (root.dataset.gkScreen === state) delete root.dataset.gkScreen;
  }, ENTER_MS);
}
