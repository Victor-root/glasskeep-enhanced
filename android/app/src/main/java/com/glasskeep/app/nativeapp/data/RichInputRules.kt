package com.glasskeep.app.nativeapp.data

/** An input rule's edit, and the mark it takes off what is typed next
 *  (Tiptap's removeStoredMark once a mark rule has run). */
data class RichInputResult(val edit: RichEdit, val disarm: RichMarkType? = null)

/**
 * The shortcuts the web editor turns into formatting while typing: Tiptap's
 * input rules (StarterKit, Highlight, TaskItem, the code block) and the
 * Link extension's autolink.
 *
 * `# ` to `##### ` make a heading, `- `, `1. `, `[ ] ` and `> ` a list or a
 * quote, a triple backtick or tilde a code block, `---` a rule, `**x**`,
 * `*x*`, `~~x~~`, `==x==` and `` `x` `` a mark; a web address or an e-mail
 * address followed by a space or Enter becomes a link.
 *
 * A rule looks at the block's text before the caret, what was just typed
 * included, and the first one that matches in the web's own plugin order
 * wins. None runs in a code block or right after inline code. The flat
 * model holds no quote inside a list item, so the rule that would build
 * one there does nothing, as a rule the web's schema refuses does nothing
 * on the web.
 */
object RichInputRules {

