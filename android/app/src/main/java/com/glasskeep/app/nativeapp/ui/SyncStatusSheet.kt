package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.SyncState
import com.glasskeep.app.nativeapp.SyncStatusState
import com.glasskeep.app.nativeapp.data.local.SyncQueueEntity
import com.glasskeep.app.nativeapp.data.local.SyncQueueType
import kotlinx.coroutines.delay

/** MAX_RETRIES (syncEngine.js:15, echoed by SyncStatusIcon.jsx:75). */
private const val MaxRetries = 5

// The five status tints, dark then light (SyncStatusIcon.jsx:80-137).
private val SyncGrayDark = Color(0xFF9CA3AF)
private val SyncGrayLight = Color(0xFF6B7280)
private val SyncGreenDark = Color(0xFF34D399)
private val SyncGreenLight = Color(0xFF059669)
private val SyncAmberDark = Color(0xFFFBBF24)
private val SyncAmberLight = Color(0xFFD97706)
private val SyncBlueDark = Color(0xFF60A5FA)
private val SyncBlueLight = Color(0xFF2563EB)
private val SyncRedDark = Color(0xFFF87171)
private val SyncRedLight = Color(0xFFDC2626)

private val SyncBadgeAmber = Color(0xFFF59E0B)
private val SyncDotGray = Color(0xFF9CA3AF)
private val SyncDotGreen = Color(0xFF10B981)
private val SyncDotAmber = Color(0xFFF59E0B)
private val SyncDotRed = Color(0xFFEF4444)
private val SyncDotBlue = Color(0xFF3B82F6)

/** What the header button draws and what the panel repeats at its top. */
internal data class SyncStatusFace(
    val color: Color,
    val label: String,
    val icon: @Composable (Color) -> Unit,
)

@Composable
internal fun syncStatusFace(state: SyncState, dark: Boolean): SyncStatusFace = when (state) {
    SyncState.CHECKING -> SyncStatusFace(
        color = if (dark) SyncGrayDark else SyncGrayLight,
        label = stringResource(R.string.native_sync_server_checking),
        icon = { tint -> CloudPendingIcon(size = 20.dp, tint = tint) },
    )
    SyncState.SYNCED -> SyncStatusFace(
        color = if (dark) SyncGreenDark else SyncGreenLight,
        label = stringResource(R.string.native_sync_status_synced),
        icon = { tint -> CloudCheckIcon(size = 20.dp, tint = tint) },
    )
    SyncState.PENDING -> SyncStatusFace(
        color = if (dark) SyncAmberDark else SyncAmberLight,
        label = stringResource(R.string.native_sync_status_pending),
        icon = { tint -> CloudPendingIcon(size = 20.dp, tint = tint) },
    )
    SyncState.SYNCING -> SyncStatusFace(
        color = if (dark) SyncBlueDark else SyncBlueLight,
        label = stringResource(R.string.native_sync_status_syncing),
        icon = { tint -> CloudSyncIcon(size = 20.dp, tint = tint) },
    )
    SyncState.OFFLINE -> SyncStatusFace(
        color = if (dark) SyncGrayDark else SyncGrayLight,
        label = stringResource(R.string.native_sync_status_offline),
        icon = { tint -> CloudOffIcon(size = 20.dp, tint = tint) },
    )
    SyncState.ERROR -> SyncStatusFace(
        color = if (dark) SyncRedDark else SyncRedLight,
        label = stringResource(R.string.native_sync_status_error),
        icon = { tint -> CloudErrorIcon(size = 20.dp, tint = tint) },
    )
}

/**
 * SyncStatusIcon.jsx's panel, in the phone shape it actually takes there:
 * a sheet anchored under the status bar, sliding down over the header,
 * with a grabber at its foot to pull it back up. Same shell as the
 * notification centre, which is what the web builds it from too.
 *
 * Five sections, in the web's order: what the cloud icon means and whether
 * the server answered, how much is queued, what is being retried, what has
 * given up, and a "sync now" button with a one-line verdict under it.
 *
 * The queue's own numbers come straight from the sync-queue table rather
 * than from a status object: an item still marked pending with attempts
 * behind it IS the web's "retry", and one the worker gave up on IS its
 * "failed", so the two lists need no extra bookkeeping.
 */
