package com.glasskeep.app.nativeapp.ui

import android.content.Context
import androidx.annotation.StringRes
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.ServerRefusal
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * What the web's api() throws as the message of a failed request
 * (utils/api.js): the server's own `error` text, `HTTP <code>` without
 * one (nothing for a signed-out 401), its unreachable-server sentence for a proxy's bodyless 502 to 504,
 * and its timeout and network sentences.
 */
internal fun Context.requestErrorText(t: Throwable): String = when (t) {
    is ServerRefusal -> t.error ?: when {
        // A signed-out 401 is the answer about the secret just typed: no
        // text, so the screen's own fallback speaks.
        t.status == 401 -> if (t.authenticated) getString(R.string.native_session_expired) else ""
        t.status in 502..504 -> getString(R.string.native_server_unreachable)
        else -> "HTTP ${t.status}"
    }
    is SocketTimeoutException -> getString(R.string.native_request_timeout)
    is IOException -> getString(R.string.native_network_error)
    else -> t.message.orEmpty()
}

/** What the web's bare fetch() helpers (deviceLinkClient.js) throw as the
 *  message: the server's `error` text or `HTTP <code>`, and Chromium's own
 *  "Failed to fetch" when the server can't be reached. */
internal fun fetchErrorText(t: Throwable): String = when (t) {
    is ServerRefusal -> t.error ?: "HTTP ${t.status}"
    is IOException -> "Failed to fetch"
    else -> t.message.orEmpty()
}

/** serverErrors.js's localizeServerError(): the server's English text,
 *  reworded when one of its known needles is in it (the first one wins),
 *  shown as the server wrote it otherwise, and [fallback] when there is
 *  no text at all. */
internal fun Context.localizedServerError(message: String?, @StringRes fallback: Int): String {
    if (message.isNullOrEmpty()) return getString(fallback)
    val known = ServerErrorPatterns.firstOrNull { (needle, _) -> needle in message } ?: return message
    return getString(known.second)
}

/** serverErrors.js's localizeSecretRejection(): a 401 without a reason
 *  is the typed secret being refused ([rejected]); anything else is the
 *  request's message, reworded, with [fallback] when it has none. */
internal fun Context.secretRejectionText(t: Throwable, @StringRes rejected: Int, @StringRes fallback: Int): String =
    if (t is ServerRefusal && t.status == 401 && t.error.isNullOrEmpty()) {
        getString(rejected)
    } else {
        localizedServerError(requestErrorText(t), fallback)
    }

/** LoginView.jsx's reading of a failed sign-in: a refused secret as above,
 *  a request that failed with a reason reworded, anything else the
 *  unexpected-error line. */
internal fun Context.loginErrorText(t: Throwable): String = when {
    t is ServerRefusal && t.status == 401 -> secretRejectionText(t, R.string.native_err_invalid_credentials, R.string.native_login_failed)
    t is ServerRefusal || t is IOException -> localizedServerError(requestErrorText(t), R.string.native_login_unexpected_error)
    else -> getString(R.string.native_login_unexpected_error)
}

