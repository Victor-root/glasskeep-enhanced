package com.glasskeep.app.nativeapp.data.pm

/*
 * The parts of prosemirror-transform 1.12 (map.ts, replace_step.ts,
 * mark_step.ts, mark.ts, replace.ts, structure.ts) that a paste and the
 * formatting bar's commands go through. No node of this schema is
 * isolating, so the original's isolating checks are left out, and no
 * mapping here is ever mirrored. The steps' `structure` guard, which only
 * refuses a step built wrongly, is left out too: every step here is built
 * by the original's own algorithms.
 */

/** How a step moves positions: `[start, oldSize, newSize]` triples, read
 *  the other way round when [inverted]. */
internal class PmStepMap(val ranges: IntArray, private val inverted: Boolean = false) {
    private val oldIndex = if (inverted) 2 else 1
    private val newIndex = if (inverted) 1 else 2

    fun map(pos: Int, assoc: Int = 1): Int = mapResult(pos, assoc).first

    /** Where [pos] goes, and whether the content on its [assoc] side was
     *  deleted (MapResult's pos and deleted). */
    fun mapResult(pos: Int, assoc: Int = 1): Pair<Int, Boolean> {
        var diff = 0
        var i = 0
        while (i < ranges.size) {
            val start = ranges[i] - if (inverted) diff else 0
            if (start > pos) break
            val oldSize = ranges[i + oldIndex]
            val newSize = ranges[i + newIndex]
            val end = start + oldSize
            if (pos <= end) {
                val side = if (oldSize == 0) assoc else if (pos == start) -1 else if (pos == end) 1 else assoc
                return start + diff + (if (side < 0) 0 else newSize) to (if (assoc < 0) pos != start else pos != end)
            }
            diff += newSize - oldSize
            i += 3
        }
        return pos + diff to false
    }

    fun forEach(f: (oldStart: Int, oldEnd: Int, newStart: Int, newEnd: Int) -> Unit) {
        var diff = 0
        var i = 0
        while (i < ranges.size) {
            val start = ranges[i]
            val oldStart = start - if (inverted) diff else 0
            val newStart = start + if (inverted) 0 else diff
            val oldSize = ranges[i + oldIndex]
            val newSize = ranges[i + newIndex]
            f(oldStart, oldStart + oldSize, newStart, newStart + newSize)
            diff += newSize - oldSize
            i += 3
        }
    }

    fun invert() = PmStepMap(ranges, !inverted)

    companion object {
        val Empty = PmStepMap(IntArray(0))
    }
}

internal class PmMapping(private val maps: List<PmStepMap>) {
    fun map(pos: Int, assoc: Int = 1): Int = maps.fold(pos) { p, map -> map.map(p, assoc) }

    fun mapResult(pos: Int, assoc: Int = 1): Pair<Int, Boolean> =
        maps.fold(pos to false) { (p, deleted), map -> map.mapResult(p, assoc).let { it.first to (deleted || it.second) } }

    /** The maps from [from] on. */
    fun slice(from: Int) = PmMapping(maps.subList(from, maps.size))

    fun invert() = PmMapping(maps.asReversed().map { it.invert() })
}

internal sealed class PmStep {
    /** The document with this step applied; throws [PmReplaceError] when it
     *  does not fit. */
    abstract fun apply(doc: PmNode): PmNode

    abstract fun getMap(): PmStepMap
}

internal class PmReplaceStep(val from: Int, val to: Int, val slice: PmSlice) : PmStep() {
    override fun apply(doc: PmNode) = doc.replace(from, to, slice)

    override fun getMap() = PmStepMap(intArrayOf(from, to - from, slice.size))
}

internal class PmReplaceAroundStep(
    val from: Int,
    val to: Int,
    val gapFrom: Int,
    val gapTo: Int,
    val slice: PmSlice,
    val insert: Int,
) : PmStep() {
    override fun apply(doc: PmNode): PmNode {
        val gap = doc.slice(gapFrom, gapTo)
        if (gap.openStart != 0 || gap.openEnd != 0) throw PmReplaceError("Gap is not a flat range")
        val inserted = slice.insertAt(insert, gap.content) ?: throw PmReplaceError("Content does not fit in gap")
        return doc.replace(from, to, inserted)
    }

    override fun getMap() = PmStepMap(intArrayOf(from, gapFrom - from, insert, gapTo, to - gapTo, slice.size - insert))
}

internal class PmAddMarkStep(val from: Int, val to: Int, val mark: PmMark) : PmStep() {
    override fun apply(doc: PmNode): PmNode {
        val oldSlice = doc.slice(from, to)
        val rFrom = doc.resolve(from)
        val parent = rFrom.node(rFrom.sharedDepth(to))
        val content = mapFragment(oldSlice.content, parent) { node, nodeParent ->
            if (!node.isAtom || !nodeParent.type.allowsMarkType(mark.type)) node else node.mark(mark.addToSet(node.marks))
        }
        return doc.replace(from, to, PmSlice(content, oldSlice.openStart, oldSlice.openEnd))
    }

    override fun getMap() = PmStepMap.Empty
}

internal class PmRemoveMarkStep(val from: Int, val to: Int, val mark: PmMark) : PmStep() {
    override fun apply(doc: PmNode): PmNode {
        val oldSlice = doc.slice(from, to)
        val content = mapFragment(oldSlice.content, doc) { node, _ -> node.mark(mark.removeFromSet(node.marks)) }
        return doc.replace(from, to, PmSlice(content, oldSlice.openStart, oldSlice.openEnd))
    }

