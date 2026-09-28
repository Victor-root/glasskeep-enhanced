package com.glasskeep.app.nativeapp.data.pm

/**
 * HTML character references: numeric ones, and the named ones of HTML 4
 * (every name clipboard markup uses in practice) with their HTML5 values.
 * A name outside this set stays literal text, as an unknown one does in a
 * browser.
 */
internal object HtmlEntities {
    private val Latin1 = listOf(
        "nbsp", "iexcl", "cent", "pound", "curren", "yen", "brvbar", "sect", "uml", "copy", "ordf", "laquo", "not",
        "shy", "reg", "macr", "deg", "plusmn", "sup2", "sup3", "acute", "micro", "para", "middot", "cedil", "sup1",
        "ordm", "raquo", "frac14", "frac12", "frac34", "iquest", "Agrave", "Aacute", "Acirc", "Atilde", "Auml",
        "Aring", "AElig", "Ccedil", "Egrave", "Eacute", "Ecirc", "Euml", "Igrave", "Iacute", "Icirc", "Iuml", "ETH",
        "Ntilde", "Ograve", "Oacute", "Ocirc", "Otilde", "Ouml", "times", "Oslash", "Ugrave", "Uacute", "Ucirc",
        "Uuml", "Yacute", "THORN", "szlig", "agrave", "aacute", "acirc", "atilde", "auml", "aring", "aelig", "ccedil",
        "egrave", "eacute", "ecirc", "euml", "igrave", "iacute", "icirc", "iuml", "eth", "ntilde", "ograve", "oacute",
        "ocirc", "otilde", "ouml", "divide", "oslash", "ugrave", "uacute", "ucirc", "uuml", "yacute", "thorn", "yuml",
    )

    private val Others = mapOf(
        "quot" to 34, "amp" to 38, "apos" to 39, "lt" to 60, "gt" to 62, "QUOT" to 34, "AMP" to 38, "LT" to 60,
        "GT" to 62, "COPY" to 169, "REG" to 174, "OElig" to 338, "oelig" to 339, "Scaron" to 352, "scaron" to 353,
        "Yuml" to 376, "fnof" to 402, "circ" to 710, "tilde" to 732, "Alpha" to 913, "Beta" to 914, "Gamma" to 915,
        "Delta" to 916, "Epsilon" to 917, "Zeta" to 918, "Eta" to 919, "Theta" to 920, "Iota" to 921, "Kappa" to 922,
        "Lambda" to 923, "Mu" to 924, "Nu" to 925, "Xi" to 926, "Omicron" to 927, "Pi" to 928, "Rho" to 929,
        "Sigma" to 931, "Tau" to 932, "Upsilon" to 933, "Phi" to 934, "Chi" to 935, "Psi" to 936, "Omega" to 937,
        "alpha" to 945, "beta" to 946, "gamma" to 947, "delta" to 948, "epsilon" to 949, "zeta" to 950, "eta" to 951,
        "theta" to 952, "iota" to 953, "kappa" to 954, "lambda" to 955, "mu" to 956, "nu" to 957, "xi" to 958,
        "omicron" to 959, "pi" to 960, "rho" to 961, "sigmaf" to 962, "sigma" to 963, "tau" to 964, "upsilon" to 965,
        "phi" to 966, "chi" to 967, "psi" to 968, "omega" to 969, "thetasym" to 977, "upsih" to 978, "piv" to 982,
        "ensp" to 8194, "emsp" to 8195, "thinsp" to 8201, "zwnj" to 8204, "zwj" to 8205, "lrm" to 8206, "rlm" to 8207,
        "ndash" to 8211, "mdash" to 8212, "lsquo" to 8216, "rsquo" to 8217, "sbquo" to 8218, "ldquo" to 8220,
        "rdquo" to 8221, "bdquo" to 8222, "dagger" to 8224, "Dagger" to 8225, "bull" to 8226, "hellip" to 8230,
        "permil" to 8240, "prime" to 8242, "Prime" to 8243, "lsaquo" to 8249, "rsaquo" to 8250, "oline" to 8254,
        "frasl" to 8260, "euro" to 8364, "image" to 8465, "weierp" to 8472, "real" to 8476, "trade" to 8482,
        "alefsym" to 8501, "larr" to 8592, "uarr" to 8593, "rarr" to 8594, "darr" to 8595, "harr" to 8596,
        "crarr" to 8629, "lArr" to 8656, "uArr" to 8657, "rArr" to 8658, "dArr" to 8659, "hArr" to 8660,
        "forall" to 8704, "part" to 8706, "exist" to 8707, "empty" to 8709, "nabla" to 8711, "isin" to 8712,
        "notin" to 8713, "ni" to 8715, "prod" to 8719, "sum" to 8721, "minus" to 8722, "lowast" to 8727,
        "radic" to 8730, "prop" to 8733, "infin" to 8734, "ang" to 8736, "and" to 8743, "or" to 8744, "cap" to 8745,
        "cup" to 8746, "int" to 8747, "there4" to 8756, "sim" to 8764, "cong" to 8773, "asymp" to 8776, "ne" to 8800,
        "equiv" to 8801, "le" to 8804, "ge" to 8805, "sub" to 8834, "sup" to 8835, "nsub" to 8836, "sube" to 8838,
        "supe" to 8839, "oplus" to 8853, "otimes" to 8855, "perp" to 8869, "sdot" to 8901, "lceil" to 8968,
        "rceil" to 8969, "lfloor" to 8970, "rfloor" to 8971, "lang" to 10216, "rang" to 10217, "loz" to 9674,
        "spades" to 9824, "clubs" to 9827, "hearts" to 9829, "diams" to 9830,
    )

