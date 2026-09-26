package com.glasskeep.app.nativeapp.ui

import android.os.Build
import android.view.WindowManager
import androidx.annotation.StringRes
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.network.MemoryUsageDto
import com.glasskeep.app.nativeapp.data.network.SelfUpdateSystemDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.delay
import java.util.Locale
import kotlin.math.roundToLong

/**
 * SelfUpdateProgress.jsx: the window a one-click update runs under, over
 * everything, from the start request to its outcome. The step and its
 * progress bar, the host's memory and CPU on a native install, the error
 * when it failed, the expert details and the technical log behind "Show
 * details", then Reload after a success, Close after anything else, and
 * Cancel while a native update can still be stopped.
 */
@Composable
internal fun SelfUpdateProgress(update: ServerUpdateState, themeId: String?, dark: Boolean, onReload: () -> Unit) {
    val phase = update.phase
    if (phase == SelfUpdatePhase.IDLE) return
    val status = update.status
    val success = phase == SelfUpdatePhase.SUCCESS
    val error = phase == SelfUpdatePhase.ERROR
    val rolledBack = phase == SelfUpdatePhase.ROLLED_BACK
    val cancelled = phase == SelfUpdatePhase.CANCELLED
    val terminal = success || error || rolledBack || cancelled
    val cancelAvailable = phase.active && !update.cancelling &&
        (update.mode == "native" || (update.mode == null && status?.mode == "native"))
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

    // Read in any phase but idle, even with the details folded: a failure
    // is explained from it.
    var logText by remember { mutableStateOf("") }
    LaunchedEffect(phase) {
        val logFinished = success || error || rolledBack
        if (!phase.active && !logFinished) return@LaunchedEffect
        while (true) {
            update.readLog()?.let { logText = it }
            if (!phase.active) break
            delay(1_000)
        }
    }
    val failureHint = if (error || rolledBack) failureHintOf(logText) else null
    var confirmCancel by remember { mutableStateOf(false) }

    // The details scroll with the log: stuck to the bottom while new
    // lines come in, let go once scrolled up, caught again within 40px.
    val scrollState = rememberScrollState()
    val stickThreshold = with(LocalDensity.current) { 40.dp.toPx() }
    var stickToBottom by remember { mutableStateOf(true) }
    LaunchedEffect(scrollState) {
        snapshotFlow { scrollState.value }.collect { stickToBottom = scrollState.maxValue - it < stickThreshold }
    }
    LaunchedEffect(logText) {
        if (!stickToBottom) return@LaunchedEffect
        withFrameNanos { }
        scrollState.scrollTo(scrollState.maxValue)
    }

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        val density = LocalDensity.current
        SideEffect {
            window?.setWindowAnimations(0)
            window?.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            window?.setDimAmount(0.6f)
            // backdrop-blur-sm, where the platform can blur what is behind.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                window?.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                window?.attributes = window?.attributes?.apply {
                    blurBehindRadius = with(density) { cssBlur(8.dp).roundToPx() }
                }
            }
        }
        val shape = RoundedCornerShape(16.dp)
        Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
            Column(
                Modifier
                    .widthIn(max = 672.dp)
                    .fillMaxWidth()
                    .then(if (update.showDetails) Modifier.fillMaxHeight() else Modifier)
                    .tailwindShadow2xl(shape)
                    .clip(shape)
                    .background(if (dark) DarkCard else Color.White)
                    .border(1.dp, borderColor, shape),
            ) {
                Column(Modifier.padding(start = 24.dp, end = 24.dp, top = 24.dp, bottom = 16.dp)) {
                    Row {
                        StateIcon(phase, dark)
                        Spacer(Modifier.width(16.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                stringResource(headlineOf(phase, update.cancelling)),
                                color = if (dark) Gray50 else Gray900,
                                fontSize = 18.sp,
                                lineHeight = 28.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                stringResource(subtextOf(phase, update.cancelling, failureHint)),
                                color = if (dark) Gray300 else Gray600,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                            )
                        }
                    }
                    Spacer(Modifier.height(20.dp))
                    val step = status?.step ?: 0
                    val totalSteps = status?.totalSteps?.takeIf { it > 0 } ?: 5
                    if (terminal) {
                        StepBar(fraction = 1f, color = if (success) Emerald500 else Red500, dark = dark)
                    } else {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                if (phase == SelfUpdatePhase.WAITING_FOR_SERVER) {
                                    stringResource(R.string.native_update_step_waiting)
                                } else {
                                    stepLabel(status?.state)
                                },
                                color = if (dark) Gray200 else Gray700,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                "${minOf(step, totalSteps)} / $totalSteps",
                                color = Gray500,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                style = TabularNumbers,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        StepBar(fraction = (step.toFloat() / totalSteps).coerceIn(0f, 1f), color = Indigo500, dark = dark)
                        if (status?.state == "installing" || status?.state == "building") {
                            Spacer(Modifier.height(12.dp))
                            Text(
                                stringResource(R.string.native_update_slow_step_hint),
                                color = if (dark) Gray400 else Gray500,
                                fontSize = 12.sp,
                                lineHeight = 16.sp,
                            )
                        }
                        if (update.slowResponse) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                stringResource(R.string.native_update_slow_response_hint),
                                color = if (dark) Amber400 else Amber600,
                                fontSize = 12.sp,
                                lineHeight = 16.sp,
                            )
                        }
                        // The readings only ever describe the container on
                        // Docker, which is worse than nothing.
                        if (update.mode != "docker") SystemMonitor(update, dark)
                    }
                    val errorMessage = update.startError ?: status?.error
                    if (errorMessage != null && (error || rolledBack)) {
                        Spacer(Modifier.height(16.dp))
                        ErrorBox(errorMessage, dark)
                    }
                }

                Column(
                    Modifier
                        .weight(1f, fill = update.showDetails)
                        .verticalScroll(scrollState)
                        .padding(start = 24.dp, end = 24.dp, bottom = 8.dp),
                ) {
                    val toggleColor = if (dark) Gray400 else Gray500
                    Row(
                        Modifier.clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { update.showDetails = !update.showDetails },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Terminal2Icon(size = 20.dp, tint = toggleColor)
                        Spacer(Modifier.width(4.dp))
                        Text(
                            stringResource(if (update.showDetails) R.string.native_update_hide_details else R.string.native_update_show_details),
                            color = toggleColor,
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                        )
                    }
                    if (update.showDetails) {
                        Spacer(Modifier.height(8.dp))
                        DetailsPanel(update, dark, borderColor)
                        Spacer(Modifier.height(12.dp))
                        TechnicalLog(logText, dark, borderColor)
                    }
                }

                Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
                FlowRow(
                    Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    itemVerticalAlignment = Alignment.CenterVertically,
                ) {
                    if (success) {
                        GkGradientButton(
                            label = stringResource(R.string.native_update_reload),
                            themeId = themeId,
                            // A bare btn-gradient: the workspace themes swap
                            // in their own gradient for the default green.
                            gradient = if (WorkspaceTheme.forId(themeId).id == WorkspaceTheme.DEFAULT_ID) ReloadGradient else null,
                            leading = { RefreshIcon(size = 20.dp, tint = Color.White) },
                            onClick = onReload,
                        )
                    }
                    if (error || rolledBack || cancelled) {
                        Text(
                            stringResource(R.string.native_common_close),
                            color = if (dark) Color.White else Gray800,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (dark) Color.White.copy(alpha = 0.1f) else Gray200)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { update.dismiss() }
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                    if (cancelAvailable) {
                        val cancelColor = if (dark) Red300 else Red700
                        Row(
                            Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .border(
                                    1.dp,
                                    if (dark) Red500.copy(alpha = 0.4f) else Red300.copy(alpha = 0.6f),
                                    RoundedCornerShape(8.dp),
                                )
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { confirmCancel = true }
                                .padding(horizontal = 13.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CloseIcon(size = 20.dp, tint = cancelColor, strokeWidth = 1.75f)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                stringResource(R.string.native_update_cancel),
                                color = cancelColor,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                    if (phase.active && !update.cancelling) {
                        Text(
                            stringResource(R.string.native_update_keep_open_hint),
                            color = if (dark) Gray400 else Gray500,
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                        )
                    }
                }
            }
        }
    }

    if (confirmCancel) {
        GkConfirmDialog(
            title = stringResource(R.string.native_update_cancel_confirm_title),
            message = stringResource(R.string.native_update_cancel_confirm_message),
            confirmLabel = stringResource(R.string.native_update_cancel_confirm_button),
            cancelLabel = stringResource(R.string.native_dialog_cancel),
            themeId = themeId,
            dark = dark,
            borderColor = borderColor,
            titleColor = titleColor,
            subtextColor = if (dark) DialogBodyDark else DialogBodyLight,
            variant = GkConfirmVariant.DANGER,
            onConfirm = {
                confirmCancel = false
                if (cancelAvailable) update.cancel()
            },
            onDismiss = { confirmCancel = false },
        )
    }
}

