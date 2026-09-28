package com.glasskeep.app.nativeapp.data.pm

/*
 * The selections of prosemirror-state 1.4 (selection.ts) and its
 * transaction's hold on one (transaction.ts), for the commands of the
 * formatting bar: a cursor or text range, a selected node, the whole
 * document.
 */

internal sealed class PmSelection(val anchor: PmResolvedPos, val head: PmResolvedPos) {
    val rFrom get() = if (anchor.pos <= head.pos) anchor else head
    val rTo get() = if (anchor.pos <= head.pos) head else anchor
    val from get() = rFrom.pos
    val to get() = rTo.pos
    val empty get() = from == to

    /** This selection once [mapping] took the document to [doc]. */
    abstract fun map(doc: PmNode, mapping: PmMapping): PmSelection

    companion object {
        /** A valid selection from [pos] on, backward when [dir] is negative:
         *  a cursor, or a leaf node unless [textOnly]. */
        fun findFrom(pos: PmResolvedPos, dir: Int, textOnly: Boolean = false): PmSelection? {
            val inner = if (pos.parent.inlineContent) {
                PmTextSelection(pos)
            } else {
                findSelectionIn(pos.doc, pos.parent, pos.pos, pos.index(), dir, textOnly)
            }
            if (inner != null) return inner
            for (depth in pos.depth - 1 downTo 0) {
                val found = if (dir < 0) {
                    findSelectionIn(pos.doc, pos.node(depth), pos.before(depth + 1), pos.index(depth), dir, textOnly)
                } else {
                    findSelectionIn(pos.doc, pos.node(depth), pos.after(depth + 1), pos.index(depth) + 1, dir, textOnly)
                }
                if (found != null) return found
            }
            return null
        }

        /** The valid selection nearest [pos], searched first on the side of
         *  [bias]. */
        fun near(pos: PmResolvedPos, bias: Int = 1): PmSelection =
            findFrom(pos, bias) ?: findFrom(pos, -bias) ?: PmAllSelection(pos.doc)
    }
}

/**
 * Selection.near() for a text position only: the native editor never
 * selects a node, so a rule the original would select is stepped over to
 * the nearest text on the same side, as findFrom()'s `textOnly` does.
 * Returns the position the caret goes to.
 */
internal fun pmTextNear(pos: PmResolvedPos, bias: Int): Int =
    (PmSelection.findFrom(pos, bias, textOnly = true) ?: PmSelection.findFrom(pos, -bias, textOnly = true))?.head?.pos ?: 0

private fun findSelectionIn(doc: PmNode, node: PmNode, pos: Int, index: Int, dir: Int, text: Boolean): PmSelection? {
    if (node.inlineContent) return PmTextSelection.create(doc, pos)
    var at = pos
    var i = index - if (dir > 0) 0 else 1
    while (if (dir > 0) i < node.childCount else i >= 0) {
        val child = node.child(i)
        if (!child.isAtom) {
            findSelectionIn(doc, child, at + dir, if (dir < 0) child.childCount else 0, dir, text)?.let { return it }
        } else if (!text && !child.isText) {
            return PmNodeSelection.create(doc, at - if (dir < 0) child.nodeSize else 0)
        }
        at += child.nodeSize * dir
        i += dir
    }
    return null
}

internal class PmTextSelection(anchor: PmResolvedPos, head: PmResolvedPos = anchor) : PmSelection(anchor, head) {
    override fun map(doc: PmNode, mapping: PmMapping): PmSelection {
        val head = doc.resolve(mapping.map(head.pos))
        if (!head.parent.inlineContent) return near(head)
        val anchor = doc.resolve(mapping.map(anchor.pos))
        return PmTextSelection(if (anchor.parent.inlineContent) anchor else head, head)
    }

    companion object {
        fun create(doc: PmNode, anchor: Int, head: Int = anchor): PmTextSelection {
            val rAnchor = doc.resolve(anchor)
            return PmTextSelection(rAnchor, if (head == anchor) rAnchor else doc.resolve(head))
        }

        /** A text selection from [anchor] to [head], or the text nearest
         *  them when they are not in text. */
        fun between(anchor: PmResolvedPos, head: PmResolvedPos, bias: Int? = null): PmSelection {
            val dPos = anchor.pos - head.pos
            val side = if (bias == null || dPos != 0) (if (dPos >= 0) 1 else -1) else bias
            var rHead = head
            if (!rHead.parent.inlineContent) {
                val found = findFrom(rHead, side, true) ?: findFrom(rHead, -side, true) ?: return near(rHead, side)
                rHead = found.head
            }
            var rAnchor = anchor
            if (!rAnchor.parent.inlineContent) {
                if (dPos == 0) {
                    rAnchor = rHead
                } else {
                    rAnchor = requireNotNull(findFrom(rAnchor, -side, true) ?: findFrom(rAnchor, side, true)).anchor
                    if ((rAnchor.pos < rHead.pos) != (dPos < 0)) rAnchor = rHead
                }
            }
            return PmTextSelection(rAnchor, rHead)
        }
    }
}

internal class PmNodeSelection(pos: PmResolvedPos) :
    PmSelection(pos, pos.doc.resolve(pos.pos + requireNotNull(pos.nodeAfter).nodeSize)) {
    override fun map(doc: PmNode, mapping: PmMapping): PmSelection {
        val (pos, deleted) = mapping.mapResult(anchor.pos)
        val rPos = doc.resolve(pos)
        return if (deleted) near(rPos) else PmNodeSelection(rPos)
    }

    companion object {
        fun create(doc: PmNode, from: Int) = PmNodeSelection(doc.resolve(from))
    }
}

internal class PmAllSelection(doc: PmNode) : PmSelection(doc.resolve(0), doc.resolve(doc.content.size)) {
    override fun map(doc: PmNode, mapping: PmMapping): PmSelection = PmAllSelection(doc)
}

/** A transform carrying a selection through its steps: [selection] follows
 *  them until a command sets another one. [storedMarks], the marks what
 *  is typed next takes when set, go with any step or selection set. */
internal class PmTransaction(doc: PmNode, selection: PmSelection, storedMarks: List<PmMark>? = null) : PmTransform(doc) {
    private var current = selection
    private var currentFor = 0

    /** Whether a command set the selection itself. */
    var selectionSet = false
        private set

    var storedMarks = storedMarks
        private set

    /** Whether a command changed [storedMarks] since the last step or
     *  selection set. */
    var storedMarksSet = false
        private set

    var selection: PmSelection
        get() {
            if (currentFor < steps.size) {
                current = current.map(doc, mapping.slice(currentFor))
                currentFor = steps.size
            }
            return current
        }
        set(value) {
            current = value
            currentFor = steps.size
            selectionSet = true
            storedMarks = null
            storedMarksSet = false
        }

    /** [mark] joins what is typed next takes. */
    fun addStoredMark(mark: PmMark) {
        storedMarks = mark.addToSet(storedMarks ?: selection.head.marks())
        storedMarksSet = true
    }

    /** No mark of [type] in what is typed next takes. */
    fun removeStoredMark(type: PmMarkType) {
        storedMarks = (storedMarks ?: selection.head.marks()).filterNot { it.type === type }
        storedMarksSet = true
    }

    override fun addStep(step: PmStep, doc: PmNode) {
        super.addStep(step, doc)
        storedMarks = null
        storedMarksSet = false
    }
}
