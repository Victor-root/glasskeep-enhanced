package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.nativeapp.EditorPrefsState
import com.glasskeep.app.nativeapp.NotificationDing
import com.glasskeep.app.nativeapp.data.NotifCategory
import com.glasskeep.app.nativeapp.data.NotifVariantKey
import com.glasskeep.app.nativeapp.data.network.NotificationDto
import com.glasskeep.app.nativeapp.data.nowIso

/** The four variants a notification can carry, and the accent each paints
 *  with (globalCSS.js:5009-5048). Shared by the toast pill and the
 *  notification centre's own cards. */
enum class NotifVariant(val accent: Color, val tintAlpha: Float, val categoryKey: NotifVariantKey) {
    INFO(Color(0xFF3B82F6), 0.06f, NotifVariantKey.INFO),
    SUCCESS(Color(0xFF10B981), 0.06f, NotifVariantKey.SUCCESS),
    WARNING(Color(0xFFF59E0B), 0.07f, NotifVariantKey.WARNING),
    ERROR(Color(0xFFEF4444), 0.06f, NotifVariantKey.ERROR),
}

/** Where the pill sits: the user's `notificationsPositionMobile`, bottom
 *  by default (App.jsx:385-391). */
enum class ToastPosition { TOP, BOTTOM }

fun toastPositionOf(raw: String?): ToastPosition =
    if (raw == "top") ToastPosition.TOP else ToastPosition.BOTTOM

/** One queued pill. [action] is the single inline button the web offers
 *  on a toast (Open a note, mostly); null means the pill is text only. */
data class GkToast(
    val id: Long,
    val title: String?,
    val message: AnnotatedString,
    val variant: NotifVariant,
    /** A NotificationCard.jsx SEMANTIC_ICONS key, see [NotifGlyph]. */
    val icon: String? = null,
    /** The server row this pill echoes: tapping it deletes that row. */
    val serverId: Int? = null,
    /** Stays up, with no countdown, until tapped (reminders). */
    val persistent: Boolean = false,
    val actionLabel: String? = null,
    val action: (() -> Unit)? = null,
    /** The second button (Refuser next to Approuver). */
    val secondaryActionLabel: String? = null,
    val secondaryAction: (() -> Unit)? = null,
    /** Bordered and in the text colour, as the pending-user reject is; a
     *  plain second action (a pairing request's Decline) looks like the
     *  first. */
    val secondaryOutlined: Boolean = true,
    /** The web's `actionLayout: "below"`: the pill takes the full width
     *  and its actions go on their own row under the text. */
    val stacked: Boolean = false,
    /** Overrides the user's configured duration for this one pill. */
    val durationMs: Long? = null,
)

/**
 * The one place anything in this app raises a message, replacing the
 * platform's own Toast: the web never shows an Android toast, it shows
 * its own pill, and this is that pill.
 *
 * Only one is on screen at a time and a newer arrival never preempts the
 * current one; a burst is played back in order, each getting its share of
 * the configured duration (NotificationMobileToast.jsx:222-266).
 */
class ToastController {
    internal val queue = mutableStateListOf<GkToast>()
    private var nextId = 1L

    /** True while the notification centre is open: the web suppresses the
     *  pill entirely for as long as the panel is up (App.jsx:7933-7935). */
    var suppressed by mutableStateOf(false)

    /**
     * The user's Notifications settings, once NativeNavHost has them. The
     * web wires the same two things around its own notify(): a category
     * this user muted never reaches the screen at all, and a new arrival
     * rings unless its category is muted for sound (App.jsx:792-823).
     */
    var prefs: EditorPrefsState? = null

    /** The notification centre's feed for this session, like the web
     *  provider's history (NotificationProvider.jsx, MAX_HISTORY 100): the
     *  server rows as last fetched, so the centre opens on them at once and
     *  refreshes silently, plus every message the app raised itself. */
    internal var serverHistory by mutableStateOf<List<NotificationDto>>(emptyList())
    internal val localHistory = mutableStateListOf<NotificationDto>()

    /** Deletes a server row for good, once NativeNavHost has a session. */
    var removeServerRow: ((Int) -> Unit)? = null

