package com.glasskeep.app.nativeapp.data.pm

/*
 * The commands behind the web editor's formatting bar, as Tiptap 3.22,
 * prosemirror-commands 1.7, prosemirror-schema-list 1.5 and the editor's
 * own extensions (SmartCodeBlock.js, Indent.js) run them. Each works on
 * the transaction of a chain (`editor.chain().focus()...run()`): the
 * commands of a chain share it, each seeing what the ones before it did,
 * and every one runs whatever the others returned.
 */

/** The node of a parent of the selection's start (findParentNode). */
private class ParentNode(val pos: Int, val start: Int, val depth: Int, val node: PmNode)

private fun findParentNode(selection: PmSelection, predicate: (PmNode) -> Boolean): ParentNode? {
    val rPos = selection.rFrom
    for (depth in rPos.depth downTo 1) {
        val node = rPos.node(depth)
        if (predicate(node)) return ParentNode(rPos.before(depth), rPos.start(depth), depth, node)
    }
    return null
}

private val PmNode.isList get() = type.isInGroup("list")

/** Tiptap's isNodeActive(): a node of [type] holds the caret, or covers
 *  the whole selection. */
internal fun isNodeActive(tr: PmTransaction, type: PmNodeType): Boolean {
    val selection = tr.selection
    val from = selection.from
    val to = selection.to
    var any = false
    var covered = 0
    tr.doc.nodesBetween(from, to, { node, pos, _, _ ->
        if (!node.isText && node.type === type) {
            any = true
            covered += minOf(to, pos + node.nodeSize) - maxOf(from, pos)
        }
        true
    })
    return if (selection.empty) any else covered >= to - from
}

/** Tiptap's clearNodes(): every textblock of the selection becomes the
 *  default one there, and each node of it moves up as far as it can. */
internal fun clearNodes(tr: PmTransaction): Boolean {
    val selection = tr.selection
    tr.doc.nodesBetween(selection.from, selection.to, { node, pos, _, _ ->
        if (node.type.isText) return@nodesBetween true
        val rFrom = tr.doc.resolve(tr.mapping.map(pos))
        val rTo = tr.doc.resolve(tr.mapping.map(pos + node.nodeSize))
        val range = rFrom.blockRange(rTo) ?: return@nodesBetween true
        val target = liftTarget(range)
        if (node.type.isTextblock) tr.setNodeMarkup(range.start, rFrom.parent.contentMatchAt(rFrom.index()).defaultType)
        if (target != null) tr.lift(range, target)
        true
    })
    return true
}

/** Tiptap's unsetAllMarks(): no mark left on the selected text. */
internal fun unsetAllMarks(tr: PmTransaction): Boolean {
    val selection = tr.selection
    if (!selection.empty) tr.removeMark(selection.from, selection.to)
    return true
}

/** prosemirror-commands' setBlockType(): the selected textblocks become
 *  [type] with [attrs], when one of them can; only checked unless
 *  [dispatch]. */
private fun setBlockTypeCommand(tr: PmTransaction, type: PmNodeType, attrs: PmAttrs?, dispatch: Boolean): Boolean {
    val selection = tr.selection
    val doc = tr.doc
    var applicable = false
    doc.nodesBetween(selection.from, selection.to, { node, pos, _, _ ->
        if (applicable) return@nodesBetween false
        if (!node.isTextblock || node.hasMarkup(type, attrs)) return@nodesBetween true
        applicable = if (node.type === type) {
            true
        } else {
            val rPos = doc.resolve(pos)
            val index = rPos.index()
            rPos.parent.canReplaceWith(index, index + 1, type)
        }
        true
    })
    if (!applicable) return false
    if (dispatch) tr.setBlockType(selection.from, selection.to, type, attrs)
    return true
}

/** Tiptap's setNode() (setParagraph, setHeading): the selected textblocks
 *  become [type], with the attributes of the one holding the whole
 *  selection and [attributes]; where none can, everything is first
 *  cleared (clearNodes). */
