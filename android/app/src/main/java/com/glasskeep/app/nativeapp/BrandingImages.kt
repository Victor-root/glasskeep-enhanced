package com.glasskeep.app.nativeapp

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.util.Base64
import java.io.ByteArrayOutputStream
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * The login branding's image helpers from src/utils/helpers.js: the square
 * home-screen icon made from a custom logo, and the two tiny placeholders
 * (mean colour and BlurHash) the login page paints before its background
 * photo arrives. All take and give data URLs; call them off the main
 * thread.
 */
object BrandingImages {
    /** makeSquarePngIcon(): the image contain-fitted and centred on a
     *  [size] square tile of [background], [pad] of each side left as
     *  margin (the maskable safe zone), as a PNG data URL. */
    fun squarePngIcon(dataUrl: String, size: Int = 512, background: Int = Color.WHITE, pad: Float = 0.12f): String? {
        val source = decode(dataUrl) ?: return null
        val tile = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(tile)
        canvas.drawColor(background)
        val inner = size * (1 - 2 * pad)
        val scale = min(inner / source.width, inner / source.height)
        val w = (source.width * scale).roundToInt()
        val h = (source.height * scale).roundToInt()
        val left = ((size - w) / 2f).roundToInt()
        val top = ((size - h) / 2f).roundToInt()
        canvas.drawBitmap(source, null, Rect(left, top, left + w, top + h), Paint(Paint.FILTER_BITMAP_FLAG))
        return "data:image/png;base64," + encodePng(tile)
    }

    /** deriveBackgroundPlaceholders(): the mean colour (#rrggbb) and a 4x3
     *  BlurHash of the image drawn at most 64px wide, or null when it
     *  can't be read. */
    fun backgroundPlaceholders(dataUrl: String): Pair<String, String>? {
        val source = decode(dataUrl) ?: return null
        val scale = min(1f, 64f / max(source.width, source.height))
        val w = max(1, (source.width * scale).roundToInt())
        val h = max(1, (source.height * scale).roundToInt())
        val small = Bitmap.createScaledBitmap(source, w, h, true)
        val pixels = IntArray(w * h)
        small.getPixels(pixels, 0, w, 0, 0, w, h)
        var r = 0L
        var g = 0L
        var b = 0L
        for (pixel in pixels) {
            r += Color.red(pixel)
            g += Color.green(pixel)
            b += Color.blue(pixel)
        }
        val n = pixels.size.toDouble()
        val color = "#%02x%02x%02x".format((r / n).roundToInt(), (g / n).roundToInt(), (b / n).roundToInt())
        return color to blurHash(pixels, w, h, componentsX = 4, componentsY = 3)
    }

    private fun decode(dataUrl: String): Bitmap? = runCatching {
        val bytes = Base64.decode(dataUrl.substringAfter("base64,", ""), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()

    private fun encodePng(bitmap: Bitmap): String {
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    /** The blurhash package's encode(), over ARGB pixels. */
    private fun blurHash(pixels: IntArray, width: Int, height: Int, componentsX: Int, componentsY: Int): String {
        val factors = ArrayList<DoubleArray>(componentsX * componentsY)
        for (y in 0 until componentsY) {
            for (x in 0 until componentsX) {
                val normalisation = if (x == 0 && y == 0) 1.0 else 2.0
                var r = 0.0
                var g = 0.0
                var b = 0.0
                for (i in 0 until width) {
                    for (j in 0 until height) {
                        val basis = normalisation * cos(Math.PI * x * i / width) * cos(Math.PI * y * j / height)
                        val pixel = pixels[i + j * width]
                        r += basis * srgbToLinear(Color.red(pixel))
                        g += basis * srgbToLinear(Color.green(pixel))
                        b += basis * srgbToLinear(Color.blue(pixel))
                    }
                }
                val scale = 1.0 / (width * height)
                factors += doubleArrayOf(r * scale, g * scale, b * scale)
            }
        }
        val dc = factors[0]
        val ac = factors.drop(1)
        val hash = StringBuilder()
        hash.append(encode83(componentsX - 1 + (componentsY - 1) * 9, 1))
        val maximumValue: Double
        if (ac.isNotEmpty()) {
            val actualMaximum = ac.maxOf { it.max() }
            val quantisedMaximum = floor(max(0.0, min(82.0, floor(actualMaximum * 166 - 0.5)))).toInt()
            maximumValue = (quantisedMaximum + 1) / 166.0
            hash.append(encode83(quantisedMaximum, 1))
        } else {
            maximumValue = 1.0
            hash.append(encode83(0, 1))
        }
        hash.append(encode83((linearToSrgb(dc[0]) shl 16) + (linearToSrgb(dc[1]) shl 8) + linearToSrgb(dc[2]), 4))
        for (factor in ac) {
            fun quantise(value: Double): Int =
                floor(max(0.0, min(18.0, floor(signPow(value / maximumValue, 0.5) * 9 + 9.5)))).toInt()
            hash.append(encode83(quantise(factor[0]) * 19 * 19 + quantise(factor[1]) * 19 + quantise(factor[2]), 2))
        }
        return hash.toString()
    }

    private fun srgbToLinear(value: Int): Double {
        val v = value / 255.0
        return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
    }

    private fun linearToSrgb(value: Double): Int {
        val v = max(0.0, min(1.0, value))
        return if (v <= 0.0031308) (v * 12.92 * 255 + 0.5).toInt() else ((1.055 * v.pow(1 / 2.4) - 0.055) * 255 + 0.5).toInt()
    }

    private fun signPow(value: Double, exponent: Double): Double = (if (value < 0) -1.0 else 1.0) * abs(value).pow(exponent)

    private const val Base83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"

    private fun encode83(value: Int, length: Int): String = buildString {
        for (i in 1..length) {
            append(Base83[(value / 83.0.pow(length - i).toInt()) % 83])
        }
    }
}