    fun show(
        message: CharSequence,
        variant: NotifVariant = NotifVariant.INFO,
        title: String? = null,
        icon: String? = null,
        actionLabel: String? = null,
        action: (() -> Unit)? = null,
        /** The server's own notification type when this pill is echoing
         *  one; null for a message the app raised itself, which is then
         *  categorised by its variant alone. */
        type: String? = null,
        durationMs: Long? = null,
        secondaryActionLabel: String? = null,
        secondaryAction: (() -> Unit)? = null,
        serverId: Int? = null,
        persistent: Boolean = false,
        secondaryOutlined: Boolean = true,
        stacked: Boolean = false,
    ): Long? {
        val category = NotifCategory.of(type, variant.categoryKey)
        val settings = prefs
        if (settings != null && !settings.allowsNotification(category)) return null
        // A row replayed at launch and pushed live again shows once.
        if (serverId != null && queue.any { it.serverId == serverId }) return null
        val id = nextId++
        // A pill echoing a server row is already in serverHistory.
        if (serverId == null) {
            localHistory.add(
                0,
                NotificationDto(
                    id = localHistoryId(id),
                    senderUserId = 0,
                    type = type.orEmpty(),
                    noteTitle = title.orEmpty(),
                    variant = variant.name.lowercase(),
                    message = message.toString(),
                    icon = icon,
                    createdAt = nowIso(),
                ),
            )
            while (localHistory.size > MaxLocalHistory) localHistory.removeAt(localHistory.lastIndex)
        }
        queue.add(
            GkToast(
                id = id,
                title = title,
                message = message as? AnnotatedString ?: AnnotatedString(message.toString()),
                variant = variant,
                icon = icon,
                serverId = serverId,
                persistent = persistent,
                actionLabel = actionLabel,
                action = action,
                secondaryActionLabel = secondaryActionLabel,
                secondaryAction = secondaryAction,
                secondaryOutlined = secondaryOutlined,
                stacked = stacked,
                durationMs = durationMs,
            ),
        )
        if (settings != null && settings.ringsFor(category)) NotificationDing.play()
        return id
    }

    fun error(message: String) {
        show(message, NotifVariant.ERROR)
    }

    fun success(message: String, icon: String? = null) {
        show(message, NotifVariant.SUCCESS, icon = icon)
    }

    internal fun dismiss(id: Long) {
        queue.removeAll { it.id == id }
    }

    /** The web's remove(): off the screen and out of the history alike. */
    internal fun remove(id: Long) {
        dismiss(id)
        localHistory.removeAll { it.id == localHistoryId(id) }
    }

    /** Opening the bell dismisses every active notification (the web's
     *  dismissAll), which is also what clears the bell's dot. */
    internal fun dismissAll() {
        queue.clear()
    }

    /** A tap on the pill or one of its actions: NotificationMobileToast.jsx
     *  removes the notification, from the history and the server alike. */
    internal fun resolve(toast: GkToast) {
        remove(toast.id)
        val serverId = toast.serverId ?: return
        serverHistory = serverHistory.filterNot { it.id == serverId }
        removeServerRow?.invoke(serverId)
    }
}

/** A pill's own row in the centre's history: negative, so it can never
 *  meet a server row's id. */
private fun localHistoryId(toastId: Long): Int = -toastId.toInt()

/** Available to every screen; NativeNavHost provides the real one. */
val LocalGkToasts = staticCompositionLocalOf { ToastController() }

@Composable
fun rememberToastController(): ToastController = remember { ToastController() }

private const val MaxLocalHistory = 100

/** MIN_BURST_SLICE / the default duration (NotificationProvider.jsx:179). */
private const val MinBurstSliceMs = 800L
const val DefaultToastDurationMs = 10_000L

/**
 * `.gk-mobile-toast`: the pill itself. It slides 24dp into place over
 * 220ms and, exactly like the web, has no exit animation at all: the
 * component is simply gone. A tap anywhere on it dismisses it.
 */
