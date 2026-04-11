package com.glasskeep.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
