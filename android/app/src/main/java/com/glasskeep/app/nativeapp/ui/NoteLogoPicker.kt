package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.network.LogoDto

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
 * gets. Same popover shape as the footer's own colour and tag panels.
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
    // Same box the footer's kebab menu uses (NoteDetailScreen's own
    // FooterPopover call), since the web says this menu mirrors it.
    FooterPopover(
        width = 220.dp,
        gap = 8.dp,
        cornerRadius = 8.dp,
        elevation = 10.dp,
        background = if (dark) MenuBgDark else Color.White,
        borderColor = if (dark) Color.White.copy(alpha = 0.12f) else Color.Black.copy(alpha = 0.10f),
        onDismiss = onDismiss,
    ) {
        Column {
            AddImageMenuRow(
                label = stringResource(R.string.native_add_an_image),
                tint = if (dark) MenuBlueDark else MenuBlueLight,
                dark = dark,
                onClick = { onAddImage(); onDismiss() },
            ) { tint -> AddImageIcon(size = 16.dp, tint = tint) }
            AddImageMenuRow(
                label = stringResource(
                    if (hasIcon) R.string.native_replace_logo else R.string.native_add_logo,
                ),
                tint = if (dark) MenuVioletDark else MenuVioletLight,
                dark = dark,
                onClick = { onAddIcon(); onDismiss() },
            ) { tint -> LogoIcon(size = 16.dp, tint = tint) }
            if (hasIcon) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 2.dp)
                        .topHairline(if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.08f)),
                )
                AddImageMenuRow(
                    label = stringResource(R.string.native_remove_logo),
                    tint = if (dark) MenuRedDark else MenuRedLight,
                    dark = dark,
                    onClick = { onRemoveIcon(); onDismiss() },
                ) { tint -> TrashIcon(size = 16.dp, tint = tint) }
            }
        }
    }
}

@Composable
private fun AddImageMenuRow(
    label: String,
    tint: Color,
    dark: Boolean,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        icon(tint)
        Text(label, color = tint, fontSize = 14.sp)
    }
}

/**
 * LogoPickerPopover.jsx: every logo in the account's library as a tile,
 * the one this note already uses ringed, a dashed "+" tile that opens the
 * photo picker, and a small x on each tile that drops it from the library
 * (notes already pointing at it keep their own copy).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LogoPickerPopover(
    logos: List<LogoDto>,
    selectedSrc: String?,
    dark: Boolean,
    onPick: (LogoDto) -> Unit,
    onUploadNew: () -> Unit,
    onDelete: (LogoDto) -> Unit,
    onDismiss: () -> Unit,
) {
    val accent = if (dark) MenuVioletDark else MenuVioletLight
    val tileBorder = if (dark) Color.White.copy(alpha = 0.12f) else Color.Black.copy(alpha = 0.12f)
    FooterPopover(
        width = 248.dp,
        gap = 8.dp,
        background = if (dark) MenuBgDark else Color.White,
        borderColor = if (dark) Color.White.copy(alpha = 0.12f) else Color.Black.copy(alpha = 0.10f),
        onDismiss = onDismiss,
    ) {
        Column(Modifier.padding(12.dp)) {
            if (logos.isEmpty()) {
                Text(
                    stringResource(R.string.native_no_logos_yet),
                    color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                    fontSize = 12.sp,
                )
                Spacer(Modifier.size(8.dp))
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (logo in logos) {
                    Box {
                        val selected = logo.src == selectedSrc
                        Box(
                            modifier = Modifier
                                .size(52.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .border(
                                    width = if (selected) 2.dp else 1.dp,
                                    color = if (selected) accent else tileBorder,
                                    shape = RoundedCornerShape(12.dp),
                                )
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { onPick(logo) }
                                .padding(6.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            rememberDecodedImage(logo.src)?.let { bitmap ->
                                Image(
                                    bitmap = bitmap,
                                    contentDescription = logo.name.ifBlank {
                                        stringResource(R.string.native_note_icon)
                                    },
                                    contentScale = ContentScale.Fit,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                        val deleteLabel = stringResource(R.string.native_delete_logo)
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .size(18.dp)
                                .clip(CircleShape)
                                .background(if (dark) MenuRedDark else MenuRedLight)
                                .gkTooltip(deleteLabel)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { onDelete(logo) },
                            contentAlignment = Alignment.Center,
                        ) {
                            CloseIcon(size = 12.dp, tint = Color.White)
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .dashedBorder(tileBorder, RoundedCornerShape(12.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onUploadNew() },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("+", color = accent, fontSize = 22.sp, fontWeight = FontWeight.Light)
                }
            }
        }
    }
}
