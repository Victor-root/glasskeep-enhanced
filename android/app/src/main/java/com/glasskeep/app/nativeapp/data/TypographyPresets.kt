package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.Serializable

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
 * These are the [Serializable] wire shapes; [TypographyPresets.normalize]
 * turns whatever the server sends (including the pre-profiles legacy shape
 * where the six blocks sat at the top level) into a complete, valid set.
 */
@Serializable
data class TypographyBlockDto(
    val size: String? = null,
    val weight: Int? = null,
    val color: String? = null,
    val italic: Boolean? = null,
    val underline: Boolean? = null,
)

@Serializable
data class TypographyProfileDto(
    val p: TypographyBlockDto? = null,
    val h1: TypographyBlockDto? = null,
    val h2: TypographyBlockDto? = null,
    val h3: TypographyBlockDto? = null,
    val h4: TypographyBlockDto? = null,
    val h5: TypographyBlockDto? = null,
)

@Serializable
data class TypographyPresetsDto(
    val active: String? = null,
    val profile1: TypographyProfileDto? = null,
    val profile2: TypographyProfileDto? = null,
    val profile3: TypographyProfileDto? = null,
    // The legacy shape kept the six blocks at the top level, with no
    // profiles at all. Read here so an account that never opened the new
    // typography modal still gets its saved look (normalizeTypographyPresets
    // in typographyPresets.js:130-140 does the same migration).
    val p: TypographyBlockDto? = null,
    val h1: TypographyBlockDto? = null,
    val h2: TypographyBlockDto? = null,
    val h3: TypographyBlockDto? = null,
    val h4: TypographyBlockDto? = null,
    val h5: TypographyBlockDto? = null,
)

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

    fun toDto(): TypographyPresetsDto = TypographyPresetsDto(
        active = active,
        profile1 = profile1.toDto(),
        profile2 = profile2.toDto(),
        profile3 = profile3.toDto(),
    )

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

        fun normalize(dto: TypographyPresetsDto?): TypographyPresets {
            if (dto == null) return DEFAULT
            val hasNewShape = dto.active != null ||
                dto.profile1 != null || dto.profile2 != null || dto.profile3 != null
            if (!hasNewShape) {
                val legacy = TypographyProfileDto(dto.p, dto.h1, dto.h2, dto.h3, dto.h4, dto.h5)
                if (legacy == TypographyProfileDto()) return DEFAULT
                return TypographyPresets(DEFAULT_ACTIVE, sanitize(legacy), DEFAULT_PROFILE, DEFAULT_PROFILE)
            }
            return TypographyPresets(
                active = dto.active?.takeIf { it in PROFILE_KEYS } ?: DEFAULT_ACTIVE,
                profile1 = sanitize(dto.profile1),
                profile2 = sanitize(dto.profile2),
                profile3 = sanitize(dto.profile3),
            )
        }

        private fun sanitize(dto: TypographyProfileDto?): TypographyProfile {
            if (dto == null) return DEFAULT_PROFILE
            return TypographyProfile(
                p = sanitizeBlock(dto.p, DEFAULT_PROFILE.p),
                h1 = sanitizeBlock(dto.h1, DEFAULT_PROFILE.h1),
                h2 = sanitizeBlock(dto.h2, DEFAULT_PROFILE.h2),
                h3 = sanitizeBlock(dto.h3, DEFAULT_PROFILE.h3),
                h4 = sanitizeBlock(dto.h4, DEFAULT_PROFILE.h4),
                h5 = sanitizeBlock(dto.h5, DEFAULT_PROFILE.h5),
            )
        }

        private fun sanitizeBlock(dto: TypographyBlockDto?, fallback: TypographyBlock): TypographyBlock {
            if (dto == null) return fallback
            return TypographyBlock(
                size = nearestPresetSize(dto.size) ?: fallback.size,
                weight = dto.weight?.takeIf { it in WEIGHT_PRESETS } ?: fallback.weight,
                color = dto.color?.takeIf { it.isNotBlank() && it != "inherit" },
                italic = dto.italic ?: fallback.italic,
                underline = dto.underline ?: fallback.underline,
            )
        }

        /** Snaps a stored "1.35rem" to the nearest offered preset, exactly
         *  as nearestPresetSize() does on the web: the picker only offers
         *  the preset list, so an off-list value would otherwise show one
         *  size in the dropdown and render another. */
        private fun nearestPresetSize(raw: String?): Float? {
            val value = raw?.trim()?.removeSuffix("rem")?.trim()?.toFloatOrNull() ?: return null
            return SIZE_PRESETS.minByOrNull { kotlin.math.abs(it - value) }
        }
    }
}

private fun TypographyProfile.toDto() = TypographyProfileDto(
    p = p.toDto(),
    h1 = h1.toDto(),
    h2 = h2.toDto(),
    h3 = h3.toDto(),
    h4 = h4.toDto(),
    h5 = h5.toDto(),
)

private fun TypographyBlock.toDto() = TypographyBlockDto(
    size = "${formatRem(size)}rem",
    weight = weight,
    color = color,
    italic = italic,
    underline = underline,
)

/** "1rem", "1.125rem": the web writes plain decimals, never "1.0rem". */
private fun formatRem(value: Float): String {
    val rounded = Math.round(value * 1000f) / 1000f
    return if (rounded == rounded.toInt().toFloat()) rounded.toInt().toString() else rounded.toString()
}
