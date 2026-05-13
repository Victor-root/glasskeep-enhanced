import React, { useEffect, useMemo, useRef } from "react";
import { t } from "../../i18n";
import { bgFor, solid, parseRGBA } from "../../utils/colors.js";
import { isRichContent, contentToHTML } from "../../utils/richText.js";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";
import { getSections, isItem, DEFAULT_SECTION_ID } from "../../utils/checklist.js";
import { getContentImages, getNoteIcon } from "../../utils/noteIcon.js";
import { parseAudioContent, formatDuration } from "../../utils/audioNote.js";
import { Mic, X } from "lucide-react";

function isColorDark(rgba) {
  const { r, g, b } = parseRGBA(rgba);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.55;
}

function buildBodyHtml(note) {
  if (note.type === "text") {
    const raw = note.content || "";
    if (!raw) return "";
    return isRichContent(raw) ? contentToHTML(raw) : renderSafeMarkdown(raw);
  }
  if (note.type === "draw") {
    try {
      const parsed = typeof note.content === "string" ? JSON.parse(note.content) : note.content;
      const txt = parsed?.text || "";
      if (!txt) return "";
      return isRichContent(txt) ? contentToHTML(txt) : renderSafeMarkdown(txt);
    } catch { return ""; }
  }
  return "";
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

export default function TvNoteDetail({ note, onClose }) {
  const closeRef = useRef(null);
  const bg = bgFor(note?.color, true);
  const isDark = note ? isColorDark(bg) : true;

  // Focus the close button on mount so Enter / OK exits the viewer
  // without any extra D-pad input. The scroll body itself is also
  // focusable (tabindex=0) so the user can land on it via Down and
  // scroll a long note line by line.
  useEffect(() => {
    if (!note) return undefined;
    const id = requestAnimationFrame(() => {
      const target = closeRef.current;
      if (target instanceof HTMLElement) {
        window.dispatchEvent(new CustomEvent("tv-focus", { detail: { target } }));
      }
    });
    return () => cancelAnimationFrame(id);
  }, [note]);

  const bodyHtml = useMemo(() => (note ? buildBodyHtml(note) : ""), [note]);
  const imgs = useMemo(() => (note ? getContentImages(note.images) : []), [note]);
  const icon = useMemo(() => (note ? getNoteIcon(note.images) : null), [note]);
  const audioClips = useMemo(() => {
    if (!note || note.type !== "audio") return [];
    try { return parseAudioContent(note.content).clips; } catch { return []; }
  }, [note]);
  const checklistSections = useMemo(() => {
    if (!note || note.type !== "checklist") return null;
    return getSections(note.items);
  }, [note]);

  // Keyboard scroll for the long-note body — when focus is on the
  // body element, Up/Down step it through the content instead of
  // jumping to a sibling card.
  const bodyRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      const el = bodyRef.current;
      if (!el || document.activeElement !== el) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight * 0.8, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight * 0.8, behavior: "smooth" });
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  if (!note) return null;

  return (
    <div
      className="tv-detail"
      role="dialog"
      aria-modal="true"
      aria-label={note.title || t("note")}
    >
      <div
        className="tv-detail__card"
        style={{
          background: solid(bg),
          color: isDark ? "#f5f3ff" : "#1f2937",
        }}
      >
        <header className="tv-detail__header">
          {icon && (
            <img
              src={icon.src}
              alt=""
              aria-hidden="true"
              style={{ width: 30, height: 30, objectFit: "contain", flexShrink: 0 }}
            />
          )}
          <h1 className="tv-detail__title">
            {note.title || (note.type === "checklist" ? t("checklist") : t("note"))}
          </h1>
          <div className="tv-detail__meta">
            {formatDate(note.updated_at || note.created_at)}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="tv-detail__close tv-focusable tv-focusable--flat"
            onClick={onClose}
            aria-label={t("close")}
          >
            <X size={18} />
          </button>
        </header>

        <div
          ref={bodyRef}
          tabIndex={0}
          className="tv-detail__body tv-focusable tv-focusable--flat tv-allow-select"
          style={{ outline: "none" }}
        >
          {imgs.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: imgs.length === 1 ? "1fr" : "repeat(2, 1fr)",
                gap: 14,
                marginBottom: 18,
              }}
            >
              {imgs.map((im) => (
                <img
                  key={im.id}
                  src={im.src}
                  alt={im.name || ""}
                  style={{
                    width: "100%",
                    maxHeight: 360,
                    objectFit: "contain",
                    background: "rgba(0,0,0,0.18)",
                    borderRadius: 14,
                  }}
                />
              ))}
            </div>
          )}

          {note.type === "checklist" && checklistSections ? (
            <ChecklistBody sections={checklistSections} />
          ) : note.type === "audio" ? (
            <AudioBody clips={audioClips} />
          ) : (
            bodyHtml ? (
              <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            ) : (
              <div style={{ opacity: 0.6, fontStyle: "italic" }}>
                {note.type === "draw" ? t("drawing") : t("noNotesYet")}
              </div>
            )
          )}

          {Array.isArray(note.tags) && note.tags.length > 0 && (
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 18,
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.12)",
            }}>
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    fontSize: 13,
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistBody({ sections }) {
  const visibleSections = sections.filter((s) =>
    s.items.length > 0 || (s.id !== DEFAULT_SECTION_ID && s.title)
  );
  return (
    <div className="tv-checklist">
      {visibleSections.map((s) => (
        <div key={s.id}>
          {s.id !== DEFAULT_SECTION_ID && s.title && (
            <div className="tv-checklist__section-title">{s.title}</div>
          )}
          {s.items.filter(isItem).map((it) => (
            <div
              key={it.id}
              className={`tv-checklist__item${it.done ? " tv-checklist__item--done" : ""}`}
            >
              <span className="tv-checklist__box" aria-hidden="true">
                {it.done ? "✓" : ""}
              </span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{it.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AudioBody({ clips }) {
  if (!clips || clips.length === 0) {
    return (
      <div style={{ opacity: 0.6, fontStyle: "italic" }}>
        {t("audioRecordingEmpty")}
      </div>
    );
  }
  return (
    <div className="tv-checklist">
      {clips.map((clip, i) => {
        const name = (clip.name && clip.name.trim()) ||
          t("audioClipDefaultName").replace("{n}", String(i + 1));
        const dur = Number.isFinite(clip.duration) ? clip.duration : 0;
        return (
          <div key={clip.id || i} className="tv-checklist__item">
            <span style={{
              width: 40, height: 40, borderRadius: 999, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "rgba(124,58,237,0.35)", color: "#fff", flexShrink: 0,
            }}>
              <MicrophoneFilledIcon className="w-5 h-5" />
            </span>
            <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
            {dur > 0 && (
              <span style={{ opacity: 0.65, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
                {formatDuration(dur)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
