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
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
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

/** CollaborationModal.jsx's own search glyph: a lens of radius 7 at
 *  (11,11) and a 4.3-unit handle, stroke 2. */
@Composable
fun ModalSearchIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M21 21l-4.3 -4.3",
    modifier, size, tint, 2f,
)

@Composable
fun CloseIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, strokeWidth: Float = 2.4f) {
    // src/icons/index.jsx CloseIcon: two diagonal strokes forming an "x",
    // viewBox 24x24, strokeWidth 2.4, round caps. The same geometry is
    // Tabler's `x` (1.75) and Popover.jsx's close (2).
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        val strokeWidth = strokeWidth * scale
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
fun TagIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, dotRadius: Float = 1.25f) {
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
            drawCircle(color = tint, radius = dotRadius, center = Offset(7f, 7f))
        }
    }
}

/** The tag panel rows' small filled tag (ModalFooter.jsx), viewBox 16x16,
 *  with the arc flags written out for PathParser. */
@Composable
fun SmallTagFilledIcon(modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = Color.Black) {
    val path = remember {
        PathParser().parsePathString(
            "M2 2.5A.5 .5 0 0 1 2.5 2h5.086a.5 .5 0 0 1 .353 .146l5.915 5.915a.5 .5 0 0 1 0 .707" +
                "l-4.586 4.586a.5 .5 0 0 1 -.707 0L3.146 7.939A.5 .5 0 0 1 3 7.586V2.5z" +
                "M5 5a1 1 0 1 0 0 -2a1 1 0 0 0 0 2z"
        ).toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 16f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
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
    // filled), strokeWidth 2, round caps/joins. Spelled out with explicit
    // arc flags/coordinates rather than SVG's concatenated-flag shorthand
    // ("...0 002.573...") - see MoonIcon's own note on why that shorthand
    // doesn't survive this PathParser.
    val path = remember {
        PathParser().parsePathString(
            "M10.325 4.317 c.426 -1.756 2.924 -1.756 3.35 0" +
                " a1.724 1.724 0 0 0 2.573 1.066" +
                " c1.543 -.94 3.31 .826 2.37 2.37" +
                " a1.724 1.724 0 0 0 1.065 2.572" +
                " c1.756 .426 1.756 2.924 0 3.35" +
                " a1.724 1.724 0 0 0 -1.066 2.573" +
                " c.94 1.543 -.826 3.31 -2.37 2.37" +
                " a1.724 1.724 0 0 0 -2.572 1.065" +
                " c-.426 1.756 -2.924 1.756 -3.35 0" +
                " a1.724 1.724 0 0 0 -2.573 -1.066" +
                " c-1.543 .94 -3.31 -.826 -2.37 -2.37" +
                " a1.724 1.724 0 0 0 -1.065 -2.572" +
                " c-1.756 -.426 -1.756 -2.924 0 -3.35" +
                " a1.724 1.724 0 0 0 1.066 -2.573" +
                " c-.94 -1.543 .826 -3.31 2.37 -2.37" +
                " c.996 .608 2.296 .07 2.572 -1.065 z " +
                "M15 12 a3 3 0 1 1 -6 0 a3 3 0 0 1 6 0 z"
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

/** tabler/bell.svg. The web only ever draws it through `.tabler-icon`,
 *  which strokes it at 1.75 (header bell, note menu, reminder chip). */
@Composable
fun BellIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6 " +
        "M9 17v1a3 3 0 0 0 6 0v-1",
    modifier, size, tint,
)

/** tabler/bell-filled.svg: the header bell while the notification centre
 *  is open (NotificationBell.jsx:109). */
@Composable
fun BellFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M14.235 19c.865 0 1.322 1.024 .745 1.668a3.992 3.992 0 0 1 -2.98 1.332a3.992 3.992 0 0 1 -2.98 " +
        "-1.332c-.552 -.616 -.158 -1.579 .634 -1.661l.11 -.006h4.471z " +
        "M12 2c1.358 0 2.506 .903 2.875 2.141l.046 .171l.008 .043a8.013 8.013 0 0 1 4.024 6.069l.028 .287" +
        "l.019 .289v2.931l.021 .136a3 3 0 0 0 1.143 1.847l.167 .117l.162 .099c.86 .487 .56 1.766 -.377 1.864" +
        "l-.116 .006h-16c-1.028 0 -1.387 -1.364 -.493 -1.87a3 3 0 0 0 1.472 -2.063l.021 -.143l.001 -2.91" +
        "a8 8 0 0 1 3.821 -6.454l.248 -.146l.01 -.043a3.003 3.003 0 0 1 2.562 -2.29l.182 -.017l.176 -.004z",
    modifier, size, tint,
)

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

// The audio note's glyphs (AudioClipEditor.kt), from src/icons/index.jsx:
// Tabler's filled player and microphone icons, and Feather's edit-3.

@Composable
fun PlayFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z",
    modifier, size, tint,
)

@Composable
fun PauseFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" +
        "M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z",
    modifier, size, tint,
)

@Composable
fun MicrophoneFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M19 9a1 1 0 0 1 1 1a8 8 0 0 1 -6.999 7.938l-.001 2.062h3a1 1 0 0 1 0 2h-8a1 1 0 0 1 0 -2h3v-2.062" +
        "a8 8 0 0 1 -7 -7.938a1 1 0 1 1 2 0a6 6 0 0 0 12 0a1 1 0 0 1 1 -1z" +
        "M12 1a4 4 0 0 1 4 4v5a4 4 0 1 1 -8 0v-5a4 4 0 0 1 4 -4z",
    modifier, size, tint,
)

