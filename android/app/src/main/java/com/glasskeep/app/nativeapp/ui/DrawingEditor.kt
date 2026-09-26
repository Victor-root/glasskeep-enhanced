package com.glasskeep.app.nativeapp.ui

import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.DrawingDimensionsDto
import com.glasskeep.app.nativeapp.data.DrawingPointDto
import com.glasskeep.app.nativeapp.data.DrawingStrokeDto
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs

/** QUICK_COLORS (DrawingToolbar.jsx:6-15), in order. */
private val QUICK_COLORS = listOf(
    "#000000", "#FFFFFF", "#EF4444", "#F97316", "#FACC15", "#22C55E", "#3B82F6", "#8B5CF6",
)

/** SIZE_PRESETS (DrawingToolbar.jsx:18-23). */
private val SIZE_PRESETS = listOf(2f, 5f, 12f, 24f)

/** What NoteModal.jsx hands DrawingCanvas: a drawing that stores no size
 *  reads as 1200 x 800, and 800 is one page wherever the drawing does not
 *  say otherwise. */
private const val DEFAULT_DRAWING_WIDTH = 1200f
private const val DEFAULT_PAGE_HEIGHT = 800f

/** One page of a drawing (DrawingCanvas.jsx:502-507). */
internal fun drawingPageHeight(dimensions: DrawingDimensionsDto?): Float =
    dimensions?.originalHeight?.takeIf { it > 0f } ?: DEFAULT_PAGE_HEIGHT

/** startDrawing()/draw()'s `Math.max(size, 8)`: the eraser never reaches
 *  less than a comfortable touch target. */
private fun eraserRadius(strokeSize: Float): Float = maxOf(strokeSize, 8f)

/** The pen's colour until the user picks one: white on dark, black on
 *  light (DrawingCanvas.jsx:123, 203-204). */
internal fun defaultPenColor(dark: Boolean): String = if (dark) "#FFFFFF" else "#000000"

/**
 * What the draw mode draws with: pen or eraser, colour, size, and whether
 * the page guides show. The web keeps them in the draw-mode canvas itself,
 * so they start over each time the mode opens.
 */
@Stable
internal class DrawingTools(dark: Boolean) {
    var isEraser by mutableStateOf(false)
    var color by mutableStateOf(defaultPenColor(dark))
    var strokeSize by mutableFloatStateOf(SIZE_PRESETS[1])
    var showPageLines by mutableStateOf(true)
}

/**
 * The drawing outside draw mode (DrawingCanvas.jsx read-only): the full
 * width inside a 1px gray frame with 8px corners, at the drawing's own
 * proportions, then its stroke count.
 */
