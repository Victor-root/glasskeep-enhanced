package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.ChecklistBlock
import com.glasskeep.app.nativeapp.data.ChecklistEntry
import com.glasskeep.app.nativeapp.data.ChecklistItemData
import com.glasskeep.app.nativeapp.data.ChecklistItems
import com.glasskeep.app.nativeapp.data.ChecklistPreview
import com.glasskeep.app.nativeapp.data.ChecklistSectionData
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlin.math.abs
import kotlin.math.roundToInt

/** INDENT_STEP_PX (checklist.js:47): the one value shared by the row's
 *  own margin and the horizontal distance that commits an indent. */
private val IndentStep = 28.dp
private const val AxisLockPx = 8f
private val DragEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)

/** SECTION_COLORS (SectionHeader.jsx:15-25), in order. */
internal val ChecklistSectionColors: List<Pair<String, Color>> = listOf(
    "slate" to Color(0xFF64748B),
    "indigo" to Color(0xFF6366F1),
    "violet" to Color(0xFF8B5CF6),
    "sky" to Color(0xFF0EA5E9),
    "teal" to Color(0xFF0D9488),
    "emerald" to Color(0xFF10B981),
    "amber" to Color(0xFFF59E0B),
    "rose" to Color(0xFFF43F5E),
)

private fun sectionColorOf(key: String?): Color? =
    ChecklistSectionColors.firstOrNull { it.first == key }?.second

private val HandleDotLight = Color(0xFF99A1AF)
private val HandleDotDark = Color(0xFFD1D5DC)
private val DoneCountBg = Color(0x24647488)
private val DoneCountFg = Color(0xFF64748B)
private val CheckedTextLight = Color(0xFF6A7282)
private val CheckedTextDark = Color(0xFF99A1AF)
private val PlaceholderLight = Color(0xFF99A1AF)
private val PlaceholderDark = Color(0xFF6A7282)

/**
 * ChecklistEditor.jsx, natively. One flat array holds rows and section
 * markers together; this draws the default block, then each section with
 * its own header, colour band and add row, then the "Done" area that
 * regroups every checked row without ever moving it in the data.
 *
 * Structural changes (reorder, indent, add, remove, section edits) hand
 * a whole new entry list back through [onEntriesChange]; typing does the
 * same with `persist = false`, since the web only saves a row's text
 * when it loses focus.
 *
 * Two web behaviours are deliberately not ported, both disclosed rather
 * than silently dropped: Enter with the caret at the very start of a row
 * inserting above it (knowing where the caret sits would mean tracking a
 * TextFieldValue per row for a minor convenience), and
 * Backspace-on-an-empty-row deleting it and focusing the previous one (a
 * soft keyboard's backspace on an already-empty field isn't reliably
 * delivered as a key event by every IME). Removing a row still works
 * through its own button.
 */
