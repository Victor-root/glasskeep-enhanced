import React, { useState, useEffect, useRef } from 'react';
import { t } from '../../i18n';

/* ─── Quick palette: 8 well-chosen defaults ─── */
const QUICK_COLORS = [
  '#000000', // black
  '#FFFFFF', // white
  '#EF4444', // red (tailwind red-500, vivid)
  '#F97316', // orange
  '#FACC15', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#8B5CF6', // violet
];

/* ─── Brush presets ─── */
const SIZE_PRESETS = [
  { value: 2, label: () => t('sizeFine'), icon: 2 },
  { value: 5, label: () => t('sizeMedium'), icon: 5 },
  { value: 12, label: () => t('sizeThick'), icon: 12 },
  { value: 24, label: () => t('sizeLarge'), icon: 24 },
];

/* ─── SVG Icons ─── */
const PenIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zM20.71 7.04a1.003 1.003 0 000-1.42L18.37 3.29a1.003 1.003 0 00-1.42 0L15.13 5.11l3.75 3.75 1.83-1.82z" />
  </svg>
);

const EraserIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
);

const AddPageIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const UndoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.5 8c-2.35 0-4.45 1.02-5.9 2.64L4 8v8h8l-3.04-3.04A5.47 5.47 0 0112.5 11c2.76 0 5 2.24 5 5 0 .34-.03.67-.1.99l2.02 1.17c.28-.68.43-1.42.43-2.16 0-4.42-3.58-8-8-8z" />
  </svg>
);

const RedoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}>
    <path d="M12.5 8c-2.35 0-4.45 1.02-5.9 2.64L4 8v8h8l-3.04-3.04A5.47 5.47 0 0112.5 11c2.76 0 5 2.24 5 5 0 .34-.03.67-.1.99l2.02 1.17c.28-.68.43-1.42.43-2.16 0-4.42-3.58-8-8-8z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 002-2V7H6v12zm3.46-7.12 1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