internal fun setNode(tr: PmTransaction, type: PmNodeType, attributes: PmAttrs = emptyMap()): Boolean {
    val selection = tr.selection
    val copied = if (selection.anchor.sameParent(selection.head)) selection.anchor.parent.attrs else emptyMap()
    val attrs = copied + attributes
    if (!setBlockTypeCommand(tr, type, attrs, dispatch = false)) clearNodes(tr)
    return setBlockTypeCommand(tr, type, attrs, dispatch = true)
}

// ---------- Lists ----------

/** prosemirror-schema-list's wrapRangeInList(): whether [range] can go
 *  into a list of [listType], wrapping it in [tr] when given. */
private fun wrapRangeInList(tr: PmTransaction?, range: PmNodeRange, listType: PmNodeType, attrs: PmAttrs?): Boolean {
    var inner = range
    var outer = range
    var doJoin = false
    val doc = range.from.doc
    if (range.depth >= 2 && range.from.node(range.depth - 1).type.compatibleContent(listType) && range.startIndex == 0) {
        if (range.from.index(range.depth - 1) == 0) return false
        val insert = doc.resolve(range.start - 2)
        outer = PmNodeRange(insert, insert, range.depth)
        if (range.endIndex < range.parent.childCount) inner = PmNodeRange(range.from, doc.resolve(range.to.end(range.depth)), range.depth)
        doJoin = true
    }
    val wrap = findWrapping(outer, listType, attrs, inner) ?: return false
    if (tr != null) doWrapInList(tr, inner, wrap, doJoin, listType)
    return true
}

private fun doWrapInList(tr: PmTransaction, range: PmNodeRange, wrappers: List<PmWrapper>, joinBefore: Boolean, listType: PmNodeType) {
    var content = PmFragment.Empty
    for (i in wrappers.indices.reversed()) content = PmFragment.from(wrappers[i].type.create(wrappers[i].attrs, content))
    val back = if (joinBefore) 2 else 0
    tr.step(PmReplaceAroundStep(range.start - back, range.end, range.start, range.end, PmSlice(content, 0, 0), wrappers.size))
    val found = wrappers.indexOfLast { it.type === listType } + 1
    val splitDepth = wrappers.size - found
    var splitPos = range.start + wrappers.size - back
    val parent = range.parent
    for (i in range.startIndex until range.endIndex) {
        if (i > range.startIndex && canSplit(tr.doc, splitPos, splitDepth)) {
            tr.split(splitPos, splitDepth)
            splitPos += 2 * splitDepth
        }
        splitPos += parent.child(i).nodeSize
    }
}

/** prosemirror-schema-list's wrapInList(); only checked unless
 *  [dispatch]. */
private fun wrapInList(tr: PmTransaction, listType: PmNodeType, dispatch: Boolean): Boolean {
    val selection = tr.selection
    val range = selection.rFrom.blockRange(selection.rTo) ?: return false
    return wrapRangeInList(if (dispatch) tr else null, range, listType, emptyMap())
}

/** prosemirror-schema-list's liftListItem(): the selected items of the
 *  innermost list move up a level, out of the list at the top. */
private fun liftListItem(tr: PmTransaction, itemType: PmNodeType): Boolean {
    val selection = tr.selection
    val range = selection.rFrom.blockRange(selection.rTo) { it.childCount > 0 && it.firstChild!!.type === itemType } ?: return false
    return if (selection.rFrom.node(range.depth - 1).type === itemType) {
        liftToOuterList(tr, itemType, range)
    } else {
        liftOutOfList(tr, range)
    }
}

private fun liftToOuterList(tr: PmTransaction, itemType: PmNodeType, itemRange: PmNodeRange): Boolean {
    var range = itemRange
    val end = range.end
    val endOfList = range.to.end(range.depth)
    if (end < endOfList) {
        tr.step(
            PmReplaceAroundStep(
                end - 1, endOfList, end, endOfList,
                PmSlice(PmFragment.from(itemType.create(null, PmFragment.from(range.parent.copy()))), 1, 0), 1,
            ),
        )
        range = PmNodeRange(tr.doc.resolve(range.from.pos), tr.doc.resolve(endOfList), range.depth)
    }
    val target = liftTarget(range) ?: return false
    tr.lift(range, target)
    val after = tr.doc.resolve(tr.mapping.map(end, -1) - 1)
    if (canJoin(tr.doc, after.pos) && after.nodeBefore?.type === after.nodeAfter?.type) tr.join(after.pos)
    return true
}

