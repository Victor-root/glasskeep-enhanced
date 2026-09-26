package com.glasskeep.app.nativeapp.ui

import android.content.ClipData
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.DisableSelection
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.InterceptPlatformTextInput
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.MarkdownDoc
import com.glasskeep.app.nativeapp.data.RichAlign
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.TypographyProfile
import com.glasskeep.app.nativeapp.data.hasText
import com.glasskeep.app.nativeapp.data.isHeading
import com.glasskeep.app.nativeapp.data.isListItem
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** `1rem` in the web's own root font size, the unit every ported measure
 *  below is expressed in. */
private const val RemPx = 16f

/** Indent.js's INDENT_STEP_EM: one indent level is 1.75 times the block's
 *  own font size, so an indented heading shifts further than an indented
 *  paragraph, exactly as `margin-inline-start: Nem` does. */
private const val IndentStepEm = 1.75f

/** `--rt-accent` of the default theme (see WorkspaceTheme.rtAccent). */
internal val RichDefaultAccent = Color(0xFF6366F1)

/**
 * Which block the formatting bar acts on and where its cursor sits.
 * Hoisted out of [RichTextEditor] because on a phone the web puts the bar
 * in a bottom sheet between the scroll area and the footer
 * (NoteModal.jsx:927-948), so the two halves read the same state.
 *
 * Like ProseMirror's own selection it outlives the editor's focus: opening
 * the sheet blurs the text, yet the bar still knows the block and range it
 * works on, the first block's start until the user taps anywhere.
 */
class RichEditorState {
    var activeId by mutableStateOf<String?>(null)
    var selection by mutableStateOf(TextRange.Zero)

    /** ProseMirror's stored marks, ported: with nothing selected, tapping
     *  Bold (or picking a colour) arms that mark, or disarms it, for
     *  whatever is typed next. Cleared as soon as the cursor moves or the
     *  text is inserted. */
    var pendingMarks by mutableStateOf<List<PendingMark>>(emptyList())
        private set

    /** Arms [type] for what is typed next, or takes it away when it is
     *  already on there ([activeAtCaret]). */
    fun togglePending(type: RichMarkType, activeAtCaret: Boolean) {
        val current = pendingMarks.firstOrNull { it.type == type }
        pendingMarks = pendingMarks.filterNot { it.type == type } + when {
            current != null -> emptyList()
            else -> listOf(PendingMark(type, remove = activeAtCaret))
        }
    }

    fun setPending(type: RichMarkType, value: String?, color: String? = null) {
        pendingMarks = pendingMarks.filterNot { it.type == type } + PendingMark(type, value, color)
    }

    fun clearPending(type: RichMarkType, activeAtCaret: Boolean) {
        pendingMarks = pendingMarks.filterNot { it.type == type } +
            if (activeAtCaret) listOf(PendingMark(type, remove = true)) else emptyList()
    }

    fun clearAllPending() {
        pendingMarks = emptyList()
    }
}

/** One armed-but-not-yet-applied mark (see [RichEditorState.pendingMarks]);
 *  [remove] stores the mark's absence instead. */
data class PendingMark(
    val type: RichMarkType,
    val value: String? = null,
    val color: String? = null,
    val remove: Boolean = false,
)

@Composable
fun rememberRichEditorState(): RichEditorState = remember { RichEditorState() }

/** The active block's selection, clamped to that block's own current text:
 *  switching to a shorter block right after editing a longer one could
 *  otherwise leave a stale, out-of-range selection around for one frame. */
internal fun RichEditorState.safeSelectionIn(block: RichBlock?): TextRange =
    block?.let {
        TextRange(
            selection.start.coerceIn(0, it.text.length),
            selection.end.coerceIn(0, it.text.length),
        )
    } ?: TextRange.Zero

/** Where the blocks are shown: the editor, the note's read view, or a
 *  note card's preview, whose text is `text-sm`. */
private enum class RichSurface { EDITOR, READER, CARD }

/**
 * The native rich-text editor's body: one text field per block, laid out
 * with the web's own block CSS (see [richFlow]). Its formatting bar is a
 * separate composable ([RichFormatToolbar]) because the web puts it in a
 * bottom sheet at the foot of the modal, not above the text.
 *
 * Enter splits a block and Backspace at a block's start joins it back the
 * way Tiptap does (RichEdits), multi-line text pasted into a block becomes
 * one block per line, and a tap on the editor's blank area puts the caret
 * at the end of the last block ([onTapBlank]). With the formatting sheet
 * open ([suppressKeyboard]) the text still takes the caret and selections
 * but the keyboard stays down, the web's inputmode="none".
 *
 * A selection cannot run across blocks here: each block is its own field.
 */
