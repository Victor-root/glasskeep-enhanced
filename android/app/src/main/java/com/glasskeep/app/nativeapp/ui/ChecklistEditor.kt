package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.zIndex
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.ChecklistBlock
import com.glasskeep.app.nativeapp.data.ChecklistEntry
import com.glasskeep.app.nativeapp.data.ChecklistItemData
import com.glasskeep.app.nativeapp.data.ChecklistItems
import com.glasskeep.app.nativeapp.data.ChecklistSectionData
import com.glasskeep.app.nativeapp.data.ContactLink
import com.glasskeep.app.nativeapp.data.ContactLinks
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.LightBorderColor
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
private val DoneCountBg = Color(0x2464748B)
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
 * same with `persist = false`, and the row saves once it loses the focus.
 *
 * [readOnly] (a read-only share, or a mirror whose server is away) keeps
 * the same list but frozen, as the web does: no handles, crosses or add
 * buttons, greyed boxes, fixed titles; only the Done area still folds.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChecklistEditorBody(
    entries: List<ChecklistEntry>,
    insertPosition: String,
    removeSectionBehavior: String,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    doneCollapsed: Boolean,
    focusRequesterFor: (id: String) -> FocusRequester,
    onEntriesChange: (List<ChecklistEntry>, persist: Boolean) -> Unit,
    onFocusItem: (id: String) -> Unit,
    onDoneCollapsedChange: (Boolean) -> Unit,
    readOnly: Boolean = false,
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

    /** Adds an empty row at [index] of [base] and focuses it. */
    fun insertItemAt(index: Int, base: List<ChecklistEntry> = entries) {
        val item = ChecklistItems.newItem()
        val updated = base.toMutableList()
        updated.add(index.coerceIn(0, updated.size), item)
        commitEntries(updated)
        onFocusItem(item.id)
    }

    /** Where a new row of a section goes: right under its header with the
     *  "top" preference, after its last row otherwise
     *  (insertAtSectionStart / insertAtSectionEnd). */
    fun sectionInsertIndex(base: List<ChecklistEntry>, sectionId: String): Int {
        val markerIndex = base.indexOfFirst { it.id == sectionId }
        if (markerIndex < 0) return base.size
        if (insertPosition == "top") return markerIndex + 1
        return (markerIndex + 1 until base.size).firstOrNull { base[it] is ChecklistSectionData } ?: base.size
    }

    /** Enter inside a row: the new row lands above it with the caret at
     *  the very start of the text or the "top" preference, below it
     *  otherwise. */
    fun addItemAdjacent(anchorId: String, atStart: Boolean) {
        val index = entries.indexOfFirst { it.id == anchorId }
        if (index < 0) return
        insertItemAt(if (atStart || insertPosition == "top") index else index + 1)
    }

    // Set for the row that must take the focus with its caret at the end.
    var caretToEndId by remember { mutableStateOf<String?>(null) }

    /** Backspace in an empty row: it goes, and the caret moves to the end
     *  of the row before it in the list (findPrevItemId). */
    fun removeAndFocusPrevious(id: String) {
        val index = entries.indexOfFirst { it.id == id }
        if (index < 0) return
        val previous = entries.subList(0, index).lastOrNull { it is ChecklistItemData }
        commitEntries(entries.filterNot { it.id == id })
        if (previous != null) {
            caretToEndId = previous.id
            onFocusItem(previous.id)
        }
    }

    // A dismissed keyboard ends the typing, as the web blurs its field.
    val imeVisible = WindowInsets.isImeVisible
    val focusManager = LocalFocusManager.current
    var editingInside by remember { mutableStateOf(false) }
    var imeWasVisible by remember { mutableStateOf(imeVisible) }
    LaunchedEffect(imeVisible) {
        if (imeWasVisible && !imeVisible && editingInside) focusManager.clearFocus()
        imeWasVisible = imeVisible
    }

    /** The global add row always adds outside every section: at the very
     *  top, or at the end of the unsectioned rows, just before the first
     *  section (insertAtTop / insertAtBottom). */
    fun addItemAtEdge() {
        val firstMarker = entries.indexOfFirst { it is ChecklistSectionData }
        insertItemAt(if (insertPosition == "top") 0 else if (firstMarker < 0) entries.size else firstMarker)
    }

    /** Enter in a section's title: the new title and a new row in that
     *  section land together, and the row takes the focus. */
    fun renameSectionAndAddItem(sectionId: String, title: String) {
        val renamed = entries.map { if (it.id == sectionId && it is ChecklistSectionData) it.copy(title = title) else it }
        insertItemAt(sectionInsertIndex(renamed, sectionId), renamed)
    }

    fun addSection() {
        // The marker comes with one empty row under it, so the new
        // section is never born empty; its untitled header takes the
        // focus itself (ChecklistEditor.jsx:198-208).
        commitEntries(entries + ChecklistItems.newSection() + ChecklistItems.newItem())
    }

    // max-sm:-mx-4: the list reaches 16dp past the note's text gutter.
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .bleedHorizontally(16.dp)
            .onFocusChanged { editingInside = it.hasFocus },
    ) {
        if (entries.isEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (!readOnly && insertPosition == "top") ChecklistAddRow(borderColor = borderColor, dark = dark) { addItemAtEdge() }
                Text(
                    stringResource(R.string.native_checklist_empty),
                    color = CheckedTextLight,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
                if (!readOnly && insertPosition != "top") ChecklistAddRow(borderColor = borderColor, dark = dark) { addItemAtEdge() }
                if (!readOnly) {
                    ChecklistAddSectionButton(borderColor = borderColor, dark = dark, modifier = Modifier.padding(top = 8.dp)) {
                        addSection()
                    }
                }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                blocks.forEachIndexed { blockIndex, block ->
                    val blockKey = block.section?.id ?: DefaultBlockKey
                    ChecklistSectionBlock(
                        block = block,
                        entries = entries,
                        readOnly = readOnly,
                        insertPosition = insertPosition,
                        onAddAtEdge = { addItemAtEdge() },
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
                        borderColor = borderColor,
                        visibleIds = visibleIds,
                        draggingId = draggingId,
                        dragVertical = dragVertical,
                        dragOffsetY = dragOffsetY,
                        draggedIndex = draggedIndex,
                        dropIndex = dropIndex,
                        rowHeights = rowHeights,
                        focusRequesterFor = focusRequesterFor,
                        caretToEndId = caretToEndId,
                        onCaretPlaced = { caretToEndId = null },
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
                        // An emptied row stays, showing its placeholder: the web
                        // only drops an emptied row of the Done area.
                        onBlur = { commitEntries(entries) },
                        onEnter = { id, atStart -> addItemAdjacent(id, atStart) },
                        onBackspaceEmpty = { id -> removeAndFocusPrevious(id) },
                        onRemove = { id -> commitEntries(entries.filterNot { it.id == id }) },
                        onAddToSection = { block.section?.let { insertItemAt(sectionInsertIndex(entries, it.id)) } },
                        onSectionEnter = { sectionId, title -> renameSectionAndAddItem(sectionId, title) },
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
                    )
                }

                if (!readOnly) {
                    ChecklistAddSectionButton(borderColor = borderColor, dark = dark, modifier = Modifier.padding(top = 4.dp)) {
                        addSection()
                    }
                }

                // Its own 16dp top margin folds into the 24dp above it.
                if (hasChecked) {
                    ChecklistDoneArea(
                        blocks = blocks,
                        readOnly = readOnly,
                        showSectionLabels = blocks.size > 1,
                        collapsed = doneCollapsed,
                        dark = dark,
                        borderColor = borderColor,
                        onToggleCollapsed = { onDoneCollapsedChange(!doneCollapsed) },
                        onToggle = { id, checked ->
                            val ids = (listOf(id) + ChecklistItems.indentedChildren(entries, id).map { it.id }).toSet()
                            commitEntries(entries.map { if (it.id in ids && it is ChecklistItemData) it.copy(done = checked) else it })
                        },
                        onTextChange = { id, text ->
                            commitEntries(entries.map { if (it.id == id && it is ChecklistItemData) it.copy(text = text) else it }, persist = false)
                        },
                        // Only a Done row emptied and left goes away.
                        onBlur = { id ->
                            val item = entries.firstOrNull { it.id == id } as? ChecklistItemData
                            commitEntries(if (item != null && item.text.isBlank()) entries.filterNot { it.id == id } else entries)
                        },
                        onRemove = { id -> commitEntries(entries.filterNot { it.id == id }) },
                    )
                }
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

/** One block of the list: the unsectioned rows with the global add row,
 *  or a section with its header, tinted rows and "Add to section…". */
@Composable
private fun ChecklistSectionBlock(
    block: ChecklistBlock,
    entries: List<ChecklistEntry>,
    readOnly: Boolean,
    insertPosition: String,
    onAddAtEdge: () -> Unit,
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
    borderColor: Color,
    visibleIds: List<String>,
    draggingId: String?,
    dragVertical: Boolean,
    dragOffsetY: Float,
    draggedIndex: Int,
    dropIndex: Int,
    rowHeights: Map<String, Int>,
    focusRequesterFor: (id: String) -> FocusRequester,
    caretToEndId: String?,
    onCaretPlaced: () -> Unit,
    onRowHeight: (String, Int) -> Unit,
    onDragStart: (String, Boolean) -> Unit,
    onDragDelta: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    onIndentChange: (String, Int) -> Unit,
    onToggle: (String, Boolean) -> Unit,
    onTextChange: (String, String) -> Unit,
    onBlur: (String) -> Unit,
    onEnter: (id: String, atStart: Boolean) -> Unit,
    onBackspaceEmpty: (String) -> Unit,
    onRemove: (String) -> Unit,
    onAddToSection: () -> Unit,
    onSectionChange: (ChecklistSectionData) -> Unit,
    onSectionEnter: (sectionId: String, title: String) -> Unit,
    onSectionRemove: (String) -> Unit,
) {
    val section = block.section
    val accent = sectionColorOf(section?.color)
    val unchecked = block.items.filterNot { it.done }
    val collapsed = section?.collapsed == true

    @Composable
    fun Rows() {
        for (item in unchecked) key(item.id) {
            val visibleIndex = visibleIds.indexOf(item.id)
            val shift = neighbourShift(visibleIndex, draggedIndex, dropIndex, draggingId, rowHeights, visibleIds)
            ChecklistRowView(
                item = item,
                readOnly = readOnly,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                focusRequester = focusRequesterFor(item.id),
                caretToEnd = caretToEndId == item.id,
                onCaretPlaced = onCaretPlaced,
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
                onEnter = { atStart -> onEnter(item.id, atStart) },
                onBackspaceEmpty = { onBackspaceEmpty(item.id) },
                onRemove = { onRemove(item.id) },
            )
        }
    }

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
            // max-sm:-mx-2: a section reaches the panel's own edges.
            .then(if (section != null) Modifier.bleedHorizontally(8.dp) else Modifier),
    ) {
        if (section == null) {
            // space-y-3 around the rows. An empty row list still carries its
            // 12dp margin: under the "bottom" add row it collapses above the
            // block, over the "top" one into the 24dp gap that follows.
            if (!readOnly && insertPosition == "top") {
                ChecklistAddRow(borderColor = borderColor, dark = dark, onClick = onAddAtEdge)
                if (unchecked.isNotEmpty()) Spacer(Modifier.height(12.dp))
            } else if (!readOnly && unchecked.isEmpty()) {
                Spacer(Modifier.height(12.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { Rows() }
            if (!readOnly && insertPosition != "top") {
                if (unchecked.isNotEmpty()) Spacer(Modifier.height(12.dp))
                ChecklistAddRow(borderColor = borderColor, dark = dark, onClick = onAddAtEdge)
            }
        } else {
            // The 3px accent is a left border on header and rows together,
            // so it survives a collapse and pushes the header in too.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (accent != null) Modifier.drawSectionAccent(accent, dark).padding(start = 3.dp) else Modifier),
            ) {
                ChecklistSectionHeader(
                    section = section,
                    readOnly = readOnly,
                    accent = accent,
                    uncheckedCount = unchecked.size,
                    dark = dark,
                    borderColor = borderColor,
                    onDragStart = onSectionDragStart,
                    onDragDelta = onSectionDragDelta,
                    onDragEnd = onSectionDragEnd,
                    onDragCancel = onSectionDragCancel,
                    onChange = onSectionChange,
                    onEnter = { title -> onSectionEnter(section.id, title) },
                    onRemove = { onSectionRemove(section.id) },
                )
                if (!collapsed) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .then(if (accent != null) Modifier.background(accent.copy(alpha = if (dark) 0.09f else 0.04f)) else Modifier),
                    ) {
                        if (unchecked.isNotEmpty()) {
                            Column(
                                modifier = Modifier.padding(start = 12.dp, top = 4.dp, bottom = 4.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) { Rows() }
                        }
                        if (!readOnly) ChecklistAddToSectionRow(dark = dark, onClick = onAddToSection)
                    }
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
    readOnly: Boolean,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    focusRequester: FocusRequester,
    caretToEnd: Boolean,
    onCaretPlaced: () -> Unit,
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
    onEnter: (atStart: Boolean) -> Unit,
    onBackspaceEmpty: () -> Unit,
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
            if (!readOnly) {
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
            }
            GkCheckbox(checked = item.done, onCheckedChange = onToggle, enabled = !readOnly)
            Spacer(Modifier.width(6.dp))
            ChecklistRowText(
                text = item.text,
                done = false,
                readOnly = readOnly,
                textColor = titleColor,
                dark = dark,
                borderColor = borderColor,
                focusRequester = focusRequester,
                caretToEnd = caretToEnd,
                onCaretPlaced = onCaretPlaced,
                onTextChange = onTextChange,
                onBlur = onBlur,
                onEnter = onEnter,
                onBackspaceEmpty = onBackspaceEmpty,
                onIndent = { if (canIndent) onIndentChange(1) },
                onOutdent = { if (item.indent == 1) onIndentChange(0) },
                modifier = Modifier.weight(1f),
            )
        }
        if (!readOnly) {
            // The row's 8dp gap plus the button's own ml-1.5, then -translate-x-2.
            Box(
                modifier = Modifier
                    .padding(start = 14.dp)
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
}

/**
 * ChecklistRow.jsx's text: 14/20 over a 2dp foot and a 1dp line that only
 * shows while typing. At rest it reads like the web's span: line breaks as
 * spaces, phone numbers and e-mail addresses as links a tap opens, and a
 * grey "List item" when empty; tapped anywhere else it edits from there,
 * its placeholder then at half the text's own strength. Enter makes a new
 * row (above when the caret is at the very start), Backspace in an empty
 * row removes it, Ctrl+] / Ctrl+[ indent and outdent; without [onEnter]
 * (a Done row), Enter is a line break.
 */
@Composable
private fun ChecklistRowText(
    text: String,
    done: Boolean,
    textColor: Color,
    dark: Boolean,
    borderColor: Color,
    focusRequester: FocusRequester,
    caretToEnd: Boolean,
    onCaretPlaced: () -> Unit,
    onTextChange: (String) -> Unit,
    onBlur: () -> Unit,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false,
    onEnter: ((atStart: Boolean) -> Unit)? = null,
    onBackspaceEmpty: (() -> Unit)? = null,
    onIndent: (() -> Unit)? = null,
    onOutdent: (() -> Unit)? = null,
) {
    var selection by remember { mutableStateOf(TextRange(text.length)) }
    var composition by remember { mutableStateOf<TextRange?>(null) }
    var focused by remember { mutableStateOf(false) }
    var shiftEnter by remember { mutableStateOf(false) }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val uriHandler = LocalUriHandler.current
    val links = remember(text) { ContactLinks.find(text) }
    // underline text-blue-600 / dark:text-blue-400, struck through too in
    // the Done area.
    val linkStyle = SpanStyle(
        color = if (dark) Color(0xFF51A2FF) else Color(0xFF155DFC),
        textDecoration = if (done) {
            TextDecoration.combine(listOf(TextDecoration.Underline, TextDecoration.LineThrough))
        } else {
            TextDecoration.Underline
        },
    )
    val atRest = remember(links, linkStyle) { ChecklistAtRestTransformation(links, linkStyle) }

    if (readOnly) {
        // The span alone, links included, and nothing when empty.
        Text(
            remember(text, links, linkStyle) {
                buildAnnotatedString {
                    append(text.replace('\n', ' '))
                    links.forEach { addLink(LinkAnnotation.Url(it.uri, TextLinkStyles(linkStyle)), it.start, it.end) }
                }
            },
            style = TextStyle(
                color = textColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                textDecoration = if (done) TextDecoration.LineThrough else TextDecoration.None,
            ),
            modifier = modifier.padding(bottom = 3.dp),
        )
        return
    }

    LaunchedEffect(caretToEnd) {
        if (caretToEnd) {
            selection = TextRange(text.length)
            onCaretPlaced()
        }
    }

    val value = TextFieldValue(
        text = text,
        selection = TextRange(selection.start.coerceIn(0, text.length), selection.end.coerceIn(0, text.length)),
        composition = composition?.takeIf { it.max <= text.length },
    )
    BasicTextField(
        value = value,
        onValueChange = { next ->
            val newline = next.text == text.replaceRange(value.selection.min, value.selection.max, "\n")
            if (newline && onEnter != null && !shiftEnter) {
                onEnter(value.selection == TextRange.Zero)
                return@BasicTextField
            }
            shiftEnter = false
            selection = next.selection
            composition = next.composition
            if (next.text != text) onTextChange(next.text)
        },
        textStyle = TextStyle(
            color = textColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            textDecoration = if (done) TextDecoration.LineThrough else TextDecoration.None,
        ),
        cursorBrush = SolidColor(textColor),
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        visualTransformation = if (focused) VisualTransformation.None else atRest,
        onTextLayout = { layout = it },
        modifier = modifier
            .focusRequester(focusRequester)
            .onFocusChanged { state ->
                if (focused && !state.isFocused) onBlur()
                focused = state.isFocused
            }
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                val command = event.isCtrlPressed || event.isMetaPressed
                when {
                    event.key == Key.Enter && event.isShiftPressed -> {
                        shiftEnter = true
                        false
                    }
                    event.key == Key.Enter && onEnter != null && !command && !event.isAltPressed -> {
                        onEnter(value.selection == TextRange.Zero)
                        true
                    }
                    event.key == Key.Backspace && onBackspaceEmpty != null && text.isEmpty() &&
                        !command && !event.isShiftPressed && !event.isAltPressed -> {
                        onBackspaceEmpty()
                        true
                    }
                    command && !event.isShiftPressed && !event.isAltPressed && event.key == Key.RightBracket && onIndent != null -> {
                        onIndent()
                        true
                    }
                    command && !event.isShiftPressed && !event.isAltPressed && event.key == Key.LeftBracket && onOutdent != null -> {
                        onOutdent()
                        true
                    }
                    else -> false
                }
            }
            // At rest, a tap on a link opens it instead of editing.
            .pointerInput(links, focused) {
                if (focused || links.isEmpty()) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(pass = PointerEventPass.Initial)
                    val shown = layout ?: return@awaitEachGesture
                    val link = links.firstOrNull { link ->
                        (link.start until link.end).any { shown.getBoundingBox(it).contains(down.position) }
                    } ?: return@awaitEachGesture
                    down.consume()
                    val up = waitForUpOrCancellation(pass = PointerEventPass.Initial) ?: return@awaitEachGesture
                    up.consume()
                    uriHandler.openUri(link.uri)
                }
            }
            // pb-0.5, then the 1px bottom border, drawn only while typing.
            .bottomHairline(if (focused) borderColor else null)
            .padding(bottom = 3.dp),
        decorationBox = { innerTextField ->
            if (text.isEmpty()) {
                Text(
                    stringResource(R.string.native_checklist_item_placeholder),
                    color = when {
                        focused -> textColor.copy(alpha = 0.5f)
                        dark -> PlaceholderDark
                        else -> PlaceholderLight
                    },
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    textDecoration = if (done) TextDecoration.LineThrough else TextDecoration.None,
                )
            }
            innerTextField()
        },
    )
}

/** A row at rest: its line breaks read as spaces and its contacts as
 *  links, the text itself untouched, character for character. */
private class ChecklistAtRestTransformation(
    private val links: List<ContactLink>,
    private val linkStyle: SpanStyle,
) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val shown = buildAnnotatedString {
            append(text.text.replace('\n', ' '))
            links.forEach { addStyle(linkStyle, it.start, it.end) }
        }
        return TransformedText(shown, OffsetMapping.Identity)
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
    readOnly: Boolean,
    accent: Color?,
    uncheckedCount: Int,
    dark: Boolean,
    borderColor: Color,
    onDragStart: () -> Unit,
    onDragDelta: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    onChange: (ChecklistSectionData) -> Unit,
    onEnter: (title: String) -> Unit,
    onRemove: () -> Unit,
) {
    // text-gray-700 / dark:text-gray-200.
    val titleColor = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153)
    // An untitled section opens straight into its title, focused with
    // everything selected; the title is written back trimmed, once, when
    // it loses the focus, or with Enter, which also starts a row in it.
    var editingTitle by remember(section.id) { mutableStateOf(!readOnly && section.title.isBlank()) }
    var draft by remember(section.id) { mutableStateOf(TextFieldValue(section.title, TextRange(0, section.title.length))) }
    var titleFocused by remember(section.id) { mutableStateOf(false) }
    var enterPressed by remember(section.id) { mutableStateOf(false) }
    val titleFocus = remember(section.id) { FocusRequester() }
    LaunchedEffect(editingTitle) {
        if (editingTitle) titleFocus.requestFocus()
    }
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
        LaunchedEffect(section.id, confirmingRemove) {
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
            // A coloured header's bottom border adds its own 1dp.
            .bottomHairline(accent?.copy(alpha = if (dark) 0.35f else 0.20f))
            .padding(bottom = if (accent != null) 1.dp else 0.dp)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        if (!readOnly) {
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
                                // border-gray-300 / dark:border-gray-500.
                                Modifier.border(2.dp, if (dark) Color(0xFF6A7282) else Color(0xFFD1D5DC), CircleShape)
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
                        selected = section.color ?: NoSectionColor,
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
                ChecklistChevron(collapsed = section.collapsed, dark = dark)
            }
        }
        val titlePlaceholder = stringResource(R.string.native_checklist_section_title_placeholder)
        if (editingTitle) {
            BasicTextField(
                value = draft,
                onValueChange = { draft = it },
                singleLine = true,
                textStyle = TextStyle(color = titleColor, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
                cursorBrush = SolidColor(titleColor),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(
                    onDone = {
                        enterPressed = true
                        editingTitle = false
                        onEnter(draft.text.trim())
                    },
                ),
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(titleFocus)
                    .onFocusChanged { state ->
                        if (titleFocused && !state.isFocused) {
                            if (enterPressed) {
                                enterPressed = false
                            } else {
                                editingTitle = false
                                val title = draft.text.trim()
                                if (title != section.title) onChange(section.copy(title = title))
                            }
                        }
                        titleFocused = state.isFocused
                    }
                    // border-b in --border-light, under the 20dp line.
                    .bottomHairline(borderColor)
                    .padding(bottom = 1.dp),
                decorationBox = { innerTextField ->
                    if (draft.text.isEmpty()) {
                        // The input's own placeholder: its text at half strength.
                        Text(
                            titlePlaceholder,
                            color = titleColor.copy(alpha = 0.5f),
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    innerTextField()
                },
            )
        } else {
            Text(
                section.title.ifEmpty { titlePlaceholder },
                color = titleColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .weight(1f)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = !readOnly,
                        role = Role.Button,
                    ) {
                        draft = TextFieldValue(section.title, TextRange(0, section.title.length))
                        editingTitle = true
                    },
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
                lineHeight = 16.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        if (!readOnly) {
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
                    SaveCheckIcon(size = 16.dp, tint = SectionDeleteRed, strokeWidth = 2.5f)
                } else {
                    CloseIcon(size = 16.dp, tint = SectionDeleteRed, strokeWidth = 2.5f)
                }
            }
        }
    }
}

/** The key the web stores for "no colour" (SectionHeader.jsx:76). */
private const val NoSectionColor = "none"

/**
 * ColorPicker (SectionHeader.jsx:34-104): a 210dp panel 6dp under the
 * dot, its left edge on the dot's but kept 8dp inside the screen, shown
 * and hidden at once: five 32dp dots per row, "no colour" first, the
 * picked one ringed white then in its own colour, outside the dot.
 */
@Composable
private fun ChecklistSectionColorPicker(
    selected: String,
    dark: Boolean,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val density = LocalDensity.current
    val positionProvider = remember(density) {
        object : PopupPositionProvider {
            override fun calculatePosition(
                anchorBounds: IntRect,
                windowSize: IntSize,
                layoutDirection: LayoutDirection,
                popupContentSize: IntSize,
            ): IntOffset {
                val margin = with(density) { 8.dp.roundToPx() }
                val panelWidth = with(density) { 216.dp.roundToPx() }
                val left = minOf(anchorBounds.left, windowSize.width - panelWidth - margin).coerceAtLeast(margin)
                return IntOffset(left, anchorBounds.bottom + with(density) { 6.dp.roundToPx() })
            }
        }
    }
    val shape = RoundedCornerShape(8.dp)
    // gray-400 / dark:gray-500, the crossed circle's stroke.
    val noneTint = if (dark) PlaceholderDark else HandleDotLight
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(
            modifier = Modifier
                // shadow-xl.
                .dropShadow(shape, Shadow(radius = 25.dp, color = Color.Black.copy(alpha = 0.10f), spread = (-5).dp, offset = DpOffset(0.dp, 20.dp)))
                .dropShadow(shape, Shadow(radius = 10.dp, color = Color.Black.copy(alpha = 0.10f), spread = (-6).dp, offset = DpOffset(0.dp, 8.dp)))
                .clip(shape)
                .background(if (dark) Color(0xFF1E2939) else Color.White)
                .border(1.dp, if (dark) DarkBorderColor else LightBorderColor, shape)
                .padding(9.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val options: List<Pair<String, Color?>> = listOf(NoSectionColor to null) + ChecklistSectionColors
            options.chunked(5).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { (key, color) ->
                        val label = if (color == null) stringResource(R.string.native_checklist_no_color) else key
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .then(
                                    if (key == selected) {
                                        // box-shadow: 0 0 0 2px white, 0 0 0 3.5px <colour>.
                                        Modifier
                                            .dropShadow(CircleShape, Shadow(radius = 0.dp, color = color ?: Color(0xFF94A3B8), spread = 3.5.dp))
                                            .dropShadow(CircleShape, Shadow(radius = 0.dp, color = Color.White, spread = 2.dp))
                                    } else {
                                        Modifier
                                    },
                                )
                                .clip(CircleShape)
                                .then(if (color != null) Modifier.background(color) else Modifier)
                                .semantics { contentDescription = label }
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { onSelect(key) },
                        ) {
                            if (color == null) NoColorIcon(size = 32.dp, tint = noneTint)
                        }
                    }
                }
            }
        }
    }
}

/** red-500. */
private val SectionDeleteRed = Color(0xFFFB2C36)

/** The list's own chevron (`M19 9l-7 7-7-7`, stroke 2.5), turning a
 *  quarter left over 200ms when its part folds. */
@Composable
private fun ChecklistChevron(collapsed: Boolean, dark: Boolean) {
    val rotation by animateFloatAsState(
        targetValue = if (collapsed) -90f else 0f,
        animationSpec = tween(durationMillis = 200, easing = CssEase),
        label = "checklistChevron",
    )
    DownChevronIcon(
        modifier = Modifier.rotate(rotation),
        size = 14.dp,
        tint = if (dark) PlaceholderDark else HandleDotLight,
        strokeWidth = 2.5f,
    )
}

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
    Column(Modifier.fillMaxWidth()) {
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
            Text("+", color = tint, fontSize = 18.sp, lineHeight = 18.sp)
            Text(stringResource(R.string.native_checklist_add_item), color = tint, fontSize = 14.sp, lineHeight = 20.sp)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
    }
}

/** `pl-4 py-1.5 text-xs`, as wide as its label only. */
@Composable
private fun ChecklistAddToSectionRow(dark: Boolean, onClick: () -> Unit) {
    val tint = if (dark) CheckedTextDark else CheckedTextLight
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(start = 16.dp, top = 6.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("+", color = tint, fontSize = 12.sp, lineHeight = 12.sp)
        Text(stringResource(R.string.native_checklist_add_to_section), color = tint, fontSize = 12.sp, lineHeight = 16.sp)
    }
}

/** The dashed `rounded px-2 py-1 text-xs` button, in Chromium's 3px-dash,
 *  2px-gap pattern. */
@Composable
private fun ChecklistAddSectionButton(borderColor: Color, dark: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(modifier) {
        Box(
            modifier = Modifier
                .dashedBorder(borderColor, RoundedCornerShape(4.dp), dash = 3.dp, gap = 2.dp)
                .clip(RoundedCornerShape(4.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onClick() }
                .padding(horizontal = 9.dp, vertical = 5.dp),
        ) {
            Text(
                "+ " + stringResource(R.string.native_checklist_add_section),
                color = if (dark) CheckedTextDark else CheckedTextLight,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
    }
}

/** The "Done" area (ChecklistEditor.jsx:439-513): a hairline, a
 *  collapsible header with its own slate pill, then the checked rows
 *  grouped by section without ever moving them in the data. Rows touch;
 *  once the list has sections, each group ends 12dp lower and carries its
 *  section's name, when it has one. */
@Composable
private fun ChecklistDoneArea(
    blocks: List<ChecklistBlock>,
    readOnly: Boolean,
    showSectionLabels: Boolean,
    collapsed: Boolean,
    dark: Boolean,
    borderColor: Color,
    onToggleCollapsed: () -> Unit,
    onToggle: (String, Boolean) -> Unit,
    onTextChange: (String, String) -> Unit,
    onBlur: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
    val checkedCount = blocks.sumOf { block -> block.items.count { it.done } }
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
        Spacer(Modifier.height(16.dp))
        // w-full -mx-2 px-2: the same width moved 8dp left, so the chevron
        // lines up with the rows.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .offset(x = (-8).dp)
                .clip(RoundedCornerShape(2.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onToggleCollapsed() }
                .padding(horizontal = 8.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            ChecklistChevron(collapsed = collapsed, dark = dark)
            Text(
                stringResource(R.string.native_checklist_done),
                color = if (dark) CheckedTextDark else CheckedTextLight,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Box(
                modifier = Modifier
                    .padding(start = 2.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(DoneCountBg)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            ) {
                Text(
                    checkedCount.toString(),
                    color = DoneCountFg,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
        if (!collapsed) {
            Spacer(Modifier.height(12.dp))
            blocks.forEach { block ->
                val checked = ChecklistItems.orderCheckedForDisplay(block.items)
                if (checked.isEmpty()) return@forEach
                Column(Modifier.padding(bottom = if (showSectionLabels) 12.dp else 0.dp)) {
                    block.section?.title?.takeIf { it.isNotEmpty() }?.let { title ->
                        Text(
                            title,
                            color = if (dark) PlaceholderDark else HandleDotLight,
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 0.3.sp,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                    }
                    checked.forEach { item ->
                        key(item.id) {
                            ChecklistDoneRow(
                                item = item,
                                readOnly = readOnly,
                                dark = dark,
                                borderColor = borderColor,
                                onToggle = { value -> onToggle(item.id, value) },
                                onTextChange = { text -> onTextChange(item.id, text) },
                                onBlur = { onBlur(item.id) },
                                onRemove = { onRemove(item.id) },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** A checked row: box, struck-through text, still editable, and its own
 *  "✕", pulled 8dp left like the web's. */
@Composable
private fun ChecklistDoneRow(
    item: ChecklistItemData,
    readOnly: Boolean,
    dark: Boolean,
    borderColor: Color,
    onToggle: (Boolean) -> Unit,
    onTextChange: (String) -> Unit,
    onBlur: () -> Unit,
    onRemove: () -> Unit,
) {
    val removeLabel = stringResource(R.string.native_checklist_remove_item)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(start = if (item.indent == 1) IndentStep else 0.dp),
    ) {
        GkCheckbox(checked = true, onCheckedChange = onToggle, enabled = !readOnly)
        Spacer(Modifier.width(6.dp))
        ChecklistRowText(
            text = item.text,
            done = true,
            readOnly = readOnly,
            textColor = if (dark) CheckedTextDark else CheckedTextLight,
            dark = dark,
            borderColor = borderColor,
            focusRequester = remember { FocusRequester() },
            caretToEnd = false,
            onCaretPlaced = {},
            onTextChange = onTextChange,
            onBlur = onBlur,
            modifier = Modifier.weight(1f),
        )
        if (!readOnly) {
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
                Text("✕", color = if (dark) HandleDotDark else CheckedTextLight, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
