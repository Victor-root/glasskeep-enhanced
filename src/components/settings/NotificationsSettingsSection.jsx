import React, { useState, useRef } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import Popover from "../common/Popover.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import PushNotificationToggle from "./PushNotificationToggle.jsx";
import { GRADIENT_BUTTON_CLASSES } from "../common/fieldClasses.js";

// Notifications section of the Settings panel: position, sound (with a
// per-category sub-list), display filter, default duration and push.
export default function NotificationsSettingsSection({
  token,
  isMobileViewport,
  notificationsPosition,
  setNotificationsPosition,
  notificationsPositionMobile,
  setNotificationsPositionMobile,
  notificationsSound,
  setNotificationsSound,
  notificationsSoundTypes,
  setNotificationsSoundTypes,
  notificationsFilterTypes,
  setNotificationsFilterTypes,
  notificationsDuration,
  setNotificationsDuration,
}) {
  const [notifPosMenuOpen, setNotifPosMenuOpen] = useState(false);
  const notifPosBtnRef = useRef(null);
  const [notifDurMenuOpen, setNotifDurMenuOpen] = useState(false);
  const notifDurBtnRef = useRef(null);
  const [notifSoundTypesOpen, setNotifSoundTypesOpen] = useState(false);
  const [notifFilterTypesOpen, setNotifFilterTypesOpen] = useState(false);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <RowIcon icon={TI.FloatCenter} />
            <div className="min-w-0">
              <div className="font-medium">{t("notificationsPositionTitle")}</div>
              <div className="text-sm text-gray-500">{t("notificationsPositionDesc")}</div>
            </div>
          </div>
          {isMobileViewport ? (
            // Mobile: 2 options only (top / bottom). The
            // floating pill is full-width and centred
            // horizontally on mobile via CSS, so left /
            // center / right are visually identical; only
            // the vertical anchor matters. Mobile selections
            // map to top-center / bottom-center so the
            // existing position value stays in the same
            // namespace as desktop.
            (() => {
              const mobileValue = notificationsPositionMobile === "top" ? "top" : "bottom";
              const apply = (v) => {
                setNotificationsPositionMobile?.(v === "top" ? "top" : "bottom");
              };
              return (
                <div
                  className="shrink-0 inline-flex items-center rounded-lg overflow-hidden border border-[var(--border-light)]"
                  role="group"
                  aria-label={t("notificationsPositionTitle")}
                >
                  {[
                    { value: "top", label: t("posTop") },
                    { value: "bottom", label: t("posBottom") },
                  ].map((opt) => {
                    const selected = mobileValue === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => apply(opt.value)}
                        aria-pressed={selected}
                        className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                          selected
                            ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white btn-gradient"
                            : "bg-transparent text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()
          ) : (
            <>
              <button
                ref={notifPosBtnRef}
                type="button"
                onClick={() => setNotifPosMenuOpen((v) => !v)}
                className={`shrink-0 inline-flex items-center justify-between gap-2 min-w-[9rem] px-3 py-1.5 text-sm rounded-lg font-semibold transition-all duration-200 ${GRADIENT_BUTTON_CLASSES}`}
                aria-haspopup="listbox"
                aria-expanded={notifPosMenuOpen}
              >
                <span>{t(`pos${(notificationsPosition || "top-right").replace(/-/g, " ").replace(/(?:^|\s)\S/g, (m) => m.toUpperCase()).replace(/\s/g, "")}`)}</span>
                <TI.ChevronDown
                  className={`tabler-icon w-4 h-4 transition-transform ${notifPosMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              <Popover
                anchorRef={notifPosBtnRef}
                open={notifPosMenuOpen}
                onClose={() => setNotifPosMenuOpen(false)}
                offset={6}
              >
                <ul
                  className="min-w-[11rem] rounded-xl border border-[var(--border-light)] bg-white dark:bg-[#222222] text-gray-800 dark:text-gray-100 shadow-xl py-1.5 overflow-hidden"
                  role="listbox"
                  onClick={(e) => e.stopPropagation()}
                >
                  {[
                    { value: "top-left", label: t("posTopLeft") },
                    { value: "top-center", label: t("posTopCenter") },
                    { value: "top-right", label: t("posTopRight") },
                    { value: "bottom-left", label: t("posBottomLeft") },
                    { value: "bottom-center", label: t("posBottomCenter") },
                    { value: "bottom-right", label: t("posBottomRight") },
                  ].map((opt) => {
                    const selected = (notificationsPosition || "top-right") === opt.value;
                    return (
                      <li key={opt.value} role="option" aria-selected={selected}>
                        <button
                          type="button"
                          className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors ${
                            selected
                              ? "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] font-semibold"
                              : "hover:bg-black/5 dark:hover:bg-white/10"
                          }`}
                          onClick={() => {
                            setNotifPosMenuOpen(false);
                            setNotificationsPosition?.(opt.value);
                          }}
                        >
                          <span>{opt.label}</span>
                          {selected && <TI.Check className="tabler-icon w-4 h-4 shrink-0" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Popover>
            </>
          )}
        </div>

        {/* Sound row + collapsible per-category sub-list. The
            chevron flips the sub-list open so the user can
            opt out of specific categories (share, access,
            success, warning, error, info) without disabling
            the master toggle. */}
        <div>
          <div className="flex items-center justify-between gap-3 px-3">
            <div className="flex items-center gap-3 min-w-0">
              <RowIcon icon={TI.Volume} />
              <div className="min-w-0">
                <div className="font-medium">{t("notificationsSoundTitle")}</div>
                <div className="text-sm text-gray-500">{t("notificationsSoundDesc")}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t("notificationsSoundTypesLabel")}
                aria-expanded={notifSoundTypesOpen}
                onClick={() => setNotifSoundTypesOpen((v) => !v)}
                className={`shrink-0 p-1.5 rounded-md transition-colors ${
                  notifSoundTypesOpen
                    ? "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)]"
                    : "text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                <TI.ChevronDown
                  className={`tabler-icon w-4 h-4 transition-transform ${notifSoundTypesOpen ? "rotate-180" : ""}`}
                />
              </button>
              <button
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  notificationsSound
                    ? "bg-[var(--gk-switch-on)]"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
                onClick={() => setNotificationsSound?.(!notificationsSound)}
                aria-pressed={notificationsSound}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notificationsSound ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
          {notifSoundTypesOpen ? (
            <div className="mt-2 ml-10 mr-3 flex flex-col gap-1 px-3 py-2 rounded-lg border border-[var(--border-light)] bg-black/[0.02] dark:bg-white/[0.03]">
              {[
                { key: "share",   label: t("soundTypeShare"),   icon: TI.UserShare,         iconClassName: "" },
                { key: "access",  label: t("soundTypeAccess"),  icon: TI.UserX,             iconClassName: "" },
                { key: "success", label: t("soundTypeSuccess"), icon: TI.CircleCheckFilled,   iconClassName: "tabler-icon--filled", color: "#10b981" },
                { key: "warning", label: t("soundTypeWarning"), icon: TI.AlertTriangleFilled, iconClassName: "tabler-icon--filled", color: "#f59e0b" },
                { key: "error",   label: t("soundTypeError"),   icon: TI.AlertCircleFilled,   iconClassName: "tabler-icon--filled", color: "#ef4444" },
                { key: "info",    label: t("soundTypeInfo"),    icon: TI.InfoCircleFilled,    iconClassName: "tabler-icon--filled", color: "#3b82f6" },
              ].map((row) => {
                const enabled = notificationsSoundTypes?.[row.key] !== false;
                const Icon = row.icon;
                return (
                  <div
                    key={row.key}
                    className={`flex items-center justify-between gap-3 py-1.5 text-sm ${
                      notificationsSound ? "" : "opacity-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon
                        className={`tabler-icon ${row.iconClassName || ""}`}
                        style={{
                          width: 16,
                          height: 16,
                          ...(row.color ? { color: row.color } : null),
                        }}
                      />
                      <span>{row.label}</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      disabled={!notificationsSound}
                      onClick={() =>
                        setNotificationsSoundTypes?.((prev) => ({
                          ...(prev || {}),
                          [row.key]: !enabled,
                        }))
                      }
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                        enabled
                          ? "bg-gradient-to-r from-indigo-500 to-violet-600 btn-gradient"
                          : "bg-gray-300 dark:bg-gray-600"
                      } ${notificationsSound ? "" : "cursor-not-allowed"}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          enabled ? "translate-x-[18px]" : "translate-x-[2px]"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Per-category display filter: same chevron-expand
            pattern as the sound types sub-list above. The user
            can independently mute entire categories (e.g. "I
            don't care about cross-server status changes"). */}
        <div>
          <div className="flex items-center justify-between gap-3 px-3">
            <div className="flex items-center gap-3 min-w-0">
              <RowIcon icon={TI.Bell} />
              <div className="min-w-0">
                <div className="font-medium">{t("notificationsFilterTitle")}</div>
                <div className="text-sm text-gray-500">{t("notificationsFilterDesc")}</div>
              </div>
            </div>
            <button
              type="button"
              aria-label={t("notificationsFilterTypesLabel")}
              aria-expanded={notifFilterTypesOpen}
              onClick={() => setNotifFilterTypesOpen((v) => !v)}
              className={`shrink-0 p-1.5 rounded-md transition-colors ${
                notifFilterTypesOpen
                  ? "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)]"
                  : "text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <TI.ChevronDown
                className={`tabler-icon w-4 h-4 transition-transform ${notifFilterTypesOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {notifFilterTypesOpen ? (
            <div className="mt-2 ml-10 mr-3 flex flex-col gap-1 px-3 py-2 rounded-lg border border-[var(--border-light)] bg-black/[0.02] dark:bg-white/[0.03]">
              {[
                { key: "federation", label: t("filterTypeFederation"), icon: TI.WorldWww,           iconClassName: "" },
                { key: "share",      label: t("filterTypeShare"),      icon: TI.UserShare,          iconClassName: "" },
                { key: "access",     label: t("filterTypeAccess"),     icon: TI.UserX,              iconClassName: "" },
                { key: "reminder",   label: t("filterTypeReminder"),   icon: TI.BellRingingFilled,  iconClassName: "tabler-icon--filled", color: "#6366f1" },
                { key: "success",    label: t("filterTypeSuccess"),    icon: TI.CircleCheckFilled,  iconClassName: "tabler-icon--filled", color: "#10b981" },
                { key: "warning",    label: t("filterTypeWarning"),    icon: TI.AlertTriangleFilled,iconClassName: "tabler-icon--filled", color: "#f59e0b" },
                { key: "error",      label: t("filterTypeError"),      icon: TI.AlertCircleFilled,  iconClassName: "tabler-icon--filled", color: "#ef4444" },
                { key: "info",       label: t("filterTypeInfo"),       icon: TI.InfoCircleFilled,   iconClassName: "tabler-icon--filled", color: "#3b82f6" },
              ].map((row) => {
                const enabled = notificationsFilterTypes?.[row.key] !== false;
                const Icon = row.icon;
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-3 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon
                        className={`tabler-icon ${row.iconClassName || ""}`}
                        style={{
                          width: 16,
                          height: 16,
                          ...(row.color ? { color: row.color } : null),
                        }}
                      />
                      <span>{row.label}</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      onClick={() =>
                        setNotificationsFilterTypes?.((prev) => ({
                          ...(prev || {}),
                          [row.key]: !enabled,
                        }))
                      }
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                        enabled
                          ? "bg-gradient-to-r from-indigo-500 to-violet-600 btn-gradient"
                          : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          enabled ? "translate-x-[18px]" : "translate-x-[2px]"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <RowIcon icon={TI.Clock} />
            <div className="min-w-0">
              <div className="font-medium">{t("notificationsDurationTitle")}</div>
              <div className="text-sm text-gray-500">{t("notificationsDurationDesc")}</div>
            </div>
          </div>
          <button
            ref={notifDurBtnRef}
            type="button"
            onClick={() => setNotifDurMenuOpen((v) => !v)}
            className={`shrink-0 inline-flex items-center justify-between gap-2 min-w-[7rem] px-3 py-1.5 text-sm rounded-lg font-semibold transition-all duration-200 ${GRADIENT_BUTTON_CLASSES}`}
            aria-haspopup="listbox"
            aria-expanded={notifDurMenuOpen}
          >
            <span>
              {notificationsDuration == null
                ? t("notifDurPersistent")
                : t("notifDurSeconds", { n: notificationsDuration / 1000 })}
            </span>
            <TI.ChevronDown
              className={`tabler-icon w-4 h-4 transition-transform ${notifDurMenuOpen ? "rotate-180" : ""}`}
            />
          </button>
          <Popover
            anchorRef={notifDurBtnRef}
            open={notifDurMenuOpen}
            onClose={() => setNotifDurMenuOpen(false)}
            offset={6}
          >
            <ul
              className="min-w-[9rem] rounded-xl border border-[var(--border-light)] bg-white dark:bg-[#222222] text-gray-800 dark:text-gray-100 shadow-xl py-1.5 overflow-hidden"
              role="listbox"
              onClick={(e) => e.stopPropagation()}
            >
              {[
                { value: 5000, label: t("notifDurSeconds", { n: 5 }) },
                { value: 10000, label: t("notifDurSeconds", { n: 10 }) },
                { value: 20000, label: t("notifDurSeconds", { n: 20 }) },
                { value: 30000, label: t("notifDurSeconds", { n: 30 }) },
                { value: null, label: t("notifDurPersistent") },
              ].map((opt) => {
                const selected = notificationsDuration === opt.value;
                return (
                  <li key={opt.value ?? "persistent"} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors ${
                        selected
                          ? "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] font-semibold"
                          : "hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                      onClick={() => {
                        setNotifDurMenuOpen(false);
                        setNotificationsDuration?.(opt.value);
                      }}
                    >
                      <span>{opt.label}</span>
                      {selected && <TI.Check className="tabler-icon w-4 h-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover>
        </div>
      </div>

      {/* Push notifications: system reminders on installed PWAs. */}
      <PushNotificationToggle token={token} />
    </>
  );
}
