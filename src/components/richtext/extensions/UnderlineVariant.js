// Underline mark with style / color attributes.
// Extends Tiptap's official underline so we can offer simple / double /
// dotted / dashed / wavy underlines plus an optional colour, without
// forking the upstream keymap or paste handling.
//
// We render as `<u style="text-decoration: underline <style> <color>">`
// because every modern browser supports the CSS `text-decoration-*` longhand
// through the shorthand, and this keeps the serialized HTML portable —
// DOMPurify already allows the `style` attribute in our rich-text sanitizer.

import { Underline as BaseUnderline } from "@tiptap/extension-underline";
import { mergeAttributes } from "@tiptap/core";

const STYLE_VALUES = new Set(["simple", "double", "dotted", "dashed", "wavy"]);

function buildDecorationStyle(style, color) {
  if (!style && !color) return null;
  const parts = ["underline"];
  if (style && style !== "simple" && STYLE_VALUES.has(style)) parts.push(style);
  if (color) parts.push(color);
  return parts.join(" ");
}

export const UnderlineVariant = BaseUnderline.extend({
  addAttributes() {
    return {
      style: {
        default: null,
        parseHTML: (el) => {
          const attr = el.getAttribute("data-underline-style");
          if (attr && STYLE_VALUES.has(attr)) return attr;
          const inline = el.style?.textDecorationStyle || "";
          return STYLE_VALUES.has(inline) ? inline : null;
        },
        renderHTML: (attrs) => (attrs.style ? { "data-underline-style": attrs.style } : {}),
      },
      color: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute("data-underline-color") ||
          el.style?.textDecorationColor ||
          null,
        renderHTML: (attrs) => (attrs.color ? { "data-underline-color": attrs.color } : {}),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const { style, color, ...rest } = HTMLAttributes;
    const decoration = buildDecorationStyle(style, color);
    const merged = mergeAttributes(this.options.HTMLAttributes, rest);
    if (decoration) {
      const existing = merged.style ? `${merged.style};` : "";
      merged.style = `${existing}text-decoration: ${decoration}`;
    }
    if (style) merged["data-underline-style"] = style;
    if (color) merged["data-underline-color"] = color;
    return ["u", merged, 0];
  },
  addCommands() {
    const parent = this.parent?.() || {};
    return {
      ...parent,
      // Overloaded set/toggle that accept optional { style, color } attrs so
      // the toolbar popover can update the decoration without losing the mark.
      setUnderline: (attrs) => ({ commands }) => commands.setMark(this.name, attrs || {}),
      toggleUnderline: (attrs) => ({ commands }) => commands.toggleMark(this.name, attrs || {}),
      updateUnderline: (attrs) => ({ editor, commands }) => {
        const active = editor.isActive(this.name);
        if (!active) return commands.setMark(this.name, attrs || {});
        return commands.updateAttributes(this.name, attrs || {});
      },
    };
  },
});

export default UnderlineVariant;
