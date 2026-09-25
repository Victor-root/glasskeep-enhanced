package com.glasskeep.app.nativeapp.ui

import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.pullToRefresh
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.toSize
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.zIndex
import com.glasskeep.app.BuildConfig
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NoteExporter
import com.glasskeep.app.nativeapp.SyncState
import com.glasskeep.app.nativeapp.data.AiClient
import com.glasskeep.app.nativeapp.data.AudioContent
import com.glasskeep.app.nativeapp.data.ChecklistItemData
import com.glasskeep.app.nativeapp.data.ChecklistItems
import com.glasskeep.app.nativeapp.data.DrawingContent
import com.glasskeep.app.nativeapp.data.MarkdownDoc
import com.glasskeep.app.nativeapp.data.NoteContent
import com.glasskeep.app.nativeapp.data.NoteImageData
import com.glasskeep.app.nativeapp.data.NoteImages
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.TagsJson
import com.glasskeep.app.nativeapp.data.TypographyPresets
import com.glasskeep.app.nativeapp.data.TypographyProfile
import com.glasskeep.app.nativeapp.data.isReminderPast
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.local.SyncQueueEntity
import com.glasskeep.app.nativeapp.data.matchesAnyTag
import com.glasskeep.app.nativeapp.data.matchesSearchQuery
import com.glasskeep.app.nativeapp.data.network.CollaboratorDto
import com.glasskeep.app.nativeapp.data.network.LogoDto
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.network.NoteIconDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.nativeapp.syncErrorKindOf
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.FloatingCardsBackground
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import java.text.Collator
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
 * NoteCard.jsx on the web side, including the administrator entry point.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeNotesListScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onOpenNote: (String) -> Unit,
    onOpenArchived: () -> Unit,
    onOpenTrash: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenAdmin: () -> Unit,
    onOpenQrScanner: () -> Unit,
    onOpenSideBySide: (String, String) -> Unit,
    /** Set when the launcher's "new text/checklist/audio note" shortcut
     *  started the app (see MainActivity's own shortcut table): the note
     *  is created and opened as soon as this screen is up. */
    pendingNewNoteType: String? = null,
    onPendingNewNoteTypeConsumed: () -> Unit = {},
    onSignedOut: () -> Unit,
) {
    val dark = LocalGkDark.current
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    // null (as opposed to an actually-empty list) means Room's cold Flow
    // has not delivered its first emission to THIS collector yet - on
    // every fresh composition (i.e. every return from a note, since this
    // whole screen is a NavHost destination that gets torn down and
    // rebuilt, see the DisposableEffect above) that first emission is not
    // instant, so for a frame or several `notes` would otherwise read as
    // empty even though the account has plenty of notes. That transient
    // "empty" used to be indistinguishable from a genuinely empty account,
    // which mattered because the scrollable list below measures at zero
    // height during it and Compose's verticalScroll clamps notesScrollState
    // down to that zero max - a clamp nothing later reverses once the real
    // notes arrive, which is what was destroying the restored scroll
    // position on every note visit (confirmed via the GKScroll log trail:
    // value=14094 restored, then value=0 maxValue=0 with notes.size still
    // 0, then real notes.size=209 with maxValue correctly 91694 but value
    // stuck at 0). rawNotes == null gates the scrollable branch below so
    // it never mounts against that transient zero.
    val rawNotes by repository.observeNotes().collectAsState(initial = null)
    val notes = rawNotes ?: emptyList()
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
    // Only a pull shows the spinner: the old app's SwipeRefreshLayout spun
    // for the reload its own gesture started, never for the app's loads.
    var pullRefreshing by remember { mutableStateOf(false) }
    var creatingNote by remember { mutableStateOf(false) }
    var fabOpen by remember { mutableStateOf(false) }
    // Scroll-reset investigation: this whole composable is a NavHost
    // destination, torn down while a note covers it and rebuilt fresh on
    // return - confirm that's actually happening (and when) alongside the
    // scroll-state logging near notesScrollState below. Own tag ("GKScroll"),
    // kept apart from "GKNative" (colour/status-bar debugging) on request.
    if (BuildConfig.DEBUG) {
        val instanceId = remember {
            System.identityHashCode(Any()).also { Log.d("GKScroll", "NativeNotesListScreen ENTER composition instance=$it") }
        }
        DisposableEffect(Unit) {
            onDispose { Log.d("GKScroll", "NativeNotesListScreen LEAVE composition instance=$instanceId") }
        }
    }
    // Saveable like the scroll position below, and for the same reason: an
    // open note replaces this whole screen, while on the web the list keeps
    // its search, filters and assistant answer under the note.
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    // Bumped by the header's search button only, the one place the web
    // focuses the field from (NotesHeader.jsx:375): coming back to a list
    // whose search stayed open does not bring the keyboard back.
    var searchFocusRequest by remember { mutableIntStateOf(0) }
    var headerMenuOpen by remember { mutableStateOf(false) }
    var notificationsOpen by remember { mutableStateOf(false) }
    var selectionMode by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showBulkTrashConfirm by remember { mutableStateOf(false) }
    var showBulkColorPicker by remember { mutableStateOf(false) }
    var showBulkLogoPicker by remember { mutableStateOf(false) }
    var bulkLogos by remember { mutableStateOf<List<LogoDto>>(emptyList()) }
    var bulkActionRunning by remember { mutableStateOf(false) }
    var sidebarOpen by remember { mutableStateOf(false) }
    var activeTagFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var activeTagFilters by rememberSaveable { mutableStateOf<Set<String>>(emptySet()) }
    var aiAnswer by rememberSaveable { mutableStateOf<String?>(null) }
    var aiCitedNoteIds by rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var aiLoading by remember { mutableStateOf(false) }
    val aiClient = remember(serverUrl) { AiClient(serverUrl, container.tokenStore) }
    val aiErrorMessage = stringResource(R.string.native_notes_ai_error)
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current

    // Survives the note visit that tears this whole NavHost destination
    // down: "notes" leaves composition entirely while a note covers it, and
    // a plain remember (what rememberScrollState uses) does not survive
    // that, so every return from a note started a brand new ScrollState at
    // 0. rememberSaveable's state, unlike plain remember, is
    // captured/restored by NavHost's SaveableStateHolder across exactly
    // that dispose/recompose cycle. Tag "GKScroll" (distinct from
    // "GKNative", used for the earlier status-bar-color debugging) - filter
    // logcat on it to see whether this identity survives a note visit.
    val notesScrollState = rememberSaveable(saver = ScrollState.Saver) { ScrollState(0) }
    SideEffect {
        if (BuildConfig.DEBUG) {
            Log.d(
                "GKScroll",
                "notesScrollState id=${System.identityHashCode(notesScrollState)} value=${notesScrollState.value} " +
                    "maxValue=${notesScrollState.maxValue} notes.size=${notes.size} refreshing=$refreshing",
            )
        }
    }
    var headerVisible by rememberSaveable { mutableStateOf(true) }
    // The header floats over the page, which keeps a slot of the same
    // height for it; measured, and kept across note visits so a return
    // draws the right slot from its first frame.
    var headerHeightPx by rememberSaveable { mutableIntStateOf(with(density) { DefaultHeaderHeight.roundToPx() }) }
    var bannerHeightPx by remember { mutableIntStateOf(0) }
    var screenHeightPx by remember { mutableIntStateOf(0) }

    // Tag list + per-tag note count for the drawer (TagSidebar.kt), same
    // "derive from what's already loaded" approach as filteredNotes below:
    // no dedicated tags table/query, just a client-side tally over the
    // notes already observed for this screen.
    val tagCounts = remember(notes) {
        val counts = LinkedHashMap<String, Int>()
        for (note in notes) {
            for (tag in TagsJson.parse(note.tagsJson)) {
                val key = tag.trim()
                if (key.isEmpty()) continue
                counts[key] = (counts[key] ?: 0) + 1
            }
        }
        val collator = Collator.getInstance()
        counts.toList().sortedWith(compareBy(collator) { it.first.lowercase() })
    }

    // Manual drag reorder (see NotesRepository.reorderQueued), on any view
    // but multi-select, like the web's canDrag = !multiMode: a filtered
    // view still swaps inside the full pinned/others group below.
    // Unclipped window bounds per card (see ReorderableNoteCard), read by
    // the drag to find the card under the finger - not State, nothing
    // should recompose when they change.
    val cardBounds = remember { mutableMapOf<String, Rect>() }
    var draggedNoteId by remember { mutableStateOf<String?>(null) }
    var dragOverNoteId by remember { mutableStateOf<String?>(null) }
    // The held finger's window Y, for the edge auto-scroll below.
    var dragPointerY by remember { mutableFloatStateOf(0f) }

    fun endDrag() {
        draggedNoteId = null
        dragOverNoteId = null
    }

    // The note under the finger, except the held one (elementFromPoint in
    // useNoteTouchDrag.js): the outlined drop target.
    fun trackDrag(id: String, pointerInWindow: Offset) {
        dragPointerY = pointerInWindow.y
        dragOverNoteId = cardBounds.entries.firstOrNull { (otherId, bounds) ->
            otherId != id && bounds.contains(pointerInWindow)
        }?.key
    }

    // Web-equivalent swap semantics (see NotesRepository.reorderQueued's
    // own doc comment): the held note and the one it is released over trade
    // places, nothing in between shifts. The web outlines a note of the
    // other group too, but dropping there changes nothing (App.jsx onDrop).
    fun dropDraggedNote(id: String) {
        val targetId = dragOverNoteId
        endDrag()
        if (targetId == null) {
            NativeDebug.d("NativeNotesListScreen reorder: no drop target for $id")
            return
        }
        val draggedNote = notes.find { it.id == id }
        val target = notes.find { it.id == targetId }
        if (draggedNote == null || target == null || target.pinned != draggedNote.pinned) {
            NativeDebug.d("NativeNotesListScreen reorder: $id dropped on $targetId outside its group")
            return
        }
        val group = notes.filter { it.pinned == draggedNote.pinned }.toMutableList()
        val fromIndex = group.indexOfFirst { it.id == id }
        val toIndex = group.indexOfFirst { it.id == targetId }
        NativeDebug.d("NativeNotesListScreen reorder: swap $id <-> $targetId (pinned=${draggedNote.pinned})")
        group[fromIndex] = group[toIndex].also { group[toIndex] = group[fromIndex] }
        val pinnedGroup = if (draggedNote.pinned) group else notes.filter { it.pinned }
        val otherGroup = if (draggedNote.pinned) notes.filter { !it.pinned } else group
        scope.launch { repository.reorderQueued(pinnedGroup, otherGroup) }
    }

    // Client-side parity with App.jsx: multi-tags are OR'ed, then search
    // matches title/body/tags/checklist rows/image display names.
    val filteredNotes = remember(notes, searchQuery, activeTagFilter, activeTagFilters) {
        // The drawer's two lenses are not folders: they narrow the list
        // already loaded, and the notes they hide are still in the plain
        // view (App.jsx:7063-7077).
        val byTag = when (activeTagFilter) {
            null -> notes
            SidebarAllImages -> notes.filter { it.hasImages }
            SidebarReminders -> notes.filter { !it.reminderAt.isNullOrBlank() }
            else -> notes
        }
        byTag.filter { it.matchesAnyTag(activeTagFilters) && it.matchesSearchQuery(searchQuery) }
    }

    val errorCreateTemplate = stringResource(R.string.native_notes_create_error)
    val archivedSuccessTemplate = stringResource(R.string.native_bulk_archived_success)
    val trashedSuccessTemplate = stringResource(R.string.native_bulk_trashed_success)
    val partialFailureTemplate = stringResource(R.string.native_bulk_partial_failure)
    val trashLabel = stringResource(R.string.native_note_detail_move_to_trash)
    val archiveLabel = stringResource(R.string.native_note_detail_archive)
    val pinLabel = stringResource(R.string.native_note_detail_pin)
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
    val lockInstanceFailed = stringResource(R.string.native_lock_instance_failed)
    val context = LocalContext.current
    val toasts = LocalGkToasts.current

    val bgModifier = Modifier.background(WorkspaceTheme.appBackground(themeId, dark))
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) CardBorderDark else CardBorderLight

    fun reportOutcome(successTemplate: String, outcome: BulkOutcome, icon: String? = null) {
        val message = String.format(successTemplate, outcome.succeeded) +
            if (outcome.failed > 0) " " + String.format(partialFailureTemplate, outcome.failed) else ""
        if (outcome.failed > 0) toasts.error(message) else toasts.success(message, icon)
    }

    // The web makes room for the dock with 44px above the list and scrolls
    // by the same amount so nothing visibly moves (App.jsx onStartMulti /
    // onExitMulti); that scroll is also what hides the header meanwhile.
    fun enterSelection() {
        if (selectionMode) return
        selectionMode = true
        selectedIds = emptySet()
        fabOpen = false
        notesScrollState.dispatchRawDelta(with(density) { SelectionShim.toPx() })
    }

    fun exitSelection() {
        if (!selectionMode) return
        selectionMode = false
        selectedIds = emptySet()
        notesScrollState.dispatchRawDelta(-with(density) { SelectionShim.toPx() })
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
            reportOutcome(trashedSuccessTemplate, outcome, "trash")
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

    fun toggleSelectAllVisible() {
        val visibleIds = filteredNotes.mapTo(linkedSetOf()) { it.id }
        if (visibleIds.isEmpty()) return
        selectedIds = if (visibleIds.all { it in selectedIds }) selectedIds - visibleIds else selectedIds + visibleIds
    }

    fun bulkSetIcon(icon: NoteIconDto) {
        showBulkLogoPicker = false
        if (bulkActionRunning || selectedIds.isEmpty()) return
        bulkActionRunning = true
        val ids = selectedIds.toList()
        scope.launch {
            val succeeded = mutableListOf<String>()
            var failed = 0
            for (id in ids) {
                try {
                    repository.setNoteIcon(id, icon.copy(id = java.util.UUID.randomUUID().toString()))
                    succeeded += id
                } catch (t: Throwable) {
                    NativeDebug.e("Bulk icon failed for note $id", t)
                    failed++
                }
            }
            bulkActionRunning = false
            if (failed == 0) toasts.success(String.format(bulkIconSuccessTemplate, succeeded.size))
            else toasts.error(String.format(bulkIconErrorTemplate, failed))
        }
    }

    fun openBulkLogoPicker() {
        showBulkLogoPicker = true
        scope.launch {
            try {
                bulkLogos = repository.fetchLogos()
            } catch (t: Throwable) {
                NativeDebug.e("Bulk logo library load failed", t)
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
                val dataUrl = withContext(Dispatchers.IO) {
                    ImageCompression.compressToDataUrl(context, picked)
                } ?: return@launch
                val name = ImageCompression.displayNameFor(context, picked) ?: ""
                val logo = repository.createLogo(name, dataUrl)
                bulkLogos = repository.fetchLogos()
                bulkSetIcon(NoteIconDto(id = logo?.id, src = logo?.src ?: dataUrl, name = logo?.name ?: name))
            } catch (t: Throwable) {
                NativeDebug.e("Bulk logo upload failed", t)
                toasts.error(String.format(bulkIconErrorTemplate, selectedIds.size))
            }
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
        if (refreshing) return
        refreshing = true
        // The queue drains alongside the pull, so the cloud icon reads
        // "syncing" for both halves at once, like the web's own
        // _processing || _pulling (syncEngine.js:730).
        container.syncStatus.markSyncing(true)
        SyncQueueWorker.triggerNow(context)
        scope.launch {
            try {
                repository.refresh()
                container.syncStatus.recordReachable()
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                // Nothing on the list itself: the header's offline pill and
                // cloud are how the web reports it.
                NativeDebug.e("Notes refresh failed", t)
                container.syncStatus.recordUnreachable(syncErrorKindOf(t))
            } finally {
                refreshing = false
                pullRefreshing = false
                container.syncStatus.markSyncing(false)
            }
        }
    }

    fun createNote(create: suspend () -> NoteDto) {
        if (creatingNote) return
        creatingNote = true
        scope.launch {
            try {
                val note = create()
                NativeDebug.d("Created ${note.type} note id=${note.id}")
                SyncQueueWorker.triggerNow(context)
                onOpenNote(note.id)
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Create note failed", t)
                toasts.error(String.format(errorCreateTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                creatingNote = false
            }
        }
    }

    LaunchedEffect(serverUrl) {
        if (BuildConfig.DEBUG) {
            Log.d("GKScroll", "LaunchedEffect(serverUrl) firing refresh() - this restarts on every fresh composition, not just a real serverUrl change")
        }
        refresh()
    }

    // The launcher shortcut, once: consumed straight away so coming back
    // to this screen later doesn't create a second note.
    LaunchedEffect(pendingNewNoteType) {
        when (pendingNewNoteType) {
            null -> return@LaunchedEffect
            "text" -> createNote(repository::createTextNote)
            "checklist" -> createNote(repository::createChecklistNote)
            "audio" -> createNote(repository::createAudioNote)
            else -> NativeDebug.e("Unknown launcher note type: $pendingNewNoteType")
        }
        onPendingNewNoteTypeConsumed()
    }

    LaunchedEffect(notificationsOpen) {
        // The floating pill is suppressed for as long as the panel is up,
        // the same way the web hides it behind the notification centre
        // (App.jsx:7933-7935), and opening the bell dismisses every active
        // notification.
        toasts.suppressed = notificationsOpen
        if (notificationsOpen) toasts.dismissAll()
    }

    // Once per session, for administrators (useUpdateCheck.js).
    LaunchedEffect(container.shellPrefs.isAdmin) {
        if (container.shellPrefs.isAdmin && container.shellPrefs.serverUpdateAvailable == null) {
            repository.fetchServerUpdateAvailable()?.let { container.shellPrefs.applyServerUpdateAvailable(it) }
        }
    }

    // The web's header auto-hide on phones (NotesUI.jsx:173-195): scrolling
    // down more than 4px in one step hides it, scrolling up more than 4px or
    // coming within 10px of the top shows it again.
    LaunchedEffect(notesScrollState, density) {
        val nearTop = with(density) { 10.dp.toPx() }
        val threshold = with(density) { 4.dp.toPx() }
        var last = notesScrollState.value
        snapshotFlow { notesScrollState.value }.collect { y ->
            val delta = y - last
            when {
                y < nearTop -> headerVisible = true
                delta > threshold -> headerVisible = false
                delta < -threshold -> headerVisible = true
            }
            last = y
        }
    }

    // useNoteTouchDrag.js's edge scroll: while a card is held, a finger in
    // the top or bottom 80px of the screen scrolls by up to 15px a frame.
    LaunchedEffect(draggedNoteId) {
        if (draggedNoteId == null) return@LaunchedEffect
        val edgeZone = with(density) { 80.dp.toPx() }
        val maxStep = with(density) { 15.dp.toPx() }
        while (true) {
            withFrameNanos { }
            val y = dragPointerY
            val step = when {
                y > screenHeightPx - edgeZone -> min(maxStep, (y - (screenHeightPx - edgeZone)) / edgeZone * maxStep)
                y < edgeZone -> -min(maxStep, (edgeZone - y) / edgeZone * maxStep)
                else -> 0f
            }
            if (step != 0f) notesScrollState.dispatchRawDelta(step)
        }
    }

    fun closeSearch() {
        searchOpen = false
        searchQuery = ""
    }

    // The web closes the topmost overlay first, in App.jsx's own popstate
    // order; the header menu and the dialogs are windows of their own and
    // take back before this. Nothing open leaves back to the system.
    BackHandler(enabled = fabOpen || notificationsOpen || syncSheetOpen || searchOpen || selectionMode || sidebarOpen) {
        when {
            fabOpen -> fabOpen = false
            notificationsOpen -> notificationsOpen = false
            syncSheetOpen -> syncSheetOpen = false
            searchOpen -> closeSearch()
            selectionMode -> exitSelection()
            else -> sidebarOpen = false
        }
    }

    val showLockedBanner = container.lockState.isLocked && !container.lockState.bannerDismissed && !container.lockState.overlayOpen
    val bannerSlotPx = if (showLockedBanner) bannerHeightPx else 0
    val statusBarTopPx = WindowInsets.statusBars.getTop(density)
    val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val headerHideFraction by animateFloatAsState(
        targetValue = if (headerVisible) 0f else 1f,
        animationSpec = tween(durationMillis = 300, easing = CssEase),
        label = "headerHide",
    )
    val pullToRefreshState = rememberPullToRefreshState()
    // App.jsx:4972-4982: the old app switched its pull-to-refresh off
    // whenever anything was open over the list.
    val pullToRefreshEnabled = !fabOpen && !searchOpen && !headerMenuOpen && !selectionMode &&
        !sidebarOpen && !notificationsOpen && !syncSheetOpen

    Box(
        Modifier
            .fillMaxSize()
            .then(bgModifier)
            .onSizeChanged { screenHeightPx = it.height }
            .pullToRefresh(
                isRefreshing = pullRefreshing,
                state = pullToRefreshState,
                enabled = pullToRefreshEnabled,
                threshold = PullRefreshTrigger,
                onRefresh = {
                    pullRefreshing = true
                    refresh()
                },
            ),
    ) {
        // MobileCreateFab's backdrop-blur-[2px] blurs what lies under its
        // scrim: the page, not the header drawn above it.
        Box(Modifier.fillMaxSize().blur(if (fabOpen) cssBlur(2.dp) else 0.dp)) {
            if (container.shellPrefs.floatingCards) {
                FloatingCardsBackground(dark = dark, workspace = true)
            }
            // The page scrolls like the web's document, from under the status
            // bar: the locked banner, the header's own slot (the header
            // itself floats above), the assistant's answer, then the notes.
            // It stays unscrollable until Room answers (see rawNotes).
            Column(
                Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .then(if (rawNotes != null) Modifier.verticalScroll(notesScrollState) else Modifier),
            ) {
                if (showLockedBanner) {
                    LockedBanner(
                        dark = dark,
                        onUnlock = { container.lockState.overlayOpen = true },
                        onDismiss = { container.lockState.bannerDismissed = true },
                        modifier = Modifier.onSizeChanged { bannerHeightPx = it.height },
                    )
                }
                // The header's height, then its mb-6.
                Spacer(Modifier.height(with(density) { headerHeightPx.toDp() } + 24.dp))
                if (selectionMode) Spacer(Modifier.height(SelectionShim))
                val aiBoxShown = aiLoading || aiAnswer != null
                if (aiBoxShown) {
                    AiAnswerCard(
                        answer = aiAnswer,
                        loading = aiLoading,
                        dark = dark,
                        titleColor = titleColor,
                        subtextColor = subtextColor,
                        citedNotes = notes.filter { it.id in aiCitedNoteIds },
                        typography = container.editorPrefs.typography.activeProfile,
                        taskStrike = container.editorPrefs.taskStrike,
                        onOpenNote = onOpenNote,
                        onDismiss = {
                            aiAnswer = null
                            aiCitedNoteIds = emptyList()
                            searchQuery = ""
                        },
                    )
                    Spacer(Modifier.height(24.dp))
                }
                // The empty texts' mt-10 collapses into the margin above them
                // (40 under the header), except right under the dock's shim.
                val emptyTop = if (selectionMode && !aiBoxShown) 40.dp else 16.dp
                val filtering = searchQuery.isNotEmpty() || activeTagFilter != null || activeTagFilters.isNotEmpty()
                val reminderLens = activeTagFilter == SidebarReminders
                // main.px-4.pb-12, over the body's own bottom inset.
                Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 48.dp + navBarBottom)) {
                    when {
                        rawNotes == null || (refreshing && notes.isEmpty()) ->
                            EmptyListText(stringResource(R.string.native_notes_loading), subtextColor, Modifier.padding(top = emptyTop))
                        notes.isEmpty() -> Column(Modifier.padding(top = emptyTop, start = 16.dp, end = 16.dp)) {
                            EmptyListText(
                                stringResource(if (reminderLens) R.string.native_notes_no_reminders else R.string.native_notes_empty),
                                subtextColor,
                            )
                            if (syncState == SyncState.OFFLINE) {
                                Text(
                                    stringResource(R.string.native_notes_offline_view_not_loaded),
                                    color = if (dark) Color(0xFFFFB900) else Color(0xFFFE9A00),
                                    fontSize = 14.sp,
                                    lineHeight = 20.sp,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                )
                            }
                        }
                        filteredNotes.isEmpty() && filtering -> EmptyListText(
                            stringResource(if (reminderLens) R.string.native_notes_no_reminders else R.string.native_notes_search_empty),
                            subtextColor,
                            Modifier.padding(top = emptyTop),
                        )
                        else -> {
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
                                    typography = container.editorPrefs.typography.activeProfile,
                                    taskStrike = container.editorPrefs.taskStrike,
                                    loadDetail = repository::cachedNoteDetailOrNull,
                                    themeId = themeId,
                                    isDragged = note.id == draggedNoteId,
                                    isDragOver = note.id == dragOverNoteId,
                                    onBoundsChanged = { bounds ->
                                        if (bounds == null) cardBounds.remove(note.id) else cardBounds[note.id] = bounds
                                    },
                                    onDragStart = { pointer ->
                                        NativeDebug.d("NativeNotesListScreen reorder: drag start ${note.id}")
                                        draggedNoteId = note.id
                                        trackDrag(note.id, pointer)
                                    },
                                    onDragMove = { pointer -> trackDrag(note.id, pointer) },
                                    onDrop = { dropDraggedNote(note.id) },
                                    onDragCancel = { endDrag() },
                                )
                            }
                            // react-masonry-css distributes by index (0/2/4 in the
                            // left column, 1/3/5 in the right). Compose's staggered
                            // grid instead picks the currently shortest lane, visibly
                            // reordering cards. Use the web's real column algorithm.
                            val listView = container.shellPrefs.listView
                            if (pinnedNotes.isNotEmpty()) {
                                SectionLabel(stringResource(R.string.native_notes_section_pinned), subtextColor)
                                NotesMasonry(notes = pinnedNotes, listView = listView, renderNoteCard = renderNoteCard)
                                // The pinned section's mb-10.
                                Spacer(Modifier.height(40.dp))
                            }
                            if (otherNotes.isNotEmpty()) {
                                if (pinnedNotes.isNotEmpty()) {
                                    SectionLabel(stringResource(R.string.native_notes_section_others), subtextColor)
                                }
                                NotesMasonry(notes = otherNotes, listView = listView, renderNoteCard = renderNoteCard)
                            }
                        }
                    }
                }
            }
        }

        if (!selectionMode) CreateNoteScrim(open = fabOpen)

        if (selectionMode) {
            val visibleIds = filteredNotes.mapTo(linkedSetOf()) { it.id }
            val allVisibleSelected = visibleIds.isNotEmpty() && visibleIds.all { it in selectedIds }
            SelectionActionBar(
                selectedCount = selectedIds.size,
                actions = listOf(
                    BulkActionButton(
                        label = sideBySideLabel,
                        tone = BulkTone.SLATE,
                        icon = { SideBySideIcon(size = 16.dp, tint = Color.White) },
                        enabled = !bulkActionRunning && selectedIds.size == 2,
                        dimWhenDisabled = true,
                        gradient = if (WorkspaceTheme.forId(themeId).id == WorkspaceTheme.DEFAULT_ID) {
                            Brush.horizontalGradient(listOf(Color(0xFF4F39F6), Color(0xFF7008E7)))
                        } else {
                            WorkspaceTheme.accentGradient(themeId)
                        },
                        onClick = {
                            val ids = selectedIds.toList()
                            if (ids.size == 2) onOpenSideBySide(ids[0], ids[1])
                        },
                    ),
                    BulkActionButton(
                        label = trashLabel,
                        tone = BulkTone.RED,
                        icon = { TrashIcon(size = 20.dp, tint = BulkTone.RED.foreground(dark)) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        onClick = { showBulkTrashConfirm = true },
                    ),
                    BulkActionButton(
                        label = colorLabel,
                        tone = BulkTone.VIOLET,
                        icon = { Text("\uD83C\uDFA8", fontSize = 16.sp, lineHeight = 16.sp) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        anchored = {
                            if (showBulkColorPicker) {
                                NoteColorPopover(
                                    currentColorKey = null,
                                    dark = dark,
                                    enabled = !bulkActionRunning,
                                    onSelect = { colorKey -> bulkColor(colorKey) },
                                    onDismiss = { showBulkColorPicker = false },
                                    below = true,
                                )
                            }
                        },
                        onClick = { showBulkColorPicker = true },
                    ),
                    BulkActionButton(
                        label = logoLabel,
                        tone = BulkTone.CYAN,
                        icon = { BulkLogoIcon(size = 16.dp, tint = BulkTone.CYAN.foreground(dark)) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        anchored = {
                            if (showBulkLogoPicker) {
                                LogoPickerPopover(
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
                                    selectedSrc = null,
                                    below = true,
                                )
                            }
                        },
                        onClick = { openBulkLogoPicker() },
                    ),
                    BulkActionButton(
                        label = pinLabel,
                        tone = BulkTone.AMBER,
                        icon = { PinIcon(size = 16.dp, tint = BulkTone.AMBER.foreground(dark), filled = false) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        onClick = { bulkPin() },
                    ),
                    BulkActionButton(
                        label = archiveLabel,
                        tone = BulkTone.BLUE,
                        icon = { ArchiveIcon(size = 16.dp, tint = if (dark) Color(0xFF7DD3FC) else Color(0xFF0284C7)) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        menuColor = if (dark) Color(0xFF7DD3FC) else Color(0xFF0284C7),
                        onClick = { bulkArchive() },
                    ),
                    BulkActionButton(
                        label = exportZipLabel,
                        tone = BulkTone.GREEN,
                        icon = { DownloadIcon(size = 20.dp, tint = if (dark) Color(0xFF4ADE80) else Color(0xFF16A34A)) },
                        enabled = !bulkActionRunning && selectedIds.isNotEmpty(),
                        menuColor = if (dark) Color(0xFF4ADE80) else Color(0xFF16A34A),
                        onClick = { bulkExportZip() },
                    ),
                    BulkActionButton(
                        label = if (allVisibleSelected) deselectAllLabel else selectAllLabel,
                        tone = BulkTone.SLATE,
                        icon = {
                            SelectAllIcon(
                                checked = allVisibleSelected,
                                size = 16.dp,
                                tint = if (dark) Color(0xFFCBD5E1) else Color(0xFF475569),
                            )
                        },
                        enabled = !bulkActionRunning && visibleIds.isNotEmpty(),
                        menuColor = if (dark) Color(0xFFCBD5E1) else Color(0xFF475569),
                        onClick = { toggleSelectAllVisible() },
                    ),
                ),
                onClose = { exitSelection() },
                dark = dark,
                modifier = Modifier.align(Alignment.TopCenter),
                headerVisible = headerVisible,
            )
        }

        // The header and the status-bar strip it slides under: above the
        // page, the create menu's scrim and the dock (z-40 against 30 and 35
        // on the web), and above the search's tap catcher while searching.
        Box(Modifier.fillMaxSize().zIndex(if (searchOpen) 2f else 0f)) {
            NativeHeader(
                dark = dark,
                themeId = themeId,
                titleColor = titleColor,
                // The two lenses read as their own names, not as the
                // sentinels they are stored under.
                activeTagLabel = when {
                    activeTagFilters.size > 1 -> stringResource(R.string.native_sidebar_active_tags, activeTagFilters.size)
                    activeTagFilters.size == 1 -> activeTagFilters.first()
                    activeTagFilter == null -> null
                    else -> when (activeTagFilter) {
                        SidebarAllImages -> stringResource(R.string.native_sidebar_all_images)
                        SidebarReminders -> stringResource(R.string.native_sidebar_reminders)
                        else -> activeTagFilter
                    }
                },
                activeLens = activeTagFilter?.takeIf { it == SidebarAllImages || it == SidebarReminders },
                appName = container.branding.appName ?: stringResource(R.string.native_default_app_name),
                brandingLogo = container.branding.logo,
                syncState = syncState,
                queuedCount = syncQueue.size,
                instanceLocked = container.lockState.isLocked,
                hasServerUpdate = container.shellPrefs.isAdmin && container.shellPrefs.serverUpdateAvailable == true,
                onOpenSyncStatus = { syncSheetOpen = !syncSheetOpen },
                onOpenSidebar = { sidebarOpen = true },
                onOpenSettings = onOpenSettings,
                onOpenAdmin = onOpenAdmin,
                showAdmin = container.shellPrefs.isAdmin,
                searchOpen = searchOpen,
                searchFocusRequest = searchFocusRequest,
                onOpenSearch = {
                    searchOpen = true
                    searchFocusRequest++
                },
                onCloseSearch = { closeSearch() },
                searchQuery = searchQuery,
                onSearchQueryChange = { searchQuery = it },
                onEnterSelection = { enterSelection() },
                aiAssistantEnabled = container.shellPrefs.aiAssistantEnabled,
                onAskAi = { question -> askAi(question) },
                listView = container.shellPrefs.listView,
                onToggleViewMode = { toggleViewMode() },
                onToggleDark = { container.shellPrefs.toggleDark(dark) },
                onOpenQrScanner = onOpenQrScanner,
                qrQuickEnabled = container.shellPrefs.qrQuickEnabled,
                // NotesHeader.jsx:100's own two conditions.
                showLockInstance = container.shellPrefs.isAdmin && container.lockState.status?.enabled == true,
                onLockInstance = { lockInstance() },
                onSignOut = { signOut() },
                menuOpen = headerMenuOpen,
                onMenuOpenChange = { headerMenuOpen = it },
                notificationsOpen = notificationsOpen,
                // The web's dot: some notification is still active, i.e. a
                // pill is showing or queued.
                hasUnreadNotifications = toasts.queue.isNotEmpty(),
                onOpenNotifications = { notificationsOpen = !notificationsOpen },
                modifier = Modifier
                    .onSizeChanged { headerHeightPx = it.height }
                    // Sticky under the status bar once the banner has scrolled
                    // away, and slid up by its own height while hidden.
                    .offset {
                        val sticky = max(0, bannerSlotPx - notesScrollState.value)
                        IntOffset(0, statusBarTopPx + sticky - (headerHideFraction * headerHeightPx).roundToInt())
                    },
            )
            Box(
                Modifier
                    .fillMaxWidth()
                    .windowInsetsTopHeight(WindowInsets.statusBars)
                    .background(WorkspaceTheme.statusBarColor(themeId, dark)),
            )
            // SwipeRefreshLayout's stock look: a #FAFAFA disc with a black
            // arrow, coming out from under the status bar.
            PullToRefreshDefaults.Indicator(
                state = pullToRefreshState,
                isRefreshing = pullRefreshing,
                modifier = Modifier.align(Alignment.TopCenter).windowInsetsPadding(WindowInsets.statusBars),
                containerColor = Color(0xFFFAFAFA),
                color = Color.Black,
                maxDistance = PullRefreshRest,
            )
        }

        if (fabOpen) {
            // The web swallows the next tap anywhere outside the menu, the
            // header included, and only closes it (MobileCreateFab.jsx:23-33).
            Box(
                Modifier
                    .fillMaxSize()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { fabOpen = false },
            )
        }

        if (!selectionMode) {
            CreateNoteFab(
                dark = dark,
                open = fabOpen,
                onOpenChange = { fabOpen = it },
                onCreateText = { createNote(repository::createTextNote) },
                onCreateChecklist = { createNote(repository::createChecklistNote) },
                onCreateDrawing = { createNote(repository::createDrawingNote) },
                onCreateAudio = { createNote(repository::createAudioNote) },
            )
        }

        if (searchOpen && searchQuery.isEmpty()) {
            // NotesHeader.jsx:384-390: while the search is open and empty, a
            // clear layer under the header closes it on the next tap. The page
            // still scrolls through it, as a touch on the web's fixed layer
            // scrolls the document.
            Box(
                Modifier
                    .fillMaxSize()
                    .zIndex(1f)
                    .scrollable(notesScrollState, Orientation.Vertical, reverseDirection = true)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { closeSearch() },
            )
        }

        TagSidebar(
            open = sidebarOpen,
            dark = dark,
            themeId = themeId,
            tags = tagCounts,
            activeTag = activeTagFilter,
            activeTags = activeTagFilters,
            onSelectNotes = { activeTagFilter = null; activeTagFilters = emptySet(); sidebarOpen = false },
            onSelectTag = { tag, additive ->
                activeTagFilter = null
                activeTagFilters = if (additive) {
                    val current = activeTagFilters.firstOrNull { it.equals(tag, ignoreCase = true) }
                    if (current != null) activeTagFilters - current else activeTagFilters + tag
                } else {
                    if (activeTagFilters.size == 1 && activeTagFilters.first().equals(tag, ignoreCase = true)) emptySet()
                    else setOf(tag)
                }
                if (!additive) sidebarOpen = false
            },
            onClearTagFilters = { activeTagFilters = emptySet() },
            onSelectImages = { activeTagFilter = SidebarAllImages; activeTagFilters = emptySet(); sidebarOpen = false },
            onSelectReminders = { activeTagFilter = SidebarReminders; activeTagFilters = emptySet(); sidebarOpen = false },
            onOpenArchived = { sidebarOpen = false; onOpenArchived() },
            onOpenTrash = { sidebarOpen = false; onOpenTrash() },
            onClose = { sidebarOpen = false },
        )

        if (showBulkTrashConfirm) {
            GkConfirmDialog(
                title = trashLabel,
                message = stringResource(R.string.native_bulk_trash_confirm_message, selectedIds.size),
                confirmLabel = trashLabel,
                cancelLabel = stringResource(R.string.native_dialog_cancel),
                themeId = themeId,
                dark = dark,
                borderColor = if (dark) DarkBorderColor else LightBorderColor,
                titleColor = titleColor,
                subtextColor = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                variant = GkConfirmVariant.DANGER,
                onConfirm = { bulkTrash() },
                onDismiss = { showBulkTrashConfirm = false },
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
            themeId = themeId,
            onOpenNote = { id -> notificationsOpen = false; onOpenNote(id) },
            onDismiss = { notificationsOpen = false },
        )
        SyncStatusSheet(
            container = container,
            serverUrl = serverUrl,
            open = syncSheetOpen,
            dark = dark,
            themeId = themeId,
            onDismiss = { syncSheetOpen = false },
            onSyncNow = { refresh() },
        )
    }
}

// Before the first measure: py-4 around the 44px title block, plus the rule.
private val DefaultHeaderHeight = 77.dp

// The room the web makes above the list for the selection dock on a phone.
private val SelectionShim = 44.dp

// SwipeRefreshLayout's own numbers in the old app: a pull of 64dp triggers,
// and the 40dp disc rests with its top 64dp under the status bar.
private val PullRefreshTrigger = 64.dp
private val PullRefreshRest = 104.dp

// CSS `ease`.
private val CssEase = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

// Android turns a blur radius r into a standard deviation of 0.57735 r,
// where CSS blur() takes the standard deviation itself.
private fun cssBlur(sigma: Dp): Dp = sigma / 0.57735f

/** The web's empty and loading lines: 16px, centred, gray-500 / gray-400. */
@Composable
private fun EmptyListText(text: String, color: Color, modifier: Modifier = Modifier) {
    Text(
        text,
        color = color,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        textAlign = TextAlign.Center,
        modifier = modifier.fillMaxWidth(),
    )
}

/**
 * The notes header on a phone (NotesHeader.jsx): a flat --gk-statusbar bar
 * with its rule and soft shadow, hamburger, logo, name and section, then
 * search, bell, cloud, the optional QR quick button and the kebab. It
 * floats over the page (see NativeNotesListScreen), which is how the web's
 * sticky header can slide away and back.
 */
@Composable
private fun NativeHeader(
    dark: Boolean,
    themeId: String,
    titleColor: Color,
    activeTagLabel: String?,
    /** Which of the drawer's two lenses is on, if either: the header row
     *  shows their own glyph rather than the tag one. */
    activeLens: String?,
    /** The instance's own name and logo, or null for the bundled ones. */
    appName: String,
    brandingLogo: String?,
    syncState: SyncState,
    queuedCount: Int,
    instanceLocked: Boolean,
    hasServerUpdate: Boolean,
    onOpenSyncStatus: () -> Unit,
    onOpenSidebar: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenAdmin: () -> Unit,
    showAdmin: Boolean,
    searchOpen: Boolean,
    searchFocusRequest: Int,
    onOpenSearch: () -> Unit,
    onCloseSearch: () -> Unit,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onEnterSelection: () -> Unit,
    aiAssistantEnabled: Boolean,
    onAskAi: (String) -> Unit,
    listView: Boolean,
    onToggleViewMode: () -> Unit,
    onToggleDark: () -> Unit,
    onOpenQrScanner: () -> Unit,
    qrQuickEnabled: Boolean,
    showLockInstance: Boolean,
    onLockInstance: () -> Unit,
    onSignOut: () -> Unit,
    menuOpen: Boolean,
    onMenuOpenChange: (Boolean) -> Unit,
    notificationsOpen: Boolean,
    hasUnreadNotifications: Boolean,
    onOpenNotifications: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val chrome = WorkspaceTheme.colorsFor(themeId, dark)
    val offline = syncState == SyncState.OFFLINE
    // The QR quick button makes the web tighten the whole row so it still
    // fits (NotesHeader.jsx:233, 249, 366, 572, 616).
    val sidePadding = if (qrQuickEnabled) 6.dp else 10.dp
    val clusterGap = if (qrQuickEnabled) 6.dp else 12.dp
    val buttonGap = if (qrQuickEnabled) 0.dp else 4.dp
    val compactButton = if (qrQuickEnabled) 32.dp else 36.dp
    Column(
        modifier
            .fillMaxWidth()
            .headerDropShadow(chrome.chromeShadow)
            .background(chrome.statusBar),
    ) {
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (searchOpen) Modifier.searchBackdrop() else Modifier)
                    // pb-7 while offline: the pill hangs under the title block.
                    .padding(start = sidePadding, end = sidePadding, top = 16.dp, bottom = if (offline) 28.dp else 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val openTagsLabel = stringResource(R.string.native_sidebar_open)
                HeaderButton(size = 40.dp, label = openTagsLabel, tooltip = openTagsLabel, onClick = onOpenSidebar) {
                    HamburgerIcon(size = 24.dp, tint = titleColor)
                }
                Spacer(Modifier.width(clusterGap))
                // Same split as AuthShell: a custom logo is drawn raw, the
                // bundled one keeps its rounded, lightly shadowed tile
                // (NotesHeader.jsx:265-279).
                val customLogo = brandingLogo?.let { rememberDecodedImage(it) }
                if (customLogo != null) {
                    Image(
                        bitmap = customLogo,
                        contentDescription = appName,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.size(28.dp),
                    )
                } else {
                    Image(
                        painter = painterResource(id = R.drawable.glasskeep_logo),
                        contentDescription = appName,
                        modifier = Modifier
                            .size(28.dp)
                            .shadow(1.dp, RoundedCornerShape(12.dp))
                            .clip(RoundedCornerShape(12.dp)),
                    )
                }
                Spacer(Modifier.width(clusterGap))
                Column(Modifier.weight(1f)) {
                    Text(
                        appName,
                        color = titleColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        lineHeight = 28.sp,
                        maxLines = 1,
                        softWrap = false,
                    )
                    Row(
                        modifier = Modifier.widthIn(max = 160.dp).height(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val accentColor = chrome.accent
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
                            lineHeight = 16.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (offline) OfflinePill(dark)
                }
                val searchLabel = stringResource(R.string.native_notes_search)
                HeaderButton(size = compactButton, label = searchLabel, tooltip = null, onClick = onOpenSearch) {
                    SearchIcon(size = 20.dp, tint = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565))
                }
                Spacer(Modifier.width(4.dp))
                val notificationsLabel = stringResource(R.string.native_notifications_title)
                HeaderButton(size = 36.dp, label = notificationsLabel, tooltip = notificationsLabel, onClick = onOpenNotifications) {
                    val bellTint = if (dark) Color(0xFF9C9DDB) else Color(0xFF6366F1)
                    if (notificationsOpen) BellFilledIcon(size = 20.dp, tint = bellTint) else BellIcon(size = 20.dp, tint = bellTint)
                    // .gk-notif-bell-dot: a plain red dot, never a count
                    // (the web dropped the counter with the read/unread
                    // distinction, see NotificationBell.jsx:56-59).
                    if (hasUnreadNotifications) {
                        NotificationDot(dark, Modifier.align(Alignment.TopEnd).padding(top = 2.dp, end = 2.dp))
                    }
                }
                Spacer(Modifier.width(buttonGap))
                SyncStatusButton(
                    state = syncState,
                    queued = queuedCount,
                    locked = instanceLocked,
                    dark = dark,
                    onClick = onOpenSyncStatus,
                )
                Spacer(Modifier.width(buttonGap))
                if (qrQuickEnabled) {
                    val qrLabel = stringResource(R.string.native_settings_qr_signin)
                    HeaderButton(size = 32.dp, label = qrLabel, tooltip = qrLabel, onClick = onOpenQrScanner) {
                        QrQuickIcon(size = 20.dp, tint = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153))
                    }
                }
                val menuLabel = stringResource(R.string.native_header_menu)
                HeaderButton(size = compactButton, label = menuLabel, tooltip = menuLabel, onClick = { onMenuOpenChange(!menuOpen) }) {
                    // The dots step aside while the panel is open: on a
                    // phone the web anchors it right over the button
                    // (NotesHeader.jsx:624-627).
                    if (!menuOpen) KebabIcon(size = 20.dp, tint = titleColor)
                    if (hasServerUpdate) {
                        ServerUpdateDot(
                            size = 10.dp,
                            ringColor = if (dark) Color(0xFF1E2939) else Color.White,
                            modifier = Modifier.align(Alignment.TopEnd).padding(top = 4.dp, end = 4.dp),
                        )
                    }
                    HeaderMenu(
                        expanded = menuOpen,
                        dark = dark,
                        listView = listView,
                        hasServerUpdate = hasServerUpdate,
                        onDismiss = { onMenuOpenChange(false) },
                        onOpenSettings = { onMenuOpenChange(false); onOpenSettings() },
                        showAdmin = showAdmin,
                        onOpenAdmin = { onMenuOpenChange(false); onOpenAdmin() },
                        onToggleViewMode = { onMenuOpenChange(false); onToggleViewMode() },
                        onToggleDark = { onMenuOpenChange(false); onToggleDark() },
                        onEnterSelection = { onMenuOpenChange(false); onEnterSelection() },
                        onOpenQrScanner = { onMenuOpenChange(false); onOpenQrScanner() },
                        showLockInstance = showLockInstance,
                        onLockInstance = { onMenuOpenChange(false); onLockInstance() },
                        onSignOut = { onMenuOpenChange(false); onSignOut() },
                    )
                }
            }
            if (searchOpen) {
                HeaderSearchLayer(
                    query = searchQuery,
                    onQueryChange = onSearchQueryChange,
                    onClear = onCloseSearch,
                    aiAssistantEnabled = aiAssistantEnabled,
                    onAskAi = onAskAi,
                    focusRequest = searchFocusRequest,
                    dark = dark,
                    textColor = titleColor,
                    modifier = Modifier.matchParentSize(),
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(chrome.chromeBorder))
    }
}

/** One of the header's round icon buttons: no press feedback, since the
 *  web's only feedback is a hover style a phone never shows. */
@Composable
private fun HeaderButton(
    size: Dp,
    label: String,
    tooltip: String?,
    onClick: () -> Unit,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = Modifier
            .size(size)
            .semantics { contentDescription = label }
            .then(if (tooltip != null) Modifier.gkTooltip(tooltip) else Modifier)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/** `.gk-notif-bell-dot`: a 9px red dot with a 2px ring around it. */
@Composable
private fun NotificationDot(dark: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(13.dp)
            .background(if (dark) Color(0xFA1C1C22) else Color(0xF5FFFFFF), CircleShape)
            .padding(2.dp)
            .background(Color(0xFFEF4444), CircleShape),
    )
}

/** The admin's "update available" dot: emerald-500 with a 2px ring, over
 *  an emerald-400 halo that keeps pinging outwards (`animate-ping`). */
@Composable
private fun ServerUpdateDot(size: Dp, ringColor: Color, modifier: Modifier = Modifier) {
    val ping by rememberInfiniteTransition(label = "updatePing").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            keyframes {
                durationMillis = 1_000
                0f at 0 using GkEaseOut
                1f at 750
            },
        ),
        label = "updatePingProgress",
    )
    Box(modifier.size(size)) {
        Box(
            Modifier
                .matchParentSize()
                .graphicsLayer {
                    scaleX = 1f + ping
                    scaleY = 1f + ping
                    alpha = 0.75f * (1f - ping)
                }
                .background(Color(0xFF00D492), CircleShape),
        )
        Box(
            Modifier
                .matchParentSize()
                .drawBehind { drawCircle(ringColor, radius = this.size.minDimension / 2f + 2.dp.toPx()) }
                .background(Color(0xFF00BC7D), CircleShape),
        )
    }
}

/** The "offline" pill that hangs 3px under the title block, positioned
 *  like the web's absolute one: it takes no room in the row. */
@Composable
private fun OfflinePill(dark: Boolean) {
    val shape = RoundedCornerShape(999.dp)
    Text(
        stringResource(R.string.native_header_offline),
        color = if (dark) Color(0xFFFFB86A) else Color(0xFFCA3500),
        fontSize = 11.sp,
        lineHeight = 11.sp,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        softWrap = false,
        modifier = Modifier
            .layout { measurable, _ ->
                val placeable = measurable.measure(Constraints())
                layout(0, 0) { placeable.place(0, 3.dp.roundToPx()) }
            }
            .clip(shape)
            .background(Color(0x1AF54900))
            .border(1.dp, Color(0x33F54900), shape)
            .padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

/**
 * The phone search (NotesHeader.jsx:391-441): a layer over the whole
 * header, the header's own content left underneath, blurred. One rounded
 * field with a thin ring that turns into a 2px indigo one while focused;
 * inside it on the right, the assistant's button once there is a question
 * and a "×" that clears and closes the search.
 */
@Composable
private fun HeaderSearchLayer(
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit,
    aiAssistantEnabled: Boolean,
    onAskAi: (String) -> Unit,
    focusRequest: Int,
    dark: Boolean,
    textColor: Color,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(focusRequest) {
        if (focusRequest > 0) {
            focusRequester.requestFocus()
            keyboard?.show()
        }
    }
    var focused by remember { mutableStateOf(false) }
    val ringWidth by animateDpAsState(
        targetValue = if (focused) 2.dp else 1.dp,
        animationSpec = tween(150, easing = GkStandardEasing),
        label = "searchRingWidth",
    )
    val ringColor by animateColorAsState(
        targetValue = if (focused) Color(0xFF615FFF) else Color(0x2690A1B9),
        animationSpec = tween(150, easing = GkStandardEasing),
        label = "searchRingColor",
    )
    Box(
        modifier = modifier
            // The layer itself keeps the covered buttons out of reach.
            .pointerInput(Unit) { awaitEachGesture { awaitFirstDown(requireUnconsumed = false) } }
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            singleLine = true,
            textStyle = TextStyle(color = textColor, fontSize = 14.sp, lineHeight = 20.sp),
            cursorBrush = SolidColor(textColor),
            // Enter sends the question rather than just dismissing the
            // keyboard, same as the web.
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(
                onSearch = { if (aiAssistantEnabled && query.isNotBlank()) onAskAi(query) },
            ),
            modifier = Modifier
                .fillMaxWidth()
                .height(38.dp)
                .focusRequester(focusRequester)
                .onFocusChanged { focused = it.isFocused }
                .drawBehind {
                    // A CSS ring: drawn outside the 8px-rounded box.
                    val width = ringWidth.toPx()
                    drawRoundRect(
                        color = ringColor,
                        topLeft = Offset(-width / 2f, -width / 2f),
                        size = Size(size.width + width, size.height + width),
                        cornerRadius = CornerRadius(8.dp.toPx() + width / 2f),
                        style = Stroke(width = width),
                    )
                },
            decorationBox = { innerTextField ->
                // pl-3 and pr-8 (pr-16 with the assistant) inside the
                // input's transparent 1px border.
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 13.dp, end = if (aiAssistantEnabled) 65.dp else 33.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (query.isEmpty()) {
                        Text(
                            stringResource(
                                if (aiAssistantEnabled) R.string.native_notes_search_or_ask
                                else R.string.native_notes_search_placeholder,
                            ),
                            color = if (dark) DarkSubtextColor else LightSubtextColor,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Clip,
                        )
                    }
                    innerTextField()
                }
            },
        )
        Row(
            modifier = Modifier.align(Alignment.CenterEnd).padding(end = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (aiAssistantEnabled && query.isNotBlank()) {
                val askAiLabel = stringResource(R.string.native_notes_ask_ai)
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .semantics { contentDescription = askAiLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onAskAi(query) },
                    contentAlignment = Alignment.Center,
                ) {
                    AskAiIcon(size = 16.dp, tint = Color(0xFF4F39F6))
                }
            }
            if (query.isNotEmpty()) {
                val clearLabel = stringResource(R.string.native_notes_search_clear)
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .semantics { contentDescription = clearLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onClear() },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "×",
                        color = if (dark) Color(0xFFD1D5DC) else Color(0xFF6A7282),
                        fontSize = 16.sp,
                        lineHeight = 16.sp,
                    )
                }
            }
        }
    }
}

/** The search field's backdrop-blur-xl over the header content. Blur
 *  needs Android 12; below it the covered content is hidden instead. */
private fun Modifier.searchBackdrop(): Modifier =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) blur(cssBlur(24.dp)) else alpha(0f)

