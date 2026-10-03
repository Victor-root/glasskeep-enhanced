package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.pm.HtmlEntities

/**
 * The inline half of [MarkdownDoc]: what `marked` (GFM, `breaks: true`)
 * and DOMPurify make of a run of text, as plain text plus marks.
 *
 * Emphasis follows CommonMark's delimiter rules, so `snake_case_name`
 * stays as it is, `***both***` is bold and italic, and a closing marker
 * needs a word before it. Backslash escapes, character references,
 * inline code, links (with their titles), the bare web and e-mail
 * addresses GFM links and `<https://...>` are read; an image is dropped
 * and a link whose address DOMPurify would strip keeps only its text, as
 * on the web.
 */
internal object MarkdownInline {
    fun parse(raw: String): Pair<String, List<RichMark>> {
        val fragment = Scanner(raw, inLink = false).scan()
        return fragment.text to fragment.marks
    }

    /** This text under one more [type] mark, set as the editor sets it: no
     *  second one of the same type over it, none over inline code, which
     *  takes no other mark. */
    private fun Fragment.marked(type: RichMarkType, value: String? = null): Fragment =
        if (text.isEmpty()) this else Fragment(text, RichDoc.setMark(marks, type, 0, text.length, value))

    private sealed interface Piece

    /** Text already read, with the marks over it. */
    private class Fragment(val text: String, val marks: List<RichMark> = emptyList()) : Piece

    /** A run of `*`, `_` or `~` that may open or close an emphasis. */
    private class Delimiter(
        val char: Char,
        var count: Int,
        val canOpen: Boolean,
        var canClose: Boolean,
    ) : Piece {
        val originalCount = count
    }

    private const val AsciiPunctuation = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
    private val BareUrl = Regex("(?:(?:ftp|https?)://|www\\.)(?:[a-zA-Z0-9\\-]+\\.?)+[^\\s<]*")
    private val BareEmail = Regex("[A-Za-z0-9._+-]+@[a-zA-Z0-9\\-_]+(?:\\.[a-zA-Z0-9\\-_]*[a-zA-Z0-9])+(?![-_])")
    private val AngleUrl = Regex("<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\\s<>]*)>")
    private val AngleEmail = Regex("<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>")
    private const val TrailingPunctuation = "?!.,:;*_'\"~"

    private fun Char.isPunctuation(): Boolean = this in AsciiPunctuation || when (Character.getType(this).toByte()) {
        Character.CONNECTOR_PUNCTUATION, Character.DASH_PUNCTUATION, Character.START_PUNCTUATION,
        Character.END_PUNCTUATION, Character.INITIAL_QUOTE_PUNCTUATION, Character.FINAL_QUOTE_PUNCTUATION,
        Character.OTHER_PUNCTUATION, Character.MATH_SYMBOL, Character.CURRENCY_SYMBOL,
        Character.MODIFIER_SYMBOL, Character.OTHER_SYMBOL,
        -> true
        else -> false
    }

    private class Scanner(private val raw: String, private val inLink: Boolean) {
        private val pieces = mutableListOf<Piece>()
        private val text = StringBuilder()
        private val hasAt = '@' in raw

        fun scan(): Fragment {
            var index = 0
            while (index < raw.length) {
                index = readAt(index)
            }
            flush()
            resolveEmphasis()
            return flatten(pieces)
        }

        private fun flush() {
            if (text.isEmpty()) return
            pieces.add(Fragment(text.toString()))
            text.setLength(0)
        }

        /** Reads what starts at [index] and returns where the next thing
         *  starts: a character that starts nothing is plain text. */
        private fun readAt(index: Int): Int {
            val c = raw[index]
            val next = when (c) {
                '\\' -> escape(index)
                '`' -> codeSpan(index)
                '[' -> link(index)
                '!' -> image(index)
                '<' -> if (inLink) null else angleLink(index)
                '&' -> reference(index)
                '*', '_', '~' -> delimiterRun(index)
                else -> null
            } ?: if (inLink) null else bareLink(index)
            if (next != null) return next
            text.append(c)
            return index + 1
        }

        private fun escape(index: Int): Int? {
            val escaped = raw.getOrNull(index + 1) ?: return null
            if (escaped != '\n' && escaped !in AsciiPunctuation) return null
            text.append(escaped)
            return index + 2
        }

        private fun reference(index: Int): Int? {
            val (decoded, next) = HtmlEntities.decode(raw, index, inAttribute = false)
            if (next == index + 1) return null
            text.append(decoded)
            return next
        }

        /** A code span is verbatim: no escape, mark or reference inside. */
        private fun codeSpan(index: Int): Int? {
            val length = runLength(index, '`')
            var at = index + length
            while (at < raw.length) {
                if (raw[at] != '`') {
                    at++
                    continue
                }
                val closing = runLength(at, '`')
                if (closing == length) {
                    var code = raw.substring(index + length, at).replace('\n', ' ')
                    if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.isNotBlank()) {
                        code = code.substring(1, code.length - 1)
                    }
                    addFragment(code, RichMarkType.CODE)
                    return at + closing
                }
                at += closing
            }
            text.append("`".repeat(length))
            return index + length
        }

