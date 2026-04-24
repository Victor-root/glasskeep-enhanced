import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import LinkPopover from "./LinkPopover.jsx";
import RichIcons from "./RichIcons.jsx";
import { Popover } from "./Popover.jsx";

// Design principles:
//  • Compact icon buttons (tighter than v1) — one clean grid, grouped by
//    intent with subtle separators.
//  • Every control renders the same `rt-btn` primitive so states (active /
//    hover / focus / disabled) are consistent.
//  • Popovers (color, highlight, underline, link, text style) anchor on the
//    triggering button and close on outside click / Escape. No more browser
//    prompts.
//  • Selection-tracking is via editor.on("selectionUpdate" | "transaction")
//    so the toolbar reacts without prop drilling.

function useEditorSignal(editor) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((n) => (n + 1) % 1000000);
    editor.on("selectionUpdate", bump);
    editor.on("transaction", bump);
    editor.on("focus", bump);
    editor.on("blur", bump);
    return () => {
      editor.off("selectionUpdate", bump);
      editor.off("transaction", bump);
      editor.off("focus", bump);
      editor.off("blur", bump);
    };
  }, [editor]);
  return tick;
}

function ToolbarButton({ active, onClick, disabled, title, children, className = "" }) {
  return (
    <button
      type="button"
      className={`rt-btn${active ? " is-active" : ""} ${className}`}
      data-tooltip={title}
      aria-label={title}
      aria-pressed={active ? "true" : undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick(e);
      }}
    >
      {children}
    </button>
  );
}

// Popover primitive lives in ./Popover.jsx — it uses fixed positioning and
// clamps to the viewport so a popover near the right edge of the modal no
// longer extends the modal's scroll width.

const PRESET_TEXT_COLORS = [
  "#111827", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b", "#ffffff",
];
// Highlight palettes are theme-aware so colours stay readable (and visible
// in the picker itself — the old pale pastels were almost invisible on the
// white popover background).
const PRESET_HIGHLIGHTS_LIGHT = [
  "#fde047", "#fdba74", "#fca5a5", "#f9a8d4",
  "#c4b5fd", "#93c5fd", "#86efac", "#d1d5db",
];
const PRESET_HIGHLIGHTS_DARK = [
  "#b45309", "#c2410c", "#b91c1c", "#be185d",
  "#6d28d9", "#1d4ed8", "#047857", "#4b5563",
];
const PRESET_UNDERLINE_COLORS = [
  "#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6",
  "#ec4899", "#64748b",
];

// Track whether <html> currently carries the .dark class so the highlight
// palette can flip without a page reload. We observe the class attribute
// rather than reading media queries so the manual dark toggle still works.
function useIsDark() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const update = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// Ubuntu is self-hosted via @fontsource/ubuntu (see src/main.jsx) — no cloud.
const FONT_FAMILIES = [
  { label: "Sans", value: "" },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { label: "Display", value: '"Trebuchet MS", Verdana, sans-serif' },
  { label: "Ubuntu", value: 'Ubuntu, "Ubuntu Sans", sans-serif' },
];
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];
const DEFAULT_FONT_SIZE = "16px";

const UNDERLINE_STYLES = [
  { value: "simple", label: "fmtUnderlineSimple", preview: "underline" },
  { value: "double", label: "fmtUnderlineDouble", preview: "underline double" },
  { value: "dotted", label: "fmtUnderlineDotted", preview: "underline dotted" },
  { value: "dashed", label: "fmtUnderlineDashed", preview: "underline dashed" },
  { value: "wavy", label: "fmtUnderlineWavy", preview: "underline wavy" },
];

function Swatches({ colors, onPick, current, onClear, clearLabel }) {
  return (
    <div>
      <div className="rt-swatches">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            className={`rt-swatch${current === c ? " is-current" : ""}`}
            style={{ background: c }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c)}
            aria-label={c}
          />
        ))}
      </div>
      {onClear && (
        <button
          type="button"
          className="rt-pop-clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
        >
          {clearLabel || t("fmtDefault")}
        </button>
      )}
    </div>
  );
}

