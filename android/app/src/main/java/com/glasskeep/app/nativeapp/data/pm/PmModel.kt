package com.glasskeep.app.nativeapp.data.pm

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

/*
 * The document model of prosemirror-model 1.25, the one the web editor
 * runs on, over that editor's own schema (richTextSchema.js as Tiptap
 * builds it). Copy and paste go through it so that what the web does to a
 * pasted slice (how it is parsed, opened, fitted around the selection) is
 * what happens here too, instead of a rewrite of those rules that could
 * only approximate them. Names and algorithms follow the original sources
 * (prosemirror-model/src) closely, so each part can be checked against them.
 */

/** Attribute values: a String, an Int, a Boolean or null. */
internal typealias PmAttrs = Map<String, Any?>

internal class PmNodeType(
    val name: String,
    val groups: List<String>,
    val defaultAttrs: PmAttrs,
    val inlineSpec: Boolean = false,
    val defining: Boolean = false,
    val code: Boolean = false,
) {
    lateinit var contentMatch: PmContentMatch
    var inlineContent = false
    /** null: every mark is allowed. */
    var markSet: List<PmMarkType>? = null

    val isBlock = !(inlineSpec || name == "text")
    val isText = name == "text"
    val whitespace = if (code) "pre" else "normal"
    val isInline get() = !isBlock
    val isTextblock get() = isBlock && inlineContent
    val isLeaf get() = contentMatch === PmContentMatch.Empty
    val isAtom get() = isLeaf

    fun isInGroup(group: String) = group in groups

    /** Every attribute of this schema has a default. */
    fun hasRequiredAttrs() = false

    fun compatibleContent(other: PmNodeType) = this === other || contentMatch.compatible(other.contentMatch)

    fun computeAttrs(attrs: PmAttrs?): PmAttrs {
        if (attrs == null) return defaultAttrs
        return defaultAttrs.mapValues { (name, default) -> if (attrs.containsKey(name)) attrs[name] else default }
    }

    fun create(attrs: PmAttrs? = null, content: PmFragment? = null, marks: List<PmMark>? = null): PmNode {
        check(!isText) { "NodeType.create can't construct text nodes" }
        return PmNode(this, computeAttrs(attrs), content ?: PmFragment.Empty, PmMark.setFrom(marks))
    }

    fun createAndFill(attrs: PmAttrs? = null, content: PmFragment = PmFragment.Empty, marks: List<PmMark>? = null): PmNode? {
        var filled = content
        if (filled.size > 0) {
            val before = contentMatch.fillBefore(filled) ?: return null
            filled = before.append(filled)
        }
        val matched = contentMatch.matchFragment(filled)
        val after = matched?.fillBefore(PmFragment.Empty, true) ?: return null
        return PmNode(this, computeAttrs(attrs), filled.append(after), PmMark.setFrom(marks))
    }

    fun validContent(content: PmFragment): Boolean {
        val result = contentMatch.matchFragment(content)
        if (result == null || !result.validEnd) return false
        for (i in 0 until content.childCount) if (!allowsMarks(content.child(i).marks)) return false
        return true
    }

    fun checkContent(content: PmFragment) {
        if (!validContent(content)) throw PmReplaceError("Invalid content for node $name")
    }

    fun allowsMarkType(markType: PmMarkType) = markSet?.contains(markType) ?: true

    fun allowsMarks(marks: List<PmMark>) = marks.all { allowsMarkType(it.type) }

    fun allowedMarks(marks: List<PmMark>): List<PmMark> =
        if (markSet == null || allowsMarks(marks)) marks else marks.filter { allowsMarkType(it.type) }
}

internal class PmMarkType(val name: String, val rank: Int, val defaultAttrs: PmAttrs) {
    lateinit var excluded: List<PmMarkType>

    fun create(attrs: PmAttrs? = null): PmMark =
        PmMark(this, if (attrs == null) defaultAttrs else defaultAttrs.mapValues { (k, d) -> if (attrs.containsKey(k)) attrs[k] else d })

    fun excludes(other: PmMarkType) = other in excluded
}

internal class PmMark(val type: PmMarkType, val attrs: PmAttrs) {
    fun addToSet(set: List<PmMark>): List<PmMark> {
        var copy: MutableList<PmMark>? = null
        var placed = false
        for (i in set.indices) {
            val other = set[i]
            if (eq(other)) return set
            if (type.excludes(other.type)) {
                if (copy == null) copy = set.subList(0, i).toMutableList()
            } else if (other.type.excludes(type)) {
                return set
            } else {
                if (!placed && other.type.rank > type.rank) {
                    if (copy == null) copy = set.subList(0, i).toMutableList()
                    copy.add(this)
                    placed = true
                }
                copy?.add(other)
            }
        }
        val result = copy ?: set.toMutableList()
        if (!placed) result.add(this)
        return result
    }

    fun removeFromSet(set: List<PmMark>): List<PmMark> {
        val index = set.indexOfFirst { eq(it) }
        return if (index < 0) set else set.filterIndexed { i, _ -> i != index }
    }

    fun isInSet(set: List<PmMark>) = set.any { eq(it) }

    fun eq(other: PmMark) = this === other || (type === other.type && attrs == other.attrs)

