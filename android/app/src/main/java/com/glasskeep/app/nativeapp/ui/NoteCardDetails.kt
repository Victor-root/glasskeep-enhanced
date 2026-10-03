package com.glasskeep.app.nativeapp.ui

import android.util.LruCache
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.glasskeep.app.nativeapp.data.NoteImages
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.CollaboratorDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

/** The tallest a thumbnail on a card is drawn (NoteCard.jsx:300). */
internal val CardImageMaxHeight = 200.dp

/** How many thumbnails a card shows (NoteCard.jsx:280). */
private const val CardImageCount = 6

/** How many cards read their note from the phone at once. */
private const val CardDetailLoads = 4

/** What a [CardDetail] weighs beyond its thumbnails, for the cache. */
private const val CardDetailBaseBytes = 1024

internal class CardImage(val name: String, val bitmap: ImageBitmap)

/** What a card shows of its note beyond the list row: the thumbnails of its
 *  first images out of [imageCount], and its collaborators. The note itself,
 *  with every image whole, is let go once this is read. */
@Immutable
internal class CardDetail(
    val images: List<CardImage>,
    val imageCount: Int,
    val collaborators: List<CollaboratorDto>,
    val showCollaborators: Boolean,
) {
    val bytes: Int get() = images.sumOf { it.bitmap.width * it.bitmap.height * 4 } + CardDetailBaseBytes
}

/**
 * Reads each card's [CardDetail], a few at a time so a long list does not
 * hold every note's payload in memory at once while the app starts, and
 * remembers what it read for the note's current version: a card built again
 * (the search cleared, a view switched) draws at once at its final height.
 * Thumbnails are decoded no bigger than a card draws them.
 */
internal class CardDetails(private val repository: NotesRepository, density: Density) {
    private val gate = Semaphore(CardDetailLoads)
    private val maxImageWidthPx = with(density) { ReadingColumnMaxWidth.roundToPx() }
    private val maxImageHeightPx = with(density) { CardImageMaxHeight.roundToPx() }
    private val reads = object : LruCache<String, Known>((Runtime.getRuntime().maxMemory() / 16).toInt()) {
        override fun sizeOf(key: String, value: Known): Int = value.detail.bytes
    }

    @Volatile
    private var generation = 0

    private class Known(val updatedAt: String?, val generation: Int, val detail: CardDetail)

    /** What was read for [note]'s version, current or not: the people on a
     *  note can change without its date, which [load] checks again. */
    fun cached(note: NoteEntity): CardDetail? = reads.get(note.id)?.takeIf { it.updatedAt == note.updatedAt }?.detail

    suspend fun load(note: NoteEntity): CardDetail? {
        val previous = reads.get(note.id)?.takeIf { it.updatedAt == note.updatedAt }
        if (previous != null && previous.generation == generation) return previous.detail
        val startedAt = generation
        val detail = gate.withPermit { withContext(Dispatchers.Default) { readNote(note.id, previous?.detail) } } ?: return null
        reads.put(note.id, Known(note.updatedAt, startedAt, detail))
        return detail
    }

    /** The notes were just read from the server again: what the phone kept
     *  of each is read once more, the thumbnails of an unchanged note aside. */
    fun invalidate() {
        generation++
    }

    private suspend fun readNote(id: String, previous: CardDetail?): CardDetail? {
        val note = repository.cachedNoteDetailOrNull(id) ?: return null
        val collaborators = note.collaborators.orEmpty()
        val showCollaborators = collaborators.isNotEmpty() || note.access != "owner"
        if (previous != null) return CardDetail(previous.images, previous.imageCount, collaborators, showCollaborators)
        val images = NoteImages.parse(note.images)
        val thumbnails = images.take(CardImageCount).mapNotNull { image ->
            decodeDataImageFitting(image.src, maxImageWidthPx, maxImageHeightPx)?.let { CardImage(image.name, it) }
        }
        return CardDetail(thumbnails, images.size, collaborators, showCollaborators)
    }
}
