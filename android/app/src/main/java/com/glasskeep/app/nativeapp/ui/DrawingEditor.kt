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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
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
 * DrawingCanvas.jsx plus DrawingToolbar.jsx in its phone shape: a
 * five-button compact bar (pen, eraser, colour, size, actions) whose last
 * three open their own popovers, over a transparent canvas that shows the
 * note's own colour through it, with dashed guides between pages.
 *
 * The eraser removes whole strokes rather than painting over them, with a
 * `max(size, 8)` reach, and a whole erase gesture is one undo step. Black
 * and white swap with the theme at paint time, the way the web rewrites
 * them on a theme change.
 *
 * Not ported, disclosed rather than silently dropped: the two-finger
 * pan/momentum scroll (the surrounding screen's own vertical scroll
 * already reaches the whole canvas), and a true zero-movement
 * tap-to-place-a-dot (Compose's drag-gesture detector needs a little
 * movement to recognise a gesture at all; an existing dot-only stroke
 * from the web still renders and erases correctly).
 */
@Composable
fun DrawingEditor(
    paths: List<DrawingStrokeDto>,
    canvasWidthDp: Float?,
    canvasHeightDp: Float?,
    originalHeightDp: Float?,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    canUndo: Boolean,
    canRedo: Boolean,
    onCommit: (paths: List<DrawingStrokeDto>, canvasWidthDp: Float, canvasHeightDp: Float) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
) {
    var isEraser by remember { mutableStateOf(false) }
    // The default pen follows the theme, white on dark, black on light
    // (DrawingCanvas.jsx:123).
    var color by remember(dark) { mutableStateOf(if (dark) "#FFFFFF" else "#000000") }
    var strokeSize by remember { mutableStateOf(SIZE_PRESETS[1]) }
    var clearArmed by remember { mutableStateOf(false) }
    var colorPopoverOpen by remember { mutableStateOf(false) }
    var sizePopoverOpen by remember { mutableStateOf(false) }
    var actionsPopoverOpen by remember { mutableStateOf(false) }
    var showPageLines by remember { mutableStateOf(true) }

    LaunchedEffect(clearArmed) {
        if (clearArmed) {
            delay(3000)
            clearArmed = false
        }
    }

    val widthDp = canvasWidthDp ?: DEFAULT_CANVAS_WIDTH_DP
    val heightDp = canvasHeightDp ?: DEFAULT_CANVAS_HEIGHT_DP
    val pageHeightDp = originalHeightDp ?: canvasHeightDp ?: DEFAULT_CANVAS_HEIGHT_DP

    Column {
        DrawingToolbar(
            isEraser = isEraser,
            color = color,
            strokeSize = strokeSize,
            dark = dark,
            canUndo = canUndo,
            canRedo = canRedo,
            canClear = paths.isNotEmpty(),
            canRemovePage = heightDp > pageHeightDp + 1f,
            clearArmed = clearArmed,
            showPageLines = showPageLines,
            colorPopoverOpen = colorPopoverOpen,
            sizePopoverOpen = sizePopoverOpen,
            actionsPopoverOpen = actionsPopoverOpen,
            onSelectPen = { isEraser = false },
            onSelectEraser = { isEraser = true },
            onColorPopover = { colorPopoverOpen = !colorPopoverOpen },
            onSizePopover = { sizePopoverOpen = !sizePopoverOpen },
            onActionsPopover = { actionsPopoverOpen = !actionsPopoverOpen },
            onDismissPopovers = {
                colorPopoverOpen = false
                sizePopoverOpen = false
                actionsPopoverOpen = false
            },
            onColorSelected = { picked -> color = picked; colorPopoverOpen = false },
            onSizeSelected = { picked -> strokeSize = picked; sizePopoverOpen = false },
            onUndo = { actionsPopoverOpen = false; onUndo() },
            onRedo = { actionsPopoverOpen = false; onRedo() },
            onClear = {
                if (clearArmed) {
                    clearArmed = false
                    actionsPopoverOpen = false
                    onCommit(emptyList(), widthDp, heightDp)
                } else {
                    clearArmed = true
                }
            },
            onAddPage = {
                actionsPopoverOpen = false
                onCommit(paths, widthDp, heightDp + pageHeightDp)
            },
            onRemovePage = {
                actionsPopoverOpen = false
                val newHeight = (heightDp - pageHeightDp).coerceAtLeast(pageHeightDp)
                // A stroke that merely crosses the new bottom edge is
                // kept whole; only one entirely below it goes
                // (DrawingCanvas.jsx:532).
                val kept = paths.filter { stroke -> stroke.points.any { it.y < newHeight } }
                onCommit(kept, widthDp, newHeight)
            },
            onTogglePageLines = { actionsPopoverOpen = false; showPageLines = !showPageLines },
        )
        Spacer(Modifier.height(12.dp))

        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val scale = maxWidth.value / widthDp
            val displayHeight = (heightDp * scale).dp
            var inProgressPoints by remember(paths) { mutableStateOf<List<Offset>?>(null) }
            var eraseLivePaths by remember(paths) { mutableStateOf<List<DrawingStrokeDto>?>(null) }

            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(displayHeight)
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
                                    if (result != null && result !== paths) onCommit(result, widthDp, heightDp)
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
                                        onCommit(paths + stroke, widthDp, heightDp)
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
                // Dashed guides between pages, painted under the strokes
                // (DrawingCanvas.jsx:750-770).
                if (showPageLines && pageHeightDp > 0f) {
                    val guide = if (dark) Color.White.copy(alpha = 0.10f) else Color.Black.copy(alpha = 0.07f)
                    var y = pageHeightDp * scale
                    while (y < size.height) {
                        drawLine(
                            color = guide,
                            start = Offset(0f, y),
                            end = Offset(size.width, y),
                            strokeWidth = 1.dp.toPx(),
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)),
                        )
                        y += pageHeightDp * scale
                    }
                }
                val visiblePaths = eraseLivePaths ?: paths
                for (stroke in visiblePaths) {
                    if (stroke.tool == "eraser" || stroke.points.isEmpty()) continue
                    val displayPoints = stroke.points.map { Offset(it.x * scale, it.y * scale) }
                    drawStroke(displayPoints, themedStrokeColor(stroke.color, dark), stroke.size * scale)
                }
                val live = inProgressPoints
                if (live != null) drawStroke(live, themedStrokeColor(color, dark), strokeSize * scale)
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