/** The 48px disc: a check on success, an X on a failure (red) or a
 *  rollback (amber), a spinner while it runs. */
@Composable
private fun StateIcon(phase: SelfUpdatePhase, dark: Boolean) {
    val (fill, tint) = when (phase) {
        SelfUpdatePhase.SUCCESS -> Emerald500 to (if (dark) Emerald300 else Emerald600)
        SelfUpdatePhase.ERROR -> Red500 to (if (dark) Red300 else Red600)
        SelfUpdatePhase.ROLLED_BACK, SelfUpdatePhase.CANCELLED -> Amber500 to (if (dark) Amber300 else Amber600)
        else -> Indigo500 to Indigo600
    }
    Box(
        Modifier.size(48.dp).background(fill.copy(alpha = 0.15f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        when (phase) {
            SelfUpdatePhase.SUCCESS -> TablerCheckIcon(size = 20.dp, tint = tint)
            SelfUpdatePhase.ERROR, SelfUpdatePhase.ROLLED_BACK, SelfUpdatePhase.CANCELLED ->
                CloseIcon(size = 20.dp, tint = tint, strokeWidth = 1.75f)
            else -> BorderSpinner()
        }
    }
}

/** `border-2 border-indigo-300 border-t-indigo-600 animate-spin`: a ring
 *  whose top quarter is darker, turning once a second. */
@Composable
private fun BorderSpinner() {
    val angle = rememberSpinAngle()
    Canvas(Modifier.size(20.dp).rotate(angle)) {
        val stroke = 2.dp.toPx()
        val inset = stroke / 2f
        val arcSize = Size(size.width - stroke, size.height - stroke)
        drawCircle(Indigo300, radius = (size.minDimension - stroke) / 2f, style = Stroke(stroke))
        drawArc(Indigo600, startAngle = 225f, sweepAngle = 90f, useCenter = false, topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke))
    }
}

/** A rounded progress track, its fill easing to each new width. */
@Composable
private fun StepBar(fraction: Float, color: Color, dark: Boolean, height: Dp = 8.dp) {
    val width by animateFloatAsState(
        targetValue = fraction,
        animationSpec = tween(durationMillis = 500, easing = GkStandardEasing),
        label = "updateBar",
    )
    Box(
        Modifier
            .fillMaxWidth()
            .height(height)
            .clip(CircleShape)
            .background(if (dark) Color.White.copy(alpha = 0.1f) else Gray200),
    ) {
        Box(Modifier.fillMaxWidth(width).fillMaxHeight().background(color))
    }
}

/** The red box under the progress: the start request's refusal or the
 *  status file's own error, verbatim. */
@Composable
private fun ErrorBox(message: String, dark: Boolean) {
    val color = if (dark) Red200 else Red800
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (dark) Red500.copy(alpha = 0.1f) else Red50, RoundedCornerShape(8.dp))
            .border(1.dp, if (dark) Red500.copy(alpha = 0.3f) else Red300.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
            .padding(horizontal = 13.dp, vertical = 9.dp),
    ) {
        Text(stringResource(R.string.native_update_error_title), color = color, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(2.dp))
        Text(message, color = color, fontSize = 12.sp, lineHeight = 16.sp, fontFamily = FontFamily.Monospace)
    }
}

