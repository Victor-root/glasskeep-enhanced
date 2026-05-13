import React, { useMemo } from "react";
import { t } from "../../i18n";
import { getContentImages } from "../../utils/noteIcon.js";
import { Files, ImageIcon, Hash, Settings as SettingsIcon } from "lucide-react";

// Filter rail for the TV viewer. Real lucide icons, no emoji, no pin
// filter (the closed card no longer shows a pin so the standalone
// "Pinned" entry was orphaned). Sidebar is collapsible from the
// hamburger button in the header — when hidden it slides out and the
// notes grid takes the whole width.

export default function TvSidebar({
  notes,
  filter,
  onSelectFilter,
  onExit,
}) {
  const grouped = useMemo(() => {
    const tagCounts = new Map();
    let withImages = 0;
    for (const n of notes) {
      if (n?.archived || n?.trashed) continue;
      const imgs = getContentImages(n.images);
      if (imgs.length > 0) withImages += 1;
      const tags = Array.isArray(n.tags) ? n.tags : [];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    const tags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { withImages, tags };
  }, [notes]);

  const totalActive = notes.filter((n) => !n?.archived && !n?.trashed).length;

  const isActive = (type, value) => {
    if (!filter) return type === "all";
    if (filter.type !== type) return false;
    if (type === "tag") return filter.value === value;
    return true;
  };

  return (
    <aside className="tv-sidebar" aria-label={t("filters") || "Filters"}>
      <div className="tv-sidebar__group-label">{t("allNotes") || "All notes"}</div>
      <button
        type="button"
        className="tv-sidebar__item tv-focusable tv-focusable--flat"
        data-active={isActive("all") ? "true" : "false"}
        onClick={() => onSelectFilter({ type: "all" })}
      >
        <span className="tv-sidebar__item-icon"><Files size={16} /></span>
        <span className="tv-sidebar__item-label">{t("allNotes") || "All notes"}</span>
        <span className="tv-sidebar__item-count">{totalActive}</span>
      </button>
      {grouped.withImages > 0 && (
        <button
          type="button"
          className="tv-sidebar__item tv-focusable tv-focusable--flat"
          data-active={isActive("images") ? "true" : "false"}
          onClick={() => onSelectFilter({ type: "images" })}
        >
          <span className="tv-sidebar__item-icon"><ImageIcon size={16} /></span>
          <span className="tv-sidebar__item-label">{t("image") || "Images"}</span>
          <span className="tv-sidebar__item-count">{grouped.withImages}</span>
        </button>
      )}

      {grouped.tags.length > 0 && (
        <>
          <div className="tv-sidebar__group-label">{t("tagsLabel") || "Tags"}</div>
          {grouped.tags.map(([tag, count]) => (
            <button
              key={tag}
              type="button"
              className="tv-sidebar__item tv-focusable tv-focusable--flat"
              data-active={isActive("tag", tag) ? "true" : "false"}
              onClick={() => onSelectFilter({ type: "tag", value: tag })}
            >
              <span className="tv-sidebar__item-icon"><Hash size={16} /></span>
              <span className="tv-sidebar__item-label">{tag}</span>
              <span className="tv-sidebar__item-count">{count}</span>
            </button>
          ))}
        </>
      )}

      {/* Sign-out moved to the header avatar popover. Sidebar keeps
          only the layout-related exit (used in browser preview) — and
          even that is hidden in the TV WebView so the rail stays
          focused on filters. */}
      {typeof onExit === "function" && (
        <>
          <div className="tv-sidebar__group-label">{t("settings") || "Settings"}</div>
          <button
            type="button"
            className="tv-sidebar__item tv-focusable tv-focusable--flat"
            onClick={onExit}
          >
            <span className="tv-sidebar__item-icon"><SettingsIcon size={16} /></span>
            <span className="tv-sidebar__item-label">{t("tvExitButton") || "Phone layout"}</span>
          </button>
        </>
      )}
    </aside>
  );
}
