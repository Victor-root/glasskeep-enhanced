package com.glasskeep.app.nativeapp.ui

import android.content.ClipData
import android.content.Context
import android.graphics.Paint
import android.view.KeyEvent
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.magnifier
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.focusTarget
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.pointer.PointerEventTimeoutCancellationException
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.platform.Clipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalTextToolbar
import androidx.compose.ui.platform.TextToolbar
import androidx.compose.ui.platform.TextToolbarStatus
import androidx.compose.ui.platform.nativeClipboardManager
import com.glasskeep.app.nativeapp.data.RichEditing
import com.glasskeep.app.nativeapp.data.RichPos
import com.glasskeep.app.nativeapp.data.RichSelection
import com.glasskeep.app.nativeapp.data.resolve
import com.glasskeep.app.nativeapp.data.textLength
import kotlinx.coroutines.CoroutineScope
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.text.selection.DisableSelection
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollDispatcher
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.InterceptPlatformTextInput
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFontFamilyResolver
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.resolveAsTypeface
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.ResolvedTextDirection
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
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.glasskeep.app.R
import com.glasskeep.app.ui.theme.CssLineHeightStyle
import com.glasskeep.app.ui.theme.WebSystemItalic
import com.glasskeep.app.ui.theme.webItalic
import com.glasskeep.app.nativeapp.data.MarkdownDoc
import com.glasskeep.app.nativeapp.data.RichAlign
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.TypographyProfile
import com.glasskeep.app.nativeapp.data.continuesList
import com.glasskeep.app.nativeapp.data.hasText
import com.glasskeep.app.nativeapp.data.isHeading
import com.glasskeep.app.nativeapp.data.isListItem
import com.glasskeep.app.nativeapp.data.listDepth
import com.glasskeep.app.nativeapp.data.sharesQuoteWith
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlinx.coroutines.Job
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

/** Where the blocks are shown: the editor, the note's read view, or a
 *  note card's preview, whose text is `text-sm`. */
private enum class RichSurface { EDITOR, READER, CARD }

/**
 * The native rich-text editor: the whole document one editing surface, as
 * the web's contenteditable is, its blocks laid out with the web's own block
 * CSS (see [richFlow]). The selection runs across blocks: a tap places the
 * caret (showing its handle, a tap on the caret offers Paste), a double tap
 * or a long press selects a word and the drag after the long press goes on
 * word by word, the handles move either end with a magnifier, and Cut, Copy,
 * Paste and Select all show above the selection. One keyboard session edits
 * the whole document ([richTextInput]); with the formatting sheet open
 * ([suppressKeyboard]) the text still takes the caret and selections but the
 * keyboard stays down, the web's inputmode="none". Its formatting bar is a
 * separate composable ([RichFormatToolbar]) sharing [state].
 *
 * With the read-mode preference off, the web's edit extras: a tapped link
 * offers Open and Edit, a tapped inline code or code block shows its copy
 * button first, and neither brings the keyboard up.
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
    plainPaste: Boolean,
    minHeight: Dp,
    onBlocksChange: (List<RichBlock>) -> Unit,
    suppressKeyboard: Boolean = false,
) {
    val itemEm = typography.p.size * RemPx
    val flow = remember(blocks, itemEm) { richFlow(blocks, itemEm) }
    SideEffect {
        state.onBlocksChange = onBlocksChange
        state.keyboardSuppressed = suppressKeyboard
        state.plainPaste = plainPaste
        state.sync(blocks)
    }
    // Tiptap's Placeholder: only a document holding a single empty
    // paragraph shows it.
    val placeholderId = blocks.singleOrNull()?.takeIf { it.kind == RichBlockKind.PARAGRAPH && it.quotes.isEmpty() && it.text.isEmpty() }?.id
    val placeholder = stringResource(R.string.native_richtext_placeholder)
    val selectionColors = LocalTextSelectionColors.current
    val paint = remember(state) { derivedStateOf { RichSelectionPaint.of(state.editing) } }
    val caretAlpha = remember { mutableFloatStateOf(1f) }
    val magnifier = remember { mutableStateOf(Offset.Unspecified) }
    val bringIntoView = remember { BringIntoViewRequester() }
    val actions = rememberRichTextActions(state, bringIntoView)
    val focusManager = LocalFocusManager.current
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    val imeBottom = WindowInsets.ime.getBottom(density)
    val autoScrollDispatcher = remember { NestedScrollDispatcher() }
    val autoScrollConnection = remember { object : NestedScrollConnection {} }
    val autoScrollScope = rememberCoroutineScope()
    val autoScroll = remember(state, autoScrollScope, density) {
        with(density) { RichSelectionAutoScroll(state, autoScrollScope, autoScrollDispatcher, 40.dp.toPx(), 600.dp.toPx()) }
    }

    // CursorAnimationState: 500ms on, 500ms off, solid again on every change.
    val editing = state.editing
    LaunchedEffect(editing?.selection, editing?.blocks, state.focused) {
        caretAlpha.floatValue = 1f
        if (!state.focused) return@LaunchedEffect
        while (true) {
            delay(500)
            caretAlpha.floatValue = 0f
            delay(500)
            caretAlpha.floatValue = 1f
        }
    }
    // The caret kept in sight as the text changes and as the keyboard comes
    // up, once the text is laid out; a selection being dragged is left where
    // the finger is.
    LaunchedEffect(editing?.blocks, state.focused, imeBottom) {
        if (!state.focused) return@LaunchedEffect
        withFrameNanos {}
        state.caretRect()?.let { bringIntoView.bringIntoView(it) }
    }
    // Typing puts the caret's handle and the menu away, as losing the focus does.
    LaunchedEffect(editing?.blocks) {
        state.cursorHandle = false
        actions.hideMenu()
    }
    LaunchedEffect(state.focused) {
        if (state.focused) return@LaunchedEffect
        state.cursorHandle = false
        actions.hideMenu()
    }
    LaunchedEffect(suppressKeyboard) {
        if (suppressKeyboard) state.keyboard?.hide()
    }

    InterceptPlatformTextInput(
        interceptor = { request, nextHandler ->
            if (suppressKeyboard) awaitCancellation() else nextHandler.startInputMethod(request)
        },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = minHeight)
                .onPlaced { state.layouts.root = it }
                .onGloballyPositioned { actions.onMoved() }
                .bringIntoViewRequester(bringIntoView)
                .nestedScroll(autoScrollConnection, autoScrollDispatcher)
                .richEditorGestures(state, actions, magnifier, autoScroll, haptics, editExtras = !readModeEnabled) { focusManager.clearFocus() }
                .richTextInput(state, actions::handleKey, actions::onMenuAction)
                .focusRequester(state.focusRequester)
                .focusTarget()
                .onKeyEvent { actions.handleKey(it.nativeKeyEvent) }
                .magnifier(sourceCenter = { magnifier.value }),
        ) {
            Column(
                // `.rt-editor-content { padding: .15rem .1rem }`.
                Modifier.fillMaxWidth().padding(horizontal = 1.6.dp, vertical = 2.4.dp),
            ) {
                @Composable
                fun EditorText(block: RichBlock, look: RichRowLook, modifier: Modifier) {
                    RichEditorText(
                        block = block,
                        style = look.style,
                        lines = look.lines,
                        dark = dark,
                        state = state,
                        paint = paint,
                        caretAlpha = caretAlpha,
                        selectionColor = selectionColors.backgroundColor,
                        placeholder = if (block.id == placeholderId) placeholder else null,
                        noteColor = noteColor,
                        modifier = modifier,
                    )
                }

                @Composable
                fun Rows(flow: RichFlow) {
                    for (row in flow.rows) {
                        if (row.gapBefore > 0f) Spacer(Modifier.height(row.gapBefore.dp))
                        when (row) {
                            is RichQuoteRow -> RichQuoteCard(
                                indent = row.indent.dp,
                                accent = accent,
                                noteColor = noteColor,
                                dark = dark,
                            ) { Rows(row.inner) }
                            is RichBlockRow -> {
                                val block = blocks[row.index]
                                val look = richRowLook(row, block, typography, taskStrike, dark, titleColor, RichSurface.EDITOR)
                                when (block.kind) {
                                    RichBlockKind.DIVIDER -> RichDivider(
                                        if (dark) Color.White.copy(alpha = 0.2f) else Color.Black.copy(alpha = 0.2f),
                                        start = row.start.dp,
                                        modifier = look.faded,
                                    )
                                    RichBlockKind.CODE_BLOCK -> RichEditorCodeBlock(
                                        indent = look.indent,
                                        dark = dark,
                                        copyText = block.text,
                                        noteColor = noteColor,
                                        armed = if (readModeEnabled) null else state.armedCodeBlock == block.id,
                                        onArm = { armed -> state.armedCodeBlock = if (armed) block.id else null },
                                        modifier = look.faded,
                                    ) {
                                        EditorText(block, look, Modifier.fillMaxWidth())
                                    }
                                    else -> RichListRow(
                                        block = block,
                                        style = look.style,
                                        list = row.list,
                                        indent = look.indent,
                                        accent = accent,
                                        onToggleChecked = { state.toggleChecked(block.id) },
                                        modifier = look.faded,
                                    ) { textModifier ->
                                        EditorText(block, look, textModifier.fillMaxWidth().then(if (taskStrike && block.isChecked) Modifier.alpha(0.6f) else Modifier))
                                    }
                                }
                            }
                        }
                    }
                    if (flow.gapAfter > 0f) Spacer(Modifier.height(flow.gapAfter.dp))
                }

                Rows(flow)
            }
            RichSelectionHandles(state, actions, magnifier, autoScroll, selectionColors.handleColor)
        }
    }
}

/** What each block paints of the selection: the selected part of its
 *  text, whether its line break is selected too, the caret, the
 *  composition. */
