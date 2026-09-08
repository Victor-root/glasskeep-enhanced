package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R

/**
 * Same bottom-right "speed dial" as MobileCreateFab.jsx: a round "+"
 * button that spins into an "x" and opens four labelled options above it.
 * Text, checklist and drawing actually create a note today, same scope
 * NoteDetailScreen already draws the line at (audio doesn't yet), tapping
 * that remaining option says so rather than creating a note the app then
 * can't let you edit.
 */
@Composable
fun CreateNoteFab(
    dark: Boolean,
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
    onCreateText: () -> Unit,
    onCreateChecklist: () -> Unit,
    onCreateDrawing: () -> Unit,
    onUnavailableType: () -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(
            visible = open,
            modifier = Modifier.fillMaxSize(),
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.3f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onOpenChange(false) },
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(24.dp),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AnimatedVisibility(
                visible = open,
                enter = fadeIn() + slideInVertically(initialOffsetY = { it / 4 }),
                exit = fadeOut() + slideOutVertically(targetOffsetY = { it / 4 }),
            ) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DialButton(
                        title = stringResource(R.string.native_fab_audio_note),
                        description = stringResource(R.string.native_fab_audio_note_desc),
                        icon = { tint -> MicIcon(size = 20.dp, tint = tint) },
                        colors = if (dark) DialColors.AudioDark else DialColors.AudioLight,
                        onClick = { onOpenChange(false); onUnavailableType() },
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
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .shadow(elevation = 6.dp, shape = RoundedCornerShape(16.dp))
                    .clip(RoundedCornerShape(16.dp))
                    .background(FabGradient)
                    .semantics { contentDescription = addNoteLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onOpenChange(!open) },
                contentAlignment = Alignment.Center,
            ) {
                PlusIcon(
                    size = 28.dp,
                    tint = Color.White,
                    modifier = Modifier.rotate(if (open) 45f else 0f),
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
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .width(176.dp)
            .clip(shape)
            .background(colors.background)
            .border(width = 2.dp, color = colors.border, shape = shape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(colors.iconBg),
            contentAlignment = Alignment.Center,
        ) {
            icon(colors.iconTint)
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Text(title, color = colors.text, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Text(
                description,
                color = colors.text.copy(alpha = 0.8f),
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

private val FabGradient = Brush.linearGradient(listOf(Color(0xFF6366f1), Color(0xFF7c3aed)))

private data class DialColors(
    val background: Brush,
    val border: Color,
    val text: Color,
    val iconBg: Color,
    val iconTint: Color,
) {
    // Ported from MobileCreateFab.jsx's colorClasses/iconBg per option
    // (Tailwind fuchsia/orange-rose/teal-emerald/indigo-violet families),
    // light and dark.
    companion object {
        val AudioLight = DialColors(
            background = Brush.linearGradient(listOf(Color(0xFFf5d0fe), Color(0xFFf9a8d4))),
            border = Color(0xFFf0abfc),
            text = Color(0xFF701a75),
            iconBg = Color.White.copy(alpha = 0.85f),
            iconTint = Color(0xFFc026d3),
        )
        val AudioDark = DialColors(
            background = Brush.linearGradient(listOf(Color(0xFF86198f), Color(0xFF831843))),
            border = Color(0xFFd946ef),
            text = Color(0xFFfdf4ff),
            iconBg = Color(0xFF4a044e).copy(alpha = 0.5f),
            iconTint = Color(0xFFfae8ff),
        )
        val DrawLight = DialColors(
            background = Brush.linearGradient(listOf(Color(0xFFfecdd3), Color(0xFFfed7aa))),
            border = Color(0xFFfdba74),
            text = Color(0xFF881337),
            iconBg = Color.White.copy(alpha = 0.85f),
            iconTint = Color(0xFFe11d48),
        )
        val DrawDark = DialColors(
            background = Brush.linearGradient(listOf(Color(0xFF9f1239), Color(0xFF7c2d12))),
            border = Color(0xFFf97316),
            text = Color(0xFFfff1f2),
            iconBg = Color(0xFF4c0519).copy(alpha = 0.5f),
            iconTint = Color(0xFFffe4e6),
        )
        val ChecklistLight = DialColors(
            background = Brush.linearGradient(listOf(Color(0xFF99f6e4), Color(0xFF6ee7b7))),
            border = Color(0xFF5eead4),
            text = Color(0xFF134e4a),
            iconBg = Color.White.copy(alpha = 0.85f),
            iconTint = Color(0xFF0f766e),
        )
        val ChecklistDark = DialColors(
            background = Brush.linearGradient(listOf(Color(0xFF115e59), Color(0xFF064e3b))),
            border = Color(0xFF14b8a6),
            text = Color(0xFFf0fdfa),
            iconBg = Color(0xFF042f2e).copy(alpha = 0.5f),
            iconTint = Color(0xFFccfbf1),
        )
        val TextLight = DialColors(
            background = Brush.linearGradient(listOf(Color(0xFFc7d2fe), Color(0xFFc4b5fd))),
            border = Color(0xFF818cf8),
            text = Color(0xFF312e81),
            iconBg = Color.White.copy(alpha = 0.85f),
            iconTint = Color(0xFF4f46e5),
        )
        val TextDark = DialColors(
            background = Brush.linearGradient(listOf(Color(0xFF3730a3), Color(0xFF4c1d95))),
            border = Color(0xFF6366f1),
            text = Color(0xFFeef2ff),
            iconBg = Color(0xFF1e1b4b).copy(alpha = 0.5f),
            iconTint = Color(0xFFe0e7ff),
        )
    }
}