    fun toJson(): JsonObject = buildJsonObject {
        put("type", type.name)
        if (attrs.isNotEmpty()) put("attrs", attrsToJson(attrs))
    }

    companion object {
        fun sameSet(a: List<PmMark>, b: List<PmMark>): Boolean {
            if (a === b) return true
            if (a.size != b.size) return false
            return a.indices.all { a[it].eq(b[it]) }
        }

        fun setFrom(marks: List<PmMark>?): List<PmMark> =
            if (marks.isNullOrEmpty()) emptyList() else marks.sortedBy { it.type.rank }
    }
}

/** A state of a node type's content expression (content.ts). */
internal class PmContentMatch(val validEnd: Boolean) {
    class Edge(val type: PmNodeType, val next: PmContentMatch)

    val next = mutableListOf<Edge>()
    private val wrapCache = HashMap<PmNodeType, List<PmNodeType>?>()

    fun matchType(type: PmNodeType): PmContentMatch? = next.firstOrNull { it.type === type }?.next

    fun matchFragment(frag: PmFragment, start: Int = 0, end: Int = frag.childCount): PmContentMatch? {
        var cur: PmContentMatch? = this
        var i = start
        while (cur != null && i < end) {
            cur = cur.matchType(frag.child(i).type)
            i++
        }
        return cur
    }

    val inlineContent get() = next.isNotEmpty() && next[0].type.isInline

    val defaultType: PmNodeType? get() = next.firstOrNull { !(it.type.isText || it.type.hasRequiredAttrs()) }?.type

    fun compatible(other: PmContentMatch) = next.any { a -> other.next.any { b -> a.type === b.type } }

    fun fillBefore(after: PmFragment, toEnd: Boolean = false, startIndex: Int = 0): PmFragment? {
        val seen = mutableListOf(this)
        fun search(match: PmContentMatch, types: List<PmNodeType>): PmFragment? {
            val finished = match.matchFragment(after, startIndex)
            if (finished != null && (!toEnd || finished.validEnd)) {
                return PmFragment.from(types.map { requireNotNull(it.createAndFill()) })
            }
            for (edge in match.next) {
                if (!(edge.type.isText || edge.type.hasRequiredAttrs()) && edge.next !in seen) {
                    seen.add(edge.next)
                    val found = search(edge.next, types + edge.type)
                    if (found != null) return found
                }
            }
            return null
        }
        return search(this, emptyList())
    }

    fun findWrapping(target: PmNodeType): List<PmNodeType>? =
        if (wrapCache.containsKey(target)) wrapCache[target] else computeWrapping(target).also { wrapCache[target] = it }

    private class Active(val match: PmContentMatch, val type: PmNodeType?, val via: Active?)

    private fun computeWrapping(target: PmNodeType): List<PmNodeType>? {
        val seen = HashSet<String>()
        val active = ArrayDeque(listOf(Active(this, null, null)))
        while (active.isNotEmpty()) {
            val current = active.removeFirst()
            val match = current.match
            if (match.matchType(target) != null) {
                val result = mutableListOf<PmNodeType>()
                var obj: Active? = current
                while (true) {
                    val type = obj?.type ?: break
                    result.add(type)
                    obj = obj.via
                }
                return result.reversed()
            }
            for (edge in match.next) {
                val type = edge.type
                if (!type.isLeaf && !type.hasRequiredAttrs() && type.name !in seen && (current.type == null || edge.next.validEnd)) {
                    active.addLast(Active(type.contentMatch, type, current))
                    seen.add(type.name)
                }
            }
        }
        return null
    }

    companion object {
        val Empty = PmContentMatch(true)

        /** `types*` */
        fun star(types: List<PmNodeType>) = PmContentMatch(true).also { s -> types.forEach { s.next.add(Edge(it, s)) } }

        /** `types+` */
        fun plus(types: List<PmNodeType>): PmContentMatch {
            val end = PmContentMatch(true)
            types.forEach { end.next.add(Edge(it, end)) }
            return PmContentMatch(false).also { s -> types.forEach { s.next.add(Edge(it, end)) } }
        }

        /** `first rest*` */
        fun then(first: PmNodeType, rest: List<PmNodeType>): PmContentMatch {
            val end = star(rest)
            return PmContentMatch(false).also { it.next.add(Edge(first, end)) }
        }
    }
}

/**
 * The web editor's schema, node for node and mark for mark, in the order
 * Tiptap registers them (which sets mark ranks, the edges of each content
 * expression, and so the wrapping and filling choices).
 */
internal object PmSchema {
    val nodes: Map<String, PmNodeType>
    val marks: Map<String, PmMarkType>

