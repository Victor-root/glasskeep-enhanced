package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Per-user typography presets for rich-text notes, ported from
 * src/utils/typographyPresets.js.
 *
 * The user keeps THREE independent profiles and one `active` pointer, so
 * several complete setups can be saved and swapped with a tap. Each of the
 * six blocks (paragraph, headings 1-5) carries five properties: size,
 * weight, colour, italic and underline. The whole blob is one field of the
 * server-side user settings, so it follows the account across devices,
 * same as the workspace theme.
 *
 * The blob travels as raw JSON: [TypographyPresets.normalize] reads it the
 * way normalizeTypographyPresets() does, which has to tell a `"color": null`
 * (inherit) from a block with no colour at all (its default colour), and
 * [TypographyPresets.toJson] writes every key back, nulls included.
 */
/** One block's five resolved properties. [size] is in rem, the unit the
 *  web stores; multiply by 16 for the sp value (1rem = 16px there). */
data class TypographyBlock(
    val size: Float,
    val weight: Int,
    /** A CSS colour, or null for "inherit" (the note's own text colour). */
    val color: String?,
    val italic: Boolean,
    val underline: Boolean,
)

data class TypographyProfile(
    val p: TypographyBlock,
    val h1: TypographyBlock,
    val h2: TypographyBlock,
    val h3: TypographyBlock,
    val h4: TypographyBlock,
    val h5: TypographyBlock,
) {
    fun forKind(kind: RichBlockKind): TypographyBlock = when (kind) {
        RichBlockKind.HEADING_1 -> h1
        RichBlockKind.HEADING_2 -> h2
        RichBlockKind.HEADING_3 -> h3
        RichBlockKind.HEADING_4 -> h4
        RichBlockKind.HEADING_5 -> h5
        else -> p
    }

    fun withBlock(key: String, block: TypographyBlock): TypographyProfile = when (key) {
        "h1" -> copy(h1 = block)
        "h2" -> copy(h2 = block)
        "h3" -> copy(h3 = block)
        "h4" -> copy(h4 = block)
        "h5" -> copy(h5 = block)
        else -> copy(p = block)
    }

    fun byKey(key: String): TypographyBlock = when (key) {
        "h1" -> h1
        "h2" -> h2
        "h3" -> h3
        "h4" -> h4
        "h5" -> h5
        else -> p
    }
}

