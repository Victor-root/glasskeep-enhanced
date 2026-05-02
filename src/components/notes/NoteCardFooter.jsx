import React from "react";
import { t } from "../../i18n";
import UserAvatar from "../common/UserAvatar.jsx";

/**
 * Compact footer rendered at the bottom of a closed note card.
 *
 * Layout:
 *   Row 1: tag chips (full width).
 *   Row 2: collab indicator (left-aligned), only when note is shared.
 *
 * The note icon/logo is no longer rendered here — it lives at the
 * top-right corner of the card (absolute positioned in NoteCard).
 */
export default function NoteCardFooter({
  tags = [],
  icon = null,  // kept in signature for backward compat, no longer rendered
  maxChips = 3,
  collabs = [],
  isCollab = false,
  dark = false,
}) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const hasTags = safeTags.length > 0;
  const hasCollabs = isCollab;

  if (!hasTags && !hasCollabs) return null;

  const visible = safeTags.slice(0, maxChips);
  const overflow = safeTags.length - visible.length;

  const collabTooltip = collabs.length > 0
    ? collabs.map((c) => typeof c === "string" ? c : c.name || c.email).join(", ")
    : t("collaboratedNote");

  return (
    <div className="note-card-footer mt-2 pt-1 space-y-2">
      {/* Row 1: tag chips */}
      {hasTags && (
        <div className="flex flex-wrap gap-1 items-center">
          {visible.map((tag) => (
            <span
              key={tag}
              className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-[11px] font-medium px-2 py-0.5 rounded-full max-w-[140px] truncate"
              title={tag}
            >
              {tag}
            </span>
          ))}
          {overflow > 0 && (
            <span
              className="bg-gray-200/70 text-gray-600 dark:bg-gray-700/70 dark:text-gray-300 text-[11px] font-medium px-2 py-0.5 rounded-full"
              title={safeTags.slice(maxChips).join(", ")}
            >
              +{overflow}
            </span>
          )}
        </div>
      )}

      {/* Row 2: collab indicator */}
      {hasCollabs && (
        <div className="inline-flex items-center" data-tooltip={collabTooltip}>
          <svg className="w-4 h-4 shrink-0 text-indigo-500 dark:text-indigo-400 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
          </svg>
          <div className="flex items-center -space-x-1.5">
            {collabs.slice(0, 2).map((c) => (
              <UserAvatar
                key={typeof c === "string" ? c : c.id}
                name={typeof c === "string" ? c : c.name}
                email={typeof c === "string" ? undefined : c.email}
                avatarUrl={typeof c === "string" ? undefined : c.avatar_url}
                size="w-6 h-6"
                textSize="text-[8px]"
                dark={dark}
              />
            ))}
            {collabs.length > 2 && (
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 text-[8px] font-bold text-gray-600 dark:text-gray-300">
                +{collabs.length - 2}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
