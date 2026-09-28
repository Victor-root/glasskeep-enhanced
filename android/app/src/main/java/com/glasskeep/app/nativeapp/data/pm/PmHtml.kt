package com.glasskeep.app.nativeapp.data.pm

/*
 * A small HTML document model and parser, standing in for the browser's
 * own when prosemirror-view reads a clipboard's text/html (readHTML(),
 * clipboard.ts). It follows the HTML standard's tokenizer and the parts of
 * its "in body" tree construction clipboard markup meets: implied end tags,
 * void and raw-text elements, the newline dropped after <pre>, table
 * sections. It does not re-open misnested formatting elements (the
 * adoption agency), which only changes markup that is malformed to begin
 * with.
 */

internal sealed class HtmlNode {
    var parent: HtmlElement? = null
        internal set

    val nextSibling: HtmlNode?
        get() = parent?.children?.let { siblings -> siblings.getOrNull(siblings.indexOfFirst { it === this } + 1) }

    val previousSibling: HtmlNode?
        get() = parent?.children?.let { siblings -> siblings.getOrNull(siblings.indexOfFirst { it === this } - 1) }

    abstract val textContent: String
}

internal class HtmlText(var value: String) : HtmlNode() {
    override val textContent get() = value
}

internal class HtmlComment(val value: String) : HtmlNode() {
    override val textContent get() = ""
}

/** An element; [name] is always lower case. */
internal class HtmlElement(val name: String, private val attrs: MutableMap<String, String> = LinkedHashMap()) : HtmlNode() {
    val children = mutableListOf<HtmlNode>()
    private var parsedStyle: PmCssStyle? = null

    fun getAttribute(name: String): String? = attrs[name]

    fun hasAttribute(name: String) = attrs.containsKey(name)

    fun setAttribute(name: String, value: String) {
        attrs[name] = value
        if (name == "style") parsedStyle = null
    }

    fun removeAttribute(name: String) {
        attrs.remove(name)
        if (name == "style") parsedStyle = null
    }

    /** The element's inline style, as its CSSStyleDeclaration reads it. */
    val style: PmCssStyle get() = parsedStyle ?: PmCssStyle.parse(attrs["style"].orEmpty()).also { parsedStyle = it }

    val firstChild get() = children.firstOrNull()

    val elementChildren get() = children.filterIsInstance<HtmlElement>()

    fun appendChild(node: HtmlNode) {
        node.parent?.removeChild(node)
        node.parent = this
        children.add(node)
    }

    fun removeChild(node: HtmlNode) {
        children.removeAt(children.indexOfFirst { it === node })
        node.parent = null
    }

    fun replaceChild(replacement: HtmlNode, old: HtmlNode) {
        replacement.parent?.removeChild(replacement)
        val index = children.indexOfFirst { it === old }
        children[index] = replacement
        replacement.parent = this
        old.parent = null
    }

    fun closest(tag: String): HtmlElement? {
        var cur: HtmlElement? = this
        while (cur != null && cur.name != tag) cur = cur.parent
        return cur
    }

    /** Every descendant element, in document order. */
    fun descendants(): List<HtmlElement> = buildList {
        fun walk(element: HtmlElement) {
            for (child in element.children) if (child is HtmlElement) {
                add(child)
                walk(child)
            }
        }
        walk(this@HtmlElement)
    }

    override val textContent: String
        get() = buildString {
            fun walk(node: HtmlNode) {
                when (node) {
                    is HtmlText -> append(node.value)
                    is HtmlElement -> node.children.forEach(::walk)
                    is HtmlComment -> Unit
                }
            }
            children.forEach(::walk)
        }

    /** The element's inner markup, serialized as the browser's innerHTML is. */
    fun innerHtml(): String = buildString { children.forEach { appendHtml(it) } }

    private fun StringBuilder.appendHtml(node: HtmlNode) {
        when (node) {
            is HtmlText -> append(
                if (node.parent?.name in RawTextElements) node.value else escapeHtml(node.value, attribute = false),
            )
            is HtmlComment -> append("<!--").append(node.value).append("-->")
            is HtmlElement -> {
                append('<').append(node.name)
                for ((key, value) in node.attrs) append(' ').append(key).append("=\"").append(escapeHtml(value, attribute = true)).append('"')
                append('>')
                if (node.name in VoidElements) return
                node.children.forEach { appendHtml(it) }
                append("</").append(node.name).append('>')
            }
        }
    }
}

/** The escaping of the HTML fragment serialization algorithm. */
internal fun escapeHtml(value: String, attribute: Boolean): String = buildString {
    for (c in value) when {
        c == '&' -> append("&amp;")
        c == ' ' -> append("&nbsp;")
        attribute && c == '"' -> append("&quot;")
        !attribute && c == '<' -> append("&lt;")
        !attribute && c == '>' -> append("&gt;")
        else -> append(c)
    }
}

