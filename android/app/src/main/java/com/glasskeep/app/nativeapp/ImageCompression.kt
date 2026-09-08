package com.glasskeep.app.nativeapp

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import java.io.ByteArrayOutputStream

/**
 * Ports fileToCompressedDataURL() (src/utils/helpers.js) to Android: resize
 * so the longer side is at most maxDimension (1600px by default, matching
 * the web's own default), encode as JPEG at jpegQuality (85% by default)
 * unless the source actually has real transparency (checked by sampling
 * pixels, not just "does this format support alpha"), in which case PNG.
 * Same reasoning as the web: a data: URL is what the server stores
 * (server/index.js, images_json / avatar_url), so this produces exactly
 * that string, not a file path.
 *
 * Decodes in two passes (bounds only, then a downsampled decode) rather
 * than loading the original at full resolution, standard Android practice
 * for avoiding an OOM on a large photo (BitmapFactory.Options.inSampleSize).
 */
object ImageCompression {
    private const val MAX_DIMENSION = 1600
    private const val JPEG_QUALITY = 85

    /** Returns null if the URI can't be decoded as an image at all (a
     *  malformed/inaccessible pick), never throws. Must be called off the
     *  main thread, this does real disk and CPU work.
     *
     *  [maxDimension]/[jpegQuality] default to the note-image values
     *  (fileToCompressedDataURL's own defaults on the web); a profile
     *  avatar calls this with the web's own smaller avatar-specific pair
     *  (fileToCompressedDataURL(file, 256, 0.85) in SettingsPanel.jsx)
     *  instead, so an avatar never balloons to a full 1600px note image. */
    fun compressToDataUrl(
        context: Context,
        uri: Uri,
        maxDimension: Int = MAX_DIMENSION,
        jpegQuality: Int = JPEG_QUALITY,
    ): String? {
        return try {
            val resolver = context.contentResolver
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
                ?: return null
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

            val sampleSize = computeInSampleSize(bounds.outWidth, bounds.outHeight, maxDimension)
            val decodeOptions = BitmapFactory.Options().apply { inSampleSize = sampleSize }
            val sampled = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, decodeOptions) }
                ?: return null

            val scale = minOf(1f, maxDimension.toFloat() / maxOf(sampled.width, sampled.height))
            val resized = if (scale < 1f) {
                val scaledWidth = (sampled.width * scale).toInt().coerceAtLeast(1)
                val scaledHeight = (sampled.height * scale).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(sampled, scaledWidth, scaledHeight, true)
            } else {
                sampled
            }

            val usePng = resized.hasAlpha() && hasRealTransparency(resized)
            val output = ByteArrayOutputStream()
            if (usePng) {
                resized.compress(Bitmap.CompressFormat.PNG, 100, output)
            } else {
                resized.compress(Bitmap.CompressFormat.JPEG, jpegQuality, output)
            }
            if (resized !== sampled) resized.recycle()
            sampled.recycle()

            val base64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
            val mimeType = if (usePng) "image/png" else "image/jpeg"
            "data:$mimeType;base64,$base64"
        } catch (t: Throwable) {
            NativeDebug.e("ImageCompression.compressToDataUrl failed for uri=$uri", t)
            null
        }
    }

    /** The picked file's own display name (e.g. "photo.jpg"), same as
     *  file.name on the web (used there for alt text and download
     *  filenames). Content picker URIs don't carry a name directly, it has
     *  to be queried; null if the provider doesn't report one. */
    fun displayNameFor(context: Context, uri: Uri): String? {
        return try {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && cursor.moveToFirst()) cursor.getString(nameIndex) else null
            }
        } catch (t: Throwable) {
            NativeDebug.e("ImageCompression.displayNameFor failed for uri=$uri", t)
            null
        }
    }

    /** Largest power-of-two sample size that still leaves both dimensions
     *  at or above maxDimension, so the precise resize pass below only
     *  ever has to scale down, never up. */
    private fun computeInSampleSize(width: Int, height: Int, maxDimension: Int): Int {
        var sampleSize = 1
        var halfWidth = width / 2
        var halfHeight = height / 2
        while (halfWidth / sampleSize >= maxDimension && halfHeight / sampleSize >= maxDimension) {
            sampleSize *= 2
        }
        return sampleSize
    }

    /** Same intent as the web's "sample every 4th byte of the alpha
     *  channel" check: a coarse grid sample instead of every pixel, cheap
     *  even on a large bitmap, good enough to tell "has an actually
     *  transparent pixel" from "alpha channel present but fully opaque". */
    private fun hasRealTransparency(bitmap: Bitmap): Boolean {
        val stepX = (bitmap.width / 64).coerceAtLeast(1)
        val stepY = (bitmap.height / 64).coerceAtLeast(1)
        var y = 0
        while (y < bitmap.height) {
            var x = 0
            while (x < bitmap.width) {
                val alpha = (bitmap.getPixel(x, y) ushr 24) and 0xFF
                if (alpha < 254) return true
                x += stepX
            }
            y += stepY
        }
        return false
    }
}
