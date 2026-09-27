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
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.text.TextLayoutResult
import com.glasskeep.app.nativeapp.data.PendingMark
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichClipboard
import com.glasskeep.app.nativeapp.data.RichEdit
import com.glasskeep.app.nativeapp.data.RichEdits
import com.glasskeep.app.nativeapp.data.RichEditing
import com.glasskeep.app.nativeapp.data.RichFlat
import com.glasskeep.app.nativeapp.data.RichImeSession
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.RichSelection
import com.glasskeep.app.nativeapp.data.RichSpan
import com.glasskeep.app.nativeapp.data.RichTyping
import com.glasskeep.app.nativeapp.data.hasText
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

    /**
     * One of the bar's commands applied to the selection: [change] gets
     * the blocks and the selection in document order, its result becomes
     * the document and the caret goes where it says. The text keeps the
     * focus, every command of the web's bar starting with focus().
     */
    fun command(change: (List<RichBlock>, RichSpan) -> RichEdit?) {
        val current = editing ?: return
        val span = current.span ?: return
        val edit = change(current.blocks, span) ?: return
        val selection = edit.focusId?.let { RichSelection.caret(it, edit.caret) }
            ?: current.selection.takeIf { it.resolve(edit.blocks) != null }
            ?: firstCaret(edit.blocks)
        replace(RichEditing(edit.blocks, selection, pendingMarks = if (selection == current.selection) current.pendingMarks else emptyList()))
        requestFocus()
    }

    /** A mark command over the selected text; its blocks only change. */
    fun markCommand(change: (List<RichBlock>, RichSpan) -> List<RichBlock>) = command { blocks, span -> RichEdit(change(blocks, span)) }

    /** Arms [type] for what is typed next, or takes it away when it is
     *  already on there ([activeAtCaret]). */
    fun togglePending(type: RichMarkType, activeAtCaret: Boolean) = updatePending { pending ->
        val current = pending.firstOrNull { it.type == type }
        pending.filterNot { it.type == type } + if (current != null) emptyList() else listOf(PendingMark(type, remove = activeAtCaret))
    }

    fun setPending(type: RichMarkType, value: String?, color: String? = null) = updatePending { pending ->
        pending.filterNot { it.type == type } + PendingMark(type, value, color)
    }

    fun clearPending(type: RichMarkType, activeAtCaret: Boolean) = updatePending { pending ->
        pending.filterNot { it.type == type } + if (activeAtCaret) listOf(PendingMark(type, remove = true)) else emptyList()
    }

    fun clearAllPending() = updatePending { emptyList() }

    private fun updatePending(change: (List<PendingMark>) -> List<PendingMark>) {
        val current = editing ?: return
        editing = current.copy(pendingMarks = change(current.pendingMarks))
        requestFocus()
    }

    /** The selection's text as Copy writes it, or null with nothing selected. */
    internal fun selectedText(): String? {
        val current = editing ?: return null
        val span = current.span?.takeUnless { it.collapsed } ?: return null
        return RichClipboard.plainText(current.blocks, span)
    }

    /** Cut's deletion, once the text is copied. */
    internal fun deleteSelection() {
        val current = editing ?: return
        val span = current.span?.takeUnless { it.collapsed } ?: return
        val edit = RichEdits.deleteSelection(current.blocks, span)
        replace(RichEditing(edit.blocks, RichSelection.caret(requireNotNull(edit.focusId), edit.caret)))
    }

    internal fun paste(text: String) {
        val current = editing ?: return
        replace(RichTyping.paste(current, text))
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
}
