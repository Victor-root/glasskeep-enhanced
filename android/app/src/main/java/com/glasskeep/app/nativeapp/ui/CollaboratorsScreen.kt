package com.glasskeep.app.nativeapp.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.AddCollaboratorResult
import com.glasskeep.app.nativeapp.data.network.CollaboratorDto
import com.glasskeep.app.nativeapp.data.network.UserDto
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

/**
 * Participant roster for one note: who else has access, and whether they
 * can edit or only view. Reached from NoteDetailScreen's kebab menu,
 * offered there for a note that already has at least one collaborator
 * (see NoteDto.collaborators) or, unconditionally, for the owner (who
 * needs a way to add the very first one). Read-only for everyone except
 * the owner, who additionally gets a "+" action here to invite someone
 * (AddCollaboratorDialog below); managing an existing collaborator's
 * access or removing one isn't built yet (see this milestone's own commit
 * message for the follow-up tasks that add those).
 */
@Composable
fun CollaboratorsScreen(
    container: NativeAppContainer,
    serverUrl: String,
    noteId: String,
    onBack: () -> Unit,
) {
    val dark = isSystemInDarkTheme()
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()

    var collaborators by remember { mutableStateOf<List<CollaboratorDto>>(emptyList()) }
    var isOwner by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showAddDialog by remember { mutableStateOf(false) }

    val errorTemplate = stringResource(R.string.native_collaborators_error)
    val ownerLabel = stringResource(R.string.native_collaborators_owner)
    val writeLabel = stringResource(R.string.native_collaborators_can_write)
    val readOnlyLabel = stringResource(R.string.native_collaborators_read_only)
    val addLabel = stringResource(R.string.native_collaborators_add_action)

    suspend fun load() {
        loading = true
        errorMessage = null
        try {
            // Two calls, not one: fetchNoteCollaborators alone can't tell
            // this viewer's OWN access level (every entry it returns is
            // about someone else, or the owner, never "am I the owner"),
            // and a nav-passed boolean would risk going stale if
            // ownership changed between screens (see setArchivedQueued's
            // own "leave" outcome in NotesRepository.kt for a real way
            // that can happen) instead of always reflecting the current
            // truth like every other fetch in this app.
            isOwner = repository.fetchNoteDetail(noteId).access == "owner"
            collaborators = repository.fetchNoteCollaborators(noteId)
        } catch (t: Throwable) {
            NativeDebug.e("CollaboratorsScreen load failed", t)
            errorMessage = String.format(errorTemplate, t.message ?: t.javaClass.simpleName)
        } finally {
            loading = false
        }
    }

    LaunchedEffect(noteId) { load() }

    val bgModifier = if (dark) Modifier.background(DarkBgColor) else Modifier.background(LightBgGradient)
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(WorkspaceTheme.headerGradient(container.themeState.themeId, dark))
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
                            stringResource(R.string.native_collaborators_title),
                            color = titleColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                    if (isOwner) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .semantics { contentDescription = addLabel }
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { showAddDialog = true }
                                .padding(8.dp),
                        ) {
                            PlusIcon(size = 20.dp, tint = titleColor)
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(WorkspaceTheme.headerBorderColor(container.themeState.themeId, dark)))
            }

            errorMessage?.let {
                Text(it, color = ErrorColor, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }

            if (loading) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Indigo)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(vertical = 8.dp),
                ) {
                    items(collaborators, key = { it.id }) { collaborator ->
                        CollaboratorRow(
                            collaborator = collaborator,
                            titleColor = titleColor,
                            subtextColor = subtextColor,
                            ownerLabel = ownerLabel,
                            writeLabel = writeLabel,
                            readOnlyLabel = readOnlyLabel,
                        )
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddCollaboratorDialog(
            container = container,
            serverUrl = serverUrl,
            noteId = noteId,
            existingCollaboratorIds = collaborators.map { it.id }.toSet(),
            onDismiss = { showAddDialog = false },
            onAdded = {
                showAddDialog = false
                scope.launch { load() }
            },
        )
    }
}

