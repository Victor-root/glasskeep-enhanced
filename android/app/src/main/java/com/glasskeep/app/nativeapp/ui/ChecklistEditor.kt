package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
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
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
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
import androidx.compose.ui.unit.Dp
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
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/** INDENT_STEP_PX (checklist.js:47): the one value shared by the row's
 *  own margin and the horizontal distance that commits an indent. */
private val IndentStep = 28.dp

/** AXIS_LOCK_PX (useChecklistDrag.js:11). */
private val AxisLock = 8.dp

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
    noteBackground: Color,
    scrollState: ScrollState,
    scrollViewport: () -> Rect?,
    readOnly: Boolean = false,
) {
    val blocks = remember(entries) { ChecklistItems.blocks(entries) }
    val hasChecked = remember(entries) { entries.any { it is ChecklistItemData && it.done } }

    // The web lets the list scroll by itself within 60px of the note's
    // edges, by up to 12px a frame.
    val density = LocalDensity.current
    val dragScope = rememberCoroutineScope()
    val drag = remember(density) {
        ChecklistDragController(dragScope, with(density) { 60.dp.toPx() }, with(density) { 12.dp.toPx() })
    }
    SideEffect {
        drag.scrollState = scrollState
        drag.viewport = scrollViewport
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

    /** Every row a dragged item can land among, in the order drawn. */
    fun dragSlots(): List<ChecklistDragSlot> = buildList {
        for (block in blocks) {
            val section = block.section
            val blockKey = section?.id ?: DefaultBlockKey
            val rows = block.items.filterNot { it.done }.map { ChecklistDragSlot(it.id, it.id, false, blockKey) }
            if (section == null) {
                if (insertPosition == "top") add(ChecklistDragSlot(AddRowSlot, null, false, blockKey))
                addAll(rows)
                if (insertPosition != "top") add(ChecklistDragSlot(AddRowSlot, null, false, blockKey))
            } else {
                add(ChecklistDragSlot(headerSlot(section.id), null, true, blockKey))
                if (!section.collapsed) {
                    addAll(rows)
                    add(ChecklistDragSlot(addToSectionSlot(section.id), null, false, blockKey))
                }
            }
        }
    }

    /** The dropped item joins the block its new neighbours say, a header
     *  right after it meaning the block before, at the place among that
     *  block's unchecked rows the rows before it give. */
    fun commitItemMove(slots: List<ChecklistDragSlot>, from: Int, to: Int) {
        if (from == to) return
        val itemId = slots[from].itemId ?: return
        val order = slots.toMutableList().apply { add(to, removeAt(from)) }
        val previous = order.getOrNull(to - 1)
        val next = order.getOrNull(to + 1)
        val target = if (next != null && !next.isHeader) next.blockKey else previous?.blockKey ?: DefaultBlockKey
        val position = (0 until to).count { order[it].itemId != null && order[it].blockKey == target }
        ChecklistItems.moveItemIntoSection(entries, itemId, target.takeUnless { it == DefaultBlockKey }, position)
            ?.let { commitEntries(it) }
    }

    fun commitBlockMove(keys: List<String>, from: Int, to: Int) {
        if (from == to) return
        val order = keys.toMutableList().apply { add(to, removeAt(from)) }
        commitEntries(ChecklistItems.reorderSections(entries, order.filterNot { it == DefaultBlockKey }))
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
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .bleedHorizontally(16.dp)
            .onGloballyPositioned { drag.attachRoot(it) }
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
                blocks.forEach { block ->
                    val blockKey = block.section?.id ?: DefaultBlockKey
                    ChecklistSectionBlock(
                        block = block,
                        entries = entries,
                        readOnly = readOnly,
                        insertPosition = insertPosition,
                        onAddAtEdge = { addItemAtEdge() },
                        drag = drag,
                        noteBackground = noteBackground,
                        onLiftItem = { id, fingerRootY -> drag.liftItem(id, dragSlots(), fingerRootY) },
                        onDropItem = { drag.dropItem { slots, from, to -> commitItemMove(slots, from, to) } },
                        onLiftBlock = { fingerRootY ->
                            drag.liftBlock(blockKey, blocks.map { it.section?.id ?: DefaultBlockKey }, fingerRootY)
                        },
                        onDropBlock = { drag.dropBlock { keys, from, to -> commitBlockMove(keys, from, to) } },
                        dark = dark,
                        titleColor = titleColor,
                        borderColor = borderColor,
                        focusRequesterFor = focusRequesterFor,
                        caretToEndId = caretToEndId,
                        onCaretPlaced = { caretToEndId = null },
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
        // The carried item's own floating copy, over everything.
        drag.liftedItemId?.let { id ->
            (entries.firstOrNull { it.id == id } as? ChecklistItemData)?.let { item ->
                ChecklistLiftedRow(item = item, drag = drag, background = noteBackground, dark = dark, textColor = titleColor)
            }
        }
    }
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
    drag: ChecklistDragController,
    noteBackground: Color,
    onLiftItem: (id: String, fingerRootY: Float) -> Boolean,
    onDropItem: () -> Unit,
    onLiftBlock: (fingerRootY: Float) -> Boolean,
    onDropBlock: () -> Unit,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    focusRequesterFor: (id: String) -> FocusRequester,
    caretToEndId: String?,
    onCaretPlaced: () -> Unit,
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
    val blockKey = section?.id ?: DefaultBlockKey
    val accent = sectionColorOf(section?.color)
    val unchecked = block.items.filterNot { it.done }
    val collapsed = section?.collapsed == true

    @Composable
    fun Rows() {
        for (item in unchecked) key(item.id) {
            ChecklistRowView(
                item = item,
                readOnly = readOnly,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                focusRequester = focusRequesterFor(item.id),
                caretToEnd = caretToEndId == item.id,
                onCaretPlaced = onCaretPlaced,
                drag = drag,
                canIndent = ChecklistItems.canIndent(entries, item.id),
                onLift = { fingerRootY -> onLiftItem(item.id, fingerRootY) },
                onDrop = onDropItem,
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

    // A lifted section is the block itself, raised in its own place while
    // the others slide around it. The web's floating copy keeps the
    // block's max-sm:-ml-2, so it rides 8dp left of the block.
    val lifted = drag.liftedBlockKey == blockKey
    val liftShape = RoundedCornerShape(8.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            // max-sm:-mx-2: a section reaches the panel's own edges.
            .then(if (section != null) Modifier.bleedHorizontally(8.dp) else Modifier)
            .onGloballyPositioned { drag.placeBlock(blockKey, it) }
            .zIndex(if (lifted) 1f else 0f)
            .graphicsLayer {
                translationY = if (lifted) drag.blockOffset else drag.blockShiftOf(blockKey)
                if (lifted) {
                    translationX = -8.dp.toPx()
                    scaleX = 1.02f - 0.02f * drag.settle
                    scaleY = scaleX
                }
            }
            .then(
                if (lifted) {
                    Modifier
                        .dropShadow(liftShape, checklistLiftShadow(drag.settle))
                        .background(noteBackground, liftShape)
                } else {
                    Modifier
                },
            ),
    ) {
        if (section == null) {
            // space-y-3 around the rows. An empty row list still carries its
            // 12dp margin: under the "bottom" add row it collapses above the
            // block, over the "top" one into the 24dp gap that follows.
            if (!readOnly && insertPosition == "top") {
                ChecklistAddRow(
                    borderColor = borderColor,
                    dark = dark,
                    modifier = Modifier.checklistDragSlot(AddRowSlot, drag),
                    onClick = onAddAtEdge,
                )
                if (unchecked.isNotEmpty()) Spacer(Modifier.height(12.dp))
            } else if (!readOnly && unchecked.isEmpty()) {
                Spacer(Modifier.height(12.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { Rows() }
            if (!readOnly && insertPosition != "top") {
                if (unchecked.isNotEmpty()) Spacer(Modifier.height(12.dp))
                ChecklistAddRow(
                    borderColor = borderColor,
                    dark = dark,
                    modifier = Modifier.checklistDragSlot(AddRowSlot, drag),
                    onClick = onAddAtEdge,
                )
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
                    drag = drag,
                    onLift = onLiftBlock,
                    onDrop = onDropBlock,
                    onChange = onSectionChange,
                    onEnter = { title -> onSectionEnter(section.id, title) },
                    onRemove = { onSectionRemove(section.id) },
                    modifier = Modifier.checklistDragSlot(headerSlot(section.id), drag),
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
                        if (!readOnly) {
                            ChecklistAddToSectionRow(
                                dark = dark,
                                modifier = Modifier.checklistDragSlot(addToSectionSlot(section.id), drag),
                                onClick = onAddToSection,
                            )
                        }
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

/** Drag slot names of the rows that are not items. */
private const val AddRowSlot = "add"

private fun headerSlot(sectionId: String) = "header:$sectionId"

private fun addToSectionSlot(sectionId: String) = "addto:$sectionId"

/** How a gesture on a row's handle turned out once it cleared the 8dp
 *  axis lock: a carried row, an indent slide, or neither when the row
 *  could not be lifted. */
private enum class HandleGesture { Pending, Vertical, Horizontal, Ignored }

/**
 * Follows the finger that went down on a drag handle until it lifts
 * (true) or the gesture is cancelled (false). Every change is consumed,
 * as the web's `touch-action: none` handles keep the note from
 * scrolling; [onMove] gets each position in the root's coordinates.
 */
private suspend fun AwaitPointerEventScope.trackHandle(
    down: PointerInputChange,
    handle: CoordinatesHolder,
    onMove: (Offset) -> Unit,
): Boolean {
    while (true) {
        val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: return false
        if (!change.pressed) {
            val lifted = change.changedToUp()
            change.consume()
            return lifted
        }
        change.consume()
        handle.toRoot(change.position)?.let(onMove)
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
    drag: ChecklistDragController,
    canIndent: Boolean,
    onLift: (fingerRootY: Float) -> Boolean,
    onDrop: () -> Unit,
    onIndentChange: (Int) -> Unit,
    onToggle: (Boolean) -> Unit,
    onTextChange: (String) -> Unit,
    onBlur: () -> Unit,
    onEnter: (atStart: Boolean) -> Unit,
    onBackspaceEmpty: () -> Unit,
    onRemove: () -> Unit,
) {
    val slide = remember(item.id) { Animatable(0f) }
    val slideScope = rememberCoroutineScope()
    val handle = remember { CoordinatesHolder() }
    val currentCanIndent by rememberUpdatedState(canIndent)
    val currentIndent by rememberUpdatedState(item.indent)
    val currentOnLift by rememberUpdatedState(onLift)
    val currentOnDrop by rememberUpdatedState(onDrop)
    val currentOnIndentChange by rememberUpdatedState(onIndentChange)
    val moveLabel = stringResource(R.string.native_checklist_move_item)

    fun slideTo(x: Float) {
        slideScope.launch(start = CoroutineStart.UNDISPATCHED) { slide.snapTo(x) }
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = if (item.indent == 1) IndentStep else 0.dp)
            .checklistDragSlot(item.id, drag),
    ) {
        // [data-checklist-slide]: the handle, the box and the text slide
        // together while indenting; the delete button stays put.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .offset { IntOffset(slide.value.roundToInt(), 0) },
        ) {
            if (!readOnly) {
                Box(
                    modifier = Modifier
                        .semantics { contentDescription = moveLabel }
                        .padding(horizontal = 4.dp)
                        .onGloballyPositioned { handle.value = it }
                        .pointerInput(item.id) {
                            val axisLock = AxisLock.toPx()
                            val step = IndentStep.toPx()
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                down.consume()
                                val origin = handle.toRoot(down.position) ?: return@awaitEachGesture
                                // Fixed for the whole gesture, as the web
                                // reads them once on pointerdown.
                                val canIndentNow = currentCanIndent
                                val canOutdentNow = currentIndent == 1
                                var mode = HandleGesture.Pending
                                var deltaX = 0f
                                var released = false
                                try {
                                    released = trackHandle(down, handle) { point ->
                                        deltaX = point.x - origin.x
                                        val deltaY = point.y - origin.y
                                        if (mode == HandleGesture.Pending) {
                                            // Whichever axis clears 8dp first owns
                                            // the whole gesture, a tie going to
                                            // the vertical carry.
                                            if (abs(deltaX) < axisLock && abs(deltaY) < axisLock) return@trackHandle
                                            mode = when {
                                                abs(deltaX) > abs(deltaY) -> HandleGesture.Horizontal
                                                currentOnLift(origin.y) -> HandleGesture.Vertical
                                                else -> HandleGesture.Ignored
                                            }
                                        }
                                        when (mode) {
                                            HandleGesture.Vertical -> drag.dragItemTo(point.y)
                                            HandleGesture.Horizontal -> {
                                                val allowed = (deltaX > 0 && canIndentNow) || (deltaX < 0 && canOutdentNow)
                                                slideTo(if (allowed) deltaX.coerceIn(-step, step) else 0f)
                                            }
                                            else -> Unit
                                        }
                                    }
                                } finally {
                                    if (!released) {
                                        when (mode) {
                                            HandleGesture.Vertical -> drag.cancel()
                                            HandleGesture.Horizontal -> slideTo(0f)
                                            else -> Unit
                                        }
                                    }
                                }
                                if (!released) return@awaitEachGesture
                                when (mode) {
                                    HandleGesture.Vertical -> currentOnDrop()
                                    HandleGesture.Horizontal -> {
                                        // A slide of a full step commits; the
                                        // row already sits where its new
                                        // margin puts it. A shorter one
                                        // springs back.
                                        val indent = canIndentNow && deltaX >= step
                                        val outdent = canOutdentNow && deltaX <= -step
                                        if (indent || outdent) {
                                            currentOnIndentChange(if (indent) 1 else 0)
                                            slideTo(0f)
                                        } else {
                                            slideScope.launch { slide.animateTo(0f, tween(durationMillis = 150, easing = ChecklistDragEasing)) }
                                        }
                                    }
                                    else -> Unit
                                }
                            }
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
        // The row's 8dp gap plus the button's own ml-1.5.
        if (!readOnly) ChecklistRemoveButton(dark = dark, gap = 14.dp, onRemove = onRemove)
    }
}

/**
 * The carried row's floating copy (useChecklistDrag.js:125-141): the row
 * as it reads at rest, as wide as its content up to the row's own width,
 * padded 4/12/4/4 on the note's background with the lift shadow, 3%
 * larger until it settles. The web's copy keeps the row's inline indent
 * margin on top of the row's own position, so an indented row floats one
 * step further right.
 */
@Composable
private fun ChecklistLiftedRow(
    item: ChecklistItemData,
    drag: ChecklistDragController,
    background: Color,
    dark: Boolean,
    textColor: Color,
) {
    val density = LocalDensity.current
    val shape = RoundedCornerShape(8.dp)
    val links = remember(item.text) { ContactLinks.find(item.text) }
    val placeholder = stringResource(R.string.native_checklist_item_placeholder)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .offset {
                val indent = if (item.indent == 1) IndentStep.roundToPx() else 0
                IntOffset(drag.liftedLeft.roundToInt() + indent, drag.liftedTop.roundToInt())
            }
            .widthIn(max = with(density) { drag.liftedWidth.toDp() })
            .graphicsLayer {
                scaleX = 1.03f - 0.03f * drag.settle
                scaleY = scaleX
            }
            .dropShadow(shape, checklistLiftShadow(drag.settle))
            .background(background, shape)
            .padding(start = 4.dp, top = 4.dp, end = 12.dp, bottom = 4.dp),
    ) {
        Box(Modifier.padding(horizontal = 4.dp)) { ChecklistDragHandle(dark = dark) }
        Spacer(Modifier.width(8.dp))
        GkCheckbox(checked = false, onCheckedChange = null)
        Spacer(Modifier.width(6.dp))
        Text(
            if (item.text.isEmpty()) {
                AnnotatedString(placeholder, SpanStyle(color = if (dark) PlaceholderDark else PlaceholderLight))
            } else {
                checklistRestText(item.text, links, checklistLinkStyle(dark, done = false))
            },
            color = textColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            modifier = Modifier.weight(1f, fill = false).padding(bottom = 3.dp),
        )
        ChecklistRemoveButton(dark = dark, gap = 14.dp, onRemove = null)
    }
}

/** A row's "✕" (text-lg, semibold, at 80%), [gap] after the text and
 *  pulled 8dp back by its -translate-x-2; without [onRemove], the lifted
 *  copy's lookalike. */
@Composable
private fun ChecklistRemoveButton(dark: Boolean, gap: Dp, onRemove: (() -> Unit)?) {
    val removeLabel = stringResource(R.string.native_checklist_remove_item)
    Box(
        modifier = Modifier
            .padding(start = gap)
            .offset(x = (-8).dp)
            .size(24.dp)
            .clip(CircleShape)
            .alpha(0.8f)
            .then(
                if (onRemove != null) {
                    Modifier
                        .semantics { contentDescription = removeLabel }
                        .gkTooltip(removeLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onRemove() }
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text("✕", color = if (dark) HandleDotDark else CheckedTextLight, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
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
    val linkStyle = checklistLinkStyle(dark, done)
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

/** underline text-blue-600 / dark:text-blue-400, struck through too in
 *  the Done area. */
private fun checklistLinkStyle(dark: Boolean, done: Boolean) = SpanStyle(
    color = if (dark) Color(0xFF51A2FF) else Color(0xFF155DFC),
    textDecoration = if (done) {
        TextDecoration.combine(listOf(TextDecoration.Underline, TextDecoration.LineThrough))
    } else {
        TextDecoration.Underline
    },
)

/** A row's text as it reads at rest: its line breaks as spaces and its
 *  contacts in [linkStyle], character for character. */
private fun checklistRestText(text: String, links: List<ContactLink>, linkStyle: SpanStyle): AnnotatedString =
    buildAnnotatedString {
        append(text.replace('\n', ' '))
        links.forEach { addStyle(linkStyle, it.start, it.end) }
    }

/** A row at rest, the text itself untouched. */
private class ChecklistAtRestTransformation(
    private val links: List<ContactLink>,
    private val linkStyle: SpanStyle,
) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText =
        TransformedText(checklistRestText(text.text, links, linkStyle), OffsetMapping.Identity)
}

/**
 * SectionHeader.jsx:212-342: handle, colour dot, collapse chevron, the
 * inline-editable title, the unchecked count and a delete button that
 * asks twice. The handle lifts the whole section the moment it is
 * touched, with no axis lock (handleSectionPointerDown).
 */
@Composable
private fun ChecklistSectionHeader(
    section: ChecklistSectionData,
    readOnly: Boolean,
    accent: Color?,
    uncheckedCount: Int,
    dark: Boolean,
    borderColor: Color,
    drag: ChecklistDragController,
    onLift: (fingerRootY: Float) -> Boolean,
    onDrop: () -> Unit,
    onChange: (ChecklistSectionData) -> Unit,
    onEnter: (title: String) -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
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
    val handle = remember { CoordinatesHolder() }
    val currentOnLift by rememberUpdatedState(onLift)
    val currentOnDrop by rememberUpdatedState(onDrop)

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
        modifier = modifier
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
                    .onGloballyPositioned { handle.value = it }
                    .pointerInput(section.id) {
                        awaitEachGesture {
                            val down = awaitFirstDown()
                            down.consume()
                            val start = handle.toRoot(down.position)
                            val lifted = start != null && currentOnLift(start.y)
                            var released = false
                            try {
                                released = trackHandle(down, handle) { point -> if (lifted) drag.dragBlockTo(point.y) }
                            } finally {
                                if (lifted && !released) drag.cancel()
                            }
                            if (lifted && released) currentOnDrop()
                        }
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
private fun ChecklistAddRow(borderColor: Color, dark: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(modifier.fillMaxWidth()) {
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
private fun ChecklistAddToSectionRow(dark: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val tint = if (dark) CheckedTextDark else CheckedTextLight
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
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
        if (!readOnly) ChecklistRemoveButton(dark = dark, gap = 6.dp, onRemove = onRemove)
    }
}
