package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
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
fun SearchIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx SearchIcon: circle r=8 at (11,11) plus a line
    // from (21,21) to (16.65,16.65), viewBox 24x24, strokeWidth 2, round
    // caps.
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val strokeWidth = 2f * scale
        drawCircle(
            color = tint,
            radius = 8f * scale,
            center = Offset(11f * scale, 11f * scale),
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
        )
        drawLine(
            color = tint,
            start = Offset(21f * scale, 21f * scale),
            end = Offset(16.65f * scale, 16.65f * scale),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
fun CloseIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx CloseIcon: two diagonal strokes forming an "x",
    // viewBox 24x24, strokeWidth 2.4, round caps.
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val strokeWidth = 2.4f * scale
        drawLine(
            color = tint,
            start = Offset(6f * scale, 6f * scale),
            end = Offset(18f * scale, 18f * scale),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = tint,
            start = Offset(18f * scale, 6f * scale),
            end = Offset(6f * scale, 18f * scale),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
fun TagIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/components/modal/ModalFooter.jsx's own inline tag glyph (kept
    // inline there too): a label outline plus a small hole dot, viewBox
    // 24x24, stroke (not filled), strokeWidth 1.8, round caps/joins. The
    // dot is a zero-length round-capped line in the source SVG, drawn here
    // as an equivalent filled circle of the same radius.
    val path = remember {
        PathParser().parsePathString(
            "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 1.8f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawCircle(color = tint, radius = 1.25f, center = Offset(7f, 7f))
        }
    }
}

@Composable
fun CheckmarkIcon(modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = Color.White) {
    // src/components/modal/ModalFooter.jsx's checked tag checkbox glyph:
    // "M3.5 8.5l3 3 6-6", viewBox 16x16, stroke (not filled), strokeWidth
    // 2.5, round caps/joins.
    val path = remember {
        PathParser().parsePathString("M3.5 8.5l3 3 6-6").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 16f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
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
fun DuplicateIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/App.jsx's own inline duplicate glyph (kept inline there too, a
    // one-shot icon not worth vendoring): a rounded rect behind a
    // connecting stroke path, viewBox 24x24, strokeWidth 2, round
    // caps/joins.
    val path = remember {
        PathParser().parsePathString("M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1").toPath()
    }
    val stroke = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round)
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = stroke)
            drawRoundRect(
                color = tint,
                topLeft = Offset(9f, 9f),
                size = Size(11f, 11f),
                cornerRadius = CornerRadius(2f, 2f),
                style = stroke,
            )
        }
    }
}

@Composable
fun DownloadIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx DownloadIcon (two subpaths: the arrow, then the
    // baseline), viewBox 24x24, stroke (not filled), strokeWidth 1.8,
    // round caps/joins.
    val path = remember {
        PathParser().parsePathString("M7 10l5 5m0 0l5-5m-5 5V3M5 21h14").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 1.8f, cap = StrokeCap.Round, join = StrokeJoin.Round))
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

@Composable
fun SettingsIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx SettingsIcon, viewBox 24x24, stroke (not
    // filled), strokeWidth 2, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z " +
                "M15 12a3 3 0 11-6 0 3 3 0 016 0z"
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
fun KeyIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/components/auth/PasskeyLoginButton.jsx's own KeyIcon, viewBox
    // 24x24, stroke (not filled), strokeWidth 2, round caps/joins.
    val circleCenter = Offset(7.5f, 15.5f)
    val circleRadius = 3.5f
    val path = remember {
        PathParser().parsePathString("M21 7l-9.5 9.5M14 14l3 3M18 10l3 3").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawCircle(color = tint, radius = circleRadius, center = circleCenter, style = Stroke(width = 2f))
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun BellIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/bell.svg, viewBox 24x24, stroke (not filled), strokeWidth 2,
    // round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6 " +
                "M9 17v1a3 3 0 0 0 6 0v-1"
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
fun BellRingingFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/bell-ringing-filled.svg, viewBox 24x24, filled (no stroke).
    val path = remember {
        PathParser().parsePathString(
            "M17.451 2.344a1 1 0 0 1 1.41 -.099a12.05 12.05 0 0 1 3.048 4.064a1 1 0 1 1 -1.818 .836a10.05 10.05 0 0 0 " +
                "-2.54 -3.39a1 1 0 0 1 -.1 -1.41z " +
                "M5.136 2.245a1 1 0 0 1 1.41 1.41a10.05 10.05 0 0 0 -2.54 3.39a1 1 0 1 1 -1.817 -.835a12.05 12.05 0 0 1 " +
                "3.047 -4.065z " +
                "M14.235 19c.865 0 1.322 1.024 .745 1.668a3.992 3.992 0 0 1 -2.98 1.332a3.992 3.992 0 0 1 -2.98 " +
                "-1.332c-.552 -.616 -.158 -1.579 .634 -1.661l.11 -.006h4.471z " +
                "M12 2a7 7 0 0 1 7 7v4l1.524 3.045c.162 .324 .176 .703 .038 1.04a1.2 1.2 0 0 1 -1.114 " +
                ".749h-14.895a1.2 1.2 0 0 1 -1.114 -.748a1.2 1.2 0 0 1 .038 -1.04l1.524 -3.046v-4a7 7 0 0 1 7 -7z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
        }
    }
}

@Composable
fun PeopleIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // Not from the Tabler set like the icons above: this one matches the
    // web's own collaboration-button glyph exactly instead, an inline SVG
    // in ModalFooter.jsx (not part of its shared src/icons/index.jsx),
    // viewBox 20x20, filled (no stroke).
    val path = remember {
        PathParser().parsePathString(
            "M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 20f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
        }
    }
}

