package com.glasskeep.app.nativeapp.ui

import android.content.Context
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.BuildConfig
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NoteExporter
import com.glasskeep.app.nativeapp.data.AiClient
import com.glasskeep.app.nativeapp.data.AiMessage
import com.glasskeep.app.nativeapp.data.AiNoteDto
import com.glasskeep.app.nativeapp.data.AudioClipDto
import com.glasskeep.app.nativeapp.data.AudioContent
import com.glasskeep.app.nativeapp.data.ChecklistEntry
import com.glasskeep.app.nativeapp.data.ChecklistItemData
import com.glasskeep.app.nativeapp.data.ChecklistItems
import com.glasskeep.app.nativeapp.data.DrawingContent
import com.glasskeep.app.nativeapp.data.DrawingDimensionsDto
import com.glasskeep.app.nativeapp.data.DrawingStrokeDto
import com.glasskeep.app.nativeapp.data.NoteContent
import com.glasskeep.app.nativeapp.data.NoteConversion
import com.glasskeep.app.nativeapp.data.NoteImageData
import com.glasskeep.app.nativeapp.data.NoteImages
import com.glasskeep.app.nativeapp.data.RichAlign
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.TagsJson
import com.glasskeep.app.nativeapp.data.formatIso
import com.glasskeep.app.nativeapp.data.network.CollaboratorDto
import com.glasskeep.app.nativeapp.data.network.LogoDto
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.network.NoteIconDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.nativeapp.data.toEntity
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

private val ErrorColor = Color(0xFFdc2626)

/** What the loaded note allows natively, decided once from its content
 *  shape (see RichDoc.parse, then NoteContent.isDocPlainStructure as the
 *  fallback for whatever RichDoc doesn't understand). Title is always
 *  editable for a text note: the original `content` string is resent
 *  untouched when the body itself isn't safe to touch, so a title-only
 *  edit never risks the note's formatting. */
private data class Editability(
    val isTextType: Boolean,
    val bodyEditable: Boolean,
    val isLegacyPlain: Boolean,
    val bodyPlainText: String,
    val isChecklistType: Boolean = false,
    /** The checklist's own entries, rows and section markers in one flat
     *  array (see ChecklistItems). Irrelevant (always null) when
     *  isChecklistType is false. */
    val checklistItems: List<ChecklistEntry>? = null,
    /** True when RichDoc.parse approved the note's content: the real
     *  formatting editor (RichTextEditor) handles it instead of the
     *  plain-text/notice fallback below. [originalRichBlocks] is the
     *  as-loaded snapshot save()/hasChanges diff against, same role
     *  [bodyPlainText] plays for a plain-text note; the live, edited copy
     *  is the top-level `richBlocks` state, same split as bodyText. */
    val isRichEditableType: Boolean = false,
    val originalRichBlocks: List<RichBlock>? = null,
    /** True when DrawingContent.parse approved a "draw" note's content.
     *  The three original* fields are the as-loaded snapshot the drawing
     *  autosave's dimensions/caption fall back on; the live, edited
     *  strokes are the top-level `drawingPaths` state. */
    val isDrawType: Boolean = false,
    val originalDrawingPaths: List<DrawingStrokeDto>? = null,
    val originalDrawingDimensions: DrawingDimensionsDto? = null,
    val originalDrawingCaptionText: String? = null,
    /** True when AudioContent.parse approved an "audio" note's content.
     *  Same autosave-no-button pattern as drawing (see scheduleAudioAutosave),
     *  the live, edited clip list is the top-level `audioClips` state. */
    val isAudioType: Boolean = false,
    val originalAudioClips: List<AudioClipDto>? = null,
    val originalAudioCaptionText: String? = null,
)

/** This same note once the given live editor state has been queued: the
 *  as-loaded snapshots every change check diffs against move up to it. */
private fun Editability.rebaselined(
    blocks: List<RichBlock>?,
    body: String,
    paths: List<DrawingStrokeDto>,
    dimensions: DrawingDimensionsDto?,
    clips: List<AudioClipDto>,
    caption: String?,
): Editability = copy(
    bodyPlainText = if (bodyEditable) body else bodyPlainText,
    originalRichBlocks = if (isRichEditableType || isDrawType) blocks else originalRichBlocks,
    originalDrawingPaths = if (isDrawType) paths else originalDrawingPaths,
    originalDrawingDimensions = if (isDrawType) dimensions else originalDrawingDimensions,
    originalAudioClips = if (isAudioType) clips else originalAudioClips,
    originalAudioCaptionText = if (isAudioType) caption else originalAudioCaptionText,
)

/** One entry in the tag suggestion list: a tag already used on at least one
 *  of this user's notes, and how many. Mirrors App.jsx's tagsWithCounts. */
private data class TagCount(val tag: String, val count: Int)

/** Which block/range a pending Link dialog request targets, and the href
 *  already applied there if any (prefilled, with a Remove option). */
private data class LinkTarget(val blockId: String, val start: Int, val end: Int, val existingHref: String?)

/**
 * Milestone: opening and safely editing a single note, every note type the
 * server knows about. Checklist notes get their own flat editor
 * (ChecklistEditorBody); drawing notes their own canvas (DrawingEditor.kt);
 * audio notes their own recorder/player (AudioClipsSection). A text note's
 * body goes through RichDoc.parse first: bold/italic/underline/strike/
 * link, headings, and bullet/numbered lists are natively editable
 * (RichTextEditor); anything using formatting outside that vocabulary
 * falls back to the read-only notice below rather than guess and silently
 * destroy it. See RichDoc.kt and NoteContent.kt for exactly where that
 * line is drawn.
 */
