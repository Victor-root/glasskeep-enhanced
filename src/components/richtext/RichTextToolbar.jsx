import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import LinkPopover from "./LinkPopover.jsx";
import RichIcons from "./RichIcons.jsx";
import BlockStyleButtons from "./BlockStyleButtons.jsx";
import ToolbarButton from "./ToolbarButton.jsx";
import UnderlinePopover from "./UnderlinePopover.jsx";
import ColorPopover from "./ColorPopover.jsx";
import HighlightPopover from "./HighlightPopover.jsx";
import FontSizePopover from "./FontSizePopover.jsx";
import FontFamilyPopover from "./FontFamilyPopover.jsx";
import TaskListPopover from "./TaskListPopover.jsx";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_HIGHLIGHT_SWATCH,
  FONT_FAMILIES,
  FONT_SIZES,
} from "./toolbarPresets.js";

// Design principles:
//  • Compact icon buttons (tighter than v1): one clean grid, grouped by
//    intent with subtle separators.
//  • Every control renders the same `rt-btn` primitive (ToolbarButton.jsx)
//    so states (active / hover / focus / disabled) are consistent.
//  • Popovers (color, highlight, underline, link, text style) anchor on the
//    triggering button and close on outside click / Escape. No more browser
//    prompts. Popover primitive lives in ./Popover.jsx: it uses fixed
//    positioning and clamps to the viewport so a popover near the right
//    edge of the modal no longer extends the modal's scroll width.
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

// Block-type picker is rendered inline in the advanced toolbar as preview
// buttons (see BlockStyleButtons.jsx). There is no "More" menu: every tool
// stays visible in the main bar in a Word-style dense layout.

