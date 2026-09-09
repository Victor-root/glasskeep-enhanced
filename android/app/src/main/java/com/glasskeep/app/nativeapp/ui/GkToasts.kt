package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import com.glasskeep.app.nativeapp.EditorPrefsState
import com.glasskeep.app.nativeapp.NotificationDing
import com.glasskeep.app.nativeapp.data.NotifCategory
import com.glasskeep.app.nativeapp.data.NotifVariantKey
import kotlinx.coroutines.delay

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
    val message: String,
    val variant: NotifVariant,
    val actionLabel: String? = null,
    val action: (() -> Unit)? = null,
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

    fun show(
        message: String,
        variant: NotifVariant = NotifVariant.INFO,
        title: String? = null,
        actionLabel: String? = null,
        action: (() -> Unit)? = null,
        /** The server's own notification type when this pill is echoing
         *  one; null for a message the app raised itself, which is then
         *  categorised by its variant alone. */
        type: String? = null,
    ) {
        val category = NotifCategory.of(type, variant.categoryKey)
        val settings = prefs
        if (settings != null && !settings.allowsNotification(category)) return
        queue.add(GkToast(nextId++, title, message, variant, actionLabel, action))
        if (settings != null && settings.ringsFor(category)) NotificationDing.play()
    }

    fun error(message: String) = show(message, NotifVariant.ERROR)

    fun success(message: String) = show(message, NotifVariant.SUCCESS)

    internal fun dismiss(id: Long) {
        queue.removeAll { it.id == id }
    }
}

/** Available to every screen; NativeNavHost provides the real one. */
val LocalGkToasts = staticCompositionLocalOf { ToastController() }

@Composable
fun rememberToastController(): ToastController = remember { ToastController() }

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
    val slice = durationMs?.let { total ->
        if (controller.queue.size > 1) maxOf(MinBurstSliceMs, total / controller.queue.size) else total
    }

    var progress by remember(current.id) { mutableStateOf(1f) }
    LaunchedEffect(current.id, slice) {
        if (slice == null) return@LaunchedEffect
        val steps = 60
        val step = slice / steps
        repeat(steps) {
            delay(step)
            progress = 1f - (it + 1f) / steps
        }
        controller.dismiss(current.id)
    }

    val entry by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(durationMillis = 220, easing = CubicBezierEasing(0.22f, 0.61f, 0.36f, 1f)),
        label = "toastIn",
    )

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
                .graphicsLayer {
                    alpha = entry
                    translationY = (1f - entry) * (if (position == ToastPosition.TOP) -24.dp.toPx() else 24.dp.toPx())
                }
                .clip(shape)
                .background(cardColor)
                .background(current.variant.accent.copy(alpha = current.variant.tintAlpha))
                .border(2.5.dp, current.variant.accent, shape)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { controller.dismiss(current.id) },
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(11.dp),
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
            ) {
                Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
                    ToastVariantIcon(current.variant)
                }
                Column(
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                    modifier = Modifier.weight(1f, fill = false),
                ) {
                    current.title?.let {
                        Text(
                            it,
                            color = textColor,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        current.message,
                        color = textColor.copy(alpha = 0.85f),
                        fontSize = 12.5.sp,
                        lineHeight = 16.25.sp,
                    )
                }
                if (current.actionLabel != null) {
                    Text(
                        current.actionLabel,
                        color = current.variant.accent,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) {
                                current.action?.invoke()
                                controller.dismiss(current.id)
                            }
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }
            // The countdown drains left to right along the bottom edge.
            if (slice != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth(progress)
                        .height(3.6.dp)
                        .background(
                            Brush.verticalGradient(listOf(Color.Transparent, current.variant.accent)),
                        ),
                )
            }
        }
    }
}

/** The filled variant glyph the pill falls back on when a notification
 *  carries no semantic icon of its own. */
@Composable
private fun ToastVariantIcon(variant: NotifVariant) {
    when (variant) {
        NotifVariant.SUCCESS -> CheckFilledIcon(size = 18.dp, tint = variant.accent)
        NotifVariant.WARNING, NotifVariant.ERROR -> AlertFilledIcon(size = 18.dp, tint = variant.accent)
        NotifVariant.INFO -> InfoFilledIcon(size = 18.dp, tint = variant.accent)
    }
}
