package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.NotesRepository

/** Archived notes, via the shared Room-backed secondary shell. */
@Composable
fun ArchivedNotesScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onOpenNote: (String) -> Unit,
    onOpenSideBySide: (String, String) -> Unit,
    onBack: () -> Unit,
) {
    SecondaryNotesScreen(
        container = container,
        serverUrl = serverUrl,
        title = stringResource(R.string.native_archived_title),
        emptyMessage = stringResource(R.string.native_archived_empty),
        errorTemplate = stringResource(R.string.native_archived_error),
        fetchNotes = NotesRepository::fetchArchivedNotes,
        observeNotes = NotesRepository::observeArchivedNotes,
        onOpenNote = onOpenNote,
        onOpenSideBySide = onOpenSideBySide,
        onBack = onBack,
        capabilities = setOf(
            SecondaryBulkCapability.UNARCHIVE,
            SecondaryBulkCapability.TRASH,
            SecondaryBulkCapability.COLOR,
        ),
    )
}
