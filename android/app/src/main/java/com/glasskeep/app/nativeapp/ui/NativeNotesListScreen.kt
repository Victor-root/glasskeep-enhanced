package com.glasskeep.app.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.SyncState
import com.glasskeep.app.nativeapp.data.AiClient
import com.glasskeep.app.nativeapp.data.ChecklistPreview
import com.glasskeep.app.nativeapp.data.NoteContent
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.TagsJson
import com.glasskeep.app.nativeapp.data.isReminderPast
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.local.SyncQueueEntity
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

// Real web border tokens (--border-light/--border-dark, src/styles/
// globalCSS.js), shared by note cards and the bulk color-picker dialog
// below - both were already drawing from the same value before this,
// just the wrong one (a plain black/white tint instead of these).
private val CardBorderLight = Color(0xFFD1D5DB).copy(alpha = 0.3f)
private val CardBorderDark = Color(0xFF4B5563).copy(alpha = 0.3f)

/**
 * Notes list: the web's own masonry grid with real card previews (text
 * snippet, or the first few unchecked checklist items) - one column or
 * two, depending on the view chosen from the header menu - and a header
 * carrying the app's own branding, same shape as NotesHeader.jsx /
 * NoteCard.jsx on the web side. The one thing that header has and this
 * one does not is the admin cluster (AI search, the admin panel, the
 * instance lock), none of which this app has a surface for.
 */