private fun liftOutOfList(tr: PmTransaction, range: PmNodeRange): Boolean {
    val list = range.parent
    var pos = range.end
    for (i in range.endIndex - 1 downTo range.startIndex + 1) {
        pos -= list.child(i).nodeSize
        tr.delete(pos - 1, pos + 1)
    }
    val start = tr.doc.resolve(range.start)
    val item = requireNotNull(start.nodeAfter)
    if (tr.mapping.map(range.end) != range.start + item.nodeSize) return false
    val atStart = range.startIndex == 0
    val atEnd = range.endIndex == list.childCount
    val parent = start.node(-1)
    val indexBefore = start.index(-1)
    val rest = if (atEnd) PmFragment.Empty else PmFragment.from(list)
    if (!parent.canReplace(indexBefore + (if (atStart) 0 else 1), indexBefore + 1, item.content.append(rest))) return false
    val from = start.pos
    val to = from + item.nodeSize
    val emptyList = PmFragment.from(list.copy(PmFragment.Empty))
    tr.step(
        PmReplaceAroundStep(
            from - (if (atStart) 1 else 0), to + (if (atEnd) 1 else 0), from + 1, to - 1,
            PmSlice((if (atStart) PmFragment.Empty else emptyList).append(if (atEnd) PmFragment.Empty else emptyList), if (atStart) 0 else 1, if (atEnd) 0 else 1),
            if (atStart) 0 else 1,
        ),
    )
    return true
}

/** prosemirror-schema-list's sinkListItem(): the selected items go into a
 *  list nested in the item before them, which the first item of a list has
 *  none of. */
internal fun sinkListItem(tr: PmTransaction, itemType: PmNodeType): Boolean {
    val selection = tr.selection
    val range = selection.rFrom.blockRange(selection.rTo) { it.childCount > 0 && it.firstChild!!.type === itemType } ?: return false
    val startIndex = range.startIndex
    if (startIndex == 0) return false
    val parent = range.parent
    val nodeBefore = parent.child(startIndex - 1)
    if (nodeBefore.type !== itemType) return false
    val nestedBefore = nodeBefore.lastChild?.type === parent.type
    val inner = if (nestedBefore) PmFragment.from(itemType.create()) else PmFragment.Empty
    val slice = PmSlice(PmFragment.from(itemType.create(null, PmFragment.from(parent.type.create(null, inner)))), if (nestedBefore) 3 else 1, 0)
    val before = range.start
    val after = range.end
    tr.step(PmReplaceAroundStep(before - (if (nestedBefore) 3 else 1), after, before, after, slice, 1))
    return true
}

/** Tiptap's joinListBackwards(): the list of [listType] holding the
 *  selection joins a list of its type right before it. */
private fun joinListBackwards(tr: PmTransaction, listType: PmNodeType) {
    val list = findParentNode(tr.selection) { it.type === listType } ?: return
    val rBefore = tr.doc.resolve(maxOf(0, list.pos - 1))
    // $pos.before(depth) is undefined below the position's own depth.
    if (list.depth > rBefore.depth + 1) return
    val before = rBefore.before(list.depth)
    if (tr.doc.nodeAt(before)?.type === list.node.type && canJoin(tr.doc, list.pos)) tr.join(list.pos)
}

/** Tiptap's joinListForwards(): a list of its type right after the list
 *  of [listType] holding the selection joins it. */
private fun joinListForwards(tr: PmTransaction, listType: PmNodeType) {
    val list = findParentNode(tr.selection) { it.type === listType } ?: return
    val after = tr.doc.resolve(list.start).after(list.depth)
    if (tr.doc.nodeAt(after)?.type === list.node.type && canJoin(tr.doc, after)) tr.join(after)
}