@Composable
fun RichTextEditor(
    blocks: List<RichBlock>,
    state: RichEditorState,
    typography: TypographyProfile,
    taskStrike: Boolean,
    dark: Boolean,
    noteColor: String?,
    titleColor: Color,
    accent: Color,
    readModeEnabled: Boolean,
    minHeight: Dp,
    focusRequesterFor: (id: String) -> FocusRequester,
    onTextEdited: (id: String, newText: String, newMarks: List<RichMark>) -> Unit,
    onEnter: (id: String, atPosition: Int) -> Unit,
    onInsertLines: (id: String, newText: String, newMarks: List<RichMark>, start: Int, end: Int) -> Unit,
    onTyped: (id: String, newText: String, newMarks: List<RichMark>, caret: Int, inserted: String) -> Boolean,
    onToggleChecked: (id: String) -> Unit,
    onMergeWithPrevious: (id: String) -> Unit,
    onTapBlank: (lastTextBlockId: String) -> Unit,
    pendingSelectionFor: (id: String) -> TextRange? = { null },
    onPendingSelectionConsumed: (id: String) -> Unit = {},
    suppressKeyboard: Boolean = false,
) {
    val itemEm = typography.p.size * RemPx
    val flow = remember(blocks, itemEm) { richFlow(blocks, itemEm) }
    val firstTextId = blocks.firstOrNull { it.kind.hasText }?.id
    val lastTextId = blocks.lastOrNull { it.kind.hasText }?.id
    // The bar works on the first block until the text is touched.
    LaunchedEffect(blocks.map { it.id }) {
        if (blocks.none { it.id == state.activeId }) {
            state.activeId = firstTextId
            state.selection = TextRange.Zero
        }
    }
    // Tiptap's Placeholder: only a document holding a single empty
    // paragraph shows it.
    val placeholderId = blocks.singleOrNull()?.takeIf { it.kind == RichBlockKind.PARAGRAPH && it.text.isEmpty() }?.id
    val placeholder = stringResource(R.string.native_richtext_placeholder)

    InterceptPlatformTextInput(
        interceptor = { request, nextHandler ->
            if (suppressKeyboard) awaitCancellation() else nextHandler.startInputMethod(request)
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = minHeight)
                // `.rt-editor-content { padding: .15rem .1rem }`.
                .padding(horizontal = 1.6.dp, vertical = 2.4.dp)
                .pointerInput(lastTextId) {
                    detectTapGestures { lastTextId?.let(onTapBlank) }
                },
        ) {
            @Composable
            fun Field(block: RichBlock, style: TextStyle, modifier: Modifier, splits: Boolean = true) {
                RichTextBlockField(
                    block = block,
                    style = style,
                    dark = dark,
                    surface = RichSurface.EDITOR,
                    placeholder = if (block.id == placeholderId) placeholder else null,
                    focusRequester = focusRequesterFor(block.id),
                    pendingMarks = if (state.activeId == block.id) state.pendingMarks else emptyList(),
                    onConsumePending = { state.clearAllPending() },
                    onFocusGained = { selection ->
                        state.activeId = block.id
                        state.selection = selection
                        state.clearAllPending()
                    },
                    onSelectionChanged = { selection ->
                        if (state.activeId == block.id) {
                            state.selection = selection
                            state.clearAllPending()
                        }
                    },
                    onSelectionPlaced = { selection -> if (state.activeId == block.id) state.selection = selection },
                    onTextEdited = { newText, newMarks, newSelection ->
                        onTextEdited(block.id, newText, newMarks)
                        if (state.activeId == block.id) state.selection = newSelection
                    },
                    onEnter = if (splits) { position -> onEnter(block.id, position) } else null,
                    onInsertLines = if (splits) {
                        { newText, newMarks, start, end -> onInsertLines(block.id, newText, newMarks, start, end) }
                    } else {
                        null
                    },
                    onTyped = if (splits) {
                        { newText, newMarks, caret, inserted -> onTyped(block.id, newText, newMarks, caret, inserted) }
                    } else {
                        null
                    },
                    onMerge = { onMergeWithPrevious(block.id) },
                    pendingSelection = pendingSelectionFor(block.id),
                    onPendingSelectionConsumed = { onPendingSelectionConsumed(block.id) },
                    editExtras = !readModeEnabled,
                    noteColor = noteColor,
                    modifier = modifier,
                )
            }

            for (row in flow.rows) {
                if (row.gapBefore > 0f) Spacer(Modifier.height(row.gapBefore.dp))
                when (row) {
                    is RichQuoteRow -> {
                        val first = blocks[row.first]
                        val style = richBlockTextStyle(first, typography, taskStrike, dark, titleColor, RichSurface.EDITOR)
                        RichQuoteCard(
                            indent = (first.indent * IndentStepEm * style.fontSize.value).dp,
                            accent = accent,
                            noteColor = noteColor,
                            dark = dark,
                        ) {
                            for (index in row.first..row.last) {
                                val block = blocks[index]
                                if (index > row.first) Spacer(Modifier.height(5.6.dp))
                                Field(
                                    block,
                                    richBlockTextStyle(block, typography, taskStrike, dark, titleColor, RichSurface.EDITOR).copy(fontStyle = FontStyle.Italic),
                                    Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                    is RichBlockRow -> {
                        val block = blocks[row.index]
                        val style = richBlockTextStyle(block, typography, taskStrike, dark, titleColor, RichSurface.EDITOR)
                        val indent = (block.indent * IndentStepEm * style.fontSize.value).dp
                        when (block.kind) {
                            RichBlockKind.DIVIDER -> RichDivider(if (dark) Color.White.copy(alpha = 0.2f) else Color.Black.copy(alpha = 0.2f))
                            RichBlockKind.CODE_BLOCK -> RichEditorCodeBlock(
                                indent = indent,
                                dark = dark,
                                copyText = block.text,
                                noteColor = noteColor,
                                armable = !readModeEnabled,
                            ) { onArmedFocus ->
                                Field(block, style, Modifier.fillMaxWidth().onFocusChanged { if (it.isFocused) onArmedFocus() }, splits = false)
                            }
                            else -> RichListRow(
                                block = block,
                                style = style,
                                list = row.list,
                                indent = indent,
                                accent = accent,
                                onToggleChecked = { onToggleChecked(block.id) },
                            ) { textModifier ->
                                Field(block, style, textModifier.fillMaxWidth().then(if (taskStrike && block.isChecked) Modifier.alpha(0.6f) else Modifier))
                            }
                        }
                    }
                }
            }
            if (flow.gapAfter > 0f) Spacer(Modifier.height(flow.gapAfter.dp))
        }
    }
}

/**
 * The same document, read-only: what the web renders in view mode
 * (`.note-content`), which is its default for a text note until the user
 * taps the edit toggle, and, [compact], a note card's preview. The view's
 * text can be selected and copied, its links (phone numbers and e-mail
 * addresses included) open, a tap on a code block shows its copy button.
 */
@Composable
fun RichTextReader(
    blocks: List<RichBlock>,
    typography: TypographyProfile,
    taskStrike: Boolean,
    dark: Boolean,
    titleColor: Color,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    noteColor: String? = null,
    accent: Color = RichDefaultAccent,
) {
    val surface = if (compact) RichSurface.CARD else RichSurface.READER
    val itemEm = if (compact) 14f else typography.p.size * RemPx
    val flow = remember(blocks, itemEm) { richFlow(blocks, itemEm) }
    // Sticky hover on a touch screen: a tap shows the code block's copy
    // button, a tap anywhere else hides it again.
    var shownCopy by remember { mutableStateOf<String?>(null) }

    @Composable
    fun Body() {
        Column(
            modifier
                .fillMaxWidth()
                .pointerInput(Unit) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        shownCopy = null
                    }
                },
        ) {
            for (row in flow.rows) {
                if (row.gapBefore > 0f) Spacer(Modifier.height(row.gapBefore.dp))
                when (row) {
                    is RichQuoteRow -> {
                        val first = blocks[row.first]
                        val style = richBlockTextStyle(first, typography, taskStrike, dark, titleColor, surface)
                        RichQuoteCard(
                            indent = (first.indent * IndentStepEm * style.fontSize.value).dp,
                            accent = accent,
                            noteColor = noteColor,
                            dark = dark,
                        ) {
                            for (index in row.first..row.last) {
                                val block = blocks[index]
                                if (index > row.first) Spacer(Modifier.height(5.6.dp))
                                ReaderText(
                                    block = block,
                                    style = richBlockTextStyle(block, typography, taskStrike, dark, titleColor, surface).copy(fontStyle = FontStyle.Italic),
                                    dark = dark,
                                    surface = surface,
                                    noteColor = noteColor,
                                )
                            }
                        }
                    }
                    is RichBlockRow -> {
                        val block = blocks[row.index]
                        val style = richBlockTextStyle(block, typography, taskStrike, dark, titleColor, surface)
                        val indent = (block.indent * IndentStepEm * style.fontSize.value).dp
                        when (block.kind) {
                            // `border-top: 1px solid currentColor` (preflight): no rule
                            // softens the view's rule the way the editor's is.
                            RichBlockKind.DIVIDER -> RichDivider(titleColor)
                            RichBlockKind.CODE_BLOCK -> RichReaderCodeBlock(
                                block = block,
                                style = style,
                                indent = indent,
                                dark = dark,
                                noteColor = noteColor,
                                surface = surface,
                                copyShown = shownCopy == block.id,
                                onTap = { shownCopy = block.id },
                            )
                            else -> RichListRow(
                                block = block,
                                style = style,
                                list = row.list,
                                indent = indent,
                                accent = accent,
                                onToggleChecked = null,
                            ) { textModifier ->
                                ReaderText(
                                    block = block,
                                    style = style,
                                    dark = dark,
                                    surface = surface,
                                    noteColor = noteColor,
                                    modifier = textModifier.then(if (taskStrike && block.isChecked) Modifier.alpha(0.6f) else Modifier),
                                )
                            }
                        }
                    }
                }
            }
            if (flow.gapAfter > 0f) Spacer(Modifier.height(flow.gapAfter.dp))
        }
    }

    if (compact) Body() else SelectionContainer { Body() }
}

private val RichBlock.isChecked: Boolean get() = kind == RichBlockKind.TASK_ITEM && checked

// ---------- The block flow: the web's margins, lists and quotes ----------

/** One line of the flow: a block, or a run of quote paragraphs sharing one
 *  card, [gapBefore] under whatever came before. */
private sealed interface RichRow {
    val gapBefore: Float
}

private class RichBlockRow(val index: Int, override val gapBefore: Float, val list: RichListPlacement?) : RichRow

private class RichQuoteRow(val first: Int, val last: Int, override val gapBefore: Float) : RichRow

/** A list item's columns, from the note's left edge: its text, and where
 *  its marker belongs (the checkbox's left edge; the bullet and the number
 *  sit left of [textStart]); [number] for an ordered item. */
private class RichListPlacement(val textStart: Float, val checkboxStart: Float, val number: Int?)

private class RichFlow(val rows: List<RichRow>, val gapAfter: Float)

/** One CSS box a block sits in, with its vertical margins. */
private class FlowBox(val id: Int, val top: Float, val bottom: Float)

/**
 * The note's blocks laid out with the web's block CSS (globalCSS.js
 * `.note-content--dense`, task lists, quotes, `pre`, `hr`): every block
 * sits inside a chain of boxes (a list and its item at each nesting
 * level, a quote card, a `pre`...), and the space between two blocks is
 * the largest margin of the boxes that end above it or start under it,
 * CSS's margin collapsing: 0 between paragraphs, headings and list items,
 * 1.6 between task items and 2.4 around a task list, 9.6 around a quote,
 * 16 around code and 13.6 around a rule, 1.6 above a nested list.
 *
 * Lists nest by [RichBlock.nestLevel]: a bullet or ordered list pads its
 * items 17.6 (16 once nested, the marker in that gutter), a task list 0
 * (20 inside another task item) and puts its text 24 right of the
 * checkbox; the Indent extension moves a bullet or ordered item whole but
 * only a task item's text. Ordered items count with the web's `gk-ol`
 * counter: a nested list starts at 1, a new top-level list too unless it
 * follows a code block. [itemEm] is a list item's font size.
 */
private fun richFlow(blocks: List<RichBlock>, itemEm: Float): RichFlow {
    class Level(val kind: RichBlockKind, val list: FlowBox, var item: FlowBox, var counter: Int, var childStart: Float)

    var nextId = 0
    val levels = mutableListOf<Level>()
    val rows = mutableListOf<RichRow>()
    var previousChain = emptyList<FlowBox>()
    var topCounter = 0
    var i = 0
    while (i < blocks.size) {
        val block = blocks[i]
        var last = i
        var placement: RichListPlacement? = null
        val chain: List<FlowBox>
        if (block.kind.isListItem) {
            val level = block.nestLevel.coerceIn(0, levels.size)
            while (levels.size > level + 1) levels.removeAt(levels.lastIndex)
            val task = block.kind == RichBlockKind.TASK_ITEM
            val itemBox = FlowBox(nextId++, if (task) 1.6f else 0f, if (task) 1.6f else 0f)
            val current = levels.getOrNull(level)
            if (current != null && current.kind == block.kind) {
                current.item = itemBox
            } else {
                if (current != null) levels.removeAt(level)
                val listMargin = when {
                    task -> 2.4f
                    level > 0 -> 1.6f
                    else -> 0f
                }
                val start = if (level == 0 && blocks.getOrNull(i - 1)?.kind == RichBlockKind.CODE_BLOCK) topCounter else 0
                levels.add(Level(block.kind, FlowBox(nextId++, listMargin, if (task) 2.4f else 0f), itemBox, start, 0f))
            }
            val entry = levels[level]
            val parentStart = if (level == 0) 0f else levels[level - 1].childStart
            val padding = when {
                level == 0 -> if (task) 0f else 17.6f
                task -> if (levels[level - 1].kind == RichBlockKind.TASK_ITEM) 20f else 0f
                else -> 16f
            }
            val indent = block.indent * IndentStepEm * itemEm
            val number = if (block.kind == RichBlockKind.NUMBERED_ITEM) {
                entry.counter += 1
                if (level == 0) topCounter = entry.counter
                entry.counter
            } else {
                null
            }
            placement = if (task) {
                val checkbox = parentStart + padding
                entry.childStart = checkbox + 24f
                RichListPlacement(checkbox + 24f + indent, checkbox, null)
            } else {
                val item = parentStart + padding + indent
                entry.childStart = item
                RichListPlacement(item, item, number)
            }
            chain = levels.flatMap { listOf(it.list, it.item) }
        } else {
            levels.clear()
            val margin = when (block.kind) {
                RichBlockKind.QUOTE -> {
                    while (blocks.getOrNull(last + 1)?.kind == RichBlockKind.QUOTE) last++
                    9.6f
                }
                RichBlockKind.CODE_BLOCK -> 16f
                RichBlockKind.DIVIDER -> 13.6f
                else -> 0f
            }
            chain = listOf(FlowBox(nextId++, margin, margin))
        }
        val shared = previousChain.zip(chain).takeWhile { (a, b) -> a.id == b.id }.size
        val gap = (previousChain.drop(shared).map { it.bottom } + chain.drop(shared).map { it.top }).maxOrNull() ?: 0f
        rows += if (block.kind == RichBlockKind.QUOTE) RichQuoteRow(i, last, gap) else RichBlockRow(i, gap, placement)
        previousChain = chain
        i = last + 1
    }
    return RichFlow(rows, previousChain.maxOfOrNull { it.bottom } ?: 0f)
}

// ---------- Blocks ----------

/**
 * A paragraph, heading or list item: its text column at [RichListPlacement.textStart]
 * (or the block's own [indent]) and, for a list item, its marker: Chrome's
 * disc, the `gk-ol` number ending where the text starts (wider numbers
 * reach further left, like an outside `::marker`), or the WebView's own
 * checkbox 0.18em down, in the theme's `--rt-accent`.
 */
@Composable
private fun RichListRow(
    block: RichBlock,
    style: TextStyle,
    list: RichListPlacement?,
    indent: Dp,
    accent: Color,
    onToggleChecked: (() -> Unit)?,
    text: @Composable (Modifier) -> Unit,
) {
    if (list == null) {
        text(Modifier.padding(start = indent))
        return
    }
    val em = style.fontSize.value
    Box(Modifier.fillMaxWidth()) {
        when (block.kind) {
            RichBlockKind.TASK_ITEM -> {
                val label = stringResource(R.string.native_richtext_task_toggle)
                GkCheckbox(
                    checked = block.checked,
                    onCheckedChange = onToggleChecked?.let { toggle -> { _: Boolean -> toggle() } },
                    accent = accent,
                    modifier = Modifier
                        .offset(x = list.checkboxStart.dp, y = (0.18f * em).dp)
                        .semantics { contentDescription = label },
                )
            }
            RichBlockKind.NUMBERED_ITEM -> Text(
                "${list.number ?: 1}. ",
                style = style.copy(
                    textDecoration = TextDecoration.None,
                    textAlign = TextAlign.Start,
                    fontFeatureSettings = "tnum",
                ),
                softWrap = false,
                maxLines = 1,
                modifier = Modifier.layout { measurable, _ ->
                    val placeable = measurable.measure(Constraints())
                    layout(0, placeable.height) {
                        placeable.place(list.textStart.dp.roundToPx() - placeable.width, 0)
                    }
                },
            )
            else -> Box(
                Modifier.drawBehind {
                    drawCircle(
                        color = style.color,
                        radius = (0.15625f * em).dp.toPx(),
                        center = Offset((list.textStart - 0.88f * em).dp.toPx(), (0.75f * em).dp.toPx()),
                    )
                },
            )
        }
        text(Modifier.padding(start = list.textStart.dp))
    }
}

/** `hr`: 1px, in [color]. */
@Composable
private fun RichDivider(color: Color) {
    Box(Modifier.fillMaxWidth().height(1.dp).background(color))
}

/**
 * A quote card (globalCSS.js:1266-1292, 3004-3067): as wide as its text
 * (at most the column), an 8px bar in the accent outside its padding, the
 * accent wash, a 1px frame of the note colour on its other three sides,
 * round right corners, and the big serif opening quote in its gutter.
 * Holds every paragraph of one quote.
 */
@Composable
private fun RichQuoteCard(
    indent: Dp,
    accent: Color,
    noteColor: String?,
    dark: Boolean,
    content: @Composable ColumnScope.() -> Unit,
) {
    val bar = if (dark) Color(0xFFA5B4FC) else accent.copy(alpha = 0.85f)
    val wash = if (dark) Color(0xFFA5B4FC).copy(alpha = 0.13f) else accent.copy(alpha = 0.07f)
    val glyph = if (dark) Color(0xFFA5B4FC).copy(alpha = 0.6f) else accent.copy(alpha = 0.55f)
    val frame = quoteFrameColor(noteColor, dark)
    val shape = RoundedCornerShape(topEnd = 8.dp, bottomEnd = 8.dp)
    Box(
        Modifier
            .padding(start = indent)
            .width(IntrinsicSize.Max)
            .background(wash, shape)
            .drawBehind {
                val line = 1.dp.toPx()
                val radius = 8.dp.toPx()
                val right = size.width - line / 2f
                val bottom = size.height - line / 2f
                val edge = Path().apply {
                    moveTo(0f, line / 2f)
                    lineTo(size.width - radius, line / 2f)
                    quadraticTo(right, line / 2f, right, radius)
                    lineTo(right, size.height - radius)
                    quadraticTo(right, bottom, size.width - radius, bottom)
                    lineTo(0f, bottom)
                }
                drawPath(edge, frame, style = Stroke(line))
                drawRect(bar, size = Size(8.dp.toPx(), size.height))
            },
    ) {
        Column(
            Modifier.padding(start = 49.6.dp, top = 15.4.dp, end = 18.6.dp, bottom = 15.4.dp),
            content = content,
        )
        DisableSelection {
            Text(
                "“",
                color = glyph,
                fontSize = 54.4.sp,
                lineHeight = 54.4.sp,
                fontFamily = FontFamily.Serif,
                fontStyle = FontStyle.Normal,
                modifier = Modifier.offset(x = 15.2.dp, y = (-3).dp),
            )
        }
    }
}

/** The quote's 1px frame: `--note-color` at 18% in light mode, mixed 30%
 *  into white in dark mode (colour-mix in sRGB, alpha included). */
private fun quoteFrameColor(noteColor: String?, dark: Boolean): Color {
    val note = noteCssColor(noteColor, dark)
    if (!dark) return note.copy(alpha = note.alpha * 0.18f)
    val alpha = 0.3f * note.alpha + 0.7f
    fun mix(channel: Float) = (0.3f * note.alpha * channel + 0.7f) / alpha
    return Color(mix(note.red), mix(note.green), mix(note.blue), alpha)
}

/** The editor's `pre` (globalCSS.js:3069-3083): 9.6/13.6 padding inside a
 *  1px border, 8px radius. With the read-mode preference off the web's
 *  edit extras arm a copy button on the first tap ([armable]); otherwise a
 *  tap simply places the caret. */
@Composable
private fun RichEditorCodeBlock(
    indent: Dp,
    dark: Boolean,
    copyText: String,
    noteColor: String?,
    armable: Boolean,
    field: @Composable (onFocus: () -> Unit) -> Unit,
) {
    var armed by remember { mutableStateOf(false) }
    LaunchedEffect(armed) {
        if (armed) {
            delay(5000)
            armed = false
        }
    }
    val shape = RoundedCornerShape(8.dp)
    Box(
        Modifier
            .padding(start = indent)
            .fillMaxWidth()
            .background(if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.06f), shape)
            .border(1.dp, if (dark) RtDividerDark else RtDividerLight, shape)
            .padding(horizontal = 14.6.dp, vertical = 10.6.dp),
    ) {
        field { armed = false }
        if (armable) {
            if (armed) {
                CodeCopyButton(
                    text = copyText,
                    noteColor = noteColor,
                    dark = dark,
                    modifier = Modifier.align(Alignment.TopEnd).offset(x = 6.6.dp, y = (-2.6).dp),
                )
            } else {
                Box(Modifier.matchParentSize().pointerInput(Unit) { detectTapGestures { armed = true } })
            }
        }
    }
}

