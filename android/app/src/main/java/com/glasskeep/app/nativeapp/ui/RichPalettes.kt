package com.glasskeep.app.nativeapp.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

/**
 * Every palette and list the rich-text toolbar offers, ported value for
 * value from RichTextToolbar.jsx:68-140 so a colour picked on the phone
 * is byte-identical to the same colour picked in the browser.
 */

/** PRESET_TEXT_COLORS: 12 swatches, two rows of six. */
val RichTextColors = listOf(
    "#111827", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b", "#ffffff",
)

/**
 * PRESET_HIGHLIGHTS: 8 named slots. The mark stores the `var(--rt-hl-N)`
 * REFERENCE, not a hex, so a highlight picked in dark mode re-resolves to
 * its light-mode equivalent when the theme flips (globalCSS.js:2869-2876
 * light, 2890-2897 dark) instead of staying an unreadable dark brown on
 * white. [richColorOf] is what does that resolution here.
 */
val RichHighlights = (1..8).map { "var(--rt-hl-$it)" }

private val HighlightLight = listOf(
    0xFFFDE047, 0xFFFDBA74, 0xFFFCA5A5, 0xFFF9A8D4,
    0xFFC4B5FD, 0xFF93C5FD, 0xFF86EFAC, 0xFFD1D5DB,
)

private val HighlightDark = listOf(
    0xFFB45309, 0xFFC2410C, 0xFFB91C1C, 0xFFBE185D,
    0xFF6D28D9, 0xFF1D4ED8, 0xFF047857, 0xFF4B5563,
)

/** PRESET_UNDERLINE_COLORS: 8 swatches for the underline popover. */
val RichUnderlineColors = listOf(
    "#111827", "#ef4444", "#f59e0b", "#22c55e",
    "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
)

/** UNDERLINE_STYLES, in the popover's own order. */
val RichUnderlineStyles = listOf("simple", "double", "dotted", "dashed", "wavy")

/** FONT_SIZES + DEFAULT_FONT_SIZE. Picking the default one unsets the
 *  mark rather than writing "16px" into the document. */
val RichFontSizes = listOf("12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px")
const val RichDefaultFontSize = "16px"

/**
 * One entry of the font popover. [value] is the exact CSS font stack the
 * web writes into the document, kept verbatim so a note round-trips
 * between the two clients unchanged.
 *
 * [family] is what Compose actually paints with. The web vendors all 28
 * webfonts through @fontsource; a phone has none of them installed, and
 * bundling them would mean carrying megabytes of font files in the APK
 * or fetching them from Google's servers at runtime, which this project
 * deliberately avoids (see the WorkManager/ML Kit notes in build.gradle.kts
 * on staying Play-Services-free). So the choice itself is fully supported
 * (listed, applied, stored, round-tripped, shown as active in the
 * toolbar) and rendered with the closest family Android ships: the stack's
 * own final fallback, which is exactly what a browser without the webfont
 * would do too.
 */
data class RichFontOption(val label: String, val value: String, val family: FontFamily)

