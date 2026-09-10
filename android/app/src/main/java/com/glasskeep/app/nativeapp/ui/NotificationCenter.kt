package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.NotifCategory
import com.glasskeep.app.nativeapp.data.network.NotificationDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import androidx.compose.foundation.Image
import kotlin.math.abs
import kotlinx.coroutines.launch

internal val TopSheetEasing = CubicBezierEasing(0.32f, 0.72f, 0f, 1f)

/** MOBILE_CLOSE_THRESHOLD_PX (NotificationCenter.jsx:28). */
internal val TopSheetCloseThreshold = 60.dp

/** SWIPE_DISMISS_THRESHOLD (NotificationCard.jsx). */
private val SwipeDismissThreshold = 80.dp

/**
 * The notification centre, ported from NotificationCenter.jsx's own mobile
 * rendering: not a screen of its own but a sheet anchored to the TOP of
 * the app, sliding down over 600ms, as tall as its content up to the
 * viewport, with the bottom corners rounded and a grabber underneath that
 * pulls it back up.
 *
 * There is no read/unread state here, deliberately: the web model only
 * knows "still floating" vs "already in history", and opening the bell
 * moves everything to history at once, which is why every card in the
 * panel looks the same (see the .is-dismissed override the mobile
 * stylesheet cancels).
 *
 * Pending-registration notifications expose their Approve/Reject actions
 * directly, matching the native admin panel.
 */
