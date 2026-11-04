// server/federation/notesAttachments.js
//
// The files attached to a federated note (see attachments/attachmentStore.js).
//
// LIST. The note's home server holds the reference list and pushes all of it
// to its mirrors, which simply replace theirs; a watermark on the mapping
// tells the tick what still has to go out, as for the note's content. A
// mirror has no say of its own: a change made on it is sent to the home
// server first, and refused if that server cannot be reached, so one list
// never diverges from the other.
//
// BYTES. They stay on the server they were uploaded to and cross the link
// the first time someone opens them there, then stay. They travel as plain
// bytes over the verified-TLS link and are re-encrypted by the side that
// receives them, like note content. A file id is an unguessable capability:
// knowing one means a peer was once given it by a share.

const crypto = require("crypto");
const { Readable } = require("stream");

function createAttachmentSync({ q, store, peer, deps, log }) {
  const { attachments } = deps;
  const fetchesInFlight = new Map();

  const fingerprint = (items) => items.length
    ? crypto.createHash("sha256")
      .update(JSON.stringify(items.map((i) => [i.id, i.thumb ? i.thumb.length : 0])))
      .digest("hex")
    : "";

  async function pushList(link, noteId) {
    const items = attachments.listForPeer(noteId);
    const resp = await peer.postSigned(link, "/api/federation/notes/attachments", {
      linkId: link.id, noteId, attachments: items,
    });
    if (resp.ok && resp.json?.ok === true) q.setAttachmentsPushed.run(fingerprint(items), noteId, link.id);
  }

  // Called for every mapping by the tick and after each change.
  async function reconcile(m, link) {
    if (m.role !== "home") return;
    const items = attachments.listForPeer(m.note_id);
    if (fingerprint(items) !== (m.attachments_pushed || "")) await pushList(link, m.note_id);
  }

  // True when the change may go ahead: always on the home server, and on a
  // mirror once the home server has taken it.
  async function onChanged(noteId, change) {
    const mappings = q.listByNote.all(noteId);
    const mirror = mappings.find((m) => m.role === "mirror");
    if (mirror) {
      if (!change.add && !change.removeId) return true;
      const link = store.getById(mirror.link_id);
      if (!link) return false;
      try {
        const resp = await peer.postSigned(link, "/api/federation/notes/attachment-change", {
          linkId: link.id, noteId, add: change.add || null, removeId: change.removeId || null,
        });
        return !!(resp.ok && resp.json?.ok === true);
      } catch (e) {
        log.warn?.("[federation/notes] attachment change:", e?.message);
        return false;
      }
    }
    for (const m of mappings) {
      const link = store.getById(m.link_id);
      if (link?.status === "active" && link.peer_reachable === 1) {
        pushList(link, noteId).catch((e) => log.warn?.("[federation/notes] attachments push:", e?.message));
      }
    }
    return true;
  }

  // A mirror receives the home server's list.
  function handleIncomingList({ linkId, noteId, attachments: items }) {
    const mapping = q.getMappingForLink.get(noteId, linkId);
    if (mapping?.role !== "mirror") return { ok: false, error: "unknown_note" };
    if (!Array.isArray(items)) return { ok: false, error: "invalid_list" };
    attachments.replaceFromPeer(noteId, items, linkId);
    deps.broadcastNoteAttachments(noteId);
    return { ok: true };
  }

  // The home server receives a change made on a mirror, then tells everyone.
  function handleIncomingChange({ linkId, noteId, add, removeId }) {
    const mapping = q.getMappingForLink.get(noteId, linkId);
    if (mapping?.role !== "home") return { ok: false, error: "unknown_note" };
    if (!q.hasWritableShadowCollab.get(noteId, `${linkId}|%`)) return { ok: false, error: "read_only" };
    if (add) attachments.upsertFromPeer(noteId, add, linkId);
    if (removeId) attachments.remove(noteId, String(removeId));
    deps.broadcastNoteAttachments(noteId);
    onChanged(noteId, {}).catch(() => {});
    return { ok: true };
  }

  // Makes sure the bytes of `fileId` are on this server.
  function ensureFile(fileId) {
    const file = attachments.getFile(fileId);
    if (!file) return Promise.reject(new Error("Unknown attachment file"));
    if (!file.remote_link_id) return Promise.resolve();
    if (fetchesInFlight.has(fileId)) return fetchesInFlight.get(fileId);
    const fetching = (async () => {
      const link = store.getById(file.remote_link_id);
      if (!link) throw new Error("The peer holding this file is gone");
      const resp = await peer.fetchSigned(link, "/api/federation/notes/attachment-file", { linkId: link.id, fileId });
      if (!resp.ok || !resp.body) throw new Error(`Peer answered ${resp.status}`);
      await attachments.storePeerFile(file, Readable.fromWeb(resp.body));
    })().finally(() => fetchesInFlight.delete(fileId));
    fetchesInFlight.set(fileId, fetching);
    return fetching;
  }

  return { reconcile, onChanged, handleIncomingList, handleIncomingChange, ensureFile };
}

module.exports = { createAttachmentSync };
