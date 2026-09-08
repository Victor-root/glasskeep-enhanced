package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.DrawingPointDto
import com.glasskeep.app.nativeapp.data.DrawingStrokeDto
import com.glasskeep.app.ui.Indigo
import kotlinx.coroutines.delay

/** Same 8 defaults as src/components/drawing/DrawingToolbar.jsx's own
 *  QUICK_COLORS, byte for byte, so a note's palette reads the same on
 *  both platforms. */
private val QUICK_COLORS = listOf(
    "#000000", "#FFFFFF", "#EF4444", "#F97316", "#FACC15", "#22C55E", "#3B82F6", "#8B5CF6",
)

/** Same 4 presets as DrawingToolbar.jsx's SIZE_PRESETS. */
private val SIZE_PRESETS = listOf(2f, 5f, 12f, 24f)

private const val DEFAULT_CANVAS_WIDTH_DP = 320f
private const val DEFAULT_CANVAS_HEIGHT_DP = 420f

/** Matches startDrawing()/draw()'s own `Math.max(size, 8)` in
 *  src/DrawingCanvas.jsx: the eraser is never smaller than a comfortable
 *  touch target, even with the finest pen size selected. */
private fun eraserRadius(strokeSize: Float): Float = maxOf(strokeSize, 8f)

/**
 * Freehand drawing surface plus toolbar: pen/eraser, the same 8 colors and
 * 4 sizes as the web editor, undo/redo, and a two-tap clear (arms on the
 * first tap, auto-disarms after 3s, same as DrawingToolbar.jsx's own
 * confirm-clear button). A stroke is only reported up once the gesture
 * ends (see onStrokeCompleted/onErase), same as src/DrawingCanvas.jsx's
 * own stopDrawing(): a live in-progress stroke or an in-progress erase
 * drag is purely local visual state here, so the caller's undo history
 * only ever gets one entry per completed gesture, never one per point.
 *
 * Not ported from the web editor, disclosed rather than silently dropped:
 * multi-page canvases (an existing multi-page drawing's full height still
 * loads and is fully editable, there is no "add another page" control
 * yet), the two-finger pan/momentum scroll (the surrounding screen's own
 * vertical scroll already reaches the whole canvas), and a true
 * zero-movement tap-to-place-a-dot (Compose's drag-gesture detector needs
 * a small amount of movement to recognize a gesture at all; an existing
 * dot-only stroke from the web still renders and erases correctly, native
 * just doesn't have its own way to author a brand new one).
 */
