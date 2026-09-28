package com.glasskeep.app.nativeapp.data

/**
 * linkifyjs 4.3.2, with which the web editor's Link extension finds web
 * and e-mail addresses in text. Its scanner cuts the text into tokens with
 * a state machine over characters that knows every top-level domain of the
 * IANA list; its parser groups the tokens into addresses and plain text
 * with a state machine over tokens. Both machines are built step by step
 * as the library builds them, quirks included, so a text gives the
 * addresses it gives on the web. The web registers no scheme or plugin of
 * its own.
 */
object Linkify {
    enum class Kind { TEXT, URL, EMAIL, NL }

    /** A run of the text, [start] to [end]: an address, a line break or
     *  plain text. [href] is where an address points: as written when it
     *  has a scheme, over http when it has none, mailto: for an e-mail. */
    data class Token(val kind: Kind, val value: String, val start: Int, val end: Int, val href: String) {
        val isLink: Boolean get() = kind == Kind.URL || kind == Kind.EMAIL
    }

    /** tokenize(): the whole of [text], address by address. */
    fun tokenize(text: String): List<Token> = parse(text, scan(text))

    /** find(): the addresses in [text]. */
    fun find(text: String): List<Token> = tokenize(text).filter { it.isLink }

    // ---------- Scanner (scanner.js) ----------

    private enum class Tk {
        WORD, UWORD, ASCIINUMERICAL, ALPHANUMERICAL, LOCALHOST, TLD, UTLD, SCHEME, SLASH_SCHEME, NUM, WS, NL,
        OPENBRACE, CLOSEBRACE, OPENBRACKET, CLOSEBRACKET, OPENPAREN, CLOSEPAREN, OPENANGLEBRACKET, CLOSEANGLEBRACKET,
        FULLWIDTHLEFTPAREN, FULLWIDTHRIGHTPAREN, LEFTCORNERBRACKET, RIGHTCORNERBRACKET, LEFTWHITECORNERBRACKET,
        RIGHTWHITECORNERBRACKET, FULLWIDTHLESSTHAN, FULLWIDTHGREATERTHAN, AMPERSAND, APOSTROPHE, ASTERISK, AT,
        BACKSLASH, BACKTICK, CARET, COLON, COMMA, DOLLAR, DOT, EQUALS, EXCLAMATION, HYPHEN, PERCENT, PIPE, PLUS,
        POUND, QUERY, QUOTE, FULLWIDTHMIDDLEDOT, SEMI, SLASH, TILDE, UNDERSCORE, EMOJI, SYM,
    }

    /** The scanner's token collections. */
    private enum class Group { NUMERIC, ASCII, ALPHA, ASCIINUMERIC, ALPHANUMERIC, DOMAIN, EMOJI, SCHEME, SLASHSCHEME, WHITESPACE, TLD, UTLD }

    private class Scanned(val type: Tk, val start: Int, val end: Int)

    /** A scanner state: exact character transitions first, then tested
     *  ones in order (a null target is passed over), then the default. A
     *  state with a token accepts. */
    private class CharState(var token: Tk? = null) {
        val exact = HashMap<Int, CharState>()
        val tested = ArrayList<Pair<(Int) -> Boolean, CharState?>>()
        var default: CharState? = null

        fun go(c: Int): CharState? {
            exact[c]?.let { return it }
            for ((test, next) in tested) if (next != null && test(c)) return next
            return default
        }
    }

    /** The scanner's machine and collections, as init() builds them. */
    private class ScannerMachine {
        val groups = LinkedHashMap<Group, MutableList<Tk>>()
        val start = CharState()

        fun group(g: Group): List<Tk> = groups[g].orEmpty()

        private fun addToGroups(t: Tk, flags: MutableSet<Group>) {
            if (Group.NUMERIC in flags) flags += listOf(Group.ASCIINUMERIC, Group.ALPHANUMERIC)
            if (Group.ASCII in flags) flags += listOf(Group.ASCIINUMERIC, Group.ALPHA)
            if (Group.ASCIINUMERIC in flags) flags += Group.ALPHANUMERIC
            if (Group.ALPHA in flags) flags += Group.ALPHANUMERIC
            if (Group.ALPHANUMERIC in flags) flags += Group.DOMAIN
            if (Group.EMOJI in flags) flags += Group.DOMAIN
            for (flag in flags) {
                val group = groups.getOrPut(flag) { mutableListOf() }
                if (t !in group) group += t
            }
        }

        private fun flagsFor(t: Tk): Set<Group> = groups.filterValues { t in it }.keys

        /** tt() to [next]. */
        private fun CharState.tt(c: Int, next: CharState): CharState {
            exact[c] = next
            return next
        }

        /** tt() to a new state made on the model of where [c] leads now,
         *  emitting [t] when given, which joins that state's collections. */
        private fun CharState.tt(c: Int, t: Tk? = null, flags: Set<Group>? = null): CharState {
            val template = go(c)
            val next = CharState()
            if (template != null) {
                next.exact.putAll(template.exact)
                next.tested.addAll(template.tested)
                next.default = template.default
                next.token = template.token
            }
            if (t != null) {
                val inherited = next.token
                if (inherited != null) {
                    addToGroups(t, (flagsFor(inherited) + flags.orEmpty()).toMutableSet())
                } else if (flags != null) {
                    addToGroups(t, flags.toMutableSet())
                }
                next.token = t
            }
            exact[c] = next
            return next
        }

        /** tr() to [next]. */
        private fun CharState.tr(test: (Int) -> Boolean, next: CharState): CharState {
            tested += test to next
            return next
        }

        /** tr() to a new state emitting [t]. */
        private fun CharState.tr(test: (Int) -> Boolean, t: Tk? = null, flags: Set<Group>? = null): CharState {
            val next = CharState(t)
            if (t != null && flags != null) addToGroups(t, flags.toMutableSet())
            tested += test to next
            return next
        }

        private fun CharState.ts(input: String, t: Tk, flags: Set<Group>): CharState {
            var state = this
            for (i in 0 until input.length - 1) state = state.tt(input[i].code)
            return state.tt(input.last().code, t, flags)
        }