@Composable
fun ChecklistEditorBody(
    entries: List<ChecklistEntry>,
    insertPosition: String,
    removeSectionBehavior: String,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    doneCollapsed: Boolean,
    focusRequesterFor: (id: String) -> FocusRequester,
    onEntriesChange: (List<ChecklistEntry>, persist: Boolean) -> Unit,
    onFocusItem: (id: String) -> Unit,
    onDoneCollapsedChange: (Boolean) -> Unit,
) {
    val blocks = remember(entries) { ChecklistItems.blocks(entries) }
    val hasChecked = remember(entries) { entries.any { it is ChecklistItemData && it.done } }

    // Everything the drag gesture needs: which row is moving, on which
    // axis the gesture locked, and how tall each visible row is.
    var draggingId by remember { mutableStateOf<String?>(null) }
    var dragVertical by remember { mutableStateOf(false) }
    var dragOffsetY by remember { mutableStateOf(0f) }
    val rowHeights = remember { mutableStateMapOf<String, Int>() }

    // The same gesture one level up: dragging a section's own handle moves
    // the whole block, header and rows together (useChecklistDrag.js's
    // handleSectionPointerDown). Blocks have wildly different heights, so
    // the drop target is computed from their measured ones rather than a
    // single row height.
    var draggingSectionId by remember { mutableStateOf<String?>(null) }
    var sectionDragOffsetY by remember { mutableStateOf(0f) }
    val blockHeights = remember { mutableStateMapOf<String, Int>() }

    val visibleIds = remember(blocks) {
        blocks.flatMap { block -> block.items.filterNot { it.done }.map { it.id } }
    }
    val draggedIndex = visibleIds.indexOf(draggingId)
    val dropIndex = remember(draggingId, dragOffsetY, visibleIds, rowHeights.toMap()) {
        if (draggedIndex < 0) -1 else dropTargetIndex(visibleIds, rowHeights, draggedIndex, dragOffsetY)
    }

    val blockGapPx = with(LocalDensity.current) { BlockGap.toPx() }
    val blockKeys = remember(blocks) { blocks.map { it.section?.id ?: DefaultBlockKey } }
    val draggedBlockIndex = blockKeys.indexOf(draggingSectionId)
    val blockDropIndex = remember(draggingSectionId, sectionDragOffsetY, blockKeys, blockHeights.toMap()) {
        if (draggedBlockIndex < 0) {
            -1
        } else {
            blockDropTargetIndex(blockKeys, blockHeights, draggedBlockIndex, sectionDragOffsetY, blockGapPx)
        }
    }

    fun commitEntries(updated: List<ChecklistEntry>, persist: Boolean = true) {
        onEntriesChange(ChecklistItems.normalize(updated), persist)
    }

    fun insertItemAt(index: Int) {
        val item = ChecklistItems.newItem()
        val updated = entries.toMutableList()
        updated.add(index.coerceIn(0, updated.size), item)
        commitEntries(updated)
        onFocusItem(item.id)
    }

    /** Enter inside a row: the new row lands above or below it depending
     *  on the user's own insert-position preference. */
    fun addItemAdjacent(anchorId: String) {
        val index = entries.indexOfFirst { it.id == anchorId }
        if (index < 0) return
        insertItemAt(if (insertPosition == "top") index else index + 1)
    }

    /** The global add row: the very top or the very bottom of the list. */
    fun addItemAtEdge() {
        insertItemAt(if (insertPosition == "top") 0 else entries.size)
    }

    /** "Add to section…": right after that section's last row, or right
     *  after its marker when it has none yet. */
    fun addItemInSection(sectionId: String?) {
        if (sectionId == null) {
            addItemAtEdge()
            return
        }
        val markerIndex = entries.indexOfFirst { it.id == sectionId }
        if (markerIndex < 0) return
        var last = markerIndex
        for (i in markerIndex + 1 until entries.size) {
            if (entries[i] is ChecklistSectionData) break
            last = i
        }
        insertItemAt(last + 1)
    }

    Column(
        modifier = Modifier.fillMaxWidth().bleedHorizontally(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (insertPosition == "top") {
            ChecklistAddRow(borderColor = borderColor, dark = dark) { addItemAtEdge() }
        }

        if (entries.none { it is ChecklistItemData }) {
            Text(
                stringResource(R.string.native_checklist_empty),
                color = subtextColor,
                fontSize = 14.sp,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
            blocks.forEachIndexed { blockIndex, block ->
                val unchecked = block.items.filterNot { it.done }
                if (block.section == null && unchecked.isEmpty() && blocks.size > 1) return@forEachIndexed
                val blockKey = block.section?.id ?: DefaultBlockKey
                ChecklistSectionBlock(
                    block = block,
                    entries = entries,
                    blockDragging = draggingSectionId == blockKey,
                    blockDragOffsetY = if (draggingSectionId == blockKey) sectionDragOffsetY else 0f,
                    blockShift = blockNeighbourShift(
                        blockIndex,
                        draggedBlockIndex,
                        blockDropIndex,
                        blockKeys,
                        blockHeights,
                        blockGapPx,
                    ),
                    onBlockHeight = { height -> blockHeights[blockKey] = height },
                    onSectionDragStart = {
                        draggingSectionId = blockKey
                        sectionDragOffsetY = 0f
                    },
                    onSectionDragDelta = { dy -> sectionDragOffsetY += dy },
                    onSectionDragEnd = {
                        val from = draggedBlockIndex
                        val to = blockDropIndex
                        draggingSectionId = null
                        sectionDragOffsetY = 0f
                        if (from >= 0 && to >= 0 && to != from) {
                            val reordered = blockKeys.toMutableList().apply { add(to, removeAt(from)) }
                            commitEntries(
                                ChecklistItems.reorderSections(entries, reordered.filterNot { it == DefaultBlockKey }),
                            )
                        }
                    },
                    onSectionDragCancel = { draggingSectionId = null; sectionDragOffsetY = 0f },
                    dark = dark,
                    titleColor = titleColor,
                    subtextColor = subtextColor,
                    borderColor = borderColor,
                    visibleIds = visibleIds,
                    draggingId = draggingId,
                    dragVertical = dragVertical,
                    dragOffsetY = dragOffsetY,
                    draggedIndex = draggedIndex,
                    dropIndex = dropIndex,
                    rowHeights = rowHeights,
                    focusRequesterFor = focusRequesterFor,
                    onRowHeight = { id, height -> rowHeights[id] = height },
                    onDragStart = { id, vertical -> draggingId = id; dragVertical = vertical; dragOffsetY = 0f },
                    onDragDelta = { dy -> dragOffsetY += dy },
                    onDragEnd = {
                        val id = draggingId
                        val from = draggedIndex
                        val to = dropIndex
                        draggingId = null
                        dragOffsetY = 0f
                        if (id != null && from >= 0 && to >= 0 && to != from) {
                            commitEntries(moveItem(entries, id, visibleIds, to))
                        }
                    },
                    onDragCancel = { draggingId = null; dragOffsetY = 0f },
                    onIndentChange = { id, indent ->
                        commitEntries(entries.map { if (it.id == id && it is ChecklistItemData) it.copy(indent = indent) else it })
                    },
                    onToggle = { id, checked ->
                        // A parent carries its own indented children with
                        // it, Google Keep style (ChecklistEditor.jsx:104).
                        val ids = (listOf(id) + ChecklistItems.indentedChildren(entries, id).map { it.id }).toSet()
                        commitEntries(entries.map { if (it.id in ids && it is ChecklistItemData) it.copy(done = checked) else it })
                    },
                    onTextChange = { id, text ->
                        commitEntries(entries.map { if (it.id == id && it is ChecklistItemData) it.copy(text = text) else it }, persist = false)
                    },
                    onBlur = { id ->
                        val item = entries.firstOrNull { it.id == id } as? ChecklistItemData
                        if (item != null && item.text.isBlank()) {
                            commitEntries(entries.filterNot { it.id == id })
                        } else {
                            commitEntries(entries)
                        }
                    },
                    onEnter = { id -> addItemAdjacent(id) },
                    onRemove = { id -> commitEntries(entries.filterNot { it.id == id }) },
                    onAddToSection = { addItemInSection(block.section?.id) },
                    onSectionChange = { updatedSection ->
                        commitEntries(entries.map { if (it.id == updatedSection.id) updatedSection else it })
                    },
                    onSectionRemove = { sectionId ->
                        // Two behaviours, the user's own choice
                        // (ChecklistEditor.jsx:220-230): "cascade" takes
                        // the section's rows with it, "keep" moves them
                        // back into the block at the top.
                        commitEntries(
                            if (removeSectionBehavior == "keep") {
                                ChecklistItems.removeSectionKeepItems(entries, sectionId)
                            } else {
                                ChecklistItems.removeSectionWithItems(entries, sectionId)
                            },
                        )
                    },
                    isFirstBlock = blockIndex == 0,
                )
            }
        }

        if (insertPosition != "top") {
            ChecklistAddRow(borderColor = borderColor, dark = dark) { addItemAtEdge() }
        }

        if (hasChecked) {
            ChecklistDoneArea(
                blocks = blocks,
                collapsed = doneCollapsed,
                dark = dark,
                titleColor = titleColor,
                subtextColor = subtextColor,
                borderColor = borderColor,
                onToggleCollapsed = { onDoneCollapsedChange(!doneCollapsed) },
                onToggle = { id, checked ->
                    val ids = (listOf(id) + ChecklistItems.indentedChildren(entries, id).map { it.id }).toSet()
                    commitEntries(entries.map { if (it.id in ids && it is ChecklistItemData) it.copy(done = checked) else it })
                },
                onRemove = { id -> commitEntries(entries.filterNot { it.id == id }) },
            )
        }

        // "+ Add section" adds the marker and one empty row under it, so
        // the new section is never born empty (ChecklistEditor.jsx:187).
        Box(Modifier.padding(horizontal = 16.dp)) {
            ChecklistAddSectionButton(borderColor = borderColor, subtextColor = subtextColor) {
                val newSection = ChecklistItems.newSection()
                val newItem = ChecklistItems.newItem()
                commitEntries(entries + newSection + newItem)
                onFocusItem(newItem.id)
            }
        }
    }
}

/** Where the dragged row would land: the last visible row whose middle
 *  the dragged one's own middle has passed (useChecklistDrag.js:64-71). */
private fun dropTargetIndex(
    visibleIds: List<String>,
    heights: Map<String, Int>,
    draggedIndex: Int,
    offsetY: Float,
): Int {
    if (visibleIds.isEmpty()) return -1
    val gap = 0
    var target = draggedIndex
    var travelled = 0f
    if (offsetY > 0) {
        for (i in draggedIndex + 1 until visibleIds.size) {
            val h = (heights[visibleIds[i]] ?: 0) + gap
            travelled += h / 2f
            if (offsetY < travelled) break
            target = i
            travelled += h / 2f
        }
    } else if (offsetY < 0) {
        for (i in draggedIndex - 1 downTo 0) {
            val h = (heights[visibleIds[i]] ?: 0) + gap
            travelled += h / 2f
            if (-offsetY < travelled) break
            target = i
            travelled += h / 2f
        }
    }
    return target
}

/** Moves the dragged row so it sits at [targetVisibleIndex] among the
 *  visible rows, keeping every other entry (section markers included) in
 *  place. The section it ends up in is decided by its new neighbours,
 *  same as the web's own commit step. */
private fun moveItem(
    entries: List<ChecklistEntry>,
    draggedId: String,
    visibleIds: List<String>,
    targetVisibleIndex: Int,
): List<ChecklistEntry> {
    val dragged = entries.firstOrNull { it.id == draggedId } as? ChecklistItemData ?: return entries
    val without = entries.filterNot { it.id == draggedId }
    val remainingVisible = visibleIds.filterNot { it == draggedId }
    val anchorId = remainingVisible.getOrNull(targetVisibleIndex)
    val updated = without.toMutableList()
    val insertAt = when {
        anchorId == null -> updated.size
        else -> updated.indexOfFirst { it.id == anchorId }.let { if (it < 0) updated.size else it }
    }
    updated.add(insertAt, dragged)
    return updated
}

@Composable
private fun ChecklistSectionBlock(
    block: ChecklistBlock,
    entries: List<ChecklistEntry>,
    blockDragging: Boolean,
    blockDragOffsetY: Float,
    blockShift: Float,
    onBlockHeight: (Int) -> Unit,
    onSectionDragStart: () -> Unit,
    onSectionDragDelta: (Float) -> Unit,
    onSectionDragEnd: () -> Unit,
    onSectionDragCancel: () -> Unit,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    visibleIds: List<String>,
    draggingId: String?,
    dragVertical: Boolean,
    dragOffsetY: Float,
    draggedIndex: Int,
    dropIndex: Int,
    rowHeights: Map<String, Int>,
    focusRequesterFor: (id: String) -> FocusRequester,
    onRowHeight: (String, Int) -> Unit,
    onDragStart: (String, Boolean) -> Unit,
    onDragDelta: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    onIndentChange: (String, Int) -> Unit,
    onToggle: (String, Boolean) -> Unit,
    onTextChange: (String, String) -> Unit,
    onBlur: (String) -> Unit,
    onEnter: (String) -> Unit,
    onRemove: (String) -> Unit,
    onAddToSection: () -> Unit,
    onSectionChange: (ChecklistSectionData) -> Unit,
    onSectionRemove: (String) -> Unit,
    isFirstBlock: Boolean,
) {
    val section = block.section
    val accent = sectionColorOf(section?.color)
    val unchecked = block.items.filterNot { it.done }
    val collapsed = section?.collapsed == true

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .onGloballyPositioned { onBlockHeight(it.size.height) }
            .zIndex(if (blockDragging) 1f else 0f)
            .graphicsLayer {
                translationY = if (blockDragging) blockDragOffsetY else blockShift
                if (blockDragging) {
                    scaleX = 1.02f
                    scaleY = 1.02f
                    shadowElevation = 12.dp.toPx()
                    shape = RoundedCornerShape(8.dp)
                    clip = false
                }
            }
            .padding(horizontal = if (section == null) 16.dp else 8.dp),
    ) {
        if (section != null) {
            ChecklistSectionHeader(
                section = section,
                accent = accent,
                uncheckedCount = unchecked.size,
                dark = dark,
                titleColor = titleColor,
                subtextColor = subtextColor,
                onDragStart = onSectionDragStart,
                onDragDelta = onSectionDragDelta,
                onDragEnd = onSectionDragEnd,
                onDragCancel = onSectionDragCancel,
                onChange = onSectionChange,
                onRemove = { onSectionRemove(section.id) },
            )
        }
        if (!collapsed) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(
                        if (accent != null) {
                            Modifier.background(accent.copy(alpha = if (dark) 0.09f else 0.04f))
                        } else {
                            Modifier
                        },
                    )
                    .then(
                        if (accent != null) {
                            Modifier.drawSectionAccent(accent, dark).padding(start = 3.dp)
                        } else {
                            Modifier
                        },
                    )
                    .padding(start = if (section != null) 12.dp else 0.dp, top = if (section != null) 4.dp else 0.dp, bottom = if (section != null) 4.dp else 0.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                for (item in unchecked) {
                    val visibleIndex = visibleIds.indexOf(item.id)
                    val shift = neighbourShift(visibleIndex, draggedIndex, dropIndex, draggingId, rowHeights, visibleIds)
                    ChecklistRowView(
                        item = item,
                        dark = dark,
                        titleColor = titleColor,
                        subtextColor = subtextColor,
                        borderColor = borderColor,
                        focusRequester = focusRequesterFor(item.id),
                        dragging = draggingId == item.id,
                        draggingVertically = draggingId == item.id && dragVertical,
                        dragOffsetY = if (draggingId == item.id) dragOffsetY else 0f,
                        neighbourShift = shift,
                        canIndent = ChecklistItems.canIndent(entries, item.id),
                        onHeight = { height -> onRowHeight(item.id, height) },
                        onDragStart = { vertical -> onDragStart(item.id, vertical) },
                        onDragDelta = onDragDelta,
                        onDragEnd = onDragEnd,
                        onDragCancel = onDragCancel,
                        onIndentChange = { indent -> onIndentChange(item.id, indent) },
                        onToggle = { checked -> onToggle(item.id, checked) },
                        onTextChange = { text -> onTextChange(item.id, text) },
                        onBlur = { onBlur(item.id) },
                        onEnter = { onEnter(item.id) },
                        onRemove = { onRemove(item.id) },
                    )
                }
                if (section != null) {
                    ChecklistAddToSectionRow(subtextColor = subtextColor, onClick = onAddToSection)
                }
            }
        }
    }
}

