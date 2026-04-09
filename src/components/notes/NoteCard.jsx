import React, { useMemo, useRef } from "react";
import { t } from "../../i18n";
import { bgFor, solid } from "../../utils/colors.js";
import { renderSafeMarkdown, linkifyPhoneNumbers } from "../../utils/markdown.jsx";
import { PinOutline, PinFilled, ImageIcon } from "../../icons/index.jsx";
import ChecklistRow from "../common/ChecklistRow.jsx";
import DrawingPreview from "../common/DrawingPreview.jsx";
import UserAvatar from "../common/UserAvatar.jsx";
import useNoteTouchDrag from "../../hooks/useNoteTouchDrag.js";

export default function NoteCard({
  n,
  dark,
  openModal,
  togglePin,
  // multi-select
  multiMode = false,
  selected = false,
  onToggleSelect = () => {},
  disablePin = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  // online status
  isOnline = true,
  // checklist update callback
  onUpdateChecklistItem,
  currentUser,
  maxPreviewItems = 8,
}) {
  const isChecklist = n.type === "checklist";
  const isDraw = n.type === "draw";
  const previewText = useMemo(() => n.content || "", [n.content]);
  const MAX_CHARS = 350;
  const isLong = previewText.length > MAX_CHARS;
  const displayText = isLong
    ? previewText.slice(0, MAX_CHARS).trimEnd() + "\u2026"
    : previewText;

  // Extract text body from draw note JSON content
  const drawText = useMemo(() => {
    if (!isDraw || !n.content) return "";
    try {
      const parsed = typeof n.content === "string" ? JSON.parse(n.content) : n.content;
      return parsed?.text || "";
    } catch { return ""; }
  }, [isDraw, n.content]);

  const total = (n.items || []).length;
  const done = (n.items || []).filter((i) => i.done).length;
  // Sort items with unchecked items first, just like in the modal
  const sortedItems = (n.items || []).sort((a, b) => {
    if (a.done === b.done) return 0; // Same status, maintain order
    return a.done ? 1 : -1; // Unchecked (false) comes before checked (true)
  });
  const visibleItems = sortedItems.slice(0, maxPreviewItems);
  const extraCount =
    total > visibleItems.length ? total - visibleItems.length : 0;

  const imgs = n.images || [];
  const mainImg = imgs[0];

  const MAX_TAG_CHIPS = 4;
  const allTags = Array.isArray(n.tags) ? n.tags : [];
  const showEllipsisChip = allTags.length > MAX_TAG_CHIPS;
  const displayTags = allTags.slice(0, MAX_TAG_CHIPS);

  const group = n.pinned ? "pinned" : "others";
  const isOwned = !currentUser || !n.user_id || n.user_id === currentUser.id;
  const canDrag = !multiMode && isOwned;
  const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const cardRef = useRef(null);
  useNoteTouchDrag(cardRef, { canDrag, multiMode, noteId: n.id, group, onDragStart, onDrop, onDragEnd });

  return (
    <div
      ref={cardRef}
      data-note-id={n.id}
      draggable={canDrag && !isTouchDevice}
      onDragStart={(e) => {
        if (canDrag) onDragStart(n.id, e);
      }}
      onDragOver={(e) => {
        if (canDrag) onDragOver(n.id, group, e);
      }}
      onDragLeave={(e) => {
        if (canDrag) onDragLeave(e);
      }}
      onDrop={(e) => {
        if (canDrag) onDrop(n.id, group, e);
      }}
      onDragEnd={(e) => {
        if (canDrag) onDragEnd(e);
      }}
      onClick={(e) => {
        // Ignore click after touch drag release
        if (cardRef.current?.dataset?.touchDragging) return;
        if (multiMode) {
          e.stopPropagation();
          onToggleSelect?.(n.id, !selected);
        } else {
          openModal(n.id);
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`note-card glass-card rounded-xl p-2 sm:p-3 mb-2 sm:mb-3 cursor-pointer transform hover:scale-[1.02] transition-transform duration-200 relative min-h-[54px] ${isDraw ? '' : 'overflow-hidden'} group ${
        multiMode && selected
          ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent"
          : ""
      }`}
      style={{
        backgroundColor: bgFor(n.color, dark),
        '--note-color': (!dark && (!n.color || n.color === 'default')) ? '#a78bfa' : solid(bgFor(n.color, dark)),
      }}
      data-id={n.id}
      data-group={group}
    >
      {multiMode && (
        <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
          {/* Modern checkbox */}
          <div
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${
              selected
                ? "bg-indigo-500 border-indigo-500 text-white"
                : "border-gray-300 dark:border-gray-500 bg-white/80 dark:bg-gray-700/80 hover:border-indigo-400"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(n.id, !selected);
            }}
          >
            {selected && (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        </div>
      )}
      {/* Collaboration avatars - bottom right */}
      {(() => {
        const collabs = Array.isArray(n.collaborators) ? n.collaborators : [];
        const isCollab = collabs.length > 0 || (n.user_id && currentUser && n.user_id !== currentUser.id);
        if (!isCollab) return null;
        return (
          <div className="absolute bottom-2 right-2 z-10 flex items-center -space-x-1.5" data-tooltip={
            collabs.length > 0
              ? collabs.map((c) => typeof c === "string" ? c : c.name || c.email).join(", ")
              : t("collaboratedNote")
          }>
            {collabs.length > 0 ? (
              <>
                {collabs.slice(0, 3).map((c) => (
                  <UserAvatar
                    key={typeof c === "string" ? c : c.id}
                    name={typeof c === "string" ? c : c.name}
                    email={typeof c === "string" ? undefined : c.email}
                    avatarUrl={typeof c === "string" ? undefined : c.avatar_url}
                    size="w-6 h-6"
                    textSize="text-[9px]"
                    dark={dark}
                    className="ring-2 ring-white dark:ring-gray-800"
                  />
                ))}
                {collabs.length > 3 && (
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 text-[9px] font-bold text-gray-600 dark:text-gray-300 ring-2 ring-white dark:ring-gray-800">
                    +{collabs.length - 3}
                  </span>
                )}
              </>
            ) : (
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
              </svg>
            )}
          </div>
        );
      })()}
      {!multiMode && !disablePin && (
        <div className="absolute top-3 right-3 h-8 opacity-0 group-hover:opacity-100 transition-opacity">
          <div
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: bgFor(n.color, dark) }}
          />
          <button
            aria-label={n.pinned ? t("unpinNote") : t("pinNote")}
            onClick={(e) => {
              if (disablePin) return;
              e.stopPropagation();
              togglePin(n.id, !n.pinned);
            }}
            className="relative rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            data-tooltip={n.pinned ? t("unpin") : t("pin")}
            disabled={!!disablePin}
          >
            {n.pinned ? <PinFilled /> : <PinOutline />}
          </button>
        </div>
      )}

      {n.title && (
        <h3 className="font-bold text-sm sm:text-lg mb-2 break-words">{n.title}</h3>
      )}

      {imgs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {imgs.slice(0, 6).map((im) => (
            <div
              key={im.id}
              className="overflow-hidden rounded-lg"
              style={{ width: imgs.length === 1 ? "100%" : "calc(50% - 2px)" }}
            >
              <img
                src={im.src}
                alt={im.name || t("noteImage")}
                className="w-full h-auto object-contain object-center"
                style={{ maxHeight: "200px" }}
              />
            </div>
          ))}
          {imgs.length > 6 && (
            <div className="w-full text-center text-xs text-gray-500 dark:text-gray-400 py-1">
              +{imgs.length - 6} {t("image")}{imgs.length - 6 > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {!isChecklist && !isDraw ? (
        <div
          className="text-sm break-words whitespace-pre-wrap overflow-hidden note-content note-content--dense"
          style={{ maxHeight: "280px" }}
          dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(displayText) }}
        />
      ) : isDraw ? (
        <>
          {drawText && (
            <div
              className="text-sm break-words whitespace-pre-wrap overflow-hidden note-content note-content--dense mb-2"
              style={{ maxHeight: "280px" }}
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(drawText.length > MAX_CHARS ? drawText.slice(0, MAX_CHARS).trimEnd() + "\u2026" : drawText) }}
            />
          )}
          <DrawingPreview
            data={n.content}
            width={800}
            height={600}
            darkMode={dark}
          />
        </>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((it) => (
            <ChecklistRow
              key={it.id}
              item={it}
              size="md"
              readOnly={true}
              showRemove={false}
              preview={true}
            />
          ))}
          {extraCount > 0 && (
            <div className="text-xs text-gray-600 dark:text-gray-300">
              {t("moreItems").replace("{count}", String(extraCount))}
            </div>
          )}
          <div className="text-xs text-gray-600 dark:text-gray-300">
            {t("completedFraction").replace("{done}", String(done)).replace("{total}", String(total))}
          </div>
        </div>
      )}

      {!!displayTags.length && (
        <div className="mt-4 text-xs flex flex-wrap gap-2">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
          {showEllipsisChip && (
            <span className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full">
              …
            </span>
          )}
        </div>
      )}
    </div>
  );
}