        /** fastts(): the states for [input] with [tested] as their tested
         *  transitions, the last one emitting [t] and the ones before
         *  [defaultToken]; the last one always replaces what was there. */
        private fun fastts(from: CharState, input: String, t: Tk, defaultToken: Tk, tested: List<Pair<(Int) -> Boolean, CharState?>>) {
            var state = from
            for (i in 0 until input.length - 1) {
                val c = input[i].code
                var next = state.exact[c]
                if (next == null) {
                    next = CharState(defaultToken)
                    next.tested.addAll(tested)
                    state.exact[c] = next
                }
                state = next
            }
            val last = CharState(t)
            last.tested.addAll(tested)
            state.exact[input.last().code] = last
        }

        init {
            val symbols = listOf(
                '\'' to Tk.APOSTROPHE, '{' to Tk.OPENBRACE, '}' to Tk.CLOSEBRACE, '[' to Tk.OPENBRACKET,
                ']' to Tk.CLOSEBRACKET, '(' to Tk.OPENPAREN, ')' to Tk.CLOSEPAREN, '<' to Tk.OPENANGLEBRACKET,
                '>' to Tk.CLOSEANGLEBRACKET, '（' to Tk.FULLWIDTHLEFTPAREN, '）' to Tk.FULLWIDTHRIGHTPAREN,
                '「' to Tk.LEFTCORNERBRACKET, '」' to Tk.RIGHTCORNERBRACKET, '『' to Tk.LEFTWHITECORNERBRACKET,
                '』' to Tk.RIGHTWHITECORNERBRACKET, '＜' to Tk.FULLWIDTHLESSTHAN, '＞' to Tk.FULLWIDTHGREATERTHAN,
                '&' to Tk.AMPERSAND, '*' to Tk.ASTERISK, '@' to Tk.AT, '`' to Tk.BACKTICK, '^' to Tk.CARET,
                ':' to Tk.COLON, ',' to Tk.COMMA, '$' to Tk.DOLLAR, '.' to Tk.DOT, '=' to Tk.EQUALS,
                '!' to Tk.EXCLAMATION, '-' to Tk.HYPHEN, '%' to Tk.PERCENT, '|' to Tk.PIPE, '+' to Tk.PLUS,
                '#' to Tk.POUND, '?' to Tk.QUERY, '"' to Tk.QUOTE, '/' to Tk.SLASH, ';' to Tk.SEMI, '~' to Tk.TILDE,
                '_' to Tk.UNDERSCORE, '\\' to Tk.BACKSLASH, '・' to Tk.FULLWIDTHMIDDLEDOT,
            )
            for ((c, t) in symbols) start.tt(c.code, t)
            val num = start.tr(::isDigit, Tk.NUM, setOf(Group.NUMERIC))
            num.tr(::isDigit, num)
            val asciinumeric = num.tr(::isAsciiLetter, Tk.ASCIINUMERICAL, setOf(Group.ASCIINUMERIC))
            val alphanumeric = num.tr(::isLetter, Tk.ALPHANUMERICAL, setOf(Group.ALPHANUMERIC))
            val word = start.tr(::isAsciiLetter, Tk.WORD, setOf(Group.ASCII))
            word.tr(::isDigit, asciinumeric)
            word.tr(::isAsciiLetter, word)
            asciinumeric.tr(::isDigit, asciinumeric)
            asciinumeric.tr(::isAsciiLetter, asciinumeric)
            val uword = start.tr(::isLetter, Tk.UWORD, setOf(Group.ALPHA))
            uword.tr(::isAsciiLetter)
            uword.tr(::isDigit, alphanumeric)
            uword.tr(::isLetter, uword)
            alphanumeric.tr(::isDigit, alphanumeric)
            alphanumeric.tr(::isAsciiLetter)
            alphanumeric.tr(::isLetter, alphanumeric)

            val nl = start.tt(LF, Tk.NL, setOf(Group.WHITESPACE))
            val cr = start.tt(CR, Tk.WS, setOf(Group.WHITESPACE))
            val ws = start.tr(::isSpace, Tk.WS, setOf(Group.WHITESPACE))
            start.tt(OBJECT_REPLACEMENT, ws)
            cr.tt(LF, nl)
            cr.tt(OBJECT_REPLACEMENT, ws)
            cr.tr(::isSpace, ws)
            ws.tt(CR)
            ws.tt(LF)
            ws.tr(::isSpace, ws)
            ws.tt(OBJECT_REPLACEMENT, ws)

            val emoji = start.tr(::isEmoji, Tk.EMOJI, setOf(Group.EMOJI))
            emoji.tt('#'.code)
            emoji.tr(::isEmoji, emoji)
            emoji.tt(EMOJI_VARIATION, emoji)
            val joiner = emoji.tt(EMOJI_JOINER)
            joiner.tt('#'.code)
            joiner.tr(::isEmoji, emoji)

            val wordTested = listOf<Pair<(Int) -> Boolean, CharState?>>(::isAsciiLetter to word, ::isDigit to asciinumeric)
            val uwordTested = listOf<Pair<(Int) -> Boolean, CharState?>>(::isAsciiLetter to null, ::isLetter to uword, ::isDigit to alphanumeric)
            for (tld in decodeTlds(EncodedTlds)) fastts(start, tld, Tk.TLD, Tk.WORD, wordTested)
            for (tld in decodeTlds(EncodedUtlds)) fastts(start, tld, Tk.UTLD, Tk.UWORD, uwordTested)
            addToGroups(Tk.TLD, mutableSetOf(Group.TLD, Group.ASCII))
            addToGroups(Tk.UTLD, mutableSetOf(Group.UTLD, Group.ALPHA))
            fastts(start, "file", Tk.SCHEME, Tk.WORD, wordTested)
            fastts(start, "mailto", Tk.SCHEME, Tk.WORD, wordTested)
            fastts(start, "http", Tk.SLASH_SCHEME, Tk.WORD, wordTested)
            fastts(start, "https", Tk.SLASH_SCHEME, Tk.WORD, wordTested)
            fastts(start, "ftp", Tk.SLASH_SCHEME, Tk.WORD, wordTested)
            fastts(start, "ftps", Tk.SLASH_SCHEME, Tk.WORD, wordTested)
            addToGroups(Tk.SCHEME, mutableSetOf(Group.SCHEME, Group.ASCII))
            addToGroups(Tk.SLASH_SCHEME, mutableSetOf(Group.SLASHSCHEME, Group.ASCII))
            start.ts("localhost", Tk.LOCALHOST, setOf(Group.ASCII))
            start.default = CharState(Tk.SYM)
        }
    }

