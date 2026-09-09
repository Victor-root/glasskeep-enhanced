package com.glasskeep.app.ui

import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

// Status/nav bar treatment for the onboarding flow and native app. Each
// screen underneath is responsible for padding its own content away from the bars with
// safeDrawingPadding()/windowInsetsPadding() where it matters.
//
// [overrideColorInt] lets a caller past onboarding (NativeAppActivity, once
// signed in) tint the bars to the account's chosen workspace theme (see
// WorkspaceTheme.kt) instead of this fixed onboarding pair. Defaults to
// null so onboarding itself, which the web's own theme system explicitly
// never recolors either, is untouched.
fun ComponentActivity.applyThemedSystemBars(dark: Boolean, overrideColorInt: Int? = null) {
    val bgColor = overrideColorInt ?: Color.parseColor(if (dark) "#1a1a1a" else "#f0e8ff")
    val style = if (dark) SystemBarStyle.dark(bgColor) else SystemBarStyle.light(bgColor, bgColor)
    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
}