/**
 * Tiptap's toggleList() (toggleBulletList, toggleOrderedList,
 * toggleTaskList, keepMarks off): in a list of [listType] its selected
 * items move up out of it; in another kind of list whose items fit, that
 * list changes kind; anywhere else the selected blocks go into a new list,
 * cleared first (clearNodes) when they cannot, and it joins a list of its
 * kind right before or after it.
 */
internal fun toggleList(tr: PmTransaction, listType: PmNodeType, itemType: PmNodeType): Boolean {
    val selection = tr.selection
    val range = selection.rFrom.blockRange(selection.rTo) ?: return false
    val parentList = findParentNode(selection) { it.isList }
    val isAllSelection = selection.from == 0 && selection.to == tr.doc.content.size
    val sole = tr.doc.content.content.singleOrNull()
    val allSelectionList = if (isAllSelection && sole != null && sole.isList) ParentNode(0, 1, 0, sole) else null
    val currentList = parentList ?: allSelectionList
    val insideExistingList = parentList != null && range.depth >= 1 && range.depth - parentList.depth <= 1
    if ((insideExistingList || allSelectionList != null) && currentList != null) {
        if (currentList.node.type === listType) {
            if (isAllSelection && allSelectionList != null) {
                val list = tr.doc.firstChild
                if (list != null) tr.selection = PmTextSelection.between(tr.doc.resolve(1), tr.doc.resolve(list.nodeSize - 1))
            }
            return liftListItem(tr, itemType)
        }
        if (currentList.node.isList && listType.validContent(currentList.node.content)) {
            tr.setNodeMarkup(currentList.pos, listType)
            joinListBackwards(tr, listType)
            joinListForwards(tr, listType)
            return true
        }
    }
    if (!wrapInList(tr, listType, dispatch = false)) clearNodes(tr)
    val wrapped = wrapInList(tr, listType, dispatch = true)
    joinListBackwards(tr, listType)
    joinListForwards(tr, listType)
    return wrapped
}

// ---------- Quotes ----------

/** prosemirror-commands' lift() behind Tiptap's lift(): the selected
 *  blocks out of the node around them, when a [type] is active. */
private fun lift(tr: PmTransaction, type: PmNodeType): Boolean {
    if (!isNodeActive(tr, type)) return false
    val selection = tr.selection
    val range = selection.rFrom.blockRange(selection.rTo) ?: return false
    val target = liftTarget(range) ?: return false
    tr.lift(range, target)
    return true
}

/** prosemirror-commands' wrapIn(): the selected blocks into a [type]. */
private fun wrapIn(tr: PmTransaction, type: PmNodeType): Boolean {
    val selection = tr.selection
    val range = selection.rFrom.blockRange(selection.rTo) ?: return false
    val wrapping = findWrapping(range, type, emptyMap()) ?: return false
    tr.wrap(range, wrapping)
    return true
}

/** Tiptap's toggleWrap() (toggleBlockquote). */
internal fun toggleWrap(tr: PmTransaction, type: PmNodeType): Boolean = if (isNodeActive(tr, type)) lift(tr, type) else wrapIn(tr, type)

// ---------- Attributes ----------

/** Tiptap's updateAttributes() for a node type: at a caret the innermost
 *  [type] around it, over a range every [type] starting in it and the one
 *  it starts in, take [attributes]. */
private fun updateAttributes(tr: PmTransaction, type: PmNodeType, attributes: PmAttrs): Boolean {
    val selection = tr.selection
    val from = selection.from
    val to = selection.to
    var canUpdate = false
    var lastPos: Int? = null
    var lastNode: PmNode? = null
    tr.doc.nodesBetween(from, to, { node, pos, _, _ ->
        if (node.type === type) {
            if (selection.empty || pos < from) {
                canUpdate = true
                lastPos = pos
                lastNode = node
            }
            if (!selection.empty && pos in from..to) {
                canUpdate = true
                tr.setNodeMarkup(pos, null, node.attrs + attributes)
            }
        }
        true
    })
    val node = lastNode
    val pos = lastPos
    if (node != null && pos != null) tr.setNodeMarkup(pos, null, node.attrs + attributes)
    return canUpdate
}