/** The needles of serverErrors.js the app can run into, in its order. */
private val ServerErrorPatterns = listOf(
    "Invalid passphrase" to R.string.native_err_invalid_passphrase,
    "Invalid recovery key format" to R.string.native_err_invalid_recovery_key_format,
    "Invalid recovery key" to R.string.native_err_invalid_recovery_key,
    "Passphrase is required" to R.string.native_err_passphrase_required,
    "Recovery key is required" to R.string.native_err_recovery_key_required,
    "Too many unlock attempts" to R.string.native_err_too_many_unlock,
    "Refusing to accept" to R.string.native_err_plaintext_http,
    "Current passphrase is incorrect" to R.string.native_err_current_passphrase,
    "Current passphrase is required" to R.string.native_err_current_passphrase_required,
    "Invalid email or password" to R.string.native_err_invalid_credentials,
    "Too many sign-in attempts" to R.string.native_err_too_many_sign_in,
    "Invalid token" to R.string.native_err_invalid_token,
    "Missing token" to R.string.native_err_missing_token,
    "Invalid key." to R.string.native_err_invalid_key,
    "Secret key not recognized" to R.string.native_err_secret_key_not_recognized,
    "No account found" to R.string.native_err_no_account_found,
    "Email and password are required" to R.string.native_err_email_password_required,
    "Name, email, and password are required" to R.string.native_err_name_email_password_required,
    "New password must be at least" to R.string.native_err_new_password_too_short,
    "Password must be at least" to R.string.native_err_password_too_short,
    "Encryption is not enabled" to R.string.native_err_encryption_not_enabled,
    "Encryption is already enabled" to R.string.native_err_encryption_already_enabled,
    "Unlock the instance first" to R.string.native_err_unlock_first,
    "Instance is locked" to R.string.native_instance_locked_title,
    "Passphrase confirmation does not match" to R.string.native_err_passphrase_mismatch,
    "Passphrase must be at least 8 characters" to R.string.native_err_passphrase_too_short,
    "New passphrase must be at least 8 characters" to R.string.native_err_passphrase_too_short,
    "Activation failed" to R.string.native_err_activation_failed,
    "Deactivation failed" to R.string.native_err_deactivation_failed,
    "New account creation is currently disabled" to R.string.native_err_registration_disabled,
    "Email already registered" to R.string.native_err_email_already_registered,
    "Email already in use by another user" to R.string.native_err_email_in_use_by_another,
    "A registration request for this email is already pending" to R.string.native_err_registration_pending,
    "A user with this email already exists" to R.string.native_err_user_already_exists,
    "Pending registration not found" to R.string.native_err_pending_not_found,
    "Cannot delete the last admin" to R.string.native_err_cant_delete_last_admin,
    "Cannot remove admin status from the last admin" to R.string.native_err_cant_remove_last_admin,
    "You cannot delete yourself" to R.string.native_err_cant_delete_self,
    "User not found" to R.string.native_err_user_not_found,
    "Invalid user id" to R.string.native_err_invalid_user_id,
    "No valid fields to update" to R.string.native_err_no_valid_fields,
    "Note not found or access denied" to R.string.native_err_note_access_denied,
    "Note not found" to R.string.native_err_note_not_found,
    "Failed to add collaborator" to R.string.native_err_add_collaborator_failed,
    "Collaborator not found" to R.string.native_err_collaborator_not_found,
    "peer_not_paired" to R.string.native_err_peer_not_paired,
    "clock-skew" to R.string.native_err_peer_clock_skew,
    "note_id_conflict" to R.string.native_err_peer_note_id_conflict,
    "payload_too_large" to R.string.native_err_peer_payload_too_large,
    "federation_failed" to R.string.native_err_federation_failed,
    "tls-certificate-invalid" to R.string.native_err_peer_tls_invalid,
    "dns-not-found" to R.string.native_err_peer_dns_not_found,
    "connection-refused" to R.string.native_err_peer_unreachable,
    "unreachable" to R.string.native_err_peer_unreachable,
    "AI is disabled" to R.string.native_err_ai_disabled,
    "AI is not configured" to R.string.native_err_ai_not_configured,
    "AI base URL is not set" to R.string.native_err_ai_base_url_missing,
    "ai_url_private_forbidden" to R.string.native_err_ai_url_private_forbidden,
    "ai_url_unresolvable" to R.string.native_err_ai_url_unresolvable,
    "ai_url_credentials" to R.string.native_err_ai_url_credentials,
    "ai_url_malformed" to R.string.native_err_ai_url_malformed,
    "ai_url_scheme" to R.string.native_err_ai_url_scheme,
    "AI model is not set" to R.string.native_err_ai_model_missing,
    "Failed to reach AI provider" to R.string.native_err_ai_unreachable,
    "AI provider error" to R.string.native_err_ai_provider,
    "Passkeys are not configured for this domain" to R.string.native_err_passkey_domain_not_set,
    "This passkey is not authorised to unlock the instance" to R.string.native_err_passkey_not_authorised_unlock,
    "Only admin passkeys can unlock the instance" to R.string.native_err_passkey_only_admin_unlock,
    "Unlock wrap missing for this passkey" to R.string.native_err_passkey_unlock_wrap_missing,
    "Could not unwrap DEK with this passkey" to R.string.native_err_passkey_unwrap_dek_failed,
    "Could not save unlock wrap" to R.string.native_err_passkey_unlock_wrap_save_failed,
    "Could not save passkey" to R.string.native_err_passkey_save_failed,
    "Failed to start passkey registration" to R.string.native_err_passkey_reg_start_failed,
    "Failed to start passkey login" to R.string.native_err_passkey_login_start_failed,
    "Failed to start promotion ceremony" to R.string.native_err_passkey_promotion_failed,
    "Passkey does not support PRF" to R.string.native_err_passkey_no_prf,
    "Passkey not found" to R.string.native_err_passkey_not_found,
    "PRF output too short" to R.string.native_err_passkey_prf_too_short,
    "Instance no longer unlocked" to R.string.native_err_instance_no_longer_unlocked,
    "Challenge expired or invalid" to R.string.native_err_challenge_expired,
    "Verification failed" to R.string.native_err_verification_failed,
    "User no longer exists" to R.string.native_err_passkey_user_gone,
    "Name required" to R.string.native_err_passkey_name_required,
    "Missing fields" to R.string.native_err_missing_fields,
    "Unknown credential" to R.string.native_err_unknown_credential,
    "No passkey is authorised" to R.string.native_err_no_passkey_authorised,
    "Admin only" to R.string.native_err_admin_only,
)
