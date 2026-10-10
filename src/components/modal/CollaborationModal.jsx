import React from "react";
import Sheet from "../common/Sheet.jsx";
import ConfirmRemoveCollaboratorDialog from "./ConfirmRemoveCollaboratorDialog.jsx";
import CurrentCollaboratorsList from "./CurrentCollaboratorsList.jsx";
import CollaboratorPicker from "./CollaboratorPicker.jsx";
import AccessToggle from "./AccessToggle.jsx";
import { t } from "../../i18n";
import { setThemeColor, currentThemeColor } from "../../utils/helpers.js";

/**
 * Collaboration modal — manage who a note is shared with.
 *
 * The owner sees a directly-populated picker of everyone they can share
 * with (local users + real users on paired peers), navigable by an
 * alphabet index and a search box, multi-selectable, with one access
 * level applied on confirm. Friendly identities only — the opaque
 * `username` used for the API never surfaces.
 *
 * A centred card on desktop; a bottom sheet on the note's own colour
 * (`asSheet`, mobile layout).
 */
export default function CollaborationModal({
  open,
  dark,
  activeId,
  notes,
  currentUser,
  addModalCollaborators,
  availableUsers = [],
  availableLoading = false,
  onClose,
  onAddCollaborators,
  onRemoveCollaborator,
  onSetCollaboratorAccess,
  asSheet = false,
  sheetBackground,
}) {
  const [confirmRemove, setConfirmRemove] = React.useState(null);
  // Picker state
  const [search, setSearch] = React.useState("");
  const [letter, setLetter] = React.useState(null);
  const [selected, setSelected] = React.useState(() => new Map());
  const [newAccess, setNewAccess] = React.useState("write");
  const [adding, setAdding] = React.useState(false);

  // Sync the PWA theme color with the card's own surface while it is open
  // on top of an already-colored NoteModal. Branch inside one effect rather than a cleanup
  // function — same reasoning as NoteModal's own status-bar effect: a
  // cleanup→default→effect→color sequence flashes on Android WebView.
  // Capture the note's color once per open (not on every `dark` toggle,
  // which would overwrite the captured value with our own) and hand it
  // back unchanged on close.
  // The sheet leaves the note visible behind it, so the bars keep its colour.
  const priorThemeColorRef = React.useRef(null);
  React.useEffect(() => {
    if (asSheet) return;
    if (!open) {
      if (priorThemeColorRef.current) {
        setThemeColor(priorThemeColorRef.current);
        priorThemeColorRef.current = null;
      }
      return;
    }
    if (priorThemeColorRef.current == null) {
      priorThemeColorRef.current = currentThemeColor();
    }
    setThemeColor(dark ? "#282828" : "#ffffff");
  }, [open, dark, asSheet]);

  if (!open && !asSheet) return null;

  const note = activeId
    ? notes.find((n) => String(n.id) === String(activeId))
    : null;
  const isOwner = !activeId || note?.user_id === currentUser?.id;

  const handleClose = () => {
    setSearch("");
    setLetter(null);
    setSelected(new Map());
    onClose();
  };

  // Already-shared people, so they don't appear in the picker. Local rows
  // match by id; federated rows match by their peer identity + server.
  const isTaken = (u) => {
    if (u.federated) {
      return addModalCollaborators.some(
        (c) =>
          c.federated &&
          c.email === u.ref &&
          (c.serverLabel || "") === (u.serverLabel || ""),
      );
    }
    return addModalCollaborators.some((c) => c.id === u.id);
  };

  const candidates = (Array.isArray(availableUsers) ? availableUsers : [])
    .filter((u) => !isTaken(u))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

  const selectedUsers = candidates.filter((u) => selected.has(u.key));

  // Selection is a Map<key, access>. Picking a user defaults them to the
  // current "Accès" value; their row toggle overrides it individually.
  const toggleSelect = (key) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, newAccess);
      return next;
    });
  };

  const setAccessFor = (key, access) => {
    setSelected((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, access);
      return next;
    });
  };

  // The global "Accès" control sets the default for new picks AND, in one
  // go, the access of everyone already selected.
  const setAllAccess = (access) => {
    setNewAccess(access);
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map();
      for (const k of prev.keys()) next.set(k, access);
      return next;
    });
  };

  const onConfirm = async () => {
    if (selectedUsers.length === 0 || adding) return;
    setAdding(true);
    try {
      await onAddCollaborators?.(
        selectedUsers.map((u) => ({
          username: u.username,
          access: selected.get(u.key) || newAccess,
          // Carry the friendly display name + server label so any error
          // (e.g. the peer being locked) can name them as shown in the list,
          // not the raw ref/host parsed from `username`.
          name: u.name,
          serverLabel: u.serverLabel || null,
        })),
      );
      setSelected(new Map());
      setSearch("");
      setLetter(null);
    } finally {
      setAdding(false);
    }
  };

  const title = isOwner ? t("addCollaborator") : t("collaborators");

  const body = (
    <>
      {/* ── Current collaborators (with per-row access + remove) ── */}
      {addModalCollaborators.length > 0 && (
        <CurrentCollaboratorsList
          collaborators={addModalCollaborators}
          isOwner={isOwner}
          currentUser={currentUser}
          activeId={activeId}
          dark={dark}
          asSheet={asSheet}
          onSetCollaboratorAccess={onSetCollaboratorAccess}
          onRemoveCollaborator={onRemoveCollaborator}
          onConfirmRemove={setConfirmRemove}
        />
      )}

      {/* ── Add picker (owner only) ── */}
      {isOwner && (
        <CollaboratorPicker
          candidates={candidates}
          availableLoading={availableLoading}
          search={search}
          setSearch={setSearch}
          letter={letter}
          setLetter={setLetter}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSetAccessFor={setAccessFor}
          dark={dark}
          asSheet={asSheet}
        />
      )}
    </>
  );

  const footer = (
    <>
      {/* Footer: access + actions stay fixed below the scroll area. */}
      {isOwner && (
        <div
          className={asSheet ? "sticky bottom-0 pt-4 pb-1" : "shrink-0 pt-4"}
          style={asSheet ? { background: sheetBackground || "var(--gk-sheet-bg)" } : undefined}
        >
          {/* Access level applied to the people being ADDED, spelled out
              (and distinguished from the per-row toggles, which change an
              existing collaborator) so it isn't mysterious. */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-200">
                {selectedUsers.length > 0
                  ? t("accessForSelected").replace("{n}", String(selectedUsers.length))
                  : t("accessForNew")}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {t("accessForNewHint")}
              </div>
            </div>
            <AccessToggle canWrite={newAccess === "write" ? 1 : 0} onChange={setAllAccess} />
          </div>

          {/* Actions */}
          <div className={`flex gap-3 ${asSheet ? "mt-4" : "mt-5 justify-end"}`}>
            {!asSheet && (
              <button
                className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={handleClose}
              >
                {t("cancel")}
              </button>
            )}
            <button
              disabled={selectedUsers.length === 0 || adding}
              className={`${asSheet ? "flex-1 py-3 rounded-xl text-base" : "px-4 py-2 rounded-lg"} font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none`}
              onClick={onConfirm}
            >
              {t("addCollaborator")}
              {selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ""}
            </button>
          </div>
        </div>
      )}

      {/* Non-owner: read-only participant view (the sheet closes by its handle) */}
      {!isOwner && !asSheet && (
        <div className="mt-5 flex justify-end gap-3 shrink-0">
          <button
            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={handleClose}
          >
            {t("close")}
          </button>
        </div>
      )}
    </>
  );

  const confirmRemoveDialog = (
    <ConfirmRemoveCollaboratorDialog
      open={!!confirmRemove}
      collaboratorName={confirmRemove?.name || confirmRemove?.email || ""}
      onClose={() => setConfirmRemove(null)}
      onConfirm={async (mode) => {
        const target = confirmRemove;
        setConfirmRemove(null);
        if (target) {
          await onRemoveCollaborator(target.id, activeId, mode);
        }
      }}
    />
  );

  if (asSheet) {
    return (
      <>
        <Sheet open={open} onClose={handleClose} title={title} background={sheetBackground}>
          {body}
          {footer}
        </Sheet>
        {confirmRemoveDialog}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
        <div
          className="glass-card relative flex flex-col overflow-hidden shadow-2xl w-[90%] max-w-md max-h-[90vh] rounded-xl p-6"
          style={{ backgroundColor: dark ? "#282828" : "#ffffff" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold min-w-0 truncate mb-4 shrink-0">{title}</h3>

          {/* Scrollable body: the modal frame (title) and footer (access +
              actions) stay put; only this region (the lists) scrolls.
              -mx-1.5/px-1.5: overflow-y:auto also clips on the X axis, which
              cut off the search input's focus ring on the left/right edges.
              The negative-margin+padding keeps content aligned while giving
              the ring room to render inside the scroll box. */}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1.5 px-1.5">
            {body}
          </div>
          {/* ── end scrollable body ── */}

          {footer}
        </div>
      </div>

      {confirmRemoveDialog}
    </>
  );
}
