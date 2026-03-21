import { t } from "./i18n";
import React, { useRef, useEffect, useState, useCallback } from 'react';

const DRAWING_COLORS = [
  '#000000', // black
  '#FFFFFF', // white
  '#FF0000', // red
  '#00FF00', // green
  '#0000FF', // blue
  '#FFFF00', // yellow
  '#FF00FF', // magenta
  '#00FFFF', // cyan
  '#FFA500', // orange
  '#800080', // purple
  '#FFC0CB', // pink
  '#A52A2A', // brown
  '#808080', // gray
];

const PEN_SIZES = [1, 2, 4, 8, 12, 16, 24, 32];


const PenToolIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zM20.71 7.04a1.003 1.003 0 000-1.42L18.37 3.29a1.003 1.003 0 00-1.42 0L15.13 5.11l3.75 3.75 1.83-1.82z" />
  </svg>
);

const EraserToolIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.24 3.56L21.9 9.22a2 2 0 010 2.83l-7.78 7.78a2 2 0 01-1.41.59H5.83a2 2 0 01-1.41-.59L1.59 17a2 2 0 010-2.83l11.82-11.82a2 2 0 012.83 0zM7 19h5.17l7.78-7.78-4.24-4.24L4 18.71 5.29 20H7z" />
  </svg>
);

const ExpandMoreIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
  </svg>
);

const UndoToolIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.5 8c-2.35 0-4.45 1.02-5.9 2.64L4 8v8h8l-3.04-3.04A5.47 5.47 0 0112.5 11c2.76 0 5 2.24 5 5 0 .34-.03.67-.1.99l2.02 1.17c.28-.68.43-1.42.43-2.16 0-4.42-3.58-8-8-8z" />
  </svg>
);

const DeleteToolIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 002-2V7H6v12zm3.46-7.12 1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