/** The view's `pre` (globalCSS.js:1241-1263): 12/14.4 padding inside a
 *  1px `--border-light` border, 9.6px radius, the same 6% black in both
 *  themes, and a copy button that only shows once the block is tapped. */
@Composable
private fun RichReaderCodeBlock(
    block: RichBlock,
    style: TextStyle,
    indent: Dp,
    dark: Boolean,
    noteColor: String?,
    surface: RichSurface,
    copyShown: Boolean,
    onTap: () -> Unit,
) {
    val shape = RoundedCornerShape(9.6.dp)
    val copyAlpha by animateFloatAsState(if (copyShown) 1f else 0f, tween(150), label = "codeCopy")
    Box(
        Modifier
            .padding(start = indent)
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.06f), shape)
            .border(1.dp, if (dark) DarkBorderColor else LightBorderColor, shape)
            .then(if (surface == RichSurface.READER) Modifier.pointerInput(Unit) { detectTapGestures { onTap() } } else Modifier),
    ) {
        ReaderText(
            block = block,
            style = style,
            dark = dark,
            surface = surface,
            noteColor = noteColor,
            modifier = Modifier.padding(horizontal = 15.4.dp, vertical = 13.dp),
        )
        if (surface == RichSurface.READER && copyAlpha > 0f) {
            DisableSelection {
                CodeCopyButton(
                    text = block.text,
                    noteColor = noteColor,
                    dark = dark,
                    modifier = Modifier.align(Alignment.TopEnd).padding(top = 8.dp, end = 8.dp).alpha(copyAlpha),
                )
            }
        }
    }
}

