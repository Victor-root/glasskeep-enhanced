package com.glasskeep.app.ui

import android.app.Activity
import android.graphics.Color
import android.view.View
import androidx.core.view.WindowInsetsControllerCompat

// Status/nav bar background for screens that are not edge-to-edge yet
// (MainActivity's onboarding flow, the native rewrite). WebViewActivity
// does not use this: it already runs edge-to-edge and paints its own bar
// color via enableEdgeToEdge (see WebViewActivity.applySystemBarColor).
//
// statusBarColor/navigationBarColor are deprecated in favor of real
// edge-to-edge. Not switched here yet: unlike WebViewActivity, these
// screens don't pad their content for safe-drawing insets, so flipping
// to edge-to-edge needs every screen underneath checked on a real device
// first, not guessed. targetSdk is still 34, so these calls stay fully
// functional in the meantime.
@Suppress("DEPRECATION")
fun Activity.applyThemedSystemBars(view: View, dark: Boolean) {
    val bgColor = Color.parseColor(if (dark) "#1a1a1a" else "#f0e8ff")
    window.statusBarColor = bgColor
    window.navigationBarColor = bgColor
    WindowInsetsControllerCompat(window, view).apply {
        isAppearanceLightStatusBars = !dark
        isAppearanceLightNavigationBars = !dark
    }
}
