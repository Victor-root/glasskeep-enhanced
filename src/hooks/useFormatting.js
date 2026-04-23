import { useCallback } from "react";
import { wrapSelection, fencedBlock, toggleList, prefixLines, insertHr } from "../components/common/FormatToolbar.jsx";

/**
 * useFormatting — Shared markdown formatting helper.
 *
 * Returns `runFormat(getter, setter, ref, type)` which applies
 * markdown formatting to a textarea identified by `ref`.
 *
 * Used by both the composer (via App) and the modal (via useModalState).
 */
export default function useFormatting() {
  const runFormat = useCallback((getter, setter, ref, type) => {
    const el = ref.current;
    if (!el) return;
    const value = getter();
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;

    // Insert defaults when editor is empty for quote / ul / ol
    if (
      (type === "ul" || type === "ol" || type === "quote") &&
      value.trim().length === 0
    ) {
      const snippet = type === "ul" ? "- " : type === "ol" ? "1. " : "> ";
      setter(snippet);
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(snippet.length, snippet.length);
        } catch (e) {}
      });
      return;
    }

    // Handle list formatting when no text is selected
    if ((type === "ul" || type === "ol") && start === end) {
      const snippet = type === "ul" ? "- " : "1. ";
      const newValue = value.slice(0, start) + snippet + value.slice(end);
      setter(newValue);
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(start + snippet.length, start + snippet.length);
        } catch (e) {}
      });
      return;
    }

    let result;
    switch (type) {
      case "h1":
        result = prefixLines(value, start, end, "# ");
        break;
      case "h2":
        result = prefixLines(value, start, end, "## ");
        break;
      case "h3":
        result = prefixLines(value, start, end, "### ");
        break;
      case "bold":
        result = wrapSelection(value, start, end, "**", "**");
        break;
      case "italic":
        result = wrapSelection(value, start, end, "_", "_");
        break;
      case "strike":
        result = wrapSelection(value, start, end, "~~", "~~");
        break;
      case "code":
        result = wrapSelection(value, start, end, "`", "`");
        break;
      case "codeblock":
        result = fencedBlock(value, start, end);
        break;
      case "quote":
        result = prefixLines(value, start, end, "> ");
        break;
      case "ul":
        result = toggleList(value, start, end, "ul");
        break;
      case "ol":
        result = toggleList(value, start, end, "ol");
        break;
      case "link":
        result = wrapSelection(value, start, end, "[", "](https://)");
        break;
      case "hr":
        result = insertHr(value, start, end);
        break;
      default:
        return;
    }
    setter(result.text);
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(result.range[0], result.range[1]);
      } catch (e) {}
    });
  }, []);

  return runFormat;
}
