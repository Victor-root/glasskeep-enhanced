package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.toSize
import com.glasskeep.app.nativeapp.data.PendingMark
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichClipboard
import com.glasskeep.app.nativeapp.data.RichCommand
import com.glasskeep.app.nativeapp.data.RichCommands
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichEdits
import com.glasskeep.app.nativeapp.data.RichEditing
import com.glasskeep.app.nativeapp.data.RichFlat
import com.glasskeep.app.nativeapp.data.RichImeSession
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.RichPaste
import com.glasskeep.app.nativeapp.data.RichSelection
import com.glasskeep.app.nativeapp.data.RichSpan
import com.glasskeep.app.nativeapp.data.RichTyping
import com.glasskeep.app.nativeapp.data.hasText
import com.glasskeep.app.nativeapp.data.isTextStyle
import com.glasskeep.app.nativeapp.data.resolve

/**
 * The rich editor's state: the document as the editor last edited it, its
 * selection over the whole document, the keyboard's composition and the
 * marks armed for what is typed next ([RichEditing]). Hoisted because on a
 * phone the web puts the formatting bar in a bottom sheet apart from the
 * text (NoteModal.jsx:927-948), and both work on the same selection.
 *
 * Like ProseMirror's own selection it outlives the editor's focus: opening
 * the sheet blurs nothing, and the bar knows the range it works on, the
 * first block's start until the user taps anywhere.
 */
@Stable
class RichEditorState {
    var editing by mutableStateOf<RichEditing?>(null)
        private set

    /** Whether the text has the focus. */
    var focused by mutableStateOf(false)
        internal set

    /** The inline code whose copy chip shows, the code block whose copy
     *  button shows and the link whose Open/Edit popover shows (EditExtras,
     *  with the read-mode preference off). */
    internal var armedCode by mutableStateOf<Pair<String, RichMark>?>(null)
    internal var armedCodeBlock by mutableStateOf<String?>(null)
    internal var tappedLink by mutableStateOf<Pair<String, RichMark>?>(null)

    /** Whether the caret shows its handle: once a tap placed it, until
     *  something is typed. */
    internal var cursorHandle by mutableStateOf(false)

    internal val focusRequester = FocusRequester()
    internal val layouts = RichTextLayouts()
    internal var onBlocksChange: (List<RichBlock>) -> Unit = {}

    /** Set while the formatting sheet keeps the keyboard down. */
    internal var keyboardSuppressed = false

    /** The "plain" paste preference: a paste reads the clipboard's text only. */
    internal var plainPaste = false

    /** The keyboard connected to the editor, while one is. */
    internal var keyboard: RichKeyboard? = null

    /** The keyboard's session on the document. */
    internal val ime = RichImeSession(
        read = { requireNotNull(editing) },
        write = { commit(it) },
        settled = { inSync -> editing?.let { keyboard?.settled(it, inSync) } },
    )

    /**
     * The document the editor is handed. A change that did not come from
     * the editor itself (undo, a version from elsewhere, the trailing
     * paragraph added) replaces what it holds: the selection stays when its
     * blocks are still there, else falls back to where it was in the text,
     * and the keyboard is told.
     */
    internal fun sync(blocks: List<RichBlock>) {
        val current = editing
        if (current != null && current.blocks === blocks || blocks.isEmpty()) return
        val flat = RichFlat(blocks)
        val selection = when {
            current == null -> firstCaret(blocks)
            current.selection.resolve(blocks) != null -> current.selection
            else -> {
                val offset = current.flat.offsetOf(current.selection.head) ?: 0
                RichTyping.caretAt(flat, offset).let { RichSelection(it, it) }
            }
        }
        val textChanged = current == null || current.flat.text != flat.text
        editing = RichEditing(blocks, selection)
        keyboard?.documentReplaced(requireNotNull(editing), textChanged)
    }

    /** Keeps [next] as what the editor holds, telling the note when its
     *  blocks changed. */
    private fun commit(next: RichEditing) {
        val previous = editing
        editing = next
        if (previous?.blocks !== next.blocks) onBlocksChange(next.blocks)
    }