function DrawingCanvas({ data, onChange, width = 800, height = 600, readOnly = false, darkMode = false, hideModeToggle = false, initialMode = null }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen'); // 'pen' or 'eraser'
  const [color, setColor] = useState(darkMode ? '#FFFFFF' : '#000000');
  const [size, setSize] = useState(4);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);
  // Determine initial mode: use initialMode prop if provided, otherwise draw mode for composer, view mode for modal
  const getInitialMode = () => {
    if (initialMode !== null) return initialMode;
    if (readOnly) return 'view';
    if (hideModeToggle) return 'draw'; // Composer - always draw mode
    return 'view'; // Modal - default to view mode
  };
  const [mode, setMode] = useState(getInitialMode());
  const [canvasWidth, setCanvasWidth] = useState(width);
  const [canvasHeight, setCanvasHeight] = useState(height);

  // Load drawing data when component mounts or data changes
  useEffect(() => {
    let pathsData = [];
    let dimensions = null;

    // Handle both old format (array) and new format (object with paths and dimensions)
    if (data) {
      if (Array.isArray(data)) {
        // Old format: just an array of paths
        pathsData = data;
      } else if (data.paths && Array.isArray(data.paths)) {
        // New format: object with paths and dimensions
        pathsData = data.paths;
        if (data.dimensions) {
          dimensions = data.dimensions;
        }
      }
    }

    // Apply dimensions if available, otherwise reset to props (for new/old drawings)
    if (dimensions && dimensions.width && dimensions.height) {
      setCanvasWidth(dimensions.width);
      setCanvasHeight(dimensions.height);
    } else {
      // Reset to initial props for old format drawings or new drawings
      setCanvasWidth(width);
      setCanvasHeight(height);
    }

    // Convert black/white strokes based on current theme for optimal contrast
    const convertedData = pathsData.map(path => {
      // Only convert black/white strokes for better contrast, keep other colors as-is
      if (darkMode) {
        // In dark mode, ensure black strokes are white for visibility
        if (path.color === '#000000') {
          return { ...path, color: '#FFFFFF' };
        }
      } else {
        // In light mode, ensure white strokes are black for visibility
        if (path.color === '#FFFFFF') {
          return { ...path, color: '#000000' };
        }
      }
      return path;
    });
    setPaths(convertedData);
  }, [data, darkMode]);

  // Update default color when dark mode changes
  useEffect(() => {
    setColor(darkMode ? '#FFFFFF' : '#000000');
  }, [darkMode]);


  // Notify parent of changes (include dimensions)
  const notifyChange = useCallback((newPaths) => {
    if (onChange) {
      // Get current dimensions to preserve originalHeight if it exists
      let originalHeight = height; // Default to initial prop
      if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
        originalHeight = data.dimensions.originalHeight || height;
      }
      
      // Send both paths and dimensions
      onChange({
        paths: newPaths,
        dimensions: {
          width: canvasWidth,
          height: canvasHeight,
          originalHeight: originalHeight
        }
      });
    }
  }, [onChange, canvasWidth, canvasHeight, data, height]);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showColorPicker && !event.target.closest('.color-picker-container')) {
        setShowColorPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  // Update canvas size when width/height props change (only if no dimensions in data)
  // This ensures props are used for initial size, but dimensions from data take precedence
  useEffect(() => {
    // Only update from props if we don't have dimensions in the current data
    if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
      // Data has dimensions, don't override with props
      return;
    }
    setCanvasWidth(width);
    setCanvasHeight(height);
  }, [width, height, data]);

  // Redraw canvas when paths change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw all completed paths
    paths.forEach(path => {
      if (path.points && path.points.length > 0) {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (path.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
        } else {
          ctx.globalCompositeOperation = 'source-over';
        }

        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);

        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }

        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    });

    // Draw current path being drawn
    if (currentPath && currentPath.points && currentPath.points.length > 0) {
      ctx.strokeStyle = currentPath.color;
      ctx.lineWidth = currentPath.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (currentPath.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.beginPath();
      ctx.moveTo(currentPath.points[0].x, currentPath.points[0].y);

      for (let i = 1; i < currentPath.points.length; i++) {
        ctx.lineTo(currentPath.points[i].x, currentPath.points[i].y);
      }

      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }, [paths, currentPath, canvasWidth, canvasHeight]);

  const getCanvasCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Handle both mouse and touch events
    const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e) => {
    if (readOnly || mode !== 'draw') return;

    const point = getCanvasCoordinates(e);
    const newPath = {
      tool,
      color: tool === 'eraser' ? '#FFFFFF' : color,
      size,
      points: [point],
    };

    setCurrentPath(newPath);
    setIsDrawing(true);
  }, [readOnly, mode, tool, color, size, getCanvasCoordinates]);

  // Throttle draw updates to prevent excessive CPU usage
  const lastDrawTime = useRef(0);
  const draw = useCallback((e) => {
    if (!isDrawing || readOnly || mode !== 'draw') return;

    const now = Date.now();
    if (now - lastDrawTime.current < 16) return; // Throttle to ~60fps
    lastDrawTime.current = now;

    const point = getCanvasCoordinates(e);
    setCurrentPath(prev => ({
      ...prev,
      points: [...prev.points, point],
    }));
  }, [isDrawing, readOnly, mode, getCanvasCoordinates]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing || readOnly || mode !== 'draw') return;

    if (currentPath && currentPath.points.length > 0) {
      const newPaths = [...paths, currentPath];
      setPaths(newPaths);
      notifyChange(newPaths);
    }

    setCurrentPath(null);
    setIsDrawing(false);
  }, [isDrawing, readOnly, mode, currentPath, paths, notifyChange]);

  const clearCanvas = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    setPaths([]);
    notifyChange([]);
  }, [readOnly, mode, notifyChange]);

  const undo = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    const newPaths = paths.slice(0, -1);
    setPaths(newPaths);
    notifyChange(newPaths);
  }, [readOnly, mode, paths, notifyChange]);

  const addPage = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    // Only double the height (add page below)
    const newHeight = canvasHeight * 2;
    setCanvasHeight(newHeight);
    // Stay in draw mode to continue editing
    // Notify parent of the dimension change with updated dimensions
    if (onChange) {
      // Get current dimensions to preserve originalHeight if it exists
      let originalHeight = height; // Default to initial prop
      if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
        originalHeight = data.dimensions.originalHeight || height;
      }
      
      onChange({
        paths: paths,
        dimensions: {
          width: canvasWidth,
          height: newHeight,
          originalHeight: originalHeight // Store the original first page height
        }
      });
    }
  }, [readOnly, mode, paths, canvasWidth, canvasHeight, onChange, data, height]);

  return (
    <div className="drawing-canvas-container">
      {/* View/Draw Mode Toggle - only when drawing is allowed and not hidden */}
      {!readOnly && !hideModeToggle && (
        <div className="flex items-center justify-between mb-3">
          <button
              onClick={() => setMode(mode === 'view' ? 'draw' : 'view')}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
              data-tooltip={mode === 'view' ? t('switchToDrawMode') : t('switchToViewMode')}
            >
              {mode === 'view' ? t('drawMode') : t('viewMode')}
            </button>
        </div>
      )}

      {/* Compact Toolbar */}
      {!readOnly && mode === 'draw' && (
        <div className="flex items-center gap-3 mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          {/* Tool selection */}
          <div className="flex items-center gap-1">
            <button
                data-tooltip={t("pen")}
                onClick={() => setTool('pen')}
                className={`px-2 py-1 rounded text-sm ${tool === 'pen' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              >
                <PenToolIcon />
              </button>
            <button
                data-tooltip={t("eraser")}
                onClick={() => setTool('eraser')}
                className={`px-2 py-1 rounded text-sm ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              >
                <EraserToolIcon />
              </button>
          </div>

          {/* Color picker dropdown */}
          {tool === 'pen' && (
            <div className="relative color-picker-container">
              <button
                data-tooltip={t('changeColor')}
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                <div
                  className="w-4 h-4 rounded border border-gray-400"
                  style={{ backgroundColor: color }}
                />
                <ExpandMoreIcon />
              </button>

              {showColorPicker && (
                <div className="absolute top-full mt-1 p-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 min-w-[200px]">
                  <div className="grid grid-cols-6 gap-2">
                    {DRAWING_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          setColor(c);
                          setShowColorPicker(false);
                        }}
                        className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-gray-600 ring-2 ring-gray-400' : 'border-gray-300'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Size picker */}
          <select
              data-tooltip={t("brushSize")}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm"
            >
              {PEN_SIZES.map(s => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>

          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto">
            <button
                data-tooltip={t("undo")}
                onClick={undo}
                disabled={paths.length === 0}
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                <UndoToolIcon />
              </button>
            <button
                data-tooltip={t("clearAll")}
                onClick={clearCanvas}
                className="px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              >
                <DeleteToolIcon />
              </button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className={`block ${mode === 'draw' && !readOnly ? 'cursor-crosshair' : 'cursor-default'}`}
          style={{ 
            maxWidth: '100%', 
            height: 'auto', 
            touchAction: mode === 'draw' && !readOnly ? 'none' : 'auto' 
          }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={(e) => {
            // Only prevent default and handle drawing in draw mode
            if (mode === 'draw' && !readOnly) {
              e.preventDefault();
              startDrawing(e);
            }
            // In view mode, allow normal touch scrolling
          }}
          onTouchMove={(e) => {
            // Only prevent default and handle drawing in draw mode
            if (mode === 'draw' && !readOnly) {
              e.preventDefault();
              draw(e);
            }
            // In view mode, allow normal touch scrolling
          }}
          onTouchEnd={(e) => {
            // Only prevent default and handle drawing in draw mode
            if (mode === 'draw' && !readOnly) {
              e.preventDefault();
              stopDrawing();
            }
            // In view mode, allow normal touch scrolling
          }}
        />
      </div>

      {/* Add Page Button - only in draw mode */}
      {!readOnly && mode === 'draw' && (
        <div className="mt-3 flex justify-center">
          <button
              data-tooltip={t('addPageTitle')}
              onClick={addPage}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium transition-colors"
            >
              {t("addPage")}
            </button>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-gray-500 mt-2">
        {paths.length} {paths.length !== 1 ? t("strokeCountPlural") : t("strokeCount")}
        {mode === 'view' && ` (${t('viewMode')})`}
        {readOnly && mode === 'draw' && ` (${t('readOnlyLabel')})`}
      </div>
    </div>
  );
}

export default DrawingCanvas;
