package com.glasskeep.app.nativeapp.data.pm

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * prosemirror-model's DOMParser (from_dom.ts) with the parse rules Tiptap
 * builds from the web editor's extensions, in the order and with the
 * attribute readers Tiptap gives them, and prosemirror-view's
 * parseFromClipboard() (clipboard.ts) on top: how the web turns the text
 * and markup of a clipboard into the slice it pastes. No rule of this
 * schema uses a context, skips or closes its parent or names a content
 * element, and nothing records positions, so those paths are left out.
 */

/** A tag rule: `tag`, or `tag[attr]`, or `tag[attr="value"]`. [attrs]
 *  reads the node's or mark's attributes off the element, or returns null
 *  when the rule does not match it after all. */
internal class PmTagRule(
    val tag: String,
    val attrName: String? = null,
    val attrValue: String? = null,
    val node: PmNodeType? = null,
    val mark: PmMarkType? = null,
    val consuming: Boolean = true,
    val preserveWhitespace: PmWs? = null,
    val attrs: (HtmlElement) -> PmAttrs?,
) {
    fun matches(dom: HtmlElement): Boolean {
        if (dom.name != tag) return false
        if (attrName == null) return true
        val value = dom.getAttribute(attrName) ?: return false
        return attrValue == null || value == attrValue
    }
}

/** A style rule: `prop`, or `prop=value`, adding [mark] or clearing the
 *  marks [clearMark] picks. [attrs] returns null when the value does not
 *  match after all. */
internal class PmStyleRule(
    val prop: String,
    val value: String? = null,
    val mark: PmMarkType? = null,
    val clearMark: ((PmMark) -> Boolean)? = null,
    val consuming: Boolean = true,
    val attrs: (String) -> PmAttrs? = { emptyMap() },
)

/** preserveWhitespace: `true` keeps spaces but turns newlines into spaces
 *  (or line breaks), `FULL` keeps everything. */
internal enum class PmWs { COLLAPSE, PRESERVE, FULL }

internal object PmParseRules {
    private val Alignments = setOf("left", "center", "right", "justify")
    private val UnderlineStyles = setOf("simple", "double", "dotted", "dashed", "wavy")
    private val AllowedProtocols = listOf("http", "https", "ftp", "ftps", "mailto", "tel", "callto", "sms", "cid", "xmpp")
    private val UnicodeWhitespace = Regex("[\\u0000- \\u00a0\\u1680\\u180e\\u2000-\\u2029\\u205f\\u3000]")
    private val AllowedUri = Regex(
        "^(?:(?:${AllowedProtocols.joinToString("|")}):|[^a-z]|[a-z0-9+.-]+(?:[^a-z+.\\-:]|$))",
        RegexOption.IGNORE_CASE,
    )

    /** Link's isAllowedUri(): a known scheme, or no scheme at all. */
    fun isAllowedUri(uri: String?): Boolean =
        uri.isNullOrEmpty() || AllowedUri.containsMatchIn(uri.replace(UnicodeWhitespace, ""))

    private fun indent(el: HtmlElement): Int = parseIntJs(el.getAttribute("data-indent") ?: "0")?.takeIf { it > 0 } ?: 0

    private fun textAlign(el: HtmlElement): String? = el.style.textAlign.takeIf { it in Alignments }

    /** A textblock's own attributes: TextAlign's, then Indent's. */
    private fun textblockAttrs(el: HtmlElement): PmAttrs = buildMap {
        textAlign(el)?.let { put("textAlign", it) }
        put("indent", indent(el))
    }

    /** Tiptap's fromString() over a plain attribute. */
    private fun fromString(value: String?): Any? = when {
        value == null -> null
        Regex("^[+-]?(?:\\d*\\.)?\\d+$").matches(value) -> value.toDouble().let { if (it == Math.floor(it)) it.toInt() else it }
        value == "true" -> true
        value == "false" -> false
        else -> value
    }

    /** Declarations of the style attribute, last one first, as Color's
     *  parseHTML scans them. */
    private fun rawStyleValue(el: HtmlElement, property: String): String? {
        val decls = el.getAttribute("style")?.split(";")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: return null
        for (decl in decls.reversed()) {
            val parts = decl.split(":")
            if (parts.size >= 2 && parts[0].trim().lowercase() == property) {
                return parts.drop(1).joinToString(":").trim().replace(Regex("['\"]+"), "")
            }
        }
        return null
    }