    val paragraph = PmNodeType("paragraph", listOf("block"), mapOf("textAlign" to null, "indent" to 0))
    val blockquote = PmNodeType("blockquote", listOf("block"), mapOf("indent" to 0), defining = true)
    val bulletList = PmNodeType("bulletList", listOf("block", "list"), emptyMap())
    val doc = PmNodeType("doc", emptyList(), emptyMap())
    val hardBreak = PmNodeType("hardBreak", listOf("inline"), emptyMap(), inlineSpec = true)
    val heading = PmNodeType("heading", listOf("block"), mapOf("textAlign" to null, "indent" to 0, "level" to 1), defining = true)
    val horizontalRule = PmNodeType("horizontalRule", listOf("block"), emptyMap())
    val listItem = PmNodeType("listItem", emptyList(), mapOf("indent" to 0), defining = true)
    val orderedList = PmNodeType("orderedList", listOf("block", "list"), mapOf("start" to 1, "type" to null))
    val text = PmNodeType("text", listOf("inline"), emptyMap())
    val codeBlock = PmNodeType("codeBlock", listOf("block"), mapOf("indent" to 0, "language" to null), defining = true, code = true)
    val taskList = PmNodeType("taskList", listOf("block", "list"), emptyMap())
    val taskItem = PmNodeType("taskItem", emptyList(), mapOf("checked" to false), defining = true)

    val link = PmMarkType(
        "link", 0,
        mapOf("href" to null, "target" to "_blank", "rel" to "noopener noreferrer nofollow", "class" to null, "title" to null),
    )
    val textStyle = PmMarkType("textStyle", 1, mapOf("color" to null, "fontFamily" to null, "fontSize" to null))
    val bold = PmMarkType("bold", 2, emptyMap())
    val code = PmMarkType("code", 3, emptyMap())
    val italic = PmMarkType("italic", 4, emptyMap())
    val strike = PmMarkType("strike", 5, emptyMap())
    val underline = PmMarkType("underline", 6, mapOf("style" to null, "color" to null))
    val highlight = PmMarkType("highlight", 7, mapOf("color" to null))
    val subscript = PmMarkType("subscript", 8, emptyMap())
    val superscript = PmMarkType("superscript", 9, emptyMap())

    /** What stands for a line break in a textblock that is not code (the
     *  hardBreak's `linebreakReplacement`). */
    val linebreakReplacement = hardBreak

    init {
        val nodeList = listOf(
            paragraph, blockquote, bulletList, doc, hardBreak, heading, horizontalRule,
            listItem, orderedList, text, codeBlock, taskList, taskItem,
        )
        nodes = LinkedHashMap<String, PmNodeType>().apply { nodeList.forEach { put(it.name, it) } }
        val markList = listOf(link, textStyle, bold, code, italic, strike, underline, highlight, subscript, superscript)
        marks = LinkedHashMap<String, PmMarkType>().apply { markList.forEach { put(it.name, it) } }

        val block = nodeList.filter { it.isInGroup("block") }
        val inline = nodeList.filter { it.isInGroup("inline") }
        val blockPlus = PmContentMatch.plus(block)
        val inlineStar = PmContentMatch.star(inline)
        val listItems = PmContentMatch.plus(listOf(listItem))
        val itemContent = PmContentMatch.then(paragraph, block)
        for (type in nodeList) {
            type.contentMatch = when (type) {
                doc, blockquote -> blockPlus
                paragraph, heading -> inlineStar
                bulletList, orderedList -> listItems
                taskList -> PmContentMatch.plus(listOf(taskItem))
                listItem, taskItem -> itemContent
                codeBlock -> PmContentMatch.star(listOf(text))
                else -> PmContentMatch.Empty
            }
            type.inlineContent = type.contentMatch.inlineContent
            type.markSet = if (type == codeBlock || !type.inlineContent) emptyList() else null
        }
        for (mark in markList) mark.excluded = if (mark == code) markList else listOf(mark)
    }

    fun text(text: String, marks: List<PmMark>? = null): PmNode = PmTextNode(this.text, text, PmMark.setFrom(marks))

    fun nodeFromJson(json: JsonObject): PmNode {
        val name = (json["type"] as JsonPrimitive).content
        val marks = (json["marks"] as? JsonArray)?.map { markFromJson(it as JsonObject) }
        if (name == "text") return text((json["text"] as JsonPrimitive).content, marks)
        val type = requireNotNull(nodes[name]) { "Unknown node type: $name" }
        val content = (json["content"] as? JsonArray)?.map { nodeFromJson(it as JsonObject) }.orEmpty()
        return type.create(attrsFromJson(json["attrs"] as? JsonObject), PmFragment.fromArray(content), marks)
    }

    fun markFromJson(json: JsonObject): PmMark {
        val name = (json["type"] as JsonPrimitive).content
        return requireNotNull(marks[name]) { "Unknown mark type: $name" }.create(attrsFromJson(json["attrs"] as? JsonObject))
    }

    fun attrsFromJson(json: JsonObject?): PmAttrs? = json?.mapValues { (_, value) ->
        when {
            value is JsonNull -> null
            value !is JsonPrimitive -> value.toString()
            value.isString -> value.content
            value.booleanOrNull != null -> value.booleanOrNull
            else -> value.doubleOrNull?.let { if (it == Math.floor(it) && !it.isInfinite()) it.toInt() else it }
        }
    }
}

internal fun attrsToJson(attrs: PmAttrs): JsonObject = buildJsonObject {
    for ((key, value) in attrs) when (value) {
        null -> put(key, JsonNull)
        is String -> put(key, value)
        is Boolean -> put(key, value)
        is Number -> put(key, value)
        else -> put(key, value.toString())
    }
}

/** A node's children (fragment.ts). */
internal class PmFragment(val content: List<PmNode>, size: Int? = null) {
    val size: Int = size ?: content.sumOf { it.nodeSize }