    private const val LF = '\n'.code
    private const val CR = '\r'.code
    private const val EMOJI_VARIATION = 0xfe0f
    private const val EMOJI_JOINER = 0x200d
    private const val OBJECT_REPLACEMENT = 0xfffc

    private fun isAsciiLetter(c: Int) = c in 'a'.code..'z'.code

    private fun isDigit(c: Int) = c in '0'.code..'9'.code

    /** \p{L}. */
    private fun isLetter(c: Int) = Character.isLetter(c)

    /** JavaScript's \s. */
    private fun isSpace(c: Int) = c in 0x09..0x0d || c == 0x20 || c == 0xa0 || c == 0x1680 || c in 0x2000..0x200a ||
        c == 0x2028 || c == 0x2029 || c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff

    /** \p{Emoji}. */
    private fun isEmoji(c: Int): Boolean {
        var low = 0
        var high = EmojiRanges.size / 2 - 1
        while (low <= high) {
            val mid = (low + high) ushr 1
            when {
                c < EmojiRanges[2 * mid] -> high = mid - 1
                c > EmojiRanges[2 * mid + 1] -> low = mid + 1
                else -> return true
            }
        }
        return false
    }

    /** run() of the scanner: the longest run each state reaches, rolled
     *  back to its last accepting state, the machine reading the text with
     *  A to Z in lower case. */
    private fun scan(text: String): List<Scanned> {
        val lowered = buildString(text.length) { for (ch in text) append(if (ch in 'A'..'Z') ch + 32 else ch) }
        val tokens = mutableListOf<Scanned>()
        var cursor = 0
        while (cursor < lowered.length) {
            var state = scanner.start
            var latestAccepting: CharState? = null
            var sinceAccepts = -1
            var i = cursor
            while (i < lowered.length) {
                val c = lowered.codePointAt(i)
                state = state.go(c) ?: break
                val width = Character.charCount(c)
                if (state.token != null) {
                    sinceAccepts = 0
                    latestAccepting = state
                } else if (sinceAccepts >= 0) {
                    sinceAccepts += width
                }
                i += width
            }
            val end = i - sinceAccepts
            tokens += Scanned(checkNotNull(latestAccepting?.token), cursor, end)
            cursor = end
        }
        return tokens
    }

    /** decodeTlds(): a trie written depth first, each run of digits
     *  ending a name and climbing that many letters back up. */
    private fun decodeTlds(encoded: String): List<String> {
        val words = mutableListOf<String>()
        val stack = StringBuilder()
        var i = 0
        while (i < encoded.length) {
            var digits = 0
            while (i + digits < encoded.length && encoded[i + digits] in '0'..'9') digits++
            if (digits > 0) {
                words += stack.toString()
                stack.setLength(maxOf(0, stack.length - encoded.substring(i, i + digits).toInt()))
                i += digits
            } else {
                stack.append(encoded[i])
                i++
            }
        }
        return words
    }

    // ---------- Parser (parser.js) ----------

    /** A parser state: transitions on scanner tokens, and the kind of run
     *  it ends when it accepts. */
    private class TokenState(var kind: Kind? = null) {
        val next = HashMap<Tk, TokenState>()
    }

    private fun TokenState.tt(input: Tk, to: TokenState): TokenState {
        next[input] = to
        return to
    }

    /** tt() to a new state made on the model of where [input] leads now. */
    private fun TokenState.tt(input: Tk, kind: Kind? = null): TokenState {
        val template = next[input]
        val state = TokenState(template?.kind)
        if (template != null) state.next.putAll(template.next)
        if (kind != null) state.kind = kind
        next[input] = state
        return state
    }

    private fun TokenState.ta(inputs: List<Tk>, to: TokenState) {
        for (input in inputs) tt(input, to)
    }

    private fun TokenState.ta(inputs: List<Tk>, kind: Kind? = null) {
        for (input in inputs) tt(input, kind)
    }

