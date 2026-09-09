package com.glasskeep.app.nativeapp.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.net.Uri
import android.text.format.DateFormat
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NoteExporter
import com.glasskeep.app.nativeapp.data.AudioClipDto
import com.glasskeep.app.nativeapp.data.AudioContent
import com.glasskeep.app.nativeapp.data.ChecklistItemData
import com.glasskeep.app.nativeapp.data.ChecklistItems
import com.glasskeep.app.nativeapp.data.DrawingContent
import com.glasskeep.app.nativeapp.data.DrawingDimensionsDto
import com.glasskeep.app.nativeapp.data.DrawingStrokeDto
import com.glasskeep.app.nativeapp.data.NoteContent
import com.glasskeep.app.nativeapp.data.formatIso
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.nativeapp.data.NoteImageData
import com.glasskeep.app.nativeapp.data.NoteImages
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.TagsJson
import com.glasskeep.app.nativeapp.data.toEntity
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.ui.DarkBgColor
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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
    /** Editable rows, or null when the checklist has section markers: see
     *  ChecklistItems.parseFlat, and the sections-fallback read-only view
     *  this null triggers below. Irrelevant (always null) when
     *  isChecklistType is false. */
    val checklistItems: List<ChecklistItemData>? = null,
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

/** One entry in the tag suggestion list: a tag already used on at least one
 *  of this user's notes, and how many. Mirrors App.jsx's tagsWithCounts. */
private data class TagCount(val tag: String, val count: Int)

/** Which block/range a pending Link dialog request targets, and the href
 *  already applied there if any (prefilled, with a Remove option). */
private data class LinkTarget(val blockId: String, val start: Int, val end: Int, val existingHref: String?)

