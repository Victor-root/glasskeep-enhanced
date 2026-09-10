package com.glasskeep.app.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.StartOffsetType
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** `.login-deco-card` (globalCSS.js:2664-2774): 160px wide, 1rem of
 *  padding, a 12px radius and a 3px accent rule along the top. */
private val DecoCardWidth = 160.dp

/**
 * One decorative card: where it sits (as a fraction of the screen, from
 * whichever edge the web anchors it to), how far it is tilted, how long
 * one float takes, how far into that float it starts, its accent colour
 * and the widths of its body lines.
 */
private data class DecoCard(
    val fromLeft: Float?,
    val fromRight: Float?,
    val fromTop: Float?,
    val fromBottom: Float?,
    val rotation: Float,
    val durationMs: Int,
    val startOffsetMs: Int,
    val accent: Color,
    val lines: List<Float>,
)

/**
 * The six cards AuthShell.jsx renders on a phone (:138-170). The other
 * four it declares carry `hidden md:block`, so they never appear on the
 * only screen size this app targets and are not ported.
 */
private val LoginDecoCards = listOf(
    DecoCard(0.06f, null, 0.08f, null, -12f, 7000, 0, Color(0xFF6366F1), listOf(0.90f, 0.75f, 0.60f)),
    DecoCard(0.03f, null, 0.42f, null, 5f, 9000, 2000, Color(0xFFA855F7), listOf(0.85f, 0.55f)),
    DecoCard(0.09f, null, null, 0.10f, 8f, 8000, 4000, Color(0xFF10B981), listOf(0.80f, 0.65f, 0.45f)),
    DecoCard(null, 0.07f, 0.06f, null, 6f, 10000, 1000, Color(0xFFF59E0B), listOf(0.88f, 0.70f)),
    DecoCard(null, 0.04f, 0.38f, null, -8f, 7500, 3000, Color(0xFFEC4899), listOf(0.90f, 0.60f, 0.78f)),
    DecoCard(null, 0.08f, null, 0.08f, -15f, 11000, 5000, Color(0xFF14B8A6), listOf(0.75f, 0.50f)),
)

/** The six cards that remain visible below 640px in the signed-in web
 * workspace (`FloatingCardsBackground.jsx` + globalCSS.js:2750-2755).
 * Their anchors differ from the sign-in decoration above, so sharing the
 * drawing primitive must not silently share the wrong layout. */
private val WorkspaceDecoCards = listOf(
    DecoCard(0.02f, null, 0.05f, null, -12f, 7000, 0, Color(0xFF6366F1), listOf(0.90f, 0.75f, 0.60f)),
    DecoCard(0.01f, null, 0.32f, null, 5f, 9000, 2000, Color(0xFFA855F7), listOf(0.85f, 0.55f)),
    DecoCard(0.03f, null, 0.60f, null, 8f, 8000, 4000, Color(0xFF10B981), listOf(0.80f, 0.65f, 0.45f)),
    DecoCard(null, 0.03f, 0.06f, null, 6f, 10000, 1000, Color(0xFF10B981), listOf(0.88f, 0.70f)),
    DecoCard(null, 0.02f, 0.35f, null, -8f, 7500, 3000, Color(0xFFF59E0B), listOf(0.90f, 0.60f, 0.78f)),
    DecoCard(null, 0.04f, 0.62f, null, -15f, 11000, 5000, Color(0xFFF97316), listOf(0.75f, 0.50f)),
)

/**
 * The drifting cards behind the sign-in screen, ported from AuthShell's
 * own decorative layer. Each one floats 18px up and back down on its own
 * clock, starting part-way into that cycle so no two are ever in step:
 * the web gets that from negative animation delays, this gets it from
 * Compose's own fast-forwarded start offsets.
 *
 * Deliberately not backdrop-blurred, exactly like the web: the stylesheet
 * calls that out as a GPU cost it refuses to pay for decoration.
 */
@Composable
internal fun FloatingCardsBackground(dark: Boolean, workspace: Boolean = false) {
    val transition = rememberInfiniteTransition(label = "floatCards")
    var revealed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(300)
        revealed = true
    }
    val revealAlpha by animateFloatAsState(
        targetValue = if (revealed) 1f else 0f,
        animationSpec = tween(durationMillis = 600),
        label = "floatingCardsFade",
    )
    val cardBg = if (dark) Color(0xFF1E1E28).copy(alpha = 0.65f) else Color.White.copy(alpha = 0.55f)
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val lineColor = (if (dark) DarkTitleColor else LightTitleColor).copy(alpha = 0.15f)

    BoxWithConstraints(Modifier.fillMaxSize().alpha(revealAlpha)) {
        val width = maxWidth
        val height = maxHeight
        val cards = if (workspace) WorkspaceDecoCards else LoginDecoCards
        for ((index, card) in cards.withIndex()) {
            // The full cycle is down-then-up; Compose reverses a half
            // cycle instead, which draws the same path.
            val lift by transition.animateFloat(
                initialValue = 0f,
                targetValue = -18f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = card.durationMs / 2, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse,
                    initialStartOffset = StartOffset(card.startOffsetMs, StartOffsetType.FastForward),
                ),
                label = "floatCard$index",
            )
            val x: Dp = card.fromLeft?.let { width * it }
                ?: (width - DecoCardWidth - width * (card.fromRight ?: 0f))
            val y: Dp = card.fromTop?.let { height * it }
                ?: (height * (1f - (card.fromBottom ?: 0f)) - 120.dp)

            Column(
                modifier = Modifier
                    .offset(x = x, y = y + lift.dp)
                    .rotate(card.rotation)
                    .width(DecoCardWidth)
                    .alpha(if (dark) 0.35f else 0.55f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(cardBg)
                    .border(1.dp, borderColor, RoundedCornerShape(12.dp)),
            ) {
                Box(Modifier.fillMaxWidth().height(3.dp).background(card.accent.copy(alpha = 0.7f)))
                Column(Modifier.padding(16.dp)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.7f)
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(card.accent.copy(alpha = 0.5f)),
                    )
                    Spacer(Modifier.height(10.dp))
                    for (lineWidth in card.lines) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(lineWidth)
                                .height(7.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(lineColor),
                        )
                        Spacer(Modifier.height(7.dp))
                    }
                }
            }
        }
    }
}
