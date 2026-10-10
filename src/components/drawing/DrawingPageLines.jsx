import React from 'react';

/* Dashed page boundaries of the drawing canvas, one per page height
   (originalHeight, logical units) converted to CSS pixels. Rendered behind
   the canvas so strokes paint on top. */
export default function DrawingPageLines({ displaySize, canvasWidth, canvasHeight, originalHeight, darkMode }) {
  const scale = displaySize.width / canvasWidth;
  const isMobile = displaySize.width < 768;
  const lines = [];
  for (let y = originalHeight; y <= canvasHeight; y += originalHeight) {
    lines.push(
      <div
        key={y}
        className="absolute left-0 right-0 pointer-events-none z-0"
        style={{
          top: `${y * scale}px`,
          borderTop: `1px dashed ${darkMode
            ? (isMobile ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.18)')
            : (isMobile ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.15)')}`,
        }}
      />
    );
  }
  return lines;
}
