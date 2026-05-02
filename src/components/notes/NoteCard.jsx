import React, { useMemo, useRef } from "react";
import { t } from "../../i18n";
import { bgFor, solid } from "../../utils/colors.js";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";
import { isRichContent, contentToHTML, contentToPlain } from "../../utils/richText.js";
import { PinOutline, PinFilled, ImageIcon } from "../../icons/index.jsx";
import ChecklistRow from "../common/ChecklistRow.jsx";
import DrawingPreview from "../common/DrawingPreview.jsx";
import useNoteTouchDrag from "../../hooks/useNoteTouchDrag.js";
import { getSections, isItem, countItems, countChecked, DEFAULT_SECTION_ID } from "../../utils/checklist.js";
import { getNoteIcon, getContentImages } from "../../utils/noteIcon.js";
import NoteCardFooter from "./NoteCardFooter.jsx";

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
  const MAX_CHARS = 350;

  // Compute the preview HTML for text notes. We first turn whatever is in
  // `content` (rich JSON or legacy Markdown) into plain text for the length
  // budget, then render a truncated version through the correct pipeline so
  // the card keeps showing formatting without ballooning past 280px.
  const textPreviewHtml = useMemo(() => {
    if (n.type !== "text") return "";
    const raw = n.content || "";
    if (!raw) return "";
    if (isRichContent(raw)) {
      const plain = contentToPlain(raw);
      if (plain.length <= MAX_CHARS) return contentToHTML(raw);
      // For very long rich notes we fall back to a truncated plain preview
      // to stay cheap. Full rich render on 350+ chars is still fine, but we
      // keep parity with the old ellipsis behaviour.
      return contentToHTML(raw);
    }
    const isLong = raw.length > MAX_CHARS;
    const slice = isLong ? raw.slice(0, MAX_CHARS).trimEnd() + "\u2026" : raw;
    return renderSafeMarkdown(slice);
  }, [n.type, n.content]);

  // Extract text body from draw note JSON content (rich or legacy string)
  const drawText = useMemo(() => {
    if (!isDraw || !n.content) return "";
    try {
      const parsed = typeof n.content === "string" ? JSON.parse(n.content) : n.content;
      return parsed?.text || "";
    } catch { return ""; }
  }, [isDraw, n.content]);
  const drawTextHtml = useMemo(() => {
    if (!drawText) return "";
    if (isRichContent(drawText)) return contentToHTML(drawText);
    const slice = drawText.length > MAX_CHARS ? drawText.slice(0, MAX_CHARS).trimEnd() + "\u2026" : drawText;
    return renderSafeMarkdown(slice);
  }, [drawText]);

  const total = countItems(n.items);
  const done = countChecked(n.items);
  // Preview: walk sections in order, emit unchecked items first, then
  // checked. Section headers only appear when the note actually has any.
  const previewSections = useMemo(() => {
    const secs = getSections(n.items);
    const out = [];
    let remaining = maxPreviewItems;
    for (const s of secs) {
      if (remaining <= 0) break;
      const uncheckedRaw = s.items.filter((it) => !it.done);
      const take = uncheckedRaw.slice(0, remaining);
      remaining -= take.length;
      if (take.length > 0 || (s.id !== DEFAULT_SECTION_ID && s.title)) {
        out.push({ id: s.id, title: s.title, items: take });
      }
    }
    return out;
  }, [n.items, maxPreviewItems]);
  const visibleCount = previewSections.reduce((n2, s) => n2 + s.items.length, 0);
  const uncheckedTotal = (n.items || []).filter((it) => isItem(it) && !it.done).length;
  const extraCount = Math.max(0, uncheckedTotal - visibleCount);
  const hasAnyTitledSection = previewSections.some((s) => s.id !== DEFAULT_SECTION_ID && s.title);

  // Content images = everything in n.images except the optional note icon
  // (which is rendered separately in the footer). See utils/noteIcon.js.
  const imgs = useMemo(() => getContentImages(n.images), [n.images]);
  const noteIcon = useMemo(() => getNoteIcon(n.images), [n.images]);

  const allTags = Array.isArray(n.tags) ? n.tags : [];

  const group = n.pinned ? "pinned" : "others";
  // Ordering is stored per-user server-side, so collaborators can drag shared
  // notes in their own view without affecting other participants.
  const canDrag = !multiMode;
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
      className="note-card-wrapper mb-2 sm:mb-3 relative z-0 hover:z-30 group"
      data-id={n.id}
      data-group={group}
    >
      {/* Pin popup — sits BEHIND the card surface (z-0) at the top-right.
          At rest it's translated down so it lives entirely inside the
          card area, hidden behind the surface. On hover it slides UP and
          peeks above the card's top edge — only the protruding portion
          is visible because the card surface (z-10) hides whatever still
          overlaps the card body. OnePlus 7 Pro pop-up camera vibe. */}
      {!multiMode && !disablePin && (
        <div
          className="absolute top-0 right-3 translate-y-full group-hover:-translate-y-[78%] transition-transform duration-300 ease-out z-0 pointer-events-none group-hover:pointer-events-auto"
        >
          <button
            aria-label={n.pinned ? t("unpinNote") : t("pinNote")}
            onClick={(e) => {
              if (disablePin) return;
              e.stopPropagation();
              togglePin(n.id, !n.pinned);
            }}
            className="flex items-start justify-center w-10 h-14 pt-2 rounded-t-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-[0_3px_10px_rgba(0,0,0,0.18)]"
            style={{ backgroundColor: bgFor(n.color, dark) }}
            data-tooltip={n.pinned ? t("unpin") : t("pin")}
            disabled={!!disablePin}
          >
            {n.pinned ? <PinFilled /> : <PinOutline />}
          </button>
        </div>
      )}

      {/* Card surface — the actual visible note. Higher z-index keeps it
          in front of the pin popup. */}
      <div
        className={`note-card glass-card rounded-xl p-2 sm:p-3 cursor-pointer transform hover:scale-[1.02] transition-transform duration-200 relative min-h-[54px] z-10 ${isDraw ? 'note-card--draw' : 'overflow-hidden'} ${
          multiMode && selected
            ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent"
            : ""
        }`}
        style={{
          backgroundColor: bgFor(n.color, dark),
          '--note-color': (!dark && (!n.color || n.color === 'default')) ? '#a78bfa' : solid(bgFor(n.color, dark)),
          ...(isDraw ? { overflow: 'visible', contain: 'none', contentVisibility: 'visible' } : {}),
        }}
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
      {/* Note icon — top-right corner, hidden in multi-select mode */}
      {noteIcon && !multiMode && (
        <div
          className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center overflow-hidden"
          aria-label={noteIcon.name || t("noteIcon")}
        >
          <img
            src={noteIcon.src}
            alt={noteIcon.name || t("noteIcon")}
            className="w-full h-full"
            style={{ objectFit: "contain" }}
            draggable={false}
          />
        </div>
      )}

      {n.title && (
        <h3 className={`font-bold text-sm sm:text-lg mb-2 break-words${noteIcon && !multiMode ? " pr-8" : ""}`}>{n.title}</h3>
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
          dangerouslySetInnerHTML={{ __html: textPreviewHtml }}
        />
      ) : isDraw ? (
        <>
          {drawText && (
            <div
              className="text-sm break-words whitespace-pre-wrap overflow-hidden note-content note-content--dense mb-2"
              style={{ maxHeight: "280px" }}
              dangerouslySetInnerHTML={{ __html: drawTextHtml }}
            />
          )}
          <DrawingPreview
            data={n.content}
            width={800}
            height={1800}
            darkMode={dark}
            maxPages={3}
          />
        </>
      ) : (
        <div className="space-y-2">
          {previewSections.map((s) => (
            <div key={s.id} className="space-y-1">
              {hasAnyTitledSection && s.id !== DEFAULT_SECTION_ID && s.title && (
                <div className="text-xs font-semibold tracking-wide text-gray-600 dark:text-gray-300 mt-2">
                  {s.title}
                </div>
              )}
              {s.items.map((it) => (
                <ChecklistRow
                  key={it.id}
                  item={it}
                  size="md"
                  readOnly={true}
                  showRemove={false}
                  preview={true}
                />
              ))}
            </div>
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

      {(() => {
        const collabs = Array.isArray(n.collaborators) ? n.collaborators : [];
        const isCollab = collabs.length > 0 || (n.user_id && currentUser && n.user_id !== currentUser.id);
        return (
          <NoteCardFooter
            tags={allTags}
            icon={noteIcon}
            collabs={collabs}
            isCollab={isCollab}
            dark={dark}
          />
        );
      })()}
      </div>
    </div>
  );
}
