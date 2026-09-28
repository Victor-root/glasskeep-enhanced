package com.glasskeep.app.nativeapp.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The characters that make Android break lines where the WebView does,
 * shown as `│` (a break) and `∙` (a joiner). Each case is where Chromium
 * and ICU with Minikin's rules broke apart, on the bench.
 */
class WebLineBreaksTest {
    private fun laid(text: String): String = buildString {
        text.forEachIndexed { index, char ->
            when (WebLineBreaks.between(text, index)) {
                WebLineBreaks.Break -> append('│')
                WebLineBreaks.Join -> append('∙')
            }
            append(char)
        }
    }

    @Test
    fun `a hyphen breaks after it, a slash never`() {
        assertEquals("fix/∙audit-│stability-│bugs", laid("fix/audit-stability-bugs"))
        assertEquals("x -│-│hard", laid("x --hard"))
        assertEquals("2024-│01-│15 et -1", laid("2024-01-15 et -1"))
        assertEquals("peut-│être, c'est-│à-│dire, x -été", laid("peut-être, c'est-à-dire, x -été"))
        assertEquals("2020\u2013│2024", laid("2020\u20132024"))
    }

    @Test
    fun `an address breaks as any other text`() {
        assertEquals("https:∙//∙glasskeep.example.org/∙notes-│2", laid("https://glasskeep.example.org/notes-2"))
        assertEquals("contact∙@example.com", laid("contact@example.com"))
    }

    @Test
    fun `spaces break after them whatever follows`() {
        assertEquals("Ah│ ! Oh│ ? Quoi│ : fin.", laid("Ah ! Oh ? Quoi : fin."))
        assertEquals("«│ Bonjour│ »", laid("« Bonjour »"))
        assertEquals("plain text", laid("plain text"))
    }

    @Test
    fun `ascii punctuation breaks as the WebView's table says`() {
        assertEquals("a=│(b) f(x) a!∙b a|∙b a}∙b C+∙+ What?│Yes", laid("a=(b) f(x) a!b a|b a}b C++ What?Yes"))
    }
}