/** The implicit block holding everything above the first section marker.
 *  It shows up in the drag order like any other block but is never itself
 *  draggable, and reorderSections always keeps it first
 *  (useChecklistDrag.js:520-524). */
private const val DefaultBlockKey = "__default__"

/** The 24dp gap the blocks column puts between two section blocks, in the
 *  same units their measured heights come back in. */
private val BlockGap = 24.dp

/** Where a dragged section block would land: the last block whose middle
 *  the dragged one's own middle has passed. Unlike rows, blocks have
 *  heterogeneous heights, so the tops are summed rather than multiplied
 *  (updateSectionDragPosition, useChecklistDrag.js:472-487). */
private fun blockDropTargetIndex(
    blockKeys: List<String>,
    heights: Map<String, Int>,
    draggedIndex: Int,
    offsetY: Float,
    gap: Float,
): Int {
    var top = 0f
    val tops = FloatArray(blockKeys.size)
    for (i in blockKeys.indices) {
        tops[i] = top
        top += (heights[blockKeys[i]] ?: 0) + gap
    }
    val draggedHeight = (heights[blockKeys[draggedIndex]] ?: 0).toFloat()
    val draggedCenter = tops[draggedIndex] + offsetY + draggedHeight / 2f
    var target = draggedIndex
    for (i in blockKeys.indices) {
        val middle = tops[i] + (heights[blockKeys[i]] ?: 0) / 2f
        if (draggedCenter > middle) target = i
    }
    return target.coerceIn(0, blockKeys.lastIndex)
}