/** TextAlign's setTextAlign(): the selected headings and paragraphs. */
internal fun setTextAlign(tr: PmTransaction, alignment: String): Boolean =
    listOf(PmSchema.heading, PmSchema.paragraph).map { updateAttributes(tr, it, mapOf("textAlign" to alignment)) }.any { it }

/** The node types Indent.js indents. */
private val IndentTypes = setOf(PmSchema.paragraph, PmSchema.heading, PmSchema.blockquote, PmSchema.codeBlock, PmSchema.listItem)

/** Indent.js indent() and outdent(): every node of the selection it
 *  handles moves [direction] step, within 0..8, but the paragraph of a
 *  list item, whose item moves instead. False when nothing moves. */
internal fun indent(tr: PmTransaction, direction: Int): Boolean {
    val selection = tr.selection
    var changed = false
    tr.doc.nodesBetween(selection.from, selection.to, { node, pos, parent, _ ->
        if (node.type !in IndentTypes || node.type === PmSchema.paragraph && parent?.type === PmSchema.listItem) return@nodesBetween true
        val current = (node.attrs["indent"] as? Number)?.toInt() ?: 0
        val next = (current + direction).coerceIn(0, 8)
        if (next != current) {
            tr.setNodeMarkup(pos, null, node.attrs + ("indent" to next))
            changed = true
        }
        true
    })
    return changed
}

// ---------- Marks ----------

/** setMark()'s work over `[from, to)`: each node there takes [type] with
 *  [attributes], over the attributes of the mark of that type it has. */
internal fun setMarkBetween(tr: PmTransform, from: Int, to: Int, type: PmMarkType, attributes: PmAttrs) {
    tr.doc.nodesBetween(from, to, { node, pos, _, _ ->
        val trimmedFrom = maxOf(pos, from)
        val trimmedTo = minOf(pos + node.nodeSize, to)
        val own = node.marks.filter { it.type === type }
        if (own.isEmpty()) {
            tr.addMark(trimmedFrom, trimmedTo, type.create(attributes))
        } else {
            for (mark in own) tr.addMark(trimmedFrom, trimmedTo, type.create(mark.attrs + attributes))
        }
        true
    })
}

/** Tiptap's setMark(): at a caret, [type] with [attributes] over the
 *  attributes of the one typing already takes (getMarkAttributes) joins
 *  the stored marks; over a range, [setMarkBetween]. */
internal fun setMark(tr: PmTransaction, type: PmMarkType, attributes: PmAttrs) {
    val selection = tr.selection
    if (selection.empty) {
        val current = (tr.storedMarks.orEmpty() + selection.head.marks()).firstOrNull { it.type === type }?.attrs.orEmpty()
        tr.addStoredMark(type.create(current + attributes))
    } else {
        setMarkBetween(tr, selection.from, selection.to, type, attributes)
    }
}

/** Tiptap's unsetMark(): no [type] left on the selection, nor in the
 *  stored marks. With [extendEmptyMarkRange], a caret takes it off the
 *  whole stretch of it around ([markRange]). */
internal fun unsetMark(tr: PmTransaction, type: PmMarkType, extendEmptyMarkRange: Boolean = false) {
    val selection = tr.selection
    val range = if (selection.empty && extendEmptyMarkRange) {
        markRange(selection.rFrom, type, selection.rFrom.marks().firstOrNull { it.type === type }?.attrs)
    } else {
        null
    }
    tr.removeMark(range?.first ?: selection.from, range?.second ?: selection.to, type)
    tr.removeStoredMark(type)
}

/** Tiptap's extendMarkRange(): the stretch of [type] at the selection's
 *  start ([markRange]) becomes the selection, when it holds all of it. */