/**
 * `.code-copy-btn` (globalCSS.js:1999-2015): a small tab of the note's own
 * colour (`--note-color`, translucent like the web's) with its soft
 * shadow, near-black text in light mode and white in dark mode, "Copié"
 * for 1.2s after a tap.
 */
@Composable
private fun CodeCopyButton(text: String, noteColor: String?, dark: Boolean, modifier: Modifier = Modifier) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(1200)
            copied = false
        }
    }
    val shape = RoundedCornerShape(5.6.dp)
    Box(
        modifier = modifier
            .dropShadow(
                shape,
                if (dark) {
                    Shadow(radius = 10.dp, color = Color.Black.copy(alpha = 0.25f), offset = DpOffset(0.dp, 2.dp))
                } else {
                    Shadow(radius = 8.dp, color = Color.Black.copy(alpha = 0.15f), offset = DpOffset(0.dp, 2.dp))
                },
            )
            .background(noteCssColor(noteColor, dark), shape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) {
                scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("code", text))) }
                copied = true
            }
            .padding(horizontal = 7.2.dp, vertical = 3.2.dp),
    ) {
        Text(
            stringResource(if (copied) R.string.native_common_copied else R.string.native_common_copy),
            color = if (dark) Color.White else Color.Black.copy(alpha = 0.75f),
            fontSize = 12.sp,
            lineHeight = 18.sp,
        )
    }
}

/**
 * A block's text in the view: its links open (the view also turns phone
 * numbers and e-mail addresses into links, linkifyContactsHTML), inline
 * code and highlights are painted behind it, styled underlines under it,
 * and a tap on inline code shows a copy chip right after it, as
 * attachReadModeInlineCopy does.
 */