    override fun getMap() = PmStepMap.Empty
}

private fun mapFragment(fragment: PmFragment, parent: PmNode, f: (PmNode, PmNode) -> PmNode): PmFragment {
    val mapped = mutableListOf<PmNode>()
    for (i in 0 until fragment.childCount) {
        var child = fragment.child(i)
        if (child.content.size > 0) child = child.copy(mapFragment(child.content, child, f))
        if (child.isInline) child = f(child, parent)
        mapped.add(child)
    }
    return PmFragment.fromArray(mapped)
}

/** transform.ts, for the steps a paste and the bar's commands make. */
internal open class PmTransform(var doc: PmNode) {
    val steps = mutableListOf<PmStep>()
    private val maps = mutableListOf<PmStepMap>()

    val mapping get() = PmMapping(maps.toList())

    fun step(step: PmStep): PmTransform {
        addStep(step, step.apply(doc))
        return this
    }

    protected open fun addStep(step: PmStep, doc: PmNode) {
        steps.add(step)
        maps.add(step.getMap())
        this.doc = doc
    }

    fun replace(from: Int, to: Int = from, slice: PmSlice = PmSlice.Empty): PmTransform {
        replaceStep(doc, from, to, slice)?.let { step(it) }
        return this
    }

    fun delete(from: Int, to: Int) = replace(from, to, PmSlice.Empty)

    /** mark.ts addMark() */
    fun addMark(from: Int, to: Int, mark: PmMark) {
        val removed = mutableListOf<PmRemoveMarkStep>()
        val added = mutableListOf<PmAddMarkStep>()
        var removing: PmRemoveMarkStep? = null
        var adding: PmAddMarkStep? = null
        doc.nodesBetween(from, to, { node, pos, parent, _ ->
            if (!node.isInline) return@nodesBetween true
            val marks = node.marks
            if (!mark.isInSet(marks) && parent!!.type.allowsMarkType(mark.type)) {
                val start = maxOf(pos, from)
                val end = minOf(pos + node.nodeSize, to)
                val newSet = mark.addToSet(marks)
                for (m in marks) {
                    if (!m.isInSet(newSet)) {
                        val current = removing
                        if (current != null && current.to == start && current.mark.eq(m)) {
                            removing = PmRemoveMarkStep(current.from, end, m).also { removed[removed.lastIndexOf(current)] = it }
                        } else {
                            removing = PmRemoveMarkStep(start, end, m).also { removed.add(it) }
                        }
                    }
                }
                val current = adding
                if (current != null && current.to == start) {
                    adding = PmAddMarkStep(current.from, end, mark).also { added[added.lastIndex] = it }
                } else {
                    adding = PmAddMarkStep(start, end, mark).also { added.add(it) }
                }
            }
            true
        })
        removed.forEach { step(it) }
        added.forEach { step(it) }
    }

    /** replace.ts replaceRange(): fits [slice] over `[from, to)`,
     *  preferring to replace whole defining nodes the selection covers. */
    fun replaceRange(from: Int, to: Int, slice: PmSlice): PmTransform {
        if (slice.size == 0) return deleteRange(from, to)
        val rFrom = doc.resolve(from)
        val rTo = doc.resolve(to)
        if (fitsTrivially(rFrom, rTo, slice)) return step(PmReplaceStep(from, to, slice))

        val targetDepths = coveredDepths(rFrom, rTo).toMutableList()
        if (targetDepths.lastOrNull() == 0) targetDepths.removeAt(targetDepths.lastIndex)
        var preferredTarget = -(rFrom.depth + 1)
        targetDepths.add(0, preferredTarget)
        var pos = rFrom.pos - 1
        for (d in rFrom.depth downTo 1) {
            if (rFrom.node(d).type.defining) break
            if (d in targetDepths) preferredTarget = d else if (rFrom.before(d) == pos) targetDepths.add(1, -d)
            pos--
        }
        val preferredTargetIndex = targetDepths.indexOf(preferredTarget)

        val leftNodes = mutableListOf<PmNode>()
        var preferredDepth = slice.openStart
        var content = slice.content
        var i = 0
        while (true) {
            val node = content.firstChild!!
            leftNodes.add(node)
            if (i == slice.openStart) break
            content = node.content
            i++
        }
        for (d in preferredDepth - 1 downTo 0) {
            val leftNode = leftNodes[d]
            val def = leftNode.type.defining
            if (def && !leftNode.sameMarkup(rFrom.node(Math.abs(preferredTarget) - 1))) {
                preferredDepth = d
            } else if (def || !leftNode.type.isTextblock) {
                break
            }
        }
        for (j in slice.openStart downTo 0) {
            val openDepth = (j + preferredDepth + 1) % (slice.openStart + 1)
            val insert = leftNodes.getOrNull(openDepth) ?: continue
            for (k in targetDepths.indices) {
                var targetDepth = targetDepths[(k + preferredTargetIndex) % targetDepths.size]
                var expand = true
                if (targetDepth < 0) {
                    expand = false
                    targetDepth = -targetDepth
                }
                val parent = rFrom.node(targetDepth - 1)
                val index = rFrom.index(targetDepth - 1)
                if (parent.canReplaceWith(index, index, insert.type, insert.marks)) {
                    return replace(
                        rFrom.before(targetDepth),
                        if (expand) rTo.after(targetDepth) else to,
                        PmSlice(closeFragment(slice.content, 0, slice.openStart, openDepth, null), openDepth, slice.openEnd),
                    )
                }
            }
        }
        val startSteps = steps.size
        var f = from
        var t = to
        for (k in targetDepths.indices.reversed()) {
            replace(f, t, slice)
            if (steps.size > startSteps) break
            val depth = targetDepths[k]
            if (depth < 0) continue
            f = rFrom.before(depth)
            t = rTo.after(depth)
        }
        return this
    }

