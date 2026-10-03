package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.local.NoteDao
import com.glasskeep.app.nativeapp.data.local.NoteDetailEntity
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.local.SyncQueueDao
import com.glasskeep.app.nativeapp.data.local.SyncQueueEntity
import com.glasskeep.app.nativeapp.data.network.ApiClientFactory
import com.glasskeep.app.nativeapp.data.network.RevalidatingCallFactory
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking
import okhttp3.Cache
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.file.Files

/**
 * A cold start with no way to the server: notes already shown once must
 * still be on screen. Each [startApp] is a fresh process, with a new client
 * and a new disk cache over the same directory, while the databases (the
 * fakes below) keep what the previous run wrote, as they do on the phone.
 * The server is a real local HTTP server, so "unreachable" is a refused
 * connection and not a stubbed exception.
 */
class OfflineColdStartTest {
    private lateinit var server: HttpServer
    private lateinit var baseUrl: String
    private lateinit var cacheDir: File
    private var cache: Cache? = null
    private var serverStopped = false
    private var serverStatus = 200

    private val notesDao = InMemoryNoteDao()
    private val queueDao = InMemorySyncQueueDao()

    @Before
    fun startServer() {
        server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        server.createContext("/api/notes") { exchange ->
            val body = when (exchange.requestURI.path) {
                "/api/notes" -> "[$NOTE_WITH_IMAGE,$PLAIN_NOTE]"
                "/api/notes/$IMAGE_NOTE_ID" -> NOTE_WITH_IMAGE
                else -> null
            }
            if (serverStatus != 200 || body == null) {
                exchange.sendResponseHeaders(if (serverStatus != 200) serverStatus else 404, -1)
            } else {
                val bytes = body.toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
            exchange.close()
        }
        server.start()
        baseUrl = "http://127.0.0.1:${server.address.port}"
        cacheDir = Files.createTempDirectory("notes-http").toFile()
    }

    @After
    fun stopServer() {
        if (!serverStopped) server.stop(0)
        cache?.close()
        cacheDir.deleteRecursively()
    }

    /** A new process: nothing in memory from the previous one. */
    private fun startApp(): NotesRepository {
        cache?.close()
        val fresh = Cache(cacheDir, 10L * 1024 * 1024).also { cache = it }
        val api = ApiClientFactory.create(baseUrl, RevalidatingCallFactory(OkHttpClient(), fresh))
        return NotesRepository(api, notesDao, queueDao, fresh)
    }

    private fun serverBecomesUnreachable() {
        server.stop(0)
        serverStopped = true
    }

    private fun shownIds(repository: NotesRepository): List<String> =
        runBlocking { repository.observeNotes().first() }.map { it.id }

    @Test
    fun notesShownOnceAreShownAgainWhenTheServerIsUnreachable() {
        runBlocking { startApp().refresh() }
        serverBecomesUnreachable()

        val coldStart = startApp()

        assertEquals(setOf(IMAGE_NOTE_ID, PLAIN_NOTE_ID), shownIds(coldStart).toSet())
        assertThrows(IOException::class.java) { runBlocking { coldStart.refresh() } }
        assertEquals(setOf(IMAGE_NOTE_ID, PLAIN_NOTE_ID), shownIds(coldStart).toSet())
    }

    @Test
    fun notesShownOnceAreShownAgainWhenTheServerAnswersAnError() {
        runBlocking { startApp().refresh() }
        serverStatus = 502

        val coldStart = startApp()

        assertThrows(IllegalStateException::class.java) { runBlocking { coldStart.refresh() } }
        assertEquals(setOf(IMAGE_NOTE_ID, PLAIN_NOTE_ID), shownIds(coldStart).toSet())
    }

    @Test
    fun aNoteOpenedOfflineKeepsItsImages() {
        runBlocking { startApp().refresh() }
        serverBecomesUnreachable()

        val note = runBlocking { startApp().fetchNoteDetail(IMAGE_NOTE_ID) }

        assertEquals("Holiday", note.title)
        assertEquals(1, note.images.size)
        assertTrue(note.images.single().toString().contains(IMAGE_DATA_URL))
    }

    @Test
    fun aNoteCreatedOfflineSurvivesAColdStartAndAFailedRefresh() {
        runBlocking { startApp().refresh() }
        serverBecomesUnreachable()
        val created = runBlocking { startApp().createTextNote() }

        val coldStart = startApp()
        assertThrows(IOException::class.java) { runBlocking { coldStart.refresh() } }

        assertTrue(created.id in shownIds(coldStart))
        assertEquals(listOf(created.id), runBlocking { queueDao.getPending() }.map { it.noteId })
    }

    private companion object {
        const val IMAGE_NOTE_ID = "note-with-image"
        const val PLAIN_NOTE_ID = "plain-note"
        const val IMAGE_DATA_URL = "data:image/png;base64,AA=="

        val NOTE_WITH_IMAGE = """
            {"id":"$IMAGE_NOTE_ID","user_id":1,"type":"text","title":"Holiday","content":"Sea",
             "images":[{"id":"image-1","name":"beach.png","src":"$IMAGE_DATA_URL"}],
             "color":"default","access":"owner","updated_at":"2026-09-10T12:00:00.000Z"}
        """.trimIndent()

        val PLAIN_NOTE = """
            {"id":"$PLAIN_NOTE_ID","user_id":1,"type":"text","title":"Shopping","content":"Milk",
             "color":"default","access":"owner","updated_at":"2026-09-11T12:00:00.000Z"}
        """.trimIndent()
    }
}

/** Room's notes tables, kept in memory; the transaction methods are the
 *  real ones from [NoteDao]. */
private class InMemoryNoteDao : NoteDao {
    private val notes = MutableStateFlow<Map<String, NoteEntity>>(emptyMap())
    private val details = mutableMapOf<String, NoteDetailEntity>()

