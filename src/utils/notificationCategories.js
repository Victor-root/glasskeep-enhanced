// Buckets the user can mute (sound) or hide (display filter) one by one.
// Explicit types (share / revoke) take precedence; everything else falls
// back to its `variant`, which is how showToast() categorises
// success / error / warning / info.

const ACCESS_TYPES = new Set([
  "note_access_revoked",
  "note_access_revoked_with_copy",
  "collaborator_removed",
  "collaborator_removed_with_copy",
  "collaborator_left",
  "shared_note_deleted",
  "shared_note_deleted_with_copy",
]);

// One of: share, access, success, warning, error, info.
export function soundCategoryFor(notification) {
  const typeKey = notification?.type;
  if (typeKey === "note_shared") return "share";
  if (ACCESS_TYPES.has(typeKey)) return "access";
  const variant = notification?.variant;
  if (variant === "success") return "success";
  if (variant === "warning") return "warning";
  if (variant === "error") return "error";
  return "info";
}

// Same buckets plus the federation and reminder types the display filter
// exposes separately.
export function filterCategoryFor(spec) {
  const typeKey = spec?.type;
  if (typeKey === "federation") return "federation";
  if (typeKey === "reminder") return "reminder";
  return soundCategoryFor(spec);
}