@Composable
fun NotificationCenter(
    container: NativeAppContainer,
    serverUrl: String,
    open: Boolean,
    dark: Boolean,
    themeId: String?,
    onOpenNote: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val api = remember(serverUrl) { container.api(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current

    var notifications by remember { mutableStateOf<List<NotificationDto>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableStateOf(0f) }

    val errorTemplate = stringResource(R.string.native_notifications_error)

    LaunchedEffect(open, serverUrl) {
        if (!open) return@LaunchedEffect
        loading = true
        errorMessage = null
        try {
            val pending = repository.fetchPendingNotifications()
            val history = repository.fetchNotificationHistory()
            // The web drops a muted category before it ever reaches its
            // store (App.jsx:792-801), so it never shows here either.
            notifications = (pending + history)
                .distinctBy { it.id }
                .filter { container.editorPrefs.allowsNotification(categoryOf(it)) }
                .sortedByDescending { it.createdAt }
            if (pending.isNotEmpty()) repository.markNotificationsDelivered(pending.map { it.id })
        } catch (t: Throwable) {
            NativeDebug.e("NotificationCenter load failed", t)
            errorMessage = String.format(errorTemplate, t.message ?: t.javaClass.simpleName)
        } finally {
            loading = false
        }
    }

    // The sheet is unmounted MOBILE_ANIM_MS after it starts closing, so
    // the slide back up is actually visible.
    var mounted by remember { mutableStateOf(false) }
    LaunchedEffect(open) {
        if (open) {
            mounted = true
        } else {
            kotlinx.coroutines.delay(650)
            mounted = false
            dragOffset = 0f
        }
    }
    if (!mounted && !open) return

    val slide by animateFloatAsState(
        targetValue = if (open) 0f else -1f,
        animationSpec = tween(durationMillis = 600, easing = TopSheetEasing),
        label = "notifCenterSlide",
    )

    val maxHeight = configuration.screenHeightDp.dp
    val statusBar = WorkspaceTheme.statusBarColor(themeId, dark)
    val shape = RoundedCornerShape(bottomStart = 14.dp, bottomEnd = 14.dp)
    val titleColor = if (dark) Color(0xFFF0F0F5) else Color(0xFF1D1D1F)

    Box(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.statusBars)
                .heightIn(max = maxHeight)
                .graphicsLayer {
                    translationY = slide * size.height + dragOffset
                }
                .clip(shape)
                .background(statusBar)
                // The phone web sheet explicitly removes its top/side
                // borders. A full Compose border left a visible seam between
                // the Android status bar and this matching status-bar fill.
                // The grabber keeps its own lower separator.
        ) {
            NotificationCenterHeader(
                titleColor = titleColor,
                dark = dark,
                brandingLogo = container.branding.logo,
                showClear = notifications.isNotEmpty(),
                onClear = {
                    notifications = emptyList()
                    scope.launch { repository.clearNotifications() }
                },
                onClose = onDismiss,
            )

            errorMessage?.let {
                Text(
                    it,
                    color = NotifVariant.ERROR.accent,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }

            when {
                loading && notifications.isEmpty() -> Box(
                    modifier = Modifier.fillMaxWidth().padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = titleColor.copy(alpha = 0.6f))
                }
                notifications.isEmpty() && errorMessage == null -> Text(
                    stringResource(R.string.native_notifications_empty),
                    color = titleColor.copy(alpha = 0.7f),
                    fontSize = 13.6.sp,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 24.dp),
                    textAlign = TextAlign.Center,
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxWidth().weight(1f, fill = false),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(notifications, key = { it.id }) { notification ->
                        NotificationCard(
                            notification = notification,
                            dark = dark,
                            onOpen = { notification.noteId?.let(onOpenNote) },
                            onDismissCard = {
                                notifications = notifications.filterNot { it.id == notification.id }
                                scope.launch { repository.removeNotifications(listOf(notification.id)) }
                            },
                            onApprovePending = notification.message?.toIntOrNull()?.let { pendingId ->
                                {
                                    scope.launch {
                                        try {
                                            val response = api.approvePendingUser(pendingId)
                                            if (!response.isSuccessful) error("HTTP ${response.code()}")
                                            notifications = notifications.filterNot { it.id == notification.id }
                                            repository.removeNotifications(listOf(notification.id))
                                            toasts.success(context.getString(R.string.native_admin_registration_approved))
                                        } catch (t: Throwable) {
                                            toasts.error(t.message ?: context.getString(R.string.native_admin_action_failed))
                                        }
                                    }
                                }
                            },
                            onRejectPending = notification.message?.toIntOrNull()?.let { pendingId ->
                                {
                                    scope.launch {
                                        try {
                                            val response = api.rejectPendingUser(pendingId)
                                            if (!response.isSuccessful) error("HTTP ${response.code()}")
                                            notifications = notifications.filterNot { it.id == notification.id }
                                            repository.removeNotifications(listOf(notification.id))
                                            toasts.show(context.getString(R.string.native_admin_registration_rejected))
                                        } catch (t: Throwable) {
                                            toasts.error(t.message ?: context.getString(R.string.native_admin_action_failed))
                                        }
                                    }
                                }
                            },
                        )
                    }
                }
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

/** `.gk-notif-center__header`: brand on the left, Clear and the close
 *  glyph on the right, with the 6px gradient bleeding underneath. */
@Composable
private fun NotificationCenterHeader(
    titleColor: Color,
    dark: Boolean,
    brandingLogo: String?,
    showClear: Boolean,
    onClear: () -> Unit,
    onClose: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val customLogo = brandingLogo?.let { rememberDecodedImage(it) }
                if (customLogo != null) {
                    Image(
                        bitmap = customLogo,
                        contentDescription = null,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.size(24.dp),
                    )
                } else {
                    Image(
                        painter = painterResource(R.drawable.glasskeep_logo),
                        contentDescription = null,
                        modifier = Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)),
                    )
                }
                Text(
                    stringResource(R.string.native_notifications_title),
                    color = titleColor,
                    fontSize = 15.2.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
            }
            if (showClear) {
                Text(
                    stringResource(R.string.native_notifications_clear_all),
                    color = titleColor,
                    fontSize = 11.52.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .alpha(0.75f)
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onClear() }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
            val closeLabel = stringResource(R.string.native_common_close)
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .alpha(0.55f)
                    .clip(CircleShape)
                    .semantics { contentDescription = closeLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onClose() },
                contentAlignment = Alignment.Center,
            ) {
                CloseIcon(size = 20.dp, tint = titleColor)
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            if (dark) Color.Black.copy(alpha = 0.20f) else Color(0xFF0F172A).copy(alpha = 0.05f),
                            Color.Transparent,
                        ),
                    ),
                ),
        )
    }
}