    /** replaceRangeWith(): a lone block node is put next to a non-empty
     *  textblock rather than splitting it, where it can go. */
    fun replaceRangeWith(from: Int, to: Int, node: PmNode): PmTransform {
        var f = from
        var t = to
        if (!node.isInline && f == t && doc.resolve(f).parent.content.size > 0) {
            insertPoint(doc, f, node.type)?.let { f = it; t = it }
        }
        return replaceRange(f, t, PmSlice(PmFragment.from(node), 0, 0))
    }

    fun deleteRange(from: Int, to: Int): PmTransform {
        var f = from
        var t = to
        var rFrom = doc.resolve(f)
        var rTo = doc.resolve(t)
        if (rFrom.parent.isTextblock && rTo.parent.isTextblock && rFrom.start() != rTo.start() &&
            rFrom.parentOffset == 0 && rTo.parentOffset == 0
        ) {
            var d = rFrom.depth
            while (d > 0 && f == rFrom.start(d)) f = rFrom.before(d--)
            d = rTo.depth
            while (d > 0 && t == rTo.start(d)) t = rTo.before(d--)
            rFrom = doc.resolve(f)
            rTo = doc.resolve(t)
        }
        val covered = coveredDepths(rFrom, rTo)
        for ((i, depth) in covered.withIndex()) {
            val last = i == covered.lastIndex
            if ((last && depth == 0) || rFrom.node(depth).type.contentMatch.validEnd) return delete(rFrom.start(depth), rTo.end(depth))
            if (depth > 0 && (last || rFrom.node(depth - 1).canReplace(rFrom.index(depth - 1), rTo.indexAfter(depth - 1)))) {
                return delete(rFrom.before(depth), rTo.after(depth))
            }
        }
        var d = 1
        while (d <= rFrom.depth && d <= rTo.depth) {
            if (f - rFrom.start(d) == rFrom.depth - d && t > rFrom.end(d) && rTo.end(d) - t != rTo.depth - d &&
                rFrom.start(d - 1) == rTo.start(d - 1) && rFrom.node(d - 1).canReplace(rFrom.index(d - 1), rTo.index(d - 1))
            ) {
                return delete(rFrom.before(d), t)
            }
            d++
        }
        return delete(f, t)
    }

    fun replaceWith(from: Int, to: Int, content: PmFragment) = replace(from, to, PmSlice(content, 0, 0))

    fun insert(pos: Int, content: PmFragment) = replaceWith(pos, pos, content)

    /** mark.ts removeMark() with a mark type: every mark of [type] off the
     *  inline nodes of `[from, to)`. */
    fun removeMark(from: Int, to: Int, type: PmMarkType) = removeMarks(from, to) { marks -> marks.filter { it.type === type } }

    /** mark.ts removeMark(): [mark], or every mark when null, off the inline
     *  nodes of `[from, to)`, one step per mark and run of nodes. */
    fun removeMark(from: Int, to: Int, mark: PmMark? = null) =
        removeMarks(from, to) { marks -> if (mark == null) marks else listOfNotNull(mark.takeIf { it.isInSet(marks) }) }

    private fun removeMarks(from: Int, to: Int, removed: (List<PmMark>) -> List<PmMark>) {
        class Matched(val style: PmMark, val from: Int, var to: Int, var step: Int)
        val matched = mutableListOf<Matched>()
        var stepIndex = 0
        doc.nodesBetween(from, to, { node, pos, _, _ ->
            if (!node.isInline) return@nodesBetween true
            stepIndex++
            val toRemove = removed(node.marks)
            val end = minOf(pos + node.nodeSize, to)
            for (style in toRemove) {
                val found = matched.lastOrNull { it.step == stepIndex - 1 && style.eq(it.style) }
                if (found != null) {
                    found.to = end
                    found.step = stepIndex
                } else {
                    matched += Matched(style, maxOf(pos, from), end, stepIndex)
                }
            }
            true
        })
        matched.forEach { step(PmRemoveMarkStep(it.from, it.to, it.style)) }
    }

    /** structure.ts lift(): the content of [range] moves out of its parents
     *  up to depth [target], which are split around it. */
    fun lift(range: PmNodeRange, target: Int) {
        val rFrom = range.from
        val rTo = range.to
        val depth = range.depth
        val gapStart = rFrom.before(depth + 1)
        val gapEnd = rTo.after(depth + 1)
        var start = gapStart
        var end = gapEnd
        var before = PmFragment.Empty
        var openStart = 0
        var splitting = false
        for (d in depth downTo target + 1) {
            if (splitting || rFrom.index(d) > 0) {
                splitting = true
                before = PmFragment.from(rFrom.node(d).copy(before))
                openStart++
            } else {
                start--
            }
        }
        var after = PmFragment.Empty
        var openEnd = 0
        splitting = false
        for (d in depth downTo target + 1) {
            if (splitting || rTo.after(d + 1) < rTo.end(d)) {
                splitting = true
                after = PmFragment.from(rTo.node(d).copy(after))
                openEnd++
            } else {
                end++
            }
        }
        step(PmReplaceAroundStep(start, end, gapStart, gapEnd, PmSlice(before.append(after), openStart, openEnd), before.size - openStart))
    }

