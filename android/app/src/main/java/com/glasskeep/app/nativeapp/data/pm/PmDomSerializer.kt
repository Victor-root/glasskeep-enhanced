package com.glasskeep.app.nativeapp.data.pm

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/*
 * prosemirror-model's DOMSerializer (to_dom.ts) with the renderHTML of each
 * of the web editor's nodes and marks (Tiptap's, the app's UnderlineVariant
 * and Indent), and prosemirror-view's serializeForClipboard(): the markup
 * the web puts on the clipboard for a selection, data-pm-slice included,
 * so a paste into the web editor (or back into this one) rebuilds exactly
 * what was copied.
 */
internal object PmDomSerializer {
    private const val IndentStepEm = 1.75

    /** The text/html of a copy of [slice] (the selection's content, taken
     *  with its parents). */
    fun serializeForClipboard(slice: PmSlice): String {
        val context = mutableListOf<Pair<PmNodeType, PmAttrs?>>()
        var content = slice.content
        var openStart = slice.openStart
        var openEnd = slice.openEnd
        while (openStart > 1 && openEnd > 1 && content.childCount == 1 && content.firstChild!!.childCount == 1) {
            openStart--
            openEnd--
            val node = content.firstChild!!
            context.add(node.type to node.attrs.takeIf { it != node.type.defaultAttrs })
            content = node.content
        }
        val wrap = HtmlElement("div")
        serializeFragment(content, wrap)
        (wrap.firstChild as? HtmlElement)?.let { first ->
            first.setAttribute("data-pm-slice", "$openStart $openEnd ${contextJson(context)}")
            // A style set through CSSOM is written after the other attributes.
            first.getAttribute("style")?.let { style ->
                first.removeAttribute("style")
                first.setAttribute("style", style)
            }
        }
        return wrap.innerHtml()
    }

    private fun contextJson(context: List<Pair<PmNodeType, PmAttrs?>>): String =
        JsonArray(
            context.flatMap { (type, attrs) ->
                listOf(JsonPrimitive(type.name), attrs?.let(::attrsToJson) ?: JsonNull)
            },
        ).toString()

    fun serializeFragment(fragment: PmFragment, target: HtmlElement) {
        var top = target
        val active = mutableListOf<Pair<PmMark, HtmlElement>>()
        for (node in fragment.content) {
            if (active.isNotEmpty() || node.marks.isNotEmpty()) {
                var keep = 0
                var rendered = 0
                while (keep < active.size && rendered < node.marks.size) {
                    if (!node.marks[rendered].eq(active[keep].first)) break
                    keep++
                    rendered++
                }
                while (keep < active.size) top = active.removeAt(active.lastIndex).second
                while (rendered < node.marks.size) {
                    val add = node.marks[rendered++]
                    val markDom = markDom(add)
                    active.add(add to top)
                    top.appendChild(markDom)
                    top = markDom
                }
            }
            top.appendChild(serializeNodeInner(node))
        }
    }

    private fun serializeNodeInner(node: PmNode): HtmlNode {
        if (node.isText) return HtmlText(node.text!!)
        val (dom, contentDom) = nodeDom(node)
        if (contentDom != null) serializeFragment(node.content, contentDom)
        return dom
    }

    /** The element for [node], and where its content goes. */
    private fun nodeDom(node: PmNode): Pair<HtmlElement, HtmlElement?> {
        val attrs = node.attrs
        return when (node.type) {
            PmSchema.paragraph -> element("p", textblockAttrs(attrs)).let { it to it }
            PmSchema.heading -> element("h${attrs["level"]}", textblockAttrs(attrs)).let { it to it }
            PmSchema.blockquote -> element("blockquote", indentAttrs(attrs)).let { it to it }
            PmSchema.bulletList -> element("ul").let { it to it }
            PmSchema.orderedList -> element(
                "ol",
                listOf("start" to attrs["start"]?.takeIf { it != 1 }?.toString(), "type" to attrs["type"]?.toString()),
            ).let { it to it }
            PmSchema.listItem -> element("li", indentAttrs(attrs)).let { it to it }
            PmSchema.taskList -> element("ul", listOf("data-type" to "taskList")).let { it to it }
            PmSchema.taskItem -> {
                val checked = attrs["checked"] == true
                val li = element("li", listOf("data-checked" to checked.toString(), "data-type" to "taskItem"))
                val label = element("label")
                label.appendChild(element("input", listOf("type" to "checkbox", "checked" to if (checked) "checked" else null)))
                label.appendChild(element("span"))
                li.appendChild(label)
                val div = element("div")
                li.appendChild(div)
                li to div
            }
            PmSchema.codeBlock -> {
                val pre = element("pre", indentAttrs(attrs))
                val code = element("code", listOf("class" to (attrs["language"] as? String)?.let { "language-$it" }))
                pre.appendChild(code)
                pre to code
            }
            PmSchema.horizontalRule -> element("hr") to null
            PmSchema.hardBreak -> element("br") to null
            else -> error("No rendering for ${node.type.name}")
        }
    }