/** How far a block slides to make room, the dragged block's own height
 *  plus the gap, exactly as the web shifts them. */
private fun blockNeighbourShift(
    index: Int,
    draggedIndex: Int,
    dropIndex: Int,
    blockKeys: List<String>,
    heights: Map<String, Int>,
    gap: Float,
): Float {
    if (draggedIndex < 0 || dropIndex < 0 || index == draggedIndex) return 0f
    val shift = (heights[blockKeys.getOrNull(draggedIndex)] ?: 0) + gap
    return when {
        draggedIndex < dropIndex && index > draggedIndex && index <= dropIndex -> -shift
        draggedIndex > dropIndex && index >= dropIndex && index < draggedIndex -> shift
        else -> 0f
    }
}

/** How far a row slides out of the way while another is dragged over it:
 *  always the dragged row's own height, the web's single shift distance
 *  (useChecklistDrag.js:78-97). */
private fun neighbourShift(
    visibleIndex: Int,
    draggedIndex: Int,
    dropIndex: Int,
    draggingId: String?,
    rowHeights: Map<String, Int>,
    visibleIds: List<String>,
): Int {
    if (draggingId == null || draggedIndex < 0 || dropIndex < 0 || visibleIndex < 0) return 0
    if (visibleIndex == draggedIndex) return 0
    val draggedHeight = rowHeights[visibleIds.getOrNull(draggedIndex)] ?: 0
    return when {
        dropIndex > draggedIndex && visibleIndex in (draggedIndex + 1)..dropIndex -> -draggedHeight
        dropIndex < draggedIndex && visibleIndex in dropIndex until draggedIndex -> draggedHeight
        else -> 0
    }
}

