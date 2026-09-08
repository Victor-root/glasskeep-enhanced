package com.glasskeep.app.nativeapp.ui

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * The six "workspace" shell themes, ported value for value from
 * src/styles/globalCSS.js's --gk-chrome-1/2/3 / --gk-chrome-border /
 * --gk-statusbar / --gk-chrome-accent / --gk-chrome-grad-from/to / --gk-app-bg
 * token blocks (one block per theme, light then dark), and the id/label
 * list from src/theme/shellTheme.js's SHELL_THEMES. GlassKeep is the
 * default and has no CSS class on the web; here it's simply the first,
 * always-valid entry (see [forId]'s fallback).
 *
 * Scope matches the web's own: this recolors the header chrome and the
 * status bar only (see [headerGradient]/[headerBorderColor] and
 * NativeAppActivity's status-bar tinting), not the accent color used
 * for buttons/highlights throughout the rest of each screen (still the
 * fixed Indigo from com.glasskeep.app.ui, shared with the pre-login
 * onboarding flow), and not the login/onboarding screens themselves,
 * exactly as the web's own theme comment states ("intentionally do NOT
 * touch ... the login page"). A disclosed, narrower slice of the web's
 * full theme reach, not an oversight.
 */
data class WorkspaceThemeColors(
    val chrome1: Color,
    val chrome2: Color,
    val chrome3: Color,
    val chromeBorder: Color,
    val statusBar: Color,
    val appBg: Color,
)

data class WorkspaceThemeEntry(
    val id: String,
    val label: String,
    val light: WorkspaceThemeColors,
    val dark: WorkspaceThemeColors,
    /** For the picker's preview swatch, same [primary, secondary] pair as
     *  SHELL_THEMES' own swatch[0]/swatch[1] on the web. */
    val swatchPrimary: Color,
    val swatchSecondary: Color,
)

object WorkspaceTheme {
    const val DEFAULT_ID = "glasskeep"

    val ALL: List<WorkspaceThemeEntry> = listOf(
        WorkspaceThemeEntry(
            id = "glasskeep",
            label = "GlassKeep",
            light = WorkspaceThemeColors(
                chrome1 = Color(212 / 255f, 221 / 255f, 252 / 255f, 0.90f),
                chrome2 = Color(221 / 255f, 217 / 255f, 252 / 255f, 0.90f),
                chrome3 = Color(231 / 255f, 215 / 255f, 252 / 255f, 0.90f),
                chromeBorder = Color(120 / 255f, 134 / 255f, 196 / 255f, 0.28f),
                statusBar = Color(0xFFDCE1FB),
                appBg = Color(0xFFEEE5FF),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(30 / 255f, 36 / 255f, 64 / 255f, 0.90f),
                chrome2 = Color(36 / 255f, 33 / 255f, 66 / 255f, 0.90f),
                chrome3 = Color(44 / 255f, 32 / 255f, 66 / 255f, 0.90f),
                chromeBorder = Color(126 / 255f, 142 / 255f, 200 / 255f, 0.20f),
                statusBar = Color(0xFF171F30),
                appBg = Color(0xFF1A1A1A),
            ),
            swatchPrimary = Color(0xFF6366F1),
            swatchSecondary = Color(0xFF7C3AED),
        ),
        WorkspaceThemeEntry(
            id = "emerald",
            label = "Emerald",
            light = WorkspaceThemeColors(
                chrome1 = Color(205 / 255f, 238 / 255f, 223 / 255f, 0.90f),
                chrome2 = Color(206 / 255f, 236 / 255f, 228 / 255f, 0.90f),
                chrome3 = Color(208 / 255f, 235 / 255f, 234 / 255f, 0.90f),
                chromeBorder = Color(45 / 255f, 150 / 255f, 120 / 255f, 0.28f),
                statusBar = Color(0xFFD2ECDF),
                appBg = Color(0xFFE8F6EE),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(20 / 255f, 40 / 255f, 34 / 255f, 0.90f),
                chrome2 = Color(22 / 255f, 42 / 255f, 38 / 255f, 0.90f),
                chrome3 = Color(24 / 255f, 44 / 255f, 42 / 255f, 0.90f),
                chromeBorder = Color(64 / 255f, 170 / 255f, 134 / 255f, 0.20f),
                statusBar = Color(0xFF10211B),
                appBg = Color(0xFF141A17),
            ),
            swatchPrimary = Color(0xFF10B981),
            swatchSecondary = Color(0xFF0D9488),
        ),
        WorkspaceThemeEntry(
            id = "amber",
            label = "Amber",
            light = WorkspaceThemeColors(
                chrome1 = Color(250 / 255f, 232 / 255f, 206 / 255f, 0.90f),
                chrome2 = Color(250 / 255f, 228 / 255f, 204 / 255f, 0.90f),
                chrome3 = Color(250 / 255f, 224 / 255f, 205 / 255f, 0.90f),
                chromeBorder = Color(190 / 255f, 140 / 255f, 60 / 255f, 0.30f),
                statusBar = Color(0xFFF6E3C9),
                appBg = Color(0xFFFDF2E2),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(42 / 255f, 33 / 255f, 20 / 255f, 0.90f),
                chrome2 = Color(44 / 255f, 34 / 255f, 20 / 255f, 0.90f),
                chrome3 = Color(46 / 255f, 34 / 255f, 21 / 255f, 0.90f),
                chromeBorder = Color(200 / 255f, 150 / 255f, 70 / 255f, 0.20f),
                statusBar = Color(0xFF20190F),
                appBg = Color(0xFF1B1712),
            ),
            swatchPrimary = Color(0xFFD97706),
            swatchSecondary = Color(0xFFB45309),
        ),
        WorkspaceThemeEntry(
            id = "rosewood",
            label = "Ruby",
            light = WorkspaceThemeColors(
                chrome1 = Color(250 / 255f, 210 / 255f, 210 / 255f, 0.90f),
                chrome2 = Color(250 / 255f, 205 / 255f, 205 / 255f, 0.90f),
                chrome3 = Color(249 / 255f, 202 / 255f, 202 / 255f, 0.90f),
                chromeBorder = Color(200 / 255f, 40 / 255f, 40 / 255f, 0.32f),
                statusBar = Color(0xFFF7CCCC),
                appBg = Color(0xFFFDEAEA),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(50 / 255f, 22 / 255f, 22 / 255f, 0.90f),
                chrome2 = Color(54 / 255f, 22 / 255f, 22 / 255f, 0.90f),
                chrome3 = Color(58 / 255f, 22 / 255f, 22 / 255f, 0.90f),
                chromeBorder = Color(248 / 255f, 80 / 255f, 80 / 255f, 0.24f),
                statusBar = Color(0xFF261010),
                appBg = Color(0xFF1A1212),
            ),
            swatchPrimary = Color(0xFFE11D1D),
            swatchSecondary = Color(0xFF9F1010),
        ),
        WorkspaceThemeEntry(
            id = "graphite",
            label = "Graphite",
            light = WorkspaceThemeColors(
                chrome1 = Color(223 / 255f, 227 / 255f, 233 / 255f, 0.90f),
                chrome2 = Color(220 / 255f, 224 / 255f, 231 / 255f, 0.90f),
                chrome3 = Color(218 / 255f, 222 / 255f, 229 / 255f, 0.90f),
                chromeBorder = Color(100 / 255f, 116 / 255f, 139 / 255f, 0.30f),
                statusBar = Color(0xFFDDE1E7),
                appBg = Color(0xFFEEF1F5),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(30 / 255f, 33 / 255f, 39 / 255f, 0.90f),
                chrome2 = Color(32 / 255f, 35 / 255f, 41 / 255f, 0.90f),
                chrome3 = Color(34 / 255f, 37 / 255f, 44 / 255f, 0.90f),
                chromeBorder = Color(148 / 255f, 163 / 255f, 184 / 255f, 0.20f),
                statusBar = Color(0xFF17191D),
                appBg = Color(0xFF161719),
            ),
            swatchPrimary = Color(0xFF64748B),
            swatchSecondary = Color(0xFF475569),
        ),
        WorkspaceThemeEntry(
            id = "blush",
            label = "Blush",
            light = WorkspaceThemeColors(
                chrome1 = Color(250 / 255f, 219 / 255f, 235 / 255f, 0.90f),
                chrome2 = Color(250 / 255f, 215 / 255f, 233 / 255f, 0.90f),
                chrome3 = Color(249 / 255f, 213 / 255f, 232 / 255f, 0.90f),
                chromeBorder = Color(200 / 255f, 60 / 255f, 140 / 255f, 0.30f),
                statusBar = Color(0xFFF7D4EA),
                appBg = Color(0xFFFDEAF4),
            ),
            dark = WorkspaceThemeColors(
                chrome1 = Color(48 / 255f, 24 / 255f, 40 / 255f, 0.90f),
                chrome2 = Color(52 / 255f, 24 / 255f, 42 / 255f, 0.90f),
                chrome3 = Color(54 / 255f, 24 / 255f, 44 / 255f, 0.90f),
                chromeBorder = Color(244 / 255f, 114 / 255f, 182 / 255f, 0.24f),
                statusBar = Color(0xFF26101C),
                appBg = Color(0xFF1B1218),
            ),
            swatchPrimary = Color(0xFFEC4899),
            swatchSecondary = Color(0xFFBE185D),
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

    fun headerGradient(id: String?, dark: Boolean): Brush {
        val c = colorsFor(id, dark)
        return Brush.linearGradient(listOf(c.chrome1, c.chrome2, c.chrome3))
    }

    fun headerBorderColor(id: String?, dark: Boolean): Color = colorsFor(id, dark).chromeBorder

    fun statusBarColor(id: String?, dark: Boolean): Color = colorsFor(id, dark).statusBar
}
