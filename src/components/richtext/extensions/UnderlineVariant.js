// Underline mark with style / color attributes.
//
// Extends Tiptap's official underline so we can offer simple / double /
// dotted / dashed / wavy underlines plus an optional colour, without
// forking the upstream keymap or paste handling.
//
// Implementation note — each attribute's own renderHTML emits the CSS
// `text-decoration-*` fragment it is responsible for. Tiptap's
// mergeAttributes then concatenates the `style` values with "; ", so the
// final <u> ends up with a correct combined declaration. Doing it in the
// mark's own renderHTML didn't work because at that point we only receive
// the already-transformed HTMLAttributes (no raw attribute access).

import { Underline as BaseUnderline } from "@tiptap/extension-underline";

const STYLE_VALUES = new Set(["simple", "double", "dotted", "dashed", "wavy"]);

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
        renderHTML: (attrs) => {
          if (!attrs.style || !STYLE_VALUES.has(attrs.style)) return {};
          // "simple" is the browser default — still flag it so the toolbar
          // knows the mark has an explicit style, but don't paint inline CSS
          // that would override nested decorations.
          if (attrs.style === "simple") {
            return { "data-underline-style": "simple" };
          }
          return {
            "data-underline-style": attrs.style,
            // `text-decoration-line: underline` is explicit because the raw
            // <u> already carries the default line, but if another extension
            // changes text-decoration we still want ours to win.
            style: `text-decoration-line: underline; text-decoration-style: ${attrs.style}`,
          };
        },
      },
      color: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute("data-underline-color") ||
          el.style?.textDecorationColor ||
          null,
        renderHTML: (attrs) => {
          if (!attrs.color) return {};
          return {
            "data-underline-color": attrs.color,
            style: `text-decoration-color: ${attrs.color}`,
          };
        },
      },
    };
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