    /** An edit made in the editor but not by the keyboard (a tap, the bar,
     *  the clipboard): kept, and the keyboard told. */
    internal fun replace(next: RichEditing) {
        val textChanged = editing?.flat?.text != next.flat.text
        commit(next)
        keyboard?.documentReplaced(next, textChanged)
    }

    /** Moves the selection, as a tap or a handle does: the composition
     *  ends there, a moved selection disarms the pending marks. */
    fun select(selection: RichSelection) {
        val current = editing ?: return
        replace(RichTyping.withSelection(current.copy(composition = null), selection))
    }

    /** Puts the caret at [offset] of block [blockId]. */
    fun placeCaret(blockId: String, offset: Int) = select(RichSelection.caret(blockId, offset))

    /** Focuses the text, which brings the keyboard up unless the sheet
     *  keeps it down. */
    fun requestFocus() {
        runCatching { focusRequester.requestFocus() }
    }

    /** One of the bar's block commands, run as the web runs it
     *  ([RichCommands]). The text keeps the focus, every command of the
     *  web's bar starting with focus(). */
    fun blockCommand(command: RichCommand) {
        val current = editing ?: return
        RichCommands.run(current, command)?.let(::replace)
        requestFocus()
    }

    /** A mark command over the selected text: [change] gets the blocks and
     *  the selection in document order, and only the blocks change. The
     *  text keeps the focus. */
    fun markCommand(change: (List<RichBlock>, RichSpan) -> List<RichBlock>) {
        val current = editing ?: return
        val span = current.span ?: return
        replace(RichEditing(change(current.blocks, span), current.selection, pendingMarks = current.pendingMarks))
        requestFocus()
    }

    fun setPending(type: RichMarkType, value: String?, color: String? = null) = updatePending { pending ->
        pending.filterNot { it.type == type } + PendingMark(type, value, color)
    }

    fun clearPending(type: RichMarkType, activeAtCaret: Boolean) = updatePending { pending ->
        pending.filterNot { it.type == type } + if (activeAtCaret) listOf(PendingMark(type, remove = true)) else emptyList()
    }

    private fun updatePending(change: (List<PendingMark>) -> List<PendingMark>) {
        val current = editing ?: return
        editing = current.copy(pendingMarks = change(current.pendingMarks))
        requestFocus()
    }

    /** The marks a collapsed selection types into, none over a range. */
    private fun caretMarks(): List<RichMark> {
        val current = editing ?: return emptyList()
        val span = current.span?.takeIf { it.collapsed } ?: return emptyList()
        val block = current.blocks[span.start]
        return RichDoc.marksAtCaret(block.marks, block.text.length, span.startOffset)
    }

    /** The marks what is typed at a collapsed caret takes, those around it
     *  as the armed ones change them (ProseMirror's stored marks), none over
     *  a range. */
    private fun typingMarks(): List<PendingMark> {
        val current = editing ?: return emptyList()
        val span = current.span?.takeIf { it.collapsed } ?: return emptyList()
        return RichTyping.typingMarks(current.blocks[span.start], span.startOffset, current.pendingMarks)
    }

    /** The mark of [type] the selection shows (getAttributes): at a
     *  collapsed caret the one it types into, else the first one in the
     *  selected text. */
    internal fun markOf(type: RichMarkType): RichMark? {
        val current = editing ?: return null
        val span = current.span ?: return null
        if (span.collapsed) return caretMarks().firstOrNull { it.type == type }
        return RichEdits.markIn(current.blocks, span, type)
    }

    // At a collapsed caret, what is armed for the next keystroke wins over
    // the marks around it (ProseMirror's stored marks).
    internal fun pendingOf(type: RichMarkType): PendingMark? = editing?.pendingMarks?.firstOrNull { it.type == type }

    /** Whether [type]'s button reads active (isActive), for a mark whose
     *  value and colour [attrs] accepts. */
    internal fun isMarkActive(type: RichMarkType, attrs: (value: String?, color: String?) -> Boolean = { _, _ -> true }): Boolean {
        val current = editing ?: return false
        val span = current.span ?: return false
        if (!span.collapsed) return RichEdits.isMarkActive(current.blocks, span, type, attrs)
        return typingMarks().any { it.type == type && attrs(it.value, it.color) }
    }

