package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.alpha
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
import com.glasskeep.app.nativeapp.data.RemoveCollaboratorResult
import com.glasskeep.app.nativeapp.data.SetCollaboratorAccessResult
import com.glasskeep.app.nativeapp.data.network.CollaboratorDto
import com.glasskeep.app.nativeapp.data.network.UserDto
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/** LETTER_INDEX_MIN (CollaborationModal.jsx:11): below this many
 *  candidates the alphabet jump-list is more clutter than help. */
private const val LetterIndexMin = 15

/**
 * CollaborationModal.jsx, ported: who has access to one note, and, for
 * the owner, everyone who could. One screen, not two: on a phone the web
 * modal already fills the viewport (`w-full h-full rounded-none`), and it
 * holds the roster AND the picker together, so splitting them into a
 * screen plus a dialog would have been the native app's own invention.
 *
 * Three zones, exactly as the web lays them out: a fixed header, a
 * scrolling body (current collaborators, then the search and the
 * candidates), and a fixed footer (the access to grant, then Cancel and
 * Add). A non-owner sees only the roster and a Close button.
 *
 * Deliberately not ported, disclosed rather than silently dropped:
 * candidates from federated peer servers (the native client has no
 * /federation/users/search call yet, so only local users are offered;
 * an existing federated collaborator still shows with its server badge).
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
    val context = LocalContext.current
    val toasts = LocalGkToasts.current

    var collaborators by remember { mutableStateOf<List<CollaboratorDto>>(emptyList()) }
    var isOwner by remember { mutableStateOf(false) }
    var currentUserId by remember { mutableStateOf<Int?>(null) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var pendingRemoval by remember { mutableStateOf<CollaboratorDto?>(null) }

    var candidates by remember { mutableStateOf<List<UserDto>>(emptyList()) }
    var candidatesLoading by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var letterFilter by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Map<Int, String>>(emptyMap()) }
    var newAccess by remember { mutableStateOf("write") }
    var submitting by remember { mutableStateOf(false) }

    val errorTemplate = stringResource(R.string.native_collaborators_error)
    val accessFailedTemplate = stringResource(R.string.native_collaborators_access_failed)
    val removeFailedTemplate = stringResource(R.string.native_collaborators_remove_failed)
    val loadErrorTemplate = stringResource(R.string.native_collaborators_search_error)
    val addedTemplate = stringResource(R.string.native_collaborators_added_success)
    val addFailedTemplate = stringResource(R.string.native_collaborators_add_failed)

    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

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

    fun changeAccess(collaborator: CollaboratorDto, access: String) {
        scope.launch {
            try {
                when (val result = repository.setCollaboratorAccess(noteId, collaborator.id, access)) {
                    SetCollaboratorAccessResult.Updated -> load()
                    SetCollaboratorAccessResult.NotFound -> load()
                    is SetCollaboratorAccessResult.Rejected -> {
                        toasts.error(String.format(accessFailedTemplate, "HTTP ${result.httpCode}"))
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("CollaboratorsScreen changeAccess failed", t)
                toasts.error(String.format(accessFailedTemplate, t.message ?: t.javaClass.simpleName))
            }
        }
    }

    fun removeCollaborator(collaborator: CollaboratorDto, keepCopy: Boolean) {
        scope.launch {
            try {
                when (val result = repository.removeCollaborator(noteId, collaborator.id, keepCopy)) {
                    is RemoveCollaboratorResult.Removed -> load()
                    RemoveCollaboratorResult.NotFound -> load()
                    is RemoveCollaboratorResult.Rejected -> {
                        toasts.error(String.format(removeFailedTemplate, "HTTP ${result.httpCode}"))
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("CollaboratorsScreen removeCollaborator failed", t)
                toasts.error(String.format(removeFailedTemplate, t.message ?: t.javaClass.simpleName))
            } finally {
                pendingRemoval = null
            }
        }
    }

    /** Confirming sends one request per selected person, sequentially:
     *  there's no batch endpoint on the server, same as the web's own
     *  loop. Someone who is already a collaborator (a benign race, added
     *  from another device moments ago) is silently skipped, same as the
     *  web; any other failure is tallied and reported once at the end
     *  instead of one toast per person. */
    fun submitAdd() {
        if (submitting || selected.isEmpty()) return
        submitting = true
        val targets = candidates.filter { it.id in selected.keys }
        scope.launch {
            var added = 0
            var failed = 0
            for (user in targets) {
                try {
                    when (repository.addCollaborator(noteId, user.email, selected[user.id] ?: newAccess)) {
                        is AddCollaboratorResult.Added -> added++
                        AddCollaboratorResult.AlreadyCollaborator -> Unit
                        AddCollaboratorResult.UserNotFound, is AddCollaboratorResult.Rejected -> failed++
                    }
                } catch (t: Throwable) {
                    NativeDebug.e("CollaboratorsScreen add failed for user ${user.id}", t)
                    failed++
                }
            }
            submitting = false
            selected = emptyMap()
            if (added > 0) {
                toasts.success(String.format(addedTemplate, added))
            }
            if (failed > 0) {
                toasts.error(String.format(addFailedTemplate, failed))
            }
            load()
        }
    }

    LaunchedEffect(noteId) {
        load()
        currentUserId = try {
            repository.fetchProfile().id
        } catch (t: Throwable) {
            NativeDebug.e("CollaboratorsScreen fetchProfile failed", t)
            null
        }
    }

    // The candidate list is only ever fetched for the owner, and only once
    // the roster is in: it filters against it.
    LaunchedEffect(isOwner) {
        if (!isOwner || candidates.isNotEmpty()) return@LaunchedEffect
        candidatesLoading = true
        try {
            candidates = repository.searchUsers()
        } catch (t: Throwable) {
            NativeDebug.e("CollaboratorsScreen searchUsers failed", t)
            errorMessage = String.format(loadErrorTemplate, t.message ?: t.javaClass.simpleName)
        } finally {
            candidatesLoading = false
        }
    }

    // existingIds also excludes the current user without any extra lookup:
    // the roster always includes the owner's own entry (the server's
    // GET .../collaborators unconditionally unshifts it).
    val existingIds = remember(collaborators) { collaborators.map { it.id }.toSet() }
    val available = remember(candidates, existingIds) { candidates.filterNot { it.id in existingIds } }
    val filtered = remember(available, query, letterFilter) {
        val trimmed = query.trim()
        available
            .filter { trimmed.isEmpty() || it.name.contains(trimmed, ignoreCase = true) || it.email.contains(trimmed, ignoreCase = true) }
            .filter { letterFilter == null || initialOf(it.name) == letterFilter }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(if (dark) Color(0xFF282828) else Color.White)
            .windowInsetsPadding(WindowInsets.systemBars)
            .padding(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(
                    if (isOwner) R.string.native_collaborators_add_action else R.string.native_collaborators_title,
                ),
                color = titleColor,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            val closeLabel = stringResource(R.string.native_common_close)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .semantics { contentDescription = closeLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onBack() }
                    .padding(6.dp),
            ) {
                CloseIcon(size = 22.dp, tint = subtextColor)
            }
        }

        errorMessage?.let {
            Text(it, color = ErrorColor, fontSize = 13.sp, modifier = Modifier.padding(bottom = 8.dp))
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
        ) {
            if (collaborators.isNotEmpty()) {
                Text(
                    stringResource(R.string.native_collaborators_current),
                    color = if (dark) Color(0xFFD1D5DB) else Color(0xFF374151),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                    for (collaborator in collaborators) {
                        if (isOwner && collaborator.isOwner) continue
                        CollaboratorRow(
                            collaborator = collaborator,
                            isMe = collaborator.id == currentUserId,
                            dark = dark,
                            titleColor = titleColor,
                            subtextColor = subtextColor,
                            borderColor = borderColor,
                            canManage = isOwner && !collaborator.isOwner,
                            onSetAccess = { access -> changeAccess(collaborator, access) },
                            onRemove = { pendingRemoval = collaborator },
                        )
                    }
                }
            }

            if (isOwner) {
                Text(
                    stringResource(R.string.native_collaborators_select_hint),
                    color = if (dark) Color(0xFFD1D5DB) else Color(0xFF4B5563),
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text(stringResource(R.string.native_collaborators_search_placeholder)) },
                    leadingIcon = { SearchIcon(size = 16.dp, tint = subtextColor) },
                    singleLine = true,
                    colors = detailFieldColors(titleColor, subtextColor, borderColor),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                )
                if (available.size >= LetterIndexMin && query.isBlank()) {
                    LetterIndex(
                        letters = remember(available) { available.map { initialOf(it.name) }.toSortedSet().toList() },
                        active = letterFilter,
                        dark = dark,
                        titleColor = titleColor,
                        onSelect = { letterFilter = it },
                    )
                }
                CandidateList(
                    candidates = filtered,
                    loading = candidatesLoading,
                    hasAny = available.isNotEmpty(),
                    selected = selected,
                    dark = dark,
                    titleColor = titleColor,
                    subtextColor = subtextColor,
                    borderColor = borderColor,
                    onToggle = { user ->
                        selected = if (user.id in selected) selected - user.id else selected + (user.id to newAccess)
                    },
                    onAccess = { user, access -> selected = selected + (user.id to access) },
                )
            }
        }

        if (isOwner) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        if (selected.isEmpty()) {
                            stringResource(R.string.native_collaborators_access_for_new)
                        } else {
                            String.format(stringResource(R.string.native_collaborators_access_for_selected), selected.size)
                        },
                        color = if (dark) Color(0xFFE5E7EB) else Color(0xFF374151),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        stringResource(R.string.native_collaborators_access_for_new_hint),
                        color = subtextColor,
                        fontSize = 11.sp,
                    )
                }
                AccessToggle(
                    canWrite = newAccess == "write",
                    dark = dark,
                    subtextColor = subtextColor,
                    borderColor = borderColor,
                    onChange = { write ->
                        newAccess = if (write) "write" else "read"
                        // Changing the default also re-grants everyone
                        // already ticked, same as the web's own toggle.
                        selected = selected.mapValues { newAccess }
                    },
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GkSecondaryButton(
                    label = stringResource(R.string.native_dialog_cancel),
                    borderColor = borderColor,
                    textColor = titleColor,
                    onClick = onBack,
                )
                GkGradientButton(
                    label = if (selected.isEmpty()) {
                        stringResource(R.string.native_collaborators_add_action)
                    } else {
                        String.format(stringResource(R.string.native_collaborators_add_confirm), selected.size)
                    },
                    themeId = container.themeState.themeId,
                    enabled = selected.isNotEmpty() && !submitting,
                    onClick = { submitAdd() },
                )
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                GkSecondaryButton(
                    label = stringResource(R.string.native_common_close),
                    borderColor = borderColor,
                    textColor = titleColor,
                    onClick = onBack,
                )
            }
        }
    }

    if (loading) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(if (dark) Color(0xFF282828) else Color.White),
            contentAlignment = Alignment.Center,
        ) {
            Text(stringResource(R.string.native_collaborators_searching), color = subtextColor, fontSize = 14.sp)
        }
    }

    pendingRemoval?.let { collaborator ->
        RemoveCollaboratorDialog(
            collaboratorName = collaborator.name,
            dark = dark,
            onDismiss = { pendingRemoval = null },
            onConfirm = { keepCopy -> removeCollaborator(collaborator, keepCopy) },
        )
    }
}

