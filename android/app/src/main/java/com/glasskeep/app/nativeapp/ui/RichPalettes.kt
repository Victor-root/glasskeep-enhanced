package com.glasskeep.app.nativeapp.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.glasskeep.app.R

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
 * [family] is what Compose paints with: the very files the web vendors
 * through @fontsource (their latin subset, in res/font as TTF), in the
 * weights src/main.jsx loads. Any other weight takes the nearest one and
 * italics are synthesised, as the browser does with those same files.
 */
data class RichFontOption(val label: String, val value: String, val family: FontFamily)

private fun webFont(vararg weights: Pair<Int, Int>): FontFamily =
    FontFamily(weights.map { (resource, weight) -> Font(resource, FontWeight(weight)) })

val RichFonts = listOf(
    RichFontOption("Sans", "", FontFamily.Default),
    RichFontOption("Inter", "Inter, sans-serif", webFont(R.font.rich_inter_400 to 400, R.font.rich_inter_700 to 700)),
    RichFontOption("Roboto", "Roboto, sans-serif", webFont(R.font.rich_roboto_400 to 400, R.font.rich_roboto_700 to 700)),
    RichFontOption("Open Sans", "\"Open Sans\", sans-serif", webFont(R.font.rich_open_sans_400 to 400, R.font.rich_open_sans_700 to 700)),
    RichFontOption("Lato", "Lato, sans-serif", webFont(R.font.rich_lato_400 to 400, R.font.rich_lato_700 to 700)),
    RichFontOption("Source Sans", "\"Source Sans 3\", sans-serif", webFont(R.font.rich_source_sans_3_400 to 400, R.font.rich_source_sans_3_700 to 700)),
    RichFontOption("Noto Sans", "\"Noto Sans\", sans-serif", webFont(R.font.rich_noto_sans_400 to 400, R.font.rich_noto_sans_700 to 700)),
    RichFontOption("Nunito", "Nunito, sans-serif", webFont(R.font.rich_nunito_400 to 400, R.font.rich_nunito_700 to 700)),
    RichFontOption("Poppins", "Poppins, sans-serif", webFont(R.font.rich_poppins_400 to 400, R.font.rich_poppins_700 to 700)),
    RichFontOption("Montserrat", "Montserrat, sans-serif", webFont(R.font.rich_montserrat_400 to 400, R.font.rich_montserrat_700 to 700)),
    RichFontOption("Raleway", "Raleway, sans-serif", webFont(R.font.rich_raleway_400 to 400, R.font.rich_raleway_700 to 700)),
    RichFontOption("Work Sans", "\"Work Sans\", sans-serif", webFont(R.font.rich_work_sans_400 to 400, R.font.rich_work_sans_700 to 700)),
    RichFontOption(
        "Ubuntu",
        "Ubuntu, sans-serif",
        webFont(R.font.rich_ubuntu_400 to 400, R.font.rich_ubuntu_500 to 500, R.font.rich_ubuntu_700 to 700),
    ),
    RichFontOption("Merriweather", "Merriweather, serif", webFont(R.font.rich_merriweather_400 to 400, R.font.rich_merriweather_700 to 700)),
    RichFontOption("Lora", "Lora, serif", webFont(R.font.rich_lora_400 to 400, R.font.rich_lora_700 to 700)),
    RichFontOption("PT Serif", "\"PT Serif\", serif", webFont(R.font.rich_pt_serif_400 to 400, R.font.rich_pt_serif_700 to 700)),
    RichFontOption(
        "Playfair Display",
        "\"Playfair Display\", serif",
        webFont(R.font.rich_playfair_display_400 to 400, R.font.rich_playfair_display_700 to 700),
    ),
    RichFontOption("EB Garamond", "\"EB Garamond\", serif", webFont(R.font.rich_eb_garamond_400 to 400, R.font.rich_eb_garamond_700 to 700)),
    RichFontOption("Source Serif", "\"Source Serif 4\", serif", webFont(R.font.rich_source_serif_4_400 to 400, R.font.rich_source_serif_4_700 to 700)),
    RichFontOption(
        "JetBrains Mono",
        "\"JetBrains Mono\", monospace",
        webFont(R.font.rich_jetbrains_mono_400 to 400, R.font.rich_jetbrains_mono_700 to 700),
    ),
    RichFontOption("Fira Code", "\"Fira Code\", monospace", webFont(R.font.rich_fira_code_400 to 400, R.font.rich_fira_code_700 to 700)),
    RichFontOption(
        "Source Code Pro",
        "\"Source Code Pro\", monospace",
        webFont(R.font.rich_source_code_pro_400 to 400, R.font.rich_source_code_pro_700 to 700),
    ),
    RichFontOption(
        "IBM Plex Mono",
        "\"IBM Plex Mono\", monospace",
        webFont(R.font.rich_ibm_plex_mono_400 to 400, R.font.rich_ibm_plex_mono_700 to 700),
    ),
    RichFontOption("Roboto Mono", "\"Roboto Mono\", monospace", webFont(R.font.rich_roboto_mono_400 to 400, R.font.rich_roboto_mono_700 to 700)),
    RichFontOption("Bebas Neue", "\"Bebas Neue\", sans-serif", webFont(R.font.rich_bebas_neue_400 to 400)),
    RichFontOption("Oswald", "Oswald, sans-serif", webFont(R.font.rich_oswald_400 to 400, R.font.rich_oswald_700 to 700)),
    RichFontOption("Pacifico", "Pacifico, cursive", webFont(R.font.rich_pacifico_400 to 400)),
    RichFontOption(
        "Dancing Script",
        "\"Dancing Script\", cursive",
        webFont(R.font.rich_dancing_script_400 to 400, R.font.rich_dancing_script_700 to 700),
    ),
    RichFontOption("Caveat", "Caveat, cursive", webFont(R.font.rich_caveat_400 to 400, R.font.rich_caveat_700 to 700)),
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
