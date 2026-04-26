// Local Tabler-icon loader for the rich-text editor toolbar.
//
// Each SVG lives under ./tabler/*.svg and is imported as a raw string via
// Vite's built-in `?raw` suffix (https://vitejs.dev/guide/assets.html).
// That means the bundle carries the SVG markup inline — no network fetch
// at runtime, no dependency on an external CDN or npm icon package. If
// @tabler/tabler-icons disappeared tomorrow, these files in the repo
// keep working.
//
// Tabler's upstream MIT licence is preserved in ./tabler/LICENSE.

import React from "react";

import boldSvg            from "./tabler/bold.svg?raw";
import italicSvg          from "./tabler/italic.svg?raw";
import underlineSvg       from "./tabler/underline.svg?raw";
import strikethroughSvg   from "./tabler/strikethrough.svg?raw";
import codeSvg            from "./tabler/code.svg?raw";
import bracesSvg          from "./tabler/braces.svg?raw";
import blockquoteSvg      from "./tabler/blockquote.svg?raw";
import separatorSvg       from "./tabler/separator-horizontal.svg?raw";
import linkSvg            from "./tabler/link.svg?raw";
import externalLinkSvg    from "./tabler/external-link.svg?raw";
import clearFormattingSvg from "./tabler/clear-formatting.svg?raw";
import subscriptSvg       from "./tabler/subscript.svg?raw";
import superscriptSvg     from "./tabler/superscript.svg?raw";
import listSvg            from "./tabler/list.svg?raw";
import listNumbersSvg     from "./tabler/list-numbers.svg?raw";
import indentIncSvg       from "./tabler/indent-increase.svg?raw";
import indentDecSvg       from "./tabler/indent-decrease.svg?raw";
import alignLeftSvg       from "./tabler/align-left.svg?raw";
import alignCenterSvg     from "./tabler/align-center.svg?raw";
import alignRightSvg      from "./tabler/align-right.svg?raw";
import alignJustifiedSvg  from "./tabler/align-justified.svg?raw";
import typographySvg      from "./tabler/typography.svg?raw";
import textColorSvg       from "./tabler/text-color.svg?raw";
import highlightSvg       from "./tabler/highlight.svg?raw";
import textIncreaseSvg    from "./tabler/text-increase.svg?raw";
import textDecreaseSvg    from "./tabler/text-decrease.svg?raw";
import chevronDownSvg     from "./tabler/chevron-down.svg?raw";
import pilcrowSvg         from "./tabler/pilcrow.svg?raw";
import headingSvg         from "./tabler/heading.svg?raw";
import terminal2Svg       from "./tabler/terminal-2.svg?raw";
import h1Svg               from "./tabler/h-1.svg?raw";
import h2Svg               from "./tabler/h-2.svg?raw";
import h3Svg               from "./tabler/h-3.svg?raw";
import h4Svg               from "./tabler/h-4.svg?raw";
import h5Svg               from "./tabler/h-5.svg?raw";

// Settings-panel icons (vendored same place as the editor icons —
// the loader is just a generic Tabler-icon registry).
import userCircleSvg       from "./tabler/user-circle.svg?raw";
import databaseSvg         from "./tabler/database.svg?raw";
import adjustmentsHSvg     from "./tabler/adjustments-horizontal.svg?raw";
import listCheckSvg        from "./tabler/list-check.svg?raw";
import eyeSvg              from "./tabler/eye.svg?raw";
import keySvg              from "./tabler/key.svg?raw";
import downloadSvg         from "./tabler/download.svg?raw";
import uploadSvg           from "./tabler/upload.svg?raw";
import brandGoogleSvg      from "./tabler/brand-google.svg?raw";
import fileTextSvg         from "./tabler/file-text.svg?raw";
import arrowsSortSvg       from "./tabler/arrows-sort.svg?raw";
import sparklesSvg         from "./tabler/sparkles.svg?raw";
import layoutSidebarSvg    from "./tabler/layout-sidebar.svg?raw";
import brainSvg            from "./tabler/brain.svg?raw";
import deviceMobileRotSvg  from "./tabler/device-mobile-rotated.svg?raw";
import eraserSvg           from "./tabler/eraser.svg?raw";
import filter2QuestionSvg  from "./tabler/filter-2-question.svg?raw";

// Cache of sanitised markup keyed by the raw SVG string. The transformation
// only depends on the SVG source, so each icon is processed exactly once.
const markupCache = new Map();

function normaliseMarkup(raw) {
  const cached = markupCache.get(raw);
  if (cached) return cached;
  // Drop the fixed width / height attributes so CSS can size the icon via
  // width/height on the host button. currentColor-based stroke is already
  // set by Tabler upstream, so active / hover / disabled states just work.
  const cleaned = raw
    .replace(/\s+width="\d+"/, "")
    .replace(/\s+height="\d+"/, "");
  markupCache.set(raw, cleaned);
  return cleaned;
}

/**
 * TablerIcon — inline SVG component backed by a vendored Tabler icon file.
 *
 * The raw SVG string is rendered through dangerouslySetInnerHTML — safe
 * because the content is a static file shipped with the application, not
 * anything user-controlled.
 */