    /** The value and colour of [type] the bar shows and starts from
     *  (getAttributes): what is armed at the caret first, else [markOf].
     *  A colour, font or size taken away there shows none, the textStyle
     *  armed lacking it; any other mark taken away shows the caret's own
     *  again, the web then reading the marks around the caret. */
    private fun attributesOf(type: RichMarkType): PendingMark? {
        pendingOf(type)?.let { armed -> if (!armed.remove) return armed else if (type.isTextStyle) return null }
        return markOf(type)?.let { PendingMark(it.type, it.value, it.color) }
    }

    /** [type]'s value where the selection is: its size, font, colour or
     *  underline style. */
    internal fun markValue(type: RichMarkType): String? = attributesOf(type)?.value

    internal fun underlineColor(): String? = attributesOf(RichMarkType.UNDERLINE)?.color

    /** A mark's button (toggleMark): off when it reads active, else on; at
     *  a caret, for what is typed next. */
    fun toggleMark(type: RichMarkType) {
        val span = editing?.span ?: return
        if (span.collapsed) {
            if (isMarkActive(type)) clearMark(type) else applyMark(type, null)
        } else {
            markCommand { b, s -> RichEdits.toggleMark(b, s, type) }
        }
    }

    /** setMark: [type] over the selection, or armed at a caret. Inline code
     *  takes no other mark (`excludes: "_"`): armed, it disarms all the
     *  others, and none is armed while it is. */
    fun applyMark(type: RichMarkType, value: String?, color: String? = null) {
        val span = editing?.span ?: return
        when {
            !span.collapsed -> markCommand { b, s -> RichEdits.setMark(b, s, type, value, color) }
            type == RichMarkType.CODE -> updatePending {
                caretMarks().filter { it.type != type }.map { PendingMark(it.type, remove = true) } + PendingMark(type)
            }
            typingMarks().any { it.type == RichMarkType.CODE } -> requestFocus()
            else -> setPending(type, value, color)
        }
    }

    fun clearMark(type: RichMarkType) {
        val span = editing?.span ?: return
        if (span.collapsed) {
            clearPending(type, activeAtCaret = caretMarks().any { it.type == type })
        } else {
            markCommand { b, s -> RichEdits.clearMark(b, s, type) }
        }
    }

    /** The underline button (toggleUnderline with the style shown, "simple"
     *  without one, and the colour shown): off when the selection has an
     *  underline of just that style and colour, else set to them. */
    fun toggleUnderline() {
        val style = markValue(RichMarkType.UNDERLINE) ?: "simple"
        val color = underlineColor()
        if (isMarkActive(RichMarkType.UNDERLINE) { value, c -> value == style && c == color }) {
            clearMark(RichMarkType.UNDERLINE)
        } else {
            applyMark(RichMarkType.UNDERLINE, style, color)
        }
    }

    /** stepFontSize(editor, ±1) (RichTextToolbar.jsx:306-315): walks the
     *  offered sizes from wherever the selection currently sits, the
     *  smallest and largest set again at either end. */
    fun stepFontSize(delta: Int) {
        val current = markValue(RichMarkType.FONT_SIZE) ?: RichDefaultFontSize
        val index = RichFontSizes.indexOf(current).takeIf { it >= 0 } ?: RichFontSizes.indexOf(RichDefaultFontSize)
        val next = RichFontSizes[(index + delta).coerceIn(0, RichFontSizes.lastIndex)]
        if (next == RichDefaultFontSize) clearMark(RichMarkType.FONT_SIZE) else applyMark(RichMarkType.FONT_SIZE, next)
    }

    /** What Copy writes for the selection, or null with nothing selected. */
    internal fun selectedClip(): RichClipboard.Clip? {
        val current = editing ?: return null
        val span = current.span?.takeUnless { it.collapsed } ?: return null
        return RichClipboard.copy(current.blocks, span)
    }

