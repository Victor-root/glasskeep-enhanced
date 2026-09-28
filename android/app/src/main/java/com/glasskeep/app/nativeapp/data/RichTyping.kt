package com.glasskeep.app.nativeapp.data

import java.text.BreakIterator

/**
 * The editor while it is edited: the document, the selection, the
 * keyboard's composing range (the word it is still working on, in document
 * order), the marks armed for what is typed next, and the input rule
 * Backspace can still undo.
 */
data class RichEditing(
    val blocks: List<RichBlock>,
    val selection: RichSelection,
    val composition: RichSelection? = null,
    val pendingMarks: List<PendingMark> = emptyList(),
    val ruleUndo: RichRuleUndo? = null,
) {
    /** The document as the keyboard sees it. */
    val flat: RichFlat by lazy { RichFlat(blocks) }

    /** The selection in document order. */
    val span: RichSpan? get() = selection.resolve(blocks)
}

/** Tiptap's undoInputRule state: the input rule that left [blocks], the
 *  selection at [selection], turned [typed] (the document as typed) into
 *  them. It holds while the document and the selection stay as it left
 *  them. */
data class RichRuleUndo(val blocks: List<RichBlock>, val selection: RichSelection, val typed: RichEditing)

/**
 * What typing does to the document: the edits a keyboard asks for
 * (commitText, setComposingText, deleteSurroundingText, a key...), with the
 * meaning Android's text fields give them, and the structural edit the web
 * makes of a line break, of a deletion across two lines, of a selection
 * typed over. Offsets are the keyboard's, in [RichFlat.text].
 */
object RichTyping {

    /** The caret at [offset], moved off a divider onto the nearest line
     *  with text: a caret never rests on a rule. */
    fun caretAt(flat: RichFlat, offset: Int): RichPos {
        val (index, inBlock) = flat.locate(offset)
        val blocks = flat.blocks
        if (blocks[index].kind.hasText) return RichPos(blocks[index].id, inBlock)
        blocks.drop(index + 1).firstOrNull { it.kind.hasText }?.let { return RichPos(it.id, 0) }
        blocks.take(index).lastOrNull { it.kind.hasText }?.let { return RichPos(it.id, it.text.length) }
        return RichPos(blocks[index].id, 0)
    }

    /** The selection from [anchor] to [head] (setSelection). */
    fun select(state: RichEditing, anchor: Int, head: Int): RichEditing {
        val flat = state.flat
        val selection = if (anchor == head) {
            caretAt(flat, anchor).let { RichSelection(it, it) }
        } else {
            RichSelection(flat.posAt(anchor), flat.posAt(head))
        }
        return withSelection(state, selection)
    }

    /** [selection] in place of the current one. Moving it disarms the
     *  pending marks, as a selection change clears ProseMirror's stored
     *  marks. */
    fun withSelection(state: RichEditing, selection: RichSelection): RichEditing =
        if (selection == state.selection) state else state.copy(selection = selection, pendingMarks = emptyList())

    /** The keyboard's composing range becomes `[start, end)`
     *  (setComposingRegion); an empty one ends it. */
    fun compose(state: RichEditing, start: Int, end: Int): RichEditing {
        val flat = state.flat
        val a = start.coerceIn(0, flat.text.length)
        val b = end.coerceIn(0, flat.text.length)
        if (a == b) return state.copy(composition = null)
        return state.copy(composition = RichSelection(flat.posAt(minOf(a, b)), flat.posAt(maxOf(a, b))))
    }

