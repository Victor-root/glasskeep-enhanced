package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ScrollState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.min

/** One row a dragged item can land among (useChecklistDrag.js's
 *  `[data-checklist-row]`): an item, the list's add row, a section header
 *  or its "Add to section…", with the block it sits in. */
internal data class ChecklistDragSlot(
    val key: String,
    val itemId: String?,
    val isHeader: Boolean,
    val blockKey: String,
)

/** cubic-bezier(.2,0,0,1), every slide and glide of the drag. */
internal val ChecklistDragEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)

/** The lifted copy's `0 8px 24px rgba(0,0,0,.18)`, easing to the
 *  `0 1px 3px rgba(0,0,0,.1)` it settles with. */
internal fun checklistLiftShadow(settle: Float): Shadow = Shadow(
    radius = (24f - 21f * settle).dp,
    color = Color.Black.copy(alpha = 0.18f - 0.08f * settle),
    offset = DpOffset(0.dp, (8f - 7f * settle).dp),
)

/**
 * useChecklistDrag.js, natively: one controller for both gestures.
 *
 * An item lifted by its handle floats as a copy of itself while its own
 * row keeps its place, unseen; every other row of the list, headers and
 * add rows included, slides by the lifted row's height plus the gap after
 * it. A section is lifted whole the moment its handle is touched. Near the
 * top or bottom of the note the list scrolls by itself. On release the
 * lifted copy glides to its slot in 200ms and the new order lands 20ms
 * later, every slide reset at once. Positions are read once, when a lift
 * starts, in the list's own coordinates; the finger is followed in the
 * root's, like the web's clientY, so neither the scroll nor the lifted
 * block moving under it counts as a move.
 */