    /**
     * Text typed into block [id], whose whole text is now [text] with
     * [marks] and the caret at [caret]. [inserted] is what was typed, empty
     * when an IME composition just ended. Null when no rule applies.
     */
    fun typed(
        blocks: List<RichBlock>,
        id: String,
        text: String,
        marks: List<RichMark>,
        caret: Int,
        inserted: String,
    ): RichInputResult? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0 || blocks[index].kind == RichBlockKind.CODE_BLOCK) return null
        val block = blocks[index].copy(text = text, marks = marks)
        val typedBlocks = blocks.replaceAt(index, listOf(block))
        if (!nextToCode(block, caret)) {
            val window = text.substring(maxOf(0, caret - MaxMatch), caret)
            for (rule in Rules) {
                val match = rule.regex.find(window) ?: continue
                val result = when (rule) {
                    is BlockRule -> rule.apply(typedBlocks, index, match, caret)?.let { RichInputResult(it) }
                    is MarkRule -> markRule(typedBlocks, index, rule.type, match, caret - window.length, caret)
                }
                if (result != null) return result
            }
        }
        if (RichLinks.endsWithWhitespace(inserted)) {
            val linked = autolink(block, caret) ?: return null
            return RichInputResult(RichEdit(typedBlocks.replaceAt(index, listOf(linked)), id, caret))
        }
        return null
    }

    /** Enter at [position] of block [id] runs the rules with a line break
     *  typed, which completes a block rule (`-` then Enter makes a list
     *  item); the break itself is never typed. */
    fun enter(blocks: List<RichBlock>, id: String, position: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        if (block.kind == RichBlockKind.CODE_BLOCK || nextToCode(block, position)) return null
        val window = block.text.substring(maxOf(0, position - MaxMatch), position) + "\n"
        for (rule in Rules) {
            if (rule !is BlockRule) continue
            val match = rule.regex.find(window) ?: continue
            rule.apply(blocks, index, match, position)?.let { return it }
        }
        return null
    }

    /** Enter's autolink: the last word before [position] of block [id],
     *  once the line is broken there, becomes a link when it is one. */
    fun linkBeforeBreak(blocks: List<RichBlock>, id: String, position: Int): List<RichBlock> {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0 || blocks[index].kind == RichBlockKind.CODE_BLOCK) return blocks
        val linked = autolink(blocks[index], position) ?: return blocks
        return blocks.replaceAt(index, listOf(linked))
    }

    // ---------- Rules ----------

    private sealed interface Rule {
        val regex: Regex
    }

    /** A block rule, which only matches the whole text before the caret:
     *  it goes, whatever follows the caret stays, and the caret lands at
     *  the block's start. */
    private class BlockRule(
        override val regex: Regex,
        val apply: (blocks: List<RichBlock>, index: Int, match: MatchResult, cut: Int) -> RichEdit?,
    ) : Rule

    private class MarkRule(override val regex: Regex, val type: RichMarkType) : Rule

    /** getTextContentFromNodes' window: at most 500 characters before the
     *  caret. */
    private const val MaxMatch = 500

    private const val S = "[${RichDoc.JsSpace}]"
    private val JsWhitespace = Regex(S)

    /** The web's plugin order: each extension's rules in turn, the
     *  extensions taken from the last registered to the first. */
    private val Rules: List<Rule> = listOf(
        BlockRule(Regex("""^$S*(\[([( |x])?\])$S\z""")) { blocks, index, match, cut ->
            wrap(blocks, index, cut, RichBlockKind.TASK_ITEM, checked = match.groupValues[2] == "x")
        },
        MarkRule(Regex("""(?:^|$S)(==(?!$S+==)((?:[^=]+))==(?!$S+==))\z"""), RichMarkType.HIGHLIGHT),
        BlockRule(Regex("""^```([a-z]+)?[${RichDoc.JsSpace}\n]\z"""), ::codeBlock),
        BlockRule(Regex("""^~~~([a-z]+)?[${RichDoc.JsSpace}\n]\z"""), ::codeBlock),
        MarkRule(Regex("""(?:^|$S)(~~(?!$S+~~)((?:[^~]+))~~(?!$S+~~))\z"""), RichMarkType.STRIKE),
        BlockRule(Regex("""^(\d+)\.$S\z""")) { blocks, index, match, cut ->
            val start = match.groupValues[1].toIntOrNull() ?: Int.MAX_VALUE
            wrap(blocks, index, cut, RichBlockKind.NUMBERED_ITEM, listStart = start.takeIf { it != 1 })
        },
        MarkRule(Regex("""(?:^|$S)(\*(?!$S+\*)((?:[^*]+))\*(?!$S+\*))\z"""), RichMarkType.ITALIC),
        MarkRule(Regex("""(?:^|$S)(_(?!$S+_)((?:[^_]+))_(?!$S+_))\z"""), RichMarkType.ITALIC),
        // The second form is what a phone keyboard makes of "---".
        BlockRule(Regex("""^(?:---|\u2014-|___$S|\*\*\*$S)\z""")) { blocks, index, _, cut ->
            horizontalRule(blocks, index, cut)
        },
        BlockRule(Regex("""^(#{1,5})$S\z""")) { blocks, index, match, cut ->
            heading(blocks, index, cut, match.groupValues[1].length)
        },
        MarkRule(Regex("""(^|[^`])`([^`]+)`(?!`)\z"""), RichMarkType.CODE),
        BlockRule(Regex("""^$S*([-+*])$S\z""")) { blocks, index, _, cut ->
            wrap(blocks, index, cut, RichBlockKind.BULLET_ITEM)
        },
        BlockRule(Regex("""^$S*>$S\z""")) { blocks, index, _, cut ->
            quote(blocks, index, cut)
        },
        MarkRule(Regex("""(?:^|$S)(\*\*(?!$S+\*\*)((?:[^*]+))\*\*(?!$S+\*\*))\z"""), RichMarkType.BOLD),
        MarkRule(Regex("""(?:^|$S)(__(?!$S+__)((?:[^_]+))__(?!$S+__))\z"""), RichMarkType.BOLD),
    )

    /** [block] without its first [cut] characters. */
    private fun rest(block: RichBlock, cut: Int): RichBlock =
        block.copy(text = block.text.substring(cut), marks = RichDoc.clipMarks(block.marks, cut, block.text.length))

    private fun done(blocks: List<RichBlock>, index: Int, replacement: List<RichBlock>, focus: RichBlock): RichEdit =
        RichEdit(RichDoc.normalizeNesting(blocks.replaceAt(index, replacement)), focus.id, 0)

    /** wrappingInputRule for a list: a paragraph goes into a list where it
     *  stands (in its quotes, or nested in the list item holding it),
     *  joining the list right above it, its attributes kept, the new item
     *  taking none. An ordered list takes the number typed as its start. */
    private fun wrap(
        blocks: List<RichBlock>,
        index: Int,
        cut: Int,
        kind: RichBlockKind,
        checked: Boolean = false,
        listStart: Int? = null,
    ): RichEdit? {
        val block = blocks[index]
        if (block.kind != RichBlockKind.PARAGRAPH) return null
        val task = kind == RichBlockKind.TASK_ITEM
        val wrapped = rest(block, cut).copy(
            kind = kind,
            checked = checked,
            listStart = listStart,
            indent = if (task) block.indent else 0,
            lineIndent = if (task) 0 else block.indent,
        )
        return done(blocks, index, listOf(wrapped), wrapped)
    }

    /** wrappingInputRule for the quote: a paragraph or heading goes into a
     *  quote, inside the quotes already holding it, joining a quote that
     *  ends right above it there. One a list item holds would need a quote
     *  inside the item, which the model does not hold. */
    private fun quote(blocks: List<RichBlock>, index: Int, cut: Int): RichEdit? {
        val block = blocks[index]
        if (block.kind != RichBlockKind.PARAGRAPH && !block.kind.isHeading || block.nestLevel > 0) return null
        val depth = block.quotes.size
        val above = blocks.getOrNull(index - 1)?.quotes?.takeIf { it.size > depth && it.startsWith(block.quotes) }?.get(depth)
        val wrapped = rest(block, cut).copy(quotes = block.quotes + (above ?: RichQuote()))
        return done(blocks, index, listOf(wrapped), wrapped)
    }

    /** textblockTypeInputRule: a paragraph or heading, wherever it stands,
     *  becomes a heading with the level's default attributes. */
    private fun heading(blocks: List<RichBlock>, index: Int, cut: Int, level: Int): RichEdit? {
        val block = blocks[index]
        if (block.kind != RichBlockKind.PARAGRAPH && !block.kind.isHeading) return null
        val kind = when (level) {
            1 -> RichBlockKind.HEADING_1
            2 -> RichBlockKind.HEADING_2
            3 -> RichBlockKind.HEADING_3
            4 -> RichBlockKind.HEADING_4
            else -> RichBlockKind.HEADING_5
        }
        val heading = rest(block, cut).copy(kind = kind, align = RichAlign.LEFT, indent = 0)
        return done(blocks, index, listOf(heading), heading)
    }

    /** textblockTypeInputRule for the code block: its text keeps no mark,
     *  the fence's language is kept. */
    private fun codeBlock(blocks: List<RichBlock>, index: Int, match: MatchResult, cut: Int): RichEdit? {
        val block = blocks[index]
        if (block.kind != RichBlockKind.PARAGRAPH && !block.kind.isHeading) return null
        val code = rest(block, cut).copy(
            kind = RichBlockKind.CODE_BLOCK,
            marks = emptyList(),
            align = RichAlign.LEFT,
            indent = 0,
            language = match.groupValues[1].ifEmpty { null },
        )
        return done(blocks, index, listOf(code), code)
    }

    /** nodeInputRule: the rule goes right above the paragraph or heading,
     *  where it stands, and the block keeps whatever followed the caret. */
    private fun horizontalRule(blocks: List<RichBlock>, index: Int, cut: Int): RichEdit? {
        val block = blocks[index]
        if (block.kind != RichBlockKind.PARAGRAPH && !block.kind.isHeading) return null
        val kept = rest(block, cut)
        val rule = RichDoc.newBlock(RichBlockKind.DIVIDER).copy(nestLevel = block.nestLevel, quotes = block.quotes)
        return done(blocks, index, listOf(rule, kept), kept)
    }

    /**
     * markInputRule, formula for formula: both delimiters go, the text they
     * held takes the mark (inline code clears every other mark from it,
     * `excludes: "_"`), and the mark is not carried on to what is typed
     * next. [windowStart] is where the matched window starts in the text.
     */
    private fun markRule(
        blocks: List<RichBlock>,
        index: Int,
        type: RichMarkType,
        match: MatchResult,
        windowStart: Int,
        caret: Int,
    ): RichInputResult? {
        val block = blocks[index]
        val inner = match.groupValues.last()
        if (inner.isEmpty()) return null
        val full = match.value
        val from = windowStart + match.range.first
        val startSpaces = full.indexOfFirst { !JsWhitespace.matches(it.toString()) }
        val textStart = from + full.indexOf(inner)
        val textEnd = textStart + inner.length
        // Inline code excludes every other mark: it stops the rule for them.
        val excluded = type != RichMarkType.CODE && block.marks.any {
            it.type == RichMarkType.CODE && it.start < caret && it.end > from && it.end > textStart
        }
        if (excluded) return null
        var text = block.text
        var marks = block.marks
        if (textEnd < caret) {
            marks = RichDoc.pruneMarks(RichDoc.replaceMarks(marks, text.length, textEnd, caret, 0))
            text = text.removeRange(textEnd, caret)
        }
        if (textStart > from) {
            marks = RichDoc.pruneMarks(RichDoc.replaceMarks(marks, text.length, from + startSpaces, textStart, 0))
            text = text.removeRange(from + startSpaces, textStart)
        }
        val markStart = from + startSpaces
        val markEnd = markStart + inner.length
        val marked = block.copy(text = text, marks = RichDoc.setMark(marks, type, markStart, markEnd))
        return RichInputResult(RichEdit(blocks.replaceAt(index, listOf(marked)), block.id, markEnd), disarm = type)
    }

    /** run()'s guard: the text right before the caret (right after it at a
     *  block's start) is inline code. */
    private fun nextToCode(block: RichBlock, caret: Int): Boolean {
        val at = if (caret > 0) caret - 1 else caret
        return at < block.text.length && block.marks.any { it.type == RichMarkType.CODE && it.start <= at && it.end > at }
    }

    // ---------- Autolink ----------

    /**
     * The Link extension's autolink: the last word before [end], alone or
     * in parentheses or brackets, becomes a link when linkify finds an
     * address there ([RichLinks.lastWordLinks]) not already in a link or
     * in inline code.
     */
    private fun autolink(block: RichBlock, end: Int): RichBlock? {
        var marks = block.marks
        for (link in RichLinks.lastWordLinks(block.text.substring(0, end))) {
            val taken = block.marks.any {
                (it.type == RichMarkType.LINK || it.type == RichMarkType.CODE) && it.start < link.end && it.end > link.start
            }
            if (!taken) marks = RichDoc.setMark(marks, RichMarkType.LINK, link.start, link.end, link.href)
        }
        return if (marks === block.marks) null else block.copy(marks = marks)
    }
}