    private fun view(keep: (NoteEntity) -> Boolean): Flow<List<NoteEntity>> = notes.map { all ->
        all.values.filter(keep).sortedWith(
            compareByDescending<NoteEntity> { it.pinned }
                .thenByDescending { it.position }
                .thenByDescending { it.updatedAt.orEmpty() },
        )
    }

    private fun removeWhere(drop: (NoteEntity) -> Boolean) {
        notes.value = notes.value.filterValues { !drop(it) }
    }

    override fun observeAll() = view { !it.archived && !it.trashed }

    override fun observeArchived() = view { it.archived && !it.trashed }

    override fun observeTrashed() = view { it.trashed }

    override suspend fun upsertAll(notes: List<NoteEntity>) {
        this.notes.value = this.notes.value + notes.associateBy { it.id }
    }

    override suspend fun upsertDetails(notes: List<NoteDetailEntity>) {
        details += notes.associateBy { it.noteId }
    }

    override fun observeDetail(id: String): Flow<NoteDetailEntity?> =
        notes.map { all -> if (id in all) details[id] else null }

    override suspend fun getById(id: String) = notes.value[id]

    override suspend fun getDetailById(id: String) = details[id]

    override suspend fun upsert(note: NoteEntity) = upsertAll(listOf(note))

    override suspend fun deleteAllNotes() = removeWhere { true }

    override suspend fun deleteAllDetails() = details.clear()

    override suspend fun deleteNoteById(id: String) = removeWhere { it.id == id }

    override suspend fun deleteDetailById(id: String) {
        details.remove(id)
    }

    override suspend fun deleteMissingActive(keepIds: List<String>) =
        removeWhere { !it.archived && !it.trashed && it.id !in keepIds }

    override suspend fun deleteAllActive() = removeWhere { !it.archived && !it.trashed }

    override suspend fun deleteMissingArchived(keepIds: List<String>) =
        removeWhere { it.archived && !it.trashed && it.id !in keepIds }

    override suspend fun deleteAllArchived() = removeWhere { it.archived && !it.trashed }

    override suspend fun deleteMissingTrashed(keepIds: List<String>) = removeWhere { it.trashed && it.id !in keepIds }

    override suspend fun deleteAllTrashed() = removeWhere { it.trashed }
}

/** The sync queue table, kept in memory. [getProtectedNoteIds] follows the
 *  rule of the real query: every queued change but a reorder, whatever its
 *  state. */
private class InMemorySyncQueueDao : SyncQueueDao {
    private val items = MutableStateFlow<List<SyncQueueEntity>>(emptyList())
    private var lastQueueId = 0L

    override suspend fun findPending(noteId: String, type: String) =
        items.value.firstOrNull { it.noteId == noteId && it.type == type && it.status == SyncQueueEntity.STATUS_PENDING }

    override suspend fun hasQueuedCreate(noteId: String) = items.value.any { it.noteId == noteId && it.type == "CREATE" }

    override suspend fun insert(item: SyncQueueEntity) {
        items.value = items.value + item.copy(queueId = ++lastQueueId)
    }

    override suspend fun replacePayload(queueId: Long, payloadJson: String, createdAt: Long) =
        update(queueId) { it.copy(payloadJson = payloadJson, createdAt = createdAt, attempts = 0, lastError = null) }

    override suspend fun getPending() = items.value.filter { it.status == SyncQueueEntity.STATUS_PENDING }

    override suspend fun delete(queueId: Long) {
        items.value = items.value.filterNot { it.queueId == queueId }
    }

    override suspend fun deleteForNote(noteId: String) {
        items.value = items.value.filterNot { it.noteId == noteId }
    }

    override suspend fun resetFailed(): Int {
        val failed = items.value.count { it.status == SyncQueueEntity.STATUS_FAILED }
        items.value = items.value.map {
            if (it.status == SyncQueueEntity.STATUS_FAILED) {
                it.copy(status = SyncQueueEntity.STATUS_PENDING, attempts = 0, lastError = null)
            } else {
                it
            }
        }
        return failed
    }

    override suspend fun deleteAll() {
        items.value = emptyList()
    }

    override suspend fun recordFailure(queueId: Long, attempts: Int, error: String?) =
        update(queueId) { it.copy(attempts = attempts, lastError = error) }

    override suspend fun markFailed(queueId: Long, attempts: Int, error: String?) =
        update(queueId) { it.copy(status = SyncQueueEntity.STATUS_FAILED, attempts = attempts, lastError = error) }

    override suspend fun getProtectedNoteIds() = items.value
        .filter { it.type != "REORDER" }
        .map { it.noteId }
        .distinct()

    override fun observePendingNoteIds() = items.map { all ->
        all.filter { it.status == SyncQueueEntity.STATUS_PENDING }.map { it.noteId }.distinct()
    }

    override fun observeAll() = items

    private fun update(queueId: Long, change: (SyncQueueEntity) -> SyncQueueEntity) {
        items.value = items.value.map { if (it.queueId == queueId) change(it) else it }
    }
}