/** The clip list's rename glyph (index.jsx PencilIcon, Feather edit-3):
 *  a pencil over a baseline, stroke 2. */
@Composable
fun EditLineIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
    modifier, size, tint, 2f,
)

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

// The two icons below: exact path data from the Tabler Icons set (MIT)
// this project already vendors under src/icons/editor/tabler/ (TI.Eye /
// TI.Pencil), not eyeballed.

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

/** tabler/pencil.svg; stroke 2 where the web draws the bare svg, 1.75
 *  as a `.tabler-icon`. */
@Composable
fun PencilIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, strokeWidth: Float = 2f) = TablerIcon(
    "M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4 " +
        "M13.5 6.5l4 4",
    modifier, size, tint, strokeWidth,
)

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
fun SaveCheckIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, strokeWidth: Float = 3f) {
    // ModalHeader.jsx's save button glyph: viewBox 24x24, strokeWidth 3,
    // round caps/joins. Thicker than the small CheckmarkIcon above. A
    // checklist section's delete confirmation draws it at 2.5.
    val path = remember {
        PathParser().parsePathString("M5 13l4 4L19 7").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round))
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
    // Same explicit-flags rewrite as MoonIcon/SettingsIcon: the original
    // SVG's concatenated arc flags ("a3 3 0 11-6 0") - unambiguous to a
    // real SVG parser, but this codebase's PathParser mis-split that
    // digit run, garbling the two head circles and the body silhouette.
    val path = remember {
        PathParser().parsePathString(
            "M13 6 A3 3 0 1 1 7 6 A3 3 0 0 1 13 6 Z " +
                "M18 8 A2 2 0 1 1 14 8 A2 2 0 0 1 18 8 Z " +
                "M14 15 A4 4 0 0 0 6 15 V18 H14 V15 Z"
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

/** The shape [CloudCheckIcon] and its four siblings share: the same
 *  1.5-stroke cloud outline the web draws, with one glyph inside it. */
@Composable
private fun CloudIcon(pathData: String, modifier: Modifier, size: Dp, tint: Color) {
    val path = remember(pathData) { PathParser().parsePathString(pathData).toPath() }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

/** SyncStatusIcon.jsx's CloudSync: a drain is running right now. */
@Composable
fun CloudSyncIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = CloudIcon(
    "M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25 " +
        "M8 14l2-2 2 2 M10 12v5 M16 13l-2 2-2-2 M14 15v-5",
    modifier, size, tint,
)

/** SyncStatusIcon.jsx's CloudOff: the server did not answer. */
@Composable
fun CloudOffIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = CloudIcon(
    "M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3 " +
        "M1 1L23 23",
    modifier, size, tint,
)

/** SyncStatusIcon.jsx's CloudError: everything still queued has given up. */
@Composable
fun CloudErrorIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = CloudIcon(
    "M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25 " +
        "M12 10L12 14 " +
        "M12 16.6a0.5 0.5 0 1 0 0 0.8a0.5 0.5 0 0 0 0 -0.8",
    modifier, size, tint,
)

/** The counterpart of [TablerIcon] for the web's own hand-drawn set
 *  (src/icons/index.jsx), which draws at strokeWidth 2. */
@Composable
private fun WebIcon(pathData: String, modifier: Modifier, size: Dp, tint: Color) {
    val path = remember(pathData) { PathParser().parsePathString(pathData).toPath() }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
fun GridIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" +
        "M14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" +
        "M4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" +
        "M14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
    modifier, size, tint,
)

@Composable
fun ListIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M4 6h16M4 10h16M4 14h16M4 18h16",
    modifier, size, tint,
)

/** The web draws the sun's disc as an SVG <circle>, which has no path
 *  syntax; two half-arcs are the same shape. */
@Composable
fun SunIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0 -10 " +
        "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42" +
        "M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
    modifier, size, tint,
)

@Composable
fun MoonIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    // Same crescent as the web (icons/index.jsx's MoonIcon), spelled out
    // with explicit flags/coordinates rather than SVG's concatenated-flag
    // shorthand ("...018.646...") - PathParser mis-split that digit run,
    // which is what made this render as a garbled blob instead of a
    // clean half-moon.
    "M20.354 15.354 A9 9 0 0 1 8.646 3.646 A9.003 9.003 0 0 0 12 21 A9 9 0 0 0 20.354 15.354 Z",
    modifier, size, tint,
)

@Composable
fun LogOutIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
    modifier, size, tint,
)

/** icons/index.jsx ShieldIcon (Heroicons shield-check): the header menu's
 *  admin entry. Arc flags spelled out, see [MoonIcon]. */
@Composable
fun ShieldCheckIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M9 12l2 2 4-4 m5.618-4.016 A11.955 11.955 0 0 1 12 2.944 a11.955 11.955 0 0 1 -8.618 3.04 " +
        "A12.02 12.02 0 0 0 3 9 c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 " +
        "0-1.042-.133-2.052-.382-3.016 z",
    modifier, size, tint,
)

/** NotesHeader.jsx's inline QR glyph on the header's quick-access button:
 *  6px squares with 1px corners, unlike the Tabler [QrCodeIcon]. */
@Composable
fun QrQuickIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1z " +
        "M5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1z " +
        "M15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1z " +
        "M14 14h3 M14 14v3 M17 17h3v3 M20 14v.01 M14 20h.01 M17 20h.01 M20 17h.01 M20 20h.01",
    modifier, size, tint,
)