@Composable
fun NoteDetailScreen(
    container: NativeAppContainer,
    serverUrl: String,
    noteId: String,
    onBack: () -> Unit,
    startInDrawMode: Boolean = false,
) {
    val dark = LocalGkDark.current
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()

    var note by remember { mutableStateOf<NoteDto?>(null) }
    var editability by remember { mutableStateOf<Editability?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }

    var titleText by remember { mutableStateOf("") }
    var bodyText by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    // Every path that queues the live editor state goes through this one
    // lock (explicit save, the debounced autosaves, leaving), so two of
    // them can never both diff against the same stale snapshot.
    val persistLock = remember { Mutex() }

    var pinning by remember { mutableStateOf(false) }
    var archiving by remember { mutableStateOf(false) }
    var restoring by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }
    var showTrashConfirm by remember { mutableStateOf(false) }
    var trashing by remember { mutableStateOf(false) }
    var showPermanentDeleteConfirm by remember { mutableStateOf(false) }
    var deletingPermanently by remember { mutableStateOf(false) }
    var showColorPicker by remember { mutableStateOf(false) }
    var changingColor by remember { mutableStateOf(false) }
    var duplicating by remember { mutableStateOf(false) }
    var showTagsPicker by remember { mutableStateOf(false) }
    var tagInput by remember { mutableStateOf("") }
    var changingTags by remember { mutableStateOf(false) }
    var changingReminder by remember { mutableStateOf(false) }
    var showReminderPicker by remember { mutableStateOf(false) }
    var showFormatSheet by remember { mutableStateOf(false) }
    val contentScroll = rememberScrollState()
    // A checklist drag scrolls the note near the edges of the web's scroll
    // area, which holds the sticky bar too: from the bar's top to the
    // content's bottom. Read by that drag only.
    val stickyBarCoordinates = remember { CoordinatesHolder() }
    val contentCoordinates = remember { CoordinatesHolder() }
    // How far down the note was, as a share of its scroll range, when the
    // read/edit toggle was hit: the other face lands at the same share.
    var modeSwitchScrollRatio by remember { mutableStateOf<Float?>(null) }
    val richEditorState = rememberRichEditorState()
    val history = rememberNoteHistory()
    val keyboardController = LocalSoftwareKeyboardController.current
    // The reminder picker's quick-time chips, shared with the web through
    // the same settings blob; empty until read, which makes the picker
    // fall back on its own defaults.
    var reminderTimeChips by remember { mutableStateOf<List<String>>(emptyList()) }

    // "top"/"bottom", read from this user's own web settings once the note
    // turns out to be a checklist (see LaunchedEffect below); defaults to
    // "top" until then, same as the web's own fresh-install default.
    // The "Done" area's collapsed state is per-device, exactly like the
    // web's own localStorage["ck-done-<noteId>"]: unlike a section's own
    // collapsed flag, it is never synced.
    val checklistPrefs = remember { context.getSharedPreferences("glasskeep_checklist", Context.MODE_PRIVATE) }
    var doneSectionCollapsed by remember(noteId) { mutableStateOf(checklistPrefs.getBoolean("ck-done-$noteId", false)) }
    val checklistFocusRequesters = remember { mutableStateMapOf<String, FocusRequester>() }
    var pendingChecklistFocus by remember { mutableStateOf<String?>(null) }

    // Rich-text blocks (RichDoc.parse-approved text notes only): live,
    // edited copy, saved through the same deferred Save button as
    // title/bodyText rather than immediately, since it's this note's core
    // content just like bodyText is, not a discrete structural action like
    // a tag or a checklist item. See Editability.originalRichBlocks for
    // the as-loaded snapshot this diffs against.
    var richBlocks by remember { mutableStateOf<List<RichBlock>?>(null) }
    val richFocusRequesters = remember { mutableStateMapOf<String, FocusRequester>() }
    var pendingRichFocus by remember { mutableStateOf<String?>(null) }
    // One-shot cursor-position override for mergeRichBlockWithPrevious:
    // the merged block keeps its existing id, so its RichTextBlockField
    // is not freshly created (that's what TextRange.Zero on first
    // composition is for) - this is read once by that exact block's own
    // safety-net LaunchedEffect and removed.
    val pendingRichSelections = remember { mutableStateMapOf<String, TextRange>() }
    var showConvertConfirm by remember { mutableStateOf(false) }
    // readModeEnabled decides which face a text note opens on; the
    // footer toggle flips it for this note only (ModalFooter.jsx:860).
    var viewMode by remember { mutableStateOf(container.editorPrefs.readModeEnabled) }
    var converting by remember { mutableStateOf(false) }
    // The note's own AI conversation. Thrown away when the note closes
    // unless the panel's save button kept it, exactly like the web's own
    // (App.jsx:304-312).
    var noteAiOpen by remember { mutableStateOf(false) }
    var noteAiMessages by remember { mutableStateOf<List<AiMessage>>(emptyList()) }
    var noteAiLoading by remember { mutableStateOf(false) }
    var noteAiError by remember { mutableStateOf<String?>(null) }
    var noteAiSaved by remember { mutableStateOf(false) }
    // The header's AI toggle shows once the panel has been opened, or when
    // the note already has a kept conversation, until the panel's X.
    var noteAiHasBeenOpened by remember { mutableStateOf(false) }
    var noteAiJob by remember { mutableStateOf<Job?>(null) }
    val aiClient = remember(serverUrl) { AiClient(serverUrl, container.tokenStore) }
    var showLinkDialog by remember { mutableStateOf(false) }
    var linkDialogTarget by remember { mutableStateOf<LinkTarget?>(null) }

    // Drawing notes: autosaved (debounced, see scheduleDrawingAutosave)
    // rather than through the shared title/body Save button, matching the
    // web editor's own autosave-while-drawing behavior instead of forcing
    // an explicit-Save mental model onto a continuous gesture.
    var drawingPaths by remember { mutableStateOf<List<DrawingStrokeDto>>(emptyList()) }
    var drawingDimensions by remember { mutableStateOf<DrawingDimensionsDto?>(null) }
    var drawingCaptionText by remember { mutableStateOf<String?>(null) }
    // Web opens drawings on their reading face. The dedicated mode button
    // enters the full canvas; outside it, read/edit applies to the caption.
    var drawingCanvasMode by remember { mutableStateOf(false) }
    var drawingUndoStack by remember { mutableStateOf<List<List<DrawingStrokeDto>>>(emptyList()) }
    var drawingRedoStack by remember { mutableStateOf<List<List<DrawingStrokeDto>>>(emptyList()) }
    var drawingSaveJob by remember { mutableStateOf<Job?>(null) }
    // Pen, colour, size and guides live as long as one draw session, as
    // in the web's draw-mode canvas; the pen's default colour follows the
    // theme.
    val drawingTools = remember(drawingCanvasMode) { DrawingTools(dark) }
    LaunchedEffect(dark) { drawingTools.color = defaultPenColor(dark) }
    // The draw-mode area, in dp: the size a drawing that stores none takes.
    var drawingArea by remember { mutableStateOf(DrawingDimensionsDto(width = 0f, height = 0f)) }

    // Audio notes: same debounced-autosave shape as drawing notes above,
    // see scheduleAudioAutosave.
    var audioClips by remember { mutableStateOf<List<AudioClipDto>>(emptyList()) }
    var audioCaptionText by remember { mutableStateOf<String?>(null) }
    var audioSaveJob by remember { mutableStateOf<Job?>(null) }

    // Content images (text/checklist notes only, see edit.isTextType /
    // isChecklistType below); parsed once on load same as checklist items,
    // not cached in Room (see NotesRepository.setImages).
    var images by remember { mutableStateOf<List<NoteImageData>>(emptyList()) }
    // The image footer button's sub-menu, and the logo library behind its
    // second entry (AddImageMenu.jsx + LogoPickerPopover.jsx).
    var showImageMenu by remember { mutableStateOf(false) }
    var showLogoPicker by remember { mutableStateOf(false) }
    var logos by remember { mutableStateOf<List<LogoDto>>(emptyList()) }
    var changingImages by remember { mutableStateOf(false) }
    var viewerIndex by remember { mutableStateOf<Int?>(null) }
    // The collaboration modal (CollaborationModal.jsx) over the note, and
    // the note's whole roster, owner first: the web's addModalCollaborators,
    // read as the note opens and kept current by the modal.
    var showCollaborators by remember { mutableStateOf(false) }
    var roster by remember { mutableStateOf<List<CollaboratorDto>?>(null) }
    val currentUserId = remember { container.tokenStore.profile?.id }
    val focusManager = LocalFocusManager.current

    // Tag suggestions need every note's tags, not just the open one (same
    // as App.jsx's allNotesForTags -> tagsWithCounts), so this reads the
    // repository's whole local cache, same source NativeNotesListScreen
    // observes for the grid.
    val allNotes by repository.observeNotes().collectAsState(initial = emptyList())
    // Server-computed permission for THIS user on this note (see NoteDto.access's
    // own doc comment): gated here, proactively, rather than only reacting to a
    // rejected write after the fact, both for a better experience and because a
    // silently-queued edit (see SyncQueueWorker.kt) has no synchronous rejection
    // to react to at all anymore. Archive/restore/permanent-delete are owner-only
    // on the server, stricter than the read/write split that gates every other
    // edit here (see server/index.js's getNote vs getNoteWithCollaboration).
    val isReadOnlyAccess = note?.access == "read"
    val isOwnerAccess = note?.access == "owner"
    // NoteModal.jsx's noteReadOnly: a mirrored note whose own server can't
    // be reached is paused exactly like a read-only share (the server
    // refuses the content edits too).
    val isNoteReadOnly = isReadOnlyAccess || note?.federation?.readOnly == true
    // isCollaborativeNote() (useModalState.js:223): shared with someone, or
    // owned by someone else. The server already answers the second half in
    // `access`, so this needs no separate user-id comparison.
    val isCollaborativeNote = !note?.collaborators.isNullOrEmpty() || (note != null && !isOwnerAccess)

    /** A fresh roster also refreshes the note's own list of everyone else
     *  on it, which the footer badge and the delete dialog read. */
    fun applyRoster(fresh: List<CollaboratorDto>) {
        roster = fresh
        note = note?.let { current ->
            val viewerOwns = current.access == "owner"
            current.copy(
                collaborators = fresh.filterNot { if (viewerOwns) it.isOwner else it.id == currentUserId }.ifEmpty { null },
            )
        }
    }

    /** Tapping away from the note puts its keyboard away on the web; here
     *  the editor would otherwise keep the focus under the modal. */
    fun openCollaborators() {
        focusManager.clearFocus()
        showCollaborators = true
    }

    val tagsWithCounts = remember(allNotes) {
        val counts = LinkedHashMap<String, Int>()
        for (n in allNotes) {
            for (rawTag in TagsJson.parse(n.tagsJson)) {
                val key = rawTag.trim()
                if (key.isEmpty()) continue
                counts[key] = (counts[key] ?: 0) + 1
            }
        }
        counts.map { (tag, count) -> TagCount(tag, count) }.sortedBy { it.tag.lowercase() }
    }

    val errorLoadTemplate = stringResource(R.string.native_note_detail_error)
    val errorSaveTemplate = stringResource(R.string.native_note_detail_save_error)
    val actionErrorTemplate = stringResource(R.string.native_note_detail_action_error)
    val archivedMessage = stringResource(R.string.native_note_detail_archived)
    val unarchivedMessage = stringResource(R.string.native_note_detail_unarchived)
    val movedToTrashMessage = stringResource(R.string.native_note_detail_moved_to_trash)
    val deletedForAllMessage = stringResource(R.string.native_note_detail_deleted_for_all)
    val deletedPermanentlyMessage = stringResource(R.string.native_note_detail_deleted_permanently)
    val restoredMessage = stringResource(R.string.native_note_detail_restored)
    val duplicatedMessage = stringResource(R.string.native_note_detail_duplicated)
    val emptyRemovedMessage = stringResource(R.string.native_note_detail_empty_removed)
    val reminderSetMessage = stringResource(R.string.native_note_detail_reminder_set)
    val reminderRemovedMessage = stringResource(R.string.native_note_detail_reminder_removed)
    val convertedToChecklistMessage = stringResource(R.string.native_note_detail_converted_to_checklist)
    val convertedToTextMessage = stringResource(R.string.native_note_detail_converted_to_text)
    val duplicateSuffix = stringResource(R.string.native_note_detail_duplicate_suffix)
    val downloadErrorMessage = stringResource(R.string.native_note_detail_download_error)
    val aiErrorMessage = stringResource(R.string.native_note_ai_error)
    val imageAddErrorMessage = stringResource(R.string.native_note_detail_add_image_error)
    val iconErrorMessage = stringResource(R.string.native_note_icon_error)
    val todayLabel = stringResource(R.string.native_note_detail_today)
    val yesterdayLabel = stringResource(R.string.native_note_detail_yesterday)

    /** Whether the editors hold a body [note] doesn't have yet. Compared on
     *  the parsed state, never on the content string: re-encoding a body
     *  nobody touched can still reorder its JSON, and resending that would
     *  move the note's "Modifié" date for nothing. */
    fun bodyChanged(edit: Editability): Boolean = when {
        edit.isChecklistType -> false
        edit.isRichEditableType -> richBlocks != null && richBlocks != edit.originalRichBlocks
        edit.isDrawType -> richBlocks != edit.originalRichBlocks ||
            drawingPaths != edit.originalDrawingPaths.orEmpty() ||
            drawingDimensions != edit.originalDrawingDimensions
        edit.isAudioType -> audioClips != edit.originalAudioClips.orEmpty() ||
            audioCaptionText != edit.originalAudioCaptionText
        else -> edit.bodyEditable && bodyText != edit.bodyPlainText
    }

    /** Materializes exactly what is on screen. Lifecycle actions and
     *  duplication must not use the last server snapshot while a title,
     *  rich block, checklist row, stroke, or recording is still local. A
     *  body nobody touched keeps its content string exactly as loaded. */
    fun liveNoteSnapshot(): NoteDto? {
        val current = note ?: return null
        val edit = editability ?: return current.copy(title = titleText)
        val content = when {
            !bodyChanged(edit) -> current.content
            edit.isRichEditableType -> RichDoc.encode(richBlocks.orEmpty())
            edit.isDrawType -> DrawingContent.encode(
                drawingPaths,
                drawingDimensions,
                RichDoc.encode(richBlocks ?: listOf(RichDoc.newBlock())),
            )
            edit.isAudioType -> AudioContent.encode(audioClips, audioCaptionText.orEmpty())
            edit.isLegacyPlain -> bodyText
            else -> NoteContent.plainTextToRichContent(bodyText)
        }
        val currentItems = if (edit.isChecklistType) {
            ChecklistItems.encode(edit.checklistItems.orEmpty())
        } else {
            current.items
        }
        return current.copy(
            title = titleText,
            content = content,
            items = currentItems,
            images = NoteImages.encode(images),
        )
    }

    /** Queues whatever title and body the editors hold that [note] doesn't
     *  have yet, the checklist rows too unless [withItems] leaves them to
     *  their own save-on-blur, then takes that state as the new baseline:
     *  the header check goes back to its idle ring, as after the web's
     *  autoSaveTextNote. */
    suspend fun persistLiveEdits(withItems: Boolean): NoteDto? = persistLock.withLock {
        val current = note ?: return@withLock null
        val blocks = richBlocks
        val body = bodyText
        val paths = drawingPaths
        val dimensions = drawingDimensions
        val clips = audioClips
        val caption = audioCaptionText
        val live = liveNoteSnapshot() ?: return@withLock current
        if (!isNoteReadOnly) {
            if (live.title != current.title || live.content != current.content) {
                repository.patchNoteQueued(current.id, live.title, live.content)
            }
            if (withItems && live.items != current.items) {
                repository.setChecklistItemsQueued(current.id, live.items)
            }
        }
        // Applied to the latest state, not the snapshot taken above: a
        // pin, colour or tag change may have landed while this was queueing.
        editability = editability?.rebaselined(blocks, body, paths, dimensions, clips, caption)
        note = note?.let { latest ->
            latest.copy(title = live.title, content = live.content, items = if (withItems) live.items else latest.items)
        }
        note
    }

    fun cancelPendingAutosaves() {
        drawingSaveJob?.cancel()
        audioSaveJob?.cancel()
    }

    /** Commits the live editor state to the offline queue before an exit
     *  or status transition. This closes the debounce/blur race for every
     *  note type and gives Android the web editor's save-on-close safety. */
    suspend fun flushLiveEdits(): NoteDto? {
        cancelPendingAutosaves()
        return persistLiveEdits(withItems = true)
    }

    /** One debounced autosave. A queue write that has started is always
     *  finished, even when a newer edit reschedules this one meanwhile. */
    suspend fun autosaveLiveEdits() {
        try {
            withContext(NonCancellable) { persistLiveEdits(withItems = false) }
            SyncQueueWorker.triggerNow(context)
            NativeDebug.d("NoteDetailScreen autosave queued id=$noteId")
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen autosave failed", t)
            toasts.error(String.format(errorSaveTemplate, t.message ?: t.javaClass.simpleName))
        }
    }

    fun togglePin() {
        val current = note ?: return
        if (pinning) return
        pinning = true
        scope.launch {
            try {
                repository.setPinnedQueued(current.toEntity(), !current.pinned)
                note = current.copy(pinned = !current.pinned)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen togglePin queued id=${current.id}")
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen togglePin failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                pinning = false
            }
        }
    }

    /** Where Enter in the title lands: the end of the body, or a
     *  checklist's first row (NoteModal.jsx:717-734). */
    fun focusBodyFromTitle() {
        val edit = editability ?: return
        if (edit.isChecklistType) {
            edit.checklistItems?.firstOrNull { it is ChecklistItemData }?.let { pendingChecklistFocus = it.id }
        } else {
            richBlocks?.lastOrNull()?.let { last ->
                pendingRichSelections[last.id] = TextRange(last.text.length)
                pendingRichFocus = last.id
            }
        }
    }

    /** The trash button's confirm: permanent delete for a note already in
     *  the trash, else the move to the trash. */
    fun askTrash() {
        if (note?.trashed == true) showPermanentDeleteConfirm = true else showTrashConfirm = true
    }

    /** Archiving leaves the note; unarchiving keeps it open, the way the
     *  web's handleArchiveNote only closes the modal for the former. */
    fun toggleArchive() {
        val current = note ?: return
        if (archiving) return
        archiving = true
        val archive = !current.archived
        scope.launch {
            try {
                val live = flushLiveEdits() ?: current
                repository.setArchivedQueued(live.toEntity(), archive)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen toggleArchive queued id=${current.id}")
                toasts.success(if (archive) archivedMessage else unarchivedMessage)
                if (archive) onBack() else note = note?.copy(archived = false)
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen toggleArchive failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                archiving = false
            }
        }
    }

    /** Restores a trashed note (see repository.restoreNote for what that
     *  also does to its archived flag). Only ever offered from a trashed
     *  note's own kebab menu, in place of Archive/Unarchive there. */
    fun restoreNote() {
        val current = note ?: return
        if (restoring) return
        restoring = true
        scope.launch {
            try {
                repository.restoreNoteQueued(current.toEntity())
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen restoreNote queued id=${current.id}")
                toasts.success(restoredMessage, "restore")
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen restoreNote failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                restoring = false
            }
        }
    }

    fun confirmTrash(mode: String? = null) {
        val current = note ?: return
        showTrashConfirm = false
        if (trashing) return
        trashing = true
        scope.launch {
            try {
                flushLiveEdits()
                repository.trashNoteQueued(current.id, mode)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen trash queued id=${current.id} mode=$mode")
                toasts.success(
                    if (mode == "delete_for_all") deletedForAllMessage else movedToTrashMessage,
                    if (mode == "delete_for_all") "trash-x" else "trash",
                )
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen trash failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                trashing = false
            }
        }
    }

    /** Permanently deletes a trashed note (irreversible, see
     *  repository.deleteNotePermanently): what the trash button does on a
     *  note opened from the trash. */
    fun confirmPermanentDelete() {
        val current = note ?: return
        showPermanentDeleteConfirm = false
        if (deletingPermanently) return
        deletingPermanently = true
        scope.launch {
            try {
                repository.deleteNotePermanentlyQueued(current.id)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen deleteNotePermanently queued id=${current.id}")
                toasts.success(deletedPermanentlyMessage, "trash-x")
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen deleteNotePermanently failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                deletingPermanently = false
            }
        }
    }

    fun changeColor(colorKey: String) {
        val current = note ?: return
        showColorPicker = false
        if (current.color == colorKey || changingColor) return
        changingColor = true
        scope.launch {
            try {
                repository.setColorQueued(current.id, colorKey)
                note = current.copy(color = colorKey)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen changeColor queued id=${current.id}")
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen changeColor failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                changingColor = false
            }
        }
    }

    /** Sets, moves, or clears (reminderAtIso == null) this note's reminder.
     *  The actual alarm isn't armed/cancelled from here: it follows from
     *  the local cache update inside repository.setReminderQueued(), which
     *  NativeNavHost's own reconciliation reacts to (see ReminderSync.kt),
     *  same separation of concerns as the web, where the reminder-sync
     *  effect watches the notes array rather than being called inline from
     *  every place a reminder can change. */
    fun setReminder(reminderAtIso: String?) {
        val current = note ?: return
        if (changingReminder) return
        changingReminder = true
        scope.launch {
            try {
                repository.setReminderQueued(current.toEntity(), reminderAtIso)
                note = current.copy(reminderAt = reminderAtIso)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen setReminder queued id=${current.id}")
                if (reminderAtIso != null) {
                    toasts.success(reminderSetMessage, "reminder")
                } else {
                    toasts.show(reminderRemovedMessage, NotifVariant.INFO, icon = "reminder")
                }
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen setReminder failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                changingReminder = false
            }
        }
    }

    fun isTagApplied(tag: String): Boolean = (note?.tags ?: emptyList()).any { it.equals(tag, ignoreCase = true) }

    fun saveTags(newTags: List<String>) {
        val current = note ?: return
        if (changingTags) return
        changingTags = true
        scope.launch {
            try {
                repository.setTagsQueued(current.id, newTags)
                note = current.copy(tags = newTags)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen saveTags queued id=${current.id}")
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen saveTags failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                changingTags = false
            }
        }
    }

    /** Toggles one tag on/off, case-insensitively (same rule the web
     *  applies via isTagApplied/toggleTag in ModalFooter.jsx). Used by both
     *  the suggestion list's checkboxes and a chip's own remove button. */
    fun toggleTag(tag: String) {
        val current = note?.tags ?: return
        val updated = if (isTagApplied(tag)) current.filterNot { it.equals(tag, ignoreCase = true) } else current + tag
        saveTags(updated)
    }

    /** Commits typed/pasted text as one or more tags: splits on comma,
     *  trims, drops blanks, and skips anything already applied
     *  case-insensitively. Mirrors App.jsx's addTags(). */
    fun addTagsFromInput(raw: String) {
        val current = note?.tags ?: return
        val parts = raw.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.isEmpty()) return
        val seen = current.mapTo(mutableSetOf()) { it.lowercase() }
        val merged = current.toMutableList()
        for (p in parts) {
            if (seen.add(p.lowercase())) merged.add(p)
        }
        if (merged != current) saveTags(merged)
    }

    // ---------- Checklist item and section edits ----------

    /** Persists the given item list immediately, matching setTags()'s and
     *  changeColor()'s save-on-structural-change pattern rather than
     *  title/content's deferred Save button (checklist edits are discrete,
     *  already-complete actions, same as those two). Doesn't reassign
     *  editability.checklistItems from the response: it's the exact data
     *  just sent, and re-parsing it here could stomp a different edit
     *  still in flight elsewhere in the list (e.g. text mid-edit in
     *  another row) with the same content.
     *
     * Note: this is one PATCH per action (toggle, add, remove, indent) and
     * one per row blur, same as how often the web itself calls
     * syncEntries(); this app's usual pattern elsewhere is to save once
     * explicitly, but checklist edits are inherently a sequence of small,
     * separately-meaningful mutations, not one big free-text edit. */
    fun saveChecklistItems(newItems: List<ChecklistEntry>) {
        val current = note ?: return
        scope.launch {
            try {
                repository.setChecklistItemsQueued(current.id, ChecklistItems.encode(newItems))
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen saveChecklistItems queued id=${current.id}")
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen saveChecklistItems failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            }
        }
    }

    fun setDoneSectionCollapsed(collapsed: Boolean) {
        doneSectionCollapsed = collapsed
        checklistPrefs.edit().putBoolean("ck-done-$noteId", collapsed).apply()
    }

    /** The editor hands back a whole new entry list for any structural
     *  change; typing hands one back with persist = false, since the web
     *  only saves a row's text once it loses focus. */
    fun updateChecklistEntries(entries: List<ChecklistEntry>, persist: Boolean) {
        editability = editability?.copy(checklistItems = entries)
        if (persist) saveChecklistItems(entries)
    }

    // ---------- Rich text block edits (RichDoc.parse-approved notes only) ----------

    fun changeRichBlockText(id: String, newText: String, newMarks: List<RichMark>) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(text = newText, marks = newMarks) else it }
    }

    /** The toolbar's block buttons are toggles on the web
     *  (toggleBulletList, toggleTaskList, toggleBlockquote,
     *  smartToggleCodeBlock): pressing the one already active turns the
     *  block back into a plain paragraph. The heading gallery is the
     *  exception, setHeading() always sets. */
    fun setRichBlockKind(id: String, kind: RichBlockKind) {
        val blocks = richBlocks ?: return
        val togglesOff = kind == RichBlockKind.BULLET_ITEM || kind == RichBlockKind.NUMBERED_ITEM ||
            kind == RichBlockKind.TASK_ITEM || kind == RichBlockKind.QUOTE || kind == RichBlockKind.CODE_BLOCK
        richBlocks = blocks.map { block ->
            if (block.id != id) {
                block
            } else {
                block.copy(kind = if (togglesOff && block.kind == kind) RichBlockKind.PARAGRAPH else kind)
            }
        }
    }

    fun toggleRichMark(id: String, start: Int, end: Int, type: RichMarkType) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(marks = RichDoc.toggleMark(it.marks, type, start, end)) else it }
    }

    fun setRichMark(id: String, start: Int, end: Int, type: RichMarkType, value: String?, color: String?) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(marks = RichDoc.setMark(it.marks, type, start, end, value, color)) else it }
    }

    fun clearRichMark(id: String, start: Int, end: Int, type: RichMarkType) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(marks = RichDoc.clearMark(it.marks, type, start, end)) else it }
    }

    fun setRichAlign(id: String, align: RichAlign) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(align = align) else it }
    }

    /** indent()/outdent(), bounded to the same 0..8 range Indent.js uses. */
    fun shiftRichIndent(id: String, delta: Int) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(indent = (it.indent + delta).coerceIn(0, 8)) else it }
    }

    /** setHorizontalRule(): drops a rule after the focused block, then a
     *  fresh paragraph so there is always something to type into after it
     *  (the web's own setHorizontalRule leaves the cursor in the paragraph
     *  the rule pushed down). */
    fun insertRichDivider(id: String) {
        val blocks = richBlocks ?: return
        val idx = blocks.indexOfFirst { it.id == id }
        if (idx < 0) return
        val rule = RichDoc.newBlock(RichBlockKind.DIVIDER)
        val after = RichDoc.newBlock()
        richBlocks = blocks.toMutableList().apply { addAll(idx + 1, listOf(rule, after)) }
        pendingRichFocus = after.id
    }

    fun toggleRichChecked(id: String) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(checked = !it.checked) else it }
    }

    /** The toolbar's eraser, `clearNodes().unsetAllMarks()` on the web:
     *  the selection loses every mark and the block goes back to being a
     *  plain paragraph. */
    fun clearRichFormatting(id: String, start: Int, end: Int) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { block ->
            if (block.id == id) {
                block.copy(kind = RichBlockKind.PARAGRAPH, marks = RichDoc.clearAllMarks(block.marks, start, end))
            } else {
                block
            }
        }
    }

    fun closeLinkDialog() {
        showLinkDialog = false
        linkDialogTarget = null
    }

    fun setRichLink(href: String) {
        val target = linkDialogTarget ?: return
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { block ->
            if (block.id == target.blockId) {
                block.copy(marks = RichDoc.setMark(block.marks, RichMarkType.LINK, target.start, target.end, normalizeRichLinkUrl(href)))
            } else {
                block
            }
        }
        closeLinkDialog()
    }

    fun removeRichLink() {
        val target = linkDialogTarget ?: return
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { block ->
            if (block.id == target.blockId) block.copy(marks = RichDoc.clearMark(block.marks, RichMarkType.LINK, target.start, target.end))
            else block
        }
        closeLinkDialog()
    }

    /** Enter inside a block: splits it at [position] into two. The new
     *  block continues a list, a task list or a quote, so pressing Enter
     *  partway through one keeps adding items to it; any other kind's
     *  continuation is a plain paragraph, matching how most editors treat
     *  Enter at the end of a heading. A code block never gets here at all,
     *  Enter inside a snippet is a real newline (see RichTextEditor). */
    fun splitRichBlock(id: String, position: Int) {
        val blocks = richBlocks ?: return
        val idx = blocks.indexOfFirst { it.id == id }
        if (idx < 0) return
        val block = blocks[idx]
        val continues = block.kind == RichBlockKind.BULLET_ITEM || block.kind == RichBlockKind.NUMBERED_ITEM ||
            block.kind == RichBlockKind.TASK_ITEM || block.kind == RichBlockKind.QUOTE
        val newBlock = RichDoc.newBlock(if (continues) block.kind else RichBlockKind.PARAGRAPH).copy(
            text = block.text.substring(position),
            marks = RichDoc.clipMarks(block.marks, position, block.text.length),
            align = block.align,
            indent = if (continues) block.indent else 0,
        )
        val updated = blocks.toMutableList()
        updated[idx] = block.copy(text = block.text.substring(0, position), marks = RichDoc.clipMarks(block.marks, 0, position))
        updated.add(idx + 1, newBlock)
        richBlocks = updated
        pendingRichFocus = newBlock.id
    }

    /** Best-effort backspace-at-start-of-block, mirroring ProseMirror's
     *  joinBackward in reverse of splitRichBlock above: [id]'s text is
     *  appended to the end of the PREVIOUS block, which keeps its own
     *  kind/align/indent (the "whichever block absorbs text keeps its own
     *  identity" convention, same spirit as splitRichBlock's "continues"
     *  check), and [id] is dropped. Reuses the previous block's own id
     *  rather than minting a new one, so pendingRichSelections can place
     *  the caret at the join point once that field's safety-net
     *  LaunchedEffect picks it up (see RichTextEditor.kt). Never touches
     *  the first block (nothing precedes it) or a code block on either
     *  side (raw code text merging into/from formatted text either
     *  direction doesn't make sense - same exclusion as splitRichBlock).
     *  A divider has no text to merge into, so backspacing right after
     *  one removes the divider instead of trying to join through it. */
    fun mergeRichBlockWithPrevious(id: String) {
        val blocks = richBlocks ?: return
        val idx = blocks.indexOfFirst { it.id == id }
        if (idx <= 0) return
        val current = blocks[idx]
        if (current.kind == RichBlockKind.CODE_BLOCK) return
        val prev = blocks[idx - 1]
        val updated = blocks.toMutableList()
        if (prev.kind == RichBlockKind.DIVIDER) {
            updated.removeAt(idx - 1)
            richBlocks = updated
            pendingRichFocus = current.id
            return
        }
        if (prev.kind == RichBlockKind.CODE_BLOCK) return
        val joinAt = prev.text.length
        val merged = prev.copy(
            text = prev.text + current.text,
            marks = (prev.marks + current.marks.map { it.copy(start = it.start + joinAt, end = it.end + joinAt) })
                .sortedBy { it.start },
        )
        updated[idx - 1] = merged
        updated.removeAt(idx)
        richBlocks = updated
        pendingRichFocus = merged.id
        pendingRichSelections[merged.id] = TextRange(joinAt)
    }

    // Bundled once: the formatting bar takes one actions object rather than
    // a dozen separate lambdas, and remembering it keeps the bar from
    // recomposing on every unrelated state change in this screen.
    val richToolbarActions = remember {
        RichToolbarActions(
            setBlockKind = ::setRichBlockKind,
            toggleMark = ::toggleRichMark,
            setMark = ::setRichMark,
            clearMark = ::clearRichMark,
            clearFormatting = ::clearRichFormatting,
            setAlign = ::setRichAlign,
            shiftIndent = ::shiftRichIndent,
            insertDivider = ::insertRichDivider,
            requestLink = { id, start, end, existingHref ->
                linkDialogTarget = LinkTarget(id, start, end, existingHref)
                showLinkDialog = true
            },
        )
    }

    // ---------- Drawing note edits (DrawingContent.parse-approved notes only) ----------

    /** Debounced autosave: cancels and restarts on every stroke/erase/
     *  clear/undo/redo, same idea as the web editor's own drawing autosave
     *  (App.jsx), so a fast burst of strokes sends one PATCH after the
     *  user actually pauses rather than one per gesture. */
    fun scheduleDrawingAutosave() {
        drawingSaveJob?.cancel()
        drawingSaveJob = scope.launch {
            delay(600)
            autosaveLiveEdits()
        }
    }

    /** The drawing's own size: the stored one, or the draw-mode area for
     *  a drawing that has none yet (DrawingCanvas.jsx:291-318). */
    fun drawingCanvasSize(): DrawingDimensionsDto =
        drawingDimensions?.takeIf { it.width > 0f && it.height > 0f } ?: drawingArea

    /** Every drawing mutation (a completed stroke, an erase, a clear)
     *  funnels through here: push the pre-change state so it can be
     *  undone, matching useDrawingHistory.js's own pushPaths() exactly,
     *  capped at the same 80 entries. Like notifyChange(), it writes the
     *  size along, a page being the stored one or the whole canvas when
     *  the drawing names none. */
    fun commitDrawingChange(newPaths: List<DrawingStrokeDto>) {
        val size = drawingCanvasSize()
        drawingDimensions = DrawingDimensionsDto(
            width = size.width,
            height = size.height,
            originalHeight = drawingDimensions?.originalHeight?.takeIf { it > 0f } ?: size.height,
        )
        drawingUndoStack = (drawingUndoStack + listOf(drawingPaths)).takeLast(80)
        drawingRedoStack = emptyList()
        drawingPaths = newPaths
        scheduleDrawingAutosave()
    }

    /** addPage() (DrawingCanvas.jsx:510-523): one page taller, outside
     *  the undo history. */
    fun addDrawingPage() {
        val size = drawingCanvasSize()
        val page = drawingPageHeight(drawingDimensions)
        drawingDimensions = DrawingDimensionsDto(width = size.width, height = size.height + page, originalHeight = page)
        scheduleDrawingAutosave()
    }

    /** removePage() (DrawingCanvas.jsx:528-546): one page shorter, the
     *  strokes left wholly under the new bottom gone, as one undo step. */
    fun removeDrawingPage() {
        val size = drawingCanvasSize()
        val page = drawingPageHeight(drawingDimensions)
        val newHeight = size.height - page
        drawingUndoStack = (drawingUndoStack + listOf(drawingPaths)).takeLast(80)
        drawingRedoStack = emptyList()
        drawingPaths = drawingPaths.filter { stroke -> stroke.points.any { it.y <= newHeight } }
        drawingDimensions = DrawingDimensionsDto(width = size.width, height = newHeight, originalHeight = page)
        scheduleDrawingAutosave()
    }

    fun undoDrawing() {
        val previous = drawingUndoStack.lastOrNull() ?: return
        drawingRedoStack = drawingRedoStack + listOf(drawingPaths)
        drawingUndoStack = drawingUndoStack.dropLast(1)
        drawingPaths = previous
        scheduleDrawingAutosave()
    }

    fun redoDrawing() {
        val next = drawingRedoStack.lastOrNull() ?: return
        drawingUndoStack = (drawingUndoStack + listOf(drawingPaths)).takeLast(80)
        drawingRedoStack = drawingRedoStack.dropLast(1)
        drawingPaths = next
        scheduleDrawingAutosave()
    }

    // ---------- Audio note edits (AudioContent.parse-approved notes only) ----------

    /** Same debounced shape as scheduleDrawingAutosave. */
    fun scheduleAudioAutosave() {
        audioSaveJob?.cancel()
        audioSaveJob = scope.launch {
            delay(600)
            autosaveLiveEdits()
        }
    }

    fun addAudioClip(clip: AudioClipDto) {
        audioClips = audioClips + clip
        scheduleAudioAutosave()
    }

    fun removeAudioClip(id: String) {
        audioClips = audioClips.filterNot { it.id == id }
        scheduleAudioAutosave()
    }

    fun renameAudioClip(id: String, newName: String) {
        audioClips = audioClips.map { if (it.id == id) it.copy(name = newName) else it }
        scheduleAudioAutosave()
    }

    // A note that can't be edited always shows its read face.
    LaunchedEffect(isNoteReadOnly) {
        if (isNoteReadOnly) {
            viewMode = true
            drawingCanvasMode = false
        }
    }

    // Title and body typing autosave one second after the last keystroke,
    // like the web's autoSaveTextNote; the header check stays the manual
    // way to save sooner.
    LaunchedEffect(titleText, bodyText, richBlocks) {
        val current = note ?: return@LaunchedEffect
        val edit = editability ?: return@LaunchedEffect
        if (isNoteReadOnly || (titleText == current.title && !bodyChanged(edit))) return@LaunchedEffect
        delay(1000)
        autosaveLiveEdits()
    }

    // ---------- Content images (text/checklist notes only) ----------

    /** Persists the given image list and, on success, resyncs local state
     *  from the server's own copy (unlike checklist items, there's no
     *  concurrent free-text edit an image add/remove could clobber, so
     *  reflecting the fresh server truth here is simplest). A private
     *  helper, not its own guarded action: callers (addImages/removeImage)
     *  own the changingImages in-flight flag around it. */
    suspend fun saveImages(newImages: List<NoteImageData>) {
        val current = note ?: return
        try {
            val encoded = NoteImages.encode(newImages)
            repository.setImagesQueued(current.id, encoded)
            note = current.copy(images = encoded)
            images = newImages
            SyncQueueWorker.triggerNow(context)
            NativeDebug.d("NoteDetailScreen saveImages queued id=${current.id}")
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen saveImages failed", t)
            toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
        }
    }

    /** Compresses every picked image off the main thread (resize + encode,
     *  see ImageCompression) before attaching any of them, same as the
     *  web's own fileToCompressedDataURL() always running before a data:
     *  URL is ever added to the note. A picked file that fails to decode
     *  is skipped rather than aborting the whole batch, same as the web's
     *  per-file try/catch in addImagesToState(). */
    fun addImages(uris: List<Uri>) {
        if (uris.isEmpty() || changingImages) return
        changingImages = true
        scope.launch {
            try {
                val compressed = withContext(Dispatchers.IO) {
                    uris.mapNotNull { uri ->
                        val dataUrl = ImageCompression.compressToDataUrl(context, uri) ?: return@mapNotNull null
                        NoteImages.newImage(dataUrl, ImageCompression.displayNameFor(context, uri) ?: "")
                    }
                }
                if (compressed.isEmpty()) {
                    toasts.error(imageAddErrorMessage)
                    return@launch
                }
                saveImages(images + compressed)
            } finally {
                changingImages = false
            }
        }
    }

    fun removeImage(image: NoteImageData) {
        if (changingImages) return
        changingImages = true
        scope.launch {
            try {
                saveImages(images.filterNot { it.id == image.id })
            } finally {
                changingImages = false
            }
        }
    }

    fun downloadImage(image: NoteImageData) {
        scope.launch(Dispatchers.IO) {
            val ok = NoteExporter.exportImage(context, image.src, image.name)
            if (!ok) {
                withContext(Dispatchers.Main) {
                    toasts.error(downloadErrorMessage)
                }
            }
        }
    }

    fun duplicateNote() {
        val current = note ?: return
        if (duplicating) return
        duplicating = true
        val baseTitle = titleText.trim()
        val newTitle = if (baseTitle.isNotEmpty()) "$baseTitle $duplicateSuffix" else duplicateSuffix
        scope.launch {
            try {
                val source = flushLiveEdits() ?: current
                val created = repository.duplicateNote(source, newTitle)
                NativeDebug.d("NoteDetailScreen duplicateNote OK newId=${created.id}")
                SyncQueueWorker.triggerNow(context)
                toasts.success(duplicatedMessage, "copy")
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen duplicateNote failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                duplicating = false
            }
        }
    }

    /** The note as the AI should see it: the live editor state, not the
     *  last-saved copy, so a question is asked about what is on screen
     *  (App.jsx:2734-2754). */
    fun noteAiSnapshot(): AiNoteDto? {
        val current = note ?: return null
        val edit = editability ?: return null
        val body = when {
            edit.isChecklistType -> edit.checklistItems.orEmpty()
                .filterIsInstance<ChecklistItemData>()
                .joinToString("\n") { "- ${if (it.done) "[x]" else "[ ]"} ${it.text}" }
            edit.isRichEditableType -> NoteConversion.richBlocksToPlainText(
                richBlocks ?: edit.originalRichBlocks.orEmpty(),
            )
            edit.isDrawType -> NoteConversion.richBlocksToPlainText(richBlocks.orEmpty())
            else -> bodyText
        }
        return AiNoteDto(id = current.id, title = titleText, content = body, tags = current.tags)
    }

    // App.jsx pre-loads a kept conversation when the note opens, so its
    // header toggle is there from the start.
    LaunchedEffect(noteId) {
        if (!container.shellPrefs.aiAssistantEnabled) return@LaunchedEffect
        val stored = container.noteAiStore.load(noteId)
        if (stored.isNotEmpty()) {
            noteAiMessages = stored
            noteAiSaved = true
            noteAiHasBeenOpened = true
        }
    }

    fun openNoteAi() {
        noteAiOpen = true
        noteAiHasBeenOpened = true
        noteAiError = null
        if (noteAiMessages.isNotEmpty()) return
        // Re-open a kept conversation, or start a fresh one.
        val stored = container.noteAiStore.load(noteId)
        if (stored.isNotEmpty()) {
            noteAiMessages = stored
            noteAiSaved = true
        }
    }

    fun sendNoteAiMessage(question: String) {
        val snapshot = noteAiSnapshot() ?: return
        if (noteAiLoading || question.isBlank()) return
        val history = noteAiMessages
        noteAiMessages = history + AiMessage("user", question)
        noteAiError = null
        noteAiLoading = true
        noteAiJob = scope.launch {
            var answer = ""
            var started = false
            val failure = aiClient.askAboutNote(snapshot, history, question, AppLanguage.currentTag()) { delta ->
                answer += delta
                // The first chunk seeds the answer; every one after it
                // replaces that same last message so it grows in place.
                noteAiMessages = if (!started) {
                    started = true
                    noteAiMessages + AiMessage("assistant", answer)
                } else {
                    noteAiMessages.dropLast(1) + AiMessage("assistant", answer)
                }
            }
            if (failure != null) {
                noteAiError = failure
            } else if (!started) {
                noteAiError = aiErrorMessage
            }
            noteAiLoading = false
            noteAiJob = null
            if (noteAiSaved) container.noteAiStore.save(noteId, noteAiMessages)
        }
    }

    fun stopNoteAi() {
        // Whatever already streamed stays on screen, the web's own
        // abort behaviour.
        noteAiJob?.cancel()
        noteAiJob = null
        noteAiLoading = false
    }

    fun downloadNote() {
        val current = note ?: return
        val live = liveNoteSnapshot() ?: current
        scope.launch(Dispatchers.IO) {
            val ok = if (live.type == "audio") {
                val clip = AudioContent.parse(live.content)?.clips?.firstOrNull()
                clip != null && NoteExporter.exportAudio(context, clip, clip.name.ifBlank { live.title })
            } else {
                NoteExporter.exportTextFile(
                    context,
                    NoteExporter.sanitizeFilename(live.title.ifBlank { "note" }) + ".md",
                    NoteExporter.noteMarkdown(live.toEntity()),
                    "text/markdown",
                )
            }
            if (!ok) {
                withContext(Dispatchers.Main) {
                    toasts.error(downloadErrorMessage)
                }
            }
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(),
    ) { uris -> addImages(uris) }

    // ---------- The note's own icon, and the account's logo library ----------
    fun applyIcon(icon: NoteIconDto?) {
        scope.launch {
            try {
                repository.setNoteIcon(noteId, icon)
                note = note?.copy(icon = icon)
            } catch (t: Throwable) {
                NativeDebug.e("Note icon update failed", t)
                toasts.error(iconErrorMessage)
            }
        }
    }

    /** A picked image becomes a library entry first, then this note's icon:
     *  the web uploads through the same POST so the logo is reusable
     *  afterwards (LogoPickerPopover's own onUploadNew). */
    val logoPickerLauncher = rememberLauncherForActivityResult(
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
                logos = repository.fetchLogos()
                applyIcon(NoteIconDto(id = logo?.id, src = logo?.src ?: dataUrl, name = logo?.name ?: name))
            } catch (t: Throwable) {
                NativeDebug.e("Logo upload failed", t)
                toasts.error(iconErrorMessage)
            }
        }
    }

    // The web loads the logo library with the app and keeps it live, so its
    // picker never opens empty; here it is read with the note and again on
    // every opening.
    LaunchedEffect(serverUrl) {
        try {
            logos = repository.fetchLogos()
        } catch (t: Throwable) {
            NativeDebug.e("Logo library load failed", t)
        }
    }

    fun openLogoPicker() {
        showLogoPicker = true
        scope.launch {
            try {
                logos = repository.fetchLogos()
            } catch (t: Throwable) {
                NativeDebug.e("Logo library load failed", t)
            }
        }
    }

    fun removeLogoFromLibrary(logo: LogoDto) {
        scope.launch {
            if (repository.deleteLogo(logo.id)) logos = logos.filterNot { it.id == logo.id }
        }
    }

    val logoPickerPanel: @Composable () -> Unit = {
        if (showLogoPicker) {
            LogoPickerPopover(
                logos = logos,
                selectedSrc = note?.icon?.src,
                dark = dark,
                onPick = { logo ->
                    showLogoPicker = false
                    applyIcon(NoteIconDto(id = logo.id, src = logo.src, name = logo.name))
                },
                onUploadNew = {
                    showLogoPicker = false
                    logoPickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                onDelete = { logo -> removeLogoFromLibrary(logo) },
                onDismiss = { showLogoPicker = false },
            )
        }
    }

    LaunchedEffect(noteId) {
        // A note already visible in the notes list came from this same
        // local cache (NotesRepository's Room-backed store), so it's
        // available the instant the user taps it open - no reason to
        // block the whole screen behind fetchNoteDetail's own
        // network-first round-trip first. Render the cached copy
        // immediately, then let the network call reconcile quietly in
        // the background; only a note with no cache at all (a fresh
        // deep link before its first sync) still shows the spinner.
        var drawingFaceSet = false
        fun applyFetchedNote(fetched: NoteDto) {
            note = fetched
            titleText = fetched.title
            images = NoteImages.parse(fetched.images)
            editability = when (fetched.type) {
                "text" -> {
                    val parsedRichBlocks = RichDoc.parse(fetched.content)
                    if (parsedRichBlocks != null) {
                        Editability(
                            isTextType = true,
                            bodyEditable = false,
                            isLegacyPlain = false,
                            bodyPlainText = "",
                            isRichEditableType = true,
                            originalRichBlocks = parsedRichBlocks,
                        )
                    } else {
                        val richDoc = NoteContent.parseRichDoc(fetched.content)
                        when {
                            richDoc == null -> Editability(true, bodyEditable = true, isLegacyPlain = true, bodyPlainText = fetched.content)
                            NoteContent.isDocPlainStructure(richDoc) -> {
                                val plain = NoteContent.docToPlainText(richDoc)
                                Editability(true, bodyEditable = true, isLegacyPlain = false, bodyPlainText = plain)
                            }
                            else -> {
                                val plain = NoteContent.docToPlainText(richDoc)
                                Editability(true, bodyEditable = false, isLegacyPlain = false, bodyPlainText = plain)
                            }
                        }
                    }
                }
                "checklist" -> {
                    Editability(
                        isTextType = false,
                        bodyEditable = false,
                        isLegacyPlain = false,
                        bodyPlainText = "",
                        isChecklistType = true,
                        checklistItems = ChecklistItems.parse(fetched.items),
                    )
                }
                "draw" -> {
                    val drawing = DrawingContent.parse(fetched.content)
                    if (drawing != null) {
                        val captionBlocks = (RichDoc.parse(drawing.text)
                            ?: drawing.text?.takeIf { it.isNotBlank() }?.let {
                                RichDoc.parse(NoteContent.plainTextToRichContent(it))
                            }).orEmpty()
                            .ifEmpty { listOf(RichDoc.newBlock()) }
                        Editability(
                            isTextType = false,
                            bodyEditable = false,
                            isLegacyPlain = false,
                            bodyPlainText = "",
                            isDrawType = true,
                            originalDrawingPaths = drawing.paths,
                            originalDrawingDimensions = drawing.dimensions,
                            originalDrawingCaptionText = drawing.text,
                            originalRichBlocks = captionBlocks,
                        )
                    } else {
                        Editability(isTextType = false, bodyEditable = false, isLegacyPlain = false, bodyPlainText = "")
                    }
                }
                "audio" -> {
                    val audio = AudioContent.parse(fetched.content)
                    if (audio != null) {
                        Editability(
                            isTextType = false,
                            bodyEditable = false,
                            isLegacyPlain = false,
                            bodyPlainText = "",
                            isAudioType = true,
                            originalAudioClips = audio.clips,
                            originalAudioCaptionText = audio.text,
                        )
                    } else {
                        Editability(isTextType = false, bodyEditable = false, isLegacyPlain = false, bodyPlainText = "")
                    }
                }
                else -> Editability(isTextType = false, bodyEditable = false, isLegacyPlain = false, bodyPlainText = "")
            }
            bodyText = editability?.bodyPlainText.orEmpty()
            richBlocks = editability?.originalRichBlocks
            drawingPaths = editability?.originalDrawingPaths.orEmpty()
            drawingDimensions = editability?.originalDrawingDimensions
            drawingCaptionText = editability?.originalDrawingCaptionText
            if (editability?.isDrawType == true) {
                richBlocks = editability?.originalRichBlocks
                // Once, on the first render: a drawing opens on its read face,
                // or on its canvas when it was just created.
                if (!drawingFaceSet) {
                    drawingFaceSet = true
                    drawingCanvasMode = startInDrawMode
                    viewMode = !startInDrawMode && container.editorPrefs.readModeEnabled
                }
            }
            audioClips = editability?.originalAudioClips.orEmpty()
            audioCaptionText = editability?.originalAudioCaptionText
            history.reset(
                NoteSnapshot(
                    title = titleText,
                    body = bodyText,
                    richBlocks = richBlocks,
                    checklistItems = editability?.checklistItems,
                ),
            )
        }

        fun currentSnapshot() = NoteSnapshot(
            title = titleText,
            body = bodyText,
            richBlocks = richBlocks,
            checklistItems = editability?.checklistItems,
        )

        var cacheBaseline: NoteSnapshot? = null
        repository.cachedNoteDetailOrNull(noteId)?.let { cached ->
            runCatching { applyFetchedNote(cached) }
                .onSuccess { cacheBaseline = currentSnapshot() }
                .onFailure { NativeDebug.e("NoteDetailScreen cached render failed id=$noteId", it) }
        }
        try {
            val fetched = repository.fetchNoteDetail(noteId)
            val baseline = cacheBaseline
            val untouched = baseline == currentSnapshot() && editability?.let { bodyChanged(it) } != true
            if (baseline == null || untouched) {
                applyFetchedNote(fetched)
            } else {
                // The user already started typing, drawing or recording in
                // the gap between the instant cache render above and this
                // network round-trip landing - never clobber that with a
                // reconcile. Still pick up fresher metadata (tags, pin,
                // collaborators), which doesn't touch any editable state.
                NativeDebug.d("NoteDetailScreen: skipped reconcile, already editing id=$noteId")
                note = fetched
            }
        } catch (t: Throwable) {
            if (note == null) {
                NativeDebug.e("NoteDetailScreen load failed", t)
                loadError = String.format(errorLoadTemplate, t.message ?: t.javaClass.simpleName)
            } else {
                NativeDebug.e("NoteDetailScreen background refresh failed id=$noteId", t)
            }
        }
    }

    // useCollaboration.js reads the roster as soon as a note opens; the
    // collaboration modal, while open, keeps its own.
    LaunchedEffect(noteId) {
        try {
            val fresh = repository.fetchNoteCollaborators(noteId)
            if (!showCollaborators) applyRoster(fresh)
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen roster load failed id=$noteId", t)
        }
    }

    // One snapshot per second of quiet, so a burst of typing collapses
    // into a single undoable step (useModalHistory.js's own DEBOUNCE_MS).
    // Restarting this effect on every keystroke is the debounce: the
    // previous delay is cancelled with it.
    LaunchedEffect(titleText, bodyText, richBlocks, editability?.checklistItems) {
        if (note == null) return@LaunchedEffect
        if (history.restoring) {
            history.restoring = false
            return@LaunchedEffect
        }
        delay(1000)
        history.record(
            NoteSnapshot(
                title = titleText,
                body = bodyText,
                richBlocks = richBlocks,
                checklistItems = editability?.checklistItems,
            ),
        )
    }

    fun applySnapshot(snapshot: NoteSnapshot) {
        val unchanged = snapshot.title == titleText &&
            snapshot.body == bodyText &&
            snapshot.richBlocks == richBlocks &&
            snapshot.checklistItems == editability?.checklistItems
        // Only arm the guard when the state really moves: otherwise no
        // recomposition follows to clear it, and the next real edit
        // would be swallowed.
        if (unchanged) return
        history.restoring = true
        titleText = snapshot.title
        bodyText = snapshot.body
        richBlocks = snapshot.richBlocks
        if (snapshot.checklistItems != null && snapshot.checklistItems != editability?.checklistItems) {
            editability = editability?.copy(checklistItems = snapshot.checklistItems)
            // Checklist rows persist as they change rather than through
            // the Save button, so stepping back through them has to
            // persist too.
            saveChecklistItems(snapshot.checklistItems)
        }
    }

    fun undoNote() {
        // The web flushes its pending debounce first, so whatever was
        // typed in the last second becomes its own step instead of being
        // swallowed by the undo (useModalHistory.js's flush()).
        history.record(
            NoteSnapshot(
                title = titleText,
                body = bodyText,
                richBlocks = richBlocks,
                checklistItems = editability?.checklistItems,
            ),
        )
        history.undo()?.let { applySnapshot(it) }
    }

    fun redoNote() {
        history.redo()?.let { applySnapshot(it) }
    }

    // Opening the sheet puts the keyboard away, the same intent as the
    // web's inputmode="none" + blur (NoteModal.jsx:419-442): you can pick
    // a passage by long press and format it without the keyboard fighting
    // for the screen. Hidden rather than unfocused, so the selection the
    // toolbar acts on survives.
    LaunchedEffect(showFormatSheet) {
        if (showFormatSheet) keyboardController?.hide()
    }

    // The read face has no editor for the sheet to act on: switching to
    // it closes the sheet (useModalState.js:364-366).
    LaunchedEffect(viewMode) {
        if (viewMode) showFormatSheet = false
    }

    // useModalState.js restores the ratio a frame after the new face lays
    // out (its requestAnimationFrame).
    LaunchedEffect(viewMode) {
        val ratio = modeSwitchScrollRatio ?: return@LaunchedEffect
        modeSwitchScrollRatio = null
        withFrameNanos { }
        contentScroll.scrollTo((ratio * contentScroll.maxValue).roundToInt())
    }

    // Read only when the picker actually opens: the chips are useless
    // anywhere else on this screen, and most notes are opened without
    // ever touching the reminder.
    LaunchedEffect(showReminderPicker) {
        if (!showReminderPicker || reminderTimeChips.isNotEmpty()) return@LaunchedEffect
        repository.fetchReminderTimeChips()?.let { reminderTimeChips = it }
    }

    // Focus a checklist row after it's actually in composition (freshly
    // inserted rows aren't laid out yet the instant pendingChecklistFocus
    // is set). Guarded with try/catch: FocusRequester.requestFocus()
    // throws if called before its target has attached, which can still
    // race this on a slow recomposition; better to silently skip the
    // auto-focus than crash the screen over it.
    LaunchedEffect(pendingChecklistFocus, editability?.checklistItems) {
        val id = pendingChecklistFocus ?: return@LaunchedEffect
        val items = editability?.checklistItems ?: return@LaunchedEffect
        if (items.none { it.id == id }) return@LaunchedEffect
        try {
            checklistFocusRequesters.getOrPut(id) { FocusRequester() }.requestFocus()
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen checklist auto-focus failed for id=$id", t)
        }
        pendingChecklistFocus = null
    }

    // Same reasoning as the checklist auto-focus above: a freshly
    // split-off or appended block isn't laid out the instant
    // pendingRichFocus is set, and FocusRequester.requestFocus() throws if
    // called before its target attaches, so this is best-effort.
    LaunchedEffect(pendingRichFocus, richBlocks) {
        val id = pendingRichFocus ?: return@LaunchedEffect
        val blocks = richBlocks ?: return@LaunchedEffect
        if (blocks.none { it.id == id }) return@LaunchedEffect
        try {
            richFocusRequesters.getOrPut(id) { FocusRequester() }.requestFocus()
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen rich block auto-focus failed for id=$id", t)
        }
        pendingRichFocus = null
    }

    /**
     * performConvertNoteType() (App.jsx:6841-6928): rewrites the open note
     * as the other kind, in place. Text becomes a checklist by reading the
     * body as plain lines (a heading turns into a section, a `- [x]` line
     * into a ticked row); a checklist becomes a text note whose sections
     * are level-2 headings and whose rows are a task list, so nothing about
     * it is actually lost. Both directions are one PATCH carrying the new
     * type, content and items together, queued like every other edit so it
     * survives being offline.
     */
    fun performConvertNoteType() {
        val current = note ?: return
        val edit = editability ?: return
        if (converting || current.trashed || isNoteReadOnly) return
        if (!edit.isTextType && !edit.isChecklistType) return
        converting = true
        val toChecklist = edit.isTextType
        scope.launch {
            try {
                if (toChecklist) {
                    val text = when {
                        edit.isRichEditableType ->
                            NoteConversion.richBlocksToPlainText(richBlocks ?: edit.originalRichBlocks.orEmpty())
                        edit.bodyEditable -> bodyText
                        else -> edit.bodyPlainText
                    }
                    val entries = NoteConversion.textToChecklistEntries(text)
                    val encoded = ChecklistItems.encode(entries)
                    repository.convertNoteTypeQueued(noteId, "checklist", "", encoded)
                    note = current.copy(type = "checklist", content = "", items = encoded)
                    editability = Editability(
                        isTextType = false,
                        bodyEditable = false,
                        isLegacyPlain = false,
                        bodyPlainText = "",
                        isChecklistType = true,
                        checklistItems = entries,
                    )
                    richBlocks = null
                    bodyText = ""
                } else {
                    val blocks = NoteConversion
                        .checklistEntriesToRichBlocks(edit.checklistItems.orEmpty())
                        .ifEmpty { listOf(RichDoc.newBlock()) }
                    val content = RichDoc.encode(blocks)
                    repository.convertNoteTypeQueued(noteId, "text", content, emptyList())
                    note = current.copy(type = "text", content = content, items = emptyList())
                    editability = Editability(
                        isTextType = true,
                        bodyEditable = false,
                        isLegacyPlain = false,
                        bodyPlainText = "",
                        isRichEditableType = true,
                        originalRichBlocks = blocks,
                    )
                    richBlocks = blocks
                    bodyText = ""
                }
                SyncQueueWorker.triggerNow(context)
                history.reset(
                    NoteSnapshot(
                        title = titleText,
                        body = bodyText,
                        richBlocks = richBlocks,
                        checklistItems = editability?.checklistItems,
                    ),
                )
                toasts.success(if (toChecklist) convertedToChecklistMessage else convertedToTextMessage)
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen convertNoteType failed", t)
                toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                converting = false
            }
        }
    }

    /** The header check: saves now and stays on the note, as the web's
     *  modal save button does. */
    fun save() {
        if (note == null || editability == null || saving) return
        saving = true
        scope.launch {
            try {
                flushLiveEdits()
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen save queued id=$noteId")
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen save failed", t)
                toasts.error(String.format(errorSaveTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                saving = false
            }
        }
    }

    /** Nothing typed, drawn, recorded or attached: closing such a note
     *  removes it, like the web's handleCloseEmptyNote. */
    fun isEmptyNote(edit: Editability): Boolean {
        if (titleText.isNotBlank() || images.isNotEmpty()) return false
        return when {
            edit.isChecklistType -> edit.checklistItems.isNullOrEmpty()
            edit.isDrawType -> NoteConversion.richBlocksToPlainText(richBlocks.orEmpty()).isBlank() &&
                drawingPaths.none { it.points.size >= 2 }
            edit.isAudioType -> audioClips.isEmpty()
            edit.isRichEditableType -> NoteConversion.richBlocksToPlainText(richBlocks.orEmpty()).isBlank()
            edit.bodyEditable -> bodyText.isBlank()
            else -> edit.bodyPlainText.isBlank()
        }
    }

    /** Header and system back both flush the complete live editor state,
     *  including changes still inside a debounce or checklist row focus. */
    fun goBack() {
        if (BuildConfig.DEBUG) {
            Log.d("GKBack", "goBack() invoked - showCollaborators=$showCollaborators showFormatSheet=$showFormatSheet noteAiOpen=$noteAiOpen showReminderPicker=$showReminderPicker", Throwable("GKBack trace"))
        }
        val current = note
        val edit = editability
        val removeEmpty = current != null && edit != null && isOwnerAccess && !isNoteReadOnly &&
            !current.trashed && isEmptyNote(edit)
        scope.launch {
            // Never let a flush/enqueue failure strand the user on this
            // screen with no way out and no explanation - leaving must
            // always succeed. Whatever went wrong already logged from
            // inside flushLiveEdits/patchNoteQueued; still queued edits
            // catch up next time SyncQueueWorker runs regardless.
            try {
                if (removeEmpty && current != null) {
                    cancelPendingAutosaves()
                    repository.trashNoteQueued(current.id, null)
                    repository.deleteNotePermanentlyQueued(current.id)
                    toasts.show(emptyRemovedMessage, NotifVariant.INFO, icon = "trash", durationMs = 3_000L)
                } else {
                    flushLiveEdits()
                }
                SyncQueueWorker.triggerNow(context)
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen goBack: flush failed, leaving anyway", t)
            }
            onBack()
        }
    }

    // The system back gesture/button bypasses the header's own Back row
    // entirely (Navigation Compose would otherwise just pop the back
    // stack directly), so it needs the exact same flush-before-navigating
    // treatment routed through it explicitly.
    // Back closes the topmost overlay first, the note last, the same
    // fixed order App.jsx's own popstate stack walks (the colour and tag
    // popovers dismiss themselves, being focusable popups).
    //
    // This is an if/else chain rather than four always-mounted
    // BackHandler(enabled = ...) calls on purpose: a plain `enabled` flag
    // only toggles an already-registered callback, so with two
    // NoteDetailScreens side by side (SideBySideNotesScreen) every
    // handler for both notes would still register once, in a fixed
    // left-then-right order, up front - back would always resolve to
    // whichever pane composed last, regardless of which one the user
    // actually opened something in most recently. Only entering the
    // branch that is actually open, per note, mounts/unmounts each
    // BackHandler exactly when that overlay opens/closes, so the two
    // notes' callbacks interleave in real chronological order (same
    // mechanism the colour/tag popups already get for free from Popup).
    // Scroll-reset-style investigation for the reported "back while the
    // format sheet is open exits the note instead of just closing it" bug:
    // this branch selection LOOKS structurally identical to the noteAiOpen/
    // showReminderPicker cases above it (same if/else mounting pattern,
    // documented as already working for those), so rather than guess at a
    // fix, log which branch is actually mounted on every recomposition and
    // which BackHandler actually fires. Tag "GKBack" (distinct from
    // "GKNative"/"GKScroll") - reproduce (open the format sheet, press
    // system back) and filter logcat on it.
    if (BuildConfig.DEBUG) {
        SideEffect {
            Log.d(
                "GKBack",
                "branch recomposed: showCollaborators=$showCollaborators noteAiOpen=$noteAiOpen " +
                    "showReminderPicker=$showReminderPicker showFormatSheet=$showFormatSheet " +
                    "-> mounting ${
                        when {
                            showCollaborators -> "showCollaborators"
                            noteAiOpen -> "noteAiOpen"
                            showReminderPicker -> "showReminderPicker"
                            showFormatSheet -> "showFormatSheet"
                            else -> "else(goBack)"
                        }
                    } handler",
            )
        }
    }
    if (showCollaborators) {
        BackHandler {
            if (BuildConfig.DEBUG) Log.d("GKBack", "showCollaborators handler fired")
            showCollaborators = false
        }
    } else if (noteAiOpen) {
        BackHandler {
            if (BuildConfig.DEBUG) Log.d("GKBack", "noteAiOpen handler fired")
            noteAiOpen = false
        }
    } else if (showReminderPicker) {
        BackHandler {
            if (BuildConfig.DEBUG) Log.d("GKBack", "showReminderPicker handler fired")
            showReminderPicker = false
        }
    } else if (showFormatSheet) {
        BackHandler {
            if (BuildConfig.DEBUG) Log.d("GKBack", "showFormatSheet handler fired")
            showFormatSheet = false
        }
    } else {
        BackHandler {
            if (BuildConfig.DEBUG) Log.d("GKBack", "else(goBack) handler fired")
            goBack()
        }
    }

    // The open note is painted in its own color, edge to edge: no card, no
    // radius, no shadow, no page padding. NoteModal.jsx hardcodes
    // `rounded-none shadow-none w-full max-w-none` plus `height: 100dvh` on
    // phones, and fills the whole panel (sticky bar included) with
    // modalBgFor(color), so the screen reads as one flat color.
    val modalBg = noteModalBackground(note?.color, dark)
    // The status/nav bars are a separate system-level surface from this
    // Column's own background, so painting modalBg here alone never
    // reached them - they stayed on the workspace theme color underneath
    // this screen instead of following the note's own color the way the
    // rest of the screen does. The collaboration modal hands them its own
    // surface while it is open, and the note's colour back after.
    val systemBarColor = if (showCollaborators) collaboratorsSurface(dark) else modalBg
    LaunchedEffect(systemBarColor) { container.statusBarOverride.value = systemBarColor.toArgb() }
    DisposableEffect(Unit) { onDispose { container.statusBarOverride.value = null } }
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val accentColor = WorkspaceTheme.accent(container.themeState.themeId, dark)
    // .modal-icon-btn at rest (globalCSS.js:1343/1367).
    val modalIconColor = if (dark) Color.White.copy(alpha = 0.65f) else Color(0xFF4B5563)
    // .modal-footer-btn at rest (globalCSS.js:1797/1852).
    val footerIconColor = if (dark) Color.White.copy(alpha = 0.92f) else Color.Black.copy(alpha = 0.54f)
    // Same amber/red/orange the web kebab menu uses for these entries
    // (ModalFooter.jsx), so they keep reading as distinct on native too.
    val archiveMenuColor = if (dark) Color(0xFFfbbf24) else Color(0xFFa16207)
    val trashMenuColor = if (dark) Color(0xFFf87171) else Color(0xFFdc2626)
    val reminderMenuColor = if (dark) Color(0xFFfb923c) else Color(0xFFea580c)
    val collaborateColor = if (dark) Color(0xFFc4b5fd) else Color(0xFF7c3aed)
    val duplicateColor = if (dark) Color(0xFF67e8f9) else Color(0xFF0891b2)
    val convertColor = if (dark) Color(0xFFc4b5fd) else Color(0xFF7c3aed)
    val downloadColor = if (dark) Color(0xFF4ade80) else Color(0xFF16a34a)
    val aiColor = if (dark) Color(0xFFA5B4FC) else Color(0xFF4F46E5)
    // Neither a raw recording nor a drawing being drawn has anything to
    // ask about, so neither offers the panel (NoteModal.jsx:522-525).
    val noteAiAvailable = container.shellPrefs.aiAssistantEnabled &&
        editability?.isAudioType != true && !(editability?.isDrawType == true && drawingCanvasMode)
    val imageButtonColor = if (dark) Color(0xFF7dd3fc) else Color(0xFF0284c7)

    // The panel is a .glass-card: a 1px border at the screen edges, with
    // everything inside inset by it, and its background eases over 300ms
    // when the colour changes (the sticky header switches at once).
    val panelBg by animateColorAsState(modalBg, tween(durationMillis = 300, easing = CssEase), label = "panelBg")
    Box(Modifier.fillMaxSize().background(panelBg).border(1.dp, borderColor).padding(1.dp)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
                .imePadding(),
        ) {
            // Sticky icon bar (ModalHeader.jsx's own mobile half): back on
            // the left, pin then save on the right, 8dp/6dp padding, 32dp
            // round buttons. There is deliberately no close cross: on a
            // phone the back arrow is the only way out.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .onGloballyPositioned { stickyBarCoordinates.value = it }
                    .background(modalBg)
                    .then(
                        // ModalHeader.jsx's draw-edit bar: 4px all round and a
                        // bottom border (black 10% / white 15%).
                        if (drawingCanvasMode) {
                            Modifier
                                .bottomHairline(if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.10f))
                                .padding(start = 4.dp, top = 4.dp, end = 4.dp, bottom = 5.dp)
                        } else {
                            Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
                        },
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ModalIconButton(
                    contentDescription = stringResource(R.string.native_note_detail_back),
                    // ModalHeader.jsx gives the back arrow an aria-label only.
                    tooltip = null,
                    onClick = { goBack() },
                ) {
                    ArrowLeftIcon(size = 20.dp, tint = modalIconColor)
                }
                if (drawingCanvasMode) {
                    // ModalHeader.jsx's toolbar slot: `flex-1 py-1`, the pill
                    // centred between the back arrow and pin/save.
                    Box(Modifier.weight(1f).padding(vertical = 4.dp), contentAlignment = Alignment.Center) {
                        DrawingToolbar(
                            tools = drawingTools,
                            dark = dark,
                            canUndo = drawingUndoStack.isNotEmpty(),
                            canRedo = drawingRedoStack.isNotEmpty(),
                            canClear = drawingPaths.isNotEmpty(),
                            canRemovePage = drawingCanvasSize().height > drawingPageHeight(drawingDimensions),
                            onUndo = { undoDrawing() },
                            onRedo = { redoDrawing() },
                            onClear = { commitDrawingChange(emptyList()) },
                            onAddPage = { addDrawingPage() },
                            onRemovePage = { removeDrawingPage() },
                        )
                    }
                } else {
                    Spacer(Modifier.weight(1f))
                }
                note?.let { currentNote ->
                    // The web hides the pin while browsing the archived or
                    // trashed list; native reaches the same notes through
                    // their own screens, so it keys off the note's own state.
                    if (!currentNote.archived && !currentNote.trashed) {
                        val pinLabel = stringResource(
                            if (currentNote.pinned) R.string.native_note_detail_unpin else R.string.native_note_detail_pin
                        )
                        ModalIconButton(
                            contentDescription = pinLabel,
                            enabled = !pinning,
                            tooltip = stringResource(R.string.native_note_detail_pin_unpin),
                            // .modal-icon-btn--active (globalCSS.js:1463-1482).
                            activeBackground = if (currentNote.pinned) {
                                if (dark) Color.White.copy(alpha = 0.16f) else Color(0xFF1E293B)
                            } else {
                                null
                            },
                            activeShadow = if (currentNote.pinned) {
                                Color.Black.copy(alpha = if (dark) 0.40f else 0.22f)
                            } else {
                                null
                            },
                            activeRing = if (currentNote.pinned && dark) Color.White.copy(alpha = 0.20f) else null,
                            onClick = { togglePin() },
                        ) {
                            PinIcon(
                                size = 20.dp,
                                tint = if (currentNote.pinned) Color.White else modalIconColor,
                                filled = currentNote.pinned,
                            )
                        }
                        // ModalHeader.jsx groups pin+save with its own small
                        // gap-0.5 (2px) rather than sitting them flush
                        // against each other.
                        Spacer(Modifier.width(2.dp))
                    }
                    val edit = editability
                    val armed = edit != null && !isNoteReadOnly &&
                        (titleText != currentNote.title || bodyChanged(edit))
                    ModalSaveButton(
                        dark = dark,
                        armed = armed,
                        enabled = !saving && !isNoteReadOnly,
                        contentDescription = stringResource(
                            when {
                                !armed -> R.string.native_note_detail_saved
                                saving -> R.string.native_note_detail_saving
                                else -> R.string.native_note_detail_save
                            },
                        ),
                        onClick = { save() },
                    )
                    if (noteAiAvailable && noteAiHasBeenOpened && !drawingCanvasMode) {
                        NoteAiHeaderToggle(
                            dark = dark,
                            hasMessages = noteAiMessages.isNotEmpty(),
                            onClick = { openNoteAi() },
                        )
                    }
                }
            }

            // The two warnings that sit between the images and the
            // content on the web (NoteModal.jsx:750): a shared note
            // being edited with the server down, and a mirrored note
            // whose own server is away.
            @Composable
            fun NoteBanners(currentNote: NoteDto) {
                if (isCollaborativeNote && container.syncStatus.serverReachable == false) {
                    NoteWarningBanner(
                        message = stringResource(R.string.native_offline_collab_warning),
                        tone = NoteBannerTone.AMBER,
                        dark = dark,
                    ) { tint -> WifiOffIcon(size = 16.dp, tint = tint) }
                }
                currentNote.federation?.takeIf { it.readOnly }?.let { federation ->
                    val peer = federation.peerLabel
                        ?: stringResource(R.string.native_fed_remote_server)
                    NoteWarningBanner(
                        message = String.format(
                            stringResource(
                                when (federation.state) {
                                    "offline" -> R.string.native_fed_read_only_offline
                                    "locked" -> R.string.native_fed_read_only_locked
                                    "incompatible" -> R.string.native_fed_read_only_incompatible
                                    else -> R.string.native_fed_read_only_unknown
                                },
                            ),
                            peer,
                        ),
                        // Offline is red (the peer is down); locked
                        // and out-of-date are amber (actionable).
                        tone = if (federation.state == "offline") NoteBannerTone.ROSE else NoteBannerTone.AMBER,
                        dark = dark,
                    ) { tint -> ServerIcon(size = 16.dp, tint = tint) }
                }
            }

            when {
                loadError != null -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(loadError.orEmpty(), color = ErrorColor, modifier = Modifier.padding(24.dp))
                }
                note == null || editability == null -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = accentColor)
                        Spacer(Modifier.height(12.dp))
                        Text(stringResource(R.string.native_note_detail_loading), color = subtextColor)
                    }
                }
                editability?.isDrawType == true && drawingCanvasMode -> {
                    // Draw mode: the note stops scrolling and the canvas
                    // takes everything under the warnings, edge to edge
                    // (NoteModal.jsx:654, 756; DrawingCanvas.jsx:745-748).
                    Column(Modifier.weight(1f).fillMaxWidth()) {
                        NoteBanners(note!!)
                        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                            val area = DrawingDimensionsDto(
                                width = maxWidth.value.roundToInt().toFloat(),
                                height = maxHeight.value.roundToInt().toFloat(),
                            )
                            SideEffect { if (drawingArea != area) drawingArea = area }
                            val size = drawingDimensions?.takeIf { it.width > 0f && it.height > 0f } ?: area
                            DrawingCanvasPane(
                                paths = drawingPaths,
                                canvasWidth = size.width,
                                canvasHeight = size.height,
                                pageHeight = drawingPageHeight(drawingDimensions),
                                tools = drawingTools,
                                dark = dark,
                                onCommit = { newPaths -> commitDrawingChange(newPaths) },
                            )
                        }
                    }
                }
                else -> {
                    val currentNote = note!!
                    val edit = editability!!
                    val stamp = editedStampText(currentNote, todayLabel, yesterdayLabel)
                    // NoteModal.jsx: inline after the content when the note
                    // scrolls, pinned bottom-right of the viewport when it does not.
                    val stampInline = contentScroll.maxValue > 0
                    Box(Modifier.weight(1f).fillMaxWidth()) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .onGloballyPositioned { contentCoordinates.value = it }
                                .verticalScroll(contentScroll),
                        ) {
                            // Outside the sticky bar on purpose: the title
                            // scrolls away with the content, which is what
                            // ModalHeader.jsx does on a phone (and only there).
                            // Its 20dp side padding against the body's 24dp is
                            // the web's own deliberate 4px offset.
                            NoteTitleField(
                                value = titleText,
                                enabled = !isNoteReadOnly &&
                                    (edit.isTextType || edit.isChecklistType || edit.isDrawType || edit.isAudioType),
                                // The web drops the field entirely and prints the
                                // title as text whenever the note shows its read
                                // face (ModalHeader.jsx:265). Checklists are its
                                // documented exception: their body stays
                                // interactive, so their title does too.
                                asText = (edit.isRichEditableType && viewMode) ||
                                    (edit.isDrawType && viewMode) ||
                                    (isNoteReadOnly && !edit.isChecklistType),
                                titleColor = titleColor,
                                placeholderColor = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                                onValueChange = { raw ->
                                    // Enter alone jumps to the body, typing
                                    // nothing (ModalHeader.jsx:65-80); any other
                                    // newline, a pasted one, is flattened to a
                                    // space: a title is single-line everywhere.
                                    val enterOnly = raw.count { it == '\n' } == 1 && raw.replace("\n", "") == titleText
                                    if (enterOnly) focusBodyFromTitle() else titleText = raw.replace(TitleNewlines, " ")
                                },
                            )

                            if (edit.isTextType || edit.isChecklistType || edit.isDrawType) {
                                NoteImagesSection(
                                    images = images,
                                    borderColor = borderColor,
                                    onImageClick = { index -> viewerIndex = index },
                                )
                            }

                            NoteBanners(currentNote)

                            // .modal-content-fade: the content area is re-keyed on
                            // view / edit / draw, and fades in 4px from below
                            // (200ms ease-out) each time, drawing excepted.
                            val contentFade = remember { Animatable(0f) }
                            LaunchedEffect(viewMode) {
                                contentFade.snapTo(0f)
                                contentFade.animateTo(1f, tween(durationMillis = 200, easing = EaseOut))
                            }
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .graphicsLayer {
                                        alpha = contentFade.value
                                        translationY = (1f - contentFade.value) * 4.dp.toPx()
                                    }
                                    .padding(
                                        when {
                                            edit.isDrawType -> PaddingValues(start = 16.dp, top = 4.dp, end = 16.dp, bottom = 16.dp)
                                            edit.isAudioType -> PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 16.dp)
                                            else -> PaddingValues(start = 24.dp, top = 4.dp, end = 24.dp, bottom = 16.dp)
                                        },
                                    ),
                            ) {
                                if (edit.isChecklistType) {
                                    ChecklistEditorBody(
                                        entries = edit.checklistItems.orEmpty(),
                                        insertPosition = container.editorPrefs.checklistInsertPosition,
                                        removeSectionBehavior = container.editorPrefs.checklistRemoveSectionBehavior,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        doneCollapsed = doneSectionCollapsed,
                                        focusRequesterFor = { id -> checklistFocusRequesters.getOrPut(id) { FocusRequester() } },
                                        onEntriesChange = { updated, persist -> updateChecklistEntries(updated, persist) },
                                        onFocusItem = { id -> pendingChecklistFocus = id },
                                        onDoneCollapsedChange = { collapsed -> setDoneSectionCollapsed(collapsed) },
                                        noteBackground = panelBg,
                                        scrollState = contentScroll,
                                        scrollViewport = {
                                            val content = contentCoordinates.value?.takeIf { it.isAttached }?.boundsInRoot()
                                            val bar = stickyBarCoordinates.value?.takeIf { it.isAttached }?.boundsInRoot()
                                            if (content != null && bar != null) content.copy(top = bar.top) else content
                                        },
                                        readOnly = isNoteReadOnly,
                                    )
                                } else if (edit.isDrawType) {
                                    if (viewMode) {
                                        // The caption only when it says something, then
                                        // the drawing 16dp under it (the web's mt-4).
                                        if (richBlocks.orEmpty().any { it.text.isNotBlank() }) {
                                            RichTextReader(
                                                blocks = richBlocks.orEmpty(),
                                                typography = container.editorPrefs.typography.activeProfile,
                                                taskStrike = container.editorPrefs.taskStrike,
                                                dark = dark,
                                                titleColor = titleColor,
                                                noteColor = currentNote.color,
                                            )
                                        }
                                        Spacer(Modifier.height(16.dp))
                                    } else {
                                        // The caption editor keeps 80dp at least, the
                                        // drawing right under it.
                                        Box(Modifier.heightIn(min = 80.dp)) {
                                            RichTextEditor(
                                                blocks = richBlocks.orEmpty(),
                                                state = richEditorState,
                                                typography = container.editorPrefs.typography.activeProfile,
                                                taskStrike = container.editorPrefs.taskStrike,
                                                dark = dark,
                                                noteColor = currentNote.color,
                                                titleColor = titleColor,
                                                focusRequesterFor = { id -> richFocusRequesters.getOrPut(id) { FocusRequester() } },
                                                onTextEdited = { id, newText, newMarks -> changeRichBlockText(id, newText, newMarks) },
                                                onEnter = { id, position -> splitRichBlock(id, position) },
                                                onToggleChecked = { id -> toggleRichChecked(id) },
                                                onMergeWithPrevious = { id -> mergeRichBlockWithPrevious(id) },
                                                pendingSelectionFor = { id -> pendingRichSelections[id] },
                                                onPendingSelectionConsumed = { id -> pendingRichSelections.remove(id) },
                                                suppressKeyboard = showFormatSheet,
                                            )
                                        }
                                    }
                                    DrawingPreview(paths = drawingPaths, dimensions = drawingDimensions, dark = dark)
                                } else if (edit.isAudioType) {
                                    AudioClipsSection(
                                        clips = audioClips,
                                        accent = audioAccentColor(currentNote.color, dark),
                                        dark = dark,
                                        titleColor = titleColor,
                                        subtextColor = subtextColor,
                                        borderColor = borderColor,
                                        enabled = true,
                                        onClipAdded = { clip -> addAudioClip(clip) },
                                        onClipRemoved = { id -> removeAudioClip(id) },
                                        onClipRenamed = { id, newName -> renameAudioClip(id, newName) },
                                        onClipDownload = { clip ->
                                            scope.launch(Dispatchers.IO) {
                                                val ok = NoteExporter.exportAudio(
                                                    context,
                                                    clip,
                                                    clip.name.ifBlank { titleText },
                                                )
                                                if (!ok) withContext(Dispatchers.Main) {
                                                    toasts.error(downloadErrorMessage)
                                                }
                                            }
                                        },
                                    )
                                } else if (!edit.isTextType) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(999.dp))
                                            .background(subtextColor.copy(alpha = 0.14f))
                                            .padding(horizontal = 12.dp, vertical = 8.dp),
                                    ) {
                                        Text(
                                            String.format(
                                                stringResource(R.string.native_note_detail_type_unsupported),
                                                noteTypeLabel(currentNote.type),
                                            ),
                                            color = titleColor,
                                            fontSize = 13.sp,
                                        )
                                    }
                                } else if (edit.isRichEditableType && viewMode) {
                                    RichTextReader(
                                        blocks = richBlocks ?: edit.originalRichBlocks.orEmpty(),
                                        typography = container.editorPrefs.typography.activeProfile,
                                        taskStrike = container.editorPrefs.taskStrike,
                                        dark = dark,
                                        titleColor = titleColor,
                                        noteColor = currentNote.color,
                                    )
                                } else if (edit.isRichEditableType) {
                                    RichTextEditor(
                                        blocks = richBlocks ?: edit.originalRichBlocks.orEmpty(),
                                        state = richEditorState,
                                        typography = container.editorPrefs.typography.activeProfile,
                                        taskStrike = container.editorPrefs.taskStrike,
                                        dark = dark,
                                        noteColor = currentNote.color,
                                        titleColor = titleColor,
                                        focusRequesterFor = { id -> richFocusRequesters.getOrPut(id) { FocusRequester() } },
                                        onTextEdited = { id, newText, newMarks -> changeRichBlockText(id, newText, newMarks) },
                                        onEnter = { id, position -> splitRichBlock(id, position) },
                                        onToggleChecked = { id -> toggleRichChecked(id) },
                                        onMergeWithPrevious = { id -> mergeRichBlockWithPrevious(id) },
                                        pendingSelectionFor = { id -> pendingRichSelections[id] },
                                        onPendingSelectionConsumed = { id -> pendingRichSelections.remove(id) },
                                        suppressKeyboard = showFormatSheet,
                                    )
                                } else {
                                    if (!edit.bodyEditable) {
                                        Text(
                                            stringResource(R.string.native_note_detail_formatted_notice),
                                            color = subtextColor,
                                            fontSize = 12.sp,
                                        )
                                        Spacer(Modifier.height(10.dp))
                                        Text(edit.bodyPlainText, color = titleColor, fontSize = 16.sp)
                                    } else {
                                        BasicTextField(
                                            value = bodyText,
                                            onValueChange = { bodyText = it },
                                            readOnly = isNoteReadOnly,
                                            textStyle = TextStyle(color = titleColor, fontSize = 16.sp),
                                            cursorBrush = SolidColor(accentColor),
                                            modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
                                        )
                                    }
                                }

                                if (stamp != null && stampInline) {
                                    Spacer(Modifier.height(24.dp))
                                    EditedStamp(stamp, currentNote.id, dark, Modifier.fillMaxWidth())
                                }
                            }
                        }
                        if (stamp != null && !stampInline) {
                            EditedStamp(
                                stamp,
                                currentNote.id,
                                dark,
                                Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 12.dp),
                            )
                        }
                    }
                }
            }

            // The formatting sheet is a flex child between the scroll area
            // and the footer (NoteModal.jsx:927-948), so opening it shrinks
            // the note above instead of covering it.
            editability?.let { edit ->
                if ((edit.isRichEditableType || (edit.isDrawType && !drawingCanvasMode)) && !isNoteReadOnly && !viewMode) {
                    FormatSheet(
                        open = showFormatSheet,
                        dark = dark,
                        background = modalBg,
                        onClose = { showFormatSheet = false },
                    ) {
                        RichFormatToolbar(
                            blocks = richBlocks ?: edit.originalRichBlocks.orEmpty(),
                            state = richEditorState,
                            mode = richToolbarModeOf(container.editorPrefs.toolbarMode),
                            dark = dark,
                            titleColor = titleColor,
                            taskStrike = container.editorPrefs.taskStrike,
                            onTaskStrikeChange = { enabled ->
                                container.editorPrefs.applyTaskStrike(enabled)
                                scope.launch {
                                    try {
                                        repository.setTaskStrike(enabled)
                                    } catch (t: Throwable) {
                                        NativeDebug.e("Task strike preference sync failed", t)
                                    }
                                }
                            },
                            actions = richToolbarActions,
                            typography = container.editorPrefs.typography.activeProfile,
                        )
                    }
                }
            }

            note?.let { currentNote ->
                editability?.let { edit ->
                    NoteModalFooter(
                        dark = dark,
                        iconColor = footerIconColor,
                        borderColor = borderColor,
                        themeId = container.themeState.themeId,
                        tagCount = currentNote.tags.size,
                        collaboratorCount = currentNote.collaborators?.size ?: 0,
                        imageButtonColor = imageButtonColor,
                        collaborateColor = collaborateColor,
                        // .modal-footer-btn--trash is a paler red in dark mode
                        // than the kebab's trash row.
                        trashColor = if (dark) Color(0xFFFCA5A5) else Color(0xFFDC2626),
                        showColorButton = !isReadOnlyAccess,
                        showImageButton = (edit.isTextType || edit.isChecklistType ||
                            (edit.isDrawType && !drawingCanvasMode && !viewMode)) && !isReadOnlyAccess,
                        // ModalFooter.jsx:297: an audio note has no image
                        // affordance, so its logo gets a button of its own.
                        showLogoButton = edit.isAudioType && !isReadOnlyAccess,
                        noteIconSrc = currentNote.icon?.src,
                        showTagsButton = !isReadOnlyAccess,
                        // Undo/redo track the title and the body, so they
                        // are hidden for the two types whose content they
                        // don't cover (ModalFooter.jsx:562): audio, and a
                        // drawing's own canvas. A checklist stays interactive
                        // in "view" mode (its checkboxes still toggle), so
                        // ModalFooter.jsx's own `mType === "checklist" ||
                        // !viewMode` keeps undo/redo there regardless.
                        showHistoryButtons = (!edit.isDrawType || !drawingCanvasMode) &&
                            !edit.isAudioType && !isReadOnlyAccess && (edit.isChecklistType || !viewMode),
                        canUndo = history.canUndo,
                        canRedo = history.canRedo,
                        showFormatButton = (edit.isRichEditableType || (edit.isDrawType && !drawingCanvasMode)) &&
                            !isReadOnlyAccess && !viewMode,
                        formatOpen = showFormatSheet,
                        // The web only offers the toggle when the read-mode
                        // preference is on, and only for a text note.
                        showModeButton = (edit.isTextType || (edit.isDrawType && !drawingCanvasMode)) && !isReadOnlyAccess &&
                            container.editorPrefs.readModeEnabled,
                        viewMode = viewMode,
                        showDrawModeButton = edit.isDrawType && !isReadOnlyAccess,
                        // ModalFooter.jsx's read-only pill names whoever set it.
                        readOnlyTooltip = if (isReadOnlyAccess) {
                            roster.orEmpty().firstOrNull { it.isOwner }
                                ?.let { owner -> owner.name.ifBlank { owner.email } }
                                ?.takeIf { it.isNotBlank() }
                                ?.let { stringResource(R.string.native_read_only_set_by, it) }
                                ?: stringResource(R.string.native_access_read_only)
                        } else {
                            null
                        },
                        drawingCanvasMode = drawingCanvasMode,
                        readModeEnabled = container.editorPrefs.readModeEnabled,
                        // The web keeps Collaborate and Trash in the footer for
                        // every type except a text note actually being edited
                        // (ModalFooter.jsx's own `isDesktop || viewMode ||
                        // mType !== "text"`) - a text note being VIEWED still
                        // gets them here, they only move into the kebab while
                        // editing. A drawing being actively drawn hides
                        // Collaborate the same way (moves into its own kebab
                        // entry below); Trash has no such exception.
                        showCollaborateButton = (viewMode || !edit.isTextType) &&
                            !(edit.isDrawType && !drawingCanvasMode && !viewMode) &&
                            (isOwnerAccess || !currentNote.collaborators.isNullOrEmpty()),
                        showTrashButton = viewMode || !edit.isTextType,
                        trashed = currentNote.trashed,
                        onColorClick = { showColorPicker = true },
                        onImageClick = { showImageMenu = true },
                        onLogoClick = { openLogoPicker() },
                        onTagsClick = { tagInput = ""; showTagsPicker = true },
                        onUndoClick = { undoNote() },
                        onRedoClick = { redoNote() },
                        onModeClick = {
                            val max = contentScroll.maxValue
                            modeSwitchScrollRatio = if (max in 1 until Int.MAX_VALUE) contentScroll.value.toFloat() / max else null
                            viewMode = !viewMode
                        },
                        onDrawModeClick = {
                            if (drawingCanvasMode) {
                                // onExitDrawToView: back on the read face whenever
                                // that preference is on, whatever face was left.
                                drawingCanvasMode = false
                                viewMode = container.editorPrefs.readModeEnabled
                            } else {
                                // Each draw session starts with an empty history,
                                // as the web's draw-mode canvas mounts afresh.
                                drawingUndoStack = emptyList()
                                drawingRedoStack = emptyList()
                                drawingCanvasMode = true
                            }
                            showFormatSheet = false
                        },
                        onFormatClick = { showFormatSheet = !showFormatSheet },
                        onCollaborateClick = { openCollaborators() },
                        onTrashClick = { askTrash() },
                        onKebabClick = { menuExpanded = true },
                        imagePanel = {
                            if (showImageMenu) {
                                AddImageMenu(
                                    dark = dark,
                                    hasIcon = currentNote.icon != null,
                                    onAddImage = {
                                        photoPickerLauncher.launch(
                                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                        )
                                    },
                                    onAddIcon = { openLogoPicker() },
                                    onRemoveIcon = { applyIcon(null) },
                                    onDismiss = { showImageMenu = false },
                                )
                            }
                            logoPickerPanel()
                        },
                        // The two buttons are mutually exclusive (an image
                        // note never has the audio one and back), so both
                        // slots hang the same picker off whichever is there.
                        logoPanel = { logoPickerPanel() },
                        colorPanel = {
                            if (showColorPicker) {
                                NoteColorPopover(
                                    currentColorKey = currentNote.color,
                                    dark = dark,
                                    enabled = !changingColor,
                                    onSelect = { colorKey -> changeColor(colorKey) },
                                    onDismiss = { showColorPicker = false },
                                )
                            }
                        },
                        tagsPanel = {
                            if (showTagsPicker) {
                                NoteTagsPopover(
                                    appliedTags = currentNote.tags,
                                    allTags = tagsWithCounts,
                                    input = tagInput,
                                    enabled = !changingTags,
                                    themeId = container.themeState.themeId,
                                    dark = dark,
                                    onInputChange = { value ->
                                        // A comma commits everything before it as a
                                        // tag, same trigger the web uses on
                                        // keydown/paste (ModalFooter.jsx's
                                        // handleTagKeyDown / handleTagPaste); Compose
                                        // has no pre-insertion key intercept for a
                                        // soft keyboard, so this reacts to the comma
                                        // once it is in the text instead, which lands
                                        // on the same end state.
                                        if (value.contains(",")) {
                                            val segments = value.split(",")
                                            addTagsFromInput(segments.dropLast(1).joinToString(","))
                                            tagInput = segments.last()
                                        } else {
                                            tagInput = value
                                        }
                                    },
                                    onToggle = { tag -> toggleTag(tag) },
                                    onCreate = { raw -> addTagsFromInput(raw); tagInput = "" },
                                    // Backspace in the empty field drops the last tag,
                                    // and leaving the panel keeps what was typed
                                    // (ModalFooter.jsx's keydown, useModalState.js's blur).
                                    onBackspaceEmpty = { currentNote.tags.lastOrNull()?.let { toggleTag(it) } },
                                    onDismiss = { addTagsFromInput(tagInput); showTagsPicker = false; tagInput = "" },
                                )
                            }
                        },
                        menu = {
                            if (menuExpanded) {
                                FooterPopover(
                                    gap = 8.dp,
                                    minWidth = 180.dp,
                                    cornerRadius = 8.dp,
                                    elevation = 10.dp,
                                    background = if (dark) KebabBgDark else Color.White,
                                    borderColor = borderColor,
                                    onDismiss = { menuExpanded = false },
                                ) {
                                    // ModalFooter.jsx's order: reminder, archive or
                                    // restore, convert, duplicate, download, AI,
                                    // collaborate, trash.
                                    if (!currentNote.trashed) {
                                        PopoverMenuItem(
                                            label = stringResource(R.string.native_note_detail_reminder),
                                            color = reminderMenuColor,
                                            enabled = !changingReminder,
                                            onClick = { menuExpanded = false; showReminderPicker = true },
                                        ) {
                                            if (currentNote.reminderAt != null) {
                                                BellRingingFilledIcon(size = 18.dp, tint = reminderMenuColor)
                                            } else {
                                                BellIcon(size = 18.dp, tint = reminderMenuColor)
                                            }
                                        }
                                    }
                                    // Archive/restore are owner-only on the server (see
                                    // NoteDto.access's own doc comment), stricter than
                                    // the read/write split gating everything above.
                                    if (isOwnerAccess) {
                                        if (currentNote.trashed) {
                                            PopoverMenuItem(
                                                label = stringResource(R.string.native_note_detail_restore),
                                                color = archiveMenuColor,
                                                enabled = !restoring,
                                                onClick = { menuExpanded = false; restoreNote() },
                                            ) {
                                                ArchiveIcon(size = 16.dp, tint = archiveMenuColor)
                                            }
                                        } else {
                                            PopoverMenuItem(
                                                label = stringResource(
                                                    if (currentNote.archived) R.string.native_note_detail_unarchive
                                                    else R.string.native_note_detail_archive
                                                ),
                                                color = archiveMenuColor,
                                                enabled = !archiving,
                                                onClick = { menuExpanded = false; toggleArchive() },
                                            ) {
                                                ArchiveIcon(size = 16.dp, tint = archiveMenuColor)
                                            }
                                        }
                                    }
                                    if (!currentNote.trashed && !isReadOnlyAccess &&
                                        (edit.isTextType || edit.isChecklistType)
                                    ) {
                                        PopoverMenuItem(
                                            label = stringResource(
                                                if (edit.isTextType) R.string.native_note_detail_convert_to_checklist
                                                else R.string.native_note_detail_convert_to_text
                                            ),
                                            color = convertColor,
                                            enabled = !converting,
                                            onClick = { menuExpanded = false; showConvertConfirm = true },
                                        ) {
                                            if (edit.isTextType) {
                                                ChecklistIcon(size = 20.dp, tint = convertColor)
                                            } else {
                                                TextNoteIcon(size = 20.dp, tint = convertColor)
                                            }
                                        }
                                    }
                                    if (!currentNote.trashed) {
                                        PopoverMenuItem(
                                            label = stringResource(R.string.native_note_detail_duplicate),
                                            color = duplicateColor,
                                            enabled = !duplicating,
                                            onClick = { menuExpanded = false; duplicateNote() },
                                        ) {
                                            DuplicateIcon(size = 16.dp, tint = duplicateColor)
                                        }
                                    }
                                    // Audio notes download from their own player menu.
                                    if (!edit.isAudioType) {
                                        PopoverMenuItem(
                                            label = stringResource(R.string.native_note_detail_download),
                                            color = downloadColor,
                                            onClick = { menuExpanded = false; downloadNote() },
                                        ) {
                                            DownloadIcon(size = 20.dp, tint = downloadColor)
                                        }
                                    }
                                    // Audio notes deliberately have no AI entry: there
                                    // is nothing to ask about a raw recording, and a
                                    // drawing being drawn has no text either
                                    // (NoteModal.jsx:522-525).
                                    if (noteAiAvailable && !currentNote.trashed) {
                                        PopoverMenuItem(
                                            label = stringResource(R.string.native_note_ai_menu),
                                            color = aiColor,
                                            onClick = { menuExpanded = false; openNoteAi() },
                                        ) {
                                            MessageSearchIcon(size = 20.dp, tint = aiColor)
                                        }
                                    }
                                    // Any participant may VIEW the roster, not just the
                                    // owner (see CollaboratorsScreen.kt's own doc
                                    // comment). The owner also gets it with zero
                                    // collaborators: its "+" action is the only way to
                                    // add the very first one. Mirrors the footer's own
                                    // showCollaborateButton exactly inverted: this only
                                    // takes over while actually editing (mobile web only
                                    // folds it into the kebab then), not while viewing.
                                    if (((!viewMode && edit.isTextType) ||
                                            (edit.isDrawType && !drawingCanvasMode && !viewMode)) &&
                                        (isOwnerAccess || !currentNote.collaborators.isNullOrEmpty())
                                    ) {
                                        PopoverMenuItem(
                                            label = stringResource(R.string.native_note_detail_collaborate),
                                            color = collaborateColor,
                                            onClick = { menuExpanded = false; openCollaborators() },
                                        ) {
                                            CollaborateIcon(size = 16.dp, tint = collaborateColor)
                                        }
                                    }
                                    // The footer trash button folds in here while a
                                    // text note is being edited.
                                    if (!viewMode && edit.isTextType) {
                                        PopoverMenuItem(
                                            label = stringResource(
                                                if (currentNote.trashed) R.string.native_note_detail_delete_permanently
                                                else R.string.native_trash_title
                                            ),
                                            color = trashMenuColor,
                                            onClick = { menuExpanded = false; askTrash() },
                                        ) {
                                            TrashIcon(size = 20.dp, tint = trashMenuColor)
                                        }
                                    }
                                }
                            }
                        },
                    )
                }
            }
        }
        if (showConvertConfirm) {
            val toChecklist = editability?.isTextType == true
            GkConfirmDialog(
                title = stringResource(
                    if (toChecklist) R.string.native_note_detail_convert_to_checklist
                    else R.string.native_note_detail_convert_to_text
                ),
                message = stringResource(
                    if (toChecklist) R.string.native_note_detail_convert_to_checklist_confirm
                    else R.string.native_note_detail_convert_to_text_confirm
                ),
                confirmLabel = stringResource(R.string.native_note_detail_convert_action),
                cancelLabel = stringResource(R.string.native_note_detail_trash_confirm_cancel),
                themeId = container.themeState.themeId,
                dark = dark,
                borderColor = borderColor,
                titleColor = titleColor,
                subtextColor = subtextColor,
                onConfirm = { performConvertNoteType() },
                onDismiss = { showConvertConfirm = false },
            )
        }
        if (showTrashConfirm) {
            // The owner of a note that has collaborators gets an explicit
            // choice (mirrors the web's own ConfirmDeleteDialog collabOwner
            // variant): leaving via ownership transfer vs. hard-deleting
            // for every participant. Everyone else (a plain note, or a
            // collaborator leaving) keeps the simple single-button dialog
            // unchanged - the server's own default mode already does the
            // right thing for both of those without native needing to say
            // so explicitly (see TrashNoteRequest's own doc comment).
            if (isOwnerAccess && !note?.collaborators.isNullOrEmpty()) {
                // remove_self is the plain dialog's own default mode;
                // delete_for_all is owner-only server-side.
                GkChoiceDialog(
                    title = stringResource(R.string.native_note_detail_delete_shared_question),
                    message = stringResource(R.string.native_note_detail_delete_shared_subtitle),
                    mildLabel = stringResource(R.string.native_note_detail_remove_for_me),
                    drasticLabel = stringResource(R.string.native_note_detail_delete_for_all),
                    dark = dark,
                    borderColor = borderColor,
                    titleColor = titleColor,
                    onMild = { confirmTrash("remove_self") },
                    onDrastic = { confirmTrash("delete_for_all") },
                    onDismiss = { showTrashConfirm = false },
                )
            } else {
                ConfirmDeleteDialog(
                    title = stringResource(R.string.native_note_detail_trash_confirm_title),
                    body = stringResource(R.string.native_note_detail_trash_confirm_body),
                    confirmLabel = stringResource(R.string.native_note_detail_move_to_trash),
                    dark = dark,
                    enabled = !trashing,
                    onDismiss = { showTrashConfirm = false },
                    onConfirm = { confirmTrash() },
                )
            }
        }

        if (showPermanentDeleteConfirm) {
            ConfirmDeleteDialog(
                title = stringResource(R.string.native_note_detail_permanent_delete_confirm_title),
                body = stringResource(R.string.native_note_detail_permanent_delete_confirm_body),
                confirmLabel = stringResource(R.string.native_note_detail_delete_permanently),
                dark = dark,
                enabled = !deletingPermanently,
                onDismiss = { showPermanentDeleteConfirm = false },
                onConfirm = { confirmPermanentDelete() },
            )
        }

        if (showLinkDialog) {
            linkDialogTarget?.let { target ->
                RichLinkDialog(
                    dark = dark,
                    titleColor = titleColor,
                    subtextColor = subtextColor,
                    borderColor = borderColor,
                    initialHref = target.existingHref,
                    onDismiss = { closeLinkDialog() },
                    onConfirm = { href -> setRichLink(href) },
                    onRemove = { removeRichLink() },
                )
            }
        }

        viewerIndex?.let { index ->
            FullscreenImageViewer(
                images = images,
                initialIndex = index,
                dark = dark,
                // NoteModal.jsx: `mType === "checklist" || !viewMode`.
                canRemove = !changingImages && !isNoteReadOnly && (editability?.isChecklistType == true || !viewMode),
                onClose = { viewerIndex = null },
                onRemove = { image -> removeImage(image) },
                onDownload = { image -> downloadImage(image) },
            )
        }

        if (showReminderPicker) {
            ReminderPickerOverlay(
                currentReminderIso = note?.reminderAt,
                timeChips = reminderTimeChips,
                themeId = container.themeState.themeId,
                dark = dark,
                onChipsChange = { chips ->
                    reminderTimeChips = chips
                    scope.launch { repository.setReminderTimeChips(chips) }
                },
                onSave = { picked ->
                    setReminder(formatIso(picked))
                    showReminderPicker = false
                },
                onRemove = {
                    setReminder(null)
                    showReminderPicker = false
                },
                onDismiss = { showReminderPicker = false },
            )
        }

        // Over the whole note, the web's own `.note-ai-panel-mobile`
        // (a fixed inset-0 layer, NoteModal.jsx:1131-1143), sliding in from
        // the right in 0.32s and back out in 0.28s.
        AnimatedVisibility(
            visible = noteAiOpen && noteAiAvailable,
            enter = slideInHorizontally(tween(320, easing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f))) { it },
            exit = slideOutHorizontally(tween(280, easing = CubicBezierEasing(0.55f, 0f, 0.55f, 0.6f))) { it },
        ) {
            NoteAiChatPanel(
                messages = noteAiMessages,
                loading = noteAiLoading,
                error = noteAiError,
                saved = noteAiSaved,
                background = modalBg,
                dark = dark,
                typography = container.editorPrefs.typography.activeProfile,
                onSend = { question -> sendNoteAiMessage(question) },
                onStop = { stopNoteAi() },
                // Back keeps the thread, the X throws it away unless it
                // was explicitly kept.
                onHide = { noteAiOpen = false },
                onClose = {
                    stopNoteAi()
                    noteAiOpen = false
                    noteAiHasBeenOpened = false
                    if (!noteAiSaved) {
                        noteAiMessages = emptyList()
                        noteAiError = null
                    }
                },
                onSave = {
                    noteAiSaved = true
                    container.noteAiStore.save(noteId, noteAiMessages)
                },
                onReset = {
                    noteAiSaved = false
                    noteAiMessages = emptyList()
                    noteAiError = null
                    container.noteAiStore.remove(noteId)
                },
            )
        }

        if (showCollaborators) {
            CollaboratorsScreen(
                container = container,
                serverUrl = serverUrl,
                noteId = noteId,
                isOwner = isOwnerAccess,
                currentUserId = currentUserId,
                collaborators = roster.orEmpty(),
                onCollaboratorsChange = { applyRoster(it) },
                onClose = { showCollaborators = false },
            )
        }
    }
}