/** The first letter a name is filed under, `#` for anything that doesn't
 *  start with a letter (CollaborationModal.jsx:15-18). */
private fun initialOf(name: String): String {
    val first = name.trim().firstOrNull()?.uppercaseChar() ?: return "#"
    return if (first in 'A'..'Z') first.toString() else "#"
}

/** The alphabet jump list: "All" then every letter actually present. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LetterIndex(
    letters: List<String>,
    active: String?,
    dark: Boolean,
    titleColor: Color,
    onSelect: (String?) -> Unit,
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        LetterChip(stringResource(R.string.native_collaborators_letter_all), active == null, dark, titleColor) { onSelect(null) }
        for (letter in letters) {
            LetterChip(letter, active == letter, dark, titleColor) { onSelect(letter) }
        }
    }
}

@Composable
private fun LetterChip(label: String, selected: Boolean, dark: Boolean, titleColor: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (selected) Indigo else Color.Transparent)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            label,
            color = when {
                selected -> Color.White
                dark -> Color(0xFFD1D5DB)
                else -> Color(0xFF4B5563)
            },
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/** The bordered candidate box and its three states: still searching, no
 *  one left to add, or a filter that matched nothing (a single dash, the
 *  web's own placeholder). */
@Composable
private fun CandidateList(
    candidates: List<UserDto>,
    loading: Boolean,
    hasAny: Boolean,
    selected: Map<Int, String>,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    onToggle: (UserDto) -> Unit,
    onAccess: (UserDto, String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 96.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color.Black.copy(alpha = 0.20f) else Color(0xFFF9FAFB).copy(alpha = 0.5f))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        when {
            loading -> CandidatePlaceholder(stringResource(R.string.native_collaborators_searching), subtextColor)
            !hasAny -> CandidatePlaceholder(stringResource(R.string.native_collaborators_none_available), subtextColor)
            candidates.isEmpty() -> CandidatePlaceholder("—", subtextColor)
            else -> LazyColumn(
                modifier = Modifier.heightIn(max = 320.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(candidates, key = { it.id }) { user ->
                    CandidateRow(
                        user = user,
                        access = selected[user.id],
                        dark = dark,
                        titleColor = titleColor,
                        subtextColor = subtextColor,
                        borderColor = borderColor,
                        onToggle = { onToggle(user) },
                        onAccess = { access -> onAccess(user, access) },
                    )
                }
            }
        }
    }
}