/**
 * Milestone: opening and safely editing a single note, every note type the
 * server knows about. Checklist notes get their own flat editor
 * (ChecklistItemsList); drawing notes their own canvas (DrawingEditor);
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
    onOpenCollaborators: () -> Unit = {},
) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()

    var note by remember { mutableStateOf<NoteDto?>(null) }
    var editability by remember { mutableStateOf<Editability?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }

    var titleText by remember { mutableStateOf("") }
    var bodyText by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }

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

    // "top"/"bottom", read from this user's own web settings once the note
    // turns out to be a checklist (see LaunchedEffect below); defaults to
    // "top" until then, same as the web's own fresh-install default.
    var checklistInsertPosition by remember { mutableStateOf("top") }
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
    var showLinkDialog by remember { mutableStateOf(false) }
    var linkDialogTarget by remember { mutableStateOf<LinkTarget?>(null) }

    // Drawing notes: autosaved (debounced, see scheduleDrawingAutosave)
    // rather than through the shared title/body Save button, matching the
    // web editor's own autosave-while-drawing behavior instead of forcing
    // an explicit-Save mental model onto a continuous gesture.
    var drawingPaths by remember { mutableStateOf<List<DrawingStrokeDto>>(emptyList()) }
    var drawingDimensions by remember { mutableStateOf<DrawingDimensionsDto?>(null) }
    var drawingCaptionText by remember { mutableStateOf<String?>(null) }
    var drawingUndoStack by remember { mutableStateOf<List<List<DrawingStrokeDto>>>(emptyList()) }
    var drawingRedoStack by remember { mutableStateOf<List<List<DrawingStrokeDto>>>(emptyList()) }
    var drawingSaveJob by remember { mutableStateOf<Job?>(null) }

    // Audio notes: same debounced-autosave shape as drawing notes above,
    // see scheduleAudioAutosave.
    var audioClips by remember { mutableStateOf<List<AudioClipDto>>(emptyList()) }
    var audioCaptionText by remember { mutableStateOf<String?>(null) }
    var audioSaveJob by remember { mutableStateOf<Job?>(null) }

    // Content images (text/checklist notes only, see edit.isTextType /
    // isChecklistType below); parsed once on load same as checklist items,
    // not cached in Room (see NotesRepository.setImages).
    var images by remember { mutableStateOf<List<NoteImageData>>(emptyList()) }
    var changingImages by remember { mutableStateOf(false) }
    var viewerIndex by remember { mutableStateOf<Int?>(null) }

    // Tag suggestions need every note's tags, not just the open one (same
    // as App.jsx's allNotesForTags -> tagsWithCounts), so this reads the
    // repository's whole local cache, same source NativeNotesListScreen
    // observes for the grid.
    val allNotes by repository.observeNotes().collectAsState(initial = emptyList())
    // Small "Syncing…" indicator for edits queued by the *Queued repository
    // methods below (see SyncQueueWorker.kt): this note's own count only,
    // not a global one, since that's what the user editing THIS note cares
    // about seeing settle back to zero.
    val pendingSyncCount by repository.observePendingSyncCount(noteId).collectAsState(initial = 0)
    // Server-computed permission for THIS user on this note (see NoteDto.access's
    // own doc comment): gated here, proactively, rather than only reacting to a
    // rejected write after the fact, both for a better experience and because a
    // silently-queued edit (see SyncQueueWorker.kt) has no synchronous rejection
    // to react to at all anymore. Archive/restore/permanent-delete are owner-only
    // on the server, stricter than the read/write split that gates every other
    // edit here (see server/index.js's getNote vs getNoteWithCollaboration).
    val isReadOnlyAccess = note?.access == "read"
    val isOwnerAccess = note?.access == "owner"
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
    val readOnlyMessage = stringResource(R.string.native_note_detail_readonly)
    val syncingLabel = stringResource(R.string.native_note_detail_syncing)
    val actionErrorTemplate = stringResource(R.string.native_note_detail_action_error)
    val duplicateSuffix = stringResource(R.string.native_note_detail_duplicate_suffix)
    val downloadErrorMessage = stringResource(R.string.native_note_detail_download_error)
    val imageAddErrorMessage = stringResource(R.string.native_note_detail_add_image_error)
    val editedPrefix = stringResource(R.string.native_note_detail_edited_prefix)

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
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
            } finally {
                pinning = false
            }
        }
    }

    fun toggleArchive() {
        val current = note ?: return
        if (archiving) return
        archiving = true
        scope.launch {
            try {
                repository.setArchivedQueued(current.toEntity(), !current.archived)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen toggleArchive queued id=${current.id}")
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen toggleArchive failed", t)
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
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
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen restoreNote failed", t)
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
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
                repository.trashNoteQueued(current.id, mode)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen trash queued id=${current.id} mode=$mode")
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen trash failed", t)
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
            } finally {
                trashing = false
            }
        }
    }

    /** Permanently deletes a trashed note (irreversible, see
     *  repository.deleteNotePermanently). Only ever offered from a trashed
     *  note's own kebab menu, in place of Move to trash there. */
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
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen deleteNotePermanently failed", t)
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
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
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
            } finally {
                changingColor = false
            }
        }
    }

    /** Sets, moves, or clears (reminderAtIso == null) this note's reminder.
     *  The actual alarm isn't armed/cancelled from here: it follows from
     *  the local cache update inside repository.setReminder(), which
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
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen setReminder failed", t)
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
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
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
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

    // ---------- Checklist item edits (flat, no-section case only) ----------

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
    fun saveChecklistItems(newItems: List<ChecklistItemData>) {
        val current = note ?: return
        scope.launch {
            try {
                repository.setChecklistItemsQueued(current.id, ChecklistItems.encode(newItems))
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen saveChecklistItems queued id=${current.id}")
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen saveChecklistItems failed", t)
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
            }
        }
    }

    fun toggleChecklistItem(id: String, checked: Boolean) {
        val items = editability?.checklistItems ?: return
        // Cascades to indented children, Google Keep style, same as the
        // web's own modal editor (toggleItem, ChecklistEditor.jsx).
        val children = ChecklistItems.indentedChildren(items, id)
        val idsToUpdate = (listOf(id) + children.map { it.id }).toSet()
        val updated = items.map { if (it.id in idsToUpdate) it.copy(done = checked) else it }
        editability = editability?.copy(checklistItems = updated)
        saveChecklistItems(updated)
    }

    /** Local-only, no network save: see blurChecklistItem for when the
     *  edit actually persists. */
    fun changeChecklistItemText(id: String, text: String) {
        val items = editability?.checklistItems ?: return
        editability = editability?.copy(checklistItems = items.map { if (it.id == id) it.copy(text = text) else it })
    }

    /** Blurring an item saves its (possibly just-edited) text, unless it's
     *  now blank, in which case it's removed instead, same as the web's own
     *  blur-on-empty auto-delete (ChecklistRow.jsx). */
    fun blurChecklistItem(id: String) {
        val items = editability?.checklistItems ?: return
        val item = items.find { it.id == id } ?: return
        if (item.text.isBlank()) {
            val updated = ChecklistItems.normalize(items.filterNot { it.id == id })
            editability = editability?.copy(checklistItems = updated)
            saveChecklistItems(updated)
        } else {
            saveChecklistItems(items)
        }
    }

    fun removeChecklistItem(id: String) {
        val items = editability?.checklistItems ?: return
        val updated = ChecklistItems.normalize(items.filterNot { it.id == id })
        editability = editability?.copy(checklistItems = updated)
        saveChecklistItems(updated)
    }

    fun indentToggleChecklistItem(id: String) {
        val items = editability?.checklistItems ?: return
        val item = items.find { it.id == id } ?: return
        val allowed = if (item.indent == 1) true else ChecklistItems.canIndent(items, id)
        if (!allowed) return
        val updated = ChecklistItems.normalize(
            items.map { if (it.id == id) it.copy(indent = if (item.indent == 1) 0 else 1) else it }
        )
        editability = editability?.copy(checklistItems = updated)
        saveChecklistItems(updated)
    }

    /** Enter inside an item: inserts a new empty item adjacent to it,
     *  above or below depending on checklistInsertPosition, matching
     *  addItemAdjacent() (ChecklistEditor.jsx) minus its caret-at-start
     *  override (see ChecklistItemsList's own doc comment for why). */
    fun addChecklistItemAdjacent(anchorId: String) {
        val items = editability?.checklistItems ?: return
        val idx = items.indexOfFirst { it.id == anchorId }
        if (idx < 0) return
        val newItem = ChecklistItems.newItem()
        val insertAt = if (checklistInsertPosition == "top") idx else idx + 1
        val updated = items.toMutableList().apply { add(insertAt, newItem) }
        editability = editability?.copy(checklistItems = updated)
        saveChecklistItems(updated)
        pendingChecklistFocus = newItem.id
    }

    /** The trailing "add item" row: inserts at the very top or bottom of
     *  the whole list, matching addItemTopOrBottom() (ChecklistEditor.jsx). */
    fun addChecklistItemAtEnd() {
        val items = editability?.checklistItems ?: return
        val newItem = ChecklistItems.newItem()
        val updated = if (checklistInsertPosition == "top") listOf(newItem) + items else items + newItem
        editability = editability?.copy(checklistItems = updated)
        saveChecklistItems(updated)
        pendingChecklistFocus = newItem.id
    }

    // ---------- Rich text block edits (RichDoc.parse-approved notes only) ----------

    fun changeRichBlockText(id: String, newText: String, newMarks: List<RichMark>) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(text = newText, marks = newMarks) else it }
    }

    fun setRichBlockKind(id: String, kind: RichBlockKind) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(kind = kind) else it }
    }

    fun toggleRichMark(id: String, start: Int, end: Int, type: RichMarkType) {
        val blocks = richBlocks ?: return
        richBlocks = blocks.map { if (it.id == id) it.copy(marks = RichDoc.toggleMark(it.marks, type, start, end)) else it }
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
     *  block continues the same list kind, so pressing Enter partway
     *  through a list keeps adding list items; any other kind's
     *  continuation is a plain paragraph, matching how most editors treat
     *  Enter at the end of a heading. */
    fun splitRichBlock(id: String, position: Int) {
        val blocks = richBlocks ?: return
        val idx = blocks.indexOfFirst { it.id == id }
        if (idx < 0) return
        val block = blocks[idx]
        val continuesList = block.kind == RichBlockKind.BULLET_ITEM || block.kind == RichBlockKind.NUMBERED_ITEM
        val newBlock = RichDoc.newBlock(if (continuesList) block.kind else RichBlockKind.PARAGRAPH).copy(
            text = block.text.substring(position),
            marks = RichDoc.clipMarks(block.marks, position, block.text.length),
        )
        val updated = blocks.toMutableList()
        updated[idx] = block.copy(text = block.text.substring(0, position), marks = RichDoc.clipMarks(block.marks, 0, position))
        updated.add(idx + 1, newBlock)
        richBlocks = updated
        pendingRichFocus = newBlock.id
    }

    /** Explicit remove button, mirrors removeChecklistItem; refuses to drop
     *  the last remaining block, same "a doc always has at least one
     *  paragraph" invariant RichDoc.encode falls back to on an empty list. */
    fun removeRichBlock(id: String) {
        val blocks = richBlocks ?: return
        if (blocks.size <= 1) return
        richBlocks = blocks.filterNot { it.id == id }
    }

    fun addRichBlockAtEnd() {
        val blocks = richBlocks ?: return
        val newBlock = RichDoc.newBlock()
        richBlocks = blocks + newBlock
        pendingRichFocus = newBlock.id
    }

    // ---------- Drawing note edits (DrawingContent.parse-approved notes only) ----------

    /** Debounced autosave: cancels and restarts on every stroke/erase/
     *  clear/undo/redo/title edit, same 500-ish ms idea as the web
     *  editor's own drawing autosave (App.jsx), so a fast burst of strokes
     *  sends one PATCH after the user actually pauses rather than one per
     *  gesture. Deliberately its own function, not save(): save() also
     *  navigates back on success, which is right for an explicit Save
     *  button press but would be wrong here, autosave firing mid-drawing
     *  must never suddenly leave the screen. */
    suspend fun performDrawingSave() {
        if (note == null || isReadOnlyAccess) return
        saveError = null
        try {
            val encoded = DrawingContent.encode(drawingPaths, drawingDimensions, drawingCaptionText)
            repository.patchNoteQueued(noteId, titleText, encoded)
            SyncQueueWorker.triggerNow(context)
            NativeDebug.d("NoteDetailScreen drawing autosave queued id=$noteId")
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen drawing autosave failed", t)
            saveError = String.format(errorSaveTemplate, t.message ?: t.javaClass.simpleName)
        }
    }

    fun scheduleDrawingAutosave() {
        drawingSaveJob?.cancel()
        drawingSaveJob = scope.launch {
            delay(600)
            performDrawingSave()
        }
    }

    /** Every drawing mutation (a completed stroke, an erase, a clear, an
     *  undo/redo) funnels through here or through undoDrawing/redoDrawing:
     *  push the pre-change state so it can be undone, matching
     *  useDrawingHistory.js's own pushPaths() exactly, capped at the same
     *  80 entries. The very first mutation also fixes this drawing's
     *  reference dimensions from whatever size the canvas measured itself
     *  at, so later renders (here or on another device) scale consistently
     *  against that same original size instead of the current screen's. */
    fun commitDrawingChange(newPaths: List<DrawingStrokeDto>, canvasWidthDp: Float, canvasHeightDp: Float) {
        if (drawingDimensions == null) {
            drawingDimensions = DrawingDimensionsDto(width = canvasWidthDp, height = canvasHeightDp)
        }
        drawingUndoStack = (drawingUndoStack + listOf(drawingPaths)).takeLast(80)
        drawingRedoStack = emptyList()
        drawingPaths = newPaths
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

    fun clearDrawing(canvasWidthDp: Float, canvasHeightDp: Float) {
        commitDrawingChange(emptyList(), canvasWidthDp, canvasHeightDp)
    }

    // ---------- Audio note edits (AudioContent.parse-approved notes only) ----------

    /** Same debounced-no-button shape as scheduleDrawingAutosave, reused
     *  as-is rather than merged into one generic function: they persist
     *  different content shapes and there is no third note type waiting
     *  to reuse a unified version yet. */
    suspend fun performAudioSave() {
        if (note == null || isReadOnlyAccess) return
        saveError = null
        try {
            val encoded = AudioContent.encode(audioClips, audioCaptionText.orEmpty())
            repository.patchNoteQueued(noteId, titleText, encoded)
            SyncQueueWorker.triggerNow(context)
            NativeDebug.d("NoteDetailScreen audio autosave queued id=$noteId")
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen audio autosave failed", t)
            saveError = String.format(errorSaveTemplate, t.message ?: t.javaClass.simpleName)
        }
    }

    fun scheduleAudioAutosave() {
        audioSaveJob?.cancel()
        audioSaveJob = scope.launch {
            delay(600)
            performAudioSave()
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
            Toast.makeText(
                context,
                String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                Toast.LENGTH_SHORT,
            ).show()
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
                    Toast.makeText(context, imageAddErrorMessage, Toast.LENGTH_SHORT).show()
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
                    Toast.makeText(context, downloadErrorMessage, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    fun duplicateNote() {
        val current = note ?: return
        if (duplicating) return
        duplicating = true
        val baseTitle = current.title.trim()
        val newTitle = if (baseTitle.isNotEmpty()) "$baseTitle $duplicateSuffix" else duplicateSuffix
        scope.launch {
            try {
                val created = repository.duplicateNote(current, newTitle)
                NativeDebug.d("NoteDetailScreen duplicateNote OK newId=${created.id}")
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen duplicateNote failed", t)
                Toast.makeText(
                    context,
                    String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName),
                    Toast.LENGTH_SHORT,
                ).show()
            } finally {
                duplicating = false
            }
        }
    }

    fun downloadNote() {
        val current = note ?: return
        val edit = editability ?: return
        if (!edit.isTextType) return
        scope.launch(Dispatchers.IO) {
            val ok = NoteExporter.exportText(context, current.title, edit.bodyPlainText)
            if (!ok) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(context, downloadErrorMessage, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(),
    ) { uris -> addImages(uris) }

    LaunchedEffect(noteId) {
        try {
            val fetched = repository.fetchNoteDetail(noteId)
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
                    checklistInsertPosition = repository.fetchChecklistInsertPosition()
                    Editability(
                        isTextType = false,
                        bodyEditable = false,
                        isLegacyPlain = false,
                        bodyPlainText = "",
                        isChecklistType = true,
                        checklistItems = ChecklistItems.parseFlat(fetched.items),
                    )
                }
                "draw" -> {
                    val drawing = DrawingContent.parse(fetched.content)
                    if (drawing != null) {
                        Editability(
                            isTextType = false,
                            bodyEditable = false,
                            isLegacyPlain = false,
                            bodyPlainText = "",
                            isDrawType = true,
                            originalDrawingPaths = drawing.paths,
                            originalDrawingDimensions = drawing.dimensions,
                            originalDrawingCaptionText = drawing.text,
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
            audioClips = editability?.originalAudioClips.orEmpty()
            audioCaptionText = editability?.originalAudioCaptionText
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen load failed", t)
            loadError = String.format(errorLoadTemplate, t.message ?: t.javaClass.simpleName)
        }
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

    fun save() {
        val current = note ?: return
        val edit = editability ?: return
        saving = true
        saveError = null
        scope.launch {
            try {
                val contentToSend = when {
                    // A checklist note's content is always empty, its body
                    // lives entirely in items (saved separately, see
                    // saveChecklistItems); this only ever saves the title.
                    edit.isChecklistType -> ""
                    edit.isRichEditableType -> RichDoc.encode(richBlocks ?: edit.originalRichBlocks.orEmpty())
                    !edit.bodyEditable -> current.content
                    edit.isLegacyPlain -> bodyText
                    else -> NoteContent.plainTextToRichContent(bodyText)
                }
                repository.patchNoteQueued(noteId, titleText, contentToSend)
                SyncQueueWorker.triggerNow(context)
                NativeDebug.d("NoteDetailScreen save queued id=$noteId")
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen save failed", t)
                saveError = String.format(errorSaveTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                saving = false
            }
        }
    }

    /** What both the header's own Back row and the system back
     *  gesture/button (see the BackHandler below) actually trigger: a
     *  drawing/audio note autosaves on a debounce
     *  (scheduleDrawingAutosave/scheduleAudioAutosave), so the very last
     *  stroke or recording before backing out could still be sitting in
     *  that debounce window, about to be cancelled along with everything
     *  else once this screen leaves composition. Flushing the pending save
     *  here first, and only actually navigating back once it resolves,
     *  closes that gap for the two exit paths a user actually backs out
     *  through. Other exits (archive/trash/duplicate right in that same
     *  instant) don't get this treatment, a narrower, disclosed gap rather
     *  than threading it through every action that also calls onBack(). */
    fun goBack() {
        val edit = editability
        when {
            edit?.isDrawType == true -> {
                drawingSaveJob?.cancel()
                scope.launch {
                    performDrawingSave()
                    onBack()
                }
            }
            edit?.isAudioType == true -> {
                audioSaveJob?.cancel()
                scope.launch {
                    performAudioSave()
                    onBack()
                }
            }
            else -> onBack()
        }
    }

    // The system back gesture/button bypasses the header's own Back row
    // entirely (Navigation Compose would otherwise just pop the back
    // stack directly), so it needs the exact same flush-before-navigating
    // treatment routed through it explicitly.
    BackHandler(onBack = ::goBack)

    // The open note is painted in its own color, edge to edge: no card, no
    // radius, no shadow, no page padding. NoteModal.jsx hardcodes
    // `rounded-none shadow-none w-full max-w-none` plus `height: 100dvh` on
    // phones, and fills the whole panel (sticky bar included) with
    // modalBgFor(color), so the screen reads as one flat color.
    val modalBg = noteModalBackground(note?.color, dark)
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
    val downloadColor = if (dark) Color(0xFF4ade80) else Color(0xFF16a34a)
    val imageButtonColor = if (dark) Color(0xFF7dd3fc) else Color(0xFF0284c7)

    Box(Modifier.fillMaxSize().background(modalBg)) {
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
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ModalIconButton(
                    contentDescription = stringResource(R.string.native_note_detail_back),
                    onClick = { goBack() },
                ) {
                    ArrowLeftIcon(size = 20.dp, tint = modalIconColor)
                }
                Spacer(Modifier.weight(1f))
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
                            activeBackground = if (currentNote.pinned) {
                                if (dark) Color.White.copy(alpha = 0.16f) else Color(0xFF1E293B)
                            } else {
                                null
                            },
                            onClick = { togglePin() },
                        ) {
                            PinIcon(
                                size = 20.dp,
                                tint = if (currentNote.pinned) Color.White else modalIconColor,
                                filled = currentNote.pinned,
                            )
                        }
                    }
                    val edit = editability
                    val hasUnsavedChanges = edit != null && (
                        titleText != currentNote.title ||
                            (edit.isRichEditableType && richBlocks != edit.originalRichBlocks) ||
                            (edit.bodyEditable && bodyText != edit.bodyPlainText)
                        )
                    ModalSaveButton(
                        dark = dark,
                        enabled = hasUnsavedChanges && !saving && !isReadOnlyAccess,
                        contentDescription = stringResource(R.string.native_note_detail_save),
                        onClick = { save() },
                    )
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
                else -> {
                    val currentNote = note!!
                    val edit = editability!!
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState()),
                    ) {
                        // Outside the sticky bar on purpose: the title
                        // scrolls away with the content, which is what
                        // ModalHeader.jsx does on a phone (and only there).
                        // Its 20dp side padding against the body's 24dp is
                        // the web's own deliberate 4px offset.
                        NoteTitleField(
                            value = titleText,
                            enabled = !isReadOnlyAccess &&
                                (edit.isTextType || edit.isChecklistType || edit.isDrawType || edit.isAudioType),
                            titleColor = titleColor,
                            placeholderColor = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                            onValueChange = { raw ->
                                // Every incoming value gets its newlines
                                // flattened, same defensive sanitising as
                                // ModalHeader.jsx: a title is single-line
                                // everywhere else in the app.
                                titleText = raw.replace(TitleNewlines, " ")
                                if (edit.isDrawType) scheduleDrawingAutosave()
                                if (edit.isAudioType) scheduleAudioAutosave()
                            },
                        )

                        if (edit.isTextType || edit.isChecklistType) {
                            Box(Modifier.padding(horizontal = 8.dp).padding(bottom = 8.dp)) {
                                NoteImagesSection(
                                    images = images,
                                    subtextColor = subtextColor,
                                    enabled = !changingImages && !isReadOnlyAccess,
                                    onImageClick = { index -> viewerIndex = index },
                                    onAddClick = {
                                        photoPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                    },
                                )
                            }
                        }

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(start = 24.dp, end = 24.dp, top = 4.dp, bottom = 16.dp),
                        ) {
                            if (isReadOnlyAccess) {
                                Text(readOnlyMessage, color = subtextColor, fontSize = 12.sp)
                                Spacer(Modifier.height(14.dp))
                            }

                            if (edit.isChecklistType) {
                                val checklistItems = edit.checklistItems
                                if (checklistItems == null || isReadOnlyAccess) {
                                    // Has section markers: not natively editable
                                    // yet (see ChecklistItems.parseFlat), fall
                                    // back to the same read-only preview the
                                    // list's own cards use rather than risk
                                    // scrambling the note's organization.
                                    Text(
                                        stringResource(R.string.native_checklist_sections_notice),
                                        color = subtextColor,
                                        fontSize = 12.sp,
                                    )
                                    Spacer(Modifier.height(10.dp))
                                    ChecklistReadOnlyPreview(items = currentNote.items, titleColor = titleColor, subtextColor = subtextColor)
                                } else {
                                    ChecklistItemsList(
                                        items = checklistItems,
                                        titleColor = titleColor,
                                        subtextColor = subtextColor,
                                        borderColor = borderColor,
                                        focusRequesterFor = { id -> checklistFocusRequesters.getOrPut(id) { FocusRequester() } },
                                        onToggle = { id, checked -> toggleChecklistItem(id, checked) },
                                        onTextChange = { id, text -> changeChecklistItemText(id, text) },
                                        onBlur = { id -> blurChecklistItem(id) },
                                        onEnter = { id -> addChecklistItemAdjacent(id) },
                                        onIndentToggle = { id -> indentToggleChecklistItem(id) },
                                        canIndent = { id -> ChecklistItems.canIndent(checklistItems, id) },
                                        onRemove = { id -> removeChecklistItem(id) },
                                        onAddItem = { addChecklistItemAtEnd() },
                                    )
                                }
                            } else if (edit.isDrawType) {
                                DrawingEditor(
                                    paths = drawingPaths,
                                    canvasWidthDp = drawingDimensions?.width,
                                    canvasHeightDp = drawingDimensions?.height,
                                    canvasBackground = if (dark) DarkBgColor else Color.White,
                                    titleColor = titleColor,
                                    subtextColor = subtextColor,
                                    canUndo = drawingUndoStack.isNotEmpty(),
                                    canRedo = drawingRedoStack.isNotEmpty(),
                                    onStrokeCompleted = { stroke, w, h -> commitDrawingChange(drawingPaths + stroke, w, h) },
                                    onErase = { afterErase, w, h -> commitDrawingChange(afterErase, w, h) },
                                    onClear = { w, h -> clearDrawing(w, h) },
                                    onUndo = { undoDrawing() },
                                    onRedo = { redoDrawing() },
                                )
                                val captionPlainText = remember(drawingCaptionText) {
                                    val text = drawingCaptionText
                                    if (text.isNullOrBlank()) {
                                        null
                                    } else {
                                        val doc = NoteContent.parseRichDoc(text)
                                        (if (doc != null) NoteContent.docToPlainText(doc) else text).ifBlank { null }
                                    }
                                }
                                captionPlainText?.let { caption ->
                                    Spacer(Modifier.height(14.dp))
                                    Text(
                                        stringResource(R.string.native_drawing_caption_notice),
                                        color = subtextColor,
                                        fontSize = 12.sp,
                                    )
                                    Spacer(Modifier.height(6.dp))
                                    Text(caption, color = titleColor, fontSize = 14.sp)
                                }
                            } else if (edit.isAudioType) {
                                AudioClipsSection(
                                    clips = audioClips,
                                    dark = dark,
                                    titleColor = titleColor,
                                    subtextColor = subtextColor,
                                    borderColor = borderColor,
                                    enabled = true,
                                    onClipAdded = { clip -> addAudioClip(clip) },
                                    onClipRemoved = { id -> removeAudioClip(id) },
                                    onClipRenamed = { id, newName -> renameAudioClip(id, newName) },
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
                            } else if (edit.isRichEditableType) {
                                RichTextEditor(
                                    blocks = richBlocks ?: edit.originalRichBlocks.orEmpty(),
                                    titleColor = titleColor,
                                    subtextColor = subtextColor,
                                    focusRequesterFor = { id -> richFocusRequesters.getOrPut(id) { FocusRequester() } },
                                    onTextEdited = { id, newText, newMarks -> changeRichBlockText(id, newText, newMarks) },
                                    onEnter = { id, position -> splitRichBlock(id, position) },
                                    onRemoveBlock = { id -> removeRichBlock(id) },
                                    onSetBlockKind = { id, kind -> setRichBlockKind(id, kind) },
                                    onToggleMark = { id, start, end, type -> toggleRichMark(id, start, end, type) },
                                    onLinkRequest = { id, start, end, existingHref ->
                                        linkDialogTarget = LinkTarget(id, start, end, existingHref)
                                        showLinkDialog = true
                                    },
                                    onAddBlock = { addRichBlockAtEnd() },
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
                                        readOnly = isReadOnlyAccess,
                                        textStyle = TextStyle(color = titleColor, fontSize = 16.sp),
                                        cursorBrush = SolidColor(accentColor),
                                        modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
                                    )
                                }
                            }

                            saveError?.let {
                                Spacer(Modifier.height(10.dp))
                                Text(it, color = ErrorColor, fontSize = 12.sp)
                            }
                            if (pendingSyncCount > 0) {
                                Spacer(Modifier.height(10.dp))
                                Text(syncingLabel, color = subtextColor, fontSize = 12.sp)
                            }

                            // "Edited:" stamp, right-aligned at the end of the
                            // content, 24dp above it (NoteModal.jsx's own
                            // scrollable placement).
                            currentNote.updatedAt?.let { updatedAt ->
                                Spacer(Modifier.height(24.dp))
                                Text(
                                    String.format(editedPrefix, formatEditedStamp(updatedAt)),
                                    color = if (dark) Color(0xFFD1D5DB) else Color(0xFF4B5563),
                                    fontSize = 12.sp,
                                    modifier = Modifier.fillMaxWidth(),
                                    textAlign = TextAlign.End,
                                )
                            }
                        }
                    }
                }
            }

            note?.let { currentNote ->
                editability?.let { edit ->
                    NoteModalFooter(
                        dark = dark,
                        iconColor = footerIconColor,
                        borderColor = borderColor,
                        accentGradient = WorkspaceTheme.accentGradient(container.themeState.themeId),
                        tagCount = currentNote.tags.size,
                        collaboratorCount = currentNote.collaborators?.size ?: 0,
                        imageButtonColor = imageButtonColor,
                        collaborateColor = collaborateColor,
                        trashColor = trashMenuColor,
                        showColorButton = !isReadOnlyAccess,
                        showImageButton = (edit.isTextType || edit.isChecklistType) && !isReadOnlyAccess,
                        showTagsButton = !isReadOnlyAccess,
                        // The web keeps Collaborate and Trash in the footer for
                        // every type except a text note being edited, where they
                        // move into the kebab. Native text notes are always in
                        // edit mode, so that is exactly the split here.
                        showCollaborateButton = !edit.isTextType &&
                            (isOwnerAccess || !currentNote.collaborators.isNullOrEmpty()),
                        showTrashButton = !edit.isTextType && !currentNote.trashed,
                        onColorClick = { showColorPicker = true },
                        onImageClick = {
                            photoPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                        onTagsClick = { tagInput = ""; showTagsPicker = true },
                        onCollaborateClick = { onOpenCollaborators() },
                        onTrashClick = { showTrashConfirm = true },
                        onKebabClick = { menuExpanded = true },
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
                                    onDismiss = { showTagsPicker = false; tagInput = "" },
                                )
                            }
                        },
                        menu = {
                            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                                if (!currentNote.trashed) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.native_note_detail_reminder)) },
                                        leadingIcon = {
                                            if (currentNote.reminderAt != null) {
                                                BellRingingFilledIcon(size = 18.dp, tint = reminderMenuColor)
                                            } else {
                                                BellIcon(size = 18.dp, tint = reminderMenuColor)
                                            }
                                        },
                                        enabled = !changingReminder,
                                        onClick = {
                                            menuExpanded = false
                                            launchReminderPicker(context, currentNote.reminderAt) { picked ->
                                                setReminder(formatIso(picked))
                                            }
                                        },
                                    )
                                    if (currentNote.reminderAt != null) {
                                        DropdownMenuItem(
                                            text = { Text(stringResource(R.string.native_note_detail_reminder_remove)) },
                                            leadingIcon = { BellIcon(size = 18.dp, tint = reminderMenuColor) },
                                            enabled = !changingReminder,
                                            onClick = { menuExpanded = false; setReminder(null) },
                                        )
                                    }
                                }
                                // Archive/restore are owner-only on the server (see
                                // NoteDto.access's own doc comment), stricter than
                                // the read/write split gating everything above.
                                if (isOwnerAccess) {
                                    if (currentNote.trashed) {
                                        DropdownMenuItem(
                                            text = { Text(stringResource(R.string.native_note_detail_restore)) },
                                            leadingIcon = { ArchiveIcon(size = 18.dp, tint = archiveMenuColor) },
                                            enabled = !restoring,
                                            onClick = { menuExpanded = false; restoreNote() },
                                        )
                                    } else {
                                        DropdownMenuItem(
                                            text = {
                                                Text(
                                                    stringResource(
                                                        if (currentNote.archived) R.string.native_note_detail_unarchive
                                                        else R.string.native_note_detail_archive
                                                    )
                                                )
                                            },
                                            leadingIcon = { ArchiveIcon(size = 18.dp, tint = archiveMenuColor) },
                                            enabled = !archiving,
                                            onClick = { menuExpanded = false; toggleArchive() },
                                        )
                                    }
                                }
                                if (!currentNote.trashed) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.native_note_detail_duplicate)) },
                                        leadingIcon = { DuplicateIcon(size = 18.dp, tint = duplicateColor) },
                                        enabled = !duplicating,
                                        onClick = { menuExpanded = false; duplicateNote() },
                                    )
                                }
                                if (edit.isTextType) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.native_note_detail_download)) },
                                        leadingIcon = { DownloadIcon(size = 18.dp, tint = downloadColor) },
                                        onClick = { menuExpanded = false; downloadNote() },
                                    )
                                }
                                // Any participant may VIEW the roster, not just the
                                // owner (see CollaboratorsScreen.kt's own doc
                                // comment). The owner also gets it with zero
                                // collaborators: its "+" action is the only way to
                                // add the very first one.
                                if (edit.isTextType && (isOwnerAccess || !currentNote.collaborators.isNullOrEmpty())) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.native_collaborators_title)) },
                                        leadingIcon = { CollaborateIcon(size = 18.dp, tint = collaborateColor) },
                                        onClick = { menuExpanded = false; onOpenCollaborators() },
                                    )
                                }
                                if (currentNote.trashed) {
                                    if (isOwnerAccess) {
                                        DropdownMenuItem(
                                            text = { Text(stringResource(R.string.native_note_detail_delete_permanently)) },
                                            leadingIcon = { TrashIcon(size = 18.dp, tint = trashMenuColor) },
                                            onClick = { menuExpanded = false; showPermanentDeleteConfirm = true },
                                        )
                                    }
                                } else if (edit.isTextType) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.native_note_detail_move_to_trash)) },
                                        leadingIcon = { TrashIcon(size = 18.dp, tint = trashMenuColor) },
                                        onClick = { menuExpanded = false; showTrashConfirm = true },
                                    )
                                }
                            }
                        },
                    )
                }
            }
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
                DeleteSharedNoteDialog(
                    dark = dark,
                    onDismiss = { showTrashConfirm = false },
                    onConfirm = { mode -> confirmTrash(mode) },
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
                removeEnabled = !changingImages && !isReadOnlyAccess,
                onClose = { viewerIndex = null },
                onRemove = { image -> removeImage(image) },
                onDownload = { image -> downloadImage(image) },
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
                Text(tag, color = chipFg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
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
                    CloseIcon(size = 8.dp, tint = accent.copy(alpha = 0.65f))
                }
            }
        }
    }
}