/** The host's RAM, swap and CPU gauges, read every second; after three
 *  reads in a row fail, the last values stay but are marked as such. */
@Composable
private fun SystemMonitor(update: ServerUpdateState, dark: Boolean) {
    var info by remember { mutableStateOf<SelfUpdateSystemDto?>(null) }
    var failedReads by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            val read = update.readSystem()
            if (read != null) info = read
            failedReads = if (read != null) 0 else failedReads + 1
            delay(1_000)
        }
    }
    val current = info ?: return
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (failedReads >= 3) {
            Text(
                stringResource(R.string.native_update_gauges_stale),
                color = if (dark) Amber400 else Amber600,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontStyle = FontStyle.Italic,
            )
        }
        MemoryGauge(current.mem, R.string.native_update_ram, R.string.native_update_ram_saturated, elevatedAt = 75.0, dark = dark) {
            RamIcon(size = 20.dp, tint = it)
        }
        current.swap?.let {
            MemoryGauge(it, R.string.native_update_swap, R.string.native_update_swap_saturated, elevatedAt = 50.0, dark = dark) { tint ->
                ArrowsDownUpIcon(size = 20.dp, tint = tint)
            }
        }
        current.cpu.percent?.let { cpuPercent ->
            val cores = current.cpu.count.takeIf { it > 0 } ?: 1
            Gauge(
                percent = cpuPercent.coerceIn(0.0, 100.0),
                label = stringResource(R.string.native_update_cpu),
                saturated = stringResource(R.string.native_update_cpu_saturated),
                value = "${formatPercent(cpuPercent)}% ($cores ${stringResource(if (cores > 1) R.string.native_update_cpu_cores else R.string.native_update_cpu_core)})",
                elevatedAt = 70.0,
                dark = dark,
            ) { CpuIcon(size = 20.dp, tint = it) }
        }
    }
}

