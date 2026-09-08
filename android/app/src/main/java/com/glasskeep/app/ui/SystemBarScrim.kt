package com.glasskeep.app.ui

import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

// Status/nav bar treatment for the onboarding flow and the native rewrite,
// same mechanism WebViewActivity already uses for the production app
// (see WebViewActivity.applySystemBarColor). Each screen underneath is
// responsible for padding its own content away from the bars with
// safeDrawingPadding()/windowInsetsPadding() where it matters.
fun ComponentActivity.applyThemedSystemBars(dark: Boolean) {
    val bgColor = Color.parseColor(if (dark) "#1a1a1a" else "#f0e8ff")
    val style = if (dark) SystemBarStyle.dark(bgColor) else SystemBarStyle.light(bgColor, bgColor)
    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
}
