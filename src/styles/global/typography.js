// Typography settings: the preview grid and the customisation modal.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const typographyCSS = `
/* ---------- Settings — typography preview grid ---------- */
.settings-type-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}
/* Per-block card. Preview sits at the top, controls flow below in a
   flexible grid that wraps gracefully — settings panels are narrow
   (side sheet on desktop, full-width on mobile) so a single horizontal
   row of controls can't fit and would get cut off. */
.settings-type-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--rt-divider);
}
html.dark .settings-type-row { background: rgba(255, 255, 255, 0.04); }
.settings-type-preview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 0;
  border-bottom: 1px dashed var(--rt-divider);
}
.settings-type-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: flex-end;
}
.settings-type-field {
  display: inline-flex;
  flex-direction: column;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.72;
  gap: 2px;
}
.settings-type-field-label { font-weight: 600; }
.settings-type-field select {
  height: 28px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: rgba(255, 255, 255, 0.6);
  color: inherit;
  font-size: 0.85rem;
}
html.dark .settings-type-field select {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
}

/* Colour swatches in the typography settings panel — one row per block.
   A "none" chip (diagonal slash) resets the colour to inherit. */
.settings-type-colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  max-width: 100%;
}
.settings-type-color {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
  padding: 0;
  transition: transform 0.08s ease, box-shadow 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.settings-type-color:hover { transform: scale(1.12); }
.settings-type-color.is-current {
  box-shadow: 0 0 0 2px rgba(var(--rt-accent), 0.85);
  border-color: transparent;
}
html.dark .settings-type-color { border-color: rgba(255, 255, 255, 0.18); }
.settings-type-color--none {
  background: #ffffff;
  color: rgba(0, 0, 0, 0.35);
}
html.dark .settings-type-color--none {
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.4);
}

/* Italic / underline toggle pair — small pill buttons showing the style. */
.settings-type-field--inline .settings-type-field-label { margin-bottom: 2px; }
.settings-type-toggles { display: inline-flex; gap: 4px; }
.settings-type-toggle {
  width: 28px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--rt-divider);
  background: rgba(255, 255, 255, 0.6);
  color: inherit;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: Georgia, "Times New Roman", serif;
  padding: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  text-transform: none;
  letter-spacing: 0;
}
.settings-type-toggle:hover { background: var(--rt-btn-hover); }
.settings-type-toggle.is-current {
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
  border-color: rgba(var(--rt-accent), 0.45);
}
html.dark .settings-type-toggle {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
}

/* ================================================================
   Typography customisation modal — dedicated full-viewport surface
   for size / weight / colour / italic / underline per block type.
   ================================================================ */
.typo-modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(17, 24, 39, 0.48);
  display: flex;
  align-items: center;
  justify-content: center;
  /* Respect Android / iOS safe areas so the modal never tucks under
     the status bar or the gesture handle on edge-to-edge devices.
     The 32 px top fallback covers the case where some Android
     WebViews report a 0-inset even with viewport-fit=cover — typical
     status-bar heights are 24–30 px, notched displays 36–45 px. */
  padding: max(32px, var(--safe-top))
           max(16px, var(--safe-right))
           max(16px, var(--safe-bottom))
           max(16px, var(--safe-left));
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.typo-modal-scrim--dark { background: rgba(0, 0, 0, 0.62); }

.typo-modal {
  width: min(820px, 100%);
  max-height: min(92vh, 960px);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 16px 44px -6px rgba(17, 24, 39, 0.35), 0 4px 12px rgba(17, 24, 39, 0.12);
  overflow: hidden;
  color: inherit;
}
html.dark .typo-modal {
  background: #1f2937;
  box-shadow: 0 16px 44px -6px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5);
}

.typo-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  /* Pad below the safe-area inset AND give an explicit 12 px of
     breathing room above the title — without the calc the title
     sat exactly at the inset boundary, which on a real Android
     device read as "touching the status bar". The max() fallback
     of 32 px covers WebViews that report env() as 0. */
  padding: max(32px, calc(var(--safe-top) + 12px)) 20px 14px;
  border-bottom: 1px solid var(--rt-divider);
}
.typo-modal-header-main {
  min-width: 0;
  flex: 1 1 auto;
}
.typo-modal-title {
  font-size: 1.05rem;
  font-weight: 700;
}
.typo-modal-desc {
  font-size: 0.85rem;
  opacity: 0.7;
  margin-top: 2px;
  line-height: 1.35;
}

/* Profile tabs — segmented control under the title so the user can
   switch which profile they're editing without leaving the modal. */
