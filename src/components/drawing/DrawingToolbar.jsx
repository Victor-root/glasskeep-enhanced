import React, { useState, useEffect, useRef } from 'react';
import { t } from '../../i18n';
import DrawingToolbarPopover from './DrawingToolbarPopover';
import {
  PenIcon,
  EraserIcon,
  AddPageIcon,
  RemovePageIcon,
  UndoIcon,
  RedoIcon,
  TrashIcon,
  PageLinesIcon,
  CheckIcon,
  PaletteIcon,
} from './DrawingIcons';

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

/* ─── Toolbar Button ─── */
function TBtn({ active, onClick, disabled, tooltip, variant = 'default', compact = false, children, className = '' }) {
  const base = compact
    ? 'flex items-center justify-center rounded-lg transition-all duration-200 active:scale-[0.95] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:scale-100 w-9 h-9 p-1.5 [&_svg]:w-5 [&_svg]:h-5'
    : 'flex items-center justify-center rounded-xl transition-all duration-200 active:scale-[0.95] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:scale-100 min-w-[40px] min-h-[40px] p-2';

  const variants = {
    default: active
      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-300/40 dark:shadow-none hover:from-indigo-600 hover:to-violet-700 hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] btn-gradient'
      : 'border border-indigo-200/80 dark:border-indigo-700/50 bg-gradient-to-br from-indigo-50 to-violet-50/60 text-indigo-400 dark:from-indigo-900/20 dark:to-violet-900/10 dark:text-indigo-400/60 hover:from-indigo-100 hover:to-violet-100 hover:border-indigo-300 hover:text-indigo-500 dark:hover:from-indigo-800/30 dark:hover:to-violet-800/20 dark:hover:text-indigo-300 hover:scale-[1.03]',
    eraser: active
      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-300/40 dark:shadow-none hover:from-indigo-600 hover:to-violet-700 hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] btn-gradient'
      : 'border border-indigo-200/80 dark:border-indigo-700/50 bg-gradient-to-br from-indigo-50 to-violet-50/60 text-indigo-400 dark:from-indigo-900/20 dark:to-violet-900/10 dark:text-indigo-400/60 hover:from-indigo-100 hover:to-violet-100 hover:border-indigo-300 hover:text-indigo-500 dark:hover:from-indigo-800/30 dark:hover:to-violet-800/20 dark:hover:text-indigo-300 hover:scale-[1.03]',
    danger: 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md shadow-red-300/40 dark:shadow-none hover:from-red-600 hover:to-rose-700 hover:shadow-lg hover:shadow-red-300/50 dark:hover:shadow-none hover:scale-[1.03] btn-gradient',
    action: disabled
      ? 'bg-gradient-to-r from-indigo-400/50 to-violet-500/50 text-white/40 shadow-none'
      : 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-300/40 dark:shadow-none hover:from-indigo-600 hover:to-violet-700 hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] btn-gradient',
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

