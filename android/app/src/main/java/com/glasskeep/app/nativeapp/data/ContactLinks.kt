package com.glasskeep.app.nativeapp.data

/** A phone number or an e-mail address found in plain text, the character
 *  range it covers and the URI a tap on it opens. */
data class ContactLink(val start: Int, val end: Int, val uri: String)

/**
 * linkifyContacts (markdown.jsx): the web turns phone numbers (North
 * American and French formats) and e-mail addresses of plain text into
 * `tel:` / `mailto:` links, the number dialled without its separators. Its
 * `\s` is JavaScript's, which also matches the no-break spaces a French
 * number is often written with ([RichDoc.JsSpace]). Web addresses are
 * deliberately left alone.
 */
object ContactLinks {
    private const val Space = RichDoc.JsSpace
    private const val PHONE =
        "(?:\\+1[$Space.-]?)?\\(\\d{3}\\)[$Space.-]?\\d{3}[$Space.-]?\\d{4}" +
            "|(?:\\+1[$Space.-]?)?\\d{3}[$Space.-]\\d{3}[$Space.-]\\d{4}" +
            "|\\+33[$Space.-]?\\d[$Space.-]?\\d{2}[$Space.-]?\\d{2}[$Space.-]?\\d{2}[$Space.-]?\\d{2}" +
            "|0\\d[$Space.-]?\\d{2}[$Space.-]?\\d{2}[$Space.-]?\\d{2}[$Space.-]?\\d{2}"
    private const val EMAIL = "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
    private val combined = Regex("($PHONE)|($EMAIL)")
    private val phoneSeparators = Regex("[$Space.()-]")

    fun find(text: String): List<ContactLink> = combined.findAll(text).map { match ->
        val uri = if (match.groups[1] != null) {
            "tel:" + match.value.replace(phoneSeparators, "")
        } else {
            "mailto:" + match.value
        }
        ContactLink(match.range.first, match.range.last + 1, uri)
    }.toList()
}