    /** TextStyle's mergeNestedSpanStyles(): a span's style is prefixed to
     *  the styles of the spans directly inside it. */
    private fun mergeNestedSpanStyles(element: HtmlElement) {
        fun childSpans(el: HtmlElement, depth: Int): List<HtmlElement> {
            if (el.elementChildren.isEmpty() || depth > 20) return emptyList()
            return el.elementChildren.flatMap { child ->
                if (child.name == "span") listOf(child) else if (child.elementChildren.isNotEmpty()) childSpans(child, depth + 1) else emptyList()
            }
        }
        for (span in childSpans(element, 0)) {
            val parentStyle = span.parent?.closest("span")?.getAttribute("style")
            span.setAttribute("style", "$parentStyle;${span.getAttribute("style")}")
        }
    }

    val tags: List<PmTagRule> = listOf(
        PmTagRule("ul", "data-type", "taskList", node = PmSchema.taskList) { emptyMap() },
        PmTagRule("li", "data-type", "taskItem", node = PmSchema.taskItem) { el ->
            val checked = el.getAttribute("data-checked")
            mapOf("checked" to (checked == "" || checked == "true"))
        },
        PmTagRule("a", "href", mark = PmSchema.link) { el ->
            val href = el.getAttribute("href")
            if (href.isNullOrEmpty() || !isAllowedUri(href)) {
                null
            } else {
                buildMap {
                    put("href", href)
                    for (name in listOf("target", "rel", "class", "title")) fromString(el.getAttribute(name))?.let { put(name, it) }
                }
            }
        },
        PmTagRule("span", mark = PmSchema.textStyle, consuming = false) { el ->
            if (!el.hasAttribute("style")) {
                null
            } else {
                mergeNestedSpanStyles(el)
                mapOf(
                    "color" to (rawStyleValue(el, "color") ?: el.style.color.replace(Regex("['\"]+"), "")),
                    "fontFamily" to el.style.fontFamily,
                    "fontSize" to el.style.fontSize,
                )
            }
        },
        PmTagRule("strong", mark = PmSchema.bold) { emptyMap() },
        PmTagRule("b", mark = PmSchema.bold) { el -> if (el.style.fontWeight == "normal") null else emptyMap() },
        PmTagRule("code", mark = PmSchema.code) { emptyMap() },
        PmTagRule("em", mark = PmSchema.italic) { emptyMap() },
        PmTagRule("i", mark = PmSchema.italic) { el -> if (el.style.fontStyle == "normal") null else emptyMap() },
        PmTagRule("s", mark = PmSchema.strike) { emptyMap() },
        PmTagRule("del", mark = PmSchema.strike) { emptyMap() },
        PmTagRule("strike", mark = PmSchema.strike) { emptyMap() },
        PmTagRule("u", mark = PmSchema.underline) { el ->
            val dataStyle = el.getAttribute("data-underline-style")
            val style = if (dataStyle != null && dataStyle in UnderlineStyles) {
                dataStyle
            } else {
                el.style.textDecorationStyle.takeIf { it in UnderlineStyles }
            }
            val color = el.getAttribute("data-underline-color")?.takeIf { it.isNotEmpty() }
                ?: el.style.textDecorationColor.takeIf { it.isNotEmpty() }
            buildMap {
                style?.let { put("style", it) }
                color?.let { put("color", it) }
            }
        },
        PmTagRule("mark", mark = PmSchema.highlight) { el ->
            mapOf("color" to (el.getAttribute("data-color")?.takeIf { it.isNotEmpty() } ?: el.style.backgroundColor))
        },
        PmTagRule("sub", mark = PmSchema.subscript) { emptyMap() },
        PmTagRule("sup", mark = PmSchema.superscript) { emptyMap() },
        PmTagRule("p", node = PmSchema.paragraph) { el -> textblockAttrs(el) },
        PmTagRule("blockquote", node = PmSchema.blockquote) { el -> mapOf("indent" to indent(el)) },
        PmTagRule("ul", node = PmSchema.bulletList) { emptyMap() },
        PmTagRule("br", node = PmSchema.hardBreak) { emptyMap() },
    ) + (1..5).map { level ->
        PmTagRule("h$level", node = PmSchema.heading) { el -> mapOf("level" to level) + textblockAttrs(el) }
    } + listOf(
        PmTagRule("hr", node = PmSchema.horizontalRule) { emptyMap() },
        PmTagRule("li", node = PmSchema.listItem) { el -> mapOf("indent" to indent(el)) },
        PmTagRule("ol", node = PmSchema.orderedList) { el ->
            buildMap {
                put("start", if (el.hasAttribute("start")) parseIntJs(el.getAttribute("start").orEmpty()) ?: 1 else 1)
                el.getAttribute("type")?.let { put("type", it) }
            }
        },
        PmTagRule("pre", node = PmSchema.codeBlock, preserveWhitespace = PmWs.FULL) { el ->
            buildMap {
                el.elementChildren.firstOrNull()?.getAttribute("class")?.split(Regex("\\s+"))
                    ?.firstOrNull { it.startsWith("language-") }?.removePrefix("language-")?.takeIf { it.isNotEmpty() }
                    ?.let { put("language", it) }
                put("indent", indent(el))
            }
        },
    )

