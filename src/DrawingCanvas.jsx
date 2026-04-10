import { t } from "./i18n";
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useDrawingHistory from './hooks/useDrawingHistory';
import DrawingToolbar from './components/drawing/DrawingToolbar';

/* ─── Smooth path rendering (quadratic Bezier interpolation) ─── */
function drawSmoothPath(ctx, points) {
  if (points.length < 2) {
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      if (i === points.length - 2) {
        ctx.lineTo(p1.x, p1.y);
      } else {
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }
    }
  }

  ctx.stroke();
}

/* ─── Hit-test: is a point within radius of any point on a path? ─── */
function isPointNearPath(px, py, path, radius) {
  if (!path.points || path.points.length === 0) return false;
  const r2 = radius * radius;
  for (let i = 0; i < path.points.length; i++) {
    const dx = px - path.points[i].x;
    const dy = py - path.points[i].y;
    if (dx * dx + dy * dy <= r2) return true;
    // Also check segments between points for better hit detection
    if (i > 0) {
      const p0 = path.points[i - 1];
      const p1 = path.points[i];
      const len2 = (p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2;
      if (len2 > 0) {
        let t = ((px - p0.x) * (p1.x - p0.x) + (py - p0.y) * (p1.y - p0.y)) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = p0.x + t * (p1.x - p0.x);
        const cy = p0.y + t * (p1.y - p0.y);
        const d2 = (px - cx) ** 2 + (py - cy) ** 2;
        if (d2 <= r2) return true;
      }
    }
  }
  return false;
}

/* ─── Render all paths on a canvas context (shared by DrawingCanvas + DrawingPreview) ─── */
export function renderPaths(ctx, paths, scale = 1) {
  paths.forEach(path => {
    if (!path.points || path.points.length === 0) return;
    // Skip legacy eraser strokes (stroke-based eraser doesn't render anything)
    if (path.tool === 'eraser') return;

    ctx.strokeStyle = path.color;
    ctx.fillStyle = path.color;
    ctx.lineWidth = Math.max(1, path.size * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';

    const scaledPoints = scale !== 1
      ? path.points.map(p => ({ x: p.x * scale, y: p.y * scale }))
      : path.points;

    drawSmoothPath(ctx, scaledPoints);
  });
}

/* ─── Theme stroke conversion (black ↔ white) ─── */
function convertThemeStrokes(pathsData, darkMode) {
  return pathsData.map(path => {
    if (darkMode && path.color === '#000000') return { ...path, color: '#FFFFFF' };
    if (!darkMode && path.color === '#FFFFFF') return { ...path, color: '#000000' };
    return path;
  });
}

/* ─── Main Component ─── */
function DrawingCanvas({
  data,
  onChange,
  width = 800,
  height = 600,
  readOnly = false,
  darkMode = false,
  hideModeToggle = false,
  initialMode = null,
  externalMode,
  onModeChange,
  fillContainer = false,
  toolbarPortalTarget = null,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  const isScrollingRef = useRef(false);
  const isDrawingRef = useRef(false);
  const pendingTouchRef = useRef(null);
  const scrollStateRef = useRef({ lastY: 0, velocity: 0, momentumId: null });
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(darkMode ? '#FFFFFF' : '#000000');
  const [size, setSize] = useState(5);
  const [currentPath, setCurrentPath] = useState(null);

  // Cursor state (desktop only)
  const [cursorPos, setCursorPos] = useState(null);
  const [showCursor, setShowCursor] = useState(false);

  // Mode management
  const getInitialMode = () => {
    if (initialMode !== null) return initialMode;
    if (readOnly) return 'view';
    if (hideModeToggle) return 'draw';
    return 'view';
  };
  const [internalMode, setInternalMode] = useState(getInitialMode());
  const mode = externalMode !== undefined ? externalMode : internalMode;
  const setMode = onModeChange || setInternalMode;

  // Canvas dimensions (logical coordinate space for paths)
  const [canvasWidth, setCanvasWidth] = useState(width);
  const [canvasHeight, setCanvasHeight] = useState(height);

  // Actual display size in CSS pixels (for sharp HiDPI rendering in fillContainer mode)
  const [displaySize, setDisplaySize] = useState(null);

  // Undo/Redo via hook
  const {
    paths,
    setPaths,
    pushPaths,
    undo: historyUndo,
    redo: historyRedo,
    canUndo,
    canRedo,
    resetHistory,
  } = useDrawingHistory([]);

  // Flag to distinguish our own onChange calls from external data changes.
  // Kept active for 2s via timer to survive autosave echo round-trips.
  const isInternalChange = useRef(false);
  const internalChangeTimer = useRef(null);

  // ─── Load data from props ───
  useEffect(() => {
    let pathsData = [];
    let dimensions = null;

    if (data) {
      if (Array.isArray(data)) {
        pathsData = data;
      } else if (data.paths && Array.isArray(data.paths)) {
        pathsData = data.paths;
        if (data.dimensions) dimensions = data.dimensions;
      }
    }

    if (dimensions && dimensions.width && dimensions.height) {
      setCanvasWidth(dimensions.width);
      setCanvasHeight(dimensions.height);
    } else if (!fillContainer) {
      // In fillContainer mode without stored dimensions, ResizeObserver handles sizing
      setCanvasWidth(width);
      setCanvasHeight(height);
    }

    const converted = convertThemeStrokes(pathsData, darkMode);

    if (isInternalChange.current) {
      // Data came back from our own onChange (or autosave echo) — don't touch history
      setPaths(converted);
    } else {
      // External data change (opened different drawing, remote sync, etc.) — full reset
      resetHistory(converted);
    }
  }, [data, darkMode]);

  // Default color on theme change
  useEffect(() => {
    setColor(darkMode ? '#FFFFFF' : '#000000');
  }, [darkMode]);

  // ─── Notify parent (marks as internal so data-loading effect won't reset) ───
  const notifyChange = useCallback((newPaths) => {
    if (!onChange) return;
    // Keep flag active for 2s to survive autosave debounce + network echo
    isInternalChange.current = true;
    clearTimeout(internalChangeTimer.current);
    internalChangeTimer.current = setTimeout(() => {
      isInternalChange.current = false;
    }, 2000);
    let originalHeight = height;
    if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
      originalHeight = data.dimensions.originalHeight || height;
    }
    onChange({
      paths: newPaths,
      dimensions: { width: canvasWidth, height: canvasHeight, originalHeight },
    });
  }, [onChange, canvasWidth, canvasHeight, data, height]);

  // ─── Undo / Redo — explicit notify ───
  const handleUndo = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    const result = historyUndo();
    if (result !== null) notifyChange(result);
  }, [readOnly, mode, historyUndo, notifyChange]);

  const handleRedo = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    const result = historyRedo();
    if (result !== null) notifyChange(result);
  }, [readOnly, mode, historyRedo, notifyChange]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    if (readOnly || mode !== 'draw') return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        const result = historyRedo();
        if (result !== null) notifyChange(result);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        const result = historyUndo();
        if (result !== null) notifyChange(result);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [readOnly, mode, historyUndo, historyRedo, notifyChange]);

  // ─── Update canvas size from props (only if data has no dimensions and no fillContainer) ───
  useEffect(() => {
    if (fillContainer) return; // ResizeObserver handles sizing in fillContainer mode
    if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) return;
    setCanvasWidth(width);
    setCanvasHeight(height);
  }, [width, height, data, fillContainer]);

  // ─── Auto-size canvas to fill container (fillContainer mode) ───
  // Always tracks display size for sharp HiDPI rendering.
  // For new drawings (no stored dimensions), also sets logical canvas size.
  useEffect(() => {
    if (!fillContainer) return;
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    const hasStoredDimensions = data && typeof data === 'object' && !Array.isArray(data) && data.dimensions;

    const updateSize = () => {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        // Always update display size for sharp rendering
        setDisplaySize({ width: w, height: h });
        // Only update logical dimensions for new drawings
        if (!hasStoredDimensions) {
          setCanvasWidth(w);
          setCanvasHeight(h);
        }
      }
    };

    // Wait one frame for layout to settle
    const raf = requestAnimationFrame(updateSize);
    const ro = new ResizeObserver(updateSize);
    ro.observe(wrapper);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [fillContainer, data]);

  // ─── Canvas rendering (HiDPI-aware) ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dpr = window.devicePixelRatio || 1;

    // In fillContainer mode, use actual display width for sharp rendering.
    // For height: if canvas is taller than display (multi-page), scale proportionally
    // from width so the canvas scrolls instead of squishing.
    const useDisplay = fillContainer && displaySize && displaySize.width > 0;
    let physW = useDisplay ? displaySize.width : canvasWidth;
    const scaleFromWidth = useDisplay ? displaySize.width / canvasWidth : 1;
    let physH = useDisplay ? canvasHeight * scaleFromWidth : canvasHeight;

    // Cap physical canvas size to stay within mobile browser limits (~16M pixels).
    // Exceeding the limit causes silent canvas failure (blank rendering).
    const MAX_PIXELS = 12_000_000;
    let totalPixels = Math.round(physW * dpr) * Math.round(physH * dpr);
    if (totalPixels > MAX_PIXELS) {
      const scale = Math.sqrt(MAX_PIXELS / totalPixels);
      dpr = Math.max(1, dpr * scale);
    }

    // Physical pixel buffer matches the display area × devicePixelRatio
    canvas.width = Math.round(physW * dpr);
    canvas.height = Math.round(physH * dpr);

    const ctx = canvas.getContext('2d');
    // Transform maps logical coordinates → physical pixels
    const sx = (physW / canvasWidth) * dpr;
    const sy = (physH / canvasHeight) * dpr;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    renderPaths(ctx, paths);

    if (currentPath && currentPath.points && currentPath.points.length > 0 && currentPath.tool !== 'eraser') {
      ctx.strokeStyle = currentPath.color;
      ctx.fillStyle = currentPath.color;
      ctx.lineWidth = currentPath.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      drawSmoothPath(ctx, currentPath.points);
    }

    // Draw page boundary lines (draw mode only, multi-page)
    if (mode === 'draw') {
      const firstPageH = (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions)
        ? (data.dimensions.originalHeight || height)
        : height;
      if (canvasHeight > firstPageH && firstPageH > 0) {
        ctx.save();
        ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 6]);
        for (let y = firstPageH; y < canvasHeight; y += firstPageH) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvasWidth, y);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }, [paths, currentPath, canvasWidth, canvasHeight, fillContainer, displaySize, mode, data, height, darkMode]);

  // ─── Coordinate helper (maps CSS pixels → logical canvas coordinates) ───
  const getCanvasCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Use logical dimensions (not canvas.width which is physical = logical * dpr)
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, [canvasWidth, canvasHeight]);

  // ─── Drawing handlers ───
  // Refs to track stroke-based eraser state across a single gesture
  const eraserStartPaths = useRef(null);
  const eraserResultPaths = useRef(null);
  const eraserDidErase = useRef(false);

  const startDrawing = useCallback((e) => {
    if (readOnly || mode !== 'draw') return;
    const point = getCanvasCoordinates(e);
    if (tool === 'eraser') {
      // Stroke-based eraser: save initial state for undo
      eraserStartPaths.current = paths;
      eraserResultPaths.current = paths;
      eraserDidErase.current = false;
      const eraserRadius = Math.max(size, 8);
      const hitIdx = paths.findIndex(p => p.tool !== 'eraser' && isPointNearPath(point.x, point.y, p, eraserRadius));
      if (hitIdx !== -1) {
        const filtered = paths.filter((_, i) => i !== hitIdx);
        setPaths(filtered);
        eraserResultPaths.current = filtered;
        eraserDidErase.current = true;
      }
    } else {
      setCurrentPath({
        tool,
        color,
        size,
        points: [point],
      });
    }
    setIsDrawing(true);
  }, [readOnly, mode, tool, color, size, getCanvasCoordinates, paths, setPaths]);

  const lastDrawTime = useRef(0);
  const draw = useCallback((e) => {
    if (!isDrawing || readOnly || mode !== 'draw') return;
    const now = Date.now();
    if (now - lastDrawTime.current < 16) return;
    lastDrawTime.current = now;
    const point = getCanvasCoordinates(e);
    if (tool === 'eraser') {
      const eraserRadius = Math.max(size, 8);
      const current = eraserResultPaths.current;
      const hitIdx = current.findIndex(p => p.tool !== 'eraser' && isPointNearPath(point.x, point.y, p, eraserRadius));
      if (hitIdx !== -1) {
        const filtered = current.filter((_, i) => i !== hitIdx);
        setPaths(filtered);
        eraserResultPaths.current = filtered;
        eraserDidErase.current = true;
      }
    } else {
      setCurrentPath(prev => ({
        ...prev,
        points: [...prev.points, point],
      }));
    }
  }, [isDrawing, readOnly, mode, tool, size, getCanvasCoordinates, setPaths]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing || readOnly || mode !== 'draw') return;
    if (tool === 'eraser') {
      if (eraserDidErase.current && eraserStartPaths.current) {
        const result = eraserResultPaths.current;
        // Restore to before-state so pushPaths records it in undo stack
        setPaths(eraserStartPaths.current);
        // Now push the erased result (records before in undo, sets to result)
        pushPaths(result);
        notifyChange(result);
      }
      eraserStartPaths.current = null;
      eraserResultPaths.current = null;
      eraserDidErase.current = false;
    } else {
      if (currentPath && currentPath.points.length > 0) {
        const newPaths = [...paths, currentPath];
        pushPaths(newPaths);
        notifyChange(newPaths);
      }
      setCurrentPath(null);
    }
    setIsDrawing(false);
  }, [isDrawing, readOnly, mode, tool, currentPath, paths, pushPaths, notifyChange, setPaths]);

  // Keep isDrawingRef in sync for touch handlers (avoids re-registering listeners)
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

  // Cancel in-progress stroke without saving (used when switching to scroll mode)
  const cancelCurrentStroke = useCallback(() => {
    if (tool === 'eraser') {
      if (eraserStartPaths.current) setPaths(eraserStartPaths.current);
      eraserStartPaths.current = null;
      eraserResultPaths.current = null;
      eraserDidErase.current = false;
    } else {
      setCurrentPath(null);
    }
    setIsDrawing(false);
  }, [tool, setPaths]);

  // ─── Clear ───
  const clearCanvas = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    pushPaths([]);
    notifyChange([]);
  }, [readOnly, mode, pushPaths, notifyChange]);

  // ─── Add Page ───
  const addPage = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    const newHeight = canvasHeight * 2;
    setCanvasHeight(newHeight);
    if (onChange) {
      isInternalChange.current = true;
      clearTimeout(internalChangeTimer.current);
      internalChangeTimer.current = setTimeout(() => { isInternalChange.current = false; }, 2000);
      let originalHeight = height;
      if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
        originalHeight = data.dimensions.originalHeight || height;
      }
      onChange({
        paths,
        dimensions: { width: canvasWidth, height: newHeight, originalHeight },
      });
    }
  }, [readOnly, mode, paths, canvasWidth, canvasHeight, onChange, data, height]);

  // ─── Remove Last Page ───
  const originalHeight = React.useMemo(() => {
    if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
      return data.dimensions.originalHeight || height;
    }
    return height;
  }, [data, height]);

  const canRemovePage = canvasHeight > originalHeight;

  const removePage = useCallback(() => {
    if (readOnly || mode !== 'draw' || !canRemovePage) return;
    const newHeight = canvasHeight / 2;
    // Remove paths whose points are entirely below the new boundary
    const filteredPaths = paths.filter(p =>
      p.points && p.points.some(pt => pt.y <= newHeight)
    );
    setCanvasHeight(newHeight);
    pushPaths(filteredPaths);
    if (onChange) {
      isInternalChange.current = true;
      clearTimeout(internalChangeTimer.current);
      internalChangeTimer.current = setTimeout(() => { isInternalChange.current = false; }, 2000);
      onChange({
        paths: filteredPaths,
        dimensions: { width: canvasWidth, height: newHeight, originalHeight },
      });
    }
  }, [readOnly, mode, canRemovePage, canvasHeight, paths, canvasWidth, originalHeight, pushPaths, onChange]);

  // ─── Touch events (passive: false for preventDefault) ───
  // 1 finger = draw, 2 fingers = programmatic scroll with momentum
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ss = scrollStateRef; // ref persists across effect re-runs

    const avgY = (touches) => {
      let s = 0;
      for (let i = 0; i < touches.length; i++) s += touches[i].clientY;
      return s / touches.length;
    };

    const stopMomentum = () => {
      if (ss.current.momentumId) {
        cancelAnimationFrame(ss.current.momentumId);
        ss.current.momentumId = null;
      }
    };

    const startMomentum = () => {
      const wrapper = canvasWrapperRef.current;
      if (!wrapper || Math.abs(ss.current.velocity) < 0.5) return;
      const step = () => {
        ss.current.velocity *= 0.92;
        wrapper.scrollTop -= ss.current.velocity;
        if (Math.abs(ss.current.velocity) > 0.5) {
          ss.current.momentumId = requestAnimationFrame(step);
        } else {
          ss.current.momentumId = null;
        }
      };
      ss.current.momentumId = requestAnimationFrame(step);
    };

    const handleTouchStart = (e) => {
      if (mode !== 'draw' || readOnly) return;
      e.preventDefault();
      stopMomentum();

      if (e.touches.length >= 2) {
        pendingTouchRef.current = null;
        if (isDrawingRef.current) cancelCurrentStroke();
        isScrollingRef.current = true;
        ss.current.lastY = avgY(e.touches);
        ss.current.velocity = 0;
        return;
      }

      if (!isScrollingRef.current) {
        const t = e.touches[0];
        pendingTouchRef.current = { clientX: t.clientX, clientY: t.clientY };
      }
    };

    const handleTouchMove = (e) => {
      if (mode !== 'draw' || readOnly) return;
      e.preventDefault();

      if (e.touches.length >= 2 || isScrollingRef.current) {
        pendingTouchRef.current = null;
        if (isDrawingRef.current) cancelCurrentStroke();
        isScrollingRef.current = true;
        const currentY = avgY(e.touches);
        const delta = currentY - ss.current.lastY;
        ss.current.velocity = delta;
        const wrapper = canvasWrapperRef.current;
        if (wrapper) wrapper.scrollTop -= delta;
        ss.current.lastY = currentY;
        return;
      }

      if (pendingTouchRef.current) {
        startDrawing(pendingTouchRef.current);
        pendingTouchRef.current = null;
      }
      draw(e);
    };

    const handleTouchEnd = (e) => {
      if (mode !== 'draw' || readOnly) return;
      e.preventDefault();

      if (e.touches.length === 0) {
        if (pendingTouchRef.current) {
          startDrawing(pendingTouchRef.current);
          pendingTouchRef.current = null;
        }
        if (isScrollingRef.current) {
          isScrollingRef.current = false;
          startMomentum();
          return;
        }
        stopDrawing();
      }
    };

    const handleTouchCancel = () => {
      pendingTouchRef.current = null;
      isScrollingRef.current = false;
      stopMomentum();
      if (isDrawingRef.current) cancelCurrentStroke();
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchCancel);
      stopMomentum();
    };
  }, [mode, readOnly, startDrawing, draw, stopDrawing, cancelCurrentStroke]);

  // ─── Desktop cursor tracking ───
  const handleMouseMove = useCallback((e) => {
    if (mode !== 'draw' || readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Map logical brush size to CSS pixels
    const cssSize = size * (rect.width / canvasWidth);
    // Ensure cursor is visible (covers case where mouse is already over canvas on mount)
    if (!showCursor) setShowCursor(true);
    setCursorPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      clientX: e.clientX,
      clientY: e.clientY,
      cssSize,
    });
    draw(e);
  }, [mode, readOnly, size, canvasWidth, draw, showCursor]);

  const handleMouseEnter = useCallback(() => {
    if (mode === 'draw' && !readOnly) setShowCursor(true);
  }, [mode, readOnly]);

  const handleMouseLeave = useCallback(() => {
    setShowCursor(false);
    stopDrawing();
  }, [stopDrawing]);

  return (
    <div className={`drawing-canvas-container${fillContainer ? ' flex flex-col h-full' : ''}`} ref={containerRef}>
      {/* View/Draw Mode Toggle */}
      {!readOnly && !hideModeToggle && (
        <div className="flex items-center justify-between mb-3 shrink-0">
          <button
            onClick={() => setMode(mode === 'view' ? 'draw' : 'view')}
            className={`px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
              mode === 'draw'
                ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white border-transparent shadow-md shadow-indigo-300/40 dark:shadow-none hover:from-indigo-600 hover:to-violet-700'
                : 'border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-violet-50/60 text-indigo-600 hover:from-indigo-100 hover:to-violet-100 hover:border-indigo-300 hover:shadow-sm hover:shadow-indigo-200/50 dark:hover:shadow-none dark:from-indigo-900/20 dark:to-violet-900/10 dark:border-indigo-700/50 dark:text-indigo-400'
            }`}
            data-tooltip={mode === 'view' ? t('switchToDrawMode') : t('switchToViewMode')}
          >
            {mode === 'view' ? t('drawMode') : t('viewMode')}
          </button>
        </div>
      )}

      {/* Toolbar — portaled into header when toolbarPortalTarget is available */}
      {!readOnly && mode === 'draw' && (() => {
        const toolbar = (
          <DrawingToolbar
            tool={tool}
            setTool={setTool}
            color={color}
            setColor={setColor}
            size={size}
            setSize={setSize}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={clearCanvas}
            onAddPage={addPage}
            onRemovePage={removePage}
            canRemovePage={canRemovePage}
            canUndo={canUndo}
            canRedo={canRedo}
            pathCount={paths.length}
            darkMode={darkMode}
            compact={!!toolbarPortalTarget}
          />
        );
        return toolbarPortalTarget
          ? createPortal(toolbar, toolbarPortalTarget)
          : <div className="shrink-0">{toolbar}</div>;
      })()}

      {/* Canvas with cursor overlay */}
      <div
        ref={canvasWrapperRef}
        className={`relative${fillContainer ? ' flex-1 min-h-0 border-0 overflow-y-auto overflow-x-hidden' : ' overflow-hidden border border-gray-300 dark:border-gray-600 rounded-lg'}`}
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{
            width: '100%',
            height: 'auto',
            touchAction: mode === 'draw' && !readOnly ? 'none' : 'auto',
            cursor: mode === 'draw' && !readOnly ? 'none' : 'default',
          }}
          onMouseDown={startDrawing}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrawing}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />

        {/* Dynamic cursor (desktop) — fixed position so it renders above header */}
        {showCursor && cursorPos && mode === 'draw' && !readOnly && (
          tool === 'eraser' ? (
            /* Eraser: eraser icon cursor */
            <svg
              className="pointer-events-none fixed z-50"
              style={{
                left: cursorPos.clientX - 4,
                top: cursorPos.clientY - 22,
                filter: darkMode
                  ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                  : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
              }}
              width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              {/* Eraser body */}
              <path d="M6 19l-3.3-3.3a1.5 1.5 0 0 1 0-2.1L13.4 2.9a1.5 1.5 0 0 1 2.1 0l5.6 5.6a1.5 1.5 0 0 1 0 2.1L12 19H6z"
                fill={darkMode ? '#555' : '#e5e7eb'} stroke={darkMode ? '#fff' : '#374151'} strokeWidth="1.2" strokeLinejoin="round" />
              {/* Eraser tip (pink/red) */}
              <path d="M6 19l-3.3-3.3a1.5 1.5 0 0 1 0-2.1L8 8.3 15.7 16 12 19H6z"
                fill={darkMode ? '#f87171' : '#fca5a5'} stroke={darkMode ? '#fff' : '#374151'} strokeWidth="1.2" strokeLinejoin="round" />
              {/* Base line */}
              <line x1="5" y1="21" x2="21" y2="21" stroke={darkMode ? '#fff' : '#374151'} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            /* Pen: pencil icon cursor */
            <svg
              className="pointer-events-none fixed z-50"
              style={{
                left: cursorPos.clientX - 2,
                top: cursorPos.clientY - 24,
                filter: darkMode
                  ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                  : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
              }}
              width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3 21l1.5-4.5L17.1 3.9a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1L7.5 19.5 3 21z"
                fill={color} stroke={darkMode ? '#fff' : '#000'} strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M14.5 6.5l3 3" stroke={
                darkMode
                  ? (color === '#FFFFFF' || color === '#fff' || color === '#FFF' ? '#000' : '#fff')
                  : (color === '#000000' || color === '#000' ? '#fff' : '#000')
              } strokeWidth="1" strokeLinecap="round" />
            </svg>
          )
        )}
      </div>

      {/* Add Page Button (only shown outside fillContainer — in fillContainer it's in the toolbar) */}
      {!readOnly && mode === 'draw' && !fillContainer && (
        <div className="mt-3 flex justify-center shrink-0">
          <button
            data-tooltip={t('addPageTitle')}
            onClick={addPage}
            className="px-4 py-2 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient transition-all duration-200"
          >
            {t("addPage")}
          </button>
        </div>
      )}

      {/* Info (hidden in fillContainer draw mode to maximize canvas space) */}
      {!(fillContainer && mode === 'draw') && (
        <div className="text-xs text-gray-500 dark:text-gray-300 mt-2 shrink-0">
          {paths.length} {paths.length !== 1 ? t("strokeCountPlural") : t("strokeCount")}
        </div>
      )}
    </div>
  );
}

export default DrawingCanvas;