    /**
     * [text] typed over the composition, or over the selection when there
     * is none (commitText, setComposingText). Inside one line it goes in
     * with the marks typing takes there: those around the caret (every mark
     * is inclusive), those of the first character typed over, the pending
     * ones. A line break is Enter; typed over lines, or holding line breaks,
     * the selection is first cleared and the lines become paragraphs.
     * [newCursorPosition] places the caret as the keyboard asks; with
     * [composing] the new text is the composition.
     */
    fun type(state: RichEditing, text: String, newCursorPosition: Int, composing: Boolean): RichEditing {
        val span = (state.composition ?: state.selection).resolve(state.blocks) ?: return state
        val block = state.blocks[span.start]
        if (span.collapsed && !block.kind.hasText) {
            val offset = state.flat.offsetOf(span.start, 0)
            val moved = select(state, offset, offset)
            return if (moved.selection == state.selection) state else type(moved, text, newCursorPosition, composing)
        }
        if (text == "\n" && span.collapsed) return enter(state)
        val code = block.kind == RichBlockKind.CODE_BLOCK
        if (span.start == span.end && (code || '\n' !in text)) return typeInBlock(state, span, text, newCursorPosition, composing)
        return when {
            text.isEmpty() -> applied(state, RichEdits.deleteSelection(state.blocks, span))
            text == "\n" -> applied(state, RichEdits.splitSelection(state.blocks, span))
            else -> insertAcross(state, span, text)
        }
    }

    /** Enter: over a selection it is deleted and the line split there; in a
     *  code block a line break, or out of it after two empty lines at its
     *  end (exitOnTripleEnter); elsewhere the input rule the break completes,
     *  or the split, what was being typed with carried on to the new line. */
    fun enter(state: RichEditing): RichEditing {
        if (state.composition != null) return enter(state.copy(composition = null))
        val span = state.span ?: return state
        if (!span.collapsed) return applied(state, RichEdits.splitSelection(state.blocks, span))
        val blocks = state.blocks
        val block = blocks[span.start]
        val at = span.startOffset
        if (block.kind == RichBlockKind.CODE_BLOCK) {
            if (at < block.text.length || !block.text.endsWith("\n\n")) return typeInBlock(state, span, "\n", 1, composing = false)
            val paragraph = RichDoc.newBlock().copy(nestLevel = block.nestLevel, quotes = block.quotes)
            val code = block.copy(text = block.text.dropLast(2))
            return RichEditing(blocks.replaceAt(span.start, listOf(code, paragraph)), RichSelection.caret(paragraph.id, 0))
        }
        RichInputRules.enter(blocks, block.id, at)?.let { return undoable(applied(state, it), typeInBlock(state, span, "\n", 1, composing = false)) }
        val split = applied(state, RichEdits.split(RichInputRules.linkBeforeBreak(blocks, block.id, at), block.id, at))
        return keepMarks(state, block, at, split)
    }

    /** Backspace: right after an input rule, the text as typed comes back
     *  ([undoRule]); otherwise a selection goes, at a line's start the line
     *  joins the one above ([RichEdits.joinBackward]), elsewhere the
     *  character before the caret goes, a whole emoji or accented letter at
     *  once. */
    fun backspace(state: RichEditing): RichEditing {
        undoRule(state)?.let { return it }
        val current = state.copy(composition = null)
        val span = current.span ?: return state
        if (!span.collapsed) return applied(current, RichEdits.deleteSelection(current.blocks, span))
        val block = current.blocks[span.start]
        if (span.startOffset == 0) return applied(current, RichEdits.joinBackward(current.blocks, block.id))
        val from = boundary(block.text, span.startOffset, forward = false)
        return deleteInBlock(current, span.start, from, span.startOffset)
    }

    /** Delete: a selection goes, at a line's end the next line joins this
     *  one, elsewhere the character after the caret goes. */
    fun deleteForward(state: RichEditing): RichEditing {
        val current = state.copy(composition = null)
        val span = current.span ?: return state
        if (!span.collapsed) return applied(current, RichEdits.deleteSelection(current.blocks, span))
        val block = current.blocks[span.start]
        if (span.startOffset == block.textLength) {
            val next = current.blocks.getOrNull(span.start + 1) ?: return state
            return applied(current, RichEdits.joinBackward(current.blocks, next.id))
        }
        val to = boundary(block.text, span.startOffset, forward = true)
        return deleteInBlock(current, span.start, span.startOffset, to)
    }