    fun nodesBetween(from: Int, to: Int, f: (PmNode, Int, PmNode?, Int) -> Boolean, nodeStart: Int = 0, parent: PmNode? = null) {
        var pos = 0
        var i = 0
        while (pos < to) {
            val child = content[i]
            val end = pos + child.nodeSize
            if (end > from && f(child, nodeStart + pos, parent, i) && child.content.size > 0) {
                val start = pos + 1
                child.nodesBetween(maxOf(0, from - start), minOf(child.content.size, to - start), f, nodeStart + start)
            }
            pos = end
            i++
        }
    }

    fun descendants(f: (PmNode, Int, PmNode?, Int) -> Boolean) = nodesBetween(0, size, f)

    fun textBetween(from: Int, to: Int, blockSeparator: String? = null, leafText: String? = null): String {
        val text = StringBuilder()
        var first = true
        nodesBetween(from, to, { node, pos, _, _ ->
            val nodeText = when {
                node.isText -> node.text!!.substring(maxOf(from, pos) - pos, minOf(node.text!!.length, to - pos))
                !node.isLeaf -> ""
                else -> leafText ?: ""
            }
            if (node.isBlock && (node.isLeaf && nodeText.isNotEmpty() || node.isTextblock) && blockSeparator != null) {
                if (first) first = false else text.append(blockSeparator)
            }
            text.append(nodeText)
            true
        }, 0)
        return text.toString()
    }

    fun append(other: PmFragment): PmFragment {
        if (other.size == 0) return this
        if (size == 0) return other
        val last = lastChild!!
        val first = other.firstChild!!
        val merged = content.toMutableList()
        var i = 0
        if (last.isText && last.sameMarkup(first)) {
            merged[merged.lastIndex] = (last as PmTextNode).withText(last.text + first.text!!)
            i = 1
        }
        while (i < other.content.size) merged.add(other.content[i++])
        return PmFragment(merged, size + other.size)
    }

    fun cut(from: Int, to: Int = size): PmFragment {
        if (from == 0 && to == size) return this
        val result = mutableListOf<PmNode>()
        var cutSize = 0
        if (to > from) {
            var pos = 0
            var i = 0
            while (pos < to) {
                var child = content[i]
                val end = pos + child.nodeSize
                if (end > from) {
                    if (pos < from || end > to) {
                        child = if (child.isText) {
                            child.cut(maxOf(0, from - pos), minOf(child.text!!.length, to - pos))
                        } else {
                            child.cut(maxOf(0, from - pos - 1), minOf(child.content.size, to - pos - 1))
                        }
                    }
                    result.add(child)
                    cutSize += child.nodeSize
                }
                pos = end
                i++
            }
        }
        return PmFragment(result, cutSize)
    }

    fun cutByIndex(from: Int, to: Int): PmFragment = when {
        from == to -> Empty
        from == 0 && to == content.size -> this
        else -> PmFragment(content.subList(from, to).toList())
    }

    fun replaceChild(index: Int, node: PmNode): PmFragment {
        val current = content[index]
        if (current === node) return this
        val copy = content.toMutableList()
        copy[index] = node
        return PmFragment(copy, size + node.nodeSize - current.nodeSize)
    }

    fun eq(other: PmFragment) = content.size == other.content.size && content.indices.all { content[it].eq(other.content[it]) }

    val firstChild: PmNode? get() = content.firstOrNull()
    val lastChild: PmNode? get() = content.lastOrNull()
    val childCount get() = content.size

    fun child(index: Int): PmNode = content.getOrNull(index) ?: throw IndexOutOfBoundsException("Index $index out of range")

    fun maybeChild(index: Int): PmNode? = content.getOrNull(index)

    fun findDiffStart(other: PmFragment, pos: Int = 0): Int? = pmFindDiffStart(this, other, pos)

    fun findDiffEnd(other: PmFragment, pos: Int = size, otherPos: Int = other.size): Pair<Int, Int>? =
        pmFindDiffEnd(this, other, pos, otherPos)

    class IndexOffset(val index: Int, val offset: Int)

    fun findIndex(pos: Int): IndexOffset {
        if (pos == 0) return IndexOffset(0, pos)
        if (pos == size) return IndexOffset(content.size, pos)
        if (pos > size || pos < 0) throw IndexOutOfBoundsException("Position $pos outside of fragment")
        var curPos = 0
        var i = 0
        while (true) {
            val cur = child(i)
            val end = curPos + cur.nodeSize
            if (end >= pos) return if (end == pos) IndexOffset(i + 1, end) else IndexOffset(i, curPos)
            curPos = end
            i++
        }
    }

    fun toJson(): JsonArray = JsonArray(content.map { it.toJson() })

    companion object {
        val Empty = PmFragment(emptyList(), 0)

        fun fromArray(array: List<PmNode>): PmFragment {
            if (array.isEmpty()) return Empty
            var joined: MutableList<PmNode>? = null
            var size = 0
            for (i in array.indices) {
                val node = array[i]
                size += node.nodeSize
                if (i > 0 && node.isText && array[i - 1].sameMarkup(node)) {
                    if (joined == null) joined = array.subList(0, i).toMutableList()
                    joined[joined.lastIndex] = (node as PmTextNode).withText(joined.last().text + node.text)
                } else {
                    joined?.add(node)
                }
            }
            return PmFragment(joined ?: array, size)
        }

        fun from(node: PmNode) = PmFragment(listOf(node), node.nodeSize)

        fun from(nodes: List<PmNode>) = fromArray(nodes)
    }
}

