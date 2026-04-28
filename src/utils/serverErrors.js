// src/utils/serverErrors.js
// Maps the English error messages emitted by the encryption / unlock
// routes (kept English on the server so they read cleanly in
// journalctl) to the localized strings used in the UI. Falls back to
// the raw message if it doesn't match any known pattern, so unknown
// errors still surface their original text instead of a silent
// "Failed" placeholder.

import { t } from "../i18n";

export function localizeServerError(message, fallbackKey = "unlockFailed") {
  if (!message) return t(fallbackKey);
  const m = String(message);
  // Auth / unlock
  if (m.includes("Invalid passphrase")) return t("unlockErrorInvalidPassphrase");
  if (m.includes("Invalid recovery key format")) return t("unlockErrorInvalidRecoveryKeyFormat");
  if (m.includes("Invalid recovery key")) return t("unlockErrorInvalidRecoveryKey");
  if (m.includes("Passphrase is required")) return t("unlockErrorPassphraseRequired");
  if (m.includes("Recovery key is required")) return t("unlockErrorRecoveryKeyRequired");
  if (m.includes("Too many unlock attempts")) return t("unlockErrorTooMany");
  if (m.includes("Refusing to accept unlock secret")) return t("unlockErrorPlaintextHttp");
  if (m.includes("Current passphrase is incorrect")) return t("unlockErrorCurrentPassphrase");
  // Vault state
  if (m.includes("Encryption is not enabled")) return t("unlockErrorEncryptionNotEnabled");
  if (m.includes("Encryption is already enabled")) return t("unlockErrorEncryptionAlreadyEnabled");
  if (m.includes("Unlock the instance first")) return t("unlockErrorUnlockFirst");
  if (m.includes("Instance is locked")) return t("instanceLockedTitle");
  // Activation / deactivation / rotation
  if (m.includes("Passphrase confirmation does not match")) return t("encryptionPassphraseMismatch");
  if (m.includes("Passphrase must be at least 8 characters")) return t("encryptionPassphraseTooShort");
  if (m.includes("New passphrase must be at least 8 characters")) return t("encryptionPassphraseTooShort");
  if (m.startsWith("Activation failed")) return t("unlockErrorActivationFailed");
  if (m.startsWith("Deactivation failed")) return t("unlockErrorDeactivationFailed");
  return m;
}