/* ─── Toolbar Button ─── */
function TBtn({ active, onClick, disabled, tooltip, variant = 'default', children, className = '' }) {
  const base = 'flex items-center justify-center rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:scale-100 min-w-[40px] min-h-[40px] p-2';

  const variants = {
    default: active
      ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-300/40 dark:shadow-none scale-105'
      : 'border border-gray-200/80 dark:border-gray-600/60 bg-white/80 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:border-gray-300 dark:hover:border-gray-500 hover:scale-105',
    eraser: active
      ? 'bg-gradient-to-br from-slate-500 to-gray-600 text-white shadow-md shadow-slate-300/40 dark:shadow-none scale-105'
      : 'border border-gray-200/80 dark:border-gray-600/60 bg-white/80 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:border-gray-300 dark:hover:border-gray-500 hover:scale-105',
    danger: 'border border-red-200/80 dark:border-red-700/50 bg-white/80 dark:bg-gray-800/60 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 hover:scale-105',
    action: disabled
      ? 'border border-gray-200/60 dark:border-gray-700/40 bg-white/60 dark:bg-gray-800/40 text-gray-300 dark:text-gray-600'
      : 'border border-gray-200/80 dark:border-gray-600/60 bg-white/80 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:border-gray-300 dark:hover:border-gray-500 hover:scale-105',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-tooltip={tooltip}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* ─── Separator ─── */
const Sep = () => <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5 shrink-0" />;

/* ─── Main Component ─── */
export default function DrawingToolbar({
  tool,
  setTool,
  color,
  setColor,
  size,
  setSize,
  onUndo,
  onRedo,
  onClear,
  onAddPage,
  canUndo,
  canRedo,
  pathCount,
  darkMode,
  compact = false,
}) {
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimer = useRef(null);
  const customColorRef = useRef(null);

  // Auto-dismiss confirm after 3s
  useEffect(() => {
    if (confirmClear) {
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 3000);
      return () => clearTimeout(confirmTimer.current);
    }
  }, [confirmClear]);

  const handleClear = () => {
    if (pathCount === 0) return;
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    onClear();
  };

  const handleCustomColorChange = (e) => {
    setColor(e.target.value);
    setShowCustomColor(false);
  };

  const isCustomColor = !QUICK_COLORS.includes(color);

  return (
    <div className={compact
      ? "flex items-center flex-wrap gap-1"
      : "flex items-center flex-wrap gap-1.5 mb-1 p-1.5 bg-gray-100/80 dark:bg-gray-800/60 rounded-2xl border border-gray-200/60 dark:border-gray-700/40"
    }>

      {/* ─── Tool Group: Pen / Eraser ─── */}
      <div className="flex items-center gap-1">
        <TBtn active={tool === 'pen'} onClick={() => setTool('pen')} tooltip={t('pen')}>
          <PenIcon />
        </TBtn>
        <TBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} variant="eraser" tooltip={t('eraser')}>
          <EraserIcon />
        </TBtn>
      </div>

      <Sep />

      {/* ─── Color Palette (visible only for pen) ─── */}
      {tool === 'pen' && (
        <>
          <div className="flex items-center gap-1 flex-wrap">
            {QUICK_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-all duration-150 hover:scale-110 shrink-0 ${
                  color === c
                    ? 'ring-2 ring-offset-1 ring-indigo-400 dark:ring-indigo-500 dark:ring-offset-gray-800 scale-110 border-gray-400 dark:border-gray-300'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-400'
                }`}
                style={{ backgroundColor: c }}
                data-tooltip={c}
              />
            ))}
            {/* Custom color button */}
            <div className="relative">
              <button
                onClick={() => customColorRef.current?.click()}
                className={`w-7 h-7 rounded-full border-2 border-dashed transition-all duration-150 hover:scale-110 shrink-0 flex items-center justify-center text-xs ${
                  isCustomColor
                    ? 'ring-2 ring-offset-1 ring-indigo-400 dark:ring-indigo-500 dark:ring-offset-gray-800 scale-110 border-gray-400'
                    : 'border-gray-300 dark:border-gray-500 text-gray-400 dark:text-gray-500'
                }`}
                style={isCustomColor ? { backgroundColor: color } : {}}
                data-tooltip={t('customColor')}
              >
                {!isCustomColor && (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                  </svg>
                )}
              </button>
              <input
                ref={customColorRef}
                type="color"
                value={isCustomColor ? color : '#000000'}
                onChange={handleCustomColorChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                tabIndex={-1}
              />
            </div>
          </div>

          <Sep />
        </>
      )}

      {/* ─── Size Presets (always visible — pen and eraser both need size) ─── */}
      <div className="flex items-center gap-1">
        {SIZE_PRESETS.map(preset => (
          <button
            key={preset.value}
            onClick={() => setSize(preset.value)}
            data-tooltip={`${preset.label()} (${preset.value}px)`}
            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 hover:scale-105 ${
              size === preset.value
                ? 'bg-gray-800 dark:bg-white border-2 border-gray-800 dark:border-white'
                : 'border border-gray-200/80 dark:border-gray-600/60 bg-white/80 dark:bg-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            <span
              className={`block rounded-full ${
                size === preset.value
                  ? 'bg-white dark:bg-gray-800'
                  : 'bg-gray-500 dark:bg-gray-400'
              }`}
              style={{
                width: Math.max(4, Math.min(preset.icon, 18)),
                height: Math.max(4, Math.min(preset.icon, 18)),
              }}
            />
          </button>
        ))}
      </div>

      <Sep />

      {/* ─── Actions: Undo / Redo / Add Page / Clear ─── */}
      <div className="flex items-center gap-1 ml-auto">
        <TBtn variant="action" onClick={onUndo} disabled={!canUndo} tooltip={`${t('undo')} (Ctrl+Z)`}>
          <UndoIcon />
        </TBtn>
        <TBtn variant="action" onClick={onRedo} disabled={!canRedo} tooltip={`${t('redo')} (Ctrl+Shift+Z)`}>
          <RedoIcon />
        </TBtn>
        {onAddPage && (
          <TBtn variant="action" onClick={onAddPage} tooltip={t('addPage')}>
            <AddPageIcon />
          </TBtn>
        )}
        <TBtn
          variant="danger"
          onClick={handleClear}
          disabled={pathCount === 0}
          tooltip={confirmClear ? t('confirmClear') : t('clearAll')}
        >
          {confirmClear ? (
            <span className="text-xs font-bold px-0.5 text-red-600 dark:text-red-400 animate-pulse">{t('confirmQuestion')}</span>
          ) : (
            <TrashIcon />
          )}
        </TBtn>
      </div>
    </div>
  );
}