// The seven icons below back the rich-text toolbar (RichTextEditor.kt). Same
// source discipline as the rest of this file: exact path data from the
// Tabler Icons set (MIT) this project already vendors under
// src/icons/editor/tabler/ for the web's own RichIcons.jsx, not eyeballed.

@Composable
fun BoldIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/bold.svg, viewBox 24x24, stroke (not filled), strokeWidth 3,
    // round caps/joins.
    val path = remember {
        PathParser().parsePathString("M7 5h6a3.5 3.5 0 0 1 0 7h-6l0 -7 M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 3f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun ItalicIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/italic.svg, viewBox 24x24, stroke (not filled), strokeWidth 2,
    // round caps/joins.
    val path = remember {
        PathParser().parsePathString("M11 5l6 0 M7 19l6 0 M14 5l-4 14").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun UnderlineIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/components/richtext/RichIcons.jsx's own default-variant Underline
    // (U-curve + a plain base line, "simple" style, no color override),
    // viewBox 24x24, stroke (not filled), strokeWidth 2, round caps/joins.
    val path = remember {
        PathParser().parsePathString("M7 5v5a5 5 0 0 0 10 0v-5 M5 19h14").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun StrikeIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/strikethrough.svg, viewBox 24x24, stroke (not filled),
    // strokeWidth 2, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M5 12l14 0 M16 6.5a4 2 0 0 0 -4 -1.5h-1a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-1.5a4 2 0 0 1 -4 -1.5"
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
fun LinkIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/link.svg, viewBox 24x24, stroke (not filled), strokeWidth 2,
    // round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M9 15l6 -6 M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464 " +
                "M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"
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
fun BulletListIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/list.svg: 3 lines plus 3 dots, viewBox 24x24, strokeWidth 2,
    // round caps/joins. Tabler draws each dot as a zero-length round-capped
    // line ("M5 6l0 .01"); same as TagIcon's own dot above, that doesn't
    // reliably rasterize through PathParser + Stroke, so the dots are drawn
    // as small filled circles instead, same radius idea as TagIcon's.
    val path = remember {
        PathParser().parsePathString("M9 6l11 0 M9 12l11 0 M9 18l11 0").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            for (y in floatArrayOf(6f, 12f, 18f)) drawCircle(color = tint, radius = 1.4f, center = Offset(5f, y))
        }
    }
}

@Composable
fun NumberedListIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/list-numbers.svg, viewBox 24x24, stroke (not filled),
    // strokeWidth 2, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M11 6h9 M11 12h9 M12 18h8 M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4 M6 10v-6l-2 2"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

// The three icons below back the audio note player (AudioClipEditor.kt).
// Play/pause/stop are plain geometric shapes (a triangle, two bars, a
// square), simple enough to draw directly rather than needing exact
// vendored path data the way a lettered or curved glyph would.

@Composable
fun PlayIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val path = Path().apply {
            moveTo(7f * scale, 5f * scale)
            lineTo(19f * scale, 12f * scale)
            lineTo(7f * scale, 19f * scale)
            close()
        }
        drawPath(path, color = tint)
    }
}

