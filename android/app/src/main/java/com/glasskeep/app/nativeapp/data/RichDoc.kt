package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/**
 * One inline formatting mark over `[start, end)` of a block's text (UTF-16
 * code-unit offsets, i.e. plain Kotlin String indices).
 *
 * [value] carries whatever payload the mark type needs: the href for a
 * link, the CSS colour for a text colour or a highlight, the family name
 * for a font, "18px" for a size, and the line style ("simple", "double",
 * "dotted", "dashed", "wavy") for an underline. [color] is only used by
 * an underline, which can carry a style AND a colour at once.
 */
data class RichMark(
    val start: Int,
    val end: Int,
    val type: RichMarkType,
    val value: String? = null,
    val color: String? = null,
)

enum class RichMarkType {
    BOLD, ITALIC, UNDERLINE, STRIKE, LINK, CODE, SUBSCRIPT, SUPERSCRIPT,
    TEXT_COLOR, HIGHLIGHT, FONT_FAMILY, FONT_SIZE,
}

enum class RichBlockKind {
    PARAGRAPH, HEADING_1, HEADING_2, HEADING_3, HEADING_4, HEADING_5,
    BULLET_ITEM, NUMBERED_ITEM, TASK_ITEM, QUOTE, CODE_BLOCK, DIVIDER,
}

/** TextAlign's four values (richTextSchema.js:61-66). */
enum class RichAlign { LEFT, CENTER, RIGHT, JUSTIFY }

/**
 * One editable paragraph/heading/list-item/quote/code block, or a divider.
 * [id] is local only (Compose keys and focus tracking), never serialized.
 *
 * [checked] only means anything on a [RichBlockKind.TASK_ITEM], and
 * [language] only on a [RichBlockKind.CODE_BLOCK]; both are carried
 * unchanged through a round-trip on every other kind so switching a block
 * back and forth doesn't lose them.
 */
data class RichBlock(
    val id: String,
    val kind: RichBlockKind,
    val text: String,
    val marks: List<RichMark> = emptyList(),
    val align: RichAlign = RichAlign.LEFT,
    val indent: Int = 0,
    val checked: Boolean = false,
    val language: String? = null,
)

/**
 * Kotlin model, parser and encoder for the Tiptap/ProseMirror JSON (see
 * NoteContent.kt for the envelope shape) the native rich-text editor can
 * edit: the same vocabulary richTextSchema.js configures on the web, one
 * node and one mark at a time.
 *
 * Nodes: paragraph, headings 1-5, bullet/numbered lists, task lists,
 * blockquote, code block, horizontal rule, hardBreak, plus the `indent`
 * and `textAlign` attributes those carry.
 *
 * Marks: bold, italic, underline (with its style and colour variants),
 * strike, link, inline code, subscript, superscript, highlight, and the
 * three textStyle attributes (colour, font family, font size).
 *
 * The document is FLAT: a list, a blockquote or a task list becomes a run
 * of consecutive blocks of the matching kind, which [encode] regroups back
 * into the nested nodes Tiptap expects. That mirrors how this project's
 * own Indent extension already works (it never nests lists, see its source
 * comment), and keeps one editable text field per visible line.
 *
 * [parse] still returns null rather than guess for anything outside that
 * vocabulary: a nested list or task list, a heading beyond level 5, a
 * table, an image node. NoteDetailScreen's existing "formatting not
 * available" fallback then opens the note read-only-ish in plain text, so
 * a round-trip through this editor can never quietly drop formatting.
 */
