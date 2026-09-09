package com.glasskeep.app.nativeapp.data

import android.content.Context
import android.net.Uri
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeDebug
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.zip.ZipInputStream

/**
 * Reads the files the Data section of Settings accepts and turns them into
 * the note objects POST /api/notes/import expects, port of the web's own
 * useImportExport.js. Pure data work: reading a Uri, parsing, and building
 * JSON. Whoever calls it does the network and the messages.
 *
 * Every one of these must run off the main thread: they read files,
 * unpack archives and re-encode images.
 */
object NoteTransfer {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val IMAGE_EXTENSIONS = Regex("\\.(jpe?g|png|gif|webp|bmp|heic|heif)$", RegexOption.IGNORE_CASE)

    /** Google Keep stores its colours as a fixed enum; this app has its own
     *  palette. Same mapping the web uses (useImportExport.js:71-86), so an
     *  imported note keeps its colour identity. */
    private val GKEEP_COLORS = mapOf(
        "DEFAULT" to "default",
        "WHITE" to "default",
        "RED" to "red",
        "ORANGE" to "peach",
        "YELLOW" to "yellow",
        "GREEN" to "green",
        "TEAL" to "mint",
        "BLUE" to "blue",
        "GRAY" to "default",
        "CERULEAN" to "sky",
        "PURPLE" to "purple",
        "PINK" to "mauve",
        "BROWN" to "sand",
    )

    /** What one import attempt produced: the notes to send, and how many
     *  files were read to get them (the count the "imported N of M"
     *  message needs when the server reports fewer). */
    data class ImportPayload(val notes: JsonArray, val attempted: Int)

    /**
     * A GlassKeep .json export. Text notes whose `content` is still the
     * Markdown of an older export are upgraded to the rich envelope, the
     * way ensureRichContent() does, so an old backup comes back as
     * first-class rich notes; every other field passes through untouched.
     */
    fun readGlassKeepExport(raw: String): ImportPayload? {
        val root = runCatching { json.parseToJsonElement(raw) }.getOrNull() ?: return null
        val notes = when {
            root is JsonObject && root["notes"] is JsonArray -> root["notes"]!!.jsonArray
            root is JsonArray -> root
            else -> return ImportPayload(JsonArray(emptyList()), 0)
        }
        val upgraded = buildJsonArray {
            for (element in notes) {
                val note = element as? JsonObject ?: continue
                val type = note["type"]?.jsonPrimitive?.contentOrNull
                val content = note["content"]?.jsonPrimitive?.contentOrNull
                if (type != "text" || content == null || NoteContent.parseRichDoc(content) != null) {
                    add(note)
                    continue
                }
                add(JsonObject(note + ("content" to JsonPrimitive(richFromMarkdown(content)))))
            }
        }
        return ImportPayload(upgraded, notes.size)
    }

    /**
     * A Google Takeout selection: the .zip itself, or the loose .json
     * metadata files plus the images they reference. Anything that isn't a
     * Keep note (Takeout ships JSON from other products too) is skipped.
     */
    fun readGoogleKeep(context: Context, uris: List<Uri>): ImportPayload {
        val jsonFiles = mutableListOf<String>()
        val imagesByName = mutableMapOf<String, ByteArray>()
        for (uri in uris) {
            val name = displayName(context, uri).orEmpty()
            when {
                name.endsWith(".zip", ignoreCase = true) -> readZip(context, uri, jsonFiles, imagesByName)
                name.endsWith(".json", ignoreCase = true) ->
                    readBytes(context, uri)?.let { jsonFiles.add(it.decodeToString()) }
                IMAGE_EXTENSIONS.containsMatchIn(name) ->
                    readBytes(context, uri)?.let { imagesByName[name.lowercase()] = it }
            }
        }
        val notes = buildJsonArray {
            for (text in jsonFiles) {
                keepNote(text, imagesByName)?.let { add(it) }
            }
        }
        return ImportPayload(notes, notes.size)
    }

