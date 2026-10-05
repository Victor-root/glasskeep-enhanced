package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.runtime.Composable

/**
 * A side bar or cutout on the right edge in landscape. Padding a bar's
 * content with it, rather than the bar itself, lets the bar's background
 * run to the screen's edge behind the transparent system bar.
 */
internal val rightSystemInsets: WindowInsets
    @Composable get() = WindowInsets.safeDrawing.only(WindowInsetsSides.Right)

/** The navigation bar's strip along the bottom edge only: a bar's own side
 *  edge is [rightSystemInsets]' business, so its background can run under it. */
internal val bottomNavigationBarInsets: WindowInsets
    @Composable get() = WindowInsets.navigationBars.only(WindowInsetsSides.Bottom)