/** Applied-tags chip row, wrapping onto as many lines as needed. FlowRow is
 *  still gated behind ExperimentalLayoutApi upstream even though it's long
 *  since been stable in practice, so the opt-in is scoped to just this one
 *  small composable rather than the whole screen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagChipsRow(
    tags: List<String>,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    onRemove: (String) -> Unit,
) {
    // .gk-tag-chip (globalCSS.js:6239-6246): accent at 12% behind, at 24%
    // on the border, and the text in --gk-icon-fg rather than the accent.
    val accent = WorkspaceTheme.accent(themeId, dark)
    val chipFg = WorkspaceTheme.iconPillFg(themeId, dark)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for (tag in tags) {
            val removeLabel = String.format(stringResource(R.string.native_note_detail_tags_remove), tag)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(accent.copy(alpha = 0.12f))
                    .border(width = 1.dp, color = accent.copy(alpha = 0.24f), shape = RoundedCornerShape(999.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(tag, color = chipFg, fontSize = 11.sp, lineHeight = 16.5.sp, fontWeight = FontWeight.SemiBold)
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .semantics { contentDescription = removeLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            enabled = enabled,
                            role = Role.Button,
                        ) { onRemove(tag) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("\u00D7", color = accent.copy(alpha = 0.65f), fontSize = 11.sp, lineHeight = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** The kebab menu's own dark fill, set inline on the web
 *  (ModalFooter.jsx:695) rather than through a Tailwind class. */
