import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import TvNoteCard from "./TvNoteCard.jsx";

export const PAGER_PAGE_SIZE = 2;

// Two-cards-at-a-time pager.
// Arrows are PURELY DECORATIVE (no click target, no focus): the user
// pages by pressing Right at the last card of the current page or Left
// at the first one. The intercept handler lives in TvNotesViewer
// because the page state is lifted up (so the header can show the
// indicator).
export default function TvPager({ slice, hasPrev, hasNext, onActivate }) {
  return (
    <div className="tv-pager">
      <div className="tv-pager__arrow tv-pager__arrow--decorative" aria-hidden="true">
        {hasPrev && <ChevronLeft size={36} />}
      </div>
      <div className="tv-pager__page">
        {slice.map((n) => (
          <TvNoteCard key={n.id} note={n} variant="carousel" onActivate={onActivate} />
        ))}
        {/* Fill any empty slot on the last page so the grid stays 2-column. */}
        {slice.length < PAGER_PAGE_SIZE && Array.from({ length: PAGER_PAGE_SIZE - slice.length }).map((_, i) => (
          <div key={`pad-${i}`} aria-hidden="true" />
        ))}
      </div>
      <div className="tv-pager__arrow tv-pager__arrow--decorative" aria-hidden="true">
        {hasNext && <ChevronRight size={36} />}
      </div>
    </div>
  );
}