    /**
     * deleteSurroundingText: [before] characters before the selection and
     * [after] after it go, the selection itself staying. Exactly the line
     * break before or after a line joins the two lines, the one before as
     * Backspace does (an input rule just applied is undone instead); more
     * than one line is deleted as a selection would be.
     */
    fun deleteSurrounding(state: RichEditing, before: Int, after: Int): RichEditing {
        val (start, end) = flatRange(state, state.selection) ?: return state
        var next = state
        if (after > 0) next = deleteFlat(next, end, minOf(next.flat.text.length, end + after))
        if (before > 0) next = deleteFlat(next, maxOf(0, start - before), start, beforeCaret = true)
        return next
    }

    /** The input rules run on what was just typed before the caret
     *  ([inserted], empty when a composition just ended), or null when none
     *  applies. A mark rule leaves its mark disarmed for what follows. */
    fun inputRules(state: RichEditing, inserted: String): RichEditing? {
        val span = state.span?.takeIf { it.collapsed } ?: return null
        val block = state.blocks[span.start]
        val result = RichInputRules.typed(state.blocks, block.id, block.text, block.marks, span.startOffset, inserted) ?: return null
        val disarmed = result.disarm?.let { type -> state.pendingMarks.filterNot { it.type == type } + PendingMark(type, remove = true) }
        return undoable(applied(state, result.edit).copy(pendingMarks = disarmed.orEmpty()), state)
    }

    /**
     * undoInputRule, which Backspace tries first: right after an input
     * rule, the document and the selection as it left them, the text comes
     * back as typed ([RichRuleUndo]). The code block's own Backspace runs
     * before it on the web: an empty code block, or one opening the note,
     * is cleared instead.
     */
    fun undoRule(state: RichEditing): RichEditing? {
        val undo = state.ruleUndo ?: return null
        if (state.blocks !== undo.blocks || state.selection != undo.selection) return null
        val span = state.span?.takeIf { it.collapsed } ?: return null
        val block = state.blocks[span.start]
        val clearsCode = block.kind == RichBlockKind.CODE_BLOCK &&
            (block.text.isEmpty() || span.start == 0 && span.startOffset == 0 && block.quotes.isEmpty())
        return if (clearsCode) null else undo.typed
    }

    /** [ruled], what an input rule made of [typed], with the rule undoable. */
    private fun undoable(ruled: RichEditing, typed: RichEditing) =
        ruled.copy(ruleUndo = RichRuleUndo(ruled.blocks, ruled.selection, typed.copy(ruleUndo = null)))

    /** The selection's (or composition's) ends in the keyboard's text. */
    fun flatRange(state: RichEditing, selection: RichSelection): Pair<Int, Int>? {
        val a = state.flat.offsetOf(selection.anchor) ?: return null
        val b = state.flat.offsetOf(selection.head) ?: return null
        return minOf(a, b) to maxOf(a, b)
    }

    /** The marks the next character typed at [at] of [block] takes: those
     *  around the caret, as the pending ones change them. */
    fun typingMarks(block: RichBlock, at: Int, pending: List<PendingMark>): List<PendingMark> {
        val around = RichDoc.marksAtCaret(block.marks, block.text.length, at).map { PendingMark(it.type, it.value, it.color) }
        return around.filterNot { mark -> pending.any { it.type == mark.type } } + pending.filterNot { it.remove }
    }

    // ---------- Helpers ----------

    private fun typeInBlock(state: RichEditing, span: RichSpan, text: String, newCursorPosition: Int, composing: Boolean): RichEditing {
        val block = state.blocks[span.start]
        val from = span.startOffset
        val carried = if (from < span.endOffset) block.marks.filter { it.start <= from && it.end > from } else emptyList()
        val updated = styled(block, from, span.endOffset, text, carried, state.pendingMarks)
        val end = from + text.length
        val changed = text.isNotEmpty() || from < span.endOffset
        val edited = RichEditing(
            blocks = state.blocks.replaceAt(span.start, listOf(updated)),
            selection = RichSelection.caret(block.id, end),
            composition = if (composing && text.isNotEmpty()) RichSelection(RichPos(block.id, from), RichPos(block.id, end)) else null,
            pendingMarks = if (changed) emptyList() else state.pendingMarks,
        )
        if (newCursorPosition == 1) return edited
        val start = edited.flat.offsetOf(span.start, from)
        val cursor = if (newCursorPosition > 0) start + text.length + newCursorPosition - 1 else start + newCursorPosition
        return edited.copy(selection = caretAt(edited.flat, cursor).let { RichSelection(it, it) })
    }