    val styles: List<PmStyleRule> = listOf(
        PmStyleRule("font-weight", value = "400", clearMark = { it.type === PmSchema.bold }),
        PmStyleRule("font-weight", mark = PmSchema.bold) { v -> if (Regex("^(bold(er)?|[5-9]\\d{2,})$").matches(v)) emptyMap() else null },
        PmStyleRule("font-style", value = "normal", clearMark = { it.type === PmSchema.italic }),
        PmStyleRule("font-style", value = "italic", mark = PmSchema.italic),
        PmStyleRule("text-decoration", mark = PmSchema.strike, consuming = false) { v -> if ("line-through" in v) emptyMap() else null },
        PmStyleRule("text-decoration", mark = PmSchema.underline, consuming = false) { v -> if ("underline" in v) emptyMap() else null },
        PmStyleRule("vertical-align", mark = PmSchema.subscript) { v -> if (v == "sub") emptyMap() else null },
        PmStyleRule("vertical-align", mark = PmSchema.superscript) { v -> if (v == "super") emptyMap() else null },
    )

    val matchedStyles = listOf("font-weight", "font-style", "text-decoration", "vertical-align")
}

/** JavaScript's parseInt(value, 10): leading digits, or null for NaN. */
internal fun parseIntJs(value: String): Int? =
    Regex("^\\s*([+-]?\\d+)").find(value)?.groupValues?.get(1)?.toBigInteger()?.let {
        it.toInt().takeIf { _ -> it.bitLength() < 32 }
    }

private val BlockTags = setOf(
    "address", "article", "aside", "blockquote", "canvas", "dd", "div", "dl", "fieldset", "figcaption", "figure",
    "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "noscript", "ol", "output",
    "p", "pre", "section", "table", "tfoot", "ul",
)

private val IgnoreTags = setOf("head", "noscript", "object", "script", "style", "title")

private val ListTags = setOf("ol", "ul")

private const val OPT_PRESERVE_WS = 1
private const val OPT_PRESERVE_WS_FULL = 2
private const val OPT_OPEN_LEFT = 4

/** HTML's collapsible whitespace, and JavaScript's \s. */
private val HtmlSpace = Regex("[ \\t\\r\\n\\u000c]+")
private val JsSpace = Regex("[\\t\\n\\u000b\\u000c\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]")

private fun wsOptionsFor(type: PmNodeType?, preserveWhitespace: PmWs?, base: Int): Int {
    if (preserveWhitespace != null) {
        return (if (preserveWhitespace != PmWs.COLLAPSE) OPT_PRESERVE_WS else 0) or
            (if (preserveWhitespace == PmWs.FULL) OPT_PRESERVE_WS_FULL else 0)
    }
    return if (type != null && type.code) OPT_PRESERVE_WS or OPT_PRESERVE_WS_FULL else base and OPT_OPEN_LEFT.inv()
}