@Composable
fun NativeNotesListScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onOpenNote: (String) -> Unit,
    onOpenArchived: () -> Unit,
    onOpenTrash: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenQrScanner: () -> Unit,
    onSignedOut: () -> Unit,
) {
    val dark = LocalGkDark.current
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val notes by repository.observeNotes().collectAsState(initial = emptyList())
    // Notes with a queued edit still waiting to reach the server (any
    // type, any screen, see SyncQueueDao.observePendingNoteIds's own doc
    // comment): drives the per-card spinner.
    val pendingSyncNoteIds by repository.observePendingSyncNoteIds().collectAsState(initial = emptySet())
    // The whole queue, for the header's cloud icon and its panel: the set
    // above is per-note, this one is per queued action, which is the
    // number the web's own badge shows.
    val syncQueue by repository.observeSyncQueue().collectAsState(initial = emptyList())
    val syncState = container.syncStatus.state(
        pending = syncQueue.count { it.status == SyncQueueEntity.STATUS_PENDING && it.attempts == 0 },
        retrying = syncQueue.count { it.status == SyncQueueEntity.STATUS_PENDING && it.attempts > 0 },
        failed = syncQueue.count { it.status == SyncQueueEntity.STATUS_FAILED },
    )
    var syncSheetOpen by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    var creatingNote by remember { mutableStateOf(false) }
    var fabOpen by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var searchOpen by remember { mutableStateOf(false) }
    var notificationsOpen by remember { mutableStateOf(false) }
    var unreadNotifications by remember { mutableStateOf(0) }
    var searchQuery by remember { mutableStateOf("") }
    var selectionMode by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showBulkTrashConfirm by remember { mutableStateOf(false) }
    var showBulkColorPicker by remember { mutableStateOf(false) }
    var bulkActionRunning by remember { mutableStateOf(false) }
    var sidebarOpen by remember { mutableStateOf(false) }
    var activeTagFilter by remember { mutableStateOf<String?>(null) }
    var aiAnswer by remember { mutableStateOf<String?>(null) }
    var aiCitedNoteIds by remember { mutableStateOf<List<String>>(emptyList()) }
    var aiLoading by remember { mutableStateOf(false) }
    val aiClient = remember(serverUrl) { AiClient(serverUrl, container.tokenStore) }
    val aiErrorMessage = stringResource(R.string.native_notes_ai_error)
    val scope = rememberCoroutineScope()

    // Tag list + per-tag note count for the drawer (TagSidebar.kt), same
    // "derive from what's already loaded" approach as filteredNotes below:
    // no dedicated tags table/query, just a client-side tally over the
    // notes already observed for this screen.
    val tagCounts = remember(notes) {
        val counts = LinkedHashMap<String, Int>()
        for (note in notes) {
            for (tag in TagsJson.parse(note.tagsJson)) {
                counts[tag] = (counts[tag] ?: 0) + 1
            }
        }
        counts.toList().sortedBy { it.first.lowercase() }
    }

    // Manual drag reorder (see NotesRepository.reorderQueued). Disabled
    // during multi-select (matches the web's own canDrag = !multiMode)
    // and while searching or tag-filtered: filteredNotes is then a subset
    // of notes, and a reorder needs every id in each pinned/unpinned
    // group, not just what's currently visible.
    val reorderEnabled = !selectionMode && searchQuery.isBlank() && activeTagFilter == null
    // Last-reported on-screen bounds per card (see ReorderableNoteCard's
    // onGloballyPositioned), read only at drag-end to hit-test the drop
    // target - doesn't need to be a State, nothing should recompose when
    // it changes.
    val cardBounds = remember { mutableMapOf<String, Rect>() }
    var draggedNoteId by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableStateOf(Offset.Zero) }

    fun endDrag() {
        draggedNoteId = null
        dragOffset = Offset.Zero
    }

    // Web-equivalent swap semantics (see NotesRepository.reorderQueued's
    // own doc comment): the dragged note and whichever OTHER note it's
    // hovering over when released trade places, nothing in between
    // shifts. Hit-testing uses the dragged card's own center (its
    // original bounds offset by the accumulated drag delta), not the
    // exact finger position: simpler to reason about correctly without
    // being able to test this interactively, at the cost of needing a
    // slightly larger movement than the web's own pointer-exact
    // elementFromPoint check before a neighboring card is picked up as
    // the target.
    fun handleDragEnd(id: String) {
        val draggedNote = notes.find { it.id == id }
        val draggedRect = cardBounds[id]
        if (draggedNote == null || draggedRect == null) {
            NativeDebug.d("NativeNotesListScreen reorder: drag end for $id, missing note or bounds")
            endDrag()
            return
        }
        val draggedCenter = Offset(draggedRect.center.x + dragOffset.x, draggedRect.center.y + dragOffset.y)
        val target = notes.firstOrNull { other ->
            other.id != id && other.pinned == draggedNote.pinned && cardBounds[other.id]?.contains(draggedCenter) == true
        }
        if (target == null) {
            NativeDebug.d("NativeNotesListScreen reorder: no drop target for $id")
            endDrag()
            return
        }
        val group = notes.filter { it.pinned == draggedNote.pinned }.toMutableList()
        val fromIndex = group.indexOfFirst { it.id == id }
        val toIndex = group.indexOfFirst { it.id == target.id }
        if (fromIndex == -1 || toIndex == -1) {
            NativeDebug.e("NativeNotesListScreen reorder: $id or ${target.id} missing from its own pinned group, ignoring")
            endDrag()
            return
        }
        NativeDebug.d("NativeNotesListScreen reorder: swap $id <-> ${target.id} (pinned=${draggedNote.pinned})")
        val tmp = group[fromIndex]
        group[fromIndex] = group[toIndex]
        group[toIndex] = tmp
        val pinnedGroup = if (draggedNote.pinned) group else notes.filter { it.pinned }
        val otherGroup = if (draggedNote.pinned) notes.filter { !it.pinned } else group
        scope.launch { repository.reorderQueued(pinnedGroup, otherGroup) }
        endDrag()
    }

    // Client-side only, same fields the web app matches for a note without
    // tags/items/images (title, content): those don't have a native data
    // layer yet (see NoteEntity), so this is narrower than the web's own
    // search until they do.
    val filteredNotes = remember(notes, searchQuery, activeTagFilter) {
        // The drawer's two lenses are not folders: they narrow the list
        // already loaded, and the notes they hide are still in the plain
        // view (App.jsx:7063-7077).
        val byTag = when (activeTagFilter) {
            null -> notes
            SidebarAllImages -> notes.filter { it.hasImages }
            SidebarReminders -> notes.filter { !it.reminderAt.isNullOrBlank() }
            else -> notes.filter { activeTagFilter in TagsJson.parse(it.tagsJson) }
        }
        val q = searchQuery.trim()
        if (q.isEmpty()) byTag
        else byTag.filter { it.title.contains(q, ignoreCase = true) || it.content.contains(q, ignoreCase = true) }
    }

    val errorSyncTemplate = stringResource(R.string.native_notes_error_sync)
    val errorCreateTemplate = stringResource(R.string.native_notes_create_error)
    val archivedSuccessTemplate = stringResource(R.string.native_bulk_archived_success)
    val trashedSuccessTemplate = stringResource(R.string.native_bulk_trashed_success)
    val partialFailureTemplate = stringResource(R.string.native_bulk_partial_failure)
    val trashConfirmTitle = stringResource(R.string.native_note_detail_trash_confirm_title)
    val trashConfirmBodyText = stringResource(R.string.native_note_detail_trash_confirm_body)
    val trashLabel = stringResource(R.string.native_note_detail_move_to_trash)
    val archiveLabel = stringResource(R.string.native_note_detail_archive)
    val pinLabel = stringResource(R.string.native_note_detail_pin)
    val colorLabel = stringResource(R.string.native_note_detail_change_color)
    val lockInstanceFailed = stringResource(R.string.native_lock_instance_failed)
    val context = LocalContext.current
    val toasts = LocalGkToasts.current

    val bgModifier = Modifier.background(WorkspaceTheme.appBackground(themeId, dark))
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) CardBorderDark else CardBorderLight

    fun reportOutcome(successTemplate: String, outcome: BulkOutcome) {
        val message = String.format(successTemplate, outcome.succeeded) +
            if (outcome.failed > 0) " " + String.format(partialFailureTemplate, outcome.failed) else ""
        if (outcome.failed > 0) toasts.error(message) else toasts.success(message)
    }

    fun exitSelection() {
        selectionMode = false
        selectedIds = emptySet()
    }

    fun bulkArchive() {
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds
        val entities = notes.associateBy { it.id }
        scope.launch {
            val outcome = runBulkAction(context, ids) { id ->
                repository.setArchivedQueued(entities.getValue(id), true)
            }
            bulkActionRunning = false
            reportOutcome(archivedSuccessTemplate, outcome)
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
            bulkActionRunning = false
            reportOutcome(trashedSuccessTemplate, outcome)
            exitSelection()
        }
    }

    fun bulkPin() {
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds
        val entities = notes.associateBy { it.id }
        scope.launch {
            runBulkAction(context, ids) { id -> repository.setPinnedQueued(entities.getValue(id), true) }
            bulkActionRunning = false
        }
    }

    fun bulkColor(colorKey: String) {
        showBulkColorPicker = false
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds
        scope.launch {
            runBulkAction(context, ids) { id -> repository.setColorQueued(id, colorKey) }
            bulkActionRunning = false
        }
    }

    /** handleAiSearch() (App.jsx:2826-2851): the whole active list is
     *  sent as context and the server picks what is relevant, so the
     *  question is answered against every note, not the filtered view. */
    fun askAi(question: String) {
        val trimmed = question.trim()
        if (trimmed.length < 3 || aiLoading) return
        aiLoading = true
        aiAnswer = null
        aiCitedNoteIds = emptyList()
        scope.launch {
            val result = aiClient.ask(trimmed, notes, AppLanguage.currentTag())
            if (result.error != null) {
                NativeDebug.e("Notes askAi failed: ${result.error}")
                aiAnswer = aiErrorMessage
                aiCitedNoteIds = emptyList()
            } else {
                aiAnswer = result.answer
                aiCitedNoteIds = result.citedNoteIds
            }
            aiLoading = false
        }
    }

    /** Optimistic like every other preference here: the layout flips at
     *  once and the server is told after, since a failed PATCH only costs
     *  this device's own copy of a display choice. */
    fun toggleViewMode() {
        val next = !container.shellPrefs.listView
        container.shellPrefs.applyListView(next)
        scope.launch {
            try {
                repository.setViewMode(if (next) "list" else "grid")
            } catch (t: Throwable) {
                NativeDebug.e("Notes setViewMode failed", t)
            }
        }
    }

    fun signOut() {
        scope.launch {
            try {
                repository.clearLocalSessionData()
            } catch (t: Throwable) {
                NativeDebug.e("Notes signOut: clearing local data failed", t)
            }
            container.tokenStore.clearSession()
            onSignedOut()
        }
    }

    /** The header menu's admin-only "lock the instance": drop the at-rest
     *  key from the server's RAM so it is locked again right away. The
     *  server broadcasts the lock to every connected client, this device
     *  included, so nothing here has to move the screen itself. */
    fun lockInstance() {
        scope.launch {
            try {
                val response = container.api(serverUrl).lockInstance()
                if (response.isSuccessful) {
                    container.lockState.markLocked()
                } else {
                    NativeDebug.e("Lock instance failed: HTTP ${response.code()}")
                    toasts.error(lockInstanceFailed)
                }
            } catch (t: Throwable) {
                NativeDebug.e("Lock instance network error", t)
                toasts.error(lockInstanceFailed)
            }
        }
    }

    fun refresh() {
        refreshing = true
        errorMessage = null
        // The queue drains alongside the pull, so the cloud icon reads
        // "syncing" for both halves at once, like the web's own
        // _processing || _pulling (syncEngine.js:730).
        container.syncStatus.markSyncing(true)
        SyncQueueWorker.triggerNow(context)
        scope.launch {
            try {
                repository.refresh()
                container.syncStatus.recordReachable(System.currentTimeMillis())
            } catch (t: Throwable) {
                NativeDebug.e("Notes refresh failed", t)
                container.syncStatus.recordUnreachable(t.message ?: t.javaClass.simpleName)
                errorMessage = String.format(errorSyncTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                refreshing = false
                container.syncStatus.markSyncing(false)
            }
        }
    }

    fun createTextNote() {
        if (creatingNote) return
        creatingNote = true
        errorMessage = null
        scope.launch {
            try {
                val note = repository.createTextNote()
                NativeDebug.d("Created text note id=${note.id}")
                onOpenNote(note.id)
            } catch (t: Throwable) {
                NativeDebug.e("Create text note failed", t)
                errorMessage = String.format(errorCreateTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                creatingNote = false
            }
        }
    }

    fun createChecklistNote() {
        if (creatingNote) return
        creatingNote = true
        errorMessage = null
        scope.launch {
            try {
                val note = repository.createChecklistNote()
                NativeDebug.d("Created checklist note id=${note.id}")
                onOpenNote(note.id)
            } catch (t: Throwable) {
                NativeDebug.e("Create checklist note failed", t)
                errorMessage = String.format(errorCreateTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                creatingNote = false
            }
        }
    }

    fun createDrawingNote() {
        if (creatingNote) return
        creatingNote = true
        errorMessage = null
        scope.launch {
            try {
                val note = repository.createDrawingNote()
                NativeDebug.d("Created drawing note id=${note.id}")
                onOpenNote(note.id)
            } catch (t: Throwable) {
                NativeDebug.e("Create drawing note failed", t)
                errorMessage = String.format(errorCreateTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                creatingNote = false
            }
        }
    }

    fun createAudioNote() {
        if (creatingNote) return
        creatingNote = true
        errorMessage = null
        scope.launch {
            try {
                val note = repository.createAudioNote()
                NativeDebug.d("Created audio note id=${note.id}")
                onOpenNote(note.id)
            } catch (t: Throwable) {
                NativeDebug.e("Create audio note failed", t)
                errorMessage = String.format(errorCreateTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                creatingNote = false
            }
        }
    }

    LaunchedEffect(serverUrl) { refresh() }

    // The bell's red dot: how many notifications are still pending, read
    // once on load and again every time the panel closes (opening it is
    // what marks them delivered).
    LaunchedEffect(serverUrl, notificationsOpen) {
        // The floating pill is suppressed for as long as the panel is up,
        // the same way the web hides it behind the notification centre
        // (App.jsx:7933-7935).
        toasts.suppressed = notificationsOpen
        if (notificationsOpen) return@LaunchedEffect
        unreadNotifications = repository.fetchPendingNotifications().size
    }

    BackHandler(enabled = selectionMode) { exitSelection() }

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            NativeHeader(
                dark = dark,
                themeId = themeId,
                titleColor = titleColor,
                subtextColor = subtextColor,
                // The two lenses read as their own names, not as the
                // sentinels they are stored under.
                activeTagLabel = when (activeTagFilter) {
                    null -> null
                    SidebarAllImages -> stringResource(R.string.native_sidebar_all_images)
                    SidebarReminders -> stringResource(R.string.native_sidebar_reminders)
                    else -> activeTagFilter
                },
                activeLens = activeTagFilter?.takeIf { it == SidebarAllImages || it == SidebarReminders },
                syncState = syncState,
                queuedCount = syncQueue.size,
                instanceLocked = container.lockState.isLocked,
                onOpenSyncStatus = { syncSheetOpen = !syncSheetOpen },
                onOpenSidebar = { sidebarOpen = true },
                onOpenSettings = onOpenSettings,
                searchOpen = searchOpen,
                onSearchOpenChange = { open ->
                    searchOpen = open
                    if (!open) searchQuery = ""
                },
                searchQuery = searchQuery,
                onSearchQueryChange = { searchQuery = it },
                onEnterSelection = { selectionMode = true },
                aiAssistantEnabled = container.shellPrefs.aiAssistantEnabled,
                onAskAi = { question -> askAi(question) },
                listView = container.shellPrefs.listView,
                onToggleViewMode = { toggleViewMode() },
                onToggleDark = { container.shellPrefs.toggleDark(dark) },
                onOpenQrScanner = onOpenQrScanner,
                // NotesHeader.jsx:100's own two conditions.
                showLockInstance = container.shellPrefs.isAdmin && container.lockState.status?.enabled == true,
                onLockInstance = { lockInstance() },
                onSignOut = { signOut() },
                notificationsOpen = notificationsOpen,
                hasUnreadNotifications = unreadNotifications > 0,
                onOpenNotifications = { notificationsOpen = !notificationsOpen },
            )

            errorMessage?.let {
                Text(it, color = ErrorColor, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }

            if (aiLoading || aiAnswer != null) {
                AiAnswerCard(
                    answer = aiAnswer,
                    loading = aiLoading,
                    dark = dark,
                    titleColor = titleColor,
                    citedNotes = notes.filter { it.id in aiCitedNoteIds },
                    onOpenNote = onOpenNote,
                    onDismiss = {
                        aiAnswer = null
                        aiCitedNoteIds = emptyList()
                        searchQuery = ""
                    },
                )
            }

            if (notes.isEmpty() && !refreshing && errorMessage == null) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.native_notes_empty), color = subtextColor)
                }
            } else if (filteredNotes.isEmpty() && (searchQuery.isNotBlank() || activeTagFilter != null)) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.native_notes_search_empty), color = subtextColor)
                }
            } else {
                val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
                val pinnedNotes = remember(filteredNotes) { filteredNotes.filter { it.pinned } }
                val otherNotes = remember(filteredNotes) { filteredNotes.filter { !it.pinned } }
                val renderNoteCard: @Composable (NoteEntity) -> Unit = { note ->
                    ReorderableNoteCard(
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
                        reorderEnabled = reorderEnabled,
                        isDragged = note.id == draggedNoteId,
                        dragOffset = if (note.id == draggedNoteId) dragOffset else Offset.Zero,
                        onBoundsChanged = { rect -> cardBounds[note.id] = rect },
                        onDragStart = {
                            NativeDebug.d("NativeNotesListScreen reorder: drag start ${note.id}")
                            draggedNoteId = note.id
                            dragOffset = Offset.Zero
                        },
                        onDragDelta = { delta -> dragOffset += delta },
                        onDragEnd = { handleDragEnd(note.id) },
                        onDragCancel = { endDrag() },
                    )
                }
                // List view is the web's own single, wider column with
                // 24px between cards (NotesSections.jsx:61, `space-y-6`);
                // the grid keeps the masonry pair.
                val listView = container.shellPrefs.listView
                LazyVerticalStaggeredGrid(
                    columns = StaggeredGridCells.Fixed(if (listView) 1 else 2),
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 16.dp + navBarBottom),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalItemSpacing = if (listView) 24.dp else 12.dp,
                ) {
                    if (pinnedNotes.isNotEmpty()) {
                        item(span = StaggeredGridItemSpan.FullLine, key = "section-pinned") {
                            SectionLabel(stringResource(R.string.native_notes_section_pinned), subtextColor)
                        }
                    }
                    items(pinnedNotes, key = { it.id }) { note -> renderNoteCard(note) }
                    if (pinnedNotes.isNotEmpty()) {
                        item(span = StaggeredGridItemSpan.FullLine, key = "section-others") {
                            SectionLabel(stringResource(R.string.native_notes_section_others), subtextColor)
                        }
                    }
                    items(otherNotes, key = { it.id }) { note -> renderNoteCard(note) }
                }
            }
        }

        TagSidebar(
            open = sidebarOpen,
            dark = dark,
            tags = tagCounts,
            activeTag = activeTagFilter,
            onSelectNotes = { activeTagFilter = null; sidebarOpen = false },
            onSelectTag = { tag -> activeTagFilter = tag; sidebarOpen = false },
            onSelectImages = { activeTagFilter = SidebarAllImages; sidebarOpen = false },
            onSelectReminders = { activeTagFilter = SidebarReminders; sidebarOpen = false },
            onOpenArchived = { sidebarOpen = false; onOpenArchived() },
            onOpenTrash = { sidebarOpen = false; onOpenTrash() },
            onClose = { sidebarOpen = false },
        )

        if (selectionMode) {
            SelectionActionBar(
                selectedCount = selectedIds.size,
                actions = listOf(
                    BulkActionButton(
                        label = archiveLabel,
                        tone = BulkTone.BLUE,
                        icon = { ArchiveIcon(size = 18.dp, tint = BulkTone.BLUE.foreground(dark)) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        onClick = { bulkArchive() },
                    ),
                    BulkActionButton(
                        label = trashLabel,
                        tone = BulkTone.RED,
                        icon = { TrashIcon(size = 20.dp, tint = BulkTone.RED.foreground(dark)) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        onClick = { showBulkTrashConfirm = true },
                    ),
                    BulkActionButton(
                        label = pinLabel,
                        tone = BulkTone.AMBER,
                        icon = { PinIcon(size = 18.dp, tint = BulkTone.AMBER.foreground(dark), filled = false) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        onClick = { bulkPin() },
                    ),
                    BulkActionButton(
                        label = colorLabel,
                        tone = BulkTone.VIOLET,
                        icon = { PaletteIcon(size = 18.dp) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        onClick = { showBulkColorPicker = true },
                    ),
                ),
                onClose = { exitSelection() },
                dark = dark,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        } else {
            CreateNoteFab(
                dark = dark,
                open = fabOpen,
                onOpenChange = { fabOpen = it },
                onCreateText = { createTextNote() },
                onCreateChecklist = { createChecklistNote() },
                onCreateDrawing = { createDrawingNote() },
                onCreateAudio = { createAudioNote() },
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

        if (showBulkColorPicker) {
            BulkColorPickerDialog(
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onPick = { colorKey -> bulkColor(colorKey) },
                onDismiss = { showBulkColorPicker = false },
            )
        }

        // The notification centre is a sheet over this screen, not a screen
        // of its own: that is where the web puts it too (it hangs off the
        // bell, the notes stay visible around it).
        NotificationCenter(
            container = container,
            serverUrl = serverUrl,
            open = notificationsOpen,
            dark = dark,
            onOpenNote = { id -> notificationsOpen = false; onOpenNote(id) },
            onDismiss = { notificationsOpen = false },
        )
        SyncStatusSheet(
            container = container,
            serverUrl = serverUrl,
            open = syncSheetOpen,
            dark = dark,
            onDismiss = { syncSheetOpen = false },
            onSyncNow = { refresh() },
        )
    }

    BackHandler(enabled = notificationsOpen) { notificationsOpen = false }
    BackHandler(enabled = syncSheetOpen) { syncSheetOpen = false }
}

@Composable
private fun NativeHeader(
    dark: Boolean,
    themeId: String,
    titleColor: Color,
    subtextColor: Color,
    activeTagLabel: String?,
    /** Which of the drawer's two lenses is on, if either: the header row
     *  shows their own glyph rather than the tag one. */
    activeLens: String?,
    syncState: SyncState,
    queuedCount: Int,
    instanceLocked: Boolean,
    onOpenSyncStatus: () -> Unit,
    onOpenSidebar: () -> Unit,
    onOpenSettings: () -> Unit,
    searchOpen: Boolean,
    onSearchOpenChange: (Boolean) -> Unit,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onEnterSelection: () -> Unit,
    aiAssistantEnabled: Boolean,
    onAskAi: (String) -> Unit,
    listView: Boolean,
    onToggleViewMode: () -> Unit,
    onToggleDark: () -> Unit,
    onOpenQrScanner: () -> Unit,
    showLockInstance: Boolean,
    onLockInstance: () -> Unit,
    onSignOut: () -> Unit,
    notificationsOpen: Boolean,
    hasUnreadNotifications: Boolean,
    onOpenNotifications: () -> Unit,
) {
    // Flat --gk-statusbar fill, no gradient and no blur: header.glass-card's
    // desktop two-gradient-plus-blur look is fully replaced by a flat
    // background under the site's own `pointer: coarse` media query (see
    // src/styles/globalCSS.js) - i.e. on every real phone, which is this
    // app's only target - so this flat fill IS the faithful port, not a
    // simplification of the desktop look. WorkspaceTheme.headerGradient
    // stays in use for TagSidebar's own header row below, for the same
    // reason it never applied here to begin with.
    val accentColor = if (dark) Color(0xFF818cf8) else Color(0xFF4f46e5)
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(WorkspaceTheme.statusBarColor(themeId, dark))
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(horizontal = 10.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (searchOpen) {
                val focusRequester = remember { FocusRequester() }
                val keyboard = LocalSoftwareKeyboardController.current
                val closeSearchLabel = stringResource(R.string.native_notes_search_close)
                SearchIcon(size = 20.dp, tint = subtextColor)
                Spacer(Modifier.width(10.dp))
                Box(modifier = Modifier.weight(1f)) {
                    if (searchQuery.isEmpty()) {
                        Text(
                            stringResource(
                                if (aiAssistantEnabled) R.string.native_notes_search_or_ask
                                else R.string.native_notes_search_placeholder
                            ),
                            color = subtextColor,
                            fontSize = 16.sp,
                        )
                    }
                    BasicTextField(
                        value = searchQuery,
                        onValueChange = onSearchQueryChange,
                        textStyle = TextStyle(color = titleColor, fontSize = 16.sp),
                        singleLine = true,
                        cursorBrush = SolidColor(Indigo),
                        // Enter sends the question rather than just
                        // dismissing the keyboard, same as the web.
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(
                            onSearch = { if (aiAssistantEnabled && searchQuery.isNotBlank()) onAskAi(searchQuery) },
                        ),
                        modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                    )
                }
                if (aiAssistantEnabled && searchQuery.isNotBlank()) {
                    val askAiLabel = stringResource(R.string.native_notes_ask_ai)
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .semantics { contentDescription = askAiLabel }
                            .gkTooltip(askAiLabel)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onAskAi(searchQuery) }
                            .padding(6.dp),
                    ) {
                        FileAiIcon(size = 20.dp, tint = if (dark) Color(0xFF818CF8) else Color(0xFF4F46E5))
                    }
                }
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .semantics { contentDescription = closeSearchLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onSearchOpenChange(false) }
                        .padding(6.dp),
                ) {
                    CloseIcon(size = 20.dp, tint = titleColor)
                }
                LaunchedEffect(Unit) {
                    focusRequester.requestFocus()
                    keyboard?.show()
                }
            } else {
                val openSidebarLabel = stringResource(R.string.native_sidebar_open)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .semantics { contentDescription = openSidebarLabel }
                        .gkTooltip(openSidebarLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onOpenSidebar() }
                        .padding(6.dp),
                ) {
                    HamburgerIcon(size = 22.dp, tint = titleColor)
                }
                Spacer(Modifier.width(12.dp))
                Image(
                    painter = painterResource(id = R.drawable.glasskeep_logo),
                    contentDescription = "GlassKeep",
                    modifier = Modifier.size(28.dp).clip(RoundedCornerShape(12.dp)),
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Glass Keep", color = titleColor, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        when {
                            activeTagLabel == null -> NotesIcon(size = 12.dp, tint = accentColor)
                            activeLens == SidebarAllImages -> SidebarImagesIcon(size = 12.dp, tint = accentColor)
                            activeLens == SidebarReminders -> SidebarRemindersIcon(size = 12.dp, tint = accentColor)
                            else -> TagIcon(size = 12.dp, tint = accentColor)
                        }
                        Spacer(Modifier.width(4.dp))
                        Text(
                            activeTagLabel ?: stringResource(R.string.native_header_notes_label),
                            color = accentColor,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                val searchLabel = stringResource(R.string.native_notes_search)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .semantics { contentDescription = searchLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onSearchOpenChange(true) }
                        .padding(8.dp),
                ) {
                    SearchIcon(size = 18.dp, tint = titleColor)
                }
                val notificationsLabel = stringResource(R.string.native_notifications_title)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .semantics { contentDescription = notificationsLabel }
                        .gkTooltip(notificationsLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onOpenNotifications() }
                        .padding(8.dp),
                ) {
                    if (notificationsOpen) {
                        BellRingingFilledIcon(size = 18.dp, tint = titleColor)
                    } else {
                        BellIcon(size = 18.dp, tint = titleColor)
                    }
                    // .gk-notif-bell-dot: a plain red dot, never a count
                    // (the web dropped the counter with the read/unread
                    // distinction, see NotificationBell.jsx:56-59).
                    if (hasUnreadNotifications) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .size(9.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(if (dark) Color(0xFF1C1C22) else Color.White)
                                .padding(2.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0xFFEF4444)),
                        )
                    }
                }
                SyncStatusButton(
                    state = syncState,
                    queued = queuedCount,
                    locked = instanceLocked,
                    dark = dark,
                    onClick = onOpenSyncStatus,
                )
                var moreMenuExpanded by remember { mutableStateOf(false) }
                val moreLabel = stringResource(R.string.native_notes_more_options)
                Box {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .semantics { contentDescription = moreLabel }
                            .gkTooltip(moreLabel)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { moreMenuExpanded = true }
                            .padding(8.dp),
                    ) {
                        // The dots step aside while the panel is open: on a
                        // phone the web anchors it right over the button
                        // (NotesHeader.jsx:624-627).
                        if (!moreMenuExpanded) KebabIcon(size = 18.dp, tint = titleColor)
                    }
                    HeaderMenu(
                        expanded = moreMenuExpanded,
                        dark = dark,
                        listView = listView,
                        onDismiss = { moreMenuExpanded = false },
                        onOpenSettings = { moreMenuExpanded = false; onOpenSettings() },
                        onToggleViewMode = { moreMenuExpanded = false; onToggleViewMode() },
                        onToggleDark = { moreMenuExpanded = false; onToggleDark() },
                        onEnterSelection = { moreMenuExpanded = false; onEnterSelection() },
                        onOpenQrScanner = { moreMenuExpanded = false; onOpenQrScanner() },
                        showLockInstance = showLockInstance,
                        onLockInstance = { moreMenuExpanded = false; onLockInstance() },
                        onSignOut = { moreMenuExpanded = false; onSignOut() },
                    )
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(WorkspaceTheme.headerBorderColor(themeId, dark)))
    }
}