@Composable
private fun CandidatePlaceholder(text: String, subtextColor: Color) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = subtextColor, fontSize = 14.sp)
    }
}

@Composable
private fun CandidateRow(
    user: UserDto,
    access: String?,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    onToggle: () -> Unit,
    onAccess: (String) -> Unit,
) {
    val checked = access != null
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (checked) Indigo.copy(alpha = if (dark) 0.22f else 0.12f) else Color.Transparent)
            .border(
                width = 1.dp,
                color = if (checked) Indigo.copy(alpha = 0.45f) else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onToggle() }
            .padding(8.dp),
    ) {
        AvatarCircle(avatarUrl = user.avatarUrl, name = user.name, size = 32.dp, onClick = {})
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
        if (checked) {
            AccessToggle(
                canWrite = access == "write",
                dark = dark,
                subtextColor = subtextColor,
                borderColor = borderColor,
                onChange = { write -> onAccess(if (write) "write" else "read") },
            )
        }
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(if (checked) Indigo else Color.Transparent)
                .border(
                    width = if (checked) 0.dp else 1.dp,
                    color = if (checked) Color.Transparent else borderColor,
                    shape = RoundedCornerShape(999.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) CheckmarkIcon(size = 14.dp, tint = Color.White)
        }
    }
}

/** One roster row: avatar, name with its badges, email, then the access
 *  toggle and the remove button for the owner. */