        private fun runLength(index: Int, char: Char): Int {
            var end = index
            while (end < raw.length && raw[end] == char) end++
            return end - index
        }

        private fun addFragment(content: String, type: RichMarkType, value: String? = null) {
            if (content.isEmpty()) return
            flush()
            pieces.add(Fragment(content, listOf(RichMark(0, content.length, type, value))))
        }

        private fun image(index: Int): Int? {
            if (raw.getOrNull(index + 1) != '[') return null
            val link = LinkSyntax.parse(raw, index + 1) ?: return null
            return link.end
        }

        private fun link(index: Int): Int? {
            val link = LinkSyntax.parse(raw, index) ?: return null
            if (inLink) return null
            val label = Scanner(link.label, inLink = true).scan()
            val href = HtmlEntities.decodeAll(link.destination, inAttribute = true)
            flush()
            val linked = if (href.isBlank() || !RichLinks.isAllowedUri(href)) label else label.marked(RichMarkType.LINK, href)
            if (linked.text.isNotEmpty()) pieces.add(linked)
            return link.end
        }

        private fun angleLink(index: Int): Int? {
            val url = AngleUrl.matchAt(raw, index)
            val email = if (url == null) AngleEmail.matchAt(raw, index) else null
            val match = url ?: email ?: return null
            val address = match.groupValues[1]
            val href = if (email != null) "mailto:$address" else address
            if (!RichLinks.isAllowedUri(href)) return null
            addFragment(address, RichMarkType.LINK, href)
            return index + match.value.length
        }