/** #000000 and #FFFFFF swap with the theme, every other swatch stays put
 *  (DrawingCanvas.jsx:88-95). Applied at paint time here rather than
 *  rewritten into the note, which keeps the stored drawing identical on
 *  both platforms. */
private fun themedStrokeColor(hex: String, dark: Boolean): Color {
    val normalized = hex.trim().uppercase()
    return when {
        dark && normalized == "#000000" -> Color.White
        !dark && normalized == "#FFFFFF" -> Color.Black
        else -> parseHexColor(hex)
    }
}

/**
 * DrawingToolbar.jsx in its compact phone form: one centred pill holding
 * pen, eraser, colour, size and actions, the last three opening popovers
 * of their own. The colour button only exists while the pen is selected.
 */
@Composable
private fun DrawingToolbar(
    isEraser: Boolean,
    color: String,
    strokeSize: Float,
    dark: Boolean,
    canUndo: Boolean,
    canRedo: Boolean,
    canClear: Boolean,
    canRemovePage: Boolean,
    clearArmed: Boolean,
    showPageLines: Boolean,
    colorPopoverOpen: Boolean,
    sizePopoverOpen: Boolean,
    actionsPopoverOpen: Boolean,
    onSelectPen: () -> Unit,
    onSelectEraser: () -> Unit,
    onColorPopover: () -> Unit,
    onSizePopover: () -> Unit,
    onActionsPopover: () -> Unit,
    onDismissPopovers: () -> Unit,
    onColorSelected: (String) -> Unit,
    onSizeSelected: (Float) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onClear: () -> Unit,
    onAddPage: () -> Unit,
    onRemovePage: () -> Unit,
    onTogglePageLines: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .wrapContentWidth(Alignment.CenterHorizontally)
            .clip(RoundedCornerShape(12.dp))
            .background(if (dark) Color(0xFF1E2939).copy(alpha = 0.7f) else Color.White.copy(alpha = 0.6f))
            .border(
                width = 1.dp,
                color = if (dark) Color(0xFF4A5565).copy(alpha = 0.4f) else Color(0xFFE5E7EB).copy(alpha = 0.5f),
                shape = RoundedCornerShape(12.dp),
            )
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DrawingModeButton(
            active = !isEraser,
            dark = dark,
            contentDescription = stringResource(R.string.native_drawing_pen),
            onClick = onSelectPen,
        ) { tint -> PenFilledIcon(size = 20.dp, tint = tint) }
        DrawingModeButton(
            active = isEraser,
            dark = dark,
            contentDescription = stringResource(R.string.native_drawing_eraser),
            onClick = onSelectEraser,
        ) { tint -> EraserIcon(size = 20.dp, tint = tint) }

        if (!isEraser) {
            Box {
                DrawingPopoverButton(
                    dark = dark,
                    contentDescription = stringResource(R.string.native_drawing_color),
                    onClick = onColorPopover,
                ) {
                    DrawingColorGlyph(current = themedStrokeColor(color, dark))
                }
                if (colorPopoverOpen) {
                    ToolbarPopover(width = 224.dp, dark = dark, onDismiss = onDismissPopovers) {
                        DrawingColorPalette(current = color, dark = dark, onSelect = onColorSelected)
                    }
                }
            }
        }
        Box {
            DrawingPopoverButton(
                dark = dark,
                contentDescription = stringResource(R.string.native_drawing_size),
                onClick = onSizePopover,
            ) {
                DrawingSizeGlyph(tint = themedStrokeColor(color, dark))
            }
            if (sizePopoverOpen) {
                ToolbarPopover(width = 232.dp, dark = dark, onDismiss = onDismissPopovers) {
                    DrawingSizePalette(current = strokeSize, dark = dark, onSelect = onSizeSelected)
                }
            }
        }
        Box {
            DrawingPopoverButton(
                dark = dark,
                contentDescription = stringResource(R.string.native_drawing_actions),
                onClick = onActionsPopover,
            ) { tint -> WrenchIcon(size = 18.dp, tint = tint) }
            if (actionsPopoverOpen) {
                ToolbarPopover(width = 204.dp, dark = dark, onDismiss = onDismissPopovers) {
                    DrawingActionsGrid(
                        dark = dark,
                        canUndo = canUndo,
                        canRedo = canRedo,
                        canClear = canClear,
                        canRemovePage = canRemovePage,
                        clearArmed = clearArmed,
                        showPageLines = showPageLines,
                        onUndo = onUndo,
                        onRedo = onRedo,
                        onClear = onClear,
                        onAddPage = onAddPage,
                        onRemovePage = onRemovePage,
                        onTogglePageLines = onTogglePageLines,
                    )
                }
            }
        }
    }
}