@Composable
private fun ChecklistRowView(
    item: ChecklistItemData,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    focusRequester: FocusRequester,
    dragging: Boolean,
    draggingVertically: Boolean,
    dragOffsetY: Float,
    neighbourShift: Int,
    canIndent: Boolean,
    onHeight: (Int) -> Unit,
    onDragStart: (vertical: Boolean) -> Unit,
    onDragDelta: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    onIndentChange: (Int) -> Unit,
    onToggle: (Boolean) -> Unit,
    onTextChange: (String) -> Unit,
    onBlur: () -> Unit,
    onEnter: () -> Unit,
    onRemove: () -> Unit,
) {
    val density = LocalDensity.current
    var slideX by remember(item.id) { mutableStateOf(0f) }
    val shiftDp by animateDpAsState(
        targetValue = with(density) { neighbourShift.toDp() },
        animationSpec = tween(durationMillis = 200, easing = DragEasing),
        label = "checklistNeighbourShift",
    )
    val removeLabel = stringResource(R.string.native_checklist_remove_item)
    val moveLabel = stringResource(R.string.native_checklist_move_item)
    val placeholder = stringResource(R.string.native_checklist_item_placeholder)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = if (item.indent == 1) IndentStep else 0.dp)
            .onSizeChanged { onHeight(it.height) }
            .zIndex(if (dragging) 1f else 0f)
            .graphicsLayer {
                translationY = if (draggingVertically) dragOffsetY else with(density) { shiftDp.toPx() }
                if (draggingVertically) {
                    scaleX = 1.03f
                    scaleY = 1.03f
                    shadowElevation = with(density) { 12.dp.toPx() }
                    shape = RoundedCornerShape(8.dp)
                    clip = false
                }
            },
    ) {
        // [data-checklist-slide]: the handle, the box and the text slide
        // together while indenting; the delete button stays put.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .offset { IntOffset(slideX.roundToInt(), 0) },
        ) {
            Box(
                modifier = Modifier
                    .semantics { contentDescription = moveLabel }
                    .padding(horizontal = 4.dp)
                    .pointerInput(item.id, canIndent, item.indent) {
                        var locked = false
                        var vertical = false
                        var totalX = 0f
                        var totalY = 0f
                        detectDragGestures(
                            onDragStart = {
                                locked = false
                                vertical = false
                                totalX = 0f
                                totalY = 0f
                            },
                            onDrag = { change, delta ->
                                change.consume()
                                totalX += delta.x
                                totalY += delta.y
                                if (!locked) {
                                    // 8px axis lock: whichever axis wins
                                    // first owns the whole gesture.
                                    if (abs(totalX) < AxisLockPx && abs(totalY) < AxisLockPx) return@detectDragGestures
                                    locked = true
                                    vertical = abs(totalX) <= abs(totalY)
                                    onDragStart(vertical)
                                }
                                if (vertical) {
                                    onDragDelta(delta.y)
                                } else {
                                    val step = with(density) { IndentStep.toPx() }
                                    val allowed = if (totalX > 0) canIndent else item.indent == 1
                                    slideX = if (!allowed) 0f else totalX.coerceIn(-step, step)
                                }
                            },
                            onDragEnd = {
                                if (locked && vertical) {
                                    onDragEnd()
                                } else if (locked) {
                                    val step = with(density) { IndentStep.toPx() }
                                    if (abs(slideX) >= step) {
                                        onIndentChange(if (slideX > 0) 1 else 0)
                                    }
                                    slideX = 0f
                                }
                                locked = false
                            },
                            onDragCancel = {
                                if (locked && vertical) onDragCancel()
                                slideX = 0f
                                locked = false
                            },
                        )
                    },
            ) {
                ChecklistDragHandle(dark = dark)
            }
            Spacer(Modifier.width(8.dp))
            Checkbox(
                checked = item.done,
                onCheckedChange = onToggle,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(6.dp))
            BasicTextField(
                value = item.text,
                onValueChange = onTextChange,
                textStyle = TextStyle(
                    color = if (item.done) (if (dark) CheckedTextDark else CheckedTextLight) else titleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    textDecoration = if (item.done) TextDecoration.LineThrough else TextDecoration.None,
                ),
                cursorBrush = SolidColor(titleColor),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { onEnter() }),
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(focusRequester)
                    .onFocusChanged { state -> if (!state.isFocused) onBlur() },
                decorationBox = { innerTextField ->
                    if (item.text.isEmpty()) {
                        Text(
                            placeholder,
                            color = if (dark) PlaceholderDark else PlaceholderLight,
                            fontSize = 14.sp,
                        )
                    }
                    innerTextField()
                },
            )
        }
        Box(
            modifier = Modifier
                .padding(start = 6.dp)
                .offset(x = (-8).dp)
                .size(24.dp)
                .clip(CircleShape)
                .alpha(0.8f)
                .semantics { contentDescription = removeLabel }
                .gkTooltip(removeLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onRemove() },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "✕",
                color = if (dark) HandleDotDark else CheckedTextLight,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/**
 * SectionHeader.jsx:212-342: handle, colour dot, collapse chevron, the
 * inline-editable title, the unchecked count and a delete button that
 * asks twice.
 */
@Composable
private fun ChecklistSectionHeader(
    section: ChecklistSectionData,
    accent: Color?,
    uncheckedCount: Int,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    onDragStart: () -> Unit,
    onDragDelta: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    onChange: (ChecklistSectionData) -> Unit,
    onRemove: () -> Unit,
) {
    var editingTitle by remember(section.id) { mutableStateOf(section.title.isBlank()) }
    var pickerOpen by remember(section.id) { mutableStateOf(false) }
    var confirmingRemove by remember(section.id) { mutableStateOf(false) }
    val collapseLabel = stringResource(
        if (section.collapsed) R.string.native_checklist_expand_section else R.string.native_checklist_collapse_section,
    )
    val colorLabel = stringResource(R.string.native_checklist_section_color)
    val removeLabel = stringResource(
        if (confirmingRemove) R.string.native_checklist_confirm_remove_section else R.string.native_checklist_remove_section,
    )
    val moveLabel = stringResource(R.string.native_checklist_move_section)

    // The confirmation falls back to a plain delete button after three
    // seconds, same as the web (SectionHeader.jsx:179-185).
    if (confirmingRemove) {
        androidx.compose.runtime.LaunchedEffect(section.id, confirmingRemove) {
            kotlinx.coroutines.delay(3000)
            confirmingRemove = false
        }
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .fillMaxWidth()
            .then(if (accent != null) Modifier.background(accent.copy(alpha = if (dark) 0.22f else 0.12f)) else Modifier)
            .bottomHairline(accent?.copy(alpha = if (dark) 0.35f else 0.20f))
            .padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        Box(
            modifier = Modifier
                .semantics { contentDescription = moveLabel }
                .gkTooltip(moveLabel)
                .pointerInput(section.id) {
                    detectDragGestures(
                        onDragStart = { onDragStart() },
                        onDrag = { change, delta ->
                            change.consume()
                            onDragDelta(delta.y)
                        },
                        onDragEnd = { onDragEnd() },
                        onDragCancel = { onDragCancel() },
                    )
                },
        ) {
            ChecklistDragHandle(dark = dark, small = true)
        }
        Box {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .then(
                        if (accent != null) {
                            Modifier.background(accent)
                        } else {
                            Modifier.border(2.dp, if (dark) PlaceholderDark else HandleDotLight, CircleShape)
                        },
                    )
                    .semantics { contentDescription = colorLabel }
                    .gkTooltip(colorLabel)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { pickerOpen = true },
            )
            if (pickerOpen) {
                ChecklistSectionColorPicker(
                    selected = section.color,
                    dark = dark,
                    onSelect = { color -> onChange(section.copy(color = color)); pickerOpen = false },
                    onDismiss = { pickerOpen = false },
                )
            }
        }
        Box(
            modifier = Modifier
                .size(20.dp)
                .semantics { contentDescription = collapseLabel }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onChange(section.copy(collapsed = !section.collapsed)) },
            contentAlignment = Alignment.Center,
        ) {
            ChevronDownIcon(
                modifier = Modifier.rotate(if (section.collapsed) -90f else 0f),
                size = 14.dp,
                tint = if (dark) PlaceholderDark else HandleDotLight,
            )
        }
        if (editingTitle) {
            BasicTextField(
                value = section.title,
                onValueChange = { onChange(section.copy(title = it)) },
                singleLine = true,
                textStyle = TextStyle(color = titleColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
                cursorBrush = SolidColor(titleColor),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { editingTitle = false }),
                modifier = Modifier
                    .weight(1f)
                    .onFocusChanged { state -> if (!state.isFocused) editingTitle = false },
                decorationBox = { innerTextField ->
                    if (section.title.isEmpty()) {
                        Text(
                            stringResource(R.string.native_checklist_section_title_placeholder),
                            color = if (dark) PlaceholderDark else PlaceholderLight,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    innerTextField()
                },
            )
        } else {
            Text(
                section.title,
                color = titleColor,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .weight(1f)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { editingTitle = true },
            )
        }
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Color.White)
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text(
                uncheckedCount.toString(),
                color = accent ?: Color.Black.copy(alpha = 0.5f),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(RoundedCornerShape(4.dp))
                .semantics { contentDescription = removeLabel }
                .gkTooltip(removeLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) {
                    if (confirmingRemove) onRemove() else confirmingRemove = true
                },
            contentAlignment = Alignment.Center,
        ) {
            if (confirmingRemove) {
                CheckmarkIcon(size = 16.dp, tint = SectionDeleteRed)
            } else {
                CloseIcon(size = 16.dp, tint = SectionDeleteRed)
            }
        }
    }
}

