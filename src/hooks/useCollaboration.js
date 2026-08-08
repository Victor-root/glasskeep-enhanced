import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../utils/api.js";
import { t } from "../i18n";
import { localizeServerError } from "../utils/serverErrors.js";

/**
 * Hook encapsulating collaboration state and actions.
 * Purely mechanical extraction from App — same states, same actions, same behavior.
 *
 * Manages two separate collaboration UIs:
 * 1. The "collaboration dialog" (NoteCard context menu)
 * 2. The "add collaborator modal" (inside the note modal)
 */
export default function useCollaboration(token, {
  notes,
  currentUser,
  activeId,
  showToast,
  invalidateNotesCache,
  setNotes,
  collaboratorInputRef,
}) {
  // ── Collaboration dialog state (NoteCard context) ──
  const [collaborationDialogOpen, setCollaborationDialogOpen] = useState(false);
  const [collaborationDialogNoteId, setCollaborationDialogNoteId] = useState(null);
  const [noteCollaborators, setNoteCollaborators] = useState([]);
  const [isNoteOwner, setIsNoteOwner] = useState(false);

  // ── Collaboration modal state (inside note modal) ──
  const [collaborationModalOpen, setCollaborationModalOpen] = useState(false);
  const [collaboratorUsername, setCollaboratorUsername] = useState("");
  const [addModalCollaborators, setAddModalCollaborators] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  // Real users on paired servers matching the search (cross-server share).
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  // ── Actions ──

  const loadNoteCollaborators = useCallback(
    async (noteId) => {
      try {
        const collaborators = await api(`/notes/${noteId}/collaborators`, {
          token,
        });
        setNoteCollaborators(collaborators || []);

        const note = notes.find((n) => String(n.id) === String(noteId));
        if (note?.user_id) {
          setIsNoteOwner(note.user_id === currentUser?.id);
        } else {
          const isCollaborator = collaborators.some(
            (c) => c.id === currentUser?.id,
          );
          setIsNoteOwner(!isCollaborator);
        }
      } catch (e) {
        console.error("Failed to load collaborators:", e);
        setNoteCollaborators([]);
        setIsNoteOwner(false);
      }
    },
    [token, notes, currentUser],
  );

  const showCollaborationDialog = useCallback(
    (noteId) => {
      setCollaborationDialogNoteId(noteId);
      setCollaborationDialogOpen(true);
      loadNoteCollaborators(noteId);
    },
    [loadNoteCollaborators],
  );

  const loadCollaboratorsForAddModal = useCallback(
    async (noteId) => {
      try {
        const collaborators = await api(`/notes/${noteId}/collaborators`, {
          token,
        });
        setAddModalCollaborators(collaborators || []);
      } catch (e) {
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
    try {
      const targetNoteId = noteId || collaborationDialogNoteId || activeId;
      if (!targetNoteId) return;
      await api(`/notes/${targetNoteId}/collaborate/${collaboratorId}`, {
        method: "DELETE",
        token,
        body: mode ? { mode } : undefined,
      });
      // No local toast here — the server sends note_access_revoked_notification
      // via SSE which already fires showRevokeNotificationToast for both parties.
      // Firing a second toast from the API response would double the notification.
      if (collaborationDialogNoteId) {
        loadNoteCollaborators(collaborationDialogNoteId);
      }
      if (activeId) {
        await loadCollaboratorsForAddModal(activeId);
      }
      invalidateNotesCache();
    } catch (e) {
      showToast(localizeServerError(e.message, "failedRemoveCollaborator"), "error");
    }
  };

  const searchUsers = useCallback(
    async (query) => {
      setLoadingUsers(true);
      try {
        const searchQuery =
          query && query.trim().length > 0 ? query.trim() : "";
        const existingCollaboratorIds = new Set(
          addModalCollaborators.map((c) => c.id),
        );
        // Local users AND real users on every paired server, in parallel.
        // The federation search proxies to each peer; a peer being down
        // just yields no remote results, never an error.
        const [localRes, remoteRes] = await Promise.allSettled([
          api(`/users/search?q=${encodeURIComponent(searchQuery)}`, { token }),
          api(`/federation/users/search?q=${encodeURIComponent(searchQuery)}`, {
            token,
          }),
        ]);
        const localUsers =
          localRes.status === "fulfilled" && Array.isArray(localRes.value)
            ? localRes.value
            : [];
        const filtered = localUsers.filter(
          (u) => u.id !== currentUser?.id && !existingCollaboratorIds.has(u.id),
        );
        const remote =
          remoteRes.status === "fulfilled" &&
          Array.isArray(remoteRes.value?.users)
            ? remoteRes.value.users
            : [];
        setFilteredUsers(filtered);
        setRemoteUsers(remote);
        setShowUserDropdown(filtered.length > 0 || remote.length > 0);
      } catch (e) {
        console.error("Failed to search users:", e);
        setFilteredUsers([]);
        setRemoteUsers([]);
        setShowUserDropdown(false);
      } finally {
        setLoadingUsers(false);
      }
    },
    [token, addModalCollaborators, currentUser],
  );

  const updateDropdownPosition = useCallback(() => {
    if (collaboratorInputRef.current) {
      const rect = collaboratorInputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [collaboratorInputRef]);

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

  const addCollaborator = async (username, access = "write") => {
    try {
      if (!activeId) return;

      const res = await api(`/notes/${activeId}/collaborate`, {
        method: "POST",
        token,
        body: { username, access },
      });

      // Prefer the clean name the server resolved (e.g. "Victor") over the
      // raw "user@host" the dropdown sent, and note the server for remotes.
      const collab = res?.collaborator || {};
      const displayName = collab.name || username;

      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === String(activeId)
            ? {
                ...n,
                collaborators: [...(n.collaborators || []), displayName],
                lastEditedBy: currentUser?.email || currentUser?.name,
                lastEditedAt: new Date().toISOString(),
              }
            : n,
        ),
      );

      if (collab.serverLabel) {
        showToast(
          t("addedRemoteCollaborator")
            .replace("{name}", displayName)
            .replace("{server}", collab.serverLabel),
          "success",
          undefined,
          "share",
        );
      } else {
        showToast(
          t("addedCollaboratorSuccessfully").replace("{username}", displayName),
          "success",
          undefined,
          "share",
        );
      }
      setCollaboratorUsername("");
      setShowUserDropdown(false);
      setFilteredUsers([]);
      await loadCollaboratorsForAddModal(activeId);
      if (collaborationDialogNoteId === activeId) {
        loadNoteCollaborators(activeId);
      }
    } catch (e) {
      showToast(describeAddError(e, username), "error");
    }
  };

  // Owner-only: set a collaborator's access level ("read" | "write").
  // Optimistic — the modal row flips at once; on failure we revert by
  // reloading the authoritative list. The note list refreshes so the
  // collaborator's own editor locks/unlocks (also pushed live over SSE).
  const setCollaboratorAccess = async (collaboratorId, access) => {
    const targetNoteId = activeId;
    if (!targetNoteId) return;
    const canWrite = access === "write" ? 1 : 0;
    setAddModalCollaborators((prev) =>
      prev.map((c) => (c.id === collaboratorId ? { ...c, canWrite } : c)),
    );
    try {
      await api(`/notes/${targetNoteId}/collaborate/${collaboratorId}`, {
        method: "PATCH",
        token,
        body: { access },
      });
      invalidateNotesCache();
    } catch (e) {
      showToast(localizeServerError(e.message, "genericError"), "error");
      await loadCollaboratorsForAddModal(targetNoteId);
    }
  };

  // Add SEVERAL collaborators at once, each with its own access level, then
  // a single summary toast — used by the picker's "confirm" step. `items`
  // is [{ username, access }].
  const addCollaboratorsBatch = async (items) => {
    if (!activeId || !Array.isArray(items) || items.length === 0) return;
    let added = 0;
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
      invalidateNotesCache();
      await loadCollaboratorsForAddModal(activeId);
    }
  };

  // ── Effects ──

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        collaboratorInputRef.current &&
        !collaboratorInputRef.current.contains(event.target) &&
        !event.target.closest("[data-user-dropdown]")
      ) {
        setShowUserDropdown(false);
      }
    };

    if (showUserDropdown) {
      updateDropdownPosition();
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 0);
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("scroll", updateDropdownPosition, true);
        window.removeEventListener("resize", updateDropdownPosition);
      };
    }
  }, [showUserDropdown, updateDropdownPosition, collaboratorInputRef]);

  // Load collaborators when note modal opens or Add Collaborator modal opens
  useEffect(() => {
    if (activeId) {
      loadCollaboratorsForAddModal(activeId);
    }
  }, [activeId, loadCollaboratorsForAddModal]);

  useEffect(() => {
    if (collaborationModalOpen && activeId) {
      loadCollaboratorsForAddModal(activeId);
      loadAvailableUsers();
    }
  }, [collaborationModalOpen, activeId, loadCollaboratorsForAddModal, loadAvailableUsers]);

  // Keep the open note's participant list live. Until now it was only
  // loaded when the note or the modal opened, and after actions taken on
  // THIS device — so a collaborator removed by the owner (or by a peer's
  // roster sync) stayed on screen until the modal was closed and reopened.
  // App.jsx forwards the server's note_updated on the "note-updated" bus,
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
    // Dialog state
    collaborationDialogOpen, setCollaborationDialogOpen,
    collaborationDialogNoteId, setCollaborationDialogNoteId,
    noteCollaborators,
    isNoteOwner,
    // Modal state
    collaborationModalOpen, setCollaborationModalOpen,
    collaboratorUsername, setCollaboratorUsername,
    addModalCollaborators,
    availableUsers,
    remoteUsers,
    filteredUsers, setFilteredUsers,
    showUserDropdown, setShowUserDropdown,
    loadingUsers,
    dropdownPosition,
    // Actions
    loadNoteCollaborators,
    showCollaborationDialog,
    removeCollaborator,
    loadCollaboratorsForAddModal,
    searchUsers,
    updateDropdownPosition,
    addCollaborator,
    addCollaboratorsBatch,
    setCollaboratorAccess,
    availableLoading,
    loadAvailableUsers,
  };
}
