package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.NotesRepository

/** Archived notes, via the shared SecondaryNotesScreen shell. See that
 *  composable's own doc comment for why this isn't Room-backed. */
@Composable
fun ArchivedNotesScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onOpenNote: (String) -> Unit,
    onBack: () -> Unit,
) {
    SecondaryNotesScreen(
        container = container,
        serverUrl = serverUrl,
        title = stringResource(R.string.native_archived_title),
        emptyMessage = stringResource(R.string.native_archived_empty),
        errorTemplate = stringResource(R.string.native_archived_error),
        fetchNotes = NotesRepository::fetchArchivedNotes,
        onOpenNote = onOpenNote,
        onBack = onBack,
        capabilities = setOf(
            SecondaryBulkCapability.UNARCHIVE,
            SecondaryBulkCapability.TRASH,
            SecondaryBulkCapability.COLOR,
        ),
    )
}
