package com.glasskeep.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowInsetsControllerCompat

@SuppressLint("CustomSplashScreen")
class SplashActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Navigate after animation completes
        Handler(Looper.getMainLooper()).postDelayed({
            val prefs = getSharedPreferences("glasskeep", MODE_PRIVATE)
            val savedUrl = prefs.getString("server_url", null)
            val target = if (savedUrl != null) {
                Intent(this, WebViewActivity::class.java).putExtra("url", savedUrl)
            } else {
                Intent(this, MainActivity::class.java)
            }
            startActivity(target)
            @Suppress("DEPRECATION")
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }, 1800)

        setContent {
            val view = LocalView.current
            SideEffect {
                val w = (view.context as Activity).window
                w.statusBarColor = Color.TRANSPARENT
                w.navigationBarColor = Color.parseColor("#7c3aed")
                WindowInsetsControllerCompat(w, view).apply {
                    isAppearanceLightStatusBars = false
                    isAppearanceLightNavigationBars = false
                }
            }
            SplashContent()
        }
    }
}

@Composable
private fun SplashContent() {
    val alphaAnim = remember { Animatable(0f) }
    val scaleAnim = remember { Animatable(0.7f) }
    val textAlpha = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        // Logo fades in + scales up
        scaleAnim.animateTo(1f, tween(700, easing = FastOutSlowInEasing))
    }
    LaunchedEffect(Unit) {
        alphaAnim.animateTo(1f, tween(600, easing = FastOutSlowInEasing))
    }
    LaunchedEffect(Unit) {
        // Text appears slightly after logo
        textAlpha.animateTo(1f, tween(600, delayMillis = 350, easing = FastOutSlowInEasing))
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        androidx.compose.ui.graphics.Color(0xFF6366f1),
                        androidx.compose.ui.graphics.Color(0xFF7c3aed)
                    ),
                    start = Offset(0f, 0f),
                    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Image(
                painter = painterResource(R.drawable.glasskeep_logo),
                contentDescription = "Glass Keep",
                modifier = Modifier
                    .size(120.dp)
                    .scale(scaleAnim.value)
                    .alpha(alphaAnim.value)
                    .clip(RoundedCornerShape(24.dp))
            )

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "Glass Keep",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = androidx.compose.ui.graphics.Color.White,
                modifier = Modifier.alpha(textAlpha.value)
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "Your notes, your server",
                fontSize = 14.sp,
                color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.7f),
                modifier = Modifier.alpha(textAlpha.value)
            )
        }
    }
}