/** LockedBanner.jsx's own padlock: a plain body and shackle, no keyhole. */
@Composable
fun PadlockIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-5a2 2 0 0 1 2 -2z " +
        "M8 11V8a4 4 0 1 1 8 0v3",
    modifier, size, tint,
)

/** icons/index.jsx Sparkles, the AI answer box's glyph (the settings rows
 *  use the Tabler [SparklesIcon] instead). */
@Composable
fun AiSparklesIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M12 3l-1.912 5.813a2 2 0 0 1 -1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21" +
        "l1.912 -5.813a2 2 0 0 1 1.275 -1.275L21 12l-5.813 -1.912a2 2 0 0 1 -1.275 -1.275L12 3z " +
        "M5 3v4 M19 17v4 M3 5h4 M17 19h4",
    modifier, size, tint,
)

// Tabler icons used by the settings panel's section headers and rows,
// taken from the same src/icons/editor/tabler/*.svg files the web
// imports. `.tabler-icon` renders them at strokeWidth 1.75 with round
// caps/joins (globalCSS.js:3322-3340), which is what these use. The few
// round-capped glyphs the web draws as bare svgs pass their own stroke.

@Composable
private fun TablerIcon(pathData: String, modifier: Modifier, size: Dp, tint: Color, strokeWidth: Float = 1.75f) {
    val path = remember(pathData) { PathParser().parsePathString(pathData).toPath() }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint, style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

/** MultiSelectToolbar.jsx's side-by-side glyph: two rounded panes. */
@Composable
fun SideBySideIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4.5 5h4a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-11a1.5 1.5 0 0 1 1.5 -1.5z " +
        "M15.5 5h4a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-11a1.5 1.5 0 0 1 1.5 -1.5z",
    modifier, size, tint, strokeWidth = 2.2f,
)

/** MultiSelectToolbar.jsx's select-all square, checked once everything
 *  visible is selected. */
@Composable
fun SelectAllIcon(checked: Boolean, modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z" + if (checked) " M9 12l2 2l4 -4" else "",
    modifier, size, tint, strokeWidth = 2.2f,
)

/** MultiSelectToolbar.jsx's logo glyph: framed picture. */
@Composable
fun BulkLogoIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3z " +
        "M8.5 8.5m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0 " +
        "M21 15l-3.086 -3.086a2 2 0 0 0 -2.828 0l-9.086 9.086",
    modifier, size, tint, strokeWidth = 2f,
)

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
fun ChevronDownIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, strokeWidth: Float = 1.75f) = TablerIcon(
    "M6 9l6 6l6 -6",
    modifier, size, tint, strokeWidth,
)

/** SectionHeader.jsx's "no colour" option: a circle of radius 10 crossed
 *  corner to corner, stroke 1.5. */
@Composable
fun NoColorIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M19 5l-14 14",
    modifier, size, tint, 1.5f,
)

/** The heroicons chevron the web draws inline (`M19 9l-7 7-7-7`): wider
 *  and lower than Tabler's. */
@Composable
fun DownChevronIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, strokeWidth: Float = 2f) = TablerIcon(
    "M19 9l-7 7l-7 -7",
    modifier, size, tint, strokeWidth,
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

/** tabler/check.svg, the settings pickers' "current choice" mark. */
@Composable
fun TablerCheckIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M5 12l5 5l10 -10",
    modifier, size, tint,
)

/** tabler/bell.svg and tabler/eye.svg at the settings rows' 1.75 stroke;
 *  [BellIcon] and [EyeIcon] keep the 2px stroke their other screens draw. */
@Composable
fun TablerBellIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6 " +
        "M9 17v1a3 3 0 0 0 6 0v-1",
    modifier, size, tint,
)

@Composable
fun TablerEyeIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 " +
        "M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6",
    modifier, size, tint,
)

/** tabler/layout-sidebar.svg. */
@Composable
fun LayoutSidebarIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z M9 4l0 16",
    modifier, size, tint,
)

/** tabler/float-center.svg. */
@Composable
fun FloatCenterIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M9 6a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4 " +
        "M4 7l1 0 M4 11l1 0 M19 7l1 0 M19 11l1 0 M4 15l16 0 M4 19l16 0",
    modifier, size, tint,
)

/** tabler/clock.svg. */
@Composable
fun ClockIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M12 7v5l3 3",
    modifier, size, tint,
)

/** tabler/heading.svg. */
@Composable
fun HeadingIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M7 12h10 M7 4v16 M17 4v16 M15 20h4 M15 4h4 M5 20h4 M5 4h4",
    modifier, size, tint,
)

/** tabler/typography.svg. */
@Composable
fun TypographyIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 20l3 0 M14 20l7 0 M6.9 15l6.9 0 M10.2 6.3l5.8 13.7 M5 20l6 -16l2 0l7 16",
    modifier, size, tint,
)

/** tabler/clipboard.svg. */
@Composable
fun ClipboardIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2 " +
        "M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z",
    modifier, size, tint,
)

/** The colour picker's own check (`ColorPickerPanel.jsx:101-103`): a
 *  filled glyph, not the stroked [CheckmarkIcon] used elsewhere. */
@Composable
fun CheckFilledIcon(modifier: Modifier = Modifier, size: Dp = 20.dp, tint: Color = Color.White) {
    val path = remember {
        PathParser().parsePathString("M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z").toPath()
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
        }
    }
}

/** The drawing toolbar's pen, a filled Material pencil
 *  (DrawingToolbar.jsx:26-30). */