/* ─── Separator (desktop only) ─── */
const Sep = ({ hide }) => hide ? null : <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5 shrink-0" />;

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
  onRemovePage,
  canRemovePage,
  canUndo,
  canRedo,
  pathCount,
  darkMode,
  compact = false,
  showPageLines = true,
  onTogglePageLines,
}) {
  // Mobile detection — popovers only on small screens
  // Note: WebView tablets keep desktop toolbar since they have enough space
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [confirmClear, setConfirmClear] = useState(false);
  const [colorPopOpen, setColorPopOpen] = useState(false);
  const [sizePopOpen, setSizePopOpen] = useState(false);
  const [actionsPopOpen, setActionsPopOpen] = useState(false);
  const confirmTimer = useRef(null);
  const customColorRef = useRef(null);
  const colorBtnRef = useRef(null);
  const sizeBtnRef = useRef(null);
  const actionsBtnRef = useRef(null);

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
  };

  const isCustomColor = !QUICK_COLORS.includes(color);

  const colorSize = compact ? 'w-7 h-7' : 'w-7 h-7';
  const sizeBtn = compact ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl';

  return (
    <div className={compact
      ? "flex items-center justify-center gap-1 flex-nowrap px-3 py-1 rounded-xl bg-white/60 dark:bg-gray-800/70 backdrop-blur-sm border border-gray-200/50 dark:border-gray-600/40 shadow-sm"
      : "flex items-center flex-wrap gap-1.5 mb-1 p-1.5 bg-gray-100/80 dark:bg-gray-800/60 rounded-2xl border border-gray-200/60 dark:border-gray-700/40"
    }>

      {/* ─── Tool Group: Pen / Eraser ─── */}
      <div className="flex items-center gap-0.5 shrink-0">
        <TBtn compact={compact} active={tool === 'pen'} onClick={() => setTool('pen')} tooltip={t('pen')}>
          <PenIcon />
        </TBtn>
        <TBtn compact={compact} active={tool === 'eraser'} onClick={() => setTool('eraser')} variant="eraser" tooltip={t('eraser')}>
          <EraserIcon />
        </TBtn>
      </div>

      <Sep hide={compact && isMobile} />

      {/* ─── Color Palette (visible only for pen) ─── */}
      {tool === 'pen' && (
        <>
          {compact && isMobile ? (
            /* Mobile: single color button → popover */
            <>
              <button
                ref={colorBtnRef}
                onClick={() => { setColorPopOpen(v => !v); setSizePopOpen(false); setActionsPopOpen(false); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 focus:outline-none border border-gray-200/50 dark:border-gray-600/40 hover:scale-105 transition-transform duration-150"
              >
                {/* 4 overlapping filled circles */}
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="8" cy="7" r="6" fill="#EF4444" />
                  <circle cx="15" cy="9" r="5.5" fill="#FACC15" />
                  <circle cx="7" cy="13" r="5.5" fill="#3B82F6" />
                  <circle cx="13" cy="15" r="6" fill={color} />
                </svg>
              </button>
              <DrawingToolbarPopover anchorRef={colorBtnRef} open={colorPopOpen} onClose={() => setColorPopOpen(false)} darkMode={darkMode}>
                <div className="flex flex-wrap gap-2.5 justify-center" style={{ width: 200 }}>
                  {QUICK_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => { setColor(c); setColorPopOpen(false); }}
                      className={`w-10 h-10 rounded-full shrink-0 focus:outline-none transition-transform duration-150 hover:scale-110 active:scale-95 ${
                        color === c
                          ? 'ring-[3px] ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900'
                          : `border-2 ${c === '#FFFFFF' || c === '#fff' ? 'border-gray-300 dark:border-gray-500' : 'border-transparent'}`
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {color === c && (
                        <CheckIcon className="w-4 h-4 mx-auto drop-shadow-sm" fill={c === '#FFFFFF' || c === '#fff' || c === '#FACC15' ? '#000' : '#fff'} />
                      )}
                    </button>
                  ))}
                  {/* Custom color */}
                  <div className="relative">
                    <button
                      onClick={() => customColorRef.current?.click()}
                      className={`w-10 h-10 rounded-full border-dashed shrink-0 flex items-center justify-center focus:outline-none transition-transform duration-150 hover:scale-110 ${
                        isCustomColor
                          ? 'ring-[3px] ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900'
                          : 'border-2 border-gray-300 dark:border-gray-500 text-gray-400 dark:text-gray-500'
                      }`}
                      style={isCustomColor ? { backgroundColor: color } : {}}
                    >
                      {isCustomColor ? (
                        <CheckIcon className="w-4 h-4 drop-shadow-sm" fill="#fff" />
                      ) : (
                        <PaletteIcon className="w-4 h-4" />
                      )}
                    </button>
                    <input
                      ref={customColorRef}
                      type="color"
                      value={isCustomColor ? color : '#000000'}
                      onChange={(e) => { handleCustomColorChange(e); setColorPopOpen(false); }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      tabIndex={-1}
                    />
                  </div>
                </div>
              </DrawingToolbarPopover>
            </>
          ) : (
            /* Desktop: inline color swatches */
            <div className="flex items-center gap-1 flex-wrap">
              {QUICK_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`${colorSize} rounded-full shrink-0 focus:outline-none ${
                    color === c
                      ? 'border-[3px] border-indigo-500 dark:border-indigo-400 shadow-[0_0_0_2px_rgba(99,102,241,0.5)]'
                      : 'border-2 border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-400 hover:scale-110 transition-transform duration-150'
                  }`}
                  style={{ backgroundColor: c }}
                  data-tooltip={c}
                />
              ))}
              {/* Custom color button */}
              <div className="relative">
                <button
                  onClick={() => customColorRef.current?.click()}
                  className={`${colorSize} rounded-full border-dashed shrink-0 flex items-center justify-center text-xs focus:outline-none ${
                    isCustomColor
                      ? 'border-[3px] border-indigo-500 dark:border-indigo-400 shadow-[0_0_0_2px_rgba(99,102,241,0.5)]'
                      : 'border-2 border-gray-300 dark:border-gray-500 text-gray-400 dark:text-gray-500 hover:scale-110 transition-transform duration-150'
                  }`}
                  style={isCustomColor ? { backgroundColor: color } : {}}
                  data-tooltip={t('customColor')}
                >
                  {!isCustomColor && <PaletteIcon className="w-3.5 h-3.5" />}
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
          )}

          <Sep hide={compact && isMobile} />
        </>
      )}

      {/* ─── Size Presets ─── */}
      {compact && isMobile ? (
        /* Mobile: single size button → popover */
        <>
          <button
            ref={sizeBtnRef}
            onClick={() => { setSizePopOpen(v => !v); setColorPopOpen(false); setActionsPopOpen(false); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 focus:outline-none border border-gray-200/50 dark:border-gray-600/40 hover:scale-105 transition-transform duration-150"
          >
            {/* Stacked lines showing stroke widths */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <line x1="3" y1="3.5" x2="15" y2="3.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
              <line x1="3" y1="7.5" x2="15" y2="7.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
              <line x1="3" y1="12.5" x2="15" y2="12.5" stroke={color} strokeWidth="4.5" strokeLinecap="round" />
            </svg>
          </button>
          <DrawingToolbarPopover anchorRef={sizeBtnRef} open={sizePopOpen} onClose={() => setSizePopOpen(false)} darkMode={darkMode}>
            <div className="flex items-center gap-3 px-1">
              {SIZE_PRESETS.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => { setSize(preset.value); setSizePopOpen(false); }}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 hover:scale-105 active:scale-95 ${
                    size === preset.value
                      ? 'bg-gray-800 dark:bg-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span
                    className={`block rounded-full ${
                      size === preset.value ? 'bg-white dark:bg-gray-800' : 'bg-gray-500 dark:bg-gray-400'
                    }`}
                    style={{
                      width: Math.max(4, Math.min(preset.icon, 20)),
                      height: Math.max(4, Math.min(preset.icon, 20)),
                    }}
                  />
                  <span className={`text-[10px] font-medium ${
                    size === preset.value
                      ? 'text-white dark:text-gray-800'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {preset.label()}
                  </span>
                </button>
              ))}
            </div>
          </DrawingToolbarPopover>
        </>
      ) : (
        /* Desktop: inline size buttons */
        <div className="flex items-center gap-0.5 shrink-0">
          {SIZE_PRESETS.map(preset => (
            <button
              key={preset.value}
              onClick={() => setSize(preset.value)}
              data-tooltip={`${preset.label()} (${preset.value}px)`}
              className={`flex items-center justify-center ${sizeBtn} transition-all duration-200 hover:scale-105 ${
                size === preset.value
                  ? 'bg-gray-800 dark:bg-white border-2 border-gray-800 dark:border-white'
                  : 'border border-gray-200/80 dark:border-gray-600/60 bg-white/80 dark:bg-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <span
                className={`block rounded-full ${
                  size === preset.value ? 'bg-white dark:bg-gray-800' : 'bg-gray-500 dark:bg-gray-400'
                }`}
                style={{
                  width: Math.max(3, Math.min(preset.icon, 18)),
                  height: Math.max(3, Math.min(preset.icon, 18)),
                }}
              />
            </button>
          ))}
        </div>
      )}

      <Sep hide={compact && isMobile} />

      {/* ─── Actions: Undo / Redo / Add Page / Clear ─── */}
      {compact && isMobile ? (
        /* Mobile: toolbox button → popover with all actions */
        <>
          <button
            ref={actionsBtnRef}
            onClick={() => { setActionsPopOpen(v => !v); setColorPopOpen(false); setSizePopOpen(false); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 focus:outline-none border border-gray-200/50 dark:border-gray-600/40 hover:scale-105 transition-transform duration-150"
          >
            {/* Toolbox / wrench icon */}
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
          <DrawingToolbarPopover anchorRef={actionsBtnRef} open={actionsPopOpen} onClose={() => setActionsPopOpen(false)} darkMode={darkMode}>
            <div className="grid grid-cols-3 gap-1.5" style={{ width: 180 }}>
              {/* Undo */}
              <button
                onClick={() => { if (canUndo) { onUndo(); } }}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-150 active:scale-95 ${
                  !canUndo ? 'opacity-35 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                disabled={!canUndo}
              >
                <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm">
                  <UndoIcon />
                </span>
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{t('undo')}</span>
              </button>
              {/* Redo */}
              <button
                onClick={() => { if (canRedo) { onRedo(); } }}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-150 active:scale-95 ${
                  !canRedo ? 'opacity-35 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                disabled={!canRedo}
              >
                <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm">
                  <RedoIcon />
                </span>
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{t('redo')}</span>
              </button>
              {/* Clear */}
              <button
                onClick={() => { if (!confirmClear) { handleClear(); return; } handleClear(); setActionsPopOpen(false); }}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-150 active:scale-95 ${
                  pathCount === 0 ? 'opacity-35 cursor-not-allowed' : 'hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
                disabled={pathCount === 0}
              >
                <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-white shadow-sm ${
                  confirmClear ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-red-500 to-rose-600'
                }`}>
                  {confirmClear ? (
                    <span className="text-xs font-bold">?</span>
                  ) : (
                    <TrashIcon />
                  )}
                </span>
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                  {confirmClear ? t('confirmQuestion') : t('clearAll')}
                </span>
              </button>
              {/* Add Page */}
              {onAddPage && (
                <button
                  onClick={() => { onAddPage(); }}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-150 active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm">
                    <AddPageIcon />
                  </span>
                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{t('addPage')}</span>
                </button>
              )}
              {/* Remove Page */}
              {onRemovePage && (
                <button
                  onClick={() => { if (canRemovePage) { onRemovePage(); } }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-150 active:scale-95 ${
                    !canRemovePage ? 'opacity-35 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  disabled={!canRemovePage}
                >
                  <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm">
                    <RemovePageIcon />
                  </span>
                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{t('removePage')}</span>
                </button>
              )}
              {/* Toggle Page Lines */}
              {onTogglePageLines && (
                <button
                  onClick={() => { onTogglePageLines(); }}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-150 active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-white shadow-sm ${
                    showPageLines ? 'bg-gradient-to-r from-indigo-500 to-violet-600' : 'bg-gray-400 dark:bg-gray-600'
                  }`}>
                    <PageLinesIcon active={showPageLines} />
                  </span>
                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                    {showPageLines ? t('hidePageLines') : t('showPageLines')}
                  </span>
                </button>
              )}
            </div>
          </DrawingToolbarPopover>
        </>
      ) : (
        /* Desktop: inline action buttons */
        <div className="flex items-center gap-0.5 shrink-0 ml-auto">
          <TBtn compact={compact} variant="action" onClick={onUndo} disabled={!canUndo} tooltip={`${t('undo')} (Ctrl+Z)`}>
            <UndoIcon />
          </TBtn>
          <TBtn compact={compact} variant="action" onClick={onRedo} disabled={!canRedo} tooltip={`${t('redo')} (Ctrl+Shift+Z)`}>
            <RedoIcon />
          </TBtn>
          {onAddPage && (
            <TBtn compact={compact} variant="action" onClick={onAddPage} tooltip={t('addPage')}>
              <AddPageIcon />
            </TBtn>
          )}
          {onRemovePage && (
            <TBtn compact={compact} variant="action" onClick={onRemovePage} disabled={!canRemovePage} tooltip={t('removePage')}>
              <RemovePageIcon />
            </TBtn>
          )}
          {onTogglePageLines && (
            <button
              onClick={onTogglePageLines}
              data-tooltip={showPageLines ? t('hidePageLines') : t('showPageLines')}
              className={`flex items-center justify-center rounded-lg transition-all duration-200 active:scale-[0.95] hover:scale-[1.03] ${
                compact ? 'w-9 h-9 p-1.5 [&_svg]:w-5 [&_svg]:h-5' : 'min-w-[40px] min-h-[40px] p-2'
              } ${showPageLines
                ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-300/40 dark:shadow-none btn-gradient'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <PageLinesIcon active={showPageLines} />
            </button>
          )}
          <TBtn
            compact={compact}
            variant="danger"
            onClick={handleClear}
            disabled={pathCount === 0}
            tooltip={confirmClear ? t('confirmClear') : t('clearAll')}
          >
            {confirmClear ? (
              <span className="text-xs font-bold px-0.5 text-white animate-pulse">{t('confirmQuestion')}</span>
            ) : (
              <TrashIcon />
            )}
          </TBtn>
        </div>
      )}
    </div>
  );
}
