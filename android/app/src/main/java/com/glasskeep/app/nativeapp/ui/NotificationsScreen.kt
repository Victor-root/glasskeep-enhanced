package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.NotificationDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/**
 * Share/collaboration notifications inbox: pending (not yet acknowledged)
 * and recent history, merged into one list, newest first. Fetched fresh
 * every time this screen opens, no background polling: the web itself
 * only fetches this same pair of routes once per login/reload too,
 * relying on SSE (which native doesn't have yet, see the realtime task)
 * for anything live while a session is already open. Native also has no
 * notification channel wired up for these events (see ReminderNotifier.kt,
 * whose one channel is reminder-specific), so there would be nothing for
 * a background job to show even if it polled. See this milestone's own
 * commit message for the detail.
 *
 * Opening this screen is the acknowledgment moment, mirroring the web
 * bell's own "opening the panel marks everything shown as delivered"
 * behavior: every notification that was still pending at load time gets
 * marked delivered right after being fetched (see NotesRepository.
 * markNotificationsDelivered), not on a per-row dismiss.
 */
@Composable
fun NotificationsScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onOpenNote: (String) -> Unit,
    onBack: () -> Unit,
) {
    val dark = isSystemInDarkTheme()
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()

    var notifications by remember { mutableStateOf<List<NotificationDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val errorTemplate = stringResource(R.string.native_notifications_error)
    val emptyMessage = stringResource(R.string.native_notifications_empty)
    val newLabel = stringResource(R.string.native_notifications_new)
    val sharedMessage = stringResource(R.string.native_notifications_note_shared)
    val sharedReadOnlyMessage = stringResource(R.string.native_notifications_note_shared_read_only)
    val accessRevokedMessage = stringResource(R.string.native_notifications_access_revoked)
    val accessRevokedWithCopyMessage = stringResource(R.string.native_notifications_access_revoked_with_copy)
    val collaboratorRemovedMessage = stringResource(R.string.native_notifications_collaborator_removed)
    val collaboratorRemovedWithCopyMessage = stringResource(R.string.native_notifications_collaborator_removed_with_copy)
    val collaboratorLeftMessage = stringResource(R.string.native_notifications_collaborator_left)
    val sharedNoteDeletedMessage = stringResource(R.string.native_notifications_shared_note_deleted)
    val sharedNoteDeletedWithCopyMessage = stringResource(R.string.native_notifications_shared_note_deleted_with_copy)

    fun messageFor(n: NotificationDto): String = when (n.type) {
        "note_shared" -> String.format(if (n.variant == "read_only") sharedReadOnlyMessage else sharedMessage, n.senderName, n.noteTitle)
        "note_access_revoked" -> String.format(accessRevokedMessage, n.senderName, n.noteTitle)
        "note_access_revoked_with_copy" -> String.format(accessRevokedWithCopyMessage, n.senderName, n.noteTitle)
        "collaborator_removed" -> String.format(collaboratorRemovedMessage, n.senderName, n.noteTitle)
        "collaborator_removed_with_copy" -> String.format(collaboratorRemovedWithCopyMessage, n.senderName, n.noteTitle)
        "collaborator_left" -> String.format(collaboratorLeftMessage, n.senderName, n.noteTitle)
        "shared_note_deleted" -> String.format(sharedNoteDeletedMessage, n.senderName, n.noteTitle)
        "shared_note_deleted_with_copy" -> String.format(sharedNoteDeletedWithCopyMessage, n.senderName, n.noteTitle)
        // Admin-only/reminder rows (see NotificationDto's own doc comment)
        // aren't specially rendered here, just shown honestly rather than
        // blanked or crashed on: reminders already have their own native
        // notification path (see ReminderNotifier.kt), this is only ever
        // a fallback for a type this screen doesn't otherwise expect.
        else -> "${n.senderName}: ${n.message ?: n.noteTitle}"
    }

    fun load() {
        loading = true
        errorMessage = null
        scope.launch {
            try {
                val pending = repository.fetchPendingNotifications()
                val history = repository.fetchNotificationHistory()
                notifications = (pending + history).distinctBy { it.id }.sortedByDescending { it.createdAt }
                if (pending.isNotEmpty()) {
                    repository.markNotificationsDelivered(pending.map { it.id })
                }
            } catch (t: Throwable) {
                NativeDebug.e("NotificationsScreen load failed", t)
                errorMessage = String.format(errorTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(serverUrl) { load() }

    val bgModifier = if (dark) Modifier.background(DarkBgColor) else Modifier.background(LightBgGradient)
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(WorkspaceTheme.headerGradient(container.themeState.themeId, dark))
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onBack() }
                            .padding(6.dp)
                            .weight(1f),
                    ) {
                        BackArrowIcon(size = 22.dp, tint = titleColor)
                        Text(
                            stringResource(R.string.native_notifications_title),
                            color = titleColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                    Text(
                        stringResource(R.string.native_notes_refresh),
                        color = if (loading) subtextColor else Indigo,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        modifier = Modifier
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                enabled = !loading,
                                role = Role.Button,
                            ) { load() }
                            .padding(8.dp),
                    )
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(WorkspaceTheme.headerBorderColor(container.themeState.themeId, dark)))
            }

            errorMessage?.let {
                Text(it, color = ErrorColor, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }

            if (notifications.isEmpty() && loading) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Indigo)
                }
            } else if (notifications.isEmpty() && errorMessage == null) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(emptyMessage, color = subtextColor)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(vertical = 8.dp),
                ) {
                    items(notifications, key = { it.id }) { notification ->
                        NotificationRow(
                            notification = notification,
                            message = messageFor(notification),
                            newLabel = newLabel,
                            titleColor = titleColor,
                            subtextColor = subtextColor,
                            onClick = { notification.noteId?.let(onOpenNote) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(
    notification: NotificationDto,
    message: String,
    newLabel: String,
    titleColor: Color,
    subtextColor: Color,
    onClick: () -> Unit,
) {
    val openable = notification.noteId != null
    Row(
        verticalAlignment = Alignment.Top,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = openable,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        // The pending-at-load-time marker (see this file's own doc
        // comment): deliveredAt on this already-fetched snapshot stays
        // null even after markNotificationsDelivered() runs, since that
        // call updates the server, not this composable's own state.
        if (notification.deliveredAt == null) {
            Box(
                modifier = Modifier
                    .padding(top = 6.dp, end = 8.dp)
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(Indigo)
                    .semantics { contentDescription = newLabel },
            )
        } else {
            Spacer(Modifier.width(14.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(message, color = titleColor, fontSize = 14.sp)
            Spacer(Modifier.height(2.dp))
            Text(formatNotificationTime(notification.createdAt), color = subtextColor, fontSize = 12.sp)
        }
    }
}

private fun formatNotificationTime(createdAt: String): String {
    val ms = parseIsoToEpochMillis(createdAt) ?: return ""
    return SimpleDateFormat("d MMM, HH:mm", Locale.getDefault()).format(Date(ms))
}
