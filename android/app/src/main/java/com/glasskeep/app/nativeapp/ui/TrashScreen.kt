package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.NotesRepository

/** Trashed notes, via the shared SecondaryNotesScreen shell. Restoring and
 *  permanently deleting a single note still happen from that note's own
 *  detail screen too (see NoteDetailScreen's trashed-aware kebab menu,
 *  same as the web reuses its note modal for the trash view); this
 *  screen adds the same two actions in bulk, for several notes at once.
 *  The list is Room-backed and remains browsable offline. */
@Composable
fun TrashScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onOpenNote: (String) -> Unit,
    onBack: () -> Unit,
) {
    SecondaryNotesScreen(
        container = container,
        serverUrl = serverUrl,
        title = stringResource(R.string.native_trash_title),
        emptyMessage = stringResource(R.string.native_trash_empty),
        errorTemplate = stringResource(R.string.native_trash_error),
        fetchNotes = NotesRepository::fetchTrashedNotes,
        observeNotes = NotesRepository::observeTrashedNotes,
        onOpenNote = onOpenNote,
        onBack = onBack,
        capabilities = setOf(
            SecondaryBulkCapability.RESTORE,
            SecondaryBulkCapability.DELETE_PERMANENTLY,
        ),
    )
}