/**
 * The assistant's answer, above the grid (NotesComposer.jsx:89-160): a
 * card with an indigo edge and a faint indigo-to-purple wash, the
 * "thinking" line while the model is working, and the notes the answer
 * actually leant on underneath.
 */
@Composable
private fun AiAnswerCard(
    answer: String?,
    loading: Boolean,
    dark: Boolean,
    titleColor: Color,
    citedNotes: List<NoteEntity>,
    onOpenNote: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val accent = if (dark) Color(0xFF818CF8) else Color(0xFF4F46E5)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(bottom = 12.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(
                Brush.linearGradient(
                    if (dark) {
                        listOf(Color(0x4D1E1B4B), Color(0x4D2E1065))
                    } else {
                        listOf(Color(0x80EEF2FF), Color(0x80FAF5FF))
                    },
                ),
            )
            .border(1.dp, accent.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SparklesIcon(size = 20.dp, tint = accent)
            Spacer(Modifier.width(8.dp))
            Text(
                stringResource(R.string.native_notes_ai_assistant),
                color = if (dark) Color(0xFFA5B4FC) else Color(0xFF4338CA),
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            if (!loading && answer != null) {
                val clearLabel = stringResource(R.string.native_notes_ai_clear)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .semantics { contentDescription = clearLabel }
                        .gkTooltip(clearLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onDismiss() }
                        .padding(4.dp),
                ) {
                    CloseIcon(size = 18.dp, tint = titleColor)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        if (loading) {
            Text(
                stringResource(R.string.native_notes_ai_thinking),
                color = if (dark) DarkSubtextColor else LightSubtextColor,
                fontSize = 14.sp,
            )
        } else if (answer != null) {
            MarkdownText(
                markdown = answer,
                color = titleColor,
                dark = dark,
            )
        }
        if (!loading && citedNotes.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(accent.copy(alpha = 0.2f)),
            )
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.native_notes_ai_cited).uppercase(),
                color = accent.copy(alpha = 0.8f),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.6.sp,
            )
            Spacer(Modifier.height(8.dp))
            for (note in citedNotes) {
                Text(
                    note.title.ifBlank { stringResource(R.string.native_notes_untitled) },
                    color = titleColor,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onOpenNote(note.id) }
                        .padding(vertical = 6.dp),
                )
            }
        }
    }
}

