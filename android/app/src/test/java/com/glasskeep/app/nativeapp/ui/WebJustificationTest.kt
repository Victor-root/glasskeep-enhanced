package com.glasskeep.app.nativeapp.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The px each space widens by for a line laid out to the start to reach
 * the edge, lines laid out in a column 100px wide.
 */
class WebJustificationTest {
    private fun line(start: Int, end: Int, visibleEnd: Int, width: Float) = WebJustification.Line(start, end, visibleEnd, width)

    @Test
    fun `a ragged line's spaces share what it lacks, a little short of the edge`() {
        val text = "one two three four five"
        val lines = listOf(line(0, 14, 13, 80f), line(14, 23, 23, 50f))
        assertEquals(mapOf(3 to 9, 7 to 10), WebJustification.spacing(text, lines, 100f))
        assertEquals(mapOf(3 to 10, 7 to 10), WebJustification.spacing(text, listOf(line(0, 14, 13, 79.5f), lines[1]), 100f))
    }

    @Test
    fun `what a line lacks beyond whole spaces spreads along it`() {
        val text = "a b c d e f"
        val lines = listOf(line(0, 10, 9, 94f), line(10, 11, 11, 5f))
        assertEquals(mapOf(1 to 1, 3 to 1, 5 to 1, 7 to 2), WebJustification.spacing(text, lines, 100f))
    }

    @Test
    fun `a no-break space widens as the WebView widens it`() {
        val text = "Ah\u00A0! Oh\u00A0? fin"
        val lines = listOf(line(0, 10, 9, 90f), line(10, 13, 13, 20f))
        assertEquals(mapOf(2 to 3, 4 to 3, 7 to 3), WebJustification.spacing(text, lines, 100f))
    }

    @Test
    fun `lines reaching the edge, the last one and those a forced break ends stay as they are`() {
        val text = "one two\nthree four five six"
        val lines = listOf(line(0, 8, 7, 40f), line(8, 19, 18, 100f), line(19, 27, 27, 30f))
        assertEquals(emptyMap<Int, Int>(), WebJustification.spacing(text, lines, 100f))
    }

    @Test
    fun `a line without spaces between its words, or lacking less than a px, stays as it is`() {
        val text = "abcdef   gh ij kl"
        val lines = listOf(line(0, 9, 6, 60f), line(9, 15, 14, 99.2f), line(15, 17, 17, 20f))
        assertEquals(emptyMap<Int, Int>(), WebJustification.spacing(text, lines, 100f))
    }
}
