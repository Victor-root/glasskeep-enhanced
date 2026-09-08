package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

    val errorLoadTemplate = stringResource(R.string.native_note_detail_error)
    val errorSaveTemplate = stringResource(R.string.native_note_detail_save_error)
    val staleMessage = stringResource(R.string.native_note_detail_stale)
    val readOnlyMessage = stringResource(R.string.native_note_detail_readonly)

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

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "←",
                    color = titleColor,
                    fontSize = 22.sp,
                    modifier = Modifier
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onBack() }
                        .padding(8.dp),
                )
                Text(
                    stringResource(R.string.native_note_detail_back),
                    color = subtextColor,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(start = 4.dp),
                )
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
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 20.dp),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(cardBg)
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
