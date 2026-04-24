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
    const chain = editor.chain().focus();
    if (value === "p") chain.setParagraph().run();
    else chain.setHeading({ level: Number(value.slice(1)) }).run();
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