    /** structure.ts wrap(): [range] wrapped in [wrappers], outermost first. */
    fun wrap(range: PmNodeRange, wrappers: List<PmWrapper>) {
        var content = PmFragment.Empty
        for (i in wrappers.indices.reversed()) {
            if (content.size > 0) {
                val match = wrappers[i].type.contentMatch.matchFragment(content)
                if (match == null || !match.validEnd) {
                    throw PmReplaceError("Wrapper type given to Transform.wrap does not form valid content of its parent wrapper")
                }
            }
            content = PmFragment.from(wrappers[i].type.create(wrappers[i].attrs, content))
        }
        val start = range.start
        val end = range.end
        step(PmReplaceAroundStep(start, end, start, end, PmSlice(content, 0, 0), wrappers.size))
    }

    /** structure.ts setBlockType(): every textblock in `[from, to)` that
     *  can becomes a [type] with [attrs], what it holds made to fit (line
     *  breaks turning into newlines in code, and back). */
    fun setBlockType(from: Int, to: Int, type: PmNodeType, attrs: PmAttrs?) {
        check(type.isTextblock) { "Type given to setBlockType should be a textblock" }
        val mapFrom = steps.size
        doc.nodesBetween(from, to, { node, pos, _, _ ->
            if (!node.isTextblock || node.hasMarkup(type, attrs) || !canChangeType(doc, mapping.slice(mapFrom).map(pos), type)) {
                return@nodesBetween true
            }
            val pre = type.whitespace == "pre"
            val supportLinebreak = type.contentMatch.matchType(PmSchema.linebreakReplacement) != null
            val convertNewlines = when {
                pre && !supportLinebreak -> false
                !pre && supportLinebreak -> true
                else -> null
            }
            if (convertNewlines == false) replaceLinebreaks(node, pos, mapFrom)
            clearIncompatible(mapping.slice(mapFrom).map(pos, 1), type, clearNewlines = convertNewlines == null)
            val mapped = mapping.slice(mapFrom)
            val startM = mapped.map(pos, 1)
            val endM = mapped.map(pos + node.nodeSize, 1)
            step(PmReplaceAroundStep(startM, endM, startM + 1, endM - 1, PmSlice(PmFragment.from(type.create(attrs, null, node.marks)), 0, 0), 1))
            if (convertNewlines == true) replaceNewlines(node, pos, mapFrom)
            false
        })
    }

    private fun replaceNewlines(node: PmNode, pos: Int, mapFrom: Int) {
        node.forEach { child, offset ->
            if (child.isText) {
                for (newline in Newline.findAll(child.text!!)) {
                    val start = mapping.slice(mapFrom).map(pos + 1 + offset + newline.range.first)
                    replaceWith(start, start + 1, PmFragment.from(PmSchema.linebreakReplacement.create()))
                }
            }
        }
    }

    private fun replaceLinebreaks(node: PmNode, pos: Int, mapFrom: Int) {
        node.forEach { child, offset ->
            if (child.type === PmSchema.linebreakReplacement) {
                val start = mapping.slice(mapFrom).map(pos + 1 + offset)
                replaceWith(start, start + 1, PmFragment.from(PmSchema.text("\n")))
            }
        }
    }

    /** structure.ts clearIncompatible(): what the node at [pos] holds that a
     *  [parentType] cannot goes, and newlines become spaces outside code. */
    fun clearIncompatible(pos: Int, parentType: PmNodeType, match: PmContentMatch = parentType.contentMatch, clearNewlines: Boolean = true) {
        val node = requireNotNull(doc.nodeAt(pos))
        val replaced = mutableListOf<PmReplaceStep>()
        var cur = pos + 1
        var current = match
        for (i in 0 until node.childCount) {
            val child = node.child(i)
            val end = cur + child.nodeSize
            val allowed = current.matchType(child.type)
            if (allowed == null) {
                replaced += PmReplaceStep(cur, end, PmSlice.Empty)
            } else {
                current = allowed
                for (mark in child.marks) if (!parentType.allowsMarkType(mark.type)) step(PmRemoveMarkStep(cur, end, mark))
                if (clearNewlines && child.isText && parentType.whitespace != "pre") {
                    var slice: PmSlice? = null
                    for (newline in Newline.findAll(child.text!!)) {
                        val space = slice ?: PmSlice(PmFragment.from(PmSchema.text(" ", parentType.allowedMarks(child.marks))), 0, 0)
                        slice = space
                        replaced += PmReplaceStep(cur + newline.range.first, cur + newline.range.first + newline.value.length, space)
                    }
                }
            }
            cur = end
        }
        if (!current.validEnd) replace(cur, cur, PmSlice(requireNotNull(current.fillBefore(PmFragment.Empty, true)), 0, 0))
        for (i in replaced.indices.reversed()) step(replaced[i])
    }