/** node.ts */
internal open class PmNode(val type: PmNodeType, val attrs: PmAttrs, val content: PmFragment, val marks: List<PmMark>) {
    open val text: String? get() = null

    open val nodeSize: Int get() = if (isLeaf) 1 else 2 + content.size

    val childCount get() = content.childCount

    fun child(index: Int) = content.child(index)

    fun maybeChild(index: Int) = content.maybeChild(index)

    val firstChild get() = content.firstChild
    val lastChild get() = content.lastChild

    fun nodesBetween(from: Int, to: Int, f: (PmNode, Int, PmNode?, Int) -> Boolean, startPos: Int = 0) =
        content.nodesBetween(from, to, f, startPos, this)

    fun descendants(f: (PmNode, Int, PmNode?, Int) -> Boolean) = nodesBetween(0, content.size, f)

    /** A child and where it starts: the one at or after [pos] (childAfter),
     *  or at or before it (childBefore). */
    class Child(val node: PmNode?, val index: Int, val offset: Int)

    fun childAfter(pos: Int): Child {
        val found = content.findIndex(pos)
        return Child(content.maybeChild(found.index), found.index, found.offset)
    }

    fun childBefore(pos: Int): Child {
        if (pos == 0) return Child(null, 0, 0)
        val found = content.findIndex(pos)
        if (found.offset < pos) return Child(content.child(found.index), found.index, found.offset)
        val node = content.child(found.index - 1)
        return Child(node, found.index - 1, found.offset - node.nodeSize)
    }

    /** Each child with the offset it starts at. */
    fun forEach(f: (PmNode, Int) -> Unit) {
        var offset = 0
        for (child in content.content) {
            f(child, offset)
            offset += child.nodeSize
        }
    }

    /** The node right after [pos], or null. */
    fun nodeAt(pos: Int): PmNode? {
        var node: PmNode = this
        var at = pos
        while (true) {
            val found = node.content.findIndex(at)
            node = node.maybeChild(found.index) ?: return null
            if (found.offset == at || node.isText) return node
            at -= found.offset + 1
        }
    }

    open fun textBetween(from: Int, to: Int, blockSeparator: String? = null, leafText: String? = null) =
        content.textBetween(from, to, blockSeparator, leafText)

    /** The node's text, its blocks run together. */
    open val textContent: String get() = textBetween(0, content.size, "")

    /** Whether a node in `[from, to)` carries a mark of [type]. */
    fun rangeHasMark(from: Int, to: Int, type: PmMarkType): Boolean {
        var found = false
        if (to > from) {
            nodesBetween(from, to, { node, _, _, _ ->
                if (node.marks.any { it.type === type }) found = true
                !found
            })
        }
        return found
    }

    open fun eq(other: PmNode): Boolean = this === other || (sameMarkup(other) && content.eq(other.content))

    fun sameMarkup(other: PmNode) = hasMarkup(other.type, other.attrs, other.marks)

    fun hasMarkup(type: PmNodeType, attrs: PmAttrs? = null, marks: List<PmMark>? = null) =
        this.type === type && this.attrs == (attrs ?: type.defaultAttrs) && PmMark.sameSet(this.marks, marks ?: emptyList())

    open fun copy(content: PmFragment? = null): PmNode =
        if (content === this.content) this else PmNode(type, attrs, content ?: PmFragment.Empty, marks)

    open fun mark(marks: List<PmMark>): PmNode = if (marks === this.marks) this else PmNode(type, attrs, content, marks)

    /** [to] defaults to the end, as the original's does; an override
     *  cannot give its own default, so the end is clamped instead. */
    open fun cut(from: Int, to: Int = Int.MAX_VALUE): PmNode {
        val end = minOf(to, content.size)
        return if (from == 0 && end == content.size) this else copy(content.cut(from, end))
    }

    fun slice(from: Int, to: Int = content.size, includeParents: Boolean = false): PmSlice {
        if (from == to) return PmSlice.Empty
        val rFrom = resolve(from)
        val rTo = resolve(to)
        val depth = if (includeParents) 0 else rFrom.sharedDepth(to)
        val start = rFrom.start(depth)
        val node = rFrom.node(depth)
        return PmSlice(node.content.cut(rFrom.pos - start, rTo.pos - start), rFrom.depth - depth, rTo.depth - depth)
    }

    fun replace(from: Int, to: Int, slice: PmSlice): PmNode = pmReplace(resolve(from), resolve(to), slice)

    fun resolve(pos: Int) = PmResolvedPos.resolve(this, pos)

    val isBlock get() = type.isBlock
    val isTextblock get() = type.isTextblock
    val inlineContent get() = type.inlineContent
    val isInline get() = type.isInline
    val isText get() = type.isText
    val isLeaf get() = type.isLeaf
    val isAtom get() = type.isAtom

    fun contentMatchAt(index: Int): PmContentMatch =
        type.contentMatch.matchFragment(content, 0, index) ?: error("Called contentMatchAt on a node with invalid content")

