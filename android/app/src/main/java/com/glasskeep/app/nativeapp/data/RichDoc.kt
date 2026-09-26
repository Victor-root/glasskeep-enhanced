package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
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
 * [indent] is the Indent extension's attribute: on the `<li>` of a bullet
 * or ordered item, on the paragraph of a task item (Indent.js skips only
 * listItem paragraphs), on the node itself everywhere else. [nestLevel] is
 * a list item's structural depth: 0 for an item of a top-level list, 1 for
 * an item of a list nested inside another item (Tab / sinkListItem on the
 * web), and so on. It is always 0 on anything that is not a list item.
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
    val nestLevel: Int = 0,
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
 * The editor model is flat: a list, blockquote or task list becomes a run
 * of consecutive blocks. Structurally nested Tiptap lists keep their depth
 * in [RichBlock.nestLevel], and [encode] nests them back the same way, so
 * one editable text field per visible line never changes the structure of
 * a note written on the web.
 *
 * [parse] still returns null rather than guess for anything outside that
 * vocabulary: a heading beyond level 5, a table, an image node.
 * NoteDetailScreen's existing "formatting not
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

    /** Card previews only paint the document's first [maxNodes] top-level
     *  nodes, a whole list or quote counting as one, as contentToHTMLPreview()
     *  does on the web; the rest is not parsed, so an unsupported node much
     *  later in the document cannot turn the whole closed card into its raw
     *  JSON envelope. */
    fun parsePreview(content: String?, maxNodes: Int = 8): List<RichBlock>? {
        if (maxNodes <= 0) return emptyList()
        val doc = NoteContent.parseRichDoc(content) ?: return null
        return try {
            parseDoc(doc, maxNodes)
        } catch (_: Exception) {
            null
        }
    }

    private fun parseDoc(doc: JsonObject, maxNodes: Int = Int.MAX_VALUE): List<RichBlock>? {
        val topLevel = doc["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (node in topLevel.take(maxNodes)) {
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

    /** `list -> listItem[] -> [paragraph, nestedList*]`. Nested children
     *  follow their parent item in document order, one [RichBlock.nestLevel]
     *  deeper. The Indent extension's attribute lives on the `<li>`. */
    private fun parseList(
        node: JsonObject,
        itemKind: RichBlockKind,
        nestingDepth: Int = 0,
    ): List<RichBlock>? {
        if (!attrsAreKnown(node["attrs"] as? JsonObject, extraAllowedKeys = setOf("start"))) return null
        val items = node["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (itemNode in items) {
            val itemObj = itemNode as? JsonObject ?: return null
            if (nodeType(itemObj) != "listItem") return null
            val itemAttrs = itemObj["attrs"] as? JsonObject
            if (!attrsAreKnown(itemAttrs)) return null
            val itemContent = itemObj["content"] as? JsonArray ?: return null
            if (itemContent.isEmpty()) return null
            val paragraphNode = itemContent[0] as? JsonObject ?: return null
            if (nodeType(paragraphNode) != "paragraph") return null
            val block = parseTextBlock(paragraphNode, itemKind) ?: return null
            blocks.add(block.copy(indent = readIndent(itemAttrs), nestLevel = nestingDepth))
            for (child in itemContent.drop(1)) {
                val childObj = child as? JsonObject ?: return null
                blocks.addAll(parseNestedList(childObj, nestingDepth + 1) ?: return null)
            }
        }
        return blocks
    }

    /** TaskItem is configured `nested: true` on the web and has no indent
     *  attribute of its own: Indent.js puts it on the item's paragraph. An
     *  indent on the taskItem itself is only ever one an earlier version of
     *  this app wrote, still read so those notes keep their look. */
    private fun parseTaskList(node: JsonObject, nestingDepth: Int = 0): List<RichBlock>? {
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
            if (itemContent.isEmpty()) return null
            val paragraphNode = itemContent[0] as? JsonObject ?: return null
            if (nodeType(paragraphNode) != "paragraph") return null
            val block = parseTextBlock(paragraphNode, RichBlockKind.TASK_ITEM) ?: return null
            blocks.add(
                block.copy(
                    checked = checked,
                    indent = block.indent.takeIf { it > 0 } ?: readIndent(itemAttrs),
                    nestLevel = nestingDepth,
                ),
            )
            for (child in itemContent.drop(1)) {
                val childObj = child as? JsonObject ?: return null
                blocks.addAll(parseNestedList(childObj, nestingDepth + 1) ?: return null)
            }
        }
        return blocks
    }

    private fun parseNestedList(node: JsonObject, nestingDepth: Int): List<RichBlock>? =
        when (nodeType(node)) {
            "bulletList" -> parseList(node, RichBlockKind.BULLET_ITEM, nestingDepth)
            "orderedList" -> parseList(node, RichBlockKind.NUMBERED_ITEM, nestingDepth)
            "taskList" -> parseTaskList(node, nestingDepth)
            else -> null
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
            "highlight" -> listOf(RichMark(start, end, RichMarkType.HIGHLIGHT, value = attr("color")))
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

    /** The highlight button's swatch while nothing is highlighted
     *  (DEFAULT_HIGHLIGHT_SWATCH): slot 1 of the palette. */
    const val DefaultHighlight = "var(--rt-hl-1)"

    /** True when every attrs key is one this vocabulary knows about, or is
     *  left unset: Tiptap writes every attribute its schema declares, so a
     *  newer one arrives as null on notes that never used it (orderedList's
     *  `type`), with nothing to keep. A key it has never heard of that does
     *  carry a value rejects the whole doc rather than silently drop
     *  whatever it meant. */
    private fun attrsAreKnown(attrs: JsonObject?, extraAllowedKeys: Set<String> = emptySet()): Boolean {
        if (attrs.isNullOrEmpty()) return true
        val allowed = KNOWN_ATTR_KEYS + extraAllowedKeys
        return attrs.all { (key, value) -> key in allowed || value is JsonNull }
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
     *  Tiptap expects (a list, a task list, a blockquote), list items are
     *  nested back under their parent item by [RichBlock.nestLevel]; only
     *  the attrs this editor actually sets are emitted, everything else is
     *  left for Tiptap's own schema defaults to fill in on the other end. */
    fun encode(blocks: List<RichBlock>): String {
        val normalized = normalizeNesting(blocks)
        val nodes = mutableListOf<JsonObject>()
        var i = 0
        while (i < normalized.size) {
            val block = normalized[i]
            when (block.kind) {
                RichBlockKind.BULLET_ITEM, RichBlockKind.NUMBERED_ITEM, RichBlockKind.TASK_ITEM -> {
                    // One top-level list: its own items plus everything
                    // nested under them.
                    var end = i + 1
                    while (end < normalized.size && normalized[end].kind.isListItem &&
                        (normalized[end].nestLevel > 0 || normalized[end].kind == block.kind)
                    ) {
                        end++
                    }
                    nodes.add(encodeList(normalized.subList(i, end)))
                    i = end
                }
                RichBlockKind.QUOTE -> {
                    var end = i + 1
                    while (end < normalized.size && normalized[end].kind == RichBlockKind.QUOTE) end++
                    val run = normalized.subList(i, end)
                    nodes.add(
                        buildJsonObject {
                            put("type", "blockquote")
                            if (block.indent > 0) put("attrs", buildJsonObject { put("indent", block.indent) })
                            put("content", JsonArray(run.map { encodeTextBlock(it, withIndent = false) }))
                        },
                    )
                    i = end
                }
                RichBlockKind.CODE_BLOCK -> {
                    nodes.add(encodeCodeBlock(block))
                    i++
                }
                RichBlockKind.DIVIDER -> {
                    nodes.add(buildJsonObject { put("type", "horizontalRule") })
                    i++
                }
                else -> {
                    nodes.add(encodeTextBlock(block))
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

    /** One list: [items] starts with an item of the list's own level, every
     *  later item of that level has the same kind, and each deeper item
     *  belongs to the item of this level before it. */
    private fun encodeList(items: List<RichBlock>): JsonObject {
        val level = items.first().nestLevel
        val kind = items.first().kind
        val encoded = mutableListOf<JsonObject>()
        var j = 0
        while (j < items.size) {
            var next = j + 1
            while (next < items.size && items[next].nestLevel > level) next++
            encoded.add(encodeListItem(items[j], items.subList(j + 1, next)))
            j = next
        }
        return buildJsonObject {
            put(
                "type",
                when (kind) {
                    RichBlockKind.BULLET_ITEM -> "bulletList"
                    RichBlockKind.NUMBERED_ITEM -> "orderedList"
                    else -> "taskList"
                },
            )
            put("content", JsonArray(encoded))
        }
    }

    /** A list item and the lists nested under it, one per run of same-kind
     *  children. A bullet or ordered item carries its indent on the `<li>`
     *  so the marker and the text shift together (Indent.js:69-75); a task
     *  item has no indent attribute, its paragraph carries it. */
    private fun encodeListItem(item: RichBlock, children: List<RichBlock>): JsonObject {
        val nested = mutableListOf<JsonObject>()
        var c = 0
        while (c < children.size) {
            val level = children[c].nestLevel
            var end = c + 1
            while (end < children.size &&
                (children[end].nestLevel > level || children[end].kind == children[c].kind)
            ) {
                end++
            }
            nested.add(encodeList(children.subList(c, end)))
            c = end
        }
        val task = item.kind == RichBlockKind.TASK_ITEM
        return buildJsonObject {
            put("type", if (task) "taskItem" else "listItem")
            if (task) {
                put("attrs", buildJsonObject { put("checked", item.checked) })
            } else if (item.indent > 0) {
                put("attrs", buildJsonObject { put("indent", item.indent) })
            }
            put("content", JsonArray(listOf(encodeTextBlock(item, withIndent = task)) + nested))
        }
    }

    /** A list item can only sit one level below the item before it, and a
     *  list always starts at the top level; anything else (left behind by
     *  deleting a parent item, for instance) is pulled back up. Non-list
     *  blocks never carry a level. */
    fun normalizeNesting(blocks: List<RichBlock>): List<RichBlock> {
        var previous: RichBlock? = null
        return blocks.map { block ->
            val maxLevel = previous?.takeIf { it.kind.isListItem }?.let { it.nestLevel + 1 } ?: 0
            val level = if (block.kind.isListItem) block.nestLevel.coerceIn(0, maxLevel) else 0
            val fixed = if (level == block.nestLevel) block else block.copy(nestLevel = level)
            previous = fixed
            fixed
        }
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
                        RichMarkType.HIGHLIGHT -> put("attrs", buildJsonObject { put("color", m.value) })
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

    /** ProseMirror's `$from.marks()` for a collapsed caret: the marks of the
     *  character before it, or of the first character at the very start of
     *  a block. Every mark of this schema is inclusive (the link too, since
     *  the web turns autolink on), so a mark ending at the caret counts and
     *  what gets typed there carries it. An empty block has none. */
    fun marksAtCaret(marks: List<RichMark>, textLength: Int, caret: Int): List<RichMark> {
        if (textLength == 0) return emptyList()
        val at = (caret - 1).coerceIn(0, textLength - 1)
        return marks.filter { it.start <= at && it.end > at }
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
     *  overlap, only a full one or an insertion where [marksAtCaret] says
     *  the mark applies; select it and toggle a mark explicitly otherwise. */
    fun adjustMarksForEdit(oldText: String, newText: String, marks: List<RichMark>): List<RichMark> {
        if (oldText == newText) return marks
        val span = diffEdit(oldText, newText)
        val insertion = span.oldEnd == span.start && span.newEnd > span.start
        return marks.mapNotNull { m ->
            when {
                // Inclusive marks: typing right after a bold word (or a
                // link) keeps writing in it, and typing at the very start
                // of a block takes the marks of its first character.
                insertion && m.end == span.start -> m.copy(end = m.end + span.delta)
                insertion && span.start == 0 && m.start == 0 && oldText.isNotEmpty() ->
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

    /** LinkPopover.jsx's ensureSchemeURL: an http(s), mailto or tel link is
     *  kept as typed, an e-mail address becomes a mailto: link, a phone
     *  number a tel: link of its digits, anything else an https:// one. */
    fun ensureSchemeUrl(raw: String): String {
        val value = raw.trim()
        return when {
            value.isEmpty() -> ""
            UrlSchemeRegex.containsMatchIn(value) -> value
            BareEmailRegex.matches(value) -> "mailto:$value"
            BarePhoneRegex.matches(value) -> "tel:" + value.filter { it in '0'..'9' || it == '+' }
            else -> "https://$value"
        }
    }

    /** linkifyContactsHTML (utils/markdown.jsx:127-218): the read view turns
     *  phone numbers and e-mail addresses into tel:/mailto: links. The web
     *  searches each DOM text node on its own, so this searches each run of
     *  text sharing one set of marks, between line breaks, and skips runs
     *  already inside a link or inline code. */
    fun contactLinks(text: String, marks: List<RichMark>): List<RichMark> {
        if (text.isEmpty()) return emptyList()
        val cuts = sortedSetOf(0, text.length)
        for (m in marks) {
            cuts.add(m.start.coerceIn(0, text.length))
            cuts.add(m.end.coerceIn(0, text.length))
        }
        text.forEachIndexed { index, c ->
            if (c == '\n') {
                cuts.add(index)
                cuts.add(index + 1)
            }
        }
        val points = cuts.toList()
        val links = mutableListOf<RichMark>()
        for (k in 0 until points.size - 1) {
            val start = points[k]
            val end = points[k + 1]
            if (start >= end || text[start] == '\n') continue
            val insideLinkOrCode = marks.any {
                (it.type == RichMarkType.LINK || it.type == RichMarkType.CODE) && it.start <= start && it.end >= end
            }
            if (insideLinkOrCode) continue
            for (match in ContactRegex.findAll(text.substring(start, end))) {
                val href = if (match.groups[1] != null) {
                    "tel:" + match.value.filterNot { it in PhoneSeparators || JsWhitespaceRegex.matches(it.toString()) }
                } else {
                    "mailto:${match.value}"
                }
                links.add(RichMark(start + match.range.first, start + match.range.last + 1, RichMarkType.LINK, href))
            }
        }
        return links
    }

    /** JavaScript's `\s`, which also matches the no-break and typographic
     *  spaces a French phone number is often written with. */
    internal const val JsSpace = "\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff"
    private val JsWhitespaceRegex = Regex("[$JsSpace]")
    private const val PhoneSeparators = ".()-"
    private val UrlSchemeRegex = Regex("^(https?|mailto|tel):", RegexOption.IGNORE_CASE)
    private val BareEmailRegex = Regex("^[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}$", RegexOption.IGNORE_CASE)
    private val BarePhoneRegex = Regex("^\\+?\\d[\\d$JsSpace().-]+$")
    private const val PhonePattern =
        "(?:\\+1[$JsSpace.-]?)?\\(\\d{3}\\)[$JsSpace.-]?\\d{3}[$JsSpace.-]?\\d{4}" +
            "|(?:\\+1[$JsSpace.-]?)?\\d{3}[$JsSpace.-]\\d{3}[$JsSpace.-]\\d{4}" +
            "|\\+33[$JsSpace.-]?\\d[$JsSpace.-]?\\d{2}[$JsSpace.-]?\\d{2}[$JsSpace.-]?\\d{2}[$JsSpace.-]?\\d{2}" +
            "|0\\d[$JsSpace.-]?\\d{2}[$JsSpace.-]?\\d{2}[$JsSpace.-]?\\d{2}[$JsSpace.-]?\\d{2}"
    private const val EmailPattern = "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
    private val ContactRegex = Regex("($PhonePattern)|($EmailPattern)")
}

val RichBlockKind.isHeading: Boolean
    get() = this == RichBlockKind.HEADING_1 || this == RichBlockKind.HEADING_2 ||
        this == RichBlockKind.HEADING_3 || this == RichBlockKind.HEADING_4 ||
        this == RichBlockKind.HEADING_5

/** True for the kinds that hold editable inline text (everything but the
 *  divider, which has no text field at all). */
val RichBlockKind.hasText: Boolean
    get() = this != RichBlockKind.DIVIDER

val RichBlockKind.isListItem: Boolean
    get() = this == RichBlockKind.BULLET_ITEM || this == RichBlockKind.NUMBERED_ITEM ||
        this == RichBlockKind.TASK_ITEM