/**
 * header.glass-card's `0 1px 2px S, 0 6px 18px -12px S` on a phone,
 * painted as the strip it casts under the header: each CSS shadow is the
 * header's box blurred with a standard deviation of half its blur, moved
 * down and shrunk by its spread.
 */
private fun Modifier.headerDropShadow(color: Color): Modifier = drawBehind {
    val stops = Array(HeaderShadowSteps + 1) { step ->
        val fraction = step.toFloat() / HeaderShadowSteps
        val depth = fraction * HeaderShadowDepth.value
        val near = color.alpha * gaussianCdf(1f - depth)
        val far = color.alpha * gaussianCdf(-(depth + 6f) / 9f)
        fraction to color.copy(alpha = 1f - (1f - near) * (1f - far))
    }
    val depthPx = HeaderShadowDepth.toPx()
    drawRect(
        brush = Brush.verticalGradient(*stops, startY = size.height, endY = size.height + depthPx),
        topLeft = Offset(0f, size.height),
        size = Size(size.width, depthPx),
    )
}

private val HeaderShadowDepth = 16.dp
private const val HeaderShadowSteps = 16

/**
 * The assistant's answer, above the notes (NotesComposer.jsx:89-160): a
 * near-opaque card under a faint indigo-to-purple wash, a thin progress bar
 * and a pulsing "thinking" line while the model works, then the answer and
 * the cards of the notes it leant on.
 */
