package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Hand-ported vector icons, pixel-accurate to the same 24x24 viewBox and
 * path data as src/icons/index.jsx (Hamburger, Kebab, ArrowLeft,
 * PinOutline/PinFilled), scaled to whatever size is requested. Not a
 * general SVG renderer, just the handful of simple, mostly straight-line
 * icons the native screens need so far, ported by hand from the exact
 * same coordinates the web app draws (see each icon's own comment for
 * the source path). A text glyph ("←", a bullet, ...) is not the same
 * icon as the app actually uses, this is.
 */

@Composable
fun HamburgerIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx Hamburger: 3 horizontal strokes, y = 6/12/18,
    // x = 4..20, strokeWidth 2, round caps.
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val xStart = 4f * scale
        val xEnd = 20f * scale
        val strokeWidth = 2f * scale
        for (y in floatArrayOf(6f, 12f, 18f)) {
            val yPx = y * scale
            drawLine(
                color = tint,
                start = Offset(xStart, yPx),
                end = Offset(xEnd, yPx),
                strokeWidth = strokeWidth,
                cap = StrokeCap.Round,
            )
        }
    }
}

@Composable
fun KebabIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx Kebab: 3 filled dots, r = 1.5, x = 12, y = 5/12/19.
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val radius = 1.5f * scale
        val x = 12f * scale
        for (y in floatArrayOf(5f, 12f, 19f)) {
            drawCircle(color = tint, radius = radius, center = Offset(x, y * scale))
        }
    }
}

@Composable
fun BackArrowIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx ArrowLeft: "M15 19l-7-7 7-7", strokeWidth 2,
    // round cap/join.
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val path = Path().apply {
            moveTo(15f * scale, 19f * scale)
            lineTo(8f * scale, 12f * scale)
            lineTo(15f * scale, 5f * scale)
        }
        drawPath(
            path = path,
            color = tint,
            style = Stroke(width = 2f * scale, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

@Composable
fun PinIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, filled: Boolean = true) {
    // src/icons/index.jsx PinOutline/PinFilled, same path for both, only
    // fill vs. stroke differs:
    // "M16,12V4H17V2H7V4H8V12L6,14V16H11.5V22H12.5V16H18V14L16,12Z"
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        fun p(x: Float, y: Float) = Offset(x * scale, y * scale)
        val path = Path().apply {
            moveTo(16f * scale, 12f * scale)
            lineTo(p(16f, 4f).x, p(16f, 4f).y)
            lineTo(p(17f, 4f).x, p(17f, 4f).y)
            lineTo(p(17f, 2f).x, p(17f, 2f).y)
            lineTo(p(7f, 2f).x, p(7f, 2f).y)
            lineTo(p(7f, 4f).x, p(7f, 4f).y)
            lineTo(p(8f, 4f).x, p(8f, 4f).y)
            lineTo(p(8f, 12f).x, p(8f, 12f).y)
            lineTo(p(6f, 14f).x, p(6f, 14f).y)
            lineTo(p(6f, 16f).x, p(6f, 16f).y)
            lineTo(p(11.5f, 16f).x, p(11.5f, 16f).y)
            lineTo(p(11.5f, 22f).x, p(11.5f, 22f).y)
            lineTo(p(12.5f, 22f).x, p(12.5f, 22f).y)
            lineTo(p(12.5f, 16f).x, p(12.5f, 16f).y)
            lineTo(p(18f, 16f).x, p(18f, 16f).y)
            lineTo(p(18f, 14f).x, p(18f, 14f).y)
            close()
        }
        if (filled) {
            drawPath(path = path, color = tint)
        } else {
            drawPath(path = path, color = tint, style = Stroke(width = 1.5f * scale))
        }
    }
}

@Composable
fun PlusIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/components/notes/MobileCreateFab.jsx's own FAB glyph: a "+" made
    // of two strokes, x=12/y=5..19 and x=5..19/y=12, strokeWidth 2.5,
    // round caps. The caller rotates this 45 degrees to turn it into a
    // close "x" when the dial is open, same as the web version.
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val strokeWidth = 2.5f * scale
        drawLine(
            color = tint,
            start = Offset(12f * scale, 5f * scale),
            end = Offset(12f * scale, 19f * scale),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = tint,
            start = Offset(5f * scale, 12f * scale),
            end = Offset(19f * scale, 12f * scale),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
    }
}