@Composable
internal fun SyncStatusSheet(
    container: NativeAppContainer,
    serverUrl: String,
    open: Boolean,
    dark: Boolean,
    themeId: String?,
    onDismiss: () -> Unit,
    onSyncNow: () -> Unit,
) {
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val queue by repository.observeSyncQueue().collectAsState(initial = emptyList())
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    var dragOffset by remember { mutableStateOf(0f) }

    // The sheet is unmounted only after the slide back up has played, same
    // as the notification centre's own mounted flag.
    var mounted by remember { mutableStateOf(false) }
    LaunchedEffect(open) {
        if (open) {
            mounted = true
        } else {
            delay(650)
            mounted = false
            dragOffset = 0f
        }
    }
    if (!mounted && !open) return

    // See NotificationCenter's identical fix: animateFloatAsState's
    // remembered Animatable gets disposed while this whole composable is
    // skipped (!mounted && !open), so a fresh open recreated one already
    // sitting at the open target with nothing to animate from. Animatable
    // + LaunchedEffect(open) always starts at -1f (off-screen) instead.
    val slideAnim = remember { Animatable(-1f) }
    LaunchedEffect(open) {
        slideAnim.animateTo(if (open) 0f else -1f, animationSpec = tween(durationMillis = 600, easing = TopSheetEasing))
    }
    val slide = slideAnim.value

    val status = container.syncStatus
    val retrying = queue.filter { it.status == SyncQueueEntity.STATUS_PENDING && it.attempts > 0 }
    val waiting = queue.filter { it.status == SyncQueueEntity.STATUS_PENDING && it.attempts == 0 }
    val failed = queue.filter { it.status == SyncQueueEntity.STATUS_FAILED }
    val state = status.state(pending = waiting.size, retrying = retrying.size, failed = failed.size)
    val face = syncStatusFace(state, dark)
    val locked = container.lockState.isLocked

    val titleColor = if (dark) Color(0xFFF0F0F5) else Color(0xFF1D1D1F)
    val subtext = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280)
    val chrome = WorkspaceTheme.colorsFor(themeId, dark)
    val divider = chrome.chromeBorder
    val statusBarBg = chrome.statusBar
    val shape = RoundedCornerShape(bottomStart = 14.dp, bottomEnd = 14.dp)

    Box(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.statusBars)
                .heightIn(max = configuration.screenHeightDp.dp)
                .graphicsLayer { translationY = slide * size.height + dragOffset }
                .clip(shape)
                .background(statusBarBg),
        ) {
            SyncSheetHeader(
                face = face,
                state = state,
                status = container.syncStatus,
                locked = locked,
                dark = dark,
                titleColor = titleColor,
                subtext = subtext,
                onClose = onDismiss,
            )

            if (waiting.isNotEmpty() || retrying.isNotEmpty()) {
                SyncSheetQueueSummary(
                    waiting = waiting.size,
                    retrying = retrying.size,
                    syncing = status.syncing,
                    dark = dark,
                    divider = divider,
                )
            }

            if (retrying.isNotEmpty()) {
                SyncSheetItemList(
                    title = stringResource(R.string.native_sync_retrying_title),
                    titleTint = if (dark) SyncAmberDark else SyncAmberLight,
                    icon = { tint -> RefreshIcon(size = 12.dp, tint = tint) },
                    items = retrying,
                    showLastError = false,
                    maxHeight = 120.dp,
                    dark = dark,
                    subtext = subtext,
                    divider = divider,
                    titleColor = titleColor,
                )
            }

            if (failed.isNotEmpty()) {
                SyncSheetItemList(
                    title = stringResource(R.string.native_sync_errors_title),
                    titleTint = if (dark) SyncRedDark else SyncRedLight,
                    icon = { tint -> AlertFilledIcon(size = 14.dp, tint = tint) },
                    items = failed,
                    showLastError = true,
                    maxHeight = 180.dp,
                    dark = dark,
                    subtext = subtext,
                    divider = divider,
                    titleColor = titleColor,
                )
            }

            Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                GkGradientButton(
                    label = stringResource(
                        if (status.syncing) R.string.native_sync_server_checking else R.string.native_sync_now,
                    ),
                    themeId = themeId,
                    enabled = !status.syncing,
                    modifier = Modifier.fillMaxWidth(),
                    verticalPadding = 8.dp,
                    leading = { RefreshIcon(size = 20.dp, tint = Color.White) },
                    onClick = onSyncNow,
                )
            }

            val allClear = state == SyncState.SYNCED
            if (queue.isNotEmpty() || state == SyncState.ERROR || state == SyncState.OFFLINE || allClear) {
                Text(
                    stringResource(
                        if (allClear) R.string.native_sync_safe_to_close else R.string.native_sync_not_safe_to_close,
                    ),
                    color = when {
                        allClear && dark -> SyncGreenDark
                        allClear -> SyncGreenLight
                        dark -> SyncAmberDark
                        else -> SyncAmberLight
                    },
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 12.dp),
                )
            }

            TopSheetGrabber(
                dark = dark,
                onDrag = { dy -> dragOffset = (dragOffset + dy).coerceAtMost(0f) },
                onDragEnd = {
                    val pulled = with(density) { (-dragOffset).toDp() }
                    if (pulled > TopSheetCloseThreshold) onDismiss() else dragOffset = 0f
                },
                onDragCancel = { dragOffset = 0f },
            )
        }
    }
}

