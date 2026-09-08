package com.glasskeep.app.nativeapp.ui

import androidx.compose.ui.graphics.Color

/**
 * Same 12 note swatches as src/utils/colors.js (LIGHT_COLORS / DARK_COLORS),
 * ported value for value so a note looks the same color natively as it
 * does in the web app. Keep the two files in sync if a swatch changes.
 */
private data class Swatch(val r: Int, val g: Int, val b: Int, val a: Float)

private val LIGHT: Map<String, Swatch> = mapOf(
    "default" to Swatch(255, 255, 255, 0.85f),
    "red" to Swatch(242, 139, 130, 0.85f),
    "yellow" to Swatch(255, 214, 51, 0.85f),
    "green" to Swatch(124, 233, 157, 0.85f),
    "blue" to Swatch(120, 180, 255, 0.85f),
    "purple" to Swatch(180, 160, 255, 0.85f),
    "peach" to Swatch(249, 160, 140, 0.85f),
    "sage" to Swatch(167, 205, 170, 0.85f),
    "mint" to Swatch(140, 225, 190, 0.85f),
    "sky" to Swatch(150, 210, 255, 0.85f),
    "sand" to Swatch(230, 200, 150, 0.85f),
    "mauve" to Swatch(210, 175, 218, 0.85f),
)

private val DARK: Map<String, Swatch> = mapOf(
    "default" to Swatch(40, 40, 40, 0.85f),
    "red" to Swatch(140, 36, 36, 0.85f),
    "yellow" to Swatch(140, 110, 25, 0.85f),
    "green" to Swatch(28, 110, 58, 0.85f),
    "blue" to Swatch(35, 72, 165, 0.85f),
    "purple" to Swatch(82, 38, 140, 0.85f),
    "peach" to Swatch(170, 80, 62, 0.85f),
    "sage" to Swatch(55, 90, 65, 0.85f),
    "mint" to Swatch(35, 108, 82, 0.85f),
    "sky" to Swatch(35, 95, 145, 0.85f),
    "sand" to Swatch(135, 105, 60, 0.85f),
    "mauve" to Swatch(100, 72, 115, 0.85f),
)

fun noteColorFor(colorKey: String?, dark: Boolean): Color {
    val table = if (dark) DARK else LIGHT
    val swatch = table[colorKey?.trim()?.lowercase()] ?: table.getValue("default")
    return Color(swatch.r / 255f, swatch.g / 255f, swatch.b / 255f, swatch.a)
}