internal fun extendMarkRange(tr: PmTransaction, type: PmMarkType) {
    val selection = tr.selection
    val (from, to) = markRange(selection.rFrom, type) ?: return
    if (from <= selection.from && to >= selection.to) tr.selection = PmTextSelection.create(tr.doc, from, to)
}

/** Tiptap's getMarkRange(): where the stretch of [type] at [pos] starts
 *  and ends in its parent, from the node after [pos] carrying one, else
 *  the node before it, on over its neighbours carrying one with
 *  [attributes] (that node's own when null). */
private fun markRange(pos: PmResolvedPos, type: PmMarkType, attributes: PmAttrs? = null): Pair<Int, Int>? {
    val parent = pos.parent
    fun carries(node: PmNode?) = node != null && node.marks.any { it.type === type }
    var start = parent.childAfter(pos.parentOffset)
    if (!carries(start.node)) start = parent.childBefore(pos.parentOffset)
    val node = start.node?.takeIf(::carries) ?: return null
    val attrs = attributes ?: node.marks.first { it.type === type }.attrs
    fun holds(child: PmNode) = child.marks.any { mark -> mark.type === type && attrs.all { (key, value) -> mark.attrs[key] == value } }
    if (!holds(node)) return null
    var startIndex = start.index
    var from = pos.start() + start.offset
    var endIndex = startIndex + 1
    var to = from + node.nodeSize
    while (startIndex > 0 && holds(parent.child(startIndex - 1))) {
        startIndex--
        from -= parent.child(startIndex).nodeSize
    }
    while (endIndex < parent.childCount && holds(parent.child(endIndex))) {
        to += parent.child(endIndex).nodeSize
        endIndex++
    }
    return from to to
}

/** TextStyle.js removeEmptyTextStyle(): every inline node of the selection
 *  loses its textStyle unless it has one with a value. */
internal fun removeEmptyTextStyle(tr: PmTransaction) {
    val selection = tr.selection
    tr.doc.nodesBetween(selection.from, selection.to, { node, pos, _, _ ->
        if (node.isInline && node.marks.none { it.type === PmSchema.textStyle && it.attrs.values.any(::truthy) }) {
            tr.removeMark(pos, pos + node.nodeSize, PmSchema.textStyle)
        }
        true
    })
}

/** JavaScript's truthiness, for an attribute's value. */
private fun truthy(value: Any?): Boolean = when (value) {
    null, false, "" -> false
    is Number -> value.toDouble().let { it != 0.0 && !it.isNaN() }
    else -> true
}

// ---------- Code blocks and rules ----------

/**
 * SmartCodeBlock.js smartToggleCodeBlock(): in a code block, it becomes a
 * paragraph again, its line breaks kept; a selection inside one textblock
 * is carved out into a code block of its own between what is before and
 * after it; otherwise every top-level block the selection touches becomes
 * one code block, one line per textblock. The caret lands at its end.
 */