@Composable
internal fun DrawingPreview(paths: List<DrawingStrokeDto>, dimensions: DrawingDimensionsDto?, dark: Boolean) {
    val stored = dimensions?.takeIf { it.width > 0f && it.height > 0f }
    val width = stored?.width ?: DEFAULT_DRAWING_WIDTH
    val height = stored?.height ?: DEFAULT_PAGE_HEIGHT
    val frame = RoundedCornerShape(8.dp)
    val density = LocalDensity.current
    Column(Modifier.fillMaxWidth()) {
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .clip(frame)
                .border(1.dp, if (dark) Color(0xFF4A5565) else Color(0xFFD1D5DC), frame)
                .padding(1.dp),
        ) {
            val scale = constraints.maxWidth / width
            Canvas(
                Modifier
                    .fillMaxWidth()
                    .height(with(density) { (height * scale).toDp() })
                    .clipToBounds(),
            ) {
                drawStrokes(paths, scale, dark)
            }
        }
        // `{n} {label}`, the label plural for anything but exactly one.
        val count = paths.size
        Text(
            "$count " + stringResource(if (count != 1) R.string.native_drawing_strokes else R.string.native_drawing_stroke),
            color = if (dark) Color(0xFFD1D5DC) else Color(0xFF6A7282),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

/**
 * DrawingCanvas.jsx in draw mode: the drawing at the full width of the
 * area it is given, unframed, scrolled inside that area by two fingers
 * only since one finger draws, with the page guides behind the strokes.
 *
 * [canvasWidth] x [canvasHeight] is the drawing's size in its own units,
 * [pageHeight] one page of it. One finger starts a stroke on its first
 * move, or leaves a dot when it lifts without moving, keeping at most a
 * point per 16ms; the eraser removes each stroke it passes within
 * `max(size, 8)` of, the whole gesture one undo step. A second finger
 * drops the stroke in progress and scrolls by the fingers' average
 * height, and the scroll then coasts on, 8% slower each frame.
 */
@Composable
internal fun DrawingCanvasPane(
    paths: List<DrawingStrokeDto>,
    canvasWidth: Float,
    canvasHeight: Float,
    pageHeight: Float,
    tools: DrawingTools,
    dark: Boolean,
    onCommit: (List<DrawingStrokeDto>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val scroll = rememberScrollState()
    val currentPaths by rememberUpdatedState(paths)
    val currentOnCommit by rememberUpdatedState(onCommit)
    var livePoints by remember { mutableStateOf<List<Offset>?>(null) }
    var erasedPaths by remember { mutableStateOf<List<DrawingStrokeDto>?>(null) }
    val momentumScope = rememberCoroutineScope()
    val canvasCoordinates = remember { CoordinatesHolder() }

    BoxWithConstraints(modifier.fillMaxSize()) {
        val scale = constraints.maxWidth / canvasWidth
        val currentScale by rememberUpdatedState(scale)
        Box(
            Modifier
                .fillMaxSize()
                .verticalScroll(scroll, enabled = false),
        ) {
            Canvas(
                Modifier
                    .fillMaxWidth()
                    .height(with(density) { (canvasHeight * scale).toDp() })
                    .clipToBounds()
                    .onGloballyPositioned { canvasCoordinates.value = it }
                    .pointerInput(tools) {
                        var lastPointAt = 0L
                        var momentum: Job? = null

                        fun eraseAt(at: Offset) {
                            val current = erasedPaths ?: return
                            val radius = eraserRadius(tools.strokeSize) * currentScale
                            val hit = current.indexOfFirst { it.tool != "eraser" && isPointNearStroke(at, it, radius, currentScale) }
                            if (hit >= 0) erasedPaths = current.filterIndexed { i, _ -> i != hit }
                        }

                        awaitEachGesture {
                            val first = awaitFirstDown(requireUnconsumed = false)
                            first.consume()
                            momentum?.cancel()
                            var pending: Offset? = first.position
                            var drawing = false
                            var scrolling = false
                            var lastY = 0f
                            var velocity = 0f

                            fun startAt(at: Offset) {
                                drawing = true
                                if (tools.isEraser) {
                                    erasedPaths = currentPaths
                                    eraseAt(at)
                                } else {
                                    livePoints = listOf(at)
                                }
                            }

                            fun dropStroke() {
                                drawing = false
                                livePoints = null
                                erasedPaths = null
                            }

                            try {
                                while (true) {
                                    val event = awaitPointerEvent()
                                    // A cancelled gesture arrives with every finger up
                                    // and already consumed.
                                    val cancelled = event.changes.none { it.pressed } && event.changes.none { it.changedToUp() }
                                    event.changes.forEach { it.consume() }
                                    if (cancelled) break
                                    val down = event.changes.filter { it.pressed }
                                    if (down.isEmpty()) {
                                        pending?.let { startAt(it) }
                                        if (scrolling) {
                                            val stopBelow = 0.5f * density.density
                                            momentum = momentumScope.launch { coast(scroll::dispatchRawDelta, velocity, stopBelow) }
                                        } else if (drawing) {
                                            val erased = erasedPaths
                                            val points = livePoints
                                            if (tools.isEraser) {
                                                if (erased != null && erased !== currentPaths) currentOnCommit(erased)
                                            } else if (points != null) {
                                                val stroke = DrawingStrokeDto(
                                                    tool = "pen",
                                                    color = tools.color,
                                                    size = tools.strokeSize,
                                                    points = points.map { DrawingPointDto(it.x / currentScale, it.y / currentScale) },
                                                )
                                                currentOnCommit(currentPaths + stroke)
                                            }
                                            dropStroke()
                                        }
                                        break
                                    }
                                    if (down.size >= 2 || scrolling) {
                                        pending = null
                                        if (drawing) dropStroke()
                                        val heights = down.mapNotNull { canvasCoordinates.toRoot(it.position)?.y }
                                        if (heights.isEmpty()) continue
                                        val averageY = heights.average().toFloat()
                                        if (!scrolling || event.changes.any { it.changedToDownIgnoreConsumed() }) {
                                            scrolling = true
                                            lastY = averageY
                                            velocity = 0f
                                        } else if (event.changes.none { it.changedToUp() }) {
                                            // A lifted finger leaves the average where it was,
                                            // as the web's touchend does.
                                            val delta = averageY - lastY
                                            velocity = delta
                                            scroll.dispatchRawDelta(-delta)
                                            lastY = averageY
                                        }
                                        continue
                                    }
                                    val finger = down.single()
                                    if (!finger.positionChanged()) continue
                                    pending?.let {
                                        startAt(it)
                                        pending = null
                                    }
                                    if (finger.uptimeMillis - lastPointAt < 16) continue
                                    lastPointAt = finger.uptimeMillis
                                    if (tools.isEraser) eraseAt(finger.position) else livePoints = livePoints.orEmpty() + finger.position
                                }
                            } finally {
                                if (drawing) dropStroke()
                            }
                        }
                    },
            ) {
                if (tools.showPageLines) drawPageGuides(pageHeight, canvasHeight, scale, dark)
                drawStrokes(erasedPaths ?: paths, scale, dark)
                livePoints?.let { drawStroke(it, themedStrokeColor(tools.color, dark), tools.strokeSize * scale) }
            }
        }
    }
}

/** startMomentum() (DrawingCanvas.jsx:568-581): the last move's speed,
 *  losing 8% a frame until it drops to [stopBelow]. */
private suspend fun coast(scrollBy: (Float) -> Float, initial: Float, stopBelow: Float) {
    var velocity = initial
    if (abs(velocity) < stopBelow) return
    while (abs(velocity) > stopBelow) {
        withFrameNanos { }
        velocity *= 0.92f
        scrollBy(-velocity)
    }
}

/** The dashed 1px line at the foot of each page (DrawingCanvas.jsx:
 *  750-770): black 7% on light, white 10% on dark, 3px dashes. */
private fun DrawScope.drawPageGuides(pageHeight: Float, canvasHeight: Float, scale: Float, dark: Boolean) {
    if (pageHeight <= 0f) return
    val color = if (dark) Color.White.copy(alpha = 0.10f) else Color.Black.copy(alpha = 0.07f)
    val line = 1.dp.toPx()
    val dash = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))
    var y = pageHeight
    while (y <= canvasHeight) {
        val top = y * scale + line / 2f
        drawLine(color, Offset(0f, top), Offset(size.width, top), strokeWidth = line, pathEffect = dash)
        y += pageHeight
    }
}

/** renderPaths() (DrawingCanvas.jsx:67-86): every stroke but the legacy
 *  eraser ones, [scale] pixels to a drawing unit. */
private fun DrawScope.drawStrokes(paths: List<DrawingStrokeDto>, scale: Float, dark: Boolean) {
    for (stroke in paths) {
        if (stroke.tool == "eraser" || stroke.points.isEmpty()) continue
        val points = stroke.points.map { Offset(it.x * scale, it.y * scale) }
        drawStroke(points, themedStrokeColor(stroke.color, dark), maxOf(1f, stroke.size) * scale)
    }
}

/** Same smoothing as drawSmoothPath() in src/DrawingCanvas.jsx: a single
 *  point is a filled dot, two points a straight line, three or more a
 *  chain of quadratic Beziers through the midpoint of each consecutive
 *  pair (the last segment ends at the final point exactly, not its
 *  midpoint), so a freehand stroke reads just as smooth here as on web. */
internal fun DrawScope.drawStroke(points: List<Offset>, color: Color, width: Float) {
    if (points.isEmpty()) return
    if (points.size == 1) {
        drawCircle(color = color, radius = width / 2f, center = points[0])
        return
    }
    val path = Path()
    path.moveTo(points[0].x, points[0].y)
    if (points.size == 2) {
        path.lineTo(points[1].x, points[1].y)
    } else {
        for (i in 0 until points.size - 1) {
            val p0 = points[i]
            val p1 = points[i + 1]
            if (i == points.size - 2) {
                path.lineTo(p1.x, p1.y)
            } else {
                path.quadraticTo(p0.x, p0.y, (p0.x + p1.x) / 2f, (p0.y + p1.y) / 2f)
            }
        }
    }
    drawPath(path, color = color, style = Stroke(width = width, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

/** Port of isPointNearPath() in src/DrawingCanvas.jsx: true if [point] (in
 *  on-screen/display coordinates) is within [displayRadius] of any of
 *  [stroke]'s own points or the segments between them, checked in that
 *  same display space by scaling the stroke's stored coordinates up by
 *  [scale] first, rather than converting [point] down, so the radius
 *  comparison stays in one consistent unit. */
private fun isPointNearStroke(point: Offset, stroke: DrawingStrokeDto, displayRadius: Float, scale: Float): Boolean {
    if (stroke.points.isEmpty()) return false
    val r2 = displayRadius * displayRadius
    val displayPoints = stroke.points.map { Offset(it.x * scale, it.y * scale) }
    for (i in displayPoints.indices) {
        val dx = point.x - displayPoints[i].x
        val dy = point.y - displayPoints[i].y
        if (dx * dx + dy * dy <= r2) return true
        if (i > 0) {
            val p0 = displayPoints[i - 1]
            val p1 = displayPoints[i]
            val len2 = (p1.x - p0.x) * (p1.x - p0.x) + (p1.y - p0.y) * (p1.y - p0.y)
            if (len2 > 0f) {
                val t = (((point.x - p0.x) * (p1.x - p0.x) + (point.y - p0.y) * (p1.y - p0.y)) / len2).coerceIn(0f, 1f)
                val cx = p0.x + t * (p1.x - p0.x)
                val cy = p0.y + t * (p1.y - p0.y)
                val ddx = point.x - cx
                val ddy = point.y - cy
                if (ddx * ddx + ddy * ddy <= r2) return true
            }
        }
    }
    return false
}

private fun parseHexColor(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (_: Exception) {
    Color.Black
}

/** #000000 and #FFFFFF swap with the theme, every other swatch stays put
 *  (DrawingCanvas.jsx:88-95). Applied at paint time here rather than
 *  rewritten into the note, which keeps the stored drawing identical on
 *  both platforms. */
internal fun themedStrokeColor(hex: String, dark: Boolean): Color {
    val normalized = hex.trim().uppercase()
    return when {
        dark && normalized == "#000000" -> Color.White
        !dark && normalized == "#FFFFFF" -> Color.Black
        else -> parseHexColor(hex)
    }
}

private enum class DrawingPopover { Color, Size, Actions }

/**
 * DrawingToolbar.jsx in the compact shape the web puts in the note's
 * header while drawing: a pill with pen and eraser, then the colour
 * (while the pen is out), size and actions buttons, each opening its own
 * popover; opening one closes the others. "Clear all" asks once more
 * within three seconds and then closes its popover; every other action
 * leaves it open.
 */
@Composable
internal fun DrawingToolbar(
    tools: DrawingTools,
    dark: Boolean,
    canUndo: Boolean,
    canRedo: Boolean,
    canClear: Boolean,
    canRemovePage: Boolean,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onClear: () -> Unit,
    onAddPage: () -> Unit,
    onRemovePage: () -> Unit,
) {
    var open by remember { mutableStateOf<DrawingPopover?>(null) }
    var clearArmed by remember { mutableStateOf(false) }
    var choosingColor by remember { mutableStateOf(false) }
    LaunchedEffect(clearArmed) {
        if (clearArmed) {
            delay(3000)
            clearArmed = false
        }
    }
    fun toggle(popover: DrawingPopover) {
        open = if (open == popover) null else popover
    }

    val pill = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .tailwindShadowSm(pill)
            .clip(pill)
            .background(if (dark) Color(0xB31E2939) else Color(0x99FFFFFF))
            .border(1.dp, if (dark) Color(0x664A5565) else Color(0x80E5E7EB), pill)
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            DrawingModeButton(
                active = !tools.isEraser,
                dark = dark,
                label = stringResource(R.string.native_drawing_pen),
                onClick = { tools.isEraser = false },
            ) { tint -> PenFilledIcon(size = 20.dp, tint = tint) }
            DrawingModeButton(
                active = tools.isEraser,
                dark = dark,
                label = stringResource(R.string.native_drawing_eraser),
                onClick = { tools.isEraser = true },
            ) { tint -> EraserIcon(size = 20.dp, tint = tint) }
        }
        if (!tools.isEraser) {
            DrawingPopoverButton(
                dark = dark,
                label = stringResource(R.string.native_drawing_color),
                onClick = { toggle(DrawingPopover.Color) },
                glyph = { DrawingColorGlyph(parseHexColor(tools.color)) },
            ) {
                if (open == DrawingPopover.Color) {
                    ToolbarPopover(dark = dark, onDismiss = { open = null }) {
                        DrawingColorPalette(
                            current = tools.color,
                            dark = dark,
                            onSelect = { picked ->
                                tools.color = picked
                                open = null
                            },
                            onCustom = {
                                open = null
                                choosingColor = true
                            },
                        )
                    }
                }
            }
        }
        DrawingPopoverButton(
            dark = dark,
            label = stringResource(R.string.native_drawing_size),
            onClick = { toggle(DrawingPopover.Size) },
            glyph = { DrawingSizeGlyph(parseHexColor(tools.color)) },
        ) {
            if (open == DrawingPopover.Size) {
                ToolbarPopover(dark = dark, onDismiss = { open = null }) {
                    DrawingSizePalette(
                        current = tools.strokeSize,
                        dark = dark,
                        onSelect = { picked ->
                            tools.strokeSize = picked
                            open = null
                        },
                    )
                }
            }
        }
        DrawingPopoverButton(
            dark = dark,
            label = stringResource(R.string.native_drawing_actions),
            onClick = { toggle(DrawingPopover.Actions) },
            glyph = { WrenchIcon(size = 18.dp, tint = if (dark) Color(0xFFE5E7EB) else Color(0xFF1F2937)) },
        ) {
            if (open == DrawingPopover.Actions) {
                ToolbarPopover(dark = dark, onDismiss = { open = null }) {
                    DrawingActionsGrid(
                        dark = dark,
                        canUndo = canUndo,
                        canRedo = canRedo,
                        canClear = canClear,
                        canRemovePage = canRemovePage,
                        clearArmed = clearArmed,
                        showPageLines = tools.showPageLines,
                        onUndo = onUndo,
                        onRedo = onRedo,
                        onClear = {
                            if (clearArmed) {
                                clearArmed = false
                                open = null
                                onClear()
                            } else {
                                clearArmed = true
                            }
                        },
                        onAddPage = onAddPage,
                        onRemovePage = onRemovePage,
                        onTogglePageLines = { tools.showPageLines = !tools.showPageLines },
                    )
                }
            }
        }
    }

    if (choosingColor) {
        DrawingColorChooser(
            initial = tools.color.takeUnless { QUICK_COLORS.contains(it) } ?: "#000000",
            dark = dark,
            onPick = { picked ->
                tools.color = picked
                choosingColor = false
            },
            onDismiss = { choosingColor = false },
        )
    }
}

/** `from-indigo-500 to-violet-600` and `from-red-500 to-rose-600`, left
 *  to right. */
private val DrawingActiveGradient = Brush.horizontalGradient(listOf(Color(0xFF615FFF), Color(0xFF7F22FE)))
private val DrawingDangerGradient = Brush.horizontalGradient(listOf(Color(0xFFFB2C36), Color(0xFFEC003F)))

/** Pen and eraser, TBtn compact (DrawingToolbar.jsx:76-104): 36dp with
 *  8dp corners, the brand gradient when selected, an indigo wash with a
 *  border when not. */
@Composable
private fun DrawingModeButton(
    active: Boolean,
    dark: Boolean,
    label: String,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    val tint = when {
        active -> Color.White
        dark -> Color(0x997C86FF)
        else -> Color(0xFF7C86FF)
    }
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(shape)
            .then(
                if (active) {
                    Modifier.background(DrawingActiveGradient)
                } else {
                    // from-indigo-50 to-violet-50/60, dark from-indigo-900/20
                    // to-violet-900/10, towards the bottom right; border
                    // indigo-200/80, dark indigo-700/50.
                    Modifier
                        .background(
                            Brush.linearGradient(
                                if (dark) listOf(Color(0x33312C85), Color(0x1A4D179A)) else listOf(Color(0xFFEEF2FF), Color(0x99F5F3FF)),
                            ),
                        )
                        .border(1.dp, if (dark) Color(0x80432DD7) else Color(0xCCC6D2FF), shape)
                },
            )
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        icon(tint)
    }
}

/** The colour, size and actions buttons: 32dp, 8dp corners, a faint
 *  border and no fill. [popover] is composed next to the button so it
 *  opens from it. */
@Composable
private fun DrawingPopoverButton(
    dark: Boolean,
    label: String,
    onClick: () -> Unit,
    glyph: @Composable () -> Unit,
    popover: @Composable () -> Unit,
) {
    Box {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, if (dark) Color(0x664A5565) else Color(0x80E5E7EB), RoundedCornerShape(8.dp))
                .semantics { contentDescription = label }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onClick() },
            contentAlignment = Alignment.Center,
        ) {
            glyph()
        }
        popover()
    }
}

