package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.NotesRepository

/** Trashed notes, via the shared SecondaryNotesScreen shell. Restoring and
 *  permanently deleting both happen from a trashed note's own detail
 *  screen (see NoteDetailScreen's trashed-aware kebab menu), same as the
 *  web reuses its note modal for the trash view instead of building
 *  separate per-card actions. See SecondaryNotesScreen's own doc comment
 *  for why this isn't Room-backed. */
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
        onOpenNote = onOpenNote,
        onBack = onBack,
    )
}