internal fun smartToggleCodeBlock(tr: PmTransaction): Boolean {
    val selection = tr.selection
    val doc = tr.doc
    if (isNodeActive(tr, PmSchema.codeBlock)) {
        val rFrom = doc.resolve(selection.from)
        for (depth in rFrom.depth downTo 0) {
            val node = rFrom.node(depth)
            if (node.type !== PmSchema.codeBlock) continue
            val start = rFrom.start(depth) - 1
            val content = mutableListOf<PmNode>()
            node.textContent.split("\n").forEachIndexed { i, line ->
                if (i > 0) content += PmSchema.hardBreak.create()
                if (line.isNotEmpty()) content += PmSchema.text(line)
            }
            tr.replaceRangeWith(start, start + node.nodeSize, PmSchema.paragraph.create(null, PmFragment.fromArray(content)))
            return true
        }
        return false
    }
    val rFrom = doc.resolve(selection.from)
    val rTo = doc.resolve(selection.to)
    if (!selection.empty && rFrom.sameParent(rTo) && rFrom.parent.isTextblock) {
        val parent = rFrom.parent
        val blockStart = rFrom.before()
        val beforeText = doc.slice(rFrom.start(), selection.from).content
        val selectedText = doc.textBetween(selection.from, selection.to, "\n", "\n")
        val afterText = doc.slice(selection.to, rFrom.end()).content
        val replacement = buildList {
            if (beforeText.size > 0) add(parent.type.create(parent.attrs, beforeText))
            add(PmSchema.codeBlock.create(null, if (selectedText.isNotEmpty()) PmFragment.from(PmSchema.text(selectedText)) else null))
            if (afterText.size > 0) add(parent.type.create(parent.attrs, afterText))
        }
        tr.replaceWith(blockStart, rFrom.after(), PmFragment.fromArray(replacement))
        var caret = blockStart
        for (node in replacement) {
            if (node.type === PmSchema.codeBlock) {
                caret += node.nodeSize - 1
                break
            }
            caret += node.nodeSize
        }
        tr.selection = PmTextSelection.create(tr.doc, caret)
        return true
    }
    val blockFrom = rFrom.before(1)
    val blockTo = rTo.after(1)
    val lines = mutableListOf<String>()
    doc.nodesBetween(blockFrom, blockTo, { node, _, _, _ ->
        if (!node.isTextblock) return@nodesBetween true
        lines += node.textBetween(0, node.content.size, "\n", "\n")
        false
    })
    val joined = lines.joinToString("\n")
    val codeBlock = PmSchema.codeBlock.create(null, if (joined.isNotEmpty()) PmFragment.from(PmSchema.text(joined)) else null)
    tr.replaceRangeWith(blockFrom, blockTo, codeBlock)
    tr.selection = PmTextSelection.create(tr.doc, blockFrom + codeBlock.nodeSize - 1)
    return true
}

/**
 * HorizontalRule's setHorizontalRule(), through insertContent(): the rule
 * replaces the selection (an empty textblock whole, before a textblock
 * whose start it is at), then the caret goes to the textblock after it,
 * or the block after it is selected, or a new paragraph follows it when it
 * ends what holds it. The document (`block+`) always takes a rule, so
 * canInsertNode() never refuses.
 */
internal fun setHorizontalRule(tr: PmTransaction): Boolean {
    val selection = tr.selection
    var from = selection.from
    var to = selection.to
    if (from == to) {
        val parent = tr.doc.resolve(from).parent
        if (parent.isTextblock && !parent.type.code && parent.childCount == 0) {
            from -= 1
            to += 1
        }
    }
    val rFrom = tr.doc.resolve(from)
    val fromNode = rFrom.node()
    if (rFrom.parentOffset == 0 && (fromNode.isText || fromNode.isTextblock) && fromNode.content.size > 0) from = maxOf(0, from - 1)
    tr.replaceWith(from, to, PmFragment.from(PmSchema.horizontalRule.create()))
    selectionToInsertionEnd(tr, bias = -1)
    val rTo = tr.selection.rTo
    val after = rTo.nodeAfter
    when {
        after == null -> {
            val posAfter = rTo.end()
            tr.insert(posAfter, PmFragment.from(PmSchema.paragraph.create()))
            tr.selection = PmTextSelection.create(tr.doc, posAfter + 1)
        }
        after.isTextblock -> tr.selection = PmTextSelection.create(tr.doc, rTo.pos + 1)
        after.isBlock -> tr.selection = PmNodeSelection.create(tr.doc, rTo.pos)
        else -> tr.selection = PmTextSelection.create(tr.doc, rTo.pos)
    }
    return true
}

/** Tiptap's selectionToInsertionEnd() after the last step: the selection
 *  nearest the end of what it inserted. */
private fun selectionToInsertionEnd(tr: PmTransaction, bias: Int) {
    val step = tr.steps.lastOrNull() ?: return
    if (step !is PmReplaceStep && step !is PmReplaceAroundStep) return
    var end = 0
    step.getMap().forEach { _, _, _, newEnd -> if (end == 0) end = newEnd }
    tr.selection = PmSelection.near(tr.doc.resolve(end), bias)
}
