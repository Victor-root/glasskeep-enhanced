package com.glasskeep.app.nativeapp.data

import android.content.Context
import com.glasskeep.app.nativeapp.NativeDebug
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * The per-note AI conversations the user chose to keep, one entry per
 * note. The web puts them in localStorage under `glass-keep-note-ai-<id>`
 * and treats them as a throwaway convenience (App.jsx:2610-2647): the
 * thread is gone on close unless the panel's save button was pressed.
 *
 * Plain SharedPreferences, not the encrypted store: a kept conversation
 * is not a credential, and the notes it discusses are already cached in
 * the clear in Room next to it.
 */
class NoteAiStore(context: Context) {
    private val prefs = context.getSharedPreferences("glasskeep_note_ai", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    private val serializer = ListSerializer(AiMessage.serializer())

    fun load(noteId: String): List<AiMessage> {
        val raw = prefs.getString(key(noteId), null) ?: return emptyList()
        return try {
            json.decodeFromString(serializer, raw)
                .filter { (it.role == "user" || it.role == "assistant") && it.content.isNotEmpty() }
        } catch (t: Throwable) {
            NativeDebug.e("NoteAiStore.load failed for $noteId", t)
            emptyList()
        }
    }

    fun save(noteId: String, messages: List<AiMessage>) {
        try {
            prefs.edit().putString(key(noteId), json.encodeToString(serializer, messages)).apply()
        } catch (t: Throwable) {
            NativeDebug.e("NoteAiStore.save failed for $noteId", t)
        }
    }

    fun remove(noteId: String) {
        prefs.edit().remove(key(noteId)).apply()
    }

    private fun key(noteId: String) = "note-ai-$noteId"
}
