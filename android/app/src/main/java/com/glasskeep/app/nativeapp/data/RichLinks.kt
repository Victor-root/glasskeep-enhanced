package com.glasskeep.app.nativeapp.data

/**
 * The web editor's Link extension (link.ts and its autolink and paste
 * helpers): which addresses become links as they are typed or pasted, and
 * where they point, [Linkify] finding them.
 */
object RichLinks {
    /** A link to make: the characters it covers and where it points. */
    data class Found(val start: Int, val end: Int, val href: String)

    /** The whitespace the extension knows (DOMPurify's list). */
    private val Whitespace = Regex("[\\u0000- \\u00a0\\u1680\\u180e\\u2000-\\u2029\\u205f\\u3000]")
    private val AllowedProtocols = listOf("http", "https", "ftp", "ftps", "mailto", "tel", "callto", "sms", "cid", "xmpp")
    private val AllowedUri = Regex(
        "^(?:(?:${AllowedProtocols.joinToString("|")}):|[^a-z]|[a-z0-9+.-]+(?:[^a-z+.-:]|$))",
        RegexOption.IGNORE_CASE,
    )
    private val SchemeRegex = Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE)
    private val MaybeSchemeRegex = Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE)
    private val HostEndRegex = Regex("[/?#:]")
    private val Ipv4Regex = Regex("""\d{1,3}(\.\d{1,3}){3}""")
    private val Enclosings = setOf("()", "[]")

    /** isAllowedUri(): a known scheme, or no scheme at all. As on the web,
     *  `.-:` in the last class is a range (the extension's template string
     *  drops the escape before the hyphen), which refuses most addresses
     *  that have no scheme and a path or a port. */
    fun isAllowedUri(uri: String?): Boolean =
        uri.isNullOrEmpty() || AllowedUri.containsMatchIn(uri.replace(Whitespace, ""))

    /** The default shouldAutoLink(): an address with a scheme, or one whose
     *  host has a dot and is not an IP address. */
    fun shouldAutoLink(url: String): Boolean {
        if (SchemeRegex.containsMatchIn(url) || MaybeSchemeRegex.containsMatchIn(url) && '@' !in url) return true
        val hostname = url.substringAfterLast('@').split(HostEndRegex).first()
        if (Ipv4Regex.matches(hostname)) return false
        return '.' in hostname
    }

    /** Whether [text] ends with whitespace, which sets autolink off. */
    fun endsWithWhitespace(text: String): Boolean = text.isNotEmpty() && Whitespace.matches(text.substring(text.length - 1))

    /**
     * autolink(): the last word of [text] (a textblock's text up to where
     * a change ends) as a link, when it is an address alone or in
     * parentheses or brackets that is allowed and should be linked. What
     * the web checks against the document (inline code, a link already
     * there) is left to the caller.
     */
    fun lastWordLinks(text: String): List<Found> {
        val word = text.split(Whitespace).lastOrNull { it.isNotEmpty() } ?: return emptyList()
        val offset = text.lastIndexOf(word)
        val tokens = Linkify.tokenize(word)
        val valid = when (tokens.size) {
            1 -> tokens[0].isLink
            3 -> tokens[1].isLink && tokens[0].value + tokens[2].value in Enclosings
            else -> false
        }
        if (!valid) return emptyList()
        return tokens.filter { it.isLink && isAllowedUri(it.value) && shouldAutoLink(it.value) }
            .map { Found(offset + it.start, offset + it.end, it.href) }
    }

    /** The paste rule's find(): the addresses of [text] to link. */
    fun pasteRuleLinks(text: String): List<Found> =
        Linkify.find(text).filter { isAllowedUri(it.value) && shouldAutoLink(it.value) }.map { Found(it.start, it.end, it.href) }

    /** handlePasteLink: where [text] points when it is one address, whole,
     *  that should be linked. */
    fun wholeLink(text: String): String? {
        if (text.isEmpty()) return null
        val link = Linkify.find(text).firstOrNull { it.value == text } ?: return null
        return link.href.takeIf { shouldAutoLink(link.value) }
    }
}
