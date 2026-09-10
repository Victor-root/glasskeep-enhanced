package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R

/**
 * Same bottom-right "speed dial" as MobileCreateFab.jsx: a round "+"
 * button that spins into an "x" and opens four labelled options above it.
 * Every option actually creates a note now, matching what NoteDetailScreen
 * can edit natively for each type.
 */
@Composable
fun CreateNoteFab(
    dark: Boolean,
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
    onCreateText: () -> Unit,
    onCreateChecklist: () -> Unit,
    onCreateDrawing: () -> Unit,
    onCreateAudio: () -> Unit,
) {
    val density = LocalDensity.current
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(
            visible = open,
            modifier = Modifier.fillMaxSize(),
            enter = fadeIn(animationSpec = tween(200)),
            exit = fadeOut(animationSpec = tween(200)),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    // backdrop-blur-[2px] in MobileCreateFab.jsx. Modifier.blur
                    // only actually blurs on API 31+ (RenderEffect); older
                    // devices degrade gracefully to the plain tint below,
                    // same as browsers without backdrop-filter support.
                    .blur(2.dp)
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
            val dialButtons = remember(dark) {
                listOf<Triple<Int, Int, @Composable (Color) -> Unit>>(
                    Triple(R.string.native_fab_audio_note, R.string.native_fab_audio_note_desc) { tint -> MicIcon(size = 20.dp, tint = tint) },
                    Triple(R.string.native_fab_drawing, R.string.native_fab_drawing_desc) { tint -> BrushIcon(size = 20.dp, tint = tint) },
                    Triple(R.string.native_fab_checklist, R.string.native_fab_checklist_desc) { tint -> ChecklistIcon(size = 20.dp, tint = tint) },
                    Triple(R.string.native_fab_text_note, R.string.native_fab_text_note_desc) { tint -> TextNoteIcon(size = 20.dp, tint = tint) },
                )
            }
            val dialColors = listOf(
                if (dark) DialColors.AudioDark else DialColors.AudioLight,
                if (dark) DialColors.DrawDark else DialColors.DrawLight,
                if (dark) DialColors.ChecklistDark else DialColors.ChecklistLight,
                if (dark) DialColors.TextDark else DialColors.TextLight,
            )
            val onClicks = listOf<() -> Unit>(
                { onOpenChange(false); onCreateAudio() },
                { onOpenChange(false); onCreateDrawing() },
                { onOpenChange(false); onCreateChecklist() },
                { onOpenChange(false); onCreateText() },
            )

            // Cascading reveal from the bottom tile up: a little native flair
            // the web's single-group fade/slide doesn't have room for, each
            // tile entering slightly after the one below it.
            dialButtons.forEachIndexed { index, (titleRes, descRes, icon) ->
                val delayMs = (dialButtons.size - 1 - index) * 30
                AnimatedVisibility(
                    visible = open,
                    enter = fadeIn(animationSpec = tween(220, delayMillis = delayMs)) +
                        slideInVertically(animationSpec = tween(220, delayMillis = delayMs)) { with(density) { 16.dp.roundToPx() } },
                    exit = fadeOut(animationSpec = tween(150)) +
                        slideOutVertically(animationSpec = tween(150)) { with(density) { 12.dp.roundToPx() } },
                ) {
                    DialButton(
                        title = stringResource(titleRes),
                        description = stringResource(descRes),
                        icon = icon,
                        colors = dialColors[index],
                        onClick = onClicks[index],
                    )
                }
            }

            val addNoteLabel = stringResource(R.string.native_fab_add_note)
            val fabInteractionSource = remember { MutableInteractionSource() }
            val fabPressed by fabInteractionSource.collectIsPressedAsState()
            val fabScale by animateFloatAsState(
                targetValue = if (fabPressed) 0.95f else 1f,
                animationSpec = spring(stiffness = Spring.StiffnessMedium),
                label = "fabScale",
            )
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .scale(fabScale)
                    .clip(RoundedCornerShape(16.dp))
                    .background(FabGradient)
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
                    animationSpec = tween(200),
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
            Text(title, color = colors.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
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
