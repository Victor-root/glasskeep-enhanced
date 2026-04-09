import React, { useRef, useEffect } from "react";
import { renderPaths } from "../../DrawingCanvas";

/** ---------- Drawing Preview (HiDPI-aware) ---------- */
export default function DrawingPreview({ data, width, height, darkMode = false }) {
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

    // Filter to first page
    paths = paths.filter((path) => {
      if (!path.points || path.points.length === 0) return false;
      return path.points.some((point) => point.y < firstPageHeight);
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

    // Scale to fit preview
    const scaleX = width / originalWidth;
    const scaleY = height / firstPageHeight;
    const scale = Math.min(scaleX, scaleY);

    const previewWidth = width;
    const previewHeight = firstPageHeight * scale;

    // HiDPI: physical pixels for sharp rendering
    canvas.width = previewWidth * dpr;
    canvas.height = previewHeight * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, previewWidth, previewHeight);

    if (paths.length === 0) {
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(10, 10, previewWidth - 20, previewHeight - 20);

      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Empty", previewWidth / 2, previewHeight / 2 + 3);
      return;
    }

    // Use shared smooth renderer
    renderPaths(ctx, paths, scale);
  }, [data, width, height, darkMode]);

  return (
    <div className="w-[90%] mx-auto rounded overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: "100%", height: "auto" }}
      />
    </div>
  );
}