    fun canReplace(from: Int, to: Int, replacement: PmFragment = PmFragment.Empty, start: Int = 0, end: Int = replacement.childCount): Boolean {
        val one = contentMatchAt(from).matchFragment(replacement, start, end)
        val two = one?.matchFragment(content, to)
        if (two == null || !two.validEnd) return false
        for (i in start until end) if (!type.allowsMarks(replacement.child(i).marks)) return false
        return true
    }

    fun canReplaceWith(from: Int, to: Int, type: PmNodeType, marks: List<PmMark>? = null): Boolean {
        if (marks != null && !this.type.allowsMarks(marks)) return false
        val start = contentMatchAt(from).matchType(type)
        val end = start?.matchFragment(content, to)
        return end?.validEnd ?: false
    }

    open fun toJson(): JsonObject = buildJsonObject {
        put("type", type.name)
        if (attrs.isNotEmpty()) put("attrs", attrsToJson(attrs))
        if (content.size > 0) put("content", content.toJson())
        if (marks.isNotEmpty()) put("marks", JsonArray(marks.map { it.toJson() }))
    }
}

internal class PmTextNode(type: PmNodeType, override val text: String, marks: List<PmMark>) :
    PmNode(type, type.defaultAttrs, PmFragment.Empty, marks) {
    init {
        require(text.isNotEmpty()) { "Empty text nodes are not allowed" }
    }

    override val nodeSize get() = text.length

    override fun textBetween(from: Int, to: Int, blockSeparator: String?, leafText: String?) = text.substring(from, to)

    override val textContent get() = text

    override fun mark(marks: List<PmMark>): PmNode = if (marks === this.marks) this else PmTextNode(type, text, marks)

    fun withText(text: String): PmNode = if (text == this.text) this else PmTextNode(type, text, marks)

    override fun copy(content: PmFragment?): PmNode = this

    override fun cut(from: Int, to: Int): PmNode {
        val end = minOf(to, text.length)
        return if (from == 0 && end == text.length) this else withText(text.substring(from, end))
    }

    override fun eq(other: PmNode) = sameMarkup(other) && text == other.text

    override fun toJson(): JsonObject = buildJsonObject {
        put("type", "text")
        put("text", text)
        if (marks.isNotEmpty()) put("marks", JsonArray(marks.map { it.toJson() }))
    }
}

/** resolvedpos.ts. [nodes], [indices] and [offsets] are the path: at each
 *  depth, the node, the index into it and the position its child at that
 *  index starts at. */
internal class PmResolvedPos(
    val pos: Int,
    private val nodes: List<PmNode>,
    private val indices: List<Int>,
    private val offsets: List<Int>,
    val parentOffset: Int,
) {
    val depth = nodes.size - 1

    private fun resolveDepth(value: Int?) = when {
        value == null -> depth
        value < 0 -> depth + value
        else -> value
    }

    val parent get() = node(depth)
    val doc get() = node(0)

    fun node(depth: Int? = null): PmNode = nodes[resolveDepth(depth)]

    fun index(depth: Int? = null): Int = indices[resolveDepth(depth)]

    fun indexAfter(depth: Int? = null): Int {
        val d = resolveDepth(depth)
        return index(d) + if (d == this.depth && textOffset == 0) 0 else 1
    }

    fun start(depth: Int? = null): Int {
        val d = resolveDepth(depth)
        return if (d == 0) 0 else offsets[d - 1] + 1
    }

    fun end(depth: Int? = null): Int {
        val d = resolveDepth(depth)
        return start(d) + node(d).content.size
    }

    fun before(depth: Int? = null): Int {
        val d = resolveDepth(depth)
        require(d != 0) { "There is no position before the top-level node" }
        return if (d == this.depth + 1) pos else offsets[d - 1]
    }

    fun after(depth: Int? = null): Int {
        val d = resolveDepth(depth)
        require(d != 0) { "There is no position after the top-level node" }
        return if (d == this.depth + 1) pos else offsets[d - 1] + nodes[d].nodeSize
    }

    val textOffset get() = pos - offsets.last()

    val nodeAfter: PmNode?
        get() {
            val index = index(depth)
            if (index == parent.childCount) return null
            val dOff = pos - offsets.last()
            val child = parent.child(index)
            return if (dOff > 0) child.cut(dOff) else child
        }

    val nodeBefore: PmNode?
        get() {
            val index = index(depth)
            val dOff = pos - offsets.last()
            if (dOff > 0) return parent.child(index).cut(0, dOff)
            return if (index == 0) null else parent.child(index - 1)
        }

    fun sharedDepth(pos: Int): Int {
        for (d in depth downTo 1) if (start(d) <= pos && end(d) >= pos) return d
        return 0
    }

    /** The marks text typed here takes: those of the text node it is in,
     *  else of the node before it, else of the node after it; none in an
     *  empty parent. Every mark of the web's schema is inclusive, the link
     *  too since autolink is on, so none is dropped at its end. */
    fun marks(): List<PmMark> {
        if (parent.content.size == 0) return emptyList()
        val index = index()
        if (textOffset > 0) return parent.child(index).marks
        return (parent.maybeChild(index - 1) ?: parent.child(index)).marks
    }

    /** The range of blocks where this position and [other] part: the
     *  textblock both are in, or the blocks holding them in their deepest
     *  shared ancestor that [pred] accepts. */
    fun blockRange(other: PmResolvedPos = this, pred: ((PmNode) -> Boolean)? = null): PmNodeRange? {
        if (other.pos < pos) return other.blockRange(this, pred)
        for (d in depth - (if (parent.inlineContent || pos == other.pos) 1 else 0) downTo 0) {
            if (other.pos <= end(d) && (pred == null || pred(node(d)))) return PmNodeRange(this, other, d)
        }
        return null
    }

    fun sameParent(other: PmResolvedPos) = pos - parentOffset == other.pos - other.parentOffset

    companion object {
        fun resolve(doc: PmNode, pos: Int): PmResolvedPos {
            if (pos < 0 || pos > doc.content.size) throw IndexOutOfBoundsException("Position $pos out of range")
            val nodes = mutableListOf<PmNode>()
            val indices = mutableListOf<Int>()
            val offsets = mutableListOf<Int>()
            var start = 0
            var parentOffset = pos
            var node = doc
            while (true) {
                val found = node.content.findIndex(parentOffset)
                val rem = parentOffset - found.offset
                nodes.add(node)
                indices.add(found.index)
                offsets.add(start + found.offset)
                if (rem == 0) break
                node = node.child(found.index)
                if (node.isText) break
                parentOffset = rem - 1
                start += found.offset + 1
            }
            return PmResolvedPos(pos, nodes, indices, offsets, parentOffset)
        }
    }
}