/** The colour button's glyph: three fixed dots and the pen's own colour
 *  (DrawingToolbar.jsx:285-291). */
@Composable
private fun DrawingColorGlyph(current: Color) {
    Canvas(Modifier.size(22.dp)) {
        val unit = size.minDimension / 22f
        drawCircle(Color(0xFFEF4444), radius = 6f * unit, center = Offset(8f * unit, 7f * unit))
        drawCircle(Color(0xFFFACC15), radius = 5.5f * unit, center = Offset(15f * unit, 9f * unit))
        drawCircle(Color(0xFF3B82F6), radius = 5.5f * unit, center = Offset(7f * unit, 13f * unit))
        drawCircle(current, radius = 6f * unit, center = Offset(13f * unit, 15f * unit))
    }
}

/** The size button's glyph: three strokes of growing weight in the pen's
 *  own colour (DrawingToolbar.jsx:406-410). */
@Composable
private fun DrawingSizeGlyph(tint: Color) {
    Canvas(Modifier.size(18.dp)) {
        val unit = size.minDimension / 18f
        listOf(3.5f to 1f, 7.5f to 2.5f, 12.5f to 4.5f).forEach { (y, weight) ->
            drawLine(
                color = tint,
                start = Offset(3f * unit, y * unit),
                end = Offset(15f * unit, y * unit),
                strokeWidth = weight * unit,
                cap = StrokeCap.Round,
            )
        }
    }
}