/** Section 1: the icon and its sentence, the server dot with how long ago
 *  the last exchange was, then the lock and reconnection lines. */
@Composable
private fun SyncSheetHeader(
    face: SyncStatusFace,
    state: SyncState,
    status: SyncStatusState,
    locked: Boolean,
    dark: Boolean,
    titleColor: Color,
    subtext: Color,
    onClose: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                face.icon(face.color)
                Text(face.label, color = titleColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val (serverLabel, serverColor, dotColor) = serverLine(state, status.serverReachable, dark)
                Box(Modifier.size(6.dp).clip(CircleShape).background(dotColor))
                Text(serverLabel, color = serverColor, fontSize = 12.sp)
                status.lastSyncAt?.let { at ->
                    Text("· ${timeAgo(at)}", color = subtext, fontSize = 12.sp)
                }
            }
            if (locked) {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    LockIcon(size = 14.dp, tint = if (dark) SyncRedDark else SyncRedLight)
                    Text(
                        stringResource(R.string.native_sync_instance_locked),
                        color = if (dark) SyncRedDark else SyncRedLight,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                    )
                }
            }
            status.lastSyncError?.takeIf { status.serverReachable == false }?.let { error ->
                Spacer(Modifier.height(2.dp))
                Text(
                    error,
                    color = (if (dark) SyncRedDark else SyncRedLight).copy(alpha = 0.75f),
                    fontSize = 12.sp,
                )
            }
            if (status.failedChecks > 0 && state == SyncState.OFFLINE) {
                Spacer(Modifier.height(4.dp))
                Text(
                    String.format(stringResource(R.string.native_sync_failed_checks), status.failedChecks),
                    color = if (dark) SyncAmberDark else SyncAmberLight,
                    fontSize = 12.sp,
                )
            }
        }
        val closeLabel = stringResource(R.string.native_common_close)
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(6.dp))
                .gkTooltip(closeLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onClose() },
            contentAlignment = Alignment.Center,
        ) {
            CloseIcon(size = 16.dp, tint = subtext)
        }
    }
}

/** Section 2: one line saying how much is waiting, with a dot that turns
 *  blue while a drain is actually running. */
@Composable
private fun SyncSheetQueueSummary(
    waiting: Int,
    retrying: Int,
    syncing: Boolean,
    dark: Boolean,
    divider: Color,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(if (syncing) SyncDotBlue else SyncDotAmber))
            Text(
                if (syncing) {
                    String.format(stringResource(R.string.native_sync_queue_syncing), retrying, waiting)
                } else {
                    String.format(stringResource(R.string.native_sync_queue_waiting), waiting + retrying)
                },
                color = if (dark) Color(0xFFD1D5DB) else Color(0xFF4B5563),
                fontSize = 12.sp,
            )
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(divider))
    }
}

/** Sections 3a and 3b: the retrying list and the given-up list, same row
 *  shape, the second one also showing each item's last error. */
@Composable
private fun SyncSheetItemList(
    title: String,
    titleTint: Color,
    icon: @Composable (Color) -> Unit,
    items: List<SyncQueueEntity>,
    showLastError: Boolean,
    maxHeight: Dp,
    dark: Boolean,
    subtext: Color,
    divider: Color,
    titleColor: Color,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            icon(titleTint)
            Text(title, color = titleTint, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
        LazyColumn(
            modifier = Modifier.fillMaxWidth().heightIn(max = maxHeight),
            contentPadding = PaddingValues(bottom = 4.dp),
        ) {
            items(items, key = { it.queueId }) { item ->
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            syncActionLabel(item.type),
                            color = if (dark) Color(0xFFD1D5DB) else Color(0xFF374151),
                            fontSize = 12.sp,
                            fontWeight = if (showLastError) FontWeight.Medium else FontWeight.Normal,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (item.attempts > 0) {
                                Text(
                                    if (showLastError) {
                                        String.format(stringResource(R.string.native_sync_retry_count), item.attempts)
                                    } else {
                                        String.format(stringResource(R.string.native_sync_retry_count), item.attempts) +
                                            "/$MaxRetries"
                                    },
                                    color = if (showLastError) subtext else titleTint.copy(alpha = 0.8f),
                                    fontSize = 12.sp,
                                )
                            }
                            Text(shortNoteRef(item.noteId), color = subtext, fontSize = 12.sp)
                        }
                    }
                    if (showLastError) {
                        item.lastError?.let { error ->
                            Spacer(Modifier.height(2.dp))
                            Text(
                                error,
                                color = (if (dark) SyncRedDark else SyncRedLight).copy(alpha = 0.75f),
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(divider))
    }
}

/**
 * The header's cloud button: the state's own glyph and colour, the queue
 * count as an amber badge, and a red padlock over it when the instance is
 * locked (which replaces the count, since nothing is going to sync anyway).
 */
@Composable
internal fun SyncStatusButton(
    state: SyncState,
    queued: Int,
    locked: Boolean,
    dark: Boolean,
    onClick: () -> Unit,
) {
    val face = syncStatusFace(state, dark)
    Box(
        modifier = Modifier
            .gkTooltip(face.label)
            // p-2 + a 20px glyph in SyncStatusIcon.jsx: the badge must
            // align against this whole 36px button, not against the glyph's
            // content box (which made it sit squarely over the cloud).
            .size(36.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(CircleShape)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onClick() },
            contentAlignment = Alignment.Center,
        ) {
            face.icon(face.color)
        }
        if (queued > 0 && state != SyncState.SYNCED && !locked) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    // Web: -top-0.5/-right-0.5, h-4, min-w-4, px-1.
                    .offset(x = 2.dp, y = (-2).dp)
                    .height(16.dp)
                    .widthIn(min = 16.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(SyncBadgeAmber)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (queued > 99) "99+" else "$queued",
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 10.sp,
                )
            }
        }
        if (locked) {
            LockIcon(
                size = 12.dp,
                tint = SyncRedLight,
                modifier = Modifier.align(Alignment.TopEnd).offset(x = 1.dp, y = (-1).dp),
            )
        }
    }
}

