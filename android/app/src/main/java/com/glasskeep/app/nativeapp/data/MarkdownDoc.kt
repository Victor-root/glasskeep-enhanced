package com.glasskeep.app.nativeapp.data

/**
 * Markdown, and plain text, read as [RichBlock]s.
 *
 * The web gets here through `marked` (with `breaks: true`), DOMPurify and
 * Tiptap's generateJSON (`legacyMarkdownToRichDoc` / `plainTextToRichDoc`
 * in src/utils/richText.js). Pulling a full CommonMark parser into the APK
 * would be out of proportion, so this reads the subset that survives the
 * round trip anyway: everything richTextSchema.js configures, which is
 * everything [RichDoc] can hold. Anything outside it (tables, raw HTML,
 * footnotes) stays as the literal text of an ordinary paragraph rather
 * than being silently dropped.
 *
 * The block grammar: ATX and setext headings, fenced and indented code,
 * blockquotes, bullet and numbered lists with their indentation (a `[ ]`
 * box is dropped, no list item of the schema takes it), thematic breaks,
 * and paragraphs whose inner line breaks become hard breaks, `breaks:
 * true` being what the web asks `marked` for. The inline grammar is
 * [MarkdownInline]'s.
 */
object MarkdownDoc {
    private val HEADING = Regex("^ {0,3}(#{1,6})(?:[ \\t]+(.*?))?(?:[ \\t]+#+)?[ \\t]*$")
    private val SETEXT_UNDERLINE = Regex("^ {0,3}(=+|-+)[ \\t]*$")
    private val FENCE = Regex("^\\s*(```|~~~)\\s*([A-Za-z0-9_+-]*)\\s*$")
    private val INDENTED_CODE = Regex("^(?: {4}|\\t)(.*)$")
    private val QUOTE = Regex("^\\s*>\\s?(.*)$")
    private val TASK_BOX = Regex("^\\[[ xX]] +")
    private val BULLET_ITEM = Regex("^(\\s*)[-*+]\\s+(.*)$")
    private val NUMBERED_ITEM = Regex("^(\\s*)(\\d+)[.)]\\s+(.*)$")

    /**
     * Plain text, never Markdown: `plainTextToRichDoc`. A blank line
     * starts a new paragraph, every other line break inside one is a hard
     * break, and nothing is read as a marker.
     */
    fun plainTextToRichBlocks(text: String): List<RichBlock> {
        if (text.isEmpty()) return listOf(RichDoc.newBlock())
        val paragraphs = text.split(BLANK_SEPARATOR)
        val blocks = mutableListOf<RichBlock>()
        paragraphs.forEachIndexed { index, paragraph ->
            blocks.add(RichDoc.newBlock().copy(text = paragraph))
            // The blank line itself survives as an empty paragraph, which
            // is what plainTextToRichDoc keeps (richText.js:195) so the
            // spacing of a pasted note is not silently closed up.
            if (index < paragraphs.size - 1) blocks.add(RichDoc.newBlock())
        }
        return blocks.ifEmpty { listOf(RichDoc.newBlock()) }
    }

