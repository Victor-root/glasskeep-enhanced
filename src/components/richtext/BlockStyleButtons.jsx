import React from "react";
import { t } from "../../i18n";

// Four compact "style gallery" buttons that replace the old Paragraph /
// H1 / H2 / H3 dropdown. Each button carries its own label rendered in
// the corresponding block style, so the button IS its own visual preview.
// Arranged as a 2x2 grid so the super-group's height matches the rest
// of the toolbar (two sub-rows of flush buttons, same rhythm as the
// Paragraph and Insert groups).

const STYLES = [
  { value: "p",  labelKey: "fmtParagraph", className: "rt-style-btn--p"  },
  { value: "h1", labelKey: "fmtHeading1",  className: "rt-style-btn--h1" },
  { value: "h2", labelKey: "fmtHeading2",  className: "rt-style-btn--h2" },
  { value: "h3", labelKey: "fmtHeading3",  className: "rt-style-btn--h3" },
  { value: "h4", labelKey: "fmtHeading4",  className: "rt-style-btn--h4" },
  { value: "h5", labelKey: "fmtHeading5",  className: "rt-style-btn--h5" },
];

function StyleButton({ editor, value, labelKey, className, active }) {
  const label = t(labelKey);
  const apply = () => {
    // Behave like every other toolbar tool:
    //   - with an inline selection INSIDE a single block → the selected
    //     slice becomes the new block type; anything before / after the
    //     selection on the same line stays as the original block type
    //     (implemented with a ProseMirror replaceWith that inserts
    //     paragraph-before + heading-selection + paragraph-after).
    //   - with a selection that spans multiple blocks → Tiptap's default
    //     (convert each selected block).
    //   - with just a caret in an EMPTY block → convert that empty block.
    //   - with just a caret in a non-empty block → insert a fresh empty
    //     heading AFTER the current block and move the caret into it.
    // Nothing the user hasn't selected ever gets silently promoted.
    if (value === "p") {
      editor.chain().focus().setParagraph().run();
      return;
    }

    const level = Number(value.slice(1));
    const { state } = editor;
    const { selection, schema } = state;
    const $from = selection.$from;
    const $to = selection.$to;
    const sameBlock =
      !selection.empty &&
      $from.sameParent($to) &&
      $from.parent.isTextblock;

    if (sameBlock) {
      // Inline selection inside a single text block → carve the
      // selection out into its own heading, keep the rest of the line.
      const parent = $from.parent;
      const blockStart = $from.before();
      const blockEnd = $from.after();
      const inlineStart = $from.start();
      const inlineEnd = $from.end();

      const beforeFrag = state.doc.slice(inlineStart, selection.from).content;
      const middleFrag = state.doc.slice(selection.from, selection.to).content;
      const afterFrag = state.doc.slice(selection.to, inlineEnd).content;

      const headingType = schema.nodes.heading;
      if (!headingType) {
        // Schema can't host a heading here — fall back to the default.
        editor.chain().focus().setHeading({ level }).run();
        return;
      }

      editor
        .chain()
        .focus()
        .command(({ tr, dispatch }) => {
          const replacement = [];
          // Preserve the parent block type (and its attrs) for the
          // non-selected slivers so the user's original formatting
          // around the selection isn't lost.
          if (beforeFrag.size > 0) {
            replacement.push(parent.type.create(parent.attrs, beforeFrag));
          }
          replacement.push(headingType.create({ level }, middleFrag));
          if (afterFrag.size > 0) {
            replacement.push(parent.type.create(parent.attrs, afterFrag));
          }
          tr.replaceWith(blockStart, blockEnd, replacement);
          if (dispatch) dispatch(tr);
          return true;
        })
        .run();
      return;
    }

    if (!selection.empty) {
      // Multi-block selection → convert each selected block (default).
      editor.chain().focus().setHeading({ level }).run();
      return;
    }

    // Empty selection: caret-in-block behaviour.
    const parent = $from.parent;
    const caretIsInsideContent =
      parent.isTextblock && parent.content.size > 0;

    if (!caretIsInsideContent) {
      editor.chain().focus().setHeading({ level }).run();
      return;
    }

    const posAfter = $from.after();
    editor
      .chain()
      .focus()
      .insertContentAt(posAfter, { type: "heading", attrs: { level } })
      .focus(posAfter + 1)
      .run();
  };
  return (
    <button
      type="button"
      className={`rt-style-btn ${className}${active ? " is-active" : ""}`}
      data-tooltip={label}
      aria-label={label}
      aria-pressed={active ? "true" : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={apply}
    >
      <span className="rt-style-btn-sample">{label}</span>
    </button>
  );
}

export default function BlockStyleButtons({ editor }) {
  if (!editor) return null;
  const headingLevel = [1, 2, 3, 4, 5].find((l) => editor.isActive("heading", { level: l }));
  const current = headingLevel ? `h${headingLevel}` : "p";
  // 2 x 3 grid: row 1 = P + H1 + H2, row 2 = H3 + H4 + H5.
  return (
    <div className="rt-sg rt-sg--style" data-sg="style">
      <div className="rt-sg-row">
        {STYLES.slice(0, 3).map((s) => (
          <StyleButton
            key={s.value}
            editor={editor}
            {...s}
            active={current === s.value}
          />
        ))}
      </div>
      <div className="rt-sg-row">
        {STYLES.slice(3).map((s) => (
          <StyleButton
            key={s.value}
            editor={editor}
            {...s}
            active={current === s.value}
          />
        ))}
      </div>
    </div>
  );
}
