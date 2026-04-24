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
    //   - with a non-empty selection → convert the selected block(s)
    //     (Tiptap's default setHeading / setParagraph)
    //   - with just a caret in an EMPTY block → convert that empty
    //     block (so pressing H1 on a fresh line starts typing into H1)
    //   - with just a caret in a block that ALREADY has content →
    //     insert a NEW empty block of the target type right AFTER the
    //     current block and move the caret into it. Nothing around the
    //     caret is silently promoted to H1 / H2 / …
    if (value === "p") {
      // Back-to-paragraph: convert the current block (or selection) —
      // the user wants to stop being a heading.
      editor.chain().focus().setParagraph().run();
      return;
    }

    const level = Number(value.slice(1));
    const { selection } = editor.state;
    const $from = selection.$from;
    const parent = $from.parent;
    const caretIsInsideContent =
      selection.empty && parent.isTextblock && parent.content.size > 0;

    if (!caretIsInsideContent) {
      editor.chain().focus().setHeading({ level }).run();
      return;
    }

    // Caret sits inside a non-empty block: insert a fresh empty heading
    // AFTER the current block so existing content is preserved verbatim
    // and the user starts writing into the new heading.
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
