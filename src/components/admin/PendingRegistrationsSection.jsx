// src/components/admin/PendingRegistrationsSection.jsx
//
// The "Pending registrations" block of the admin panel: each account
// waiting for approval, with reject / approve actions.

import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { localizeServerError } from "../../utils/serverErrors.js";
import { RowIcon, SettingsSection } from "../common/SettingsAccordion.jsx";

export default function PendingRegistrationsSection({
  open,
  onToggle,
  pendingUsers,
  approvePendingUser,
  rejectPendingUser,
  showGenericConfirm,
  showToast,
}) {
  return (
    <div className="mb-2">
      <SettingsSection
        icon={TI.UserClock}
        title={
          <span className="flex items-center gap-2">
            <span>{t("pendingRegistrations")}</span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded-full">
              {pendingUsers.length}
            </span>
          </span>
        }
        open={open}
        onToggle={onToggle}
      >
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 pl-3">
          {t("pendingRegistrationsDesc")}
        </p>
        <div className="space-y-3">
          {pendingUsers.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-3 py-3 border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50/50 dark:bg-amber-900/20"
            >
              <RowIcon icon={TI.UserCircle} />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-sm text-gray-500 truncate">{p.email}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {t("requestedOnPrefix")} {new Date(p.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  onClick={() => {
                    showGenericConfirm({
                      title: t("rejectRegistrationTitle"),
                      message: t("rejectRegistrationConfirm").replace("{name}", p.name),
                      confirmText: t("reject"),
                      danger: true,
                      onConfirm: async () => {
                        try {
                          await rejectPendingUser(p.id);
                          showToast(t("registrationRejected"), "info", undefined, "user-x");
                        } catch (err) {
                          showToast(localizeServerError(err.message, "failedRejectUser"), "error");
                        }
                      },
                    });
                  }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
                  data-tooltip={t("reject")}
                  aria-label={t("reject")}
                >
                  <TI.X className="tabler-icon w-5 h-5" />
                </button>
                <button
                  onClick={async () => {
                    try {
                      await approvePendingUser(p.id);
                      showToast(t("registrationApproved"), "success", undefined, "user-check");
                    } catch (err) {
                      showToast(localizeServerError(err.message, "failedApproveUser"), "error");
                    }
                  }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"
                  data-tooltip={t("approve")}
                  aria-label={t("approve")}
                >
                  <TI.Check className="tabler-icon w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