private val KebabBgDark = Color(0xFF222222)
private val ColorPanelBgLight = Color(0xFAFFFFFF)
private val ColorPanelBgDark = Color(0xFA101828)
private val ColorPanelBorderLight = Color(0xCCF3F4F6)
private val ColorPanelBorderDark = Color(0x80364153)
private val ColorDotDefaultBorderLight = Color(0xFFD1D5DC)
private val ColorDotDefaultBorderDark = Color(0xFF6A7282)
private val ColorDotDefaultInnerDark = Color(0xFF1F2937)
// Tailwind v4 indigo-500, and the ring-offset gap in white / gray-900.
private val ColorSelectionRing = Color(0xFF615FFF)
private val ColorRingOffsetDark = Color(0xFF101828)
private val TagPanelBgLight = Color(0xFFFFFFFF)
private val TagPanelBgDark = Color(0xFF101828)
private val TagSearchBgLight = Color(0xFFF9FAFB)
private val TagSearchBgDark = Color(0xCC1E2939)
private val TagSearchBorderLight = Color(0xCCE5E7EB)
private val TagSearchBorderDark = Color(0x99364153)
private val TagMutedLight = Color(0xFF99A1AF)
private val TagMutedDark = Color(0xFF6A7282)
private val TagRowFgLight = Color(0xFF364153)
private val TagRowFgDark = Color(0xFFE5E7EB)
private val TagDividerLight = Color(0xFFF3F4F6)
private val TagDividerDark = Color(0xFF1E2939)
private val TagCreateBgLight = Color(0xCCD0FAE5)
private val TagCreateBgDark = Color(0x66006045)
private val TagCreateFgLight = Color(0xFF009966)
private val TagCreateFgDark = Color(0xFF00D492)
private val TagCreateIconLight = Color(0xFF00BC7D)

