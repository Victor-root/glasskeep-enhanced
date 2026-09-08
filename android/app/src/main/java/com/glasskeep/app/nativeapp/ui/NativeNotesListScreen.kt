package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/**
 * Milestone 0 of the native rewrite: read-only list, no editing, no
 * checklists/rich text/drawing/audio rendering yet. The point of this
 * screen is to prove the whole pipe end to end (login, /api/notes, local
 * cache, display) before building anything on top of it. Uses the same
 * background, palette and note-color swatches as the rest of the app
 * (SetupScreen.kt, src/utils/colors.js) instead of bare Material3 defaults.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeNotesListScreen(container: NativeAppContainer, serverUrl: String) {
    val dark = isSystemInDarkTheme()
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val notes by repository.observeNotes().collectAsState(initial = emptyList())
    var refreshing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val errorSyncTemplate = stringResource(R.string.native_notes_error_sync)

    val bgModifier = if (dark) Modifier.background(DarkBgColor) else Modifier.background(LightBgGradient)
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor

    fun refresh() {
        refreshing = true
        errorMessage = null
        scope.launch {
            try {
                repository.refresh()
            } catch (t: Throwable) {
                NativeDebug.e("Notes refresh failed", t)
                errorMessage = String.format(errorSyncTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                refreshing = false
            }
        }
    }

    LaunchedEffect(serverUrl) { refresh() }

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            String.format(stringResource(R.string.native_notes_title), notes.size),
                            color = titleColor,
                            fontWeight = FontWeight.Bold,
                        )
                    },
                    actions = {
                        Text(
                            stringResource(R.string.native_notes_refresh),
                            color = if (refreshing) subtextColor else Indigo,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .padding(end = 16.dp)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    enabled = !refreshing,
                                    role = Role.Button,
                                ) { refresh() },
                        )
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        titleContentColor = titleColor,
                    ),
                )
            },
        ) { padding ->
            Column(Modifier.padding(padding).fillMaxSize()) {
                errorMessage?.let {
                    Text(it, color = ErrorColor, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                }
                if (notes.isEmpty() && !refreshing && errorMessage == null) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(stringResource(R.string.native_notes_empty), color = subtextColor)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(notes, key = { it.id }) { note ->
                            NoteRow(note = note, dark = dark, titleColor = titleColor, subtextColor = subtextColor)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NoteRow(note: NoteEntity, dark: Boolean, titleColor: Color, subtextColor: Color) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(noteColorFor(note.color, dark))
            .padding(16.dp),
    ) {
        Text(
            note.title.ifBlank { stringResource(R.string.native_notes_untitled) },
            color = titleColor,
            fontWeight = FontWeight.Medium,
            fontSize = 16.sp,
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(noteTypeLabel(note.type), color = subtextColor, fontSize = 12.sp)
            if (note.pinned) {
                Text(
                    "• " + stringResource(R.string.native_notes_pinned),
                    color = Indigo,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun noteTypeLabel(type: String): String = when (type) {
    "checklist" -> stringResource(R.string.native_note_type_checklist)
    "draw" -> stringResource(R.string.native_note_type_draw)
    "audio" -> stringResource(R.string.native_note_type_audio)
    else -> stringResource(R.string.native_note_type_text)
}