@Composable
fun PenFilledIcon(modifier: Modifier = Modifier, size: Dp = 20.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M3 17.25V21h3.75l11-11-3.75-3.75-11 11zM20.71 7.04a1.003 1.003 0 000-1.42L18.37 3.29a1.003 1.003 0 00-1.42 0" +
        "L15.13 5.11l3.75 3.75 1.83-1.82z",
    modifier, size, tint,
)

/** Lucide's eraser, the drawing toolbar's second tool
 *  (DrawingToolbar.jsx:32-38). */
@Composable
fun EraserIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M7 21l-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21 M22 21H7 M5 11l9 9",
    modifier, size, tint, strokeWidth = 2f,
)

/** Lucide's wrench, the drawing toolbar's "actions" button
 *  (DrawingToolbar.jsx:485-487). */
@Composable
fun WrenchIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3" +
        "l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
    modifier, size, tint, strokeWidth = 2f,
)

/** The drawing actions' filled undo arrow (DrawingToolbar.jsx:57-61);
 *  mirrored, it is their redo. */
@Composable
fun DrawingUndoIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M12.5 8c-2.35 0-4.45 1.02-5.9 2.64L4 8v8h8l-3.04-3.04A5.47 5.47 0 0112.5 11c2.76 0 5 2.24 5 5 0 .34-.03.67-.1.99" +
        "l2.02 1.17c.28-.68.43-1.42.43-2.16 0-4.42-3.58-8-8-8z",
    modifier, size, tint,
)

/** Material's delete_forever, "clear all" (DrawingToolbar.jsx:69-73). */
@Composable
fun DeleteForeverIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M6 19c0 1.1.9 2 2 2h8a2 2 0 002-2V7H6v12zm3.46-7.12 1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13" +
        "l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z",
    modifier, size, tint,
)

/** Lucide's file-plus, "add a page" (DrawingToolbar.jsx:40-47). */
@Composable
fun FilePlusIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2L14 8L20 8 M12 18L12 12 M9 15L15 15",
    modifier, size, tint, strokeWidth = 2f,
)

/** Lucide's file-minus, "remove the last page" (DrawingToolbar.jsx:49-55). */
@Composable
fun FileMinusIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2L14 8L20 8 M9 15L15 15",
    modifier, size, tint, strokeWidth = 2f,
)

/** PageLinesIcon (DrawingToolbar.jsx:176-182): a page with two rules,
 *  the rules dashed once the guides are hidden. */
@Composable
fun PageLinesIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, dashed: Boolean = false) {
    Canvas(modifier.size(size)) {
        val unit = this.size.minDimension / 24f
        val stroke = 2f * unit
        drawRoundRect(
            color = tint,
            topLeft = Offset(3f * unit, 3f * unit),
            size = Size(18f * unit, 18f * unit),
            cornerRadius = CornerRadius(2f * unit, 2f * unit),
            style = Stroke(width = stroke, join = StrokeJoin.Round),
        )
        val effect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(3f * unit, 3f * unit)) else null
        listOf(8f, 16f).forEach { y ->
            drawLine(
                color = tint,
                start = Offset(4f * unit, y * unit),
                end = Offset(20f * unit, y * unit),
                strokeWidth = stroke,
                cap = StrokeCap.Round,
                pathEffect = effect,
            )
        }
    }
}

/** Material's palette, the drawing colour popover's "custom colour"
 *  button (DrawingToolbar.jsx:329-331). */
@Composable
fun CustomColorIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 " +
        "0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 " +
        "7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5" +
        "S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
    modifier, size, tint,
)

/** tabler/text-color.svg, the footer button that opens the formatting
 *  sheet (`ModalFooter.jsx:601-611`). */
@Composable
fun TextColorIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M9 15v-7a3 3 0 0 1 6 0v7 M9 11h6 M5 19h14",
    modifier, size, tint,
)

/** tabler/clear-formatting.svg. */
@Composable
fun ClearFormattingIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M17 15l4 4m0 -4l-4 4 M7 6v-1h11v1 M7 19l4 0 M13 5l-4 14",
    modifier, size, tint,
)

@Composable
fun RefreshIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4 " +
        "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",
    modifier, size, tint,
)

/** sidebarIcons.jsx ImagesIcon: the drawer's "All images" filter. Drawn
 *  at the sidebar set's own 1.8 stroke rather than [WebIcon]'s 2. */
@Composable
fun SidebarImagesIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z " +
        "M8.5 7a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0 -3 " +
        "M21 15l-5 -5l-11 11",
    modifier, size, tint, strokeWidth = 1.8f,
)

/** sidebarIcons.jsx RemindersSidebarIcon: the drawer's "Reminders"
 *  filter, a plain bell distinct from the header's own [BellIcon]. */
@Composable
fun SidebarRemindersIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M18 8a6 6 0 0 0 -12 0c0 7 -3 9 -3 9h18s-3 -2 -3 -9 " +
        "M13.73 21a2 2 0 0 1 -3.46 0",
    modifier, size, tint, strokeWidth = 1.8f,
)

/** sidebarIcons.jsx ArchiveSidebarIcon: square-cornered box, unlike the
 *  rounded [ArchiveIcon] of the note menus. */
@Composable
fun SidebarArchiveIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M21 8L21 21L3 21L3 8 " +
        "M1 3h22v5h-22z " +
        "M10 12L14 12",
    modifier, size, tint, strokeWidth = 1.8f,
)

