// Shared Tiptap schema for GlassKeep text notes.
// Keeping the extension list in one module guarantees that the editor,
// the preview renderer (generateHTML), and the legacy→rich migration
// (generateJSON) all agree on which marks and nodes are legal.

import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import UnderlineVariant from "./extensions/UnderlineVariant.js";
import Indent from "./extensions/Indent.js";
import SmartCodeBlock from "./extensions/SmartCodeBlock.js";

// Factory so the editor instance and the (stateless) render helpers can share
// the same configured extensions but the editor can still override
// `placeholder` without polluting the render path.
export function buildRichTextExtensions({ placeholder = "" } = {}) {
  return [
    StarterKit.configure({
      // Disable StarterKit's default Underline — we replace it with our own
      // variant-aware mark below (see UnderlineVariant).
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
      heading: { levels: [1, 2, 3] },
    }),
    UnderlineVariant,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TextAlign.configure({
      types: ["heading", "paragraph"],
      // Emit explicit `text-align: left` so round-trips through HTML keep
      // the attribute and our toolbar can reliably detect the left state.
      alignments: ["left", "center", "right", "justify"],
    }),
    Indent,
    SmartCodeBlock,
    Placeholder.configure({ placeholder }),
  ];
}

// Render/migration extensions share config but never need a placeholder.
export const RENDER_EXTENSIONS = buildRichTextExtensions();
