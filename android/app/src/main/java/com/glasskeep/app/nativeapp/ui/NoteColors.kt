package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.glasskeep.app.R

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

/** Same order as COLOR_ORDER in src/utils/colors.js, for the color picker. */
val NOTE_COLOR_ORDER = listOf(
    "default", "red", "yellow", "green", "blue", "purple",
    "peach", "sage", "mint", "sky", "sand", "mauve",
)

/**
 * audioAccentColor() from src/utils/colors.js: the one colour the whole
 * audio interface is tinted with. A note with no colour of its own gets
 * violet; otherwise the note's own swatch is lightened by 55% in dark
 * mode and darkened to 45% in light mode, because in dark mode the note
 * colour IS the background and reusing it as-is made every button
 * disappear.
 */
fun audioAccentColor(colorKey: String?, dark: Boolean): Color {
    val key = colorKey?.trim()?.lowercase()
    if (key.isNullOrEmpty() || key == "default") {
        return if (dark) Color(0xFFA78BFA) else Color(0xFF7C3AED)
    }
    val base = noteColorFor(key, dark)
    return if (dark) {
        Color(
            red = base.red + (1f - base.red) * 0.55f,
            green = base.green + (1f - base.green) * 0.55f,
            blue = base.blue + (1f - base.blue) * 0.55f,
        )
    } else {
        Color(red = base.red * 0.45f, green = base.green * 0.45f, blue = base.blue * 0.45f)
    }
}

/** trColorName() from src/utils/colors.js: the translated swatch name,
 *  which the picker uses as each dot's label. */
@Composable
fun noteColorName(colorKey: String): String = stringResource(
    when (colorKey) {
        "red" -> R.string.native_note_color_red
        "yellow" -> R.string.native_note_color_yellow
        "green" -> R.string.native_note_color_green
        "blue" -> R.string.native_note_color_blue
        "purple" -> R.string.native_note_color_purple
        "peach" -> R.string.native_note_color_peach
        "sage" -> R.string.native_note_color_sage
        "mint" -> R.string.native_note_color_mint
        "sky" -> R.string.native_note_color_sky
        "sand" -> R.string.native_note_color_sand
        "mauve" -> R.string.native_note_color_mauve
        else -> R.string.native_note_color_default
    },
)

/**
 * modalBgFor() from src/utils/colors.js: the fill an OPEN note uses, which
 * is not the same as the card fill above. Dark mode takes the note color
 * at full opacity; light mode mixes 80% white into it, so an open note is
 * a much paler wash of its own color. The web applies it to the whole
 * modal, its sticky header and the format sheet at once, so the screen
 * reads as one flat color.
 *
 * Kept as an explicit table rather than recomputed from [noteColorFor]:
 * the web's own mix runs on its rgba strings and lands a channel or two
 * away from a naive float mix, and these are the values it actually
 * paints.
 */
private val LIGHT_MODAL: Map<String, Color> = mapOf(
    "default" to Color(0xFFFFFFFF),
    "red" to Color(0xFFFBE4E1),
    "yellow" to Color(0xFFFFF7D1),
    "green" to Color(0xFFE6FBEC),
    "blue" to Color(0xFFE4F0FF),
    "purple" to Color(0xFFF0EBFF),
    "peach" to Color(0xFFFCE9E4),
    "sage" to Color(0xFFF0F7F1),
    "mint" to Color(0xFFE8FAF2),
    "sky" to Color(0xFFEAF6FF),
    "sand" to Color(0xFFFAF3E6),
    "mauve" to Color(0xFFF7F0F9),
)

private val DARK_MODAL: Map<String, Color> = mapOf(
    "default" to Color(0xFF282828),
    "red" to Color(0xFF8C2424),
    "yellow" to Color(0xFF8C6E19),
    "green" to Color(0xFF1C6E3A),
    "blue" to Color(0xFF2348A5),
    "purple" to Color(0xFF52268C),
    "peach" to Color(0xFFAA503E),
    "sage" to Color(0xFF375A41),
    "mint" to Color(0xFF236C52),
    "sky" to Color(0xFF235F91),
    "sand" to Color(0xFF87693C),
    "mauve" to Color(0xFF644873),
)

/**
 * noteColorBtn from NoteModal.jsx:657-659 - what `--note-color` is actually
 * set to, i.e. the code-copy button's own background. NOT the same value
 * as [noteModalBackground]: that one mixes 80% white into a light-mode
 * note for readability, so it would render the button almost invisible
 * against a pastel note. This is the note's raw swatch at full opacity -
 * `solid(bgFor(colorKey, dark))` - so the button reads as a small solid
 * tab of the note's actual color. A colorless note in light mode gets a
 * fixed violet instead of solid white.
 */
fun codeCopyButtonColor(colorKey: String?, dark: Boolean): Color {
    val key = colorKey?.trim()?.lowercase()
    if (!dark && (key.isNullOrEmpty() || key == "default")) return Color(0xFFA78BFA)
    return noteColorFor(key, dark).copy(alpha = 1f)
}

fun noteModalBackground(colorKey: String?, dark: Boolean): Color {
    val table = if (dark) DARK_MODAL else LIGHT_MODAL
    return table[colorKey?.trim()?.lowercase()] ?: table.getValue("default")
}

// The header's own "glass chrome" gradient/border used to be hardcoded here
// to the default GlassKeep theme's colors, with an explicit disclaimer that
// there was no real per-user theme selection yet. Now that one exists (see
// WorkspaceTheme.kt), every call site reads WorkspaceTheme.headerGradient/
// headerBorderColor(themeId, dark) directly instead.