    /** One note per .md file. The title comes from a leading `#` heading,
     *  or from the file's own name when there is none. */
    fun readMarkdown(context: Context, uris: List<Uri>): ImportPayload {
        val notes = buildJsonArray {
            for (uri in uris) {
                val text = readBytes(context, uri)?.decodeToString() ?: continue
                val lines = text.split("\n")
                val leadingHeading = lines.firstOrNull()?.trim()?.startsWith("#") == true
                val title = if (leadingHeading) {
                    lines[0].replace(Regex("^#+\\s*"), "").trim()
                } else {
                    displayName(context, uri).orEmpty().replace(Regex("\\.md$", RegexOption.IGNORE_CASE), "")
                }
                val body = lines.drop(if (leadingHeading) 1 else 0).joinToString("\n").trim()
                if (title.isBlank() && body.isBlank()) continue
                add(
                    noteObject(
                        type = "text",
                        title = title,
                        content = richFromMarkdown(body),
                        items = null,
                        tags = emptyList(),
                        images = null,
                        color = "default",
                        pinned = false,
                        position = null,
                        timestamp = nowIso(),
                    ),
                )
            }
        }
        return ImportPayload(notes, notes.size)
    }

    /** The .txt the web writes for a freshly rotated recovery key
     *  (useImportExport.js:429-436), same wording and layout. */
    fun secretKeyFile(key: String, forgotLabel: String, secretLoginLabel: String): String =
        "Glass Keep - Secret Recovery Key\n\n" +
            "Keep this key safe. Anyone with this key can sign in as you.\n\n" +
            "Secret Key:\n$key\n\n" +
            "Instructions:\n" +
            "1) Go to the login page.\n" +
            "2) Click $forgotLabel.\n" +
            "3) Choose \"$secretLoginLabel\" and paste this key.\n"

    /** `glass-keep-notes-<email>-<timestamp>.json`, the web's own name. */
    fun exportFilename(email: String?): String =
        "glass-keep-notes-${email?.takeIf { it.isNotBlank() } ?: "user"}-${fileTimestamp()}"

    fun secretKeyFilename(): String = "glass-keep-secret-key-${fileTimestamp()}.txt"

