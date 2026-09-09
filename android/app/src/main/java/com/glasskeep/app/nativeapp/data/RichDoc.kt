package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/** One inline formatting mark over `[start, end)` of a block's text (UTF-16
 *  code-unit offsets, i.e. plain Kotlin String indices). [href] is only
 *  meaningful for [RichMarkType.LINK]. */
data class RichMark(val start: Int, val end: Int, val type: RichMarkType, val href: String? = null)

enum class RichMarkType { BOLD, ITALIC, UNDERLINE, STRIKE, LINK }

enum class RichBlockKind { PARAGRAPH, HEADING_1, HEADING_2, HEADING_3, HEADING_4, HEADING_5, BULLET_ITEM, NUMBERED_ITEM }

/** One editable paragraph/heading/list-item. [id] is local only (Compose
 *  keys and focus tracking), never serialized. */
data class RichBlock(
    val id: String,
    val kind: RichBlockKind,
    val text: String,
    val marks: List<RichMark> = emptyList(),
)

/**
 * Kotlin model, parser and encoder for the subset of Tiptap/ProseMirror JSON
 * (see NoteContent.kt for the envelope shape) the native rich-text editor
 * can safely edit: paragraphs, headings 1-5, bullet/numbered lists (flat
 * items only, matching how this app's own Indent extension works: no real
 * nested-list trees), hardBreak, and the bold/italic/underline/strike/link
 * marks in their default (no color, no custom underline style, no
 * font/size) form.
 *
 * [parse] returns null for anything outside that vocabulary, a color, a
 * heading beyond level 5, a code block, a custom underline, an indented
 * paragraph, anything, rather than guess: NoteDetailScreen's existing
 * "formatting not available" fallback already handles those notes safely,
 * this only ever takes over for a doc it fully understands, so a
 * round-trip through this editor can never quietly drop formatting.
 *
 * Deliberately out of scope for v1, same "disclosed, not silently dropped"
 * rule as the checklist/image milestones: text color, highlight, font
 * family/size, sub/superscript, alignment other than left, block indent,
 * blockquote, code/code block, horizontal rule, nested lists, task lists
 * inside a text note (GlassKeep already has a dedicated checklist type for
 * that), and undo/redo (there is no history stack here, only whatever the
 * OS keyboard offers on its own).
 */
object RichDoc {
    private val NEUTRAL_ATTR_KEYS = setOf("indent", "textAlign")

    /** Parses `content` into editable blocks, or null when it isn't rich
     *  Tiptap content at all, or uses anything outside the vocabulary above. */
    fun parse(content: String?): List<RichBlock>? {
        val doc = NoteContent.parseRichDoc(content) ?: return null
        return try {
            parseDoc(doc)
        } catch (_: Exception) {
            null
        }
    }

    private fun parseDoc(doc: JsonObject): List<RichBlock>? {
        val topLevel = doc["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (node in topLevel) {
            val obj = node as? JsonObject ?: return null
            when ((obj["type"] as? JsonPrimitive)?.contentOrNull) {
                "paragraph" -> blocks.add(parseTextBlock(obj, RichBlockKind.PARAGRAPH) ?: return null)
                "heading" -> blocks.add(parseHeading(obj) ?: return null)
                "bulletList" -> blocks.addAll(parseList(obj, RichBlockKind.BULLET_ITEM) ?: return null)
                "orderedList" -> blocks.addAll(parseList(obj, RichBlockKind.NUMBERED_ITEM) ?: return null)
                else -> return null
            }
        }
        return blocks.ifEmpty { null }
    }

    private fun parseHeading(node: JsonObject): RichBlock? {
        val attrs = node["attrs"] as? JsonObject
        if (!attrsAreNeutral(attrs, extraAllowedKeys = setOf("level"))) return null
        val level = (attrs?.get("level") as? JsonPrimitive)?.intOrNull ?: return null
        val kind = when (level) {
            1 -> RichBlockKind.HEADING_1
            2 -> RichBlockKind.HEADING_2
            3 -> RichBlockKind.HEADING_3
            4 -> RichBlockKind.HEADING_4
            5 -> RichBlockKind.HEADING_5
            else -> return null
        }
        return parseTextBlock(node, kind)
    }

