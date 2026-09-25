package com.glasskeep.app.nativeapp.ui

import android.content.Context
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.NotifCategory
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.NotificationDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import kotlin.math.abs
import kotlin.math.sign
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

    var dragOffset by remember { mutableStateOf(0f) }

    // Like the web panel, which lists its in-memory history at once and
    // works offline: the last fetched rows show straight away and a failed
    // refresh just keeps them.
    LaunchedEffect(open, serverUrl) {
        if (!open) return@LaunchedEffect
        try {
            val pending = repository.fetchPendingNotifications()
            val history = repository.fetchNotificationHistory()
            // The web drops a muted category before it ever reaches its
            // store (App.jsx:792-801), so it never shows here either.
            toasts.serverHistory = (pending + history)
                .distinctBy { it.id }
                .filter { container.editorPrefs.allowsNotification(categoryOf(it)) }
            if (pending.isNotEmpty()) repository.markNotificationsDelivered(pending.map { it.id })
        } catch (t: Throwable) {
            NativeDebug.e("NotificationCenter load failed", t)
        }
    }
    val notifications = (toasts.serverHistory + toasts.localHistory)
        .sortedByDescending { parseIsoToEpochMillis(it.createdAt) ?: 0L }
    val removeRow = { row: NotificationDto ->
        if (row.id < 0) {
            toasts.localHistory.removeAll { it.id == row.id }
        } else {
            toasts.serverHistory = toasts.serverHistory.filterNot { it.id == row.id }
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

    // A plain animateFloatAsState here would reset on every open: this
    // whole composable is skipped (not just hidden) while `!mounted &&
    // !open`, so its remembered Animatable gets disposed and recreated
    // fresh - starting straight at the "open" target with no transition,
    // while a close always finds the composable already mounted and
    // animates properly. Animatable + LaunchedEffect(open) sidesteps that:
    // it explicitly starts at -1f (off-screen) every time this is
    // recreated, so the very first open after a remount still slides in.
    val slideAnim = remember { Animatable(-1f) }
    LaunchedEffect(open) {
        slideAnim.animateTo(if (open) 0f else -1f, animationSpec = tween(durationMillis = 600, easing = TopSheetEasing))
    }
    val slide = slideAnim.value

    val enteredIds = remember { mutableSetOf<Int>() }
    val maxHeight = configuration.screenHeightDp.dp
    val statusBar = WorkspaceTheme.statusBarColor(themeId, dark)
    val shape = RoundedCornerShape(bottomStart = 14.dp, bottomEnd = 14.dp)
    val titleColor = if (dark) Color(0xFFF0F0F5) else Color(0xFF1D1D1F)

    Box(Modifier.fillMaxSize()) {
        if (open) Box(Modifier.fillMaxSize().dismissOnOutsideTouch(onDismiss))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.statusBars)
                .heightIn(max = maxHeight)
                .graphicsLayer {
                    translationY = slide * size.height + dragOffset
                }
                .dropShadow(shape, Shadow(radius = 6.dp, color = if (dark) Color.Black.copy(alpha = 0.30f) else Color(0x120F172A), spread = (-1).dp, offset = DpOffset(0.dp, 4.dp)))
                .dropShadow(shape, Shadow(radius = 28.dp, color = if (dark) Color.Black.copy(alpha = 0.50f) else Color(0x1F0F172A), spread = (-4).dp, offset = DpOffset(0.dp, 10.dp)))
                .clip(shape)
                // Light: the phone sheet's --gk-statusbar fill. Dark: the
                // later `html.dark .gk-notif-center` rule wins, a neutral
                // grey under the statusbar-coloured header.
                .background(if (dark) Color(0xF51C1C26) else statusBar)
                .sheetEdges(shape, dark),
        ) {
            NotificationCenterHeader(
                background = statusBar,
                titleColor = titleColor,
                dark = dark,
                brandingLogo = container.branding.logo,
                showClear = notifications.isNotEmpty(),
                onClear = {
                    toasts.serverHistory = emptyList()
                    toasts.localHistory.clear()
                    scope.launch { repository.clearNotifications() }
                },
                onClose = onDismiss,
            )

            when {
                notifications.isEmpty() -> Text(
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
                        // `.gk-notif-center__item--swipeable`'s gkNotifIn,
                        // once per row while the sheet is up.
                        val entry = remember { Animatable(if (notification.id in enteredIds) 1f else 0f) }
                        LaunchedEffect(Unit) {
                            enteredIds += notification.id
                            entry.animateTo(1f, tween(220, easing = GkNotifInEasing))
                        }
                        NotificationCard(
                            modifier = Modifier.graphicsLayer {
                                alpha = entry.value
                                translationY = (1f - entry.value) * -8.dp.toPx()
                                scaleX = 0.96f + 0.04f * entry.value
                                scaleY = scaleX
                            },
                            notification = notification,
                            dark = dark,
                            onOpen = { notification.noteId?.let(onOpenNote) },
                            onDismissCard = {
                                removeRow(notification)
                                if (notification.id >= 0) scope.launch { repository.removeNotifications(listOf(notification.id)) }
                            },
                            onApprovePending = notification.message?.toIntOrNull()?.let { pendingId ->
                                {
                                    scope.launch {
                                        if (decidePendingRegistration(context, api, repository, toasts, pendingId, notification.id, approve = true)) {
                                            removeRow(notification)
                                        }
                                    }
                                }
                            },
                            onRejectPending = notification.message?.toIntOrNull()?.let { pendingId ->
                                {
                                    scope.launch {
                                        if (decidePendingRegistration(context, api, repository, toasts, pendingId, notification.id, approve = false)) {
                                            removeRow(notification)
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
                separator = if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.06f),
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

/** The mobile sheet keeps only its bottom border (1px, following the
 *  rounded corners) and the `inset 0 1px 0` highlight along its top. */
private fun Modifier.sheetEdges(shape: Shape, dark: Boolean): Modifier = drawWithContent {
    drawContent()
    val stroke = 1.dp.toPx()
    drawRect(
        color = if (dark) Color.White.copy(alpha = 0.05f) else Color.White.copy(alpha = 0.90f),
        size = Size(size.width, stroke),
    )
    val outline = shape.createOutline(Size(size.width - stroke, size.height - stroke), layoutDirection, this)
    clipRect(top = size.height / 2f) {
        translate(stroke / 2f, stroke / 2f) {
            drawOutline(
                outline,
                color = if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.08f),
                style = Stroke(width = stroke),
            )
        }
    }
}

/** `.gk-notif-center__header`: brand on the left, Clear and the close
 *  glyph on the right, with the 6px gradient bleeding over the list. */
@Composable
private fun NotificationCenterHeader(
    background: Color,
    titleColor: Color,
    dark: Boolean,
    brandingLogo: String?,
    showClear: Boolean,
    onClear: () -> Unit,
    onClose: () -> Unit,
) {
    val fade = if (dark) Color.Black.copy(alpha = 0.20f) else Color(0xFF0F172A).copy(alpha = 0.05f)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .zIndex(1f)
            .drawWithContent {
                drawContent()
                val fadeHeight = 6.dp.toPx()
                drawRect(
                    Brush.verticalGradient(listOf(fade, Color.Transparent), startY = size.height, endY = size.height + fadeHeight),
                    topLeft = Offset(0f, size.height),
                    size = Size(size.width, fadeHeight),
                )
            }
            .background(background)
            .padding(horizontal = 12.dp, vertical = 10.dp),
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
                lineHeight = 17.28.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .alpha(0.75f)
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onClear() }
                    // 4px 8px plus the button's 1px transparent border.
                    .padding(horizontal = 9.dp, vertical = 5.dp),
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
            Text("\u2715", color = titleColor, fontSize = 13.sp, lineHeight = 13.sp)
        }
    }
}

/** `.gk-notif-center-grabber`: the strip at the foot of a top sheet (18dp,
 *  22dp for the sync sheet's), pulled UP to close. A downward pull does
 *  nothing. Shared with the sync sheet, which the web builds from the same
 *  parts. */
@Composable
internal fun TopSheetGrabber(
    dark: Boolean,
    separator: Color?,
    height: Dp = 18.dp,
    onDrag: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
) {
    var pressed by remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .then(if (separator != null) Modifier.topHairline(separator) else Modifier)
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
 * `.gk-notif-card--compact`: the LED-strip card, 2dp accent border (the
 * CSS asks 2.5px, Chromium floors it) over
 * a tint of the same colour, its icon and timestamp in the accent, and a
 * swipe to the side that deletes it for good (the panel never renders the
 * X button on a phone, the swipe IS the delete).
 */
@Composable
private fun NotificationCard(
    modifier: Modifier,
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
    val scope = rememberCoroutineScope()
    val offsetX = remember(notification.id) { Animatable(0f) }
    // Past the threshold the card fades out on its own 0.22s clock.
    val exitAlpha = remember(notification.id) { Animatable(1f) }
    var exiting by remember(notification.id) { mutableStateOf(false) }
    var widthPx by remember { mutableIntStateOf(0) }
    val thresholdPx = with(density) { SwipeDismissThreshold.toPx() }
    val fadeSpanPx = with(density) { 220.dp.toPx() }
    val release = {
        scope.launch {
            if (abs(offsetX.value) >= thresholdPx) {
                exiting = true
                exitAlpha.snapTo((1f - abs(offsetX.value) / fadeSpanPx).coerceIn(0f, 1f))
                launch { exitAlpha.animateTo(0f, tween(220, easing = CssEaseOut)) }
                offsetX.animateTo(sign(offsetX.value) * widthPx * 1.2f, tween(220, easing = CssEaseOut))
                onDismissCard()
            } else {
                offsetX.animateTo(0f, tween(200, easing = CssEaseOut))
            }
        }
    }

    Box(modifier.fillMaxWidth().onSizeChanged { widthPx = it.width }) {
        // The red "delete" bed the card slides off, revealed in step with
        // how far it has travelled.
        Box(
            modifier = Modifier
                .matchParentSize()
                .clip(RoundedCornerShape(16.dp))
                .graphicsLayer { alpha = if (exiting) 1f else (abs(offsetX.value) / thresholdPx).coerceIn(0f, 1f) }
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
            TablerTrashIcon(size = 22.dp, tint = Color.White, modifier = Modifier.align(Alignment.CenterStart))
            TablerTrashIcon(size = 22.dp, tint = Color.White, modifier = Modifier.align(Alignment.CenterEnd))
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .graphicsLayer {
                    translationX = offsetX.value
                    alpha = if (exiting) exitAlpha.value else (1f - abs(offsetX.value) / fadeSpanPx).coerceIn(0f, 1f)
                }
                .notifLedSurface(variant, dark, shape, cardColor)
                .pointerInput(notification.id) {
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { change, delta ->
                            change.consume()
                            scope.launch { offsetX.snapTo(offsetX.value + delta) }
                        },
                        onDragEnd = { release() },
                        onDragCancel = { release() },
                    )
                },
        ) {
            Row(
                // Centred on the card, except a card carrying Approve/Reject.
                verticalAlignment = if (notification.type == "pending_user_registered") Alignment.Top else Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
                // The web's 9px 12px padding sits inside its 2px border.
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp),
            ) {
                Box(
                    Modifier
                        .padding(top = if (notification.type == "pending_user_registered") 1.dp else 0.dp)
                        .size(26.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    NotificationIcon(notification, variant)
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        notificationTitleText(LocalContext.current, notification, withFallback = true).orEmpty(),
                        color = textColor,
                        fontSize = 12.5.sp,
                        lineHeight = 16.25.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(end = 48.dp),
                    )
                    Spacer(Modifier.height(2.dp))
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            notificationMessageText(LocalContext.current, notification),
                            color = textColor.copy(alpha = 0.88f),
                            fontSize = 12.sp,
                            lineHeight = 16.2.sp,
                            modifier = Modifier.weight(1f),
                        )
                        val openLabel = notificationOpenLabelRes(notification.type)
                        if (notification.noteId != null && openLabel != null) {
                            NotificationAction(
                                label = stringResource(openLabel),
                                primary = true,
                                dark = dark,
                                textColor = textColor,
                                onClick = onOpen,
                            )
                        }
                    }
                    if (notification.type == "pending_user_registered" && onApprovePending != null && onRejectPending != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                        ) {
                            NotificationAction(
                                label = stringResource(R.string.native_admin_approve),
                                primary = true,
                                dark = dark,
                                textColor = textColor,
                                onClick = onApprovePending,
                            )
                            NotificationAction(
                                label = stringResource(R.string.native_admin_reject),
                                primary = false,
                                dark = dark,
                                textColor = textColor,
                                onClick = onRejectPending,
                            )
                        }
                    }
                }
            }
            // `.gk-notif-card__time`: pinned 9px/14px inside the border, off
            // the layout, over the title's 48px right padding.
            Text(
                relativeTime(notification.createdAt),
                color = textColor.copy(alpha = 0.55f),
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                modifier = Modifier.align(Alignment.TopEnd).padding(top = 11.dp, end = 16.dp),
            )
        }
    }
}