@Composable
private fun CollaboratorRow(
    collaborator: CollaboratorDto,
    isMe: Boolean,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    canManage: Boolean,
    onSetAccess: (String) -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color(0xFF374151) else Color(0xFFF3F4F6))
            .padding(8.dp),
    ) {
        AvatarCircle(avatarUrl = collaborator.avatarUrl, name = collaborator.name, size = 32.dp, onClick = {})
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    collaborator.name,
                    color = titleColor,
                    fontWeight = FontWeight.Medium,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (collaborator.federated) {
                    SoftBadge(
                        collaborator.serverLabel ?: stringResource(R.string.native_collaborators_remote_server),
                        leading = { WorldIcon(size = 14.dp, tint = Indigo) },
                    )
                }
                if (isMe) SoftBadge(stringResource(R.string.native_collaborators_me))
                if (collaborator.isOwner) {
                    Text(
                        stringResource(R.string.native_collaborators_owner),
                        color = if (dark) Color(0xFF818CF8) else Indigo,
                        fontSize = 12.sp,
                    )
                }
            }
            if (!collaborator.federated) {
                Text(collaborator.email, color = subtextColor, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (canManage) {
            AccessToggle(
                canWrite = collaborator.canWrite != 0,
                dark = dark,
                subtextColor = subtextColor,
                borderColor = borderColor,
                onChange = { write -> onSetAccess(if (write) "write" else "read") },
            )
            val removeLabel = stringResource(R.string.native_collaborators_remove_action)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .semantics { contentDescription = removeLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onRemove() }
                    .padding(6.dp),
            ) {
                CloseIcon(size = 16.dp, tint = ErrorColor)
            }
        }
    }
}