/** ColorPicker (SectionHeader.jsx:34-104): five 32px dots per row, the
 *  "no colour" crossed circle first, and a white-then-colour ring on the
 *  selected one. */
@Composable
private fun ChecklistSectionColorPicker(
    selected: String?,
    dark: Boolean,
    onSelect: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val borderColor = if (dark) Color(0x4D4B5563) else Color(0x4DD1D5DB)
    FooterPopover(
        gap = 6.dp,
        width = 216.dp,
        cornerRadius = 8.dp,
        elevation = 16.dp,
        background = if (dark) Color(0xFF1F2937) else Color.White,
        borderColor = borderColor,
        onDismiss = onDismiss,
    ) {
        val entries: List<Pair<String?, Color?>> = listOf(null to null) + ChecklistSectionColors.map { it.first to it.second }
        Column(
            modifier = Modifier.padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            entries.chunked(5).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { (key, color) ->
                        val isSelected = key == selected
                        val label = if (key == null) stringResource(R.string.native_checklist_no_color) else key
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .then(if (color != null) Modifier.background(color) else Modifier)
                                .then(
                                    if (isSelected) {
                                        Modifier.border(
                                            width = 3.5.dp,
                                            color = color ?: Color(0xFF94A3B8),
                                            shape = CircleShape,
                                        )
                                    } else if (color == null) {
                                        Modifier.border(1.5.dp, if (dark) PlaceholderDark else HandleDotLight, CircleShape)
                                    } else {
                                        Modifier
                                    },
                                )
                                .semantics { contentDescription = label }
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { onSelect(key) },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (color == null) {
                                Text("∕", color = if (dark) PlaceholderDark else HandleDotLight, fontSize = 18.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

private val SectionDeleteRed = Color(0xFFEF4444)

/** Six 4px dots in two columns, always visible on touch at 40% opacity
 *  (ChecklistEditor.jsx:255-273). */
@Composable
private fun ChecklistDragHandle(dark: Boolean, small: Boolean = false) {
    val dot = if (dark) HandleDotDark else HandleDotLight
    Column(
        verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = Modifier.alpha(0.4f).padding(horizontal = if (small) 2.dp else 0.dp),
    ) {
        repeat(3) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                repeat(2) {
                    Box(Modifier.size(4.dp).clip(CircleShape).background(dot))
                }
            }
        }
    }
}

@Composable
private fun ChecklistAddRow(borderColor: Color, dark: Boolean, onClick: () -> Unit) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onClick() }
                .padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val tint = if (dark) HandleDotDark else HandleDotLight
            Text("+", color = tint, fontSize = 18.sp)
            Text(stringResource(R.string.native_checklist_add_item), color = tint, fontSize = 14.sp)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
    }
}

@Composable
private fun ChecklistAddToSectionRow(subtextColor: Color, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(start = 16.dp, top = 6.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("+", color = subtextColor, fontSize = 12.sp)
        Text(stringResource(R.string.native_checklist_add_to_section), color = subtextColor, fontSize = 12.sp)
    }
}

@Composable
private fun ChecklistAddSectionButton(borderColor: Color, subtextColor: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .dashedBorder(borderColor, RoundedCornerShape(4.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        Text("+ " + stringResource(R.string.native_checklist_add_section), color = subtextColor, fontSize = 12.sp)
    }
}

/** The "Done" area (ChecklistEditor.jsx:439-513): a hairline, a
 *  collapsible header with its own slate pill, then the checked rows
 *  grouped by section without ever moving them in the data. */
@Composable
private fun ChecklistDoneArea(
    blocks: List<ChecklistBlock>,
    collapsed: Boolean,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    onToggleCollapsed: () -> Unit,
    onToggle: (String, Boolean) -> Unit,
    onRemove: (String) -> Unit,
) {
    val checkedCount = blocks.sumOf { block -> block.items.count { it.done } }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
        Spacer(Modifier.height(16.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(2.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onToggleCollapsed() }
                .padding(horizontal = 8.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            ChevronDownIcon(
                modifier = Modifier.rotate(if (collapsed) -90f else 0f),
                size = 14.dp,
                tint = if (dark) PlaceholderDark else HandleDotLight,
            )
            Text(
                stringResource(R.string.native_checklist_done),
                color = if (dark) CheckedTextDark else CheckedTextLight,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(DoneCountBg)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            ) {
                Text(checkedCount.toString(), color = DoneCountFg, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }
        if (!collapsed) {
            Spacer(Modifier.height(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                blocks.forEach { block ->
                    val checked = ChecklistItems.orderCheckedForDisplay(block.items)
                    if (checked.isEmpty()) return@forEach
                    block.section?.let { section ->
                        Text(
                            section.title,
                            color = if (dark) PlaceholderDark else HandleDotLight,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 0.3.sp,
                        )
                    }
                    checked.forEach { item ->
                        ChecklistDoneRow(
                            item = item,
                            dark = dark,
                            subtextColor = subtextColor,
                            onToggle = { value -> onToggle(item.id, value) },
                            onRemove = { onRemove(item.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChecklistDoneRow(
    item: ChecklistItemData,
    dark: Boolean,
    subtextColor: Color,
    onToggle: (Boolean) -> Unit,
    onRemove: () -> Unit,
) {
    val removeLabel = stringResource(R.string.native_checklist_remove_item)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(start = if (item.indent == 1) IndentStep else 0.dp),
    ) {
        Checkbox(checked = true, onCheckedChange = onToggle, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(6.dp))
        Text(
            item.text,
            color = if (dark) CheckedTextDark else CheckedTextLight,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            textDecoration = TextDecoration.LineThrough,
            modifier = Modifier.weight(1f),
        )
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .alpha(0.8f)
                .semantics { contentDescription = removeLabel }
                .gkTooltip(removeLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onRemove() },
            contentAlignment = Alignment.Center,
        ) {
            Text("✕", color = subtextColor, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Full, non-interactive listing (every item, checked included, unlike the
 *  capped/unchecked-only NoteCard preview), used where a checklist is only
 *  being shown rather than edited. */
@Composable
fun ChecklistReadOnlyPreview(items: List<JsonElement>, titleColor: Color, subtextColor: Color) {
    val parsed = remember(items) { ChecklistPreview.parse(JsonArray(items).toString()) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (item in parsed) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (item.done) "☑" else "☐",
                    color = subtextColor,
                    fontSize = 15.sp,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    item.text,
                    color = if (item.done) subtextColor else titleColor,
                    fontSize = 14.sp,
                    textDecoration = if (item.done) TextDecoration.LineThrough else TextDecoration.None,
                )
            }
        }
    }
}