@Stable
internal class ChecklistDragController(
    private val scope: CoroutineScope,
    private val edgeZone: Float,
    private val maxStep: Float,
) {
    private var root: LayoutCoordinates? = null
    private val placed = HashMap<String, LayoutCoordinates>()
    private val shifts = mutableStateMapOf<String, Animatable<Float, AnimationVector1D>>()

    var scrollState: ScrollState? = null
    var viewport: () -> Rect? = { null }

    var liftedItemId by mutableStateOf<String?>(null)
        private set
    var liftedLeft by mutableFloatStateOf(0f)
        private set
    var liftedTop by mutableFloatStateOf(0f)
        private set
    var liftedWidth by mutableFloatStateOf(0f)
        private set
    var liftedBlockKey by mutableStateOf<String?>(null)
        private set
    var blockOffset by mutableFloatStateOf(0f)
        private set

    /** 0 while held, 1 once settled: the shadow and the scale ease back. */
    var settle by mutableFloatStateOf(0f)
        private set

    private var itemSlots: List<ChecklistDragSlot> = emptyList()
    private var blockKeys: List<String> = emptyList()
    private var rects: List<Rect> = emptyList()
    private var from = -1
    private var current = -1
    private var startFingerY = 0f
    private var fingerY = 0f
    private var scrollDy = 0f
    private var dropping = false
    private var autoScroll: Job? = null

    private val busy: Boolean get() = liftedItemId != null || liftedBlockKey != null

    fun attachRoot(coordinates: LayoutCoordinates) {
        root = coordinates
    }

    fun place(key: String, coordinates: LayoutCoordinates) {
        placed[key] = coordinates
    }

    fun shiftOf(key: String): Float = shifts[key]?.value ?: 0f

    fun blockShiftOf(key: String): Float = shiftOf(blockSlot(key))

    fun placeBlock(key: String, coordinates: LayoutCoordinates) = place(blockSlot(key), coordinates)

    private fun blockSlot(key: String) = "block:$key"

    private fun boundsOf(key: String): Rect? {
        val list = root ?: return null
        val node = placed[key] ?: return null
        if (!list.isAttached || !node.isAttached) return null
        return list.localBoundingBoxOf(node, clipBounds = false)
    }

    /** Starts carrying item [id] among [order], the finger having gone
     *  down at [fingerRootY]. */
    fun liftItem(id: String, order: List<ChecklistDragSlot>, fingerRootY: Float): Boolean {
        if (busy) return false
        val measured = order.mapNotNull { slot -> boundsOf(slot.key)?.let { slot to it } }
        val index = measured.indexOfFirst { it.first.itemId == id }
        if (index < 0) return false
        itemSlots = measured.map { it.first }
        rects = measured.map { it.second }
        begin(index, fingerRootY, itemSlots.map { it.key })
        val rect = rects[index]
        liftedLeft = rect.left
        liftedTop = rect.top
        liftedWidth = rect.width
        liftedItemId = id
        startAutoScroll { updateItem() }
        return true
    }

    fun dragItemTo(fingerRootY: Float) {
        if (liftedItemId == null || dropping) return
        fingerY = fingerRootY
        updateItem()
    }

    fun dropItem(onCommit: (slots: List<ChecklistDragSlot>, from: Int, to: Int) -> Unit) {
        if (liftedItemId == null || dropping) return
        dropping = true
        autoScroll?.cancel()
        val slots = itemSlots
        val start = from
        val end = current
        val target = rects[end].top
        scope.launch {
            launch { animate(liftedTop, target, animationSpec = tween(200, easing = ChecklistDragEasing)) { v, _ -> liftedTop = v } }
            launch { animate(0f, 1f, animationSpec = tween(200, easing = CssEase)) { v, _ -> settle = v } }
            delay(220)
            onCommit(slots, start, end)
            reset()
        }
    }

    /** Starts carrying the section block [key] among [order], the finger
     *  at [fingerRootY]. */
    fun liftBlock(key: String, order: List<String>, fingerRootY: Float): Boolean {
        if (busy) return false
        val measured = order.mapNotNull { k -> boundsOf(blockSlot(k))?.let { k to it } }
        val index = measured.indexOfFirst { it.first == key }
        if (index < 0) return false
        blockKeys = measured.map { it.first }
        rects = measured.map { it.second }
        begin(index, fingerRootY, blockKeys.map { blockSlot(it) })
        blockOffset = 0f
        liftedBlockKey = key
        startAutoScroll { updateBlock() }
        return true
    }

    fun dragBlockTo(fingerRootY: Float) {
        if (liftedBlockKey == null || dropping) return
        fingerY = fingerRootY
        updateBlock()
    }

    fun dropBlock(onCommit: (keys: List<String>, from: Int, to: Int) -> Unit) {
        if (liftedBlockKey == null || dropping) return
        dropping = true
        autoScroll?.cancel()
        val keys = blockKeys
        val start = from
        val end = current
        val target = rects[end].top - rects[start].top
        scope.launch {
            launch { animate(blockOffset, target, animationSpec = tween(200, easing = ChecklistDragEasing)) { v, _ -> blockOffset = v } }
            launch { animate(0f, 1f, animationSpec = tween(200, easing = CssEase)) { v, _ -> settle = v } }
            delay(220)
            onCommit(keys, start, end)
            reset()
        }
    }

    /** A cancelled gesture: everything back at once, nothing moved. */
    fun cancel() {
        if (!busy || dropping) return
        autoScroll?.cancel()
        scope.launch { reset() }
    }

    private fun begin(index: Int, fingerRootY: Float, keys: List<String>) {
        // Rows gone since the last lift (deleted, folded away) are forgotten.
        placed.values.removeAll { !it.isAttached }
        from = index
        current = index
        startFingerY = fingerRootY
        fingerY = fingerRootY
        scrollDy = 0f
        settle = 0f
        keys.forEach { key -> if (shifts[key] == null) shifts[key] = Animatable(0f) }
    }

    private fun updateItem() {
        val rect = rects[from]
        liftedTop = rect.top + fingerY - startFingerY + scrollDy
        current = targetIndex(liftedTop + rect.height / 2)
        slide(itemSlots.map { it.key })
    }

    private fun updateBlock() {
        val rect = rects[from]
        blockOffset = fingerY - startFingerY + scrollDy
        current = targetIndex(rect.top + blockOffset + rect.height / 2)
        slide(blockKeys.map { blockSlot(it) })
    }

    /** The last row whose middle the carried one's middle has passed. */
    private fun targetIndex(center: Float): Int {
        var index = from
        rects.forEachIndexed { i, rect -> if (center > rect.top + rect.height / 2) index = i }
        return index.coerceIn(0, rects.lastIndex)
    }

    /** Every displaced row moves by the carried one's height plus the gap
     *  that followed it (the gap before it, for the last one). */
    private fun slide(keys: List<String>) {
        val rect = rects[from]
        val gap = when {
            from + 1 < rects.size -> rects[from + 1].top - rect.bottom
            from > 0 -> rect.top - rects[from - 1].bottom
            else -> 0f
        }.coerceAtLeast(0f)
        val shift = rect.height + gap
        keys.forEachIndexed { i, key ->
            if (i == from) return@forEachIndexed
            val target = when {
                from < current && i in (from + 1)..current -> -shift
                from > current && i in current until from -> shift
                else -> 0f
            }
            val anim = shifts[key] ?: return@forEachIndexed
            if (anim.targetValue != target) {
                scope.launch { anim.animateTo(target, tween(200, easing = ChecklistDragEasing)) }
            }
        }
    }

    /** Within [edgeZone] of the note's top or bottom edge the list scrolls
     *  by up to [maxStep] per frame, faster the closer the finger. */
    private fun startAutoScroll(onScrolled: () -> Unit) {
        autoScroll?.cancel()
        autoScroll = scope.launch {
            while (true) {
                withFrameNanos { }
                val scroll = scrollState ?: continue
                val area = viewport() ?: continue
                val speed = when {
                    fingerY > area.bottom - edgeZone -> min(maxStep, (fingerY - (area.bottom - edgeZone)) / edgeZone * maxStep)
                    fingerY < area.top + edgeZone -> -min(maxStep, (area.top + edgeZone - fingerY) / edgeZone * maxStep)
                    else -> 0f
                }
                if (speed == 0f) continue
                val consumed = scroll.dispatchRawDelta(speed)
                if (consumed != 0f) {
                    scrollDy += consumed
                    onScrolled()
                }
            }
        }
    }

    private suspend fun reset() {
        autoScroll?.cancel()
        shifts.values.forEach { it.snapTo(0f) }
        shifts.clear()
        liftedItemId = null
        liftedBlockKey = null
        blockOffset = 0f
        settle = 0f
        dropping = false
        from = -1
        current = -1
    }
}

/** A row the drag measures and slides: [key] names it in [drag], it
 *  follows the slide [drag] gives it, and it stays unseen while it is the
 *  item being carried. */
internal fun Modifier.checklistDragSlot(key: String, drag: ChecklistDragController): Modifier = this
    .onGloballyPositioned { drag.place(key, it) }
    .graphicsLayer {
        translationY = drag.shiftOf(key)
        alpha = if (drag.liftedItemId == key) 0f else 1f
    }
