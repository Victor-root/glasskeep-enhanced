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

  const removeCollaborator = async (collaboratorId, noteId = null, mode = null) => {
    try {
      const targetNoteId = noteId || collaborationDialogNoteId || activeId;
      if (!targetNoteId) return;
      await api(`/notes/${targetNoteId}/collaborate/${collaboratorId}`, {
        method: "DELETE",
        token,
        body: mode ? { mode } : undefined,
      });
      showToast(t("collaboratorRemovedSuccessfully"), "success");
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
        const users = await api(
          `/users/search?q=${encodeURIComponent(searchQuery)}`,
          { token },
        );
        const existingCollaboratorIds = new Set(
          addModalCollaborators.map((c) => c.id),
        );
        const filtered = users.filter(
          (u) => u.id !== currentUser?.id && !existingCollaboratorIds.has(u.id),
        );
        setFilteredUsers(filtered);
        setShowUserDropdown(filtered.length > 0);
      } catch (e) {
        console.error("Failed to search users:", e);
        setFilteredUsers([]);
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

  const addCollaborator = async (username) => {
    try {
      if (!activeId) return;

      await api(`/notes/${activeId}/collaborate`, {
        method: "POST",
        token,
        body: { username },
      });

      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === String(activeId)
            ? {
                ...n,
                collaborators: [...(n.collaborators || []), username],
                lastEditedBy: currentUser?.email || currentUser?.name,
                lastEditedAt: new Date().toISOString(),
              }
            : n,
        ),
      );

      showToast(t("addedCollaboratorSuccessfully").replace("{username}", String(username)), "success");
      setCollaboratorUsername("");
      setShowUserDropdown(false);
      setFilteredUsers([]);
      await loadCollaboratorsForAddModal(activeId);
      if (collaborationDialogNoteId === activeId) {
        loadNoteCollaborators(activeId);
      }
    } catch (e) {
      showToast(localizeServerError(e.message, "failedAddCollaborator"), "error");
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
    }
  }, [collaborationModalOpen, activeId, loadCollaboratorsForAddModal]);

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
  };
}
