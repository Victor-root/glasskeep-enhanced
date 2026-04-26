// Typography preset editor, surfaced from SettingsPanel.
// Lets the user customise size, weight, colour, italic and underline for
// each block style (P, H1..H5) used by the rich-text editor. Values flow
// through applyTypographyPresets (CSS variables on :root) so edit-mode and
// view-mode stay consistent.

import React from "react";
import { t } from "../../i18n";
import {
  DEFAULT_TYPOGRAPHY_PRESETS,
  TYPOGRAPHY_SIZE_PRESETS,
  TYPOGRAPHY_WEIGHT_PRESETS,
  TYPOGRAPHY_COLOR_PRESETS,
  normalizeTypographyPresets,
} from "../../utils/typographyPresets.js";

const BLOCKS = [
  { key: "p",  labelKey: "typographyBlockParagraph" },
  { key: "h1", labelKey: "typographyBlockH1" },
  { key: "h2", labelKey: "typographyBlockH2" },
  { key: "h3", labelKey: "typographyBlockH3" },
  { key: "h4", labelKey: "typographyBlockH4" },
  { key: "h5", labelKey: "typographyBlockH5" },
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="settings-type-colors" role="group" aria-label={t("typographyFieldColor")}>
      <button
        type="button"
        className={`settings-type-color settings-type-color--none${value === null ? " is-current" : ""}`}
        onClick={() => onChange(null)}
        title={t("fmtDefault")}
        aria-label={t("fmtDefault")}
      >
        <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true">
          <line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {TYPOGRAPHY_COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          className={`settings-type-color${value === c ? " is-current" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
          title={c}
        />
      ))}
    </div>
  );
}

function Toggle({ active, onClick, label, sample }) {
  return (
    <button
      type="button"
      className={`settings-type-toggle${active ? " is-current" : ""}`}
      aria-pressed={active ? "true" : "false"}
      onClick={onClick}
      title={label}
    >
      {sample}
    </button>
  );
}

export default function TypographySettings({ presets, setPresets }) {
  const normalized = normalizeTypographyPresets(presets);

  const update = (block, patch) => {
    setPresets({
      ...normalized,
      [block]: { ...normalized[block], ...patch },
    });
  };

  const reset = () => setPresets({ ...DEFAULT_TYPOGRAPHY_PRESETS });

  return (
    <div className="settings-section">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-medium">{t("typographyTitle")}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{t("typographyDesc")}</div>
        </div>
        <button
          type="button"
          className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-300"
          onClick={reset}
        >
          {t("typographyReset")}
        </button>
      </div>
      <div className="settings-type-grid">
        {BLOCKS.map(({ key, labelKey }) => {
          const state = normalized[key];
          return (
            <div key={key} className="settings-type-row">
              <div
                className="settings-type-preview"
                style={{
                  fontSize: state.size,
                  fontWeight: state.weight,
                  color: state.color || undefined,
                  fontStyle: state.italic ? "italic" : undefined,
                  textDecoration: state.underline ? "underline" : undefined,
                  lineHeight: 1.15,
                }}
              >
                {t(labelKey)}
              </div>
              <div className="settings-type-controls">
                <label className="settings-type-field">
                  <span className="settings-type-field-label">{t("typographyFieldSize")}</span>
                  <select
                    value={state.size}
                    onChange={(e) => update(key, { size: e.target.value })}
                  >
                    {TYPOGRAPHY_SIZE_PRESETS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-type-field">
                  <span className="settings-type-field-label">{t("typographyFieldWeight")}</span>
                  <select
                    value={state.weight}
                    onChange={(e) => update(key, { weight: Number(e.target.value) })}
                  >
                    {TYPOGRAPHY_WEIGHT_PRESETS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {t(w.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="settings-type-field">
                  <span className="settings-type-field-label">{t("typographyFieldColor")}</span>
                  <ColorPicker
                    value={state.color}
                    onChange={(color) => update(key, { color })}
                  />
                </div>
                <div className="settings-type-field settings-type-field--inline">
                  <span className="settings-type-field-label">{t("typographyFieldStyle")}</span>
                  <div className="settings-type-toggles">
                    <Toggle
                      active={state.italic}
                      onClick={() => update(key, { italic: !state.italic })}
                      label={t("typographyFieldItalic")}
                      sample={<em>I</em>}
                    />
                    <Toggle
                      active={state.underline}
                      onClick={() => update(key, { underline: !state.underline })}
                      label={t("typographyFieldUnderline")}
                      sample={<span style={{ textDecoration: "underline" }}>U</span>}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
