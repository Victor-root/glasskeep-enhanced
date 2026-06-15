import React from "react";
import UserAvatar from "../common/UserAvatar.jsx";
import ConfirmRemoveCollaboratorDialog from "./ConfirmRemoveCollaboratorDialog.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
// Only surface the A–Z index once the candidate list is long enough that
// scrolling becomes tedious; below this it just gets in the way.
const LETTER_INDEX_MIN = 15;

// Bucket a display name under A–Z, or "#" for anything else (digits,
// accents that don't normalise, symbols), so the alphabet index is total.
function firstLetter(name) {
  const c = (name || "").trim().charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

// Small themed badge marking a collaborator (or option) that lives on a
// paired peer server — the friendly server name, never a URL. Accent
// colours come from the active shell theme, so it follows every theme.
function ServerBadge({ label }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 align-middle text-[11px] font-medium pl-1 pr-1.5 py-0.5 rounded-md bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] border border-[var(--gk-accent-soft-border)]">
      <TI.Server className="tabler-icon w-3.5 h-3.5 shrink-0" />
      <span className="truncate max-w-[10rem]">{label || t("fedRemoteServer")}</span>
    </span>
  );
}

// Read-only / read-write chooser. A compact segmented control: the active
// half is filled with the soft theme accent, matching the app's other
// two-option pickers. Eye = read-only, Pencil = can edit; tooltips/aria
// carry the labels so it stays small.
function AccessToggle({ canWrite, busy, onChange }) {
  const ro = canWrite === 0;
  const cell =
    "inline-flex items-center justify-center px-2 py-1 transition-colors disabled:opacity-50";
  const active = "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)]";
  const idle = "text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10";
  return (
    <div className="inline-flex rounded-lg border border-[var(--border-light)] overflow-hidden">
      <button
        type="button"
        disabled={busy}
        aria-pressed={ro}
        aria-label={t("accessReadOnly")}
        data-tooltip={t("accessReadOnly")}
        onClick={(e) => { e.stopPropagation(); if (!ro) onChange("read"); }}
        className={`${cell} ${ro ? active : idle}`}
      >
        <TI.Eye className="tabler-icon w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={busy}
        aria-pressed={!ro}
        aria-label={t("accessReadWrite")}
        data-tooltip={t("accessReadWrite")}
        onClick={(e) => { e.stopPropagation(); if (ro) onChange("write"); }}
        className={`${cell} border-l border-[var(--border-light)] ${!ro ? active : idle}`}
      >
        <TI.Pencil className="tabler-icon w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * Collaboration modal — manage who a note is shared with.
 *
 * The owner sees a directly-populated picker of everyone they can share
 * with (local users + real users on paired peers), navigable by an
 * alphabet index and a search box, multi-selectable, with one access
 * level applied on confirm. Friendly identities only — the opaque
 * `username` used for the API never surfaces.
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
}) {
  const [confirmRemove, setConfirmRemove] = React.useState(null);
  const [accessBusyId, setAccessBusyId] = React.useState(null);
  // Picker state
  const [search, setSearch] = React.useState("");
  const [letter, setLetter] = React.useState(null);
  const [selected, setSelected] = React.useState(() => new Map());
  const [newAccess, setNewAccess] = React.useState("write");
  const [adding, setAdding] = React.useState(false);

  if (!open) return null;

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

  const letterSet = new Set(candidates.map((u) => firstLetter(u.name)));
  const q = search.trim().toLowerCase();
  const visible = candidates.filter((u) => {
    if (q) return (u.name || "").toLowerCase().includes(q);
    if (letter) return firstLetter(u.name) === letter;
    return true;
  });

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

  const chipCls = (active, disabled) =>
    `px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none transition-colors ${
      disabled
        ? "opacity-25 cursor-default"
        : active
          ? "bg-[var(--gk-chrome-accent)] text-white"
          : "text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10"
    }`;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
        <div
          className="glass-card rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative max-h-[90vh] flex flex-col overflow-hidden"
          style={{ backgroundColor: dark ? "#282828" : "#ffffff" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold mb-4 shrink-0">
            {isOwner ? t("addCollaborator") : t("collaborators")}
          </h3>

          {/* Scrollable body — the modal frame (title) and footer (access +
              actions) stay put; only this region (the lists) scrolls. */}
          <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Current collaborators (with per-row access + remove) ── */}
          {addModalCollaborators.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("currentCollaborators")}
              </p>
              <div className="space-y-2">
                {addModalCollaborators
                  // The owner doesn't need to see their own row when managing;
                  // but a collaborator viewing the list SHOULD see themselves
                  // (with a "Moi" badge) so it's clear they're on the note.
                  .filter((c) => (isOwner ? c.id !== currentUser?.id : true))
                  .map((collab) => {
                    const isSelf = collab.id === currentUser?.id;
                    // Owner removes collaborators; a non-owner can't remove
                    // anyone (their own row is display-only).
                    const canRemove = isOwner && !collab.isOwner;
                    const showAccess =
                      isOwner && !collab.isOwner &&
                      typeof onSetCollaboratorAccess === "function";

                    return (
                      <div
                        key={collab.id}
                        // Single aligned row: fixed square avatar, the name
                        // truncates (badge stays beside it), actions pinned
                        // right and vertically centred. No wrapping — that
                        // looked unbalanced on mobile.
                        className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <UserAvatar
                            name={collab.name}
                            email={collab.email}
                            avatarUrl={collab.avatar_url}
                            size="w-8 h-8"
                            textSize="text-xs"
                            dark={dark}
                            className="shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-sm flex items-center gap-1.5 min-w-0">
                              <span className="truncate">{collab.name || collab.email}</span>
                              {collab.federated && <ServerBadge label={collab.serverLabel} />}
                              {isSelf && (
                                <span className="shrink-0 inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] border border-[var(--gk-accent-soft-border)]">
                                  {t("youLabel")}
                                </span>
                              )}
                              {collab.isOwner && (
                                <span className="shrink-0 text-xs text-indigo-500 dark:text-indigo-400 font-normal">
                                  {t("owner")}
                                </span>
                              )}
                            </div>
                            {!collab.federated && collab.email && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {collab.email}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {showAccess && (
                            <AccessToggle
                              canWrite={collab.canWrite}
                              busy={accessBusyId === collab.id}
                              onChange={async (access) => {
                                setAccessBusyId(collab.id);
                                try {
                                  await onSetCollaboratorAccess(collab.id, access);
                                } finally {
                                  setAccessBusyId(null);
                                }
                              }}
                            />
                          )}
                          {canRemove && (
                            <button
                              onClick={async () => {
                                if (collab.id === currentUser?.id) {
                                  await onRemoveCollaborator(collab.id, activeId);
                                } else {
                                  setConfirmRemove(collab);
                                }
                              }}
                              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                              data-tooltip={t("removeCollaborator")}
                            >
                              {t("remove")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── Add picker (owner only) ── */}
          {isOwner && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                {t("selectCollaboratorsHint")}
              </p>

              {/* Search */}
              <div className="relative mb-2">
                <svg
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3 -4.3" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setLetter(null); }}
                  placeholder={t("searchByUsernameOrEmail")}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                />
              </div>

              {/* Alphabet index — only meaningful when not searching */}
              {candidates.length >= LETTER_INDEX_MIN && !q && (
                <div className="flex flex-wrap items-center gap-0.5 mb-2">
                  <button type="button" onClick={() => setLetter(null)} className={chipCls(letter === null, false)}>
                    {t("letterAll")}
                  </button>
                  {ALPHABET.map((L) => {
                    const has = letterSet.has(L);
                    return (
                      <button
                        key={L}
                        type="button"
                        disabled={!has}
                        onClick={() => has && setLetter(L)}
                        className={chipCls(letter === L, !has)}
                      >
                        {L}
                      </button>
                    );
                  })}
                  {letterSet.has("#") && (
                    <button type="button" onClick={() => setLetter("#")} className={chipCls(letter === "#", false)}>
                      #
                    </button>
                  )}
                </div>
              )}

              {/* People list */}
              <div className="min-h-[6rem] space-y-1 rounded-lg border border-[var(--border-light)] p-1.5 bg-gray-50/50 dark:bg-black/20">
                {availableLoading ? (
                  <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("searching")}
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("noUsersAvailable")}
                  </div>
                ) : visible.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">—</div>
                ) : (
                  visible.map((u) => {
                    const sel = selected.has(u.key);
                    const access = selected.get(u.key);
                    return (
                      <div
                        key={u.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleSelect(u.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelect(u.key);
                          }
                        }}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-left cursor-pointer transition-colors border ${
                          sel
                            ? "bg-[var(--gk-accent-soft-bg)] border-[var(--gk-accent-soft-border)]"
                            : "border-transparent hover:bg-black/5 dark:hover:bg-white/10"
                        }`}
                      >
                        <UserAvatar
                          name={u.name}
                          email={u.email || u.ref || ""}
                          avatarUrl={u.avatar}
                          size="w-8 h-8"
                          textSize="text-xs"
                          dark={dark}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            <span className="truncate">{u.name}</span>
                            {u.federated && <ServerBadge label={u.serverLabel} />}
                          </div>
                          {!u.federated && u.email && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {u.email}
                            </div>
                          )}
                        </div>
                        {sel && (
                          <AccessToggle
                            canWrite={access === "write" ? 1 : 0}
                            onChange={(a) => setAccessFor(u.key, a)}
                          />
                        )}
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            sel
                              ? "bg-[var(--gk-chrome-accent)] border-[var(--gk-chrome-accent)] text-white"
                              : "border-gray-300 dark:border-gray-600"
                          }`}
                        >
                          {sel && <TI.Check className="tabler-icon w-3.5 h-3.5" />}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

            </>
          )}

          </div>
          {/* ── end scrollable body ── */}

          {/* Footer: access + actions stay fixed below the scroll area. */}
          {isOwner && (
            <div className="shrink-0 pt-4">
              {/* Access level applied to the people being added */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {t("accessLabel")}
                </span>
                <AccessToggle canWrite={newAccess === "write" ? 1 : 0} onChange={setAllAccess} />
              </div>

              {/* Actions */}
              <div className="mt-5 flex justify-end gap-3">
                <button
                  className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={handleClose}
                >
                  {t("cancel")}
                </button>
                <button
                  disabled={selectedUsers.length === 0 || adding}
                  className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
                  onClick={onConfirm}
                >
                  {t("addCollaborator")}
                  {selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ""}
                </button>
              </div>
            </div>
          )}

          {/* Non-owner: read-only participant view */}
          {!isOwner && (
            <div className="mt-5 flex justify-end gap-3 shrink-0">
              <button
                className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={handleClose}
              >
                {t("close")}
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmRemoveCollaboratorDialog
        open={!!confirmRemove}
        dark={dark}
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
    </>
  );
}
