package com.glasskeep.app

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowInsetsControllerCompat
import com.glasskeep.app.ui.SetupScreen
import com.glasskeep.app.ui.theme.GlassKeepTheme

class MainActivity : ComponentActivity() {

    private val prefs by lazy {
        getSharedPreferences("glasskeep", MODE_PRIVATE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)

        // If URL already configured, go straight to WebView
        val savedUrl = prefs.getString("server_url", null)
        if (savedUrl != null) {
            launchWebView(savedUrl)
            return
        }

        // Animate splash exit: icon scales up + fades, background fades
        splashScreen.setOnExitAnimationListener { splashScreenView ->
            val icon = splashScreenView.iconView
            AnimatorSet().apply {
                playTogether(
                    ObjectAnimator.ofFloat(icon, View.SCALE_X, 1f, 1.4f),
                    ObjectAnimator.ofFloat(icon, View.SCALE_Y, 1f, 1.4f),
                    ObjectAnimator.ofFloat(icon, View.ALPHA, 1f, 0f),
                    ObjectAnimator.ofFloat(splashScreenView.view, View.ALPHA, 1f, 0f)
                )
                duration = 500L
                interpolator = AccelerateDecelerateInterpolator()
                addListener(object : android.animation.AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: android.animation.Animator) {
                        splashScreenView.remove()
                    }
                })
                start()
            }
        }

        setContent {
            val dark = isSystemInDarkTheme()
            val view = LocalView.current
            SideEffect {
                val w = (view.context as Activity).window
                if (dark) {
                    val bgColor = Color.parseColor("#1a1a1a")
                    w.statusBarColor = bgColor
                    w.navigationBarColor = bgColor
                    WindowInsetsControllerCompat(w, view).apply {
                        isAppearanceLightStatusBars = false
                        isAppearanceLightNavigationBars = false
                    }
                } else {
                    val bgColor = Color.parseColor("#f0e8ff")
                    w.statusBarColor = bgColor
                    w.navigationBarColor = bgColor
                    WindowInsetsControllerCompat(w, view).apply {
                        isAppearanceLightStatusBars = true
                        isAppearanceLightNavigationBars = true
                    }
                }
            }
            GlassKeepTheme {
                SetupScreen(onConnect = { url ->
                    prefs.edit().putString("server_url", url).apply()
                    launchWebView(url)
                })
            }
        }
    }

    private fun launchWebView(url: String) {
        val intent = Intent(this, WebViewActivity::class.java)
        intent.putExtra("url", url)
        startActivity(intent)
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0) // seamless transition — WebView splash takes over
        finish()
    }
}