    /** `list -> listItem[] -> [paragraph]`: this project's Indent extension
     *  never nests lists (see its own source comment), a listItem always
     *  holds exactly one plain paragraph, so each listItem becomes one flat
     *  block of the matching kind. Anything else, a listItem with more than
     *  one child, a nested list, an indent, means "not this vocabulary". */
    private fun parseList(node: JsonObject, itemKind: RichBlockKind): List<RichBlock>? {
        if (!attrsAreNeutral(node["attrs"] as? JsonObject, extraAllowedKeys = setOf("start"), allowedStart = 1)) return null
        val items = node["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (itemNode in items) {
            val itemObj = itemNode as? JsonObject ?: return null
            if ((itemObj["type"] as? JsonPrimitive)?.contentOrNull != "listItem") return null
            if (!attrsAreNeutral(itemObj["attrs"] as? JsonObject)) return null
            val itemContent = itemObj["content"] as? JsonArray ?: return null
            if (itemContent.size != 1) return null
            val paragraphNode = itemContent[0] as? JsonObject ?: return null
            if ((paragraphNode["type"] as? JsonPrimitive)?.contentOrNull != "paragraph") return null
            blocks.add(parseTextBlock(paragraphNode, itemKind) ?: return null)
        }
        return blocks
    }

    private fun parseTextBlock(node: JsonObject, kind: RichBlockKind): RichBlock? {
        if (kind != RichBlockKind.HEADING_1 && kind != RichBlockKind.HEADING_2 && kind != RichBlockKind.HEADING_3 &&
            kind != RichBlockKind.HEADING_4 && kind != RichBlockKind.HEADING_5
        ) {
            if (!attrsAreNeutral(node["attrs"] as? JsonObject)) return null
        }
        val inline = node["content"] as? JsonArray
        val (text, marks) = parseInline(inline) ?: return null
        return RichBlock(id = UUID.randomUUID().toString(), kind = kind, text = text, marks = marks)
    }

    private fun parseInline(nodes: JsonArray?): Pair<String, List<RichMark>>? {
        if (nodes == null) return "" to emptyList()
        val sb = StringBuilder()
        val marks = mutableListOf<RichMark>()
        for (node in nodes) {
            val obj = node as? JsonObject ?: return null
            when ((obj["type"] as? JsonPrimitive)?.contentOrNull) {
                "text" -> {
                    val text = (obj["text"] as? JsonPrimitive)?.contentOrNull ?: return null
                    val start = sb.length
                    sb.append(text)
                    val end = sb.length
                    val markNodes = obj["marks"] as? JsonArray
                    if (markNodes != null) {
                        for (markNode in markNodes) {
                            val markObj = markNode as? JsonObject ?: return null
                            marks.add(parseMark(markObj, start, end) ?: return null)
                        }
                    }
                }
                "hardBreak" -> sb.append("\n")
                else -> return null
            }
        }
        return sb.toString() to marks
    }

    private fun parseMark(obj: JsonObject, start: Int, end: Int): RichMark? {
        val attrs = obj["attrs"] as? JsonObject
        return when ((obj["type"] as? JsonPrimitive)?.contentOrNull) {
            "bold" -> if (attrs.isNullOrEmpty()) RichMark(start, end, RichMarkType.BOLD) else null
            "italic" -> if (attrs.isNullOrEmpty()) RichMark(start, end, RichMarkType.ITALIC) else null
            "strike" -> if (attrs.isNullOrEmpty()) RichMark(start, end, RichMarkType.STRIKE) else null
            "underline" -> {
                val style = (attrs?.get("style") as? JsonPrimitive)?.contentOrNull
                val color = (attrs?.get("color") as? JsonPrimitive)?.contentOrNull
                if (style == null && color == null) RichMark(start, end, RichMarkType.UNDERLINE) else null
            }
            "link" -> {
                val href = (attrs?.get("href") as? JsonPrimitive)?.contentOrNull
                if (href.isNullOrBlank()) null else RichMark(start, end, RichMarkType.LINK, href = href)
            }
            else -> null
        }
    }

    /** True when every attrs key is either absent or one of this vocabulary's
     *  known "nothing chosen" values (Indent's 0, TextAlign's "left", an
     *  ordered list's default start of 1): real formatting outside that,
     *  or a key this function doesn't recognize at all, rejects the whole
     *  doc rather than silently drop it. */
    private fun attrsAreNeutral(
        attrs: JsonObject?,
        extraAllowedKeys: Set<String> = emptySet(),
        allowedStart: Int = 1,
    ): Boolean {
        if (attrs.isNullOrEmpty()) return true
        val allowedKeys = NEUTRAL_ATTR_KEYS + extraAllowedKeys
        for ((key, value) in attrs) {
            if (key !in allowedKeys) return false
            when (key) {
                "indent" -> if (((value as? JsonPrimitive)?.intOrNull ?: 0) != 0) return false
                "textAlign" -> {
                    val align = (value as? JsonPrimitive)?.contentOrNull
                    if (align != null && align != "left") return false
                }
                "start" -> if (((value as? JsonPrimitive)?.intOrNull ?: allowedStart) != allowedStart) return false
                // "level" is handled by the heading-specific caller, any
                // value is fine here, it's re-read and validated there.
            }
        }
        return true
    }

    // ---------------------------------------------------------------------
    // Encoding