@Composable
fun GkToastHost(
    controller: ToastController,
    position: ToastPosition,
    dark: Boolean,
    durationMs: Long? = DefaultToastDurationMs,
) {
    val current = controller.queue.firstOrNull()
    if (current == null || controller.suppressed) return

    // A burst shares the configured duration between everything that
    // arrived together, never dropping below 800ms a piece.
    val slice = if (current.persistent) {
        null
    } else {
        (current.durationMs ?: durationMs)?.let { total ->
            if (controller.queue.size > 1) maxOf(MinBurstSliceMs, total / controller.queue.size) else total
        }
    }

    val progress = remember(current.id) { Animatable(1f) }
    LaunchedEffect(current.id, slice) {
        if (slice == null) return@LaunchedEffect
        progress.animateTo(0f, tween(durationMillis = slice.toInt(), easing = LinearEasing))
        controller.dismiss(current.id)
    }

    // gkMobileToastIn plays when the pill mounts: the next pill of a
    // burst swaps in place, like the web's kept DOM node.
    val entry = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        entry.animateTo(1f, tween(durationMillis = 220, easing = GkNotifInEasing))
    }

    val cardColor = if (dark) Color(0xFF12121C).copy(alpha = 0.97f) else Color(0xFFFCFCFF).copy(alpha = 0.97f)
    val textColor = if (dark) Color(0xFFF0F0F5) else Color(0xFF1D1D1F)
    val shape = RoundedCornerShape(16.dp)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.systemBars)
            .padding(horizontal = 12.dp)
            // 88dp under the top safe area clears the sticky header; 24dp
            // over the bottom one is the web's own resting place.
            .padding(top = if (position == ToastPosition.TOP) 88.dp else 0.dp, bottom = 24.dp),
        contentAlignment = if (position == ToastPosition.TOP) Alignment.TopCenter else Alignment.BottomCenter,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .then(if (current.stacked) Modifier.fillMaxWidth() else Modifier)
                .graphicsLayer {
                    alpha = entry.value
                    translationY = (1f - entry.value) * (if (position == ToastPosition.TOP) -24.dp.toPx() else 24.dp.toPx())
                }
                .notifLedSurface(current.variant, dark, shape, cardColor)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { controller.resolve(current) },
        ) {
            if (current.stacked) {
                // The grid of `.gk-mobile-toast--stacked`: glyph and text on
                // top, the actions under the text, flush right.
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                        PillGlyph(current, Modifier.padding(top = 1.dp))
                        PillText(current, textColor, wrapTitle = true, modifier = Modifier.weight(1f))
                    }
                    if (current.actionLabel != null) {
                        PillActions(current, controller, textColor, dark, Modifier.align(Alignment.End).offset(x = 4.dp))
                    }
                }
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                ) {
                    PillGlyph(current)
                    PillText(current, textColor, wrapTitle = false, modifier = Modifier.weight(1f, fill = false))
                    if (current.actionLabel != null) {
                        PillActions(current, controller, textColor, dark, Modifier.offset(x = 4.dp))
                    }
                }
            }
            // The countdown, inside the border: a 14px strip clipped to the
            // inner bottom corners, its 3.6px fill shrinking to the left.
            if (slice != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(NotifBorderWidth)
                        .fillMaxWidth()
                        .height(14.dp)
                        .clip(RoundedCornerShape(bottomStart = 13.5.dp, bottomEnd = 13.5.dp)),
                ) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .height(3.6.dp)
                            .graphicsLayer {
                                scaleX = progress.value
                                transformOrigin = TransformOrigin(0f, 0.5f)
                            }
                            .background(Brush.verticalGradient(listOf(Color.Transparent, current.variant.accent))),
                    )
                }
            }
        }
    }
}

@Composable
private fun PillGlyph(toast: GkToast, modifier: Modifier = Modifier) {
    Box(modifier.size(22.dp), contentAlignment = Alignment.Center) {
        NotifGlyph(toast.icon?.takeIf { it in PillSemanticIcons }, toast.variant, 18.dp)
    }
}

/** The title over the message. A single-row pill cuts its title short; a
 *  stacked one lets it wrap. */
@Composable
private fun PillText(toast: GkToast, textColor: Color, wrapTitle: Boolean, modifier: Modifier) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = modifier) {
        toast.title?.let {
            Text(
                it,
                color = textColor,
                fontSize = 13.sp,
                lineHeight = 16.9.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = if (wrapTitle) Int.MAX_VALUE else 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            toast.message,
            color = textColor.copy(alpha = 0.85f),
            fontSize = 12.5.sp,
            lineHeight = 16.25.sp,
        )
    }
}