/** Approves or rejects a pending registration from a notification (card
 *  or pill), then drops that notification. False when the call failed. */
internal suspend fun decidePendingRegistration(
    context: Context,
    api: GlassKeepApi,
    repository: NotesRepository,
    toasts: ToastController,
    pendingId: Int,
    notificationId: Int,
    approve: Boolean,
): Boolean = try {
    val response = if (approve) api.approvePendingUser(pendingId) else api.rejectPendingUser(pendingId)
    if (!response.isSuccessful) error("HTTP ${response.code()}")
    repository.removeNotifications(listOf(notificationId))
    if (approve) {
        toasts.success(context.getString(R.string.native_admin_registration_approved), "user-check")
    } else {
        toasts.show(context.getString(R.string.native_admin_registration_rejected), icon = "user-x")
    }
    true
} catch (t: Throwable) {
    toasts.error(t.message ?: context.getString(R.string.native_admin_action_failed))
    false
}

/** The card's action pills (globalCSS.js .gk-notif-card__action): a
 *  tinted primary and a bordered secondary, both in the card's text colour. */
@Composable
private fun NotificationAction(label: String, primary: Boolean, dark: Boolean, textColor: Color, onClick: () -> Unit) {
    val shape = RoundedCornerShape(999.dp)
    Text(
        label,
        color = textColor,
        fontSize = 12.5.sp,
        lineHeight = 18.75.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(shape)
            .then(
                if (primary) {
                    Modifier
                        .background(if (dark) Color.White.copy(alpha = 0.13f) else Color.Black.copy(alpha = 0.07f))
                        .padding(horizontal = 14.dp, vertical = 5.dp)
                } else {
                    Modifier.border(1.dp, if (dark) Color.White.copy(alpha = 0.22f) else Color.Black.copy(alpha = 0.18f), shape)
                },
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .then(if (primary) Modifier else Modifier.padding(horizontal = 13.dp, vertical = 4.dp)),
    )
}

/** VariantGlyph (NotificationCard.jsx:34-79): the row's semantic icon
 *  (useShareNotifications.js gives each server type one) or its stored
 *  `icon` key, else the variant's filled glyph; 30px, overflowing the
 *  26px slot, except on info cards. */
@Composable
private fun NotificationIcon(notification: NotificationDto, variant: NotifVariant) {
    Box(Modifier.size(26.dp).wrapContentSize(unbounded = true)) {
        NotifGlyph(notificationIconKey(notification), variant, if (variant == NotifVariant.INFO) 26.dp else 30.dp)
    }
}

/** The semantic icon useShareNotifications.js gives a server type; a
 *  generic row carries its own `icon` key. */
internal fun notificationIconKey(notification: NotificationDto): String? = when (notification.type) {
    "note_shared",
    "note_access_revoked", "note_access_revoked_with_copy",
    "collaborator_removed", "collaborator_removed_with_copy",
    "collaborator_left",
    "shared_note_deleted", "shared_note_deleted_with_copy",
    -> null
    "reminder" -> "reminder"
    "pending_user_registered" -> "user-clock"
    "user_deleted" -> "user-x"
    else -> notification.icon
}

/** Which of the display filter's eight buckets this row falls in. The
 *  server's own `type` decides first; only a generic row falls back to
 *  its variant (filterCategoryFor, App.jsx:767-787). */
/** VariantGlyph (NotificationCard.jsx): the outline Tabler glyph [key]
 *  names in SEMANTIC_ICONS, else the variant's filled one. */
@Composable
internal fun NotifGlyph(key: String?, variant: NotifVariant, size: Dp) {
    val tint = variant.accent
    when (key) {
        "trash" -> TablerTrashIcon(size = size, tint = tint)
        "trash-x" -> TrashXIcon(size = size, tint = tint)
        "restore" -> ArrowBackUpIcon(size = size, tint = tint)
        "archive" -> TablerArchiveIcon(size = size, tint = tint)
        "archive-off" -> ArchiveOffIcon(size = size, tint = tint)
        "copy" -> CopyIcon(size = size, tint = tint)
        "save" -> DeviceFloppyIcon(size = size, tint = tint)
        "note" -> NoteTablerIcon(size = size, tint = tint)
        "edit" -> PencilIcon(size = size, tint = tint, strokeWidth = 1.75f)
        "share" -> UserShareIcon(size = size, tint = tint)
        "unshare", "user-x" -> UserXIcon(size = size, tint = tint)
        "user-plus" -> UserPlusIcon(size = size, tint = tint)
        "user-check" -> UserCheckIcon(size = size, tint = tint)
        "user-clock" -> UserClockIcon(size = size, tint = tint)
        "users" -> UsersIcon(size = size, tint = tint)
        "key" -> TablerKeyIcon(size = size, tint = tint)
        "shield" -> ShieldLockIcon(size = size, tint = tint)
        "qr" -> QrCodeIcon(size = size, tint = tint)
        "camera" -> CameraIcon(size = size, tint = tint)
        "refresh" -> RefreshIcon(size = size, tint = tint)
        "power" -> PowerIcon(size = size, tint = tint)
        "reminder" -> BellRingingFilledIcon(size = size, tint = tint)
        else -> when (variant) {
            NotifVariant.SUCCESS -> CircleCheckFilledIcon(size = size, tint = tint)
            NotifVariant.WARNING -> AlertFilledIcon(size = size, tint = tint)
            NotifVariant.ERROR -> AlertCircleFilledIcon(size = size, tint = tint)
            NotifVariant.INFO -> InfoFilledIcon(size = size, tint = tint)
        }
    }
}

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
/** The row's title: its type's own title, else (generic rows) the stored
 *  title, else the variant fallback when [withFallback] (the centre card
 *  always has one, a pill may have none). */
internal fun notificationTitleText(context: Context, notification: NotificationDto, withFallback: Boolean): String? {
    val res = when (notification.type) {
        "note_shared" -> R.string.native_notifications_title_note_shared
        "note_access_revoked", "note_access_revoked_with_copy" -> R.string.native_notifications_title_access_revoked
        "collaborator_removed", "collaborator_removed_with_copy" -> R.string.native_notifications_title_collaborator_removed
        "collaborator_left" -> R.string.native_notifications_title_collaborator_left
        "shared_note_deleted", "shared_note_deleted_with_copy" -> R.string.native_notifications_title_shared_note_deleted
        "reminder" -> R.string.native_notifications_title_reminder
        "pending_user_registered" -> R.string.native_notifications_title_pending_user
        "user_deleted" -> R.string.native_notifications_title_user_deleted
        else -> null
    }
    if (res != null) return context.getString(res)
    notification.noteTitle.takeIf { it.isNotBlank() }?.let { return it }
    if (!withFallback) return null
    return context.getString(
        when (variantOf(notification)) {
            NotifVariant.SUCCESS -> R.string.native_notif_fallback_success
            NotifVariant.WARNING -> R.string.native_notif_fallback_warning
            NotifVariant.ERROR -> R.string.native_notif_fallback_error
            NotifVariant.INFO -> R.string.native_notif_fallback_info
        },
    )
}

/** The message useShareNotifications.js builds, with its names in bold;
 *  a row without a template of its own prints its server message. */
internal fun notificationMessageText(context: Context, notification: NotificationDto): AnnotatedString {
    val untitled = context.getString(R.string.native_notifications_untitled)
    val noteTitle = notification.noteTitle.ifBlank { untitled }
    val templateRes = when (notification.type) {
        "note_shared" -> if (notification.variant == "read_only") {
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
        "pending_user_registered" -> R.string.native_notifications_pending_user
        "user_deleted" -> R.string.native_notifications_user_deleted
        else -> return AnnotatedString(notification.message ?: noteTitle)
    }
    // pending_user_registered stores the registrant's e-mail in note_title;
    // user_deleted stores the deleted user's name there, the admin as sender.
    val args = when (notification.type) {
        "user_deleted" -> listOf(noteTitle, notification.senderName)
        else -> listOf(notification.senderName, noteTitle)
    }
    val bold = when (notification.type) {
        "pending_user_registered" -> listOf(args[0])
        "user_deleted" -> args
        else -> listOf(args[1])
    }
    val text = context.getString(templateRes, args[0], args[1])
    return buildAnnotatedString {
        append(text)
        var from = 0
        for (part in bold) {
            if (part.isEmpty()) continue
            val start = text.indexOf(part, from).takeIf { it >= 0 } ?: continue
            addStyle(SpanStyle(fontWeight = FontWeight.Bold), start, start + part.length)
            from = start + part.length
        }
    }
}

/** The one action useShareNotifications.js gives a row, if any. */
internal fun notificationOpenLabelRes(type: String): Int? = when (type) {
    "note_shared", "note_access_revoked_with_copy", "shared_note_deleted_with_copy" -> R.string.native_notifications_open
    "reminder" -> R.string.native_notifications_open_note
    else -> null
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
