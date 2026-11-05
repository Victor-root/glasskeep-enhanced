// src/components/admin/AttachmentsAdminSection.jsx
//
// The "Attachments" block of the admin panel.

import React, { useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { localizeServerError } from "../../utils/serverErrors.js";
import { api } from "../../utils/api.js";
import { formatFileSize } from "../../utils/attachments.js";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import { GRADIENT_BUTTON_CLASSES } from "../common/fieldClasses.js";

const MAX_ATTACHMENT_MB = 10240;

// How large a file can be attached, and what attachments take up so far.
export default function AttachmentsAdminSection({ open, value, authToken, onSave, showToast }) {
  const stored = String(value ?? 100);
  const [draft, setDraft] = useState(stored);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(null);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync the editable draft with the persisted value
    setDraft(stored);
  }, [stored]);

  React.useEffect(() => {
    if (open) api("/admin/attachments/usage", { token: authToken }).then(setUsage).catch(() => {});
  }, [open, authToken]);

  const parsed = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_ATTACHMENT_MB;
  const dirty = draft !== stored;

  const save = async () => {
    if (!valid || !dirty) return;
    setBusy(true);
    try {
      await onSave(parsed);
      showToast?.(t("saved"), "success");
    } catch (e) {
      showToast?.(localizeServerError(e?.message, "saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-3">
      <div className="flex items-center gap-3 min-w-0">
        <RowIcon icon={TI.Upload} />
        <div className="min-w-0">
          <div className="font-medium">{t("adminAttachmentLimit")}</div>
          <div className="text-sm text-gray-500">
            {t("adminAttachmentLimitHint")}
            {usage && ` ${t("adminAttachmentUsage", { files: usage.files, size: formatFileSize(usage.bytes) })}`}
          </div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="number"
          min="0"
          max={MAX_ATTACHMENT_MB}
          inputMode="numeric"
          aria-label={t("adminAttachmentLimit")}
          className="flex-1 px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          onClick={save}
          disabled={!dirty || !valid || busy}
          className={`shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${GRADIENT_BUTTON_CLASSES} disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100`}
        >
          {busy ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
