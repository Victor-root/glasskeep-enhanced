import React, { useRef, useEffect } from "react";
import { renderPaths } from "../../DrawingCanvas";

/** ---------- Drawing Preview (HiDPI-aware) ---------- */
export default function DrawingPreview({ data, width, height, darkMode = false, maxPages = 1 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    // Parse drawing data
    let paths = [];
    let originalWidth = 800;
    let originalHeight = 600;
    let firstPageHeight = 600;
    try {
      let parsedData;
      if (typeof data === "string") {
        parsedData = JSON.parse(data) || [];
      } else {
        parsedData = data;
      }

      if (Array.isArray(parsedData)) {
        paths = parsedData;
      } else if (
        parsedData &&
        typeof parsedData === "object" &&
        Array.isArray(parsedData.paths)
      ) {
        paths = parsedData.paths;
        if (
          parsedData.dimensions &&
          parsedData.dimensions.width &&
          parsedData.dimensions.height
        ) {
          originalWidth = parsedData.dimensions.width;
          originalHeight = parsedData.dimensions.height;
          if (parsedData.dimensions.originalHeight) {
            firstPageHeight = parsedData.dimensions.originalHeight;
          } else if (originalHeight > 1000) {
            firstPageHeight = originalHeight / 2;
          } else {
            firstPageHeight = originalHeight;
          }
        }
      } else {
        paths = [];
      }
    } catch (e) {
      return;
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
      } else {
        if (path.color === "#FFFFFF") return { ...path, color: "#000000" };
      }
      return path;
    });

    if (paths.length === 0) {
      const emptyW = width;
      const emptyH = Math.round(width * 0.4);
      canvas.width = emptyW * dpr;
      canvas.height = emptyH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, emptyW, emptyH);
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(10, 10, emptyW - 20, emptyH - 20);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Empty", emptyW / 2, emptyH / 2 + 3);
      return;
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

    const contentW = maxX - minX;
    const contentH = maxY - minY;

    // Scale to fit preview area while keeping aspect ratio
    const scale = Math.min(width / contentW, height / contentH);
    const previewWidth = contentW * scale;
    const previewHeight = contentH * scale;

    // HiDPI: physical pixels for sharp rendering
    canvas.width = previewWidth * dpr;
    canvas.height = previewHeight * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, previewWidth, previewHeight);

    // Translate so content starts at (0,0) then scale
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-minX, -minY);
    renderPaths(ctx, paths, 1);
    ctx.restore();
  }, [data, width, height, darkMode]);

  return (
    <div className="w-[90%] mx-auto rounded">
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: "100%", height: "auto" }}
      />
    </div>
  );
}
