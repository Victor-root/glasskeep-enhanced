import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../utils/api.js";
import { t } from "../i18n";
import { localizeServerError } from "../utils/serverErrors.js";

/**
 * Hook encapsulating collaboration state and actions for the "add
 * collaborator modal" (inside the note modal).
 */
export default function useCollaboration(token, {
  currentUser,
  activeId,
  showToast,
}) {
  // ── Collaboration modal state (inside note modal) ──
  const [collaborationModalOpen, setCollaborationModalOpen] = useState(false);
  const [addModalCollaborators, setAddModalCollaborators] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableLoading, setAvailableLoading] = useState(false);

  // ── Actions ──

  // Bumped when a local change to the participant list STARTS and again
  // when it FINISHES. A reload compares this before applying its answer,
  // and drops it if either bump happened while it was in flight — which
  // covers both ways it can be out of date:
  //   - it started before the change, so it describes the state the user
  //     has just moved away from;
  //   - it started after the click but while the change was still
  //     travelling, so the server had not applied it yet and answered
  //     with the old value anyway.
  // Either one used to put the previous value straight back, so the click
  // looked like it had not registered and only a second one seemed to
  // work — most visible when several were changed in a row, which keeps
  // requests in flight for longer.
  //
  // This cannot leave the list stale: every change makes the server
  // broadcast, so a fresh reload always starts after the last one has
  // landed, and that one is applied.
  const participantsMutationRef = useRef(0);
  // How many local changes are still travelling to the server. The count
  // above only catches a reload that spans a change's start or end; a
  // quick reload that fits entirely inside the window where a change is
  // in flight sees no bump at all, yet the server has not applied it yet
  // and answers with the old value. Changing several accesses in a row
  // keeps that window wide open, which is when it was still showing.
  const pendingMutationsRef = useRef(0);

  // `force` is for the reloads a change fires for itself once the server
  // has confirmed it: those are asking for the truth on purpose and must
  // not be filtered by the guards below.
  const loadCollaboratorsForAddModal = useCallback(
    async (noteId, { force = false } = {}) => {
      const seq = participantsMutationRef.current;
      try {
        const collaborators = await api(`/notes/${noteId}/collaborators`, {
          token,
        });
        if (!force) {
          if (participantsMutationRef.current !== seq) return; // superseded
          if (pendingMutationsRef.current > 0) return; // change still travelling
        }
        setAddModalCollaborators(collaborators || []);
      } catch (e) {
        if (!force && participantsMutationRef.current !== seq) return;
        console.error("Failed to load collaborators:", e);
        setAddModalCollaborators([]);
      }
    },
    [token],
  );

  // Load EVERY shareable person (local users + real users on paired peers)
  // so the add-collaborator picker shows them directly — no search required.
  // Only friendly fields surface; `username` is the opaque string the POST
  // route understands (a bare name/email locally, ref@host for a peer) and
  // is NEVER shown in the UI.
  const loadAvailableUsers = useCallback(async () => {
    setAvailableLoading(true);
    // Local users first — instant, so the picker is usable immediately.
    try {
      const localRes = await api(`/users/search?q=`, { token });
      const locals = (Array.isArray(localRes) ? localRes : [])
        .filter((u) => u.id !== currentUser?.id)
        .map((u) => ({
          key: `local:${u.id}`,
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          avatar: u.avatar_url || null,
          federated: false,
          serverLabel: null,
          ref: null,
          username: u.name || u.email,
        }));
      setAvailableUsers(locals);
    } catch {
      setAvailableUsers([]);
    } finally {
      setAvailableLoading(false);
    }
    // Real users on paired peers — appended when they arrive, so a slow or
    // offline peer never blocks the local list.
    try {
      const remoteRes = await api(`/federation/users/search?q=`, { token });
      const remotes = (Array.isArray(remoteRes?.users) ? remoteRes.users : []).map((u) => ({
        key: `remote:${u.host}|${u.ref}`,
        id: null,
        name: u.name || u.ref,
        email: null,
        avatar: u.avatar || null,
        federated: true,
        serverLabel: u.serverLabel,
        ref: u.ref,
        username: `${u.ref}@${u.host}`,
      }));
      if (remotes.length > 0) setAvailableUsers((prev) => [...prev, ...remotes]);
    } catch {
      /* peers unreachable — local list stands on its own */
    }
  }, [token, currentUser]);


  const removeCollaborator = async (collaboratorId, noteId = null, mode = null) => {
    participantsMutationRef.current++;
    pendingMutationsRef.current++;
    try {
      const targetNoteId = noteId || activeId;
      if (!targetNoteId) return;
      await api(`/notes/${targetNoteId}/collaborate/${collaboratorId}`, {
        method: "DELETE",
        token,
        body: mode ? { mode } : undefined,
      });
      // No local toast here — the server sends note_access_revoked_notification
      // via SSE which already fires showRevokeNotificationToast for both parties.
      // Firing a second toast from the API response would double the notification.
      if (activeId) {
        await loadCollaboratorsForAddModal(activeId, { force: true });
      }
    } catch (e) {
      showToast(localizeServerError(e.message, "failedRemoveCollaborator"), "error");
    } finally {
      pendingMutationsRef.current--;
      participantsMutationRef.current++;
    }
  };

  // Turn a collaborate failure into a human message. A "locked" error from
  // the federation path means the TARGET peer's instance is at-rest-locked
  // and can't accept the share yet. Prefer the friendly display name + the
  // admin-assigned server label (passed from the picker); fall back to
  // parsing the raw "ref@host" only when those aren't available.
  const describeAddError = (e, ctx) => {
    if (e?.message === "locked") {
      const username = typeof ctx === "string" ? ctx : ctx?.username || "";
      const atIdx = String(username).lastIndexOf("@");
      const rawName = atIdx > 0 ? username.slice(0, atIdx) : username;
      const rawServer = atIdx > 0 ? username.slice(atIdx + 1) : username;
      const name = (typeof ctx === "object" && ctx?.name) || rawName;
      const server = (typeof ctx === "object" && ctx?.serverLabel) || rawServer;
      return t("collabPeerLocked")
        .replace("{server}", server)
        .replace("{name}", name);
    }
    return localizeServerError(e.message, "failedAddCollaborator");
  };

  // Owner-only: set a collaborator's access level ("read" | "write").
  // Optimistic — the modal row flips at once; on failure we revert by
  // reloading the authoritative list. The note list refreshes so the
  // collaborator's own editor locks/unlocks (also pushed live over SSE).
  const setCollaboratorAccess = async (collaboratorId, access) => {
    const targetNoteId = activeId;
    if (!targetNoteId) return;
    const canWrite = access === "write" ? 1 : 0;
    participantsMutationRef.current++;
    pendingMutationsRef.current++;
    setAddModalCollaborators((prev) =>
      prev.map((c) => (c.id === collaboratorId ? { ...c, canWrite } : c)),
    );
    try {
      await api(`/notes/${targetNoteId}/collaborate/${collaboratorId}`, {
        method: "PATCH",
        token,
        body: { access },
      });
    } catch (e) {
      showToast(localizeServerError(e.message, "genericError"), "error");
      await loadCollaboratorsForAddModal(targetNoteId, { force: true });
    } finally {
      pendingMutationsRef.current--;
      participantsMutationRef.current++;
    }
  };

  // Add SEVERAL collaborators at once, each with its own access level, then
  // a single summary toast — used by the picker's "confirm" step. `items`
  // is [{ username, access }].
  const addCollaboratorsBatch = async (items) => {
    if (!activeId || !Array.isArray(items) || items.length === 0) return;
    participantsMutationRef.current++;
    pendingMutationsRef.current++;
    let added = 0;
    try {
      for (const it of items) {
        try {
          await api(`/notes/${activeId}/collaborate`, {
            method: "POST",
            token,
            body: { username: it.username, access: it.access === "read" ? "read" : "write" },
          });
          added += 1;
        } catch (e) {
          // 409 = already a collaborator (raced) → skip quietly; surface others.
          if (e.status !== 409) {
            showToast(describeAddError(e, it), "error");
          }
        }
      }
      if (added > 0) {
        showToast(
          added === 1
            ? t("addedCollaboratorsOne")
            : t("addedCollaboratorsMany").replace("{n}", String(added)),
          "success",
          undefined,
          "share",
        );
        await loadCollaboratorsForAddModal(activeId, { force: true });
      }
    } finally {
      pendingMutationsRef.current--;
      participantsMutationRef.current++;
    }
  };

  // ── Effects ──

  // Load collaborators when note modal opens or Add Collaborator modal opens
  useEffect(() => {
    if (activeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the note's collaborators from the server when the note opens
      loadCollaboratorsForAddModal(activeId);
    }
  }, [activeId, loadCollaboratorsForAddModal]);

  useEffect(() => {
    if (collaborationModalOpen && activeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches collaborators from the server when the modal opens
      loadCollaboratorsForAddModal(activeId);
      loadAvailableUsers();
    }
  }, [collaborationModalOpen, activeId, loadCollaboratorsForAddModal, loadAvailableUsers]);

  // Keep the open note's participant list live. Until now it was only
  // loaded when the note or the modal opened, and after actions taken on
  // THIS device — so a collaborator removed by the owner (or by a peer's
  // roster sync) stayed on screen until the modal was closed and reopened.
  // dispatchServerEvent forwards the server's note_updated on the "note-updated" bus,
  // which the server emits for exactly these participant changes.
  useEffect(() => {
    if (!activeId) return undefined;
    let timer = null;
    const onNoteUpdated = (e) => {
      if (String(e?.detail?.noteId ?? "") !== String(activeId)) return;
      // Coalesce: the same event also fires on every content edit, while
      // the participant list changes far more rarely. One trailing reload
      // per burst keeps it fresh without a request per keystroke synced.
      clearTimeout(timer);
      timer = setTimeout(() => loadCollaboratorsForAddModal(activeId), 600);
    };
    window.addEventListener("note-updated", onNoteUpdated);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("note-updated", onNoteUpdated);
    };
  }, [activeId, loadCollaboratorsForAddModal]);

  return {
    // Modal state
    collaborationModalOpen, setCollaborationModalOpen,
    addModalCollaborators,
    availableUsers,
    availableLoading,
    // Actions
    removeCollaborator,
    loadCollaboratorsForAddModal,
    addCollaboratorsBatch,
    setCollaboratorAccess,
  };
}