private class RichSelectionPaint(
    val selected: Map<String, Pair<Int, Int>>,
    val lineBreaks: Set<String>,
    val caret: RichPos?,
    val composing: Pair<String, Pair<Int, Int>>?,
) {
    companion object {
        private val None = RichSelectionPaint(emptyMap(), emptySet(), null, null)

        fun of(editing: RichEditing?): RichSelectionPaint {
            val blocks = editing?.blocks ?: return None
            val span = editing.span ?: return None
            val composing = editing.composition?.resolve(blocks)?.takeIf { it.start == it.end }?.let {
                blocks[it.start].id to (it.startOffset to it.endOffset)
            }
            if (span.collapsed) return RichSelectionPaint(emptyMap(), emptySet(), editing.selection.head, composing)
            val selected = HashMap<String, Pair<Int, Int>>()
            val lineBreaks = HashSet<String>()
            for (i in span.start..span.end) {
                val block = blocks[i]
                if (!block.kind.hasText) continue
                val from = span.fromIn(i)
                val to = span.toIn(i, block.text.length)
                if (from < to) selected[block.id] = from to to
                if (i < span.end) lineBreaks += block.id
            }
            return RichSelectionPaint(selected, lineBreaks, null, composing)
        }
    }
}

/**
 * One block's text in the editor: its styled text with the selection
 * behind it (the selected line break as a space's width at the end of the
 * line, as Chrome paints it), the keyboard's composition underlined, and
 * the caret, 2dp in the text's colour, blinking; [lines] are its whole
 * text's (see [richLinesOf]). Registers its layout for hit tests, the
 * handles and the keyboard.
 */
@Composable
private fun RichEditorText(
    block: RichBlock,
    style: TextStyle,
    lines: TextDecoration,
    dark: Boolean,
    state: RichEditorState,
    paint: State<RichSelectionPaint>,
    caretAlpha: State<Float>,
    selectionColor: Color,
    placeholder: String?,
    noteColor: String?,
    modifier: Modifier,
) {
    val padded = remember(block, style, dark) { paddedTextFor(block, style, dark, RichSurface.EDITOR) }
    val fonts = LocalFontFamilyResolver.current
    val drawnLines = remember(block, style, lines, dark, fonts) { richLinesOf(block, style, lines, dark, RichSurface.EDITOR, fonts) }
    var layout by remember { mutableStateOf<PaddedLayout?>(null) }
    val uriHandler = LocalUriHandler.current
    DisposableEffect(block.id) { onDispose { state.layouts.remove(block.id) } }
    Box(modifier) {
        if (placeholder != null) {
            Text(placeholder, style = style.copy(color = if (dark) Color(0xFF6B7280) else Color(0xFF9CA3AF)).webItalic())
        }
        BasicText(
            text = padded.text,
            style = style,
            onTextLayout = {
                val laid = PaddedLayout(it, padded)
                layout = laid
                state.layouts.setLayout(block.id, laid)
            },
            inlineContent = richPads(editor = true),
            modifier = Modifier
                .fillMaxWidth()
                .onPlaced { state.layouts.setCoordinates(block.id, it) }
                .drawBehind {
                    val text = layout ?: return@drawBehind
                    val now = paint.value
                    now.selected[block.id]?.let { (from, to) -> drawPath(text.getPathForRange(from, to), selectionColor) }
                    if (block.id in now.lineBreaks) {
                        val line = text.lineCount - 1
                        drawRect(
                            selectionColor,
                            Offset(text.getLineRight(line), text.getLineTop(line)),
                            Size(style.fontSize.toPx() * 0.28f, text.getLineBottom(line) - text.getLineTop(line)),
                        )
                    }
                    now.composing?.takeIf { it.first == block.id }?.let { (_, range) ->
                        val (from, to) = range
                        if (from < to) {
                            val thickness = 1.dp.toPx()
                            val laid = text.padded.range(from, to)
                            forEachLineSegment(text.laidOut, laid.start, laid.end) { left, right, baseline ->
                                val y = baseline + maxOf(thickness, 0.075f * style.fontSize.toPx()) + thickness / 2f
                                drawLine(style.color, Offset(left, y), Offset(right, y), thickness)
                            }
                        }
                    }
                    drawRichDecorations(text, block, style, dark, RichSurface.EDITOR, drawnLines)
                }
                .drawWithContent {
                    drawContent()
                    layout?.let { drawRichLines(it, drawnLines, through = true) }
                    val caret = paint.value.caret?.takeIf { it.blockId == block.id } ?: return@drawWithContent
                    if (!state.focused || caretAlpha.value == 0f) return@drawWithContent
                    val rect = (layout ?: return@drawWithContent).getCursorRect(caret.offset.coerceIn(0, block.text.length))
                    val width = 2.dp.toPx()
                    val x = (rect.left + width / 2f).coerceAtMost(size.width - width / 2f)
                    drawLine(style.color, Offset(x, rect.top), Offset(x, rect.bottom), width)
                },
        )
        val code = state.armedCode?.takeIf { it.first == block.id }?.second
        val link = state.tappedLink?.takeIf { it.first == block.id }?.second
        val textLayout = if (code != null || link != null) layout else null
        if (code != null && textLayout != null) InlineCodeCopy(code, block.text, textLayout, noteColor, dark)
        if (link != null && textLayout != null) {
            val start = link.start.coerceIn(0, block.text.length)
            val end = link.end.coerceIn(start, block.text.length)
            LinkTapPopover(
                bounds = textLayout.getPathForRange(start, end).getBounds(),
                dark = dark,
                onOpen = {
                    state.tappedLink = null
                    uriHandler.openUri(RichDoc.ensureSchemeUrl(link.value.orEmpty()))
                },
                onEdit = {
                    state.tappedLink = null
                    state.placeCaret(block.id, start)
                    state.requestFocus()
                },
                onDismiss = { state.tappedLink = null },
            )
        }
    }
}

// ---------- Hit tests and positions ----------

/**
 * The position under [point], in the editor's frame: in the block whose
 * text is nearest vertically, at the character boundary nearest [point];
 * below the last block, the end of the last one, as a tap on the editor's
 * blank area does on the web.
 */
private fun RichEditorState.positionAt(point: Offset): RichPos? {
    val blocks = editing?.blocks ?: return null
    var best: Triple<RichBlock, PaddedLayout, Offset>? = null
    var bestDistance = Float.MAX_VALUE
    var lowest = Float.NEGATIVE_INFINITY
    for (block in blocks) {
        if (!block.kind.hasText) continue
        val (layout, origin) = layouts.placed(block.id) ?: continue
        val top = origin.y
        val bottom = origin.y + layout.size.height
        lowest = maxOf(lowest, bottom)
        val distance = when {
            point.y < top -> top - point.y
            point.y > bottom -> point.y - bottom
            else -> 0f
        }
        if (distance < bestDistance) {
            bestDistance = distance
            best = Triple(block, layout, origin)
        }
    }
    val (block, layout, origin) = best ?: return null
    if (point.y > lowest) blocks.lastOrNull { it.kind.hasText }?.let { return RichPos(it.id, it.text.length) }
    return RichPos(block.id, layout.getOffsetForPosition(point - origin))
}

/** The character under [point] and its block, for the edit extras' taps
 *  on links and inline code; null between characters or past a line. */
private fun RichEditorState.characterAt(point: Offset): Pair<RichBlock, Int>? {
    val pos = positionAt(point) ?: return null
    val block = editing?.blocks?.firstOrNull { it.id == pos.blockId } ?: return null
    val (layout, origin) = layouts.placed(block.id) ?: return null
    return layout.charAt(point - origin, block.text.length)?.let { block to it }
}

/** The word at [pos] (getWordBoundary), or the caret there between words. */
private fun RichEditorState.wordAt(pos: RichPos): RichSelection {
    val layout = layouts.layout(pos.blockId) ?: return RichSelection(pos, pos)
    val word = layout.getWordBoundary(pos.offset.coerceIn(0, layout.padded.length))
    return if (word.collapsed) RichSelection(pos, pos) else RichSelection(pos.copy(offset = word.start), pos.copy(offset = word.end))
}

/** [pos]'s caret rectangle, in the editor's frame. */
private fun RichEditorState.caretRectAt(pos: RichPos): Rect? {
    val (layout, origin) = layouts.placed(pos.blockId) ?: return null
    return layout.getCursorRect(pos.offset.coerceIn(0, layout.padded.length)).translate(origin)
}

/** Where the caret (the selection's moving end) is, in the editor's frame. */
private fun RichEditorState.caretRect(): Rect? = editing?.selection?.head?.let { caretRectAt(it) }

/** A handle's anchor for [pos]: the bottom of its line, at the caret. */
private fun RichEditorState.handleAnchor(pos: RichPos): Offset? {
    val (layout, origin) = layouts.placed(pos.blockId) ?: return null
    val offset = pos.offset.coerceIn(0, layout.padded.length)
    val line = layout.getLineForOffset(offset)
    return Offset(layout.getHorizontalPosition(offset), layout.getLineBottom(line)) + origin
}

/** The magnifier's centre for a finger at [finger] over [pos]: on the
 *  middle of that line, the finger's x kept within the line. */
private fun RichEditorState.magnifierCenter(finger: Offset, pos: RichPos): Offset {
    val (layout, origin) = layouts.placed(pos.blockId) ?: return Offset.Unspecified
    val offset = pos.offset.coerceIn(0, layout.padded.length)
    val line = layout.getLineForOffset(offset)
    val x = (finger.x - origin.x).coerceIn(layout.getLineLeft(line), layout.getLineRight(line))
    return Offset(x, (layout.getLineTop(line) + layout.getLineBottom(line)) / 2f) + origin
}

/** The selection's bounding box, in the editor's frame. */
private fun RichEditorState.selectionRect(): Rect? {
    val current = editing ?: return null
    val span = current.span ?: return null
    val start = caretRectAt(RichPos(current.blocks[span.start].id, span.startOffset)) ?: return null
    val end = caretRectAt(RichPos(current.blocks[span.end].id, span.endOffset)) ?: return null
    return Rect(minOf(start.left, end.left), start.top, maxOf(start.right, end.right), end.bottom)
}

// ---------- Gestures ----------

/**
 * Taps, double taps and long presses on the text, as a text field takes
 * them; a drag is left to the note's scroll, unless it follows a long
 * press, which then selects on word by word under the magnifier. Taps a
 * child took (a checkbox, a copy button) are its own.
 */