/** `.gk-notif-center-grabber`: the 18dp strip at the foot of a top sheet,
 *  pulled UP to close. A downward pull does nothing. Shared with the sync
 *  sheet, which the web builds from the same parts. */
@Composable
internal fun TopSheetGrabber(
    dark: Boolean,
    onDrag: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
) {
    var pressed by remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(18.dp)
            .topHairline(if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.06f))
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { pressed = true },
                    onVerticalDrag = { change, delta ->
                        change.consume()
                        onDrag(delta)
                    },
                    onDragEnd = { pressed = false; onDragEnd() },
                    onDragCancel = { pressed = false; onDragCancel() },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .graphicsLayer { scaleX = if (pressed) 1.15f else 1f }
                .width(42.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(
                    when {
                        dark && pressed -> Color.White.copy(alpha = 0.5f)
                        dark -> Color.White.copy(alpha = 0.32f)
                        pressed -> Color.Black.copy(alpha = 0.45f)
                        else -> Color.Black.copy(alpha = 0.28f)
                    },
                ),
        )
    }
}

/**
 * `.gk-notif-card--compact`: the LED-strip card, 2.5dp accent border over
 * a tint of the same colour, its icon and timestamp in the accent, and a
 * swipe to the side that deletes it for good (the panel never renders the
 * X button on a phone, the swipe IS the delete).
 */
