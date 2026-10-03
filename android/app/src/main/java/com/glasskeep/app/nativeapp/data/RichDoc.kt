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
    BULLET_ITEM, NUMBERED_ITEM, TASK_ITEM, CODE_BLOCK, DIVIDER,
}

/** TextAlign's four values (richTextSchema.js:61-66). */
enum class RichAlign { LEFT, CENTER, RIGHT, JUSTIFY }

/**
 * A blockquote holding blocks. [id] is local only, never serialized: it
 * tells apart two quotes that follow each other, which the web keeps as two
 * cards. [indent] is the quote's own Indent attribute.
 */
data class RichQuote(val id: String = UUID.randomUUID().toString(), val indent: Int = 0)

/**
 * One editable paragraph/heading/list-item/code block, or a divider.
 * [id] is local only (Compose keys and focus tracking), never serialized.
 *
 * [indent] is the Indent extension's attribute: on the `<li>` of a bullet
 * or ordered item, on the paragraph of a task item (Indent.js skips only
 * listItem paragraphs), on the node itself everywhere else. [lineIndent]
 * is a bullet or ordered item's paragraph's own: Indent.js never moves it,
 * but a paragraph put in a list keeps its indent there, and Enter passes
 * it on; it shifts the item's text, not its marker. [nestLevel] is
 * how many list items hold the block: for a list item, 0 in a top-level
 * list, 1 in a list nested inside another item (Tab / sinkListItem on the
 * web), and so on; for anything else, 0 outside any list, 1 for a
 * paragraph, heading, code block or rule a top-level item holds after its
 * own paragraph (where the web puts a rule or a pasted line typed in an
 * item), and so on.
 *
 * [quotes] are the quotes holding the block, outermost first, none outside
 * any: consecutive blocks of one quote make one blockquote, lists, headings
 * and quotes included. A quote never sits inside a list item here.
 *
 * [checked] only means anything on a [RichBlockKind.TASK_ITEM], and
 * [language] only on a [RichBlockKind.CODE_BLOCK]; both are carried
 * unchanged through a round-trip on every other kind so switching a block
 * back and forth doesn't lose them.
 *
 * [listStart] is an ordered list's `start` other than 1 (a list the web
 * began with "3. "), carried by the item that heads the list: the web's
 * numbering is its own CSS counter and does not show it, but a copy
 * numbers the list's text from it and saving keeps it.
 *
 * [listId] is the list a list item belongs to, local only, never
 * serialized: it tells apart two lists of one kind that follow each
 * other, which the web keeps as two lists and numbers apart. The items of
 * one list at one level share it.
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
    val quotes: List<RichQuote> = emptyList(),
    val listStart: Int? = null,
    val lineIndent: Int = 0,
    val listId: String? = null,
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
 * of consecutive blocks. Structurally nested Tiptap lists, and the blocks a
 * list item holds after its paragraph, keep their depth in
 * [RichBlock.nestLevel], the blocks of a blockquote carry it in
 * [RichBlock.quotes], and [encode] nests both back the same way, so one
 * editable text field per visible line never changes the structure of a
 * note written on the web.
 *
 * [parse] still returns null rather than guess for anything outside that
 * vocabulary: a heading beyond level 5, a quote inside a list item, a
 * table, an image node. NoteDetailScreen's existing "formatting not
 * available" fallback then opens the note read-only-ish in plain text, so
 * a round-trip through this editor can never quietly drop formatting.
 */
object RichDoc {
    /** Indent.js's `max`: the deepest indent a block or a quote takes. */
    const val MaxIndent = 8

    /** Parses `content` into editable blocks, or null when it isn't rich
     *  Tiptap content at all, or uses anything outside the vocabulary above. */
    fun parse(content: String?): List<RichBlock>? = NoteContent.parseRichDoc(content)?.let(::parseDocJson)

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

    /** A Tiptap `doc` node as blocks, or null when it uses anything outside
     *  the vocabulary above. */
    internal fun parseDocJson(doc: JsonObject): List<RichBlock>? = try {
        parseDoc(doc)
    } catch (_: Exception) {
        null
    }

    private fun parseDoc(doc: JsonObject, maxNodes: Int = Int.MAX_VALUE): List<RichBlock>? {
        val topLevel = doc["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (node in topLevel.take(maxNodes)) {
            val obj = node as? JsonObject ?: return null
            blocks.addAll(parseNode(obj, quotes = emptyList(), depth = 0) ?: return null)
        }
        return blocks.ifEmpty { null }
    }

