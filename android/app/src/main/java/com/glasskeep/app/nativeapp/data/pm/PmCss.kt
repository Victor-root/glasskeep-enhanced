package com.glasskeep.app.nativeapp.data.pm

import com.glasskeep.app.nativeapp.data.CssColors
import java.math.BigDecimal
import java.math.MathContext
import java.util.Locale

/**
 * An element's inline style as its CSSStyleDeclaration reads it, for the
 * properties the web editor's parse rules look at (font weight, style,
 * size and family, colours, vertical-align, text-align, white-space and
 * text decoration): shorthands spread over their longhands, invalid values
 * dropped, keywords, numbers, colours and family names serialized the way
 * Chrome does. Anything else in the attribute is ignored, which is all a
 * browser's value for it would be used for here.
 */
internal class PmCssStyle private constructor(private val values: Map<String, String>) {
    /** "" when the property is not set, or (for text-decoration) not
     *  serializable from its longhands. */
    fun getPropertyValue(name: String): String =
        if (name == "text-decoration") textDecoration() else values[name].orEmpty()

    val fontWeight get() = getPropertyValue("font-weight")
    val fontStyle get() = getPropertyValue("font-style")
    val fontFamily get() = getPropertyValue("font-family")
    val fontSize get() = getPropertyValue("font-size")
    val color get() = getPropertyValue("color")
    val backgroundColor get() = getPropertyValue("background-color")
    val textAlign get() = getPropertyValue("text-align")
    val whiteSpace get() = getPropertyValue("white-space")
    val textDecorationStyle get() = getPropertyValue("text-decoration-style")
    val textDecorationColor get() = getPropertyValue("text-decoration-color")

    private fun textDecoration(): String {
        val parts = DecorationLonghands.map { values[it] ?: return "" }
        if (parts.all { it == parts[0] } && parts[0] in CssWideKeywords) return parts[0]
        if (parts.any { it in CssWideKeywords && it != "initial" }) return ""
        return parts.filter { it != "initial" }.joinToString(" ").ifEmpty { "initial" }
    }

