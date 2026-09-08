package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
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