/** A flat range of the children of the node at [depth] (resolvedpos.ts
 *  NodeRange). */
internal class PmNodeRange(val from: PmResolvedPos, val to: PmResolvedPos, val depth: Int) {
    val start get() = from.before(depth + 1)
    val end get() = to.after(depth + 1)
    val parent get() = from.node(depth)
    val startIndex get() = from.index(depth)
    val endIndex get() = to.indexAfter(depth)
}

/** replace.ts: a piece cut out of a document, open to [openStart] and
 *  [openEnd] levels on each side. */
internal class PmSlice(val content: PmFragment, val openStart: Int, val openEnd: Int) {
    val size get() = content.size - openStart - openEnd

    fun insertAt(pos: Int, fragment: PmFragment): PmSlice? =
        insertInto(content, pos + openStart, fragment, null)?.let { PmSlice(it, openStart, openEnd) }

    companion object {
        val Empty = PmSlice(PmFragment.Empty, 0, 0)

        fun maxOpen(fragment: PmFragment): PmSlice {
            var openStart = 0
            var openEnd = 0
            var n = fragment.firstChild
            while (n != null && !n.isLeaf) {
                openStart++
                n = n.firstChild
            }
            n = fragment.lastChild
            while (n != null && !n.isLeaf) {
                openEnd++
                n = n.lastChild
            }
            return PmSlice(fragment, openStart, openEnd)
        }
    }
}

internal class PmReplaceError(message: String) : RuntimeException(message)

private fun insertInto(content: PmFragment, dist: Int, insert: PmFragment, parent: PmNode?): PmFragment? {
    val found = content.findIndex(dist)
    val child = content.maybeChild(found.index)
    if (found.offset == dist || child!!.isText) {
        if (parent != null && !parent.canReplace(found.index, found.index, insert)) return null
        return content.cut(0, dist).append(insert).append(content.cut(dist))
    }
    val inner = insertInto(child.content, dist - found.offset - 1, insert, child) ?: return null
    return content.replaceChild(found.index, child.copy(inner))
}

internal fun pmReplace(from: PmResolvedPos, to: PmResolvedPos, slice: PmSlice): PmNode {
    if (slice.openStart > from.depth) throw PmReplaceError("Inserted content deeper than insertion position")
    if (from.depth - slice.openStart != to.depth - slice.openEnd) throw PmReplaceError("Inconsistent open depths")
    return replaceOuter(from, to, slice, 0)
}

private fun replaceOuter(from: PmResolvedPos, to: PmResolvedPos, slice: PmSlice, depth: Int): PmNode {
    val index = from.index(depth)
    val node = from.node(depth)
    return if (index == to.index(depth) && depth < from.depth - slice.openStart) {
        val inner = replaceOuter(from, to, slice, depth + 1)
        node.copy(node.content.replaceChild(index, inner))
    } else if (slice.content.size == 0) {
        close(node, replaceTwoWay(from, to, depth))
    } else if (slice.openStart == 0 && slice.openEnd == 0 && from.depth == depth && to.depth == depth) {
        val parent = from.parent
        val content = parent.content
        close(parent, content.cut(0, from.parentOffset).append(slice.content).append(content.cut(to.parentOffset)))
    } else {
        val (start, end) = prepareSliceForReplace(slice, from)
        close(node, replaceThreeWay(from, start, end, to, depth))
    }
}

private fun checkJoin(main: PmNode, sub: PmNode) {
    if (!sub.type.compatibleContent(main.type)) throw PmReplaceError("Cannot join ${sub.type.name} onto ${main.type.name}")
}

private fun joinable(before: PmResolvedPos, after: PmResolvedPos, depth: Int): PmNode {
    val node = before.node(depth)
    checkJoin(node, after.node(depth))
    return node
}