private val ColorPanelBgLight = Color(0xFAFFFFFF)
private val ColorPanelBgDark = Color(0xFA111827)
private val ColorPanelBorderLight = Color(0xCCF3F4F6)
private val ColorPanelBorderDark = Color(0x80374151)
private val ColorDotDefaultBorderLight = Color(0xFFD1D5DB)
private val ColorDotDefaultBorderDark = Color(0xFF6B7280)
private val ColorDotDefaultInnerDark = Color(0xFF1F2937)
private val ColorSelectionRing = Color(0xFF6366F1)
private val TagPanelBgLight = Color(0xFFFFFFFF)
private val TagPanelBgDark = Color(0xFF111827)
private val TagSearchBgLight = Color(0xFFF9FAFB)
private val TagSearchBgDark = Color(0xCC1F2937)
private val TagSearchBorderLight = Color(0xCCE5E7EB)
private val TagSearchBorderDark = Color(0x99374151)
private val TagMutedLight = Color(0xFF9CA3AF)
private val TagMutedDark = Color(0xFF6B7280)
private val TagRowFgLight = Color(0xFF374151)
private val TagRowFgDark = Color(0xFFE5E7EB)
private val TagDividerLight = Color(0xFFF3F4F6)
private val TagDividerDark = Color(0xFF1F2937)
private val TagCreateBgLight = Color(0xCCD1FAE5)
private val TagCreateBgDark = Color(0x66065F46)
private val TagCreateFgLight = Color(0xFF059669)
private val TagCreateFgDark = Color(0xFF34D399)
private val TagCreateIconLight = Color(0xFF10B981)

