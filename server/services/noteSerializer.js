// server/services/noteSerializer.js
//
// The one JSON shape a note takes in every API answer.

function createNoteSerializer({
  getUserTags,
  getUserPosition,
  getUserIcon,
  noteAccessFor,
  getNoteFederation,
}) {
  // Serialize a DB row into the canonical JSON note object returned by all endpoints.
  // When userId is provided, tags come from the per-user note_user_tags table and
  // pinned/position come from note_user_positions (falling back to note defaults).
  function serializeNote(r, userId) {
    const tagsJson = userId ? getUserTags(r.id, userId) : (r.tags_json || "[]");
    let pinned = !!r.pinned;
    let position = r.position;
    if (r && Object.prototype.hasOwnProperty.call(r, "eff_pinned")) {
      pinned = !!r.eff_pinned;
      position = r.eff_position;
    } else if (userId) {
      const ov = getUserPosition(r.id, userId);
      if (ov) {
        pinned = !!ov.pinned;
        position = ov.position;
      }
    }
    // Note icon (logo) is now PER-USER and never synced. Pull it from the
    // per-user table, and defensively strip any legacy role:"icon" entry that
    // may still sit in the shared images_json (those are being retired) so a
    // collaborator never inherits someone else's icon.
    let images = JSON.parse(r.images_json || "[]");
    if (Array.isArray(images)) images = images.filter((im) => !(im && im.role === "icon"));
    return {
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      title: r.title,
      content: r.content,
      items: JSON.parse(r.items_json || "[]"),
      tags: JSON.parse(tagsJson),
      images,
      icon: userId ? getUserIcon(r.id, userId) : null,
      color: r.color,
      pinned,
      position,
      timestamp: r.timestamp,
      updated_at: r.updated_at,
      client_updated_at: r.client_updated_at,
      lastEditedBy: r.last_edited_by,
      lastEditedAt: r.last_edited_at,
      archived: !!r.archived,
      trashed: !!r.trashed,
      // Reminders: ISO-8601 UTC due instant (null = none) and the moment
      // the scheduler dispatched it (null = still pending). Plain columns,
      // never encrypted: see the ensureNoteColumns migration.
      reminderAt: r.reminder_at || null,
      reminderFiredAt: r.reminder_fired_at || null,
      // This user's access level: "owner" | "write" | "read". Read-only
      // collaborators get "read" so the client locks the editor for them.
      access: noteAccessFor(r.id, r.user_id, userId),
      // Cross-server status (null for ordinary notes): role + live link
      // state + whether this copy is currently read-only because its
      // authority peer is unreachable / locked / out of date.
      federation: getNoteFederation()?.noteFederationInfo(r.id) || null,
    };
  }

  return { serializeNote };
}

module.exports = { createNoteSerializer };