/** sidebarIcons.jsx TrashSidebarIcon (Feather trash-2). */
@Composable
fun SidebarTrashIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 6L5 6L21 6 " +
        "M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 " +
        "M10 11v6 " +
        "M14 11v6 " +
        "M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2",
    modifier, size, tint, strokeWidth = 1.8f,
)

/** tabler/chevron-right.svg. */
@Composable
fun ChevronRightIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, strokeWidth: Float = 1.75f) = TablerIcon(
    "M9 6l6 6l-6 6",
    modifier, size, tint, strokeWidth,
)

/** tabler/message-search.svg: the note's own AI conversation. */
@Composable
fun MessageSearchIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 9h8 M8 13h5 " +
        "M11.008 19.195l-3.008 1.805v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v4.5 " +
        "M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 " +
        "M20.2 20.2l1.8 1.8",
    modifier, size, tint,
)

/** tabler/message-2-down.svg and tabler/message-2-x.svg: keep this
 *  conversation for next time, and throw the kept one away. */
@Composable
fun MessageSaveIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 9h8 M8 13h6 " +
        "M12.5 20.5l-.5 .5l-3 -3h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v5.5 " +
        "M19 16v6 M22 19l-3 3l-3 -3",
    modifier, size, tint,
)

@Composable
fun MessageResetIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 9h8 M8 13h6 " +
        "M13.5 19.5l-1.5 1.5l-3 -3h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6 " +
        "M22 22l-5 -5 M17 22l5 -5",
    modifier, size, tint,
)

/** tabler/arrow-down.svg. */
@Composable
fun ArrowDownIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M12 5l0 14 M18 13l-6 6 M6 13l6 6",
    modifier, size, tint,
)

/** tabler/chevron-left.svg. */
@Composable
fun ChevronLeftIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, strokeWidth: Float = 1.75f) = TablerIcon(
    "M15 6l-6 6l6 6",
    modifier, size, tint, strokeWidth,
)

/** tabler/player-stop-filled.svg as the web draws it inside a
 *  `.tabler-icon`, whose rule strips the fill: an outlined square. */
@Composable
fun PlayerStopIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M17 4h-10a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z",
    modifier, size, tint,
)

/** tabler/file-text-spark.svg: the second of the two quick prompts. */
@Composable
fun FileTextSparkIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M14 3v4a1 1 0 0 0 1 1h4 " +
        "M12 21h-5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v3.5 " +
        "M9 9h1 M9 13h6 M9 17h3 " +
        "M19 22.5a4.75 4.75 0 0 1 3.5 -3.5a4.75 4.75 0 0 1 -3.5 -3.5a4.75 4.75 0 0 1 -3.5 3.5a4.75 4.75 0 0 1 3.5 3.5",
    modifier, size, tint,
)

private const val FileAiPath = "M14 3v4a1 1 0 0 0 1 1h4 " +
    "M10 21h-3a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v3.5 " +
    "M9 9h1 M9 13h2.5 M9 17h1 " +
    "M14 21v-4a2 2 0 1 1 4 0v4 M14 19h4 M21 15v6"

/** tabler/file-ai.svg. */
@Composable
fun FileAiIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) =
    TablerIcon(FileAiPath, modifier, size, tint)

/** The same glyph as NotesHeader.jsx inlines it in the search field (the
 *  button that asks the assistant instead of filtering): stroke 2. */
@Composable
fun AskAiIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) =
    WebIcon(FileAiPath, modifier, size, tint)

/** tabler/brain.svg. */
@Composable
fun BrainIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8 " +
        "M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8 " +
        "M17.5 16a3.5 3.5 0 0 0 0 -7h-.5 " +
        "M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0 " +
        "M6.5 16a3.5 3.5 0 0 1 0 -7h.5 " +
        "M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10",
    modifier, size, tint,
)

/** tabler/eye-off.svg. */
@Composable
fun EyeOffIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M10.585 10.587a2 2 0 0 0 2.829 2.828 " +
        "M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6" +
        "c1.272 -2.12 2.712 -3.678 4.32 -4.674" +
        "m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87 " +
        "M3 3l18 18",
    modifier, size, tint,
)

/** TagSidebar.jsx's multi-tag filter funnel (Feather filter), stroke 2. */
@Composable
fun FunnelIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M22 3L2 3L10 12.46L10 19L14 21L14 12.46z",
    modifier, size, tint, strokeWidth = 2f,
)

/** tabler/filter-2-question.svg. */
@Composable
fun FilterQuestionIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 6h13 M5 12h9 M6 18h4 " +
        "M19 22v.01 " +
        "M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483",
    modifier, size, tint,
)

/** tabler/volume.svg. */
@Composable
fun VolumeIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M15 8a5 5 0 0 1 0 8 " +
        "M17.7 5a9 9 0 0 1 0 14 " +
        "M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5",
    modifier, size, tint,
)

/** tabler/user-share.svg. */
@Composable
fun UserShareIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0 " +
        "M6 21v-2a4 4 0 0 1 4 -4h3 " +
        "M16 22l5 -5 M21 21.5v-4.5h-4.5",
    modifier, size, tint,
)

/** tabler/user-clock.svg. */
@Composable
fun UserClockIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0 " +
        "M6 21v-2a4 4 0 0 1 4 -4h4.5 " +
        "M18 18m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 " +
        "M18 16.496v1.504l1 1",
    modifier, size, tint,
)

/** tabler/user-x.svg. */
@Composable
fun UserXIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0 " +
        "M6 21v-2a4 4 0 0 1 4 -4h4 " +
        "M22 22l-5 -5 M17 22l5 -5",
    modifier, size, tint,
)

