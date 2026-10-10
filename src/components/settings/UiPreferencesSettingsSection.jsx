import React, { useState, useRef } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import Popover from "../common/Popover.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import WorkspaceThemeSection from "./WorkspaceThemeSection.jsx";

const SIDEBAR_BREAKPOINT_PRESETS = [
  { value: 1024, labelKey: "sidebarBreakpoint1024" },
  { value: 1280, labelKey: "sidebarBreakpoint1280" },
  { value: 1366, labelKey: "sidebarBreakpoint1366" },
  { value: 1440, labelKey: "sidebarBreakpoint1440" },
  { value: 1600, labelKey: "sidebarBreakpoint1600" },
];

// UI preferences section of the Settings panel: sidebar layout,
// edge-to-edge display on phones, background animations and the
// workspace colour theme.
export default function UiPreferencesSettingsSection({
  token,
  showToast,
  isMobileViewport,
  alwaysShowSidebarOnWide,
  setAlwaysShowSidebarOnWide,
  sidebarBreakpoint,
  setSidebarBreakpoint,
  edgeToEdgePortrait,
  setEdgeToEdgePortrait,
  edgeToEdgeLandscape,
  setEdgeToEdgeLandscape,
  floatingCardsEnabled,
  setFloatingCardsEnabled,
}) {
  const [breakpointMenuOpen, setBreakpointMenuOpen] = useState(false);
  const breakpointBtnRef = useRef(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.LayoutSidebar} />
          <div className="min-w-0">
            <div className="font-medium">{t("alwaysShowSidebarWide")}</div>
            <div className="text-sm text-gray-500">{t("keepTagsPanelVisible")}</div>
          </div>
        </div>
        <button
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
            alwaysShowSidebarOnWide
              ? "bg-[var(--gk-switch-on)]"
              : "bg-gray-300 dark:bg-gray-600"
          }`}
          onClick={() =>
            setAlwaysShowSidebarOnWide(!alwaysShowSidebarOnWide)
          }
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              alwaysShowSidebarOnWide
                ? "translate-x-6"
                : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {alwaysShowSidebarOnWide && (
        <div className="flex flex-col gap-2 px-3">
          <div className="min-w-0">
            <div className="font-medium">{t("sidebarBreakpoint")}</div>
            <div className="text-sm text-gray-500">{t("sidebarBreakpointDesc")}</div>
          </div>
          <button
            ref={breakpointBtnRef}
            type="button"
            onClick={() => setBreakpointMenuOpen((v) => !v)}
            className="w-full min-w-0 flex items-center justify-between gap-2 pl-3 pr-1.5 py-1.5 text-sm rounded-lg font-semibold border border-[var(--border-light)] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.99] transition-all duration-200"
            aria-haspopup="listbox"
            aria-expanded={breakpointMenuOpen}
          >
            <span className="truncate text-left flex-1 min-w-0">
              {t(
                (SIDEBAR_BREAKPOINT_PRESETS.find((p) => p.value === sidebarBreakpoint) || {}).labelKey
              ) || `≥ ${sidebarBreakpoint} px`}
            </span>
            <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-300/40 dark:shadow-none btn-gradient">
              <TI.ChevronDown
                className={`tabler-icon w-4 h-4 transition-transform ${breakpointMenuOpen ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          <Popover
            anchorRef={breakpointBtnRef}
            open={breakpointMenuOpen}
            onClose={() => setBreakpointMenuOpen(false)}
            offset={6}
          >
            <ul
              className="min-w-[16rem] rounded-xl border border-[var(--border-light)] bg-white dark:bg-[#222222] text-gray-800 dark:text-gray-100 shadow-xl py-1.5 overflow-hidden"
              role="listbox"
              onClick={(e) => e.stopPropagation()}
            >
              {SIDEBAR_BREAKPOINT_PRESETS.map((p) => {
                const selected = sidebarBreakpoint === p.value;
                return (
                  <li key={p.value} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors ${
                        selected
                          ? "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] font-semibold"
                          : "hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                      onClick={() => {
                        setBreakpointMenuOpen(false);
                        setSidebarBreakpoint(p.value);
                      }}
                    >
                      <span>{t(p.labelKey)}</span>
                      {selected && <TI.Check className="tabler-icon w-4 h-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover>
        </div>
      )}

      {/* "Edge-to-edge in portrait" is applied by the Android
          app itself (system bars), so it shows only in an app
          version that has the bridge for it. */}
      {isMobileViewport && typeof window.AndroidTheme?.setEdgeToEdgePortrait === "function" && (
        <div className="flex items-center justify-between gap-3 px-3">
          <div className="flex items-center gap-3 min-w-0">
            <RowIcon icon={TI.DeviceMobile} />
            <div className="min-w-0">
              <div className="font-medium">{t("edgeToEdgePortrait")}</div>
              <div className="text-sm text-gray-500">{t("edgeToEdgePortraitDesc")}</div>
            </div>
          </div>
          <button
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
              edgeToEdgePortrait
                ? "bg-[var(--gk-switch-on)]"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
            onClick={() => setEdgeToEdgePortrait(!edgeToEdgePortrait)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                edgeToEdgePortrait ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}

      {/* "Edge-to-edge in landscape" only makes sense on a
          phone (status bar / notch / cutout management).
          Hidden on desktop so the option doesn't clutter
          the UI section there. */}
      {isMobileViewport && (
        <div className="flex items-center justify-between gap-3 px-3">
          <div className="flex items-center gap-3 min-w-0">
            <RowIcon icon={TI.DeviceMobileRotated} />
            <div className="min-w-0">
              <div className="font-medium">{t("edgeToEdgeLandscape")}</div>
              <div className="text-sm text-gray-500">{t("edgeToEdgeLandscapeDesc")}</div>
            </div>
          </div>
          <button
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
              edgeToEdgeLandscape
                ? "bg-[var(--gk-switch-on)]"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
            onClick={() => setEdgeToEdgeLandscape(!edgeToEdgeLandscape)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                edgeToEdgeLandscape ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.Sparkles} />
          <div className="min-w-0">
            <div className="font-medium">{t("enableAnimationsMobile")}</div>
            <div className="text-sm text-gray-500">{t("enableAnimationsMobileDesc")}</div>
          </div>
        </div>
        <button
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
            floatingCardsEnabled ? "bg-[var(--gk-switch-on)]" : "bg-gray-300 dark:bg-gray-600"
          }`}
          onClick={() => setFloatingCardsEnabled(!floatingCardsEnabled)}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              floatingCardsEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Workspace colour theme (header + sidebar chrome only):
          its own group, separated by a hairline. */}
      <div className="pt-2 border-t border-[var(--border-light)]">
        <WorkspaceThemeSection token={token} showToast={showToast} />
      </div>

    </div>
  );
}
