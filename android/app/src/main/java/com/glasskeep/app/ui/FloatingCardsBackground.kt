package com.glasskeep.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// The soft pastel note cards drifting behind the onboarding screens.
private val LightFloatingCardBg = Color.White.copy(alpha = 0.35f)
private val LightLineColor = Color(0xFF9ca3af).copy(alpha = 0.15f)
private val DarkFloatingCardBg = Color(0xFF1e1e28).copy(alpha = 0.65f)
private val DarkLineColor = Color(0xFF9ca3af).copy(alpha = 0.10f)

// Floating card accent colors
private val FloatingCardColors = listOf(
    Color(0xFF6366f1), Color(0xFFa855f7), Color(0xFF10b981),
    Color(0xFFf59e0b), Color(0xFFf97316), Color(0xFF0ea5e9),
    Color(0xFF84cc16), Color(0xFFec4899), Color(0xFF14b8a6),
    Color(0xFFf43f5e),
)

private data class FloatingCard(
    val xFraction: Float,
    val yFraction: Float,
    val rotation: Float,
    val colorIndex: Int,
    val durationMs: Int,
    val delayMs: Int,
    val widthDp: Dp
)

private val floatingCards = listOf(
    FloatingCard(0.05f, 0.08f, -12f, 0, 7000, 0, 110.dp),
    FloatingCard(0.70f, 0.05f, 8f, 1, 8000, 500, 100.dp),
    FloatingCard(0.85f, 0.22f, -6f, 2, 9000, 1200, 95.dp),
    FloatingCard(0.02f, 0.35f, 10f, 3, 10000, 800, 105.dp),
    FloatingCard(0.75f, 0.42f, -15f, 4, 8500, 2000, 90.dp),
    FloatingCard(0.10f, 0.62f, 5f, 5, 9500, 1500, 100.dp),
    FloatingCard(0.80f, 0.65f, -8f, 6, 7500, 3000, 95.dp),
    FloatingCard(0.00f, 0.82f, 13f, 7, 10500, 600, 110.dp),
    FloatingCard(0.65f, 0.85f, -10f, 8, 11000, 2500, 85.dp),
    FloatingCard(0.35f, 0.92f, 7f, 9, 8000, 1800, 100.dp),
)

@Composable
internal fun FloatingCardsBackground(dark: Boolean) {
    val transition = rememberInfiniteTransition(label = "float")
    val cardBg = if (dark) DarkFloatingCardBg else LightFloatingCardBg
    val lineColor = if (dark) DarkLineColor else LightLineColor

    Box(modifier = Modifier.fillMaxSize()) {
        floatingCards.forEach { card ->
            val animOffset by transition.animateFloat(
                initialValue = 0f,
                targetValue = -18f,
                animationSpec = infiniteRepeatable(
                    animation = tween(
                        durationMillis = card.durationMs,
                        delayMillis = card.delayMs,
                        easing = LinearEasing
                    ),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "card_${card.colorIndex}"
            )

            val accentColor = FloatingCardColors[card.colorIndex]

            Box(modifier = Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .offset(x = (card.xFraction * 300).dp, y = (card.yFraction * 700).dp)
                        .offset(y = animOffset.dp)
                        .rotate(card.rotation)
                        .width(card.widthDp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(cardBg)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .background(accentColor.copy(alpha = 0.7f))
                    )
                    Column(modifier = Modifier.padding(10.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.7f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(accentColor.copy(alpha = 0.2f))
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.9f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(lineColor)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.6f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(lineColor)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.75f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(lineColor)
                        )
                    }
                }
            }
        }
    }
}
