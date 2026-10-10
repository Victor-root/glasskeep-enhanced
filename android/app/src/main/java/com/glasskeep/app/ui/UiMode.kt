package com.glasskeep.app.ui

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/** True when [configuration] puts the system in dark mode. */
internal fun isDarkMode(configuration: Configuration): Boolean =
    (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES

/** True when we're running on Android TV / leanback (Nvidia Shield,
 *  Chromecast w/ Google TV, Mi Box, etc). Used to switch the webapp
 *  into the read-friendly TV viewer on boot. */
internal fun isTelevision(context: Context): Boolean {
    val uiMode = context.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK
    if (uiMode == Configuration.UI_MODE_TYPE_TELEVISION) return true
    return context.packageManager.hasSystemFeature("android.software.leanback")
}

/** [isTelevision] for the onboarding screens, which swap to a
 *  dark-violet 10-foot layout on TV (same vibe as the in-app TvLogin)
 *  without touching the phone / tablet experience. */
@Composable
internal fun isTelevision(): Boolean = isTelevision(LocalContext.current)