@Composable
private fun CollaboratorRow(
    collaborator: CollaboratorDto,
    titleColor: Color,
    subtextColor: Color,
    ownerLabel: String,
    writeLabel: String,
    readOnlyLabel: String,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        AvatarCircle(avatarUrl = collaborator.avatarUrl, name = collaborator.name, size = 40.dp, onClick = {})
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(collaborator.name, color = titleColor, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                if (collaborator.isOwner) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Indigo.copy(alpha = 0.14f))
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    ) {
                        Text(ownerLabel, color = Indigo, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Text(collaborator.email, color = subtextColor, fontSize = 13.sp)
            if (collaborator.federated && collaborator.serverLabel != null) {
                Text(collaborator.serverLabel, color = subtextColor, fontSize = 12.sp)
            }
        }
        if (!collaborator.isOwner) {
            Text(
                if (collaborator.canWrite != 0) writeLabel else readOnlyLabel,
                color = subtextColor,
                fontSize = 12.sp,
            )
        }
    }
}

/** Add-collaborator picker: a search box over every local user (fetched
 *  once with an empty query, filtered client-side on every keystroke from
 *  then on) and a checkable list, plus one read/write toggle applied to
 *  everyone selected in this session rather than a per-row override:
 *  matches what the web app's own CollaborationModal actually ships
 *  today (a global default toggle; its per-row override and its
 *  alphabet-index jump list are both deferred as later polish, not
 *  needed for a first, fully-working version). Owner-gated by the
 *  caller (CollaboratorsScreen's own "+" action), not here.
 *
 *  Confirming sends one request per selected person, sequentially:
 *  there's no batch endpoint on the server, same as the web's own loop.
 *  A person already a collaborator (a benign race, e.g. added from
 *  another device moments ago) is silently skipped, same as the web;
 *  any other failure is tallied and reported once at the end instead of
 *  one toast per person. */