@Composable
fun PauseIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val barWidth = 5f * scale
        val barHeight = 16f * scale
        val top = 4f * scale
        drawRoundRect(
            color = tint,
            topLeft = Offset(6f * scale, top),
            size = Size(barWidth, barHeight),
            cornerRadius = CornerRadius(1.5f * scale, 1.5f * scale),
        )
        drawRoundRect(
            color = tint,
            topLeft = Offset(13f * scale, top),
            size = Size(barWidth, barHeight),
            cornerRadius = CornerRadius(1.5f * scale, 1.5f * scale),
        )
    }
}

@Composable
fun StopIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        drawRoundRect(
            color = tint,
            topLeft = Offset(5f * scale, 5f * scale),
            size = Size(14f * scale, 14f * scale),
            cornerRadius = CornerRadius(2f * scale, 2f * scale),
        )
    }
}

@Composable
fun CheckSquareIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx CheckSquareIcon, viewBox 24x24, stroke (not
    // filled), strokeWidth 2, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M9 11l3 3L22 4 " +
                "M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

// The two icons below back CollaboratorsScreen.kt's per-row access toggle
// (read-only vs can-edit). Same source discipline as the rest of this
// file: exact path data from the Tabler Icons set (MIT) this project
// already vendors under src/icons/editor/tabler/ for the web's own
// CollaborationModal.jsx AccessToggle (TI.Eye / TI.Pencil), not eyeballed.

@Composable
fun EyeIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/eye.svg, viewBox 24x24, stroke (not filled), strokeWidth 2,
    // round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 " +
                "M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"
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
fun PencilIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // tabler/pencil.svg, viewBox 24x24, stroke (not filled), strokeWidth 2,
    // round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4 " +
                "M13.5 6.5l4 4"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

// The icons below back the note modal's own header and footer bars
// (ModalHeader.jsx / ModalFooter.jsx). The web uses a different back
// arrow and check glyph there than the ones already above, and several
// of these are filled rather than stroked, so they are their own
// entries rather than reused approximations.

@Composable
fun ArrowLeftIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx ArrowLeft, the note modal's own back button:
    // a full-length arrow, not the chevron BackArrowIcon draws. viewBox
    // 24x24, stroke, strokeWidth 2, round caps/joins.
    val path = remember {
        PathParser().parsePathString("M19 12H5 M12 19l-7-7 7-7").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun SaveCheckIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // ModalHeader.jsx's save button glyph: viewBox 24x24, strokeWidth 3,
    // round caps/joins. Thicker than the small CheckmarkIcon above.
    val path = remember {
        PathParser().parsePathString("M5 13l4 4L19 7").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 3f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun AddImageIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/index.jsx AddImageIcon, viewBox 24x24, filled.
    val path = remember {
        PathParser().parsePathString(
            "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z" +
                "M8.5 11.5L11 14.51 14.5 10l4.5 6H5l3.5-4.5z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
        }
    }
}

@Composable
fun UndoIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // ModalFooter.jsx's undo arrow, viewBox 24x24, strokeWidth 2.
    val path = remember {
        PathParser().parsePathString("M3 10h13a4 4 0 0 1 0 8H7 M3 10l4-4 M3 10l4 4").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun RedoIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // ModalFooter.jsx's redo arrow: the mirror of UndoIcon above.
    val path = remember {
        PathParser().parsePathString("M21 10H8a4 4 0 0 0 0 8h10 M21 10l-4-4 M21 10l-4 4").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun CollaborateIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // ModalFooter.jsx's collaborate glyph: viewBox 20x20 (not 24), filled.
    val path = remember {
        PathParser().parsePathString(
            "M13 6a3 3 0 11-6 0 3 3 0 016 0z M18 8a2 2 0 11-4 0 2 2 0 014 0z M14 15a4 4 0 00-8 0v3h8v-3z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 20f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
        }
    }
}

@Composable
fun PencilFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // ModalFooter.jsx's "switch to edit" glyph, viewBox 24x24, filled.
    val path = remember {
        PathParser().parsePathString(
            "M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Z " +
                "M14.06 4.94l3.75 3.75 1.41-1.41a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-1.41 1.41Z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
        }
    }
}

@Composable
fun EyeFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // ModalFooter.jsx's "switch to read" glyph: stroked outline (1.8)
    // plus a filled pupil, viewBox 24x24.
    val outline = remember {
        PathParser().parsePathString("M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Z").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(outline, color = tint, style = Stroke(width = 1.8f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawCircle(color = tint, radius = 3.2f, center = Offset(12f, 12f))
        }
    }
}

// The three icons below back the notes drawer (TagSidebar.kt) and the
// header's sync-status indicator. Same source discipline as the rest of
// this file: exact path data from the web's own SVGs, not eyeballed.

@Composable
fun NotesIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/icons/sidebarIcons.jsx NotesIcon, viewBox 24x24, stroke (not
    // filled), strokeWidth 1.8, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 " +
                "M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4 " +
                "M9 9L15 9 " +
                "M9 13L15 13 " +
                "M9 17L13 17"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 1.8f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun CloudCheckIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/sync/SyncStatusIcon.jsx's CloudCheck (the "synced" state), viewBox
    // 24x24, stroke (not filled), strokeWidth 1.5, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25 " +
                "M9 12L11.5 14.5L15 10"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun CloudPendingIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    // src/sync/SyncStatusIcon.jsx's CloudPending (queued writes waiting to
    // reach the server), viewBox 24x24, stroke (not filled), strokeWidth
    // 1.5, round caps/joins.
    val path = remember {
        PathParser().parsePathString(
            "M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25 " +
                "M12 11L12 15 " +
                "M10 13L14 13"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

// Tabler icons used by the settings panel's section headers and rows,
// taken from the same src/icons/editor/tabler/*.svg files the web
// imports. `.tabler-icon` renders them at strokeWidth 1.75 with round
// caps/joins (globalCSS.js:3322-3340), which is what these use.

@Composable
private fun TablerIcon(pathData: String, modifier: Modifier, size: Dp, tint: Color) {
    val path = remember(pathData) { PathParser().parsePathString(pathData).toPath() }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 1.75f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun ShieldLockIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3 " +
        "M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 " +
        "M12 12l0 2.5",
    modifier, size, tint,
)

@Composable
fun AdjustmentsIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M4 6l8 0 M16 6l4 0 " +
        "M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M4 12l2 0 M10 12l10 0 " +
        "M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M4 18l11 0 M19 18l1 0",
    modifier, size, tint,
)

@Composable
fun NoteTablerIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M13 20l7 -7 " +
        "M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7",
    modifier, size, tint,
)

@Composable
fun DatabaseIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3 " +
        "M4 6v6c0 1.657 3.582 3 8 3s8 -1.343 8 -3v-6 " +
        "M4 12v6c0 1.657 3.582 3 8 3s8 -1.343 8 -3v-6",
    modifier, size, tint,
)

@Composable
fun WorldIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M3.6 9h16.8 M3.6 15h16.8 " +
        "M11.5 3a17 17 0 0 0 0 18 M12.5 3a17 17 0 0 1 0 18",
    modifier, size, tint,
)

@Composable
fun ChevronDownIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M6 9l6 6l6 -6",
    modifier, size, tint,
)