/**
 * The header's own menu (NotesHeader.jsx:637-738). Deliberately not a
 * Material DropdownMenu: the web's panel has its own geometry (it opens
 * over the kebab rather than under it, hugs its widest row, and scrolls
 * past 72% of the screen) and its own row shape (16sp label, 12dp gap,
 * one accent colour per action). The admin panel is left out because this
 * app has none; the instance lock IS here, on the web's own two conditions
 * (an admin, and at-rest encryption switched on).
 */
@Composable
private fun HeaderMenu(
    expanded: Boolean,
    dark: Boolean,
    listView: Boolean,
    showLockInstance: Boolean,
    onDismiss: () -> Unit,
    onOpenSettings: () -> Unit,
    onToggleViewMode: () -> Unit,
    onToggleDark: () -> Unit,
    onEnterSelection: () -> Unit,
    onOpenQrScanner: () -> Unit,
    onLockInstance: () -> Unit,
    onSignOut: () -> Unit,
) {
    if (!expanded) return
    val configuration = LocalConfiguration.current
    Popup(
        alignment = Alignment.TopEnd,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = (configuration.screenWidthDp * 0.95f).dp)
                .heightIn(max = (configuration.screenHeightDp * 0.72f).dp)
                .clip(RoundedCornerShape(8.dp))
                .background(if (dark) Color(0xFF222222) else Color.White)
                .border(1.dp, if (dark) DarkBorderColor else LightBorderColor, RoundedCornerShape(8.dp))
                .verticalScroll(rememberScrollState()),
        ) {
            HeaderMenuItem(
                label = stringResource(R.string.native_settings_title),
                iconTint = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                dark = dark,
                onClick = onOpenSettings,
            ) { tint -> SettingsIcon(size = 20.dp, tint = tint) }
            HeaderMenuItem(
                label = stringResource(
                    if (listView) R.string.native_notes_grid_view else R.string.native_notes_list_view
                ),
                iconTint = if (dark) Color(0xFF60A5FA) else Color(0xFF2563EB),
                dark = dark,
                onClick = onToggleViewMode,
            ) { tint ->
                if (listView) GridIcon(size = 20.dp, tint = tint) else ListIcon(size = 20.dp, tint = tint)
            }
            HeaderMenuItem(
                label = stringResource(
                    if (dark) R.string.native_notes_light_mode else R.string.native_notes_dark_mode
                ),
                iconTint = if (dark) Color(0xFFFBBF24) else Color(0xFF4F46E5),
                dark = dark,
                onClick = onToggleDark,
            ) { tint ->
                if (dark) SunIcon(size = 20.dp, tint = tint) else MoonIcon(size = 20.dp, tint = tint)
            }
            HeaderMenuItem(
                label = stringResource(R.string.native_notes_select_mode),
                iconTint = if (dark) Color(0xFFA78BFA) else Color(0xFF7C3AED),
                dark = dark,
                onClick = onEnterSelection,
            ) { tint -> CheckSquareIcon(size = 20.dp, tint = tint) }
            HeaderMenuItem(
                label = stringResource(R.string.native_qr_scan_title),
                iconTint = if (dark) Color(0xFF2DD4BF) else Color(0xFF0D9488),
                dark = dark,
                onClick = onOpenQrScanner,
            ) { tint -> QrCodeIcon(size = 20.dp, tint = tint) }
            // The whole row is red on the web, glyph and label alike.
            val signOutColor = if (dark) Color(0xFFF87171) else Color(0xFFDC2626)
            if (showLockInstance) {
                // Red glyph, ordinary label: the row above sign-out on the
                // web reddens only its icon (NotesHeader.jsx:719).
                HeaderMenuItem(
                    label = stringResource(R.string.native_lock_instance),
                    iconTint = signOutColor,
                    dark = dark,
                    onClick = onLockInstance,
                ) { tint -> LockIcon(size = 20.dp, tint = tint) }
            }
            HeaderMenuItem(
                label = stringResource(R.string.native_notes_sign_out),
                iconTint = signOutColor,
                labelColor = signOutColor,
                dark = dark,
                onClick = onSignOut,
            ) { tint -> LogOutIcon(size = 20.dp, tint = tint) }
        }
    }
}

