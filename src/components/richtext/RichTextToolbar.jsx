import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import LinkPopover from "./LinkPopover.jsx";
import RichIcons from "./RichIcons.jsx";
import { Popover } from "./Popover.jsx";
import BlockStyleButtons from "./BlockStyleButtons.jsx";

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
// Highlight palette — 8 named slots backed by CSS variables. Each slot
// resolves to a different hex in light vs dark mode (see globalCSS.js
// :root / html.dark rules) — we store the var() REFERENCE in the mark,
// so switching theme re-resolves the highlight automatically and a
// "red" highlight picked in dark mode becomes the light-mode "red"
// equivalent without having to touch the document.
const PRESET_HIGHLIGHTS = [
  "var(--rt-hl-1)",
  "var(--rt-hl-2)",
  "var(--rt-hl-3)",
  "var(--rt-hl-4)",
  "var(--rt-hl-5)",
  "var(--rt-hl-6)",
  "var(--rt-hl-7)",
  "var(--rt-hl-8)",
];
const DEFAULT_HIGHLIGHT_SWATCH = "var(--rt-hl-1)";
const PRESET_UNDERLINE_COLORS = [
  "#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6",
  "#ec4899", "#64748b",
];

// (useIsDark was needed when the highlight palette had two JS arrays
// for light / dark mode. The palette is now backed by CSS variables
// that re-resolve automatically on theme change, so no JS tracking is
// required.)

// 28 web-safe + open-source webfonts vendored locally via @fontsource
// (see src/main.jsx). Listed in a familiar Sans / Serif / Mono / Display
// order so the popover reads as a tidy gallery.
const FONT_FAMILIES = [
  // System default (no fontFamily mark applied)
  { label: "Sans", value: "" },
  // --- Sans-serif ---
  { label: "Inter",            value: 'Inter, sans-serif' },
  { label: "Roboto",           value: 'Roboto, sans-serif' },
  { label: "Open Sans",        value: '"Open Sans", sans-serif' },
  { label: "Lato",             value: 'Lato, sans-serif' },
  { label: "Source Sans",      value: '"Source Sans 3", sans-serif' },
  { label: "Noto Sans",        value: '"Noto Sans", sans-serif' },
  { label: "Nunito",           value: 'Nunito, sans-serif' },
  { label: "Poppins",          value: 'Poppins, sans-serif' },
  { label: "Montserrat",       value: 'Montserrat, sans-serif' },
  { label: "Raleway",          value: 'Raleway, sans-serif' },
  { label: "Work Sans",        value: '"Work Sans", sans-serif' },
  { label: "Ubuntu",           value: 'Ubuntu, sans-serif' },
  // --- Serif ---
  { label: "Merriweather",     value: 'Merriweather, serif' },
  { label: "Lora",             value: 'Lora, serif' },
  { label: "PT Serif",         value: '"PT Serif", serif' },
  { label: "Playfair Display", value: '"Playfair Display", serif' },
  { label: "EB Garamond",      value: '"EB Garamond", serif' },
  { label: "Source Serif",     value: '"Source Serif 4", serif' },
  // --- Monospace ---
  { label: "JetBrains Mono",   value: '"JetBrains Mono", monospace' },
  { label: "Fira Code",        value: '"Fira Code", monospace' },
  { label: "Source Code Pro",  value: '"Source Code Pro", monospace' },
  { label: "IBM Plex Mono",    value: '"IBM Plex Mono", monospace' },
  { label: "Roboto Mono",      value: '"Roboto Mono", monospace' },
  // --- Display / decorative ---
  { label: "Bebas Neue",       value: '"Bebas Neue", sans-serif' },
  { label: "Oswald",           value: 'Oswald, sans-serif' },
  { label: "Pacifico",         value: 'Pacifico, cursive' },
  { label: "Dancing Script",   value: '"Dancing Script", cursive' },
  { label: "Caveat",           value: 'Caveat, cursive' },
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

// Block-type picker is no longer a dropdown — it's rendered inline in
// the toolbar as four preview buttons (see BlockStyleButtons.jsx).

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

function HighlightPopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("highlight")?.color || null;
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
      <Swatches colors={PRESET_HIGHLIGHTS} onPick={apply} current={current} onClear={clear} />
    </Popover>
  );
}

function FontSizePopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("textStyle")?.fontSize || "";
  const pick = (v) => {
    const chain = editor.chain().focus();
    // Clicking the "default" size removes the explicit attribute so the
    // text goes back to inheriting whatever the block's default size is.
    if (!v || v === DEFAULT_FONT_SIZE) chain.unsetFontSize().run();
    else chain.setFontSize(v).run();
    onClose?.();
  };
  // Whether the "default" marker is effectively active: no explicit size OR
  // explicit size equal to the default.
  const defaultActive = !current || current === DEFAULT_FONT_SIZE;
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--fontsize">
      {FONT_SIZES.map((s) => {
        const isDefault = s === DEFAULT_FONT_SIZE;
        const isCurrent = isDefault ? defaultActive : current === s;
        return (
          <button
            key={s}
            type="button"
            className={`rt-size-row${isCurrent ? " is-current" : ""}${isDefault ? " rt-size-row--is-default" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(s)}
          >
            <span className="rt-size-value">{s.replace("px", "")}</span>
            {isDefault && <span className="rt-size-default-badge">{t("fmtDefault")}</span>}
          </button>
        );
      })}
    </Popover>
  );
}

// Step through the ordered list of font sizes. Used by the A+ / A- buttons.
function stepFontSize(editor, direction) {
  const current = editor.getAttributes("textStyle")?.fontSize || DEFAULT_FONT_SIZE;
  let idx = FONT_SIZES.indexOf(current);
  if (idx === -1) idx = FONT_SIZES.indexOf(DEFAULT_FONT_SIZE);
  const next = Math.max(0, Math.min(FONT_SIZES.length - 1, idx + direction));
  const value = FONT_SIZES[next];
  const chain = editor.chain().focus();
  if (value === DEFAULT_FONT_SIZE) chain.unsetFontSize().run();
  else chain.setFontSize(value).run();
}

function FontFamilyPopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("textStyle")?.fontFamily || "";
  const currentRowRef = useRef(null);
  const pick = (value) => {
    const chain = editor.chain().focus();
    if (value) chain.setFontFamily(value).run();
    else chain.unsetFontFamily().run();
    onClose?.();
  };
  // When the popover opens, centre the currently active font in the
  // scrollable list so the user doesn't have to hunt through the
  // alphabetic order each time. Direct scrollTop manipulation on the
  // immediate parent (the scroll container) keeps the side-effect
  // local — no risk of scrolling the document underneath.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const row = currentRowRef.current;
      if (!row) return;
      const container = row.parentElement;
      if (!container) return;
      const target = row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2;
      container.scrollTop = Math.max(0, target);
    });
  }, [open]);
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--font">
      {FONT_FAMILIES.map((f) => {
        const isCurrent = current === f.value;
        return (
          <button
            key={f.label}
            ref={isCurrent ? currentRowRef : null}
            type="button"
            className={`rt-font-row${isCurrent ? " is-current" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(f.value)}
            style={{ fontFamily: f.value || undefined }}
          >
            {f.label}
          </button>
        );
      })}
    </Popover>
  );
}

// (No "More" menu — every tool from the spec stays visible in the main bar
// in a Word-style dense layout.)

