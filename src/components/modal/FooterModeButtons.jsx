import React from "react";
import { PencilIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

// A plain element rather than a component: the Reading mode button swaps
// it in place of the Draw mode wave, and both stay the same <svg> node.
const EYE_ICON = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
  </svg>
);

const modeBtnClass = (isDesktop) =>
  `${isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn"} modal-footer-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]`;

// Edit/View toggle of text and drawing notes.
function ViewModeToggle({ isDesktop, viewMode, onToggle }) {
  return (
    <button
      className={modeBtnClass(isDesktop)}
      onClick={onToggle}
      data-tooltip={!isDesktop ? (viewMode ? t("switchToEditMode") : t("switchToViewMode")) : undefined}
      aria-label={viewMode ? t("editMode") : t("viewMode")}
    >
      {viewMode ? <PencilIcon /> : EYE_ICON}
      {isDesktop && <span>{viewMode ? t("editMode") : t("viewMode")}</span>}
    </button>
  );
}

/**
 * Right end of the modal footer: the read-only access badge, or the mode
 * buttons (Edit/View toggle; Draw mode / Reading mode for drawing notes).
 */
export default function FooterModeButtons({
  isDesktop,
  mType,
  viewMode,
  readModeEnabled,
  readOnlyBadge,
  addModalCollaborators,
  drawMode,
  onToggleViewMode,
  onToggleDrawMode,
  onExitDrawToView,
  modalScrollRef,
  savedModalScrollRatioRef,
}) {
  const handleToggleViewMode = () => {
    const el = modalScrollRef?.current;
    const maxScroll = el ? el.scrollHeight - el.clientHeight : 0;
    if (savedModalScrollRatioRef) {
      savedModalScrollRatioRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    }
    onToggleViewMode();
  };

  return (
    <>
      {/* ── Read-only access badge: shown (instead of the view/edit
          toggle) when the owner limited this collaborator to read-only.
          Independent of the read-mode preference so the status is always
          visible; the offline-peer read-only case keeps its own banner. ── */}
      {readOnlyBadge && (() => {
        // The owner is who limited this collaborator to read-only: name
        // them in the (app-wide custom) tooltip so it's clear who to ask.
        const roOwner = (addModalCollaborators || []).find((c) => c && c.isOwner);
        const roOwnerName = roOwner?.name || roOwner?.email || "";
        const roTooltip = roOwnerName
          ? t("readOnlySetBy").replace("{owner}", roOwnerName)
          : t("accessReadOnly");
        return (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--gk-chrome-accent)] bg-[var(--gk-accent-soft-bg)] border border-[var(--gk-accent-soft-border)] cursor-default select-none"
            data-tooltip={roTooltip}
            aria-label={roTooltip}
          >
            <TI.Eye className="tabler-icon w-4 h-4" />
            {isDesktop && <span>{t("accessReadOnly")}</span>}
          </div>
        );
      })()}

      {/* ── Edit/View toggle: text notes ── */}
      {mType === "text" && !readOnlyBadge && readModeEnabled && (
        <ViewModeToggle isDesktop={isDesktop} viewMode={viewMode} onToggle={handleToggleViewMode} />
      )}

      {/* ── Mode buttons for drawing notes (grouped) ── */}
      {mType === "draw" && !readOnlyBadge && (
        <div className={`flex items-center ${isDesktop ? "gap-1" : "gap-2"}`}>
          {/* Edit/View toggle (hidden in draw canvas mode, or when the
              user disabled the read-mode preference globally) */}
          {drawMode !== "draw" && readModeEnabled && (
            <ViewModeToggle isDesktop={isDesktop} viewMode={viewMode} onToggle={handleToggleViewMode} />
          )}
          {/* Draw mode toggle / reading mode */}
          {drawMode === "draw" ? (
            <button
              className={modeBtnClass(isDesktop)}
              onClick={onExitDrawToView}
              data-tooltip={!isDesktop ? t(readModeEnabled ? "readingMode" : "exitDrawMode") : undefined}
              aria-label={t(readModeEnabled ? "readingMode" : "exitDrawMode")}
            >
              {EYE_ICON}
              {isDesktop && <span>{t(readModeEnabled ? "readingMode" : "exitDrawMode")}</span>}
            </button>
          ) : (
            <button
              className={modeBtnClass(isDesktop)}
              onClick={onToggleDrawMode}
              data-tooltip={!isDesktop ? t("switchToDrawMode") : undefined}
              aria-label={t("drawMode")}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 17c2-3 4-6 6-3s4 3 6 0 4-3 6 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 10c2-3 4-6 6-3s4 3 6 0 4-3 6 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isDesktop && <span>{t("drawMode")}</span>}
            </button>
          )}
        </div>
      )}
    </>
  );
}