.typo-modal-profiles {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  border: 1px solid var(--rt-divider);
}
html.dark .typo-modal-profiles {
  background: rgba(255, 255, 255, 0.06);
}
.typo-modal-profile {
  padding: 5px 12px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, transform 0.08s ease;
}
.typo-modal-profile:hover:not(.is-active) {
  background: var(--rt-btn-hover);
}
.typo-modal-profile.is-active {
  background: #ffffff;
  color: rgb(var(--rt-accent));
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.12);
}
html.dark .typo-modal-profile.is-active {
  background: rgba(99, 102, 241, 0.22);
  color: rgb(196, 181, 253);
  box-shadow: none;
}

.typo-modal-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.typo-modal-reset {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
}
.typo-modal-reset:hover { background: var(--rt-btn-hover); }
.typo-modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.typo-modal-close:hover { background: var(--rt-btn-hover); }

.typo-modal-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px 16px 18px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.typo-modal-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 16px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--rt-divider);
}
html.dark .typo-modal-card { background: rgba(255, 255, 255, 0.04); }

.typo-modal-card-preview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 0 6px;
  border-bottom: 1px dashed var(--rt-divider);
}
.typo-modal-card-hint {
  font-size: 0.72rem;
  opacity: 0.6;
  line-height: 1.3;
}

.typo-modal-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}
.typo-modal-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.75;
}
.typo-modal-field--wide { grid-column: 1 / -1; }
.typo-modal-field-label { font-weight: 600; }
.typo-modal-field select {
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: rgba(255, 255, 255, 0.6);
  color: inherit;
  font-size: 0.85rem;
  text-transform: none;
  letter-spacing: 0;
}
html.dark .typo-modal-field select {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
}

.typo-modal-colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.typo-modal-color {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
  padding: 0;
  transition: transform 0.08s ease, box-shadow 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.typo-modal-color:hover { transform: scale(1.1); }
.typo-modal-color.is-current {
  box-shadow: 0 0 0 2px rgba(var(--rt-accent), 0.85);
  border-color: transparent;
}
html.dark .typo-modal-color { border-color: rgba(255, 255, 255, 0.18); }
.typo-modal-color--none {
  background: #ffffff;
  color: rgba(0, 0, 0, 0.4);
}
html.dark .typo-modal-color--none {
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.5);
}
.typo-modal-color-custom {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px dashed var(--rt-divider);
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  background: linear-gradient(135deg, #ef4444, #eab308, #22c55e, #0ea5e9, #a855f7);
}
.typo-modal-color-custom input[type="color"] {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0;
}

.typo-modal-toggles { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.typo-modal-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: rgba(255, 255, 255, 0.55);
  color: inherit;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.typo-modal-toggle:hover { background: var(--rt-btn-hover); }
.typo-modal-toggle.is-current {
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
  border-color: rgba(var(--rt-accent), 0.45);
}
html.dark .typo-modal-toggle {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
}
.typo-modal-toggle-sample {
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1;
  min-width: 14px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/* Tabler icons used inside the italic / underline toggles — same look
   as the note-modal toolbar for visual consistency. */
.typo-modal-toggle-sample .tabler-icon { width: 18px; height: 18px; }
.typo-modal-toggle-sample .tabler-icon svg { width: 18px; height: 18px; }
.typo-modal-toggle-label { font-size: 0.78rem; font-weight: 500; }

@media (max-width: 560px) {
  .typo-modal {
    /* Mobile: the panel goes full-screen — make it tall enough to
       cover the dynamic-viewport unit so the gesture nav doesn't
       eat into the visible area. */
    max-height: 100dvh;
    height: 100dvh;
    border-radius: 0;
  }
  .typo-modal-scrim { padding: 0; }
  /* On mobile the wide "Réinitialiser ce profil" CTA was sitting
     to the right of the description and crushing it. Stack the
     header vertically so the title + desc + tabs use the full
     width on top and the reset CTA drops to its own row below.
     The close × stays pinned to the top-right corner via absolute
     positioning so it doesn't hitch a ride down with the CTA. */
  .typo-modal-header {
    position: relative;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .typo-modal-header-actions {
    align-self: flex-end;
  }
  .typo-modal-header-actions .typo-modal-close {
    /* Pin top-right but anchor at the same y as the title so the ×
       and the "Typographie de l'éditeur" line read as one row.
       The 32 / env+12 floors mirror the header's own padding-top so
       the × clears the status bar on edge-to-edge Android. */
    position: absolute;
    top: max(32px, calc(var(--safe-top) + 12px));
    right: 12px;
  }
  .typo-modal-body {
    grid-template-columns: 1fr;
    /* Bottom padding follows the same pattern as SettingsPanel:
       var(--safe-bottom) with a 16 px floor so the last
       card is never hidden under the Android gesture nav bar. */
    padding: 12px
             max(12px, var(--safe-right))
             max(16px, var(--safe-bottom))
             max(12px, var(--safe-left));
  }
}
`;