private class NodeContext(
    val type: PmNodeType?,
    val attrs: PmAttrs?,
    val marks: List<PmMark>,
    val solid: Boolean,
    match: PmContentMatch?,
    var options: Int,
) {
    var match: PmContentMatch? = match ?: if (options and OPT_OPEN_LEFT != 0) null else type!!.contentMatch
    val content = mutableListOf<PmNode>()

    fun findWrapping(node: PmNode): List<PmNodeType>? {
        if (match == null) {
            val type = type ?: return emptyList()
            val fill = type.contentMatch.fillBefore(PmFragment.from(node))
            if (fill != null) {
                match = type.contentMatch.matchFragment(fill)
            } else {
                val start = type.contentMatch
                val wrap = start.findWrapping(node.type) ?: return null
                match = start
                return wrap
            }
        }
        return match!!.findWrapping(node.type)
    }

    private fun finishContent(openEnd: Boolean): PmFragment {
        if (options and OPT_PRESERVE_WS == 0) {
            val last = content.lastOrNull()
            if (last != null && last.isText) {
                val trailing = Regex("[ \\t\\r\\n\\u000c]+$").find(last.text!!)
                if (trailing != null) {
                    if (last.text!!.length == trailing.value.length) {
                        content.removeAt(content.lastIndex)
                    } else {
                        content[content.lastIndex] = (last as PmTextNode).withText(last.text.dropLast(trailing.value.length))
                    }
                }
            }
        }
        var fragment = PmFragment.fromArray(content)
        val match = match
        if (!openEnd && match != null) fragment = fragment.append(match.fillBefore(PmFragment.Empty, true)!!)
        return fragment
    }

    fun finishNode(openEnd: Boolean): PmNode = type!!.create(attrs, finishContent(openEnd), marks)

    fun finishFragment(openEnd: Boolean): PmFragment = finishContent(openEnd)

    fun inlineContext(dom: HtmlNode): Boolean {
        if (type != null) return type.inlineContent
        if (content.isNotEmpty()) return content[0].isInline
        return dom.parent?.let { it.name !in BlockTags } ?: false
    }
}

