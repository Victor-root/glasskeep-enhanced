// "Strike through checked items" — a per-device display preference for the
// checkbox / task lists inside rich-text notes.
//
// This is purely visual: it toggles a single class on <html>
// (gk-strike-checked) that CSS keys off to draw a line-through on the text of
// checked task items (see .gk-strike-checked rules in styles/global/notes.js). It does
// NOT add a Strike mark to the note content and never touches the stored doc —
// the checked state itself lives in the Tiptap JSON, this only changes how a
// checked item looks. Stored locally because it's a reading preference, not
// note data: it applies the same way to every note on this device.

export const TASK_STRIKE_CLASS = "gk-strike-checked";
const STORAGE_KEY = "gk:taskStrikeChecked";

// Default OFF — matches the dedicated checklist note type (which does not
// strike done items) so enabling it is an explicit opt-in.
const DEFAULT_ON = false;

// Event fired on <document> whenever the preference changes, so any open
// toolbar popover mirroring the checkbox stays in sync across editor
// instances (e.g. side-by-side split mode).
export const TASK_STRIKE_EVENT = "gk:taskstrike";

export function getStoredTaskStrike() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "1") return true;
    if (saved === "0") return false;
  } catch {
    /* storage blocked — fall through to default */
  }
  return DEFAULT_ON;
}

// The value actually applied right now, read from the live <html> class.
export function getActiveTaskStrike() {
  return document.documentElement.classList.contains(TASK_STRIKE_CLASS);
}

// Toggle the class on <html> + notify listeners. Does not persist — callers
// that need persistence use setTaskStrike(). Safe to call at boot before the
// stylesheet is injected (the class just waits for the rules to arrive).
export function applyTaskStrikeClass(on) {
  const enabled = !!on;
  document.documentElement.classList.toggle(TASK_STRIKE_CLASS, enabled);
  try {
    document.dispatchEvent(new CustomEvent(TASK_STRIKE_EVENT, { detail: enabled }));
  } catch {
    /* CustomEvent unavailable — listeners just won't fire */
  }
  return enabled;
}

// Read + apply the saved preference. Call once at boot (before React renders)
// so checked items render struck/un-struck correctly on first paint.
export function applyStoredTaskStrike() {
  return applyTaskStrikeClass(getStoredTaskStrike());
}

// Full apply from the toolbar: swap the class and persist.
export function setTaskStrike(on) {
  const enabled = applyTaskStrikeClass(on);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* storage blocked — selection still applies for this session */
  }
  return enabled;
}