@Composable
private fun AiAnswerCard(
    answer: String?,
    loading: Boolean,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    citedNotes: List<NoteEntity>,
    typography: TypographyProfile,
    taskStrike: Boolean,
    onOpenNote: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    val headingColor = if (dark) Color(0xFFA3B3FF) else Color(0xFF432DD7)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .shadow(elevation = 2.dp, shape = shape, ambientColor = CardShadowTint.copy(alpha = 0.06f), spotColor = CardShadowTint.copy(alpha = 0.06f))
            .clip(shape)
            .background(if (dark) Color(0xEB282828) else Color(0xEBFFFFFF))
            .background(
                cssToBottomRightGradient(
                    if (dark) listOf(Color(0x4D1E1A4D), Color(0x4D3C0366)) else listOf(Color(0x80EEF2FF), Color(0x80FAF5FF)),
                ),
            )
            .border(1.dp, if (dark) CardBorderDark else CardBorderLight, shape)
            .then(
                if (loading) {
                    // The request reports no progress, so the bar keeps its
                    // 5% minimum along the top.
                    Modifier.drawBehind {
                        val border = 1.dp.toPx()
                        drawRect(
                            color = Color(0xFF615FFF),
                            topLeft = Offset(border, border),
                            size = Size((size.width - 2 * border) * 0.05f, 4.dp.toPx()),
                        )
                    }
                } else {
                    Modifier
                },
            )
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AiSparklesIcon(size = 20.dp, tint = if (dark) Color(0xFF7C86FF) else Color(0xFF4F39F6))
            Spacer(Modifier.width(8.dp))
            Text(
                stringResource(R.string.native_notes_ai_assistant),
                color = headingColor,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            if (!loading && answer != null) {
                val clearLabel = stringResource(R.string.native_notes_ai_clear)
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .semantics { contentDescription = clearLabel }
                        .gkTooltip(clearLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onDismiss() },
                    contentAlignment = Alignment.Center,
                ) {
                    CloseIcon(size = 24.dp, tint = titleColor)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        if (loading) {
            AiThinkingLine()
        } else if (answer != null) {
            RichTextReader(
                blocks = remember(answer) { MarkdownDoc.toRichBlocks(answer) },
                typography = TypographyPresets.DEFAULT.activeProfile,
                taskStrike = false,
                dark = dark,
                titleColor = if (dark) Color(0xFFE5E7EB) else Color(0xFF1E2939),
                compact = true,
            )
        }
        if (!loading && citedNotes.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(Color(0xFF615FFF).copy(alpha = 0.2f)),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(R.string.native_notes_ai_cited).uppercase(),
                color = headingColor.copy(alpha = 0.8f),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.3.sp,
            )
            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                for (note in citedNotes) {
                    NoteCard(
                        note = note,
                        dark = dark,
                        titleColor = titleColor,
                        subtextColor = subtextColor,
                        onClick = { onOpenNote(note.id) },
                        typography = typography,
                        taskStrike = taskStrike,
                    )
                }
            }
        }
    }
}