/** tabler/world-www.svg. */
@Composable
fun WorldWwwIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M19.5 7a9 9 0 0 0 -7.5 -4a8.991 8.991 0 0 0 -7.484 4 " +
        "M11.5 3a16.989 16.989 0 0 0 -1.826 4 " +
        "M12.5 3a16.989 16.989 0 0 1 1.828 4 " +
        "M19.5 17a9 9 0 0 1 -7.5 4a8.991 8.991 0 0 1 -7.484 -4 " +
        "M11.5 21a16.989 16.989 0 0 1 -1.826 -4 " +
        "M12.5 21a16.989 16.989 0 0 0 1.828 -4 " +
        "M2 10l1 4l1.5 -4l1.5 4l1 -4 " +
        "M17 10l1 4l1.5 -4l1.5 4l1 -4 " +
        "M9.5 10l1 4l1.5 -4l1.5 4l1 -4",
    modifier, size, tint,
)

/** tabler/circle-check-filled.svg. */
@Composable
fun CircleCheckFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M17 3.34a10 10 0 1 1 -15 8.66l.005 -.324a10 10 0 0 1 14.995 -8.336z" +
        "m-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083" +
        "a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094" +
        "a1 1 0 0 0 -.083 -1.32z",
    modifier, size, tint,
)

/** tabler/upload.svg. */
@Composable
fun UploadIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2 " +
        "M7 9l5 -5l5 5 " +
        "M12 4l0 12",
    modifier, size, tint,
)

/** tabler/brand-google.svg. */
@Composable
fun BrandGoogleIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M20.945 11a9 9 0 1 1 -3.284 -5.997l-2.655 2.392a5.5 5.5 0 1 0 2.119 6.605h-4.125v-3h7.945z",
    modifier, size, tint,
)

/** tabler/file-text.svg. */
@Composable
fun FileTextIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M14 3v4a1 1 0 0 0 1 1h4 " +
        "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z " +
        "M9 9l1 0 M9 13l6 0 M9 17l6 0",
    modifier, size, tint,
)

/** tabler/arrows-sort.svg. */
@Composable
fun ArrowsSortIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 9l4 -4l4 4 M7 5l0 14 " +
        "M21 15l-4 4l-4 -4 M17 5l0 14",
    modifier, size, tint,
)

/** tabler/device-mobile-rotated.svg. */
@Composable
fun DeviceMobileRotatedIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 6m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z " +
        "M20 11v2 " +
        "M7 12h.01",
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

// ---------------------------------------------------------------------------
// Rich-text toolbar glyphs (RichIcons.jsx). Same Tabler sources, same 24x24
// viewBox, same 1.75 rendered stroke width as every icon above.

@Composable
fun HighlightIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 19h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4 " +
        "M12.5 5.5l4 4 M4.5 13.5l4 4 M21 15v4h-8l4 -4l4 0",
    modifier, size, tint,
)

@Composable
fun TaskListIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3.5 5.5l1.5 1.5l2.5 -2.5 M3.5 11.5l1.5 1.5l2.5 -2.5 M3.5 17.5l1.5 1.5l2.5 -2.5 " +
        "M11 6l9 0 M11 12l9 0 M11 18l9 0",
    modifier, size, tint,
)

@Composable
fun AlignLeftIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 6l16 0 M4 12l10 0 M4 18l14 0",
    modifier, size, tint,
)

@Composable
fun AlignCenterIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 6l16 0 M8 12l8 0 M6 18l12 0",
    modifier, size, tint,
)

@Composable
fun AlignRightIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 6l16 0 M10 12l10 0 M6 18l14 0",
    modifier, size, tint,
)

@Composable
fun AlignJustifyIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 6l16 0 M4 12l16 0 M4 18l12 0",
    modifier, size, tint,
)

@Composable
fun SeparatorIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 12l16 0 M8 8l4 -4l4 4 M16 16l-4 4l-4 -4",
    modifier, size, tint,
)

@Composable
fun SubscriptIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M5 7l8 10m-8 0l8 -10 M21 20h-4l3.5 -4a1.73 1.73 0 0 0 -3.5 -2",
    modifier, size, tint,
)

@Composable
fun SuperscriptIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M5 7l8 10m-8 0l8 -10 M21 11h-4l3.5 -4a1.73 1.73 0 0 0 -3.5 -2",
    modifier, size, tint,
)

@Composable
fun TextIncreaseIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 19v-10.5a3.5 3.5 0 1 1 7 0v10.5 M4 13h7 M18 9v6 M21 12h-6",
    modifier, size, tint,
)

@Composable
fun TextDecreaseIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 19v-10.5a3.5 3.5 0 1 1 7 0v10.5 M4 13h7 M21 12h-6",
    modifier, size, tint,
)

@Composable
fun IndentDecreaseIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M20 6l-7 0 M20 12l-9 0 M20 18l-7 0 M8 8l-4 4l4 4",
    modifier, size, tint,
)

@Composable
fun InlineCodeIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M7 8l-4 4l4 4 M17 8l4 4l-4 4 M14 4l-4 16",
    modifier, size, tint,
)

@Composable
fun CodeBlockIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 9l3 3l-3 3 M13 15l3 0 " +
        "M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z",
    modifier, size, tint,
)

@Composable
fun QuoteIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M6 15h15 M21 19h-15 M15 11h6 M21 7h-6 " +
        "M9 9h1a1 1 0 1 1 -1 1v-2.5a2 2 0 0 1 2 -2 " +
        "M3 9h1a1 1 0 1 1 -1 1v-2.5a2 2 0 0 1 2 -2",
    modifier, size, tint,
)

