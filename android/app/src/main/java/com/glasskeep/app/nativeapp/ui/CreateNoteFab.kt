package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R

/**
 * MobileCreateFab.jsx's backdrop: black at 30%, fading in and out over
 * 200ms ease-out. It is its own layer because the web stacks it under the
 * sticky header (z-30 against z-40): the header stays sharp and undimmed
 * above it. The backdrop's 2px blur is applied by the caller to the page
 * layer underneath, since a blur here would only blur this empty box.
 * Taps are caught by the caller too, header included.
 */
@Composable
fun CreateNoteScrim(open: Boolean) {
    AnimatedVisibility(
        visible = open,
        modifier = Modifier.fillMaxSize(),
        enter = fadeIn(animationSpec = tween(200, easing = GkEaseOut)),
        exit = fadeOut(animationSpec = tween(200, easing = GkEaseOut)),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.3f)))
    }
}

/**
 * Same bottom-right "speed dial" as MobileCreateFab.jsx: a round "+"
 * button that spins into an "x" and opens four labelled options above it.
 * Every option actually creates a note now, matching what NoteDetailScreen
 * can edit natively for each type.
 */
@Composable
fun CreateNoteFab(
    dark: Boolean,
    themeId: String,
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
    onCreateText: () -> Unit,
    onCreateChecklist: () -> Unit,
    onCreateDrawing: () -> Unit,
    onCreateAudio: () -> Unit,
) {
    val density = LocalDensity.current
    // `max(1.5rem, calc(var(--safe-bottom|right) + 1rem))`.
    val systemBars = WindowInsets.systemBars.asPaddingValues()
    val bottom = maxOf(24.dp, systemBars.calculateBottomPadding() + 16.dp)
    val end = maxOf(24.dp, systemBars.calculateRightPadding(LayoutDirection.Ltr) + 16.dp)
    Box(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = bottom, end = end),
            horizontalAlignment = Alignment.End,
        ) {
            // The four options move as one group: 12px up into place while
            // fading in, the exact reverse on the way out.
            AnimatedVisibility(
                visible = open,
                enter = fadeIn(animationSpec = tween(200, easing = GkEaseOut)) +
                    slideInVertically(animationSpec = tween(200, easing = GkEaseOut)) { with(density) { 12.dp.roundToPx() } },
                exit = fadeOut(animationSpec = tween(200, easing = GkEaseOut)) +
                    slideOutVertically(animationSpec = tween(200, easing = GkEaseOut)) { with(density) { 12.dp.roundToPx() } },
            ) {
                Column(
                    modifier = Modifier.padding(bottom = 12.dp),
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    DialButton(
                        title = stringResource(R.string.native_fab_audio_note),
                        description = stringResource(R.string.native_fab_audio_note_desc),
                        icon = { tint -> MicIcon(size = 20.dp, tint = tint) },
                        colors = if (dark) DialColors.AudioDark else DialColors.AudioLight,
                        onClick = { onOpenChange(false); onCreateAudio() },
                    )
                    DialButton(
                        title = stringResource(R.string.native_fab_drawing),
                        description = stringResource(R.string.native_fab_drawing_desc),
                        icon = { tint -> BrushIcon(size = 20.dp, tint = tint) },
                        colors = if (dark) DialColors.DrawDark else DialColors.DrawLight,
                        onClick = { onOpenChange(false); onCreateDrawing() },
                    )
                    DialButton(
                        title = stringResource(R.string.native_fab_checklist),
                        description = stringResource(R.string.native_fab_checklist_desc),
                        icon = { tint -> ChecklistIcon(size = 20.dp, tint = tint) },
                        colors = if (dark) DialColors.ChecklistDark else DialColors.ChecklistLight,
                        onClick = { onOpenChange(false); onCreateChecklist() },
                    )
                    DialButton(
                        title = stringResource(R.string.native_fab_text_note),
                        description = stringResource(R.string.native_fab_text_note_desc),
                        icon = { tint -> TextNoteIcon(size = 20.dp, tint = tint) },
                        colors = if (dark) DialColors.TextDark else DialColors.TextLight,
                        onClick = { onOpenChange(false); onCreateText() },
                    )
                }
            }

            val addNoteLabel = stringResource(R.string.native_fab_add_note)
            val fabInteractionSource = remember { MutableInteractionSource() }
            val fabPressed by fabInteractionSource.collectIsPressedAsState()
            val fabScale by animateFloatAsState(
                targetValue = if (fabPressed) 0.95f else 1f,
                animationSpec = tween(200, easing = GkStandardEasing),
                label = "fabScale",
            )
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .scale(fabScale)
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        if (WorkspaceTheme.forId(themeId).id == WorkspaceTheme.DEFAULT_ID) {
                            FabGradient
                        } else {
                            WorkspaceTheme.buttonGradient(themeId)
                        },
                    )
                    .semantics { contentDescription = addNoteLabel }
                    .clickable(
                        interactionSource = fabInteractionSource,
                        indication = null,
                        role = Role.Button,
                    ) { onOpenChange(!open) },
                contentAlignment = Alignment.Center,
            ) {
                val rotation by animateFloatAsState(
                    targetValue = if (open) 45f else 0f,
                    animationSpec = tween(200, easing = GkStandardEasing),
                    label = "fabRotation",
                )
                PlusIcon(
                    size = 28.dp,
                    tint = Color.White,
                    modifier = Modifier.rotate(rotation),
                )
            }
        }
    }
}

