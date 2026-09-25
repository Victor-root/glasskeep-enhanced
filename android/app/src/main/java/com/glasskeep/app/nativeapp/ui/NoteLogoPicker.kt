package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.network.LogoDto
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.LightBorderColor

// The sub-menu's three tinted rows (AddImageMenu.jsx:33-70).
private val MenuBlueDark = Color(0xFF7DD3FC)
private val MenuBlueLight = Color(0xFF0284C7)
private val MenuVioletDark = Color(0xFFC4B5FD)
private val MenuVioletLight = Color(0xFF7C3AED)
private val MenuRedDark = Color(0xFFF87171)
private val MenuRedLight = Color(0xFFDC2626)

/** The kebab menu's own dark surface (#222222). */
private val MenuBgDark = Color(0xFF222222)

/**
 * AddImageMenu.jsx: the two clearly separated choices behind the footer's
 * "Image" button, plus the "remove" row a note that already has an icon
 * gets. Same card and rows as the note's kebab menu, 220px at least.
 */
@Composable
internal fun AddImageMenu(
    dark: Boolean,
    hasIcon: Boolean,
    onAddImage: () -> Unit,
    onAddIcon: () -> Unit,
    onRemoveIcon: () -> Unit,
    onDismiss: () -> Unit,
) {
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    FooterPopover(
        minWidth = 220.dp,
        gap = 8.dp,
        cornerRadius = 8.dp,
        elevation = 10.dp,
        background = if (dark) MenuBgDark else Color.White,
        borderColor = borderColor,
        onDismiss = onDismiss,
    ) {
        val imageTint = if (dark) MenuBlueDark else MenuBlueLight
        PopoverMenuItem(
            label = stringResource(R.string.native_add_an_image),
            color = imageTint,
            onClick = { onAddImage(); onDismiss() },
        ) { AddImageIcon(size = 16.dp, tint = imageTint) }
        val logoTint = if (dark) MenuVioletDark else MenuVioletLight
        PopoverMenuItem(
            label = stringResource(if (hasIcon) R.string.native_replace_logo else R.string.native_add_logo),
            color = logoTint,
            onClick = { onAddIcon(); onDismiss() },
        ) { LogoIcon(size = 16.dp, tint = logoTint) }
        if (hasIcon) {
            val removeTint = if (dark) MenuRedDark else MenuRedLight
            PopoverMenuItem(
                label = stringResource(R.string.native_remove_logo),
                color = removeTint,
                // The row's own `border-t`, which adds its 1px to the row.
                modifier = Modifier.topHairline(borderColor).padding(top = 1.dp),
                onClick = { onRemoveIcon(); onDismiss() },
            ) { TrashOutlineIcon(size = 16.dp, tint = removeTint) }
        }
    }
}

/**
 * LogoPickerPopover.jsx: every logo in the account's library as a tile,
 * the one this note already uses ringed, a dashed "+" tile that opens the
 * photo picker, and a small x on each tile that drops it from the library
 * (notes already pointing at it keep their own copy).
 */
@Composable
internal fun LogoPickerPopover(
    logos: List<LogoDto>,
    selectedSrc: String?,
    dark: Boolean,
    onPick: (LogoDto) -> Unit,
    onUploadNew: () -> Unit,
    onDelete: (LogoDto) -> Unit,
    onDismiss: () -> Unit,
    below: Boolean = false,
) {
    FooterPopover(
        width = 256.dp,
        gap = 8.dp,
        below = below,
        background = if (dark) LogoPanelBgDark else Color.White,
        borderColor = if (dark) LogoPanelBorderDark else LogoPanelBorderLight,
        ringColor = if (dark) Color.White.copy(alpha = 0.05f) else Color.Black.copy(alpha = 0.05f),
        onDismiss = onDismiss,
    ) {
        LogoPickerGrid(logos, selectedSrc, dark, onPick, onUploadNew, onDelete)
    }
}

/** LogoPickerPopover.jsx's grid: four 48px columns 12px apart, the
 *  library then the dashed upload tile, and the empty hint under them. */