    /** One block node, as its blocks: held by [quotes], and by [depth] list
     *  items when it follows an item's own paragraph. */
    private fun parseNode(node: JsonObject, quotes: List<RichQuote>, depth: Int): List<RichBlock>? {
        val block = when (nodeType(node)) {
            "paragraph" -> parseTextBlock(node, RichBlockKind.PARAGRAPH)
            "heading" -> parseHeading(node)
            "codeBlock" -> parseCodeBlock(node)
            "horizontalRule" -> newBlock(RichBlockKind.DIVIDER)
            "bulletList" -> return parseList(node, RichBlockKind.BULLET_ITEM, quotes, depth)
            "orderedList" -> return parseList(node, RichBlockKind.NUMBERED_ITEM, quotes, depth)
            "taskList" -> return parseTaskList(node, quotes, depth)
            "blockquote" -> return if (depth == 0) parseBlockquote(node, quotes) else null
            else -> null
        } ?: return null
        return listOf(block.copy(nestLevel = depth, quotes = quotes))
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

    /** `list -> listItem[] -> [paragraph, block*]`. What an item holds after
     *  its paragraph (nested lists, paragraphs, headings, code, rules)
     *  follows it in document order, one [RichBlock.nestLevel] deeper. The
     *  Indent extension's attribute lives on the `<li>`. */
    private fun parseList(
        node: JsonObject,
        itemKind: RichBlockKind,
        quotes: List<RichQuote>,
        nestingDepth: Int,
    ): List<RichBlock>? {
        val attrs = node["attrs"] as? JsonObject
        // An ordered list's `type` (a, i...) is read and not kept: nothing on
        // the web uses it, its numbers being its own CSS counter.
        if (!attrsAreKnown(attrs, extraAllowedKeys = setOf("start", "type"))) return null
        val start = (attrs?.get("start") as? JsonPrimitive)?.intOrNull?.takeIf { itemKind == RichBlockKind.NUMBERED_ITEM && it != 1 }
        val items = node["content"] as? JsonArray ?: return null
        val listId = UUID.randomUUID().toString()
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
            val head = start.takeIf { blocks.isEmpty() }
            blocks.add(
                block.copy(
                    indent = readIndent(itemAttrs),
                    lineIndent = block.indent,
                    nestLevel = nestingDepth,
                    quotes = quotes,
                    listStart = head,
                    listId = listId,
                ),
            )
            for (child in itemContent.drop(1)) {
                val childObj = child as? JsonObject ?: return null
                blocks.addAll(parseNode(childObj, quotes, nestingDepth + 1) ?: return null)
            }
        }
        return blocks
    }