    /** init() of the parser, over the scanner's collections. */
    private fun parserStart(scanner: ScannerMachine): TokenState {
        val domain = scanner.group(Group.DOMAIN)
        val qsAccepting = domain + listOf(
            Tk.AMPERSAND, Tk.ASTERISK, Tk.AT, Tk.BACKSLASH, Tk.BACKTICK, Tk.CARET, Tk.DOLLAR, Tk.EQUALS, Tk.HYPHEN,
            Tk.NUM, Tk.PERCENT, Tk.PIPE, Tk.PLUS, Tk.POUND, Tk.SLASH, Tk.SYM, Tk.TILDE, Tk.UNDERSCORE,
        )
        val qsNonAccepting = listOf(
            Tk.APOSTROPHE, Tk.COLON, Tk.COMMA, Tk.DOT, Tk.EXCLAMATION, Tk.PERCENT, Tk.QUERY, Tk.QUOTE, Tk.SEMI,
            Tk.OPENANGLEBRACKET, Tk.CLOSEANGLEBRACKET, Tk.OPENBRACE, Tk.CLOSEBRACE, Tk.CLOSEBRACKET, Tk.OPENBRACKET,
            Tk.OPENPAREN, Tk.CLOSEPAREN, Tk.FULLWIDTHLEFTPAREN, Tk.FULLWIDTHRIGHTPAREN, Tk.LEFTCORNERBRACKET,
            Tk.RIGHTCORNERBRACKET, Tk.LEFTWHITECORNERBRACKET, Tk.RIGHTWHITECORNERBRACKET, Tk.FULLWIDTHLESSTHAN,
            Tk.FULLWIDTHGREATERTHAN,
        )
        val localpartAccepting = listOf(
            Tk.AMPERSAND, Tk.APOSTROPHE, Tk.ASTERISK, Tk.BACKSLASH, Tk.BACKTICK, Tk.CARET, Tk.DOLLAR, Tk.EQUALS,
            Tk.HYPHEN, Tk.OPENBRACE, Tk.CLOSEBRACE, Tk.PERCENT, Tk.PIPE, Tk.PLUS, Tk.POUND, Tk.QUERY, Tk.SLASH, Tk.SYM,
            Tk.TILDE, Tk.UNDERSCORE,
        )
        val start = TokenState()
        val localpart = start.tt(Tk.TILDE)
        localpart.ta(localpartAccepting, localpart)
        localpart.ta(domain, localpart)
        val domainState = TokenState()
        val schemeState = TokenState()
        val slashSchemeState = TokenState()
        start.ta(domain, domainState)
        start.ta(scanner.group(Group.SCHEME), schemeState)
        start.ta(scanner.group(Group.SLASHSCHEME), slashSchemeState)

        domainState.ta(localpartAccepting, localpart)
        domainState.ta(domain, domainState)
        val localpartAt = domainState.tt(Tk.AT)
        localpart.tt(Tk.AT, localpartAt)
        schemeState.tt(Tk.AT, localpartAt)
        slashSchemeState.tt(Tk.AT, localpartAt)
        val localpartDot = localpart.tt(Tk.DOT)
        localpartDot.ta(localpartAccepting, localpart)
        localpartDot.ta(domain, localpart)
        val emailDomain = TokenState()
        localpartAt.ta(domain, emailDomain)
        emailDomain.ta(domain, emailDomain)
        val emailDomainDot = emailDomain.tt(Tk.DOT)
        emailDomainDot.ta(domain, emailDomain)
        val email = TokenState(Kind.EMAIL)
        emailDomainDot.ta(scanner.group(Group.TLD), email)
        emailDomainDot.ta(scanner.group(Group.UTLD), email)
        localpartAt.tt(Tk.LOCALHOST, email)
        val emailDomainHyphen = emailDomain.tt(Tk.HYPHEN)
        emailDomainHyphen.tt(Tk.HYPHEN, emailDomainHyphen)
        emailDomainHyphen.ta(domain, emailDomain)
        email.ta(domain, emailDomain)
        email.tt(Tk.DOT, emailDomainDot)
        email.tt(Tk.HYPHEN, emailDomainHyphen)
        val emailColon = email.tt(Tk.COLON)
        emailColon.ta(scanner.group(Group.NUMERIC), Kind.EMAIL)

        val domainHyphen = domainState.tt(Tk.HYPHEN)
        val domainDot = domainState.tt(Tk.DOT)
        domainHyphen.tt(Tk.HYPHEN, domainHyphen)
        domainHyphen.ta(domain, domainState)
        domainDot.ta(localpartAccepting, localpart)
        domainDot.ta(domain, domainState)
        val domainDotTld = TokenState(Kind.URL)
        domainDot.ta(scanner.group(Group.TLD), domainDotTld)
        domainDot.ta(scanner.group(Group.UTLD), domainDotTld)
        domainDotTld.ta(domain, domainState)
        domainDotTld.ta(localpartAccepting, localpart)
        domainDotTld.tt(Tk.DOT, domainDot)
        domainDotTld.tt(Tk.HYPHEN, domainHyphen)
        domainDotTld.tt(Tk.AT, localpartAt)
        val domainDotTldColon = domainDotTld.tt(Tk.COLON)
        val domainDotTldColonPort = TokenState(Kind.URL)
        domainDotTldColon.ta(scanner.group(Group.NUMERIC), domainDotTldColonPort)

        val url = TokenState(Kind.URL)
        val urlNonaccept = TokenState()
        url.ta(qsAccepting, url)
        url.ta(qsNonAccepting, urlNonaccept)
        urlNonaccept.ta(qsAccepting, url)
        urlNonaccept.ta(qsNonAccepting, urlNonaccept)
        domainDotTld.tt(Tk.SLASH, url)
        domainDotTldColonPort.tt(Tk.SLASH, url)

        val schemeColon = schemeState.tt(Tk.COLON)
        val slashSchemeColon = slashSchemeState.tt(Tk.COLON)
        val slashSchemeColonSlash = slashSchemeColon.tt(Tk.SLASH)
        val uriPrefix = slashSchemeColonSlash.tt(Tk.SLASH)
        schemeState.ta(domain, domainState)
        schemeState.tt(Tk.DOT, domainDot)
        schemeState.tt(Tk.HYPHEN, domainHyphen)
        slashSchemeState.ta(domain, domainState)
        slashSchemeState.tt(Tk.DOT, domainDot)
        slashSchemeState.tt(Tk.HYPHEN, domainHyphen)
        schemeColon.ta(domain, url)
        schemeColon.tt(Tk.SLASH, url)
        schemeColon.tt(Tk.QUERY, url)
        uriPrefix.ta(domain, url)
        uriPrefix.ta(qsAccepting, url)
        uriPrefix.tt(Tk.SLASH, url)

        val bracketPairs = listOf(
            Tk.OPENBRACE to Tk.CLOSEBRACE,
            Tk.OPENBRACKET to Tk.CLOSEBRACKET,
            Tk.OPENPAREN to Tk.CLOSEPAREN,
            Tk.OPENANGLEBRACKET to Tk.CLOSEANGLEBRACKET,
            Tk.FULLWIDTHLEFTPAREN to Tk.FULLWIDTHRIGHTPAREN,
            Tk.LEFTCORNERBRACKET to Tk.RIGHTCORNERBRACKET,
            Tk.LEFTWHITECORNERBRACKET to Tk.RIGHTWHITECORNERBRACKET,
            Tk.FULLWIDTHLESSTHAN to Tk.FULLWIDTHGREATERTHAN,
        )
        for ((open, close) in bracketPairs) {
            val urlOpen = url.tt(open)
            urlNonaccept.tt(open, urlOpen)
            urlOpen.tt(close, url)
            val urlOpenQ = TokenState(Kind.URL)
            urlOpen.ta(qsAccepting, urlOpenQ)
            val urlOpenSyms = TokenState()
            urlOpen.ta(qsNonAccepting)
            urlOpenQ.ta(qsAccepting, urlOpenQ)
            urlOpenQ.ta(qsNonAccepting, urlOpenSyms)
            urlOpenSyms.ta(qsAccepting, urlOpenQ)
            urlOpenSyms.ta(qsNonAccepting, urlOpenSyms)
            urlOpenQ.tt(close, url)
            urlOpenSyms.tt(close, url)
        }
        start.tt(Tk.LOCALHOST, domainDotTld)
        start.tt(Tk.NL, Kind.NL)
        return start
    }

