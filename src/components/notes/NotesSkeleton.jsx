import React from "react";

// Card heights and line counts of the placeholders, varied like a real grid.
const CARDS = [[3, 92], [2, 64], [4, 80], [2, 52], [3, 72], [2, 88], [4, 60], [3, 76]];

// Placeholder cards while the first notes load, in the grid's columns. They
// only fade in when the load takes a while (CSS), so a quick one shows the
// cards straight away instead of a flash of placeholders.
export default function NotesSkeleton({ columns, gap }) {
  const stacks = Array.from({ length: columns }, () => []);
  CARDS.forEach((card, i) => stacks[i % columns].push(card));
  return (
    <div className="gk-notes-skeleton" style={{ gap }} aria-hidden="true">
      {stacks.map((stack, c) => (
        <div key={c} className="gk-notes-skeleton__column" style={{ gap }}>
          {stack.map(([lines, width], i) => (
            <div key={i} className="gk-notes-skeleton__card glass-card">
              <div className="gk-notes-skeleton__line gk-notes-skeleton__line--title" />
              {Array.from({ length: lines }, (_, l) => (
                <div key={l} className="gk-notes-skeleton__line" style={{ width: `${l === lines - 1 ? width : 100}%` }} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
