package com.glasskeep.app.nativeapp.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.NoteImageData
import com.glasskeep.app.ui.Indigo

/**
 * Content-image grid + "add image" row, matching ModalImagesGrid.jsx's own
 * layout rule exactly: a single image goes full width, two or more wrap
 * two per row. Note icons aren't part of this: they're a separate
 * per-user, per-note feature server-side (its own table and endpoints),
 * not a native feature yet, see NoteImages.kt.
 */
@Composable
fun NoteImagesSection(
    images: List<NoteImageData>,
    subtextColor: Color,
    enabled: Boolean,
    onImageClick: (Int) -> Unit,
    onAddClick: () -> Unit,
) {
    Column {
        if (images.isNotEmpty()) {
            if (images.size == 1) {
                NoteImageThumbnail(
                    image = images[0],
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 300.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onImageClick(0) },
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    images.chunked(2).forEachIndexed { rowIndex, pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            pair.forEachIndexed { colIndex, image ->
                                val index = rowIndex * 2 + colIndex
                                NoteImageThumbnail(
                                    image = image,
                                    modifier = Modifier
                                        .weight(1f)
                                        .heightIn(max = 180.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .clickable(
                                            interactionSource = remember { MutableInteractionSource() },
                                            indication = null,
                                            role = Role.Button,
                                        ) { onImageClick(index) },
                                )
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onAddClick() }
                .padding(vertical = 8.dp),
        ) {
            PlusIcon(size = 16.dp, tint = if (enabled) Indigo else subtextColor)
            Spacer(Modifier.width(10.dp))
            Text(
                stringResource(R.string.native_note_detail_add_image),
                color = if (enabled) Indigo else subtextColor,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun NoteImageThumbnail(image: NoteImageData, modifier: Modifier = Modifier) {
    val bitmap = rememberDecodedImage(image.src)
    Box(modifier.background(Color.Black.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap,
                contentDescription = image.name.ifBlank { null },
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

/**
 * Fullscreen lightbox: matches FullscreenImageViewer.jsx's own controls
 * (close, download, remove, prev/next, name + index/total caption).
 * Closes itself once the last image is removed instead of showing an
 * empty viewer.
 */
@Composable
fun FullscreenImageViewer(
    images: List<NoteImageData>,
    initialIndex: Int,
    removeEnabled: Boolean,
    onClose: () -> Unit,
    onRemove: (NoteImageData) -> Unit,
    onDownload: (NoteImageData) -> Unit,
) {
    var index by remember { mutableStateOf(initialIndex.coerceIn(0, (images.size - 1).coerceAtLeast(0))) }

    LaunchedEffect(images.size) {
        if (images.isEmpty()) {
            onClose()
        } else if (index >= images.size) {
            index = images.size - 1
        }
    }
    if (images.isEmpty()) return

    val current = images[index]
    val closeLabel = stringResource(R.string.native_note_detail_image_close)
    val downloadLabel = stringResource(R.string.native_note_detail_image_download)
    val removeLabel = stringResource(R.string.native_note_detail_image_remove)
    val prevLabel = stringResource(R.string.native_note_detail_image_previous)
    val nextLabel = stringResource(R.string.native_note_detail_image_next)

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.94f))) {
            NoteImageThumbnail(
                image = current,
                modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 64.dp),
            )

            Row(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp, alignment = Alignment.End),
            ) {
                ViewerIconButton(contentDescription = downloadLabel, onClick = { onDownload(current) }) {
                    DownloadIcon(size = 20.dp, tint = Color.White)
                }
                ViewerIconButton(
                    contentDescription = removeLabel,
                    enabled = removeEnabled,
                    onClick = { onRemove(current) },
                ) {
                    TrashIcon(size = 20.dp, tint = Color.White)
                }
                ViewerIconButton(contentDescription = closeLabel, onClick = onClose) {
                    CloseIcon(size = 20.dp, tint = Color.White)
                }
            }

            if (images.size > 1) {
                ViewerIconButton(
                    contentDescription = prevLabel,
                    onClick = { index = (index - 1 + images.size) % images.size },
                    modifier = Modifier.align(Alignment.CenterStart).padding(start = 8.dp),
                ) {
                    BackArrowIcon(size = 22.dp, tint = Color.White)
                }
                ViewerIconButton(
                    contentDescription = nextLabel,
                    onClick = { index = (index + 1) % images.size },
                    modifier = Modifier.align(Alignment.CenterEnd).padding(end = 8.dp),
                ) {
                    BackArrowIcon(size = 22.dp, tint = Color.White, modifier = Modifier.rotate(180f))
                }
            }

            Column(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (current.name.isNotBlank()) {
                    Text(current.name, color = Color.White, fontSize = 13.sp)
                }
                if (images.size > 1) {
                    Text(
                        "${index + 1}/${images.size}",
                        color = Color.White.copy(alpha = 0.7f),
                        fontSize = 12.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun ViewerIconButton(
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .size(40.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(Color.White.copy(alpha = 0.12f))
            .semantics { this.contentDescription = contentDescription }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

@Composable
private fun rememberDecodedImage(dataUrl: String): ImageBitmap? = remember(dataUrl) {
    try {
        val base64 = dataUrl.substringAfter("base64,", "")
        if (base64.isEmpty()) return@remember null
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    } catch (t: Throwable) {
        NativeDebug.e("Failed to decode note image", t)
        null
    }
}
