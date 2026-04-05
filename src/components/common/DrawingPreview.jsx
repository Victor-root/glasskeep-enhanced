import React, { useRef, useEffect } from "react";

/** ---------- Drawing Preview ---------- */
export default function DrawingPreview({ data, width, height, darkMode = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Parse drawing data
    let paths = [];
    let originalWidth = 800; // Default canvas width
    let originalHeight = 600; // Default canvas height
    let firstPageHeight = 600; // Height of first page for filtering
    try {
      let parsedData;
      if (typeof data === "string") {
        parsedData = JSON.parse(data) || [];
      } else {
        parsedData = data;
      }

      // Handle both old format (array) and new format (object with paths and dimensions)
      if (Array.isArray(parsedData)) {
        // Old format: just an array of paths
        paths = parsedData;
      } else if (
        parsedData &&
        typeof parsedData === "object" &&
        Array.isArray(parsedData.paths)
      ) {
        // New format: object with paths and dimensions
        paths = parsedData.paths;
        if (
          parsedData.dimensions &&
          parsedData.dimensions.width &&
          parsedData.dimensions.height
        ) {
          originalWidth = parsedData.dimensions.width;
          originalHeight = parsedData.dimensions.height;
          // First page height: use originalHeight if stored, otherwise estimate
          // If originalHeight is stored, use it; otherwise, if height > 1000, assume it was doubled
          if (parsedData.dimensions.originalHeight) {
            firstPageHeight = parsedData.dimensions.originalHeight;
          } else if (originalHeight > 1000) {
            // Likely doubled, estimate first page as half (common sizes: 450->900, 850->1700)
            firstPageHeight = originalHeight / 2;
          } else {
            // No pages added yet, use current height
            firstPageHeight = originalHeight;
          }
        }
      } else {
        paths = [];
      }
    } catch (e) {
      // Invalid data, show empty preview
      return;
    }

    // Filter paths to only show those in the first page (y coordinate < firstPageHeight)
    // For preview, we only want to show the first page
    paths = paths.filter((path) => {
      if (!path.points || path.points.length === 0) return false;
      // Check if any point in the path is within the first page
      return path.points.some((point) => point.y < firstPageHeight);
    });

    // Convert black/white strokes based on current theme for optimal contrast
    paths = paths.map((path) => {
      // Only convert black/white strokes for better contrast, keep other colors as-is
      if (darkMode) {
        // In dark mode, ensure black strokes are white for visibility
        if (path.color === "#000000") {
          return { ...path, color: "#FFFFFF" };
        }
      } else {
        // In light mode, ensure white strokes are black for visibility
        if (path.color === "#FFFFFF") {
          return { ...path, color: "#000000" };
        }
      }
      return path;
    });

    // Scale factor to fit drawing in preview - use firstPageHeight to avoid blank space
    const scaleX = width / originalWidth;
    const scaleY = height / firstPageHeight;
    const scale = Math.min(scaleX, scaleY);

    // Calculate preview dimensions (only first page, no blank space)
    const previewWidth = width;
    const previewHeight = firstPageHeight * scale;

    // Set canvas dimensions to match preview size (no blank space below)
    canvas.width = previewWidth;
    canvas.height = previewHeight;

    // Clear canvas with calculated dimensions
    ctx.clearRect(0, 0, previewWidth, previewHeight);

    if (paths.length === 0) {
      // Draw a subtle placeholder
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

    // Draw paths at scaled size
    paths.forEach((path) => {
      if (path.points && path.points.length > 0) {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = Math.max(1, path.size * scale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (path.tool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
        } else {
          ctx.globalCompositeOperation = "source-over";
        }

        ctx.beginPath();
        ctx.moveTo(path.points[0].x * scale, path.points[0].y * scale);

        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x * scale, path.points[i].y * scale);
        }

        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    });
  }, [data, width, height, darkMode]);

  return (
    <div className="w-[90%] mx-auto rounded overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
        style={{ width: "100%", height: "auto" }}
      />
    </div>
  );
}