/** The parse of a clipboard's markup, open at both sides (parseSlice). */
private class ParseContext(
    val preserveWhitespace: PmWs?,
    val context: PmResolvedPos?,
    val ruleFromNode: ((HtmlElement) -> Boolean)?,
) {
    var open = 0
    var needsBlock = false
    var localPreserveWS = false
    val nodes = mutableListOf(NodeContext(null, null, emptyList(), true, null, wsOptionsFor(null, preserveWhitespace, 0) or OPT_OPEN_LEFT))

    val top get() = nodes[open]

    fun addDOM(dom: HtmlNode, marks: List<PmMark>) {
        when (dom) {
            is HtmlText -> addTextNode(dom, dom.value, marks)
            is HtmlElement -> addElement(dom, marks)
            is HtmlComment -> Unit
        }
    }

    fun addTextNode(dom: HtmlNode, nodeValue: String, marks: List<PmMark>) {
        var value = nodeValue
        val top = top
        val full = top.options and OPT_PRESERVE_WS_FULL != 0
        val preserve = full || localPreserveWS || top.options and OPT_PRESERVE_WS > 0
        if (full || top.inlineContext(dom) || Regex("[^ \\t\\r\\n\\u000c]").containsMatchIn(value)) {
            if (!preserve) {
                value = value.replace(HtmlSpace, " ")
                if (value.startsWith(" ") && open == nodes.size - 1) {
                    val nodeBefore = top.content.lastOrNull()
                    val domNodeBefore = dom.previousSibling
                    if (nodeBefore == null || (domNodeBefore is HtmlElement && domNodeBefore.name == "br") ||
                        (nodeBefore.isText && nodeBefore.text!!.last() in " \t\r\n\u000c")
                    ) {
                        value = value.substring(1)
                    }
                }
            } else if (full) {
                value = value.replace(Regex("\r\n?"), "\n")
            } else if (Regex("[\r\n]").containsMatchIn(value) && this.top.findWrapping(PmSchema.hardBreak.create()) != null) {
                val lines = value.split(Regex("\r?\n|\r"))
                for ((i, line) in lines.withIndex()) {
                    if (i > 0) insertNode(PmSchema.hardBreak.create(), marks, true)
                    if (line.isNotEmpty()) insertNode(PmSchema.text(line), marks, !hasNonSpace(line))
                }
                value = ""
            } else {
                value = value.replace(Regex("\r?\n|\r"), " ")
            }
            if (value.isNotEmpty()) insertNode(PmSchema.text(value), marks, !hasNonSpace(value))
        }
    }

    /** JavaScript's /\S/.test(text). */
    private fun hasNonSpace(text: String) = text.any { !JsSpace.matches(it.toString()) }

    fun addElement(dom: HtmlElement, marks: List<PmMark>, matchAfter: PmTagRule? = null) {
        val outerWS = localPreserveWS
        var top = top
        if (dom.name == "pre" || dom.style.whiteSpace.contains("pre")) localPreserveWS = true
        val name = dom.name
        if (name in ListTags) normalizeList(dom)
        val ignored = ruleFromNode?.invoke(dom) == true
        val matched = if (ignored) null else matchTag(dom, matchAfter)
        if (if (ignored) true else matched == null && name in IgnoreTags) {
            ignoreFallback(dom, marks)
        } else if (matched == null) {
            var sync = false
            val oldNeedsBlock = needsBlock
            var leaf = false
            if (name in BlockTags) {
                if (top.content.isNotEmpty() && top.content[0].isInline && open > 0) {
                    open--
                    top = this.top
                }
                sync = true
                if (top.type == null) needsBlock = true
            } else if (dom.firstChild == null) {
                leafFallback(dom, marks)
                leaf = true
            }
            if (!leaf) {
                addAll(dom, readStyles(dom, marks))
                if (sync) sync(top)
                needsBlock = oldNeedsBlock
            }
        } else {
            val (rule, attrs) = matched
            addElementByRule(dom, rule, attrs, readStyles(dom, marks), if (rule.consuming) null else rule)
        }
        localPreserveWS = outerWS
    }

    fun matchTag(dom: HtmlElement, after: PmTagRule?): Pair<PmTagRule, PmAttrs>? {
        val rules = PmParseRules.tags
        val start = if (after == null) 0 else rules.indexOf(after) + 1
        for (i in start until rules.size) {
            val rule = rules[i]
            if (!rule.matches(dom)) continue
            val attrs = rule.attrs(dom) ?: continue
            return rule to attrs
        }
        return null
    }

    fun leafFallback(dom: HtmlElement, marks: List<PmMark>) {
        if (dom.name == "br" && top.type?.inlineContent == true) addTextNode(HtmlText("\n"), "\n", marks)
    }

    fun ignoreFallback(dom: HtmlElement, marks: List<PmMark>) {
        if (dom.name == "br" && top.type?.inlineContent != true) findPlace(PmSchema.text("-"), marks, true)
    }

    fun readStyles(dom: HtmlElement, marks: List<PmMark>): List<PmMark> {
        var result = marks
        for (name in PmParseRules.matchedStyles) {
            val value = dom.style.getPropertyValue(name)
            if (value.isEmpty()) continue
            var after: PmStyleRule? = null
            while (true) {
                val (rule, attrs) = matchStyle(name, value, after) ?: break
                val clear = rule.clearMark
                result = if (clear != null) result.filterNot(clear) else result + rule.mark!!.create(attrs)
                if (rule.consuming) break
                after = rule
            }
        }
        return result
    }

    fun matchStyle(prop: String, value: String, after: PmStyleRule?): Pair<PmStyleRule, PmAttrs>? {
        val rules = PmParseRules.styles
        val start = if (after == null) 0 else rules.indexOf(after) + 1
        for (i in start until rules.size) {
            val rule = rules[i]
            if (rule.prop != prop || (rule.value != null && rule.value != value)) continue
            val attrs = rule.attrs(value) ?: continue
            return rule to attrs
        }
        return null
    }

    fun addElementByRule(dom: HtmlElement, rule: PmTagRule, attrs: PmAttrs, marks: List<PmMark>, continueAfter: PmTagRule?) {
        var inner = marks
        var sync = false
        val nodeType = rule.node
        if (nodeType != null) {
            if (!nodeType.isLeaf) {
                enter(nodeType, attrs, inner, rule.preserveWhitespace)?.let {
                    sync = true
                    inner = it
                }
            } else if (!insertNode(nodeType.create(attrs), inner, dom.name == "br")) {
                leafFallback(dom, inner)
            }
        } else {
            inner = inner + rule.mark!!.create(attrs)
        }
        val startIn = top
        if (nodeType == null || !nodeType.isLeaf) {
            if (continueAfter != null) addElement(dom, inner, continueAfter) else addAll(dom, inner)
        }
        if (sync && sync(startIn)) open--
    }

    fun addAll(parent: HtmlElement, marks: List<PmMark>) {
        for (child in parent.children.toList()) addDOM(child, marks)
    }

    fun findPlace(node: PmNode, marks: List<PmMark>, cautious: Boolean): List<PmMark>? {
        var route: List<PmNodeType>? = null
        var sync: NodeContext? = null
        var penalty = 0
        for (depth in open downTo 0) {
            val cx = nodes[depth]
            val found = cx.findWrapping(node)
            if (found != null && (route == null || route.size > found.size + penalty)) {
                route = found
                sync = cx
                if (found.isEmpty()) break
            }
            if (cx.solid) {
                if (cautious) break
                penalty += 2
            }
        }
        if (route == null) return null
        sync(sync!!)
        var result = marks
        for (type in route) result = enterInner(type, null, result, false)
        return result
    }

    fun insertNode(node: PmNode, marks: List<PmMark>, cautious: Boolean): Boolean {
        var current = marks
        if (node.isInline && needsBlock && top.type == null) {
            textblockFromContext()?.let { current = enterInner(it, null, current) }
        }
        val innerMarks = findPlace(node, current, cautious) ?: return false
        closeExtra()
        val top = top
        top.match = top.match?.matchType(node.type)
        var nodeMarks = emptyList<PmMark>()
        for (m in innerMarks + node.marks) {
            if (top.type?.allowsMarkType(m.type) ?: markMayApply(m.type, node.type)) nodeMarks = m.addToSet(nodeMarks)
        }
        top.content.add(node.mark(nodeMarks))
        return true
    }

    fun enter(type: PmNodeType, attrs: PmAttrs?, marks: List<PmMark>, preserveWS: PmWs?): List<PmMark>? {
        findPlace(type.create(attrs), marks, false) ?: return null
        return enterInner(type, attrs, marks, true, preserveWS)
    }

    fun enterInner(type: PmNodeType, attrs: PmAttrs?, marks: List<PmMark>, solid: Boolean = false, preserveWS: PmWs? = null): List<PmMark> {
        closeExtra()
        val top = top
        top.match = top.match?.matchType(type)
        var options = wsOptionsFor(type, preserveWS, top.options)
        if (top.options and OPT_OPEN_LEFT != 0 && top.content.isEmpty()) options = options or OPT_OPEN_LEFT
        var applyMarks = emptyList<PmMark>()
        val rest = marks.filter { m ->
            if (top.type?.allowsMarkType(m.type) ?: markMayApply(m.type, type)) {
                applyMarks = m.addToSet(applyMarks)
                false
            } else {
                true
            }
        }
        nodes.add(NodeContext(type, attrs, applyMarks, solid, null, options))
        open++
        return rest
    }

    fun closeExtra(openEnd: Boolean = false) {
        var i = nodes.size - 1
        if (i > open) {
            while (i > open) {
                nodes[i - 1].content.add(nodes[i].finishNode(openEnd))
                i--
            }
            while (nodes.size > open + 1) nodes.removeAt(nodes.lastIndex)
        }
    }

    fun finish(): PmFragment {
        open = 0
        closeExtra(true)
        return nodes[0].finishFragment(true)
    }

    fun sync(to: NodeContext): Boolean {
        for (i in open downTo 0) {
            if (nodes[i] === to) {
                open = i
                return true
            } else if (localPreserveWS) {
                nodes[i].options = nodes[i].options or OPT_PRESERVE_WS
            }
        }
        return false
    }

    fun textblockFromContext(): PmNodeType? {
        val context = context
        if (context != null) {
            for (d in context.depth downTo 0) {
                val default = context.node(d).contentMatchAt(context.indexAfter(d)).defaultType
                if (default != null && default.isTextblock) return default
            }
        }
        return PmSchema.nodes.values.firstOrNull { it.isTextblock }
    }

    /** Lists nested directly in a list belong to the item before them. */
    fun normalizeList(dom: HtmlElement) {
        var child = dom.firstChild
        var prevItem: HtmlElement? = null
        while (child != null) {
            val name = (child as? HtmlElement)?.name
            if (name != null && name in ListTags && prevItem != null) {
                prevItem.appendChild(child)
                child = prevItem
            } else if (name == "li") {
                prevItem = child
            } else if (name != null) {
                prevItem = null
            }
            child = child.nextSibling
        }
    }

    /** Whether a mark of [markType] could apply to a node of [nodeType]
     *  somewhere in the schema. */
    fun markMayApply(markType: PmMarkType, nodeType: PmNodeType): Boolean {
        for (parent in PmSchema.nodes.values) {
            if (!parent.allowsMarkType(markType)) continue
            val seen = mutableListOf<PmContentMatch>()
            fun scan(match: PmContentMatch): Boolean {
                seen.add(match)
                for (edge in match.next) {
                    if (edge.type === nodeType) return true
                    if (edge.next !in seen && scan(edge.next)) return true
                }
                return false
            }
            if (scan(parent.contentMatch)) return true
        }
        return false
    }
}