/**
 * ColorPickerPanel.jsx: a 256px card opening upward from the palette
 * button, three rows of four 48px dots with 12px gaps, and no animation
 * at all - it simply appears.
 */
@Composable
private fun NoteColorPopover(
    currentColorKey: String,
    dark: Boolean,
    enabled: Boolean,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    FooterPopover(
        width = 256.dp,
        gap = 8.dp,
        background = if (dark) ColorPanelBgDark else ColorPanelBgLight,
        borderColor = if (dark) ColorPanelBorderDark else ColorPanelBorderLight,
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
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SearchIcon(size = 12.dp, tint = muted)
                Spacer(Modifier.width(8.dp))
                BasicTextField(
                    value = input,
                    onValueChange = onInputChange,
                    singleLine = true,
                    enabled = enabled,
                    textStyle = TextStyle(color = rowFg, fontSize = 14.sp),
                    cursorBrush = SolidColor(accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { if (isNewTag) onCreate(trimmed) }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .onFocusChanged { focused = it.isFocused },
                    decorationBox = { innerTextField ->
                        if (input.isEmpty()) {
                            Text(
                                stringResource(R.string.native_note_detail_tags_search_placeholder),
                                color = muted,
                                fontSize = 14.sp,
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
                        TagIcon(size = 12.dp, tint = rowFg.copy(alpha = 0.5f))
                        Spacer(Modifier.width(10.dp))
                        Text(
                            entry.tag,
                            color = rowFg,
                            fontSize = 14.sp,
                            fontWeight = if (checked) FontWeight.SemiBold else FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            entry.count.toString(),
                            color = muted,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        } else if (!isNewTag) {
            Text(
                stringResource(R.string.native_note_detail_tags_none_found),
                color = muted,
                fontSize = 14.sp,
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
                Spacer(Modifier.width(10.dp))
                Text(
                    String.format(stringResource(R.string.native_note_detail_tags_create), trimmed),
                    color = if (dark) TagCreateFgDark else TagCreateFgLight,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
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

/**
 * Date then time, via the system's own DatePickerDialog/TimePickerDialog,
 * not a bespoke calendar like ReminderPicker.jsx's MiniCalendar/TimePicker,
 * a deliberately trimmed native v1 (see this milestone's commit message).
 * [currentReminderIso] prefills the dialogs on the existing reminder when
 * there is one and it's still in the future, else the same "tomorrow
 * 09:00" default ReminderPicker.jsx itself falls back to.
 *
 * A same-day pick can still land in the past (there's no min-time on the
 * time dialog, only a min-date on the date one, mirroring the web's own
 * calendar which only disables past days, not past times today), left
 * to ReminderScheduler.schedule()'s own existing safety net, which already
 * fires a past/now alarm almost immediately rather than losing it.
 */
private fun launchReminderPicker(context: android.content.Context, currentReminderIso: String?, onPicked: (Date) -> Unit) {
    val cal = Calendar.getInstance()
    val currentMillis = currentReminderIso?.let(::parseIsoToEpochMillis)
    if (currentMillis != null && currentMillis > System.currentTimeMillis()) {
        cal.timeInMillis = currentMillis
    } else {
        cal.add(Calendar.DAY_OF_MONTH, 1)
        cal.set(Calendar.HOUR_OF_DAY, 9)
        cal.set(Calendar.MINUTE, 0)
    }
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)

    val todayStart = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }

    DatePickerDialog(
        context,
        { _, year, month, dayOfMonth ->
            cal.set(year, month, dayOfMonth)
            TimePickerDialog(
                context,
                { _, hourOfDay, minute ->
                    cal.set(Calendar.HOUR_OF_DAY, hourOfDay)
                    cal.set(Calendar.MINUTE, minute)
                    onPicked(cal.time)
                },
                cal.get(Calendar.HOUR_OF_DAY),
                cal.get(Calendar.MINUTE),
                DateFormat.is24HourFormat(context),
            ).show()
        },
        cal.get(Calendar.YEAR),
        cal.get(Calendar.MONTH),
        cal.get(Calendar.DAY_OF_MONTH),
    ).apply {
        datePicker.minDate = todayStart.timeInMillis
    }.show()
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

/** ConfirmDeleteDialog.jsx's plain and trashed variants: a centred card,
 *  title, one line of explanation, then Cancel and the red action side by
 *  side at the bottom right. */
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
    GkDialog(onDismissRequest = onDismiss, dark = dark, borderColor = borderColor, maxWidth = 384.dp) {
        Text(title, color = titleColor, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
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
                onClick = onDismiss,
            )
            GkDangerButton(label = confirmLabel, enabled = enabled, onClick = onConfirm)
        }
    }
}

/** ConfirmDeleteDialog.jsx's third variant, for the owner of a shared
 *  note: the buttons become a full-width column, and there are three of
 *  them. "Remove for me" leaves via ownership transfer
 *  (mode=remove_self, same as the plain dialog's own default); "Delete
 *  for everyone" hard-deletes the note for every collaborator
 *  (mode=delete_for_all, owner-only server-side - see TrashNoteRequest's
 *  own doc comment). */
@Composable
private fun DeleteSharedNoteDialog(
    dark: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (mode: String) -> Unit,
) {
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

    GkDialog(onDismissRequest = onDismiss, dark = dark, borderColor = borderColor, maxWidth = 384.dp) {
        Text(
            stringResource(R.string.native_note_detail_delete_shared_question),
            color = titleColor,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.native_note_detail_delete_shared_subtitle),
            color = if (dark) DialogBodyDark else DialogBodyLight,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.height(20.dp))
        GkSecondaryButton(
            label = stringResource(R.string.native_note_detail_remove_for_me),
            borderColor = borderColor,
            textColor = titleColor,
            modifier = Modifier.fillMaxWidth(),
            onClick = { onConfirm("remove_self") },
        )
        Spacer(Modifier.height(8.dp))
        GkDangerButton(
            label = stringResource(R.string.native_note_detail_delete_for_all),
            modifier = Modifier.fillMaxWidth(),
            onClick = { onConfirm("delete_for_all") },
        )
        Spacer(Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onDismiss() }
                .padding(vertical = 8.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                stringResource(R.string.native_dialog_cancel),
                color = if (dark) DialogBodyDark else DialogBodyLight,
                fontSize = 14.sp,
            )
        }
    }
}

/** `text-gray-600` / `dark:text-gray-300`, the dialog body colour. */
private val DialogBodyLight = Color(0xFF4B5563)
private val DialogBodyDark = Color(0xFFD1D5DB)

/** Any newline the user manages to get into a title (IME, paste, drop) is
 *  flattened to a space, same guard ModalHeader.jsx keeps: titles are
 *  single-line everywhere else, and a stray "\n" silently breaks layout. */
private val TitleNewlines = Regex("[\\r\\n]+")

/** "Edited:" stamp value. The web prints a locale date-time; this is the
 *  device-locale equivalent. */
private fun formatEditedStamp(iso: String): String {
    val ms = parseIsoToEpochMillis(iso) ?: return ""
    return SimpleDateFormat("d MMM yyyy, HH:mm", Locale.getDefault()).format(Date(ms))
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
    activeBackground: Color? = null,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.9f else 1f, tween(80), label = "modalIconPress")
    Box(
        modifier = Modifier
            .size(32.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .then(if (activeBackground != null) Modifier.background(activeBackground) else Modifier)
            .semantics { this.contentDescription = contentDescription }
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
private fun ModalSaveButton(dark: Boolean, enabled: Boolean, contentDescription: String, onClick: () -> Unit) {
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
                if (enabled) {
                    Modifier.background(Brush.horizontalGradient(listOf(Color(0xFF10B981), Color(0xFF059669))))
                } else {
                    Modifier.border(width = 1.5.dp, color = idleBorder, shape = CircleShape)
                },
            )
            .semantics { this.contentDescription = contentDescription }
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        SaveCheckIcon(size = 16.dp, tint = if (enabled) Color.White else idleTint)
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
    titleColor: Color,
    placeholderColor: Color,
    onValueChange: (String) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, bottom = 4.dp),
    ) {
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
@Composable
private fun NoteModalFooter(
    dark: Boolean,
    iconColor: Color,
    borderColor: Color,
    accentGradient: Brush,
    tagCount: Int,
    collaboratorCount: Int,
    imageButtonColor: Color,
    collaborateColor: Color,
    trashColor: Color,
    showColorButton: Boolean,
    showImageButton: Boolean,
    showTagsButton: Boolean,
    showCollaborateButton: Boolean,
    showTrashButton: Boolean,
    onColorClick: () -> Unit,
    onImageClick: () -> Unit,
    onTagsClick: () -> Unit,
    onCollaborateClick: () -> Unit,
    onTrashClick: () -> Unit,
    onKebabClick: () -> Unit,
    colorPanel: @Composable () -> Unit,
    tagsPanel: @Composable () -> Unit,
    menu: @Composable () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (dark) Color.Black.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.04f))
                .navigationBarsPadding()
                .padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (showColorButton) {
                Box {
                    FooterIconButton(
                        contentDescription = stringResource(R.string.native_note_detail_change_color),
                        onClick = onColorClick,
                    ) {
                        PaletteIcon(size = 18.dp)
                    }
                    colorPanel()
                }
            }
            if (showImageButton) {
                FooterIconButton(
                    contentDescription = stringResource(R.string.native_note_detail_add_image),
                    onClick = onImageClick,
                ) {
                    AddImageIcon(size = 20.dp, tint = imageButtonColor)
                }
            }
            if (showTagsButton) {
                Box {
                    FooterIconButton(
                        contentDescription = stringResource(R.string.native_note_detail_tags),
                        badgeCount = tagCount,
                        badgeGradient = accentGradient,
                        onClick = onTagsClick,
                    ) {
                        TagIcon(size = 18.dp, tint = iconColor)
                    }
                    tagsPanel()
                }
            }
            if (showCollaborateButton) {
                FooterIconButton(
                    contentDescription = stringResource(R.string.native_collaborators_title),
                    badgeCount = collaboratorCount,
                    badgeGradient = accentGradient,
                    onClick = onCollaborateClick,
                ) {
                    CollaborateIcon(size = 18.dp, tint = collaborateColor)
                }
            }
            if (showTrashButton) {
                FooterIconButton(
                    contentDescription = stringResource(R.string.native_note_detail_move_to_trash),
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
        }
    }
}

/** One 34dp round button of the footer bar, with the optional counter
 *  badge the web pins to its top-right corner (16dp, 10sp bold, filled
 *  with the workspace theme's own gradient). */
@Composable
private fun FooterIconButton(
    contentDescription: String,
    onClick: () -> Unit,
    badgeCount: Int = 0,
    badgeGradient: Brush? = null,
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
                .clip(CircleShape)
                .semantics { this.contentDescription = contentDescription }
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                ) { onClick() },
            contentAlignment = Alignment.Center,
        ) {
            content()
        }
        if (badgeCount > 0 && badgeGradient != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 4.dp, y = (-4).dp)
                    .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
                    .clip(CircleShape)
                    .background(badgeGradient)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    badgeCount.toString(),
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
