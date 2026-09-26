package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.staticCompositionLocalOf
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor

/**
 * The page's `window.alert()`, which the WebView drew as its own message
 * dialog over whatever was showing: one message at a time, a second one
 * waiting until the first is dismissed.
 */
@Stable
internal class GkAlerts {
    private val pending = mutableStateListOf<String>()

    val current: String?
        get() = pending.firstOrNull()

    fun show(message: String) {
        pending.add(message)
    }

    fun dismiss() {
        if (pending.isNotEmpty()) pending.removeAt(0)
    }
}

/** Available to every screen; NativeNavHost provides the real one. */
internal val LocalGkAlerts = staticCompositionLocalOf { GkAlerts() }

/** Draws the alert on top, wherever it was raised from. */
@Composable
internal fun GkAlertHost(alerts: GkAlerts, themeId: String?, dark: Boolean) {
    val message = alerts.current ?: return
    GkAlertDialog(
        message = message,
        themeId = themeId,
        dark = dark,
        borderColor = if (dark) DarkBorderColor else LightBorderColor,
        textColor = if (dark) DarkTitleColor else LightTitleColor,
        onDismiss = alerts::dismiss,
    )
}