@Composable
fun DrawingEditor(
    paths: List<DrawingStrokeDto>,
    canvasWidthDp: Float?,
    canvasHeightDp: Float?,
    canvasBackground: Color,
    titleColor: Color,
    subtextColor: Color,
    canUndo: Boolean,
    canRedo: Boolean,
    onStrokeCompleted: (stroke: DrawingStrokeDto, canvasWidthDp: Float, canvasHeightDp: Float) -> Unit,
    onErase: (afterErase: List<DrawingStrokeDto>, canvasWidthDp: Float, canvasHeightDp: Float) -> Unit,
    onClear: (canvasWidthDp: Float, canvasHeightDp: Float) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
) {
    var isEraser by remember { mutableStateOf(false) }
    var color by remember { mutableStateOf(QUICK_COLORS[0]) }
    var strokeSize by remember { mutableStateOf(SIZE_PRESETS[0]) }
    var clearArmed by remember { mutableStateOf(false) }

    LaunchedEffect(clearArmed) {
        if (clearArmed) {
            delay(3000)
            clearArmed = false
        }
    }

    Column {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            DrawingToolChip(stringResource(R.string.native_drawing_pen), !isEraser, titleColor, subtextColor) { isEraser = false }
            DrawingToolChip(stringResource(R.string.native_drawing_eraser), isEraser, titleColor, subtextColor) { isEraser = true }
            DrawingActionChip(
                label = if (clearArmed) stringResource(R.string.native_drawing_clear_confirm) else stringResource(R.string.native_drawing_clear),
                armed = clearArmed,
                tint = subtextColor,
            ) {
                if (clearArmed) {
                    clearArmed = false
                    onClear(canvasWidthDp ?: DEFAULT_CANVAS_WIDTH_DP, canvasHeightDp ?: DEFAULT_CANVAS_HEIGHT_DP)
                } else {
                    clearArmed = true
                }
            }
            DrawingActionChip(label = "↶", enabled = canUndo, tint = subtextColor, contentDescription = stringResource(R.string.native_drawing_undo)) { onUndo() }
            DrawingActionChip(label = "↷", enabled = canRedo, tint = subtextColor, contentDescription = stringResource(R.string.native_drawing_redo)) { onRedo() }
        }
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (swatch in QUICK_COLORS) {
                val selected = swatch.equals(color, ignoreCase = true)
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(parseHexColor(swatch))
                        .border(
                            width = if (selected) 3.dp else 1.dp,
                            color = if (selected) Indigo else subtextColor.copy(alpha = 0.3f),
                            shape = CircleShape,
                        )
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { color = swatch },
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            for (preset in SIZE_PRESETS) {
                val selected = preset == strokeSize
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (selected) Indigo.copy(alpha = 0.16f) else Color.Transparent)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { strokeSize = preset },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .size((6f + preset / 24f * 14f).dp)
                            .clip(CircleShape)
                            .background(if (selected) Indigo else subtextColor),
                    )
                }
            }
        }
        Spacer(Modifier.height(12.dp))

        val widthDp = canvasWidthDp ?: DEFAULT_CANVAS_WIDTH_DP
        val heightDp = canvasHeightDp ?: DEFAULT_CANVAS_HEIGHT_DP
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val scale = maxWidth.value / widthDp
            val displayHeight = (heightDp * scale).dp
            var inProgressPoints by remember(paths) { mutableStateOf<List<Offset>?>(null) }
            var eraseLivePaths by remember(paths) { mutableStateOf<List<DrawingStrokeDto>?>(null) }

            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(displayHeight)
                    .clip(RoundedCornerShape(10.dp))
                    .background(canvasBackground)
                    .pointerInput(isEraser, color, strokeSize, paths, scale) {
                        detectDragGestures(
                            onDragStart = { offset ->
                                if (isEraser) {
                                    val radius = eraserRadius(strokeSize) * scale
                                    val hitIdx = paths.indexOfFirst { it.tool != "eraser" && isPointNearStroke(offset, it, radius, scale) }
                                    eraseLivePaths = if (hitIdx >= 0) paths.filterIndexed { i, _ -> i != hitIdx } else paths
                                } else {
                                    inProgressPoints = listOf(offset)
                                }
                            },
                            onDrag = { change, _ ->
                                change.consume()
                                if (isEraser) {
                                    val current = eraseLivePaths ?: paths
                                    val radius = eraserRadius(strokeSize) * scale
                                    val hitIdx = current.indexOfFirst { it.tool != "eraser" && isPointNearStroke(change.position, it, radius, scale) }
                                    if (hitIdx >= 0) eraseLivePaths = current.filterIndexed { i, _ -> i != hitIdx }
                                } else {
                                    inProgressPoints = (inProgressPoints ?: emptyList()) + change.position
                                }
                            },
                            onDragEnd = {
                                if (isEraser) {
                                    val result = eraseLivePaths
                                    // Reference equality on purpose: eraseLivePaths is only ever
                                    // reassigned to a genuinely new (filtered) list when a hit
                                    // occurred, and reuses the exact `paths` reference otherwise
                                    // (see onDragStart/onDrag above), so `!==` cheaply tells apart
                                    // "this drag actually erased something" from "no-op drag".
                                    if (result != null && result !== paths) onErase(result, widthDp, heightDp)
                                    eraseLivePaths = null
                                } else {
                                    val pts = inProgressPoints
                                    if (pts != null && pts.isNotEmpty()) {
                                        val stroke = DrawingStrokeDto(
                                            tool = "pen",
                                            color = color,
                                            size = strokeSize,
                                            points = pts.map { DrawingPointDto(it.x / scale, it.y / scale) },
                                        )
                                        onStrokeCompleted(stroke, widthDp, heightDp)
                                    }
                                    inProgressPoints = null
                                }
                            },
                            onDragCancel = {
                                inProgressPoints = null
                                eraseLivePaths = null
                            },
                        )
                    },
            ) {
                val visiblePaths = eraseLivePaths ?: paths
                for (stroke in visiblePaths) {
                    if (stroke.tool == "eraser" || stroke.points.isEmpty()) continue
                    val displayPoints = stroke.points.map { Offset(it.x * scale, it.y * scale) }
                    drawStroke(displayPoints, parseHexColor(stroke.color), stroke.size * scale)
                }
                val live = inProgressPoints
                if (live != null) drawStroke(live, parseHexColor(color), strokeSize * scale)
            }
        }
    }
}

/** Same smoothing as drawSmoothPath() in src/DrawingCanvas.jsx: a single
 *  point is a filled dot, two points a straight line, three or more a
 *  chain of quadratic Beziers through the midpoint of each consecutive
 *  pair (the last segment ends at the final point exactly, not its
 *  midpoint), so a freehand stroke reads just as smooth here as on web. */
private fun DrawScope.drawStroke(points: List<Offset>, color: Color, width: Float) {
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

@Composable
private fun DrawingToolChip(label: String, selected: Boolean, titleColor: Color, subtextColor: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) Indigo.copy(alpha = 0.16f) else Color.Transparent)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(label, color = if (selected) Indigo else titleColor, fontSize = 13.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium)
    }
}

@Composable
private fun DrawingActionChip(label: String, tint: Color, enabled: Boolean = true, armed: Boolean = false, contentDescription: String? = null, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (armed) Color(0xFFdc2626).copy(alpha = 0.16f) else Color.Transparent)
            .let { m -> if (contentDescription != null) m.semantics { this.contentDescription = contentDescription } else m }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(
            label,
            color = if (!enabled) tint.copy(alpha = 0.35f) else if (armed) Color(0xFFdc2626) else tint,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}
