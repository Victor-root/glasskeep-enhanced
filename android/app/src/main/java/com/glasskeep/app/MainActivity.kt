package com.glasskeep.app

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowInsetsControllerCompat
import com.glasskeep.app.ui.SetupScreen
import com.glasskeep.app.ui.theme.GlassKeepTheme

class MainActivity : ComponentActivity() {

    private val prefs by lazy {
        getSharedPreferences("glasskeep", MODE_PRIVATE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // If URL already configured, go straight to WebView
        val savedUrl = prefs.getString("server_url", null)
        if (savedUrl != null) {
            launchWebView(savedUrl)
            return
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
        finish()
    }
}
