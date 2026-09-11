package com.glasskeep.app.ui

import android.graphics.Color
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import com.glasskeep.app.BuildConfig

// Status/nav bar treatment for the onboarding flow and native app. Each
// screen underneath is responsible for padding its own content away from the bars with
// safeDrawingPadding()/windowInsetsPadding() where it matters.
//
// [overrideColorInt] lets a caller past onboarding (NativeAppActivity, once
// signed in) tint the bars to the account's chosen workspace theme (see
// WorkspaceTheme.kt) instead of this fixed onboarding pair. Defaults to
// null so onboarding itself, which the web's own theme system explicitly
// never recolors either, is untouched.
@Suppress("DEPRECATION") // window.statusBarColor/navigationBarColor: read back for the debug log below, no non-deprecated way to read the bar's actual current color.
fun ComponentActivity.applyThemedSystemBars(dark: Boolean, overrideColorInt: Int? = null) {
    val bgColor = overrideColorInt ?: Color.parseColor(if (dark) "#1a1a1a" else "#f0e8ff")
    val style = if (dark) SystemBarStyle.dark(bgColor) else SystemBarStyle.light(bgColor, bgColor)
    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    if (BuildConfig.DEBUG) {
        // OEM skins (ColorOS in particular) are known to re-tint or ignore
        // SystemBarStyle on some Android versions. Logging both what we
        // asked for and what Window.statusBarColor/navigationBarColor read
        // back as right after tells us whether it's this call not taking
        // effect at the platform level, or the OEM compositing something
        // different on top of a correctly-applied value: filter logcat on
        // the "GKNative" tag to see it.
        Log.d(
            "GKNative",
            "applyThemedSystemBars: dark=$dark requestedOverride=${overrideColorInt?.let { "#%08X".format(it) }} " +
                "requestedBg=#%08X actual(statusBarColor=#%08X, navigationBarColor=#%08X)".format(
                    bgColor, window.statusBarColor, window.navigationBarColor,
                ),
        )
    }
}