    private fun keepNote(text: String, imagesByName: Map<String, ByteArray>): JsonObject? {
        val obj = runCatching { json.parseToJsonElement(text) }.getOrNull() as? JsonObject ?: return null
        // Soft filter: a Takeout .zip also carries JSON from Drive,
        // Calendar and the rest. Only what looks like a Keep note is read.
        val keepKeys = listOf(
            "title", "textContent", "listContent", "attachments", "labels",
            "userEditedTimestampUsec", "createdTimestampUsec",
        )
        if (keepKeys.none { it in obj }) return null

        val listContent = (obj["listContent"] as? JsonArray).orEmpty()
        val hasChecklist = listContent.isNotEmpty()
        val title = obj["title"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val usec = obj["userEditedTimestampUsec"]?.jsonPrimitive?.longOrNull
            ?: obj["createdTimestampUsec"]?.jsonPrimitive?.longOrNull
        val millis = usec?.takeIf { it > 0 }?.div(1000) ?: System.currentTimeMillis()

        val items = if (!hasChecklist) null else buildJsonArray {
            for (entry in listContent) {
                val item = entry as? JsonObject ?: continue
                add(
                    buildJsonObject {
                        put("id", UUID.randomUUID().toString())
                        put("text", item["text"]?.jsonPrimitive?.contentOrNull.orEmpty())
                        put("done", item["isChecked"]?.jsonPrimitive?.booleanOrNull ?: false)
                    },
                )
            }
        }
        val tags = (obj["labels"] as? JsonArray).orEmpty().mapNotNull {
            (it as? JsonObject)?.get("name")?.jsonPrimitive?.contentOrNull?.trim()?.takeIf(String::isNotEmpty)
        }
        val images = buildJsonArray {
            for (attachment in (obj["attachments"] as? JsonArray).orEmpty()) {
                val path = (attachment as? JsonObject)?.get("filePath")?.jsonPrimitive?.contentOrNull ?: continue
                val base = path.substringAfterLast('/').lowercase()
                val bytes = imagesByName[base] ?: continue
                val src = ImageCompression.compressToDataUrl(bytes) ?: continue
                add(
                    buildJsonObject {
                        put("id", UUID.randomUUID().toString())
                        put("src", src)
                        put("name", base)
                    },
                )
            }
        }
        val color = obj["color"]?.jsonPrimitive?.contentOrNull
            ?.let { GKEEP_COLORS[it.uppercase()] } ?: "default"
        // Keep's textContent is always plain text, never Markdown: reading
        // it as Markdown would join single line breaks and swallow the
        // blank lines between paragraphs (useImportExport.js:281-284).
        val content = if (hasChecklist) "" else RichDoc.encode(MarkdownDoc.plainTextToRichBlocks(
            obj["textContent"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        ))
        return noteObject(
            type = if (hasChecklist) "checklist" else "text",
            title = title,
            content = content,
            items = items,
            tags = tags,
            images = images,
            color = color,
            pinned = obj["isPinned"]?.jsonPrimitive?.booleanOrNull ?: false,
            position = millis.toDouble(),
            timestamp = isoOf(millis),
        )
    }

    private fun noteObject(
        type: String,
        title: String,
        content: String,
        items: JsonArray?,
        tags: List<String>,
        images: JsonArray?,
        color: String,
        pinned: Boolean,
        position: Double?,
        timestamp: String,
    ): JsonObject = buildJsonObject {
        put("id", UUID.randomUUID().toString())
        put("type", type)
        put("title", title)
        put("content", content)
        put("items", items ?: JsonArray(emptyList()))
        putJsonArray("tags") { tags.forEach { add(it) } }
        put("images", images ?: JsonArray(emptyList()))
        put("color", color)
        put("pinned", pinned)
        position?.let { put("position", it) }
        put("timestamp", timestamp)
    }

    private fun richFromMarkdown(markdown: String): String =
        RichDoc.encode(MarkdownDoc.toRichBlocks(markdown))

    private fun readZip(
        context: Context,
        uri: Uri,
        jsonFiles: MutableList<String>,
        imagesByName: MutableMap<String, ByteArray>,
    ) {
        try {
            context.contentResolver.openInputStream(uri)?.use { stream ->
                ZipInputStream(stream).use { zip ->
                    var entry = zip.nextEntry
                    while (entry != null) {
                        if (!entry.isDirectory) {
                            val name = entry.name.substringAfterLast('/')
                            val lower = name.lowercase()
                            when {
                                lower.endsWith(".json") -> jsonFiles.add(zip.readBytes().decodeToString())
                                IMAGE_EXTENSIONS.containsMatchIn(lower) -> imagesByName[lower] = zip.readBytes()
                            }
                        }
                        zip.closeEntry()
                        entry = zip.nextEntry
                    }
                }
            }
        } catch (t: Throwable) {
            NativeDebug.e("NoteTransfer.readZip failed", t)
        }
    }

    private fun readBytes(context: Context, uri: Uri): ByteArray? = try {
        context.contentResolver.openInputStream(uri)?.use { stream ->
            val out = ByteArrayOutputStream()
            stream.copyTo(out)
            out.toByteArray()
        }
    } catch (t: Throwable) {
        NativeDebug.e("NoteTransfer.readBytes failed for $uri", t)
        null
    }

    private fun displayName(context: Context, uri: Uri): String? =
        ImageCompression.displayNameFor(context, uri) ?: uri.lastPathSegment?.substringAfterLast('/')

    private fun JsonArray?.orEmpty(): JsonArray = this ?: JsonArray(emptyList())

    /** ISO-8601 UTC, the format every timestamp the server stores uses. */
    private fun isoOf(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date(millis))

    private fun nowIso(): String = isoOf(System.currentTimeMillis())

    /** The same colon-free stamp the web puts in a download's filename. */
    private fun fileTimestamp(): String = isoOf(System.currentTimeMillis()).replace(Regex("[:.]"), "-")
}
