package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Test

/** Phone numbers and e-mail addresses linked the way markdown.jsx's
 *  linkifyContacts and linkifyContactsHTML link them. */
class ContactLinksTest {
    @Test
    fun aFrenchNumberWrittenWithNoBreakSpacesIsDialledWithoutThem() {
        val found = ContactLinks.find("Call 06 12 34 56 78 or write a.b@c.fr")

        assertEquals(listOf("tel:0612345678", "mailto:a.b@c.fr"), found.map { it.uri })
        assertEquals(5, found.first().start)
    }

    @Test
    fun theReadingViewLinksTheContactsOfAParagraphButNotOfACodeBlock() {
        val text = "0612345678"
        val paragraph = RichDoc.newBlock().copy(text = text)

        assertEquals(listOf(RichMark(0, 10, RichMarkType.LINK, "tel:0612345678")), RichDoc.contactLinks(paragraph))
        assertEquals(emptyList<RichMark>(), RichDoc.contactLinks(paragraph.copy(kind = RichBlockKind.CODE_BLOCK)))
    }

    @Test
    fun inlineCodeAndLinksAreLeftAlone() {
        val block = RichDoc.newBlock().copy(
            text = "0612345678 0698765432",
            marks = listOf(RichMark(0, 10, RichMarkType.CODE)),
        )

        assertEquals(listOf("tel:0698765432"), RichDoc.contactLinks(block).map { it.value })
    }
}