private val VoidElements = setOf(
    "area", "base", "basefont", "bgsound", "br", "col", "embed", "frame", "hr", "img", "input", "keygen", "link",
    "meta", "param", "source", "track", "wbr",
)

private val RawTextElements = setOf("style", "script", "xmp", "iframe", "noembed", "noframes", "plaintext")

private val EscapableRawTextElements = setOf("title", "textarea")

private val ClosesParagraph = setOf(
    "address", "article", "aside", "blockquote", "center", "details", "dialog", "dir", "div", "dl", "fieldset",
    "figcaption", "figure", "footer", "header", "hgroup", "main", "menu", "nav", "ol", "p", "search", "section",
    "summary", "ul", "form", "table", "hr", "xmp", "plaintext",
)

private val Headings = setOf("h1", "h2", "h3", "h4", "h5", "h6")

private val ImpliedEndTags = setOf("dd", "dt", "li", "optgroup", "option", "p", "rb", "rp", "rt", "rtc")

private val SpecialElements = setOf(
    "address", "applet", "area", "article", "aside", "base", "basefont", "bgsound", "blockquote", "body", "br",
    "button", "caption", "center", "col", "colgroup", "dd", "details", "dir", "div", "dl", "dt", "embed",
    "fieldset", "figcaption", "figure", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6",
    "head", "header", "hgroup", "hr", "html", "iframe", "img", "input", "keygen", "li", "link", "listing", "main",
    "marquee", "menu", "meta", "nav", "noembed", "noframes", "noscript", "object", "ol", "p", "param", "plaintext",
    "pre", "script", "search", "section", "select", "source", "style", "summary", "table", "tbody", "td",
    "template", "textarea", "tfoot", "th", "thead", "title", "tr", "track", "ul", "wbr", "xmp",
)

private val ScopeBoundaries = setOf("applet", "caption", "html", "table", "td", "th", "marquee", "object", "template")

private val TableSections = setOf("tbody", "thead", "tfoot")

internal object HtmlParser {
    /** The children of a `<div>` whose innerHTML is [html]. */
    fun parseFragment(html: String): HtmlElement {
        val root = HtmlElement("div")
        TreeBuilder(root).run(preprocess(html))
        return root
    }

    /** CR LF and lone CR become LF; NUL is dropped. */
    private fun preprocess(html: String) = html.replace("\r\n", "\n").replace('\r', '\n').replace("\u0000", "")

    private class TreeBuilder(val root: HtmlElement) {
        val stack = mutableListOf(root)
        var skipNewline = false

        val current get() = stack.last()

        fun run(input: String) {
            var i = 0
            val n = input.length
            val text = StringBuilder()
            fun flush() {
                if (text.isNotEmpty()) insertText(text.toString())
                text.setLength(0)
            }
            while (i < n) {
                val c = input[i]
                if (c == '&') {
                    val (decoded, next) = HtmlEntities.decode(input, i, inAttribute = false)
                    text.append(decoded)
                    i = next
                    continue
                }
                if (c != '<' || i + 1 >= n) {
                    text.append(c)
                    i++
                    continue
                }
                val c1 = input[i + 1]
                when {
                    input.startsWith("<!--", i) -> {
                        flush()
                        i = comment(input, i + 4)
                    }
                    c1 == '!' || c1 == '?' -> {
                        flush()
                        val end = input.indexOf('>', i + 2)
                        i = if (end < 0) n else end + 1
                    }
                    c1 == '/' -> {
                        val nameStart = i + 2
                        if (nameStart < n && input[nameStart].isAsciiLetter()) {
                            flush()
                            var j = nameStart
                            while (j < n && !input[j].isHtmlSpace() && input[j] != '/' && input[j] != '>') j++
                            val name = input.substring(nameStart, j).lowercase()
                            val end = input.indexOf('>', j)
                            i = if (end < 0) n else end + 1
                            endTag(name)
                        } else if (nameStart < n && input[nameStart] == '>') {
                            i = nameStart + 1
                        } else {
                            flush()
                            val end = input.indexOf('>', nameStart)
                            i = if (end < 0) n else end + 1
                        }
                    }
                    c1.isAsciiLetter() -> {
                        flush()
                        val tag = readTag(input, i + 1)
                        i = tag.next
                        startTag(tag.name, tag.attrs)
                        val raw = tag.name in RawTextElements || tag.name in EscapableRawTextElements
                        if (tag.name == "plaintext") {
                            insertText(input.substring(i))
                            i = n
                        } else if (raw && tag.name !in VoidElements) {
                            val close = findRawEnd(input, i, tag.name)
                            var content = input.substring(i, close)
                            if (tag.name in EscapableRawTextElements) content = HtmlEntities.decodeAll(content)
                            if (content.isNotEmpty()) insertText(content)
                            i = close
                        }
                    }
                    else -> {
                        text.append(c)
                        i++
                    }
                }
            }
            flush()
        }

