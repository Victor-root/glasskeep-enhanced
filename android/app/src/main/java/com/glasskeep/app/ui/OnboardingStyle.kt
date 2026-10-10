package com.glasskeep.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.glasskeep.app.R

// Shared palette: setup + welcome screens both pull from these so the
// onboarding flow stays visually consistent. `internal` keeps the
// surface scoped to this module (no public API leak).

// Light theme
internal val LightBgGradient = Brush.linearGradient(
    colors = listOf(Color(0xFFf0e8ff), Color(0xFFe8f4fd), Color(0xFFfde8f0)),
    start = Offset(0f, 0f),
    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
)
internal val LightCardBg = Color(0xFFFFFFFF)
internal val LightTitleColor = Color(0xFF1f2937)
internal val LightSubtextColor = Color(0xFF6b7280)
internal val LightBorderColor = Color(0xFFd1d5db).copy(alpha = 0.3f)

// Dark theme
internal val DarkBgColor = Color(0xFF1a1a1a)
internal val DarkCardBg = Color(0xFF282828)
internal val DarkTitleColor = Color(0xFFe5e7eb)
internal val DarkSubtextColor = Color(0xFF9ca3af)
internal val DarkBorderColor = Color(0xFF4b5563).copy(alpha = 0.3f)

internal val ButtonGradient = Brush.horizontalGradient(
    colors = listOf(Color(0xFF6366f1), Color(0xFF7c3aed))
)
internal val Indigo = Color(0xFF6366f1)

/** The gradient button of the onboarding screens. Focus from a remote or
 *  a keyboard rings it in white and enlarges it, so a D-pad shows where
 *  it is. */
@Composable
internal fun GradientButton(
    onClick: () -> Unit,
    shape: Shape,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    Box(
        modifier = modifier
            .scale(if (focused) 1.04f else 1f)
            .clip(shape)
            .background(ButtonGradient)
            .then(if (focused) Modifier.border(3.dp, Color.White, shape) else Modifier)
            .clickable(
                interactionSource = interactionSource,
                indication = LocalIndication.current,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(contentPadding),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/** The app logo heading the onboarding screens, in a rounded tile with a
 *  shadow. */
@Composable
internal fun GlassKeepLogo(size: Dp, cornerRadius: Dp, elevation: Dp) {
    Image(
        painter = painterResource(id = R.drawable.glasskeep_logo),
        contentDescription = "GlassKeep",
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(cornerRadius))
            .shadow(elevation, RoundedCornerShape(cornerRadius))
    )
}
