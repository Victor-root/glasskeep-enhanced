package com.glasskeep.app.reminders

/** The complete session a background reminder request is allowed to use. */
internal data class ReminderSession(
    val serverUrl: String,
    val token: String,
    val urlVetted: Boolean,
)

/**
 * During the WebView-to-native upgrade, the old session remains a fallback
 * only until the encrypted native store has been used for the first time.
 * Once either native session field exists, native owns the session: a missing
 * token then means "signed out", never "silently reuse the old WebView JWT".
 */
internal fun selectReminderSession(
    nativeServerUrl: String?,
    nativeToken: String?,
    legacySession: ReminderSession?,
): ReminderSession? {
    val nativeOwnsSession = nativeServerUrl != null || nativeToken != null
    if (!nativeOwnsSession) return legacySession

    val serverUrl = nativeServerUrl?.trim()?.trimEnd('/')?.takeIf { it.isNotEmpty() } ?: return null
    val token = nativeToken?.takeIf { it.isNotBlank() } ?: return null
    return ReminderSession(serverUrl, token, urlVetted = true)
}