@Composable
private fun MemoryGauge(
    usage: MemoryUsageDto,
    @StringRes label: Int,
    @StringRes saturated: Int,
    elevatedAt: Double,
    dark: Boolean,
    icon: @Composable (Color) -> Unit,
) {
    val percent = usage.percent.coerceIn(0.0, 100.0)
    Gauge(
        percent = percent,
        label = stringResource(label),
        saturated = stringResource(saturated),
        value = "${formatBytes(usage.used)} / ${formatBytes(usage.total)} (${formatPercent(percent)}%)",
        elevatedAt = elevatedAt,
        dark = dark,
        icon = icon,
    )
}

/** One gauge: grey, amber past [elevatedAt], red and "saturated" past
 *  90%, over a 6px bar in the same tone. */
@Composable
private fun Gauge(
    percent: Double,
    label: String,
    saturated: String,
    value: String,
    elevatedAt: Double,
    dark: Boolean,
    icon: @Composable (Color) -> Unit,
) {
    val high = percent >= 90.0
    val elevated = percent >= elevatedAt
    val textColor = when {
        high -> if (dark) Red300 else Red600
        elevated -> if (dark) Amber300 else Amber600
        else -> if (dark) Gray400 else Gray500
    }
    val weight = if (high) FontWeight.Medium else FontWeight.Normal
    Column {
        Row(Modifier.fillMaxWidth().height(20.dp), verticalAlignment = Alignment.CenterVertically) {
            icon(textColor)
            Spacer(Modifier.width(6.dp))
            Text(label, color = textColor, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = weight)
            if (high) {
                Spacer(Modifier.width(10.dp))
                Text("· $saturated", color = textColor, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.weight(1f))
            Text(value, color = textColor, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = weight, style = TabularNumbers)
        }
        Spacer(Modifier.height(4.dp))
        StepBar(
            fraction = (percent / 100.0).toFloat(),
            color = when {
                high -> Red500
                elevated -> Amber500
                else -> Emerald500
            },
            dark = dark,
            height = 6.dp,
        )
    }
}

/** The expert details: one "label: value" line per fact of the run. */
@Composable
private fun DetailsPanel(update: ServerUpdateState, dark: Boolean, borderColor: Color) {
    val status = update.status
    val phase = update.phase
    val failed = phase == SelfUpdatePhase.ERROR || phase == SelfUpdatePhase.ROLLED_BACK
    val empty = stringResource(R.string.native_update_empty)
    val modeValue = when (val mode = status?.mode ?: update.mode) {
        "native" -> stringResource(R.string.native_update_mode_native)
        "docker" -> stringResource(R.string.native_update_mode_docker)
        else -> mode ?: empty
    }
    val step = status?.step ?: 0
    val totalSteps = status?.totalSteps?.takeIf { it > 0 } ?: 5
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (dark) Color.Black.copy(alpha = 0.3f) else Gray50, RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val color = if (dark) Gray200 else Gray700
        @Composable
        fun Line(@StringRes label: Int, value: String?, hideIfEmpty: Boolean = false) {
            if (hideIfEmpty && value.isNullOrEmpty()) return
            Row {
                Text(
                    "${stringResource(label)}:",
                    color = color.copy(alpha = 0.6f),
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontFamily = FontFamily.Monospace,
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    value?.takeIf { it.isNotEmpty() } ?: empty,
                    color = color,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Line(R.string.native_update_detail_mode, modeValue)
        Line(R.string.native_update_detail_state, stepLabel(status?.state).ifEmpty { status?.state ?: phase.name.lowercase() })
        Line(if (failed) R.string.native_update_detail_failed_at_step else R.string.native_update_detail_step, "$step / $totalSteps")
        Line(R.string.native_update_detail_from_version, status?.fromVersion?.let { "v$it" })
        Line(R.string.native_update_detail_to_version, status?.toVersion?.let { "v$it" })
        Line(R.string.native_update_detail_message, status?.message, hideIfEmpty = true)
        Line(R.string.native_update_detail_started_at, status?.startedAt)
        Line(R.string.native_update_detail_ended_at, status?.endedAt)
        Line(R.string.native_update_detail_duration, durationBetween(status?.startedAt, status?.endedAt) ?: empty)
        Line(R.string.native_update_detail_acknowledged_at, status?.acknowledgedAt, hideIfEmpty = true)
        Line(R.string.native_update_detail_error, status?.error ?: update.startError, hideIfEmpty = true)
        Line(
            R.string.native_update_detail_rolled_back,
            stringResource(if (status?.rolledBack == true) R.string.native_update_yes else R.string.native_update_no),
        )
    }
}

/** The update's raw output, its hundreds of font asset lines folded into
 *  one line that unfolds on a tap. */
@Composable
private fun TechnicalLog(text: String, dark: Boolean, borderColor: Color) {
    val color = if (dark) Gray200 else Gray700
    val subtle = if (dark) Gray400 else Gray500
    val items = remember(text) { processLog(text) }
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (dark) Color.Black.copy(alpha = 0.3f) else Gray50, RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        Text(
            stringResource(R.string.native_update_log_title).uppercase(),
            color = subtle,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace,
            letterSpacing = 0.3.sp,
        )
        Spacer(Modifier.height(8.dp))
        if (items.isEmpty()) {
            Text(
                stringResource(R.string.native_update_log_empty),
                color = color.copy(alpha = 0.6f),
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                fontFamily = FontFamily.Monospace,
                fontStyle = FontStyle.Italic,
            )
        }
        items.forEachIndexed { index, item ->
            when (item) {
                is LogItem.Line -> Text(
                    item.text.ifEmpty { " " },
                    color = color,
                    fontSize = 11.sp,
                    lineHeight = 16.5.sp,
                    fontFamily = FontFamily.Monospace,
                )
                is LogItem.Fonts -> FontGroup(item.lines, index, subtle)
            }
        }
    }
}

@Composable
private fun FontGroup(lines: List<String>, index: Int, color: Color) {
    var open by remember(index) { mutableStateOf(false) }
    Column {
        Row(
            Modifier.clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { open = !open },
        ) {
            Text(if (open) "▼" else "▶", color = color.copy(alpha = 0.7f), fontSize = 11.sp, lineHeight = 16.5.sp, fontFamily = FontFamily.Monospace)
            Spacer(Modifier.width(4.dp))
            Text(
                "+ ${stringResource(R.string.native_update_log_font_assets, lines.size)}",
                color = color,
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                fontFamily = FontFamily.Monospace,
                fontStyle = FontStyle.Italic,
            )
            Spacer(Modifier.width(4.dp))
            Text(
                "(${stringResource(if (open) R.string.native_update_log_hide_fonts else R.string.native_update_log_show_fonts)})",
                color = color.copy(alpha = 0.6f),
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                fontFamily = FontFamily.Monospace,
            )
        }
        if (open) {
            Column(Modifier.padding(start = 16.dp, top = 2.dp).alpha(0.7f)) {
                lines.forEach {
                    Text(it, color = color, fontSize = 11.sp, lineHeight = 16.5.sp, fontFamily = FontFamily.Monospace)
                }
            }
        }
    }
}

private sealed interface LogItem {
    data class Line(val text: String) : LogItem
    data class Fonts(val lines: List<String>) : LogItem
}

/** The log's lines, each run of font asset lines as one item, trailing
 *  blank lines dropped. */
private fun processLog(text: String): List<LogItem> {
    if (text.isEmpty()) return emptyList()
    val out = mutableListOf<LogItem>()
    var fonts = mutableListOf<String>()
    fun flush() {
        if (fonts.isNotEmpty()) {
            out.add(LogItem.Fonts(fonts))
            fonts = mutableListOf()
        }
    }
    for (line in text.split("\n")) {
        if (FontAssetLine.containsMatchIn(line)) {
            fonts.add(line)
        } else {
            flush()
            out.add(LogItem.Line(line))
        }
    }
    flush()
    while ((out.lastOrNull() as? LogItem.Line)?.text?.isEmpty() == true) out.removeAt(out.lastIndex)
    return out
}

private enum class FailureHint { OOM, NETWORK, PERMISSIONS, DISK }

/** The known causes of a failed run, read from its log. */
private fun failureHintOf(log: String): FailureHint? = when {
    log.isEmpty() -> null
    OomPattern.containsMatchIn(log) -> FailureHint.OOM
    NetworkPattern.containsMatchIn(log) -> FailureHint.NETWORK
    PermissionsPattern.containsMatchIn(log) -> FailureHint.PERMISSIONS
    DiskPattern.containsMatchIn(log) -> FailureHint.DISK
    else -> null
}

@StringRes
private fun headlineOf(phase: SelfUpdatePhase, cancelling: Boolean): Int = when {
    phase == SelfUpdatePhase.SUCCESS -> R.string.native_update_headline_success
    phase == SelfUpdatePhase.ERROR -> R.string.native_update_headline_error
    phase == SelfUpdatePhase.ROLLED_BACK -> R.string.native_update_headline_rolled_back
    phase == SelfUpdatePhase.CANCELLED -> R.string.native_update_headline_cancelled
    cancelling -> R.string.native_update_headline_cancelling
    else -> R.string.native_update_headline_running
}

@StringRes
private fun subtextOf(phase: SelfUpdatePhase, cancelling: Boolean, hint: FailureHint?): Int = when {
    phase == SelfUpdatePhase.SUCCESS -> R.string.native_update_subtext_success
    phase == SelfUpdatePhase.ERROR -> when (hint) {
        FailureHint.OOM -> R.string.native_update_subtext_error_oom
        FailureHint.NETWORK -> R.string.native_update_subtext_error_network
        FailureHint.PERMISSIONS -> R.string.native_update_subtext_error_permissions
        FailureHint.DISK -> R.string.native_update_subtext_error_disk
        null -> R.string.native_update_subtext_error
    }
    phase == SelfUpdatePhase.ROLLED_BACK -> when (hint) {
        FailureHint.OOM -> R.string.native_update_subtext_rolled_back_oom
        FailureHint.NETWORK -> R.string.native_update_subtext_rolled_back_network
        FailureHint.PERMISSIONS -> R.string.native_update_subtext_rolled_back_permissions
        FailureHint.DISK -> R.string.native_update_subtext_rolled_back_disk
        null -> R.string.native_update_subtext_rolled_back
    }
    phase == SelfUpdatePhase.CANCELLED -> R.string.native_update_subtext_cancelled
    cancelling -> R.string.native_update_subtext_cancelling
    phase == SelfUpdatePhase.WAITING_FOR_SERVER -> R.string.native_update_subtext_waiting
    else -> R.string.native_update_subtext_running
}

/** A step's name, or the raw state the web shows for one it does not know. */
@Composable
private fun stepLabel(state: String?): String {
    val res = when (state) {
        "queued" -> R.string.native_update_step_queued
        "preparing" -> R.string.native_update_step_preparing
        "stopping_service" -> R.string.native_update_step_stopping
        "fetching" -> R.string.native_update_step_fetching
        "renaming" -> R.string.native_update_step_renaming
        "creating" -> R.string.native_update_step_creating
        "installing" -> R.string.native_update_step_installing
        "building" -> R.string.native_update_step_building
        "starting_service" -> R.string.native_update_step_starting
        "rolling_back" -> R.string.native_update_step_rolling_back
        "success" -> R.string.native_update_step_success
        "error" -> R.string.native_update_step_error
        "rolled_back" -> R.string.native_update_step_rolled_back
        "cancelled" -> R.string.native_update_step_cancelled
        else -> null
    }
    return res?.let { stringResource(it) } ?: state.orEmpty()
}

/** formatDuration(): milliseconds under a second, else "Xm Ys" or "Ys";
 *  null when either end is missing or unreadable. */
private fun durationBetween(startIso: String?, endIso: String?): String? {
    val start = startIso?.let(::parseIsoToEpochMillis) ?: return null
    val end = endIso?.let(::parseIsoToEpochMillis) ?: return null
    val ms = end - start
    if (ms < 0) return null
    if (ms < 1_000) return "$ms ms"
    val totalSeconds = (ms / 1_000.0).roundToLong()
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
}

/** formatBytes(): KB under a megabyte, MB under a gigabyte, GB with one
 *  decimal beyond, always with the dot the web's toFixed prints. */
private fun formatBytes(bytes: Double): String = when {
    bytes.isNaN() || bytes.isInfinite() || bytes < 0 -> "-"
    bytes < MiB -> "${(bytes / 1024).roundToLong()} KB"
    bytes < GiB -> "${(bytes / MiB).roundToLong()} MB"
    else -> String.format(Locale.ROOT, "%.1f GB", bytes / GiB)
}

private fun formatPercent(percent: Double): String = String.format(Locale.ROOT, "%.0f", percent)

private val TabularNumbers = TextStyle(fontFeatureSettings = "tnum")

private val FontAssetLine = Regex("^dist/assets/.+\\.(woff2?|otf|ttf|eot)\\s")
private val OomPattern = Regex("Reached heap limit|JavaScript heap out of memory|Allocation failed", RegexOption.IGNORE_CASE)
private val NetworkPattern = Regex(
    "Could not resolve host|Connection refused|ENETUNREACH|Network is unreachable|fatal: unable to access",
    RegexOption.IGNORE_CASE,
)
private val PermissionsPattern = Regex("Permission denied|EACCES", RegexOption.IGNORE_CASE)
private val DiskPattern = Regex("ENOSPC|No space left on device", RegexOption.IGNORE_CASE)

private const val MiB = 1024.0 * 1024.0
private const val GiB = MiB * 1024.0

/** The success's Reload in the default theme: emerald-500 to green-600. */
private val ReloadGradient = Brush.horizontalGradient(listOf(Color(0xFF00BC7D), Color(0xFF00A63E)))

/** `var(--bg-elevated, #1a1a1f)`: no theme defines the variable. */
private val DarkCard = Color(0xFF1A1A1F)

private val Gray50 = Color(0xFFF9FAFB)
private val Gray200 = Color(0xFFE5E7EB)
private val Gray300 = Color(0xFFD1D5DC)
private val Gray400 = Color(0xFF99A1AF)
private val Gray500 = Color(0xFF6A7282)
private val Gray600 = Color(0xFF4A5565)
private val Gray700 = Color(0xFF364153)
private val Gray800 = Color(0xFF1E2939)
private val Gray900 = Color(0xFF101828)
private val Emerald300 = Color(0xFF5EE9B5)
private val Emerald500 = Color(0xFF00BC7D)
private val Emerald600 = Color(0xFF009966)
private val Red50 = Color(0xFFFEF2F2)
private val Red200 = Color(0xFFFFC9C9)
private val Red300 = Color(0xFFFFA2A2)
private val Red500 = Color(0xFFFB2C36)
private val Red600 = Color(0xFFE7000B)
private val Red700 = Color(0xFFC10007)
private val Red800 = Color(0xFF9F0712)
private val Amber300 = Color(0xFFFFD230)
private val Amber400 = Color(0xFFFFB900)
private val Amber500 = Color(0xFFFE9A00)
private val Amber600 = Color(0xFFE17100)
private val Indigo300 = Color(0xFFA3B3FF)
private val Indigo500 = Color(0xFF615FFF)
private val Indigo600 = Color(0xFF4F39F6)
