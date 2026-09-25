package com.glasskeep.app.nativeapp.ui

import android.content.Context
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.ui.DarkBgColor

/** One bulk-selection run over several note ids: which ones succeeded and
 *  how many failed. Every action() call now enqueues onto the offline
 *  sync queue (see SyncQueueWorker.kt) rather than waiting on the server,
 *  so "succeeded" means enqueued, not server-confirmed, same as a single
 *  note's own queued actions (NoteDetailScreen.kt never waits on a server
 *  verdict either). "Failed" is a genuine local error (e.g. a Room write
 *  that threw), not a stale/read-only rejection: those aren't visible
 *  synchronously anymore. succeededIds lets a caller that isn't Room-backed
 *  (SecondaryNotesScreen.kt) patch its own local list precisely instead of
 *  guessing which ones actually went through. */
data class BulkOutcome(val succeededIds: List<String>, val failed: Int) {
    val succeeded: Int get() = succeededIds.size
}

/** Sequential, one enqueue at a time: there is no batch endpoint on the
 *  server, but unlike before this only ever costs a local Room write per
 *  note, not a real network round trip, so sequential adds negligible
 *  latency over the whole selection. Triggers one SyncQueueWorker drain
 *  at the end (not per item, see SyncQueueWorker.triggerNow's own
 *  ExistingWorkPolicy.KEEP) rather than requiring every call site to
 *  remember it, the way NoteDetailScreen.kt's single-note actions do. */
suspend fun runBulkAction(context: Context, ids: Collection<String>, action: suspend (String) -> Unit): BulkOutcome {
    val succeededIds = mutableListOf<String>()
    var failed = 0
    for (id in ids) {
        try {
            action(id)
            succeededIds.add(id)
        } catch (t: Throwable) {
            NativeDebug.e("Bulk action failed for note $id", t)
            failed++
        }
    }
    if (succeededIds.isNotEmpty()) SyncQueueWorker.triggerNow(context)
    return BulkOutcome(succeededIds, failed)
}

/** The always-visible checkbox NoteCard overlays in its top-end corner
 *  while selectionMode is on, mirroring NoteCard.jsx's own inline
 *  checkbox (a plain rounded-square div, not a Tabler icon, so ported
 *  as one directly rather than sourced from an SVG file). */
@Composable
internal fun SelectionCheckbox(selected: Boolean, dark: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    // NoteCard.jsx:225-256, Tailwind v4 colours.
    val selectedColor = Color(0xFF615FFF)
    val shape = RoundedCornerShape(6.dp)
    Box(
        modifier = modifier
            .size(24.dp)
            .clip(shape)
            .background(if (selected) selectedColor else if (dark) Color(0xCC364152) else Color.White.copy(alpha = 0.8f))
            .border(width = 2.dp, color = if (selected) selectedColor else if (dark) Color(0xFF6A7282) else Color(0xFFD1D5DC), shape = shape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onToggle() },
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            SaveCheckIcon(size = 16.dp, tint = Color.White)
        }
    }
}

/** The seven tints MultiSelectToolbar.jsx gives its buttons (:36-51), as
 *  the Tailwind v4 palette renders them: border, fill and glyph colour
 *  per tone, in light and dark. */
enum class BulkTone(
    private val lightBorder: Color,
    private val lightBg: Color,
    private val lightFg: Color,
    private val darkBorder: Color,
    private val darkBg: Color,
    private val darkFg: Color,
) {
    SLATE(Color(0xB3CAD5E2), Color(0xFFF1F5F9), Color(0xFF314158), Color(0x6662748E), Color(0xCC314158), Color(0xFFF1F5F9)),
    VIOLET(Color(0xCCC4B4FF), Color(0xFFEDE9FE), Color(0xFF5D0EC0), Color(0x66A884FF), Color(0xA65E0EC0), Color(0xFFEDE9FE)),
    AMBER(Color(0xCCFFD22F), Color(0xFFFEF3C6), Color(0xFF973C00), Color(0x66FFB900), Color(0x8C973C00), Color(0xFFFEF3C6)),
    BLUE(Color(0xCC73D4FF), Color(0xFFDFF2FE), Color(0xFF00598A), Color(0x6600BCFF), Color(0x9900598A), Color(0xFFDFF2FE)),
    RED(Color(0xCCFFA1AE), Color(0xFFFFE4E6), Color(0xFFC70036), Color(0x73FF647E), Color(0x8C8A0737), Color(0xFFFFE4E6)),
    GREEN(Color(0xCC5EE8B5), Color(0xFFD0FAE5), Color(0xFF006045), Color(0x6600D492), Color(0x8C006045), Color(0xFFD0FAE5)),
    CYAN(Color(0xCC52EAFC), Color(0xFFCEFAFE), Color(0xFF005F78), Color(0x6600D2F2), Color(0x8C005F78), Color(0xFFCEFAFE)),
    ;

    fun border(dark: Boolean) = if (dark) darkBorder else lightBorder
    fun background(dark: Boolean) = if (dark) darkBg else lightBg
    fun foreground(dark: Boolean) = if (dark) darkFg else lightFg
}

