import React, { useEffect, useMemo, useRef, useState } from "react";
import { renderPaths } from "../../utils/drawingRender";
import { t } from "../../i18n";

// Parses the drawing and fits it into the preview box. Returns null when the
// data can't be parsed, otherwise the logical preview size plus what the
// renderer needs (an empty drawing gets a placeholder box).
function layoutDrawing(data, width, height, darkMode, maxPages) {
  let paths = [];
  let firstPageHeight = 600;
  try {
    const parsedData = typeof data === "string" ? JSON.parse(data) || [] : data;
    if (Array.isArray(parsedData)) {
      paths = parsedData;
    } else if (parsedData && typeof parsedData === "object" && Array.isArray(parsedData.paths)) {
      paths = parsedData.paths;
      const dims = parsedData.dimensions;
      if (dims && dims.width && dims.height) {
        if (dims.originalHeight) firstPageHeight = dims.originalHeight;
        else if (dims.height > 1000) firstPageHeight = dims.height / 2;
        else firstPageHeight = dims.height;
      }
    }
  } catch {
    return null;
  }

  // Filter to visible pages
  const maxVisibleY = firstPageHeight * maxPages;
  paths = paths.filter((path) => {
    if (!path.points || path.points.length === 0) return false;
    return path.points.some((point) => point.y < maxVisibleY);
  });

  // Theme-convert black/white strokes
  paths = paths.map((path) => {
    if (darkMode) {
      if (path.color === "#000000") return { ...path, color: "#FFFFFF" };
    } else if (path.color === "#FFFFFF") {
      return { ...path, color: "#000000" };
    }
    return path;
  });

  if (paths.length === 0) {
    return { empty: true, w: width, h: Math.round(width * 0.4) };
  }

  // Calculate actual bounding box of all path content
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const path of paths) {
    const sw = (path.size || 2) / 2;
    for (const pt of path.points) {
      if (pt.x - sw < minX) minX = pt.x - sw;
      if (pt.y - sw < minY) minY = pt.y - sw;
      if (pt.x + sw > maxX) maxX = pt.x + sw;
      if (pt.y + sw > maxY) maxY = pt.y + sw;
    }
  }

  // Add padding
  const pad = 10;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX += pad;
  maxY += pad;

  // Scale to fit preview area while keeping aspect ratio
  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const scale = Math.min(width / contentW, height / contentH);
  return { empty: false, w: contentW * scale, h: contentH * scale, paths, minX, minY, scale };
}

function drawPreview(ctx, layout) {
  const { w, h } = layout;
  if (layout.empty) {
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t("drawingPreviewEmpty"), w / 2, h / 2 + 3);
    return;
  }
  // Translate so content starts at (0,0) then scale
  ctx.scale(layout.scale, layout.scale);
  ctx.translate(-layout.minX, -layout.minY);
  renderPaths(ctx, layout.paths, 1);
}

/** ---------- Drawing Preview (HiDPI-aware) ----------
 * Rendered once into an off-screen canvas and shown as a plain image. A live
 * <canvas> in the page is a GPU layer of its own: a grid with a few drawing
 * notes ended up with dozens of extra layers to move on every scrolled frame,
 * which weak integrated GPUs felt. An image is painted with the card instead.
 * It is drawn at the size it is displayed (re-drawn only if its box grows),
 * not at the drawing's own size, which was mostly downscaled away.
 */
export default function DrawingPreview({ data, width, height, darkMode = false, maxPages = 1 }) {
  const layout = useMemo(
    () => layoutDrawing(data, width, height, darkMode, maxPages),
    [data, width, height, darkMode, maxPages]
  );
  const boxRef = useRef(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [src, setSrc] = useState(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.ceil(entry.contentRect.width);
      setBoxWidth((prev) => (w > prev ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!layout || !boxWidth) return;
    const dpr = window.devicePixelRatio || 1;
    const k = boxWidth / layout.w;
    const canvas = document.createElement("canvas");
    // HiDPI: physical pixels for sharp rendering
    canvas.width = Math.round(boxWidth * dpr);
    canvas.height = Math.round(layout.h * k * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    drawPreview(ctx, layout);
    let cancelled = false;
    canvas.toBlob((blob) => {
      if (!cancelled && blob) setSrc(URL.createObjectURL(blob));
    });
    return () => { cancelled = true; };
  }, [layout, boxWidth]);

  // Release the previous image once its replacement is shown (and on unmount).
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  return (
    <div ref={boxRef} className="w-[90%] mx-auto rounded">
      {layout && (
        <img
          src={src || undefined}
          alt=""
          className="block"
          style={{ width: "100%", height: "auto", aspectRatio: `${layout.w} / ${layout.h}` }}
          draggable={false}
          decoding="async"
        />
      )}
    </div>
  );
}
