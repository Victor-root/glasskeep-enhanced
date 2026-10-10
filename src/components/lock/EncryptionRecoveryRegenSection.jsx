import React, { useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";
import EncryptionRecoveryKeyBlock from "./EncryptionRecoveryKeyBlock.jsx";

// Issues a new recovery key.
export default function EncryptionRecoveryRegenSection({ token, showToast }) {
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api("/instance/recovery/regenerate", { method: "POST", token });
      if (res?.recoveryKey) setNewKey(res.recoveryKey);
    } catch (e) {
      showToast && showToast(localizeServerError(e?.message, "unlockFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  if (newKey) {
    return (
      <div className="space-y-2">
        <EncryptionRecoveryKeyBlock value={newKey} onAck={() => setNewKey("")} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("encryptionRecoveryRegenExplain")}
      </p>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="px-3 py-2 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {t("encryptionRecoveryRegenCta")}
      </button>
    </div>
  );
}
