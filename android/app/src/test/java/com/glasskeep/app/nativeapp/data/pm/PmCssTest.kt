package com.glasskeep.app.nativeapp.data.pm

import com.glasskeep.app.nativeapp.data.CssColors
import org.junit.Assert.assertEquals
import org.junit.Test

/** Inline styles as Chrome's CSSStyleDeclaration read them, value for
 *  value (measured with getPropertyValue() in a standards-mode document). */
class PmCssTest {
    private fun read(style: String, property: String) = PmCssStyle.parse(style).getPropertyValue(property)

    @Test
    fun textDecorationIsReadFromItsShorthandOrAllFourLonghands() {
        val cases = listOf(
            "text-decoration: underline" to "underline",
            "text-decoration: underline wavy red" to "underline wavy red",
            "text-decoration: line-through underline" to "underline line-through",
            "text-decoration: none" to "none",
            "text-decoration: UNDERLINE Dotted #F00" to "underline dotted rgb(255, 0, 0)",
            "text-decoration: underline 2px" to "underline 2px",
            "text-decoration: initial" to "initial",
            "text-decoration: inherit" to "inherit",
            "text-decoration-line: underline" to "",
            "text-decoration-line: underline; text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;" to "underline",
            "text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;" to "",
        )
        for ((style, expected) in cases) assertEquals(style, expected, read(style, "text-decoration"))
        assertEquals("initial", read("text-decoration: underline", "text-decoration-style"))
        assertEquals("wavy", read("text-decoration: underline wavy red", "text-decoration-style"))
        assertEquals("red", read("text-decoration: underline wavy red", "text-decoration-color"))
    }

    @Test
    fun fontLonghandsAndTheFontShorthand() {
        val cases = listOf(
            Triple("font-weight: BOLD", "font-weight", "bold"),
            Triple("font-weight: 700.0", "font-weight", "700"),
            Triple("font-weight: 1001", "font-weight", ""),
            Triple("font-weight: 550", "font-weight", "550"),
            Triple("font-weight: bolder", "font-weight", "bolder"),
            Triple("font-style: Italic", "font-style", "italic"),
            Triple("font-style: oblique 10deg", "font-style", "oblique 10deg"),
            Triple("font: italic bold 12px/30px Georgia, serif", "font-weight", "bold"),
            Triple("font: italic bold 12px/30px Georgia, serif", "font-style", "italic"),
            Triple("font: italic bold 12px/30px Georgia, serif", "font-size", "12px"),
            Triple("font: italic bold 12px/30px Georgia, serif", "font-family", "Georgia, serif"),
            Triple("font: 12pt Arial", "font-weight", "normal"),
            Triple("font: 12pt Arial", "font-style", "normal"),
            Triple("font: bold 11.0pt 'Segoe UI'", "font-size", "11pt"),
            Triple("font: bold 11.0pt 'Segoe UI'", "font-family", "\"Segoe UI\""),
            Triple("font-family: 'Segoe UI', Arial,sans-serif", "font-family", "\"Segoe UI\", Arial, sans-serif"),
            Triple("font-family: Times  New   Roman", "font-family", "\"Times New Roman\""),
            Triple("font-family: 'It''s'", "font-family", ""),
            Triple("font-family: Arial !important", "font-family", "Arial"),
            Triple("font-family: \"Arial\"", "font-family", "Arial"),
            Triple("font-family: 'serif'", "font-family", "\"serif\""),
            Triple("font-family: -apple-system, BlinkMacSystemFont", "font-family", "-apple-system, BlinkMacSystemFont"),
            Triple("font-family: 12px", "font-family", ""),
            Triple("font-size: 12.0pt", "font-size", "12pt"),
            Triple("font-size: .5em", "font-size", "0.5em"),
            Triple("font-size: 14PX", "font-size", "14px"),
            Triple("font-size: 110%", "font-size", "110%"),
            Triple("font-size: 0", "font-size", "0px"),
            Triple("font-size: 12", "font-size", ""),
            Triple("font-size: 1.50E1px", "font-size", "15px"),
            Triple("font-size: -3px", "font-size", ""),
            Triple("font-size: 9.999999px", "font-size", "10px"),
            Triple("font-size: calc(1em + 2px)", "font-size", "calc(1em + 2px)"),
        )
        for ((style, property, expected) in cases) assertEquals("$style / $property", expected, read(style, property))
    }

    @Test
    fun coloursAreSerializedAsChromeDoes() {
        val cases = listOf(
            "#F00" to "rgb(255, 0, 0)",
            "#ff000080" to "rgba(255, 0, 0, 0.5)",
            "RED" to "red",
            "rgb(1,2,3)" to "rgb(1, 2, 3)",
            "rgba(1,2,3,1)" to "rgb(1, 2, 3)",
            "rgba(1,2,3,.5)" to "rgba(1, 2, 3, 0.5)",
            "hsl(120, 100%, 50%)" to "rgb(0, 255, 0)",
            "windowtext" to "windowtext",
            "var(--x)" to "var(--x)",
            "transparent" to "transparent",
            "rgb(300, -5, 12.6)" to "rgb(255, 0, 13)",
            "rgb(10% 20% 30%)" to "rgb(26, 51, 77)",
            "CurrentColor" to "currentcolor",
            "hsla(0,100%,50%,0.25)" to "rgba(255, 0, 0, 0.25)",
            "rgb(255 0 0 / 50%)" to "rgba(255, 0, 0, 0.5)",
        )
        for ((value, expected) in cases) assertEquals(value, expected, read("color: $value", "color"))
        assertEquals("blue", read("color: #abc; color: blue", "color"))
        assertEquals("red", read("color:red;color:bogus", "color"))
        assertEquals("yellow", read("background: yellow", "background-color"))
        assertEquals("rgb(0, 255, 0)", read("background: #00ff00 url(x.png)", "background-color"))
        assertEquals(CssColors.Rgba(26, 51, 77), CssColors.parse("rgb(10% 20% 30%)"))
    }

    @Test
    fun keywordsAndUnknownProperties() {
        assertEquals("sub", read("vertical-align: SUB", "vertical-align"))
        assertEquals("center", read("text-align: CENTER", "text-align"))
        assertEquals("-webkit-center", read("text-align: -webkit-center", "text-align"))
        assertEquals("pre-wrap", read("white-space: pre-wrap", "white-space"))
        assertEquals("", read("mso-bidi-font-weight: bold", "font-weight"))
        assertEquals("italic", read("font-weight:bold;;font-style:italic", "font-style"))
    }
}