/**
 * ColorPickerPanel.jsx: a 256px card opening upward from the palette
 * button, three rows of four 48px dots with 12px gaps, and no animation
 * at all - it simply appears.
 */
@Composable
internal fun NoteColorPopover(
    currentColorKey: String?,
    dark: Boolean,
    enabled: Boolean,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
    below: Boolean = false,
) {
    FooterPopover(
        width = 256.dp,
        gap = 8.dp,
        below = below,
        background = if (dark) ColorPanelBgDark else ColorPanelBgLight,
        borderColor = if (dark) ColorPanelBorderDark else ColorPanelBorderLight,
        ringColor = if (dark) Color.White.copy(alpha = 0.05f) else Color.Black.copy(alpha = 0.05f),
        onDismiss = onDismiss,
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            NOTE_COLOR_ORDER.chunked(4).forEach { rowKeys ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    rowKeys.forEach { colorKey ->
                        NoteColorDot(
                            colorKey = colorKey,
                            selected = colorKey == currentColorKey,
                            dark = dark,
                            enabled = enabled,
                            onClick = { onSelect(colorKey) },
                        )
                    }
                }
            }
        }
    }
}

/** One 48px dot. `default` is drawn as an empty ring with its own inner
 *  disc and never carries the check mark, exactly as the web does. */
