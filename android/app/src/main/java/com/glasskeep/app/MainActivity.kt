package com.glasskeep.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.ui.SetupScreen
import com.glasskeep.app.ui.WebViewScreen
import com.glasskeep.app.ui.theme.GlassKeepTheme

class MainActivity : ComponentActivity() {

    private val prefs by lazy {
        getSharedPreferences("glasskeep", MODE_PRIVATE)
    }

    private var serverUrl by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        serverUrl = prefs.getString("server_url", null)

        setContent {
            GlassKeepTheme {
                val url = serverUrl
                if (url != null) {
                    WebViewScreen(url = url, onReset = {
                        prefs.edit().remove("server_url").apply()
                        serverUrl = null
                    })
                } else {
                    SetupScreen(onConnect = { url ->
                        prefs.edit().putString("server_url", url).apply()
                        serverUrl = url
                    })
                }
            }
        }
    }
}
