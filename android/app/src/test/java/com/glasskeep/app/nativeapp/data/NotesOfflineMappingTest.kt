package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.network.CreateNoteRequest
import com.glasskeep.app.nativeapp.data.network.NoteDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class NotesOfflineMappingTest {

    @Test
    fun queuedCreateMaterializesTheSameClientIdAndPayload() {
        val item = Json.parseToJsonElement("""{"id":"item-old","text":"Milk"}""")
        val image = Json.parseToJsonElement("""{"id":"image-old","src":"data:image/png;base64,AA=="}""")
        val request = CreateNoteRequest(
            id = "client-note-id",
            type = "checklist",
            title = "Groceries",
            content = "body",
            color = "blue",
            items = listOf(item),
            tags = listOf("home"),
            images = listOf(image),
            pinned = true,
            position = 42.0,
            timestamp = "2026-09-10T12:00:00.000Z",
            clientUpdatedAt = "2026-09-10T12:00:00.000Z",
        )

        val note = request.toLocalNote(userId = 7)

        assertEquals("client-note-id", note.id)
        assertEquals(7, note.userId)
        assertEquals("checklist", note.type)
        assertEquals(listOf(item), note.items)
        assertEquals(listOf(image), note.images)
        assertEquals(listOf("home"), note.tags)
        assertEquals("owner", note.access)
    }

    @Test
    fun fullDetailCacheRoundTripsImagePayload() {
        val image = Json.parseToJsonElement("""{"id":"image-1","src":"data:image/png;base64,AA=="}""")
        val original = NoteDto(
            id = "note-1",
            userId = 7,
            type = "text",
            title = "Offline",
            content = "Complete content",
            images = listOf(image),
            color = "default",
            timestamp = "2026-09-10T12:00:00.000Z",
            updatedAt = "2026-09-10T12:00:00.000Z",
            clientUpdatedAt = "2026-09-10T12:00:00.000Z",
            access = "write",
        )

        val restored = original.toDetailEntity().toNoteDto()

        assertEquals(original, restored)
    }

    @Test
    fun roomSummaryKeepsArchiveAndTrashStatus() {
        val archived = NoteDto(
            id = "archived-1",
            userId = 7,
            type = "text",
            title = "Archive",
            content = "body",
            color = "default",
            archived = true,
            trashed = false,
            access = "owner",
        ).toEntity()

        assertEquals(true, archived.archived)
        assertEquals(false, archived.trashed)
        assertEquals(true, archived.toOfflineDetail().archived)
    }

    @Test
    fun duplicateRegeneratesEveryObjectIdWithoutChangingSource() {
        val source = listOf(
            Json.parseToJsonElement("""{"id":"old-1","text":"One"}"""),
            Json.parseToJsonElement("""{"id":"old-2","text":"Two"}"""),
        )
        val ids = ArrayDeque(listOf("new-1", "new-2"))

        val copied = regenerateElementIds(source) { ids.removeFirst() }

        assertEquals("new-1", (copied[0] as JsonObject)["id"]?.jsonPrimitive?.content)
        assertEquals("new-2", (copied[1] as JsonObject)["id"]?.jsonPrimitive?.content)
        assertEquals("old-1", (source[0] as JsonObject)["id"]?.jsonPrimitive?.content)
        assertNotEquals(source, copied)
    }
}
