import React from "react";
import { t } from "../../i18n";
import UserAvatar from "../common/UserAvatar.jsx";

/**
 * Compact footer rendered at the bottom of a closed note card.
 * Row 1: tags on the left, optional note icon (logo badge) on the right.
 * Row 2 (when note has collaborators / is a shared note): avatar stack.
 *
 * Renders nothing when the note has none of these.
 */
export default function NoteCardFooter({
  tags = [],
  icon = null,
  maxChips = 3,
  collabs = [],
  isCollab = false,
  dark = false,
}) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const hasTags = safeTags.length > 0;
  const hasIcon = !!(icon && icon.src);
  const hasCollabs = isCollab;

  if (!hasTags && !hasIcon && !hasCollabs) return null;

  const visible = safeTags.slice(0, maxChips);
  const overflow = safeTags.length - visible.length;

  return (
    <div className="note-card-footer mt-2 pt-2 border-t border-black/10 dark:border-white/10">
      {/* Row 1: tags + icon */}
      {(hasTags || hasIcon) && (
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-1 items-center min-w-0 flex-1">
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

          {hasIcon && (
            <div
              className="note-card-icon shrink-0 flex items-center justify-center rounded-md overflow-hidden bg-white/60 dark:bg-black/20 ring-1 ring-black/5 dark:ring-white/10"
              style={{ width: 28, height: 28 }}
              aria-label={icon.name || t("noteIcon")}
            >
              <img
                src={icon.src}
                alt={icon.name || t("noteIcon")}
                className="w-full h-full"
                style={{ objectFit: "contain" }}
                loading="lazy"
                draggable={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Row 2: collaboration avatars */}
      {hasCollabs && (
        <div className={`flex items-center${hasTags || hasIcon ? " mt-1.5" : ""}`}>
          {collabs.length > 0 ? (
            <div
              className="flex items-center -space-x-1.5"
              data-tooltip={collabs.map((c) => typeof c === "string" ? c : c.name || c.email).join(", ")}
            >
              {collabs.slice(0, 3).map((c) => (
                <UserAvatar
                  key={typeof c === "string" ? c : c.id}
                  name={typeof c === "string" ? c : c.name}
                  email={typeof c === "string" ? undefined : c.email}
                  avatarUrl={typeof c === "string" ? undefined : c.avatar_url}
                  size="w-5 h-5"
                  textSize="text-[8px]"
                  dark={dark}
                  className="ring-1 ring-white dark:ring-gray-800"
                />
              ))}
              {collabs.length > 3 && (
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 text-[8px] font-bold text-gray-600 dark:text-gray-300 ring-1 ring-white dark:ring-gray-800">
                  +{collabs.length - 3}
                </span>
              )}
            </div>
          ) : (
            <svg
              className="w-4 h-4 text-gray-400 dark:text-gray-500"
              fill="currentColor"
              viewBox="0 0 20 20"
              data-tooltip={t("collaboratedNote")}
            >
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