/** ServerBadge / the "Me" pill: the same soft-accent chip both use. */
@Composable
private fun SoftBadge(label: String, leading: (@Composable () -> Unit)? = null) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Indigo.copy(alpha = 0.12f))
            .border(1.dp, Indigo.copy(alpha = 0.28f), RoundedCornerShape(6.dp))
            .padding(start = 4.dp, end = 6.dp, top = 2.dp, bottom = 2.dp),
    ) {
        leading?.invoke()
        Text(
            label,
            color = Indigo,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** AccessToggle (CollaborationModal.jsx:43-73): a two-cell segmented
 *  control, an eye for read-only and a pencil for can-edit, never
 *  disabled. Tapping the half that is already on does nothing. */
@Composable
private fun AccessToggle(
    canWrite: Boolean,
    dark: Boolean,
    subtextColor: Color,
    borderColor: Color,
    onChange: (Boolean) -> Unit,
) {
    val readLabel = stringResource(R.string.native_collaborators_read_only)
    val writeLabel = stringResource(R.string.native_collaborators_can_write)
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .background(if (!canWrite) Indigo.copy(alpha = if (dark) 0.22f else 0.12f) else Color.Transparent)
                .semantics { contentDescription = readLabel }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { if (canWrite) onChange(false) }
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            EyeIcon(size = 14.dp, tint = if (!canWrite) Indigo else subtextColor)
        }
        Box(Modifier.width(1.dp).height(24.dp).background(borderColor))
        Box(
            modifier = Modifier
                .background(if (canWrite) Indigo.copy(alpha = if (dark) 0.22f else 0.12f) else Color.Transparent)
                .semantics { contentDescription = writeLabel }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { if (!canWrite) onChange(true) }
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            PencilIcon(size = 14.dp, tint = if (canWrite) Indigo else subtextColor)
        }
    }
}

/** Confirm step before the owner removes a collaborator: mirrors the
 *  web's own ConfirmRemoveCollaboratorDialog.jsx exactly (same three
 *  stacked choices, same meaning) rather than a single button plus a
 *  toggle, since the two remove modes are equally-weighted, mutually
 *  exclusive actions, not a default with an optional modifier. */
@Composable
private fun RemoveCollaboratorDialog(
    collaboratorName: String,
    dark: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (keepCopy: Boolean) -> Unit,
) {
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(if (dark) DarkBgColor else Color.White)
                .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                .padding(24.dp),
        ) {
            Text(
                String.format(stringResource(R.string.native_collaborators_remove_question), collaboratorName),
                color = titleColor,
                fontWeight = FontWeight.SemiBold,
                fontSize = 18.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.native_collaborators_remove_subtitle),
                color = subtextColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            Spacer(Modifier.height(20.dp))

            StackedDialogButton(
                label = stringResource(R.string.native_collaborators_remove_keep_copy),
                textColor = titleColor,
                borderColor = borderColor,
                onClick = { onConfirm(true) },
            )
            Spacer(Modifier.height(8.dp))
            StackedDialogButton(
                label = stringResource(R.string.native_collaborators_remove_no_copy),
                textColor = Color.White,
                background = ErrorColor,
                onClick = { onConfirm(false) },
            )
            Spacer(Modifier.height(8.dp))
            StackedDialogButton(
                label = stringResource(R.string.native_dialog_cancel),
                textColor = subtextColor,
                onClick = onDismiss,
            )
        }
    }
}

/** One full-width choice of a stacked dialog (`px-4 py-2 rounded-lg`). */
@Composable
private fun StackedDialogButton(
    label: String,
    textColor: Color,
    borderColor: Color? = null,
    background: Color = Color.Transparent,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .then(if (borderColor != null) Modifier.border(1.dp, borderColor, RoundedCornerShape(8.dp)) else Modifier)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = textColor, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}