@Composable
private fun NotificationCard(
    notification: NotificationDto,
    dark: Boolean,
    onOpen: () -> Unit,
    onDismissCard: () -> Unit,
    onApprovePending: (() -> Unit)?,
    onRejectPending: (() -> Unit)?,
) {
    val density = LocalDensity.current
    val variant = variantOf(notification)
    val cardColor = if (dark) Color(0xFF12121C).copy(alpha = 0.97f) else Color(0xFFFCFCFF).copy(alpha = 0.97f)
    val textColor = if (dark) Color(0xFFF0F0F5) else Color(0xFF1D1D1F)
    val shape = RoundedCornerShape(12.dp)
    var offsetX by remember(notification.id) { mutableStateOf(0f) }
    val thresholdPx = with(density) { SwipeDismissThreshold.toPx() }
    val fadeSpanPx = with(density) { 220.dp.toPx() }

    Box(Modifier.fillMaxWidth()) {
        // The red "delete" bed the card slides off, revealed in step with
        // how far it has travelled.
        Box(
            modifier = Modifier
                .matchParentSize()
                .clip(shape)
                .alpha((abs(offsetX) / with(density) { 80.dp.toPx() }).coerceIn(0f, 1f))
                .background(
                    Brush.horizontalGradient(
                        if (dark) {
                            listOf(
                                Color(0xFFB91C1C).copy(alpha = 0.92f),
                                Color(0xFFB91C1C).copy(alpha = 0.78f),
                                Color(0xFFB91C1C).copy(alpha = 0.92f),
                            )
                        } else {
                            listOf(
                                Color(0xFFDC2626).copy(alpha = 0.92f),
                                Color(0xFFDC2626).copy(alpha = 0.78f),
                                Color(0xFFDC2626).copy(alpha = 0.92f),
                            )
                        },
                    ),
                )
                .padding(horizontal = 18.dp),
        ) {
            TrashIcon(size = 22.dp, tint = Color.White, modifier = Modifier.align(Alignment.CenterStart))
            TrashIcon(size = 22.dp, tint = Color.White, modifier = Modifier.align(Alignment.CenterEnd))
        }

        Row(
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(9.dp),
            modifier = Modifier
                .fillMaxWidth()
                .graphicsLayer {
                    translationX = offsetX
                    alpha = (1f - abs(offsetX) / fadeSpanPx).coerceIn(0f, 1f)
                }
                .clip(shape)
                .background(cardColor)
                .background(variant.accent.copy(alpha = variant.tintAlpha))
                .border(2.5.dp, variant.accent, shape)
                .pointerInput(notification.id) {
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { change, delta ->
                            change.consume()
                            offsetX += delta
                        },
                        onDragEnd = {
                            if (abs(offsetX) > thresholdPx) onDismissCard() else offsetX = 0f
                        },
                        onDragCancel = { offsetX = 0f },
                    )
                }
                .padding(horizontal = 12.dp, vertical = 9.dp),
        ) {
            Box(Modifier.size(26.dp), contentAlignment = Alignment.Center) {
                NotificationIcon(notification.type, variant.accent)
            }
            Column(Modifier.weight(1f)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Text(
                        notificationTitle(notification),
                        color = textColor,
                        fontSize = 12.5.sp,
                        lineHeight = 16.25.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        relativeTime(notification.createdAt),
                        color = textColor.copy(alpha = 0.55f),
                        fontSize = 11.sp,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        notificationMessage(notification),
                        color = textColor.copy(alpha = 0.88f),
                        fontSize = 12.sp,
                        lineHeight = 16.2.sp,
                        modifier = Modifier.weight(1f),
                    )
                    if (notification.noteId != null) {
                        Text(
                            stringResource(R.string.native_notifications_open),
                            color = textColor,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(
                                    if (dark) Color.White.copy(alpha = 0.13f) else Color.Black.copy(alpha = 0.07f),
                                )
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { onOpen() }
                                .padding(horizontal = 14.dp, vertical = 5.dp),
                        )
                    }
                }
                if (notification.type == "pending_user_registered" && onApprovePending != null && onRejectPending != null) {
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        NotificationAction(
                            label = stringResource(R.string.native_admin_reject),
                            color = Color(0xFFDC2626),
                            onClick = onRejectPending,
                        )
                        NotificationAction(
                            label = stringResource(R.string.native_admin_approve),
                            color = Color(0xFF16A34A),
                            onClick = onApprovePending,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationAction(label: String, color: Color, onClick: () -> Unit) {
    Text(
        label,
        color = Color.White,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(color).clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            role = Role.Button,
        ) { onClick() }.padding(horizontal = 14.dp, vertical = 6.dp),
    )
}

/** SEMANTIC_ICONS (NotificationCard.jsx:34-58), for the types this app
 *  actually receives; anything else falls back to the bell. */
@Composable
private fun NotificationIcon(type: String, accent: Color) {
    when (type) {
        "note_shared" -> CollaborateIcon(size = 22.dp, tint = accent)
        "note_access_revoked", "note_access_revoked_with_copy",
        "collaborator_removed", "collaborator_removed_with_copy",
        "collaborator_left",
        -> PeopleIcon(size = 22.dp, tint = accent)
        "shared_note_deleted", "shared_note_deleted_with_copy" -> TrashIcon(size = 22.dp, tint = accent)
        "reminder" -> BellRingingFilledIcon(size = 22.dp, tint = accent)
        else -> BellIcon(size = 22.dp, tint = accent)
    }
}

/** Which of the display filter's eight buckets this row falls in. The
 *  server's own `type` decides first; only a generic row falls back to
 *  its variant (filterCategoryFor, App.jsx:767-787). */
internal fun categoryOf(notification: NotificationDto): NotifCategory =
    NotifCategory.of(notification.type, variantOf(notification).categoryKey)

internal fun variantOf(notification: NotificationDto): NotifVariant = when (notification.type) {
    "note_shared", "reminder", "pending_user_registered" -> NotifVariant.INFO
    "note_access_revoked", "note_access_revoked_with_copy",
    "collaborator_removed", "collaborator_removed_with_copy",
    "collaborator_left", "shared_note_deleted", "shared_note_deleted_with_copy", "user_deleted",
    -> NotifVariant.WARNING
    else -> when (notification.variant) {
        "success" -> NotifVariant.SUCCESS
        "warning" -> NotifVariant.WARNING
        "error" -> NotifVariant.ERROR
        else -> NotifVariant.INFO
    }
}

/** Split out of the two formatters below so the live pill (see
 *  NativeNavHost's own realtime wiring) can build the same two strings
 *  from outside composition, off a plain Context, rather than keeping a
 *  second copy of this mapping. */
internal fun notificationTitleRes(type: String): Int = when (type) {
    "note_shared" -> R.string.native_notifications_title_note_shared
    "note_access_revoked", "note_access_revoked_with_copy" -> R.string.native_notifications_title_access_revoked
    "collaborator_removed", "collaborator_removed_with_copy" -> R.string.native_notifications_title_collaborator_removed
    "collaborator_left" -> R.string.native_notifications_title_collaborator_left
    "shared_note_deleted", "shared_note_deleted_with_copy" -> R.string.native_notifications_title_shared_note_deleted
    "reminder" -> R.string.native_notifications_title_reminder
    "pending_user_registered" -> R.string.native_admin_registration_request
    "user_deleted" -> R.string.native_admin_user_deleted
    else -> R.string.native_notifications_title_generic
}

/** Null for a row with no template of its own, which prints its server
 *  message instead. */
internal fun notificationMessageRes(type: String, variant: String?): Int? = when (type) {
    "note_shared" -> if (variant == "read_only") {
        R.string.native_notifications_note_shared_read_only
    } else {
        R.string.native_notifications_note_shared
    }
    "note_access_revoked" -> R.string.native_notifications_access_revoked
    "note_access_revoked_with_copy" -> R.string.native_notifications_access_revoked_with_copy
    "collaborator_removed" -> R.string.native_notifications_collaborator_removed
    "collaborator_removed_with_copy" -> R.string.native_notifications_collaborator_removed_with_copy
    "collaborator_left" -> R.string.native_notifications_collaborator_left
    "shared_note_deleted" -> R.string.native_notifications_shared_note_deleted
    "shared_note_deleted_with_copy" -> R.string.native_notifications_shared_note_deleted_with_copy
    "pending_user_registered" -> R.string.native_admin_registration_notification
    "user_deleted" -> R.string.native_admin_user_deleted_notification
    else -> null
}

@Composable
private fun notificationTitle(notification: NotificationDto): String =
    stringResource(notificationTitleRes(notification.type))

/** The message the web builds in useShareNotifications.js, with the note
 *  title in bold exactly where the `**...**` markers sit. */
@Composable
private fun notificationMessage(notification: NotificationDto): AnnotatedString {
    val untitled = stringResource(R.string.native_notes_untitled)
    val noteTitle = notification.noteTitle.ifBlank { untitled }
    val templateRes = notificationMessageRes(notification.type, notification.variant)
        ?: return buildAnnotatedString { append(notification.message ?: noteTitle) }
    val text = String.format(stringResource(templateRes), notification.senderName, noteTitle)
    return buildAnnotatedString {
        val start = text.indexOf(noteTitle)
        if (start < 0 || noteTitle.isEmpty()) {
            append(text)
        } else {
            append(text.substring(0, start))
            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(noteTitle) }
            append(text.substring(start + noteTitle.length))
        }
    }
}

/** formatRelativeTime (NotificationCard.jsx:88-97): minutes, then hours,
 *  then days, never an absolute date. */
@Composable
private fun relativeTime(createdAt: String): String {
    val ms = parseIsoToEpochMillis(createdAt) ?: return ""
    val diff = System.currentTimeMillis() - ms
    return when {
        diff < 60_000L -> stringResource(R.string.native_relative_just_now)
        diff < 3_600_000L -> String.format(stringResource(R.string.native_relative_minutes), diff / 60_000L)
        diff < 86_400_000L -> String.format(stringResource(R.string.native_relative_hours), diff / 3_600_000L)
        else -> String.format(stringResource(R.string.native_relative_days), diff / 86_400_000L)
    }
}
