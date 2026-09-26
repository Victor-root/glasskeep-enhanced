package com.glasskeep.app.ui

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.glasskeep.app.nativeapp.ui.CssEaseInOut
import com.glasskeep.app.nativeapp.ui.cssAngleGradient
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
 * Anchored to whatever box [modifier] gives it, and clipped to it: the
 * sign-in screens lay it over their scrolling page like the web's
 * `overflow-hidden` root. [fadeIn] is `.floating-cards-bg`'s reveal,
 * which the sign-in decoration does not carry.
 *
 * Deliberately not backdrop-blurred, exactly like the web: the stylesheet
 * calls that out as a GPU cost it refuses to pay for decoration.
 */
@Composable
internal fun FloatingCardsBackground(
    dark: Boolean,
    modifier: Modifier = Modifier,
    workspace: Boolean = false,
    fadeIn: Boolean = true,
) {
    var revealed by remember { mutableStateOf(!fadeIn) }
    LaunchedEffect(Unit) {
        if (revealed) return@LaunchedEffect
        delay(300)
        revealed = true
    }
    val revealAlpha by animateFloatAsState(
        targetValue = if (revealed) 1f else 0f,
        animationSpec = tween(durationMillis = 600),
        label = "floatingCardsFade",
    )
    DecoCards(
        cards = if (workspace) WorkspaceDecoCards else LoginDecoCards,
        dark = dark,
        modifier = modifier.fillMaxSize().clipToBounds().alpha(revealAlpha),
    )
}

/**
 * DefaultBackdropPreview.jsx: what a login page with no photo looks like,
 * in a box a few dozen pixels tall. The page fill, and six of the cards on
 * a canvas 2.78 times the box, drawn at 0.36 of their size from its top
 * left corner, so they float as they do on the real page, only smaller.
 */
@Composable
internal fun DefaultBackdropPreview(dark: Boolean, modifier: Modifier = Modifier) {
    BoxWithConstraints(
        modifier
            .clipToBounds()
            .then(if (dark) Modifier.background(Color(0xFF1A1A1A)) else Modifier.background(DefaultBackdropGradient)),
    ) {
        DecoCards(
            cards = PreviewDecoCards,
            dark = dark,
            modifier = Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .size(maxWidth * PreviewCanvasFactor, maxHeight * PreviewCanvasFactor)
                .graphicsLayer {
                    scaleX = PreviewCardScale
                    scaleY = PreviewCardScale
                    transformOrigin = TransformOrigin(0f, 0f)
                },
        )
    }
}

/** The body's light-mode fill behind the default backdrop. */
private val DefaultBackdropGradient = cssAngleGradient(135f, listOf(Color(0xFFF0E8FF), Color(0xFFE8F4FD), Color(0xFFFDE8F0)))

private const val PreviewCanvasFactor = 2.78f
private const val PreviewCardScale = 0.36f

/** DefaultBackdropPreview.jsx's PREVIEW_CARDS. */
private val PreviewDecoCards = listOf(
    DecoCard(0.05f, null, 0.06f, null, -12f, 7000, 0, Color(0xFF6366F1), listOf(0.85f, 0.60f)),
    DecoCard(0.62f, null, 0.10f, null, 6f, 9000, 2000, Color(0xFFA855F7), listOf(0.85f, 0.60f)),
    DecoCard(0.08f, null, 0.55f, null, 8f, 8000, 4000, Color(0xFF10B981), listOf(0.85f, 0.60f)),
    DecoCard(0.66f, null, 0.52f, null, -8f, 10000, 1000, Color(0xFFF59E0B), listOf(0.85f, 0.60f)),
    DecoCard(0.34f, null, 0.30f, null, 10f, 8500, 3000, Color(0xFFEC4899), listOf(0.85f, 0.60f)),
    DecoCard(0.40f, null, 0.74f, null, -6f, 9500, 6000, Color(0xFF0EA5E9), listOf(0.85f, 0.60f)),
)

/** [cards] laid over [modifier]'s box, each on its own float clock. */
@Composable
private fun DecoCards(cards: List<DecoCard>, dark: Boolean, modifier: Modifier) {
    val transition = rememberInfiniteTransition(label = "floatCards")
    val cardBg = if (dark) Color(0xFF1E1E28).copy(alpha = 0.65f) else Color.White.copy(alpha = 0.55f)
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val lineColor = (if (dark) DarkTitleColor else LightTitleColor).copy(alpha = 0.15f)

    BoxWithConstraints(modifier) {
        val width = maxWidth
        val height = maxHeight
        for ((index, card) in cards.withIndex()) {
            // The full cycle is down-then-up; Compose reverses a half
            // cycle instead, which draws the same path.
            val lift by transition.animateFloat(
                initialValue = 0f,
                targetValue = -18f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = card.durationMs / 2, easing = CssEaseInOut),
                    repeatMode = RepeatMode.Reverse,
                    initialStartOffset = StartOffset(card.startOffsetMs, StartOffsetType.FastForward),
                ),
                label = "floatCard$index",
            )
            val x: Dp = card.fromLeft?.let { width * it }
                ?: (width - DecoCardWidth - width * (card.fromRight ?: 0f))
            // Borders included: 3px rule, 16px padding, the title and its
            // 10px gap, 14px per line, 16px padding and the 1px border.
            val cardHeight = 56.dp + 14.dp * card.lines.size
            val y: Dp = card.fromTop?.let { height * it }
                ?: (height * (1f - (card.fromBottom ?: 0f)) - cardHeight)

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
                // The 1px border sits outside the web's padding box.
                Column(Modifier.padding(start = 17.dp, end = 17.dp, top = 16.dp, bottom = 17.dp)) {
                    // The inline accent at 50% sits under `.deco-title`'s own
                    // opacity: .25, hence 12.5% in the end.
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.7f)
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(card.accent.copy(alpha = 0.125f)),
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