@Composable
private fun NoteColorDot(
    colorKey: String,
    selected: Boolean,
    dark: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val isDefault = colorKey == "default"
    val label = noteColorName(colorKey)
    Box(
        modifier = Modifier
            .size(48.dp)
            // ring-[3px] with ring-offset-2: the ring sits 2dp outside
            // the dot, in the 12dp gap, and never moves the grid.
            .drawBehind {
                if (!selected) return@drawBehind
                val stroke = 3.dp.toPx()
                val offset = 2.dp.toPx()
                drawCircle(
                    color = if (dark) ColorRingOffsetDark else Color.White,
                    radius = size.minDimension / 2f + offset / 2f,
                    style = Stroke(width = offset),
                )
                drawCircle(
                    color = ColorSelectionRing,
                    radius = size.minDimension / 2f + 2.dp.toPx() + stroke / 2f,
                    style = Stroke(width = stroke),
                )
            }
            .clip(CircleShape)
            .background(if (isDefault) Color.Transparent else noteColorFor(colorKey, dark))
            .then(
                if (isDefault) {
                    Modifier.border(
                        width = 2.dp,
                        color = if (dark) ColorDotDefaultBorderDark else ColorDotDefaultBorderLight,
                        shape = CircleShape,
                    )
                } else {
                    Modifier
                },
            )
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (isDefault) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(if (dark) ColorDotDefaultInnerDark else Color.White),
            )
        } else if (selected) {
            // drop-shadow-sm: 0 1px 2px black 15%, where the platform can blur.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                CheckFilledIcon(
                    size = 20.dp,
                    tint = Color.Black.copy(alpha = 0.15f),
                    modifier = Modifier.offset(y = 1.dp).blur(cssBlur(1.dp), BlurredEdgeTreatment.Unbounded),
                )
            }
            CheckFilledIcon(size = 20.dp, tint = Color.White)
        }
    }
}