@Composable
private fun ReaderText(
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    surface: RichSurface,
    noteColor: String?,
    modifier: Modifier = Modifier,
) {
    val uriHandler = LocalUriHandler.current
    val openLink = remember(uriHandler) {
        LinkInteractionListener { link -> (link as? LinkAnnotation.Url)?.let { uriHandler.openUri(it.url) } }
    }
    val annotated = remember(block, style, dark, surface) { annotatedTextFor(block, style, dark, surface, openLink) }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val codeMarks = remember(block) { block.marks.filter { it.type == RichMarkType.CODE } }
    var armed by remember(block.id) { mutableStateOf<RichMark?>(null) }
    // EditExtras.js's MOBILE_ARM_AUTO_HIDE_MS: the chip clears itself after
    // 5s, there is no hover to hide it on.
    LaunchedEffect(armed) {
        if (armed != null) {
            delay(5000)
            armed = null
        }
    }
    val armable = surface == RichSurface.READER && codeMarks.isNotEmpty()
    Box(modifier) {
        Text(
            annotated,
            style = style,
            onTextLayout = { layout = it },
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind { layout?.let { drawRichDecorations(it, block, style, dark, surface) } }
                .then(
                    if (armable) {
                        Modifier.pointerInput(codeMarks) {
                            detectTapGestures { position ->
                                val at = layout?.charAt(position, block.text.length)
                                val hit = at?.let { i -> codeMarks.firstOrNull { i >= it.start && i < it.end } }
                                armed = if (hit != null && hit == armed) null else hit
                            }
                        }
                    } else {
                        Modifier
                    },
                ),
        )
        val armedMark = armed
        val textLayout = layout
        if (armedMark != null && textLayout != null) {
            DisableSelection { InlineCodeCopy(armedMark, block.text, textLayout, noteColor, dark) }
        }
    }
}

/**
 * EditExtras' `.rt-inline-code-copy`: the copy chip for the inline code
 * [mark], 4dp right of where it ends and centred on that line, or, when
 * it would run past the right edge, 4dp under that line against the
 * right, pushing what follows down the way the web's spacer does.
 */
@Composable
private fun InlineCodeCopy(mark: RichMark, text: String, layout: TextLayoutResult, noteColor: String?, dark: Boolean) {
    val start = mark.start.coerceIn(0, text.length)
    val end = mark.end.coerceIn(start, text.length)
    if (end <= start) return
    val box = layout.getBoundingBox(end - 1)
    Layout(content = { CodeCopyButton(text = text.substring(start, end), noteColor = noteColor, dark = dark) }) { measurables, _ ->
        val chip = measurables.first().measure(Constraints())
        val gap = 4.dp.roundToPx()
        val width = layout.size.width
        val right = box.right.toInt() + gap
        val below = right + chip.width + gap > width
        val x = if (below) (minOf(box.right.toInt(), width - gap) - chip.width).coerceAtLeast(gap) else right
        val y = if (below) box.bottom.toInt() + gap else (box.top + (box.height - chip.height) / 2f).toInt()
        val height = if (below) maxOf(layout.size.height, y + chip.height + gap) else layout.size.height
        layout(width, height) { chip.place(x, y) }
    }
}

/** The shared editable field: one BasicTextField carrying the block's own
 *  style, the caret in the text colour. Enter splits the block and a
 *  multi-line insertion becomes several blocks ([onEnter],
 *  [onInsertLines], null inside a code block, where both are plain
 *  newlines); Backspace at its start joins it backward ([onMerge]). What
 *  is typed outside an IME composition, or a composition that ends, goes
 *  through the input rules first ([onTyped], true when one applied). */
@Composable
private fun RichTextBlockField(
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    surface: RichSurface,
    placeholder: String?,
    focusRequester: FocusRequester,
    pendingMarks: List<PendingMark>,
    onConsumePending: () -> Unit,
    onFocusGained: (TextRange) -> Unit,
    onSelectionChanged: (TextRange) -> Unit,
    onSelectionPlaced: (TextRange) -> Unit,
    onTextEdited: (newText: String, newMarks: List<RichMark>, newSelection: TextRange) -> Unit,
    onEnter: ((position: Int) -> Unit)?,
    onInsertLines: ((newText: String, newMarks: List<RichMark>, start: Int, end: Int) -> Unit)?,
    onTyped: ((newText: String, newMarks: List<RichMark>, caret: Int, inserted: String) -> Boolean)?,
    onMerge: () -> Unit,
    pendingSelection: TextRange?,
    onPendingSelectionConsumed: () -> Unit,
    editExtras: Boolean,
    noteColor: String?,
    modifier: Modifier = Modifier,
) {
    // Cursor at the start on first composition: a freshly split-off block's
    // whole text is "what came after the cursor".
    var fieldValue by remember(block.id) {
        mutableStateOf(TextFieldValue(annotatedTextFor(block, style, dark, surface), TextRange.Zero))
    }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    // EditExtras, with the read-mode preference off: a tapped inline code
    // shows its copy chip, until 5s pass or it is tapped again (which then
    // places the caret); a tapped link offers Open and Edit. Both keep the
    // keyboard down.
    var armedCode by remember(block.id) { mutableStateOf<RichMark?>(null) }
    var tappedLink by remember(block.id) { mutableStateOf<RichMark?>(null) }
    LaunchedEffect(armedCode) {
        if (armedCode != null) {
            delay(5000)
            armedCode = null
        }
    }
    val focusManager = LocalFocusManager.current
    val uriHandler = LocalUriHandler.current
    // Changes that did not come from this field (a toolbar mark, a split, a
    // join) rebuild the styled value from the model, keeping whatever
    // selection still fits, unless an edit left an explicit caret for this
    // block ([pendingSelection]), which wins once.
    LaunchedEffect(block.text, block.marks, style, pendingSelection) {
        val rebuilt = annotatedTextFor(block, style, dark, surface)
        val pending = pendingSelection
        if (pending != null) {
            val placed = TextRange(pending.start.coerceIn(0, rebuilt.length), pending.end.coerceIn(0, rebuilt.length))
            fieldValue = TextFieldValue(rebuilt, placed)
            onSelectionPlaced(placed)
            onPendingSelectionConsumed()
        } else if (fieldValue.annotatedString.text != rebuilt.text || fieldValue.annotatedString.spanStyles != rebuilt.spanStyles) {
            fieldValue = TextFieldValue(
                rebuilt,
                TextRange(
                    fieldValue.selection.start.coerceIn(0, rebuilt.length),
                    fieldValue.selection.end.coerceIn(0, rebuilt.length),
                ),
            )
        }
    }

    BasicTextField(
        value = fieldValue,
        onValueChange = { new ->
            if (new.text == fieldValue.text) {
                val moved = new.selection != fieldValue.selection
                val compositionEnded = fieldValue.composition != null && new.composition == null
                fieldValue = new
                if (moved) onSelectionChanged(new.selection)
                if (compositionEnded && new.selection.collapsed) onTyped?.invoke(new.text, block.marks, new.selection.end, "")
                return@BasicTextField
            }
            val span = RichDoc.diffEdit(fieldValue.text, new.text)
            val inserted = span.oldEnd == span.start && span.newEnd > span.start
            var newMarks = RichDoc.adjustMarksForEdit(fieldValue.text, new.text, block.marks)
            if (inserted && pendingMarks.isNotEmpty()) {
                newMarks = pendingMarks.fold(newMarks) { acc, pending ->
                    if (pending.remove) {
                        RichDoc.clearMark(acc, pending.type, span.start, span.newEnd)
                    } else {
                        RichDoc.setMark(acc, pending.type, span.start, span.newEnd, pending.value, pending.color)
                    }
                }
                onConsumePending()
            }
            val newline = inserted && new.text.substring(span.start, span.newEnd).contains('\n')
            when {
                newline && onEnter != null && span.newEnd == span.start + 1 -> onEnter(span.start)
                newline && onInsertLines != null -> onInsertLines(new.text, newMarks, span.start, span.newEnd)
                else -> {
                    val typed = span.newEnd > span.start && new.composition == null &&
                        new.selection.collapsed && new.selection.end == span.newEnd
                    val ruled = typed && onTyped?.invoke(
                        new.text,
                        newMarks,
                        span.newEnd,
                        new.text.substring(span.start, span.newEnd),
                    ) == true
                    if (!ruled) {
                        val updated = block.copy(text = new.text, marks = newMarks)
                        fieldValue = TextFieldValue(annotatedTextFor(updated, style, dark, surface), new.selection)
                        onTextEdited(new.text, newMarks, new.selection)
                    }
                }
            }
        },
        textStyle = style,
        cursorBrush = SolidColor(style.color),
        onTextLayout = { layout = it },
        decorationBox = { inner ->
            Box {
                if (placeholder != null && fieldValue.text.isEmpty()) {
                    Text(placeholder, style = style.copy(color = if (dark) Color(0xFF6B7280) else Color(0xFF9CA3AF)))
                }
                inner()
                val textLayout = layout
                val code = armedCode
                if (code != null && textLayout != null) InlineCodeCopy(code, block.text, textLayout, noteColor, dark)
                val link = tappedLink
                if (link != null && textLayout != null) {
                    val start = link.start.coerceIn(0, block.text.length)
                    val end = link.end.coerceIn(start, block.text.length)
                    LinkTapPopover(
                        bounds = textLayout.getPathForRange(start, end).getBounds(),
                        dark = dark,
                        onOpen = {
                            tappedLink = null
                            uriHandler.openUri(RichDoc.ensureSchemeUrl(link.value.orEmpty()))
                        },
                        onEdit = {
                            tappedLink = null
                            fieldValue = fieldValue.copy(selection = TextRange(start))
                            focusRequester.requestFocus()
                        },
                        onDismiss = { tappedLink = null },
                    )
                }
            }
        },
        modifier = modifier
            .then(
                if (editExtras) {
                    Modifier.pointerInput(block.marks) {
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                            val up = waitForUpOrCancellation(PointerEventPass.Initial) ?: return@awaitEachGesture
                            // TAP_MOVE_PX: anything longer is a scroll.
                            if ((up.position - down.position).getDistance() > 24.dp.toPx()) return@awaitEachGesture
                            val at = layout?.charAt(down.position, block.text.length)
                            val link = at?.let { i ->
                                block.marks.firstOrNull { it.type == RichMarkType.LINK && !it.value.isNullOrBlank() && it.start <= i && it.end > i }
                            }
                            val code = at?.let { i ->
                                block.marks.firstOrNull { it.type == RichMarkType.CODE && it.start <= i && it.end > i }
                            }
                            when {
                                link != null -> {
                                    up.consume()
                                    armedCode = null
                                    focusManager.clearFocus()
                                    tappedLink = link
                                }
                                code != null && code != armedCode -> {
                                    up.consume()
                                    focusManager.clearFocus()
                                    armedCode = code
                                }
                                else -> armedCode = null
                            }
                        }
                    }
                } else {
                    Modifier
                },
            )
            .focusRequester(focusRequester)
            .onFocusChanged { focus -> if (focus.isFocused) onFocusGained(fieldValue.selection) }
            .drawBehind { layout?.let { drawRichDecorations(it, block, style, dark, surface) } }
            // Backspace at the start of the block, when the keyboard sends a
            // real key event for it.
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown && event.key == Key.Backspace &&
                    fieldValue.selection.collapsed && fieldValue.selection.start == 0
                ) {
                    onMerge()
                    true
                } else {
                    false
                }
            },
    )
}

