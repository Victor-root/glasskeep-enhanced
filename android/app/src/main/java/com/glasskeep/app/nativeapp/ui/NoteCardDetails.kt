package com.glasskeep.app.nativeapp.ui

import android.util.LruCache
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.glasskeep.app.nativeapp.data.MarkdownDoc
import com.glasskeep.app.nativeapp.data.NoteContent
import com.glasskeep.app.nativeapp.data.NoteImages
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.CollaboratorDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
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

/** The top-level nodes of a text note a card previews. */
internal const val CardPreviewNodes = 8

/** How many notes' previews are kept. */
private const val CardPreviewEntries = 1024

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

/** Text as NoteCard.jsx previews it: a rich document through its first
 *  [maxNodes] top-level nodes, else Markdown cut at 350 characters with
 *  its blank lines kept as spacer lines; nothing without any text. */
internal fun cardPreviewBlocks(content: String, maxNodes: Int = Int.MAX_VALUE): List<RichBlock> {
    if (content.isEmpty()) return emptyList()
    RichDoc.parsePreview(content, maxNodes)?.let { return it }
    val raw = NoteContent.parseRichDoc(content)?.let { NoteContent.docToPlainText(it) } ?: content
    if (raw.isBlank()) return emptyList()
    val source = if (raw.length > 350) raw.take(350).trimEnd() + "…" else raw
    return MarkdownDoc.toRichBlocks(source, keepBlankLines = true)
}

/**
 * Reads each card's [CardDetail], a few at a time so a long list does not
 * hold every note's payload in memory at once while the app starts, and
 * remembers what it read for the note's current version: a card built again
 * (the search cleared, a view switched) draws at once at its final height.
 * Thumbnails are decoded no bigger than a card draws them. A text note's
 * preview is derived once per body, ahead of its card when [warm] has had
 * the time.
 */
internal class CardDetails(private val repository: NotesRepository, density: Density) {
    private val gate = Semaphore(CardDetailLoads)
    private val maxImageWidthPx = with(density) { ReadingColumnMaxWidth.roundToPx() }
    private val maxImageHeightPx = with(density) { CardImageMaxHeight.roundToPx() }
    private val reads = object : LruCache<String, Known>((Runtime.getRuntime().maxMemory() / 16).toInt()) {
        override fun sizeOf(key: String, value: Known): Int = value.detail.bytes
    }

    private val previews = LruCache<String, Preview>(CardPreviewEntries)

    @Volatile
    private var generation = 0

    private class Preview(val content: String, val blocks: List<RichBlock>)

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

    fun preview(note: NoteEntity): List<RichBlock> {
        previews.get(note.id)?.takeIf { it.content == note.content }?.let { return it.blocks }
        return cardPreviewBlocks(note.content, CardPreviewNodes).also { previews.put(note.id, Preview(note.content, it)) }
    }

    /** Derives the previews of [notes] ahead of their cards, off the main thread. */
    suspend fun warm(notes: List<NoteEntity>) = withContext(Dispatchers.Default) {
        for (note in notes) {
            ensureActive()
            if (note.type !in TypedPreviews) preview(note)
        }
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
