import { t } from "../../i18n";
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useDrawingHistory from '../../hooks/useDrawingHistory';
import useTouchDrawGestures from '../../hooks/useTouchDrawGestures';
import DrawingToolbar from './DrawingToolbar';
import DrawingCursor from './DrawingCursor';
import DrawingPageLines from './DrawingPageLines';
import { convertThemeStrokes, drawSmoothPath, renderPaths } from '../../utils/drawingRender';

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

/* ─── Size stored with the drawing ({ width, height, originalHeight }), if any ─── */
function storedDimensions(data) {
  return (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) || null;
}

/* ─── Flags the next data props as the echo of our own onChange ─── */
// Kept active for 2s to survive autosave debounce + network echo.
function markInternalChange(flagRef, timerRef) {
  flagRef.current = true;
  clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => { flagRef.current = false; }, 2000);
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
  const isDrawingRef = useRef(false);
  const pathsRef = useRef([]);
  const currentPathRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(darkMode ? '#FFFFFF' : '#000000');
  const [size, setSize] = useState(5);
  const [showPageLines, setShowPageLines] = useState(true);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the stored drawing size into editable canvas state
      setCanvasWidth(dimensions.width);
      setCanvasHeight(dimensions.height);
    } else if (!fillContainer) {
      // In fillContainer mode without stored dimensions, ResizeObserver handles sizing
      setCanvasWidth(width);
      setCanvasHeight(height);
    }

    // Skip paths update for our own onChange echo — pushPaths already set the correct
    // state, and calling setPaths here creates a race condition on mobile where the
    // stale echo overwrites a newer stroke drawn between paint and effect execution.
    if (isInternalChange.current) return;

    // External data change (opened different drawing, remote sync, etc.) — full reset
    const converted = convertThemeStrokes(pathsData, darkMode);
    resetHistory(converted);
    pathsRef.current = converted;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the drawing data or theme changes; size props are handled by their own effect
  }, [data, darkMode]);

  // Default color + stroke conversion on theme change
  const prevDarkRef = useRef(darkMode);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the pen to the theme default colour whenever the theme changes
    setColor(darkMode ? '#FFFFFF' : '#000000');
    if (prevDarkRef.current !== darkMode) {
      prevDarkRef.current = darkMode;
      setPaths(prev => {
        const converted = convertThemeStrokes(prev, darkMode);
        pathsRef.current = converted;
        return converted;
      });
    }
  }, [darkMode, setPaths]);

  // ─── Notify parent (marks as internal so data-loading effect won't reset) ───
  const notifyChange = useCallback((newPaths) => {
    if (!onChange) return;
    markInternalChange(isInternalChange, internalChangeTimer);
    let originalHeight;
    const dims = storedDimensions(data);
    if (dims && dims.originalHeight) {
      originalHeight = dims.originalHeight;
    } else {
      // For new drawings in fillContainer mode, use actual canvas height (from viewport)
      // instead of the height prop, which is a default that doesn't match the viewport.
      originalHeight = fillContainer ? canvasHeight : height;
    }
    onChange({
      paths: newPaths,
      dimensions: { width: canvasWidth, height: canvasHeight, originalHeight },
    });
  }, [onChange, canvasWidth, canvasHeight, data, height, fillContainer]);

  // ─── Undo / Redo — explicit notify ───
  const handleUndo = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    const result = historyUndo();
    if (result !== null) {
      pathsRef.current = result;
      notifyChange(result);
    }
  }, [readOnly, mode, historyUndo, notifyChange]);

  const handleRedo = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    const result = historyRedo();
    if (result !== null) {
      pathsRef.current = result;
      notifyChange(result);
    }
  }, [readOnly, mode, historyRedo, notifyChange]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    if (readOnly || mode !== 'draw') return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [readOnly, mode, handleUndo, handleRedo]);

  // ─── Update canvas size from props (only if data has no dimensions and no fillContainer) ───
  useEffect(() => {
    if (fillContainer) return; // ResizeObserver handles sizing in fillContainer mode
    if (storedDimensions(data)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canvas size is editable state that follows the size props
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

    const hasStoredDimensions = storedDimensions(data);

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
  }, [paths, currentPath, canvasWidth, canvasHeight, fillContainer, displaySize, mode, darkMode]);

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
      const currentPaths = pathsRef.current;
      eraserStartPaths.current = currentPaths;
      eraserResultPaths.current = currentPaths;
      eraserDidErase.current = false;
      const eraserRadius = Math.max(size, 8);
      const hitIdx = currentPaths.findIndex(p => p.tool !== 'eraser' && isPointNearPath(point.x, point.y, p, eraserRadius));
      if (hitIdx !== -1) {
        const filtered = currentPaths.filter((_, i) => i !== hitIdx);
        setPaths(filtered);
        eraserResultPaths.current = filtered;
        eraserDidErase.current = true;
      }
    } else {
      const newPath = { tool, color, size, points: [point] };
      setCurrentPath(newPath);
      currentPathRef.current = newPath;
    }
    setIsDrawing(true);
    isDrawingRef.current = true;
  }, [readOnly, mode, tool, color, size, getCanvasCoordinates, setPaths]);

  const lastDrawTime = useRef(0);
  const draw = useCallback((e) => {
    if (!isDrawingRef.current || readOnly || mode !== 'draw') return;
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
      setCurrentPath(prev => {
        const updated = { ...prev, points: [...prev.points, point] };
        currentPathRef.current = updated;
        return updated;
      });
    }
  }, [readOnly, mode, tool, size, getCanvasCoordinates, setPaths]);

  const stopDrawing = useCallback(() => {
    if (!isDrawingRef.current || readOnly || mode !== 'draw') return;
    if (tool === 'eraser') {
      if (eraserDidErase.current && eraserStartPaths.current) {
        const result = eraserResultPaths.current;
        // Restore to before-state so pushPaths records it in undo stack
        setPaths(eraserStartPaths.current);
        // Now push the erased result (records before in undo, sets to result)
        pushPaths(result);
        pathsRef.current = result; // Sync ref immediately
        notifyChange(result);
      }
      eraserStartPaths.current = null;
      eraserResultPaths.current = null;
      eraserDidErase.current = false;
    } else {
      const cp = currentPathRef.current;
      if (cp && cp.points.length > 0) {
        const newPaths = [...pathsRef.current, cp];
        pushPaths(newPaths);
        pathsRef.current = newPaths; // Sync ref immediately — useEffect runs after paint
        notifyChange(newPaths);
      }
      setCurrentPath(null);
      currentPathRef.current = null;
    }
    setIsDrawing(false);
    isDrawingRef.current = false;
  }, [readOnly, mode, tool, pushPaths, notifyChange, setPaths]);

  // Keep refs in sync for touch handlers (avoids re-registering listeners on every frame)
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
  useEffect(() => { pathsRef.current = paths; }, [paths]);
  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);

  // Cancel in-progress stroke without saving (used when switching to scroll mode)
  const cancelCurrentStroke = useCallback(() => {
    if (tool === 'eraser') {
      if (eraserStartPaths.current) {
        setPaths(eraserStartPaths.current);
        pathsRef.current = eraserStartPaths.current;
      }
      eraserStartPaths.current = null;
      eraserResultPaths.current = null;
      eraserDidErase.current = false;
    } else {
      setCurrentPath(null);
      currentPathRef.current = null;
    }
    setIsDrawing(false);
    isDrawingRef.current = false;
  }, [tool, setPaths]);

  // ─── Clear ───
  const clearCanvas = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    pushPaths([]);
    pathsRef.current = [];
    notifyChange([]);
  }, [readOnly, mode, pushPaths, notifyChange]);

  // ─── Page height (one page = originalHeight from stored data, or viewport height) ───
  const originalHeight = React.useMemo(() => {
    const dims = storedDimensions(data);
    if (dims) return dims.originalHeight || height;
    return height;
  }, [data, height]);

  // ─── Add Page ───
  const addPage = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    const newHeight = canvasHeight + originalHeight;
    setCanvasHeight(newHeight);
    if (onChange) {
      markInternalChange(isInternalChange, internalChangeTimer);
      onChange({
        paths,
        dimensions: { width: canvasWidth, height: newHeight, originalHeight },
      });
    }
  }, [readOnly, mode, paths, canvasWidth, canvasHeight, originalHeight, onChange]);

  // ─── Remove Last Page ───
  const canRemovePage = canvasHeight > originalHeight;

  const removePage = useCallback(() => {
    if (readOnly || mode !== 'draw' || !canRemovePage) return;
    const newHeight = canvasHeight - originalHeight;
    // Remove paths whose points are entirely below the new boundary
    const filteredPaths = paths.filter(p =>
      p.points && p.points.some(pt => pt.y <= newHeight)
    );
    setCanvasHeight(newHeight);
    pushPaths(filteredPaths);
    if (onChange) {
      markInternalChange(isInternalChange, internalChangeTimer);
      onChange({
        paths: filteredPaths,
        dimensions: { width: canvasWidth, height: newHeight, originalHeight },
      });
    }
  }, [readOnly, mode, canRemovePage, canvasHeight, paths, canvasWidth, originalHeight, pushPaths, onChange]);

  // ─── Touch events (passive: false for preventDefault) ───
  // 1 finger = draw, 2 fingers = programmatic scroll with momentum
  useTouchDrawGestures({
    canvasRef,
    wrapperRef: canvasWrapperRef,
    isDrawingRef,
    mode,
    readOnly,
    startDrawing,
    draw,
    stopDrawing,
    cancelCurrentStroke,
  });

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
                ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white border-transparent hover:from-indigo-600 hover:to-violet-700 hover:shadow-lg hover:shadow-indigo-300/50'
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
            showPageLines={showPageLines}
            onTogglePageLines={() => setShowPageLines(v => !v)}
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
        {/* Page boundary lines (draw mode only) — behind canvas so strokes render on top */}
        {mode === 'draw' && !readOnly && showPageLines && displaySize && displaySize.width > 0 && originalHeight > 0 && (
          <DrawingPageLines
            displaySize={displaySize}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            originalHeight={originalHeight}
            darkMode={darkMode}
          />
        )}

        <canvas
          ref={canvasRef}
          className="block relative z-[1]"
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
          <DrawingCursor tool={tool} cursorPos={cursorPos} color={color} darkMode={darkMode} />
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