    private fun markDom(mark: PmMark): HtmlElement {
        val attrs = mark.attrs
        return when (mark.type) {
            PmSchema.link -> {
                val href = attrs["href"] as? String
                element(
                    "a",
                    listOf(
                        "target" to attrs["target"]?.toString(),
                        "rel" to attrs["rel"]?.toString(),
                        "class" to attrs["class"]?.toString(),
                        "href" to if (PmParseRules.isAllowedUri(href)) href else "",
                        "title" to attrs["title"]?.toString(),
                    ),
                )
            }
            PmSchema.textStyle -> element(
                "span",
                listOf(
                    "style" to listOfNotNull(
                        (attrs["color"] as? String)?.takeIf { it.isNotEmpty() }?.let { "color: $it" },
                        (attrs["fontFamily"] as? String)?.takeIf { it.isNotEmpty() }?.let { "font-family: $it" },
                        (attrs["fontSize"] as? String)?.takeIf { it.isNotEmpty() }?.let { "font-size: $it" },
                    ).joinToString("; ").ifEmpty { null },
                ),
            )
            PmSchema.bold -> element("strong")
            PmSchema.code -> element("code", listOf("spellcheck" to "false"))
            PmSchema.italic -> element("em")
            PmSchema.strike -> element("s")
            PmSchema.underline -> {
                val style = (attrs["style"] as? String)?.takeIf { it in setOf("simple", "double", "dotted", "dashed", "wavy") }
                val color = (attrs["color"] as? String)?.takeIf { it.isNotEmpty() }
                val css = listOfNotNull(
                    style?.takeIf { it != "simple" }?.let { "text-decoration-line: underline; text-decoration-style: $it" },
                    color?.let { "text-decoration-color: $it" },
                )
                element(
                    "u",
                    listOf("data-underline-style" to style, "data-underline-color" to color, "style" to css.joinToString("; ").ifEmpty { null }),
                )
            }
            PmSchema.highlight -> {
                val color = (attrs["color"] as? String)?.takeIf { it.isNotEmpty() }
                element("mark", listOf("data-color" to color, "style" to color?.let { "background-color: $it; color: inherit" }))
            }
            PmSchema.subscript -> element("sub")
            PmSchema.superscript -> element("sup")
            else -> error("No rendering for ${mark.type.name}")
        }
    }

    /** TextAlign's and Indent's attributes of a paragraph or heading. */
    private fun textblockAttrs(attrs: PmAttrs): List<Pair<String, String?>> {
        val indent = (attrs["indent"] as? Int)?.takeIf { it > 0 }
        val style = listOfNotNull(
            (attrs["textAlign"] as? String)?.let { "text-align: $it" },
            indent?.let { "margin-inline-start: ${formatEm(it)}" },
        )
        return listOf("data-indent" to indent?.toString(), "style" to style.joinToString("; ").ifEmpty { null })
    }

    private fun indentAttrs(attrs: PmAttrs): List<Pair<String, String?>> {
        val indent = (attrs["indent"] as? Int)?.takeIf { it > 0 }
        return listOf("data-indent" to indent?.toString(), "style" to indent?.let { "margin-inline-start: ${formatEm(it)}" })
    }

    private fun formatEm(indent: Int) = (indent * IndentStepEm).toBigDecimal().stripTrailingZeros().toPlainString() + "em"

    /** An element with the attributes that have a value, its style
     *  normalized as setting `style.cssText` does. */
    private fun element(name: String, attrs: List<Pair<String, String?>> = emptyList()): HtmlElement {
        val element = HtmlElement(name)
        for ((key, value) in attrs) {
            if (value == null) continue
            if (key == "style") cssText(value).takeIf { it.isNotEmpty() }?.let { element.setAttribute("style", it) } else element.setAttribute(key, value)
        }
        return element
    }

    private fun cssText(style: String): String =
        style.split(";").mapNotNull { declaration ->
            val colon = declaration.indexOf(':')
            if (colon < 0) return@mapNotNull null
            val name = declaration.substring(0, colon).trim().lowercase()
            PmCssStyle.normalize(name, declaration.substring(colon + 1))?.let { "$name: $it;" }
        }.joinToString(" ")
}