    /** structure.ts setNodeMarkup(): the node at [pos] takes [type] (its own
     *  when null), [attrs] (the defaults when null) and [marks]. */
    fun setNodeMarkup(pos: Int, type: PmNodeType? = null, attrs: PmAttrs? = null, marks: List<PmMark>? = null) {
        val node = doc.nodeAt(pos) ?: throw PmReplaceError("No node at given position")
        val newType = type ?: node.type
        val newNode = newType.create(attrs, null, marks ?: node.marks)
        if (node.isLeaf) {
            replaceWith(pos, pos + node.nodeSize, PmFragment.from(newNode))
            return
        }
        if (!newType.validContent(node.content)) throw PmReplaceError("Invalid content for node type ${newType.name}")
        step(PmReplaceAroundStep(pos, pos + node.nodeSize, pos + 1, pos + node.nodeSize - 1, PmSlice(PmFragment.from(newNode), 0, 0), 1))
    }

    /** structure.ts split(): the nodes around [pos] split there, [depth]
     *  levels deep, the halves after it taking [typesAfter] where given. */
    fun split(pos: Int, depth: Int = 1, typesAfter: List<PmWrapper?>? = null) {
        val rPos = doc.resolve(pos)
        var before = PmFragment.Empty
        var after = PmFragment.Empty
        var d = rPos.depth
        var i = depth - 1
        while (d > rPos.depth - depth) {
            before = PmFragment.from(rPos.node(d).copy(before))
            val typeAfter = typesAfter?.getOrNull(i)
            after = PmFragment.from(typeAfter?.type?.create(typeAfter.attrs, after) ?: rPos.node(d).copy(after))
            d--
            i--
        }
        step(PmReplaceStep(pos, pos, PmSlice(before.append(after), depth, depth)))
    }

    /** structure.ts join(): the nodes on both sides of [pos] become one,
     *  [depth] levels deep. */
    fun join(pos: Int, depth: Int = 1) {
        val before = doc.resolve(pos - depth)
        val beforeType = before.node().type
        val convertNewlines = if (beforeType.inlineContent) {
            val pre = beforeType.whitespace == "pre"
            val supportLinebreak = beforeType.contentMatch.matchType(PmSchema.linebreakReplacement) != null
            when {
                pre && !supportLinebreak -> false
                !pre && supportLinebreak -> true
                else -> null
            }
        } else {
            null
        }
        val mapFrom = steps.size
        if (convertNewlines == false) {
            val after = doc.resolve(pos + depth)
            replaceLinebreaks(after.node(), after.before(), mapFrom)
        }
        if (beforeType.inlineContent) {
            clearIncompatible(pos + depth - 1, beforeType, before.node().contentMatchAt(before.index()), convertNewlines == null)
        }
        val mapped = mapping.slice(mapFrom)
        val start = mapped.map(pos - depth)
        step(PmReplaceStep(start, mapped.map(pos + depth, -1), PmSlice.Empty))
        if (convertNewlines == true) {
            val full = doc.resolve(start)
            replaceNewlines(full.node(), full.before(), steps.size)
        }
    }
}

private val Newline = Regex("\r?\n|\r")

/** A node type, and its attributes, that a wrapping or a split puts
 *  somewhere (findWrapping's and split's `{type, attrs}`). */
internal class PmWrapper(val type: PmNodeType, val attrs: PmAttrs? = null)

private fun canCut(node: PmNode, start: Int, end: Int) =
    (start == 0 || node.canReplace(start, node.childCount)) && (end == node.childCount || node.canReplace(0, end))

/** structure.ts liftTarget(): the depth [range]'s content can move up to,
 *  or null. */
internal fun liftTarget(range: PmNodeRange): Int? {
    val content = range.parent.content.cutByIndex(range.startIndex, range.endIndex)
    var depth = range.depth
    var contentBefore = 0
    var contentAfter = 0
    while (true) {
        val node = range.from.node(depth)
        val index = range.from.index(depth) + contentBefore
        val endIndex = range.to.indexAfter(depth) - contentAfter
        if (depth < range.depth && node.canReplace(index, endIndex, content)) return depth
        if (depth == 0 || !canCut(node, index, endIndex)) return null
        if (index > 0) contentBefore = 1
        if (endIndex < node.childCount) contentAfter = 1
        depth--
    }
}

/** structure.ts findWrapping(): the nodes to wrap [range] in for it to sit
 *  in a [type] (with [attrs]), outermost first, or null. */
internal fun findWrapping(range: PmNodeRange, type: PmNodeType, attrs: PmAttrs? = null, innerRange: PmNodeRange = range): List<PmWrapper>? {
    val around = findWrappingOutside(range, type) ?: return null
    val inner = findWrappingInside(innerRange, type) ?: return null
    return around.map { PmWrapper(it) } + PmWrapper(type, attrs) + inner.map { PmWrapper(it) }
}

private fun findWrappingOutside(range: PmNodeRange, type: PmNodeType): List<PmNodeType>? {
    val around = range.parent.contentMatchAt(range.startIndex).findWrapping(type) ?: return null
    return around.takeIf { range.parent.canReplaceWith(range.startIndex, range.endIndex, around.firstOrNull() ?: type) }
}

private fun findWrappingInside(range: PmNodeRange, type: PmNodeType): List<PmNodeType>? {
    val parent = range.parent
    val inside = type.contentMatch.findWrapping(parent.child(range.startIndex).type) ?: return null
    var innerMatch: PmContentMatch? = (inside.lastOrNull() ?: type).contentMatch
    var i = range.startIndex
    while (innerMatch != null && i < range.endIndex) innerMatch = innerMatch.matchType(parent.child(i++).type)
    return inside.takeIf { innerMatch?.validEnd == true }
}

