package com.glasskeep.app.nativeapp.ui

import android.graphics.BitmapFactory
import android.os.Build
import android.util.Base64
import android.view.WindowManager
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.NoteImageData
import kotlinx.coroutines.delay

/** ModalImagesGrid.jsx's `max-height: 360px` on every image. */
private val NoteImageMaxHeight = 360.dp

/**
 * ModalImagesGrid.jsx: a centred, wrapping row of tiles 8px apart, inset
 * 8px at the sides and bottom. One image spans the whole width, more go
 * two per row (`calc(50% - 4px)`), an odd last one centred. A tile is
 * outlined in `--border-light` with a 6px radius and shows its image at
 * the tile's width and its own aspect ratio, capped at 360px tall; two
 * tiles on a row stretch to the taller one, images staying at the top.
 * Nothing at all is drawn when the note has no image. Note icons aren't
 * part of this: they are a separate per-user feature (see NoteImages.kt).
 */
@Composable
fun NoteImagesSection(
    images: List<NoteImageData>,
    borderColor: Color,
    onImageClick: (Int) -> Unit,
) {
    if (images.isEmpty()) return
    val bitmaps = images.map { rememberDecodedImage(it.src) }
    BoxWithConstraints(Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, bottom = 8.dp)) {
        val gap = 8.dp
        val tileWidth = if (images.size == 1) maxWidth else (maxWidth - gap) / 2
        // The image's own height inside a tile's 1px border.
        fun imageHeight(bitmap: ImageBitmap?): Dp {
            if (bitmap == null || bitmap.width == 0) return 0.dp
            return ((tileWidth - 2.dp) * (bitmap.height.toFloat() / bitmap.width)).coerceAtMost(NoteImageMaxHeight)
        }
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(gap),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            images.indices.chunked(if (images.size == 1) 1 else 2).forEach { row ->
                val rowHeight = row.maxOf { imageHeight(bitmaps[it]) } + 2.dp
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    row.forEach { index ->
                        val bitmap = bitmaps[index]
                        Box(
                            modifier = Modifier
                                .width(tileWidth)
                                .height(rowHeight)
                                .clip(RoundedCornerShape(6.dp))
                                .border(1.dp, borderColor, RoundedCornerShape(6.dp))
                                .padding(1.dp),
                            contentAlignment = Alignment.TopCenter,
                        ) {
                            if (bitmap != null) {
                                Image(
                                    bitmap = bitmap,
                                    contentDescription = images[index].name.ifBlank { null },
                                    contentScale = ContentScale.Fit,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(imageHeight(bitmap))
                                        .clickable(
                                            interactionSource = remember { MutableInteractionSource() },
                                            indication = null,
                                            role = Role.Button,
                                        ) { onImageClick(index) },
                                )
                            }
                        }
                    }
                }
            }
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
 * FullscreenImageViewer.jsx on a phone: the note stays visible behind a
 * frosted 30% black scrim, the image at its natural size (at most 92% of
 * the screen, never upscaled) on a white or black backing, the download,
 * remove and close buttons top right, the "i/n" caption top centre, and
 * prev/next circles that fade out 3s after the last touch. Tapping the
 * scrim closes; the viewer closes itself once the last image is removed.
 */