/** The pulsing italic "thinking" line with its bouncing indigo dot. */
@Composable
private fun AiThinkingLine() {
    val pulse = rememberPulseAlpha()
    // animate-bounce: up by a quarter of its height and back each second,
    // falling in on cubic-bezier(.8,0,1,1) and rising out on (0,0,.2,1).
    val bounce by rememberInfiniteTransition(label = "aiDotBounce").animateFloat(
        initialValue = -0.25f,
        targetValue = -0.25f,
        animationSpec = infiniteRepeatable(
            keyframes {
                durationMillis = 1_000
                -0.25f at 0 using CubicBezierEasing(0.8f, 0f, 1f, 1f)
                0f at 500 using GkEaseOut
            },
        ),
        label = "aiDotOffset",
    )
    Row(Modifier.graphicsLayer { alpha = pulse.value }, verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(8.dp)
                .graphicsLayer { translationY = bounce * size.height }
                .background(Color(0xFF615FFF), CircleShape),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            stringResource(R.string.native_notes_ai_thinking),
            color = Color(0xFF6A7282),
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontStyle = FontStyle.Italic,
        )
    }
}

/**
 * The header's own menu (NotesHeader.jsx:637-738). Deliberately not a
 * Material DropdownMenu: the web's panel has its own geometry (its top
 * right corner sits on the kebab's, it hugs its widest row, and scrolls
 * past 72% of the screen) and its own row shape (16sp label, 12dp gap, one
 * accent colour per action), including the admin-only entry. It appears
 * and goes without animation, and its rows give no press feedback.
 */