    /** Typed over a selection across lines, or lines typed at once: the
     *  selection cleared, the text typed with the marks of the first
     *  character it replaces, a line break making a new paragraph. */
    private fun insertAcross(state: RichEditing, span: RichSpan, text: String): RichEditing {
        val first = state.blocks[span.start]
        val carried = if (first.kind.hasText && span.startOffset < first.text.length && !span.collapsed) {
            first.marks.filter { it.start <= span.startOffset && it.end > span.startOffset }
        } else {
            emptyList()
        }
        val cleared = if (span.collapsed) state.copy(composition = null) else applied(state, RichEdits.replaceSelection(state.blocks, span))
        val at = cleared.span ?: return state
        val block = cleared.blocks[at.start]
        if (!block.kind.hasText) return cleared
        val from = at.startOffset
        val updated = styled(block, from, from, text, carried, state.pendingMarks)
        val blocks = cleared.blocks.replaceAt(at.start, listOf(updated))
        if (block.kind == RichBlockKind.CODE_BLOCK || '\n' !in text) return RichEditing(blocks, RichSelection.caret(block.id, from + text.length))
        return applied(cleared, RichEdits.insertLines(blocks, block.id, updated.text, updated.marks, from, from + text.length))
    }

    /** [block] with [text] in place of `[from, to)`, marked as typing marks
     *  it: [carried] over it, then the [pending] marks. A code block's text
     *  takes no mark. */
    private fun styled(block: RichBlock, from: Int, to: Int, text: String, carried: List<RichMark>, pending: List<PendingMark>): RichBlock {
        val replaced = RichDoc.replaceText(block, from, to, text)
        if (text.isEmpty() || block.kind == RichBlockKind.CODE_BLOCK) return replaced
        val end = from + text.length
        var marks = replaced.marks
        for (m in carried) marks = RichDoc.setMark(marks, m.type, from, end, m.value, m.color)
        for (p in pending) {
            marks = if (p.remove) RichDoc.clearMark(marks, p.type, from, end) else RichDoc.setMark(marks, p.type, from, end, p.value, p.color)
        }
        return replaced.copy(marks = marks)
    }

    /** `[from, to)` of the keyboard's text deleted; [beforeCaret] when it
     *  is what Backspace would take. */
    private fun deleteFlat(state: RichEditing, from: Int, to: Int, beforeCaret: Boolean = false): RichEditing {
        if (from >= to) return state
        val span = state.flat.spanOf(from, to)
        if (span.start == span.end) return deleteInBlock(state, span.start, span.startOffset, span.endOffset)
        if (to - from == 1) {
            val undone = if (beforeCaret) undoRule(state) else null
            return undone ?: applied(state, RichEdits.joinBackward(state.blocks, state.blocks[span.end].id))
        }
        return applied(state, RichEdits.deleteSelection(state.blocks, span))
    }

    /** `[from, to)` of block [index]'s text deleted, the selection and the
     *  composition following the text they sit in. */
    private fun deleteInBlock(state: RichEditing, index: Int, from: Int, to: Int): RichEditing {
        val block = state.blocks[index]
        if (!block.kind.hasText || from >= to) return state
        fun shift(pos: RichPos): RichPos = when {
            pos.blockId != block.id || pos.offset <= from -> pos
            pos.offset >= to -> pos.copy(offset = pos.offset - (to - from))
            else -> pos.copy(offset = from)
        }
        val composition = state.composition?.let { RichSelection(shift(it.anchor), shift(it.head)) }?.takeUnless { it.collapsed }
        return RichEditing(
            blocks = state.blocks.replaceAt(index, listOf(RichDoc.replaceText(block, from, to, ""))),
            selection = RichSelection(shift(state.selection.anchor), shift(state.selection.head)),
            composition = composition,
        )
    }

