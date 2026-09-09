package com.glasskeep.app.nativeapp.ui

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
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.Indigo

/** One bulk-selection run over several note ids: which ones succeeded
 *  (network error, or a stale/read-only result the repository already
 *  detected, both count as not-succeeded) and how many failed. Mirrors
 *  what each SaveNoteResult/DeleteResult already encodes per note, just
 *  tallied across the whole selection. succeededIds lets a caller that
 *  isn't Room-backed (SecondaryNotesScreen.kt) patch its own local list
 *  precisely instead of guessing which ones actually went through. */
data class BulkOutcome(val succeededIds: List<String>, val failed: Int) {
    val succeeded: Int get() = succeededIds.size
}

/** Sequential, one request at a time, same as the web app's own sync
 *  queue actually sends them (see this milestone's commit message):
 *  there is no batch endpoint on the server, and native has no offline
 *  queue yet to hide a failure behind (that's its own later milestone),
 *  so a failed note is counted and reported rather than silently lost. */
suspend fun runBulkAction(ids: Collection<String>, action: suspend (String) -> Boolean): BulkOutcome {
    val succeededIds = mutableListOf<String>()
    var failed = 0
    for (id in ids) {
        val ok = try {
            action(id)
        } catch (t: Throwable) {
            NativeDebug.e("Bulk action failed for note $id", t)
            false
        }
        if (ok) succeededIds.add(id) else failed++
    }
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

/** One icon-only button in the floating selection bar. label is used as
 *  the accessibility content description only (mirrors the web dock's
 *  own compact/mobile mode, which drops button text and keeps a
 *  tooltip, see MultiSelectToolbar.jsx). */
data class BulkActionButton(
    val label: String,
    val icon: @Composable () -> Unit,
    val enabled: Boolean = true,
    val onClick: () -> Unit,
)

/** Floating bottom dock while a screen is in selection mode: a count
 *  badge, one icon button per available action (varies by screen, see
 *  NativeNotesListScreen.kt / SecondaryNotesScreen.kt call sites), and a
 *  close button that exits selection without acting on anything. */
@Composable
internal fun SelectionActionBar(
    selectedCount: Int,
    actions: List<BulkActionButton>,
    onClose: () -> Unit,
    dark: Boolean,
    modifier: Modifier = Modifier,
) {
    val bg = if (dark) Color(0xFF1f1f1f) else Color.White
    val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val closeLabel = stringResource(R.string.native_qr_scan_close)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(start = 14.dp, end = 6.dp, top = 8.dp, bottom = 8.dp)
            .padding(bottom = navBarBottom),
    ) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Indigo)
                .padding(horizontal = 10.dp, vertical = 4.dp),
        ) {
            Text(
                String.format(stringResource(R.string.native_bulk_selected_count), selectedCount),
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
            actions.forEach { action ->
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .semantics { contentDescription = action.label }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            enabled = action.enabled,
                            role = Role.Button,
                        ) { action.onClick() }
                        .padding(8.dp),
                ) {
                    action.icon()
                }
            }
        }
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .semantics { contentDescription = closeLabel }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onClose() }
                .padding(8.dp),
        ) {
            CloseIcon(size = 18.dp, tint = if (dark) Color.White else Color.Black)
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