// The four icons below are filled paths with real curves (arcs), unlike
// the straight-line/circle icons above, hand-translating those precisely
// would be error-prone. PathParser reads the exact same SVG path data
// string src/icons/index.jsx uses, so the geometry matches byte for byte
// instead of being eyeballed.

@Composable
fun TextNoteIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx TextNoteIcon, viewBox 24x24, fill="currentColor".
    val path = remember {
        PathParser().parsePathString(
            "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 " +
                "16H5V5h14v14zm-2-6H7v-2h10v2zm-4 4H7v-2h6v2zm4-8H7V7h10v2z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) { drawPath(path, color = tint) }
    }
}

@Composable
fun ChecklistIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx ChecklistIcon, viewBox 24x24, fill="currentColor".
    val path = remember {
        PathParser().parsePathString(
            "M11 7H3v2h8V7zm0 4H3v2h8v-2zm0 4H3v2h8v-2zm5.59.58L13 12l1.41-1.41L16.59 12l4.59-4.59L22.59 9 16.59 15z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) { drawPath(path, color = tint) }
    }
}

@Composable
fun BrushIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx BrushIcon, viewBox 24x24, fill="currentColor".
    val path = remember {
        PathParser().parsePathString(
            "M20.71 4.63 19.37 3.29c-.39-.39-1.04-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z" +
                "M7.5 13.5a4.2 4.2 0 0 0-4.2 4.2c0 1.83-1.62 2.8-2.8 2.8 1.29 1.71 3.49 2.8 5.6 2.8a5.6 5.6 0 0 0 5.6-5.6 4.2 4.2 0 0 0-4.2-4.2z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) { drawPath(path, color = tint) }
    }
}

@Composable
fun MicIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx MicIcon, viewBox 24x24, fill="currentColor".
    val path = remember {
        PathParser().parsePathString(
            "M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) { drawPath(path, color = tint) }
    }
}

@Composable
fun ArchiveIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx ArchiveIcon, viewBox 24x24, stroke (not filled),
    // strokeWidth 2, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun PaletteIcon(modifier: Modifier = Modifier, size: Dp = 24.dp) {
    // src/components/common/PaletteColorIcon.jsx: a palette outline with
    // 5 colored dots. Not tinted like the icons above, it always draws its
    // own fixed colors, since showing actual color is the whole point of
    // this one (used on the "change color" menu entry).
    val bodyPath = remember {
        PathParser().parsePathString(
            "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 " +
                "0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.97-4.48-9-10-9z"
        ).toPath()
    }
    val outline = Color(0xFF1e293b)
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(bodyPath, color = Color(0xFFFF9E00).copy(alpha = 0.34f))
            drawPath(bodyPath, color = outline, style = Stroke(width = 1.1f))
            val dots = listOf(
                Triple(Offset(9f, 7.5f), 1.65f, Color(0xFFef4444)),
                Triple(Offset(6.5f, 12.5f), 1.65f, Color(0xFFf59e0b)),
                Triple(Offset(15.5f, 7.5f), 1.65f, Color(0xFF10b981)),
                Triple(Offset(16.5f, 13.5f), 1.65f, Color(0xFF3b82f6)),
            )
            for ((center, radius, color) in dots) {
                drawCircle(color = color, radius = radius, center = center)
                drawCircle(color = outline, radius = radius, center = center, style = Stroke(width = 0.5f))
            }
            drawCircle(color = outline, radius = 1.3f, center = Offset(12f, 11f))
        }
    }
}

@Composable
fun TrashIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx Trash, viewBox 24x24, stroke (not filled),
    // strokeWidth 1.5, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.109 1.02.17M4.772 5.79c.338-.061.678-.118 " +
                "1.02-.17m12.456 0L18.16 19.24A2.25 2.25 0 0 1 15.916 21.5H8.084A2.25 2.25 0 0 1 5.84 19.24L4.772 5.79" +
                "m12.456 0a48.108 48.108 0 0 0-12.456 0M10 5V4a2 2 0 1 1 4 0v1"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}
