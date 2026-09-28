package com.glasskeep.app.nativeapp.data

import java.util.Locale
import kotlin.math.roundToInt

/**
 * CSS colours as a browser reads and writes them: the hex, rgb(), hsl()
 * and named forms, serialized back the way CSSOM does (`rgb(r, g, b)`, or
 * `rgba(r, g, b, a)` when not opaque), which is what a colour becomes once
 * it has been through an element's style on the web.
 */
object CssColors {
    /** 8-bit channels. */
    data class Rgba(val red: Int, val green: Int, val blue: Int, val alpha: Int = 255)

    /** The colour [value] names, or null when it is not one with a fixed
     *  value (currentcolor, a system colour, a var() reference...). */
    fun parse(value: String): Rgba? {
        val raw = value.trim().lowercase(Locale.ROOT)
        if (raw.startsWith("#")) return parseHex(raw.substring(1))
        Named[raw]?.let { return it }
        if (raw == "transparent") return Rgba(0, 0, 0, 0)
        val open = raw.indexOf('(')
        if (open <= 0 || !raw.endsWith(")")) return null
        val args = raw.substring(open + 1, raw.length - 1)
        return when (raw.substring(0, open)) {
            "rgb", "rgba" -> parseRgb(args)
            "hsl", "hsla" -> parseHsl(args)
            else -> null
        }
    }

    /** [value] as CSSOM serializes it, or null when it is not a colour. */
    fun normalized(value: String): String? {
        val trimmed = value.trim()
        val raw = trimmed.lowercase(Locale.ROOT)
        if (raw.startsWith("var(")) return trimmed
        if (raw == "transparent" || raw == "currentcolor" || raw in SystemColors) return raw
        if (raw in Named) return raw
        if (raw.startsWith("#") || raw.startsWith("rgb") || raw.startsWith("hsl")) return parse(raw)?.let(::serialize)
        val open = raw.indexOf('(')
        return if (open > 0 && raw.endsWith(")") && raw.substring(0, open) in OtherFunctions) trimmed else null
    }

    fun serialize(color: Rgba): String {
        if (color.alpha == 255) return "rgb(${color.red}, ${color.green}, ${color.blue})"
        return "rgba(${color.red}, ${color.green}, ${color.blue}, ${alphaText(color.alpha)})"
    }

    /** The shortest of two or three decimals that gives the same byte back. */
    private fun alphaText(alpha: Int): String {
        val two = (alpha * 100 / 255.0).roundToInt() / 100.0
        val value = if ((two * 255).roundToInt() == alpha) two else (alpha * 1000 / 255.0).roundToInt() / 1000.0
        return value.toBigDecimal().stripTrailingZeros().toPlainString()
    }

    private fun parseHex(hex: String): Rgba? {
        if (hex.any { it !in '0'..'9' && it !in 'a'..'f' }) return null
        val full = when (hex.length) {
            3, 4 -> hex.map { "$it$it" }.joinToString("")
            6, 8 -> hex
            else -> return null
        }
        fun byte(i: Int) = full.substring(i * 2, i * 2 + 2).toInt(16)
        return Rgba(byte(0), byte(1), byte(2), if (full.length == 8) byte(3) else 255)
    }

    private fun parseRgb(args: String): Rgba? {
        val (channels, alpha) = splitArgs(args) ?: return null
        if (channels.size != 3) return null
        val values = channels.map { token ->
            val percent = token.endsWith("%")
            val number = (if (percent) token.dropLast(1) else token).toDoubleOrNull() ?: return null
            (if (percent) number * 255 / 100 else number).coerceIn(0.0, 255.0).roundToInt()
        }
        return Rgba(values[0], values[1], values[2], alpha ?: 255)
    }

