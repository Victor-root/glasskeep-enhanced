package com.glasskeep.app.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.toEntity
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/** Which bulk actions SecondaryNotesScreen's selection bar offers: the
 *  archived list (UNARCHIVE, TRASH, COLOR) and the trash list (RESTORE,
 *  DELETE_PERMANENTLY) each pass a different subset, mirroring exactly
 *  which actions MultiSelectToolbar.jsx computes per screen (color has
 *  no equivalent in the trash list, pin has none in either: web excludes
 *  it from the archived toolbar and the active-notes-only pin button has
 *  no restore-from-trash / unarchive equivalent to share a slot with
 *  here). */
enum class SecondaryBulkCapability { UNARCHIVE, TRASH, RESTORE, DELETE_PERMANENTLY, COLOR }

/**
 * Shared shell for a read-only, secondary notes list: archived
 * (ArchivedNotesScreen) and trash (TrashScreen) are both this same header
 * (back arrow + title + refresh) and grid over a different server list,
 * reusing the main list's own NoteCard for identical rendering. Opening a
 * card goes through the normal NoteDetailScreen either way, which already
 * knows how to act on an archived or trashed note, this screen's job is
 * only to be a way in.
 *
 * Not backed by Room like the main list: that table only ever holds active
 * notes (see NotesRepository.refresh()), so this fetches fresh on entry and
 * on a manual refresh instead of risking either wiping this list on the
 * next refresh() or leaking these notes into the main grid. One
 * consequence worth knowing: acting on a note from its detail screen (e.g.
 * unarchiving, restoring) and coming back here doesn't drop it from this
 * list automatically, tap Refresh.
 */