@Composable
fun FullscreenImageViewer(
    images: List<NoteImageData>,
    initialIndex: Int,
    dark: Boolean,
    canRemove: Boolean,
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

    // useModalState.js's mobileNavVisible: shown on every touch, hidden
    // 3s after the last one.
    var navTouches by remember { mutableIntStateOf(0) }
    var navVisible by remember { mutableStateOf(true) }
    LaunchedEffect(navTouches) {
        navVisible = true
        delay(3_000)
        navVisible = false
    }
    val navAlpha by animateFloatAsState(if (navVisible) 1f else 0f, tween(300), label = "viewerNav")

    val current = images[index]
    val closeLabel = stringResource(R.string.native_note_detail_image_close)
    val downloadLabel = stringResource(R.string.native_note_detail_image_download)
    val removeLabel = stringResource(R.string.native_note_detail_image_remove)
    val prevLabel = stringResource(R.string.native_note_detail_image_previous)
    val nextLabel = stringResource(R.string.native_note_detail_image_next)

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        val density = LocalDensity.current
        SideEffect {
            // The web mounts and unmounts the viewer at once: no window
            // animation either way.
            window?.setWindowAnimations(0)
            window?.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            window?.setDimAmount(0.30f)
            // backdrop-blur-md, where the platform can blur what is behind.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                window?.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                window?.attributes = window?.attributes?.apply {
                    blurBehindRadius = with(density) { cssBlur(12.dp).roundToPx() }
                }
            }
        }
        BoxWithConstraints(
            Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { onClose() },
            contentAlignment = Alignment.Center,
        ) {
            val bitmap = rememberDecodedImage(current.src)
            if (bitmap != null) {
                val maxW = maxWidth * 0.92f
                val maxH = maxHeight * 0.92f
                val naturalW = bitmap.width.dp
                val naturalH = bitmap.height.dp
                val scale = minOf(1f, maxW / naturalW, maxH / naturalH)
                val shape = RoundedCornerShape(8.dp)
                Image(
                    bitmap = bitmap,
                    contentDescription = current.name.ifBlank { null },
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .size(naturalW * scale, naturalH * scale)
                        .tailwindShadow2xl(shape)
                        .clip(shape)
                        .background(if (dark) Color.Black else Color.White)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { navTouches++ },
                )
            }

            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.End))
                    .padding(top = 16.dp, end = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ViewerButton(downloadLabel, onClick = { onDownload(current) }) {
                    DownloadIcon(size = 20.dp, tint = Color.White)
                }
                if (canRemove) {
                    ViewerButton(removeLabel, background = Color(0xCCE7000B), onClick = { onRemove(current) }) {
                        TrashSolidIcon(size = 20.dp, tint = Color.White)
                    }
                }
                ViewerButton(closeLabel, onClick = onClose) {
                    CloseIcon(size = 24.dp, tint = Color.White)
                }
            }

            if (images.size > 1) {
                Text(
                    "${index + 1}/${images.size}",
                    color = Color.White,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))
                        .padding(top = 16.dp),
                )
                ViewerNavButton(
                    label = prevLabel,
                    alpha = navAlpha,
                    enabled = navVisible,
                    onClick = { index = (index - 1 + images.size) % images.size; navTouches++ },
                    modifier = Modifier.align(Alignment.CenterStart).padding(start = 16.dp),
                ) {
                    BackArrowIcon(size = 24.dp, tint = Color.White)
                }
                ViewerNavButton(
                    label = nextLabel,
                    alpha = navAlpha,
                    enabled = navVisible,
                    onClick = { index = (index + 1) % images.size; navTouches++ },
                    modifier = Modifier.align(Alignment.CenterEnd).padding(end = 16.dp),
                ) {
                    BackArrowIcon(size = 24.dp, tint = Color.White, modifier = Modifier.rotate(180f))
                }
            }
        }
    }
}

/** The viewer's top-right buttons: `px-3 py-2 rounded-lg`, white 10%. */
@Composable
private fun ViewerButton(
    label: String,
    onClick: () -> Unit,
    background: Color = Color.White.copy(alpha = 0.10f),
    icon: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

/** Prev / next: `p-3 rounded-full`, white 10%, fading with the nav. */
@Composable
private fun ViewerNavButton(
    label: String,
    alpha: Float,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
    icon: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .graphicsLayer { this.alpha = alpha }
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.10f))
            .semantics { contentDescription = label }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(12.dp),
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

// internal, not private: SettingsScreen.kt (same package, different file)
// reuses this to render the account's avatar, same data: URL shape.
@Composable
internal fun rememberDecodedImage(dataUrl: String): ImageBitmap? = remember(dataUrl) {
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
