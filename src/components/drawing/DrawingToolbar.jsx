import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

const RemovePageIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
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

/* ─── Compact Popover (portal, auto-position, outside click to close) ─── */
function ToolbarPopover({ anchorRef, open, onClose, darkMode, children }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  React.useLayoutEffect(() => {
    if (!open) { setReady(false); return; }
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const gap = 10;
      // Try below first
      let top = r.bottom + gap;
      let left = r.left + r.width / 2;
      setPos({ top, left });
      requestAnimationFrame(() => {
        const el = panelRef.current;
        if (!el) return;
        const bw = el.offsetWidth;
        const bh = el.offsetHeight;
        let t = top;
        let l = left - bw / 2; // center on anchor
        if (l + bw + 8 > window.innerWidth) l = window.innerWidth - bw - 8;
        if (l < 8) l = 8;
        if (t + bh + 8 > window.innerHeight) t = r.top - bh - gap;
        setPos({ top: t, left: l });
        setReady(true);
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      e.stopPropagation();
      onClose?.();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999, visibility: ready ? "visible" : "hidden" }}
      className={`rounded-2xl shadow-2xl backdrop-blur-xl border ring-1 ring-black/5 dark:ring-white/5 p-3 ${
        darkMode ? "bg-gray-900/98 border-gray-700/50" : "bg-white/98 border-gray-100/80"
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}

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
}) {
  // Mobile detection — popovers only on small screens
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [showCustomColor, setShowCustomColor] = useState(false);
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
    setShowCustomColor(false);
  };

  const isCustomColor = !QUICK_COLORS.includes(color);

  const colorSize = compact ? 'w-7 h-7' : 'w-7 h-7';
  const sizeBtn = compact ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl';
  const iconCls = compact ? 'w-5 h-5' : 'w-5 h-5';

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
              <ToolbarPopover anchorRef={colorBtnRef} open={colorPopOpen} onClose={() => setColorPopOpen(false)} darkMode={darkMode}>
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
                        <svg className="w-4 h-4 mx-auto drop-shadow-sm" viewBox="0 0 24 24" fill={c === '#FFFFFF' || c === '#fff' || c === '#FACC15' ? '#000' : '#fff'}>
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
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
                        <svg className="w-4 h-4 drop-shadow-sm" viewBox="0 0 24 24" fill="#fff">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                        </svg>
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
              </ToolbarPopover>
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
          <ToolbarPopover anchorRef={sizeBtnRef} open={sizePopOpen} onClose={() => setSizePopOpen(false)} darkMode={darkMode}>
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
          </ToolbarPopover>
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
          <ToolbarPopover anchorRef={actionsBtnRef} open={actionsPopOpen} onClose={() => setActionsPopOpen(false)} darkMode={darkMode}>
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
            </div>
          </ToolbarPopover>
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