        fun comment(input: String, start: Int): Int {
            if (input.startsWith(">", start)) {
                current.appendChild(HtmlComment(""))
                return start + 1
            }
            if (input.startsWith("->", start)) {
                current.appendChild(HtmlComment(""))
                return start + 2
            }
            val end = input.indexOf("-->", start)
            val value = if (end < 0) input.substring(start) else input.substring(start, end)
            current.appendChild(HtmlComment(value))
            return if (end < 0) input.length else end + 3
        }

        class Tag(val name: String, val attrs: LinkedHashMap<String, String>, val next: Int)

        fun readTag(input: String, start: Int): Tag {
            val n = input.length
            var j = start
            while (j < n && !input[j].isHtmlSpace() && input[j] != '/' && input[j] != '>') j++
            val name = input.substring(start, j).lowercase()
            val attrs = LinkedHashMap<String, String>()
            while (j < n) {
                val c = input[j]
                when {
                    c.isHtmlSpace() -> j++
                    c == '>' -> return Tag(name, attrs, j + 1)
                    c == '/' -> j++
                    else -> {
                        val nameStart = j
                        j++
                        while (j < n && !input[j].isHtmlSpace() && input[j] != '/' && input[j] != '>' && input[j] != '=') j++
                        val attrName = input.substring(nameStart, j).lowercase()
                        while (j < n && input[j].isHtmlSpace()) j++
                        var value = ""
                        if (j < n && input[j] == '=') {
                            j++
                            while (j < n && input[j].isHtmlSpace()) j++
                            if (j < n && (input[j] == '"' || input[j] == '\'')) {
                                val quote = input[j]
                                val end = input.indexOf(quote, j + 1).let { if (it < 0) n else it }
                                value = HtmlEntities.decodeAll(input.substring(j + 1, end), inAttribute = true)
                                j = minOf(n, end + 1)
                            } else {
                                val valueStart = j
                                while (j < n && !input[j].isHtmlSpace() && input[j] != '>') j++
                                value = HtmlEntities.decodeAll(input.substring(valueStart, j), inAttribute = true)
                            }
                        }
                        if (!attrs.containsKey(attrName)) attrs[attrName] = value
                    }
                }
            }
            return Tag(name, attrs, n)
        }

        fun findRawEnd(input: String, start: Int, name: String): Int {
            var from = start
            while (true) {
                val at = input.indexOf("</", from)
                if (at < 0) return input.length
                val end = at + 2 + name.length
                if (input.regionMatches(at + 2, name, 0, name.length, ignoreCase = true) &&
                    (end >= input.length || input[end].isHtmlSpace() || input[end] == '/' || input[end] == '>')
                ) {
                    return at
                }
                from = at + 2
            }
        }

        fun insertText(value: String) {
            var text = value
            if (skipNewline) {
                skipNewline = false
                if (text.startsWith("\n")) text = text.substring(1)
            }
            if (text.isEmpty()) return
            val last = current.children.lastOrNull()
            if (last is HtmlText) last.value += text else current.appendChild(HtmlText(text))
        }

        fun insert(name: String, attrs: LinkedHashMap<String, String>, void: Boolean = false): HtmlElement {
            skipNewline = false
            val element = HtmlElement(name, attrs)
            current.appendChild(element)
            if (!void) stack.add(element)
            return element
        }

        fun inScope(names: Set<String>, extra: Set<String> = emptySet()): Boolean {
            for (i in stack.indices.reversed()) {
                val node = stack[i]
                if (i == 0) return false
                if (node.name in names) return true
                if (node.name in ScopeBoundaries || node.name in extra) return false
            }
            return false
        }

        fun inScope(name: String, extra: Set<String> = emptySet()) = inScope(setOf(name), extra)

        fun popUntil(names: Set<String>) {
            while (stack.size > 1) {
                val popped = stack.removeAt(stack.lastIndex)
                if (popped.name in names) return
            }
        }

        fun generateImpliedEndTags(except: String? = null) {
            while (stack.size > 1 && current.name in ImpliedEndTags && current.name != except) stack.removeAt(stack.lastIndex)
        }

        fun closeParagraph() {
            if (inScope("p", setOf("button"))) {
                generateImpliedEndTags("p")
                popUntil(setOf("p"))
            }
        }

