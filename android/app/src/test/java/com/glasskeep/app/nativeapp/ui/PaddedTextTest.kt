package com.glasskeep.app.nativeapp.ui

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withLink
import org.junit.Assert.assertEquals
import org.junit.Test

class PaddedTextTest {
    private val pad = PadChar

    @Test
    fun `a code run gets a pad on either side, in the laid-out text only`() {
        val padded = PaddedText.of(AnnotatedString("ab cd e"), listOf(PaddedRun(3 until 5, CodePadId)))
        assertEquals("ab ${pad}cd$pad e", padded.text.text)
        assertEquals(7, padded.length)
    }

    @Test
    fun `offsets convert both ways around the pads`() {
        val padded = PaddedText.of(AnnotatedString("ab cd e"), listOf(PaddedRun(3 until 5, CodePadId)))
        assertEquals(3, padded.caret(3))
        assertEquals(4, padded.char(3))
        assertEquals(7, padded.caret(5))
        assertEquals(TextRange(4, 6), padded.range(3, 5))
        assertEquals(TextRange(3, 7), padded.box(3, 5))
        assertEquals(3, padded.textOffset(3))
        assertEquals(3, padded.textOffset(4))
        assertEquals(5, padded.textOffset(7))
        assertEquals(7, padded.textOffset(9))
    }

    @Test
    fun `a run starting where another ends keeps each box to its own pads`() {
        val padded = PaddedText.of(AnnotatedString("abcd"), listOf(PaddedRun(0 until 2, CodePadId), PaddedRun(2 until 4, HighlightPadId)))
        assertEquals("${pad}ab$pad${pad}cd$pad", padded.text.text)
        assertEquals(TextRange(0, 4), padded.box(0, 2))
        assertEquals(TextRange(4, 8), padded.box(2, 4))
        assertEquals(TextRange(1, 7), padded.range(0, 4))
    }

    @Test
    fun `text without code is laid out as it is`() {
        val padded = PaddedText.of(AnnotatedString("plain"), emptyList())
        assertEquals("plain", padded.text.text)
        assertEquals(2, padded.caret(2))
        assertEquals(2, padded.textOffset(2))
    }

    @Test
    fun `what makes lines break as the WebView's is laid out, offsets converting around it`() {
        val padded = PaddedText.of(AnnotatedString("a-b/c"), emptyList())
        assertEquals("a-${WebLineBreaks.Break}b/${WebLineBreaks.Join}c", padded.text.text)
        assertEquals(3, padded.caret(2))
        assertEquals(6, padded.caret(4))
        assertEquals(TextRange(0, 7), padded.range(0, 5))
        assertEquals(2, padded.textOffset(3))
        assertEquals(4, padded.textOffset(6))
        assertEquals("a-b/c", PaddedText.unpadded(padded.text))
    }

    @Test
    fun `a break before a run's pads stays out of its box`() {
        val padded = PaddedText.of(AnnotatedString("x-yz"), listOf(PaddedRun(2 until 4, CodePadId)))
        assertEquals("x-${WebLineBreaks.Break}${pad}yz$pad", padded.text.text)
        assertEquals(TextRange(3, 7), padded.box(2, 4))
    }

    @Test
    fun `a link stays one link over what is laid out inside it`() {
        val url = "https://a.example/b-c"
        val padded = PaddedText.of(buildAnnotatedString { withLink(LinkAnnotation.Url(url)) { append(url) } }, emptyList())
        val links = padded.text.getLinkAnnotations(0, padded.text.length).map { it.start to it.end }
        assertEquals(listOf(0 to padded.text.length), links)
    }
}