    /** Serializes [blocks] back into the same envelope [parse] reads.
     *  Consecutive same-kind list-item blocks are regrouped into one
     *  bulletList/orderedList node; only the attrs this editor actually
     *  needs (a heading's level) are emitted, everything else is left for
     *  Tiptap's own schema defaults to fill in on the other end. */
    fun encode(blocks: List<RichBlock>): String {
        val nodes = mutableListOf<JsonObject>()
        var i = 0
        while (i < blocks.size) {
            val kind = blocks[i].kind
            if (kind == RichBlockKind.BULLET_ITEM || kind == RichBlockKind.NUMBERED_ITEM) {
                val run = mutableListOf<RichBlock>()
                while (i < blocks.size && blocks[i].kind == kind) {
                    run.add(blocks[i])
                    i++
                }
                nodes.add(
                    buildJsonObject {
                        put("type", if (kind == RichBlockKind.BULLET_ITEM) "bulletList" else "orderedList")
                        put("content", JsonArray(run.map { encodeListItem(it) }))
                    },
                )
            } else {
                nodes.add(encodeTextBlock(blocks[i]))
                i++
            }
        }
        val doc = buildJsonObject {
            put("type", "doc")
            put("content", JsonArray(nodes.ifEmpty { listOf(buildJsonObject { put("type", "paragraph") }) }))
        }
        val envelope = buildJsonObject {
            put("v", 1)
            put("format", "tiptap")
            put("doc", doc)
        }
        return envelope.toString()
    }

    private fun encodeListItem(block: RichBlock): JsonObject = buildJsonObject {
        put("type", "listItem")
        put("content", JsonArray(listOf(encodeTextBlock(block))))
    }

    private fun encodeTextBlock(block: RichBlock): JsonObject = buildJsonObject {
        val level = headingLevel(block.kind)
        put("type", if (level != null) "heading" else "paragraph")
        if (level != null) put("attrs", buildJsonObject { put("level", level) })
        val inline = encodeInline(block.text, block.marks)
        if (inline.isNotEmpty()) put("content", JsonArray(inline))
    }

    private fun headingLevel(kind: RichBlockKind): Int? = when (kind) {
        RichBlockKind.HEADING_1 -> 1
        RichBlockKind.HEADING_2 -> 2
        RichBlockKind.HEADING_3 -> 3
        RichBlockKind.HEADING_4 -> 4
        RichBlockKind.HEADING_5 -> 5
        else -> null
    }

    /** Splits `text` on "\n" into hardBreak-separated lines, then each line
     *  into the smallest runs whose active mark set doesn't change, so every
     *  emitted text node has one uniform marks array, matching how Tiptap's
     *  own doc.toJSON() never mixes marks within a single text node. */
    private fun encodeInline(text: String, marks: List<RichMark>): List<JsonObject> {
        if (text.isEmpty()) return emptyList()
        val result = mutableListOf<JsonObject>()
        var lineStart = 0
        val lines = text.split("\n")
        for ((index, line) in lines.withIndex()) {
            val lineEnd = lineStart + line.length
            if (line.isNotEmpty()) {
                val cuts = sortedSetOf(lineStart, lineEnd)
                for (m in marks) {
                    if (m.start in lineStart..lineEnd) cuts.add(m.start)
                    if (m.end in lineStart..lineEnd) cuts.add(m.end)
                }
                val points = cuts.toList()
                for (j in 0 until points.size - 1) {
                    val segStart = points[j]
                    val segEnd = points[j + 1]
                    if (segStart >= segEnd) continue
                    val active = marks.filter { it.start <= segStart && it.end >= segEnd }
                    result.add(
                        buildJsonObject {
                            put("type", "text")
                            put("text", text.substring(segStart, segEnd))
                            if (active.isNotEmpty()) put("marks", JsonArray(active.map { encodeMark(it) }))
                        },
                    )
                }
            }
            lineStart = lineEnd + 1
            if (index < lines.lastIndex) result.add(buildJsonObject { put("type", "hardBreak") })
        }
        return result
    }

    private fun encodeMark(mark: RichMark): JsonObject = buildJsonObject {
        put(
            "type",
            when (mark.type) {
                RichMarkType.BOLD -> "bold"
                RichMarkType.ITALIC -> "italic"
                RichMarkType.UNDERLINE -> "underline"
                RichMarkType.STRIKE -> "strike"
                RichMarkType.LINK -> "link"
            },
        )
        if (mark.type == RichMarkType.LINK) put("attrs", buildJsonObject { put("href", mark.href.orEmpty()) })
    }

    // ---------------------------------------------------------------------
    // Editing helpers (pure, used by NoteDetailScreen/RichTextEditor)

    fun newBlock(kind: RichBlockKind = RichBlockKind.PARAGRAPH): RichBlock =
        RichBlock(id = UUID.randomUUID().toString(), kind = kind, text = "", marks = emptyList())

