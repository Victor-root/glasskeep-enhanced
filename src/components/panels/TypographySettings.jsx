// Typography preset editor, surfaced from SettingsPanel.
// Lets the user pick a size + weight for each block style (P, H1, H2, H3)
// used by the rich-text editor. Values flow through applyTypographyPresets
// (CSS variables on :root) so edit-mode and view-mode stay consistent.

import React from "react";
import { t } from "../../i18n";
import {
  DEFAULT_TYPOGRAPHY_PRESETS,
  TYPOGRAPHY_SIZE_PRESETS,
  TYPOGRAPHY_WEIGHT_PRESETS,
  normalizeTypographyPresets,
} from "../../utils/typographyPresets.js";

const BLOCKS = [
  { key: "p",  labelKey: "typographyBlockParagraph" },
  { key: "h1", labelKey: "typographyBlockH1" },
  { key: "h2", labelKey: "typographyBlockH2" },
  { key: "h3", labelKey: "typographyBlockH3" },
];

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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
