package com.glasskeep.app.nativeapp.data

import android.util.Patterns

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
 * model holds no list or code block inside a quote and nothing but text in
 * a list item, so the rules that would build those there do nothing, as a
 * rule the web's schema refuses does nothing on the web.
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
        if (inserted.lastOrNull()?.let { LinkSpace.matches(it.toString()) } == true) {
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
        BlockRule(Regex("""^(\d+)\.$S\z""")) { blocks, index, _, cut ->
            wrap(blocks, index, cut, RichBlockKind.NUMBERED_ITEM)
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
            wrap(blocks, index, cut, RichBlockKind.QUOTE)
        },
        MarkRule(Regex("""(?:^|$S)(\*\*(?!$S+\*\*)((?:[^*]+))\*\*(?!$S+\*\*))\z"""), RichMarkType.BOLD),
        MarkRule(Regex("""(?:^|$S)(__(?!$S+__)((?:[^_]+))__(?!$S+__))\z"""), RichMarkType.BOLD),
    )

    /** [block] without its first [cut] characters. */
    private fun rest(block: RichBlock, cut: Int): RichBlock =
        block.copy(text = block.text.substring(cut), marks = RichDoc.clipMarks(block.marks, cut, block.text.length))

    private fun done(blocks: List<RichBlock>, index: Int, replacement: List<RichBlock>, focus: RichBlock): RichEdit =
        RichEdit(RichDoc.normalizeNesting(blocks.replaceAt(index, replacement)), focus.id, 0)

    /** wrappingInputRule: a paragraph goes into a list or a quote, joining
     *  the one right above it. */
    private fun wrap(blocks: List<RichBlock>, index: Int, cut: Int, kind: RichBlockKind, checked: Boolean = false): RichEdit? {
        val block = blocks[index]
        if (block.kind != RichBlockKind.PARAGRAPH) return null
        val wrapped = rest(block, cut).copy(kind = kind, checked = checked, nestLevel = 0)
        return done(blocks, index, listOf(wrapped), wrapped)
    }

    /** textblockTypeInputRule: a paragraph or heading, or a quote paragraph
     *  (which the model can only take out of its quote, as the toolbar
     *  does), becomes a heading with the level's default attributes. */
    private fun heading(blocks: List<RichBlock>, index: Int, cut: Int, level: Int): RichEdit? {
        val block = blocks[index]
        if (block.kind != RichBlockKind.PARAGRAPH && !block.kind.isHeading && block.kind != RichBlockKind.QUOTE) return null
        val kind = when (level) {
            1 -> RichBlockKind.HEADING_1
            2 -> RichBlockKind.HEADING_2
            3 -> RichBlockKind.HEADING_3
            4 -> RichBlockKind.HEADING_4
            else -> RichBlockKind.HEADING_5
        }
        val heading = rest(block, cut).copy(kind = kind, align = RichAlign.LEFT, indent = 0, nestLevel = 0)
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
     *  which keeps whatever followed the caret. */
    private fun horizontalRule(blocks: List<RichBlock>, index: Int, cut: Int): RichEdit? {
        val block = blocks[index]
        if (block.kind != RichBlockKind.PARAGRAPH && !block.kind.isHeading) return null
        val kept = rest(block, cut)
        return done(blocks, index, listOf(RichDoc.newBlock(RichBlockKind.DIVIDER), kept), kept)
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
            text = text.removeRange(textEnd, caret)
            marks = deleteSpan(marks, textEnd, caret)
        }
        if (textStart > from) {
            text = text.removeRange(from + startSpaces, textStart)
            marks = deleteSpan(marks, from + startSpaces, textStart)
        }
        val markStart = from + startSpaces
        val markEnd = markStart + inner.length
        marks = if (type == RichMarkType.CODE) {
            RichDoc.setMark(RichDoc.clearAllMarks(marks, markStart, markEnd), type, markStart, markEnd)
        } else {
            RichDoc.setMark(marks, type, markStart, markEnd)
        }
        val marked = block.copy(text = text, marks = marks)
        return RichInputResult(RichEdit(blocks.replaceAt(index, listOf(marked)), block.id, markEnd), disarm = type)
    }

    /** The marks once `[from, to)` of the text is deleted. */
    private fun deleteSpan(marks: List<RichMark>, from: Int, to: Int): List<RichMark> {
        val length = to - from
        return marks.mapNotNull { m ->
            val start = if (m.start >= to) m.start - length else minOf(m.start, from)
            val end = if (m.end >= to) m.end - length else minOf(m.end, from)
            if (start < end) m.copy(start = start, end = end) else null
        }
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
     * in parentheses or brackets, becomes a link when it is a web or e-mail
     * address and not already in a link or inline code. Android's own
     * address patterns stand in for linkifyjs; the addresses the web leaves
     * alone (an IP address or a bare host name without a scheme) are left
     * alone here too.
     */
    private fun autolink(block: RichBlock, end: Int): RichBlock? {
        val before = block.text.substring(0, end)
        val word = before.split(LinkSpace).lastOrNull { it.isNotEmpty() } ?: return null
        val wrapped = word.length > 2 &&
            (word.first() == '(' && word.last() == ')' || word.first() == '[' && word.last() == ']')
        val value = if (wrapped) word.substring(1, word.length - 1) else word
        val href = linkHref(value) ?: return null
        if (!shouldAutoLink(value)) return null
        val from = before.lastIndexOf(word) + if (wrapped) 1 else 0
        val to = from + value.length
        val taken = block.marks.any {
            (it.type == RichMarkType.LINK || it.type == RichMarkType.CODE) && it.start < to && it.end > from
        }
        if (taken) return null
        return block.copy(marks = RichDoc.setMark(block.marks, RichMarkType.LINK, from, to, href))
    }

    /** linkify's href: an address with a scheme as typed, an e-mail
     *  address as a mailto: link, anything else over http. */
    private fun linkHref(value: String): String? = when {
        Patterns.EMAIL_ADDRESS.matcher(value).matches() -> "mailto:$value"
        value.startsWith("mailto:", ignoreCase = true) &&
            Patterns.EMAIL_ADDRESS.matcher(value.substring("mailto:".length)).matches() -> value
        Patterns.WEB_URL.matcher(value).matches() -> if (SchemeRegex.containsMatchIn(value)) value else "http://$value"
        else -> null
    }

    /** The Link extension's default shouldAutoLink. */
    private fun shouldAutoLink(url: String): Boolean {
        if (SchemeRegex.containsMatchIn(url) || MaybeSchemeRegex.containsMatchIn(url) && '@' !in url) return true
        val hostname = url.substringAfterLast('@').split(HostEndRegex).first()
        if (Ipv4Regex.matches(hostname)) return false
        return '.' in hostname
    }

    /** The whitespace autolink splits words on (DOMPurify's list). */
    private val LinkSpace = Regex("[\\u0000-\\u0020\\u00a0\\u1680\\u180e\\u2000-\\u2029\\u205f\\u3000]")
    private val SchemeRegex = Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE)
    private val MaybeSchemeRegex = Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE)
    private val HostEndRegex = Regex("[/?#:]")
    private val Ipv4Regex = Regex("""\d{1,3}(\.\d{1,3}){3}""")
}