/** One row of [HeaderMenu]: px-4 py-3.5, 12dp gap, 16sp label. */
@Composable
private fun HeaderMenuItem(
    label: String,
    iconTint: Color,
    dark: Boolean,
    onClick: () -> Unit,
    labelColor: Color? = null,
    icon: @Composable (Color) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon(iconTint)
        Spacer(Modifier.width(12.dp))
        Text(
            label,
            color = labelColor ?: if (dark) Color(0xFFF3F4F6) else Color(0xFF1F2937),
            fontSize = 16.sp,
            maxLines = 1,
        )
    }
}

// "Pinned"/"Others" group labels above the grid below, matching
// NotesSections.jsx's own gk-section-label (uppercase, 12sp/600, 4dp
// start margin, 12dp bottom margin before the cards start).
@Composable
private fun SectionLabel(text: String, color: Color) {
    Text(
        text.uppercase(),
        color = color,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 4.dp, bottom = 12.dp),
    )
}

// Violet-tinted card shadow, standing in for the web card's own
// `box-shadow: 0 2px 8px rgba(139, 92, 246, 0.06)`. Compose's shadow
// API doesn't take a CSS-style low-alpha shadow color directly, so this
// is the closest native equivalent, not a byte-for-byte port.
private val CardShadowTint = Color(0xFF8B5CF6)

