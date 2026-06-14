import React from "react";
import UserAvatar from "../common/UserAvatar.jsx";
import ConfirmRemoveCollaboratorDialog from "./ConfirmRemoveCollaboratorDialog.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

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
    <span className="inline-flex items-center gap-1 align-middle text-[11px] font-medium pl-1 pr-1.5 py-0.5 rounded-md bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] border border-[var(--gk-accent-soft-border)]">
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
        onClick={() => !ro && onChange("read")}
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
        onClick={() => ro && onChange("write")}
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
  const [selected, setSelected] = React.useState(() => new Set());
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
    setSelected(new Set());
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

  const toggleSelect = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onConfirm = async () => {
    if (selectedUsers.length === 0 || adding) return;
    setAdding(true);
    try {
      await onAddCollaborators?.(selectedUsers, newAccess);
      setSelected(new Set());
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
          className="glass-card rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: dark ? "#282828" : "#ffffff" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold mb-4">
            {isOwner ? t("addCollaborator") : t("collaborators")}
          </h3>

          {/* ── Current collaborators (with per-row access + remove) ── */}
          {addModalCollaborators.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("currentCollaborators")}
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {addModalCollaborators
                  .filter((c) => c.id !== currentUser?.id)
                  .map((collab) => {
                    const canRemove =
                      !collab.isOwner && (isOwner || collab.id === currentUser?.id);
                    const showAccess =
                      isOwner && !collab.isOwner &&
                      typeof onSetCollaboratorAccess === "function";

                    return (
                      <div
                        key={collab.id}
                        className="flex items-center justify-between gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            name={collab.name}
                            email={collab.email}
                            avatarUrl={collab.avatar_url}
                            size="w-8 h-8"
                            textSize="text-xs"
                            dark={dark}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-sm flex items-center gap-2 flex-wrap">
                              <span className="truncate">{collab.name || collab.email}</span>
                              {collab.federated && <ServerBadge label={collab.serverLabel} />}
                              {collab.isOwner && (
                                <span className="text-xs text-indigo-500 dark:text-indigo-400 font-normal">
                                  {t("owner")}
                                </span>
                              )}
                            </p>
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
              {candidates.length > 0 && !q && (
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
              <div className="min-h-[6rem] max-h-56 overflow-y-auto space-y-1 rounded-lg border border-[var(--border-light)] p-1.5 bg-gray-50/50 dark:bg-black/20">
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
                    const isSel = selected.has(u.key);
                    return (
                      <button
                        key={u.key}
                        type="button"
                        onClick={() => toggleSelect(u.key)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors border ${
                          isSel
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
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            isSel
                              ? "bg-[var(--gk-chrome-accent)] border-[var(--gk-chrome-accent)] text-white"
                              : "border-gray-300 dark:border-gray-600"
                          }`}
                        >
                          {isSel && <TI.Check className="tabler-icon w-3.5 h-3.5" />}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Access level applied to the people being added */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {t("accessLabel")}
                </span>
                <AccessToggle canWrite={newAccess === "write" ? 1 : 0} onChange={setNewAccess} />
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
            </>
          )}

          {/* Non-owner: read-only participant view */}
          {!isOwner && (
            <div className="mt-5 flex justify-end gap-3">
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