internal fun canChangeType(doc: PmNode, pos: Int, type: PmNodeType): Boolean {
    val rPos = doc.resolve(pos)
    val index = rPos.index()
    return rPos.parent.canReplaceWith(index, index + 1, type)
}

/** structure.ts canSplit(). */
internal fun canSplit(doc: PmNode, pos: Int, depth: Int = 1, typesAfter: List<PmWrapper?>? = null): Boolean {
    val rPos = doc.resolve(pos)
    val base = rPos.depth - depth
    val innerType = typesAfter?.lastOrNull()?.type ?: rPos.parent.type
    if (base < 0 || !rPos.parent.canReplace(rPos.index(), rPos.parent.childCount) ||
        !innerType.validContent(rPos.parent.content.cutByIndex(rPos.index(), rPos.parent.childCount))
    ) {
        return false
    }
    var d = rPos.depth - 1
    var i = depth - 2
    while (d > base) {
        val node = rPos.node(d)
        val index = rPos.index(d)
        var rest = node.content.cutByIndex(index, node.childCount)
        typesAfter?.getOrNull(i + 1)?.let { rest = rest.replaceChild(0, it.type.create(it.attrs)) }
        val after = typesAfter?.getOrNull(i)?.type ?: node.type
        if (!node.canReplace(index + 1, node.childCount) || !after.validContent(rest)) return false
        d--
        i--
    }
    val index = rPos.indexAfter(base)
    return rPos.node(base).canReplaceWith(index, index, typesAfter?.getOrNull(0)?.type ?: rPos.node(base + 1).type)
}

/** structure.ts canJoin(): whether the nodes around [pos] can become one. */
internal fun canJoin(doc: PmNode, pos: Int): Boolean {
    val rPos = doc.resolve(pos)
    val index = rPos.index()
    return joinable(rPos.nodeBefore, rPos.nodeAfter) && rPos.parent.canReplace(index, index + 1)
}

internal fun joinable(a: PmNode?, b: PmNode?): Boolean {
    if (a == null || b == null || a.isLeaf) return false
    var match = a.contentMatchAt(a.childCount)
    for (i in 0 until b.childCount) {
        val child = b.child(i)
        match = match.matchType(if (child.type === PmSchema.linebreakReplacement) PmSchema.text else child.type) ?: return false
        if (!a.type.allowsMarks(child.marks)) return false
    }
    return match.validEnd
}

private fun replaceStep(doc: PmNode, from: Int, to: Int, slice: PmSlice): PmStep? {
    if (from == to && slice.size == 0) return null
    val rFrom = doc.resolve(from)
    val rTo = doc.resolve(to)
    if (fitsTrivially(rFrom, rTo, slice)) return PmReplaceStep(from, to, slice)
    return Fitter(rFrom, rTo, slice).fit()
}

private fun fitsTrivially(from: PmResolvedPos, to: PmResolvedPos, slice: PmSlice) =
    slice.openStart == 0 && slice.openEnd == 0 && from.start() == to.start() &&
        from.parent.canReplace(from.index(), to.index(), slice.content)

/** Places the elements of a slice into a gap; see the original's long
 *  comment above its Fitter class. */
private class Fitter(val from: PmResolvedPos, val to: PmResolvedPos, var unplaced: PmSlice) {
    class Frontier(val type: PmNodeType, var match: PmContentMatch)

    class Fittable(
        val sliceDepth: Int,
        val frontierDepth: Int,
        val parent: PmNode?,
        val inject: PmFragment? = null,
        val wrap: List<PmNodeType>? = null,
    )

    val frontier = mutableListOf<Frontier>()
    var placed: PmFragment = PmFragment.Empty

    init {
        for (i in 0..from.depth) {
            val node = from.node(i)
            frontier.add(Frontier(node.type, node.contentMatchAt(from.indexAfter(i))))
        }
        for (i in from.depth downTo 1) placed = PmFragment.from(from.node(i).copy(placed))
    }

    val depth get() = frontier.size - 1

    fun fit(): PmStep? {
        while (unplaced.size > 0) {
            val fit = findFittable()
            if (fit != null) placeNodes(fit) else if (!openMore()) dropNode()
        }
        val moveInline = mustMoveInline()
        val placedSize = placed.size - depth - from.depth
        val closedTo = close(if (moveInline < 0) to else from.doc.resolve(moveInline)) ?: return null
        var content = placed
        var openStart = from.depth
        var openEnd = closedTo.depth
        while (openStart > 0 && openEnd > 0 && content.childCount == 1) {
            content = content.firstChild!!.content
            openStart--
            openEnd--
        }
        val slice = PmSlice(content, openStart, openEnd)
        if (moveInline > -1) return PmReplaceAroundStep(from.pos, moveInline, to.pos, to.end(), slice, placedSize)
        if (slice.size > 0 || from.pos != to.pos) return PmReplaceStep(from.pos, closedTo.pos, slice)
        return null
    }