    /** run() of the parser: the longest run of tokens ending on an
     *  accepting state makes an address, anything else is plain text. */
    private fun parse(input: String, tokens: List<Scanned>): List<Token> {
        val runs = mutableListOf<Token>()
        val textTokens = mutableListOf<Scanned>()
        var cursor = 0
        while (cursor < tokens.size) {
            var state = parser
            var secondState: TokenState? = null
            var runLength = 0
            var latestAccepting: TokenState? = null
            var sinceAccepts = -1
            while (cursor < tokens.size) {
                secondState = state.next[tokens[cursor].type]
                if (secondState != null) break
                textTokens += tokens[cursor++]
            }
            while (cursor < tokens.size) {
                state = secondState ?: state.next[tokens[cursor].type] ?: break
                secondState = null
                if (state.kind != null) {
                    sinceAccepts = 0
                    latestAccepting = state
                } else if (sinceAccepts >= 0) {
                    sinceAccepts++
                }
                cursor++
                runLength++
            }
            if (latestAccepting == null) {
                cursor -= runLength
                if (cursor < tokens.size) textTokens += tokens[cursor++]
            } else {
                if (textTokens.isNotEmpty()) {
                    runs += run(Kind.TEXT, input, textTokens)
                    textTokens.clear()
                }
                cursor -= sinceAccepts
                runLength -= sinceAccepts
                runs += run(checkNotNull(latestAccepting.kind), input, tokens.subList(cursor - runLength, cursor))
            }
        }
        if (textTokens.isNotEmpty()) runs += run(Kind.TEXT, input, textTokens)
        return runs
    }

    private fun run(kind: Kind, input: String, parts: List<Scanned>): Token {
        val start = parts.first().start
        val end = parts.last().end
        val value = input.substring(start, end)
        val hasProtocol = parts.size >= 2 && parts[0].type != Tk.LOCALHOST && parts[1].type == Tk.COLON
        val href = when {
            kind == Kind.EMAIL -> "mailto:$value"
            kind == Kind.URL && !hasProtocol -> "http://$value"
            else -> value
        }
        return Token(kind, value, start, end, href)
    }

    private val scanner by lazy { ScannerMachine() }
    private val parser by lazy { parserStart(scanner) }