    /** True when [type] covers the whole `[start, end)` range, possibly via
     *  more than one adjacent/overlapping mark instance of that type. Used
     *  to show a toolbar toggle button as active, and to decide whether
     *  toggling it should add or remove the mark. */
    fun isMarkActive(marks: List<RichMark>, type: RichMarkType, start: Int, end: Int): Boolean {
        if (start >= end) return false
        var covered = start
        for (m in marks.filter { it.type == type }.sortedBy { it.start }) {
            if (m.start > covered) break
            if (m.end > covered) covered = m.end
            if (covered >= end) return true
        }
        return false
    }

    /** Removes [type] from `[start, end)`, trimming any mark instance that
     *  only partly overlaps instead of dropping it outright. */
    fun clearMark(marks: List<RichMark>, type: RichMarkType, start: Int, end: Int): List<RichMark> {
        val result = mutableListOf<RichMark>()
        for (m in marks) {
            if (m.type != type || m.end <= start || m.start >= end) {
                result.add(m)
                continue
            }
            if (m.start < start) result.add(m.copy(end = start))
            if (m.end > end) result.add(m.copy(start = end))
        }
        return result.sortedBy { it.start }
    }

    /** The mark half of the web's `clearNodes().unsetAllMarks()`: every
     *  type dropped from `[start, end)` at once. */
    fun clearAllMarks(marks: List<RichMark>, start: Int, end: Int): List<RichMark> =
        RichMarkType.entries.fold(marks) { acc, type -> clearMark(acc, type, start, end) }

    /** Applies [type] (with [href] for a link) over `[start, end)`, first
     *  clearing any existing same-type mark from that range so instances of
     *  one type never overlap each other. */
    fun setMark(marks: List<RichMark>, type: RichMarkType, start: Int, end: Int, href: String? = null): List<RichMark> {
        if (start >= end) return marks
        val cleared = clearMark(marks, type, start, end)
        return (cleared + RichMark(start, end, type, href)).sortedBy { it.start }
    }

    fun toggleMark(marks: List<RichMark>, type: RichMarkType, start: Int, end: Int): List<RichMark> =
        if (isMarkActive(marks, type, start, end)) clearMark(marks, type, start, end) else setMark(marks, type, start, end)

    /** Keeps only the marks (or the surviving part of a partially-overlapping
     *  one) inside `[from, to)`, re-based to start at 0. Used when a block's
     *  text is cut in two (Enter splits it into two blocks). */
    fun clipMarks(marks: List<RichMark>, from: Int, to: Int): List<RichMark> =
        marks.mapNotNull { m ->
            val start = m.start.coerceIn(from, to)
            val end = m.end.coerceIn(from, to)
            if (start < end) m.copy(start = start - from, end = end - from) else null
        }

    /** The `[start, oldEnd, newEnd)` window an edit from [oldText] to
     *  [newText] touched: the common prefix and suffix around it are
     *  untouched, `newText[start, newEnd)` is what replaced
     *  `oldText[start, oldEnd)`. */
    data class EditSpan(val start: Int, val oldEnd: Int, val newEnd: Int) {
        val delta: Int get() = (newEnd - start) - (oldEnd - start)
    }

    fun diffEdit(oldText: String, newText: String): EditSpan {
        val maxPrefix = minOf(oldText.length, newText.length)
        var prefix = 0
        while (prefix < maxPrefix && oldText[prefix] == newText[prefix]) prefix++
        val maxSuffix = maxPrefix - prefix
        var suffix = 0
        while (suffix < maxSuffix && oldText[oldText.length - 1 - suffix] == newText[newText.length - 1 - suffix]) suffix++
        return EditSpan(start = prefix, oldEnd = oldText.length - suffix, newEnd = newText.length - suffix)
    }

    /** Re-bases [marks] after `oldText -> newText` (see [diffEdit]). A mark
     *  spanning all the way across the edited region is extended to keep
     *  spanning it, typing in the middle of a bolded word stays bold; a
     *  mark only partly overlapping is trimmed to whatever part of it is
     *  still there. New text is never retroactively styled from a partial
     *  overlap, only a full one, select it and toggle a mark explicitly
     *  instead. */
    fun adjustMarksForEdit(oldText: String, newText: String, marks: List<RichMark>): List<RichMark> {
        if (oldText == newText) return marks
        val span = diffEdit(oldText, newText)
        return marks.mapNotNull { m ->
            when {
                m.end <= span.start -> m
                m.start >= span.oldEnd -> m.copy(start = m.start + span.delta, end = m.end + span.delta)
                m.start <= span.start && m.end >= span.oldEnd -> m.copy(end = m.end + span.delta)
                m.start < span.start -> m.copy(end = span.start)
                m.end > span.oldEnd -> m.copy(start = span.newEnd, end = m.end + span.delta)
                else -> null
            }
        }
    }
}
