// Dedicated full-screen modal for the typography-preset editor.
//
// The settings side sheet is too narrow to display all the controls
// (size / weight / colour / italic / underline × 6 block types) without
// cramming them. The settings panel now exposes a button that opens this
// modal, which is free to use the full viewport width and therefore
// allows a "real" customisation layout with THREE profiles the user
// can switch between.

import React, { useEffect } from "react";
import { t } from "../../i18n";
import { CloseIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import {
  DEFAULT_PROFILE,
  PROFILE_KEYS,
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

const PROFILE_LABEL_KEYS = {
  profile1: "typographyProfile1",
  profile2: "typographyProfile2",
  profile3: "typographyProfile3",
};

function ColorRow({ value, onChange }) {
  return (
    <div className="typo-modal-colors" role="group" aria-label={t("typographyFieldColor")}>
      <button
        type="button"
        className={`typo-modal-color typo-modal-color--none${value === null ? " is-current" : ""}`}
        onClick={() => onChange(null)}
        title={t("fmtDefault")}
        aria-label={t("fmtDefault")}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {TYPOGRAPHY_COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          className={`typo-modal-color${value === c ? " is-current" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
          title={c}
        />
      ))}
      {/* Free-form colour picker for users who want exact control. */}
      <label className="typo-modal-color-custom" title={t("typographyFieldColor")}>
        <input
          type="color"
          value={value || "#111827"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("typographyFieldColor")}
        />
      </label>
    </div>
  );
}

function Toggle({ active, onClick, label, icon }) {
  return (
    <button
      type="button"
      className={`typo-modal-toggle${active ? " is-current" : ""}`}
      aria-pressed={active ? "true" : "false"}
      onClick={onClick}
    >
      <span className="typo-modal-toggle-sample">{icon}</span>
      <span className="typo-modal-toggle-label">{label}</span>
    </button>
  );
}

function BlockCard({ blockKey, labelKey, state, update }) {
  const label = t(labelKey);
  return (
    <div className="typo-modal-card" data-block={blockKey}>
      <div
        className="typo-modal-card-preview"
        style={{
          fontSize: state.size,
          fontWeight: state.weight,
          color: state.color || undefined,
          fontStyle: state.italic ? "italic" : undefined,
          textDecoration: state.underline ? "underline" : undefined,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div className="typo-modal-card-hint">{t("typographyCardHint")}</div>

      <div className="typo-modal-fields">
        <label className="typo-modal-field">
          <span className="typo-modal-field-label">{t("typographyFieldSize")}</span>
          <select
            value={state.size}
            onChange={(e) => update({ size: e.target.value })}
          >
            {TYPOGRAPHY_SIZE_PRESETS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="typo-modal-field">
          <span className="typo-modal-field-label">{t("typographyFieldWeight")}</span>
          <select
            value={state.weight}
            onChange={(e) => update({ weight: Number(e.target.value) })}
          >
            {TYPOGRAPHY_WEIGHT_PRESETS.map((w) => (
              <option key={w.value} value={w.value}>
                {t(w.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <div className="typo-modal-field typo-modal-field--wide">
          <span className="typo-modal-field-label">{t("typographyFieldColor")}</span>
          <ColorRow
            value={state.color}
            onChange={(color) => update({ color })}
          />
        </div>

        <div className="typo-modal-field typo-modal-field--wide">
          <span className="typo-modal-field-label">{t("typographyFieldStyle")}</span>
          <div className="typo-modal-toggles">
            <Toggle
              active={state.italic}
              onClick={() => update({ italic: !state.italic })}
              label={t("typographyFieldItalic")}
              icon={<TI.Italic />}
            />
            <Toggle
              active={state.underline}
              onClick={() => update({ underline: !state.underline })}
              label={t("typographyFieldUnderline")}
              icon={<TI.Underline />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileTabs({ active, onSwitch }) {
  return (
    <div className="typo-modal-profiles" role="tablist" aria-label={t("typographyProfileLabel")}>
      {PROFILE_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key ? "true" : "false"}
          className={`typo-modal-profile${active === key ? " is-active" : ""}`}
          onClick={() => onSwitch(key)}
        >
          {t(PROFILE_LABEL_KEYS[key])}
        </button>
      ))}
    </div>
  );
}

export default function TypographyModal({ open, onClose, presets, setPresets, dark }) {
  const normalized = normalizeTypographyPresets(presets);
  const activeKey = normalized.active;
  const activeProfile = normalized[activeKey];

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const switchProfile = (key) => {
    if (key === activeKey) return;
    setPresets({ ...normalized, active: key });
  };

  const updateBlock = (block, patch) => {
    setPresets({
      ...normalized,
      [activeKey]: {
        ...activeProfile,
        [block]: { ...activeProfile[block], ...patch },
      },
    });
  };

  // Reset only touches the profile currently on screen — other profiles
  // keep whatever the user set up for them.
  const resetActiveProfile = () => {
    setPresets({
      ...normalized,
      [activeKey]: { ...DEFAULT_PROFILE },
    });
  };

  return (
    <div
      className={`typo-modal-scrim${dark ? " typo-modal-scrim--dark" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="typo-modal" role="dialog" aria-label={t("typographyTitle")}>
        <header className="typo-modal-header">
          <div className="typo-modal-header-main">
            <div className="typo-modal-title">{t("typographyTitle")}</div>
            <div className="typo-modal-desc">{t("typographyDesc")}</div>
            <ProfileTabs active={activeKey} onSwitch={switchProfile} />
          </div>
          <div className="typo-modal-header-actions">
            <button
              type="button"
              className="px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
              onClick={resetActiveProfile}
              title={t("typographyResetActiveHint")}
            >
              {t("typographyResetActive")}
            </button>
            <button
              type="button"
              className="typo-modal-close"
              onClick={onClose}
              aria-label={t("close")}
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="typo-modal-body">
          {BLOCKS.map(({ key, labelKey }) => (
            <BlockCard
              key={`${activeKey}-${key}`}
              blockKey={key}
              labelKey={labelKey}
              state={activeProfile[key]}
              update={(patch) => updateBlock(key, patch)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