/** One 36dp square in the dock. [label] is the accessibility description
 *  and, on the web, the long-press tooltip: the compact mode every phone
 *  gets drops the button text entirely (MultiSelectToolbar.jsx:377). */
data class BulkActionButton(
    val label: String,
    val tone: BulkTone,
    val icon: @Composable () -> Unit,
    val enabled: Boolean = true,
    /** Only the side-by-side button looks disabled on the web; the others
     *  stay opaque and simply ignore taps while unusable. */
    val dimWhenDisabled: Boolean = false,
    /** Fill replacing the tone's (the side-by-side gradient). */
    val gradient: Brush? = null,
    /** Text colour of the entry once folded into the overflow menu. */
    val menuColor: Color = Color.Unspecified,
    val onClick: () -> Unit,
)

/**
 * `.multi-select-dock` (globalCSS.js:829-981): the selection dock is
 * anchored to the TOP of the screen, not the bottom, 80dp under the safe
 * area, as an opaque violet card with a 2dp border. It grows in over
 * 220ms and disappears instantly, which is exactly what the web does on a
 * phone (its exit animation is disabled under 700px).
 *
 * Like the web, it keeps as many actions as its width budget allows
 * (MultiSelectToolbar.jsx:415-447) and folds the rest, in order, into a
 * kebab menu.
 *
 * [headerVisible] follows the notes header's auto-hide: the dock rises to
 * 8dp under the status bar while the header is away (globalCSS.js:966-981).
 */
@Composable
internal fun SelectionActionBar(
    selectedCount: Int,
    actions: List<BulkActionButton>,
    onClose: () -> Unit,
    dark: Boolean,
    modifier: Modifier = Modifier,
    headerVisible: Boolean = true,
) {
    val closeLabel = stringResource(R.string.native_bulk_exit)
    val dividerColor = if (dark) Color(0xFFA78BFA).copy(alpha = 0.22f) else Color(0xFF7C3AED).copy(alpha = 0.22f)
    val closeColor = if (dark) Color(0xFFEDE9FE) else Color(0xFF7008E7)
    val dockEasing = CubicBezierEasing(0.22f, 0.61f, 0.36f, 1f)

    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    val progress by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = tween(durationMillis = 220, easing = dockEasing),
        label = "multiDockIn",
    )
    val top by animateDpAsState(
        targetValue = if (headerVisible) 80.dp else 8.dp,
        animationSpec = tween(durationMillis = 180, easing = dockEasing),
        label = "multiDockTop",
    )

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(top = top, start = 8.dp, end = 8.dp),
        contentAlignment = Alignment.TopCenter,
    ) {
        // PAD 20, counter ~32, dividers 17 x 2, close 36, then 36 + 8 per
        // button, 44 more for the kebab once anything overflows.
        val budget = maxWidth - 20.dp - 32.dp - 34.dp - 36.dp
        val fitAll = ((budget + 8.dp) / 44.dp).toInt()
        val visibleCount = if (fitAll >= actions.size) actions.size else ((budget - 44.dp + 8.dp) / 44.dp).toInt().coerceAtLeast(0)
        val shownActions = actions.take(visibleCount)
        val overflow = actions.drop(visibleCount)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier
                .graphicsLayer {
                    alpha = progress
                    scaleX = 0.96f + 0.04f * progress
                    scaleY = 0.96f + 0.04f * progress
                    translationY = (1f - progress) * -10.dp.toPx()
                }
                .clip(RoundedCornerShape(14.dp))
                .background(
                    Brush.linearGradient(
                        if (dark) {
                            listOf(Color(0xFF1E1A3D), Color(0xFF261F4F), Color(0xFF2C2456))
                        } else {
                            listOf(Color(0xFFFAF8FF), Color(0xFFF1ECFF), Color(0xFFEBE4FF))
                        },
                    ),
                )
                .border(
                    width = 2.dp,
                    color = if (dark) Color(0xFFA78BFA).copy(alpha = 0.36f) else Color(0xFF7C3AED).copy(alpha = 0.32f),
                    shape = RoundedCornerShape(14.dp),
                )
                .padding(horizontal = 8.dp, vertical = 6.dp),
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        if (dark) Color(0xFF5D0DC0).copy(alpha = 0.6f) else Color(0xFFDED7FF).copy(alpha = 0.7f),
                    )
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                // Compact mode drops the "Selected:" prefix and keeps the
                // number alone (MultiSelectToolbar.jsx's hidden sm:inline).
                Text(
                    selectedCount.toString(),
                    color = if (dark) Color(0xFFF5F3FF) else Color(0xFF4D179A),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
                )
            }
            Box(Modifier.width(1.dp).height(24.dp).background(dividerColor))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                shownActions.forEach { action -> DockActionButton(action, dark) }
                if (overflow.isNotEmpty()) DockOverflowMenu(overflow, dark)
            }
            Box(Modifier.width(1.dp).height(24.dp).background(dividerColor))
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .semantics { contentDescription = closeLabel }
                    .gkTooltip(closeLabel)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onClose() },
                contentAlignment = Alignment.Center,
            ) {
                CloseIcon(size = 24.dp, tint = closeColor)
            }
        }
    }
}

