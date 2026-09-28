package com.glasskeep.app.nativeapp.ui

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextRange
import org.junit.Assert.assertEquals
import org.junit.Test

class PaddedTextTest {
    private val pad = CodePadChar

    @Test
    fun `a code run gets a pad on either side, in the laid-out text only`() {
        val padded = PaddedText.of(AnnotatedString("ab cd e"), listOf(3 until 5))
        assertEquals("ab ${pad}cd$pad e", padded.text.text)
        assertEquals(7, padded.length)
    }

    @Test
    fun `offsets convert both ways around the pads`() {
        val padded = PaddedText.of(AnnotatedString("ab cd e"), listOf(3 until 5))
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
        val padded = PaddedText.of(AnnotatedString("abcd"), listOf(0 until 2, 2 until 4))
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
}