private fun addNode(child: PmNode, target: MutableList<PmNode>) {
    val last = target.lastIndex
    if (last >= 0 && child.isText && child.sameMarkup(target[last])) {
        target[last] = (child as PmTextNode).withText(target[last].text + child.text)
    } else {
        target.add(child)
    }
}

private fun addRange(start: PmResolvedPos?, end: PmResolvedPos?, depth: Int, target: MutableList<PmNode>) {
    val node = (end ?: start)!!.node(depth)
    var startIndex = 0
    val endIndex = end?.index(depth) ?: node.childCount
    if (start != null) {
        startIndex = start.index(depth)
        if (start.depth > depth) {
            startIndex++
        } else if (start.textOffset > 0) {
            addNode(start.nodeAfter!!, target)
            startIndex++
        }
    }
    for (i in startIndex until endIndex) addNode(node.child(i), target)
    if (end != null && end.depth == depth && end.textOffset > 0) addNode(end.nodeBefore!!, target)
}

private fun close(node: PmNode, content: PmFragment): PmNode {
    node.type.checkContent(content)
    return node.copy(content)
}

private fun replaceThreeWay(from: PmResolvedPos, start: PmResolvedPos, end: PmResolvedPos, to: PmResolvedPos, depth: Int): PmFragment {
    val openStart = if (from.depth > depth) joinable(from, start, depth + 1) else null
    val openEnd = if (to.depth > depth) joinable(end, to, depth + 1) else null
    val content = mutableListOf<PmNode>()
    addRange(null, from, depth, content)
    if (openStart != null && openEnd != null && start.index(depth) == end.index(depth)) {
        checkJoin(openStart, openEnd)
        addNode(close(openStart, replaceThreeWay(from, start, end, to, depth + 1)), content)
    } else {
        if (openStart != null) addNode(close(openStart, replaceTwoWay(from, start, depth + 1)), content)
        addRange(start, end, depth, content)
        if (openEnd != null) addNode(close(openEnd, replaceTwoWay(end, to, depth + 1)), content)
    }
    addRange(to, null, depth, content)
    return PmFragment(content)
}

private fun replaceTwoWay(from: PmResolvedPos, to: PmResolvedPos, depth: Int): PmFragment {
    val content = mutableListOf<PmNode>()
    addRange(null, from, depth, content)
    if (from.depth > depth) {
        val type = joinable(from, to, depth + 1)
        addNode(close(type, replaceTwoWay(from, to, depth + 1)), content)
    }
    addRange(to, null, depth, content)
    return PmFragment(content)
}

private fun prepareSliceForReplace(slice: PmSlice, along: PmResolvedPos): Pair<PmResolvedPos, PmResolvedPos> {
    val extra = along.depth - slice.openStart
    val parent = along.node(extra)
    var node = parent.copy(slice.content)
    for (i in extra - 1 downTo 0) node = along.node(i).copy(PmFragment.from(node))
    return node.resolve(slice.openStart + extra) to node.resolve(node.content.size - slice.openEnd - extra)
}

/** diff.ts */
internal fun pmFindDiffStart(a: PmFragment, b: PmFragment, startPos: Int): Int? {
    var pos = startPos
    var i = 0
    while (true) {
        if (i == a.childCount || i == b.childCount) return if (a.childCount == b.childCount) null else pos
        val childA = a.child(i)
        val childB = b.child(i)
        if (childA === childB) {
            pos += childA.nodeSize
            i++
            continue
        }
        if (!childA.sameMarkup(childB)) return pos
        if (childA.isText && childA.text != childB.text) {
            var j = 0
            while (j < childA.text!!.length && j < childB.text!!.length && childA.text!![j] == childB.text!![j]) {
                j++
                pos++
            }
            return pos
        }
        if (childA.content.size > 0 || childB.content.size > 0) {
            val inner = pmFindDiffStart(childA.content, childB.content, pos + 1)
            if (inner != null) return inner
        }
        pos += childA.nodeSize
        i++
    }
}

internal fun pmFindDiffEnd(a: PmFragment, b: PmFragment, startA: Int, startB: Int): Pair<Int, Int>? {
    var posA = startA
    var posB = startB
    var iA = a.childCount
    var iB = b.childCount
    while (true) {
        if (iA == 0 || iB == 0) return if (iA == iB) null else posA to posB
        val childA = a.child(--iA)
        val childB = b.child(--iB)
        val size = childA.nodeSize
        if (childA === childB) {
            posA -= size
            posB -= size
            continue
        }
        if (!childA.sameMarkup(childB)) return posA to posB
        if (childA.isText && childA.text != childB.text) {
            var same = 0
            val textA = childA.text!!
            val textB = childB.text!!
            val minSize = minOf(textA.length, textB.length)
            while (same < minSize && textA[textA.length - same - 1] == textB[textB.length - same - 1]) {
                same++
                posA--
                posB--
            }
            return posA to posB
        }
        if (childA.content.size > 0 || childB.content.size > 0) {
            val inner = pmFindDiffEnd(childA.content, childB.content, posA - 1, posB - 1)
            if (inner != null) return inner
        }
        posA -= size
        posB -= size
    }
}
