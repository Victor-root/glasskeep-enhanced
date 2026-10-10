import React, { useState, useEffect } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import {
  getActiveShellTheme,
  setShellTheme,
  SHELL_THEME_EVENT,
} from "../../theme/shellTheme.js";
import { api } from "../../utils/api.js";
import ShellThemeGrid from "./ShellThemeGrid.jsx";

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

      <ShellThemeGrid label={t("workspaceTheme")} selected={selected} onChoose={choose} />
    </div>
  );
}