/** The character under [position], or null past the end of its line. */
private fun TextLayoutResult.charAt(position: Offset, textLength: Int): Int? {
    val offset = getOffsetForPosition(position)
    return listOf(offset - 1, offset).firstOrNull { it in 0 until textLength && getBoundingBox(it).contains(position) }
}

/** Room around the tap popover for its shadow (see RichPopover). */
private val LinkTapShadowRoom = 28.dp

/**
 * EditExtras' `.rt-link-popover`: tapping a link in the editor, with the
 * read-mode preference off, shows "Open" and "Edit" 8px above the link and
 * centred on it, under it when there is no room above, 8px inside the
 * screen; a touch anywhere else closes it. [bounds] is the link, in the
 * text's own coordinates.
 */
@Composable
private fun LinkTapPopover(bounds: Rect, dark: Boolean, onOpen: () -> Unit, onEdit: () -> Unit, onDismiss: () -> Unit) {
    val density = LocalDensity.current
    val positionProvider = remember(bounds, density) {
        object : PopupPositionProvider {
            override fun calculatePosition(
                anchorBounds: IntRect,
                windowSize: IntSize,
                layoutDirection: LayoutDirection,
                popupContentSize: IntSize,
            ): IntOffset {
                val room = with(density) { LinkTapShadowRoom.roundToPx() }
                val margin = with(density) { 8.dp.roundToPx() }
                val width = popupContentSize.width - 2 * room
                val height = popupContentSize.height - 2 * room
                val above = anchorBounds.top + bounds.top.roundToInt() - height - margin
                val top = if (above < margin) anchorBounds.top + bounds.bottom.roundToInt() + margin else above
                val left = (anchorBounds.left + bounds.center.x.roundToInt() - width / 2)
                    .coerceAtMost(windowSize.width - width - margin)
                    .coerceAtLeast(margin)
                return IntOffset(left - room, top - room)
            }
        }
    }
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = false, dismissOnClickOutside = true),
    ) {
        val shape = RoundedCornerShape(10.dp)
        val buttonShape = RoundedCornerShape(7.dp)
        val textColor = if (dark) DarkTitleColor else LightTitleColor
        Box(
            Modifier
                .pointerInput(Unit) {
                    val room = LinkTapShadowRoom.toPx()
                    detectTapGestures { tap ->
                        val onCard = tap.x >= room && tap.y >= room && tap.x <= size.width - room && tap.y <= size.height - room
                        if (!onCard) onDismiss()
                    }
                }
                .padding(LinkTapShadowRoom),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .dropShadow(
                        shape,
                        Shadow(radius = 28.dp, color = Color.Black.copy(alpha = if (dark) 0.55f else 0.22f), offset = DpOffset(0.dp, 8.dp)),
                    )
                    .then(
                        if (dark) {
                            Modifier
                        } else {
                            Modifier.dropShadow(shape, Shadow(radius = 6.dp, color = Color.Black.copy(alpha = 0.12f), offset = DpOffset(0.dp, 2.dp)))
                        },
                    )
                    .clip(shape)
                    .background(if (dark) Color(red = 30, green = 30, blue = 35).copy(alpha = 0.98f) else Color.White.copy(alpha = 0.98f))
                    .border(1.dp, if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f), shape)
                    .padding(7.dp),
            ) {
                Box(
                    modifier = Modifier
                        .clip(buttonShape)
                        .background(cssAngleGradient(135f, listOf(Color(0xFF6366F1), Color(0xFF7C3AED))))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onOpen() }
                        .padding(horizontal = 12.8.dp, vertical = 6.4.dp),
                ) {
                    Text(stringResource(R.string.native_richtext_link_open), color = Color.White, fontSize = 13.12.sp, fontWeight = FontWeight.SemiBold)
                }
                Box(
                    modifier = Modifier
                        .clip(buttonShape)
                        .border(1.dp, if (dark) Color.White.copy(alpha = 0.18f) else Color.Black.copy(alpha = 0.12f), buttonShape)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onEdit() }
                        .padding(horizontal = 12.8.dp, vertical = 6.4.dp),
                ) {
                    Text(stringResource(R.string.native_richtext_link_edit), color = textColor, fontSize = 13.12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

// ---------- Styles ----------

/**
 * The block's own text style, straight from the user's typography profile
 * (typographyPresets.js's DEFAULT_PROFILE until they change it): size,
 * weight, colour, italic and underline all come from there.
 *
 * Line heights are the CSS ones: 1.5 for a paragraph in the view (the
 * page's own) but 1.55 in the editor (`.rt-editor-content`), 20px in a
 * card (`text-sm`); 1.5 for headings, 1.45 for list items, 1.6 for
 * quotes. A `pre` is 0.9em at 1.5 in the view, the editor shrinks its
 * code once more (0.9em inside 0.9em) at 1.55, and a card's is 12.6/18.
 * A size mark bigger than the text grows every line of its block, the
 * closest Compose gets to CSS growing the lines that hold it.
 */
private fun richBlockTextStyle(
    block: RichBlock,
    typography: TypographyProfile,
    taskStrike: Boolean,
    dark: Boolean,
    titleColor: Color,
    surface: RichSurface,
): TextStyle {
    val preset = typography.forKind(block.kind)
    val code = block.kind == RichBlockKind.CODE_BLOCK
    val base = if (surface == RichSurface.CARD && !block.kind.isHeading) 14f else preset.size * RemPx
    val fontSize = when {
        !code -> base
        surface == RichSurface.EDITOR -> base * 0.81f
        else -> base * 0.9f
    }
    val lineHeightFactor = when {
        block.kind.isHeading -> 1.5f
        block.kind == RichBlockKind.QUOTE -> 1.6f
        block.kind.isListItem -> 1.45f
        surface == RichSurface.CARD -> 20f / 14f
        code && surface == RichSurface.EDITOR -> 1.55f
        code -> 1.5f
        surface == RichSurface.EDITOR -> 1.55f
        else -> 1.5f
    }
    val tallest = block.marks.filter { it.type == RichMarkType.FONT_SIZE }.mapNotNull { richFontSizeOf(it.value) }.maxOrNull()
    val lineBox = maxOf(fontSize, tallest ?: 0f)
    val decorations = buildList {
        if (preset.underline) add(TextDecoration.Underline)
        // gk-strike-checked: the item's text struck, faded by its caller.
        if (taskStrike && block.isChecked) add(TextDecoration.LineThrough)
    }
    return TextStyle(
        color = richColorOf(preset.color, dark) ?: titleColor,
        fontSize = fontSize.sp,
        fontWeight = FontWeight(preset.weight),
        fontStyle = if (preset.italic) FontStyle.Italic else FontStyle.Normal,
        textDecoration = if (decorations.isEmpty()) TextDecoration.None else TextDecoration.combine(decorations),
        fontFamily = if (code) FontFamily.Monospace else null,
        lineHeight = (if (code && surface == RichSurface.CARD) 18f else lineBox * lineHeightFactor).sp,
        textAlign = when (block.align) {
            RichAlign.LEFT -> TextAlign.Start
            RichAlign.CENTER -> TextAlign.Center
            RichAlign.RIGHT -> TextAlign.End
            RichAlign.JUSTIFY -> TextAlign.Justify
        },
    )
}

/**
 * Builds the styled text of a block. Bold, italic, colour, font and size
 * map onto a SpanStyle; underline, strike and link are combined by hand
 * into one TextDecoration per run. Inline code, highlights and styled or
 * coloured underlines are painted by [drawRichDecorations] instead, since
 * a span can give them neither padding, radius nor a line style. In the
 * view, links (and the phone numbers and e-mail addresses it linkifies)
 * are real links.
 *
 * `<strong>` is `font-weight: bolder`, relative to the block's own weight:
 * bold inside an 800-weight H1 comes out at 900.
 */
private fun annotatedTextFor(
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    surface: RichSurface,
    openLink: LinkInteractionListener? = null,
): AnnotatedString = buildAnnotatedString {
    val text = block.text
    append(text)
    val links = if (surface == RichSurface.READER) RichDoc.contactLinks(text, block.marks) else emptyList()
    val marks = block.marks + links
    if (text.isEmpty() || marks.isEmpty()) return@buildAnnotatedString
    val linkColor = if (dark) Color(0xFF93C5FD) else Color(0xFF2563EB)
    val cuts = sortedSetOf(0, text.length)
    for (m in marks) {
        cuts.add(m.start.coerceIn(0, text.length))
        cuts.add(m.end.coerceIn(0, text.length))
    }
    val points = cuts.toList()
    for (i in 0 until points.size - 1) {
        val start = points[i]
        val end = points[i + 1]
        if (start >= end) continue
        val active = marks.filter { it.start <= start && it.end >= end }
        if (active.isEmpty()) continue

        var bold = false
        var italic = false
        var link: String? = null
        var color: Color? = null
        var fontFamily: FontFamily? = null
        var fontSize = style.fontSize.value
        var sizeSet = false
        var baseline: BaselineShift? = null
        var mono = false
        var plainMark = false
        val decorations = mutableListOf<TextDecoration>()

        for (m in active) when (m.type) {
            RichMarkType.BOLD -> bold = true
            RichMarkType.ITALIC -> italic = true
            RichMarkType.UNDERLINE -> if (plainUnderline(m)) decorations.add(TextDecoration.Underline)
            RichMarkType.STRIKE -> decorations.add(TextDecoration.LineThrough)
            RichMarkType.LINK -> {
                decorations.add(TextDecoration.Underline)
                link = m.value
            }
            RichMarkType.CODE -> mono = true
            // sub/sup: 75%, shifted 0.25em down / 0.5em up (preflight),
            // Compose's shift being a share of the font's ascent.
            RichMarkType.SUBSCRIPT -> baseline = BaselineShift(-0.27f)
            RichMarkType.SUPERSCRIPT -> baseline = BaselineShift(0.54f)
            RichMarkType.TEXT_COLOR -> color = richColorOf(m.value, dark)
            RichMarkType.HIGHLIGHT -> if (m.value == null) plainMark = true
            RichMarkType.FONT_FAMILY -> fontFamily = richFontFor(m.value)?.family
            RichMarkType.FONT_SIZE -> richFontSizeOf(m.value)?.let {
                fontSize = it
                sizeSet = true
            }
        }
        if (mono) fontSize *= 0.9f
        if (baseline != null) fontSize *= 0.75f

        addStyle(
            SpanStyle(
                color = when {
                    plainMark -> Color.Black
                    link != null -> linkColor
                    else -> color ?: Color.Unspecified
                },
                fontWeight = if (bold) bolderThan(style.fontWeight) else null,
                fontStyle = if (italic) FontStyle.Italic else null,
                fontFamily = fontFamily ?: if (mono) FontFamily.Monospace else null,
                fontSize = if (sizeSet || mono || baseline != null) fontSize.sp else TextUnit.Unspecified,
                baselineShift = baseline,
                textDecoration = if (decorations.isEmpty()) null else TextDecoration.combine(decorations.distinct()),
            ),
            start,
            end,
        )
    }
    if (surface == RichSurface.READER) {
        for (m in marks) {
            val href = m.value
            if (m.type != RichMarkType.LINK || href.isNullOrBlank()) continue
            val start = m.start.coerceIn(0, text.length)
            val end = m.end.coerceIn(start, text.length)
            if (start < end) addLink(LinkAnnotation.Url(href, TextLinkStyles(SpanStyle(color = linkColor)), openLink), start, end)
        }
    }
}

/** Chrome's own `mark` style, which a highlight with no colour of its own
 *  (typed as `==text==`) gets: yellow, under black text. */
private val PlainMarkBackground = Color(0xFFFFFF00)

/** An underline Compose can draw itself: no line style, no colour. */
private fun plainUnderline(mark: RichMark): Boolean =
    (mark.value == null || mark.value == "simple" || mark.value == "solid") && mark.color == null

/** CSS `font-weight: bolder`: 100-300 becomes 400, 400-500 becomes 700,
 *  anything heavier becomes 900. */
private fun bolderThan(weight: FontWeight?): FontWeight = when (weight?.weight ?: 400) {
    in 0..300 -> FontWeight.Normal
    in 301..500 -> FontWeight.Bold
    else -> FontWeight.Black
}

/**
 * What a span cannot carry, painted from the text layout: inline code
 * chips (padding, 1px `--border-light` border, radius: 1.92/5.6 and 5.6 in
 * the view, 1.15/4.6 and 3 in the editor), highlights (the editor's
 * `mark` adds 2px each side and a 2px radius), and underlines with a line
 * style or a colour: double, dotted, dashed or wavy, in the mark's colour.
 * Boxes follow CSS inline boxes: the font's ascent and descent around the
 * baseline, not the whole line.
 */
private fun DrawScope.drawRichDecorations(layout: TextLayoutResult, block: RichBlock, style: TextStyle, dark: Boolean, surface: RichSurface) {
    val text = block.text
    if (text.isEmpty()) return
    val editor = surface == RichSurface.EDITOR
    for (mark in block.marks) {
        val start = mark.start.coerceIn(0, text.length)
        val end = mark.end.coerceIn(start, text.length)
        if (start >= end) continue
        when (mark.type) {
            RichMarkType.CODE -> {
                val em = style.fontSize.toPx() * 0.9f
                val padX = (if (editor) 4.608f else 5.6f).dp.toPx() + 1.dp.toPx()
                val padY = (if (editor) 1.152f else 1.92f).dp.toPx() + 1.dp.toPx()
                val radius = (if (editor) 3f else 5.6f).dp.toPx()
                val fill = if (editor && dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f)
                val border = if (dark) DarkBorderColor else LightBorderColor
                forEachLineSegment(layout, start, end) { left, right, baseline ->
                    val box = Rect(left - padX, baseline - 0.93f * em - padY, right + padX, baseline + 0.24f * em + padY)
                    drawRoundRect(fill, box.topLeft, box.size, CornerRadius(radius))
                    val line = 1.dp.toPx()
                    drawRoundRect(
                        border,
                        Offset(box.left + line / 2f, box.top + line / 2f),
                        Size(box.width - line, box.height - line),
                        CornerRadius(radius - line / 2f),
                        style = Stroke(line),
                    )
                }
            }
            RichMarkType.HIGHLIGHT -> {
                val color = if (mark.value == null) PlainMarkBackground else richColorOf(mark.value, dark) ?: continue
                val em = markFontSize(block, style, start).toPx()
                val padX = if (editor) 2.dp.toPx() else 0f
                val radius = if (editor) 2.dp.toPx() else 0f
                forEachLineSegment(layout, start, end) { left, right, baseline ->
                    drawRoundRect(
                        color,
                        Offset(left - padX, baseline - 0.93f * em),
                        Size(right - left + 2 * padX, 1.17f * em),
                        CornerRadius(radius),
                    )
                }
            }
            RichMarkType.UNDERLINE -> {
                if (plainUnderline(mark)) continue
                val color = richColorOf(mark.color, dark) ?: markTextColor(block, style, start, dark)
                val em = markFontSize(block, style, start).toPx()
                val thickness = 1.dp.toPx()
                forEachLineSegment(layout, start, end) { left, right, baseline ->
                    val y = baseline + maxOf(thickness, 0.075f * em) + thickness / 2f
                    when (mark.value) {
                        "double" -> {
                            drawLine(color, Offset(left, y), Offset(right, y), thickness)
                            drawLine(color, Offset(left, y + 2 * thickness), Offset(right, y + 2 * thickness), thickness)
                        }
                        "dotted" -> drawLine(
                            color, Offset(left, y), Offset(right, y), thickness,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(thickness, thickness)),
                        )
                        "dashed" -> drawLine(
                            color, Offset(left, y), Offset(right, y), thickness,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(3 * thickness, 3 * thickness)),
                        )
                        "wavy" -> {
                            val amplitude = 1.5f * thickness
                            val period = 6 * thickness
                            val wave = Path().apply {
                                moveTo(left, y + amplitude)
                                var x = left
                                while (x < right) {
                                    x = minOf(right, x + thickness)
                                    lineTo(x, y + amplitude + amplitude * sin(2 * PI.toFloat() * (x - left) / period))
                                }
                            }
                            drawPath(wave, color, style = Stroke(thickness))
                        }
                        else -> drawLine(color, Offset(left, y), Offset(right, y), thickness)
                    }
                }
            }
            else -> Unit
        }
    }
}

