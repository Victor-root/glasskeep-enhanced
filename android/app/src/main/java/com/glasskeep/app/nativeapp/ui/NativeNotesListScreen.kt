package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.ChecklistPreview
import com.glasskeep.app.nativeapp.data.NoteContent
import com.glasskeep.app.nativeapp.data.isReminderPast
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/**
 * Notes list: a two-column masonry grid with real card previews (text
 * snippet, or the first few unchecked checklist items), and a header
 * carrying the app's own branding, same shape as NotesHeader.jsx /
 * NoteCard.jsx on the web side (AI search, view toggle, admin panel and
 * the rest of that header's icon cluster aren't native features yet, so
 * they're not faked here, only what's real is shown).
 */
@Composable
fun NativeNotesListScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onOpenNote: (String) -> Unit,
    onOpenArchived: () -> Unit,
    onOpenTrash: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val dark = isSystemInDarkTheme()
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val notes by repository.observeNotes().collectAsState(initial = emptyList())
    var refreshing by remember { mutableStateOf(false) }
    var creatingNote by remember { mutableStateOf(false) }
    var fabOpen by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var searchOpen by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    // Client-side only, same fields the web app matches for a note without
    // tags/items/images (title, content): those don't have a native data
    // layer yet (see NoteEntity), so this is narrower than the web's own
    // search until they do.
    val filteredNotes = remember(notes, searchQuery) {
        val q = searchQuery.trim()
        if (q.isEmpty()) notes
        else notes.filter { it.title.contains(q, ignoreCase = true) || it.content.contains(q, ignoreCase = true) }
    }

    val errorSyncTemplate = stringResource(R.string.native_notes_error_sync)
    val errorCreateTemplate = stringResource(R.string.native_notes_create_error)

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

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            NativeHeader(
                dark = dark,
                themeId = themeId,
                titleColor = titleColor,
                subtextColor = subtextColor,
                refreshing = refreshing,
                onRefresh = { refresh() },
                onOpenArchived = onOpenArchived,
                onOpenTrash = onOpenTrash,
                onOpenSettings = onOpenSettings,
                searchOpen = searchOpen,
                onSearchOpenChange = { open ->
                    searchOpen = open
                    if (!open) searchQuery = ""
                },
                searchQuery = searchQuery,
                onSearchQueryChange = { searchQuery = it },
            )

            errorMessage?.let {
                Text(it, color = ErrorColor, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }

            if (notes.isEmpty() && !refreshing && errorMessage == null) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.native_notes_empty), color = subtextColor)
                }
            } else if (filteredNotes.isEmpty() && searchQuery.isNotBlank()) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.native_notes_search_empty), color = subtextColor)
                }
            } else {
                val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
                LazyVerticalStaggeredGrid(
                    columns = StaggeredGridCells.Fixed(2),
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(start = 12.dp, top = 12.dp, end = 12.dp, bottom = 12.dp + navBarBottom),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalItemSpacing = 10.dp,
                ) {
                    items(filteredNotes, key = { it.id }) { note ->
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
}

@Composable
private fun NativeHeader(
    dark: Boolean,
    themeId: String,
    titleColor: Color,
    subtextColor: Color,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onOpenArchived: () -> Unit,
    onOpenTrash: () -> Unit,
    onOpenSettings: () -> Unit,
    searchOpen: Boolean,
    onSearchOpenChange: (Boolean) -> Unit,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
) {
    // The web header's own "glass chrome" gradient, following whichever of
    // the six workspace themes the account has picked (see WorkspaceTheme.kt
    // and the Settings screen's own theme picker), a bottom hairline in the
    // matching border token, and the real Hamburger glyph. The web header
    // also backdrop-blurs whatever scrolls behind it. There's no full
    // sidebar yet, so the hamburger opens a plain dropdown (archived,
    // trash, settings) instead of a drawer for now; it can grow more
    // entries the same way as more of the web sidebar gets native screens,
    // without needing a drawer rebuild for each one.
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(WorkspaceTheme.headerGradient(themeId, dark))
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(horizontal = 16.dp, vertical = 14.dp),
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
                            stringResource(R.string.native_notes_search_placeholder),
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
                        modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                    )
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
                var mainMenuExpanded by remember { mutableStateOf(false) }
                Box {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { mainMenuExpanded = true }
                            .padding(6.dp),
                    ) {
                        HamburgerIcon(size = 22.dp, tint = titleColor)
                    }
                    DropdownMenu(expanded = mainMenuExpanded, onDismissRequest = { mainMenuExpanded = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.native_archived_title)) },
                            leadingIcon = { ArchiveIcon(size = 18.dp, tint = titleColor) },
                            onClick = { mainMenuExpanded = false; onOpenArchived() },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.native_trash_title)) },
                            leadingIcon = { TrashIcon(size = 18.dp, tint = titleColor) },
                            onClick = { mainMenuExpanded = false; onOpenTrash() },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.native_settings_title)) },
                            leadingIcon = { SettingsIcon(size = 18.dp, tint = titleColor) },
                            onClick = { mainMenuExpanded = false; onOpenSettings() },
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Image(
                    painter = painterResource(id = R.drawable.glasskeep_logo),
                    contentDescription = "GlassKeep",
                    modifier = Modifier.size(32.dp).clip(RoundedCornerShape(9.dp)),
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Glass Keep", color = titleColor, fontWeight = FontWeight.Bold, fontSize = 19.sp)
                    Text(stringResource(R.string.native_header_notes_label), color = subtextColor, fontSize = 12.sp)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onSearchOpenChange(true) }
                        .padding(8.dp),
                ) {
                    SearchIcon(size = 18.dp, tint = titleColor)
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
        Box(Modifier.fillMaxWidth().height(1.dp).background(WorkspaceTheme.headerBorderColor(themeId, dark)))
    }
}

// Violet-tinted card shadow, standing in for the web card's own
// `box-shadow: 0 2px 8px rgba(139, 92, 246, 0.06)`. Compose's shadow
// API doesn't take a CSS-style low-alpha shadow color directly, so this
// is the closest native equivalent, not a byte-for-byte port.
private val CardShadowTint = Color(0xFF8B5CF6)

// internal, not private: ArchivedNotesScreen.kt (same package, different
// file) reuses this for the exact same card rendering. Kotlin's top-level
// `private` is file-scoped.
@Composable
internal fun NoteCard(note: NoteEntity, dark: Boolean, titleColor: Color, subtextColor: Color, onClick: () -> Unit) {
    val borderColor = if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.08f)
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(elevation = 3.dp, shape = shape, ambientColor = CardShadowTint, spotColor = CardShadowTint)
            .clip(shape)
            .background(noteColorFor(note.color, dark))
            .border(width = 1.dp, color = borderColor, shape = shape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                note.title.ifBlank { stringResource(R.string.native_notes_untitled) },
                color = titleColor,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                modifier = Modifier.weight(1f),
            )
            if (note.pinned) {
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
                Text(preview, color = titleColor, fontSize = 13.sp, lineHeight = 18.sp)
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
