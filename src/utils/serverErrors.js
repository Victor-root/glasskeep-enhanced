// src/utils/serverErrors.js
// Maps the English error messages emitted by the server (kept English
// so journalctl reads cleanly, and so non-localized clients/curl
// scripts still get something descriptive) to the localized strings
// shown in the UI. Falls back to the raw message if no pattern matches
// — that way an unknown error still surfaces its original text instead
// of being silently turned into a generic "Failed".
//
// Convention: include() rather than === so the matcher tolerates the
// "Activation failed: <reason>" / "Deactivation failed: <reason>"
// shapes the encryption routes use.

import { t } from "../i18n";

const PATTERNS = [
  // ── Auth / unlock ────────────────────────────────────────────────
  ["Invalid passphrase",                        "errInvalidPassphrase"],
  ["Invalid recovery key format",               "errInvalidRecoveryKeyFormat"],
  ["Invalid recovery key",                      "errInvalidRecoveryKey"],
  ["Passphrase is required",                    "errPassphraseRequired"],
  ["Recovery key is required",                  "errRecoveryKeyRequired"],
  ["Too many unlock attempts",                  "errTooManyUnlock"],
  ["Refusing to accept",                        "errPlaintextHttp"],
  ["Current passphrase is incorrect",           "errCurrentPassphrase"],
  ["Current passphrase is required",            "errCurrentPassphraseRequired"],
  ["Current password is incorrect",             "errCurrentPassword"],
  ["Incorrect password",                        "errIncorrectPassword"],
  ["Invalid token",                             "errInvalidToken"],
  ["Missing token",                             "errMissingToken"],
  ["Invalid key.",                              "errInvalidKey"],
  ["Secret key not recognized",                 "errSecretKeyNotRecognized"],
  ["No account found",                          "errNoAccountFound"],
  ["Email and password are required",           "errEmailPasswordRequired"],
  ["Name, email, and password are required",    "errNameEmailPasswordRequired"],
  ["New password must be at least",             "errNewPasswordTooShort"],

  // ── Vault state ──────────────────────────────────────────────────
  ["Encryption is not enabled",                 "errEncryptionNotEnabled"],
  ["Encryption is already enabled",             "errEncryptionAlreadyEnabled"],
  ["Unlock the instance first",                 "errUnlockFirst"],
  ["Instance is locked",                        "instanceLockedTitle"],
  ["Passphrase confirmation does not match",    "encryptionPassphraseMismatch"],
  ["Passphrase must be at least 8 characters",  "encryptionPassphraseTooShort"],
  ["New passphrase must be at least 8 characters", "encryptionPassphraseTooShort"],
  ["Activation failed",                         "errActivationFailed"],
  ["Deactivation failed",                       "errDeactivationFailed"],

  // ── Registration / users ─────────────────────────────────────────
  ["New account creation is currently disabled", "errRegistrationDisabled"],
  ["Email already registered",                   "errEmailAlreadyRegistered"],
  ["Email already in use by another user",       "errEmailInUseByAnother"],
  ["A registration request for this email is already pending", "errRegistrationPending"],
  ["A user with this email already exists",      "errUserAlreadyExists"],
  ["Pending registration not found",             "errPendingNotFound"],
  ["Cannot delete the last admin",               "errCantDeleteLastAdmin"],
  ["Cannot remove admin status from the last admin", "errCantRemoveLastAdmin"],
  ["You cannot delete yourself",                 "errCantDeleteSelf"],
  ["User not found",                             "errUserNotFound"],
  ["Invalid user id",                            "errInvalidUserId"],
  ["No valid fields to update",                  "errNoValidFields"],

  // ── Notes ────────────────────────────────────────────────────────
  ["Note not found or access denied",            "errNoteAccessDenied"],
  ["Note not found",                             "errNoteNotFound"],
  ["Note must be in trash to permanently delete", "errNoteNotInTrash"],
  ["client_updated_at is required",              "errClientUpdatedAtRequired"],
  ["client_reordered_at is required",            "errClientReorderedAtRequired"],
  ["Reorder payload contains notes you cannot access", "errReorderForbidden"],
  ["Invalid timestamp format",                   "errInvalidTimestamp"],
  ["Timestamp too far in the future",            "errTimestampFuture"],
  ["No notes to import",                         "errNoNotesToImport"],
  ["Import failed",                              "errImportFailed"],
  ["Invalid settings object",                    "errInvalidSettings"],

  // ── Collaboration ────────────────────────────────────────────────
  ["Username is required",                       "errUsernameRequired"],
  ["Cannot collaborate with yourself",           "errCantCollabSelf"],
  ["User is already a collaborator",             "errAlreadyCollaborator"],
  ["Failed to add collaborator",                 "errAddCollaboratorFailed"],
  ["Collaborator not found",                     "errCollaboratorNotFound"],
  ["Only note owner can remove other collaborators", "errOnlyOwnerCanRemove"],
  ["Only owner can delete for all collaborators", "errOnlyOwnerCanDeleteAll"],

  // ── Avatar / profile ─────────────────────────────────────────────
  ["avatar_url is required",                     "errAvatarRequired"],
  ["avatar_url must be a valid image data URL",  "errAvatarInvalidFormat"],
  ["Avatar image too large",                     "errAvatarTooLarge"],
  ["show_on_login must be a boolean",            "errShowOnLoginBoolean"],

  // ── AI ───────────────────────────────────────────────────────────
  ["AI Assistant is still initializing",         "errAiInitializing"],
  ["AI processing failed on server",             "errAiFailed"],
  ["Failed to initialize AI model",              "errAiInitFailed"],
  ["Missing question",                           "errMissingQuestion"],

  // ── Generic ──────────────────────────────────────────────────────
  ["Admin only",                                 "errAdminOnly"],
];

export function localizeServerError(message, fallbackKey = "genericError") {
  if (!message) return t(fallbackKey);
  const m = String(message);
  for (const [needle, key] of PATTERNS) {
    if (m.includes(needle)) return t(key);
  }
  return m;
}
