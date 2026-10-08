import React, { useState, useEffect } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import {
  SHELL_THEMES,
  getActiveShellTheme,
  setShellTheme,
  SHELL_THEME_EVENT,
} from "../../theme/shellTheme.js";
import { api } from "../../utils/api.js";

// Workspace (shell) colour-theme picker. Themes recolour ONLY the header +
// sidebar chrome and the notes-canvas background (via --gk-chrome-* /
// --gk-app-bg token overrides on <html>); notes, note cards, panels and the
// login page are untouched. Selection applies live, is saved to the server
// (source of truth) AND cached in localStorage for instant boot, and is
// re-applied on load. GlassKeep is the default fallback.
export default function WorkspaceThemeSection({ token, showToast }) {
  // Seed from the theme actually applied right now (live <html> class), not
  // localStorage — on a fresh device the server value lands after mount.
  const [selected, setSelected] = useState(() => getActiveShellTheme());

  // Keep the checkmark in sync when the theme changes from anywhere else:
  // the initial server settings load and cross-device live-sync both call
  // setShellTheme(), which dispatches SHELL_THEME_EVENT.
  useEffect(() => {
    const sync = () => setSelected(getActiveShellTheme());
    document.addEventListener(SHELL_THEME_EVENT, sync);
    // Catch a change that may have landed between render and effect attach.
    sync();
    return () => document.removeEventListener(SHELL_THEME_EVENT, sync);
  }, []);

  const choose = async (id) => {
    if (id === selected) return;
    // Apply + cache locally first so the change is instant and survives a
    // refresh even if the network write fails.
    setShellTheme(id);
    setSelected(id);
    // Persist to the user's server profile (primary store, cross-device).
    try {
      await api("/user/settings", {
        method: "PATCH",
        body: { shellTheme: id },
        token,
      });
    } catch {
      showToast?.(t("workspaceThemeSaveError"), "error");
    }
  };

  return (
    <div className="space-y-3 px-3">
      <div className="flex items-center gap-3 min-w-0">
        <RowIcon icon={TI.Paint} />
        <div className="min-w-0">
          <div className="font-medium">{t("workspaceTheme")}</div>
          <div className="text-sm text-gray-500">{t("workspaceThemeDesc")}</div>
        </div>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={t("workspaceTheme")}
      >
        {SHELL_THEMES.map((theme) => {
          const isSel = theme.id === selected;
          const [primary, secondary, surface] = theme.swatch;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={isSel}
              onClick={() => choose(theme.id)}
              className={`relative flex flex-col overflow-hidden rounded-xl border text-left transition-all active:scale-[0.99] ${
                isSel
                  ? "border-[var(--gk-chrome-accent)] ring-2 ring-[var(--gk-chrome-accent)]"
                  : "border-[var(--border-light)] hover:border-[var(--gk-accent-soft-border)]"
              }`}
            >
              <span
                className="h-9 w-full flex items-center px-2"
                style={{ background: surface }}
              >
                <span
                  className="h-3.5 w-12 rounded-full"
                  style={{ background: `linear-gradient(to right, ${primary}, ${secondary})` }}
                />
              </span>
              <span className="flex items-center justify-between gap-1 px-2.5 py-1.5 bg-white dark:bg-gray-800">
                <span className="text-sm font-medium truncate">{theme.label}</span>
                {isSel && (
                  <TI.Check className="tabler-icon w-4 h-4 shrink-0 text-[var(--gk-chrome-accent)]" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