function TablerIcon({ svg, className = "tabler-icon", ...rest }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: normaliseMarkup(svg) }}
      {...rest}
    />
  );
}

// Individual icon components — export surface used by RichIcons.
export const TI = {
  Bold:            (p) => <TablerIcon svg={boldSvg} {...p} />,
  Italic:          (p) => <TablerIcon svg={italicSvg} {...p} />,
  Underline:       (p) => <TablerIcon svg={underlineSvg} {...p} />,
  Strike:          (p) => <TablerIcon svg={strikethroughSvg} {...p} />,
  Code:            (p) => <TablerIcon svg={codeSvg} {...p} />,
  CodeBlock:       (p) => <TablerIcon svg={bracesSvg} {...p} />,
  Quote:           (p) => <TablerIcon svg={blockquoteSvg} {...p} />,
  Separator:       (p) => <TablerIcon svg={separatorSvg} {...p} />,
  Link:            (p) => <TablerIcon svg={linkSvg} {...p} />,
  ExternalLink:    (p) => <TablerIcon svg={externalLinkSvg} {...p} />,
  ClearFormatting: (p) => <TablerIcon svg={clearFormattingSvg} {...p} />,
  Subscript:       (p) => <TablerIcon svg={subscriptSvg} {...p} />,
  Superscript:     (p) => <TablerIcon svg={superscriptSvg} {...p} />,
  List:            (p) => <TablerIcon svg={listSvg} {...p} />,
  ListNumbers:     (p) => <TablerIcon svg={listNumbersSvg} {...p} />,
  IndentIncrease:  (p) => <TablerIcon svg={indentIncSvg} {...p} />,
  IndentDecrease:  (p) => <TablerIcon svg={indentDecSvg} {...p} />,
  AlignLeft:       (p) => <TablerIcon svg={alignLeftSvg} {...p} />,
  AlignCenter:     (p) => <TablerIcon svg={alignCenterSvg} {...p} />,
  AlignRight:      (p) => <TablerIcon svg={alignRightSvg} {...p} />,
  AlignJustified:  (p) => <TablerIcon svg={alignJustifiedSvg} {...p} />,
  Typography:      (p) => <TablerIcon svg={typographySvg} {...p} />,
  TextColor:       (p) => <TablerIcon svg={textColorSvg} {...p} />,
  Highlight:       (p) => <TablerIcon svg={highlightSvg} {...p} />,
  TextIncrease:    (p) => <TablerIcon svg={textIncreaseSvg} {...p} />,
  TextDecrease:    (p) => <TablerIcon svg={textDecreaseSvg} {...p} />,
  ChevronDown:     (p) => <TablerIcon svg={chevronDownSvg} {...p} />,
  Pilcrow:         (p) => <TablerIcon svg={pilcrowSvg} {...p} />,
  Heading:         (p) => <TablerIcon svg={headingSvg} {...p} />,
  Terminal2:       (p) => <TablerIcon svg={terminal2Svg} {...p} />,
  H1:              (p) => <TablerIcon svg={h1Svg} {...p} />,
  H2:              (p) => <TablerIcon svg={h2Svg} {...p} />,
  H3:              (p) => <TablerIcon svg={h3Svg} {...p} />,
  H4:              (p) => <TablerIcon svg={h4Svg} {...p} />,
  H5:              (p) => <TablerIcon svg={h5Svg} {...p} />,
  // Settings panel
  UserCircle:           (p) => <TablerIcon svg={userCircleSvg} {...p} />,
  Database:             (p) => <TablerIcon svg={databaseSvg} {...p} />,
  AdjustmentsHorizontal:(p) => <TablerIcon svg={adjustmentsHSvg} {...p} />,
  ListCheck:            (p) => <TablerIcon svg={listCheckSvg} {...p} />,
  Eye:                  (p) => <TablerIcon svg={eyeSvg} {...p} />,
  Key:                  (p) => <TablerIcon svg={keySvg} {...p} />,
  Download:             (p) => <TablerIcon svg={downloadSvg} {...p} />,
  Upload:               (p) => <TablerIcon svg={uploadSvg} {...p} />,
  BrandGoogle:          (p) => <TablerIcon svg={brandGoogleSvg} {...p} />,
  FileText:             (p) => <TablerIcon svg={fileTextSvg} {...p} />,
  ArrowsSort:           (p) => <TablerIcon svg={arrowsSortSvg} {...p} />,
  Sparkles:             (p) => <TablerIcon svg={sparklesSvg} {...p} />,
  LayoutSidebar:        (p) => <TablerIcon svg={layoutSidebarSvg} {...p} />,
  Brain:                (p) => <TablerIcon svg={brainSvg} {...p} />,
  DeviceMobileRotated:  (p) => <TablerIcon svg={deviceMobileRotSvg} {...p} />,
  Eraser:               (p) => <TablerIcon svg={eraserSvg} {...p} />,
  Filter2Question:      (p) => <TablerIcon svg={filter2QuestionSvg} {...p} />,
};

export default TI;