    fun findFittable(): Fittable? {
        val startDepth = unplaced.openStart
        for (pass in 1..2) {
            var sliceDepth = if (pass == 1) startDepth else unplaced.openStart
            while (sliceDepth >= 0) {
                val parent: PmNode?
                val fragment: PmFragment
                if (sliceDepth > 0) {
                    parent = contentAt(unplaced.content, sliceDepth - 1).firstChild
                    fragment = parent!!.content
                } else {
                    parent = null
                    fragment = unplaced.content
                }
                val first = fragment.firstChild
                for (frontierDepth in depth downTo 0) {
                    val (type, match) = frontier[frontierDepth].let { it.type to it.match }
                    if (pass == 1) {
                        var inject: PmFragment? = null
                        val fits = if (first != null) {
                            match.matchType(first.type) != null || match.fillBefore(PmFragment.from(first), false).also { inject = it } != null
                        } else {
                            parent != null && type.compatibleContent(parent.type)
                        }
                        if (fits) return Fittable(sliceDepth, frontierDepth, parent, inject = inject)
                    } else if (first != null) {
                        val wrap = match.findWrapping(first.type)
                        if (wrap != null) return Fittable(sliceDepth, frontierDepth, parent, wrap = wrap)
                    }
                    if (parent != null && match.matchType(parent.type) != null) break
                }
                sliceDepth--
            }
        }
        return null
    }

    fun openMore(): Boolean {
        val (content, openStart, openEnd) = Triple(unplaced.content, unplaced.openStart, unplaced.openEnd)
        val inner = contentAt(content, openStart)
        if (inner.childCount == 0 || inner.firstChild!!.isLeaf) return false
        unplaced = PmSlice(
            content,
            openStart + 1,
            maxOf(openEnd, if (inner.size + openStart >= content.size - openEnd) openStart + 1 else 0),
        )
        return true
    }

    fun dropNode() {
        val (content, openStart, openEnd) = Triple(unplaced.content, unplaced.openStart, unplaced.openEnd)
        val inner = contentAt(content, openStart)
        unplaced = if (inner.childCount <= 1 && openStart > 0) {
            val openAtEnd = content.size - openStart <= openStart + inner.size
            PmSlice(dropFromFragment(content, openStart - 1, 1), openStart - 1, if (openAtEnd) openStart - 1 else openEnd)
        } else {
            PmSlice(dropFromFragment(content, openStart, 1), openStart, openEnd)
        }
    }

    fun placeNodes(fit: Fittable) {
        while (depth > fit.frontierDepth) closeFrontierNode()
        fit.wrap?.forEach { openFrontierNode(it) }

        val slice = unplaced
        val fragment = fit.parent?.content ?: slice.content
        val openStart = slice.openStart - fit.sliceDepth
        var taken = 0
        val add = mutableListOf<PmNode>()
        var match = frontier[fit.frontierDepth].match
        val type = frontier[fit.frontierDepth].type
        fit.inject?.let { inject ->
            for (i in 0 until inject.childCount) add.add(inject.child(i))
            match = match.matchFragment(inject)!!
        }
        var openEndCount = (fragment.size + fit.sliceDepth) - (slice.content.size - slice.openEnd)
        while (taken < fragment.childCount) {
            val next = fragment.child(taken)
            val matches = match.matchType(next.type) ?: break
            taken++
            if (taken > 1 || openStart == 0 || next.content.size > 0) {
                match = matches
                add.add(
                    closeNodeStart(
                        next.mark(type.allowedMarks(next.marks)),
                        if (taken == 1) openStart else 0,
                        if (taken == fragment.childCount) openEndCount else -1,
                    ),
                )
            }
        }
        val toEnd = taken == fragment.childCount
        if (!toEnd) openEndCount = -1

        placed = addToFragment(placed, fit.frontierDepth, PmFragment.from(add))
        frontier[fit.frontierDepth].match = match

        if (toEnd && openEndCount < 0 && fit.parent != null && fit.parent.type === frontier[depth].type && frontier.size > 1) {
            closeFrontierNode()
        }

        var cur = fragment
        for (i in 0 until openEndCount) {
            val node = cur.lastChild!!
            frontier.add(Frontier(node.type, node.contentMatchAt(node.childCount)))
            cur = node.content
        }

        unplaced = when {
            !toEnd -> PmSlice(dropFromFragment(slice.content, fit.sliceDepth, taken), slice.openStart, slice.openEnd)
            fit.sliceDepth == 0 -> PmSlice.Empty
            else -> PmSlice(
                dropFromFragment(slice.content, fit.sliceDepth - 1, 1),
                fit.sliceDepth - 1,
                if (openEndCount < 0) slice.openEnd else fit.sliceDepth - 1,
            )
        }
    }

    fun mustMoveInline(): Int {
        if (!to.parent.isTextblock) return -1
        val top = frontier[depth]
        if (!top.type.isTextblock || contentAfterFits(to, to.depth, top.type, top.match, false) == null) return -1
        if (to.depth == depth) {
            val level = findCloseLevel(to)
            if (level != null && level.depth == depth) return -1
        }
        var d = to.depth
        var after = to.after(d)
        while (d > 1 && after == to.end(--d)) ++after
        return after
    }

    class CloseLevel(val depth: Int, val fit: PmFragment, val move: PmResolvedPos)

    fun findCloseLevel(to: PmResolvedPos): CloseLevel? {
        scan@ for (i in minOf(depth, to.depth) downTo 0) {
            val (match, type) = frontier[i].let { it.match to it.type }
            val dropInner = i < to.depth && to.end(i + 1) == to.pos + (to.depth - (i + 1))
            val fit = contentAfterFits(to, i, type, match, dropInner) ?: continue
            for (d in i - 1 downTo 0) {
                val outer = frontier[d]
                val matches = contentAfterFits(to, d, outer.type, outer.match, true)
                if (matches == null || matches.childCount > 0) continue@scan
            }
            return CloseLevel(i, fit, if (dropInner) to.doc.resolve(to.after(i + 1)) else to)
        }
        return null
    }