    private fun parseHsl(args: String): Rgba? {
        val (channels, alpha) = splitArgs(args) ?: return null
        if (channels.size != 3) return null
        val hue = hueDegrees(channels[0]) ?: return null
        val saturation = channels[1].removeSuffix("%").toDoubleOrNull()?.coerceIn(0.0, 100.0)?.div(100) ?: return null
        val lightness = channels[2].removeSuffix("%").toDoubleOrNull()?.coerceIn(0.0, 100.0)?.div(100) ?: return null
        val h = ((hue % 360) + 360) % 360 / 360
        val q = if (lightness <= 0.5) lightness * (1 + saturation) else lightness + saturation - lightness * saturation
        val p = 2 * lightness - q
        fun channel(t0: Double): Int {
            val t = if (t0 < 0) t0 + 1 else if (t0 > 1) t0 - 1 else t0
            val v = when {
                t < 1.0 / 6 -> p + (q - p) * 6 * t
                t < 1.0 / 2 -> q
                t < 2.0 / 3 -> p + (q - p) * (2.0 / 3 - t) * 6
                else -> p
            }
            return (v * 255).roundToInt()
        }
        return Rgba(channel(h + 1.0 / 3), channel(h), channel(h - 1.0 / 3), alpha ?: 255)
    }

    private fun hueDegrees(token: String): Double? = when {
        token.endsWith("deg") -> token.dropLast(3).toDoubleOrNull()
        token.endsWith("grad") -> token.dropLast(4).toDoubleOrNull()?.times(0.9)
        token.endsWith("rad") -> token.dropLast(3).toDoubleOrNull()?.let { Math.toDegrees(it) }
        token.endsWith("turn") -> token.dropLast(4).toDoubleOrNull()?.times(360)
        else -> token.toDoubleOrNull()
    }

    /** The three channels and the alpha byte of `a, b, c[, alpha]` or
     *  `a b c[ / alpha]`. */
    private fun splitArgs(args: String): Pair<List<String>, Int?>? {
        val (main, alphaText) = if ('/' in args) {
            args.substringBefore('/') to args.substringAfter('/').trim()
        } else {
            val parts = args.split(',').map { it.trim() }
            if (parts.size == 4) parts.take(3).joinToString(" ") to parts[3] else args.replace(',', ' ') to null
        }
        val channels = main.trim().split(Regex("[\\s,]+")).filter { it.isNotEmpty() }
        val alpha = alphaText?.let { text ->
            val percent = text.endsWith("%")
            val number = (if (percent) text.dropLast(1) else text).toDoubleOrNull() ?: return null
            ((if (percent) number / 100 else number).coerceIn(0.0, 1.0) * 255).roundToInt()
        }
        return channels to alpha
    }

    private val SystemColors = setOf(
        "accentcolor", "accentcolortext", "activetext", "buttonborder", "buttonface", "buttontext", "canvas",
        "canvastext", "field", "fieldtext", "graytext", "highlight", "highlighttext", "linktext", "mark", "marktext",
        "selecteditem", "selecteditemtext", "visitedtext", "activeborder", "activecaption", "appworkspace",
        "background", "buttonhighlight", "buttonshadow", "captiontext", "inactiveborder", "inactivecaption",
        "inactivecaptiontext", "infobackground", "infotext", "menu", "menutext", "scrollbar", "threeddarkshadow",
        "threedface", "threedhighlight", "threedlightshadow", "threedshadow", "window", "windowframe", "windowtext",
    )

    private val OtherFunctions = setOf("hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "light-dark")

    private val Named: Map<String, Rgba> = """
        aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4
        black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887
        cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc
        crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9
        darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f
        darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f
        darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3
        deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222
        floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700
        goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4
        indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5
        lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff
        lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1
        lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899
        lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff
        maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db
        mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc
        mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5
        navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500
        orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee
        palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd
        powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1
        saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d
        silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa
        springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347
        turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00
        yellowgreen 9acd32
    """.trim().split(Regex("\\s+")).chunked(2).associate { (name, hex) -> name to parseHex(hex)!! }
}