@Composable
private fun HeaderMenu(
    expanded: Boolean,
    dark: Boolean,
    listView: Boolean,
    hasServerUpdate: Boolean,
    showLockInstance: Boolean,
    showAdmin: Boolean,
    onDismiss: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenAdmin: () -> Unit,
    onToggleViewMode: () -> Unit,
    onToggleDark: () -> Unit,
    onEnterSelection: () -> Unit,
    onOpenQrScanner: () -> Unit,
    onLockInstance: () -> Unit,
    onSignOut: () -> Unit,
) {
    if (!expanded) return
    val configuration = LocalConfiguration.current
    val shape = RoundedCornerShape(8.dp)
    Popup(
        alignment = Alignment.TopEnd,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(
            modifier = Modifier
                // Hugs the widest row's own intrinsic width (NotesHeader.jsx's
                // own w-max) instead of stretching to the cap below: without
                // IntrinsicSize.Max here, each row's fillMaxWidth() would pull
                // the Column out to the full cap regardless of content length.
                .width(IntrinsicSize.Max)
                // The mobile web popover is a compact, right-aligned card;
                // it does not turn into a near full-width dialog. This is
                // only a ceiling now, not the width itself.
                .widthIn(max = minOf(298.dp, (configuration.screenWidthDp - 26).dp))
                .heightIn(max = (configuration.screenHeightDp * 0.72f).dp)
                .shadow(6.dp, shape, clip = false)
                .clip(shape)
                .background(if (dark) Color(0xFF222222) else Color.White)
                .border(1.dp, if (dark) DarkBorderColor else LightBorderColor, shape)
                .verticalScroll(rememberScrollState()),
        ) {
            HeaderMenuItem(
                label = stringResource(R.string.native_settings_title),
                iconTint = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
                dark = dark,
                onClick = onOpenSettings,
            ) { tint -> SettingsIcon(size = 20.dp, tint = tint) }
            HeaderMenuItem(
                label = stringResource(
                    if (listView) R.string.native_notes_grid_view else R.string.native_notes_list_view
                ),
                iconTint = if (dark) Color(0xFF51A2FF) else Color(0xFF155DFC),
                dark = dark,
                onClick = onToggleViewMode,
            ) { tint ->
                if (listView) GridIcon(size = 20.dp, tint = tint) else ListIcon(size = 20.dp, tint = tint)
            }
            HeaderMenuItem(
                label = stringResource(
                    if (dark) R.string.native_notes_light_mode else R.string.native_notes_dark_mode
                ),
                iconTint = if (dark) Color(0xFFFFB900) else Color(0xFF4F39F6),
                dark = dark,
                onClick = onToggleDark,
            ) { tint ->
                if (dark) SunIcon(size = 20.dp, tint = tint) else MoonIcon(size = 20.dp, tint = tint)
            }
            HeaderMenuItem(
                label = stringResource(R.string.native_notes_select_mode),
                iconTint = if (dark) Color(0xFFA684FF) else Color(0xFF7F22FE),
                dark = dark,
                onClick = onEnterSelection,
            ) { tint -> CheckSquareIcon(size = 20.dp, tint = tint) }
            HeaderMenuItem(
                label = stringResource(R.string.native_qr_scan_title),
                iconTint = if (dark) Color(0xFF00D5BE) else Color(0xFF009689),
                dark = dark,
                onClick = onOpenQrScanner,
            ) { tint ->
                // A 24px Tabler glyph in an inline box whose line box is 31px
                // tall, glyph at its top: this row is 7px taller than the rest.
                Box(Modifier.size(width = 24.dp, height = 31.dp)) {
                    QrCodeIcon(size = 24.dp, tint = tint, modifier = Modifier.align(Alignment.TopStart))
                }
            }
            // The whole row is red on the web, glyph and label alike.
            val signOutColor = if (dark) Color(0xFFFF6467) else Color(0xFFE7000B)
            if (showAdmin) {
                HeaderMenuItem(
                    label = stringResource(R.string.native_notes_admin_panel),
                    iconTint = signOutColor,
                    dark = dark,
                    onClick = onOpenAdmin,
                ) { tint ->
                    Box {
                        ShieldCheckIcon(size = 20.dp, tint = tint)
                        if (hasServerUpdate) {
                            ServerUpdateDot(
                                size = 8.dp,
                                ringColor = if (dark) Color(0xFF222222) else Color.White,
                                modifier = Modifier.align(Alignment.TopEnd),
                            )
                        }
                    }
                }
            }
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
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon(iconTint)
        Spacer(Modifier.width(12.dp))
        Text(
            label,
            color = labelColor ?: if (dark) Color(0xFFF3F4F6) else Color(0xFF1E2939),
            fontSize = 16.sp,
            maxLines = 1,
        )
    }
}

// "Pinned"/"Others" group labels above the grid below, matching
// NotesSections.jsx's own gk-section-label (uppercase, 12sp/600 on a 16sp
// line, 4dp start margin, 12dp bottom margin before the cards start).
@Composable
private fun SectionLabel(text: String, color: Color) {
    Text(
        text.uppercase(),
        color = color,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 4.dp, bottom = 12.dp),
    )
}

