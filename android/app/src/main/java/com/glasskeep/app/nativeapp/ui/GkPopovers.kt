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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.round
import androidx.compose.ui.unit.toOffset
import androidx.compose.ui.unit.toRect

/**
 * What closes a popover when a finger lands outside it, after the web's
 * own document listeners. On a phone, a listener on the touch itself
 * (touchstart, pointerdown) runs as the finger comes down, one on
 * mousedown only once a tap is over: a scroll never fires it.
 */
internal enum class GkPopoverClose {
    /** The touch, which still reaches what it lands on (the rich-text
     *  Popover.jsx, EditExtras' link popover). */
    Touch,

    /** The touch, kept from what acts on a touch starting, the drawing
     *  canvas ([GkPopovers.stopped]); a tap still clicks what it lands on
     *  (DrawingToolbar's stopPropagation() on touchstart). */
    TouchStopped,

    /** A tap, which still clicks what it lands on; a scroll leaves the
     *  popover open (Popover.jsx, ColorPickerPanel, LogoPickerPopover, the
     *  tag menu, the selection dock's menu: mousedown). */
    Tap,

    /** The touch; a tap then clicks nothing, a scroll still scrolls
     *  (SectionHeader and NotesHeader: pointerdown, the click after it
     *  swallowed). */
    Swallow,
}

/** Where a popover opens: the control it opens from, once laid out, and
 *  the screen, in the screen's pixels (the web's viewport). */
@Stable
internal interface GkPopoverFrame {
    val anchor: IntRect?
    val screen: IntSize
}

/** Where a popover's card goes, its top-left corner, for a control at
 *  [anchor] on a screen of [screen] and a card of [card]. */
internal typealias GkPopoverPlacement = Density.(anchor: IntRect, screen: IntSize, card: IntSize) -> IntOffset

/** An open popover: how it closes, how it is placed and what it shows,
 *  the control it opens from and its card, in window pixels. */
internal class GkPopoverRequest(
    private val popovers: GkPopovers,
    val close: GkPopoverClose,
    private val sparesAnchor: Boolean,
    val dismiss: () -> Unit,
    val placement: GkPopoverPlacement,
    val content: @Composable (GkPopoverFrame) -> Unit,
) : GkPopoverFrame {
    var anchorInWindow: IntRect? by mutableStateOf(null)
    var card: IntRect? = null

    override val anchor: IntRect?
        get() = anchorInWindow?.translate(-popovers.screen.topLeft)
    override val screen: IntSize
        get() = popovers.screen.size

    /** Whether a finger at [at], in window pixels, lands off the card and,
     *  when that closes it too, off the control. */
    fun isOutside(at: Offset): Boolean =
        card?.toRect()?.contains(at) != true && !(sparesAnchor && anchorInWindow?.toRect()?.contains(at) == true)
}

/**
 * The popovers open in the app, drawn by [GkPopoverHost] at the root, in
 * the app's own window, as the web draws its fixed cards in the page: a
 * finger landing elsewhere passes on to what it lands on, one tap going
 * from a popover to the next, and closes each popover as its web
 * listener does ([GkPopoverClose]).
 */
@Stable
internal class GkPopovers {
    /** In the order they opened, the last drawn on top. */
    val open = mutableStateListOf<GkPopoverRequest>()

    /** The screen the app draws in, in window pixels. */
    var screen by mutableStateOf(IntRect.Zero)

    private var stoppedPointer: PointerId? = null

    /** Whether the touch of [pointer] closed a [GkPopoverClose.TouchStopped]
     *  popover, so what acts on a touch starting leaves it alone. */
    fun stopped(pointer: PointerId): Boolean = stoppedPointer == pointer

    fun show(request: GkPopoverRequest) {
        open += request
    }

    fun hide(request: GkPopoverRequest) {
        open -= request
    }

    /** A finger coming down at [at], in window pixels: what it closes at
     *  once is closed, and it returns the popovers it touched outside of,
     *  for what a tap does to them. */
    fun touched(pointer: PointerId, at: Offset): List<GkPopoverRequest> {
        val outside = open.filter { it.isOutside(at) }
        stoppedPointer = pointer.takeIf { outside.any { it.close == GkPopoverClose.TouchStopped } }
        outside.filter { it.close != GkPopoverClose.Tap }.forEach { it.dismiss() }
        return outside
    }
}

internal val LocalGkPopovers = staticCompositionLocalOf { GkPopovers() }

/** The screen the popovers open in: reports it, and every finger coming
 *  down on it, to [popovers], on the way in, taking nothing from what it
 *  lands on but the tap a [GkPopoverClose.Swallow] popover swallows. */
