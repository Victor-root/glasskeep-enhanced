package com.glasskeep.app.nativeapp.data

/**
 * Markdown, and plain text, read as [RichBlock]s.
 *
 * The web gets here through `marked` (with `breaks: true`), DOMPurify and
 * Tiptap's generateJSON (`legacyMarkdownToRichDoc` / `plainTextToRichDoc`
 * in src/utils/richText.js). Pulling a full CommonMark parser into the APK
 * for two import buttons would be out of proportion, so this reads the
 * subset that survives the round trip anyway: everything richTextSchema.js
 * configures, which is everything [RichDoc] can hold. Anything outside it
 * (tables, images, raw HTML, footnotes) stays as the literal text of an
 * ordinary paragraph rather than being silently dropped.
 *
 * The block grammar: ATX headings, fenced code, blockquotes, task/bullet/
 * numbered lists with their indentation, thematic breaks, and paragraphs
 * whose inner line breaks become hard breaks, `breaks: true` being what
 * the web asks `marked` for. The inline grammar: bold, italic, strike,
 * inline code and links.
 */
object MarkdownDoc {
    private val HEADING = Regex("^(#{1,6})\\s+(.*)$")
    private val FENCE = Regex("^\\s*(```|~~~)\\s*([A-Za-z0-9_+-]*)\\s*$")
    private val THEMATIC_BREAK = Regex("^\\s*(?:-{3,}|\\*{3,}|_{3,})\\s*$")
    private val QUOTE = Regex("^\\s*>\\s?(.*)$")
    private val TASK_ITEM = Regex("^(\\s*)[-*+]\\s+\\[([ xX])]\\s+(.*)$")
    private val BULLET_ITEM = Regex("^(\\s*)[-*+]\\s+(.*)$")
    private val NUMBERED_ITEM = Regex("^(\\s*)\\d+[.)]\\s+(.*)$")

    /**
     * Plain text, never Markdown: `plainTextToRichDoc`. A blank line
     * starts a new paragraph, every other line break inside one is a hard
     * break, and nothing is read as a marker.
     */
    fun plainTextToRichBlocks(text: String): List<RichBlock> {
        if (text.isEmpty()) return listOf(RichDoc.newBlock())
        val paragraphs = text.split(Regex("\n\\s*\n"))
        val blocks = mutableListOf<RichBlock>()
        paragraphs.forEachIndexed { index, paragraph ->
            blocks.add(RichDoc.newBlock().copy(text = paragraph.trimEnd('\n')))
            // The blank line itself survives as an empty paragraph, which
            // is what plainTextToRichDoc keeps (richText.js:195) so the
            // spacing of a pasted note is not silently closed up.
            if (index < paragraphs.size - 1) blocks.add(RichDoc.newBlock())
        }
        return blocks.ifEmpty { listOf(RichDoc.newBlock()) }
    }

