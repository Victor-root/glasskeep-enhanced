package com.glasskeep.app.nativeapp.data

/** A phone number or an e-mail address found in plain text, the character
 *  range it covers and the URI a tap on it opens. */
data class ContactLink(val start: Int, val end: Int, val uri: String)

/**
 * linkifyContacts (markdown.jsx): the web turns phone numbers (North
 * American and French formats) and e-mail addresses of plain text into
 * `tel:` / `mailto:` links, the number dialled without its separators.
 * Web addresses are deliberately left alone.
 */
object ContactLinks {
    private const val PHONE =
        "(?:\\+1[\\s.-]?)?\\(\\d{3}\\)[\\s.-]?\\d{3}[\\s.-]?\\d{4}" +
            "|(?:\\+1[\\s.-]?)?\\d{3}[\\s.-]\\d{3}[\\s.-]\\d{4}" +
            "|\\+33[\\s.-]?\\d[\\s.-]?\\d{2}[\\s.-]?\\d{2}[\\s.-]?\\d{2}[\\s.-]?\\d{2}" +
            "|0\\d[\\s.-]?\\d{2}[\\s.-]?\\d{2}[\\s.-]?\\d{2}[\\s.-]?\\d{2}"
    private const val EMAIL = "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
    private val combined = Regex("($PHONE)|($EMAIL)")
    private val phoneSeparators = Regex("[\\s.()-]")

    fun find(text: String): List<ContactLink> = combined.findAll(text).map { match ->
        val uri = if (match.groups[1] != null) {
            "tel:" + match.value.replace(phoneSeparators, "")
        } else {
            "mailto:" + match.value
        }
        ContactLink(match.range.first, match.range.last + 1, uri)
    }.toList()
}
