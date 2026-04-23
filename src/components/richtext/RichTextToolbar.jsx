import React, { useRef, useState, useEffect, useCallback } from "react";
import { t } from "../../i18n";

// Small reusable button that highlights when the corresponding mark/node is
// active in the editor. All commands run through editor.chain() so focus and
// history stay consistent.
function ToolbarButton({ editor, active, onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`rt-btn${active ? " is-active" : ""}`}
      data-tooltip={title}
      aria-label={title}
      disabled={disabled}
      // Prevent focus shift so the selection in the editor is preserved.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        if (!editor || disabled) return;
        onClick();
      }}
    >
      {children}
    </button>
  );
}

const PRESET_TEXT_COLORS = [
  "#111827", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b", "#ffffff",
];
const PRESET_HIGHLIGHTS = [
  "#fef3c7", "#fee2e2", "#fde68a", "#d1fae5", "#dbeafe", "#ede9fe",
  "#fce7f3", "#e5e7eb",
];
const FONT_FAMILIES = [
  { label: "Sans", value: "" },
  { label: "Serif", value: "Georgia, \"Times New Roman\", serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { label: "Display", value: '"Trebuchet MS", Verdana, sans-serif' },
];
const FONT_SIZES = ["", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];

function SwatchPopover({ label, colors, onPick, onClear, anchor }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  return (
    <div className="rt-pop-wrap">
      <button
        ref={btnRef}
        type="button"
        className="rt-btn"
        data-tooltip={label}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        {anchor}
      </button>
      {open && (
        <div ref={popRef} className="rt-pop">
          <div className="rt-swatches">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                className="rt-swatch"
                style={{ background: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                aria-label={c}
              />
            ))}
          </div>
          <button
            type="button"
            className="rt-pop-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            {t("fmtDefault")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function RichTextToolbar({ editor, compact = false }) {
  // We don't actually need to subscribe to editor changes here because the
  // parent wraps us in a re-render on every transaction via the useEditor
  // hook. But to be safe for edge cases we force a tick counter.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const fn = () => setTick((n) => (n + 1) % 1000000);
    editor.on("selectionUpdate", fn);
    editor.on("transaction", fn);
    return () => {
      editor.off("selectionUpdate", fn);
      editor.off("transaction", fn);
    };
  }, [editor]);

  const isActive = useCallback(
    (name, attrs) => !!editor && editor.isActive(name, attrs),
    [editor],
  );

  if (!editor) return null;
  const chain = () => editor.chain().focus();

  const currentHeading = [1, 2, 3].find((l) => isActive("heading", { level: l }));
  const blockValue = currentHeading ? `h${currentHeading}` : "p";
  const onBlockChange = (e) => {
    const v = e.target.value;
    if (v === "p") chain().setParagraph().run();
    else chain().toggleHeading({ level: Number(v.slice(1)) }).run();
  };

  const currentFontFamily =
    editor.getAttributes("textStyle")?.fontFamily || "";
  const currentFontSize =
    editor.getAttributes("textStyle")?.fontSize || "";

  return (
    <div className={`rt-toolbar${compact ? " rt-toolbar--compact" : ""}`} role="toolbar">
      <select
        className="rt-select"
        value={blockValue}
        onChange={onBlockChange}
        onMouseDown={(e) => e.stopPropagation()}
        title={t("fmtParagraph")}
      >
        <option value="p">{t("fmtParagraph")}</option>
        <option value="h1">{t("fmtHeading1")}</option>
        <option value="h2">{t("fmtHeading2")}</option>
        <option value="h3">{t("fmtHeading3")}</option>
      </select>

      <select
        className="rt-select"
        value={currentFontFamily}
        onChange={(e) => {
          const v = e.target.value;
          if (v) chain().setFontFamily(v).run();
          else chain().unsetFontFamily().run();
        }}
        title={t("fmtFontFamily")}
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        className="rt-select"
        value={currentFontSize}
        onChange={(e) => {
          const v = e.target.value;
          if (v) chain().setFontSize(v).run();
          else chain().unsetFontSize().run();
        }}
        title={t("fmtFontSize")}
      >
        <option value="">{t("fmtDefault")}</option>
        {FONT_SIZES.filter(Boolean).map((s) => (
          <option key={s} value={s}>
            {s.replace("px", "")}
          </option>
        ))}
      </select>

      <span className="rt-sep" />

      <ToolbarButton editor={editor} active={isActive("bold")} title={t("fmtBold")} onClick={() => chain().toggleBold().run()}>
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive("italic")} title={t("fmtItalic")} onClick={() => chain().toggleItalic().run()}>
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive("underline")} title={t("fmtUnderline")} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive("strike")} title={t("fmtStrike")} onClick={() => chain().toggleStrike().run()}>
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive("code")} title={t("fmtInlineCode")} onClick={() => chain().toggleCode().run()}>
        <code>{"</>"}</code>
      </ToolbarButton>

      <SwatchPopover
        label={t("fmtTextColor")}
        colors={PRESET_TEXT_COLORS}
        onPick={(c) => chain().setColor(c).run()}
        onClear={() => chain().unsetColor().run()}
        anchor={<span className="rt-swatch-anchor" style={{ color: editor.getAttributes("textStyle")?.color || "inherit" }}>A</span>}
      />
      <SwatchPopover
        label={t("fmtHighlight")}
        colors={PRESET_HIGHLIGHTS}
        onPick={(c) => chain().toggleHighlight({ color: c }).run()}
        onClear={() => chain().unsetHighlight().run()}
        anchor={<span className="rt-swatch-anchor rt-swatch-anchor--hl">🖍</span>}
      />

      <ToolbarButton editor={editor} active={isActive("subscript")} title={t("fmtSubscript")} onClick={() => chain().toggleSubscript().run()}>
        <span>X<sub>2</sub></span>
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive("superscript")} title={t("fmtSuperscript")} onClick={() => chain().toggleSuperscript().run()}>
        <span>X<sup>2</sup></span>
      </ToolbarButton>

      <span className="rt-sep" />

      <ToolbarButton editor={editor} active={isActive("bulletList")} title={t("fmtBulletList")} onClick={() => chain().toggleBulletList().run()}>
        •
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive("orderedList")} title={t("fmtOrderedList")} onClick={() => chain().toggleOrderedList().run()}>
        1.
      </ToolbarButton>
      <ToolbarButton
        editor={editor}
        title={t("fmtOutdent")}
        disabled={!editor.can().liftListItem("listItem")}
        onClick={() => chain().liftListItem("listItem").run()}
      >
        ⇤
      </ToolbarButton>
      <ToolbarButton
        editor={editor}
        title={t("fmtIndent")}
        disabled={!editor.can().sinkListItem("listItem")}
        onClick={() => chain().sinkListItem("listItem").run()}
      >
        ⇥
      </ToolbarButton>

      <span className="rt-sep" />

      <ToolbarButton editor={editor} active={isActive({ textAlign: "left" })} title={t("fmtAlignLeft")} onClick={() => chain().setTextAlign("left").run()}>
        ⬱
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive({ textAlign: "center" })} title={t("fmtAlignCenter")} onClick={() => chain().setTextAlign("center").run()}>
        ⇔
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive({ textAlign: "right" })} title={t("fmtAlignRight")} onClick={() => chain().setTextAlign("right").run()}>
        ⬲
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive({ textAlign: "justify" })} title={t("fmtAlignJustify")} onClick={() => chain().setTextAlign("justify").run()}>
        ≡
      </ToolbarButton>

      <span className="rt-sep" />

      <ToolbarButton editor={editor} active={isActive("blockquote")} title={t("fmtQuote")} onClick={() => chain().toggleBlockquote().run()}>
        ❝
      </ToolbarButton>
      <ToolbarButton editor={editor} active={isActive("codeBlock")} title={t("fmtCodeBlock")} onClick={() => chain().toggleCodeBlock().run()}>
        {"{ }"}
      </ToolbarButton>
      <ToolbarButton editor={editor} title={t("fmtSeparator")} onClick={() => chain().setHorizontalRule().run()}>
        —
      </ToolbarButton>

      <span className="rt-sep" />

      <ToolbarButton
        editor={editor}
        title={t("fmtLink")}
        onClick={() => {
          const prev = editor.getAttributes("link")?.href || "";
          // eslint-disable-next-line no-alert
          const url = window.prompt(t("fmtLink"), prev);
          if (url === null) return;
          if (url === "") {
            chain().unsetLink().run();
          } else {
            chain().extendMarkRange("link").setLink({ href: url }).run();
          }
        }}
      >
        🔗
      </ToolbarButton>

      <ToolbarButton
        editor={editor}
        title={t("fmtClearFormatting")}
        onClick={() => chain().clearNodes().unsetAllMarks().run()}
      >
        ⌫
      </ToolbarButton>
    </div>
  );
}