@Composable
private fun DockActionButton(action: BulkActionButton, dark: Boolean) {
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = Modifier
            .size(36.dp)
            .alpha(if (action.dimWhenDisabled && !action.enabled) 0.4f else 1f)
            .clip(shape)
            .then(
                if (action.gradient != null) {
                    Modifier.background(action.gradient)
                } else {
                    Modifier.background(action.tone.background(dark)).border(1.dp, action.tone.border(dark), shape)
                },
            )
            .semantics { contentDescription = action.label }
            .gkTooltip(action.label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = action.enabled,
                role = Role.Button,
            ) { action.onClick() },
        contentAlignment = Alignment.Center,
    ) {
        action.icon()
    }
}

/** The dock's kebab and its menu (globalCSS.js:917-940): right-aligned
 *  under the button, 8dp below it. */
@Composable
private fun DockOverflowMenu(actions: List<BulkActionButton>, dark: Boolean) {
    var open by remember { mutableStateOf(false) }
    val label = stringResource(R.string.native_note_detail_more)
    val kebabColor = if (dark) Color(0xFFDDD6FF) else Color(0xFF7008E7)
    Box {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(8.dp))
                .semantics { contentDescription = label }
                .gkTooltip(label)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { open = !open },
            contentAlignment = Alignment.Center,
        ) {
            KebabIcon(size = 20.dp, tint = kebabColor)
        }
        if (open) {
            val density = LocalDensity.current
            Popup(
                alignment = Alignment.TopEnd,
                offset = with(density) { IntOffset(0, (36.dp + 8.dp).roundToPx()) },
                onDismissRequest = { open = false },
                properties = PopupProperties(focusable = true),
            ) {
                val shape = RoundedCornerShape(10.dp)
                Column(
                    modifier = Modifier
                        .widthIn(min = 200.dp)
                        .width(IntrinsicSize.Max)
                        .shadow(16.dp, shape, ambientColor = Color(0x330F172A), spotColor = Color(0x330F172A))
                        .clip(shape)
                        .background(if (dark) Color(0xFF222222) else Color.White)
                        .border(1.dp, if (dark) Color.White.copy(alpha = 0.08f) else Color(0x4DD1D5DB), shape)
                        .padding(vertical = 4.dp),
                ) {
                    actions.forEach { action ->
                        PopoverMenuItem(
                            label = action.label,
                            color = action.menuColor,
                            enabled = action.enabled,
                            onClick = {
                                open = false
                                action.onClick()
                            },
                            icon = { Box(Modifier.width(20.dp), contentAlignment = Alignment.Center) { action.icon() } },
                        )
                    }
                }
            }
        }
    }
}

/** Generic yes/no confirmation, the same AlertDialog shape already
 *  repeated per-note in NoteDetailScreen.kt (trash / permanent delete)
 *  and in SettingsScreen.kt (delete passkey): pulled out here rather
 *  than written a fourth time for the bulk trash/permanent-delete
 *  confirms below. */
@Composable
internal fun ConfirmActionDialog(
    title: String,
    body: String,
    confirmLabel: String,
    confirmColor: Color,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirmLabel, color = confirmColor)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.native_note_detail_trash_confirm_cancel))
            }
        },
    )
}

/** Bulk color picker: same NOTE_COLOR_ORDER grid as NoteDetailScreen's
 *  single-note version (NoteColors.kt), minus the current-color ring,
 *  since a mixed selection has no single current color to highlight. */
@Composable
internal fun BulkColorPickerDialog(dark: Boolean, titleColor: Color, borderColor: Color, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(if (dark) DarkBgColor else Color.White)
                .padding(20.dp),
        ) {
            Text(
                stringResource(R.string.native_note_detail_color_title),
                color = titleColor,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
            Spacer(Modifier.height(16.dp))
            NOTE_COLOR_ORDER.chunked(4).forEach { rowKeys ->
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    rowKeys.forEach { colorKey ->
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(noteColorFor(colorKey, dark))
                                .border(width = 1.dp, color = borderColor, shape = CircleShape)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { onPick(colorKey) },
                        ) {}
                    }
                }
                Spacer(Modifier.height(14.dp))
            }
        }
    }
}
