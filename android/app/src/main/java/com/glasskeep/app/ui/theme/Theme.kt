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
// bodyLarge 0.5sp tracking and fixed 24sp line.
private val WebTypography = Typography().run {
    Typography(
        displayLarge = displayLarge.copy(letterSpacing = 0.sp),
        displayMedium = displayMedium.copy(letterSpacing = 0.sp),
        displaySmall = displaySmall.copy(letterSpacing = 0.sp),
        headlineLarge = headlineLarge.copy(letterSpacing = 0.sp),
        headlineMedium = headlineMedium.copy(letterSpacing = 0.sp),
        headlineSmall = headlineSmall.copy(letterSpacing = 0.sp),
        titleLarge = titleLarge.copy(letterSpacing = 0.sp),
        titleMedium = titleMedium.copy(letterSpacing = 0.sp),
        titleSmall = titleSmall.copy(letterSpacing = 0.sp),
        bodyLarge = bodyLarge.copy(lineHeight = 1.5.em, letterSpacing = 0.sp),
        bodyMedium = bodyMedium.copy(letterSpacing = 0.sp),
        bodySmall = bodySmall.copy(letterSpacing = 0.sp),
        labelLarge = labelLarge.copy(letterSpacing = 0.sp),
        labelMedium = labelMedium.copy(letterSpacing = 0.sp),
        labelSmall = labelSmall.copy(letterSpacing = 0.sp),
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