    /** Unicode's Emoji property (\p{Emoji}) as Chrome 141 reads it: first
     *  and last code point of each range. */
    private val EmojiRanges = intArrayOf(
        0x23, 0x23, 0x2A, 0x2A, 0x30, 0x39, 0xA9, 0xA9, 0xAE, 0xAE, 0x203C, 0x203C,
        0x2049, 0x2049, 0x2122, 0x2122, 0x2139, 0x2139, 0x2194, 0x2199, 0x21A9, 0x21AA, 0x231A, 0x231B,
        0x2328, 0x2328, 0x23CF, 0x23CF, 0x23E9, 0x23F3, 0x23F8, 0x23FA, 0x24C2, 0x24C2, 0x25AA, 0x25AB,
        0x25B6, 0x25B6, 0x25C0, 0x25C0, 0x25FB, 0x25FE, 0x2600, 0x2604, 0x260E, 0x260E, 0x2611, 0x2611,
        0x2614, 0x2615, 0x2618, 0x2618, 0x261D, 0x261D, 0x2620, 0x2620, 0x2622, 0x2623, 0x2626, 0x2626,
        0x262A, 0x262A, 0x262E, 0x262F, 0x2638, 0x263A, 0x2640, 0x2640, 0x2642, 0x2642, 0x2648, 0x2653,
        0x265F, 0x2660, 0x2663, 0x2663, 0x2665, 0x2666, 0x2668, 0x2668, 0x267B, 0x267B, 0x267E, 0x267F,
        0x2692, 0x2697, 0x2699, 0x2699, 0x269B, 0x269C, 0x26A0, 0x26A1, 0x26A7, 0x26A7, 0x26AA, 0x26AB,
        0x26B0, 0x26B1, 0x26BD, 0x26BE, 0x26C4, 0x26C5, 0x26C8, 0x26C8, 0x26CE, 0x26CF, 0x26D1, 0x26D1,
        0x26D3, 0x26D4, 0x26E9, 0x26EA, 0x26F0, 0x26F5, 0x26F7, 0x26FA, 0x26FD, 0x26FD, 0x2702, 0x2702,
        0x2705, 0x2705, 0x2708, 0x270D, 0x270F, 0x270F, 0x2712, 0x2712, 0x2714, 0x2714, 0x2716, 0x2716,
        0x271D, 0x271D, 0x2721, 0x2721, 0x2728, 0x2728, 0x2733, 0x2734, 0x2744, 0x2744, 0x2747, 0x2747,
        0x274C, 0x274C, 0x274E, 0x274E, 0x2753, 0x2755, 0x2757, 0x2757, 0x2763, 0x2764, 0x2795, 0x2797,
        0x27A1, 0x27A1, 0x27B0, 0x27B0, 0x27BF, 0x27BF, 0x2934, 0x2935, 0x2B05, 0x2B07, 0x2B1B, 0x2B1C,
        0x2B50, 0x2B50, 0x2B55, 0x2B55, 0x3030, 0x3030, 0x303D, 0x303D, 0x3297, 0x3297, 0x3299, 0x3299,
        0x1F004, 0x1F004, 0x1F0CF, 0x1F0CF, 0x1F170, 0x1F171, 0x1F17E, 0x1F17F, 0x1F18E, 0x1F18E, 0x1F191, 0x1F19A,
        0x1F1E6, 0x1F1FF, 0x1F201, 0x1F202, 0x1F21A, 0x1F21A, 0x1F22F, 0x1F22F, 0x1F232, 0x1F23A, 0x1F250, 0x1F251,
        0x1F300, 0x1F321, 0x1F324, 0x1F393, 0x1F396, 0x1F397, 0x1F399, 0x1F39B, 0x1F39E, 0x1F3F0, 0x1F3F3, 0x1F3F5,
        0x1F3F7, 0x1F4FD, 0x1F4FF, 0x1F53D, 0x1F549, 0x1F54E, 0x1F550, 0x1F567, 0x1F56F, 0x1F570, 0x1F573, 0x1F57A,
        0x1F587, 0x1F587, 0x1F58A, 0x1F58D, 0x1F590, 0x1F590, 0x1F595, 0x1F596, 0x1F5A4, 0x1F5A5, 0x1F5A8, 0x1F5A8,
        0x1F5B1, 0x1F5B2, 0x1F5BC, 0x1F5BC, 0x1F5C2, 0x1F5C4, 0x1F5D1, 0x1F5D3, 0x1F5DC, 0x1F5DE, 0x1F5E1, 0x1F5E1,
        0x1F5E3, 0x1F5E3, 0x1F5E8, 0x1F5E8, 0x1F5EF, 0x1F5EF, 0x1F5F3, 0x1F5F3, 0x1F5FA, 0x1F64F, 0x1F680, 0x1F6C5,
        0x1F6CB, 0x1F6D2, 0x1F6D5, 0x1F6D7, 0x1F6DC, 0x1F6E5, 0x1F6E9, 0x1F6E9, 0x1F6EB, 0x1F6EC, 0x1F6F0, 0x1F6F0,
        0x1F6F3, 0x1F6FC, 0x1F7E0, 0x1F7EB, 0x1F7F0, 0x1F7F0, 0x1F90C, 0x1F93A, 0x1F93C, 0x1F945, 0x1F947, 0x1F9FF,
        0x1FA70, 0x1FA7C, 0x1FA80, 0x1FA88, 0x1FA90, 0x1FABD, 0x1FABF, 0x1FAC5, 0x1FACE, 0x1FADB, 0x1FAE0, 0x1FAE8,
        0x1FAF0, 0x1FAF8,
    )
    /** The IANA top-level domains (tlds.js), encoded by update-tlds.js. */
    private const val EncodedTlds =
        "aaa1rp3bb0ott3vie4c1le2ogado5udhabi7c0ademy5centure6ountant0s9o1tor4d0s1ult4e0g1ro2tna4f0l1rica5" +
        "g0akhan5ency5i0g1rbus3force5tel5kdn3l0ibaba4pay4lfinanz6state5y2sace3tom5m0azon4ericanexpress7fa" +
        "mily11x2fam3ica3sterdam8nalytics7droid5quan4z2o0l2partments8p0le4q0uarelle8r0ab1mco4chi3my2pa2t0" +
        "e3s0da2ia2sociates9t0hleta5torney7u0ction5di0ble3o3spost5thor3o0s4w0s2x0a2z0ure5ba0by2idu3namex4" +
        "d1k2r0celona5laycard4s5efoot5gains6seball5ketball8uhaus5yern5b0c1t1va3cg1n2d1e0ats2uty4er2rlin4s" +
        "t0buy5t2f1g1h0arti5i0ble3d1ke2ng0o3o1z2j1lack0friday9ockbuster8g1omberg7ue3m0s1w2n0pparibas9o0at" +
        "s3ehringer8fa2m1nd2o0k0ing5sch2tik2on4t1utique6x2r0adesco6idgestone9oadway5ker3ther5ussels7s1t1u" +
        "ild0ers6siness6y1zz3v1w1y1z0h3ca0b1fe2l0l1vinklein9m0era3p2non3petown5ital0one8r0avan4ds2e0er0s4" +
        "s2sa1e1h1ino4t0ering5holic7ba1n1re3c1d1enter4o1rn3f0a1d2g1h0anel2nel4rity4se2t2eap3intai5ristmas" +
        "6ome4urch5i0priani6rcle4sco3tadel4i0c2y3k1l0aims4eaning6ick2nic1que6othing5ud3ub0med6m1n1o0ach3d" +
        "es3ffee4llege4ogne5m0mbank4unity6pany2re3uter5sec4ndos3struction8ulting7tact3ractors9oking4l1p2r" +
        "sica5untry4pon0s4rses6pa2r0edit0card4union9icket5own3s1uise0s6u0isinella9v1w1x1y0mru3ou3z2dad1nc" +
        "e3ta1e1ing3sun4y2clk3ds2e0al0er2s3gree4livery5l1oitte5ta3mocrat6ntal2ist5si0gn4v2hl2iamonds6et2g" +
        "ital5rect0ory7scount3ver5h2y2j1k1m1np2o0cs1tor4g1mains5t1wnload7rive4tv2ubai3nlop4pont4rban5vag2" +
        "r2z2earth3t2c0o2deka3u0cation8e1g1mail3erck5nergy4gineer0ing9terprises10pson4quipment8r0icsson6n" +
        "i3s0q1tate5t1u0rovision8s2vents5xchange6pert3osed4ress5traspace10fage2il1rwinds6th3mily4n0s2rm0e" +
        "rs5shion4t3edex3edback6rrari3ero6i0delity5o2lm2nal1nce1ial7re0stone6mdale6sh0ing5t0ness6j1k1lick" +
        "r3ghts4r2orist4wers5y2m1o0o0d1tball6rd1ex2sale4um3undation8x2r0ee1senius7l1ogans4ntier7tr2ujitsu" +
        "5n0d2rniture7tbol5yi3ga0l0lery3o1up4me0s3p1rden4y2b0iz3d0n2e0a1nt0ing5orge5f1g0ee3h1i0ft0s3ves2i" +
        "ng5l0ass3e1obal2o4m0ail3bh2o1x2n1odaddy5ld0point6f2o0dyear5g0le4p1t1v2p1q1r0ainger5phics5tis4een" +
        "3ipe3ocery4up4s1t1u0cci3ge2ide2tars5ru3w1y2hair2mburg5ngout5us3bo2dfc0bank7ealth0care8lp1sinki6r" +
        "e1mes5iphop4samitsu7tachi5v2k0t2m1n1ockey4ldings5iday5medepot5goods5s0ense7nda3rse3spital5t0ing5" +
        "t0els3mail5use3w2r1sbc3t1u0ghes5yatt3undai7ibm2cbc2e1u2d1e0ee3fm2kano4l1m0amat4db2mo0bilien9n0c1" +
        "dustries8finiti5o2g1k1stitute6urance4e4t0ernational10uit4vestments10o1piranga7q1r0ish4s0maili5t0" +
        "anbul7t0au2v3jaguar4va3cb2e0ep2tzt3welry6io2ll2m0p2nj2o0bs1urg4t1y2p0morgan6rs3uegos4niper7kaufe" +
        "n5ddi3e0rryhotels6properties14fh2g1h1i0a1ds2m1ndle4tchen5wi3m1n1oeln3matsu5sher5p0mg2n2r0d1ed3uo" +
        "kgroup8w1y0oto4z2la0caixa5mborghini8er3nd0rover6xess5salle5t0ino3robe5w0yer5b1c1ds2ease3clerc5fr" +
        "ak4gal2o2xus4gbt3i0dl2fe0insurance9style7ghting6ke2lly3mited4o2ncoln4k2ve1ing5k1lc1p2oan0s3cker3" +
        "us3l1ndon4tte1o3ve3pl0financial11r1s1t0d0a3u0ndbeck6xe1ury5v1y2ma0drid4if1son4keup4n0agement7go3" +
        "p1rket0ing3s4riott5shalls7ttel5ba2c0kinsey7d1e0d0ia3et2lbourne7me1orial6n0u2rckmsd7g1h1iami3cros" +
        "oft7l1ni1t2t0subishi9k1l0b1s2m0a2n1o0bi0le4da2e1i1m1nash3ey2ster5rmon3tgage6scow4to0rcycles9v0ie" +
        "4p1q1r1s0d2t0n1r2u0seum3ic4v1w1x1y1z2na0b1goya4me2vy3ba2c1e0c1t0bank4flix4work5ustar5w0s2xt0dire" +
        "ct7us4f0l2g0o2hk2i0co2ke1on3nja3ssan1y5l1o0kia3rton4w0ruz3tv4p1r0a1w2tt2u1yc2z2obi1server7ffice5" +
        "kinawa6layan0group9lo3m0ega4ne1g1l0ine5oo2pen3racle3nge4g0anic5igins6saka4tsuka4t2vh3pa0ge2nason" +
        "ic7ris2s1tners4s1y3y2ccw3e0t2f0izer5g1h0armacy6d1ilips5one2to0graphy6s4ysio5ics1tet2ures6d1n0g1k" +
        "2oneer5zza4k1l0ace2y0station9umbing5s3m1n0c2ohl2ker3litie5rn2st3r0axi3ess3ime3o0d0uctions8f1gres" +
        "sive8mo2perties3y5tection8u0dential9s1t1ub2w0c2y2qa1pon3uebec3st5racing4dio4e0ad1lestate6tor2y4c" +
        "ipes5d0stone5umbrella9hab3ise0n3t2liance6n0t0als5pair3ort3ublican8st0aurant8view0s5xroth6ich0ard" +
        "li6oh3l1o1p2o0cks3deo3gers4om3s0vp3u0gby3hr2n2w0e2yukyu6sa0arland6fe0ty4kura4le1on3msclub4ung5nd" +
        "vik0coromant12ofi4p1rl2s1ve2xo3b0i1s2c0b1haeffler7midt4olarships8ol3ule3warz5ience5ot3d1e0arch3t" +
        "2cure1ity6ek2lect4ner3rvices6ven3w1x0y3fr2g1h0angrila6rp3ell3ia1ksha5oes2p0ping5uji3w3i0lk2na1gl" +
        "es5te3j1k0i0n2y0pe4l0ing4m0art3ile4n0cf3o0ccer3ial4ftbank4ware6hu2lar2utions7ng1y2y2pa0ce3ort2t3" +
        "r0l2s1t0ada2ples4r1tebank4farm7c0group6ockholm6rage3e3ream4udio2y3yle4u0cks3pplies3y2ort5rf1gery" +
        "5zuki5v1watch4iss4x1y0dney4stems6z2tab1ipei4lk2obao4rget4tamotors6r2too4x0i3c0i2d0k2eam2ch0nolog" +
        "y8l1masek5nnis4va3f1g1h0d1eater2re6iaa2ckets5enda4ps2res2ol4j0maxx4x2k0maxx5l1m0all4n1o0day3kyo3" +
        "ols3p1ray3shiba5tal3urs3wn2yota3s3r0ade1ing4ining5vel0ers0insurance16ust3v2t1ube2i1nes3shu4v0s2w" +
        "1z2ua1bank3s2g1k1nicom3versity8o2ol2ps2s1y1z2va0cations7na1guard7c1e0gas3ntures6risign5m\u00f6ge" +
        "nsberater2ung14sicherung10t2g1i0ajes4deo3g1king4llas4n1p1rgin4sa1ion4va1o3laanderen9n1odka3lvo3t" +
        "e1ing3o2yage5u2wales2mart4ter4ng0gou5tch0es6eather0channel12bcam3er2site5d0ding5ibo2r3f1hoswho6i" +
        "en2ki2lliamhill9n0dows4e1ners6me2olterskluwer11odside6rk0s2ld3w2s1tc1f3xbox3erox4ihuan4n2xx2yz3y" +
        "achts4hoo3maxun5ndex5e1odobashi7ga2kohama6u0tube6t1un3za0ppos4ra3ero3ip2m1one3uerich6w2"
    /** The internationalized top-level domains, encoded the same way. */
    private const val EncodedUtlds =
        "\u03b5\u03bb1\u03c52\u0431\u04331\u0435\u043b3\u0434\u0435\u0442\u04384\u0435\u044e2\u043a\u0430" +
        "\u0442\u043e\u043b\u0438\u043a6\u043e\u043c3\u043c\u043a\u04342\u043e\u043d1\u0441\u043a\u0432" +
        "\u04306\u043e\u043d\u043b\u0430\u0439\u043d5\u0440\u04333\u0440\u0443\u04412\u04442\u0441\u0430" +
        "\u0439\u04423\u0440\u04313\u0443\u043a\u04403\u049b\u0430\u04373\u0570\u0561\u05753\u05d9\u05e9" +
        "\u05e8\u05d0\u05dc5\u05e7\u05d5\u05dd3\u0627\u0628\u0648\u0638\u0628\u064a5\u0631\u0627\u0645" +
        "\u0643\u06485\u0644\u0627\u0631\u062f\u06464\u0628\u062d\u0631\u064a\u06465\u062c\u0632\u0627" +
        "\u0626\u06315\u0633\u0639\u0648\u062f\u064a\u06296\u0639\u0644\u064a\u0627\u06465\u0645\u063a" +
        "\u0631\u06285\u0645\u0627\u0631\u0627\u062a5\u06cc\u0631\u0627\u06465\u0628\u0627\u0631\u062a2" +
        "\u0632\u0627\u06314\u064a\u062a\u06433\u06be\u0627\u0631\u062a5\u062a\u0648\u0646\u06334\u0633" +
        "\u0648\u062f\u0627\u06463\u0631\u064a\u06295\u0634\u0628\u0643\u06294\u0639\u0631\u0627\u06422" +
        "\u06282\u0645\u0627\u06464\u0641\u0644\u0633\u0637\u064a\u06466\u0642\u0637\u06313\u0643\u0627" +
        "\u062b\u0648\u0644\u064a\u06436\u0648\u06453\u0645\u0635\u06312\u0644\u064a\u0633\u064a\u06275" +
        "\u0648\u0631\u064a\u062a\u0627\u0646\u064a\u06277\u0642\u06394\u0647\u0645\u0631\u0627\u06475" +
        "\u067e\u0627\u06a9\u0633\u062a\u0627\u06467\u0680\u0627\u0631\u062a4\u0915\u0949\u092e3\u0928" +
        "\u0947\u091f3\u092d\u093e\u0930\u09240\u092e\u094d3\u094b\u09245\u0938\u0902\u0917\u0920\u09285" +
        "\u09ac\u09be\u0982\u09b2\u09be5\u09ad\u09be\u09b0\u09a42\u09f0\u09a44\u0a2d\u0a3e\u0a30\u0a244" +
        "\u0aad\u0abe\u0ab0\u0aa44\u0b2d\u0b3e\u0b30\u0b244\u0b87\u0ba8\u0bcd\u0ba4\u0bbf\u0baf\u0bbe6" +
        "\u0bb2\u0b99\u0bcd\u0b95\u0bc86\u0b9a\u0bbf\u0b99\u0bcd\u0b95\u0baa\u0bcd\u0baa\u0bc2\u0bb0" +
        "\u0bcd11\u0c2d\u0c3e\u0c30\u0c24\u0c4d5\u0cad\u0cbe\u0cb0\u0ca44\u0d2d\u0d3e\u0d30\u0d24\u0d025" +
        "\u0dbd\u0d82\u0d9a\u0dcf4\u0e04\u0e2d\u0e213\u0e44\u0e17\u0e223\u0ea5\u0eb2\u0ea73\u10d2\u10d42" +
        "\u307f\u3093\u306a3\u30a2\u30de\u30be\u30f34\u30af\u30e9\u30a6\u30c94\u30b0\u30fc\u30b0\u30eb4" +
        "\u30b3\u30e02\u30b9\u30c8\u30a23\u30bb\u30fc\u30eb3\u30d5\u30a1\u30c3\u30b7\u30e7\u30f36\u30dd" +
        "\u30a4\u30f3\u30c84\u4e16\u754c2\u4e2d\u4fe11\u56fd1\u570b1\u6587\u7f513\u4e9a\u9a6c\u900a3" +
        "\u4f01\u4e1a2\u4f5b\u5c712\u4fe1\u606f2\u5065\u5eb72\u516b\u53662\u516c\u53f81\u76ca2\u53f0" +
        "\u6e7e1\u70632\u5546\u57ce1\u5e971\u68072\u5609\u91cc0\u5927\u9152\u5e975\u5728\u7ebf2\u5927" +
        "\u62ff2\u5929\u4e3b\u65593\u5a31\u4e502\u5bb6\u96fb2\u5e7f\u4e1c2\u5fae\u535a2\u6148\u55842" +
        "\u6211\u7231\u4f603\u624b\u673a2\u62db\u80582\u653f\u52a11\u5e9c2\u65b0\u52a0\u57612\u95fb2" +
        "\u65f6\u5c1a2\u66f8\u7c4d2\u673a\u67842\u6de1\u9a6c\u95213\u6e38\u620f2\u6fb3\u95802\u70b9\u770b" +
        "2\u79fb\u52a82\u7ec4\u7ec7\u673a\u67844\u7f51\u57401\u5e971\u7ad91\u7edc2\u8054\u901a2\u8c37" +
        "\u6b4c2\u8d2d\u72692\u901a\u8ca92\u96c6\u56e22\u96fb\u8a0a\u76c8\u79d14\u98de\u5229\u6d663\u98df" +
        "\u54c12\u9910\u53852\u9999\u683c\u91cc\u62c93\u6e2f2\ub2f7\ub1371\ucef42\uc0bc\uc1312\ud55c" +
        "\uad6d2"
}