    /** A structural edit's result: its blocks, the caret it leaves, no
     *  composition and nothing armed. */
    private fun applied(state: RichEditing, edit: RichEdit?): RichEditing {
        edit ?: return state
        val selection = edit.focusId?.let { RichSelection.caret(it, edit.caret) }
            ?: state.selection.takeIf { it.resolve(edit.blocks) != null }
            ?: RichSelection.caret(edit.blocks.first().id, 0)
        return RichEditing(edit.blocks, selection)
    }

    /** splitBlock's keepMarks (ensureMarks): after Enter, typing on the new
     *  line goes on with what was being typed with before it, the pending
     *  marks, or those around the caret unless it was at the line's start. */
    private fun keepMarks(before: RichEditing, block: RichBlock, at: Int, after: RichEditing): RichEditing {
        if (before.pendingMarks.isEmpty() && at == 0) return after
        val kept = typingMarks(block, at, before.pendingMarks)
        val span = after.span ?: return after
        val target = after.blocks[span.start]
        val natural = typingMarks(target, span.startOffset, emptyList())
        val pending = kept.filterNot { it in natural } +
            natural.filter { mark -> kept.none { it.type == mark.type } }.map { PendingMark(it.type, remove = true) }
        return after.copy(pendingMarks = pending)
    }

    /** The grapheme boundary before (or after) [offset] in [text]. */
    fun boundary(text: String, offset: Int, forward: Boolean): Int {
        val iterator = BreakIterator.getCharacterInstance()
        iterator.setText(text)
        val found = if (forward) iterator.following(offset) else iterator.preceding(offset)
        return if (found == BreakIterator.DONE) (if (forward) text.length else 0) else found
    }
}

/**
 * One keyboard's session on the document: its commands, batched as it
 * batches them, applied through [RichTyping] to the state [read] gives and
 * [write] keeps. Once the outermost batch is over the input rules run on
 * what it typed, the marks whose text went for good are dropped, and
 * [settled] learns whether the keyboard's own idea of the text still holds:
 * it does unless a line break or a deletion turned into something else than
 * what its commands asked for literally, or an input rule ran.
 */