/** Wraps NoteCard with the long-press-then-drag gesture that drives manual
 *  reordering (see NativeNotesListScreen's own handleDragEnd), leaving
 *  NoteCard itself untouched: ArchivedNotesScreen.kt/SecondaryNotesScreen.kt
 *  render plain NoteCards with no reorder concept (see NoteEntity.position's
 *  own doc comment - those screens aren't Room-backed or position-aware),
 *  so the gesture plumbing has no business being on NoteCard itself.
 *
 *  onGloballyPositioned reports this card's own on-screen bounds up to the
 *  parent on every layout pass (cheap - just a Rect write into a plain
 *  map, no recomposition) so a LATER drag-end elsewhere can hit-test
 *  against them. The lift effect (translate-with-finger, slight scale
 *  up, a bit of elevation) only ever applies to whichever single card
 *  [isDragged] is currently true for. detectDragGesturesAfterLongPress's
 *  long-press requirement is what lets a plain quick tap still reach
 *  NoteCard's own onClick underneath: this modifier never engages at
 *  all for a tap that releases before the long-press threshold. */
@Composable
private fun ReorderableNoteCard(
    note: NoteEntity,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    onClick: () -> Unit,
    selectionMode: Boolean,
    selected: Boolean,
    onToggleSelect: () -> Unit,
    syncing: Boolean,
    reorderEnabled: Boolean,
    isDragged: Boolean,
    dragOffset: Offset,
    onBoundsChanged: (Rect) -> Unit,
    onDragStart: () -> Unit,
    onDragDelta: (Offset) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .onGloballyPositioned { onBoundsChanged(it.boundsInWindow()) }
            .then(
                if (isDragged) {
                    Modifier.graphicsLayer {
                        translationX = dragOffset.x
                        translationY = dragOffset.y
                        scaleX = 1.04f
                        scaleY = 1.04f
                        shadowElevation = 12f
                    }
                } else {
                    Modifier
                },
            )
            .then(
                if (reorderEnabled) {
                    Modifier.pointerInput(note.id) {
                        detectDragGesturesAfterLongPress(
                            onDragStart = { onDragStart() },
                            onDrag = { change, dragAmount -> change.consume(); onDragDelta(dragAmount) },
                            onDragEnd = onDragEnd,
                            onDragCancel = onDragCancel,
                        )
                    }
                } else {
                    Modifier
                },
            ),
    ) {
        NoteCard(
            note = note,
            dark = dark,
            titleColor = titleColor,
            subtextColor = subtextColor,
            onClick = onClick,
            selectionMode = selectionMode,
            selected = selected,
            onToggleSelect = onToggleSelect,
            syncing = syncing,
        )
    }
}