/**
 * parseFromClipboard() (clipboard.ts): the slice the web pastes for a
 * clipboard's [text] and [html] at [context], the selection's start. The
 * editor's own clipboardTextParser (plainTextToPasteSlice) reads plain
 * text, one paragraph per line; text pasted into a code block goes in as it
 * is. Null when there is nothing to paste.
 */
internal object PmClipboardParser {
    private val InlineParents =
        Regex("^(a|abbr|acronym|b|cite|code|del|em|i|ins|kbd|label|output|q|ruby|s|samp|span|strong|sub|sup|time|u|tt|var)$")

    private val WrapMap = mapOf(
        "thead" to listOf("table"), "tbody" to listOf("table"), "tfoot" to listOf("table"), "caption" to listOf("table"),
        "colgroup" to listOf("table"), "col" to listOf("table", "colgroup"), "tr" to listOf("table", "tbody"),
        "td" to listOf("table", "tbody", "tr"), "th" to listOf("table", "tbody", "tr"),
    )

    /** One paragraph per line, open at both ends (richTextClipboard.js). */
    fun plainTextSlice(text: String): PmSlice {
        val lines = text.replace(Regex("\r\n?"), "\n").split("\n")
        val nodes = lines.map { line ->
            if (line.isNotEmpty()) PmSchema.paragraph.create(null, PmFragment.from(PmSchema.text(line))) else PmSchema.paragraph.create()
        }
        return PmSlice(PmFragment.from(nodes), 1, 1)
    }

