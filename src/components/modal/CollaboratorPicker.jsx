import React from "react";
import UserAvatar from "../common/UserAvatar.jsx";
import ServerBadge from "./ServerBadge.jsx";
import AccessToggle from "./AccessToggle.jsx";
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

const chipCls = (active, disabled) =>
  `px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none transition-colors ${
    disabled
      ? "opacity-25 cursor-default"
      : active
        ? "bg-[var(--gk-chrome-accent)] text-white"
        : "text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10"
  }`;

// Owner's picker of the collaboration modal: everyone the note can still be
// shared with, filtered by a search box or an alphabet index, each row
// selectable with its own access level. The selection is owned by
// CollaborationModal, which applies it on confirm.
export default function CollaboratorPicker({
  candidates,
  availableLoading,
  search,
  setSearch,
  letter,
  setLetter,
  selected,
  onToggleSelect,
  onSetAccessFor,
  dark,
  asSheet,
}) {
  const letterSet = new Set(candidates.map((u) => firstLetter(u.name)));
  const q = search.trim().toLowerCase();
  const visible = candidates.filter((u) => {
    if (q) return (u.name || "").toLowerCase().includes(q);
    if (letter) return firstLetter(u.name) === letter;
    return true;
  });

  return (
    <>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        {t("selectCollaboratorsHint")}
      </p>

      {/* Search */}
      <div className={asSheet ? "gk-sheet-field relative mb-3" : "relative mb-2"}>
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
          className={asSheet
            ? "w-full h-12 pl-10 pr-4 text-base bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none"
            : "w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"}
        />
      </div>

      {/* Alphabet index, only meaningful when not searching */}
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
      <div className={asSheet ? "min-h-[6rem] space-y-1" : "min-h-[6rem] space-y-1 rounded-lg border border-[var(--border-light)] p-1.5 bg-gray-50/50 dark:bg-black/20"}>
        {availableLoading ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("searching")}
          </div>
        ) : candidates.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("noUsersAvailable")}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">{t("noUsersFound")}</div>
        ) : (
          visible.map((u) => {
            const sel = selected.has(u.key);
            const access = selected.get(u.key);
            return (
              <div
                key={u.key}
                role="button"
                tabIndex={0}
                onClick={() => onToggleSelect(u.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleSelect(u.key);
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
                    onChange={(a) => onSetAccessFor(u.key, a)}
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
  );
}
