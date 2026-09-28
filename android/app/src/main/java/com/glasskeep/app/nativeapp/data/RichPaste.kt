package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.pm.PmClipboardParser
import com.glasskeep.app.nativeapp.data.pm.PmDomSerializer
import com.glasskeep.app.nativeapp.data.pm.PmFragment
import com.glasskeep.app.nativeapp.data.pm.PmMark
import com.glasskeep.app.nativeapp.data.pm.PmMarkType
import com.glasskeep.app.nativeapp.data.pm.PmNode
import com.glasskeep.app.nativeapp.data.pm.PmSchema
import com.glasskeep.app.nativeapp.data.pm.PmSlice
import com.glasskeep.app.nativeapp.data.pm.PmTransform
import com.glasskeep.app.nativeapp.data.pm.pmTextNear
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Copy and paste as the web editor does them, through its own document
 * model (data/pm): the note becomes the web's document, the clipboard is
 * read and fitted around the selection by the very algorithms the web
 * runs, the Tiptap plugins that follow a paste run in the web's order, and
 * the result comes back as blocks.
 *
 * The flat block model cannot hold a quote inside a list item, which a
 * paste can build on the web; such a quote is lifted, its blocks staying in
 * the item without the card. It holds no lettered-list type either, so a
 * pasted `<ol type="a">` becomes an ordinary numbered list.
 */
object RichPaste {
    /**
     * The paste of a clipboard holding [text] (its text/plain) and [html]
     * (its text/html, when it has one) over [state]'s selection, or null
     * when nothing changes. [plainMode] is the "plain" paste preference,
     * where only the text is read; [asPlainText] a paste asked to be plain
     * (the web's Shift+Ctrl+V).
     */
    fun paste(state: RichEditing, text: String, html: String?, plainMode: Boolean, asPlainText: Boolean = false): RichEditing? {
        val span = state.span ?: return null
        val tree = Tree(state.blocks)
        val from = tree.position(span.start, span.startOffset)
        val to = tree.position(span.end, span.endOffset)
        val tr = PmTransform(tree.doc)
        val caret = if (plainMode && text.isNotEmpty()) {
            replaceSelection(tr, from, to, PmClipboardParser.plainTextSlice(text))
        } else {
            val slice = PmClipboardParser.parse(text, html, asPlainText, tree.doc.resolve(from)) ?: return null
            val single = slice.content.firstChild.takeIf { slice.openStart == 0 && slice.openEnd == 0 && slice.content.childCount == 1 }
            if (single != null) replaceWith(tr, from, to, single) else replaceSelection(tr, from, to, slice)
        } ?: return null
        val (doc, finalCaret) = afterPaste(tree.doc, tr.doc, caret, pasteRules = html?.contains("data-pm-slice") != true)
        return toEditing(state.blocks, doc, finalCaret)
    }

    /** The text/html the web puts on the clipboard for [span] of [blocks]. */
    fun copyHtml(blocks: List<RichBlock>, span: RichSpan): String {
        val tree = Tree(blocks)
        val slice = tree.doc.slice(tree.position(span.start, span.startOffset), tree.position(span.end, span.endOffset), includeParents = true)
        return PmDomSerializer.serializeForClipboard(slice)
    }

    /** [blocks] as the web's document, with where each block starts. */
    private class Tree(blocks: List<RichBlock>) {
        val doc = PmSchema.nodeFromJson(RichDoc.encodeDoc(blocks))
        private val starts = blockStarts(doc)

        fun position(index: Int, offset: Int) = starts[index] + offset
    }

    /** Where each block's text starts (a rule: where the rule is), in
     *  document order: every block is one textblock or one rule. */
    private fun blockStarts(doc: PmNode): List<Int> {
        val starts = mutableListOf<Int>()
        doc.descendants { node, pos, _, _ ->
            when {
                node.isTextblock -> {
                    starts.add(pos + 1)
                    false
                }
                node.type === PmSchema.horizontalRule -> {
                    starts.add(pos)
                    false
                }
                else -> true
            }
        }
        return starts
    }

    /** Transaction.replaceSelection(): the caret goes to the end of what
     *  was inserted. */
    private fun replaceSelection(tr: PmTransform, from: Int, to: Int, slice: PmSlice): Int? {
        var lastNode = slice.content.lastChild
        var lastParent: PmNode? = null
        repeat(slice.openEnd) {
            lastParent = lastNode
            lastNode = lastNode?.lastChild
        }
        val steps = tr.steps.size
        tr.replaceRange(from, to, slice)
        val inline = lastNode?.isInline ?: (lastParent?.isTextblock == true)
        return insertionEnd(tr, steps, if (inline) -1 else 1)
    }