// internal, not private: ArchivedNotesScreen.kt (same package, different
// file) reuses this for the exact same card rendering. Kotlin's top-level
// `private` is file-scoped.
@Composable
internal fun NoteCard(
    note: NoteEntity,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    onClick: () -> Unit,
    selectionMode: Boolean = false,
    selected: Boolean = false,
    onToggleSelect: (() -> Unit)? = null,
    syncing: Boolean = false,
) {
    val borderColor = if (dark) CardBorderDark else CardBorderLight
    val shape = RoundedCornerShape(12.dp)
    Box(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                // min-h-[54px] on .note-card (NoteCard.jsx:218): an almost
                // empty note still reads as a card rather than a text line.
                .heightIn(min = 54.dp)
                .shadow(elevation = 2.dp, shape = shape, ambientColor = CardShadowTint.copy(alpha = 0.06f), spotColor = CardShadowTint.copy(alpha = 0.06f))
                .clip(shape)
                .background(noteColorFor(note.color, dark))
                .border(width = 1.dp, color = borderColor, shape = shape)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                    onClick = { if (selectionMode) onToggleSelect?.invoke() else onClick() },
                )
                .padding(8.dp),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    note.title.ifBlank { stringResource(R.string.native_notes_untitled) },
                    color = titleColor,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    modifier = Modifier.weight(1f).padding(end = if (selectionMode) 30.dp else 0.dp),
                )
                if (syncing && !selectionMode) {
                    CircularProgressIndicator(modifier = Modifier.size(12.dp), color = Indigo, strokeWidth = 1.5.dp)
                    Spacer(Modifier.width(6.dp))
                }
                if (note.pinned && !selectionMode) {
                    PinIcon(size = 14.dp, tint = Indigo, filled = true)
                }
            }
            Spacer(Modifier.height(6.dp))

            if (note.type == "checklist") {
                ChecklistCardPreview(note = note, titleColor = titleColor, subtextColor = subtextColor)
            } else if (note.type == "draw" || note.type == "audio") {
                // Neither shape is NoteContent's rich-doc-or-plain-text JSON
                // (draw's is {paths,dimensions,text}, audio's is its own
                // metadata blob), so previewPlainText would just leak the raw
                // JSON string here rather than a real preview. The web shows a
                // real vector thumbnail for a drawing (DrawingPreview.jsx) and
                // presumably something audio-specific; a generic type label
                // is a safe, non-guessing fallback for both until either gets
                // its own native preview renderer.
                Text(noteTypeLabel(note.type), color = subtextColor, fontSize = 12.sp)
            } else {
                val preview = remember(note.content) { NoteContent.previewPlainText(note.content) }
                if (preview.isNotBlank()) {
                    Text(preview, color = titleColor, fontSize = 14.sp, lineHeight = 20.sp)
                } else if (note.type != "text") {
                    Text(noteTypeLabel(note.type), color = subtextColor, fontSize = 12.sp)
                }
            }

            // Its own row, same as NoteCardFooter.jsx: a reminder's date/time
            // stays readable instead of competing with the preview above it.
            note.reminderAt?.let { reminderAt ->
                Spacer(Modifier.height(6.dp))
                ReminderChip(reminderAt = reminderAt, dark = dark)
            }
        }

        // Same top-end overlay position as NoteCard.jsx's own checkbox,
        // absolute-positioned over the card content rather than laid out
        // inline with it.
        if (selectionMode) {
            SelectionCheckbox(
                selected = selected,
                dark = dark,
                onToggle = { onToggleSelect?.invoke() },
                modifier = Modifier.align(Alignment.TopEnd).padding(10.dp),
            )
        }
    }
}