    /** TaskItem is configured `nested: true` on the web and has no indent
     *  attribute of its own: Indent.js puts it on the item's paragraph. An
     *  indent on the taskItem itself is only ever one an earlier version of
     *  this app wrote, still read so those notes keep their look. */
    private fun parseTaskList(node: JsonObject, quotes: List<RichQuote>, nestingDepth: Int): List<RichBlock>? {
        if (!attrsAreKnown(node["attrs"] as? JsonObject)) return null
        val items = node["content"] as? JsonArray ?: return null
        val listId = UUID.randomUUID().toString()
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
                    quotes = quotes,
                    listId = listId,
                ),
            )
            for (child in itemContent.drop(1)) {
                val childObj = child as? JsonObject ?: return null
                blocks.addAll(parseNode(childObj, quotes, nestingDepth + 1) ?: return null)
            }
        }
        return blocks
    }

    /** A blockquote's children (`block+`: paragraphs, headings, lists, code,
     *  rules, quotes) become their own blocks, each held by the quotes
     *  around this one and by this one, whose [RichQuote] keeps its indent.
     *  An empty quote keeps one empty paragraph. */
    private fun parseBlockquote(node: JsonObject, outer: List<RichQuote>): List<RichBlock>? {
        val attrs = node["attrs"] as? JsonObject
        if (!attrsAreKnown(attrs)) return null
        val quotes = outer + RichQuote(indent = readIndent(attrs))
        val content = node["content"] as? JsonArray ?: return null
        val blocks = mutableListOf<RichBlock>()
        for (child in content) {
            val childObj = child as? JsonObject ?: return null
            blocks.addAll(parseNode(childObj, quotes, depth = 0) ?: return null)
        }
        return blocks.ifEmpty { listOf(newBlock().copy(quotes = quotes)) }
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
            val start = sb.length
            when (nodeType(obj)) {
                "text" -> sb.append((obj["text"] as? JsonPrimitive)?.contentOrNull ?: return null)
                // A hardBreak carries the marks of the text around it, as
                // the text does.
                "hardBreak" -> sb.append("\n")
                else -> return null
            }
            for (markNode in obj["marks"] as? JsonArray ?: JsonArray(emptyList())) {
                val markObj = markNode as? JsonObject ?: return null
                marks.addAll(parseMark(markObj, start, sb.length) ?: return null)
            }
        }
        return sb.toString() to mergeAdjacent(marks)
    }

    /** One Tiptap mark can become more than one [RichMark]: a `textStyle`
     *  carries up to three independent attributes (colour, family, size). */
    internal fun parseMark(obj: JsonObject, start: Int, end: Int): List<RichMark>? {
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
     *  back together keeps the toolbar honest. */
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
        ((attrs?.get("indent") as? JsonPrimitive)?.intOrNull ?: 0).coerceIn(0, MaxIndent)

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
     *  Consecutive blocks of one quote are regrouped into their blockquote
     *  and consecutive items of one list into the one nested node Tiptap
     *  expects (a list, a task list), list items and what they hold are
     *  nested back under their parent item by [RichBlock.nestLevel]; only
     *  the attrs this editor actually sets are emitted, everything else is
     *  left for Tiptap's own schema defaults to fill in on the other end. */
    fun encode(blocks: List<RichBlock>): String {
        val envelope = buildJsonObject {
            put("v", 1)
            put("format", "tiptap")
            put("doc", encodeDoc(blocks))
        }
        return envelope.toString()
    }

    /** The Tiptap `doc` node of [blocks], one textblock or rule per block
     *  in document order. */
    internal fun encodeDoc(blocks: List<RichBlock>): JsonObject {
        val nodes = encodeQuoted(normalizeNesting(blocks), depth = 0)
        return buildJsonObject {
            put("type", "doc")
            put("content", JsonArray(nodes.ifEmpty { listOf(buildJsonObject { put("type", "paragraph") }) }))
        }
    }

    /** The nodes of [blocks], all held by the same [depth] quotes: a run of
     *  them held by one quote more becomes that blockquote. */
    private fun encodeQuoted(blocks: List<RichBlock>, depth: Int): List<JsonObject> {
        val nodes = mutableListOf<JsonObject>()
        var i = 0
        while (i < blocks.size) {
            val quote = blocks[i].quotes.getOrNull(depth)
            var end = i + 1
            while (end < blocks.size && blocks[end].quotes.getOrNull(depth)?.id == quote?.id) end++
            val run = blocks.subList(i, end)
            if (quote == null) {
                nodes.addAll(encodeNodes(run))
            } else {
                nodes.add(
                    buildJsonObject {
                        put("type", "blockquote")
                        if (quote.indent > 0) put("attrs", buildJsonObject { put("indent", quote.indent) })
                        put("content", JsonArray(encodeQuoted(run, depth + 1)))
                    },
                )
            }
            i = end
        }
        return nodes
    }

    /** The nodes of [blocks], all held by the same quotes. */
    private fun encodeNodes(blocks: List<RichBlock>): List<JsonObject> {
        val nodes = mutableListOf<JsonObject>()
        var i = 0
        while (i < blocks.size) {
            val block = blocks[i]
            if (block.kind.isListItem) {
                // One top-level list: its own items plus everything nested
                // in them.
                var end = i + 1
                while (end < blocks.size && (blocks[end].nestLevel > 0 || blocks[end].continuesList(block))) end++
                nodes.add(encodeList(blocks.subList(i, end)))
                i = end
            } else {
                nodes.add(encodeLeaf(block))
                i++
            }
        }
        return nodes
    }

    /** A paragraph, heading, code block or rule. */
    private fun encodeLeaf(block: RichBlock): JsonObject = when (block.kind) {
        RichBlockKind.CODE_BLOCK -> encodeCodeBlock(block)
        RichBlockKind.DIVIDER -> buildJsonObject { put("type", "horizontalRule") }
        else -> encodeTextBlock(block)
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
            items.first().listStart?.takeIf { kind == RichBlockKind.NUMBERED_ITEM }?.let { start ->
                put("attrs", buildJsonObject { put("start", start) })
            }
            put("content", JsonArray(encoded))
        }
    }

    /** A list item and what it holds after its paragraph, in order: its
     *  own blocks, and the lists nested in it, one per run of the items of
     *  one list. A bullet or ordered item carries its indent on the `<li>`
     *  so the marker and the text shift together (Indent.js:69-75), its
     *  paragraph its [RichBlock.lineIndent]; a task item has no indent
     *  attribute, its paragraph carries it. */
    private fun encodeListItem(item: RichBlock, children: List<RichBlock>): JsonObject {
        val nested = mutableListOf<JsonObject>()
        var c = 0
        while (c < children.size) {
            val child = children[c]
            if (!child.kind.isListItem) {
                nested.add(encodeLeaf(child))
                c++
                continue
            }
            var end = c + 1
            while (end < children.size && (children[end].nestLevel > child.nestLevel || children[end].continuesList(child))) end++
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
            put("content", JsonArray(listOf(encodeTextBlock(item, indent = if (task) item.indent else item.lineIndent)) + nested))
        }
    }

    /** A block can only sit in the list items holding the block before it,
     *  or in the one that block opens, and only when both are in the same
     *  quotes: a list always starts at the top level of its quote; anything
     *  else (left behind by deleting a parent item, for instance) is pulled
     *  back up. */
    fun normalizeNesting(blocks: List<RichBlock>): List<RichBlock> {
        var previous: RichBlock? = null
        return blocks.map { block ->
            val maxLevel = previous?.takeIf { it.sharesQuoteWith(block) }?.listDepth ?: 0
            val level = block.nestLevel.coerceIn(0, maxLevel)
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

    private fun encodeTextBlock(block: RichBlock, indent: Int = block.indent): JsonObject = buildJsonObject {
        val level = headingLevel(block.kind)
        put("type", if (level != null) "heading" else "paragraph")
        val attrs = buildJsonObject {
            if (level != null) put("level", level)
            if (block.align != RichAlign.LEFT) put("textAlign", block.align.name.lowercase())
            if (indent > 0) put("indent", indent)
        }
        if (attrs.isNotEmpty()) put("attrs", attrs)
        val inline = encodeInline(block.text, block.marks)
        if (inline.isNotEmpty()) put("content", JsonArray(inline))
    }

    internal fun headingLevel(kind: RichBlockKind): Int? = when (kind) {
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
     *  own doc.toJSON() never mixes marks within a single text node. Each
     *  hardBreak keeps the marks over its "\n". */
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
            if (index < lines.lastIndex) {
                val encoded = encodeMarks(marks.filter { it.start <= lineEnd && it.end >= lineStart })
                result.add(
                    buildJsonObject {
                        put("type", "hardBreak")
                        if (encoded.isNotEmpty()) put("marks", JsonArray(encoded))
                    },
                )
            }
        }
        return result
    }

    /** The three textStyle attributes are three separate [RichMark]s here
     *  but ONE `textStyle` mark in Tiptap, so they are folded back together
     *  before being written out. */
    internal fun encodeMarks(active: List<RichMark>): List<JsonObject> {
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
        if (start >= end) return marks
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

    /** Every type dropped from `[start, end)` at once. */
    private fun clearAllMarks(marks: List<RichMark>, start: Int, end: Int): List<RichMark> =
        RichMarkType.entries.fold(marks) { acc, type -> clearMark(acc, type, start, end) }

    /** Applies [type] over `[start, end)` as ProseMirror's addMark does: a
     *  same-type mark there gives way, so instances of one type never
     *  overlap, and the new one joins an identical one it touches. Inline
     *  code takes no other mark (`excludes: "_"`): set, it drops every
     *  other one from the range; any other mark skips the code there. */
    fun setMark(
        marks: List<RichMark>,
        type: RichMarkType,
        start: Int,
        end: Int,
        value: String? = null,
        color: String? = null,
    ): List<RichMark> {
        if (start >= end) return marks
        if (type == RichMarkType.CODE) return mergeAdjacent(clearAllMarks(marks, start, end) + RichMark(start, end, type))
        val added = mutableListOf<RichMark>()
        var at = start
        for (code in marks.filter { it.type == RichMarkType.CODE && it.start < end && it.end > start }.sortedBy { it.start }) {
            if (code.start > at) added += RichMark(at, code.start, type, value, color)
            at = maxOf(at, code.end)
        }
        if (at < end) added += RichMark(at, end, type, value, color)
        return mergeAdjacent(added.fold(marks) { acc, m -> clearMark(acc, type, m.start, m.end) } + added)
    }

    /** Keeps only the marks (or the surviving part of a partially-overlapping
     *  one) inside `[from, to)`, re-based to start at 0. Used when a block's
     *  text is cut in two (Enter splits it into two blocks). */
    fun clipMarks(marks: List<RichMark>, from: Int, to: Int): List<RichMark> =
        marks.mapNotNull { m ->
            val start = m.start.coerceIn(from, to)
            val end = m.end.coerceIn(from, to)
            if (start < end) m.copy(start = start - from, end = end - from) else null
        }

    /**
     * [marks] once `[from, to)` of a text [textLength] long is replaced by
     * [inserted] characters. A mark spanning the whole replaced range spans
     * what replaces it, so typing inside a bold word stays bold; one only
     * partly overlapping it keeps what is left of it. Every mark of the
     * schema is inclusive: typed at a mark's end, or at the very start of a
     * block, the new text takes the mark there ([marksAtCaret]). A mark
     * whose whole text goes is kept empty, where what the keyboard types
     * back in the same batch (an autocorrection) takes it; [pruneMarks]
     * drops it once the batch is over.
     */
    fun replaceMarks(marks: List<RichMark>, textLength: Int, from: Int, to: Int, inserted: Int): List<RichMark> {
        val delta = inserted - (to - from)
        val insertion = from == to && inserted > 0
        return marks.mapNotNull { m ->
            when {
                insertion && m.end == from -> m.copy(end = m.end + delta)
                insertion && from == 0 && m.start == 0 && textLength > 0 -> m.copy(end = m.end + delta)
                m.end <= from -> m
                m.start >= to -> m.copy(start = m.start + delta, end = m.end + delta)
                m.start <= from && m.end >= to -> m.copy(end = m.end + delta)
                m.start < from -> m.copy(end = from)
                m.end > to -> m.copy(start = from + inserted, end = m.end + delta)
                else -> null
            }
        }
    }

    fun pruneMarks(marks: List<RichMark>): List<RichMark> =
        if (marks.all { it.start < it.end }) marks else marks.filter { it.start < it.end }

    /** [block] with `[from, to)` of its text replaced by [inserted], its
     *  marks following ([replaceMarks]). */
    fun replaceText(block: RichBlock, from: Int, to: Int, inserted: String): RichBlock = block.copy(
        text = block.text.substring(0, from) + inserted + block.text.substring(to),
        marks = replaceMarks(block.marks, block.text.length, from, to, inserted.length),
    )

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
     *  already inside a link or inline code, and the code blocks. */
    fun contactLinks(block: RichBlock): List<RichMark> {
        val text = block.text
        val marks = block.marks
        if (text.isEmpty() || block.kind == RichBlockKind.CODE_BLOCK) return emptyList()
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
            for (contact in ContactLinks.find(text.substring(start, end))) {
                links.add(RichMark(start + contact.start, start + contact.end, RichMarkType.LINK, contact.uri))
            }
        }
        return links
    }

    /** JavaScript's `\s`, which also matches the no-break and typographic
     *  spaces a French phone number is often written with. */
    internal const val JsSpace = "\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff"
    private val UrlSchemeRegex = Regex("^(https?|mailto|tel):", RegexOption.IGNORE_CASE)
    private val BareEmailRegex = Regex("^[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}$", RegexOption.IGNORE_CASE)
    private val BarePhoneRegex = Regex("^\\+?\\d[\\d$JsSpace().-]+$")
}