@Composable
internal fun Modifier.gkPopoverTouches(popovers: GkPopovers): Modifier {
    val root = remember { CoordinatesHolder() }
    return this
        .onGloballyPositioned {
            root.value = it
            popovers.screen = IntRect(it.positionInWindow().round(), it.size)
        }
        .pointerInput(popovers) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                val at = root.value?.takeIf { it.isAttached }?.localToWindow(down.position) ?: return@awaitEachGesture
                val outside = popovers.touched(down.id, at)
                val onTap = outside.filter { it.close == GkPopoverClose.Tap }
                val swallows = outside.any { it.close == GkPopoverClose.Swallow }
                if (onTap.isEmpty() && !swallows) return@awaitEachGesture
                val tap = awaitTap(down) ?: return@awaitEachGesture
                onTap.filter { it in popovers.open }.forEach { it.dismiss() }
                if (swallows) tap.consume()
            }
        }
}

/** The lift of [down]'s finger if it ends a tap, what a phone's browser
 *  turns into a click: alone, never past the touch slop, lifted before a
 *  long press. Seen on the way in, before anything takes it. */
private suspend fun AwaitPointerEventScope.awaitTap(down: PointerInputChange): PointerInputChange? {
    val deadline = down.uptimeMillis + viewConfiguration.longPressTimeoutMillis
    while (true) {
        val changes = awaitPointerEvent(PointerEventPass.Initial).changes
        val change = changes.firstOrNull { it.id == down.id } ?: return null
        when {
            changes.any { it.id != down.id && it.pressed } -> return null
            change.changedToUp() -> return change.takeIf { it.uptimeMillis < deadline }
            !change.pressed -> return null
            (change.position - down.position).getDistance() > viewConfiguration.touchSlop -> return null
        }
    }
}

/**
 * Shows [content] as a popover while this is composed, placed by
 * [placement] off the control it opens from: the layout this is called
 * in, as for a Popup. A finger landing outside the card closes it as
 * [close] says, on the control too unless [sparesAnchor], whose own tap
 * then closes it; so does the back key.
 */
@Composable
internal fun GkPopover(
    close: GkPopoverClose,
    onDismiss: () -> Unit,
    placement: GkPopoverPlacement,
    sparesAnchor: Boolean = true,
    content: @Composable (GkPopoverFrame) -> Unit,
) {
    val popovers = LocalGkPopovers.current
    val currentDismiss by rememberUpdatedState(onDismiss)
    val currentPlacement by rememberUpdatedState(placement)
    val currentContent by rememberUpdatedState(content)
    val request = remember(popovers, close, sparesAnchor) {
        GkPopoverRequest(
            popovers = popovers,
            close = close,
            sparesAnchor = sparesAnchor,
            dismiss = { currentDismiss() },
            placement = { anchor, screen, card -> currentPlacement(anchor, screen, card) },
        ) { currentContent(it) }
    }
    DisposableEffect(request) {
        popovers.show(request)
        onDispose { popovers.hide(request) }
    }
    Layout(
        content = {},
        modifier = Modifier.onGloballyPositioned { placed ->
            request.anchorInWindow = placed.parentLayoutCoordinates?.let { IntRect(it.positionInWindow().round(), it.size) }
        },
    ) { _, _ -> layout(0, 0) {} }
    BackHandler { currentDismiss() }
}

/** Draws the open popovers over the whole screen, each card where its
 *  placement puts it once its control is laid out. A card takes the
 *  touches that land on it, whatever part of it they hit; everything
 *  else passes on to the screen under it. */
@Composable
internal fun GkPopoverHost(popovers: GkPopovers) {
    val open = popovers.open
    if (open.isEmpty()) return
    Layout(
        content = {
            open.forEach { request ->
                key(request) {
                    Box(Modifier.layoutId(request).pointerInput(request) {}) { request.content(request) }
                }
            }
        },
        modifier = Modifier.fillMaxSize(),
    ) { measurables, constraints ->
        val density: Density = this
        val screen = popovers.screen
        val cards = measurables.map { it.layoutId as GkPopoverRequest to it.measure(Constraints(maxWidth = screen.width, maxHeight = screen.height)) }
        layout(constraints.maxWidth, constraints.maxHeight) {
            val host = coordinates?.takeIf { it.isAttached } ?: return@layout
            cards.forEach { (request, card) ->
                val anchor = request.anchor ?: return@forEach
                val size = IntSize(card.width, card.height)
                val at = request.placement(density, anchor, screen.size, size) + screen.topLeft
                card.place(host.windowToLocal(at.toOffset()).round())
                request.card = IntRect(at, size)
            }
        }
    }
}