    fun parse(text: String, html: String?, plainText: Boolean, context: PmResolvedPos): PmSlice? {
        val inCode = context.parent.type.code
        if (html.isNullOrEmpty() && text.isEmpty()) return null
        val asText = text.isNotEmpty() && (plainText || inCode || html.isNullOrEmpty())
        if (asText) {
            if (inCode) return PmSlice(PmFragment.from(PmSchema.text(text.replace(Regex("\r\n?"), "\n"))), 0, 0)
            val parsed = plainTextSlice(text)
            return PmSlice.maxOpen(normalizeSiblings(parsed.content, context))
        }
        var dom = readHtml(html!!)
        restoreReplacedSpaces(dom)
        val sliceData = dom.descendants().firstOrNull { it.hasAttribute("data-pm-slice") }
            ?.let { Regex("^(\\d+) (\\d+)(?: -(\\d+))? (.*)").find(it.getAttribute("data-pm-slice").orEmpty()) }
        sliceData?.groupValues?.get(3)?.takeIf { it.isNotEmpty() }?.toInt()?.let { wrappers ->
            for (i in wrappers downTo 1) dom = dom.elementChildren.firstOrNull() ?: break
        }
        val parse = ParseContext(
            preserveWhitespace = if (sliceData != null) PmWs.PRESERVE else PmWs.COLLAPSE,
            context = context,
            ruleFromNode = { el -> el.name == "br" && el.nextSibling == null && el.parent?.let { !InlineParents.matches(it.name) } == true },
        )
        parse.addAll(dom, emptyList())
        val slice = PmSlice.maxOpen(parse.finish())
        return if (sliceData != null) {
            addContext(closeSlice(slice, sliceData.groupValues[1].toInt(), sliceData.groupValues[2].toInt()), sliceData.groupValues[4])
        } else {
            PmSlice.maxOpen(normalizeSiblings(slice.content, context))
        }
    }

    private fun readHtml(source: String): HtmlElement {
        var html = source.replace(Regex("^(\\s*<meta [^>]*>)*"), "")
        val firstTag = Regex("<([a-z][^>\\s]+)", RegexOption.IGNORE_CASE).find(html)?.groupValues?.get(1)?.lowercase()
        val wrap = firstTag?.let { WrapMap[it] }
        if (wrap != null) html = wrap.joinToString("") { "<$it>" } + html + wrap.reversed().joinToString("") { "</$it>" }
        var element = HtmlParser.parseFragment(html)
        wrap?.forEach { name -> element = element.descendants().firstOrNull { it.name == name } ?: element }
        return element
    }

    /** Chrome puts some spaces on the clipboard as a lone no-break space
     *  in a plain span; they are turned back into spaces. */
    private fun restoreReplacedSpaces(dom: HtmlElement) {
        for (node in dom.descendants()) {
            if (node.name != "span" || node.hasAttribute("class") || node.hasAttribute("style")) continue
            if (node.children.size == 1 && node.textContent == " ") node.parent?.replaceChild(HtmlText(" "), node)
        }
    }