private fun Modifier.richEditorGestures(
    state: RichEditorState,
    actions: RichTextActions,
    magnifier: MutableState<Offset>,
    autoScroll: RichSelectionAutoScroll,
    haptics: HapticFeedback,
    editExtras: Boolean,
    clearFocus: () -> Unit,
): Modifier = pointerInput(state, editExtras) {
    var lastTapUp = 0L
    var lastTapAt = Offset.Unspecified
    awaitEachGesture {
        val down = awaitFirstDown()
        var up: PointerInputChange? = null
        val longPress = try {
            withTimeout(viewConfiguration.longPressTimeoutMillis) {
                while (true) {
                    val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                    if (change.changedToUpIgnoreConsumed()) {
                        if (!change.isConsumed) up = change
                        break
                    }
                    if (change.isConsumed || (change.position - down.position).getDistance() > viewConfiguration.touchSlop) break
                }
            }
            false
        } catch (_: PointerEventTimeoutCancellationException) {
            true
        }
        if (longPress) {
            val at = state.positionAt(down.position) ?: return@awaitEachGesture
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            state.armedCode = null
            state.tappedLink = null
            val word = state.wordAt(at)
            state.select(word)
            state.cursorHandle = word.collapsed
            if (!state.focused) state.requestFocus()
            actions.hideMenu()
            magnifier.value = state.magnifierCenter(down.position, at)
            val track: (Offset) -> Unit = { finger ->
                state.positionAt(finger)?.let { here ->
                    state.select(unionOf(state, word, state.wordAt(here)))
                    magnifier.value = state.magnifierCenter(finger, here)
                }
            }
            try {
                while (true) {
                    val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                    if (change.changedToUpIgnoreConsumed()) break
                    change.consume()
                    track(change.position)
                    state.layouts.root?.let { autoScroll.follow(it.localToScreen(change.position), track) }
                }
            } finally {
                autoScroll.stop()
            }
            magnifier.value = Offset.Unspecified
            actions.showMenu()
            return@awaitEachGesture
        }
        val tap = up ?: return@awaitEachGesture
        val double = down.uptimeMillis - lastTapUp < viewConfiguration.doubleTapTimeoutMillis &&
            (down.position - lastTapAt).getDistance() < 100.dp.toPx()
        lastTapUp = tap.uptimeMillis
        lastTapAt = tap.position
        val at = state.positionAt(tap.position) ?: return@awaitEachGesture
        if (double) {
            lastTapUp = 0L
            val word = state.wordAt(at)
            state.select(word)
            state.cursorHandle = word.collapsed
            actions.showMenu()
            return@awaitEachGesture
        }
        if (editExtras) {
            val hit = state.characterAt(tap.position)
            val marks = hit?.first?.marks.orEmpty()
            val index = hit?.second
            val link = index?.let { i -> marks.firstOrNull { it.type == RichMarkType.LINK && !it.value.isNullOrBlank() && it.start <= i && it.end > i } }
            val code = index?.let { i -> marks.firstOrNull { it.type == RichMarkType.CODE && it.start <= i && it.end > i } }
            val armed = state.armedCode
            when {
                link != null -> {
                    tap.consume()
                    state.armedCode = null
                    clearFocus()
                    state.tappedLink = hit.first.id to link
                    return@awaitEachGesture
                }
                code != null && (armed?.first != hit.first.id || armed.second != code) -> {
                    tap.consume()
                    clearFocus()
                    state.armedCode = hit.first.id to code
                    return@awaitEachGesture
                }
                else -> state.armedCode = null
            }
        }
        state.armedCodeBlock = null
        val caret = RichSelection(at, at)
        if (state.focused && state.editing?.selection == caret) {
            actions.toggleMenu()
        } else {
            actions.hideMenu()
            state.select(caret)
        }
        state.cursorHandle = true
        if (state.focused) {
            if (!state.keyboardSuppressed) state.keyboard?.show()
        } else {
            state.requestFocus()
        }
    }
}

/** The long press's first word and the word under the finger, as one
 *  selection whose moving end follows the finger. */
private fun unionOf(state: RichEditorState, first: RichSelection, here: RichSelection): RichSelection {
    val flat = state.editing?.flat ?: return first
    val firstStart = flat.offsetOf(first.anchor) ?: return first
    val hereStart = flat.offsetOf(here.anchor) ?: return first
    return if (hereStart < firstStart) RichSelection(first.head, here.anchor) else RichSelection(first.anchor, here.head)
}

/**
 * The note scrolling under a selection being dragged, as Chrome scrolls a
 * page: while the finger stays within [zone] of the top or the bottom of
 * the editor's visible part, or past it, with text hidden beyond, the note
 * scrolls that way, up to [maxSpeed] a second at the edge, through the
 * nested scrolling the editor sits in, and the selection follows to the
 * text coming under the finger.
 */
private class RichSelectionAutoScroll(
    private val state: RichEditorState,
    private val scope: CoroutineScope,
    private val dispatcher: NestedScrollDispatcher,
    private val zone: Float,
    private val maxSpeed: Float,
) {
    private var job: Job? = null
    private var finger = Offset.Unspecified
    private var track: (Offset) -> Unit = {}

    /** The finger, on screen, as it drags; [track] moves the selection to
     *  it, given in the editor's frame. */
    fun follow(fingerOnScreen: Offset, track: (Offset) -> Unit) {
        finger = fingerOnScreen
        this.track = track
        if (job?.isActive == true || speed() == 0f) return
        job = scope.launch {
            var last = withFrameNanos { it }
            while (true) {
                val now = withFrameNanos { it }
                val delta = speed() * (now - last) / 1e9f
                last = now
                if (delta == 0f) break
                val consumed = dispatcher.dispatchPostScroll(Offset.Zero, Offset(0f, delta), NestedScrollSource.UserInput)
                if (consumed.y == 0f) break
                val root = state.layouts.root?.takeIf { it.isAttached } ?: break
                this@RichSelectionAutoScroll.track(root.screenToLocal(finger))
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    /** The scroll's speed: toward the edge the finger is near, when text
     *  lies hidden past it, faster the nearer the finger. */
    private fun speed(): Float {
        val (whole, visible) = state.layouts.onScreen() ?: return 0f
        return when {
            visible.top > whole.top + 1f && finger.y < visible.top + zone ->
                maxSpeed * ((visible.top + zone - finger.y) / zone).coerceAtMost(1f)
            visible.bottom < whole.bottom - 1f && finger.y > visible.bottom - zone ->
                -maxSpeed * ((finger.y - visible.bottom + zone) / zone).coerceAtMost(1f)
            else -> 0f
        }
    }
}

// ---------- Handles ----------

private enum class RichHandleKind { START, END, CURSOR }

/** The selection's handles, while the text has the focus: one at each end
 *  of a selection, one under the caret once it was placed by a tap. */
@Composable
private fun RichSelectionHandles(
    state: RichEditorState,
    actions: RichTextActions,
    magnifier: MutableState<Offset>,
    autoScroll: RichSelectionAutoScroll,
    color: Color,
) {
    state.layouts.version
    val editing = state.editing ?: return
    if (!state.focused) return
    val span = editing.span ?: return
    if (span.collapsed) {
        if (state.cursorHandle) RichHandle(state, actions, magnifier, autoScroll, color, RichHandleKind.CURSOR)
    } else {
        RichHandle(state, actions, magnifier, autoScroll, color, RichHandleKind.START)
        RichHandle(state, actions, magnifier, autoScroll, color, RichHandleKind.END)
    }
}

/**
 * One handle, Android's own shape (a 25dp drop, its square corner on the
 * text position, the caret's pointing up), in a popup so the note's edges
 * never clip it, hidden once its end scrolls out of sight. Dragging it
 * moves its end of the selection (the caret, for the caret's) with the
 * magnifier over it; the menu comes back when it is let go.
 */
@Composable
private fun RichHandle(
    state: RichEditorState,
    actions: RichTextActions,
    magnifier: MutableState<Offset>,
    autoScroll: RichSelectionAutoScroll,
    color: Color,
    kind: RichHandleKind,
) {
    val density = LocalDensity.current
    val size = with(density) { 25.dp.roundToPx() }
    val current = rememberUpdatedState(kind)

    fun end(): RichPos? {
        val editing = state.editing ?: return null
        val span = editing.span ?: return null
        return when (current.value) {
            RichHandleKind.START -> RichPos(editing.blocks[span.start].id, span.startOffset)
            RichHandleKind.END, RichHandleKind.CURSOR -> RichPos(editing.blocks[span.end].id, span.endOffset)
        }
    }

    val provider = remember(state) {
        object : PopupPositionProvider {
            override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
                state.layouts.version
                val anchor = end()?.let { state.handleAnchor(it) } ?: return IntOffset(-10 * size, -10 * size)
                val x = when (current.value) {
                    RichHandleKind.START -> anchor.x - size
                    RichHandleKind.END -> anchor.x
                    RichHandleKind.CURSOR -> anchor.x - size / 2f
                }
                return IntOffset(anchorBounds.left + x.roundToInt(), anchorBounds.top + anchor.y.roundToInt())
            }
        }
    }
    val visible = end()?.let { state.handleAnchor(it) }?.let { state.layouts.isVisible(it) } == true
    if (!visible) return
    Popup(popupPositionProvider = provider, properties = PopupProperties(focusable = false, excludeFromSystemGesture = true, clippingEnabled = false)) {
        var frame by remember { mutableStateOf<LayoutCoordinates?>(null) }
        Box(
            Modifier
                .size(25.dp)
                .onPlaced { frame = it }
                .drawWithCache {
                    val radius = this.size.width / 2f
                    val shape = Path().apply {
                        addOval(Rect(Offset.Zero, this@drawWithCache.size))
                        when (current.value) {
                            RichHandleKind.START -> addRect(Rect(radius, 0f, this@drawWithCache.size.width, radius))
                            RichHandleKind.END -> addRect(Rect(0f, 0f, radius, radius))
                            RichHandleKind.CURSOR -> {
                                moveTo(radius, 0f)
                                lineTo(radius + radius * 0.7071f, radius - radius * 0.7071f)
                                lineTo(radius - radius * 0.7071f, radius - radius * 0.7071f)
                                close()
                            }
                        }
                    }
                    onDrawBehind { drawPath(shape, color) }
                }
                .pointerInput(state) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        down.consume()
                        val root = state.layouts.root ?: return@awaitEachGesture
                        val handle = frame ?: return@awaitEachGesture
                        val start = end() ?: return@awaitEachGesture
                        val editing = state.editing ?: return@awaitEachGesture
                        val span = editing.span ?: return@awaitEachGesture
                        val fixed = when (current.value) {
                            RichHandleKind.START -> RichPos(editing.blocks[span.end].id, span.endOffset)
                            RichHandleKind.END -> RichPos(editing.blocks[span.start].id, span.startOffset)
                            RichHandleKind.CURSOR -> null
                        }
                        val anchor = state.handleAnchor(start) ?: return@awaitEachGesture
                        // What the finger holds above the text position, in the
                        // editor's frame, whatever the popup does meanwhile.
                        val grab = anchor - root.screenToLocal(handle.localToScreen(down.position)) - Offset(0f, 1f)
                        actions.hideMenu()
                        var moved = false
                        val track: (Offset) -> Unit = { point ->
                            val finger = point + grab
                            state.positionAt(finger)?.let { at ->
                                moved = true
                                state.select(if (fixed == null) RichSelection(at, at) else RichSelection(fixed, at))
                                magnifier.value = state.magnifierCenter(finger, at)
                            }
                        }
                        try {
                            while (true) {
                                val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                                if (change.changedToUpIgnoreConsumed()) break
                                change.consume()
                                val onScreen = handle.localToScreen(change.position)
                                track(root.screenToLocal(onScreen))
                                autoScroll.follow(onScreen, track)
                            }
                        } finally {
                            autoScroll.stop()
                        }
                        magnifier.value = Offset.Unspecified
                        if (moved || current.value != RichHandleKind.CURSOR) actions.showMenu() else actions.toggleMenu()
                    }
                },
        )
    }
}

