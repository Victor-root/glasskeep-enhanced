package com.glasskeep.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF1565C0),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD1E4FF),
    surface = Color(0xFFFAFAFA),
    background = Color(0xFFFAFAFA)
)

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF90CAF9),
    onPrimary = Color(0xFF0D3B66),
    primaryContainer = Color(0xFF1565C0),
    surface = Color(0xFF121212),
    background = Color(0xFF121212)
)

// The web's text never carries Material's letter spacing, and Tailwind's
// preflight gives the whole page `line-height: 1.5`, which every element
// without its own line height inherits as a factor of its font size.
// Material 3 would otherwise hand every Text that only sets a size its
// bodyLarge 0.5sp tracking and fixed 24sp line, and Compose would trim a
// single line's box to the font's own height where CSS keeps the full,
// centred line height.
private fun TextStyle.web() = copy(
    letterSpacing = 0.sp,
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
)

private val WebTypography = Typography().run {
    Typography(
        displayLarge = displayLarge.web(),
        displayMedium = displayMedium.web(),
        displaySmall = displaySmall.web(),
        headlineLarge = headlineLarge.web(),
        headlineMedium = headlineMedium.web(),
        headlineSmall = headlineSmall.web(),
        titleLarge = titleLarge.web(),
        titleMedium = titleMedium.web(),
        titleSmall = titleSmall.web(),
        bodyLarge = bodyLarge.web().copy(lineHeight = 1.5.em),
        bodyMedium = bodyMedium.web(),
        bodySmall = bodySmall.web(),
        labelLarge = labelLarge.web(),
        labelMedium = labelMedium.web(),
        labelSmall = labelSmall.web(),
    )
}

@Composable
fun GlassKeepTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context)
            else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}

/**
 * Theme of the native notes app, which reproduces the web app: no
 * wallpaper-derived colors (the web never has any), the app's own dark
 * setting rather than only the system's, the workspace accent wherever
 * Material falls back to its primary color, and web text metrics.
 */
@Composable
fun GlassKeepWebTheme(
    darkTheme: Boolean,
    accent: Color,
    content: @Composable () -> Unit
) {
    val base = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = base.copy(primary = accent, onPrimary = Color.White),
        typography = WebTypography,
        content = content
    )
}