    /** Markdown as blocks. Empty (or blank) input gives one empty
     *  paragraph, same as the web's own emptyRichDoc(). [keepBlankLines]
     *  is renderSafeMarkdown's reading (utils/markdown.jsx), where every
     *  blank line becomes a one-line spacer, fenced code excepted. */
    fun toRichBlocks(markdown: String, keepBlankLines: Boolean = false): List<RichBlock> {
        if (markdown.isBlank()) return listOf(RichDoc.newBlock())
        val normalized = markdown.replace("\r\n", "\n").replace('\r', '\n')
        val source = if (keepBlankLines) markBlankLines(normalized) else normalized
        val lines = source.split("\n")
        val blocks = mutableListOf<RichBlock>()
        val paragraph = mutableListOf<String>()

        fun flushParagraph() {
            if (paragraph.isEmpty()) return
            // `breaks: true`: the lines of one paragraph stay one block,
            // separated by the hard breaks RichDoc encodes as "\n".
            blocks.add(inlineBlock(RichBlockKind.PARAGRAPH, paragraph.joinToString("\n")))
            paragraph.clear()
        }

        var quote: RichQuote? = null
        var index = 0
        while (index < lines.size) {
            val line = lines[index]
            // Consecutive quoted lines make one quote; any other line, a
            // blank one included, ends it.
            val quoted = QUOTE.matchEntire(line)
            if (quoted == null) quote = null
            val fence = FENCE.matchEntire(line)
            if (fence != null) {
                flushParagraph()
                val marker = fence.groupValues[1]
                val language = fence.groupValues[2].takeIf { it.isNotBlank() }
                val body = mutableListOf<String>()
                index++
                while (index < lines.size && !lines[index].trimEnd().startsWith(marker)) {
                    body.add(lines[index])
                    index++
                }
                // A code block is verbatim: no inline marks are read in it.
                blocks.add(
                    RichDoc.newBlock(RichBlockKind.CODE_BLOCK)
                        .copy(text = body.joinToString("\n"), language = language),
                )
                index++
                continue
            }
            if (line == BLANK_LINE_MARKER) {
                flushParagraph()
                blocks.add(RichDoc.newBlock())
                index++
                continue
            }
            if (line.isBlank()) {
                flushParagraph()
                index++
                continue
            }
            val underline = SETEXT_UNDERLINE.matchEntire(line)
            if (underline != null && paragraph.isNotEmpty()) {
                val level = if (underline.groupValues[1].startsWith('=')) 1 else 2
                blocks.add(inlineBlock(headingKind(level), paragraph.joinToString("\n").trim()))
                paragraph.clear()
                index++
                continue
            }
            if (isThematicBreak(line)) {
                flushParagraph()
                blocks.add(RichDoc.newBlock(RichBlockKind.DIVIDER))
                index++
                continue
            }
            val heading = HEADING.matchEntire(line)
            if (heading != null) {
                flushParagraph()
                val level = heading.groupValues[1].length
                // Tiptap's heading stops at level 5: its parser reads an h6
                // as a paragraph, where the reading view still draws a
                // heading, the deepest one there is.
                val kind = when {
                    level <= 5 -> headingKind(level)
                    keepBlankLines -> RichBlockKind.HEADING_5
                    else -> RichBlockKind.PARAGRAPH
                }
                blocks.add(inlineBlock(kind, heading.groupValues[2].trim()))
                index++
                continue
            }
            val indented = INDENTED_CODE.matchEntire(line)
            if (indented != null && paragraph.isEmpty() && blocks.lastOrNull()?.kind?.isListItem != true) {
                val body = mutableListOf(indented.groupValues[1])
                val pendingBlank = mutableListOf<String>()
                index++
                while (index < lines.size) {
                    val next = lines[index]
                    val more = INDENTED_CODE.matchEntire(next)
                    if (more != null) {
                        body.addAll(pendingBlank)
                        pendingBlank.clear()
                        body.add(more.groupValues[1])
                    } else if (next.isBlank() && next != BLANK_LINE_MARKER) {
                        pendingBlank.add("")
                    } else {
                        break
                    }
                    index++
                }
                blocks.add(RichDoc.newBlock(RichBlockKind.CODE_BLOCK).copy(text = body.joinToString("\n")))
                continue
            }
            if (quoted != null) {
                flushParagraph()
                val holder = quote ?: RichQuote().also { quote = it }
                blocks.add(inlineBlock(RichBlockKind.PARAGRAPH, quoted.groupValues[1]).copy(quotes = listOf(holder)))
                index++
                continue
            }
            val bullet = BULLET_ITEM.matchEntire(line)
            if (bullet != null) {
                flushParagraph()
                blocks.add(
                    inlineBlock(RichBlockKind.BULLET_ITEM, TASK_BOX.replaceFirst(bullet.groupValues[2], ""))
                        .copy(indent = indentOf(bullet.groupValues[1])),
                )
                index++
                continue
            }
            val numbered = NUMBERED_ITEM.matchEntire(line)
            if (numbered != null) {
                flushParagraph()
                // marked gives a list its first item's number as its start.
                val start = numbered.groupValues[2].toIntOrNull() ?: Int.MAX_VALUE
                val opensList = blocks.lastOrNull()?.kind != RichBlockKind.NUMBERED_ITEM
                blocks.add(
                    inlineBlock(RichBlockKind.NUMBERED_ITEM, TASK_BOX.replaceFirst(numbered.groupValues[3], ""))
                        .copy(indent = indentOf(numbered.groupValues[1]), listStart = start.takeIf { opensList && it != 1 }),
                )
                index++
                continue
            }
            paragraph.add(line)
            index++
        }
        flushParagraph()
        return blocks.ifEmpty { listOf(RichDoc.newBlock()) }
    }

    private const val BLANK_LINE_MARKER = "\u0000blank\u0000"
    private val BLANK_SEPARATOR = Regex("\n[${RichDoc.JsSpace}]*\n")
    private val CODE_FENCE_SPAN = Regex("```[\\s\\S]*?```")
    private val BLANK_RUN = Regex("\n{2,}")
    private val CODE_PLACEHOLDER = Regex("\u0000code(\\d+)\u0000")

    /** renderSafeMarkdown's spacers: a run of n newlines outside fenced
     *  code keeps its paragraph break and gains n - 1 spacer lines. */
    private fun markBlankLines(text: String): String {
        val code = mutableListOf<String>()
        val shielded = CODE_FENCE_SPAN.replace(text) { match ->
            code.add(match.value)
            "\u0000code${code.size - 1}\u0000"
        }
        val marked = BLANK_RUN.replace(shielded) { match ->
            "\n\n" + "$BLANK_LINE_MARKER\n\n".repeat(match.value.length - 1)
        }
        return CODE_PLACEHOLDER.replace(marked) { match -> code[match.groupValues[1].toInt()] }
    }

    /** Three or more `-`, `*` or `_`, spaces between them allowed. */
    private fun isThematicBreak(line: String): Boolean {
        val body = line.trimStart(' ')
        if (line.length - body.length > 3) return false
        val marker = body.firstOrNull()?.takeIf { it == '-' || it == '*' || it == '_' } ?: return false
        var count = 0
        for (c in body) {
            if (c == marker) count++ else if (c != ' ' && c != '\t') return false
        }
        return count >= 3
    }

    /** One list nesting step is two spaces on the web's own exporter, but
     *  four is just as common in the wild; both read as one level. */
    private fun indentOf(leading: String): Int =
        (leading.replace("\t", "  ").length / 2).coerceAtMost(8)

    private fun headingKind(level: Int): RichBlockKind = when (level) {
        1 -> RichBlockKind.HEADING_1
        2 -> RichBlockKind.HEADING_2
        3 -> RichBlockKind.HEADING_3
        4 -> RichBlockKind.HEADING_4
        else -> RichBlockKind.HEADING_5
    }

    private fun inlineBlock(kind: RichBlockKind, raw: String): RichBlock {
        val (text, marks) = MarkdownInline.parse(raw)
        return RichDoc.newBlock(kind).copy(text = text, marks = marks)
    }
}