/** Mirrors NoteReminderChip.jsx: a neutral pill, bell glyph, muted once the
 *  instant has passed, an accent tint while it's still upcoming. */
@Composable
private fun ReminderChip(reminderAt: String, dark: Boolean) {
    val label = formatReminderLabel(reminderAt)
    if (label.isBlank()) return
    val past = isReminderPast(reminderAt)
    val bg = if (dark) Color.White.copy(alpha = 0.10f) else Color.Black.copy(alpha = 0.06f)
    val fg = when {
        past -> if (dark) Color(0xFF9ca3af) else Color(0xFF6b7280)
        else -> if (dark) Color(0xFFa5b4fc) else Indigo
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        BellIcon(size = 12.dp, tint = fg)
        Text(label, color = fg, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Compact, localized label relative to now, mirroring
 *  src/utils/reminder.js's formatReminderLabel: today/tomorrow get a
 *  relative word, anything else a short date (year only when it differs
 *  from the current one). Locale-driven (device locale, same axis every
 *  other native string already resolves on), not the system 12h/24h clock
 *  setting: DatePickerDialog/TimePickerDialog (see launchReminderPicker in
 *  NoteDetailScreen.kt) are chrome and should follow that system setting,
 *  but this is app content, like the web's own per-language formatting. */
@Composable
private fun formatReminderLabel(reminderAt: String): String {
    val ms = parseIsoToEpochMillis(reminderAt) ?: return ""
    val isFrench = Locale.getDefault().language == "fr"
    val time = SimpleDateFormat(if (isFrench) "HH:mm" else "h:mm a", Locale.getDefault()).format(Date(ms))

    val target = Calendar.getInstance().apply { timeInMillis = ms }
    val now = Calendar.getInstance()
    val tomorrow = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 1) }
    fun sameDay(a: Calendar, b: Calendar) =
        a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)

    return when {
        sameDay(target, now) -> stringResource(R.string.native_reminder_chip_today, time)
        sameDay(target, tomorrow) -> stringResource(R.string.native_reminder_chip_tomorrow, time)
        else -> {
            val datePattern = if (target.get(Calendar.YEAR) != now.get(Calendar.YEAR)) "d MMM yyyy" else "d MMM"
            val date = SimpleDateFormat(datePattern, Locale.getDefault()).format(Date(ms))
            stringResource(R.string.native_reminder_chip_date, date, time)
        }
    }
}

/** Same rule as NoteCard.jsx's own preview: only unchecked items are
 *  listed (what's left to do), capped at a handful, checked ones only
 *  count toward the "done/total" footer. */
@Composable
private fun ChecklistCardPreview(note: NoteEntity, titleColor: Color, subtextColor: Color) {
    val items = remember(note.itemsJson) { ChecklistPreview.parse(note.itemsJson) }
    val total = items.size
    val done = items.count { it.done }
    val unchecked = items.filter { !it.done }
    val shown = unchecked.take(5)
    val extra = unchecked.size - shown.size

    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        for (item in shown) {
            Row(modifier = if (item.indented) Modifier.padding(start = 14.dp) else Modifier) {
                Text("☐ ", color = subtextColor, fontSize = 13.sp)
                Text(
                    item.text,
                    color = titleColor,
                    fontSize = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (extra > 0) {
            Text(
                String.format(stringResource(R.string.native_notes_more_items), extra),
                color = subtextColor,
                fontSize = 12.sp,
            )
        }
        if (total > 0) {
            Text(
                String.format(stringResource(R.string.native_notes_completed_fraction), done, total),
                color = subtextColor,
                fontSize = 12.sp,
            )
        }
    }
}

// internal, not private: NoteDetailScreen.kt (same package, different
// file) needs this too. Kotlin's top-level `private` is file-scoped.
@Composable
internal fun noteTypeLabel(type: String): String = when (type) {
    "checklist" -> stringResource(R.string.native_note_type_checklist)
    "draw" -> stringResource(R.string.native_note_type_draw)
    "audio" -> stringResource(R.string.native_note_type_audio)
    else -> stringResource(R.string.native_note_type_text)
}
