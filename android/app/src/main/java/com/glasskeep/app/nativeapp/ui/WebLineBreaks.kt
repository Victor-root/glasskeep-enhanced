package com.glasskeep.app.nativeapp.ui

/**
 * Where the WebView breaks a line and Android does not, or the other way
 * round, and the invisible character that makes Android break as the
 * WebView does there. The WebView is Blink: its own table between two ASCII
 * characters (character_property_data_generator.cc, text_break_iterator.cc),
 * ICU's UAX #14 rules for the rest. Android is ICU's rules too, with
 * Minikin's own on top (WordBreaker.cpp): it never breaks after a hyphen or
 * an en dash, which it leaves to automatic hyphenation, and it breaks an
 * ASCII run holding `://` or `@` the way the Chicago Manual of Style breaks
 * a URL or an e-mail address. So:
 * - after a hyphen Blink breaks before most ASCII, before a digit when the
 *   hyphen follows a letter or digit, and before a letter but after a
 *   word's opening hyphen; after an en dash or U+2010 before a letter, a
 *   digit or a symbol;
 * - between two ASCII characters Blink breaks after `?`, and before `(`,
 *   `<`, `[` and `{` after other punctuation, where ICU does not, and never
 *   after `/`, `!`, `|` or `}` before a letter, a digit or a symbol, nor
 *   between `$`, `%`, `+` and `\` and the punctuation before them, where
 *   ICU does;
 * - a joiner right before `@`, or between `:` and `//`, ends Minikin's
 *   ASCII run first, so an address breaks as any other text.
 */
internal object WebLineBreaks {
    /** ZERO WIDTH SPACE: a line may break after it. */
    const val Break = '\u200B'

    /** WORD JOINER: no line breaks on either side of it. */
    const val Join = '\u2060'

    /** What goes between [text]'s characters `index - 1` and [index] for
     *  Android to break there as the WebView does, or null. */
    fun between(text: CharSequence, index: Int): Char? {
        if (index <= 0 || index >= text.length) return null
        val a = text[index - 1]
        val b = text[index]
        if (b == ' ' && !a.isWhitespace()) return Break.takeIf { keepsSpaces(text, index) }
        if (a.isWhitespace() || b.isWhitespace()) return null
        val before = text.getOrNull(index - 2)
        return when {
            a.isAsciiPrintable() && b.isAsciiPrintable() -> when {
                blinkBreaks(a, b, before) -> Break
                icuBreaks(a, b, text.getOrNull(index + 1)) -> Join
                else -> null
            }
            // ICU's own break after a hyphen, which Minikin drops: before a
            // letter, unless the hyphen opens a segment.
            a == '-' -> Break.takeIf { b.isLetter() && !opensSegment(before) }
            a == EnDash || a == Hyphen -> Break.takeIf { dashBreaks(a, b, before) }
            else -> null
        }
    }

    /** Whether a line may break after [char]: a space, but not a no-break one. */
    fun isBreakingSpace(char: Char): Boolean = char.isWhitespace() && char !in "\u00A0\u2007\u202F"

    private const val EnDash = '\u2013'
    private const val Hyphen = '\u2010'

    /** Whether ICU keeps the spaces from [index] on with what they stand
     *  between, which Blink breaks after whatever follows: closing
     *  punctuation or a closing quote after them, an opening bracket or
     *  quote before them. A break right before the spaces is, to ICU, one
     *  right after them, where they hang at the line's end. */
    private fun keepsSpaces(text: CharSequence, index: Int): Boolean {
        var end = index
        while (end < text.length && text[end] == ' ') end++
        val after = text.getOrNull(end) ?: return false
        val before = text[index - 1]
        return after in "!),./:;?]}" || after.category == CharCategory.FINAL_QUOTE_PUNCTUATION ||
            before in "([{" || before.category == CharCategory.INITIAL_QUOTE_PUNCTUATION
    }

    /** Whether a hyphen after [before] opens a segment, a line able to
     *  break right before it: at the start, after a breaking space, or
     *  after `-` or `?`. ICU keeps such a hyphen with the letter after it. */
    private fun opensSegment(before: Char?): Boolean =
        before == null || isBreakingSpace(before) || before == '-' || before == '?'

    private fun Char.isAsciiPrintable() = this in '!'..'~'

    private fun Char.isAsciiLetterOrDigit() = this in 'a'..'z' || this in 'A'..'Z' || this in '0'..'9'

    /** Blink's table between two printable ASCII characters (FillAscii, its
     *  last rules first), and its hyphen before a digit, a minus sign unless
     *  a letter or digit comes [before] it (ShouldBreakFast). */
    private fun blinkBreaks(a: Char, b: Char, before: Char?): Boolean = when {
        a.isAsciiLetterOrDigit() || a in "$'(/<@[^_`{" -> false
        b in "!),./:;?]}" -> false
        a == '?' && (b == '"' || b == '\'') -> false
        a == '-' && b == '$' -> false
        a == '-' && b in '0'..'9' -> before?.isAsciiLetterOrDigit() == true
        a == '-' || a == '?' -> true
        else -> b in "(<[{"
    }

    /** Where ICU, or Minikin's address rules, would break between two
     *  printable ASCII characters that Blink keeps together; [after]
     *  follows [b]. */
    private fun icuBreaks(a: Char, b: Char, after: Char?): Boolean = when {
        a in "!|}" -> b.isAsciiLetterOrDigit() || b in "#$%&*+=>@\\^_`~"
        a == '/' -> b.isAsciiLetterOrDigit() || b in "#$%&(*+<=>@[\\^_`{~"
        b in "$%+\\" -> a in "$%)+,.:;\\]"
        a == '$' -> b in "([{"
        else -> b == '@' || a == ':' && b == '/' && after == '/'
    }

    /** ICU's break after an en dash or U+2010, before a letter, a digit or
     *  a symbol; a U+2010 opening a segment stays with the letter or symbol
     *  after it. */
    private fun dashBreaks(dash: Char, b: Char, before: Char?): Boolean {
        val letterLike = b.isLetter() || b in "#&*<=>@^_`~"
        if (!letterLike && !b.isDigit() && b !in "$%(+[\\{") return false
        return dash == EnDash || !letterLike || !opensSegment(before)
    }
}
