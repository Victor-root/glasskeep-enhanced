package com.glasskeep.app.nativeapp

import android.content.Context
import android.content.Intent
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File

/**
 * Exports a text note as a .md file, or a note image, and hands either to
 * the system share sheet, same content:// + FileProvider pattern
 * UpdateInstaller.kt already uses for the self-updater, so no storage
 * permission is needed.
 *
 * exportText() is text-only: it takes the plain body NoteDetailScreen
 * already computed for editing (edit.bodyPlainText), not the raw NoteDto,
 * so it has no content-parsing of its own to keep in sync with
 * NoteContent.kt. Matches the shape of the web app's own mdForDownload()
 * for a text note (# title, blank line, body) minus tags: exporting those
 * too would mean guessing at a Markdown convention the web export itself
 * doesn't use for tags, not a native data-layer gap.
 */
object NoteExporter {
    fun exportText(context: Context, title: String, body: String): Boolean {
        val markdown = buildString {
            if (title.isNotBlank()) {
                append("# ").append(title).append("\n\n")
            }
            append(body)
        }
        val filename = sanitizeFilename(title.ifBlank { "note" }) + ".md"
        return exportTextFile(context, filename, markdown, "text/markdown")
    }

    /** Any already-named text file (the account export, the recovery key):
     *  the share sheet is this app's answer to the browser download the
     *  web's own downloadText()/triggerJSONDownload() start. */
    fun exportTextFile(context: Context, filename: String, content: String, mimeType: String): Boolean {
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, filename)
        return try {
            file.writeText(content)
            shareFile(context, file, mimeType)
            true
        } catch (e: Exception) {
            NativeDebug.e("NoteExporter.exportTextFile failed for $filename", e)
            false
        }
    }

    /** dataUrl is a note image's own `src` field: "data:image/jpeg;base64,...".
     *  displayName is the image's own `name` field (may be blank/absent on
     *  older data), used for the shared filename when it looks usable. */
    fun exportImage(context: Context, dataUrl: String, displayName: String): Boolean {
        val match = Regex("^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$", RegexOption.DOT_MATCHES_ALL).find(dataUrl)
        if (match == null) {
            NativeDebug.e("NoteExporter.exportImage: not a data: image URL")
            return false
        }
        val (mimeType, base64Payload) = match.destructured
        val extension = mimeType.substringAfter('/').lowercase().let { if (it == "jpg") "jpeg" else it }
        val baseName = displayName.substringBeforeLast('.').ifBlank { "image" }
        val filename = "${sanitizeFilename(baseName)}.$extension"
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, filename)
        return try {
            file.writeBytes(Base64.decode(base64Payload, Base64.DEFAULT))
            shareFile(context, file, mimeType)
            true
        } catch (e: Exception) {
            NativeDebug.e("NoteExporter.exportImage failed", e)
            false
        }
    }

    private fun shareFile(context: Context, file: File, mimeType: String) {
        val authority = "${context.packageName}.fileprovider"
        val uri = FileProvider.getUriForFile(context, authority, file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // Same replacement set as sanitizeFilename() in src/utils/helpers.js.
    fun sanitizeFilename(name: String): String =
        name.trim().replace(Regex("[/\\\\?%*:|\"<>]"), "-").take(64)
}