    private fun normalizeSiblings(fragment: PmFragment, context: PmResolvedPos): PmFragment {
        if (fragment.childCount < 2) return fragment
        for (d in context.depth downTo 0) {
            val parent = context.node(d)
            var match = parent.contentMatchAt(context.index(d))
            var lastWrap: List<PmNodeType>? = null
            val result = mutableListOf<PmNode>()
            var failed = false
            for (node in fragment.content) {
                val wrap = match.findWrapping(node.type)
                if (wrap == null) {
                    failed = true
                    break
                }
                val inLast = if (result.isNotEmpty() && lastWrap!!.isNotEmpty()) addToSibling(wrap, lastWrap, node, result.last(), 0) else null
                if (inLast != null) {
                    result[result.lastIndex] = inLast
                } else {
                    if (result.isNotEmpty()) result[result.lastIndex] = closeRight(result.last(), lastWrap!!.size)
                    val wrapped = withWrappers(node, wrap)
                    result.add(wrapped)
                    match = match.matchType(wrapped.type)!!
                    lastWrap = wrap
                }
            }
            if (!failed) return PmFragment.from(result)
        }
        return fragment
    }

    private fun withWrappers(node: PmNode, wrap: List<PmNodeType>, from: Int = 0): PmNode {
        var result = node
        for (i in wrap.indices.reversed()) {
            if (i < from) break
            result = wrap[i].create(null, PmFragment.from(result))
        }
        return result
    }

    private fun addToSibling(wrap: List<PmNodeType>, lastWrap: List<PmNodeType>, node: PmNode, sibling: PmNode, depth: Int): PmNode? {
        if (depth < wrap.size && depth < lastWrap.size && wrap[depth] === lastWrap[depth]) {
            val inner = addToSibling(wrap, lastWrap, node, sibling.lastChild!!, depth + 1)
            if (inner != null) return sibling.copy(sibling.content.replaceChild(sibling.childCount - 1, inner))
            val match = sibling.contentMatchAt(sibling.childCount)
            if (match.matchType(if (depth == wrap.size - 1) node.type else wrap[depth + 1]) != null) {
                return sibling.copy(sibling.content.append(PmFragment.from(withWrappers(node, wrap, depth + 1))))
            }
        }
        return null
    }

    private fun closeRight(node: PmNode, depth: Int): PmNode {
        if (depth == 0) return node
        val fragment = node.content.replaceChild(node.childCount - 1, closeRight(node.lastChild!!, depth - 1))
        val fill = node.contentMatchAt(node.childCount).fillBefore(PmFragment.Empty, true)!!
        return node.copy(fragment.append(fill))
    }

    private fun closeRange(fragment: PmFragment, side: Int, from: Int, to: Int, depth: Int, openEnd: Int): PmFragment {
        val node = if (side < 0) fragment.firstChild!! else fragment.lastChild!!
        var inner = node.content
        val end = if (fragment.childCount > 1) 0 else openEnd
        if (depth < to - 1) inner = closeRange(inner, side, from, to, depth + 1, end)
        if (depth >= from) {
            inner = if (side < 0) {
                node.contentMatchAt(0).fillBefore(inner, end <= depth)!!.append(inner)
            } else {
                inner.append(node.contentMatchAt(node.childCount).fillBefore(PmFragment.Empty, true)!!)
            }
        }
        return fragment.replaceChild(if (side < 0) 0 else fragment.childCount - 1, node.copy(inner))
    }

    private fun closeSlice(slice: PmSlice, openStart: Int, openEnd: Int): PmSlice {
        var result = slice
        if (openStart < result.openStart) {
            result = PmSlice(closeRange(result.content, -1, openStart, result.openStart, 0, result.openEnd), openStart, result.openEnd)
        }
        if (openEnd < result.openEnd) {
            result = PmSlice(closeRange(result.content, 1, openEnd, result.openEnd, 0, 0), result.openStart, openEnd)
        }
        return result
    }

    /** The nodes data-pm-slice says the copied content sat in, put back
     *  around it. */
    private fun addContext(slice: PmSlice, context: String): PmSlice {
        if (slice.size == 0) return slice
        val array = runCatching { Json.parseToJsonElement(context) as? JsonArray }.getOrNull() ?: return slice
        var content = slice.content
        var openStart = slice.openStart
        var openEnd = slice.openEnd
        var i = array.size - 2
        while (i >= 0) {
            val type = (array[i] as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { PmSchema.nodes[it] } ?: break
            val attrs = array[i + 1].let { if (it is JsonNull) null else PmSchema.attrsFromJson(it as? JsonObject) }
            content = PmFragment.from(type.create(attrs, content))
            openStart++
            openEnd++
            i -= 2
        }
        return PmSlice(content, openStart, openEnd)
    }
}