@Composable
private fun DialButton(
    title: String,
    description: String,
    icon: @Composable (tint: Color) -> Unit,
    colors: DialColors,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = tween(150, easing = GkStandardEasing),
        label = "dialScale",
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .width(176.dp)
            .scale(scale)
            .clip(shape)
            .background(colors.background)
            .border(width = 2.dp, color = colors.border, shape = shape)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Button,
            ) { onClick() }
            // The web's 2px border sits inside its box, on top of px-3 py-2.5.
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(colors.iconBg),
            contentAlignment = Alignment.Center,
        ) {
            icon(colors.iconTint)
        }
        Spacer(Modifier.width(10.dp))
        Column {
            // leading-tight / leading-snug on the web.
            Text(title, color = colors.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 17.5.sp)
            Text(
                description,
                color = colors.text.copy(alpha = 0.8f),
                fontSize = 11.sp,
                lineHeight = 15.125.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

/** The button's own `from-indigo-500 to-violet-600` to the bottom right,
 *  which every other theme's btn-gradient rule replaces (globalCSS.js:338). */
private val FabGradient = cssToBottomRightGradient(listOf(Color(0xFF615FFF), Color(0xFF7F22FE)))

private data class DialColors(
    val background: Brush,
    val border: Color,
    val text: Color,
    val iconBg: Color,
    val iconTint: Color,
) {
    // MobileCreateFab.jsx's colorClasses/iconBg per option (Tailwind
    // fuchsia/orange-rose/teal-emerald/indigo-violet families), light and
    // dark, in the Tailwind v4 values the web paints.
    companion object {
        val AudioLight = DialColors(
            background = cssToBottomRightGradient(listOf(Color(0xFFF6CFFF), Color(0xFFFDA5D5))),
            border = Color(0xFFF4A8FF),
            text = Color(0xFF721378),
            iconBg = Color.White.copy(alpha = 0.85f),
            iconTint = Color(0xFFC800DE),
        )
        val AudioDark = DialColors(
            background = cssToBottomRightGradient(listOf(Color(0xFF8A0194), Color(0xFF861043))),
            border = Color(0xFFE12AFB),
            text = Color(0xFFFDF4FF),
            iconBg = Color(0xFF4B004F).copy(alpha = 0.5f),
            iconTint = Color(0xFFFAE8FF),
        )
        val DrawLight = DialColors(
            background = cssToBottomRightGradient(listOf(Color(0xFFFFCCD3), Color(0xFFFFD6A7))),
            border = Color(0xFFFFB86A),
            text = Color(0xFF8B0836),
            iconBg = Color.White.copy(alpha = 0.85f),
            iconTint = Color(0xFFEC003F),
        )
        val DrawDark = DialColors(
            background = cssToBottomRightGradient(listOf(Color(0xFFA50036), Color(0xFF7E2A0C))),
            border = Color(0xFFFF6900),
            text = Color(0xFFFFF1F2),
            iconBg = Color(0xFF4D0218).copy(alpha = 0.5f),
            iconTint = Color(0xFFFFE4E6),
        )
        val ChecklistLight = DialColors(
            background = cssToBottomRightGradient(listOf(Color(0xFF96F7E4), Color(0xFF5EE9B5))),
            border = Color(0xFF46ECD5),
            text = Color(0xFF0B4F4A),
            iconBg = Color.White.copy(alpha = 0.85f),
            iconTint = Color(0xFF00786F),
        )
        val ChecklistDark = DialColors(
            background = cssToBottomRightGradient(listOf(Color(0xFF005F5A), Color(0xFF004F3B))),
            border = Color(0xFF00BBA7),
            text = Color(0xFFF0FDFA),
            iconBg = Color(0xFF022F2E).copy(alpha = 0.5f),
            iconTint = Color(0xFFCBFBF1),
        )
        val TextLight = DialColors(
            background = cssToBottomRightGradient(listOf(Color(0xFFC6D2FF), Color(0xFFC4B4FF))),
            border = Color(0xFF7C86FF),
            text = Color(0xFF312C85),
            iconBg = Color.White.copy(alpha = 0.85f),
            iconTint = Color(0xFF4F39F6),
        )
        val TextDark = DialColors(
            background = cssToBottomRightGradient(listOf(Color(0xFF372AAC), Color(0xFF4D179A))),
            border = Color(0xFF615FFF),
            text = Color(0xFFEEF2FF),
            iconBg = Color(0xFF1E1A4D).copy(alpha = 0.5f),
            iconTint = Color(0xFFE0E7FF),
        )
    }
}
