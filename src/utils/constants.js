/** ---------- Special tag filters ---------- */
export const ALL_IMAGES = "__ALL_IMAGES__";
// Sentinel "view" value (like ALL_IMAGES / "ARCHIVED" / "TRASHED") for the
// Reminders sidebar entry. Unlike archive/trash it is NOT a separate data
// set: it's a client-side filter over the regular notes list showing only
// notes that carry a reminder, so a reminded note stays visible in the
// normal view too.
export const REMINDERS = "__REMINDERS__";
