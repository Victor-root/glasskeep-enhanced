package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.ChecklistPreview
import com.glasskeep.app.nativeapp.data.NoteContent
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkCardBg
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightCardBg
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/**
 * Notes list: a two-column masonry grid with real card previews (text
 * snippet, or the first few unchecked checklist items), and a header
 * carrying the app's own branding, same shape as NotesHeader.jsx /
 * NoteCard.jsx on the web side (search, AI search, view toggle, admin
 * panel and the rest of that header's icon cluster aren't native features
 * yet, so they're not faked here, only what's real is shown).
 */
@Composable
fun NativeNotesListScreen(container: NativeAppContainer, serverUrl: String, onOpenNote: (String) -> Unit) {
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
    val headerBg = if (dark) DarkCardBg else LightCardBg

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
        Column(Modifier.fillMaxSize()) {
            NativeHeader(
                titleColor = titleColor,
                subtextColor = subtextColor,
                headerBg = headerBg,
                refreshing = refreshing,
                onRefresh = { refresh() },
            )

            errorMessage?.let {
                Text(it, color = ErrorColor, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }

            if (notes.isEmpty() && !refreshing && errorMessage == null) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.native_notes_empty), color = subtextColor)
                }
            } else {
                LazyVerticalStaggeredGrid(
                    columns = StaggeredGridCells.Fixed(2),
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalItemSpacing = 10.dp,
                ) {
                    items(notes, key = { it.id }) { note ->
                        NoteCard(
                            note = note,
                            dark = dark,
                            titleColor = titleColor,
                            subtextColor = subtextColor,
                            onClick = { onOpenNote(note.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NativeHeader(
    titleColor: Color,
    subtextColor: Color,
    headerBg: Color,
    refreshing: Boolean,
    onRefresh: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(headerBg)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(id = R.drawable.glasskeep_logo),
            contentDescription = "GlassKeep",
            modifier = Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)),
        )
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("Glass Keep", color = titleColor, fontWeight = FontWeight.Bold, fontSize = 19.sp)
            Text(stringResource(R.string.native_header_notes_label), color = subtextColor, fontSize = 12.sp)
        }
        Text(
            stringResource(R.string.native_notes_refresh),
            color = if (refreshing) subtextColor else Indigo,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            modifier = Modifier
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = !refreshing,
                    role = Role.Button,
                ) { onRefresh() }
                .padding(8.dp),
        )
    }
}

@Composable
private fun NoteCard(note: NoteEntity, dark: Boolean, titleColor: Color, subtextColor: Color, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(noteColorFor(note.color, dark))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(14.dp),
    ) {
        Text(
            note.title.ifBlank { stringResource(R.string.native_notes_untitled) },
            color = titleColor,
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
        )
        Spacer(Modifier.height(6.dp))

        if (note.type == "checklist") {
            ChecklistCardPreview(note = note, titleColor = titleColor, subtextColor = subtextColor)
        } else {
            val preview = remember(note.content) { NoteContent.previewPlainText(note.content) }
            if (preview.isNotBlank()) {
                Text(preview, color = titleColor, fontSize = 13.sp, lineHeight = 18.sp)
            } else if (note.type != "text") {
                Text(noteTypeLabel(note.type), color = subtextColor, fontSize = 12.sp)
            }
        }

        if (note.pinned) {
            Spacer(Modifier.height(8.dp))
            Text(
                "• " + stringResource(R.string.native_notes_pinned),
                color = Indigo,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
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
