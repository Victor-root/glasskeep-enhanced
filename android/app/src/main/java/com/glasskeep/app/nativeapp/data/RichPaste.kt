package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.pm.PmAttrs
import com.glasskeep.app.nativeapp.data.pm.PmClipboardParser
import com.glasskeep.app.nativeapp.data.pm.PmDomSerializer
import com.glasskeep.app.nativeapp.data.pm.PmFragment
import com.glasskeep.app.nativeapp.data.pm.PmMarkType
import com.glasskeep.app.nativeapp.data.pm.PmNode
import com.glasskeep.app.nativeapp.data.pm.PmSchema
import com.glasskeep.app.nativeapp.data.pm.PmSlice
import com.glasskeep.app.nativeapp.data.pm.PmTransform
import com.glasskeep.app.nativeapp.data.pm.pmTextNear

/**
 * Copy and paste as the web editor does them, through its own document
 * model (data/pm): the note becomes the web's document, the clipboard is
 * read and fitted around the selection by the very algorithms the web
 * runs, the Tiptap plugins that follow a paste run in the web's order, and
 * the result comes back as blocks ([RichTree]).
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
        val tree = RichTree(state.blocks)
        val from = tree.position(span.start, span.startOffset)
        val to = tree.position(span.end, span.endOffset)
        val tr = PmTransform(tree.doc)
        val caret = if (plainMode && text.isNotEmpty()) {
            replaceSelection(tr, from, to, PmClipboardParser.plainTextSlice(text))
        } else {
            val slice = PmClipboardParser.parse(text, html, asPlainText, tree.doc.resolve(from))
            if (from != to) {
                val backward = state.selection.head == RichPos(state.blocks[span.start].id, span.startOffset)
                linkSelection(tree, if (backward) to else from, if (backward) from else to, slice)?.let { return it }
            }
            if (slice == null) return null
            val single = slice.content.firstChild.takeIf { slice.openStart == 0 && slice.openEnd == 0 && slice.content.childCount == 1 }
            if (single != null) replaceWith(tr, from, to, single) else replaceSelection(tr, from, to, slice)
        } ?: return null
        return pasted(tree, appended(tree.doc, tr, pasteRules = html?.contains("data-pm-slice") != true, anchor = caret, head = caret))
    }

    /** The text/html the web puts on the clipboard for [span] of [blocks]. */
    fun copyHtml(blocks: List<RichBlock>, span: RichSpan): String {
        val tree = RichTree(blocks)
        val slice = tree.doc.slice(tree.position(span.start, span.startOffset), tree.position(span.end, span.endOffset), includeParents = true)
        return PmDomSerializer.serializeForClipboard(slice)
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

    /** A paste rule's match in a textblock's text: where it starts, the
     *  whole match, the part that takes the mark and the mark's attributes. */
    private class Match(val index: Int, val full: String, val captured: String, val attrs: PmAttrs? = null)

    /** markPasteRule() with [find], adding [type] ([rich] in the blocks). */
    private class MarkRule(val type: PmMarkType, val rich: RichMarkType, val find: (String) -> List<Match>)

    /** A markdown paste rule, its pattern in JavaScript's syntax. */
    private fun regexRule(pattern: String, type: PmMarkType, rich: RichMarkType): MarkRule {
        val regex = Regex(pattern.replace("\\s", JsSpace))
        return MarkRule(type, rich) { text -> regex.findAll(text).map { Match(it.range.first, it.value, it.groupValues.last()) }.toList() }
    }

    private const val JsSpace = "[${RichDoc.JsSpace}]"
    private val JsSpaceChar = Regex(JsSpace)

    /** The Link extension's paste rule: each address linkify finds. */
    private val LinkRule = MarkRule(PmSchema.link, RichMarkType.LINK) { text ->
        RichLinks.pasteRuleLinks(text).map {
            val value = text.substring(it.start, it.end)
            Match(it.start, value, value, mapOf("href" to it.href))
        }
    }
    private val Highlight = regexRule("(?:^|\\s)(==(?!\\s+==)((?:[^=]+))==(?!\\s+==))", PmSchema.highlight, RichMarkType.HIGHLIGHT)
    private val Strike = regexRule("(?:^|\\s)(~~(?!\\s+~~)((?:[^~]+))~~(?!\\s+~~))", PmSchema.strike, RichMarkType.STRIKE)
    private val ItalicStar = regexRule("(?:^|\\s)(\\*(?!\\s+\\*)((?:[^*]+))\\*(?!\\s+\\*))", PmSchema.italic, RichMarkType.ITALIC)
    private val ItalicUnderscore = regexRule("(?:^|\\s)(_(?!\\s+_)((?:[^_]+))_(?!\\s+_))", PmSchema.italic, RichMarkType.ITALIC)
    private val Code = regexRule("(^|[^`])`([^`]+)`(?!`)", PmSchema.code, RichMarkType.CODE)
    private val BoldStar = regexRule("(?:^|\\s)(\\*\\*(?!\\s+\\*\\*)((?:[^*]+))\\*\\*(?!\\s+\\*\\*))", PmSchema.bold, RichMarkType.BOLD)
    private val BoldUnderscore = regexRule("(?:^|\\s)(__(?!\\s+__)((?:[^_]+))__(?!\\s+__))", PmSchema.bold, RichMarkType.BOLD)

    /** A document after a paste, its selection, and the mark typing no
     *  longer carries on from the caret (the stored marks a rule left). */
    private class Pasted(val doc: PmNode, val anchor: Int, val head: Int, val disarmed: RichMarkType?)

    /**
     * The transactions the web's plugins append to [tr], in the order
     * Tiptap lists them: the link paste rule, autolink, the highlight paste
     * rule, TrailingNode, then the strike, italic, code and bold paste
     * rules, and autolink once more over what those did. Paste rules run
     * on a paste only ([pasteRules]), never on the web's own markup, as
     * there. Each sees the document the ones before it left, and the
     * selection follows their changes.
     */
    private fun appended(original: PmNode, tr: PmTransform, pasteRules: Boolean, anchor: Int, head: Int): Pasted {
        var doc = tr.doc
        var anchorAt = anchor
        var headAt = head
        var disarmed: RichMarkType? = null
        val steps = tr.steps.toMutableList()
        fun adopt(next: PmTransform?, stored: RichMarkType? = null) {
            if (next == null) return
            doc = next.doc
            val mapping = next.mapping
            val rHead = doc.resolve(mapping.map(headAt))
            if (rHead.parent.inlineContent) {
                val rAnchor = doc.resolve(mapping.map(anchorAt))
                anchorAt = if (rAnchor.parent.inlineContent) rAnchor.pos else rHead.pos
                headAt = rHead.pos
            } else {
                headAt = pmTextNear(rHead, 1)
                anchorAt = headAt
            }
            disarmed = stored
            steps += next.steps
        }
        fun rule(rule: MarkRule) {
            if (!pasteRules) return
            val (next, stored) = markRule(original, doc, rule) ?: return
            adopt(next, stored)
        }
        rule(LinkRule)
        adopt(autolink(original, doc, steps.toList()))
        val linkedDoc = doc
        val linkedSteps = steps.size
        rule(Highlight)
        if (doc.lastChild?.type !== PmSchema.paragraph) {
            val end = doc.content.size
            adopt(PmTransform(doc).replace(end, end, PmSlice(PmFragment.from(PmSchema.paragraph.create()), 0, 0)))
        }
        for (markdown in listOf(Strike, ItalicStar, ItalicUnderscore, Code, BoldStar, BoldUnderscore)) rule(markdown)
        adopt(autolink(linkedDoc, doc, steps.subList(linkedSteps, steps.size).toList()))
        return Pasted(doc, anchorAt, headAt, disarmed)
    }

    /** One paste rule over what changed since [original]: its transaction
     *  and the mark it leaves off what is typed next, or null when it
     *  changes nothing or one of its matches is refused (the whole rule is
     *  then dropped, as on the web). */
    private fun markRule(original: PmNode, doc: PmNode, rule: MarkRule): Pair<PmTransform, RichMarkType?>? {
        val diffStart = original.content.findDiffStart(doc.content) ?: return null
        val diffEnd = original.content.findDiffEnd(doc.content)?.second ?: return null
        if (diffStart == diffEnd) return null
        val from = maxOf(diffStart - 1, 0)
        val to = diffEnd - 1
        val tr = PmTransform(doc)
        var refused = false
        var disarmed: RichMarkType? = null
        doc.nodesBetween(from, to, { node, pos, _, _ ->
            if (node.type.code || !(node.isText || node.isTextblock || node.isInline)) return@nodesBetween true
            val resolvedFrom = maxOf(from, pos)
            val resolvedTo = minOf(to, pos + node.content.size)
            if (resolvedFrom >= resolvedTo) return@nodesBetween true
            val text = node.textBetween(resolvedFrom - pos, resolvedTo - pos, null, "￼")
            for (match in rule.find(text)) {
                val start = resolvedFrom + match.index + 1
                val end = start + match.full.length
                val stepsBefore = tr.steps.size
                if (!markMatch(tr, tr.mapping.map(start), tr.mapping.map(end), match, rule.type)) refused = true
                if (tr.steps.size > stepsBefore) disarmed = null
                // removeStoredMark() unless the match ends the text.
                if (match.captured.isNotEmpty() && match.index + match.full.length < text.length) disarmed = rule.rich
            }
            true
        })
        return if (refused || tr.steps.isEmpty()) null else tr to disarmed
    }

    /** markPasteRule()'s handler: the markers around the text go, the text
     *  takes the mark. False when a mark there excludes it (inline code). */
    private fun markMatch(tr: PmTransform, from: Int, to: Int, match: Match, type: PmMarkType): Boolean {
        if (match.captured.isEmpty()) return true
        val startSpaces = match.full.indexOfFirst { !JsSpaceChar.matches(it.toString()) }
        val textStart = from + match.full.indexOf(match.captured)
        val textEnd = textStart + match.captured.length
        val excluded = marksBetween(tr.doc, from, to).any { (mark, markTo) ->
            mark.type.excluded.any { it === type && it !== mark.type } && markTo > textStart
        }
        if (excluded) return false
        if (textEnd < to) tr.delete(textEnd, to)
        if (textStart > from) tr.delete(from + startSpaces, textStart)
        tr.addMark(from + startSpaces, from + startSpaces + match.captured.length, type.create(match.attrs))
        return true
    }

    /**
     * handlePasteLink: over a selection, a clipboard whose text is one
     * address and nothing else links the selection there (setMark()) rather
     * than replacing it, when something selected can take a link. The
     * selection stays. Null when that does not apply.
     */
    private fun linkSelection(tree: RichTree, anchor: Int, head: Int, slice: PmSlice?): RichEditing? {
        val doc = tree.doc
        val content = slice?.content ?: PmFragment.Empty
        val href = RichLinks.wholeLink((0 until content.childCount).joinToString("") { content.child(it).textContent }) ?: return null
        val from = minOf(anchor, head)
        val to = maxOf(anchor, head)
        if (!canSetMark(doc, from, to, PmSchema.link)) return null
        val tr = PmTransform(doc)
        val attrs = mapOf("href" to href)
        doc.nodesBetween(from, to, { node, pos, _, _ ->
            val trimmedFrom = maxOf(pos, from)
            val trimmedTo = minOf(pos + node.nodeSize, to)
            val links = node.marks.filter { it.type === PmSchema.link }
            if (links.isEmpty()) {
                tr.addMark(trimmedFrom, trimmedTo, PmSchema.link.create(attrs))
            } else {
                for (link in links) tr.addMark(trimmedFrom, trimmedTo, PmSchema.link.create(link.attrs + attrs))
            }
            true
        })
        return pasted(tree, appended(doc, tr, pasteRules = false, anchor = anchor, head = head))
    }

    /** canSetMark() over a selection: some inline node in it sits where
     *  [type] is allowed, among marks that do not exclude it. */
    private fun canSetMark(doc: PmNode, from: Int, to: Int, type: PmMarkType): Boolean {
        var supported = false
        doc.nodesBetween(from, to, { node, _, parent, _ ->
            if (supported) return@nodesBetween false
            if (node.isInline) {
                val parentAllows = parent == null || parent.type.allowsMarkType(type)
                val marksAllow = node.marks.any { it.type === type } || node.marks.none { it.type.excludes(type) }
                supported = parentAllows && marksAllow
            }
            !supported
        })
        return supported
    }

    /** A paste's result as the editor's state, the mark a rule left off
     *  what is typed next disarmed. */
    private fun pasted(tree: RichTree, result: Pasted): RichEditing? =
        tree.editing(result.doc, result.anchor, result.head, result.disarmed?.let { listOf(PendingMark(it, remove = true)) }.orEmpty())
}