    companion object {
        private val CssWideKeywords = setOf("initial", "inherit", "unset", "revert", "revert-layer")
        private val DecorationLonghands =
            listOf("text-decoration-line", "text-decoration-thickness", "text-decoration-style", "text-decoration-color")
        private val FontLonghands = listOf("font-style", "font-weight", "font-size", "font-family")
        private val DecorationLines = listOf("underline", "overline", "line-through", "blink")
        private val DecorationStyles = setOf("solid", "double", "dotted", "dashed", "wavy")
        private val FontSizeKeywords = setOf(
            "xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large", "smaller", "larger",
        )
        private val FontStretches = setOf(
            "ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "semi-expanded", "expanded",
            "extra-expanded", "ultra-expanded",
        )
        private val LengthUnits = setOf(
            "px", "pt", "pc", "in", "cm", "mm", "q", "em", "rem", "ex", "rex", "ch", "rch", "cap", "ic", "lh", "rlh",
            "vw", "vh", "vi", "vb", "vmin", "vmax",
        )
        private val GenericFamilies = setOf(
            "serif", "sans-serif", "cursive", "fantasy", "monospace", "system-ui", "emoji", "math", "fangsong",
            "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded",
        )
        private val Functions = Regex("^(calc|min|max|clamp|var)\\(.*\\)$", RegexOption.IGNORE_CASE)
        private val Important = Regex("!\\s*important\\s*$", RegexOption.IGNORE_CASE)
        private val NumberRegex = Regex("^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)([a-zA-Z%]*)$")
        private val Ident = Regex("^-?(?:[a-zA-Z_]|[^\\x00-\\x7f]|\\\\.)(?:[a-zA-Z0-9_-]|[^\\x00-\\x7f]|\\\\.)*$")

        fun parse(text: String): PmCssStyle {
            val values = LinkedHashMap<String, String>()
            val important = HashSet<String>()
            for (declaration in splitTopLevel(text, ';')) {
                val colon = declaration.indexOf(':')
                if (colon < 0) continue
                val name = declaration.substring(0, colon).trim().lowercase(Locale.ROOT)
                var raw = declaration.substring(colon + 1).trim()
                val isImportant = Important.containsMatchIn(raw)
                if (isImportant) raw = raw.replace(Important, "").trim()
                if (raw.isEmpty()) continue
                val set = expand(name, raw) ?: continue
                for ((property, value) in set) {
                    if (property in important && !isImportant) continue
                    values[property] = value
                    if (isImportant) important.add(property)
                }
            }
            return PmCssStyle(values)
        }

        /** The value CSSOM keeps for longhand [name] given [raw], or null
         *  when [raw] is not valid for it (serializing the web's own
         *  style attributes goes through it too). */
        fun normalize(name: String, raw: String): String? {
            val value = raw.trim()
            val lower = value.lowercase(Locale.ROOT)
            if (lower in CssWideKeywords) return lower
            if (lower.contains("var(")) return value
            return when (name) {
                "font-weight" -> when {
                    lower in setOf("normal", "bold", "bolder", "lighter") -> lower
                    else -> number(lower)?.takeIf { it.second.isEmpty() && it.first >= 1.0 && it.first <= 1000.0 }?.let { format(it.first) }
                }
                "font-style" -> fontStyle(lower)
                "font-size" -> if (lower in FontSizeKeywords) lower else length(lower, allowNegative = false)
                "font-family" -> fontFamily(value)
                "color", "background-color", "text-decoration-color" -> CssColors.normalized(value)
                "vertical-align" ->
                    if (lower in setOf("baseline", "sub", "super", "text-top", "text-bottom", "middle", "top", "bottom")) lower else length(lower, allowNegative = true)
                "text-align" -> lower.takeIf {
                    it in setOf("start", "end", "left", "right", "center", "justify", "match-parent", "-webkit-left", "-webkit-right", "-webkit-center")
                }
                "white-space" -> lower.takeIf { it in setOf("normal", "pre", "nowrap", "pre-wrap", "pre-line", "break-spaces") }
                "text-decoration-line" -> decorationLine(lower.split(Regex("\\s+")))
                "text-decoration-style" -> lower.takeIf { it in DecorationStyles }
                "text-decoration-thickness" -> if (lower == "auto" || lower == "from-font") lower else length(lower, allowNegative = false)
                else -> if (Functions.matches(value)) value else length(lower, allowNegative = true) ?: value
            }
        }

        private fun expand(name: String, raw: String): List<Pair<String, String>>? {
            val lower = raw.lowercase(Locale.ROOT)
            return when (name) {
                "text-decoration" ->
                    if (lower in CssWideKeywords) DecorationLonghands.map { it to lower } else textDecorationShorthand(raw)
                "font" -> if (lower in CssWideKeywords) FontLonghands.map { it to lower } else fontShorthand(raw)
                "background" -> listOf("background-color" to if (lower in CssWideKeywords) lower else backgroundColor(raw))
                "font-weight", "font-style", "font-size", "font-family", "color", "background-color", "vertical-align",
                "text-align", "white-space", "text-decoration-line", "text-decoration-style", "text-decoration-color",
                "text-decoration-thickness",
                -> normalize(name, raw)?.let { listOf(name to it) }
                else -> null
            }
        }

        /** `text-decoration: <line> || <style> || <color> || <thickness>`,
         *  the longhands it leaves out set to "initial" (as Chrome reports
         *  them). */
        private fun textDecorationShorthand(raw: String): List<Pair<String, String>>? {
            val lines = mutableListOf<String>()
            var style: String? = null
            var color: String? = null
            var thickness: String? = null
            for (token in splitTopLevel(raw, ' ').filter { it.isNotBlank() }) {
                val lower = token.lowercase(Locale.ROOT)
                when {
                    lower == "none" || lower in DecorationLines -> lines.add(lower)
                    lower in DecorationStyles && style == null -> style = lower
                    (lower == "auto" || lower == "from-font" || length(lower, allowNegative = false) != null) && thickness == null ->
                        thickness = if (lower == "auto" || lower == "from-font") lower else length(lower, allowNegative = false)
                    color == null && CssColors.normalized(token) != null -> color = CssColors.normalized(token)
                    else -> return null
                }
            }
            val line = if (lines.isEmpty()) "initial" else decorationLine(lines) ?: return null
            return listOf(
                "text-decoration-line" to line,
                "text-decoration-thickness" to (thickness ?: "initial"),
                "text-decoration-style" to (style ?: "initial"),
                "text-decoration-color" to (color ?: "initial"),
            )
        }

        private fun decorationLine(tokens: List<String>): String? {
            if (tokens == listOf("none")) return "none"
            if (tokens.isEmpty() || tokens.any { it !in DecorationLines } || tokens.toSet().size != tokens.size) return null
            return DecorationLines.filter { it in tokens }.joinToString(" ")
        }

        /** `font: [style || variant || weight || stretch] size[/line-height] family`. */
        private fun fontShorthand(raw: String): List<Pair<String, String>>? {
            val tokens = splitTopLevel(raw, ' ').filter { it.isNotBlank() }
            var style: String? = null
            var weight: String? = null
            var i = 0
            var prefix = 0
            while (i < tokens.size && prefix < 4) {
                val lower = tokens[i].lowercase(Locale.ROOT)
                val asWeight = if (lower in CssWideKeywords) null else normalize("font-weight", lower)
                when {
                    lower == "normal" || lower == "small-caps" || lower in FontStretches -> Unit
                    style == null && (lower == "italic" || lower == "oblique") -> {
                        style = lower
                        tokens.getOrNull(i + 1)?.let { angle(it.lowercase(Locale.ROOT)) }?.let {
                            style = "oblique $it"
                            i++
                        }
                    }
                    weight == null && asWeight != null -> weight = asWeight
                    else -> break
                }
                i++
                prefix++
            }
            val sizeToken = tokens.getOrNull(i) ?: return null
            val size = normalize("font-size", sizeToken.substringBefore('/')) ?: return null
            i++
            if (sizeToken.contains('/') && sizeToken.substringAfter('/').isEmpty()) i++
            else if (!sizeToken.contains('/') && tokens.getOrNull(i) == "/") i += 2
            else if (!sizeToken.contains('/') && tokens.getOrNull(i)?.startsWith("/") == true) i++
            val family = fontFamily(tokens.drop(i).joinToString(" ")) ?: return null
            return listOf(
                "font-style" to (style ?: "normal"),
                "font-weight" to (weight ?: "normal"),
                "font-size" to size,
                "font-family" to family,
            )
        }

        /** The colour of the last background layer, "initial" if it has none. */
        private fun backgroundColor(raw: String): String {
            val lastLayer = splitTopLevel(raw, ',').last()
            return splitTopLevel(lastLayer, ' ').firstNotNullOfOrNull { token ->
                token.takeIf { it.isNotBlank() && !it.contains("url(", ignoreCase = true) }?.let { CssColors.normalized(it) }
            } ?: "initial"
        }

        private fun fontStyle(lower: String): String? {
            if (lower == "normal" || lower == "italic" || lower == "oblique") return lower
            val parts = lower.split(Regex("\\s+"))
            if (parts.size == 2 && parts[0] == "oblique") return angle(parts[1])?.let { "oblique $it" }
            return null
        }

        private fun angle(token: String): String? {
            val (value, unit) = number(token) ?: return null
            return if (unit in setOf("deg", "grad", "rad", "turn")) format(value) + unit else null
        }

        /** A non-negative (unless allowed) length or percentage, or a math function. */
        private fun length(lower: String, allowNegative: Boolean): String? {
            if (Functions.matches(lower)) return lower
            val (value, unit) = number(lower) ?: return null
            if (value < 0 && !allowNegative) return null
            return when {
                unit == "%" -> format(value) + "%"
                unit.isEmpty() -> if (value == 0.0) "0px" else null
                unit in LengthUnits -> format(value) + unit
                else -> null
            }
        }

        private fun number(token: String): Pair<Double, String>? {
            val match = NumberRegex.matchEntire(token) ?: return null
            val value = match.groupValues[1].toDoubleOrNull() ?: return null
            return value to match.groupValues[2].lowercase(Locale.ROOT)
        }

        /** Six significant digits, no trailing zeros. */
        private fun format(value: Double): String =
            BigDecimal(value).round(MathContext(6)).stripTrailingZeros().toPlainString().let { if (it == "-0") "0" else it }

        /** A family list, each name quoted only when it has to be: several
         *  words, or a word that would otherwise read as a keyword. */
        private fun fontFamily(raw: String): String? {
            val families = splitTopLevel(raw, ',').map { it.trim() }
            if (families.isEmpty() || families.any { it.isEmpty() }) return null
            return families.map { family -> serializeFamily(family) ?: return null }.joinToString(", ")
        }

        private fun serializeFamily(family: String): String? {
            val first = family.first()
            if (first == '"' || first == '\'') {
                if (family.length < 2 || family.last() != first) return null
                val inner = family.substring(1, family.length - 1)
                if (inner.contains(first) && !inner.contains("\\$first")) return null
                val name = inner.replace("\\$first", "$first")
                val lower = name.lowercase(Locale.ROOT)
                return if (Ident.matches(name) && lower !in GenericFamilies && lower !in CssWideKeywords && lower != "default") {
                    name
                } else {
                    quote(name)
                }
            }
            val words = family.split(Regex("\\s+"))
            if (words.any { !Ident.matches(it) }) return null
            if (words.size == 1) {
                val lower = words[0].lowercase(Locale.ROOT)
                if (lower in CssWideKeywords || lower == "default") return null
                return if (lower in GenericFamilies) lower else words[0]
            }
            return quote(words.joinToString(" "))
        }

        private fun quote(name: String) = "\"" + name.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

        /** [text] split on [separator] outside quotes and parentheses. */
        private fun splitTopLevel(text: String, separator: Char): List<String> {
            val parts = mutableListOf<String>()
            val current = StringBuilder()
            var depth = 0
            var quote: Char? = null
            for (c in text) {
                when {
                    quote != null -> {
                        current.append(c)
                        if (c == quote) quote = null
                    }
                    c == '"' || c == '\'' -> {
                        quote = c
                        current.append(c)
                    }
                    c == '(' -> {
                        depth++
                        current.append(c)
                    }
                    c == ')' -> {
                        depth = maxOf(0, depth - 1)
                        current.append(c)
                    }
                    depth == 0 && (c == separator || separator == ' ' && c.isWhitespace()) -> {
                        parts.add(current.toString())
                        current.setLength(0)
                    }
                    else -> current.append(c)
                }
            }
            parts.add(current.toString())
            return parts
        }
    }
}