    /** Markdown as blocks. Empty (or blank) input gives one empty
     *  paragraph, same as the web's own emptyRichDoc(). */
    fun toRichBlocks(markdown: String): List<RichBlock> {
        if (markdown.isBlank()) return listOf(RichDoc.newBlock())
        val lines = markdown.replace("\r\n", "\n").replace('\r', '\n').split("\n")
        val blocks = mutableListOf<RichBlock>()
        val paragraph = mutableListOf<String>()

        fun flushParagraph() {
            if (paragraph.isEmpty()) return
            // `breaks: true`: the lines of one paragraph stay one block,
            // separated by the hard breaks RichDoc encodes as "\n".
            blocks.add(inlineBlock(RichBlockKind.PARAGRAPH, paragraph.joinToString("\n")))
            paragraph.clear()
        }

        var index = 0
        while (index < lines.size) {
            val line = lines[index]
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
            if (line.isBlank()) {
                flushParagraph()
                index++
                continue
            }
            if (THEMATIC_BREAK.matches(line)) {
                flushParagraph()
                blocks.add(RichDoc.newBlock(RichBlockKind.DIVIDER))
                index++
                continue
            }
            val heading = HEADING.matchEntire(line)
            if (heading != null) {
                flushParagraph()
                // The vocabulary stops at level 5, so a level 6 heading
                // lands on the deepest one there is rather than becoming a
                // paragraph and losing its rank entirely.
                val level = heading.groupValues[1].length.coerceAtMost(5)
                blocks.add(inlineBlock(headingKind(level), heading.groupValues[2].trim()))
                index++
                continue
            }
            val quote = QUOTE.matchEntire(line)
            if (quote != null) {
                flushParagraph()
                blocks.add(inlineBlock(RichBlockKind.QUOTE, quote.groupValues[1]))
                index++
                continue
            }
            val task = TASK_ITEM.matchEntire(line)
            if (task != null) {
                flushParagraph()
                blocks.add(
                    inlineBlock(RichBlockKind.TASK_ITEM, task.groupValues[3])
                        .copy(
                            checked = !task.groupValues[2].equals(" ", ignoreCase = false),
                            indent = indentOf(task.groupValues[1]),
                        ),
                )
                index++
                continue
            }
            val bullet = BULLET_ITEM.matchEntire(line)
            if (bullet != null) {
                flushParagraph()
                blocks.add(
                    inlineBlock(RichBlockKind.BULLET_ITEM, bullet.groupValues[2])
                        .copy(indent = indentOf(bullet.groupValues[1])),
                )
                index++
                continue
            }
            val numbered = NUMBERED_ITEM.matchEntire(line)
            if (numbered != null) {
                flushParagraph()
                blocks.add(
                    inlineBlock(RichBlockKind.NUMBERED_ITEM, numbered.groupValues[2])
                        .copy(indent = indentOf(numbered.groupValues[1])),
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
        val (text, marks) = parseInline(raw)
        return RichDoc.newBlock(kind).copy(text = text, marks = marks)
    }

    /**
     * Strips the inline markers out of [raw] and returns the clean text
     * plus the marks that covered them. Left to right, one pass, innermost
     * markers resolved by recursion so `**bold with *italic* inside**`
     * keeps both.
     */
    private fun parseInline(raw: String): Pair<String, List<RichMark>> {
        val text = StringBuilder()
        val marks = mutableListOf<RichMark>()
        var index = 0

        fun append(fragment: String, type: RichMarkType, value: String? = null) {
            val (innerText, innerMarks) = if (type == RichMarkType.CODE) {
                // Inline code is verbatim on the web too: no nested marks.
                fragment to emptyList()
            } else {
                parseInline(fragment)
            }
            val offset = text.length
            text.append(innerText)
            marks.add(RichMark(offset, text.length, type, value))
            innerMarks.mapTo(marks) { it.copy(start = it.start + offset, end = it.end + offset) }
        }

        while (index < raw.length) {
            val rest = raw.substring(index)
            val link = LINK.find(rest)
            if (link != null && link.range.first == 0) {
                append(link.groupValues[1], RichMarkType.LINK, link.groupValues[2])
                index += link.value.length
                continue
            }
            val delimiter = DELIMITERS.firstOrNull { (marker, _) ->
                rest.startsWith(marker) && closingIndex(rest, marker) > 0
            }
            if (delimiter != null) {
                val (marker, type) = delimiter
                val close = closingIndex(rest, marker)
                append(rest.substring(marker.length, close), type)
                index += close + marker.length
                continue
            }
            text.append(raw[index])
            index++
        }
        return text.toString() to marks
    }

    /** Where [marker]'s closing run starts in [rest], or -1 when it never
     *  closes (a stray `*` is then just a star, as it is on the web). */
    private fun closingIndex(rest: String, marker: String): Int =
        rest.indexOf(marker, startIndex = marker.length)

    private val LINK = Regex("^\\[([^\\]]*)]\\(([^)\\s]+)\\)")

    /** Longest markers first: `**` must win over `*`. */
    private val DELIMITERS = listOf(
        "**" to RichMarkType.BOLD,
        "__" to RichMarkType.BOLD,
        "~~" to RichMarkType.STRIKE,
        "`" to RichMarkType.CODE,
        "*" to RichMarkType.ITALIC,
        "_" to RichMarkType.ITALIC,
    )
}