/** A swatch's white or black check, with its drop-shadow-sm where the
 *  platform can blur. */
@Composable
private fun SwatchCheck(tint: Color) {
    Box {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            CheckFilledIcon(
                size = 16.dp,
                tint = Color.Black.copy(alpha = 0.15f),
                modifier = Modifier.offset(y = 1.dp).blur(cssBlur(1.dp), BlurredEdgeTreatment.Unbounded),
            )
        }
        CheckFilledIcon(size = 16.dp, tint = tint)
    }
}

/**
 * The colour popover (DrawingToolbar.jsx:293-344): 40dp dots wrapping
 * four to a row in 200dp, 10dp apart and centred, then the custom colour
 * button. The picked dot wears a 3dp indigo ring 2dp outside it.
 */
@Composable
private fun DrawingColorPalette(current: String, dark: Boolean, onSelect: (String) -> Unit, onCustom: () -> Unit) {
    val isCustom = !QUICK_COLORS.contains(current)
    val options = QUICK_COLORS.map { it as String? } + null
    Column(
        modifier = Modifier.width(200.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        options.chunked(4).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { swatch ->
                    if (swatch != null) {
                        val selected = swatch == current
                        DrawingSwatch(
                            fill = parseHexColor(swatch),
                            selected = selected,
                            dark = dark,
                            border = if (!selected && swatch == "#FFFFFF") (if (dark) Color(0xFF6A7282) else Color(0xFFD1D5DC)) else null,
                            label = swatch,
                            onClick = { onSelect(swatch) },
                        ) {
                            if (selected) SwatchCheck(if (swatch == "#FFFFFF" || swatch == "#FACC15") Color.Black else Color.White)
                        }
                    } else {
                        DrawingSwatch(
                            fill = if (isCustom) parseHexColor(current) else null,
                            selected = isCustom,
                            dark = dark,
                            border = null,
                            dashedBorder = if (isCustom) null else (if (dark) Color(0xFF6A7282) else Color(0xFFD1D5DC)),
                            label = stringResource(R.string.native_drawing_custom_color),
                            onClick = onCustom,
                        ) {
                            if (isCustom) {
                                SwatchCheck(Color.White)
                            } else {
                                CustomColorIcon(size = 16.dp, tint = if (dark) Color(0xFF6A7282) else Color(0xFF99A1AF))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** One 40dp dot of the colour popover: `ring-[3px] ring-indigo-500
 *  ring-offset-2` when [selected] (the offset in the popover's own white,
 *  gray-900 on dark), otherwise a 2dp border, solid or dashed. */
@Composable
private fun DrawingSwatch(
    fill: Color?,
    selected: Boolean,
    dark: Boolean,
    border: Color?,
    label: String,
    onClick: () -> Unit,
    dashedBorder: Color? = null,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .then(
                if (selected) {
                    Modifier.drawBehind {
                        drawCircle(Color(0xFF615FFF), radius = size.minDimension / 2f + 5.dp.toPx())
                        drawCircle(if (dark) Color(0xFF101828) else Color.White, radius = size.minDimension / 2f + 2.dp.toPx())
                    }
                } else {
                    Modifier
                },
            )
            .clip(CircleShape)
            .then(if (fill != null) Modifier.background(fill) else Modifier)
            .then(if (border != null) Modifier.border(2.dp, border, CircleShape) else Modifier)
            // Chromium dashes a 2px border 6px on, about 4px off.
            .then(if (dashedBorder != null) Modifier.dashedBorder(dashedBorder, CircleShape, width = 2.dp, dash = 6.dp, gap = 4.dp) else Modifier)
            .semantics { contentDescription = label }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

/**
 * The size popover (DrawingToolbar.jsx:412-443): the four presets side by
 * side, 12dp apart, each a dot of its own size over its name; the chosen
 * one inverted on a dark tile.
 */
@Composable
private fun DrawingSizePalette(current: Float, dark: Boolean, onSelect: (Float) -> Unit) {
    val labels = listOf(
        R.string.native_drawing_size_fine,
        R.string.native_drawing_size_medium,
        R.string.native_drawing_size_thick,
        R.string.native_drawing_size_large,
    )
    Row(
        modifier = Modifier.padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SIZE_PRESETS.forEachIndexed { index, preset ->
            val selected = preset == current
            // bg-gray-800 / dark:bg-white, with the dot and label inverted.
            val ink = when {
                selected && dark -> Color(0xFF1E2939)
                selected -> Color.White
                dark -> Color(0xFF99A1AF)
                else -> Color(0xFF6A7282)
            }
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        when {
                            !selected -> Color.Transparent
                            dark -> Color.White
                            else -> Color(0xFF1E2939)
                        },
                    )
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onSelect(preset) }
                    .padding(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(preset.coerceIn(4f, 20f).dp)
                        .clip(CircleShape)
                        .background(ink),
                )
                Text(
                    stringResource(labels[index]),
                    color = ink,
                    fontSize = 10.sp,
                    lineHeight = 15.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

/**
 * The actions popover (DrawingToolbar.jsx:489-582): a 180dp grid of three
 * columns, 6dp apart: undo, redo and clear, then add page, remove page and
 * the guides. Clear is red, solid and pulsing while it waits for its
 * second tap; the guides turn gray once hidden.
 */
@Composable
private fun DrawingActionsGrid(
    dark: Boolean,
    canUndo: Boolean,
    canRedo: Boolean,
    canClear: Boolean,
    canRemovePage: Boolean,
    clearArmed: Boolean,
    showPageLines: Boolean,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onClear: () -> Unit,
    onAddPage: () -> Unit,
    onRemovePage: () -> Unit,
    onTogglePageLines: () -> Unit,
) {
    val pulse = if (clearArmed) rememberPulseAlpha() else null
    Column(modifier = Modifier.width(180.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_undo),
                enabled = canUndo,
                dark = dark,
                fill = DrawingActiveGradient,
                onClick = onUndo,
            ) { DrawingUndoIcon(size = 20.dp, tint = Color.White) }
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_redo),
                enabled = canRedo,
                dark = dark,
                fill = DrawingActiveGradient,
                onClick = onRedo,
            ) { DrawingUndoIcon(size = 20.dp, tint = Color.White, modifier = Modifier.scale(scaleX = -1f, scaleY = 1f)) }
            DrawingActionTile(
                label = stringResource(if (clearArmed) R.string.native_drawing_clear_confirm else R.string.native_drawing_clear),
                enabled = canClear,
                dark = dark,
                fill = if (clearArmed) SolidColor(Color(0xFFFB2C36)) else DrawingDangerGradient,
                squareAlpha = { pulse?.value ?: 1f },
                onClick = onClear,
            ) {
                if (clearArmed) {
                    Text("?", color = Color.White, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Bold)
                } else {
                    DeleteForeverIcon(size = 20.dp, tint = Color.White)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_add_page),
                enabled = true,
                dark = dark,
                fill = DrawingActiveGradient,
                onClick = onAddPage,
            ) { FilePlusIcon(size = 20.dp, tint = Color.White) }
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_remove_page),
                enabled = canRemovePage,
                dark = dark,
                fill = DrawingActiveGradient,
                onClick = onRemovePage,
            ) { FileMinusIcon(size = 20.dp, tint = Color.White) }
            DrawingActionTile(
                label = stringResource(if (showPageLines) R.string.native_drawing_hide_guides else R.string.native_drawing_show_guides),
                enabled = true,
                dark = dark,
                // bg-gray-400 / dark:bg-gray-600 once the guides are hidden.
                fill = if (showPageLines) DrawingActiveGradient else SolidColor(if (dark) Color(0xFF4A5565) else Color(0xFF99A1AF)),
                onClick = onTogglePageLines,
            ) { PageLinesIcon(size = 20.dp, tint = Color.White, dashed = !showPageLines) }
        }
    }
}

/** One action: a 32dp square with its white glyph and `shadow-sm`, over a
 *  10sp label that wraps within the 56dp column, the whole tile at 35%
 *  when disabled. */
@Composable
private fun DrawingActionTile(
    label: String,
    enabled: Boolean,
    dark: Boolean,
    fill: Brush,
    onClick: () -> Unit,
    squareAlpha: () -> Float = { 1f },
    icon: @Composable () -> Unit,
) {
    val square = RoundedCornerShape(8.dp)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .width(56.dp)
            .alpha(if (enabled) 1f else 0.35f)
            .clip(RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .graphicsLayer { alpha = squareAlpha() }
                .tailwindShadowSm(square)
                .clip(square)
                .background(fill),
            contentAlignment = Alignment.Center,
        ) {
            icon()
        }
        Text(
            label,
            color = if (dark) Color(0xFF99A1AF) else Color(0xFF4A5565),
            fontSize = 10.sp,
            lineHeight = 15.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * What the web's `<input type="color">` hands to the system: a colour
 * chosen freely, here in the app's own dialog shell, as the WebView's
 * dialogs are: a saturation and brightness square over a hue strip, the
 * result shown beside its hex code, then Cancel and OK.
 */
@Composable
private fun DrawingColorChooser(initial: String, dark: Boolean, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val start = remember(initial) {
        FloatArray(3).also { android.graphics.Color.colorToHSV(parseHexColor(initial).toArgb(), it) }
    }
    var hue by remember(initial) { mutableFloatStateOf(start[0]) }
    var saturation by remember(initial) { mutableFloatStateOf(start[1]) }
    var brightness by remember(initial) { mutableFloatStateOf(start[2]) }
    val picked = Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, saturation, brightness)))
    // `<input type="color">` hands back lowercase hex.
    val hex = String.format("#%06x", picked.toArgb() and 0xFFFFFF)
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val textColor = if (dark) DarkTitleColor else LightTitleColor
    GkDialog(onDismissRequest = onDismiss, dark = dark, borderColor = borderColor, maxWidth = 384.dp) {
        Text(
            stringResource(R.string.native_drawing_custom_color),
            color = textColor,
            fontSize = 18.sp,
            lineHeight = 28.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(16.dp))
        val hueColor = Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, 1f, 1f)))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Brush.horizontalGradient(listOf(Color.White, hueColor)))
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
                .pointerInput(Unit) {
                    awaitEachGesture {
                        var change = awaitFirstDown()
                        while (true) {
                            change.consume()
                            saturation = (change.position.x / size.width).coerceIn(0f, 1f)
                            brightness = 1f - (change.position.y / size.height).coerceIn(0f, 1f)
                            change = awaitPointerEvent().changes.firstOrNull { it.id == change.id && it.pressed } ?: break
                        }
                    }
                },
        ) {
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val marker = Offset(saturation * constraints.maxWidth, (1f - brightness) * constraints.maxHeight)
                Canvas(Modifier.fillMaxSize()) {
                    drawCircle(Color.White, radius = 8.dp.toPx(), center = marker, style = Stroke(width = 2.dp.toPx()))
                    drawCircle(Color.Black.copy(alpha = 0.3f), radius = 9.dp.toPx(), center = marker, style = Stroke(width = 1.dp.toPx()))
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(16.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Brush.horizontalGradient((0..6).map { Color(android.graphics.Color.HSVToColor(floatArrayOf(it * 60f, 1f, 1f))) }))
                .pointerInput(Unit) {
                    awaitEachGesture {
                        var change = awaitFirstDown()
                        while (true) {
                            change.consume()
                            hue = (change.position.x / size.width).coerceIn(0f, 1f) * 360f
                            change = awaitPointerEvent().changes.firstOrNull { it.id == change.id && it.pressed } ?: break
                        }
                    }
                },
        ) {
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val x = hue / 360f * constraints.maxWidth
                Canvas(Modifier.fillMaxSize()) {
                    drawCircle(Color.White, radius = 7.dp.toPx(), center = Offset(x, size.height / 2f), style = Stroke(width = 2.dp.toPx()))
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(picked)
                    .border(1.dp, borderColor, CircleShape),
            )
            Text(hex, color = textColor, fontSize = 14.sp, lineHeight = 20.sp)
        }
        Spacer(Modifier.height(20.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GkSecondaryButton(
                label = stringResource(R.string.native_dialog_cancel),
                borderColor = borderColor,
                textColor = textColor,
                onClick = onDismiss,
            )
            GkGradientButton(
                label = stringResource(R.string.native_dialog_ok),
                themeId = null,
                onClick = { onPick(hex) },
            )
        }
    }
}