// ---------- Clipboard, menu and keys ----------

@Composable
private fun rememberRichTextActions(state: RichEditorState, bringIntoView: BringIntoViewRequester): RichTextActions {
    val toolbar = LocalTextToolbar.current
    val clipboard = LocalClipboard.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    return remember(state, bringIntoView, toolbar, clipboard, scope) {
        RichTextActions(state, bringIntoView, toolbar, clipboard, context, scope)
    }
}

/**
 * Cut, Copy, Paste and Select all over the selection, the floating menu
 * Android shows above a text field's selection that offers them, and the
 * keys a hardware keyboard or the input method sends.
 */
private class RichTextActions(
    private val state: RichEditorState,
    private val bringIntoView: BringIntoViewRequester,
    private val toolbar: TextToolbar,
    private val clipboard: Clipboard,
    private val context: Context,
    private val scope: CoroutineScope,
) {
    /** Where Up and Down aim while they follow one another, Blink keeping
     *  the x of the first one, with the selection the last one left. */
    private var verticalGoal: Pair<RichSelection, Float>? = null

    fun showMenu() {
        val editing = state.editing ?: return
        val span = editing.span ?: return
        val root = state.layouts.root?.takeIf { it.isAttached } ?: return
        val rect = (if (span.collapsed) state.caretRect() else state.selectionRect()) ?: return
        val whole = span.start == 0 && span.startOffset == 0 && span.end == editing.blocks.lastIndex &&
            span.endOffset == editing.blocks.last().textLength
        toolbar.showMenu(
            rect = Rect(root.localToRoot(rect.topLeft), root.localToRoot(rect.bottomRight)),
            onCopyRequested = if (span.collapsed) null else ({ copy(); hideMenu() }),
            onPasteRequested = if (clipboard.nativeClipboardManager.hasPrimaryClip()) ({ paste(); hideMenu() }) else null,
            onCutRequested = if (span.collapsed) null else ({ cut(); hideMenu() }),
            onSelectAllRequested = if (whole) null else ({ state.selectAll(); showMenu() }),
        )
    }

    fun hideMenu() {
        if (toolbar.status == TextToolbarStatus.Shown) toolbar.hide()
    }

    fun toggleMenu() = if (toolbar.status == TextToolbarStatus.Shown) hideMenu() else showMenu()

    /** The menu follows its selection as the note scrolls. */
    fun onMoved() {
        if (toolbar.status == TextToolbarStatus.Shown && state.focused) showMenu()
    }

    fun copy() {
        val clip = state.selectedClip() ?: return
        scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newHtmlText("text", clip.text, clip.html))) }
    }

    fun cut() {
        copy()
        state.deleteSelection()
    }

    /** The clipboard's text and markup pasted, only its text with
     *  [asPlainText] (the web's Ctrl+Shift+V). */
    fun paste(asPlainText: Boolean = false) {
        scope.launch {
            val clip = clipboard.getClipEntry()?.clipData ?: return@launch
            val text = (0 until clip.itemCount).joinToString("") { clip.getItemAt(it).coerceToText(context) }
            val html = (0 until clip.itemCount).firstNotNullOfOrNull { clip.getItemAt(it).htmlText }
            state.paste(text, html, asPlainText)
        }
    }

    /** The input method's own menu (performContextMenuAction). */
    fun onMenuAction(id: Int): Boolean {
        when (id) {
            android.R.id.selectAll -> state.selectAll()
            android.R.id.copy -> copy()
            android.R.id.cut -> cut()
            android.R.id.paste -> paste()
            android.R.id.pasteAsPlainText -> paste(asPlainText = true)
            else -> return false
        }
        return true
    }

    /**
     * A key: Backspace, Delete and Enter as the keyboard's own, the arrows,
     * Home and End moving the caret as a browser does (Shift extending the
     * selection), Ctrl+A, C, X and V (with Shift, pasting plain text), and
     * any other character typed in.
     */
    fun handleKey(event: KeyEvent): Boolean {
        if (state.editing == null) return false
        if (event.action != KeyEvent.ACTION_DOWN) return event.keyCode in HandledKeys
        val ctrl = event.isCtrlPressed
        val shift = event.isShiftPressed
        when {
            event.keyCode == KeyEvent.KEYCODE_DEL -> state.ime.backspace()
            event.keyCode == KeyEvent.KEYCODE_FORWARD_DEL -> state.ime.deleteForward()
            event.keyCode == KeyEvent.KEYCODE_ENTER || event.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER -> state.ime.enter()
            event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT -> moved { state.moveCaret(forward = false, extend = shift) }
            event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT -> moved { state.moveCaret(forward = true, extend = shift) }
            event.keyCode == KeyEvent.KEYCODE_DPAD_UP -> moved { moveVertically(down = false, extend = shift) }
            event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN -> moved { moveVertically(down = true, extend = shift) }
            event.keyCode == KeyEvent.KEYCODE_MOVE_HOME -> moved { moveToEdge(end = false, document = ctrl, extend = shift) }
            event.keyCode == KeyEvent.KEYCODE_MOVE_END -> moved { moveToEdge(end = true, document = ctrl, extend = shift) }
            ctrl && event.keyCode == KeyEvent.KEYCODE_A -> state.selectAll()
            ctrl && event.keyCode == KeyEvent.KEYCODE_C -> copy()
            ctrl && event.keyCode == KeyEvent.KEYCODE_X -> cut()
            ctrl && event.keyCode == KeyEvent.KEYCODE_V -> paste(asPlainText = event.isShiftPressed)
            else -> {
                val char = event.unicodeChar
                if (char == 0 || ctrl || event.isAltPressed || Character.isISOControl(char)) return false
                state.ime.commitText(String(Character.toChars(char)), 1)
            }
        }
        return true
    }

    /** [move] done by a key, then the caret brought into sight, as a
     *  browser scrolls it there. */
    private fun moved(move: () -> Unit) {
        move()
        scope.launch { state.caretRect()?.let { bringIntoView.bringIntoView(it) } }
    }

    /**
     * Up, or Down with [down], as Blink moves the caret: onto the line above
     * or below, through the lines of every block of text, where it lies
     * nearest the same x; past the first line to its start, past the last
     * one to its end. A rule on the way, which the web selects whole, is
     * stepped over to where its next press lands: the end of the text
     * before it going up, the start of the text after it going down.
     */
    private fun moveVertically(down: Boolean, extend: Boolean) {
        val editing = state.editing ?: return
        val head = editing.selection.head
        val index = editing.blocks.indexOfFirst { it.id == head.blockId }
        val (layout, origin) = state.layouts.placed(head.blockId) ?: return
        val offset = head.offset.coerceIn(0, layout.padded.length)
        val x = verticalGoal?.takeIf { it.first == editing.selection }?.second
            ?: (origin.x + layout.getHorizontalPosition(offset))
        val target = lineAfter(editing.blocks, index, layout.getLineForOffset(offset), down, x) ?: return
        state.select(if (extend) RichSelection(editing.selection.anchor, target) else RichSelection(target, target))
        verticalGoal = state.editing?.selection?.let { it to x }
    }

    /** Where the caret goes from [line] of block [index] one line [down] or
     *  up, aiming at [x] in the editor's frame. */
    private fun lineAfter(blocks: List<RichBlock>, index: Int, line: Int, down: Boolean, x: Float): RichPos? {
        val here = blocks.getOrNull(index) ?: return null
        val (layout, origin) = state.layouts.placed(here.id) ?: return null
        val next = if (down) line + 1 else line - 1
        if (next in 0 until layout.lineCount) return positionOnLine(here, layout, origin, next, x)
        val step = if (down) 1 else -1
        var beyond = index + step
        var ruled = false
        while (beyond in blocks.indices && !blocks[beyond].kind.hasText) {
            ruled = true
            beyond += step
        }
        val block = blocks.getOrNull(beyond) ?: return RichPos(here.id, if (down) here.textLength else 0)
        if (ruled) return RichPos(block.id, if (down) 0 else block.textLength)
        val (blockLayout, blockOrigin) = state.layouts.placed(block.id) ?: return null
        return positionOnLine(block, blockLayout, blockOrigin, if (down) 0 else blockLayout.lineCount - 1, x)
    }

    private fun positionOnLine(block: RichBlock, layout: PaddedLayout, origin: Offset, line: Int, x: Float): RichPos {
        val y = (layout.getLineTop(line) + layout.getLineBottom(line)) / 2f
        return RichPos(block.id, layout.getOffsetForPosition(Offset(x - origin.x, y)).coerceAtMost(block.textLength))
    }

    /** Home, or End with [end]: the start or end of the caret's line, of the
     *  whole note with [document] (Ctrl). A line the text wraps after ends
     *  before the spaces it wraps at, where a tap past it lands too. */
    private fun moveToEdge(end: Boolean, document: Boolean, extend: Boolean) {
        val editing = state.editing ?: return
        val head = editing.selection.head
        val target = if (document) {
            val text = editing.blocks.filter { it.kind.hasText }
            val block = (if (end) text.lastOrNull() else text.firstOrNull()) ?: return
            RichPos(block.id, if (end) block.textLength else 0)
        } else {
            val block = editing.blocks.firstOrNull { it.id == head.blockId } ?: return
            val layout = state.layouts.layout(block.id) ?: return
            val line = layout.getLineForOffset(head.offset.coerceIn(0, layout.padded.length))
            val offset = when {
                !end -> layout.getLineStart(line)
                line == layout.lineCount - 1 -> block.textLength
                else -> layout.getLineEnd(line, visibleEnd = true)
            }
            RichPos(block.id, offset.coerceAtMost(block.textLength))
        }
        state.select(if (extend) RichSelection(editing.selection.anchor, target) else RichSelection(target, target))
    }

    private companion object {
        val HandledKeys = setOf(
            KeyEvent.KEYCODE_DEL, KeyEvent.KEYCODE_FORWARD_DEL, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER,
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_MOVE_HOME, KeyEvent.KEYCODE_MOVE_END,
        )
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
    fun Rows(flow: RichFlow) {
        for (row in flow.rows) {
            if (row.gapBefore > 0f) Spacer(Modifier.height(row.gapBefore.dp))
            when (row) {
                is RichQuoteRow -> RichQuoteCard(
                    indent = row.indent.dp,
                    accent = accent,
                    noteColor = noteColor,
                    dark = dark,
                ) { Rows(row.inner) }
                is RichBlockRow -> {
                    val block = blocks[row.index]
                    val look = richRowLook(row, block, typography, taskStrike, dark, titleColor, surface)
                    when (block.kind) {
                        // `border-top: 1px solid currentColor` (preflight): no rule
                        // softens the view's rule the way the editor's is.
                        RichBlockKind.DIVIDER -> RichDivider(titleColor, start = row.start.dp, modifier = look.faded)
                        RichBlockKind.CODE_BLOCK -> RichReaderCodeBlock(
                            block = block,
                            style = look.style,
                            lines = look.lines,
                            indent = look.indent,
                            dark = dark,
                            noteColor = noteColor,
                            surface = surface,
                            copyShown = shownCopy == block.id,
                            onTap = { shownCopy = block.id },
                            modifier = look.faded,
                        )
                        else -> RichListRow(
                            block = block,
                            style = look.style,
                            list = row.list,
                            indent = look.indent,
                            accent = accent,
                            onToggleChecked = null,
                            modifier = look.faded,
                        ) { textModifier ->
                            ReaderText(
                                block = block,
                                style = look.style,
                                lines = look.lines,
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
            Rows(flow)
        }
    }

    if (compact) {
        Body()
    } else {
        val clipboard = LocalClipboard.current
        CompositionLocalProvider(LocalClipboard provides remember(clipboard) { UnpaddedClipboard(clipboard) }) {
            SelectionContainer { Body() }
        }
    }
}

/** The clipboard the view's selection copies to, which leaves out what
 *  [PaddedText] lays out beyond the text: what it copies is the note's own
 *  text. */
private class UnpaddedClipboard(private val clipboard: Clipboard) : Clipboard by clipboard {
    override suspend fun setClipEntry(clipEntry: ClipEntry?) = clipboard.setClipEntry(clipEntry?.withoutPads())

    private fun ClipEntry.withoutPads(): ClipEntry {
        val data = clipData
        if (data.itemCount == 0) return this
        val items = List(data.itemCount) { i ->
            val item = data.getItemAt(i)
            item.text?.let { ClipData.Item(PaddedText.unpadded(it)) } ?: item
        }
        return ClipEntry(ClipData(data.description, items.first()).apply { items.drop(1).forEach(::addItem) })
    }
}

private val RichBlock.isChecked: Boolean get() = kind == RichBlockKind.TASK_ITEM && checked

// ---------- The block flow: the web's margins, lists and quotes ----------

/** One line of the flow: a block, or a quote card holding the flow of its
 *  own blocks, [gapBefore] under whatever came before. */
private sealed interface RichRow {
    val gapBefore: Float
}

/** A block: [start] is the text column of the list item holding it, if
 *  any, and [heldByChecked] how many checked task items hold it. */
private class RichBlockRow(
    val index: Int,
    override val gapBefore: Float,
    val list: RichListPlacement?,
    val start: Float,
    val heldByChecked: Int,
) : RichRow

/** A quote card [indent] from the column's edge, its blocks laid out in
 *  [inner]. */
private class RichQuoteRow(val inner: RichFlow, val indent: Float, override val gapBefore: Float) : RichRow

/** A list item's columns, from the note's left edge: its text, and where
 *  its marker belongs (the checkbox's left edge; the bullet and the number
 *  sit left of [markerStart], the item's start, which its paragraph's own
 *  indent leaves behind); [number] for an ordered item. */
private class RichListPlacement(val textStart: Float, val markerStart: Float, val number: Int?)

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
 * 16 around code and 13.6 around a rule, 1.6 above a nested list. A quote
 * lays its own blocks out the same way inside its padding, which no margin
 * crosses, a quote inside it included, two paragraphs in a row there 5.6
 * apart (`blockquote p + p`).
 *
 * Lists nest by [RichBlock.nestLevel]: a bullet or ordered list pads its
 * items 17.6 (16 once nested, the marker in that gutter), a task list 0
 * (20 inside another task item) and puts its text 24 right of the
 * checkbox; the Indent extension moves a bullet or ordered item whole but
 * only a task item's text. What an item holds after its paragraph sits in
 * its text column, inside its boxes. Ordered items count with the web's
 * `gk-ol` counter as Chrome scopes it: the reset a list gets after a
 * paragraph, heading, rule, quote, bullet or task list only reaches its own
 * items, so that list starts at 1, a nested one too; a list opening the
 * note or a quote, or following a code block or another ordered list,
 * counts on with the one counter all such lists share across the note.
 * [itemEm] is a list item's font size, and the em of a quote's indent.
 */
private fun richFlow(blocks: List<RichBlock>, itemEm: Float): RichFlow {
    var noteCounter = 0

    /** The blocks `[from, to)`, all held by the same [depth] quotes. */
    fun flow(from: Int, to: Int, depth: Int): RichFlow {
        class Level(
            val first: RichBlock,
            val list: FlowBox,
            var item: FlowBox,
            var checked: Boolean,
            val sharesCounter: Boolean,
            var counter: Int,
            var childStart: Float,
        )

        /** Whether an ordered list opening at block [index] counts on with
         *  the note's counter: nothing stands right before it in its quotes,
         *  or a code block or another ordered list does, which reset none. */
        fun countsOn(index: Int): Boolean {
            if (index == from) return true
            if (!blocks[index - 1].sharesQuoteWith(blocks[index])) return false
            var top = index - 1
            while (top > from && blocks[top].nestLevel > 0) top--
            return blocks[top].kind == RichBlockKind.CODE_BLOCK || blocks[top].kind == RichBlockKind.NUMBERED_ITEM
        }

        var nextId = 0
        val levels = mutableListOf<Level>()
        val rows = mutableListOf<RichRow>()
        var previousChain = emptyList<FlowBox>()
        var i = from
        while (i < to) {
            val block = blocks[i]
            val previous = if (i > from) blocks[i - 1] else null
            var last = i
            var placement: RichListPlacement? = null
            var start = 0f
            var heldByChecked = 0
            var inner: RichFlow? = null
            val chain: List<FlowBox>
            val quote = block.quotes.getOrNull(depth)
            if (quote != null) {
                levels.clear()
                while (last + 1 < to && blocks[last + 1].quotes.getOrNull(depth)?.id == quote.id) last++
                inner = flow(i, last + 1, depth + 1)
                chain = listOf(FlowBox(nextId++, 9.6f, 9.6f))
            } else if (block.kind.isListItem) {
                val level = block.nestLevel.coerceIn(0, levels.size)
                while (levels.size > level + 1) levels.removeAt(levels.lastIndex)
                val task = block.kind == RichBlockKind.TASK_ITEM
                val itemBox = FlowBox(nextId++, if (task) 1.6f else 0f, if (task) 1.6f else 0f)
                val current = levels.getOrNull(level)
                if (current != null && block.continuesList(current.first)) {
                    current.item = itemBox
                    current.checked = block.isChecked
                } else {
                    if (current != null) levels.removeAt(level)
                    val listMargin = when {
                        task -> 2.4f
                        level > 0 -> 1.6f
                        else -> 0f
                    }
                    levels.add(
                        Level(block, FlowBox(nextId++, listMargin, if (task) 2.4f else 0f), itemBox, block.isChecked, level == 0 && countsOn(i), 0, 0f),
                    )
                }
                val entry = levels[level]
                val parentStart = if (level == 0) 0f else levels[level - 1].childStart
                val padding = when {
                    level == 0 -> if (task) 0f else 17.6f
                    task -> if (levels[level - 1].first.kind == RichBlockKind.TASK_ITEM) 20f else 0f
                    else -> 16f
                }
                val indent = block.indent * IndentStepEm * itemEm
                val number = when {
                    block.kind != RichBlockKind.NUMBERED_ITEM -> null
                    entry.sharesCounter -> ++noteCounter
                    else -> ++entry.counter
                }
                placement = if (task) {
                    val checkbox = parentStart + padding
                    entry.childStart = checkbox + 24f
                    RichListPlacement(checkbox + 24f + indent, checkbox, null)
                } else {
                    val item = parentStart + padding + indent
                    entry.childStart = item
                    RichListPlacement(item + block.lineIndent * IndentStepEm * itemEm, item, number)
                }
                heldByChecked = levels.take(level).count { it.checked }
                chain = levels.flatMap { listOf(it.list, it.item) }
            } else {
                while (levels.size > block.nestLevel) levels.removeAt(levels.lastIndex)
                start = levels.lastOrNull()?.childStart ?: 0f
                heldByChecked = levels.count { it.checked }
                val margin = when (block.kind) {
                    RichBlockKind.CODE_BLOCK -> 16f
                    RichBlockKind.DIVIDER -> 13.6f
                    else -> 0f
                }
                val followsParagraph = previous?.kind == RichBlockKind.PARAGRAPH && previous.nestLevel == 0 && previous.quotes.size == depth
                val top = if (depth > 0 && levels.isEmpty() && block.kind == RichBlockKind.PARAGRAPH && followsParagraph) 5.6f else margin
                chain = levels.flatMap { listOf(it.list, it.item) } + FlowBox(nextId++, top, margin)
            }
            val shared = previousChain.zip(chain).takeWhile { (a, b) -> a.id == b.id }.size
            val gap = (previousChain.drop(shared).map { it.bottom } + chain.drop(shared).map { it.top }).maxOrNull() ?: 0f
            rows += if (inner != null && quote != null) {
                RichQuoteRow(inner, quote.indent * IndentStepEm * itemEm, gap)
            } else {
                RichBlockRow(i, gap, placement, start, heldByChecked)
            }
            previousChain = chain
            i = last + 1
        }
        return RichFlow(rows, previousChain.maxOfOrNull { it.bottom } ?: 0f)
    }

    return flow(0, blocks.size, depth = 0)
}

// ---------- Blocks ----------

/**
 * A paragraph, heading or list item: its text column at [RichListPlacement.textStart]
 * (or the block's own [indent]) and, for a list item, its marker at
 * [RichListPlacement.markerStart]: Chrome's disc, the `gk-ol` number ending
 * there (wider numbers reach further left, like an outside `::marker`), or
 * the WebView's own checkbox 0.18em down, in the theme's `--rt-accent`.
 */
@Composable
private fun RichListRow(
    block: RichBlock,
    style: TextStyle,
    list: RichListPlacement?,
    indent: Dp,
    accent: Color,
    onToggleChecked: (() -> Unit)?,
    modifier: Modifier = Modifier,
    text: @Composable (Modifier) -> Unit,
) {
    if (list == null) {
        text(modifier.padding(start = indent))
        return
    }
    val em = style.fontSize.value
    Box(modifier.fillMaxWidth()) {
        when (block.kind) {
            RichBlockKind.TASK_ITEM -> {
                val label = stringResource(R.string.native_richtext_task_toggle)
                GkCheckbox(
                    checked = block.checked,
                    onCheckedChange = onToggleChecked?.let { toggle -> { _: Boolean -> toggle() } },
                    accent = accent,
                    modifier = Modifier
                        .offset(x = list.markerStart.dp, y = (0.18f * em).dp)
                        .semantics { contentDescription = label },
                )
            }
            RichBlockKind.NUMBERED_ITEM -> Text(
                "${list.number ?: 1}. ",
                style = style.copy(textAlign = TextAlign.Start, fontFeatureSettings = "tnum").webItalic(),
                softWrap = false,
                maxLines = 1,
                modifier = Modifier.layout { measurable, _ ->
                    val placeable = measurable.measure(Constraints())
                    layout(0, placeable.height) {
                        placeable.place(list.markerStart.dp.roundToPx() - placeable.width, 0)
                    }
                },
            )
            else -> Box(Modifier.drawBehind { drawListDisc(style.color, em, list.markerStart, 0.75f * em) })
        }
        text(Modifier.padding(start = list.textStart.dp))
    }
}

/** The Android WebView's outside `disc` for a list item of [em] font size
 *  starting at [itemStart]: a 0.15625em dot [centreY] down, its centre
 *  0.61em left of the item, nearer than desktop Chrome puts it. In dp. */
internal fun DrawScope.drawListDisc(color: Color, em: Float, itemStart: Float, centreY: Float) =
    drawCircle(color, radius = (0.15625f * em).dp.toPx(), center = Offset((itemStart - 0.61f * em).dp.toPx(), centreY.dp.toPx()))

/** `hr`: 1px, in [color], from [start] to the column's edge. */
@Composable
private fun RichDivider(color: Color, start: Dp, modifier: Modifier = Modifier) {
    Box(modifier.padding(start = start).fillMaxWidth().height(1.dp).background(color))
}

/**
 * A quote card (globalCSS.js:1266-1292, 3004-3067): as wide as its text
 * (at most the column), an 8px bar in the accent outside its padding, the
 * accent wash, a 1px frame of the note colour on its other three sides,
 * round right corners, and the big serif opening quote in its gutter.
 * Holds every block of one quote.
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
            // `::before` is absolute: it takes no room, and its 54.4 line box
            // sits 3 above the card, the glyph's own height centred in it.
            // Compose keeps a line at least as tall as its font, so the
            // centring is done here.
            Text(
                "“",
                color = glyph,
                fontSize = 54.4.sp,
                lineHeight = 54.4.sp,
                fontFamily = FontFamily.Serif,
                fontStyle = FontStyle.Normal,
                modifier = Modifier.layout { measurable, _ ->
                    val placeable = measurable.measure(Constraints())
                    val top = (-3).dp.toPx() + (54.4.sp.toPx() - placeable.height) / 2f
                    layout(0, 0) { placeable.place(15.2.dp.roundToPx(), top.roundToInt()) }
                },
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
 *  edit extras arm a copy button on the first tap ([armed] not null, the
 *  editor's taps disarming it), which clears itself after 5s; otherwise a
 *  tap simply places the caret. */
@Composable
private fun RichEditorCodeBlock(
    indent: Dp,
    dark: Boolean,
    copyText: String,
    noteColor: String?,
    armed: Boolean?,
    onArm: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    text: @Composable () -> Unit,
) {
    LaunchedEffect(armed) {
        if (armed == true) {
            delay(5000)
            onArm(false)
        }
    }
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier
            .padding(start = indent)
            .fillMaxWidth()
            .background(if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.06f), shape)
            .border(1.dp, if (dark) RtDividerDark else RtDividerLight, shape)
            .padding(horizontal = 14.6.dp, vertical = 10.6.dp),
    ) {
        text()
        when (armed) {
            true -> CodeCopyButton(
                text = copyText,
                noteColor = noteColor,
                dark = dark,
                modifier = Modifier.align(Alignment.TopEnd).offset(x = 6.6.dp, y = (-2.6).dp),
            )
            false -> Box(Modifier.matchParentSize().pointerInput(Unit) { detectTapGestures { onArm(true) } })
            null -> Unit
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
    lines: TextDecoration,
    indent: Dp,
    dark: Boolean,
    noteColor: String?,
    surface: RichSurface,
    copyShown: Boolean,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(9.6.dp)
    val copyAlpha by animateFloatAsState(if (copyShown) 1f else 0f, tween(150), label = "codeCopy")
    Box(
        modifier
            .padding(start = indent)
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.06f), shape)
            .border(1.dp, if (dark) DarkBorderColor else LightBorderColor, shape)
            .then(if (surface == RichSurface.READER) Modifier.pointerInput(Unit) { detectTapGestures { onTap() } } else Modifier),
    ) {
        ReaderText(
            block = block,
            style = style,
            lines = lines,
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
 * code, highlights and underlines are painted behind it, line-throughs
 * over it ([lines] are its whole text's, see [richLinesOf]), and a tap on
 * inline code shows a copy chip right after it, as
 * attachReadModeInlineCopy does.
 */
@Composable
private fun ReaderText(
    block: RichBlock,
    style: TextStyle,
    lines: TextDecoration,
    dark: Boolean,
    surface: RichSurface,
    noteColor: String?,
    modifier: Modifier = Modifier,
) {
    val uriHandler = LocalUriHandler.current
    val openLink = remember(uriHandler) {
        LinkInteractionListener { link -> (link as? LinkAnnotation.Url)?.let { uriHandler.openUri(it.url) } }
    }
    val padded = remember(block, style, dark, surface) { paddedTextFor(block, style, dark, surface, openLink) }
    val fonts = LocalFontFamilyResolver.current
    val drawnLines = remember(block, style, lines, dark, surface, fonts) { richLinesOf(block, style, lines, dark, surface, fonts) }
    var layout by remember { mutableStateOf<PaddedLayout?>(null) }
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
            padded.text,
            style = style,
            onTextLayout = { layout = PaddedLayout(it, padded) },
            inlineContent = richPads(editor = false),
            modifier = Modifier
                .fillMaxWidth()
                .drawWithContent {
                    val text = layout
                    if (text != null) drawRichDecorations(text, block, style, dark, surface, drawnLines)
                    drawContent()
                    if (text != null) drawRichLines(text, drawnLines, through = true)
                }
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
private fun InlineCodeCopy(mark: RichMark, text: String, layout: PaddedLayout, noteColor: String?, dark: Boolean) {
    val start = mark.start.coerceIn(0, text.length)
    val end = mark.end.coerceIn(start, text.length)
    if (end <= start) return
    // The box's end: past its padding.
    val box = layout.laidOut.getBoundingBox(layout.padded.box(start, end).end - 1)
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

/** The character under [position], or null past the end of its line. */
private fun PaddedLayout.charAt(position: Offset, textLength: Int): Int? {
    val offset = getOffsetForPosition(position)
    return listOf(offset - 1, offset).firstOrNull { it in 0 until textLength && getBoundingBox(it).contains(position) }
}

/**
 * EditExtras' `.rt-link-popover`: tapping a link in the editor, with the
 * read-mode preference off, shows "Open" and "Edit" 8px above the link and
 * centred on it, under it when there is no room above, 8px inside the
 * screen; a touch anywhere else, the link included, closes it and still
 * goes on to what it lands on. [bounds] is the link, in the text's own
 * coordinates.
 */
@Composable
private fun LinkTapPopover(bounds: Rect, dark: Boolean, onOpen: () -> Unit, onEdit: () -> Unit, onDismiss: () -> Unit) {
    GkPopover(
        close = GkPopoverClose.Touch,
        onDismiss = onDismiss,
        placement = { text, screen, card ->
            val margin = 8.dp.roundToPx()
            val above = text.top + bounds.top.roundToInt() - card.height - margin
            val top = if (above < margin) text.top + bounds.bottom.roundToInt() + margin else above
            val left = (text.left + bounds.center.x.roundToInt() - card.width / 2)
                .coerceAtLeast(margin)
                .coerceAtMost(screen.width - card.width - margin)
            IntOffset(left, top)
        },
        sparesAnchor = false,
    ) {
        val shape = RoundedCornerShape(10.dp)
        val buttonShape = RoundedCornerShape(7.dp)
        val textColor = if (dark) DarkTitleColor else LightTitleColor
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

// ---------- Styles ----------

/** A block row's text style, the lines its whole text takes (see
 *  [richLinesOf]), where it starts, and how much everything in it fades:
 *  `gk-strike-checked` strikes and fades all a checked task item holds,
 *  each checked item around it fading it once more; the item's own text is
 *  faded by its caller. */
private class RichRowLook(val style: TextStyle, val lines: TextDecoration, val indent: Dp, val faded: Modifier)

private fun richRowLook(
    row: RichBlockRow,
    block: RichBlock,
    typography: TypographyProfile,
    taskStrike: Boolean,
    dark: Boolean,
    titleColor: Color,
    surface: RichSurface,
): RichRowLook {
    val struck = taskStrike && (block.isChecked || row.heldByChecked > 0)
    val style = richBlockTextStyle(block, typography, dark, titleColor, surface)
    return RichRowLook(
        style = style,
        lines = TextDecoration.combine(
            listOfNotNull(
                TextDecoration.Underline.takeIf { typography.forKind(block.kind).underline },
                TextDecoration.LineThrough.takeIf { struck },
            ),
        ),
        indent = (row.start + block.indent * IndentStepEm * style.fontSize.value).dp,
        faded = if (taskStrike && row.heldByChecked > 0) Modifier.alpha(0.6f.pow(row.heldByChecked)) else Modifier,
    )
}

/**
 * The block's own text style, straight from the user's typography profile
 * (typographyPresets.js's DEFAULT_PROFILE until they change it): size,
 * weight, colour and italic all come from there, its underline goes to
 * [RichRowLook.lines].
 *
 * Line heights are the CSS ones: 1.5 for a paragraph in the view (the
 * page's own) but 1.55 in the editor (`.rt-editor-content`), 20px in a
 * card (`text-sm`); 1.5 for headings, 1.45 for list items and the
 * paragraphs and code they hold. A `pre` is 0.9em at 1.5 in the view, the
 * editor shrinks its code once more (0.9em inside 0.9em) at 1.55, and a
 * card's is 12.6/18. A quote sets 1.6, which its paragraphs and code take,
 * and its italic, which everything in it takes but a heading, whose style
 * sets its own. A size mark bigger than the text grows every line of its
 * block, the closest Compose gets to CSS growing the lines that hold it.
 */
private fun richBlockTextStyle(
    block: RichBlock,
    typography: TypographyProfile,
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
    val quoted = block.quotes.isNotEmpty()
    val lineHeightFactor = when {
        block.kind.isHeading -> 1.5f
        block.listDepth > 0 -> 1.45f
        quoted -> 1.6f
        surface == RichSurface.CARD -> 20f / 14f
        code && surface == RichSurface.EDITOR -> 1.55f
        code -> 1.5f
        surface == RichSurface.EDITOR -> 1.55f
        else -> 1.5f
    }
    val tallest = block.marks.filter { it.type == RichMarkType.FONT_SIZE }.mapNotNull { richFontSizeOf(it.value) }.maxOrNull()
    val lineBox = maxOf(fontSize, tallest ?: 0f)
    return TextStyle(
        color = richColorOf(preset.color, dark) ?: titleColor,
        fontSize = fontSize.sp,
        fontWeight = FontWeight(preset.weight),
        fontStyle = if (preset.italic || quoted && !block.kind.isHeading) FontStyle.Italic else FontStyle.Normal,
        fontFamily = if (code) FontFamily.Monospace else null,
        lineHeight = (if (code && surface == RichSurface.CARD) 18f else lineBox * lineHeightFactor).sp,
        // A style of its own replaces the theme's rather than adding to it.
        lineHeightStyle = CssLineHeightStyle,
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
 * map onto a SpanStyle. Inline code, highlights, underlines, links' lines
 * and line-throughs are painted by [drawRichDecorations] instead, since a
 * span can give them neither padding, radius nor the web's lines. Italic
 * in the system font is drawn as the WebView draws it ([WebSystemItalic]),
 * a font of the text's own keeps its italic. In the view, links (and the
 * phone numbers and e-mail addresses it linkifies) are real links.
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
    if (text.isEmpty()) return@buildAnnotatedString
    val marks = richMarksOf(block, surface)
    val linkColor = richLinkColor(dark)
    val points = richCutsOf(text, marks)
    for (i in 0 until points.size - 1) {
        val start = points[i]
        val end = points[i + 1]
        if (start >= end) continue
        val active = marks.filter { it.start <= start && it.end >= end }

        var bold = false
        var italic = false
        var fontSize = style.fontSize.value
        var sizeSet = false
        var baseline: BaselineShift? = null
        var mono = false

        for (m in active) when (m.type) {
            RichMarkType.BOLD -> bold = true
            RichMarkType.ITALIC -> italic = true
            RichMarkType.CODE -> mono = true
            // sub/sup: 75%, shifted 0.25em down / 0.5em up (preflight),
            // Compose's shift being a share of the font's ascent.
            RichMarkType.SUBSCRIPT -> baseline = BaselineShift(-0.27f)
            RichMarkType.SUPERSCRIPT -> baseline = BaselineShift(0.54f)
            RichMarkType.FONT_SIZE -> richFontSizeOf(m.value)?.let {
                fontSize = it
                sizeSet = true
            }
            // Colour and font: richTextColor and richFamilyOf; lines:
            // drawRichDecorations.
            RichMarkType.LINK, RichMarkType.TEXT_COLOR, RichMarkType.HIGHLIGHT, RichMarkType.FONT_FAMILY,
            RichMarkType.UNDERLINE, RichMarkType.STRIKE -> Unit
        }
        if (mono) fontSize *= 0.9f
        if (baseline != null) fontSize *= 0.75f
        val family = richFamilyOf(active)
        // Its italic or its block's, in the system font.
        val systemItalic = (italic || style.fontStyle == FontStyle.Italic) && (family ?: style.fontFamily) == null
        if (active.isEmpty() && !systemItalic) continue

        addStyle(
            SpanStyle(
                color = richTextColor(active, dark) ?: Color.Unspecified,
                fontWeight = if (bold) bolderThan(style.fontWeight) else null,
                fontStyle = when {
                    systemItalic -> FontStyle.Normal
                    italic -> FontStyle.Italic
                    else -> null
                },
                textGeometricTransform = if (systemItalic) WebSystemItalic else null,
                fontFamily = family,
                fontSize = if (sizeSet || mono || baseline != null) fontSize.sp else TextUnit.Unspecified,
                baselineShift = baseline,
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

/** A block's marks, and in the view the links it makes of the phone
 *  numbers and e-mail addresses in it (linkifyContactsHTML). */
private fun richMarksOf(block: RichBlock, surface: RichSurface): List<RichMark> =
    if (surface == RichSurface.READER) block.marks + RichDoc.contactLinks(block.text, block.marks) else block.marks

/** Where [marks] start and end in [text], in order, its ends included: the
 *  edges of the web's text fragments, each mark being an element. */
private fun richCutsOf(text: String, marks: List<RichMark>): List<Int> {
    val cuts = sortedSetOf(0, text.length)
    for (m in marks) {
        cuts.add(m.start.coerceIn(0, text.length))
        cuts.add(m.end.coerceIn(0, text.length))
    }
    return cuts.toList()
}

/** `.note-content a`'s colour. */
private fun richLinkColor(dark: Boolean): Color = if (dark) Color(0xFF93C5FD) else Color(0xFF2563EB)

/** [annotatedTextFor] as it is laid out, the padding of its inline code,
 *  and of its highlights in the editor, taking room in its line
 *  ([PaddedText]). */
private fun paddedTextFor(
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    surface: RichSurface,
    openLink: LinkInteractionListener? = null,
): PaddedText = PaddedText.of(
    annotatedTextFor(block, style, dark, surface, openLink),
    block.marks.mapNotNull { mark ->
        when {
            mark.type == RichMarkType.CODE -> PaddedRun(mark.start until mark.end, CodePadId)
            mark.type == RichMarkType.HIGHLIGHT && surface == RichSurface.EDITOR -> PaddedRun(mark.start until mark.end, HighlightPadId)
            else -> null
        }
    },
)

/** Inline code's padding and 1px border on either side, in dp: `.35rem`
 *  in the view, `.32em` of the code's 0.9em in the editor. */
private fun codePadX(editor: Boolean): Float = (if (editor) 4.608f else 5.6f) + 1f

/** The room [PaddedText] makes for inline code's padding, and in the
 *  editor for a highlight's 2px (`.rt-editor-content mark`). */
@Composable
private fun richPads(editor: Boolean): Map<String, InlineTextContent> {
    val density = LocalDensity.current
    return remember(density, editor) {
        fun pad(width: Float) = InlineTextContent(
            Placeholder(with(density) { width.dp.toSp() }, 0.1.em, PlaceholderVerticalAlign.AboveBaseline),
        ) {}
        mapOf(CodePadId to pad(codePadX(editor)), HighlightPadId to pad(2f))
    }
}

/** Chrome's own `mark` style, which a highlight with no colour of its own
 *  (typed as `==text==`) gets: yellow, under black text. */
private val PlainMarkBackground = Color(0xFFFFFF00)

/** CSS `font-weight: bolder`: 100-300 becomes 400, 400-500 becomes 700,
 *  anything heavier becomes 900. */
private fun bolderThan(weight: FontWeight?): FontWeight = when (weight?.weight ?: 400) {
    in 0..300 -> FontWeight.Normal
    in 301..500 -> FontWeight.Bold
    else -> FontWeight.Black
}

/** The colour of text under the [active] marks: black on a highlight of
 *  no colour of its own (Chrome's `mark`), a link's, a colour mark's. */
private fun richTextColor(active: List<RichMark>, dark: Boolean): Color? = when {
    active.any { it.type == RichMarkType.HIGHLIGHT && it.value == null } -> Color.Black
    active.any { it.type == RichMarkType.LINK && it.value != null } -> richLinkColor(dark)
    else -> active.lastOrNull { it.type == RichMarkType.TEXT_COLOR }?.let { richColorOf(it.value, dark) }
}

/** The font of text under the [active] marks: a font mark's, inline
 *  code's. */
private fun richFamilyOf(active: List<RichMark>): FontFamily? =
    active.lastOrNull { it.type == RichMarkType.FONT_FAMILY }?.let { richFontFamilyOf(it.value) }
        ?: FontFamily.Monospace.takeIf { active.any { it.type == RichMarkType.CODE } }

/**
 * A line along `[start, end)`, one of the web's text fragments: no mark
 * starts or ends inside it, and a wave or dashes start over at each. It
 * goes [through] the text or under it, in [style] and [color], as thick as
 * a font of [em] makes it; a line-through a third of that font's [ascent],
 * in em, over the baseline.
 */
private class RichLine(
    val start: Int,
    val end: Int,
    val through: Boolean,
    val style: DecorationStyle,
    val color: Color,
    val em: TextUnit,
    val ascent: Float,
)

/** An underline mark's `text-decoration-style`. */
private fun decorationStyleOf(value: String?): DecorationStyle = when (value) {
    "double" -> DecorationStyle.DOUBLE
    "dotted" -> DecorationStyle.DOTTED
    "dashed" -> DecorationStyle.DASHED
    "wavy" -> DecorationStyle.WAVY
    else -> DecorationStyle.SOLID
}

/**
 * The lines a block's text takes: [lines], its whole text's (the
 * typography's underline, `gk-strike-checked`'s line-through), in its own
 * colour and size, then its underline marks' (in their style, and colour
 * when they have one), its links' and its strikes', each in the colour and
 * size of the text it starts on.
 */
private fun richLinesOf(
    block: RichBlock,
    style: TextStyle,
    lines: TextDecoration,
    dark: Boolean,
    surface: RichSurface,
    fonts: FontFamily.Resolver,
): List<RichLine> {
    val text = block.text
    if (text.isEmpty()) return emptyList()
    val marks = richMarksOf(block, surface)
    val cuts = richCutsOf(text, marks)
    val found = mutableListOf<RichLine>()
    fun add(start: Int, end: Int, through: Boolean, lineStyle: DecorationStyle, color: Color, em: TextUnit, family: FontFamily?) {
        val ascent = if (through) ascentOf(fonts, family) else 0f
        var from = start
        for (cut in cuts) {
            if (cut <= from || cut >= end) continue
            found += RichLine(from, cut, through, lineStyle, color, em, ascent)
            from = cut
        }
        found += RichLine(from, end, through, lineStyle, color, em, ascent)
    }
    fun colorAt(offset: Int) = richTextColor(marks.filter { it.start <= offset && it.end > offset }, dark) ?: style.color
    if (TextDecoration.Underline in lines) add(0, text.length, false, DecorationStyle.SOLID, style.color, style.fontSize, null)
    for (m in marks) {
        val start = m.start.coerceIn(0, text.length)
        val end = m.end.coerceIn(start, text.length)
        if (start >= end) continue
        val em = markFontSize(block, style, start)
        when (m.type) {
            RichMarkType.UNDERLINE -> add(start, end, false, decorationStyleOf(m.value), richColorOf(m.color, dark) ?: colorAt(start), em, null)
            RichMarkType.LINK -> add(start, end, false, DecorationStyle.SOLID, richLinkColor(dark), em, null)
            RichMarkType.STRIKE -> {
                val family = richFamilyOf(marks.filter { it.start <= start && it.end > start }) ?: style.fontFamily
                add(start, end, true, DecorationStyle.SOLID, colorAt(start), em, family)
            }
            else -> Unit
        }
    }
    if (TextDecoration.LineThrough in lines) add(0, text.length, true, DecorationStyle.SOLID, style.color, style.fontSize, style.fontFamily)
    return found
}

/** The ascent of [family]'s font, in em (its metrics scale with the size). */
private fun ascentOf(fonts: FontFamily.Resolver, family: FontFamily?): Float {
    val paint = Paint()
    paint.typeface = fonts.resolveAsTypeface(family).value
    paint.textSize = 100f
    return -paint.fontMetrics.ascent / paint.textSize
}

/**
 * What a span cannot carry, painted from the text layout behind the text:
 * inline code chips (padding, 1px `--border-light` border, radius:
 * 1.92/5.6 and 5.6 in the view, 1.15/4.6 and 3 in the editor), highlights
 * (the editor's `mark` adds 2px each side and a 2px radius), then the
 * underlines of [lines]. Boxes follow CSS inline boxes: the font's ascent
 * and descent around the baseline, not the whole line.
 */
private fun DrawScope.drawRichDecorations(
    layout: PaddedLayout,
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    surface: RichSurface,
    lines: List<RichLine>,
) {
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
                val padY = (if (editor) 1.152f else 1.92f).dp.toPx() + 1.dp.toPx()
                // Its padding's own room in the line, on either side.
                val box = layout.padded.box(start, end)
                drawInlineBox(
                    layout.laidOut, box.start, box.end,
                    above = 0.93f * em + padY,
                    below = 0.24f * em + padY,
                    padX = 0f,
                    radius = (if (editor) 3f else 5.6f).dp.toPx(),
                    fill = if (editor && dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f),
                    border = if (dark) DarkBorderColor else LightBorderColor,
                )
            }
            RichMarkType.HIGHLIGHT -> {
                val color = if (mark.value == null) PlainMarkBackground else richColorOf(mark.value, dark) ?: continue
                val em = markFontSize(block, style, start).toPx()
                // The editor's 2px padding has its own room in the line.
                val box = layout.padded.box(start, end)
                drawInlineBox(
                    layout.laidOut, box.start, box.end,
                    above = 0.93f * em,
                    below = 0.24f * em,
                    padX = 0f,
                    radius = if (editor) 2.dp.toPx() else 0f,
                    fill = color,
                    border = null,
                )
            }
            else -> Unit
        }
    }
    drawRichLines(layout, lines, through = false)
}

/** The underlines of [lines], or, [through], their line-throughs, which
 *  go over the text; over the spaces a line wraps on too, which `pre-wrap`
 *  text hangs there. */
private fun DrawScope.drawRichLines(layout: PaddedLayout, lines: List<RichLine>, through: Boolean) {
    for (line in lines) {
        if (line.through != through) continue
        val em = line.em.toPx()
        val laid = layout.padded.range(line.start, line.end)
        forEachLinePart(layout.laidOut, laid.start, laid.end, withTrailingSpaces = true) { from, to, left, right, baseline ->
            if (through) {
                drawLineThrough(left, right, baseline, em, line.ascent * em, line.color)
            } else {
                drawUnderline(line.style, left, right, baseline, em, line.color) { top, bottom -> layout.ink.across(from, to, top, bottom) }
            }
        }
    }
}

/**
 * A CSS inline box's background, and [border], behind `[start, end)`:
 * [above] and [below] each line's baseline, [padX] wide sides, [radius]
 * corners. Broken across lines the way the web breaks it
 * (`box-decoration-break: slice`): each line's part is the box the text
 * would have unbroken, cut there, so a side where it wraps has neither
 * padding, corners nor border, and takes in the spaces it wraps on.
 */
private fun DrawScope.drawInlineBox(
    layout: TextLayoutResult,
    start: Int,
    end: Int,
    above: Float,
    below: Float,
    padX: Float,
    radius: Float,
    fill: Color,
    border: Color?,
) {
    val stroke = 1.dp.toPx()
    val ltr = layout.getParagraphDirection(start) == ResolvedTextDirection.Ltr
    forEachLinePart(layout, start, end, withTrailingSpaces = true) { from, to, left, right, baseline ->
        val opens = from == start
        val closes = to == end
        val leftEnd = if (ltr) opens else closes
        val rightEnd = if (ltr) closes else opens
        val part = Rect(
            left - if (leftEnd) padX else 0f,
            baseline - above,
            right + if (rightEnd) padX else 0f,
            baseline + below,
        )
        val cut = radius + stroke
        val box = Rect(
            if (leftEnd) part.left else part.left - cut,
            part.top,
            if (rightEnd) part.right else part.right + cut,
            part.bottom,
        )
        clipRect(part.left, part.top, part.right, part.bottom) {
            drawRoundRect(fill, box.topLeft, box.size, CornerRadius(radius))
            if (border != null) {
                drawRoundRect(
                    border,
                    Offset(box.left + stroke / 2f, box.top + stroke / 2f),
                    Size(box.width - stroke, box.height - stroke),
                    CornerRadius(radius - stroke / 2f),
                    style = Stroke(stroke),
                )
            }
        }
    }
}

/** Calls [draw] with the left edge, right edge and baseline of every line
 *  the text range `[start, end)` covers. */
internal inline fun forEachLineSegment(layout: TextLayoutResult, start: Int, end: Int, draw: (Float, Float, Float) -> Unit) =
    forEachLinePart(layout, start, end, withTrailingSpaces = false) { _, _, left, right, baseline -> draw(left, right, baseline) }

/**
 * Calls [draw] for every line the text range `[start, end)` covers, with
 * its part on that line: its range, its left and right edges, and the
 * line's baseline. With [withTrailingSpaces], a part the line wraps after
 * takes in the spaces it wraps on.
 */
internal inline fun forEachLinePart(
    layout: TextLayoutResult,
    start: Int,
    end: Int,
    withTrailingSpaces: Boolean,
    draw: (from: Int, to: Int, left: Float, right: Float, baseline: Float) -> Unit,
) {
    val text = layout.layoutInput.text
    for (line in layout.getLineForOffset(start)..layout.getLineForOffset(end - 1)) {
        val lineEnd = layout.getLineEnd(line)
        val wraps = line < layout.lineCount - 1 && text[lineEnd - 1] != '\n'
        val from = maxOf(start, layout.getLineStart(line))
        val to = minOf(end, if (withTrailingSpaces && wraps) lineEnd else layout.getLineEnd(line, visibleEnd = true))
        if (from >= to) continue
        val begin = layout.getHorizontalPosition(from, usePrimaryDirection = true)
        val finish = if (wraps && to == lineEnd) layout.wrapEdge(line) else layout.getHorizontalPosition(to, usePrimaryDirection = true)
        draw(from, to, minOf(begin, finish), maxOf(begin, finish), layout.getLineBaseline(line))
    }
}

/**
 * Where [line], which wraps, ends: its end offset belongs to the next line,
 * and a horizontal position there is that line's start. The spaces it
 * wraps on hang past its text (a line's width counts them, its right edge
 * does not).
 */
internal fun TextLayoutResult.wrapEdge(line: Int): Float {
    val left = getLineLeft(line)
    val right = getLineRight(line)
    val hanging = multiParagraph.getLineWidth(line) - (right - left)
    return if (getParagraphDirection(getLineStart(line)) == ResolvedTextDirection.Ltr) right + hanging else left - hanging
}

/** The font size at [offset], a size mark included. */
private fun markFontSize(block: RichBlock, style: TextStyle, offset: Int): TextUnit =
    block.marks.firstOrNull { it.type == RichMarkType.FONT_SIZE && it.start <= offset && it.end > offset }
        ?.let { richFontSizeOf(it.value)?.sp } ?: style.fontSize

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