/**
 * ModalFooter.jsx's tag menu: a 260px card opening 6px above the tag
 * button, with a search pill, the existing tags with their usage counts,
 * a create row, and the applied chips at the bottom. No animation.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NoteTagsPopover(
    appliedTags: List<String>,
    allTags: List<TagCount>,
    input: String,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    onInputChange: (String) -> Unit,
    onToggle: (String) -> Unit,
    onCreate: (String) -> Unit,
    onBackspaceEmpty: () -> Unit,
    onDismiss: () -> Unit,
) {
    val trimmed = input.trim()
    val filtered = remember(allTags, trimmed) {
        if (trimmed.isEmpty()) allTags else allTags.filter { it.tag.contains(trimmed, ignoreCase = true) }
    }
    val isNewTag = trimmed.isNotEmpty() && allTags.none { it.tag.equals(trimmed, ignoreCase = true) }
    val muted = if (dark) TagMutedDark else TagMutedLight
    val rowFg = if (dark) TagRowFgDark else TagRowFgLight
    val divider = if (dark) TagDividerDark else TagDividerLight
    val accent = WorkspaceTheme.accent(themeId, dark)

    FooterPopover(
        width = 260.dp,
        gap = 6.dp,
        background = if (dark) TagPanelBgDark else TagPanelBgLight,
        // .gk-tag-popover overrides Tailwind's own border with the
        // workspace accent at 22% (globalCSS.js:6213-6215).
        borderColor = accent.copy(alpha = 0.22f),
        onDismiss = onDismiss,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 6.dp),
        ) {
            var focused by remember { mutableStateOf(false) }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (dark) TagSearchBgDark else TagSearchBgLight)
                    .border(
                        width = 1.dp,
                        color = if (focused) accent else if (dark) TagSearchBorderDark else TagSearchBorderLight,
                        shape = RoundedCornerShape(12.dp),
                    )
                    // px-2.5 py-1.5 inside the 1px border.
                    .padding(horizontal = 11.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SearchIcon(size = 12.dp, tint = muted)
                Spacer(Modifier.width(8.dp))
                BasicTextField(
                    value = input,
                    onValueChange = onInputChange,
                    singleLine = true,
                    enabled = enabled,
                    textStyle = TextStyle(color = rowFg, fontSize = 14.sp, lineHeight = 20.sp),
                    cursorBrush = SolidColor(accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { if (trimmed.isNotEmpty()) onCreate(trimmed) }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .onFocusChanged { focused = it.isFocused }
                        .onPreviewKeyEvent { event ->
                            val eraseOnEmpty = event.type == KeyEventType.KeyDown && event.key == Key.Backspace && input.isEmpty()
                            if (eraseOnEmpty) onBackspaceEmpty()
                            eraseOnEmpty
                        },
                    decorationBox = { innerTextField ->
                        if (input.isEmpty()) {
                            Text(
                                stringResource(R.string.native_note_detail_tags_search_placeholder),
                                color = muted,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                            )
                        }
                        innerTextField()
                    },
                )
            }
        }

        if (filtered.isNotEmpty()) {
            Text(
                stringResource(R.string.native_note_detail_tags_existing).uppercase(),
                color = muted,
                fontSize = 10.sp,
                lineHeight = 15.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.5.sp,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
            Column(
                modifier = Modifier
                    .heightIn(max = 208.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 6.dp)
                    .padding(bottom = 6.dp),
            ) {
                filtered.forEach { entry ->
                    val checked = appliedTags.any { it.equals(entry.tag, ignoreCase = true) }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                enabled = enabled,
                                role = Role.Checkbox,
                            ) { onToggle(entry.tag) }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(18.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (checked) WorkspaceTheme.gradFrom(themeId) else Color.Transparent)
                                .border(
                                    width = 2.dp,
                                    color = if (checked) {
                                        WorkspaceTheme.gradFrom(themeId)
                                    } else if (dark) {
                                        ColorDotDefaultBorderDark
                                    } else {
                                        ColorDotDefaultBorderLight
                                    },
                                    shape = RoundedCornerShape(6.dp),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (checked) CheckmarkIcon(size = 12.dp, tint = Color.White)
                        }
                        Spacer(Modifier.width(10.dp))
                        SmallTagFilledIcon(size = 12.dp, tint = rowFg.copy(alpha = 0.5f))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            entry.tag,
                            color = rowFg,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            fontWeight = if (checked) FontWeight.SemiBold else FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            entry.count.toString(),
                            color = muted,
                            fontSize = 10.sp,
                            lineHeight = 15.sp,
                            fontWeight = FontWeight.Medium,
                            style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
                        )
                    }
                }
            }
        } else if (!isNewTag) {
            Text(
                stringResource(R.string.native_note_detail_tags_none_found),
                color = muted,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
                textAlign = TextAlign.Center,
            )
        }

        if (isNewTag) {
            if (filtered.isNotEmpty()) {
                Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp).height(1.dp).background(divider))
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 6.dp, vertical = 6.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = enabled,
                        role = Role.Button,
                    ) { onCreate(trimmed) }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (dark) TagCreateBgDark else TagCreateBgLight),
                    contentAlignment = Alignment.Center,
                ) {
                    PlusIcon(size = 12.dp, tint = if (dark) TagCreateFgDark else TagCreateIconLight)
                }
                Spacer(Modifier.width(8.dp))
                // Only the new tag's name is semibold.
                val createLabel = String.format(stringResource(R.string.native_note_detail_tags_create), trimmed)
                val nameStart = createLabel.lastIndexOf(trimmed)
                Text(
                    buildAnnotatedString {
                        append(createLabel)
                        if (nameStart >= 0) {
                            addStyle(SpanStyle(fontWeight = FontWeight.SemiBold), nameStart, nameStart + trimmed.length)
                        }
                    },
                    color = if (dark) TagCreateFgDark else TagCreateFgLight,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        if (appliedTags.isNotEmpty()) {
            Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp).height(1.dp).background(divider))
            Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                TagChipsRow(
                    tags = appliedTags,
                    enabled = enabled,
                    themeId = themeId,
                    dark = dark,
                    onRemove = onToggle,
                )
            }
        }
    }
}

/** Auto-prepends https:// for a bare domain typed without one, a smaller
 *  version of the web's LinkPopover ensureSchemeURL (no email/phone-number
 *  scheme detection, a reasonable cut for a notes app's own links). */
private fun normalizeRichLinkUrl(input: String): String {
    val trimmed = input.trim()
    return if (trimmed.contains("://") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
        trimmed
    } else {
        "https://$trimmed"
    }
}


// internal, not private: Kotlin's top-level `private` is file-scoped, and
// RichTextEditor.kt's link dialog reuses this exact styling.
@Composable
internal fun detailFieldColors(textColor: Color, subtextColor: Color, borderColor: Color) =
    OutlinedTextFieldDefaults.colors(
        focusedTextColor = textColor,
        unfocusedTextColor = textColor,
        focusedBorderColor = Indigo,
        unfocusedBorderColor = borderColor,
        focusedLabelColor = Indigo,
        unfocusedLabelColor = subtextColor,
        cursorColor = Indigo,
    )

/** ConfirmDeleteDialog.jsx's plain and trashed variants: a centred card
 *  over a `bg-black/40` scrim, title, one line of explanation, then Cancel
 *  and the red action side by side at the bottom right, both at the
 *  body's 16px, weight 400. */
@Composable
private fun ConfirmDeleteDialog(
    title: String,
    body: String,
    confirmLabel: String,
    dark: Boolean,
    enabled: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    GkDialog(
        onDismissRequest = onDismiss,
        dark = dark,
        borderColor = borderColor,
        maxWidth = 384.dp,
        scrimAlpha = ConfirmDialogDim,
    ) {
        Text(title, color = titleColor, fontSize = 18.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(body, color = if (dark) DialogBodyDark else DialogBodyLight, fontSize = 14.sp, lineHeight = 20.sp)
        Spacer(Modifier.height(20.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
        ) {
            GkSecondaryButton(
                label = stringResource(R.string.native_note_detail_trash_confirm_cancel),
                borderColor = borderColor,
                textColor = titleColor,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Normal,
                onClick = onDismiss,
            )
            GkDangerButton(
                label = confirmLabel,
                enabled = enabled,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Normal,
                onClick = onConfirm,
            )
        }
    }
}

/** Any newline the user manages to get into a title (IME, paste, drop) is
 *  flattened to a space, same guard ModalHeader.jsx keeps: titles are
 *  single-line everywhere else, and a stray "\n" silently breaks layout. */
private val TitleNewlines = Regex("[\\r\\n]+")

/** ModalHeader.jsx's mobile AI toggle, after a 1x16 separator: the
 *  message-search glyph and a chevron, with an indigo dot while the
 *  hidden thread has messages. */
@Composable
private fun NoteAiHeaderToggle(dark: Boolean, hasMessages: Boolean, onClick: () -> Unit) {
    val label = stringResource(R.string.native_note_ai_menu)
    val tint = if (dark) Color(0xFFA5B4FC) else Color(0xFF6366F1)
    Spacer(Modifier.width(4.dp))
    Box(Modifier.size(width = 1.dp, height = 16.dp).background(if (dark) Color(0xFF4A5565) else Color(0xFFD1D5DC)))
    Spacer(Modifier.width(4.dp))
    Box(
        modifier = Modifier
            .height(32.dp)
            .clip(CircleShape)
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MessageSearchIcon(size = 26.dp, tint = tint)
            ChevronRightIcon(size = 22.dp, tint = tint, modifier = Modifier.offset(x = (-4).dp))
        }
        if (hasMessages) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 2.dp, y = (-2).dp)
                    .border(1.5.dp, if (dark) Color(0xFF1E2939) else Color.White, CircleShape)
                    .padding(1.5.dp)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF615FFF)),
            )
        }
    }
}

/** `.modal-footer-toolbar`'s `box-shadow: 0 -1px 3px`: the soft strip it
 *  casts above its top edge (the box moved up 1px, blurred with a standard
 *  deviation of 1.5px). */
private fun Modifier.footerShadow(dark: Boolean): Modifier = drawBehind {
    val alpha = if (dark) 0.20f else 0.06f
    val depth = 4.dp.toPx()
    val px = 1.dp.toPx()
    val stops = Array(FooterShadowSteps + 1) { step ->
        val fraction = step.toFloat() / FooterShadowSteps
        val distance = (1f - fraction) * depth
        fraction to Color.Black.copy(alpha = alpha * gaussianCdf((px - distance) / (1.5f * px)))
    }
    drawRect(
        brush = Brush.verticalGradient(*stops, startY = -depth, endY = 0f),
        topLeft = Offset(0f, -depth),
        size = Size(size.width, depth),
    )
}

private const val FooterShadowSteps = 8

/** The "Edited:" line and its ⓘ, whose tooltip names the note id. */
@Composable
private fun EditedStamp(stamp: String, noteId: String, dark: Boolean, modifier: Modifier) {
    val color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565)
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            String.format(stringResource(R.string.native_note_detail_edited_prefix), stamp),
            color = color,
            fontSize = 12.sp,
            lineHeight = 16.sp,
        )
        Text(
            "\u24D8",
            color = color.copy(alpha = 0.3f),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.gkTooltip(String.format(stringResource(R.string.native_note_detail_note_id), noteId)),
        )
    }
}

/** "Edited:" stamp value. The web prints a locale date-time; this is the
 *  device-locale equivalent. */
/** NoteModal.jsx's "Modifie" line: who last touched a shared note and
 *  when, else the note's own last change. Today and yesterday are named,
 *  the year only shows when it isn't this one. */
private fun editedStampText(note: NoteDto, todayLabel: String, yesterdayLabel: String): String? {
    val by = note.lastEditedBy?.takeIf { it.isNotBlank() }
    val iso = (if (by != null) note.lastEditedAt else null) ?: note.updatedAt ?: note.timestamp ?: return null
    val ms = parseIsoToEpochMillis(iso) ?: return null
    val date = Calendar.getInstance().apply { timeInMillis = ms }
    val now = Calendar.getInstance()
    val yesterday = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -1) }
    fun sameDay(a: Calendar, b: Calendar) =
        a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)
    val time = DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault()).format(Date(ms))
    val formatted = when {
        sameDay(date, now) -> "$todayLabel, $time"
        sameDay(date, yesterday) -> "$yesterdayLabel, $time"
        date.get(Calendar.YEAR) == now.get(Calendar.YEAR) ->
            SimpleDateFormat("d LLL", Locale.getDefault()).format(Date(ms))
        else -> SimpleDateFormat("d LLL yyyy", Locale.getDefault()).format(Date(ms))
    }
    return if (by != null) "$by, $formatted" else formatted
}

/**
 * `.modal-icon-btn`: the 32dp round buttons of the note's sticky top bar.
 * The only tactile feedback the web has here is `transform: scale(0.9)`
 * over 0.08s on press (globalCSS.js:1362-1365) - hover effects never fire
 * on a phone - so that is the one interaction ported.
 */