class RichImeSession(
    private val read: () -> RichEditing,
    private val write: (RichEditing) -> Unit,
    private val settled: (keyboardInSync: Boolean) -> Unit,
) {
    /** A range of the keyboard's text, `[start, end)`. */
    private data class Range(val start: Int, val end: Int)

    private var depth = 0
    private var typed: Pair<RichPos, String>? = null
    private var compositionEnded = false
    private var diverged = false

    fun beginBatch() {
        depth++
    }

    fun endBatch() {
        if (depth == 0) return
        depth--
        if (depth == 0) finish()
    }

    fun commitText(text: String, newCursorPosition: Int) = batch {
        edit({ flat, selection, composition -> flat.replace(composition ?: selection, text) }) {
            RichTyping.type(it, text, newCursorPosition, composing = false)
        }
        val state = read()
        if (text.isNotEmpty() && state.composition == null && state.selection.collapsed) typed = state.selection.head to text
    }

    fun setComposingText(text: String, newCursorPosition: Int) = batch {
        edit({ flat, selection, composition -> flat.replace(composition ?: selection, text) }) {
            RichTyping.type(it, text, newCursorPosition, composing = true)
        }
    }

    fun setComposingRegion(start: Int, end: Int) = batch { edit(null) { RichTyping.compose(it, start, end) } }

    fun finishComposingText() = batch { edit(null) { it.copy(composition = null) } }

    fun setSelection(start: Int, end: Int) = batch { edit(null) { RichTyping.select(it, start, end) } }

    fun deleteSurroundingText(before: Int, after: Int) = batch {
        edit({ flat, selection, _ ->
            flat.removeRange(selection.end, minOf(flat.length, selection.end + after))
                .removeRange(maxOf(0, selection.start - before), selection.start)
        }) { RichTyping.deleteSurrounding(it, before, after) }
    }

    /** deleteSurroundingTextInCodePoints: the same, counted in code points. */
    fun deleteSurroundingTextInCodePoints(before: Int, after: Int) {
        val state = read()
        val (start, end) = RichTyping.flatRange(state, state.selection) ?: return
        val text = state.flat.text
        var from = start
        repeat(before) { if (from > 0) from = text.offsetByCodePoints(from, -1) }
        var to = end
        repeat(after) { if (to < text.length) to = text.offsetByCodePoints(to, 1) }
        deleteSurroundingText(start - from, to - end)
    }

    /** A Backspace key from the keyboard. */
    fun backspace() = batch {
        edit({ flat, selection, _ ->
            when {
                selection.start < selection.end -> flat.removeRange(selection.start, selection.end)
                selection.start == 0 -> flat
                else -> flat.removeRange(RichTyping.boundary(flat, selection.start, forward = false), selection.start)
            }
        }) { RichTyping.backspace(it) }
    }

    /** A Delete key. */
    fun deleteForward() = batch {
        edit({ flat, selection, _ ->
            when {
                selection.start < selection.end -> flat.removeRange(selection.start, selection.end)
                selection.end >= flat.length -> flat
                else -> flat.removeRange(selection.end, RichTyping.boundary(flat, selection.end, forward = true))
            }
        }) { RichTyping.deleteForward(it) }
    }

    /** An Enter key. */
    fun enter() = batch { edit({ flat, selection, _ -> flat.replace(selection, "\n") }) { RichTyping.enter(it) } }

    /** [block] run as one batch of its own, or as part of the open one. */
    private inline fun batch(block: () -> Unit) {
        beginBatch()
        block()
        endBatch()
    }

    /**
     * One command: [change] applied to the state, and, when [literal] says
     * what the keyboard expects its text to become (from the text, the
     * selection and the composition as it last knew them), a note when the
     * result is not that. A composition ending is remembered for the rules.
     */
    private fun edit(literal: ((String, Range, Range?) -> String)?, change: (RichEditing) -> RichEditing) {
        val before = read()
        val selection = RichTyping.flatRange(before, before.selection)?.let { Range(it.first, it.second) }
        val composition = before.composition?.let { RichTyping.flatRange(before, it) }?.let { Range(it.first, it.second) }
        val after = change(before)
        write(after)
        if (before.composition != null && after.composition == null) compositionEnded = true
        if (literal != null && selection != null && literal(before.flat.text, selection, composition) != after.flat.text) diverged = true
    }

    private fun finish() {
        var state = read()
        val span = state.span
        if (state.composition == null && span != null && span.collapsed) {
            val inserted = typed?.takeIf { it.first == state.selection.head }?.second ?: "".takeIf { compositionEnded }
            if (inserted != null) {
                RichTyping.inputRules(state, inserted)?.let {
                    state = it
                    diverged = true
                }
            }
        }
        val pruned = state.blocks.map { block ->
            val marks = RichDoc.pruneMarks(block.marks)
            if (marks === block.marks) block else block.copy(marks = marks)
        }
        if (pruned != state.blocks) {
            // Tidying the marks is part of the same edit: a rule's undo holds.
            val undo = state.ruleUndo?.takeIf { it.blocks === state.blocks }?.copy(blocks = pruned)
            state = state.copy(blocks = pruned, ruleUndo = undo)
        }
        write(state)
        val inSync = !diverged
        typed = null
        compositionEnded = false
        diverged = false
        settled(inSync)
    }

    private fun String.replace(range: Range, replacement: String): String =
        substring(0, range.start) + replacement + substring(range.end)
}