/** Same helper as [TablerIcon] for the FILLED variants (a solid glyph,
 *  no stroke): the notification pill's own fallbacks. */
@Composable
private fun TablerFilledIcon(pathData: String, modifier: Modifier, size: Dp, tint: Color) {
    val path = remember(pathData) { PathParser().parsePathString(pathData).toPath() }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
        }
    }
}

@Composable
fun AlertFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M12 1.67c.955 0 1.845 .467 2.39 1.247l.105 .16l8.114 13.548a2.914 2.914 0 0 1 -2.307 4.363l-.195 .008" +
        "h-16.225a2.914 2.914 0 0 1 -2.582 -4.2l.099 -.185l8.11 -13.538a2.914 2.914 0 0 1 2.491 -1.403z" +
        "m.01 13.33l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007z" +
        "m-.01 -7a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z",
    modifier, size, tint,
)

@Composable
fun InfoFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M12 2c5.523 0 10 4.477 10 10s-4.477 10 -10 10s-10 -4.477 -10 -10s4.477 -10 10 -10z" +
        "m0 9h-1l-.117 .007a1 1 0 0 0 0 1.986l.117 .007v3l.007 .117a1 1 0 0 0 .876 .876l.117 .007h1" +
        "l.117 -.007a1 1 0 0 0 .876 -.876l.007 -.117l-.007 -.117a1 1 0 0 0 -.764 -.857l-.112 -.02l-.117 -.006v-3" +
        "l-.007 -.117a1 1 0 0 0 -.876 -.876l-.117 -.007z" +
        "m.01 -3l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007z",
    modifier, size, tint,
)

/** tabler/alert-circle-filled.svg. */
@Composable
fun AlertCircleFilledIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1 -19.995 .324l-.005 -.324l.004 -.28c.148 -5.393 4.566 -9.72 9.996 -9.72z" +
        "m.01 13l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007z" +
        "m-.01 -8a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z",
    modifier, size, tint,
)

/** The WebView-era change-server dialog's own glyph (its ic_swap_server
 *  drawable): a filled 24x24 circular arrow, drawn by the same helper. */
@Composable
fun SwapServerIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerFilledIcon(
    "M12,5V1L7,6l5,5V7c3.31,0 6,2.69 6,6s-2.69,6 -6,6 -6,-2.69 -6,-6H4c0,4.42 3.58,8 8,8s8,-3.58 8,-8 -3.58,-8 -8,-8z",
    modifier, size, tint,
)

/** SyncStatusIcon.jsx LockBadge: a solid padlock, its body filled and
 *  outlined at 1.5, its shackle stroked at 2.5. */
@Composable
fun LockBadgeIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) {
    val shackle = remember { PathParser().parsePathString("M8 11V8a4 4 0 1 1 8 0v3").toPath() }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 24f
        scale(scale, scale, pivot = Offset.Zero) {
            val body = Size(14f, 10f)
            drawRoundRect(tint, topLeft = Offset(5f, 11f), size = body, cornerRadius = CornerRadius(2f))
            drawRoundRect(
                tint,
                topLeft = Offset(5f, 11f),
                size = body,
                cornerRadius = CornerRadius(2f),
                style = Stroke(width = 1.5f, join = StrokeJoin.Round),
            )
            drawPath(shackle, color = tint, style = Stroke(width = 2.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

/** icons/index.jsx LockIcon: the Tabler lock drawn by the web itself at
 *  stroke 2, the header menu's "lock the instance" entry. */
@Composable
fun LockIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6 " +
        "M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0 " +
        "M8 11v-4a4 4 0 1 1 8 0v4",
    modifier, size, tint,
)

/** The struck-through wifi arcs OfflineCollabBanner.jsx draws itself. */
@Composable
fun WifiOffIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = WebIcon(
    "M18.364 5.636a9 9 0 0 1 0 12.728 M5.636 18.364a9 9 0 0 1 0 -12.728 " +
        "M8.464 15.536a5 5 0 0 1 0 -7.072 M15.536 8.464a5 5 0 0 1 0 7.072 " +
        "M11.25 12a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 0 0 -1.5 0",
    modifier, size, tint,
)

/** tabler/server.svg: the peer a mirrored note belongs to. */
@Composable
fun ServerIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 4m0 3a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z " +
        "M3 12m0 3a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z " +
        "M7 8l0 .01 M7 16l0 .01",
    modifier, size, tint,
)

/** tabler/photo-circle-plus, the web's own LogoIcon (icons/index.jsx:504):
 *  the note's icon, in the footer and in the image sub-menu. Drawn as a
 *  bare svg there, so at its own stroke 2, not `.tabler-icon`'s 1.75. */
@Composable
fun LogoIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black, strokeWidth: Float = 2f) = TablerIcon(
    "M15 8h.01 " +
        "M20.964 12.806a9 9 0 0 0 -8.964 -9.806a9 9 0 0 0 -9 9a9 9 0 0 0 9.397 8.991 " +
        "M4 15l4 -4c.928 -.893 2.072 -.893 3 0l4 4 " +
        "M14 14l1 -1c.928 -.893 2.072 -.893 3 0 " +
        "M16 19.33h6 " +
        "M19 16.33v6",
    modifier, size, tint, strokeWidth,
)

/** Feather rotate-cw, SyncStatusIcon.jsx's RefreshIcon (stroke 2). */
@Composable
fun RotateCwIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M23 4L23 10L17 10 M20.49 15a9 9 0 1 1-2.12-9.36L23 10",
    modifier, size, tint, strokeWidth = 2f,
)