    /** Cut's deletion, once the text is copied. */
    internal fun deleteSelection() {
        val current = editing ?: return
        val span = current.span?.takeUnless { it.collapsed } ?: return
        val edit = RichEdits.deleteSelection(current.blocks, span)
        replace(RichEditing(edit.blocks, RichSelection.caret(requireNotNull(edit.focusId), edit.caret)))
    }

    /** A clipboard's [text] and [html] pasted over the selection, as plain
     *  text with [asPlainText] or the plain paste preference ([plainPaste]). */
    internal fun paste(text: String, html: String?, asPlainText: Boolean) {
        val current = editing ?: return
        RichPaste.paste(current, text, html, plainPaste, asPlainText)?.let(::replace)
    }

    /** A task item's checkbox ticked or unticked. */
    internal fun toggleChecked(id: String) {
        val current = editing ?: return
        replace(current.copy(blocks = current.blocks.map { if (it.id == id) it.copy(checked = !it.checked) else it }))
    }

    /** An arrow key: the caret a character on (over a line break to the
     *  next line), a selection collapsing to its end on that side, or with
     *  [extend] its moving end going on. */
    internal fun moveCaret(forward: Boolean, extend: Boolean) {
        val current = editing ?: return
        val flat = current.flat
        val span = current.span ?: return
        val head = flat.offsetOf(current.selection.head) ?: return
        val target = when {
            !extend && !span.collapsed -> if (forward) flat.offsetOf(span.end, span.endOffset) else flat.offsetOf(span.start, span.startOffset)
            else -> RichTyping.boundary(flat.text, head, forward)
        }
        val anchor = if (extend) flat.offsetOf(current.selection.anchor) ?: target else target
        replace(RichTyping.select(current.copy(composition = null), anchor, target))
    }

    internal fun selectAll() {
        val current = editing ?: return
        replace(RichTyping.select(current.copy(composition = null), 0, current.flat.text.length))
    }

    private fun firstCaret(blocks: List<RichBlock>): RichSelection =
        RichSelection.caret((blocks.firstOrNull { it.kind.hasText } ?: blocks.first()).id, 0)
}

@Composable
fun rememberRichEditorState(): RichEditorState = remember { RichEditorState() }

/** Each shown block's text layout and where it sits, for hit tests, the
 *  caret, the handles and the keyboard. [version] moves whenever one of
 *  them does, for what follows them (the handles). */
internal class RichTextLayouts {
    private val layouts = HashMap<String, TextLayoutResult>()
    private val coordinates = HashMap<String, LayoutCoordinates>()

    /** The editor's own frame, which every position here is relative to. */
    var root: LayoutCoordinates? = null

    var version by mutableIntStateOf(0)
        private set

    fun setLayout(id: String, layout: TextLayoutResult) {
        layouts[id] = layout
        version++
    }

    fun setCoordinates(id: String, placed: LayoutCoordinates) {
        coordinates[id] = placed
        version++
    }

    fun remove(id: String) {
        layouts.remove(id)
        coordinates.remove(id)
    }

    fun layout(id: String): TextLayoutResult? = layouts[id]

    /** Block [id]'s text layout, and its top-left corner in the editor. */
    fun placed(id: String): Pair<TextLayoutResult, Offset>? {
        val layout = layouts[id] ?: return null
        val frame = coordinates[id]?.takeIf { it.isAttached } ?: return null
        val editor = root?.takeIf { it.isAttached } ?: return null
        return layout to editor.localPositionOf(frame, Offset.Zero)
    }

    /** Whether [point] of the editor is on screen, not scrolled away. */
    fun isVisible(point: Offset): Boolean {
        val editor = root?.takeIf { it.isAttached } ?: return false
        return editor.boundsInWindow().inflate(1f).contains(editor.localToWindow(point))
    }

    /** The editor on screen: where all of it lies, and the part of it not
     *  scrolled away, in screen coordinates. */
    fun onScreen(): Pair<Rect, Rect>? {
        val editor = root?.takeIf { it.isAttached } ?: return null
        val origin = editor.localToScreen(Offset.Zero)
        return Rect(origin, editor.size.toSize()) to editor.boundsInWindow().translate(origin - editor.localToWindow(Offset.Zero))
    }
}