/** Mobile branch of react-masonry-css's `items.map((item, index) =>
 * column[index % 2])`. Keeping the columns in one shared scroll surface
 * reproduces both its order and its independent vertical packing. In the
 * grid every card keeps its 12px bottom margin, the last one included;
 * the list's space-y-6 has none after the last card. */
@Composable
private fun NotesMasonry(
    notes: List<NoteEntity>,
    listView: Boolean,
    renderNoteCard: @Composable (NoteEntity) -> Unit,
) {
    if (listView) {
        Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
            for (note in notes) renderNoteCard(note)
        }
        return
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            notes.forEachIndexed { index, note -> if (index % 2 == 0) renderNoteCard(note) }
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            notes.forEachIndexed { index, note -> if (index % 2 == 1) renderNoteCard(note) }
        }
    }
}

// Violet-tinted card shadow, standing in for the web card's own
// `box-shadow: 0 2px 8px rgba(139, 92, 246, 0.06)`. Compose's shadow
// API doesn't take a CSS-style low-alpha shadow color directly, so this
// is the closest native equivalent, not a byte-for-byte port.
private val CardShadowTint = Color(0xFF8B5CF6)

// useNoteTouchDrag.js's timings: hold 300ms (moving over 10px first gives
// the touch to the scroll), then the drag is dropped when the finger has
// not moved 600ms after it began, or 3s after its last move.
private const val ReorderHoldMs = 300L
private const val ReorderNoMoveMs = 600L
private const val ReorderIdleMs = 3_000L
private val ReorderSlop = 10.dp

// `.drag-over`: a 2.5px dashed indigo outline 4px outside the card, whose
// offset and colour ease in over 150ms. Chromium dashes it at 3x its width
// with gaps of 2x.
private val DropOutlineWidth = 2.5.dp
private val DropOutlineOffset = 4.dp
private val DropOutlineColor = Color(0xFF6366F1)