@Composable
private fun LogoPickerGrid(
    logos: List<LogoDto>,
    selectedSrc: String?,
    dark: Boolean,
    onPick: (LogoDto) -> Unit,
    onUploadNew: () -> Unit,
    onDelete: (LogoDto) -> Unit,
) {
    val tileShape = RoundedCornerShape(12.dp)
    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val tiles: List<LogoDto?> = logos + null
        tiles.chunked(4).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (logo in row) {
                    if (logo == null) {
                        LogoUploadTile(dark, tileShape, onUploadNew)
                    } else {
                        LogoTile(logo, logo.src == selectedSrc, dark, tileShape, onPick, onDelete)
                    }
                }
            }
        }
        if (logos.isEmpty()) {
            Text(
                stringResource(R.string.native_no_logos_yet),
                color = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun LogoTile(
    logo: LogoDto,
    selected: Boolean,
    dark: Boolean,
    shape: RoundedCornerShape,
    onPick: (LogoDto) -> Unit,
    onDelete: (LogoDto) -> Unit,
) {
    val label = logo.name.ifBlank { stringResource(R.string.native_note_icon) }
    Box {
        Box(
            modifier = Modifier
                .size(48.dp)
                // ring-[3px] ring-indigo-500 ring-offset-2, the offset in
                // the panel's own colour.
                .drawBehind {
                    if (!selected) return@drawBehind
                    val offset = 2.dp.toPx()
                    val ring = 3.dp.toPx()
                    val radius = 12.dp.toPx()
                    drawRoundRect(
                        color = if (dark) LogoPanelBgDark else Color.White,
                        topLeft = Offset(-offset / 2f, -offset / 2f),
                        size = Size(size.width + offset, size.height + offset),
                        cornerRadius = CornerRadius(radius + offset / 2f),
                        style = Stroke(width = offset),
                    )
                    drawRoundRect(
                        color = LogoSelectionRing,
                        topLeft = Offset(-offset - ring / 2f, -offset - ring / 2f),
                        size = Size(size.width + 2 * offset + ring, size.height + 2 * offset + ring),
                        cornerRadius = CornerRadius(radius + offset + ring / 2f),
                        style = Stroke(width = ring),
                    )
                }
                .clip(shape)
                .background(if (dark) Color.White.copy(alpha = 0.05f) else Color(0xFFF3F4F6))
                .semantics { contentDescription = label }
                .gkTooltip(label)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onPick(logo) },
            contentAlignment = Alignment.Center,
        ) {
            rememberDecodedImage(logo.src)?.let { bitmap ->
                Image(
                    bitmap = bitmap,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        // The web only reveals it on hover; touch has none, so it stays.
        val deleteLabel = stringResource(R.string.native_delete_logo)
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = 4.dp, y = (-4).dp)
                .size(16.dp)
                .dropShadow(CircleShape, Shadow(radius = 2.dp, color = Color.Black.copy(alpha = 0.05f), offset = DpOffset(0.dp, 1.dp)))
                .clip(CircleShape)
                .background(Color(0xFFFB2C36))
                .semantics { contentDescription = deleteLabel }
                .gkTooltip(deleteLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onDelete(logo) },
            contentAlignment = Alignment.Center,
        ) {
            LogoDeleteCross(size = 10.dp, tint = Color.White)
        }
    }
}

@Composable
private fun LogoUploadTile(dark: Boolean, shape: RoundedCornerShape, onUploadNew: () -> Unit) {
    val label = stringResource(R.string.native_add_logo)
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(shape)
            .dashedBorder(if (dark) Color(0xFF6A7282) else Color(0xFFD1D5DC), shape, width = 2.dp, dash = 6.dp)
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onUploadNew() },
        contentAlignment = Alignment.Center,
    ) {
        LogoIcon(size = 24.dp, tint = Color(0xFF99A1AF), strokeWidth = 1.8f)
    }
}

/** The delete badge's cross: two strokes of 3 on a 24 grid. */
@Composable
private fun LogoDeleteCross(size: Dp, tint: Color) {
    Canvas(Modifier.size(size)) {
        val unit = this.size.minDimension / 24f
        drawLine(tint, Offset(6f * unit, 6f * unit), Offset(18f * unit, 18f * unit), strokeWidth = 3f * unit, cap = StrokeCap.Round)
        drawLine(tint, Offset(6f * unit, 18f * unit), Offset(18f * unit, 6f * unit), strokeWidth = 3f * unit, cap = StrokeCap.Round)
    }
}

// bg-gray-900 / border-gray-100/80 / border-gray-700/50 / ring-indigo-500 (v4).
private val LogoPanelBgDark = Color(0xFF101828)
private val LogoPanelBorderLight = Color(0xCCF3F4F6)
private val LogoPanelBorderDark = Color(0x80364153)
private val LogoSelectionRing = Color(0xFF615FFF)
