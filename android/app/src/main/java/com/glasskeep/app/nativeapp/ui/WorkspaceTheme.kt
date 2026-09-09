package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Whether the app is currently painting dark. Every screen reads this
 * rather than the device setting directly, because the header menu's
 * light/dark entry can override that setting for the session
 * (ShellPrefsState.darkOverride, the web's own toggleDark). Provided once
 * at the root, in NativeAppActivity.
 */
val LocalGkDark = staticCompositionLocalOf { false }

/**
 * The six "workspace" shell themes, ported token for token from
 * src/styles/globalCSS.js: the `:root` / `html.dark` blocks for the
 * default (glasskeep, which has no CSS class of its own on the web) and
 * the `html.gk-theme-<id>` / `html.dark.gk-theme-<id>` blocks for the
 * other five. Ids and labels come from src/theme/shellTheme.js.
 *
 * Scope is the web's own: a theme recolors the header/status-bar chrome,
 * the page background, AND the accent used by buttons, switches,
 * highlights and gradients across the whole app (--gk-chrome-accent,
 * --gk-chrome-grad-from/-to and everything color-mix()'d off them). The
 * login/onboarding screens are the one exception the web itself carves
 * out, so those keep the fixed onboarding Indigo.
 *
 * Two web details worth keeping in mind here:
 *  - The dark theme blocks do NOT redefine --gk-chrome-grad-from/-to, so
 *    a theme's primary gradient is identical in light and dark. Hence one
 *    [WorkspaceThemeEntry.gradFrom]/[WorkspaceThemeEntry.gradTo] pair per
 *    theme rather than one per mode.
 *  - Everything color-mix()'d off those tokens (icon pills, soft accent
 *    surfaces, panel fills) is NOT redefined per theme on the web either:
 *    it follows automatically. The helpers below derive them the same way
 *    instead of hardcoding six copies.
 */
data class WorkspaceThemeColors(
    val chrome1: Color,
    val chrome2: Color,
    val chrome3: Color,
    /** --gk-chrome-solid: the opaque fallback fill for the glass chrome. */
    val chromeSolid: Color,
    val statusBar: Color,
    val chromeBorder: Color,
    val chromeShadow: Color,
    /** --gk-chrome-accent. */
    val accent: Color,
    /** --gk-chrome-hover. */
    val hover: Color,
    /** --gk-chrome-active-bg / -fg: the selected sidebar/nav entry. */
    val activeBg: Color,
    val activeFg: Color,
    /** --gk-app-bg: the page background color. */
    val appBg: Color,
    /** --gk-app-bg-image's three stops, or null when the web sets `none`
     *  (every theme's dark block does). */
    val appBgGradient: List<Color>?,
)

data class WorkspaceThemeEntry(
    val id: String,
    val label: String,
    val light: WorkspaceThemeColors,
    val dark: WorkspaceThemeColors,
    /** swatch[0]/[1]/[2] on the web, used to draw the picker card. */
    val swatchPrimary: Color,
    val swatchSecondary: Color,
    val swatchSurface: Color,
    /** --gk-chrome-grad-from/-to, shared by both modes (see class doc). */
    val gradFrom: Color,
    val gradTo: Color,
    /** --gk-switch-on. The default theme keeps its own #4f46e5; every
     *  other theme inherits the generic html[class*="gk-theme-"] rule
     *  that sets it to that theme's grad-from. */
    val switchOn: Color,
)

object WorkspaceTheme {
    const val DEFAULT_ID = "glasskeep"

    val ALL: List<WorkspaceThemeEntry> = listOf(
        WorkspaceThemeEntry(
            id = "glasskeep",
            label = "GlassKeep",
            light = WorkspaceThemeColors(
                chrome1 = Color(212, 221, 252, 230),
                chrome2 = Color(221, 217, 252, 230),
                chrome3 = Color(231, 215, 252, 230),
                chromeSolid = Color(0xFFEDF1FA),
                statusBar = Color(0xFFDCE1FB),
                chromeBorder = Color(120, 134, 196, 71),
                chromeShadow = Color(54, 64, 122, 26),
                accent = Color(0xFF4F46E5),
                hover = Color(79, 70, 229, 20),
                activeBg = Color(99, 102, 241, 41),
                activeFg = Color(0xFF3730A3),
                appBg = Color(0xFFEEE5FF),
                appBgGradient = listOf(Color(0xFFEEE5FF), Color(0xFFE5F3FD), Color(0xFFFDE5EE)),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(30, 36, 64, 230),
                chrome2 = Color(36, 33, 66, 230),
                chrome3 = Color(44, 32, 66, 230),
                chromeSolid = Color(0xFF1B2233),
                statusBar = Color(0xFF171F30),
                chromeBorder = Color(126, 142, 200, 51),
                chromeShadow = Color(0, 0, 0, 97),
                accent = Color(0xFF818CF8),
                hover = Color(129, 140, 248, 36),
                activeBg = Color(99, 102, 241, 61),
                activeFg = Color(0xFFC7D2FE),
                appBg = Color(0xFF1A1A1A),
                appBgGradient = null,
            ),
            swatchPrimary = Color(0xFF6366F1),
            swatchSecondary = Color(0xFF7C3AED),
            swatchSurface = Color(0xFFDCE1FB),
            gradFrom = Color(0xFF6366F1),
            gradTo = Color(0xFF7C3AED),
            switchOn = Color(0xFF4F46E5),
        ),
        WorkspaceThemeEntry(
            id = "emerald",
            label = "Emerald",
            light = WorkspaceThemeColors(
                chrome1 = Color(205, 238, 223, 230),
                chrome2 = Color(206, 236, 228, 230),
                chrome3 = Color(208, 235, 234, 230),
                chromeSolid = Color(0xFFE4F3EC),
                statusBar = Color(0xFFD2ECDF),
                chromeBorder = Color(45, 150, 120, 71),
                chromeShadow = Color(14, 90, 70, 26),
                accent = Color(0xFF0D9488),
                hover = Color(16, 185, 129, 23),
                activeBg = Color(13, 148, 136, 41),
                activeFg = Color(0xFF0F5F53),
                appBg = Color(0xFFE8F6EE),
                appBgGradient = listOf(Color(0xFFE8F6EE), Color(0xFFE3F4F1), Color(0xFFEAFAF0)),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(20, 40, 34, 230),
                chrome2 = Color(22, 42, 38, 230),
                chrome3 = Color(24, 44, 42, 230),
                chromeSolid = Color(0xFF14241F),
                statusBar = Color(0xFF10211B),
                chromeBorder = Color(64, 170, 134, 51),
                chromeShadow = Color(0, 0, 0, 97),
                accent = Color(0xFF34D399),
                hover = Color(52, 211, 153, 36),
                activeBg = Color(16, 185, 129, 61),
                activeFg = Color(0xFFA6E9CF),
                appBg = Color(0xFF141A17),
                appBgGradient = null,
            ),
            swatchPrimary = Color(0xFF10B981),
            swatchSecondary = Color(0xFF0D9488),
            swatchSurface = Color(0xFFD2ECDF),
            gradFrom = Color(0xFF10B981),
            gradTo = Color(0xFF0D9488),
            switchOn = Color(0xFF10B981),
        ),
        WorkspaceThemeEntry(
            id = "amber",
            label = "Amber",
            light = WorkspaceThemeColors(
                chrome1 = Color(250, 232, 206, 230),
                chrome2 = Color(250, 228, 204, 230),
                chrome3 = Color(250, 224, 205, 230),
                chromeSolid = Color(0xFFF7ECDD),
                statusBar = Color(0xFFF6E3C9),
                chromeBorder = Color(190, 140, 60, 77),
                chromeShadow = Color(140, 95, 25, 28),
                accent = Color(0xFFD97706),
                hover = Color(217, 119, 6, 26),
                activeBg = Color(217, 119, 6, 41),
                activeFg = Color(0xFF8A4D09),
                appBg = Color(0xFFFDF2E2),
                appBgGradient = listOf(Color(0xFFFDF2E2), Color(0xFFFAECD6), Color(0xFFFDEEDE)),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(42, 33, 20, 230),
                chrome2 = Color(44, 34, 20, 230),
                chrome3 = Color(46, 34, 21, 230),
                chromeSolid = Color(0xFF241D12),
                statusBar = Color(0xFF20190F),
                chromeBorder = Color(200, 150, 70, 51),
                chromeShadow = Color(0, 0, 0, 97),
                accent = Color(0xFFFBBF24),
                hover = Color(251, 191, 36, 36),
                activeBg = Color(217, 119, 6, 66),
                activeFg = Color(0xFFF6D8A6),
                appBg = Color(0xFF1B1712),
                appBgGradient = null,
            ),
            swatchPrimary = Color(0xFFD97706),
            swatchSecondary = Color(0xFFB45309),
            swatchSurface = Color(0xFFF6E3C9),
            gradFrom = Color(0xFFD97706),
            gradTo = Color(0xFFB45309),
            switchOn = Color(0xFFD97706),
        ),
        WorkspaceThemeEntry(
            id = "rosewood",
            label = "Ruby",
            light = WorkspaceThemeColors(
                chrome1 = Color(250, 210, 210, 230),
                chrome2 = Color(250, 205, 205, 230),
                chrome3 = Color(249, 202, 202, 230),
                chromeSolid = Color(0xFFF9DEDE),
                statusBar = Color(0xFFF7CCCC),
                chromeBorder = Color(200, 40, 40, 82),
                chromeShadow = Color(150, 20, 20, 31),
                accent = Color(0xFFD61F1F),
                hover = Color(214, 31, 31, 26),
                activeBg = Color(214, 31, 31, 41),
                activeFg = Color(0xFF9B1212),
                appBg = Color(0xFFFDEAEA),
                appBgGradient = listOf(Color(0xFFFDEAEA), Color(0xFFFBE0E0), Color(0xFFFEF0F0)),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(50, 22, 22, 230),
                chrome2 = Color(54, 22, 22, 230),
                chrome3 = Color(58, 22, 22, 230),
                chromeSolid = Color(0xFF2C1616),
                statusBar = Color(0xFF261010),
                chromeBorder = Color(248, 80, 80, 61),
                chromeShadow = Color(0, 0, 0, 102),
                accent = Color(0xFFF87171),
                hover = Color(248, 113, 113, 36),
                activeBg = Color(220, 38, 38, 77),
                activeFg = Color(0xFFFECACA),
                appBg = Color(0xFF1A1212),
                appBgGradient = null,
            ),
            swatchPrimary = Color(0xFFE11D1D),
            swatchSecondary = Color(0xFF9F1010),
            swatchSurface = Color(0xFFF7CCCC),
            gradFrom = Color(0xFFE11D1D),
            gradTo = Color(0xFF9F1010),
            switchOn = Color(0xFFE11D1D),
        ),
        WorkspaceThemeEntry(
            id = "graphite",
            label = "Graphite",
            light = WorkspaceThemeColors(
                chrome1 = Color(223, 227, 233, 230),
                chrome2 = Color(220, 224, 231, 230),
                chrome3 = Color(218, 222, 229, 230),
                chromeSolid = Color(0xFFE8EBEF),
                statusBar = Color(0xFFDDE1E7),
                chromeBorder = Color(100, 116, 139, 77),
                chromeShadow = Color(30, 41, 59, 26),
                accent = Color(0xFF475569),
                hover = Color(71, 85, 105, 23),
                activeBg = Color(71, 85, 105, 41),
                activeFg = Color(0xFF334155),
                appBg = Color(0xFFEEF1F5),
                appBgGradient = listOf(Color(0xFFEEF1F5), Color(0xFFE9EDF2), Color(0xFFF3F5F8)),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(30, 33, 39, 230),
                chrome2 = Color(32, 35, 41, 230),
                chrome3 = Color(34, 37, 44, 230),
                chromeSolid = Color(0xFF1C1E22),
                statusBar = Color(0xFF17191D),
                chromeBorder = Color(148, 163, 184, 51),
                chromeShadow = Color(0, 0, 0, 107),
                accent = Color(0xFF94A3B8),
                hover = Color(148, 163, 184, 33),
                activeBg = Color(100, 116, 139, 66),
                activeFg = Color(0xFFCBD5E1),
                appBg = Color(0xFF161719),
                appBgGradient = null,
            ),
            swatchPrimary = Color(0xFF64748B),
            swatchSecondary = Color(0xFF475569),
            swatchSurface = Color(0xFFDDE1E7),
            gradFrom = Color(0xFF64748B),
            gradTo = Color(0xFF475569),
            switchOn = Color(0xFF64748B),
        ),
        WorkspaceThemeEntry(
            id = "blush",
            label = "Blush",
            light = WorkspaceThemeColors(
                chrome1 = Color(250, 219, 235, 230),
                chrome2 = Color(250, 215, 233, 230),
                chrome3 = Color(249, 213, 232, 230),
                chromeSolid = Color(0xFFF8E2F0),
                statusBar = Color(0xFFF7D4EA),
                chromeBorder = Color(200, 60, 140, 77),
                chromeShadow = Color(160, 30, 100, 28),
                accent = Color(0xFFDB2777),
                hover = Color(219, 39, 119, 26),
                activeBg = Color(219, 39, 119, 41),
                activeFg = Color(0xFF9D174D),
                appBg = Color(0xFFFDEAF4),
                appBgGradient = listOf(Color(0xFFFDEAF4), Color(0xFFFCE1EF), Color(0xFFFEF0F7)),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(48, 24, 40, 230),
                chrome2 = Color(52, 24, 42, 230),
                chrome3 = Color(54, 24, 44, 230),
                chromeSolid = Color(0xFF2C1622),
                statusBar = Color(0xFF26101C),
                chromeBorder = Color(244, 114, 182, 61),
                chromeShadow = Color(0, 0, 0, 102),
                accent = Color(0xFFF472B6),
                hover = Color(244, 114, 182, 36),
                activeBg = Color(219, 39, 119, 71),
                activeFg = Color(0xFFFBCFE8),
                appBg = Color(0xFF1B1218),
                appBgGradient = null,
            ),
            swatchPrimary = Color(0xFFEC4899),
            swatchSecondary = Color(0xFFBE185D),
            swatchSurface = Color(0xFFF7D4EA),
            gradFrom = Color(0xFFEC4899),
            gradTo = Color(0xFFBE185D),
            switchOn = Color(0xFFEC4899),
        ),
    )

    private val byId = ALL.associateBy { it.id }

    /** Falls back to the default theme for an unrecognized/blank id (a
     *  stale cache from before a theme was removed, say) rather than
     *  crash, same never-guess-but-never-break convention as the rest
     *  of this app's parsers. */
    fun forId(id: String?): WorkspaceThemeEntry = byId[id] ?: byId.getValue(DEFAULT_ID)

    fun colorsFor(id: String?, dark: Boolean): WorkspaceThemeColors {
        val entry = forId(id)
        return if (dark) entry.dark else entry.light
    }

    /** The web's header gradient. Only reached on a mouse-pointer device:
     *  the site's own `@media (pointer: coarse)` block replaces it with a
     *  flat [statusBarColor] fill, which is what every phone actually
     *  renders, so screens should use that instead. */
    fun headerGradient(id: String?, dark: Boolean): Brush {
        val c = colorsFor(id, dark)
        return Brush.linearGradient(listOf(c.chrome1, c.chrome2, c.chrome3))
    }

    fun headerBorderColor(id: String?, dark: Boolean): Color = colorsFor(id, dark).chromeBorder

    fun statusBarColor(id: String?, dark: Boolean): Color = colorsFor(id, dark).statusBar

    /** --gk-app-bg (+ --gk-app-bg-image in light mode): the page fill
     *  every screen sits on. CSS draws the light gradient at 135deg, i.e.
     *  top-left to bottom-right. */
    fun appBackground(id: String?, dark: Boolean): Brush {
        val c = colorsFor(id, dark)
        val stops = c.appBgGradient
        return if (stops == null) {
            SolidBrushOf(c.appBg)
        } else {
            Brush.linearGradient(stops, start = Offset.Zero, end = Offset.Infinite)
        }
    }

    fun accent(id: String?, dark: Boolean): Color = colorsFor(id, dark).accent

    /** --gk-chrome-hover: the pressed/hovered surface behind a nav row. */
    fun hoverColor(id: String?, dark: Boolean): Color = colorsFor(id, dark).hover

    fun activeBg(id: String?, dark: Boolean): Color = colorsFor(id, dark).activeBg

    fun activeFg(id: String?, dark: Boolean): Color = colorsFor(id, dark).activeFg

    /** The app's primary button/gradient fill, left to right. */
    fun accentGradient(id: String?): Brush {
        val entry = forId(id)
        return Brush.horizontalGradient(listOf(entry.gradFrom, entry.gradTo))
    }

    fun gradFrom(id: String?): Color = forId(id).gradFrom

    fun gradTo(id: String?): Color = forId(id).gradTo

    fun switchOnColor(id: String?): Color = forId(id).switchOn

    /** --gk-accent-soft-bg / --gk-accent-soft-border: color-mix of the
     *  accent at 12% / 24% over transparent, i.e. the same color at that
     *  alpha. */
    fun accentSoftBg(id: String?, dark: Boolean): Color = accent(id, dark).copy(alpha = 0.12f)

    fun accentSoftBorder(id: String?, dark: Boolean): Color = accent(id, dark).copy(alpha = 0.24f)

    /** --gk-icon-fg / --gk-icon-bg: the indigo-tier pill in front of a
     *  settings row. Derived off grad-from exactly as the CSS does. */
    fun iconPillFg(id: String?, dark: Boolean): Color =
        if (dark) mix(gradFrom(id), Color.White, 0.62f) else gradFrom(id)

    fun iconPillBg(id: String?, dark: Boolean): Color =
        gradFrom(id).copy(alpha = if (dark) 0.22f else 0.12f)

    /** --gk-icon2-fg / --gk-icon2-bg: the violet-tier pill in front of a
     *  settings section header. Derived off grad-to. */
    fun sectionPillFg(id: String?, dark: Boolean): Color =
        if (dark) mix(gradTo(id), Color.White, 0.62f) else gradTo(id)

    fun sectionPillBg(id: String?, dark: Boolean): Color =
        gradTo(id).copy(alpha = if (dark) 0.22f else 0.12f)

    /** CSS `color-mix(in srgb, [a] [aPercent]%, [b])`: a straight
     *  per-channel linear blend in sRGB. */
    private fun mix(a: Color, b: Color, aPercent: Float): Color = Color(
        red = a.red * aPercent + b.red * (1f - aPercent),
        green = a.green * aPercent + b.green * (1f - aPercent),
        blue = a.blue * aPercent + b.blue * (1f - aPercent),
        alpha = a.alpha * aPercent + b.alpha * (1f - aPercent),
    )
}

/** A one-color Brush. Compose has SolidColor for this, but expressing it
 *  as a Brush keeps [WorkspaceTheme.appBackground]'s return type single
 *  so call sites don't have to branch on light/dark themselves. */
private fun SolidBrushOf(color: Color): Brush = Brush.linearGradient(listOf(color, color))