/** `.gk-mobile-toast__action`: bold accent text buttons, the outlined
 *  second one in the text colour; a stacked pill makes them roomier. */
@Composable
private fun PillActions(toast: GkToast, controller: ToastController, textColor: Color, dark: Boolean, modifier: Modifier) {
    val fontSize = if (toast.stacked) 13.sp else 12.5.sp
    val lineHeight = if (toast.stacked) 16.9.sp else 16.25.sp
    @Composable
    fun Action(label: String, outlined: Boolean, onClick: (() -> Unit)?) {
        val shape = RoundedCornerShape(8.dp)
        Text(
            label,
            color = if (outlined) textColor else toast.variant.accent,
            fontSize = fontSize,
            lineHeight = lineHeight,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .clip(shape)
                .then(
                    if (outlined) {
                        Modifier.border(1.dp, if (dark) Color.White.copy(alpha = 0.22f) else Color.Black.copy(alpha = 0.18f), shape)
                    } else {
                        Modifier
                    },
                )
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) {
                    onClick?.invoke()
                    controller.resolve(toast)
                }
                .padding(
                    horizontal = if (toast.stacked) 12.dp else if (outlined) 9.dp else 10.dp,
                    vertical = if (toast.stacked) 6.dp else if (outlined) 3.dp else 4.dp,
                )
                // The CSS border adds to the padding instead of eating it.
                .then(if (outlined) Modifier.padding(1.dp) else Modifier),
        )
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier,
    ) {
        toast.actionLabel?.let { Action(it, outlined = false, onClick = toast.action) }
        toast.secondaryActionLabel?.let { Action(it, outlined = toast.secondaryOutlined, onClick = toast.secondaryAction) }
    }
}

/** NotificationMobileToast.jsx's own SEMANTIC_ICONS: the pill knows fewer
 *  keys than the centre's cards and falls back on the variant glyph for
 *  the rest (a reminder, notably). */
private val PillSemanticIcons = setOf(
    "trash", "trash-x", "restore", "archive", "archive-off", "copy", "save", "share", "unshare",
    "user-plus", "user-check", "user-x", "user-clock", "key", "shield", "qr", "camera", "refresh", "power",
)

/** CSS asks 2.5px; Chromium floors every border to whole pixels. */
internal val NotifBorderWidth = 2.dp

/**
 * The LED-strip surface the pill and the centre's cards share
 * (globalCSS.js .gk-notif-card / .gk-mobile-toast): a drop shadow, a soft
 * accent bleed and a crisp 1px accent ring outside the border, the card
 * fill under the variant tint, the `inset 0 1px 0` highlight, then the
 * accent border itself.
 */
internal fun Modifier.notifLedSurface(variant: NotifVariant, dark: Boolean, shape: RoundedCornerShape, fill: Color): Modifier {
    val accent = variant.accent
    return this
        .dropShadow(
            shape,
            Shadow(
                radius = 14.dp,
                color = if (dark) Color.Black.copy(alpha = 0.55f) else Color(0xFF0F172A).copy(alpha = 0.10f),
                spread = (-2).dp,
                offset = DpOffset(0.dp, 6.dp),
            ),
        )
        .dropShadow(shape, Shadow(radius = if (dark) 5.dp else 4.dp, color = accent.copy(alpha = if (dark) 0.60f else 0.45f)))
        .dropShadow(shape, Shadow(radius = 0.dp, color = accent.copy(alpha = if (dark) 0.45f else 0.32f), spread = 1.dp))
        .clip(shape)
        .background(fill)
        .background(accent.copy(alpha = variant.tintAlpha))
        .drawBehind {
            val border = NotifBorderWidth.toPx()
            val radius = CornerRadius(shape.topStart.toPx(size, this) - border)
            val inner = Path().apply {
                addRoundRect(RoundRect(border, border, size.width - border, size.height - border, radius))
            }
            val lowered = Path().apply {
                addRoundRect(RoundRect(border, border + 1.dp.toPx(), size.width - border, size.height - border + 1.dp.toPx(), radius))
            }
            drawPath(
                Path.combine(PathOperation.Difference, inner, lowered),
                color = if (dark) Color.White.copy(alpha = 0.06f) else Color.White.copy(alpha = 0.80f),
            )
        }
        .border(NotifBorderWidth, accent, shape)
}
