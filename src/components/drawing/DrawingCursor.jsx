import React from 'react';

/* Desktop brush cursor of the drawing canvas: an eraser or a pencil tinted
   with the pen colour, fixed-positioned at the pointer so it renders above
   the modal header. */
export default function DrawingCursor({ tool, cursorPos, color, darkMode }) {
  return tool === 'eraser' ? (
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
  );
}