object RichDoc {
    private const val MAX_INDENT = 8

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
            when (nodeType(obj)) {
                "paragraph" -> blocks.add(parseTextBlock(obj, RichBlockKind.PARAGRAPH) ?: return null)
                "heading" -> blocks.add(parseHeading(obj) ?: return null)
                "bulletList" -> blocks.addAll(parseList(obj, RichBlockKind.BULLET_ITEM) ?: return null)
                "orderedList" -> blocks.addAll(parseList(obj, RichBlockKind.NUMBERED_ITEM) ?: return null)
                "taskList" -> blocks.addAll(parseTaskList(obj) ?: return null)
                "blockquote" -> blocks.addAll(parseBlockquote(obj) ?: return null)
                "codeBlock" -> blocks.add(parseCodeBlock(obj) ?: return null)
                "horizontalRule" -> blocks.add(newBlock(RichBlockKind.DIVIDER))
                else -> return null
            }
        }
        return blocks.ifEmpty { null }
    }

    private fun nodeType(node: JsonObject): String? = (node["type"] as? JsonPrimitive)?.contentOrNull

    private fun parseHeading(node: JsonObject): RichBlock? {
        val attrs = node["attrs"] as? JsonObject
        if (!attrsAreKnown(attrs, extraAllowedKeys = setOf("level"))) return null
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
     *  block of the matching kind. A listItem with more than one child or a
     *  nested list means "not this vocabulary". The indent lives on the
     *  listItem, not on its paragraph (Indent.js:69-75). */
    private fun parseList(node: JsonObject, itemKind: RichBlockKind): List<RichBlock>? {
        if (!attrsAreKnown(node["attrs"] as? JsonObject, extraAllowedKeys = setOf("start"))) return null
        val items = node["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (itemNode in items) {
            val itemObj = itemNode as? JsonObject ?: return null
            if (nodeType(itemObj) != "listItem") return null
            val itemAttrs = itemObj["attrs"] as? JsonObject
            if (!attrsAreKnown(itemAttrs)) return null
            val itemContent = itemObj["content"] as? JsonArray ?: return null
            if (itemContent.size != 1) return null
            val paragraphNode = itemContent[0] as? JsonObject ?: return null
            if (nodeType(paragraphNode) != "paragraph") return null
            val block = parseTextBlock(paragraphNode, itemKind) ?: return null
            blocks.add(block.copy(indent = readIndent(itemAttrs)))
        }
        return blocks
    }

    /** `taskList -> taskItem(checked) -> [paragraph]`. TaskItem is configured
     *  `nested: true` on the web, but a task item holding another task list
     *  has no flat representation here, so it rejects the whole doc rather
     *  than flatten the nesting away. */
    private fun parseTaskList(node: JsonObject): List<RichBlock>? {
        if (!attrsAreKnown(node["attrs"] as? JsonObject)) return null
        val items = node["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (itemNode in items) {
            val itemObj = itemNode as? JsonObject ?: return null
            if (nodeType(itemObj) != "taskItem") return null
            val itemAttrs = itemObj["attrs"] as? JsonObject
            if (!attrsAreKnown(itemAttrs, extraAllowedKeys = setOf("checked"))) return null
            val checked = (itemAttrs?.get("checked") as? JsonPrimitive)?.booleanOrNull ?: false
            val itemContent = itemObj["content"] as? JsonArray ?: return null
            if (itemContent.size != 1) return null
            val paragraphNode = itemContent[0] as? JsonObject ?: return null
            if (nodeType(paragraphNode) != "paragraph") return null
            val block = parseTextBlock(paragraphNode, RichBlockKind.TASK_ITEM) ?: return null
            blocks.add(block.copy(checked = checked, indent = readIndent(itemAttrs)))
        }
        return blocks
    }

    /** A blockquote holding N paragraphs becomes N consecutive QUOTE blocks,
     *  each carrying the quote's own indent so [encode] can put it back. */
    private fun parseBlockquote(node: JsonObject): List<RichBlock>? {
        val attrs = node["attrs"] as? JsonObject
        if (!attrsAreKnown(attrs)) return null
        val indent = readIndent(attrs)
        val content = node["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (child in content) {
            val childObj = child as? JsonObject ?: return null
            if (nodeType(childObj) != "paragraph") return null
            val block = parseTextBlock(childObj, RichBlockKind.QUOTE) ?: return null
            blocks.add(block.copy(indent = indent))
        }
        return blocks.ifEmpty { listOf(newBlock(RichBlockKind.QUOTE).copy(indent = indent)) }
    }

    /** A code block's content is plain text with real newlines in it (no
     *  marks, no hardBreak: ProseMirror's code blocks are `text*` with
     *  `code: true`), so it maps to one block whose text has "\n" in it. */
    private fun parseCodeBlock(node: JsonObject): RichBlock? {
        val attrs = node["attrs"] as? JsonObject
        if (!attrsAreKnown(attrs, extraAllowedKeys = setOf("language"))) return null
        val language = (attrs?.get("language") as? JsonPrimitive)?.contentOrNull
        val content = node["content"] as? JsonArray
        val sb = StringBuilder()
        if (content != null) {
            for (child in content) {
                val childObj = child as? JsonObject ?: return null
                if (nodeType(childObj) != "text") return null
                if (childObj["marks"] != null) return null
                sb.append((childObj["text"] as? JsonPrimitive)?.contentOrNull ?: return null)
            }
        }
        return RichBlock(
            id = UUID.randomUUID().toString(),
            kind = RichBlockKind.CODE_BLOCK,
            text = sb.toString(),
            indent = readIndent(attrs),
            language = language,
        )
    }

    private fun parseTextBlock(node: JsonObject, kind: RichBlockKind): RichBlock? {
        val attrs = node["attrs"] as? JsonObject
        val extra = if (kind.isHeading) setOf("level") else emptySet()
        if (!attrsAreKnown(attrs, extraAllowedKeys = extra)) return null
        val align = readAlign(attrs) ?: return null
        val inline = node["content"] as? JsonArray
        val (text, marks) = parseInline(inline) ?: return null
        return RichBlock(
            id = UUID.randomUUID().toString(),
            kind = kind,
            text = text,
            marks = marks,
            align = align,
            indent = readIndent(attrs),
        )
    }

    private fun parseInline(nodes: JsonArray?): Pair<String, List<RichMark>>? {
        if (nodes == null) return "" to emptyList()
        val sb = StringBuilder()
        val marks = mutableListOf<RichMark>()
        for (node in nodes) {
            val obj = node as? JsonObject ?: return null
            when (nodeType(obj)) {
                "text" -> {
                    val text = (obj["text"] as? JsonPrimitive)?.contentOrNull ?: return null
                    val start = sb.length
                    sb.append(text)
                    val end = sb.length
                    val markNodes = obj["marks"] as? JsonArray
                    if (markNodes != null) {
                        for (markNode in markNodes) {
                            val markObj = markNode as? JsonObject ?: return null
                            marks.addAll(parseMark(markObj, start, end) ?: return null)
                        }
                    }
                }
                "hardBreak" -> sb.append("\n")
                else -> return null
            }
        }
        return sb.toString() to mergeAdjacent(marks)
    }

    /** One Tiptap mark can become more than one [RichMark]: a `textStyle`
     *  carries up to three independent attributes (colour, family, size). */
    private fun parseMark(obj: JsonObject, start: Int, end: Int): List<RichMark>? {
        val attrs = obj["attrs"] as? JsonObject
        fun attr(key: String): String? = (attrs?.get(key) as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
        return when (nodeType(obj)) {
            "bold" -> if (attrs.isNullOrEmpty()) listOf(RichMark(start, end, RichMarkType.BOLD)) else null
            "italic" -> if (attrs.isNullOrEmpty()) listOf(RichMark(start, end, RichMarkType.ITALIC)) else null
            "strike" -> if (attrs.isNullOrEmpty()) listOf(RichMark(start, end, RichMarkType.STRIKE)) else null
            "code" -> listOf(RichMark(start, end, RichMarkType.CODE))
            "subscript" -> listOf(RichMark(start, end, RichMarkType.SUBSCRIPT))
            "superscript" -> listOf(RichMark(start, end, RichMarkType.SUPERSCRIPT))
            "highlight" -> listOf(RichMark(start, end, RichMarkType.HIGHLIGHT, value = attr("color") ?: DefaultHighlight))
            "underline" -> listOf(
                RichMark(start, end, RichMarkType.UNDERLINE, value = attr("style"), color = attr("color")),
            )
            "textStyle" -> {
                if (attrs == null) return emptyList()
                if (attrs.keys.any { it !in TEXT_STYLE_KEYS }) return null
                buildList {
                    attr("color")?.let { add(RichMark(start, end, RichMarkType.TEXT_COLOR, value = it)) }
                    attr("fontFamily")?.let { add(RichMark(start, end, RichMarkType.FONT_FAMILY, value = it)) }
                    attr("fontSize")?.let { add(RichMark(start, end, RichMarkType.FONT_SIZE, value = it)) }
                }
            }
            "link" -> {
                val href = attr("href")
                if (href == null) null else listOf(RichMark(start, end, RichMarkType.LINK, value = href))
            }
            else -> null
        }
    }

    /** Tiptap splits a run of text at every attribute change, so one visually
     *  continuous mark arrives as several adjacent instances. Gluing them
     *  back together keeps [isMarkActive] and the toolbar honest. */
    private fun mergeAdjacent(marks: List<RichMark>): List<RichMark> {
        val sorted = marks.sortedWith(compareBy({ it.type.ordinal }, { it.start }))
        val out = mutableListOf<RichMark>()
        for (m in sorted) {
            val last = out.lastOrNull()
            if (last != null && last.type == m.type && last.end == m.start &&
                last.value == m.value && last.color == m.color
            ) {
                out[out.lastIndex] = last.copy(end = m.end)
            } else {
                out.add(m)
            }
        }
        return out.sortedBy { it.start }
    }

    private val TEXT_STYLE_KEYS = setOf("color", "fontFamily", "fontSize")
    private val KNOWN_ATTR_KEYS = setOf("indent", "textAlign")

    /** The default highlight when a `highlight` mark carries no colour of
     *  its own: slot 1 of the palette (see RichPalettes.kt). */
    const val DefaultHighlight = "var(--rt-hl-1)"

    /** True when every attrs key is one this vocabulary knows about. A key
     *  it has never heard of rejects the whole doc rather than silently
     *  drop whatever it meant. */
    private fun attrsAreKnown(attrs: JsonObject?, extraAllowedKeys: Set<String> = emptySet()): Boolean {
        if (attrs.isNullOrEmpty()) return true
        val allowed = KNOWN_ATTR_KEYS + extraAllowedKeys
        return attrs.keys.all { it in allowed }
    }

    private fun readIndent(attrs: JsonObject?): Int =
        ((attrs?.get("indent") as? JsonPrimitive)?.intOrNull ?: 0).coerceIn(0, MAX_INDENT)

    /** null means "a textAlign value outside the four TextAlign offers",
     *  which rejects the doc; an absent attribute is simply LEFT. */
    private fun readAlign(attrs: JsonObject?): RichAlign? {
        val raw = (attrs?.get("textAlign") as? JsonPrimitive)?.contentOrNull ?: return RichAlign.LEFT
        return when (raw) {
            "left" -> RichAlign.LEFT
            "center" -> RichAlign.CENTER
            "right" -> RichAlign.RIGHT
            "justify" -> RichAlign.JUSTIFY
            else -> null
        }
    }

    // ---------------------------------------------------------------------
    // Encoding

    /** Serializes [blocks] back into the same envelope [parse] reads.
     *  Consecutive same-kind blocks are regrouped into the one nested node
     *  Tiptap expects (a list, a task list, a blockquote); only the attrs
     *  this editor actually sets are emitted, everything else is left for
     *  Tiptap's own schema defaults to fill in on the other end. */
    fun encode(blocks: List<RichBlock>): String {
        val nodes = mutableListOf<JsonObject>()
        var i = 0
        while (i < blocks.size) {
            val kind = blocks[i].kind
            val run = mutableListOf<RichBlock>()
            when (kind) {
                RichBlockKind.BULLET_ITEM, RichBlockKind.NUMBERED_ITEM -> {
                    while (i < blocks.size && blocks[i].kind == kind) run.add(blocks[i++])
                    nodes.add(
                        buildJsonObject {
                            put("type", if (kind == RichBlockKind.BULLET_ITEM) "bulletList" else "orderedList")
                            put("content", JsonArray(run.map { encodeListItem(it) }))
                        },
                    )
                }
                RichBlockKind.TASK_ITEM -> {
                    while (i < blocks.size && blocks[i].kind == kind) run.add(blocks[i++])
                    nodes.add(
                        buildJsonObject {
                            put("type", "taskList")
                            put("content", JsonArray(run.map { encodeTaskItem(it) }))
                        },
                    )
                }
                RichBlockKind.QUOTE -> {
                    while (i < blocks.size && blocks[i].kind == kind) run.add(blocks[i++])
                    nodes.add(
                        buildJsonObject {
                            put("type", "blockquote")
                            val indent = run.first().indent
                            if (indent > 0) put("attrs", buildJsonObject { put("indent", indent) })
                            put("content", JsonArray(run.map { encodeTextBlock(it, withIndent = false) }))
                        },
                    )
                }
                RichBlockKind.CODE_BLOCK -> {
                    nodes.add(encodeCodeBlock(blocks[i]))
                    i++
                }
                RichBlockKind.DIVIDER -> {
                    nodes.add(buildJsonObject { put("type", "horizontalRule") })
                    i++
                }
                else -> {
                    nodes.add(encodeTextBlock(blocks[i]))
                    i++
                }
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

    /** The indent lives on the `<li>`, never on its inner paragraph, so the
     *  bullet and its text shift together (Indent.js:69-75). */
    private fun encodeListItem(block: RichBlock): JsonObject = buildJsonObject {
        put("type", "listItem")
        if (block.indent > 0) put("attrs", buildJsonObject { put("indent", block.indent) })
        put("content", JsonArray(listOf(encodeTextBlock(block, withIndent = false))))
    }

    private fun encodeTaskItem(block: RichBlock): JsonObject = buildJsonObject {
        put("type", "taskItem")
        put(
            "attrs",
            buildJsonObject {
                put("checked", block.checked)
                if (block.indent > 0) put("indent", block.indent)
            },
        )
        put("content", JsonArray(listOf(encodeTextBlock(block, withIndent = false))))
    }

    private fun encodeCodeBlock(block: RichBlock): JsonObject = buildJsonObject {
        put("type", "codeBlock")
        val attrs = buildJsonObject {
            put("language", block.language)
            if (block.indent > 0) put("indent", block.indent)
        }
        put("attrs", attrs)
        if (block.text.isNotEmpty()) {
            put(
                "content",
                JsonArray(listOf(buildJsonObject { put("type", "text"); put("text", block.text) })),
            )
        }
    }

    private fun encodeTextBlock(block: RichBlock, withIndent: Boolean = true): JsonObject = buildJsonObject {
        val level = headingLevel(block.kind)
        put("type", if (level != null) "heading" else "paragraph")
        val attrs = buildJsonObject {
            if (level != null) put("level", level)
            if (block.align != RichAlign.LEFT) put("textAlign", block.align.name.lowercase())
            if (withIndent && block.indent > 0) put("indent", block.indent)
        }
        if (attrs.isNotEmpty()) put("attrs", attrs)
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
                            val encoded = encodeMarks(active)
                            if (encoded.isNotEmpty()) put("marks", JsonArray(encoded))
                        },
                    )
                }
            }
            lineStart = lineEnd + 1
            if (index < lines.lastIndex) result.add(buildJsonObject { put("type", "hardBreak") })
        }
        return result
    }

    /** The three textStyle attributes are three separate [RichMark]s here
     *  but ONE `textStyle` mark in Tiptap, so they are folded back together
     *  before being written out. */
    private fun encodeMarks(active: List<RichMark>): List<JsonObject> {
        val out = mutableListOf<JsonObject>()
        val textStyle = buildJsonObject {
            for (m in active) when (m.type) {
                RichMarkType.TEXT_COLOR -> put("color", m.value)
                RichMarkType.FONT_FAMILY -> put("fontFamily", m.value)
                RichMarkType.FONT_SIZE -> put("fontSize", m.value)
                else -> Unit
            }
        }
        if (textStyle.isNotEmpty()) {
            out.add(buildJsonObject { put("type", "textStyle"); put("attrs", textStyle) })
        }
        for (m in active) {
            val type = when (m.type) {
                RichMarkType.BOLD -> "bold"
                RichMarkType.ITALIC -> "italic"
                RichMarkType.UNDERLINE -> "underline"
                RichMarkType.STRIKE -> "strike"
                RichMarkType.LINK -> "link"
                RichMarkType.CODE -> "code"
                RichMarkType.SUBSCRIPT -> "subscript"
                RichMarkType.SUPERSCRIPT -> "superscript"
                RichMarkType.HIGHLIGHT -> "highlight"
                RichMarkType.TEXT_COLOR, RichMarkType.FONT_FAMILY, RichMarkType.FONT_SIZE -> continue
            }
            out.add(
                buildJsonObject {
                    put("type", type)
                    when (m.type) {
                        RichMarkType.LINK -> put("attrs", buildJsonObject { put("href", m.value.orEmpty()) })
                        RichMarkType.HIGHLIGHT -> put("attrs", buildJsonObject { put("color", m.value ?: DefaultHighlight) })
                        RichMarkType.UNDERLINE -> if (m.value != null || m.color != null) {
                            put(
                                "attrs",
                                buildJsonObject {
                                    if (m.value != null) put("style", m.value)
                                    if (m.color != null) put("color", m.color)
                                },
                            )
                        }
                        else -> Unit
                    }
                },
            )
        }
        return out
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

    /** The one mark instance of [type] covering the whole `[start, end)`
     *  range, or null when the range carries none, or more than one with
     *  different values (a selection spanning red and blue text). */
    fun markAt(marks: List<RichMark>, type: RichMarkType, start: Int, end: Int): RichMark? {
        val covering = marks.filter { it.type == type && it.start <= start && it.end >= end }
        return covering.distinctBy { it.value to it.color }.singleOrNull()
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

    /** Applies [type] over `[start, end)`, first clearing any existing
     *  same-type mark from that range so instances of one type never
     *  overlap each other. */
    fun setMark(
        marks: List<RichMark>,
        type: RichMarkType,
        start: Int,
        end: Int,
        value: String? = null,
        color: String? = null,
    ): List<RichMark> {
        if (start >= end) return marks
        val cleared = clearMark(marks, type, start, end)
        return (cleared + RichMark(start, end, type, value, color)).sortedBy { it.start }
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
     *  overlap, only a full one or an insertion at a mark's own end (see
     *  the inclusive-mark rule below); select it and toggle a mark
     *  explicitly otherwise. */
    fun adjustMarksForEdit(oldText: String, newText: String, marks: List<RichMark>): List<RichMark> {
        if (oldText == newText) return marks
        val span = diffEdit(oldText, newText)
        val insertion = span.oldEnd == span.start && span.newEnd > span.start
        return marks.mapNotNull { m ->
            when {
                // ProseMirror marks are inclusive by default: typing right
                // after a bold word keeps writing in bold. A link is the
                // exception Tiptap itself makes (inclusive: false), so text
                // typed after one is plain.
                insertion && m.end == span.start && m.type != RichMarkType.LINK ->
                    m.copy(end = m.end + span.delta)
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

val RichBlockKind.isHeading: Boolean
    get() = this == RichBlockKind.HEADING_1 || this == RichBlockKind.HEADING_2 ||
        this == RichBlockKind.HEADING_3 || this == RichBlockKind.HEADING_4 ||
        this == RichBlockKind.HEADING_5

/** True for the kinds that hold editable inline text (everything but the
 *  divider, which has no text field at all). */
val RichBlockKind.hasText: Boolean
    get() = this != RichBlockKind.DIVIDER
