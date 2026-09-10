package com.glasskeep.app.nativeapp.ui

import android.content.Context
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.Indigo

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
    val borderColor = if (dark) Color.White.copy(alpha = 0.5f) else Color.Black.copy(alpha = 0.3f)
    Box(
        modifier = modifier
            .size(24.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(if (selected) Indigo else if (dark) Color(0xFF374151).copy(alpha = 0.8f) else Color.White.copy(alpha = 0.8f))
            .border(width = 2.dp, color = if (selected) Indigo else borderColor, shape = RoundedCornerShape(6.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onToggle() },
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            CheckSquareIcon(size = 16.dp, tint = Color.White)
        }
    }
}

/** The seven opaque tints MultiSelectToolbar.jsx gives its buttons
 *  (:36-51): a border, a fill and a glyph colour per tone, in light and
 *  dark. Nothing here is translucent, the dock is opaque on purpose. */
enum class BulkTone(
    private val lightBorder: Color,
    private val lightBg: Color,
    private val lightFg: Color,
    private val darkBorder: Color,
    private val darkBg: Color,
    private val darkFg: Color,
) {
    SLATE(Color(0xB3CBD5E1), Color(0xFFF1F5F9), Color(0xFF334155), Color(0x6664748B), Color(0xCC334155), Color(0xFFF1F5F9)),
    VIOLET(Color(0xCCC4B5FD), Color(0xFFEDE9FE), Color(0xFF5B21B6), Color(0x66A78BFA), Color(0xA65B21B6), Color(0xFFEDE9FE)),
    AMBER(Color(0xCCFCD34D), Color(0xFFFEF3C7), Color(0xFF92400E), Color(0x66FBBF24), Color(0x8C92400E), Color(0xFFFEF3C7)),
    BLUE(Color(0xCC7DD3FC), Color(0xFFE0F2FE), Color(0xFF075985), Color(0x6638BDF8), Color(0x99075985), Color(0xFFE0F2FE)),
    RED(Color(0xCCFDA4AF), Color(0xFFFFE4E6), Color(0xFFBE123C), Color(0x73FB7185), Color(0x8C881337), Color(0xFFFFE4E6)),
    GREEN(Color(0xCC6EE7B7), Color(0xFFD1FAE5), Color(0xFF065F46), Color(0x6634D399), Color(0x8C065F46), Color(0xFFD1FAE5)),
    CYAN(Color(0xCC67E8F9), Color(0xFFCFFAFE), Color(0xFF155E75), Color(0x6622D3EE), Color(0x8C155E75), Color(0xFFCFFAFE)),
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
    val onClick: () -> Unit,
)

/**
 * `.multi-select-dock` (globalCSS.js:829-981): the selection dock is
 * anchored to the TOP of the screen, not the bottom, 80dp under the safe
 * area, as an opaque violet card with a 2dp border. It grows in over
 * 220ms and disappears instantly, which is exactly what the web does on a
 * phone (its exit animation is disabled under 700px).
 *
 * One deliberate difference, disclosed rather than silently dropped: the
 * web measures its own width and folds whatever overflows into a kebab
 * menu. Native keeps every action on the row and lets it scroll
 * sideways if a very narrow screen needs it. This keeps select-all, logo
 * and ZIP export directly reachable alongside the existing actions.
 */
@Composable
internal fun SelectionActionBar(
    selectedCount: Int,
    actions: List<BulkActionButton>,
    onClose: () -> Unit,
    dark: Boolean,
    modifier: Modifier = Modifier,
) {
    val closeLabel = stringResource(R.string.native_bulk_exit)
    val dividerColor = if (dark) Color(0xFFA78BFA).copy(alpha = 0.22f) else Color(0xFF7C3AED).copy(alpha = 0.22f)
    val closeColor = if (dark) Color(0xFFEDE9FE) else Color(0xFF6D28D9)

    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    val progress by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = tween(durationMillis = 220, easing = CubicBezierEasing(0.22f, 0.61f, 0.36f, 1f)),
        label = "multiDockIn",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(top = 80.dp, start = 8.dp, end = 8.dp),
        contentAlignment = Alignment.TopCenter,
    ) {
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
                        if (dark) Color(0xFF5B21B6).copy(alpha = 0.6f) else Color(0xFFDDD6FE).copy(alpha = 0.7f),
                    )
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                // Compact mode drops the "Selected:" prefix and keeps the
                // number alone (MultiSelectToolbar.jsx's hidden sm:inline).
                Text(
                    selectedCount.toString(),
                    color = if (dark) Color(0xFFF5F3FF) else Color(0xFF4C1D95),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Box(Modifier.width(1.dp).height(24.dp).background(dividerColor))
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f, fill = false).horizontalScroll(rememberScrollState()),
            ) {
                actions.forEach { action ->
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .alpha(if (action.enabled) 1f else 0.4f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(action.tone.background(dark))
                            .border(1.dp, action.tone.border(dark), RoundedCornerShape(8.dp))
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