@Composable
internal fun AddCollaboratorDialog(
    container: NativeAppContainer,
    serverUrl: String,
    noteId: String,
    existingCollaboratorIds: Set<Int>,
    onDismiss: () -> Unit,
    onAdded: () -> Unit,
) {
    val dark = isSystemInDarkTheme()
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var candidates by remember { mutableStateOf<List<UserDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var selectedIds by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var accessWrite by remember { mutableStateOf(true) }
    var submitting by remember { mutableStateOf(false) }

    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

    val loadErrorTemplate = stringResource(R.string.native_collaborators_search_error)
    val addedTemplate = stringResource(R.string.native_collaborators_added_success)
    val addFailedTemplate = stringResource(R.string.native_collaborators_add_failed)
    val readLabel = stringResource(R.string.native_collaborators_read_only)
    val writeLabel = stringResource(R.string.native_collaborators_can_write)
    val accessLabel = stringResource(R.string.native_collaborators_access_label)
    val addConfirmTemplate = stringResource(R.string.native_collaborators_add_confirm)
    val searchPlaceholder = stringResource(R.string.native_collaborators_search_placeholder)
    val noneFoundLabel = stringResource(R.string.native_collaborators_search_none_found)

    LaunchedEffect(Unit) {
        try {
            candidates = repository.searchUsers()
        } catch (t: Throwable) {
            NativeDebug.e("AddCollaboratorDialog search failed", t)
            errorMessage = String.format(loadErrorTemplate, t.message ?: t.javaClass.simpleName)
        } finally {
            loading = false
        }
    }

    // existingCollaboratorIds also excludes the current user without any
    // extra lookup: only the owner ever opens this dialog (see
    // CollaboratorsScreen's own "+" gating), and the roster it's built
    // from always includes the owner's own entry (server's
    // GET .../collaborators unconditionally unshifts it), so the caller
    // is already in this set by construction.
    val filtered = remember(candidates, query, existingCollaboratorIds) {
        val trimmed = query.trim()
        candidates
            .filter { it.id !in existingCollaboratorIds }
            .filter { trimmed.isEmpty() || it.name.contains(trimmed, ignoreCase = true) || it.email.contains(trimmed, ignoreCase = true) }
    }

    fun submit() {
        if (submitting || selectedIds.isEmpty()) return
        submitting = true
        val access = if (accessWrite) "write" else "read"
        val targets = candidates.filter { it.id in selectedIds }
        scope.launch {
            var added = 0
            var failed = 0
            for (user in targets) {
                try {
                    when (repository.addCollaborator(noteId, user.email, access)) {
                        is AddCollaboratorResult.Added -> added++
                        AddCollaboratorResult.AlreadyCollaborator -> Unit
                        AddCollaboratorResult.UserNotFound, is AddCollaboratorResult.Rejected -> failed++
                    }
                } catch (t: Throwable) {
                    NativeDebug.e("AddCollaboratorDialog add failed for user ${user.id}", t)
                    failed++
                }
            }
            submitting = false
            if (added > 0) {
                Toast.makeText(context, String.format(addedTemplate, added), Toast.LENGTH_SHORT).show()
                onAdded()
            }
            if (failed > 0) {
                Toast.makeText(context, String.format(addFailedTemplate, failed), Toast.LENGTH_SHORT).show()
            }
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(if (dark) DarkBgColor else Color.White)
                .padding(20.dp),
        ) {
            Text(
                stringResource(R.string.native_collaborators_add_action),
                color = titleColor,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
            Spacer(Modifier.height(14.dp))

            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text(searchPlaceholder) },
                singleLine = true,
                colors = detailFieldColors(titleColor, subtextColor, borderColor),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))

            errorMessage?.let {
                Text(it, color = ErrorColor, fontSize = 12.sp)
                Spacer(Modifier.height(8.dp))
            }

            if (loading) {
                Box(Modifier.fillMaxWidth().padding(vertical = 20.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Indigo)
                }
            } else if (filtered.isEmpty()) {
                Text(noneFoundLabel, color = subtextColor, fontSize = 13.sp)
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 260.dp)) {
                    items(filtered, key = { it.id }) { user ->
                        val checked = user.id in selectedIds
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                ) { selectedIds = if (checked) selectedIds - user.id else selectedIds + user.id }
                                .padding(vertical = 8.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(18.dp)
                                    .clip(RoundedCornerShape(5.dp))
                                    .background(if (checked) Indigo else Color.Transparent)
                                    .border(
                                        width = if (checked) 0.dp else 1.5.dp,
                                        color = if (checked) Color.Transparent else borderColor,
                                        shape = RoundedCornerShape(5.dp),
                                    ),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (checked) CheckmarkIcon(size = 12.dp, tint = Color.White)
                            }
                            Spacer(Modifier.width(10.dp))
                            AvatarCircle(avatarUrl = user.avatarUrl, name = user.name, size = 32.dp, onClick = {})
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    user.name,
                                    color = titleColor,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(user.email, color = subtextColor, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            Text(accessLabel, color = subtextColor, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Row {
                AccessChip(label = readLabel, selected = !accessWrite, dark = dark, onClick = { accessWrite = false })
                Spacer(Modifier.width(8.dp))
                AccessChip(label = writeLabel, selected = accessWrite, dark = dark, onClick = { accessWrite = true })
            }
            Spacer(Modifier.height(16.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(ButtonGradient)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = selectedIds.isNotEmpty() && !submitting,
                        role = Role.Button,
                    ) { submit() },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    String.format(addConfirmTemplate, selectedIds.size),
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                )
            }
        }
    }
}

@Composable
private fun AccessChip(label: String, selected: Boolean, dark: Boolean, onClick: () -> Unit) {
    val bg = if (selected) Indigo else if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.05f)
    val fg = if (selected) Color.White else if (dark) Color.White else Color.Black
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(label, color = fg, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}