/** Calls [draw] with the left edge, right edge and baseline of every line
 *  the text range `[start, end)` covers. */
internal inline fun forEachLineSegment(layout: TextLayoutResult, start: Int, end: Int, draw: (Float, Float, Float) -> Unit) {
    val firstLine = layout.getLineForOffset(start)
    val lastLine = layout.getLineForOffset(end - 1)
    for (line in firstLine..lastLine) {
        val from = maxOf(start, layout.getLineStart(line))
        val to = minOf(end, layout.getLineEnd(line, visibleEnd = true))
        if (from >= to) continue
        val left = layout.getHorizontalPosition(from, usePrimaryDirection = true)
        val right = layout.getHorizontalPosition(to, usePrimaryDirection = true)
        draw(minOf(left, right), maxOf(left, right), layout.getLineBaseline(line))
    }
}

/** The font size at [offset], a size mark included. */
private fun markFontSize(block: RichBlock, style: TextStyle, offset: Int): TextUnit =
    block.marks.firstOrNull { it.type == RichMarkType.FONT_SIZE && it.start <= offset && it.end > offset }
        ?.let { richFontSizeOf(it.value)?.sp } ?: style.fontSize

/** The text colour at [offset]: a colour mark, else the block's. */
private fun markTextColor(block: RichBlock, style: TextStyle, offset: Int, dark: Boolean): Color =
    block.marks.firstOrNull { it.type == RichMarkType.TEXT_COLOR && it.start <= offset && it.end > offset }
        ?.let { richColorOf(it.value, dark) } ?: style.color

/** --rt-divider (globalCSS.js:2854, 2880); the active pair follows the
 *  theme (WorkspaceTheme.rtActiveBg / rtActiveText). */
internal val RtDividerLight = Color(0x14000000)
internal val RtDividerDark = Color(0x1AFFFFFF)

/**
 * Markdown rendered read-only, for text the app receives rather than
 * edits: the AI's answers, which the web puts through renderSafeMarkdown
 * (utils/markdown.jsx). Reads with [MarkdownDoc] and paints with the
 * same reader the notes themselves use, so an answer's headings, lists
 * and emphasis look like a note's.
 */
@Composable
fun MarkdownText(markdown: String, color: Color, dark: Boolean, typography: TypographyProfile) {
    val blocks = remember(markdown) { MarkdownDoc.toRichBlocks(markdown, keepBlankLines = true) }
    RichTextReader(
        blocks = blocks,
        typography = typography,
        taskStrike = false,
        dark = dark,
        titleColor = color,
    )
}
