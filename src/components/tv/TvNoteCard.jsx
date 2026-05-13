import React, { memo, useMemo } from "react";
import { t } from "../../i18n";
import { bgFor, solid, parseRGBA } from "../../utils/colors.js";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";
import { isRichContent, contentToHTML } from "../../utils/richText.js";
import { getNoteIcon, getContentImages } from "../../utils/noteIcon.js";
import { Image as ImageLucide, Mic, Pencil, CheckSquare } from "lucide-react";
import { countItems, countChecked, isItem } from "../../utils/checklist.js";
import { parseAudioContent } from "../../utils/audioNote.js";

// Closed note card for TV. Renders into the dark 10-foot palette and
// is wrapped in React.memo so an unrelated parent rerender (clock tick,
// filter change) never re-mounts the grid — important on older Shield
// hardware where each card costs ~3ms to first-paint.

const PREVIEW_MAX_CHARS = 360;

function isColorDark(rgba) {
  const { r, g, b } = parseRGBA(rgba);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

function buildPreviewHtml(n) {
  if (n.type === "text") {
    const raw = n.content || "";
    if (!raw) return "";
    if (isRichContent(raw)) return contentToHTML(raw);
    const sliced = raw.length > PREVIEW_MAX_CHARS
      ? raw.slice(0, PREVIEW_MAX_CHARS).trimEnd() + "…"
      : raw;
    return renderSafeMarkdown(sliced);
  }
  if (n.type === "draw") {
    try {
      const parsed = typeof n.content === "string" ? JSON.parse(n.content) : n.content;
      const txt = parsed?.text || "";
      if (!txt) return "";
      return isRichContent(txt) ? contentToHTML(txt) : renderSafeMarkdown(txt);
    } catch { return ""; }
  }
  return "";
}

function TvNoteCardImpl({ note, variant = "grid", onActivate }) {
  const isCarousel = variant === "carousel";

  const bg = bgFor(note.color, true);
  const isDark = isColorDark(bg);

  const imgs = useMemo(() => getContentImages(note.images), [note.images]);
  const icon = useMemo(() => getNoteIcon(note.images), [note.images]);
  const previewHtml = useMemo(() => buildPreviewHtml(note), [note]);
  const isChecklist = note.type === "checklist";
  const isDraw = note.type === "draw";
  const isAudio = note.type === "audio";

  const audioClips = useMemo(() => {
    if (!isAudio) return [];
    try { return parseAudioContent(note.content).clips; } catch { return []; }
  }, [isAudio, note.content]);

  const checklistSummary = useMemo(() => {
    if (!isChecklist) return null;
    const total = countItems(note.items);
    const done = countChecked(note.items);
    const limit = isCarousel ? 3 : 5;
    const unchecked = (note.items || [])
      .filter(it => isItem(it) && !it.done)
      .slice(0, limit);
    return { total, done, unchecked };
  }, [isChecklist, note.items, isCarousel]);

  const handleActivate = (e) => {
    e?.preventDefault?.();
    onActivate?.(note);
  };

  return (
    <button
      type="button"
      className={`tv-card tv-focusable ${isDark ? "tv-card--dark" : ""}`}
      style={{ background: solid(bg) }}
      onClick={handleActivate}
      data-note-id={note.id}
      aria-label={note.title || (isChecklist ? t("checklist") : t("note"))}
    >
      {icon && !isCarousel && (
        <img
          src={icon.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      )}

      {note.title && (
        <div
          className="tv-card__title"
          role="heading"
          aria-level="3"
          style={{ paddingRight: icon && !isCarousel ? 24 : 0 }}
        >
          {note.title}
        </div>
      )}

      {imgs.length > 0 && (
        <div className={`tv-card__images${imgs.length > 1 && !isCarousel ? " tv-card__images--multi" : ""}`}>
          {imgs.slice(0, isCarousel ? 1 : 2).map((im) => (
            <img key={im.id} src={im.src} alt={im.name || ""} loading="lazy" decoding="async" />
          ))}
        </div>
      )}

      {isChecklist && checklistSummary ? (
        <div className="tv-card__preview">
          {checklistSummary.unchecked.length === 0 && checklistSummary.total > 0 ? (
            <div style={{ opacity: 0.7, fontStyle: "italic" }}>
              {t("completedFraction")
                .replace("{done}", String(checklistSummary.done))
                .replace("{total}", String(checklistSummary.total))}
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {checklistSummary.unchecked.map((it) => (
                <li
                  key={it.id}
                  style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: "2px 0" }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0, width: 10, height: 10, marginTop: 3,
                      border: "1.5px solid currentColor", borderRadius: 3, opacity: 0.75,
                    }}
                  />
                  <span style={{ flex: 1, lineHeight: 1.3 }}>{it.text}</span>
                </li>
              ))}
              {checklistSummary.total > checklistSummary.unchecked.length && (
                <li style={{ opacity: 0.65, marginTop: 4, fontSize: 11 }}>
                  +{checklistSummary.total - checklistSummary.unchecked.length}
                </li>
              )}
            </ul>
          )}
        </div>
      ) : isAudio ? (
        <div className="tv-card__preview">
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <Mic size={12} />
            <span>{audioClips.length || 0} {t("audioRecording")}</span>
          </div>
        </div>
      ) : isDraw ? (
        <div className="tv-card__preview">
          {previewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <div style={{ opacity: 0.7, fontStyle: "italic", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Pencil size={12} />
              {t("drawing")}
            </div>
          )}
        </div>
      ) : (
        previewHtml && (
          <div
            className="tv-card__preview"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )
      )}

      <div className="tv-card__footer">
        {imgs.length > 0 && !isDraw && (
          <span className="tv-card__badge">
            <ImageLucide size={10} />
            {imgs.length}
          </span>
        )}
        {isChecklist && checklistSummary && (
          <span className="tv-card__badge">
            <CheckSquare size={10} />
            {checklistSummary.done}/{checklistSummary.total}
          </span>
        )}
        {Array.isArray(note.tags) && note.tags.length > 0 && (
          <span className="tv-card__badge" style={{ maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            #{note.tags.slice(0, 2).join(" #")}
            {note.tags.length > 2 ? ` +${note.tags.length - 2}` : ""}
          </span>
        )}
      </div>
    </button>
  );
}

// React.memo's shallow comparison is enough: TvNotesViewer always
// passes the same note object reference until something actually
// changes (the polling loader replaces the whole array with new
// objects only when the server payload differs).
export default memo(TvNoteCardImpl);