/** Pen and eraser: 36dp, the theme gradient when selected, an indigo
 *  wash when not (DrawingToolbar.jsx:78-87). */
@Composable
private fun DrawingModeButton(
    active: Boolean,
    dark: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val tint = when {
        active -> Color.White
        dark -> Color(0xFF818CF8).copy(alpha = 0.6f)
        else -> Color(0xFF818CF8)
    }
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .then(
                if (active) {
                    Modifier.background(DrawingActiveGradient)
                } else {
                    Modifier
                        .background(
                            if (dark) Color(0xFF312E81).copy(alpha = 0.2f) else Color(0xFFEEF2FF),
                        )
                        .border(
                            width = 1.dp,
                            color = if (dark) Color(0xFF4338CA).copy(alpha = 0.5f) else Color(0xFFC7D2FE).copy(alpha = 0.8f),
                            shape = RoundedCornerShape(8.dp),
                        )
                },
            )
            .semantics { this.contentDescription = contentDescription }
            .gkTooltip(contentDescription)
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

@Composable
private fun DrawingPopoverButton(
    dark: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(
                width = 1.dp,
                color = if (dark) Color(0xFF4A5565).copy(alpha = 0.4f) else Color(0xFFE5E7EB).copy(alpha = 0.5f),
                shape = RoundedCornerShape(8.dp),
            )
            .semantics { this.contentDescription = contentDescription }
            .gkTooltip(contentDescription)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        icon(if (dark) Color(0xFFD1D5DC) else Color(0xFF4B5563))
    }
}

/** The colour button's own glyph: three fixed dots plus the current
 *  colour (DrawingToolbar.jsx:280-292). */
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

/** The size button's glyph: three strokes of increasing weight in the
 *  current colour (DrawingToolbar.jsx:400-411). */
@Composable
private fun DrawingSizeGlyph(tint: Color) {
    Canvas(Modifier.size(18.dp)) {
        val unit = size.minDimension / 18f
        listOf(3.5f to 1f, 7.5f to 2.5f, 12.5f to 4.5f).forEach { (y, weight) ->
            drawLine(
                color = tint,
                start = Offset(2f * unit, y * unit),
                end = Offset(16f * unit, y * unit),
                strokeWidth = weight * unit,
                cap = StrokeCap.Round,
            )
        }
    }
}