@Composable
private fun ModalIconButton(
    contentDescription: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    tooltip: String? = contentDescription,
    activeBackground: Color? = null,
    activeShadow: Color? = null,
    activeRing: Color? = null,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.9f else 1f, tween(80), label = "modalIconPress")
    Box(
        modifier = Modifier
            .size(32.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .then(
                if (activeShadow != null) {
                    Modifier.dropShadow(CircleShape, Shadow(radius = 8.dp, color = activeShadow, offset = DpOffset(0.dp, 2.dp)))
                } else {
                    Modifier
                },
            )
            .clip(CircleShape)
            .then(if (activeBackground != null) Modifier.background(activeBackground) else Modifier)
            .then(if (activeRing != null) Modifier.border(1.dp, activeRing, CircleShape) else Modifier)
            .semantics { this.contentDescription = contentDescription }
            .then(if (tooltip != null) Modifier.gkTooltip(tooltip) else Modifier)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

/**
 * The save check in the top bar. Two states, both from globalCSS.js:
 * armed is white on an emerald gradient (1411-1423), idle is a hollow
 * ring in a very low-alpha emerald (1424-1432) rather than a greyed-out
 * button.
 */
@Composable
private fun ModalSaveButton(
    dark: Boolean,
    armed: Boolean,
    enabled: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.9f else 1f, tween(80), label = "modalSavePress")
    val idleTint = if (dark) Color(0xFF34D399).copy(alpha = 0.45f) else Color(0xFF10B981).copy(alpha = 0.25f)
    val idleBorder = if (dark) Color(0xFF34D399).copy(alpha = 0.25f) else Color(0xFF10B981).copy(alpha = 0.15f)
    Box(
        modifier = Modifier
            .size(32.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .then(
                if (armed) {
                    Modifier.background(Brush.horizontalGradient(listOf(Color(0xFF10B981), Color(0xFF059669))))
                } else {
                    Modifier.border(width = 1.dp, color = idleBorder, shape = CircleShape)
                },
            )
            .semantics { this.contentDescription = contentDescription }
            .gkTooltip(contentDescription)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        SaveCheckIcon(size = 16.dp, tint = if (armed) Color.White else idleTint)
    }
}

/**
 * The note title. Deliberately borderless and label-less: the web renders
 * a bare textarea at 18.4px/700 with no focus ring at all, sitting in the
 * scrollable flow rather than in the sticky bar.
 */
@Composable
private fun NoteTitleField(
    value: String,
    enabled: Boolean,
    asText: Boolean,
    titleColor: Color,
    placeholderColor: Color,
    onValueChange: (String) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, bottom = 4.dp),
    ) {
        if (asText) {
            // No placeholder here on purpose: the web's read face prints
            // nothing at all for an untitled note, it just keeps the one
            // line of height (min-height: 1.3em).
            Text(
                value,
                color = titleColor,
                fontSize = 18.4.sp,
                lineHeight = 23.9.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth().heightIn(min = 23.9.dp),
            )
            return@Box
        }
        if (value.isEmpty()) {
            Text(
                stringResource(R.string.native_note_detail_title_label),
                color = placeholderColor,
                fontSize = 18.4.sp,
                lineHeight = 23.9.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            readOnly = !enabled,
            textStyle = TextStyle(
                color = titleColor,
                fontSize = 18.4.sp,
                lineHeight = 23.9.sp,
                fontWeight = FontWeight.Bold,
            ),
            cursorBrush = SolidColor(titleColor),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * `.modal-footer-toolbar`: the note's own bottom action bar, which native
 * did not have at all (every action used to hide behind a top-right
 * kebab). Under 1024px the web makes every button a 34dp circle, drops
 * their labels, removes the left/right spacer and spreads them
 * space-evenly (globalCSS.js:1863-1889), over a translucent black veil
 * on top of the note color.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NoteModalFooter(
    dark: Boolean,
    iconColor: Color,
    borderColor: Color,
    themeId: String?,
    tagCount: Int,
    collaboratorCount: Int,
    imageButtonColor: Color,
    collaborateColor: Color,
    trashColor: Color,
    showColorButton: Boolean,
    showImageButton: Boolean,
    showLogoButton: Boolean,
    noteIconSrc: String?,
    showTagsButton: Boolean,
    showHistoryButtons: Boolean,
    canUndo: Boolean,
    canRedo: Boolean,
    showFormatButton: Boolean,
    formatOpen: Boolean,
    showModeButton: Boolean,
    viewMode: Boolean,
    showDrawModeButton: Boolean,
    readOnlyTooltip: String?,
    drawingCanvasMode: Boolean,
    readModeEnabled: Boolean,
    showCollaborateButton: Boolean,
    showTrashButton: Boolean,
    trashed: Boolean,
    onColorClick: () -> Unit,
    onImageClick: () -> Unit,
    onLogoClick: () -> Unit,
    onTagsClick: () -> Unit,
    onUndoClick: () -> Unit,
    onRedoClick: () -> Unit,
    onFormatClick: () -> Unit,
    onModeClick: () -> Unit,
    onDrawModeClick: () -> Unit,
    onCollaborateClick: () -> Unit,
    onTrashClick: () -> Unit,
    onKebabClick: () -> Unit,
    colorPanel: @Composable () -> Unit,
    imagePanel: @Composable () -> Unit,
    logoPanel: @Composable () -> Unit,
    tagsPanel: @Composable () -> Unit,
    menu: @Composable () -> Unit,
) {
    val imeVisible = WindowInsets.isImeVisible
    Column(
        Modifier
            .fillMaxWidth()
            .footerShadow(dark)
            // The root Column's own imePadding() already reserves room for
            // the keyboard, and that space reaches past where the nav bar
            // sits - so adding navigationBarsPadding on top of it while the
            // keyboard is up doubled the gap instead of matching it. Only
            // add it back once the keyboard closes. Outside the veil: the
            // web leaves the nav bar strip in the plain note colour.
            .then(if (imeVisible) Modifier else Modifier.navigationBarsPadding()),
    ) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
        if (BuildConfig.DEBUG) {
            SideEffect { Log.d("GKIme", "NoteModalFooter imeVisible=$imeVisible") }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (dark) Color.Black.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.04f))
                .padding(vertical = 6.dp),
            // ModalFooter.jsx's desktop layout splits into two clusters
            // held apart by a flex-1 spacer, but its own mobile media query
            // (globalCSS.js:1863-1890, max-width: 1023px) hides that spacer
            // and switches .modal-footer-inner to justify-content:
            // space-evenly across every icon - which is what a phone
            // actually renders, so that's what this matches.
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (showColorButton) {
                Box {
                    FooterIconButton(
                        contentDescription = stringResource(R.string.native_note_detail_color),
                        onClick = onColorClick,
                    ) {
                        PaletteIcon(size = 18.dp)
                    }
                    colorPanel()
                }
            }
            if (showImageButton) {
                Box {
                    FooterIconButton(
                        contentDescription = stringResource(R.string.native_note_detail_add_image),
                        badge = noteIconSrc?.let { src -> { NoteIconBadge(src) } },
                        onClick = onImageClick,
                    ) {
                        AddImageIcon(size = 20.dp, tint = imageButtonColor)
                    }
                    imagePanel()
                }
            }
            // An audio note has no image affordance to hang the logo entry
            // off, so the web gives it a button of its own (ModalFooter.jsx:297).
            if (showLogoButton) {
                Box {
                    FooterIconButton(
                        contentDescription = stringResource(
                            if (noteIconSrc != null) R.string.native_replace_logo else R.string.native_add_logo,
                        ),
                        badge = noteIconSrc?.let { src -> { NoteIconBadge(src) } },
                        onClick = onLogoClick,
                    ) {
                        LogoIcon(size = 20.dp, tint = imageButtonColor)
                    }
                    logoPanel()
                }
            }
            if (showTagsButton) {
                Box {
                    FooterIconButton(
                        contentDescription = stringResource(R.string.native_note_detail_tags),
                        badge = if (tagCount > 0) { { TagCountBadge(tagCount, themeId) } } else null,
                        onClick = onTagsClick,
                    ) {
                        TagIcon(size = 18.dp, tint = iconColor)
                    }
                    tagsPanel()
                }
            }
            if (showHistoryButtons) {
                FooterIconButton(
                    contentDescription = stringResource(R.string.native_note_detail_undo),
                    enabled = canUndo,
                    onClick = onUndoClick,
                ) {
                    UndoIcon(size = 18.dp, tint = iconColor)
                }
                FooterIconButton(
                    contentDescription = stringResource(R.string.native_note_detail_redo),
                    enabled = canRedo,
                    onClick = onRedoClick,
                ) {
                    RedoIcon(size = 18.dp, tint = iconColor)
                }
            }
            if (showFormatButton) {
                // .modal-footer-btn--fmt.is-active (globalCSS.js:1779-1786):
                // the only footer button with a lit background of its own.
                val formatColor = if (formatOpen) {
                    if (dark) Color(0xFFA5B4FC) else Color(0xFF6366F1)
                } else {
                    iconColor
                }
                FooterIconButton(
                    contentDescription = stringResource(R.string.native_richtext_format),
                    onClick = onFormatClick,
                    background = when {
                        !formatOpen -> Color.Transparent
                        dark -> Color(0xFF818CF8).copy(alpha = 0.22f)
                        else -> Color(0xFF6366F1).copy(alpha = 0.14f)
                    },
                ) {
                    TextColorIcon(size = 20.dp, tint = formatColor)
                }
            }
            if (showCollaborateButton) {
                FooterIconButton(
                    contentDescription = stringResource(R.string.native_note_detail_collaborate),
                    badge = if (collaboratorCount > 0) { { CollaboratorCountBadge(collaboratorCount, dark) } } else null,
                    onClick = onCollaborateClick,
                ) {
                    // 20dp, not the 18dp most other mobile footer icons use
                    // (mirrors ModalFooter.jsx's own footer button, bumped
                    // from 18 to 20 for the same reason): this glyph's own
                    // ink only fills about 60% of its 20-unit viewBox, so
                    // at 18dp it reads visibly smaller than its neighbours
                    // even though the box size matches. Sized up to match
                    // the footer's bigger tier (trash/kebab/image) instead
                    // of redrawing the glyph.
                    CollaborateIcon(size = 20.dp, tint = collaborateColor)
                }
            }
            if (showTrashButton) {
                FooterIconButton(
                    contentDescription = stringResource(
                        if (trashed) R.string.native_note_detail_delete_permanently else R.string.native_note_detail_move_to_trash,
                    ),
                    onClick = onTrashClick,
                ) {
                    TrashIcon(size = 20.dp, tint = trashColor)
                }
            }
            Box {
                FooterIconButton(
                    contentDescription = stringResource(R.string.native_note_detail_more),
                    onClick = onKebabClick,
                ) {
                    KebabIcon(size = 20.dp, tint = iconColor)
                }
                menu()
            }
            // A read-only share takes the mode buttons' place with an eye
            // pill (ModalFooter.jsx:848-866).
            if (readOnlyTooltip != null) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(WorkspaceTheme.accentSoftBg(themeId, dark))
                        .border(1.dp, WorkspaceTheme.accentSoftBorder(themeId, dark), CircleShape)
                        .semantics { contentDescription = readOnlyTooltip }
                        .gkTooltip(readOnlyTooltip)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    TablerEyeIcon(size = 20.dp, tint = WorkspaceTheme.accent(themeId, dark))
                }
            }
            // ModalFooter.jsx renders the view/edit toggle and the drawing
            // mode group after the kebab (and its popover/reminder picker),
            // not before it.
            // The view/edit toggle and the drawing toggle are one footer
            // slot, 8px apart (ModalFooter.jsx's `flex items-center gap-2`).
            if (showModeButton || showDrawModeButton) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (showModeButton) {
                        FooterIconButton(
                            contentDescription = stringResource(
                                if (viewMode) R.string.native_note_detail_switch_to_edit
                                else R.string.native_note_detail_switch_to_view
                            ),
                            // .modal-footer-btn--mode (globalCSS.js:1918-1923): always
                            // filled with this gradient, not just on an active state.
                            backgroundBrush = ModeButtonGradient,
                            onClick = onModeClick,
                        ) {
                            if (viewMode) {
                                PencilFilledIcon(size = 16.dp, tint = Color.White)
                            } else {
                                EyeFilledIcon(size = 16.dp, tint = Color.White)
                            }
                        }
                    }
                    if (showDrawModeButton) {
                        FooterIconButton(
                            contentDescription = stringResource(
                                when {
                                    !drawingCanvasMode -> R.string.native_drawing_enter_mode
                                    readModeEnabled -> R.string.native_drawing_exit_mode
                                    else -> R.string.native_drawing_exit_drawing
                                },
                            ),
                            backgroundBrush = ModeButtonGradient,
                            onClick = onDrawModeClick,
                        ) {
                            if (drawingCanvasMode) EyeFilledIcon(size = 16.dp, tint = Color.White)
                            else DrawWavesIcon(size = 16.dp, tint = Color.White)
                        }
                    }
                }
            }
        }
    }
}

/**
 * `.mobile-fmt-sheet` (globalCSS.js:1584-1699): the formatting sheet the
 * web slots between the note's scroll area and its footer. It is the
 * note's own colour one shade darker, keeps a 12px radius on its top
 * corners only, carries a 16px shadow band under that edge, and opens by
 * growing its height over 0.32s while fading in over 0.22s.
 *
 * The grabber drags the height 1:1 with the finger - the editor above
 * grows back as it shrinks, so the note stays readable during the
 * gesture - and lets go past 60px to close, exactly as NoteModal.jsx's
 * own pointer handlers do: below the threshold the sheet animates back to
 * its open height, past it the close continues from the dragged height.
 */
@Composable
private fun FormatSheet(
    open: Boolean,
    dark: Boolean,
    background: Color,
    onClose: () -> Unit,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    val scope = rememberCoroutineScope()
    val currentOnClose by rememberUpdatedState(onClose)
    val maxHeight = remember(configuration.screenHeightDp) {
        minOf(configuration.screenHeightDp * 0.58f, 460f).dp
    }
    // `max-height: min(58vh, 460px)` is a ceiling, not a target: the sheet
    // is as tall as its grabber strip, top border and toolbar (the toolbar's
    // own bottom padding included), and only scrolls past the cap.
    var contentHeightPx by remember { mutableIntStateOf(0) }
    val openHeight = (with(density) { contentHeightPx.toDp() } + FormatSheetGrabberHeight + FormatSheetBorder)
        .coerceAtMost(maxHeight)
    val easing = remember { CubicBezierEasing(0.32f, 0.72f, 0f, 1f) }
    val height = remember { Animatable(0.dp, Dp.VectorConverter) }
    var dragging by remember { mutableStateOf(false) }
    LaunchedEffect(open, openHeight, dragging) {
        if (!dragging) height.animateTo(if (open) openHeight else 0.dp, tween(durationMillis = 320, easing = easing))
    }
    if (BuildConfig.DEBUG) {
        SideEffect {
            Log.d(
                "GKSheet",
                "open=$open maxHeight=$maxHeight contentHeightPx=$contentHeightPx " +
                    "openHeight=$openHeight height=${height.value} dragging=$dragging",
            )
        }
    }
    val alpha by animateFloatAsState(
        targetValue = if (open) 1f else 0f,
        animationSpec = tween(durationMillis = 220, easing = easing),
        label = "formatSheetAlpha",
    )
    if (!open && !dragging && height.value <= 0.dp) return

    var grabberPressed by remember { mutableStateOf(false) }
    val grabberColor by animateColorAsState(
        targetValue = when {
            dark && grabberPressed -> Color.White.copy(alpha = 0.5f)
            dark -> Color.White.copy(alpha = 0.32f)
            grabberPressed -> Color.Black.copy(alpha = 0.45f)
            else -> Color.Black.copy(alpha = 0.28f)
        },
        animationSpec = tween(durationMillis = 120),
        label = "grabberColor",
    )
    val grabberScale by animateFloatAsState(
        targetValue = if (grabberPressed) 1.15f else 1f,
        animationSpec = tween(durationMillis = 120),
        label = "grabberScale",
    )

    val topBorder = if (dark) Color.White.copy(alpha = 0.14f) else Color.Black.copy(alpha = 0.15f)
    val sideBorder = if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.1f)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(height.value)
            .graphicsLayer { this.alpha = alpha }
            .clip(RoundedCornerShape(topStart = FormatSheetRadius, topEnd = FormatSheetRadius))
            .background(background)
            // The sheet reads one shade darker than the note itself: a
            // flat veil over its colour, not a different colour.
            .background(Color.Black.copy(alpha = if (dark) 0.18f else 0.07f))
            .drawBehind { drawFormatSheetFrame(topBorder, sideBorder) },
    ) {
        // The ::before shadow band, inside the top border and under the
        // grabber and the toolbar (z-index 1 against their 2).
        Box(
            modifier = Modifier
                .padding(start = FormatSheetBorder, end = FormatSheetBorder, top = FormatSheetBorder)
                .fillMaxWidth()
                .height(16.dp)
                .background(
                    if (dark) {
                        SolidColor(Color.White.copy(alpha = 0.32f))
                    } else {
                        Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.12f), Color.Transparent))
                    },
                ),
        )
        Column(
            Modifier
                .fillMaxWidth()
                .padding(start = FormatSheetBorder, end = FormatSheetBorder, top = FormatSheetBorder),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(FormatSheetGrabberHeight)
                    .pointerInput(Unit) {
                        var dragged = 0f
                        var base = 0f
                        detectVerticalDragGestures(
                            onDragStart = {
                                grabberPressed = true
                                dragging = true
                                dragged = 0f
                                base = height.value.toPx()
                            },
                            onVerticalDrag = { change, delta ->
                                change.consume()
                                dragged = (dragged + delta).coerceAtLeast(0f)
                                val target = (base - dragged).coerceAtLeast(0f).toDp()
                                scope.launch { height.snapTo(target) }
                            },
                            onDragEnd = {
                                grabberPressed = false
                                if (dragged.toDp() > 60.dp) currentOnClose()
                                dragging = false
                            },
                            onDragCancel = {
                                grabberPressed = false
                                dragging = false
                            },
                        )
                    },
                contentAlignment = Alignment.BottomCenter,
            ) {
                Box(
                    modifier = Modifier
                        .graphicsLayer { scaleX = grabberScale }
                        .width(42.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(grabberColor),
                )
            }
            // verticalScroll measures what it wraps with no height limit,
            // so onSizeChanged below it reports the toolbar's natural height.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .onSizeChanged { contentHeightPx = it.height },
            ) {
                content()
            }
        }
    }
}

private val FormatSheetRadius = 12.dp
private val FormatSheetBorder = 1.dp
private val FormatSheetGrabberHeight = 10.dp

/** The sheet's hairline frame: a darker top edge following the rounded
 *  corners, lighter sides, and no bottom edge. The colours change halfway
 *  round each corner, where CSS splits two differently coloured borders. */
private fun DrawScope.drawFormatSheetFrame(top: Color, side: Color) {
    val stroke = FormatSheetBorder.toPx()
    val inset = stroke / 2f
    val radius = FormatSheetRadius.toPx()
    val w = size.width
    val leftCorner = Rect(inset, inset, 2 * radius - inset, 2 * radius - inset)
    val rightCorner = Rect(w - 2 * radius + inset, inset, w - inset, 2 * radius - inset)
    val left = Path().apply {
        moveTo(inset, size.height)
        lineTo(inset, radius)
        arcTo(leftCorner, 180f, 45f, false)
    }
    val topEdge = Path().apply {
        arcTo(leftCorner, 225f, 45f, true)
        lineTo(w - radius, inset)
        arcTo(rightCorner, 270f, 45f, false)
    }
    val right = Path().apply {
        arcTo(rightCorner, 315f, 45f, true)
        lineTo(w - inset, size.height)
    }
    drawPath(left, side, style = Stroke(stroke))
    drawPath(topEdge, top, style = Stroke(stroke))
    drawPath(right, side, style = Stroke(stroke))
}

/** .modal-footer-btn--mode's fixed indigo-to-violet fill (globalCSS.js:1919),
 *  90deg left-to-right - shared by the text view/edit toggle and the two
 *  drawing-mode buttons, all three always filled rather than only on an
 *  active state. */
private val ModeButtonGradient = Brush.horizontalGradient(listOf(Color(0xFF6366F1), Color(0xFF7C3AED)))

/** One 34dp round button of the footer bar, with the optional counter
 *  badge the web pins to its top-right corner (16dp, 10sp bold, filled
 *  with the workspace theme's own gradient). */
@Composable
private fun FooterIconButton(
    contentDescription: String,
    onClick: () -> Unit,
    badge: (@Composable BoxScope.() -> Unit)? = null,
    background: Color = Color.Transparent,
    backgroundBrush: Brush? = null,
    enabled: Boolean = true,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.9f else 1f, tween(80), label = "footerIconPress")
    Box {
        Box(
            modifier = Modifier
                .size(34.dp)
                .graphicsLayer { scaleX = scale; scaleY = scale }
                .alpha(if (enabled) 1f else 0.5f)
                .clip(CircleShape)
                .then(if (backgroundBrush != null) Modifier.background(backgroundBrush) else Modifier.background(background))
                .semantics { this.contentDescription = contentDescription }
                .gkTooltip(contentDescription)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onClick() },
            contentAlignment = Alignment.Center,
        ) {
            content()
        }
        badge?.invoke(this)
    }
}

/** The note's logo as a 16px round thumbnail pinned outside the image
 *  (or audio logo) button's top-right corner (ModalFooter.jsx:258-268). */
@Composable
private fun BoxScope.NoteIconBadge(src: String) {
    val bitmap = rememberDecodedImage(src) ?: return
    Image(
        bitmap = bitmap,
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = Modifier
            .align(Alignment.TopEnd)
            .offset(x = 4.dp, y = (-4).dp)
            .size(16.dp)
            .clip(CircleShape),
    )
}

/** `.gk-tag-count-badge`: 16px, 10px bold, the theme gradient at 135deg. */
@Composable
private fun BoxScope.TagCountBadge(count: Int, themeId: String?) {
    Box(
        modifier = Modifier
            .align(Alignment.TopEnd)
            .offset(x = 4.dp, y = (-4).dp)
            .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    listOf(WorkspaceTheme.gradFrom(themeId), WorkspaceTheme.gradTo(themeId)),
                    start = Offset.Zero,
                    end = Offset.Infinite,
                ),
            )
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(count.toString(), color = Color.White, fontSize = 10.sp, lineHeight = 10.sp, fontWeight = FontWeight.Bold)
    }
}

/** The collaborate button's own count (ModalFooter.jsx:664-668): 14px,
 *  9px bold, indigo-500 to purple-600 towards the bottom-right, a 1.5px
 *  ring and a small shadow. */
@Composable
private fun BoxScope.CollaboratorCountBadge(count: Int, dark: Boolean) {
    Box(
        modifier = Modifier
            .align(Alignment.TopEnd)
            // The ring sits outside the 14px disc that -top-0.5/-right-0.5 place.
            .offset(x = 3.5.dp, y = (-3.5).dp)
            // shadow-md
            .dropShadow(CircleShape, Shadow(radius = 6.dp, color = Color.Black.copy(alpha = 0.10f), spread = (-1).dp, offset = DpOffset(0.dp, 4.dp)))
            .dropShadow(CircleShape, Shadow(radius = 4.dp, color = Color.Black.copy(alpha = 0.10f), spread = (-2).dp, offset = DpOffset(0.dp, 2.dp)))
            .border(1.5.dp, if (dark) Color(0xFF1E2939) else Color.White, CircleShape)
            .padding(1.5.dp)
            .defaultMinSize(minWidth = 14.dp, minHeight = 14.dp)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF615FFF), Color(0xFF9810FA)), start = Offset.Zero, end = Offset.Infinite))
            .padding(horizontal = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(count.toString(), color = Color.White, fontSize = 9.sp, lineHeight = 9.sp, fontWeight = FontWeight.Bold)
    }
}

/** Which of the two tones OfflineCollabBanner.jsx and
 *  FederationReadOnlyBanner.jsx paint their strip in. */
private enum class NoteBannerTone { AMBER, ROSE }

/**
 * The warning strip both note banners are: an 8px-rounded, bordered box
 * inset from the note's own margins, with a glyph and one line of text
 * (OfflineCollabBanner.jsx:8, same box as its federation sibling).
 */
@Composable
private fun NoteWarningBanner(
    message: String,
    tone: NoteBannerTone,
    dark: Boolean,
    icon: @Composable (Color) -> Unit,
) {
    val background = when {
        tone == NoteBannerTone.ROSE && dark -> Color(0x4D881337)
        tone == NoteBannerTone.ROSE -> Color(0xFFFFF1F2)
        dark -> Color(0x4D78350F)
        else -> Color(0xFFFFFBEB)
    }
    val border = when {
        tone == NoteBannerTone.ROSE && dark -> Color(0xFFE11D48)
        tone == NoteBannerTone.ROSE -> Color(0xFFFB7185)
        dark -> Color(0xFFD97706)
        else -> Color(0xFFFBBF24)
    }
    val textColor = when {
        tone == NoteBannerTone.ROSE && dark -> Color(0xFFFECDD3)
        tone == NoteBannerTone.ROSE -> Color(0xFF9F1239)
        dark -> Color(0xFFFDE68A)
        else -> Color(0xFF92400E)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(bottom = 8.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        icon(textColor)
        Text(message, color = textColor, fontSize = 14.sp, lineHeight = 18.sp)
    }
}