@Composable
fun PaintRollerIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M5 5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -2 " +
        "M19 6h1a2 2 0 0 1 2 2a5 5 0 0 1 -5 5l-5 0v2 " +
        "M10 16a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -4",
    modifier, size, tint,
)

@Composable
fun QrCodeIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z " +
        "M4 14m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z " +
        "M14 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z " +
        "M14 14h3 M14 14v3 M17 17h3v3 M20 14v.01 M14 20h.01 M17 20h.01 M20 17h.01 M20 20h.01",
    modifier, size, tint,
)

@Composable
fun IndentIncreaseIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M20 6l-11 0 M20 12l-7 0 M20 18l-11 0 M4 8l4 4l-4 4",
    modifier, size, tint,
)

@Composable
fun RefreshIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4 " +
        "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",
    modifier, size, tint,
)

@Composable
fun SparklesIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z " +
        "M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z " +
        "M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z",
    modifier, size, tint,
)

/** tabler/key.svg. Distinct from [KeyIcon], which is the web's own
 *  hand-drawn glyph on the login button: the settings rows use the
 *  Tabler set instead. */
@Composable
fun TablerKeyIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301" +
        "l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172" +
        "a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301" +
        "a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z " +
        "M15 9h.01",
    modifier, size, tint,
)

/** tabler/download.svg, the settings rows' own download glyph (the web's
 *  [DownloadIcon] is a different, thinner drawing). */
@Composable
fun TablerDownloadIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2 M7 11l5 5l5 -5 M12 4l0 12",
    modifier, size, tint,
)
