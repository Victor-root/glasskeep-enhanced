package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** One note as the AI sees it: flattened to plain text, whatever its
 *  own storage looks like (noteToPlainText, ai.js:30-58). */
@Serializable
data class AiNoteDto(
    val id: String,
    val title: String,
    val content: String,
    val tags: List<String> = emptyList(),
)

/** One turn of a per-note conversation. */
@Serializable
data class AiMessage(val role: String, val content: String)

@Serializable
private data class AiChatRequest(
    val question: String,
    val notes: List<AiNoteDto>,
    val lang: String,
)

@Serializable
data class AiChatResponse(
    val answer: String = "",
    val citedNoteIds: List<String> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class AiNoteChatRequest(
    val note: AiNoteDto,
    val messages: List<AiMessage>,
    val question: String,
    val lang: String,
    val stream: Boolean = true,
)

@Serializable
private data class AiStreamFrame(
    val delta: String? = null,
    val finishReason: String? = null,
    val error: String? = null,
)

/**
 * The two AI calls the app makes, ported from src/ai.js.
 *
 * They do not go through Retrofit like everything else: the per-note
 * chat is a Server-Sent Events stream the answer arrives in piece by
 * piece, which Retrofit's suspend functions cannot express, and the
 * search-bar question can take a model over a minute to answer, well
 * past the shared client's own timeouts. Same reasoning, and the same
 * hand-rolled SSE reader, as RealtimeClient.kt.
 */
class AiClient(private val serverUrl: String, private val tokenStore: TokenStore) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /** The web asks for up to 2 minutes on the search-bar question
     *  (ai.js:112-114); the stream gets no read timeout at all, since
     *  quiet stretches between chunks are normal. */
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    /** "Search or ask the AI": one question against every active note. */
    suspend fun ask(question: String, notes: List<NoteEntity>, language: String): AiChatResponse =
        withContext(Dispatchers.IO) {
            val payload = AiChatRequest(
                question = question,
                notes = notes.map { it.toAiNote() }
                    .filter { it.id.isNotEmpty() && (it.title.isNotBlank() || it.content.isNotBlank()) },
                lang = language,
            )
            val request = post("api/ai/chat", json.encodeToString(AiChatRequest.serializer(), payload), stream = false)
            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    NativeDebug.e("POST /api/ai/chat failed: HTTP ${response.code} $body")
                    return@use AiChatResponse(error = errorOf(body) ?: "HTTP ${response.code}")
                }
                runCatching { json.decodeFromString(AiChatResponse.serializer(), body) }
                    .getOrElse { AiChatResponse(error = it.message) }
            }
        }

    /**
     * The per-note conversation, streamed. [onDelta] is called on the IO
     * thread for every piece of the answer as it arrives; the returned
     * error is null when the whole turn came through.
     *
     * Cancelling the calling coroutine is what the Stop button does: the
     * call is closed and whatever already arrived stays on screen, which
     * is the web's own AbortController behaviour (App.jsx:2806-2810).
     */
    suspend fun askAboutNote(
        note: AiNoteDto,
        history: List<AiMessage>,
        question: String,
        language: String,
        onDelta: (String) -> Unit,
    ): String? = withContext(Dispatchers.IO) {
        val payload = AiNoteChatRequest(note, history, question, language)
        val request = post(
            "api/ai/note-chat",
            json.encodeToString(AiNoteChatRequest.serializer(), payload),
            stream = true,
        )
        val call = client.newCall(request)
        try {
            call.execute().use { response ->
                if (!response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    NativeDebug.e("POST /api/ai/note-chat failed: HTTP ${response.code} $body")
                    return@use errorOf(body) ?: "HTTP ${response.code}"
                }
                val source = response.body?.source() ?: return@use "empty response"
                var frameError: String? = null
                val frame = StringBuilder()
                while (!source.exhausted()) {
                    val line = source.readUtf8Line() ?: break
                    if (line.isNotEmpty()) {
                        frame.appendLine(line)
                        continue
                    }
                    // A blank line closes the frame: read whatever data
                    // lines it carried, then start the next one.
                    frameError = readFrame(frame.toString(), onDelta) ?: frameError
                    frame.setLength(0)
                    if (frameError != null) break
                }
                if (frame.isNotEmpty() && frameError == null) {
                    frameError = readFrame(frame.toString(), onDelta)
                }
                frameError
            }
        } catch (t: CancellationException) {
            call.cancel()
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("AiClient.askAboutNote failed", t)
            t.message ?: t.javaClass.simpleName
        }
    }

    /** Returns the frame's error, if it carried one; feeds [onDelta]
     *  otherwise. `data: [DONE]` simply ends the stream. */
    private fun readFrame(frame: String, onDelta: (String) -> Unit): String? {
        for (rawLine in frame.lineSequence()) {
            val line = rawLine.removeSuffix("\r")
            if (!line.startsWith("data:")) continue
            val data = line.removePrefix("data:").trim()
            if (data.isEmpty() || data == "[DONE]") continue
            val parsed = runCatching { json.decodeFromString(AiStreamFrame.serializer(), data) }.getOrNull()
                ?: continue
            parsed.error?.let { return it }
            parsed.delta?.takeIf { it.isNotEmpty() }?.let(onDelta)
        }
        return null
    }

    private fun post(path: String, body: String, stream: Boolean): Request =
        Request.Builder()
            .url(serverUrl.trimEnd('/') + "/" + path)
            .post(body.toRequestBody("application/json".toMediaType()))
            .header("Accept", if (stream) "text/event-stream" else "application/json")
            .apply { tokenStore.token?.let { header("Authorization", "Bearer $it") } }
            .build()

    private fun errorOf(body: String): String? = runCatching {
        json.decodeFromString(AiChatResponse.serializer(), body).error
    }.getOrNull()?.takeIf { it.isNotBlank() }
}

/** The flat view ai.js builds before sending: a checklist becomes its
 *  own "- [x] item" lines, a drawing only its caption, and a text note
 *  its plain rendering, rich envelope or legacy Markdown alike. */
fun NoteEntity.toAiNote(): AiNoteDto = AiNoteDto(
    id = id,
    title = title,
    content = when (type) {
        "checklist" -> ChecklistPreview.parse(itemsJson)
            .joinToString("\n") { "- ${if (it.done) "[x]" else "[ ]"} ${it.text}" }
        "draw" -> DrawingContent.parse(content)?.text.orEmpty().let(::plainOf)
        else -> plainOf(content)
    },
    tags = TagsJson.parse(tagsJson),
)

/** A rich envelope read as plain text, legacy Markdown left as it is:
 *  contentToPlain()'s two branches (richText.js:250-265). */
private fun plainOf(content: String): String =
    NoteContent.parseRichDoc(content)?.let { NoteContent.docToPlainText(it) } ?: content
