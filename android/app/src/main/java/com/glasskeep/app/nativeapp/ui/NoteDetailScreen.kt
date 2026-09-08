package com.glasskeep.app.nativeapp.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.NoteContent
import com.glasskeep.app.nativeapp.data.SaveNoteResult
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/** What the loaded note allows natively, decided once from its content
 *  shape (see NoteContent.isDocPlainStructure). Title is always editable
 *  for a text note: the original `content` string is resent untouched
 *  when the body itself isn't safe to touch, so a title-only edit never
 *  risks the note's formatting. */
private data class Editability(
    val isTextType: Boolean,
    val bodyEditable: Boolean,
    val isLegacyPlain: Boolean,
    val bodyPlainText: String,
)

/**
 * Milestone: opening and safely editing a single text note. Deliberately
 * does not touch checklist/draw/audio notes, or the body of a formatted
 * text note (bold, colors, headings, lists...): there is no native rich
 * editor yet, and guessing here would mean silently destroying a user's
 * existing formatting. See NoteContent.kt for exactly where that line is
 * drawn.
 */
@Composable
fun NoteDetailScreen(container: NativeAppContainer, serverUrl: String, noteId: String, onBack: () -> Unit) {
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
    var saveNotice by remember { mutableStateOf<String?>(null) }

    var pinning by remember { mutableStateOf(false) }
    var archiving by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }
    var showTrashConfirm by remember { mutableStateOf(false) }
    var trashing by remember { mutableStateOf(false) }
    var showColorPicker by remember { mutableStateOf(false) }
    var changingColor by remember { mutableStateOf(false) }
    var duplicating by remember { mutableStateOf(false) }

    val errorLoadTemplate = stringResource(R.string.native_note_detail_error)
    val errorSaveTemplate = stringResource(R.string.native_note_detail_save_error)
    val staleMessage = stringResource(R.string.native_note_detail_stale)
    val readOnlyMessage = stringResource(R.string.native_note_detail_readonly)
    val actionErrorTemplate = stringResource(R.string.native_note_detail_action_error)
    val duplicateSuffix = stringResource(R.string.native_note_detail_duplicate_suffix)

    fun togglePin() {
        val current = note ?: return
        if (pinning) return
        pinning = true
        scope.launch {
            try {
                note = repository.setPinned(current.id, !current.pinned)
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
                when (repository.setArchived(current.id, !current.archived)) {
                    is SaveNoteResult.Saved -> {
                        NativeDebug.d("NoteDetailScreen toggleArchive OK id=${current.id}")
                        onBack()
                    }
                    SaveNoteResult.Stale -> Toast.makeText(context, staleMessage, Toast.LENGTH_SHORT).show()
                    SaveNoteResult.ReadOnly -> Toast.makeText(context, readOnlyMessage, Toast.LENGTH_SHORT).show()
                }
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

    fun confirmTrash() {
        val current = note ?: return
        showTrashConfirm = false
        if (trashing) return
        trashing = true
        scope.launch {
            try {
                when (repository.trashNote(current.id)) {
                    is SaveNoteResult.Saved -> {
                        NativeDebug.d("NoteDetailScreen trash OK id=${current.id}")
                        onBack()
                    }
                    SaveNoteResult.Stale -> Toast.makeText(context, staleMessage, Toast.LENGTH_SHORT).show()
                    SaveNoteResult.ReadOnly -> Toast.makeText(context, readOnlyMessage, Toast.LENGTH_SHORT).show()
                }
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

    fun changeColor(colorKey: String) {
        val current = note ?: return
        showColorPicker = false
        if (current.color == colorKey || changingColor) return
        changingColor = true
        scope.launch {
            try {
                when (val result = repository.setColor(current.id, colorKey)) {
                    is SaveNoteResult.Saved -> {
                        NativeDebug.d("NoteDetailScreen changeColor OK id=${current.id}")
                        note = result.note
                    }
                    SaveNoteResult.Stale -> Toast.makeText(context, staleMessage, Toast.LENGTH_SHORT).show()
                    SaveNoteResult.ReadOnly -> Toast.makeText(context, readOnlyMessage, Toast.LENGTH_SHORT).show()
                }
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

    LaunchedEffect(noteId) {
        try {
            val fetched = repository.fetchNoteDetail(noteId)
            note = fetched
            titleText = fetched.title
            editability = if (fetched.type != "text") {
                Editability(isTextType = false, bodyEditable = false, isLegacyPlain = false, bodyPlainText = "")
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
            bodyText = editability?.bodyPlainText.orEmpty()
        } catch (t: Throwable) {
            NativeDebug.e("NoteDetailScreen load failed", t)
            loadError = String.format(errorLoadTemplate, t.message ?: t.javaClass.simpleName)
        }
    }

    fun save() {
        val current = note ?: return
        val edit = editability ?: return
        saving = true
        saveError = null
        saveNotice = null
        scope.launch {
            try {
                val contentToSend = when {
                    !edit.bodyEditable -> current.content
                    edit.isLegacyPlain -> bodyText
                    else -> NoteContent.plainTextToRichContent(bodyText)
                }
                when (repository.patchNote(noteId, titleText, contentToSend)) {
                    is SaveNoteResult.Saved -> {
                        NativeDebug.d("NoteDetailScreen save OK id=$noteId")
                        onBack()
                    }
                    SaveNoteResult.Stale -> saveNotice = staleMessage
                    SaveNoteResult.ReadOnly -> saveNotice = readOnlyMessage
                }
            } catch (t: Throwable) {
                NativeDebug.e("NoteDetailScreen save failed", t)
                saveError = String.format(errorSaveTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                saving = false
            }
        }
    }

    val bgModifier = if (dark) Modifier.background(DarkBgColor) else Modifier.background(LightBgGradient)
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val cardBg = note?.let { noteColorFor(it.color, dark) } ?: (if (dark) DarkBgColor else Color.White)
    // Same amber/red the web kebab menu uses for these two entries
    // (ModalFooter.jsx), so "archive" and "delete" keep reading as
    // distinct from the rest of the menu on native too.
    val archiveMenuColor = if (dark) Color(0xFFfbbf24) else Color(0xFFa16207)
    val trashMenuColor = if (dark) Color(0xFFf87171) else Color(0xFFdc2626)

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(headerGradient(dark))
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(horizontal = 8.dp, vertical = 10.dp),
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
                            stringResource(R.string.native_note_detail_back),
                            color = subtextColor,
                            fontSize = 14.sp,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                    note?.let { currentNote ->
                        val pinLabel = stringResource(
                            if (currentNote.pinned) R.string.native_note_detail_unpin else R.string.native_note_detail_pin
                        )
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .semantics { contentDescription = pinLabel }
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                    enabled = !pinning,
                                    onClick = { togglePin() },
                                )
                                .padding(6.dp),
                        ) {
                            PinIcon(
                                size = 20.dp,
                                tint = if (currentNote.pinned) Indigo else subtextColor,
                                filled = currentNote.pinned,
                            )
                        }
                        Box {
                            val moreLabel = stringResource(R.string.native_note_detail_more)
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .semantics { contentDescription = moreLabel }
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null,
                                        role = Role.Button,
                                        onClick = { menuExpanded = true },
                                    )
                                    .padding(6.dp),
                            ) {
                                KebabIcon(size = 20.dp, tint = titleColor)
                            }
                            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.native_note_detail_change_color)) },
                                    leadingIcon = { PaletteIcon(size = 18.dp) },
                                    onClick = { menuExpanded = false; showColorPicker = true },
                                )
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.native_note_detail_duplicate)) },
                                    leadingIcon = { DuplicateIcon(size = 18.dp, tint = titleColor) },
                                    enabled = !duplicating,
                                    onClick = { menuExpanded = false; duplicateNote() },
                                )
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
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.native_note_detail_move_to_trash)) },
                                    leadingIcon = { TrashIcon(size = 18.dp, tint = trashMenuColor) },
                                    onClick = { menuExpanded = false; showTrashConfirm = true },
                                )
                            }
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(headerBorderColor(dark)))
            }

            when {
                loadError != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(loadError.orEmpty(), color = ErrorColor, modifier = Modifier.padding(24.dp))
                }
                note == null || editability == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = Indigo)
                        Spacer(Modifier.height(12.dp))
                        Text(stringResource(R.string.native_note_detail_loading), color = subtextColor)
                    }
                }
                else -> {
                    val currentNote = note!!
                    val edit = editability!!
                    val cardBorder = if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.08f)
                    val cardShape = RoundedCornerShape(16.dp)
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .navigationBarsPadding()
                            .padding(20.dp),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .shadow(elevation = 3.dp, shape = cardShape, ambientColor = Color(0xFF8B5CF6), spotColor = Color(0xFF8B5CF6))
                                .clip(cardShape)
                                .background(cardBg)
                                .border(width = 1.dp, color = cardBorder, shape = cardShape)
                                .padding(20.dp),
                        ) {
                            if (edit.isTextType) {
                                OutlinedTextField(
                                    value = titleText,
                                    onValueChange = { titleText = it },
                                    label = { Text(stringResource(R.string.native_note_detail_title_label)) },
                                    textStyle = MaterialTheme.typography.titleMedium,
                                    singleLine = true,
                                    colors = detailFieldColors(titleColor, subtextColor, borderColor),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            } else {
                                // Not an OutlinedTextField: nothing typed here could
                                // ever be saved (no Save button renders below for an
                                // unsupported type), so a field that looks editable
                                // would just be a trap. Plain heading text instead.
                                Text(
                                    titleText.ifBlank { stringResource(R.string.native_notes_untitled) },
                                    color = titleColor,
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            Spacer(Modifier.height(14.dp))

                            if (!edit.isTextType) {
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
                            } else {
                                if (!edit.bodyEditable) {
                                    Text(
                                        stringResource(R.string.native_note_detail_formatted_notice),
                                        color = subtextColor,
                                        fontSize = 12.sp,
                                    )
                                    Spacer(Modifier.height(10.dp))
                                    Text(edit.bodyPlainText, color = titleColor, fontSize = 15.sp)
                                } else {
                                    OutlinedTextField(
                                        value = bodyText,
                                        onValueChange = { bodyText = it },
                                        label = { Text(stringResource(R.string.native_note_detail_body_label)) },
                                        colors = detailFieldColors(titleColor, subtextColor, borderColor),
                                        modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
                                    )
                                }
                            }
                        }

                        if (edit.isTextType) {
                            Spacer(Modifier.height(16.dp))

                            saveError?.let {
                                Text(it, color = ErrorColor, fontSize = 12.sp)
                                Spacer(Modifier.height(8.dp))
                            }
                            saveNotice?.let {
                                Text(it, color = subtextColor, fontSize = 12.sp)
                                Spacer(Modifier.height(8.dp))
                            }

                            val hasChanges = titleText != currentNote.title ||
                                (edit.bodyEditable && bodyText != edit.bodyPlainText)
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(ButtonGradient)
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null,
                                        enabled = hasChanges && !saving,
                                        role = Role.Button,
                                    ) { save() },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    stringResource(if (saving) R.string.native_note_detail_saving else R.string.native_note_detail_save),
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color.White,
                                    fontSize = 16.sp,
                                )
                            }
                            Spacer(Modifier.height(24.dp))
                        }
                    }
                }
            }
        }

        if (showColorPicker) {
            val currentColorKey = note?.color ?: "default"
            Dialog(onDismissRequest = { showColorPicker = false }) {
                Column(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(if (dark) DarkBgColor else Color.White)
                        .padding(20.dp),
                ) {
                    Text(
                        stringResource(R.string.native_note_detail_color_title),
                        color = titleColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                    )
                    Spacer(Modifier.height(16.dp))
                    NOTE_COLOR_ORDER.chunked(4).forEach { rowKeys ->
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            rowKeys.forEach { colorKey ->
                                val selected = colorKey == currentColorKey
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(CircleShape)
                                        .background(noteColorFor(colorKey, dark))
                                        .border(
                                            width = if (selected) 3.dp else 1.dp,
                                            color = if (selected) Indigo else borderColor,
                                            shape = CircleShape,
                                        )
                                        .clickable(
                                            interactionSource = remember { MutableInteractionSource() },
                                            indication = null,
                                            enabled = !changingColor,
                                            role = Role.Button,
                                        ) { changeColor(colorKey) },
                                ) {}
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                }
            }
        }

        if (showTrashConfirm) {
            AlertDialog(
                onDismissRequest = { showTrashConfirm = false },
                title = { Text(stringResource(R.string.native_note_detail_trash_confirm_title)) },
                text = { Text(stringResource(R.string.native_note_detail_trash_confirm_body)) },
                confirmButton = {
                    TextButton(onClick = { confirmTrash() }, enabled = !trashing) {
                        Text(stringResource(R.string.native_note_detail_move_to_trash), color = trashMenuColor)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showTrashConfirm = false }) {
                        Text(stringResource(R.string.native_note_detail_trash_confirm_cancel))
                    }
                },
            )
        }
    }
}

@Composable
private fun detailFieldColors(textColor: Color, subtextColor: Color, borderColor: Color) =
    OutlinedTextFieldDefaults.colors(
        focusedTextColor = textColor,
        unfocusedTextColor = textColor,
        focusedBorderColor = Indigo,
        unfocusedBorderColor = borderColor,
        focusedLabelColor = Indigo,
        unfocusedLabelColor = subtextColor,
        cursorColor = Indigo,
    )