    private val Named: Map<String, Int> = Latin1.withIndex().associate { (i, name) -> name to 160 + i } + Others

    /** The names that are also recognised without their semicolon. */
    private val Legacy: Set<String> = Latin1.toSet() + setOf("quot", "amp", "lt", "gt", "QUOT", "AMP", "LT", "GT", "COPY", "REG")

    private val Windows1252 = mapOf(
        0x80 to 0x20AC, 0x82 to 0x201A, 0x83 to 0x0192, 0x84 to 0x201E, 0x85 to 0x2026, 0x86 to 0x2020,
        0x87 to 0x2021, 0x88 to 0x02C6, 0x89 to 0x2030, 0x8A to 0x0160, 0x8B to 0x2039, 0x8C to 0x0152,
        0x8E to 0x017D, 0x91 to 0x2018, 0x92 to 0x2019, 0x93 to 0x201C, 0x94 to 0x201D, 0x95 to 0x2022,
        0x96 to 0x2013, 0x97 to 0x2014, 0x98 to 0x02DC, 0x99 to 0x2122, 0x9A to 0x0161, 0x9B to 0x203A,
        0x9C to 0x0153, 0x9E to 0x017E, 0x9F to 0x0178,
    )

    /** The character reference starting with the `&` at [start]: what it
     *  stands for and where the input resumes. */
    fun decode(input: String, start: Int, inAttribute: Boolean): Pair<String, Int> {
        var i = start + 1
        val n = input.length
        if (i < n && input[i] == '#') {
            i++
            val hex = i < n && (input[i] == 'x' || input[i] == 'X')
            if (hex) i++
            val digitsStart = i
            while (i < n && (if (hex) input[i].isHexDigit() else input[i] in '0'..'9')) i++
            if (i == digitsStart) return "&" to start + 1
            val digits = input.substring(digitsStart, i)
            if (i < n && input[i] == ';') i++
            val value = digits.toBigInteger(if (hex) 16 else 10)
            val code = if (value > 0x10FFFF.toBigInteger()) 0xFFFD else value.toInt()
            return codePoint(code) to i
        }
        while (i < n && input[i].isLetterOrDigit() && input[i].code < 128) i++
        val run = input.substring(start + 1, i)
        if (i < n && input[i] == ';') Named[run]?.let { return String(Character.toChars(it)) to i + 1 }
        for (length in run.length downTo 2) {
            val name = run.substring(0, length)
            if (name !in Legacy) continue
            val next = input.getOrNull(start + 1 + length)
            if (inAttribute && next != null && (next == '=' || next.isLetterOrDigit())) return "&" to start + 1
            return String(Character.toChars(Named.getValue(name))) to start + 1 + length
        }
        return "&" to start + 1
    }

    fun decodeAll(input: String, inAttribute: Boolean = false): String {
        if ('&' !in input) return input
        val out = StringBuilder()
        var i = 0
        while (i < input.length) {
            if (input[i] == '&') {
                val (decoded, next) = decode(input, i, inAttribute)
                out.append(decoded)
                i = next
            } else {
                out.append(input[i++])
            }
        }
        return out.toString()
    }

    private fun codePoint(code: Int): String {
        val mapped = when {
            code == 0 || code in 0xD800..0xDFFF -> 0xFFFD
            else -> Windows1252[code] ?: code
        }
        return String(Character.toChars(mapped))
    }

    private fun Char.isHexDigit() = this in '0'..'9' || this in 'a'..'f' || this in 'A'..'F'
}
