package com.glasskeep.app.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** Where the control that opens a popover lies, in window coordinates. */
@Stable
internal class GkPopoverAnchor {
    var bounds: Rect? by mutableStateOf(null)
}

@Composable
internal fun rememberGkPopoverAnchor(): GkPopoverAnchor = remember { GkPopoverAnchor() }

/** Marks the control a popover opens from. */
internal fun Modifier.gkPopoverAnchor(anchor: GkPopoverAnchor): Modifier =
    onGloballyPositioned { anchor.bounds = it.boundsInWindow() }

/** An open popover: the control it opens from, what closes it, what it
 *  shows, and where its card was placed (window coordinates). */
internal class GkPopoverRequest(
    val anchor: GkPopoverAnchor,
    val onDismiss: () -> Unit,
    val content: @Composable () -> Unit,
) {
    var card: Rect? = null
}

/**
 * The popover the app shows at a time, drawn by [GkPopoverHost] at the
 * root, in the app's own window, as the web draws its fixed card in the
 * page (Popover.jsx). A finger coming down anywhere else closes it and
 * still goes on to what it touches, one tap switching from a popover to
 * the next, except on the control that opened it, whose own tap closes
 * it: the web's document-level listener, and its two exceptions.
 */
@Stable
internal class GkPopovers {
    var current: GkPopoverRequest? by mutableStateOf(null)
        private set

    fun show(request: GkPopoverRequest) {
        current = request
    }

    fun hide(request: GkPopoverRequest) {
        if (current === request) current = null
    }

    /** A finger coming down at [at], in window coordinates. */
    fun touched(at: Offset) {
        val request = current ?: return
        if (request.card?.contains(at) == true || request.anchor.bounds?.contains(at) == true) return
        request.onDismiss()
    }
}

internal val LocalGkPopovers = staticCompositionLocalOf { GkPopovers() }

/** Reports every finger coming down on the root to [popovers], on the
 *  way in, taking nothing from what it lands on. */
@Composable
internal fun Modifier.gkPopoverTouches(popovers: GkPopovers): Modifier {
    val root = remember { CoordinatesHolder() }
    return this
        .onGloballyPositioned { root.value = it }
        .pointerInput(popovers) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                root.value?.takeIf { it.isAttached }?.let { popovers.touched(it.localToWindow(down.position)) }
            }
        }
}

/** Shows [content] as the popover of the control at [anchor] while this
 *  is composed; the back key or [onDismiss]'s callers close it. */
@Composable
internal fun GkPopover(anchor: GkPopoverAnchor, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val popovers = LocalGkPopovers.current
    val currentDismiss by rememberUpdatedState(onDismiss)
    val currentContent by rememberUpdatedState(content)
    DisposableEffect(popovers, anchor) {
        val request = GkPopoverRequest(anchor, { currentDismiss() }) { currentContent() }
        popovers.show(request)
        onDispose { popovers.hide(request) }
    }
    BackHandler { currentDismiss() }
}

/**
 * Places the current popover as usePopoverPosition does (Popover.jsx):
 * 6dp under its control, flipped above it when there is no room below (or
 * kept 8dp off the bottom when there is none above either), always 8dp
 * inside the screen. The card takes the touches that land on it, whatever
 * part of it they hit; everything else passes on to the screen under it.
 */
@Composable
internal fun GkPopoverHost(popovers: GkPopovers) {
    val request = popovers.current ?: return
    Layout(
        content = { Box(Modifier.pointerInput(request) {}) { request.content() } },
        modifier = Modifier.fillMaxSize(),
    ) { measurables, constraints ->
        val card = measurables.single().measure(constraints.copy(minWidth = 0, minHeight = 0))
        layout(constraints.maxWidth, constraints.maxHeight) {
            val anchor = request.anchor.bounds ?: return@layout
            val host = coordinates?.takeIf { it.isAttached } ?: return@layout
            val margin = 8.dp.roundToPx()
            val gap = 6.dp.roundToPx()
            val origin = host.windowToLocal(anchor.topLeft)
            val left = origin.x.roundToInt()
                .coerceAtMost(constraints.maxWidth - card.width - margin)
                .coerceAtLeast(margin)
            val below = (origin.y + anchor.height).roundToInt() + gap
            val above = origin.y.roundToInt() - gap - card.height
            val top = when {
                below + card.height + margin <= constraints.maxHeight -> below
                above >= margin -> above
                else -> maxOf(margin, constraints.maxHeight - card.height - margin)
            }
            card.place(left, top)
            request.card = Rect(host.localToWindow(Offset(left.toFloat(), top.toFloat())), Size(card.width.toFloat(), card.height.toFloat()))
        }
    }
}