/** A colour, font or size: the three attributes of one textStyle mark on
 *  the web. */
val RichMarkType.isTextStyle: Boolean
    get() = this == RichMarkType.TEXT_COLOR || this == RichMarkType.FONT_FAMILY || this == RichMarkType.FONT_SIZE

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

/** Whether this block, at the level of the list item [item], is an item of
 *  the same list. */
fun RichBlock.continuesList(item: RichBlock): Boolean = kind == item.kind && listId == item.listId

/** The list item right above block [index] at its level, in its quotes,
 *  past what that item holds: the last item of a list ending there, or
 *  null when none does. */
internal fun itemAbove(blocks: List<RichBlock>, index: Int): Int? {
    val block = blocks[index]
    var j = index - 1
    while (j >= 0 && blocks[j].sharesQuoteWith(block) && blocks[j].listDepth > block.nestLevel) {
        if (blocks[j].nestLevel == block.nestLevel) return j
        j--
    }
    return null
}

/** The items of list item [index]'s list, at its level, from the list's
 *  first one to [index]. */
internal fun listItemsUpTo(blocks: List<RichBlock>, index: Int): List<Int> =
    generateSequence(index) { i -> itemAbove(blocks, i)?.takeIf { blocks[it].continuesList(blocks[i]) } }.toList().asReversed()

/** Whether [other] sits in the same quotes as this block, or like it in
 *  none. */
fun RichBlock.sharesQuoteWith(other: RichBlock?): Boolean =
    other != null && other.quotes.size == quotes.size && other.quotes.startsWith(quotes)

/** Whether these quotes begin with the quotes [outer]. */
fun List<RichQuote>.startsWith(outer: List<RichQuote>): Boolean =
    size >= outer.size && outer.indices.all { this[it].id == outer[it].id }

/** How many list items hold this block's text: a list item holds its own. */
val RichBlock.listDepth: Int
    get() = if (kind.isListItem) nestLevel + 1 else nestLevel