    /** replaceSelectionWith(), for a slice that is one closed node. */
    private fun replaceWith(tr: PmTransform, from: Int, to: Int, node: PmNode): Int? {
        val steps = tr.steps.size
        tr.replaceRangeWith(from, to, node)
        return insertionEnd(tr, steps, if (node.isInline) -1 else 1)
    }

    /** selectionToInsertionEnd(), or null when nothing was replaced. */
    private fun insertionEnd(tr: PmTransform, startSteps: Int, bias: Int): Int? {
        if (tr.steps.size <= startSteps) return null
        var end: Int? = null
        tr.steps.last().getMap().forEach { _, _, _, newEnd -> if (end == null) end = newEnd }
        return pmTextNear(tr.doc.resolve(end!!), bias)
    }

    // ---------- What follows a paste ----------

    /** A markdown paste rule: markPasteRule() with [find]. */
    private class MarkRule(pattern: String, val type: PmMarkType) {
        val find = Regex(pattern.replace("\\s", JsSpace))
    }

    /** JavaScript's \s. */
    private const val JsSpace = "[\\t\\n\\u000b\\u000c\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]"
    private val JsSpaceChar = Regex(JsSpace)

    private val Highlight = MarkRule("(?:^|\\s)(==(?!\\s+==)((?:[^=]+))==(?!\\s+==))", PmSchema.highlight)
    private val Strike = MarkRule("(?:^|\\s)(~~(?!\\s+~~)((?:[^~]+))~~(?!\\s+~~))", PmSchema.strike)
    private val ItalicStar = MarkRule("(?:^|\\s)(\\*(?!\\s+\\*)((?:[^*]+))\\*(?!\\s+\\*))", PmSchema.italic)
    private val ItalicUnderscore = MarkRule("(?:^|\\s)(_(?!\\s+_)((?:[^_]+))_(?!\\s+_))", PmSchema.italic)
    private val Code = MarkRule("(^|[^`])`([^`]+)`(?!`)", PmSchema.code)
    private val BoldStar = MarkRule("(?:^|\\s)(\\*\\*(?!\\s+\\*\\*)((?:[^*]+))\\*\\*(?!\\s+\\*\\*))", PmSchema.bold)
    private val BoldUnderscore = MarkRule("(?:^|\\s)(__(?!\\s+__)((?:[^_]+))__(?!\\s+__))", PmSchema.bold)

    /**
     * The transactions the web's plugins append to a paste, in the order
     * Tiptap lists them: the highlight paste rule, TrailingNode, then the
     * strike, italic, code and bold paste rules. Paste rules skip a paste
     * of the web's own markup, as they do there. Each sees the document
     * as the ones before it left it, and the caret follows their changes.
     */
    private fun afterPaste(original: PmNode, pasted: PmNode, caret: Int, pasteRules: Boolean): Pair<PmNode, Int> {
        var doc = pasted
        var position = caret
        fun adopt(tr: PmTransform?) {
            if (tr == null) return
            doc = tr.doc
            position = tr.mapping.map(position)
            val resolved = doc.resolve(position)
            if (!resolved.parent.inlineContent) position = pmTextNear(resolved, 1)
        }
        if (pasteRules) adopt(markRule(original, doc, Highlight))
        if (doc.lastChild?.type !== PmSchema.paragraph) {
            val end = doc.content.size
            adopt(PmTransform(doc).replace(end, end, PmSlice(PmFragment.from(PmSchema.paragraph.create()), 0, 0)))
        }
        if (pasteRules) {
            for (rule in listOf(Strike, ItalicStar, ItalicUnderscore, Code, BoldStar, BoldUnderscore)) adopt(markRule(original, doc, rule))
        }
        return doc to position
    }

    /** One paste rule over what changed since [original]; null when it
     *  changes nothing, or when one of its matches is refused (the whole
     *  rule is then dropped, as on the web). */
    private fun markRule(original: PmNode, doc: PmNode, rule: MarkRule): PmTransform? {
        val diffStart = original.content.findDiffStart(doc.content) ?: return null
        val diffEnd = original.content.findDiffEnd(doc.content)?.second ?: return null
        if (diffStart == diffEnd) return null
        val from = maxOf(diffStart - 1, 0)
        val to = diffEnd - 1
        val tr = PmTransform(doc)
        var refused = false
        doc.nodesBetween(from, to, { node, pos, _, _ ->
            if (node.type.code || !(node.isText || node.isTextblock || node.isInline)) return@nodesBetween true
            val resolvedFrom = maxOf(from, pos)
            val resolvedTo = minOf(to, pos + node.content.size)
            if (resolvedFrom >= resolvedTo) return@nodesBetween true
            val text = node.textBetween(resolvedFrom - pos, resolvedTo - pos, null, "￼")
            for (match in rule.find.findAll(text)) {
                val start = resolvedFrom + match.range.first + 1
                val end = start + match.value.length
                if (!markMatch(doc, tr, tr.mapping.map(start), tr.mapping.map(end), match, rule.type)) refused = true
            }
            true
        })
        return if (refused || tr.steps.isEmpty()) null else tr
    }

