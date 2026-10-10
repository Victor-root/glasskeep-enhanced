import React from "react";

// Six-dot grip drawn inside the drag handles of checklist items and sections.
export default function GripDots() {
  return (
    <div className="grid grid-cols-2 gap-0.5">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full" />
      ))}
    </div>
  );
}