function BlockTypeMenu({ editor, anchorRef, open, onClose }) {
  const items = [
    { value: "p",  label: t("fmtParagraph"), icon: <RichIcons.Paragraph /> },
    { value: "h1", label: t("fmtHeading1"),  sample: "H1" },
    { value: "h2", label: t("fmtHeading2"),  sample: "H2" },
    { value: "h3", label: t("fmtHeading3"),  sample: "H3" },
  ];
  const currentHeading = [1, 2, 3].find((l) => editor.isActive("heading", { level: l }));
  const current = currentHeading ? `h${currentHeading}` : "p";
  const pick = (v) => {
    const chain = editor.chain().focus();
    if (v === "p") chain.setParagraph().run();
    else chain.setHeading({ level: Number(v.slice(1)) }).run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--blocks">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          className={`rt-menu-item rt-menu-item--${it.value}${current === it.value ? " is-current" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(it.value)}
        >
          <span className="rt-menu-item-sample">
            {it.icon ? it.icon : it.sample}
          </span>
          <span className="rt-menu-item-label">{it.label}</span>
        </button>
      ))}
    </Popover>
  );
}

function UnderlinePopover({ editor, anchorRef, open, onClose }) {
  const attrs = editor.getAttributes("underline") || {};
  const currentStyle = attrs.style || "simple";
  const currentColor = attrs.color || null;
  const apply = (next) => {
    const merged = { style: currentStyle, color: currentColor, ...next };
    // If turning underline on for the first time this keystroke, make sure
    // the mark is applied — otherwise just update its attributes.
    editor.chain().focus().setUnderline(merged).run();
  };
  const removeColor = () => apply({ color: null });
  const off = () => {
    editor.chain().focus().unsetMark("underline").run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--underline">
      <div className="rt-pop-label">{t("fmtUnderlineStyleLabel")}</div>
      <div className="rt-ul-styles">
        {UNDERLINE_STYLES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`rt-ul-style${currentStyle === s.value ? " is-current" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply({ style: s.value })}
            data-tooltip={t(s.label)}
          >
            <span style={{ textDecoration: s.preview, textDecorationColor: currentColor || undefined }}>
              Aa
            </span>
          </button>
        ))}
      </div>
      <div className="rt-pop-label rt-pop-label--spaced">{t("fmtUnderlineColorLabel")}</div>
      <Swatches
        colors={PRESET_UNDERLINE_COLORS}
        onPick={(c) => apply({ color: c })}
        current={currentColor}
        onClear={removeColor}
        clearLabel={t("fmtDefault")}
      />
      <button
        type="button"
        className="rt-pop-clear rt-pop-clear--danger"
        onMouseDown={(e) => e.preventDefault()}
        onClick={off}
      >
        {t("fmtUnderlineRemove")}
      </button>
    </Popover>
  );
}

function ColorPopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("textStyle")?.color || null;
  const apply = (c) => {
    editor.chain().focus().setColor(c).run();
    onClose?.();
  };
  const clear = () => {
    editor.chain().focus().unsetColor().run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--color">
      <Swatches colors={PRESET_TEXT_COLORS} onPick={apply} current={current} onClear={clear} />
    </Popover>
  );
}

function HighlightPopover({ editor, anchorRef, open, onClose, isDark }) {
  const current = editor.getAttributes("highlight")?.color || null;
  const colors = isDark ? PRESET_HIGHLIGHTS_DARK : PRESET_HIGHLIGHTS_LIGHT;
  const apply = (c) => {
    editor.chain().focus().setHighlight({ color: c }).run();
    onClose?.();
  };
  const clear = () => {
    editor.chain().focus().unsetHighlight().run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--highlight">
      <Swatches colors={colors} onPick={apply} current={current} onClear={clear} />
    </Popover>
  );
}

function FontSizePopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("textStyle")?.fontSize || "";
  const pick = (v) => {
    const chain = editor.chain().focus();
    if (v) chain.setFontSize(v).run();
    else chain.unsetFontSize().run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--fontsize">
      <button
        type="button"
        className={`rt-size-row rt-size-row--default${!current ? " is-current" : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick("")}
      >
        <span className="rt-size-value">{DEFAULT_FONT_SIZE.replace("px", "")}</span>
        <span className="rt-size-label">{t("fmtDefault")}</span>
      </button>
      {FONT_SIZES.map((s) => (
        <button
          key={s}
          type="button"
          className={`rt-size-row${current === s ? " is-current" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(s)}
        >
          <span className="rt-size-value">{s.replace("px", "")}</span>
        </button>
      ))}
    </Popover>
  );
}

function FontFamilyPopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("textStyle")?.fontFamily || "";
  const pick = (value) => {
    const chain = editor.chain().focus();
    if (value) chain.setFontFamily(value).run();
    else chain.unsetFontFamily().run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--font">
      {FONT_FAMILIES.map((f) => (
        <button
          key={f.label}
          type="button"
          className={`rt-font-row${current === f.value ? " is-current" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(f.value)}
          style={{ fontFamily: f.value || undefined }}
        >
          {f.label}
        </button>
      ))}
    </Popover>
  );
}

export default function RichTextToolbar({ editor, compact = false }) {
  useEditorSignal(editor);
  const isDark = useIsDark();

  const [openMenu, setOpenMenu] = useState(null); // name of the open popover
  const blockBtnRef = useRef(null);
  const fontBtnRef = useRef(null);
  const sizeBtnRef = useRef(null);
  const colorBtnRef = useRef(null);
  const hlBtnRef = useRef(null);
  const underlineBtnRef = useRef(null);
  const linkBtnRef = useRef(null);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const toggleMenu = useCallback((name) => {
    setOpenMenu((cur) => (cur === name ? null : name));
  }, []);

  const isActive = useCallback(
    (name, attrs) => !!editor && editor.isActive(name, attrs),
    [editor],
  );

  if (!editor) return null;

  const chain = () => editor.chain().focus();
  const headingLevel = [1, 2, 3].find((l) => editor.isActive("heading", { level: l }));
  // Block-type button shows the current heading level as text ("H1" / "H2" /
  // "H3") or a proper paragraph SVG icon when the block is a normal paragraph.
  const blockContent = headingLevel
    ? <span className="rt-btn-label">{`H${headingLevel}`}</span>
    : <RichIcons.Paragraph />;
  const attrs = editor.getAttributes("textStyle") || {};
  const currentColor = attrs.color || null;
  const currentHighlight = editor.getAttributes("highlight")?.color || null;
  const underlineAttrs = editor.getAttributes("underline") || {};
  const currentFontFamily = attrs.fontFamily || "";
  const currentFontSize = attrs.fontSize || "";
  const fontFamilyLabel =
    FONT_FAMILIES.find((f) => f.value === currentFontFamily)?.label || "Sans";
  const fontSizeLabel = currentFontSize
    ? currentFontSize.replace("px", "")
    : DEFAULT_FONT_SIZE.replace("px", "");

  // Alignment default: when no explicit text-align attribute is set on the
  // current block we treat the state as "left" so the button reads active
  // just like in any word processor.
  const isAlignCenter = isActive({ textAlign: "center" });
  const isAlignRight = isActive({ textAlign: "right" });
  const isAlignJustify = isActive({ textAlign: "justify" });
  const isAlignLeft = !isAlignCenter && !isAlignRight && !isAlignJustify;

  const canIndent =
    editor.can().sinkListItem?.("listItem") || editor.can().indent?.();
  const canOutdent =
    editor.can().liftListItem?.("listItem") || editor.can().outdent?.();

  const doIndent = () => {
    if (editor.can().sinkListItem?.("listItem")) {
      chain().sinkListItem("listItem").run();
    } else {
      chain().indent().run();
    }
  };
  const doOutdent = () => {
    if (editor.can().liftListItem?.("listItem")) {
      chain().liftListItem("listItem").run();
    } else {
      chain().outdent().run();
    }
  };

  return (
    <div className={`rt-toolbar${compact ? " rt-toolbar--compact" : ""}`} role="toolbar" aria-label={t("fmtToolbarLabel")}>
      {/* Group 1 — block structure: paragraph/heading, font family, font size */}
      <div className="rt-group" data-group="block">
        <button
          ref={blockBtnRef}
          type="button"
          className={`rt-btn rt-btn--menu rt-btn--block${headingLevel ? " is-active" : ""}`}
          data-tooltip={t("fmtParagraph")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleMenu("block")}
        >
          {blockContent}
          <RichIcons.Chevron />
        </button>
        <BlockTypeMenu editor={editor} anchorRef={blockBtnRef} open={openMenu === "block"} onClose={closeMenu} />

        <button
          ref={fontBtnRef}
          type="button"
          className="rt-btn rt-btn--menu rt-btn--wide"
          data-tooltip={t("fmtFontFamily")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleMenu("font")}
          style={{ fontFamily: currentFontFamily || undefined }}
        >
          <span className="rt-btn-label">{fontFamilyLabel}</span>
          <RichIcons.Chevron />
        </button>
        <FontFamilyPopover editor={editor} anchorRef={fontBtnRef} open={openMenu === "font"} onClose={closeMenu} />

        <button
          ref={sizeBtnRef}
          type="button"
          className={`rt-btn rt-btn--menu rt-btn--narrow${currentFontSize ? " is-active" : ""}`}
          data-tooltip={t("fmtFontSize")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleMenu("size")}
        >
          <span className="rt-btn-label">{fontSizeLabel}</span>
          <RichIcons.Chevron />
        </button>
        <FontSizePopover editor={editor} anchorRef={sizeBtnRef} open={openMenu === "size"} onClose={closeMenu} />
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Group 2 — inline character formatting (no inline code: that lives in
          group 6 next to the code block, so all "code" controls cluster). */}
      <div className="rt-group" data-group="marks">
        <ToolbarButton active={isActive("bold")} title={t("fmtBold")} onClick={() => chain().toggleBold().run()}>
          <RichIcons.Bold />
        </ToolbarButton>
        <ToolbarButton active={isActive("italic")} title={t("fmtItalic")} onClick={() => chain().toggleItalic().run()}>
          <RichIcons.Italic />
        </ToolbarButton>

        {/* Underline + chevron for advanced variants. */}
        <div className="rt-splitbtn">
          <ToolbarButton
            active={isActive("underline")}
            title={t("fmtUnderline")}
            onClick={() => chain().toggleUnderline({ style: underlineAttrs.style || "simple", color: underlineAttrs.color || null }).run()}
          >
            <RichIcons.Underline style={underlineAttrs.style} color={underlineAttrs.color} />
          </ToolbarButton>
          <button
            ref={underlineBtnRef}
            type="button"
            className={`rt-btn rt-btn--chevron${openMenu === "underline" ? " is-active" : ""}`}
            data-tooltip={t("fmtUnderlineOptions")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleMenu("underline")}
          >
            <RichIcons.Chevron />
          </button>
          <UnderlinePopover editor={editor} anchorRef={underlineBtnRef} open={openMenu === "underline"} onClose={closeMenu} />
        </div>

        <ToolbarButton active={isActive("strike")} title={t("fmtStrike")} onClick={() => chain().toggleStrike().run()}>
          <RichIcons.Strike />
        </ToolbarButton>
        <ToolbarButton active={isActive("subscript")} title={t("fmtSubscript")} onClick={() => chain().toggleSubscript().run()}>
          <RichIcons.Subscript />
        </ToolbarButton>
        <ToolbarButton active={isActive("superscript")} title={t("fmtSuperscript")} onClick={() => chain().toggleSuperscript().run()}>
          <RichIcons.Superscript />
        </ToolbarButton>
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Group 3 — colour + highlight */}
      <div className="rt-group" data-group="color">
        <button
          ref={colorBtnRef}
          type="button"
          className={`rt-btn rt-btn--swatch${currentColor ? " is-active" : ""}`}
          data-tooltip={t("fmtTextColor")}
          aria-label={t("fmtTextColor")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleMenu("color")}
        >
          <RichIcons.TextColor swatch={currentColor || "#111827"} />
        </button>
        <ColorPopover editor={editor} anchorRef={colorBtnRef} open={openMenu === "color"} onClose={closeMenu} />

        <button
          ref={hlBtnRef}
          type="button"
          className={`rt-btn rt-btn--swatch${currentHighlight ? " is-active" : ""}`}
          data-tooltip={t("fmtHighlight")}
          aria-label={t("fmtHighlight")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleMenu("highlight")}
        >
          <RichIcons.Highlight swatch={currentHighlight || (isDark ? "#b45309" : "#fde047")} />
        </button>
        <HighlightPopover editor={editor} anchorRef={hlBtnRef} open={openMenu === "highlight"} onClose={closeMenu} isDark={isDark} />
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Group 4 — list structure: bullet / ordered + outdent / indent */}
      <div className="rt-group" data-group="lists">
        <ToolbarButton active={isActive("bulletList")} title={t("fmtBulletList")} onClick={() => chain().toggleBulletList().run()}>
          <RichIcons.BulletList />
        </ToolbarButton>
        <ToolbarButton active={isActive("orderedList")} title={t("fmtOrderedList")} onClick={() => chain().toggleOrderedList().run()}>
          <RichIcons.OrderedList />
        </ToolbarButton>
        <ToolbarButton title={t("fmtOutdent")} disabled={!canOutdent} onClick={doOutdent}>
          <RichIcons.Outdent />
        </ToolbarButton>
        <ToolbarButton title={t("fmtIndent")} disabled={!canIndent} onClick={doIndent}>
          <RichIcons.Indent />
        </ToolbarButton>
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Group 5 — block alignment */}
      <div className="rt-group" data-group="align">
        <ToolbarButton active={isAlignLeft} title={t("fmtAlignLeft")} onClick={() => chain().setTextAlign("left").run()}>
          <RichIcons.AlignLeft />
        </ToolbarButton>
        <ToolbarButton active={isAlignCenter} title={t("fmtAlignCenter")} onClick={() => chain().setTextAlign("center").run()}>
          <RichIcons.AlignCenter />
        </ToolbarButton>
        <ToolbarButton active={isAlignRight} title={t("fmtAlignRight")} onClick={() => chain().setTextAlign("right").run()}>
          <RichIcons.AlignRight />
        </ToolbarButton>
        <ToolbarButton active={isAlignJustify} title={t("fmtAlignJustify")} onClick={() => chain().setTextAlign("justify").run()}>
          <RichIcons.AlignJustify />
        </ToolbarButton>
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Group 6 — content inserts: quote, code (inline+block), HR, link */}
      <div className="rt-group" data-group="insert">
        <ToolbarButton active={isActive("blockquote")} title={t("fmtQuote")} onClick={() => chain().toggleBlockquote().run()}>
          <RichIcons.Quote />
        </ToolbarButton>
        <ToolbarButton active={isActive("code")} title={t("fmtInlineCode")} onClick={() => chain().toggleCode().run()}>
          <RichIcons.Code />
        </ToolbarButton>
        <ToolbarButton
          active={isActive("codeBlock")}
          title={t("fmtCodeBlock")}
          onClick={() => chain().smartToggleCodeBlock().run()}
        >
          <RichIcons.CodeBlock />
        </ToolbarButton>
        <ToolbarButton title={t("fmtSeparator")} onClick={() => chain().setHorizontalRule().run()}>
          <RichIcons.HR />
        </ToolbarButton>
        <div className="rt-pop-wrap" ref={linkBtnRef}>
          <ToolbarButton
            active={isActive("link") || openMenu === "link"}
            title={t("fmtLink")}
            onClick={() => toggleMenu("link")}
          >
            <RichIcons.Link />
          </ToolbarButton>
          <LinkPopover editor={editor} anchorRef={linkBtnRef} open={openMenu === "link"} onClose={closeMenu} />
        </div>
      </div>

      {/* Trailing utility — clear formatting. Pushed to the far right via
          margin-left: auto so it has its own resting place. */}
      <div className="rt-group rt-group--trailing" data-group="clear">
        <ToolbarButton
          title={t("fmtClearFormatting")}
          onClick={() => chain().clearNodes().unsetAllMarks().run()}
        >
          <RichIcons.Clear />
        </ToolbarButton>
      </div>
    </div>
  );
}