val RichFonts = listOf(
    RichFontOption("Sans", "", FontFamily.Default),
    RichFontOption("Inter", "Inter, sans-serif", FontFamily.SansSerif),
    RichFontOption("Roboto", "Roboto, sans-serif", FontFamily.SansSerif),
    RichFontOption("Open Sans", "\"Open Sans\", sans-serif", FontFamily.SansSerif),
    RichFontOption("Lato", "Lato, sans-serif", FontFamily.SansSerif),
    RichFontOption("Source Sans", "\"Source Sans 3\", sans-serif", FontFamily.SansSerif),
    RichFontOption("Noto Sans", "\"Noto Sans\", sans-serif", FontFamily.SansSerif),
    RichFontOption("Nunito", "Nunito, sans-serif", FontFamily.SansSerif),
    RichFontOption("Poppins", "Poppins, sans-serif", FontFamily.SansSerif),
    RichFontOption("Montserrat", "Montserrat, sans-serif", FontFamily.SansSerif),
    RichFontOption("Raleway", "Raleway, sans-serif", FontFamily.SansSerif),
    RichFontOption("Work Sans", "\"Work Sans\", sans-serif", FontFamily.SansSerif),
    RichFontOption("Ubuntu", "Ubuntu, sans-serif", FontFamily.SansSerif),
    RichFontOption("Merriweather", "Merriweather, serif", FontFamily.Serif),
    RichFontOption("Lora", "Lora, serif", FontFamily.Serif),
    RichFontOption("PT Serif", "\"PT Serif\", serif", FontFamily.Serif),
    RichFontOption("Playfair Display", "\"Playfair Display\", serif", FontFamily.Serif),
    RichFontOption("EB Garamond", "\"EB Garamond\", serif", FontFamily.Serif),
    RichFontOption("Source Serif", "\"Source Serif 4\", serif", FontFamily.Serif),
    RichFontOption("JetBrains Mono", "\"JetBrains Mono\", monospace", FontFamily.Monospace),
    RichFontOption("Fira Code", "\"Fira Code\", monospace", FontFamily.Monospace),
    RichFontOption("Source Code Pro", "\"Source Code Pro\", monospace", FontFamily.Monospace),
    RichFontOption("IBM Plex Mono", "\"IBM Plex Mono\", monospace", FontFamily.Monospace),
    RichFontOption("Roboto Mono", "\"Roboto Mono\", monospace", FontFamily.Monospace),
    RichFontOption("Bebas Neue", "\"Bebas Neue\", sans-serif", FontFamily.SansSerif),
    RichFontOption("Oswald", "Oswald, sans-serif", FontFamily.SansSerif),
    RichFontOption("Pacifico", "Pacifico, cursive", FontFamily.Cursive),
    RichFontOption("Dancing Script", "\"Dancing Script\", cursive", FontFamily.Cursive),
    RichFontOption("Caveat", "Caveat, cursive", FontFamily.Cursive),
)

fun richFontFor(value: String?): RichFontOption? =
    value?.takeIf { it.isNotBlank() }?.let { v -> RichFonts.firstOrNull { it.value == v } }

/** "18px" -> 18f. Anything else (an em value, a bare number) is ignored
 *  rather than guessed at. */
fun richFontSizeOf(value: String?): Float? =
    value?.trim()?.removeSuffix("px")?.trim()?.toFloatOrNull()

/**
 * Resolves any colour string a mark can carry: one of the eight highlight
 * slots, or a plain CSS hex (#rgb, #rrggbb, #rrggbbaa). Returns null for
 * anything else, so a caller can fall back to the inherited colour rather
 * than paint something wrong.
 */
fun richColorOf(value: String?, dark: Boolean): Color? {
    val raw = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val slot = HighlightSlotRegex.matchEntire(raw)?.groupValues?.get(1)?.toIntOrNull()
    if (slot != null && slot in 1..8) {
        return Color((if (dark) HighlightDark else HighlightLight)[slot - 1])
    }
    return parseHexColor(raw)
}

private val HighlightSlotRegex = Regex("""var\(\s*--rt-hl-(\d)\s*\)""")

private fun parseHexColor(raw: String): Color? {
    if (!raw.startsWith("#")) return null
    val hex = raw.substring(1)
    val expanded = when (hex.length) {
        3 -> hex.map { "$it$it" }.joinToString("") + "ff"
        4 -> hex.map { "$it$it" }.joinToString("")
        6 -> hex + "ff"
        8 -> hex
        else -> return null
    }
    val value = expanded.toLongOrNull(16) ?: return null
    val r = ((value shr 24) and 0xFF).toInt()
    val g = ((value shr 16) and 0xFF).toInt()
    val b = ((value shr 8) and 0xFF).toInt()
    val a = (value and 0xFF).toInt()
    return Color(red = r, green = g, blue = b, alpha = a)
}