@Composable
fun SecondaryNotesScreen(
    container: NativeAppContainer,
    serverUrl: String,
    title: String,
    emptyMessage: String,
    errorTemplate: String,
    fetchNotes: suspend (NotesRepository) -> List<NoteDto>,
    onOpenNote: (String) -> Unit,
    onBack: () -> Unit,
    capabilities: Set<SecondaryBulkCapability> = emptySet(),
) {
    val dark = isSystemInDarkTheme()
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val toasts = LocalGkToasts.current

    var notes by remember { mutableStateOf<List<NoteEntity>>(emptyList()) }
    // Any type, any screen (see SyncQueueDao.observePendingNoteIds's own
    // doc comment): drives the same per-card spinner and header count as
    // NativeNotesListScreen.kt's own.
    val pendingSyncNoteIds by repository.observePendingSyncNoteIds().collectAsState(initial = emptySet())
    val syncingCount = remember(pendingSyncNoteIds, notes) { notes.count { it.id in pendingSyncNoteIds } }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var selectionMode by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showBulkTrashConfirm by remember { mutableStateOf(false) }
    var showBulkDeleteConfirm by remember { mutableStateOf(false) }
    var showBulkColorPicker by remember { mutableStateOf(false) }
    var bulkActionRunning by remember { mutableStateOf(false) }

    val partialFailureTemplate = stringResource(R.string.native_bulk_partial_failure)

    fun exitSelection() {
        selectionMode = false
        selectedIds = emptySet()
    }

    fun refresh() {
        loading = true
        errorMessage = null
        scope.launch {
            try {
                // Merge, don't blind-replace: a note this screen's own bulk
                // actions just optimistically patched (see bulkUnarchive/
                // bulkTrash/bulkRestore/bulkDeletePermanently below) may not
                // be reflected by the server yet if a refresh lands first,
                // same race NoteDao.replaceAll's own protectedIds guards
                // against for the Room-backed main list, reimplemented here
                // over a plain list since this screen has no Room table to
                // delegate to (see this composable's own doc comment).
                val fresh = fetchNotes(repository).map { it.toEntity() }
                val protectedIds = repository.getProtectedNoteIds()
                notes = fresh.filterNot { it.id in protectedIds } + notes.filter { it.id in protectedIds }
            } catch (t: Throwable) {
                NativeDebug.e("SecondaryNotesScreen refresh failed ($title)", t)
                errorMessage = String.format(errorTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                loading = false
            }
        }
    }

    val unarchivedSuccessTemplate = stringResource(R.string.native_bulk_unarchived_success)
    val trashedSuccessTemplate = stringResource(R.string.native_bulk_trashed_success)
    val restoredSuccessTemplate = stringResource(R.string.native_bulk_restored_success)
    val deletedSuccessTemplate = stringResource(R.string.native_bulk_deleted_success)
    val trashConfirmTitle = stringResource(R.string.native_note_detail_trash_confirm_title)
    val trashConfirmBodyText = stringResource(R.string.native_note_detail_trash_confirm_body)
    val trashLabel = stringResource(R.string.native_note_detail_move_to_trash)
    val unarchiveLabel = stringResource(R.string.native_note_detail_unarchive)
    val restoreLabel = stringResource(R.string.native_note_detail_restore)
    val deleteLabel = stringResource(R.string.native_note_detail_delete_permanently)
    val deleteConfirmTitle = stringResource(R.string.native_note_detail_permanent_delete_confirm_title)
    val deleteConfirmBodyText = stringResource(R.string.native_note_detail_permanent_delete_confirm_body)
    val colorLabel = stringResource(R.string.native_note_detail_change_color)

    fun reportOutcome(successTemplate: String, outcome: BulkOutcome) {
        val message = String.format(successTemplate, outcome.succeeded) +
            if (outcome.failed > 0) " " + String.format(partialFailureTemplate, outcome.failed) else ""
        if (outcome.failed > 0) toasts.error(message) else toasts.success(message)
    }

    fun bulkUnarchive() {
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds
        val entities = notes.associateBy { it.id }
        scope.launch {
            val outcome = runBulkAction(context, ids) { id ->
                repository.setArchivedQueued(entities.getValue(id), false)
            }
            notes = notes.filterNot { it.id in outcome.succeededIds }
            bulkActionRunning = false
            reportOutcome(unarchivedSuccessTemplate, outcome)
            exitSelection()
        }
    }

    fun bulkTrash() {
        showBulkTrashConfirm = false
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds
        scope.launch {
            val outcome = runBulkAction(context, ids) { id -> repository.trashNoteQueued(id) }
            notes = notes.filterNot { it.id in outcome.succeededIds }
            bulkActionRunning = false
            reportOutcome(trashedSuccessTemplate, outcome)
            exitSelection()
        }
    }

    fun bulkRestore() {
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds
        val entities = notes.associateBy { it.id }
        scope.launch {
            val outcome = runBulkAction(context, ids) { id ->
                repository.restoreNoteQueued(entities.getValue(id))
            }
            notes = notes.filterNot { it.id in outcome.succeededIds }
            bulkActionRunning = false
            reportOutcome(restoredSuccessTemplate, outcome)
            exitSelection()
        }
    }

    fun bulkDeletePermanently() {
        showBulkDeleteConfirm = false
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds
        scope.launch {
            val outcome = runBulkAction(context, ids) { id -> repository.deleteNotePermanentlyQueued(id) }
            notes = notes.filterNot { it.id in outcome.succeededIds }
            bulkActionRunning = false
            reportOutcome(deletedSuccessTemplate, outcome)
            exitSelection()
        }
    }

    fun bulkColor(colorKey: String) {
        showBulkColorPicker = false
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds
        scope.launch {
            val outcome = runBulkAction(context, ids) { id -> repository.setColorQueued(id, colorKey) }
            notes = notes.map { if (it.id in outcome.succeededIds) it.copy(color = colorKey) else it }
            bulkActionRunning = false
        }
    }

    LaunchedEffect(serverUrl) { refresh() }

    BackHandler(enabled = selectionMode) { exitSelection() }

    val bgModifier = Modifier.background(WorkspaceTheme.appBackground(container.themeState.themeId, dark))
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(WorkspaceTheme.statusBarColor(container.themeState.themeId, dark))
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(horizontal = 10.dp, vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onBack() }
                            .padding(6.dp)
                            .weight(1f),
                    ) {
                        BackArrowIcon(size = 22.dp, tint = titleColor)
                        Text(
                            title,
                            color = titleColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                    if (capabilities.isNotEmpty() && !selectionMode) {
                        val selectLabel = stringResource(R.string.native_notes_select_mode)
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .semantics { contentDescription = selectLabel }
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { selectionMode = true }
                                .padding(8.dp),
                        ) {
                            CheckSquareIcon(size = 18.dp, tint = titleColor)
                        }
                    }
                    // Same cloud sync-status button as the main list's own
                    // header (see NativeNotesListScreen): the web serves all
                    // three views from one NotesHeader, so archived/trash get
                    // the same icon cluster rather than a text link.
                    val refreshLabel = stringResource(R.string.native_notes_refresh)
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .semantics { contentDescription = refreshLabel }
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                enabled = !loading,
                                role = Role.Button,
                            ) { refresh() }
                            .padding(8.dp),
                    ) {
                        when {
                            loading -> CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Indigo, strokeWidth = 2.dp)
                            syncingCount > 0 -> CloudPendingIcon(size = 18.dp, tint = if (dark) Color(0xFFfbbf24) else Color(0xFFd97706))
                            else -> CloudCheckIcon(size = 18.dp, tint = if (dark) Color(0xFF34d399) else Color(0xFF059669))
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(WorkspaceTheme.headerBorderColor(container.themeState.themeId, dark)))
            }

            errorMessage?.let {
                Text(it, color = ErrorColor, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }

            if (notes.isEmpty() && loading) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Indigo)
                }
            } else if (notes.isEmpty() && errorMessage == null) {
                // A non-null errorMessage renders nothing further here: the
                // failure is already shown above, and there's nothing to
                // add by also claiming the list is empty.
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(emptyMessage, color = subtextColor)
                }
            } else if (notes.isNotEmpty()) {
                val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
                LazyVerticalStaggeredGrid(
                    columns = StaggeredGridCells.Fixed(2),
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 16.dp + navBarBottom),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalItemSpacing = 12.dp,
                ) {
                    items(notes, key = { it.id }) { note ->
                        NoteCard(
                            note = note,
                            dark = dark,
                            titleColor = titleColor,
                            subtextColor = subtextColor,
                            onClick = { onOpenNote(note.id) },
                            selectionMode = selectionMode,
                            selected = note.id in selectedIds,
                            onToggleSelect = {
                                selectedIds = if (note.id in selectedIds) selectedIds - note.id else selectedIds + note.id
                            },
                            syncing = note.id in pendingSyncNoteIds,
                        )
                    }
                }
            }
        }

        if (selectionMode) {
            val actions = buildList {
                if (SecondaryBulkCapability.UNARCHIVE in capabilities) {
                    add(
                        BulkActionButton(
                            label = unarchiveLabel,
                            tone = BulkTone.BLUE,
                            icon = { ArchiveIcon(size = 18.dp, tint = BulkTone.BLUE.foreground(dark)) },
                            enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                            onClick = { bulkUnarchive() },
                        ),
                    )
                }
                if (SecondaryBulkCapability.TRASH in capabilities) {
                    add(
                        BulkActionButton(
                            label = trashLabel,
                            tone = BulkTone.RED,
                            icon = { TrashIcon(size = 20.dp, tint = BulkTone.RED.foreground(dark)) },
                            enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                            onClick = { showBulkTrashConfirm = true },
                        ),
                    )
                }
                if (SecondaryBulkCapability.RESTORE in capabilities) {
                    add(
                        BulkActionButton(
                            label = restoreLabel,
                            tone = BulkTone.GREEN,
                            icon = { RefreshIcon(size = 18.dp, tint = BulkTone.GREEN.foreground(dark)) },
                            enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                            onClick = { bulkRestore() },
                        ),
                    )
                }
                if (SecondaryBulkCapability.DELETE_PERMANENTLY in capabilities) {
                    add(
                        BulkActionButton(
                            label = deleteLabel,
                            tone = BulkTone.RED,
                            icon = { TrashIcon(size = 20.dp, tint = BulkTone.RED.foreground(dark)) },
                            enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                            onClick = { showBulkDeleteConfirm = true },
                        ),
                    )
                }
                if (SecondaryBulkCapability.COLOR in capabilities) {
                    add(
                        BulkActionButton(
                            label = colorLabel,
                            tone = BulkTone.VIOLET,
                            icon = { PaletteIcon(size = 18.dp) },
                            enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                            onClick = { showBulkColorPicker = true },
                        ),
                    )
                }
            }
            SelectionActionBar(
                selectedCount = selectedIds.size,
                actions = actions,
                onClose = { exitSelection() },
                dark = dark,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }

        if (showBulkTrashConfirm) {
            ConfirmActionDialog(
                title = trashConfirmTitle,
                body = trashConfirmBodyText,
                confirmLabel = trashLabel,
                confirmColor = Color(0xFFdc2626),
                onConfirm = { bulkTrash() },
                onDismiss = { showBulkTrashConfirm = false },
            )
        }

        if (showBulkDeleteConfirm) {
            ConfirmActionDialog(
                title = deleteConfirmTitle,
                body = deleteConfirmBodyText,
                confirmLabel = deleteLabel,
                confirmColor = Color(0xFFdc2626),
                onConfirm = { bulkDeletePermanently() },
                onDismiss = { showBulkDeleteConfirm = false },
            )
        }

        if (showBulkColorPicker) {
            BulkColorPickerDialog(
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onPick = { colorKey -> bulkColor(colorKey) },
                onDismiss = { showBulkColorPicker = false },
            )
        }
    }
}