@Composable
private fun DrawingColorPalette(current: String, dark: Boolean, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            QUICK_COLORS.chunked(4).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { swatch ->
                        val selected = swatch.equals(current, ignoreCase = true)
                        val swatchColor = parseHexColor(swatch)
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(swatchColor)
                                .then(
                                    when {
                                        selected -> Modifier.border(3.dp, Indigo, CircleShape)
                                        swatch.equals("#FFFFFF", ignoreCase = true) ->
                                            Modifier.border(1.dp, if (dark) Color(0xFF6B7280) else Color(0xFFD1D5DB), CircleShape)
                                        else -> Modifier
                                    },
                                )
                                .semantics { contentDescription = swatch }
                                .gkTooltip(swatch)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { onSelect(swatch) },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (selected) {
                                val checkTint = if (
                                    swatch.equals("#FFFFFF", ignoreCase = true) ||
                                    swatch.equals("#FACC15", ignoreCase = true)
                                ) {
                                    Color.Black
                                } else {
                                    Color.White
                                }
                                CheckFilledIcon(size = 16.dp, tint = checkTint)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DrawingSizePalette(current: Float, dark: Boolean, onSelect: (Float) -> Unit) {
    val labels = listOf(
        R.string.native_drawing_size_fine,
        R.string.native_drawing_size_medium,
        R.string.native_drawing_size_thick,
        R.string.native_drawing_size_large,
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SIZE_PRESETS.forEachIndexed { index, preset ->
            val selected = preset == current
            val dotSize = preset.coerceIn(4f, 20f).dp
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        when {
                            !selected -> Color.Transparent
                            dark -> Color.White
                            else -> Color(0xFF1F2937)
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
                        .size(dotSize)
                        .clip(CircleShape)
                        .background(
                            when {
                                selected && dark -> Color(0xFF1F2937)
                                selected -> Color.White
                                dark -> Color(0xFF9CA3AF)
                                else -> Color(0xFF6B7280)
                            },
                        ),
                )
                Text(
                    stringResource(labels[index]),
                    color = when {
                        selected && dark -> Color(0xFF1F2937)
                        selected -> Color.White
                        dark -> Color(0xFF9CA3AF)
                        else -> Color(0xFF6B7280)
                    },
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

/** The actions popover: three columns of icon tiles, red for "clear all"
 *  and grey for the guides once they are hidden. */
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
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_undo),
                enabled = canUndo,
                dark = dark,
                onClick = onUndo,
            ) { tint -> UndoIcon(size = 16.dp, tint = tint) }
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_redo),
                enabled = canRedo,
                dark = dark,
                onClick = onRedo,
            ) { tint -> RedoIcon(size = 16.dp, tint = tint) }
            DrawingActionTile(
                label = if (clearArmed) {
                    stringResource(R.string.native_drawing_clear_confirm)
                } else {
                    stringResource(R.string.native_drawing_clear)
                },
                enabled = canClear,
                dark = dark,
                danger = true,
                onClick = onClear,
            ) { tint ->
                if (clearArmed) {
                    Text("?", color = tint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                } else {
                    TrashIcon(size = 16.dp, tint = tint)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_add_page),
                enabled = true,
                dark = dark,
                onClick = onAddPage,
            ) { tint -> SquarePlusIcon(size = 16.dp, tint = tint) }
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_remove_page),
                enabled = canRemovePage,
                dark = dark,
                onClick = onRemovePage,
            ) { tint -> SquareMinusIcon(size = 16.dp, tint = tint) }
            DrawingActionTile(
                label = stringResource(R.string.native_drawing_page_lines),
                enabled = true,
                dark = dark,
                muted = !showPageLines,
                onClick = onTogglePageLines,
            ) { tint -> PageLinesIcon(size = 16.dp, tint = tint, dashed = !showPageLines) }
        }
    }
}

@Composable
private fun DrawingActionTile(
    label: String,
    enabled: Boolean,
    dark: Boolean,
    danger: Boolean = false,
    muted: Boolean = false,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
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
                .clip(RoundedCornerShape(8.dp))
                .then(
                    when {
                        danger -> Modifier.background(DrawingDangerGradient)
                        muted -> Modifier.background(if (dark) Color(0xFF4B5563) else Color(0xFF9CA3AF))
                        else -> Modifier.background(DrawingActiveGradient)
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            icon(Color.White)
        }
        Text(
            label,
            color = if (dark) Color(0xFF9CA3AF) else Color(0xFF4B5563),
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
        )
    }
}

private val DrawingActiveGradient = Brush.linearGradient(listOf(Color(0xFF6366F1), Color(0xFF7C3AED)))
private val DrawingDangerGradient = Brush.linearGradient(listOf(Color(0xFFEF4444), Color(0xFFE11D48)))