        fun startTag(rawName: String, attrs: LinkedHashMap<String, String>) {
            val name = if (rawName == "image") "img" else rawName
            when {
                name == "html" || name == "body" || name == "head" || name == "frameset" -> Unit
                name in Headings -> {
                    closeParagraph()
                    if (current.name in Headings) stack.removeAt(stack.lastIndex)
                    insert(name, attrs)
                }
                name == "pre" || name == "listing" -> {
                    closeParagraph()
                    insert(name, attrs)
                    skipNewline = true
                }
                name == "textarea" -> {
                    insert(name, attrs)
                    skipNewline = true
                }
                name == "li" -> {
                    closeItem(setOf("li"))
                    closeParagraph()
                    insert(name, attrs)
                }
                name == "dd" || name == "dt" -> {
                    closeItem(setOf("dd", "dt"))
                    closeParagraph()
                    insert(name, attrs)
                }
                name == "a" -> {
                    if (stack.any { it.name == "a" }) popUntil(setOf("a"))
                    insert(name, attrs)
                }
                name == "button" -> {
                    if (inScope("button")) {
                        generateImpliedEndTags()
                        popUntil(setOf("button"))
                    }
                    insert(name, attrs)
                }
                name == "option" || name == "optgroup" -> {
                    if (current.name == "option") stack.removeAt(stack.lastIndex)
                    insert(name, attrs)
                }
                name in TableSections || name == "tr" || name == "td" || name == "th" || name == "caption" || name == "colgroup" -> {
                    if (!inTable()) return
                    when (name) {
                        "td", "th" -> closeTableParts(setOf("td", "th"), setOf("tr"))
                        "tr" -> closeTableParts(setOf("td", "th", "tr"), TableSections)
                        else -> closeTableParts(setOf("td", "th", "tr", "caption", "colgroup") + TableSections, emptySet())
                    }
                    insert(name, attrs)
                }
                name == "col" -> if (inTable()) insert(name, attrs, void = true)
                name in VoidElements -> {
                    if (name == "hr") closeParagraph()
                    insert(name, attrs, void = true)
                }
                name in ClosesParagraph -> {
                    closeParagraph()
                    insert(name, attrs)
                }
                else -> insert(name, attrs)
            }
        }

        /** An `<li>` (or `<dd>`, `<dt>`) closes the item it follows. */
        fun closeItem(names: Set<String>) {
            for (i in stack.indices.reversed()) {
                if (i == 0) return
                val node = stack[i]
                if (node.name in names) {
                    generateImpliedEndTags(node.name)
                    popUntil(setOf(node.name))
                    return
                }
                if (node.name in SpecialElements && node.name !in setOf("address", "div", "p")) return
            }
        }

        fun inTable() = stack.drop(1).any { it.name == "table" }

        fun closeTableParts(names: Set<String>, stopAt: Set<String>) {
            for (i in stack.indices.reversed()) {
                val node = stack[i]
                if (i == 0 || node.name == "table" || node.name in stopAt) return
                if (node.name in names) {
                    while (stack.size > i) stack.removeAt(stack.lastIndex)
                    return
                }
            }
        }

        fun endTag(name: String) {
            when {
                name == "html" || name == "body" || name == "head" -> Unit
                name == "p" -> {
                    if (!inScope("p", setOf("button"))) {
                        insert("p", LinkedHashMap())
                        stack.removeAt(stack.lastIndex)
                    } else {
                        generateImpliedEndTags("p")
                        popUntil(setOf("p"))
                    }
                }
                name == "br" -> insert("br", LinkedHashMap(), void = true)
                name == "li" -> if (inScope("li", setOf("ol", "ul"))) {
                    generateImpliedEndTags("li")
                    popUntil(setOf("li"))
                }
                name == "dd" || name == "dt" -> if (inScope(name)) {
                    generateImpliedEndTags(name)
                    popUntil(setOf(name))
                }
                name in Headings -> if (inScope(Headings)) {
                    generateImpliedEndTags()
                    popUntil(Headings)
                }
                else -> {
                    for (i in stack.indices.reversed()) {
                        if (i == 0) return
                        val node = stack[i]
                        if (node.name == name) {
                            generateImpliedEndTags(name)
                            while (stack.size > i) stack.removeAt(stack.lastIndex)
                            return
                        }
                        if (node.name in SpecialElements) return
                    }
                }
            }
        }
    }
}

private fun Char.isAsciiLetter() = this in 'a'..'z' || this in 'A'..'Z'

private fun Char.isHtmlSpace() = this == ' ' || this == '\t' || this == '\n' || this == '\u000c' || this == '\r'
