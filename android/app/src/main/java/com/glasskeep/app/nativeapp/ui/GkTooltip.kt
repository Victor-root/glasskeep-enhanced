package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerEventTimeoutCancellationException
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import kotlinx.coroutines.delay

// TooltipPortal.jsx's own numbers: hold for a second before it appears,
// keep it up for five after the finger lifts, 8px between the pill and
// the control, never closer than 8px to a screen edge, and flip below the
// control when it sits within 60px of the top.
private const val TooltipHoldMs = 1_000L
private const val TooltipVisibleMs = 5_000L
private val TooltipGap = 8.dp
private val TooltipScreenPadding = 8.dp
private val TooltipFlipBelowAbove = 60.dp

// bg-gray-800, white text, and the 4px CSS border triangle under it.
private val TooltipBg = Color(0xFF1F2937)
private val TooltipArrowWidth = 8.dp
private val TooltipArrowHeight = 4.dp

/** One tooltip's label and the control it belongs to, in window
 *  coordinates (what [Rect] from `boundsInWindow` gives). */
internal data class GkTooltipRequest(val label: String, val anchor: Rect)

/**
 * The single tooltip the app shows at a time, hoisted out of the controls
 * themselves exactly as the web hoists its own into one portal at the app
 * root (TooltipPortal.jsx). [GkTooltipHost] draws whatever is current;
 * [gkTooltip] is what puts it there.
 */
@Stable
internal class GkTooltipController {
    var current: GkTooltipRequest? by mutableStateOf(null)
        private set

    fun show(label: String, anchor: Rect) {
        current = GkTooltipRequest(label, anchor)
    }

    fun hide() {
        current = null
    }
}

internal val LocalGkTooltips = staticCompositionLocalOf { GkTooltipController() }

@Composable
internal fun rememberTooltipController(): GkTooltipController = remember { GkTooltipController() }

/**
 * The web's `data-tooltip` attribute: hold this control for a second and
 * its label appears in a dark pill pointing at it.
 *
 * Observes on the Initial pass and never consumes, so the control's own
 * tap, long-press or drag behaves exactly as it did without this. A
 * gesture that ends, or is taken over by a scrolling parent, before the
 * second is up shows nothing, and one taken over after it hides the pill
 * straight away, which is what the web's own touchmove handler does.
 *
 * Phone-only by construction, and that is the whole of the web's mobile
 * half too: its other branch is a 600ms mouse hover, and there is no
 * hover here.
 */
@Composable
internal fun Modifier.gkTooltip(label: String): Modifier {
    val controller = LocalGkTooltips.current
    // Written from the layout pass, read from the gesture coroutine. Not
    // Compose state: nothing recomposes on it, and making it state would
    // schedule a recomposition on every scroll frame.
    val anchor = remember { AnchorBounds() }
    return this
        .onGloballyPositioned { anchor.value = it.boundsInWindow() }
        .pointerInput(label, controller) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                try {
                    withTimeout(TooltipHoldMs) {
                        waitForUpOrCancellation(PointerEventPass.Initial)
                    }
                } catch (_: PointerEventTimeoutCancellationException) {
                    anchor.value?.let { controller.show(label, it) }
                    if (waitForUpOrCancellation(PointerEventPass.Initial) == null) controller.hide()
                }
            }
        }
}

/** See [gkTooltip]: a plain holder, deliberately not Compose state. */
private class AnchorBounds {
    var value: Rect? = null
}

/**
 * Draws the current tooltip. Placed once, at the app root, next to
 * [GkToastHost] for the same reason: one instance for the whole app.
 */
@Composable
internal fun GkTooltipHost(controller: GkTooltipController) {
    val request = controller.current ?: return
    LaunchedEffect(request) {
        delay(TooltipVisibleMs)
        controller.hide()
    }
    val density = LocalDensity.current
    val positionProvider = remember(request, density) {
        with(density) {
            GkTooltipPositionProvider(
                anchor = request.anchor,
                gapPx = TooltipGap.toPx(),
                screenPaddingPx = TooltipScreenPadding.toPx(),
                flipBelowAbovePx = TooltipFlipBelowAbove.toPx(),
            )
        }
    }
    Popup(
        popupPositionProvider = positionProvider,
        properties = PopupProperties(focusable = false, clippingEnabled = false),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (positionProvider.below) TooltipArrow(pointingUp = true)
            Text(
                request.label,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .shadow(12.dp, RoundedCornerShape(8.dp))
                    .clip(RoundedCornerShape(8.dp))
                    .background(TooltipBg)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
            if (!positionProvider.below) TooltipArrow(pointingUp = false)
        }
    }
}

/** The pill's little triangle, the CSS border trick's own 8x4. */
@Composable
private fun TooltipArrow(pointingUp: Boolean) {
    Canvas(Modifier.size(TooltipArrowWidth, TooltipArrowHeight)) {
        val path = Path().apply {
            if (pointingUp) {
                moveTo(size.width / 2f, 0f)
                lineTo(size.width, size.height)
                lineTo(0f, size.height)
            } else {
                moveTo(0f, 0f)
                lineTo(size.width, 0f)
                lineTo(size.width / 2f, size.height)
            }
            close()
        }
        drawPath(path, TooltipBg)
    }
}

/**
 * Puts the pill over the control rather than over this host: the anchor
 * travelled here as window coordinates, so the [anchorBounds] Compose
 * hands in (this host's own box) is deliberately ignored. Same three
 * rules as the web: centred on the control, flipped below it when it is
 * within 60px of the top, and nudged back inside the screen's 8px margin.
 */
private class GkTooltipPositionProvider(
    private val anchor: Rect,
    private val gapPx: Float,
    private val screenPaddingPx: Float,
    private val flipBelowAbovePx: Float,
) : PopupPositionProvider {
    /** Read by the host to put the arrow on the right side of the pill.
     *  Set during measurement, which runs before the arrow is drawn. */
    var below: Boolean = anchor.top < flipBelowAbovePx
        private set

    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        below = anchor.top < flipBelowAbovePx
        val maxX = (windowSize.width - popupContentSize.width - screenPaddingPx).coerceAtLeast(screenPaddingPx)
        val x = (anchor.center.x - popupContentSize.width / 2f).coerceIn(screenPaddingPx, maxX)
        val y = if (below) anchor.bottom + gapPx else anchor.top - gapPx - popupContentSize.height
        return IntOffset(x.toInt(), y.toInt())
    }
}
