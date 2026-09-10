package com.glasskeep.app.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NoteExporter
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.LogoDto
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.network.NoteIconDto
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
 * The three note states share one Room table but use disjoint queries, so
 * this screen paints its cached archive/trash immediately, works offline,
 * and reacts to queued restore/delete operations while a network refresh
 * reconciles that cache in the background.
 */
@Composable
fun SecondaryNotesScreen(
    container: NativeAppContainer,
    serverUrl: String,
    title: String,
    emptyMessage: String,
    errorTemplate: String,
    fetchNotes: suspend (NotesRepository) -> List<NoteDto>,
    observeNotes: (NotesRepository) -> Flow<List<NoteEntity>>,
    onOpenNote: (String) -> Unit,
    onOpenSideBySide: ((String, String) -> Unit)? = null,
    onBack: () -> Unit,
    capabilities: Set<SecondaryBulkCapability> = emptySet(),
) {
    val dark = LocalGkDark.current
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val toasts = LocalGkToasts.current

    var notes by remember { mutableStateOf<List<NoteEntity>>(emptyList()) }
    val cachedNotes by observeNotes(repository).collectAsState(initial = emptyList())
    // The header still exposes the web's global pending-sync state. The
    // per-card spinner was the non-web indicator removed below.
    val pendingSyncNoteIds by repository.observePendingSyncNoteIds().collectAsState(initial = emptySet())
    val syncingCount = remember(pendingSyncNoteIds, notes) { notes.count { it.id in pendingSyncNoteIds } }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var selectionMode by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showBulkTrashConfirm by remember { mutableStateOf(false) }
    var showBulkDeleteConfirm by remember { mutableStateOf(false) }
    var showBulkColorPicker by remember { mutableStateOf(false) }
    var showBulkLogoPicker by remember { mutableStateOf(false) }
    var bulkLogos by remember { mutableStateOf<List<LogoDto>>(emptyList()) }
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
                fetchNotes(repository)
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
    val logoLabel = stringResource(R.string.native_add_logo)
    val exportZipLabel = stringResource(R.string.native_bulk_export_zip)
    val selectAllLabel = stringResource(R.string.native_bulk_select_all)
    val sideBySideLabel = stringResource(R.string.native_bulk_side_by_side)
    val deselectAllLabel = stringResource(R.string.native_bulk_deselect_all)
    val bulkIconSuccessTemplate = stringResource(R.string.native_bulk_icon_success)
    val bulkIconErrorTemplate = stringResource(R.string.native_bulk_icon_error)
    val bulkExportSuccess = stringResource(R.string.native_bulk_export_success)
    val bulkExportError = stringResource(R.string.native_bulk_export_error)

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

    fun toggleSelectAll() {
        val visibleIds = notes.mapTo(linkedSetOf()) { it.id }
        if (visibleIds.isEmpty()) return
        selectedIds = if (visibleIds.all { it in selectedIds }) selectedIds - visibleIds else selectedIds + visibleIds
    }

    fun bulkSetIcon(icon: NoteIconDto) {
        showBulkLogoPicker = false
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds.toList()
        scope.launch {
            var failed = 0
            for (id in ids) {
                try {
                    repository.setNoteIcon(id, icon.copy(id = java.util.UUID.randomUUID().toString()))
                } catch (t: Throwable) {
                    NativeDebug.e("Secondary bulk icon failed for note $id", t)
                    failed++
                }
            }
            bulkActionRunning = false
            if (failed == 0) toasts.success(String.format(bulkIconSuccessTemplate, ids.size))
            else toasts.error(String.format(bulkIconErrorTemplate, failed))
        }
    }

    fun openBulkLogoPicker() {
        showBulkLogoPicker = true
        scope.launch {
            try {
                bulkLogos = repository.fetchLogos()
            } catch (t: Throwable) {
                NativeDebug.e("Secondary bulk logo library load failed", t)
            }
        }
    }

    fun bulkExportZip() {
        if (bulkActionRunning || selectedIds.isEmpty()) return
        val chosen = notes.filter { it.id in selectedIds }
        bulkActionRunning = true
        scope.launch {
            val ok = withContext(Dispatchers.IO) { NoteExporter.exportNotesZip(context, chosen) }
            bulkActionRunning = false
            if (ok) toasts.success(bulkExportSuccess) else toasts.error(bulkExportError)
        }
    }

    val bulkLogoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        val picked = uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val dataUrl = withContext(Dispatchers.IO) { ImageCompression.compressToDataUrl(context, picked) }
                    ?: return@launch
                val name = ImageCompression.displayNameFor(context, picked) ?: ""
                val logo = repository.createLogo(name, dataUrl)
                bulkLogos = repository.fetchLogos()
                bulkSetIcon(NoteIconDto(id = logo?.id, src = logo?.src ?: dataUrl, name = logo?.name ?: name))
            } catch (t: Throwable) {
                NativeDebug.e("Secondary bulk logo upload failed", t)
                toasts.error(String.format(bulkIconErrorTemplate, selectedIds.size))
            }
        }
    }

    LaunchedEffect(serverUrl) { refresh() }
    LaunchedEffect(cachedNotes) { notes = cachedNotes }

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
                    columns = StaggeredGridCells.Fixed(if (container.shellPrefs.listView) 1 else 2),
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
                        )
                    }
                }
            }
        }

        if (selectionMode) {
            val allSelected = notes.isNotEmpty() && notes.all { it.id in selectedIds }
            val actions = buildList {
                onOpenSideBySide?.let { openCompare ->
                    add(
                        BulkActionButton(
                            label = sideBySideLabel,
                            tone = BulkTone.SLATE,
                            icon = { EyeFilledIcon(size = 18.dp, tint = BulkTone.SLATE.foreground(dark)) },
                            enabled = !bulkActionRunning && selectedIds.size == 2,
                            onClick = {
                                val ids = selectedIds.toList()
                                if (ids.size == 2) openCompare(ids[0], ids[1])
                            },
                        ),
                    )
                }
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
                    add(
                        BulkActionButton(
                            label = logoLabel,
                            tone = BulkTone.CYAN,
                            icon = { LogoIcon(size = 18.dp, tint = BulkTone.CYAN.foreground(dark)) },
                            enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                            onClick = { openBulkLogoPicker() },
                        ),
                    )
                }
                add(
                    BulkActionButton(
                        label = exportZipLabel,
                        tone = BulkTone.GREEN,
                        icon = { DownloadIcon(size = 18.dp, tint = BulkTone.GREEN.foreground(dark)) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        onClick = { bulkExportZip() },
                    ),
                )
                add(
                    BulkActionButton(
                        label = if (allSelected) deselectAllLabel else selectAllLabel,
                        tone = BulkTone.SLATE,
                        icon = { CheckSquareIcon(size = 18.dp, tint = BulkTone.SLATE.foreground(dark)) },
                        enabled = !bulkActionRunning && notes.isNotEmpty(),
                        onClick = { toggleSelectAll() },
                    ),
                )
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

        if (showBulkLogoPicker) {
            BulkLogoPickerDialog(
                logos = bulkLogos,
                dark = dark,
                onPick = { logo -> bulkSetIcon(NoteIconDto(id = logo.id, src = logo.src, name = logo.name)) },
                onUploadNew = {
                    showBulkLogoPicker = false
                    bulkLogoPickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                onDelete = { logo ->
                    scope.launch {
                        if (repository.deleteLogo(logo.id)) bulkLogos = bulkLogos.filterNot { it.id == logo.id }
                    }
                },
                onDismiss = { showBulkLogoPicker = false },
            )
        }
    }
}