    /** markPasteRule()'s handler: the markers around the text go, the text
     *  takes the mark. False when a mark there excludes it (inline code). */
    private fun markMatch(doc: PmNode, tr: PmTransform, from: Int, to: Int, match: MatchResult, type: PmMarkType): Boolean {
        val captureGroup = match.groupValues.last()
        if (captureGroup.isEmpty()) return true
        val fullMatch = match.value
        val startSpaces = fullMatch.indexOfFirst { !JsSpaceChar.matches(it.toString()) }
        val textStart = from + fullMatch.indexOf(captureGroup)
        val textEnd = textStart + captureGroup.length
        val excluded = marksBetween(doc, from, to).any { (mark, markTo) ->
            mark.type.excluded.any { it === type && it !== mark.type } && markTo > textStart
        }
        if (excluded) return false
        if (textEnd < to) tr.delete(textEnd, to)
        if (textStart > from) tr.delete(from + startSpaces, textStart)
        tr.addMark(from + startSpaces, from + startSpaces + captureGroup.length, type.create())
        return true
    }

    /** getMarksBetween(): every mark of the nodes in `[from, to)`, with where
     *  its node ends. */
    private fun marksBetween(doc: PmNode, from: Int, to: Int): List<Pair<PmMark, Int>> {
        val marks = mutableListOf<Pair<PmMark, Int>>()
        doc.nodesBetween(from, to, { node, pos, _, _ ->
            node.marks.forEach { marks.add(it to pos + node.nodeSize) }
            true
        })
        return marks
    }

    // ---------- Back to blocks ----------

    /** [doc] as blocks, the caret at [caret]; blocks left as they were keep
     *  their ids and what they carry beyond the document. */
    private fun toEditing(old: List<RichBlock>, doc: PmNode, caret: Int): RichEditing? {
        val starts = blockStarts(doc)
        val index = starts.indexOfLast { it <= caret }
        val parsed = RichDoc.parseDocJson(flatModel(doc.toJson(), inItem = false).single()) ?: return null
        val blocks = keepUnchanged(old, parsed)
        return RichEditing(blocks, RichSelection.caret(blocks[index].id, caret - starts[index]))
    }

    /** A quote inside a list item gives its blocks to the item; an ordered
     *  list loses its type. */
    internal fun flatModel(node: JsonObject, inItem: Boolean = false): List<JsonObject> {
        val type = (node["type"] as? JsonPrimitive)?.content
        val children = (node["content"] as? JsonArray)?.map { it as JsonObject }
        if (type == "blockquote" && inItem) return children.orEmpty().flatMap { flatModel(it, inItem = true) }
        val nested = inItem || type == "listItem" || type == "taskItem"
        val fields = node.toMutableMap()
        if (children != null) fields["content"] = JsonArray(children.flatMap { flatModel(it, nested) })
        if (type == "orderedList") (node["attrs"] as? JsonObject)?.let { fields["attrs"] = JsonObject(it + ("type" to JsonNull)) }
        return listOf(JsonObject(fields))
    }

    private fun keepUnchanged(old: List<RichBlock>, new: List<RichBlock>): List<RichBlock> {
        fun comparable(block: RichBlock) = block.copy(
            id = "",
            quotes = block.quotes.map { it.copy(id = "") },
            checked = block.checked.takeIf { block.kind == RichBlockKind.TASK_ITEM } ?: false,
            language = block.language.takeIf { block.kind == RichBlockKind.CODE_BLOCK },
        )
        fun restored(fresh: RichBlock, previous: RichBlock) = fresh.copy(
            id = previous.id,
            checked = if (fresh.kind == RichBlockKind.TASK_ITEM) fresh.checked else previous.checked,
            language = if (fresh.kind == RichBlockKind.CODE_BLOCK) fresh.language else previous.language,
        )
        var prefix = 0
        while (prefix < old.size && prefix < new.size && comparable(old[prefix]) == comparable(new[prefix])) prefix++
        var suffix = 0
        while (suffix < old.size - prefix && suffix < new.size - prefix &&
            comparable(old[old.size - 1 - suffix]) == comparable(new[new.size - 1 - suffix])
        ) {
            suffix++
        }
        return new.mapIndexed { i, block ->
            when {
                i < prefix -> restored(block, old[i])
                i >= new.size - suffix -> restored(block, old[old.size - (new.size - i)])
                else -> block
            }
        }
    }
}