/** The server line's own three-way split (SyncStatusIcon.jsx:300-333). */
@Composable
private fun serverLine(state: SyncState, reachable: Boolean?, dark: Boolean): Triple<String, Color, Color> = when {
    state == SyncState.OFFLINE || reachable == false -> Triple(
        stringResource(R.string.native_sync_server_unreachable),
        if (dark) SyncRedDark else SyncRedLight,
        SyncDotRed,
    )
    state == SyncState.ERROR -> Triple(
        stringResource(R.string.native_sync_server_reachable),
        if (dark) SyncAmberDark else SyncAmberLight,
        SyncDotAmber,
    )
    state == SyncState.CHECKING || reachable == null -> Triple(
        stringResource(R.string.native_sync_server_checking),
        if (dark) SyncGrayDark else SyncGrayLight,
        SyncDotGray,
    )
    else -> Triple(
        stringResource(R.string.native_sync_server_reachable),
        if (dark) SyncGreenDark else SyncGreenLight,
        SyncDotGreen,
    )
}

/** actionTypeLabel() (SyncStatusIcon.jsx:139): labels every durable
 *  native queue operation; duplicates are idempotent CREATE entries. */
@Composable
private fun syncActionLabel(type: String): String = stringResource(
    when (runCatching { SyncQueueType.valueOf(type) }.getOrNull()) {
        SyncQueueType.CREATE -> R.string.native_sync_action_create
        SyncQueueType.TITLE_CONTENT -> R.string.native_sync_action_update
        SyncQueueType.ARCHIVE -> R.string.native_sync_action_archive
        SyncQueueType.TRASH -> R.string.native_sync_action_trash
        SyncQueueType.RESTORE -> R.string.native_sync_action_restore
        SyncQueueType.PERMANENT_DELETE -> R.string.native_sync_action_delete
        SyncQueueType.REORDER -> R.string.native_sync_action_reorder
        else -> R.string.native_sync_action_patch
    },
)

/** `#` plus the first 8 characters of the note id, as the web prints it.
 *  The queue's own reorder pseudo-id names no note, so it prints nothing. */
private fun shortNoteRef(noteId: String): String =
    if (noteId.startsWith("__")) "" else "#" + noteId.take(8)

/** formatTimeAgo() (SyncStatusIcon.jsx:157), same four buckets. */
@Composable
private fun timeAgo(timestamp: Long): String {
    // Re-read every 10 seconds while the panel is up, the same tick the
    // web runs so "2m" does not sit there stale.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(10_000)
            now = System.currentTimeMillis()
        }
    }
    val seconds = ((now - timestamp) / 1000).coerceAtLeast(0)
    return when {
        seconds < 10 -> stringResource(R.string.native_sync_just_now)
        seconds < 60 -> String.format(stringResource(R.string.native_sync_ago_seconds), seconds.toInt())
        seconds < 3600 -> String.format(stringResource(R.string.native_sync_ago_minutes), (seconds / 60).toInt())
        seconds < 86400 -> String.format(stringResource(R.string.native_sync_ago_hours), (seconds / 3600).toInt())
        else -> String.format(stringResource(R.string.native_sync_ago_days), (seconds / 86400).toInt())
    }
}