/** Wraps NoteCard with the touch reordering of the notes list, leaving
 *  NoteCard itself untouched: ArchivedNotesScreen.kt/SecondaryNotesScreen.kt
 *  render plain NoteCards with no reorder concept (see NoteEntity.position's
 *  own doc comment - those screens aren't Room-backed or position-aware),
 *  so the gesture plumbing has no business being on NoteCard itself.
 *
 *  Like the web, the held card stays in place, dimmed to 35% and 97%, and
 *  the card under the finger gets the dashed drop outline. The bounds
 *  reported up are the card's unclipped window bounds, dropped when the
 *  card leaves the list. */
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
    typography: TypographyProfile,
    taskStrike: Boolean,
    loadDetail: suspend (String) -> NoteDto?,
    themeId: String?,
    isDragged: Boolean,
    isDragOver: Boolean,
    onBoundsChanged: (Rect?) -> Unit,
    onDragStart: (Offset) -> Unit,
    onDragMove: (Offset) -> Unit,
    onDrop: () -> Unit,
    onDragCancel: () -> Unit,
) {
    val currentOnBoundsChanged by rememberUpdatedState(onBoundsChanged)
    val currentOnDragStart by rememberUpdatedState(onDragStart)
    val currentOnDragMove by rememberUpdatedState(onDragMove)
    val currentOnDrop by rememberUpdatedState(onDrop)
    val currentOnDragCancel by rememberUpdatedState(onDragCancel)
    DisposableEffect(note.id) { onDispose { currentOnBoundsChanged(null) } }
    var windowOrigin by remember { mutableStateOf(Offset.Zero) }
    val dimAlpha by animateFloatAsState(
        targetValue = if (isDragged) 0.35f else 1f,
        animationSpec = tween(150, easing = CssEase),
        label = "dragAlpha",
    )
    val dimScale by animateFloatAsState(
        targetValue = if (isDragged) 0.97f else 1f,
        animationSpec = tween(150, easing = CssEase),
        label = "dragScale",
    )
    val outline = remember { Animatable(0f) }
    LaunchedEffect(isDragOver) {
        if (isDragOver) {
            outline.snapTo(0f)
            outline.animateTo(1f, tween(150, easing = CssEase))
        }
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .onGloballyPositioned { coordinates ->
                windowOrigin = coordinates.positionInWindow()
                currentOnBoundsChanged(Rect(windowOrigin, coordinates.size.toSize()))
            }
            .then(
                if (selectionMode) {
                    Modifier
                } else {
                    Modifier.pointerInput(note.id) {
                        detectNoteReorder(
                            onStart = { position -> currentOnDragStart(windowOrigin + position) },
                            onMove = { position -> currentOnDragMove(windowOrigin + position) },
                            onDrop = { currentOnDrop() },
                            onCancel = { currentOnDragCancel() },
                        )
                    }
                },
            )
            .drawWithContent {
                drawContent()
                if (isDragOver) {
                    val progress = outline.value
                    val width = DropOutlineWidth.toPx()
                    val inset = DropOutlineOffset.toPx() * progress + width / 2f
                    drawRoundRect(
                        color = lerp(titleColor, DropOutlineColor, progress),
                        topLeft = Offset(-inset, -inset),
                        size = Size(size.width + 2 * inset, size.height + 2 * inset),
                        cornerRadius = CornerRadius(12.dp.toPx() + inset),
                        style = Stroke(width = width, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3 * width, 2 * width))),
                    )
                }
            }
            .graphicsLayer {
                alpha = dimAlpha
                scaleX = dimScale
                scaleY = dimScale
            },
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
            typography = typography,
            taskStrike = taskStrike,
            loadDetail = loadDetail,
            themeId = themeId,
        )
    }
}

/**
 * useNoteTouchDrag.js's gesture. The first 300ms are only watched: a
 * release leaves the tap to the card and a move leaves the touch to the
 * scroll. Past them the drag owns the touch, so nothing scrolls and the
 * card's tap never fires; a release drops, a finger that stops moving
 * cancels.
 */
private suspend fun PointerInputScope.detectNoteReorder(
    onStart: (Offset) -> Unit,
    onMove: (Offset) -> Unit,
    onDrop: () -> Unit,
    onCancel: () -> Unit,
) = awaitEachGesture {
    val down = awaitFirstDown(requireUnconsumed = false)
    val slop = ReorderSlop.toPx()
    var position = down.position
    val interrupted = withTimeoutOrNull(ReorderHoldMs) {
        while (true) {
            val change = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id } ?: break
            position = change.position
            if (!change.pressed || change.isConsumed) break
            if (abs(position.x - down.position.x) > slop || abs(position.y - down.position.y) > slop) break
        }
    }
    if (interrupted != null) return@awaitEachGesture
    onStart(position)
    var deadline = SystemClock.uptimeMillis() + ReorderNoMoveMs
    while (true) {
        val remaining = deadline - SystemClock.uptimeMillis()
        val event = if (remaining > 0) withTimeoutOrNull(remaining) { awaitPointerEvent(PointerEventPass.Initial) } else null
        if (event == null) {
            onCancel()
            consumeUntilUp(down.id)
            return@awaitEachGesture
        }
        val change = event.changes.firstOrNull { it.id == down.id } ?: continue
        change.consume()
        if (!change.pressed) {
            onDrop()
            return@awaitEachGesture
        }
        if (change.positionChanged()) {
            deadline = SystemClock.uptimeMillis() + ReorderIdleMs
            onMove(change.position)
        }
    }
}

/** What is left of a touch whose drag was dropped does nothing. */
private suspend fun AwaitPointerEventScope.consumeUntilUp(pointerId: PointerId) {
    while (true) {
        val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == pointerId } ?: continue
        change.consume()
        if (!change.pressed) return
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
    typography: TypographyProfile = TypographyPresets.DEFAULT.activeProfile,
    taskStrike: Boolean = false,
    loadDetail: (suspend (String) -> NoteDto?)? = null,
    themeId: String? = null,
) {
    val borderColor = if (dark) CardBorderDark else CardBorderLight
    // The list cache keeps only light columns; images and collaborators
    // live in the cached full note.
    val detail by produceState<NoteDto?>(null, note.id, note.updatedAt, loadDetail) {
        value = loadDetail?.invoke(note.id)
    }
    val images = remember(detail) { detail?.let { NoteImages.parse(it.images) }.orEmpty() }
    val collaborators = detail?.collaborators.orEmpty()
    val showCollaborators = detail != null && (collaborators.isNotEmpty() || detail?.access != "owner")
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
                .padding(9.dp),
        ) {
            if (note.title.isNotBlank()) {
                Text(
                    note.title,
                    color = titleColor,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(end = if (!selectionMode && note.iconSrc != null) 32.dp else 0.dp),
                )
                Spacer(Modifier.height(8.dp))
            }

            if (images.isNotEmpty()) {
                CardImageGrid(images = images, subtextColor = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282))
                Spacer(Modifier.height(12.dp))
            }

            if (note.type == "checklist") {
                ChecklistCardPreview(note = note, titleColor = titleColor, dark = dark)
            } else if (note.type == "draw") {
                DrawingCardPreview(note = note, dark = dark, typography = typography, taskStrike = taskStrike, titleColor = titleColor)
            } else if (note.type == "audio") {
                AudioCardPreview(note = note, dark = dark, titleColor = titleColor)
            } else {
                val previewBlocks = remember(note.content) {
                    RichDoc.parsePreview(note.content, maxBlocks = 8) ?: run {
                        val richDoc = NoteContent.parseRichDoc(note.content)
                        val raw = richDoc?.let { NoteContent.docToPlainText(it) } ?: note.content
                        val source = if (raw.length > 350) raw.take(350).trimEnd() + "…" else raw
                        MarkdownDoc.toRichBlocks(source).take(8)
                    }
                }
                if (previewBlocks.any { it.text.isNotBlank() || it.kind == com.glasskeep.app.nativeapp.data.RichBlockKind.DIVIDER }) {
                    RichTextReader(
                        blocks = previewBlocks,
                        typography = typography,
                        taskStrike = taskStrike,
                        dark = dark,
                        titleColor = titleColor,
                        compact = true,
                        modifier = Modifier.heightIn(max = 280.dp).clipToBounds(),
                    )
                } else if (note.type != "text") {
                    Text(noteTypeLabel(note.type), color = subtextColor, fontSize = 12.sp)
                }
            }

            val tags = remember(note.tagsJson) { TagsJson.parse(note.tagsJson) }
            if (note.reminderAt != null || tags.isNotEmpty() || showCollaborators) {
                // .note-card-footer (NoteCardFooter.jsx:40): mt-2 pt-1, rows
                // space-y-2 in the order reminder, tags.
                Column(
                    modifier = Modifier.padding(top = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    note.reminderAt?.let { reminderAt ->
                        ReminderChip(reminderAt = reminderAt, dark = dark, accent = WorkspaceTheme.accent(themeId, false))
                    }
                    if (tags.isNotEmpty()) CardTagChips(tags = tags, dark = dark)
                    if (showCollaborators) CardCollaborators(collaborators = collaborators, dark = dark)
                }
            }
        }

        // The note's own icon, in the corner and out of the way while
        // picking notes (NoteCard.jsx:258): 28dp, letterboxed rather than
        // cropped, over the card content like the checkbox below.
        if (!selectionMode) {
            note.iconSrc?.let { src ->
                rememberDecodedImage(src)?.let { bitmap ->
                    Image(
                        bitmap = bitmap,
                        contentDescription = note.iconName?.takeIf { it.isNotBlank() }
                            ?: stringResource(R.string.native_note_icon),
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.align(Alignment.TopEnd).padding(9.dp).size(28.dp),
                    )
                }
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
                modifier = Modifier.align(Alignment.TopEnd).padding(13.dp),
            )
        }
    }
}

/** NoteCard.jsx:320-336: the caption like a text preview, then
 *  DrawingPreview.jsx: the first three pages' strokes cropped to their
 *  bounds plus 10 units, in a centred box 90% wide. */
@Composable
private fun DrawingCardPreview(
    note: NoteEntity,
    dark: Boolean,
    typography: TypographyProfile,
    taskStrike: Boolean,
    titleColor: Color,
) {
    val drawing = remember(note.content) { DrawingContent.parse(note.content) } ?: return
    val caption = remember(drawing.text) {
        drawing.text?.let { RichDoc.parsePreview(it, maxBlocks = 8) }.orEmpty()
    }
    if (caption.any { it.text.isNotBlank() }) {
        RichTextReader(
            blocks = caption,
            typography = typography,
            taskStrike = taskStrike,
            dark = dark,
            titleColor = titleColor,
            compact = true,
            modifier = Modifier.heightIn(max = 280.dp).clipToBounds(),
        )
        Spacer(Modifier.height(8.dp))
    }
    val dims = drawing.dimensions
    val pageHeight = when {
        dims == null -> Float.MAX_VALUE
        dims.originalHeight != null -> dims.originalHeight
        dims.height > 1000f -> dims.height / 2f
        else -> dims.height
    }
    val strokes = drawing.paths.filter { stroke ->
        stroke.tool != "eraser" && stroke.points.isNotEmpty() && stroke.points.first().y < pageHeight * 3f
    }
    val bounds = remember(strokes) {
        if (strokes.isEmpty()) {
            null
        } else {
            var left = Float.MAX_VALUE
            var top = Float.MAX_VALUE
            var right = -Float.MAX_VALUE
            var bottom = -Float.MAX_VALUE
            strokes.forEach { stroke ->
                val half = stroke.size / 2f
                stroke.points.forEach { p ->
                    left = minOf(left, p.x - half)
                    top = minOf(top, p.y - half)
                    right = maxOf(right, p.x + half)
                    bottom = maxOf(bottom, p.y + half)
                }
            }
            androidx.compose.ui.geometry.Rect(
                (left - 10f).coerceAtLeast(0f),
                (top - 10f).coerceAtLeast(0f),
                right + 10f,
                bottom + 10f,
            )
        }
    }
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        if (bounds == null) {
            val emptyColor = Color(0xFFE5E7EB)
            Box(
                Modifier.fillMaxWidth(0.9f).aspectRatio(800f / 320f).clip(RoundedCornerShape(4.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    val scale = size.width / 800f
                    drawRect(
                        color = emptyColor,
                        topLeft = Offset(10f * scale, 10f * scale),
                        size = Size(size.width - 20f * scale, size.height - 20f * scale),
                        style = Stroke(width = 2f * scale, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f * scale, 5f * scale))),
                    )
                }
                Text(stringResource(R.string.native_card_drawing_empty), color = Color(0xFF9CA3AF), fontSize = 2.sp, lineHeight = 3.sp)
            }
        } else {
            Canvas(
                Modifier
                    .fillMaxWidth(0.9f)
                    .aspectRatio(bounds.width / bounds.height)
                    .clip(RoundedCornerShape(4.dp)),
            ) {
                val scale = size.width / bounds.width
                strokes.forEach { stroke ->
                    val points = stroke.points.map { Offset((it.x - bounds.left) * scale, (it.y - bounds.top) * scale) }
                    drawStroke(points, themedStrokeColor(stroke.color, dark), maxOf(1f, stroke.size) * scale)
                }
            }
        }
    }
}