data class TypographyPresets(
    val active: String,
    val profile1: TypographyProfile,
    val profile2: TypographyProfile,
    val profile3: TypographyProfile,
) {
    val activeProfile: TypographyProfile
        get() = profileFor(active)

    fun profileFor(key: String): TypographyProfile = when (key) {
        "profile2" -> profile2
        "profile3" -> profile3
        else -> profile1
    }

    fun withProfile(key: String, profile: TypographyProfile): TypographyPresets = when (key) {
        "profile2" -> copy(profile2 = profile)
        "profile3" -> copy(profile3 = profile)
        else -> copy(profile1 = profile)
    }

    fun toJson(): JsonObject = buildJsonObject {
        put("active", active)
        for (key in PROFILE_KEYS) put(key, profileFor(key).toJson())
    }

    val isDefault: Boolean
        get() = active == DEFAULT_ACTIVE &&
            profile1 == DEFAULT_PROFILE && profile2 == DEFAULT_PROFILE && profile3 == DEFAULT_PROFILE

    companion object {
        const val DEFAULT_ACTIVE = "profile1"

        val PROFILE_KEYS = listOf("profile1", "profile2", "profile3")
        val BLOCK_KEYS = listOf("p", "h1", "h2", "h3", "h4", "h5")

        /** DEFAULT_PROFILE (typographyPresets.js:21-28), value for value. */
        val DEFAULT_PROFILE = TypographyProfile(
            p = TypographyBlock(1f, 400, null, italic = false, underline = false),
            h1 = TypographyBlock(1.75f, 800, "#4f46e5", italic = false, underline = false),
            h2 = TypographyBlock(1.5f, 700, "#059669", italic = false, underline = false),
            h3 = TypographyBlock(1.25f, 600, "#0284c7", italic = false, underline = true),
            h4 = TypographyBlock(1.125f, 600, "#d97706", italic = true, underline = false),
            h5 = TypographyBlock(1f, 500, "#db2777", italic = true, underline = true),
        )

        val DEFAULT = TypographyPresets(DEFAULT_ACTIVE, DEFAULT_PROFILE, DEFAULT_PROFILE, DEFAULT_PROFILE)

        /** TYPOGRAPHY_SIZE_PRESETS, in rem. */
        val SIZE_PRESETS = listOf(0.875f, 1f, 1.125f, 1.25f, 1.5f, 1.75f, 2f, 2.25f, 2.5f)

        /** TYPOGRAPHY_WEIGHT_PRESETS. */
        val WEIGHT_PRESETS = listOf(400, 500, 600, 700)

        /** TYPOGRAPHY_COLOR_PRESETS: the nine swatches the block colour
         *  picker offers, on top of "inherit". */
        val COLOR_PRESETS = listOf(
            "#111827", "#ef4444", "#f97316", "#eab308",
            "#10b981", "#0ea5e9", "#6366f1", "#a855f7",
            "#ec4899",
        )

        /** normalizeTypographyPresets(): the legacy shape, the six blocks
         *  at the top level with no profiles at all, becomes profile 1. */
        fun normalize(raw: JsonElement?): TypographyPresets {
            val input = raw as? JsonObject ?: return DEFAULT
            val hasNewShape = input["active"].isTruthy() || PROFILE_KEYS.any { input[it] is JsonObject }
            if (!hasNewShape && BLOCK_KEYS.any { input[it].isTruthy() }) {
                return TypographyPresets(DEFAULT_ACTIVE, sanitize(input), DEFAULT_PROFILE, DEFAULT_PROFILE)
            }
            return TypographyPresets(
                active = input.string("active")?.takeIf { it in PROFILE_KEYS } ?: DEFAULT_ACTIVE,
                profile1 = sanitize(input["profile1"]),
                profile2 = sanitize(input["profile2"]),
                profile3 = sanitize(input["profile3"]),
            )
        }

        private fun sanitize(raw: JsonElement?): TypographyProfile {
            val input = raw as? JsonObject
            return TypographyProfile(
                p = sanitizeBlock(input?.get("p"), DEFAULT_PROFILE.p),
                h1 = sanitizeBlock(input?.get("h1"), DEFAULT_PROFILE.h1),
                h2 = sanitizeBlock(input?.get("h2"), DEFAULT_PROFILE.h2),
                h3 = sanitizeBlock(input?.get("h3"), DEFAULT_PROFILE.h3),
                h4 = sanitizeBlock(input?.get("h4"), DEFAULT_PROFILE.h4),
                h5 = sanitizeBlock(input?.get("h5"), DEFAULT_PROFILE.h5),
            )
        }

        private fun sanitizeBlock(raw: JsonElement?, fallback: TypographyBlock): TypographyBlock {
            val value = raw as? JsonObject ?: return fallback
            return TypographyBlock(
                size = value.string("size")?.let(::presetSize) ?: fallback.size,
                weight = (value["weight"] as? JsonPrimitive)?.content?.trim()?.toDoubleOrNull()
                    ?.takeIf { it in 100.0..900.0 }?.toInt() ?: fallback.weight,
                color = if (value["color"] is JsonNull) {
                    null
                } else {
                    value.string("color")?.takeIf { ColorRegex.containsMatchIn(it) } ?: fallback.color
                },
                italic = value.boolean("italic") ?: fallback.italic,
                underline = value.boolean("underline") ?: fallback.underline,
            )
        }

        private val ColorRegex = Regex("^(#[0-9a-fA-F]{3,8}|rgb|hsl|inherit|transparent)")
        private val RemRegex = Regex("""^([\d.]+)\s*rem$""", RegexOption.IGNORE_CASE)

        /** Snaps a stored "1.35rem" to the nearest offered preset, exactly
         *  as nearestPresetSize() does on the web: the picker only offers
         *  the preset list, so an off-list value would otherwise show one
         *  size in the dropdown and render another. */
        private fun presetSize(raw: String): Float? {
            val value = RemRegex.find(raw)?.groupValues?.get(1)?.toFloatOrNull() ?: return null
            return SIZE_PRESETS.minByOrNull { kotlin.math.abs(it - value) }
        }
    }
}

private fun TypographyProfile.toJson() = buildJsonObject {
    for (key in TypographyPresets.BLOCK_KEYS) put(key, byKey(key).toJson())
}

private fun TypographyBlock.toJson() = buildJsonObject {
    put("size", "${formatRem(size)}rem")
    put("weight", weight)
    put("color", color)
    put("italic", italic)
    put("underline", underline)
}

private fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.boolean(key: String): Boolean? =
    (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull

/** JavaScript truthiness, for the legacy-shape test. */
private fun JsonElement?.isTruthy(): Boolean = when (this) {
    null, JsonNull -> false
    is JsonPrimitive -> if (isString) content.isNotEmpty() else content != "false" && content.toDoubleOrNull() != 0.0
    else -> true
}

/** "1rem", "1.125rem": the web writes plain decimals, never "1.0rem". */
private fun formatRem(value: Float): String {
    val rounded = Math.round(value * 1000f) / 1000f
    return if (rounded == rounded.toInt().toFloat()) rounded.toInt().toString() else rounded.toString()
}