/** Feather alert-triangle, SyncStatusIcon.jsx's WarningIcon (stroke 2). */
@Composable
fun AlertTriangleOutlineIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z " +
        "M12 9L12 13 M12 17L12.01 17",
    modifier, size, tint, strokeWidth = 2f,
)

/** ModalFooter.jsx's "switch to draw mode" glyph: two stacked waves,
 *  stroke 2.2. */
@Composable
fun DrawWavesIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 17c2-3 4-6 6-3s4 3 6 0 4-3 6 0 M3 10c2-3 4-6 6-3s4 3 6 0 4-3 6 0",
    modifier, size, tint, strokeWidth = 2.2f,
)

/** Heroicons' solid trash (FullscreenImageViewer.jsx's remove), viewBox
 *  20x20, even-odd, with the arc flags written out for PathParser. */
@Composable
fun TrashSolidIcon(modifier: Modifier = Modifier, size: Dp = 20.dp, tint: Color = Color.Black) {
    val path = remember {
        PathParser().parsePathString(
            "M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795 .077 -1.584 .176 -2.365 .298a.75 .75 0 1 0 .23 1.482" +
                "l.149 -.022 .841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742 -2.53" +
                "l.841 -10.52 .149 .023a.75 .75 0 0 0 .23 -1.482A41.03 41.03 0 0 0 14 4.193V3.75" +
                "A2.75 2.75 0 0 0 11.25 1h-2.5z" +
                "M10 4c.84 0 1.673 .025 2.5 .075V3.75c0 -.69 -.56 -1.25 -1.25 -1.25h-2.5c-.69 0 -1.25 .56 -1.25 1.25" +
                "v.325C8.327 4.025 9.16 4 10 4z" +
                "M8.58 7.72a.75 .75 0 0 0 -1.5 .06l.3 7.5a.75 .75 0 1 0 1.5 -.06l-.3 -7.5z" +
                "m4.34 .06a.75 .75 0 1 0 -1.5 -.06l-.3 7.5a.75 .75 0 1 0 1.5 .06l.3 -7.5z"
        ).toPath().apply { fillType = PathFillType.EvenOdd }
    }
    Canvas(modifier.size(size)) {
        val scale = this.size.minDimension / 20f
        scale(scale, scale, pivot = Offset.Zero) {
            drawPath(path, color = tint)
        }
    }
}

// The rest of NotificationCard.jsx's SEMANTIC_ICONS, the outline Tabler
// glyphs a notification names by key.

/** tabler/trash-x.svg. */
@Composable
fun TrashXIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 7l16 0 M10 11l4 4m0 -4l-4 4 M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12 " +
        "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3",
    modifier, size, tint,
)

/** tabler/arrow-back-up.svg. */
@Composable
fun ArrowBackUpIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M9 14l-4 -4l4 -4 M5 10h11a4 4 0 1 1 0 8h-1",
    modifier, size, tint,
)

/** tabler/archive.svg. */
@Composable
fun TablerArchiveIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z " +
        "M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10 M10 12l4 0",
    modifier, size, tint,
)

/** tabler/archive-off.svg. */
@Composable
fun ArchiveOffIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 3l18 18 " +
        "M16 4h3a2 2 0 0 1 2 2v0a2 2 0 0 1 -1.166 1.818m-3.834 .182h-13a2 2 0 0 1 -2 -2v0a2 2 0 0 1 2 -2h7 " +
        "M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7m-4 -3h-6",
    modifier, size, tint,
)

/** tabler/copy.svg. */
@Composable
fun CopyIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2 " +
        "M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z",
    modifier, size, tint,
)

/** tabler/device-floppy.svg. */
@Composable
fun DeviceFloppyIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2 " +
        "M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M14 4l0 4l-6 0l0 -4",
    modifier, size, tint,
)

/** tabler/user-plus.svg. */
@Composable
fun UserPlusIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0 M16 19h6 M19 16v6 M6 21v-2a4 4 0 0 1 4 -4h4",
    modifier, size, tint,
)

/** tabler/user-check.svg. */
@Composable
fun UserCheckIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0 M6 21v-2a4 4 0 0 1 4 -4h4 M15 19l2 2l4 -4",
    modifier, size, tint,
)

/** tabler/users.svg. */
@Composable
fun UsersIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2 " +
        "M16 3.13a4 4 0 0 1 0 7.75 M21 21v-2a4 4 0 0 0 -3 -3.85",
    modifier, size, tint,
)

/** tabler/camera.svg. */
@Composable
fun CameraIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2 " +
        "M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
    modifier, size, tint,
)

/** tabler/power.svg. */
@Composable
fun PowerIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M7 6a7.75 7.75 0 1 0 10 0 M12 4l0 8",
    modifier, size, tint,
)

/** tabler/trash.svg: the bed a swiped notification card slides off. */
@Composable
fun TablerTrashIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M4 7l16 0 M10 11l0 6 M14 11l0 6 M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12 " +
        "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3",
    modifier, size, tint,
)

/** AddImageMenu.jsx's own inline trash for "Retirer le logo": lid, handle
 *  and a tapered bin, viewBox 24x24, stroke 1.8, round caps/joins. */
@Composable
fun TrashOutlineIcon(modifier: Modifier = Modifier, size: Dp = 24.dp, tint: Color = Color.Black) = TablerIcon(
    "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
    modifier, size, tint, strokeWidth = 1.8f,
)
