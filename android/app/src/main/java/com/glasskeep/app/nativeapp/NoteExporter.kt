package com.glasskeep.app.nativeapp

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

/**
 * Exports a text note as a .md file and hands it to the system share
 * sheet, same content:// + FileProvider pattern UpdateInstaller.kt already
 * uses for the self-updater, so no storage permission is needed.
 *
 * Text-only for now: it takes the plain body NoteDetailScreen already
 * computed for editing (edit.bodyPlainText), not the raw NoteDto, so it
 * has no content-parsing of its own to keep in sync with NoteContent.kt.
 * Matches the shape of the web app's own mdForDownload() for a text note
 * (# title, blank line, body) minus tags, which native has no data layer
 * for yet.
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
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, filename)
        return try {
            file.writeText(markdown)
            val authority = "${context.packageName}.fileprovider"
            val uri = FileProvider.getUriForFile(context, authority, file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/markdown"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(Intent.createChooser(intent, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: Exception) {
            NativeDebug.e("NoteExporter.exportText failed", e)
            false
        }
    }

    // Same replacement set as sanitizeFilename() in src/utils/helpers.js.
    private fun sanitizeFilename(name: String): String =
        name.trim().replace(Regex("[/\\\\?%*:|\"<>]"), "-").take(64)
}