export default function RichTextToolbar({ editor, compact = false }) {
  useEditorSignal(editor);

  const [openMenu, setOpenMenu] = useState(null); // name of the open popover
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

  // Indent / outdent — keep each line independent.
  //
  // We deliberately AVOID sinkListItem / liftListItem from the toolbar
  // buttons because nesting one list item under another (which is what
  // sinkListItem does) wraps the whole sub-list inside the previous
  // item's <li>. That re-renders the previous item's geometry, which
  // the user perceived as "ma Puce 1 a bougé quand j'ai indenté Puce
  // 2". Instead the toolbar always bumps a per-listItem indent
  // attribute (rendered as inline margin-inline-start on the <li>):
  //
  //   * the bullet / number marker AND its text shift together as one
  //     unit (the inner <p> is intentionally skipped by the Indent
  //     extension so the shift isn't doubled),
  //   * each item is fully independent — touching Puce 2 never moves
  //     Puce 1 or any other line.
  //
  // Tab / Shift+Tab inside a list still trigger Tiptap's native sink /
  // liftListItem keymap for users who explicitly want the nested-list
  // semantics.
  const inListItem = isActive("listItem");
  let listItemIndent = 0;
  if (inListItem) {
    const $from = editor.state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === "listItem") {
        listItemIndent = Number(node.attrs?.indent) || 0;
        break;
      }
    }
  }

  const doIndent = () => {
    chain().indent().run();
  };
  const doOutdent = () => {
    chain().outdent().run();
  };

  const canIndent = inListItem
    ? !!editor.can().indent?.()
    : !!editor.can().indent?.();
  const canOutdent = inListItem
    ? listItemIndent > 0
    : !!editor.can().outdent?.();

  return (
    <div className={`rt-toolbar${compact ? " rt-toolbar--compact" : ""}`} role="toolbar" aria-label={t("fmtToolbarLabel")}>
      {/*
        Word-ribbon layout. Each "super-group" is a 2-sub-row block:
        structural controls on top, character/inline controls on the
        bottom — so the group reads as one homogeneous unit even when
        it wraps onto a second visual row.
      */}

      {/* Super-group A — Font / character formatting.
          (Block type selection — Paragraph / H1 / H2 / H3 — moved out
          of this group into its own Style super-group on the right,
          rendered as 4 preview buttons.) */}
      <div className="rt-sg" data-sg="font">
        <div className="rt-sg-row">

          <button
            ref={fontBtnRef}
            type="button"
            className={`rt-btn rt-btn--menu rt-btn--wide${currentFontFamily ? " is-active" : ""}`}
            data-tooltip={t("fmtFontFamily")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleMenu("font")}
            style={{ fontFamily: currentFontFamily || undefined }}
          >
            {/* Show the currently-picked font name in the button (Word-style)
                so the current state is legible without opening the popover. */}
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

          <ToolbarButton
            title={t("fmtFontSizeUp")}
            onClick={() => stepFontSize(editor, +1)}
          >
            <RichIcons.SizeUp />
          </ToolbarButton>
          <ToolbarButton
            title={t("fmtFontSizeDown")}
            onClick={() => stepFontSize(editor, -1)}
          >
            <RichIcons.SizeDown />
          </ToolbarButton>

          <ToolbarButton
            title={t("fmtClearFormatting")}
            onClick={() => chain().clearNodes().unsetAllMarks().run()}
          >
            <RichIcons.Clear />
          </ToolbarButton>
        </div>
        <div className="rt-sg-row">
          <ToolbarButton active={isActive("bold")} title={t("fmtBold")} onClick={() => chain().toggleBold().run()}>
            <RichIcons.Bold />
          </ToolbarButton>
          <ToolbarButton active={isActive("italic")} title={t("fmtItalic")} onClick={() => chain().toggleItalic().run()}>
            <RichIcons.Italic />
          </ToolbarButton>
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
          <button
            ref={colorBtnRef}
            type="button"
            className={`rt-btn rt-btn--swatch rt-btn--has-chevron${currentColor ? " is-active" : ""}`}
            data-tooltip={t("fmtTextColor")}
            aria-label={t("fmtTextColor")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleMenu("color")}
          >
            <RichIcons.TextColor swatch={currentColor || "#111827"} />
            <RichIcons.Chevron />
          </button>
          <ColorPopover editor={editor} anchorRef={colorBtnRef} open={openMenu === "color"} onClose={closeMenu} />
          <button
            ref={hlBtnRef}
            type="button"
            className={`rt-btn rt-btn--swatch rt-btn--has-chevron${currentHighlight ? " is-active" : ""}`}
            data-tooltip={t("fmtHighlight")}
            aria-label={t("fmtHighlight")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleMenu("highlight")}
          >
            <RichIcons.Highlight swatch={currentHighlight || DEFAULT_HIGHLIGHT_SWATCH} />
            <RichIcons.Chevron />
          </button>
          <HighlightPopover editor={editor} anchorRef={hlBtnRef} open={openMenu === "highlight"} onClose={closeMenu} />
          <ToolbarButton active={isActive("subscript")} title={t("fmtSubscript")} onClick={() => chain().toggleSubscript().run()}>
            <RichIcons.Subscript />
          </ToolbarButton>
          <ToolbarButton active={isActive("superscript")} title={t("fmtSuperscript")} onClick={() => chain().toggleSuperscript().run()}>
            <RichIcons.Superscript />
          </ToolbarButton>
        </div>
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Super-group B — Paragraph / block structure */}
      <div className="rt-sg" data-sg="paragraph">
        <div className="rt-sg-row">
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
        <div className="rt-sg-row">
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
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Super-group C — Insert / content elements.
          Row 1: code block, inline code, quote.
          Row 2: HR, link (with "www" label so the link button visually
                 fills the row's leftover space and balances the
                 group's two-row geometry). */}
      <div className="rt-sg" data-sg="insert">
        <div className="rt-sg-row">
          <ToolbarButton
            active={isActive("codeBlock")}
            title={t("fmtCodeBlock")}
            onClick={() => chain().smartToggleCodeBlock().run()}
          >
            <RichIcons.CodeBlock />
          </ToolbarButton>
          <ToolbarButton active={isActive("code")} title={t("fmtInlineCode")} onClick={() => chain().toggleCode().run()}>
            <RichIcons.Code />
          </ToolbarButton>
          <ToolbarButton active={isActive("blockquote")} title={t("fmtQuote")} onClick={() => chain().toggleBlockquote().run()}>
            <RichIcons.Quote />
          </ToolbarButton>
        </div>
        <div className="rt-sg-row">
          <ToolbarButton title={t("fmtSeparator")} onClick={() => chain().setHorizontalRule().run()}>
            <RichIcons.HR />
          </ToolbarButton>
          <div className="rt-pop-wrap rt-pop-wrap--link" ref={linkBtnRef}>
            <button
              type="button"
              className={`rt-btn rt-btn--link${isActive("link") || openMenu === "link" ? " is-active" : ""}`}
              data-tooltip={t("fmtLink")}
              aria-label={t("fmtLink")}
              aria-pressed={isActive("link") ? "true" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleMenu("link")}
            >
              <RichIcons.Link />
              <span className="rt-btn-label">www</span>
            </button>
            <LinkPopover editor={editor} anchorRef={linkBtnRef} open={openMenu === "link"} onClose={closeMenu} />
          </div>
        </div>
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Super-group D — Style gallery (Paragraph / H1 / H2 / H3) rendered
          as four preview buttons that carry their own typography so the
          button IS its visual preview. Replaces the old block-type
          dropdown and uses the space on the right of the toolbar. */}
      <BlockStyleButtons editor={editor} />
    </div>
  );
}