export default function RichTextToolbar({ editor, compact = false, mode = "simple" }) {
  useEditorSignal(editor);

  const [openMenu, setOpenMenu] = useState(null); // name of the open popover
  const fontBtnRef = useRef(null);
  const sizeBtnRef = useRef(null);
  const colorBtnRef = useRef(null);
  const hlBtnRef = useRef(null);
  const underlineBtnRef = useRef(null);
  const taskListBtnRef = useRef(null);
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

  const canIndent = !!editor.can().indent?.();
  const canOutdent = inListItem
    ? listItemIndent > 0
    : !!editor.can().outdent?.();

  // ── Controls shared by both layouts ─────────────────────────────────────
  const fontFamilyMenu = (
    <>
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
    </>
  );
  const fontSizeMenu = (
    <>
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
    </>
  );
  const clearFormattingButton = (
    <ToolbarButton
      title={t("fmtClearFormatting")}
      onClick={() => chain().clearNodes().unsetAllMarks().run()}
    >
      <RichIcons.Clear />
    </ToolbarButton>
  );
  const boldButton = (
    <ToolbarButton active={isActive("bold")} title={t("fmtBold")} onClick={() => chain().toggleBold().run()}>
      <RichIcons.Bold />
    </ToolbarButton>
  );
  const italicButton = (
    <ToolbarButton active={isActive("italic")} title={t("fmtItalic")} onClick={() => chain().toggleItalic().run()}>
      <RichIcons.Italic />
    </ToolbarButton>
  );
  const underlineSplit = (
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
  );
  const strikeButton = (
    <ToolbarButton active={isActive("strike")} title={t("fmtStrike")} onClick={() => chain().toggleStrike().run()}>
      <RichIcons.Strike />
    </ToolbarButton>
  );
  const textColorMenu = (
    <>
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
    </>
  );
  const highlightMenu = (
    <>
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
    </>
  );
  const bulletListButton = (
    <ToolbarButton active={isActive("bulletList")} title={t("fmtBulletList")} onClick={() => chain().toggleBulletList().run()}>
      <RichIcons.BulletList />
    </ToolbarButton>
  );
  const orderedListButton = (
    <ToolbarButton active={isActive("orderedList")} title={t("fmtOrderedList")} onClick={() => chain().toggleOrderedList().run()}>
      <RichIcons.OrderedList />
    </ToolbarButton>
  );
  const taskListSplit = (
    <div className="rt-splitbtn">
      <ToolbarButton active={isActive("taskList")} title={t("fmtTaskList")} onClick={() => chain().toggleTaskList().run()}>
        <RichIcons.TaskList />
      </ToolbarButton>
      <button
        ref={taskListBtnRef}
        type="button"
        className={`rt-btn rt-btn--chevron${openMenu === "taskList" ? " is-active" : ""}`}
        data-tooltip={t("fmtTaskListOptions")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleMenu("taskList")}
      >
        <RichIcons.Chevron />
      </button>
      <TaskListPopover anchorRef={taskListBtnRef} open={openMenu === "taskList"} onClose={closeMenu} />
    </div>
  );
  // The advanced ribbon tags its alignment buttons with rt-btn--align.
  const alignButtons = (className) => (
    <>
      <ToolbarButton className={className} active={isAlignLeft} title={t("fmtAlignLeft")} onClick={() => chain().setTextAlign("left").run()}>
        <RichIcons.AlignLeft />
      </ToolbarButton>
      <ToolbarButton className={className} active={isAlignCenter} title={t("fmtAlignCenter")} onClick={() => chain().setTextAlign("center").run()}>
        <RichIcons.AlignCenter />
      </ToolbarButton>
      <ToolbarButton className={className} active={isAlignRight} title={t("fmtAlignRight")} onClick={() => chain().setTextAlign("right").run()}>
        <RichIcons.AlignRight />
      </ToolbarButton>
    </>
  );
  const separatorButton = (
    <ToolbarButton title={t("fmtSeparator")} onClick={() => chain().setHorizontalRule().run()}>
      <RichIcons.HR />
    </ToolbarButton>
  );
  const linkMenu = (
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
  );

  // ── Simple toolbar: single flat row with essential tools only ──────────
  if (mode === "simple") {
    return (
      <div className={`rt-toolbar${compact ? " rt-toolbar--compact" : ""}`} role="toolbar" aria-label={t("fmtToolbarLabel")}>
        <div className="rt-sg">
          <div className="rt-sg-row">
            {fontFamilyMenu}
            {fontSizeMenu}

            <span className="rt-sep" aria-hidden="true" />

            {boldButton}
            {italicButton}
            {underlineSplit}
            {strikeButton}
            {clearFormattingButton}

            <span className="rt-sep" aria-hidden="true" />

            {textColorMenu}
            {highlightMenu}

            <span className="rt-sep" aria-hidden="true" />

            {bulletListButton}
            {orderedListButton}
            {taskListSplit}

            <span className="rt-sep" aria-hidden="true" />

            {alignButtons()}

            <span className="rt-sep" aria-hidden="true" />

            {separatorButton}
            {linkMenu}
          </div>
        </div>
      </div>
    );
  }

  // ── Advanced toolbar: full multi-row ribbon ──────────────────────────────
  return (
    <div className={`rt-toolbar${compact ? " rt-toolbar--compact" : ""}`} role="toolbar" aria-label={t("fmtToolbarLabel")}>
      {/*
        Word-ribbon layout. Each "super-group" is a 2-sub-row block:
        structural controls on top, character/inline controls on the
        bottom, so the group reads as one homogeneous unit even when
        it wraps onto a second visual row.
      */}

      {/* Super-group A: Font / character formatting.
          (Block type selection, Paragraph / H1 / H2 / H3, lives in its
          own Style super-group on the right, rendered as preview
          buttons.) */}
      <div className="rt-sg" data-sg="font">
        <div className="rt-sg-row">
          {fontFamilyMenu}
          {fontSizeMenu}

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

          {clearFormattingButton}
        </div>
        <div className="rt-sg-row">
          {boldButton}
          {italicButton}
          {underlineSplit}
          {strikeButton}
          {textColorMenu}
          {highlightMenu}
          <ToolbarButton active={isActive("subscript")} title={t("fmtSubscript")} onClick={() => chain().toggleSubscript().run()}>
            <RichIcons.Subscript />
          </ToolbarButton>
          <ToolbarButton active={isActive("superscript")} title={t("fmtSuperscript")} onClick={() => chain().toggleSuperscript().run()}>
            <RichIcons.Superscript />
          </ToolbarButton>
        </div>
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Super-group B: Paragraph / block structure */}
      <div className="rt-sg" data-sg="paragraph">
        <div className="rt-sg-row">
          {bulletListButton}
          {orderedListButton}
          {taskListSplit}
          <ToolbarButton className="rt-btn--indent" title={t("fmtIndent")} disabled={!canIndent} onClick={doIndent}>
            <RichIcons.Indent />
          </ToolbarButton>
        </div>
        <div className="rt-sg-row">
          {alignButtons("rt-btn--align")}
          <ToolbarButton className="rt-btn--align" active={isAlignJustify} title={t("fmtAlignJustify")} onClick={() => chain().setTextAlign("justify").run()}>
            <RichIcons.AlignJustify />
          </ToolbarButton>
          <ToolbarButton className="rt-btn--outdent" title={t("fmtOutdent")} disabled={!canOutdent} onClick={doOutdent}>
            <RichIcons.Outdent />
          </ToolbarButton>
        </div>
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Super-group C: Insert / content elements.
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
          {separatorButton}
          {linkMenu}
        </div>
      </div>

      <span className="rt-sep" aria-hidden="true" />

      {/* Super-group D: Style gallery (Paragraph / H1 / H2 / H3) rendered
          as preview buttons that carry their own typography so the
          button IS its visual preview. Replaces the old block-type
          dropdown and uses the space on the right of the toolbar. */}
      <BlockStyleButtons editor={editor} />
    </div>
  );
}