/** NoteCard.jsx:428-467: up to ten recording rows, then "+N en plus". */
@Composable
private fun AudioCardPreview(note: NoteEntity, dark: Boolean, titleColor: Color) {
    val clips = remember(note.content) { AudioContent.parse(note.content)?.clips.orEmpty() }
    val subtle = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282)
    if (clips.isEmpty()) {
        Text(
            stringResource(R.string.native_card_audio_empty),
            color = subtle,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontStyle = FontStyle.Italic,
        )
        return
    }
    val badge = if (!dark && (note.color.isBlank() || note.color == "default")) Color(0xFFA78BFA) else noteColorFor(note.color, dark)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        clips.take(10).forEachIndexed { index, clip ->
            val rowShape = RoundedCornerShape(8.dp)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(rowShape)
                    .background(if (dark) Color.White.copy(alpha = 0.07f) else Color.Black.copy(alpha = 0.05f))
                    .border(1.dp, if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.06f), rowShape)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            ) {
                Box(
                    Modifier.size(24.dp).shadow(1.dp, CircleShape).clip(CircleShape).background(badge),
                    contentAlignment = Alignment.Center,
                ) {
                    MicIcon(size = 14.dp, tint = Color.White)
                }
                Text(
                    clip.name.ifBlank { stringResource(R.string.native_audio_clip_default_name, index + 1) },
                    color = titleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (clip.duration > 0f) {
                    Text(
                        formatDuration(clip.duration),
                        color = titleColor.copy(alpha = 0.7f),
                        fontSize = 11.sp,
                        lineHeight = 16.5.sp,
                        style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
                    )
                }
            }
        }
        if (clips.size > 10) {
            Text(
                stringResource(R.string.native_card_audio_more, clips.size - 10),
                color = subtle,
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )
        }
    }
}

/** NoteCard.jsx:280-304: up to six thumbnails, one full width or two per
 *  row, each capped at 200dp high and letterboxed, then a "+N" line. */
@Composable
private fun CardImageGrid(images: List<NoteImageData>, subtextColor: Color) {
    val shown = images.take(6)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        shown.chunked(if (shown.size == 1) 1 else 2).forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.height(IntrinsicSize.Max),
            ) {
                row.forEach { image ->
                    val bitmap = rememberDecodedImage(image.src)
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(8.dp)),
                    ) {
                        if (bitmap != null) {
                            Image(
                                bitmap = bitmap,
                                contentDescription = image.name,
                                contentScale = ContentScale.Fit,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 200.dp)
                                    .aspectRatio(bitmap.width.toFloat() / bitmap.height, matchHeightConstraintsFirst = false),
                            )
                        }
                    }
                }
                if (row.size == 1 && shown.size > 1) Spacer(Modifier.weight(1f))
            }
        }
        if (images.size > 6) {
            val extra = images.size - 6
            Text(
                stringResource(if (extra == 1) R.string.native_card_more_image else R.string.native_card_more_images, extra),
                color = subtextColor,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            )
        }
    }
}

/** NoteCardFooter.jsx:72-101: people glyph then up to two overlapping
 *  24dp avatars and a "+N" disc, right-aligned. */
@Composable
private fun CardCollaborators(collaborators: List<CollaboratorDto>, dark: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CollaborateIcon(size = 16.dp, tint = if (dark) Color(0xFF7C86FF) else Color(0xFF615FFF))
        Spacer(Modifier.width(4.dp))
        collaborators.take(2).forEachIndexed { index, person ->
            val photo = person.avatarUrl?.takeIf { it.startsWith("data:") }?.let { rememberDecodedImage(it) }
            Box(
                modifier = Modifier
                    .offset(x = (-6 * index).dp)
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(
                        when {
                            photo != null -> Color.White
                            dark -> Color(0x406060FF)
                            else -> Color(0xFFE0E7FF)
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (photo != null) {
                    Image(photo, contentDescription = person.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Text(
                        person.name.trim().take(1).uppercase(),
                        color = if (dark) Color(0xFFA3B3FF) else Color(0xFF432DD7),
                        fontSize = 8.sp,
                        lineHeight = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        if (collaborators.size > 2) {
            Box(
                modifier = Modifier
                    .offset(x = (-12).dp)
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(if (dark) Color(0xFF4A5565) else Color(0xFFE5E7EB)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "+${collaborators.size - 2}",
                    color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                    fontSize = 11.sp,
                    lineHeight = 16.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

/** NoteCardFooter.jsx:49-70: at most three tag pills, then a "+N" pill. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CardTagChips(tags: List<String>, dark: Boolean) {
    val chipBg = if (dark) Color(0xFF364153) else Color(0xFFE5E7EB)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        tags.take(3).forEach { tag ->
            Text(
                tag,
                color = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153),
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .widthIn(max = 140.dp)
                    .clip(CircleShape)
                    .background(chipBg)
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
        if (tags.size > 3) {
            Text(
                "+${tags.size - 3}",
                color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(chipBg.copy(alpha = 0.7f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
    }
}

/** Mirrors NoteReminderChip.jsx: a neutral pill, bell glyph, muted once the
 *  instant has passed, an accent tint while it's still upcoming. */
@Composable
private fun ReminderChip(reminderAt: String, dark: Boolean, accent: Color) {
    val label = formatReminderLabel(reminderAt)
    if (label.isBlank()) return
    val past = isReminderPast(reminderAt)
    val bg = when {
        !dark -> Color.Black.copy(alpha = 0.06f)
        past -> Color.White.copy(alpha = 0.08f)
        else -> Color.White.copy(alpha = 0.10f)
    }
    val fg = when {
        past -> if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282)
        else -> if (dark) Color(0xFFA3B3FF) else accent
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        // The .tabler-icon rule (globalCSS.js:3322-3339) beats the chip's
        // w-3 h-3, so the bell really renders 20px.
        BellIcon(size = 20.dp, tint = fg)
        Text(label, color = fg, fontSize = 11.sp, lineHeight = 16.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
    val time = SimpleDateFormat(if (isFrench) "HH:mm" else "hh:mm a", Locale.getDefault()).format(Date(ms))

    val target = Calendar.getInstance().apply { timeInMillis = ms }
    val now = Calendar.getInstance()
    val tomorrow = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 1) }
    fun sameDay(a: Calendar, b: Calendar) =
        a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)

    return when {
        sameDay(target, now) -> stringResource(R.string.native_reminder_chip_today, time)
        sameDay(target, tomorrow) -> stringResource(R.string.native_reminder_chip_tomorrow, time)
        else -> {
            val sameYear = target.get(Calendar.YEAR) == now.get(Calendar.YEAR)
            val datePattern = when {
                isFrench && sameYear -> "d MMM"
                isFrench -> "d MMM yyyy"
                sameYear -> "MMM d"
                else -> "MMM d, yyyy"
            }
            val date = SimpleDateFormat(datePattern, Locale.getDefault()).format(Date(ms))
            stringResource(R.string.native_reminder_chip_date, date, time)
        }
    }
}

/** Same rule as NoteCard.jsx's own preview: only unchecked items are
 *  listed (what's left to do), capped at a handful, checked ones only
 *  count toward the "done/total" footer. */
@Composable
private fun ChecklistCardPreview(note: NoteEntity, titleColor: Color, dark: Boolean) {
    val entries = remember(note.itemsJson) { ChecklistItems.parseJson(note.itemsJson) }
    val items = remember(entries) { entries.filterIsInstance<ChecklistItemData>() }
    val total = items.size
    val done = items.count { it.done }
    val uncheckedTotal = items.count { !it.done }
    val previewBlocks = remember(entries) {
        var remaining = 4 // NotesSections.jsx: mobile maxPreviewItems
        buildList {
            for (block in ChecklistItems.blocks(entries)) {
                if (remaining <= 0) break
                val section = block.section
                val shown = if (section?.collapsed == true) emptyList() else block.items.filterNot { it.done }.take(remaining)
                remaining -= shown.size
                if (shown.isNotEmpty() || (section != null && section.title.isNotBlank())) add(block.copy(items = shown))
            }
        }
    }
    val shownCount = previewBlocks.sumOf { it.items.size }
    val extra = (uncheckedTotal - shownCount).coerceAtLeast(0)
    val hasTitledSection = previewBlocks.any { it.section?.title?.isNotBlank() == true }

    val footerColor = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (block in previewBlocks) {
            val section = block.section
            val accent = ChecklistSectionColors.firstOrNull { it.first == section?.color }?.second
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (hasTitledSection && section != null && section.title.isNotBlank()) {
                    ChecklistSectionCardHeader(section.title, section.collapsed, accent, titleColor, dark)
                }
                if (block.items.isNotEmpty()) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = if (accent != null) {
                            Modifier
                                .fillMaxWidth()
                                .background(accent.copy(alpha = if (dark) 0.09f else 0.04f))
                                .drawBehind {
                                    drawRect(
                                        color = accent.copy(alpha = if (dark) 0.80f else 0.60f),
                                        size = Size(3.dp.toPx(), size.height),
                                    )
                                }
                                .padding(start = 11.dp)
                        } else Modifier,
                    ) {
                        for (item in block.items) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = if (item.indent == 1) Modifier.padding(start = 20.dp) else Modifier,
                            ) {
                                GkCheckbox(checked = false, onCheckedChange = null, size = 14.dp)
                                Text(
                                    item.text,
                                    color = titleColor,
                                    fontSize = 14.sp,
                                    lineHeight = 20.sp,
                                    maxLines = 3,
                                    overflow = TextOverflow.Ellipsis,
                                    // pb-0.5 plus the 1px transparent border.
                                    modifier = Modifier.weight(1f).padding(bottom = 3.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
        if (extra > 0) {
            Text(
                String.format(stringResource(R.string.native_notes_more_items), extra),
                color = footerColor,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
        Text(
            String.format(stringResource(R.string.native_notes_completed_fraction), done, total),
            color = footerColor,
            fontSize = 12.sp,
            lineHeight = 16.sp,
        )
    }
}

@Composable
private fun ChecklistSectionCardHeader(title: String, collapsed: Boolean, accent: Color?, fallback: Color, dark: Boolean) {
    val tint = accent ?: fallback
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(4.dp))
            .background(accent?.copy(alpha = if (dark) 0.18f else 0.10f) ?: Color.Transparent)
            .drawBehind {
                if (accent != null) {
                    drawRect(
                        color = accent.copy(alpha = if (dark) 0.50f else 0.35f),
                        size = Size(2.dp.toPx(), size.height),
                    )
                }
            }
            .padding(start = if (accent != null) 8.dp else 6.dp, end = 6.dp, top = 2.dp, bottom = 2.dp),
    ) {
        ChevronDownIcon(
            size = 10.dp,
            tint = tint,
            strokeWidth = 2.5f,
            modifier = Modifier.rotate(if (collapsed) -90f else 0f),
        )
        Text(
            title,
            color = tint,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.3.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )
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