    fun close(target: PmResolvedPos): PmResolvedPos? {
        val close = findCloseLevel(target) ?: return null
        while (depth > close.depth) closeFrontierNode()
        if (close.fit.childCount > 0) placed = addToFragment(placed, close.depth, close.fit)
        val moved = close.move
        for (d in close.depth + 1..moved.depth) {
            val node = moved.node(d)
            val add = node.type.contentMatch.fillBefore(node.content, true, moved.index(d))!!
            openFrontierNode(node.type, node.attrs, add)
        }
        return moved
    }

    fun openFrontierNode(type: PmNodeType, attrs: PmAttrs? = null, content: PmFragment? = null) {
        val top = frontier[depth]
        top.match = top.match.matchType(type)!!
        placed = addToFragment(placed, depth, PmFragment.from(type.create(attrs, content)))
        frontier.add(Frontier(type, type.contentMatch))
    }

    fun closeFrontierNode() {
        val open = frontier.removeAt(frontier.lastIndex)
        val add = open.match.fillBefore(PmFragment.Empty, true)!!
        if (add.childCount > 0) placed = addToFragment(placed, frontier.size, add)
    }
}

private fun dropFromFragment(fragment: PmFragment, depth: Int, count: Int): PmFragment {
    if (depth == 0) return fragment.cutByIndex(count, fragment.childCount)
    return fragment.replaceChild(0, fragment.firstChild!!.copy(dropFromFragment(fragment.firstChild!!.content, depth - 1, count)))
}

private fun addToFragment(fragment: PmFragment, depth: Int, content: PmFragment): PmFragment {
    if (depth == 0) return fragment.append(content)
    return fragment.replaceChild(
        fragment.childCount - 1,
        fragment.lastChild!!.copy(addToFragment(fragment.lastChild!!.content, depth - 1, content)),
    )
}

private fun contentAt(fragment: PmFragment, depth: Int): PmFragment {
    var f = fragment
    repeat(depth) { f = f.firstChild!!.content }
    return f
}

private fun closeNodeStart(node: PmNode, openStart: Int, openEnd: Int): PmNode {
    if (openStart <= 0) return node
    var frag = node.content
    if (openStart > 1) {
        frag = frag.replaceChild(0, closeNodeStart(frag.firstChild!!, openStart - 1, if (frag.childCount == 1) openEnd - 1 else 0))
    }
    frag = node.type.contentMatch.fillBefore(frag)!!.append(frag)
    if (openEnd <= 0) frag = frag.append(node.type.contentMatch.matchFragment(frag)!!.fillBefore(PmFragment.Empty, true)!!)
    return node.copy(frag)
}

private fun contentAfterFits(to: PmResolvedPos, depth: Int, type: PmNodeType, match: PmContentMatch, open: Boolean): PmFragment? {
    val node = to.node(depth)
    val index = if (open) to.indexAfter(depth) else to.index(depth)
    if (index == node.childCount && !type.compatibleContent(node.type)) return null
    val fit = match.fillBefore(node.content, true, index) ?: return null
    return if (invalidMarks(type, node.content, index)) null else fit
}

private fun invalidMarks(type: PmNodeType, fragment: PmFragment, start: Int) =
    (start until fragment.childCount).any { !type.allowsMarks(fragment.child(it).marks) }

/** The depths at which `[from, to)` spans the whole content of the node. */
private fun coveredDepths(from: PmResolvedPos, to: PmResolvedPos): List<Int> {
    val result = mutableListOf<Int>()
    for (d in minOf(from.depth, to.depth) downTo 0) {
        val start = from.start(d)
        if (start < from.pos - (from.depth - d) || to.end(d) > to.pos + (to.depth - d)) break
        if (start == to.start(d) ||
            (d == from.depth && d == to.depth && from.parent.inlineContent && to.parent.inlineContent && d > 0 && to.start(d - 1) == start - 1)
        ) {
            result.add(d)
        }
    }
    return result
}

private fun closeFragment(fragment: PmFragment, depth: Int, oldOpen: Int, newOpen: Int, parent: PmNode?): PmFragment {
    var f = fragment
    if (depth < oldOpen) {
        val first = f.firstChild!!
        f = f.replaceChild(0, first.copy(closeFragment(first.content, depth + 1, oldOpen, newOpen, first)))
    }
    if (depth > newOpen) {
        val match = parent!!.contentMatchAt(0)
        val start = match.fillBefore(f)!!.append(f)
        f = start.append(match.matchFragment(start)!!.fillBefore(PmFragment.Empty, true)!!)
    }
    return f
}

private fun insertPoint(doc: PmNode, pos: Int, nodeType: PmNodeType): Int? {
    val rPos = doc.resolve(pos)
    if (rPos.parent.canReplaceWith(rPos.index(), rPos.index(), nodeType)) return pos
    if (rPos.parentOffset == 0) {
        for (d in rPos.depth - 1 downTo 0) {
            val index = rPos.index(d)
            if (rPos.node(d).canReplaceWith(index, index, nodeType)) return rPos.before(d + 1)
            if (index > 0) return null
        }
    }
    if (rPos.parentOffset == rPos.parent.content.size) {
        for (d in rPos.depth - 1 downTo 0) {
            val index = rPos.indexAfter(d)
            if (rPos.node(d).canReplaceWith(index, index, nodeType)) return rPos.after(d + 1)
            if (index < rPos.node(d).childCount) return null
        }
    }
    return null
}