        /** GFM's extended autolinks: `https://...`, `www....` and
         *  e-mail addresses, without the punctuation that ends a sentence. */
        private fun bareLink(index: Int): Int? {
            val c = raw[index]
            if (c == 'h' || c == 'f' || c == 'w') {
                val match = BareUrl.matchAt(raw, index) ?: return null
                val address = trimAddress(match.value)
                val href = if (address.startsWith("www.")) "http://$address" else address
                if (!RichLinks.isAllowedUri(href)) return null
                addFragment(address, RichMarkType.LINK, href)
                return index + address.length
            }
            if (!hasAt || c !in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._+-") return null
            if (index > 0 && raw[index - 1] in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._+-") return null
            val match = BareEmail.matchAt(raw, index) ?: return null
            addFragment(match.value, RichMarkType.LINK, "mailto:${match.value}")
            return index + match.value.length
        }

        /** marked's backpedal: sentence punctuation, and a closing
         *  parenthesis nothing opened, do not belong to the address. */
        private fun trimAddress(address: String): String {
            var end = address.length
            while (end > 0) {
                val last = address[end - 1]
                val unbalanced = last == ')' && address.substring(0, end).let { it.count { c -> c == ')' } > it.count { c -> c == '(' } }
                if (last in TrailingPunctuation || unbalanced) end-- else break
            }
            return address.substring(0, end)
        }

        private fun delimiterRun(index: Int): Int? {
            val char = raw[index]
            val count = runLength(index, char)
            if (char == '~' && count > 2) {
                text.append("~".repeat(count))
                return index + count
            }
            val before = if (index == 0) ' ' else raw[index - 1]
            val after = raw.getOrNull(index + count) ?: ' '
            val leftFlanking = !after.isWhitespace() &&
                (!after.isPunctuation() || before.isWhitespace() || before.isPunctuation())
            val rightFlanking = !before.isWhitespace() &&
                (!before.isPunctuation() || after.isWhitespace() || after.isPunctuation())
            val canOpen: Boolean
            val canClose: Boolean
            if (char == '_') {
                canOpen = leftFlanking && (!rightFlanking || before.isPunctuation())
                canClose = rightFlanking && (!leftFlanking || after.isPunctuation())
            } else {
                canOpen = leftFlanking
                canClose = rightFlanking
            }
            flush()
            pieces.add(Delimiter(char, count, canOpen, canClose))
            return index + count
        }

        /** CommonMark's process_emphasis: each closing run pairs with the
         *  nearest opening run of its character before it. */
        private fun resolveEmphasis() {
            var closerIndex = 0
            while (closerIndex < pieces.size) {
                val closer = pieces[closerIndex] as? Delimiter
                if (closer == null || !closer.canClose) {
                    closerIndex++
                    continue
                }
                val openerIndex = (closerIndex - 1 downTo 0).firstOrNull { index ->
                    val candidate = pieces[index] as? Delimiter
                    candidate != null && candidate.char == closer.char && candidate.canOpen && pairs(candidate, closer)
                }
                if (openerIndex == null) {
                    if (!closer.canOpen) closer.canClose = false
                    closerIndex++
                    continue
                }
                val opener = pieces[openerIndex] as Delimiter
                val used = if (closer.char == '~') closer.count else if (opener.count >= 2 && closer.count >= 2) 2 else 1
                val type = when {
                    closer.char == '~' -> RichMarkType.STRIKE
                    used == 2 -> RichMarkType.BOLD
                    else -> RichMarkType.ITALIC
                }
                val inner = flatten(pieces.subList(openerIndex + 1, closerIndex))
                val wrapped = inner.marked(type)
                repeat(closerIndex - openerIndex - 1) { pieces.removeAt(openerIndex + 1) }
                pieces.add(openerIndex + 1, wrapped)
                opener.count -= used
                closer.count -= used
                closerIndex = openerIndex + 2
                if (closer.count == 0) pieces.removeAt(closerIndex)
                if (opener.count == 0) {
                    pieces.removeAt(openerIndex)
                    closerIndex--
                }
            }
        }

        /** CommonMark's "rule of 3", and strike runs of one length only. */
        private fun pairs(opener: Delimiter, closer: Delimiter): Boolean {
            if (closer.char == '~') return opener.count == closer.count
            val sum = opener.originalCount + closer.originalCount
            val bothMultiples = opener.originalCount % 3 == 0 && closer.originalCount % 3 == 0
            return !((opener.canClose || closer.canOpen) && sum % 3 == 0 && !bothMultiples)
        }

        /** The pieces as one text; a run that found no partner is literal. */
        private fun flatten(parts: List<Piece>): Fragment {
            val out = StringBuilder()
            val marks = mutableListOf<RichMark>()
            for (part in parts) {
                when (part) {
                    is Fragment -> {
                        val offset = out.length
                        out.append(part.text)
                        part.marks.mapTo(marks) { it.copy(start = it.start + offset, end = it.end + offset) }
                    }
                    is Delimiter -> out.append(part.char.toString().repeat(part.count))
                }
            }
            return Fragment(out.toString(), marks)
        }
    }

    /** `[label](destination "title")`, read by hand where a regular
     *  expression over nested brackets and parentheses would recurse once
     *  per character. */
    private class LinkSyntax(val label: String, val destination: String, val end: Int) {
        companion object {
            fun parse(raw: String, open: Int): LinkSyntax? {
                val close = closingBracket(raw, open) ?: return null
                if (raw.getOrNull(close + 1) != '(') return null
                var at = skipSpaces(raw, close + 2)
                val destination: String
                if (raw.getOrNull(at) == '<') {
                    val end = (at + 1 until raw.length).firstOrNull { raw[it] == '>' || raw[it] == '<' || raw[it] == '\n' }
                    if (end == null || raw[end] != '>') return null
                    destination = raw.substring(at + 1, end).replace(" ", "%20")
                    at = end + 1
                } else {
                    val start = at
                    var depth = 0
                    while (at < raw.length) {
                        val c = raw[at]
                        if (c == '\\' && at + 1 < raw.length) {
                            at += 2
                            continue
                        }
                        if (c.isWhitespace() || c.isISOControl()) break
                        if (c == '(') depth++
                        if (c == ')') {
                            if (depth == 0) break
                            depth--
                        }
                        at++
                    }
                    destination = unescape(raw.substring(start, at))
                }
                at = skipSpaces(raw, at)
                val opening = raw.getOrNull(at)
                if (opening == '"' || opening == '\'' || opening == '(') {
                    at = titleEnd(raw, at, if (opening == '(') ')' else opening) ?: return null
                    at = skipSpaces(raw, at)
                }
                if (raw.getOrNull(at) != ')') return null
                return LinkSyntax(raw.substring(open + 1, close), destination, at + 1)
            }

            /** The `]` that closes the `[` at [open], nested pairs and
             *  escapes included. */
            private fun closingBracket(raw: String, open: Int): Int? {
                var depth = 0
                var at = open
                while (at < raw.length) {
                    when (raw[at]) {
                        '\\' -> at++
                        '[' -> depth++
                        ']' -> {
                            depth--
                            if (depth == 0) return at
                        }
                    }
                    at++
                }
                return null
            }

            private fun skipSpaces(raw: String, from: Int): Int {
                var at = from
                while (at < raw.length && raw[at].isWhitespace()) at++
                return at
            }

            /** Where a title opened at [open] stops, after its [closing]. */
            private fun titleEnd(raw: String, open: Int, closing: Char): Int? {
                var at = open + 1
                while (at < raw.length) {
                    when (raw[at]) {
                        '\\' -> at++
                        closing -> return at + 1
                    }
                    at++
                }
                return null
            }

            private fun unescape(value: String): String {
                if ('\\' !in value) return value
                val out = StringBuilder()
                var at = 0
                while (at < value.length) {
                    if (value[at] == '\\' && at + 1 < value.length && value[at + 1] in AsciiPunctuation) at++
                    out.append(value[at++])
                }
                return out.toString()
            }
        }
    }
}
