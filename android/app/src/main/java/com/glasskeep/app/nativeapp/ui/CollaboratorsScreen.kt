package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
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
import com.glasskeep.app.nativeapp.data.AddCollaboratorResult
import com.glasskeep.app.nativeapp.data.RemoveCollaboratorResult
import com.glasskeep.app.nativeapp.data.SetCollaboratorAccessResult
import com.glasskeep.app.nativeapp.data.network.CollaboratorDto
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import java.text.Collator
import kotlinx.coroutines.launch

/** LETTER_INDEX_MIN (CollaborationModal.jsx:11): below this many
 *  candidates the alphabet jump-list is more clutter than help. */
private const val LetterIndexMin = 15

/** The badges' 11px text keeps the 1.4286 line-height ratio of the
 *  `text-sm` line they sit in. */
private val BadgeLineHeight = 15.71.sp

/** The modal's own surface, which the system bars take while it is open. */
internal fun collaboratorsSurface(dark: Boolean): Color = if (dark) Color(0xFF282828) else Color.White

private data class ShareCandidate(
    val key: String,
    val localId: Int? = null,
    val name: String,
    val email: String? = null,
    val avatarUrl: String? = null,
    val federated: Boolean = false,
    val serverLabel: String? = null,
    val remoteRef: String? = null,
    val username: String,
)

/** useCollaboration.js's participantsMutationRef / pendingMutationsRef: a
 *  roster change bumps [seq] when it starts and again when it ends, and
 *  counts in [pending] while it travels, so a reload that overlapped one
 *  can tell its answer may predate it. Main thread only. */
private class RosterMutations {
    var seq = 0
        private set
    var pending = 0
        private set

    fun begin() {
        seq++
        pending++
    }

    fun end() {
        pending--
        seq++
    }
}

/**
 * CollaborationModal.jsx, over the open note: who has access to it and,
 * for the owner, everyone who could. On a phone the web modal fills the
 * screen with the roster and the picker together: a fixed header, a
 * scrolling body (current collaborators, then the search and the
 * candidates) and a fixed footer (the access to grant, then Cancel and
 * Add). A non-owner sees only the roster and a Close button.
 *
 * The roster belongs to the note ([collaborators], the web's
 * addModalCollaborators): this reloads it on open and after each change,
 * and flips an access at once, before the server answers. The picker
 * merges local accounts with real users advertised by paired federation
 * peers; the opaque ref@host value is only sent to the API and never
 * shown in place of the friendly name/server badge.
 */
@Composable
fun CollaboratorsScreen(
    container: NativeAppContainer,
    serverUrl: String,
    noteId: String,
    isOwner: Boolean,
    currentUserId: Int?,
    collaborators: List<CollaboratorDto>,
    onCollaboratorsChange: (List<CollaboratorDto>) -> Unit,
    onClose: () -> Unit,
) {
    val dark = LocalGkDark.current
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val applyCollaborators by rememberUpdatedState(onCollaboratorsChange)

    var pendingRemoval by remember { mutableStateOf<CollaboratorDto?>(null) }
    var candidates by remember { mutableStateOf<List<ShareCandidate>>(emptyList()) }
    var candidatesLoading by remember { mutableStateOf(isOwner) }
    var query by remember { mutableStateOf("") }
    var letterFilter by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var newAccess by remember { mutableStateOf("write") }
    var adding by remember { mutableStateOf(false) }
    val mutations = remember { RosterMutations() }

    val textColor = if (dark) DarkTitleColor else LightTitleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    // text-gray-500 / dark:text-gray-400.
    val mutedColor = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282)
    val accent = WorkspaceTheme.accent(themeId, dark)

    /** loadCollaboratorsForAddModal. [force] is for the reload a change
     *  asks for once the server confirmed it; any other drops its answer
     *  when a change started, ended or was still travelling meanwhile,
     *  since it could put the previous roster back. */
    suspend fun reload(force: Boolean = false) {
        val seq = mutations.seq
        val fresh = try {
            repository.fetchNoteCollaborators(noteId)
        } catch (t: Throwable) {
            NativeDebug.e("CollaboratorsScreen reload failed", t)
            return
        }
        if (!force && (mutations.seq != seq || mutations.pending > 0)) return
        applyCollaborators(fresh)
    }

    /** The row flips at once; a refusal says why and puts the server's
     *  own answer back. */
    fun changeAccess(collaborator: CollaboratorDto, access: String) {
        mutations.begin()
        val canWrite = if (access == "write") 1 else 0
        onCollaboratorsChange(collaborators.map { if (it.id == collaborator.id) it.copy(canWrite = canWrite) else it })
        scope.launch {
            try {
                val refusal = try {
                    when (val result = repository.setCollaboratorAccess(noteId, collaborator.id, access)) {
                        SetCollaboratorAccessResult.Updated -> null
                        is SetCollaboratorAccessResult.Rejected ->
                            context.localizedServerError(result.error, R.string.native_collaborators_access_failed)
                    }
                } catch (t: Throwable) {
                    NativeDebug.e("CollaboratorsScreen changeAccess failed", t)
                    context.getString(R.string.native_collaborators_access_failed)
                }
                if (refusal != null) {
                    toasts.error(refusal)
                    reload(force = true)
                }
            } finally {
                mutations.end()
            }
        }
    }

    /** No toast on success: the server's own notification reaches both
     *  sides, as on the web. */
    fun removeCollaborator(collaborator: CollaboratorDto, keepCopy: Boolean) {
        mutations.begin()
        scope.launch {
            try {
                when (val result = repository.removeCollaborator(noteId, collaborator.id, keepCopy)) {
                    is RemoveCollaboratorResult.Removed -> reload(force = true)
                    is RemoveCollaboratorResult.Rejected ->
                        toasts.error(context.localizedServerError(result.error, R.string.native_collaborators_remove_failed))
                }
            } catch (t: Throwable) {
                NativeDebug.e("CollaboratorsScreen removeCollaborator failed", t)
                toasts.error(context.getString(R.string.native_collaborators_remove_failed))
            } finally {
                mutations.end()
            }
        }
    }

    /** describeAddError: a locked peer names the server and the person as
     *  the list shows them. */
    fun addError(error: String?, user: ShareCandidate): String =
        if (error == "locked") {
            context.getString(
                R.string.native_collaborators_peer_locked,
                user.serverLabel ?: user.username.substringAfterLast('@'),
                user.name,
            )
        } else {
            context.localizedServerError(error, R.string.native_collaborators_add_failed)
        }

    // Already on the note, so not offered again: local rows by id,
    // federated ones by their peer identity and server. Sorted by name the
    // way localeCompare's "base" sensitivity does, accents and case aside.
    val available = remember(candidates, collaborators) {
        val collator = Collator.getInstance().apply { strength = Collator.PRIMARY }
        candidates.filterNot { candidate ->
            if (candidate.federated) {
                collaborators.any {
                    it.federated && it.email == candidate.remoteRef &&
                        it.serverLabel.orEmpty() == candidate.serverLabel.orEmpty()
                }
            } else {
                collaborators.any { it.id == candidate.localId }
            }
        }.sortedWith(compareBy(collator) { it.name })
    }
    val searchText = query.trim()
    val visible = remember(available, searchText, letterFilter) {
        when {
            searchText.isNotEmpty() -> available.filter { it.name.contains(searchText, ignoreCase = true) }
            letterFilter != null -> available.filter { initialOf(it.name) == letterFilter }
            else -> available
        }
    }
    val selectedUsers = available.filter { it.key in selected }

    /** addCollaboratorsBatch: one request per person, each with its own
     *  access, one toast per refusal and a single summary once done. */
    fun submitAdd() {
        if (selectedUsers.isEmpty() || adding) return
        adding = true
        val items = selectedUsers.map { it to (selected[it.key] ?: newAccess) }
        mutations.begin()
        scope.launch {
            try {
                var added = 0
                for ((user, access) in items) {
                    val refusal = try {
                        when (val result = repository.addCollaborator(noteId, user.username, access)) {
                            is AddCollaboratorResult.Added -> {
                                added++
                                null
                            }
                            AddCollaboratorResult.AlreadyCollaborator -> null
                            is AddCollaboratorResult.Rejected -> addError(result.error, user)
                        }
                    } catch (t: Throwable) {
                        NativeDebug.e("CollaboratorsScreen add failed for user ${user.key}", t)
                        context.getString(R.string.native_collaborators_add_failed)
                    }
                    refusal?.let { toasts.error(it) }
                }
                if (added > 0) {
                    toasts.success(
                        if (added == 1) {
                            context.getString(R.string.native_collaborators_added_one)
                        } else {
                            context.getString(R.string.native_collaborators_added_many, added)
                        },
                        icon = "share",
                    )
                    reload(force = true)
                }
            } finally {
                mutations.end()
            }
            selected = emptyMap()
            query = ""
            letterFilter = null
            adding = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    // Everyone the owner could share with: local accounts first, at once,
    // then the real users of paired peers appended when they answer, so a
    // slow or offline peer never holds the local list back.
    LaunchedEffect(isOwner) {
        if (!isOwner) return@LaunchedEffect
        candidatesLoading = true
        candidates = try {
            repository.searchUsers()
                .filter { it.id != currentUserId }
                .map { user ->
                    ShareCandidate(
                        key = "local:${user.id}", localId = user.id, name = user.name.ifEmpty { user.email },
                        email = user.email, avatarUrl = user.avatarUrl, username = user.email,
                    )
                }
        } catch (t: Throwable) {
            NativeDebug.e("CollaboratorsScreen searchUsers failed", t)
            emptyList()
        }
        candidatesLoading = false
        val remotes = try {
            repository.searchFederatedUsers().map { user ->
                ShareCandidate(
                    key = "remote:${user.host}|${user.ref}", name = user.name.ifEmpty { user.ref },
                    avatarUrl = user.avatar, federated = true, serverLabel = user.serverLabel,
                    remoteRef = user.ref, username = "${user.ref}@${user.host}",
                )
            }
        } catch (t: Throwable) {
            NativeDebug.e("CollaboratorsScreen searchFederatedUsers failed", t)
            emptyList()
        }
        if (remotes.isNotEmpty()) candidates = candidates + remotes
    }

    // Full screen on a phone, edge to edge under the system bars, the
    // content 16dp inside them. The note's own 1px panel edge, which this
    // sits inside, is the modal's `.glass-card` border.
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(collaboratorsSurface(dark))
            .blockTouchesBelow()
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
                color = textColor,
                fontSize = 18.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            val closeLabel = stringResource(R.string.native_common_close)
            Box(
                modifier = Modifier
                    // -mr-1.5: the button reaches 6dp into the gutter.
                    .offset(x = 6.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .semantics { contentDescription = closeLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onClose() }
                    .padding(6.dp),
            ) {
                CloseIcon(size = 22.dp, tint = mutedColor, strokeWidth = 2f)
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
        ) {
            if (collaborators.isNotEmpty()) {
                // The owner doesn't see their own row; a collaborator does,
                // marked "Me", so it's clear they're on the note.
                val shown = if (isOwner) collaborators.filterNot { it.isOwner } else collaborators
                Text(
                    stringResource(R.string.native_collaborators_current),
                    color = if (dark) Color(0xFFD1D5DC) else Color(0xFF364153),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                    // Its 8px margin collapses into the section's 16px when
                    // no row follows.
                    modifier = Modifier.padding(bottom = if (shown.isEmpty()) 0.dp else 8.dp),
                )
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(bottom = 16.dp),
                ) {
                    for (collaborator in shown) {
                        key(collaborator.id) {
                            CollaboratorRow(
                                collaborator = collaborator,
                                isMe = collaborator.id == currentUserId,
                                canManage = isOwner && !collaborator.isOwner,
                                themeId = themeId,
                                dark = dark,
                                textColor = textColor,
                                mutedColor = mutedColor,
                                borderColor = borderColor,
                                onSetAccess = { access -> changeAccess(collaborator, access) },
                                onRemove = { pendingRemoval = collaborator },
                            )
                        }
                    }
                }
            }

            if (isOwner) {
                Text(
                    stringResource(R.string.native_collaborators_select_hint),
                    color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
                PeopleSearchField(
                    value = query,
                    onValueChange = {
                        query = it
                        letterFilter = null
                    },
                    themeId = themeId,
                    dark = dark,
                    borderColor = borderColor,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                if (available.size >= LetterIndexMin && searchText.isEmpty()) {
                    LetterIndex(
                        letters = remember(available) { available.map { initialOf(it.name) }.toSet() },
                        active = letterFilter,
                        accent = accent,
                        dark = dark,
                        textColor = textColor,
                        onSelect = { letterFilter = it },
                    )
                }
                CandidateList(
                    visible = visible,
                    loading = candidatesLoading,
                    hasAny = available.isNotEmpty(),
                    selected = selected,
                    themeId = themeId,
                    dark = dark,
                    textColor = textColor,
                    mutedColor = mutedColor,
                    borderColor = borderColor,
                    onToggle = { user ->
                        selected = if (user.key in selected) selected - user.key else selected + (user.key to newAccess)
                    },
                    onAccess = { user, access -> if (user.key in selected) selected = selected + (user.key to access) },
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
                        if (selectedUsers.isEmpty()) {
                            stringResource(R.string.native_collaborators_access_for_new)
                        } else {
                            stringResource(R.string.native_collaborators_access_for_selected, selectedUsers.size)
                        },
                        color = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153),
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        stringResource(R.string.native_collaborators_access_for_new_hint),
                        color = mutedColor,
                        fontSize = 11.sp,
                        lineHeight = 16.5.sp,
                    )
                }
                // Sets the access of the next picks and, in one go, of
                // everyone already picked.
                AccessToggle(
                    canWrite = newAccess == "write",
                    themeId = themeId,
                    dark = dark,
                    mutedColor = mutedColor,
                    borderColor = borderColor,
                    onChange = { access ->
                        newAccess = access
                        selected = selected.mapValues { access }
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
                    textColor = textColor,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    fontWeight = FontWeight.Normal,
                    onClick = onClose,
                )
                val addLabel = stringResource(R.string.native_collaborators_add_action)
                GkGradientButton(
                    label = if (selectedUsers.isEmpty()) addLabel else "$addLabel (${selectedUsers.size})",
                    themeId = themeId,
                    enabled = selectedUsers.isNotEmpty() && !adding,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
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
                    textColor = textColor,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    fontWeight = FontWeight.Normal,
                    onClick = onClose,
                )
            }
        }
    }

    pendingRemoval?.let { collaborator ->
        GkChoiceDialog(
            title = stringResource(R.string.native_collaborators_remove_question, collaborator.name.ifEmpty { collaborator.email }),
            message = stringResource(R.string.native_collaborators_remove_subtitle),
            mildLabel = stringResource(R.string.native_collaborators_remove_keep_copy),
            drasticLabel = stringResource(R.string.native_collaborators_remove_no_copy),
            dark = dark,
            borderColor = borderColor,
            titleColor = textColor,
            onMild = {
                pendingRemoval = null
                removeCollaborator(collaborator, keepCopy = true)
            },
            onDrastic = {
                pendingRemoval = null
                removeCollaborator(collaborator, keepCopy = false)
            },
            onDismiss = { pendingRemoval = null },
        )
    }
}

/** The first letter a name is filed under, `#` for anything that doesn't
 *  start with a letter (CollaborationModal.jsx:15-18). */
private fun initialOf(name: String): String {
    val first = name.trim().firstOrNull()?.uppercaseChar() ?: return "#"
    return if (first in 'A'..'Z') first.toString() else "#"
}

/** The search box: `pl-9 pr-3 py-2 text-sm rounded-lg` on white (dark
 *  black 30%), the magnifier 12dp in, and the `ring-2` a workspace theme
 *  retints to its accent (the default theme's is indigo-500 at 50%). */
@Composable
private fun PeopleSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    themeId: String?,
    dark: Boolean,
    borderColor: Color,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val ring = if (WorkspaceTheme.forId(themeId).id == WorkspaceTheme.DEFAULT_ID) {
        Color(0xFF615FFF).copy(alpha = 0.5f)
    } else {
        WorkspaceTheme.accent(themeId, dark)
    }
    // text-gray-900 / dark:text-gray-100, the caret following the text.
    val textColor = if (dark) Color(0xFFF3F4F6) else Color(0xFF101828)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        textStyle = TextStyle(color = textColor, fontSize = 14.sp, lineHeight = 20.sp),
        cursorBrush = SolidColor(textColor),
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { focused = it.isFocused }
            .drawBehind {
                if (focused) {
                    val width = 2.dp.toPx()
                    drawRoundRect(
                        color = ring,
                        topLeft = Offset(-width / 2f, -width / 2f),
                        size = Size(size.width + width, size.height + width),
                        cornerRadius = CornerRadius(8.dp.toPx() + width / 2f),
                        style = Stroke(width),
                    )
                }
            }
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color.Black.copy(alpha = 0.3f) else Color.White)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(start = 12.dp, end = 13.dp, top = 9.dp, bottom = 9.dp),
        decorationBox = { innerTextField ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                ModalSearchIcon(size = 16.dp, tint = if (dark) Color(0xFF6A7282) else Color(0xFF99A1AF))
                Box(Modifier.weight(1f).padding(start = 9.dp)) {
                    if (value.isEmpty()) {
                        Text(
                            stringResource(R.string.native_collaborators_search_placeholder),
                            color = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    innerTextField()
                }
            }
        },
    )
}

/** The alphabet jump list: "All", the 26 letters (those nobody is filed
 *  under faded and inert), then "#" when anyone is filed there. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LetterIndex(
    letters: Set<String>,
    active: String?,
    accent: Color,
    dark: Boolean,
    textColor: Color,
    onSelect: (String?) -> Unit,
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        LetterChip(stringResource(R.string.native_collaborators_letter_all), active == null, true, accent, dark, textColor) {
            onSelect(null)
        }
        for (letter in 'A'..'Z') {
            val label = letter.toString()
            LetterChip(label, active == label, label in letters, accent, dark, textColor) { onSelect(label) }
        }
        if ("#" in letters) {
            LetterChip("#", active == "#", true, accent, dark, textColor) { onSelect("#") }
        }
    }
}

/** `px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none`:
 *  gray-600 / gray-300, white on the accent when picked, the page's own
 *  text at 25% when disabled. */
@Composable
private fun LetterChip(
    label: String,
    active: Boolean,
    enabled: Boolean,
    accent: Color,
    dark: Boolean,
    textColor: Color,
    onClick: () -> Unit,
) {
    Text(
        label,
        color = when {
            !enabled -> textColor.copy(alpha = 0.25f)
            active -> Color.White
            dark -> Color(0xFFD1D5DC)
            else -> Color(0xFF4A5565)
        },
        fontSize = 11.sp,
        lineHeight = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (active && enabled) accent else Color.Transparent)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** The bordered candidate box, as tall as its rows (the whole body
 *  scrolls), and its three placeholders: still searching, no one left to
 *  add, or a filter that matched nothing (a single dash, the web's own). */
@Composable
private fun CandidateList(
    visible: List<ShareCandidate>,
    loading: Boolean,
    hasAny: Boolean,
    selected: Map<String, String>,
    themeId: String?,
    dark: Boolean,
    textColor: Color,
    mutedColor: Color,
    borderColor: Color,
    onToggle: (ShareCandidate) -> Unit,
    onAccess: (ShareCandidate, String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 96.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color.Black.copy(alpha = 0.20f) else Color(0xFFF9FAFB).copy(alpha = 0.5f))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(7.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        when {
            loading -> CandidatePlaceholder(stringResource(R.string.native_collaborators_searching), mutedColor)
            !hasAny -> CandidatePlaceholder(stringResource(R.string.native_collaborators_none_available), mutedColor)
            visible.isEmpty() -> CandidatePlaceholder("\u2014", if (dark) Color(0xFF6A7282) else Color(0xFF99A1AF))
            else -> for (user in visible) {
                key(user.key) {
                    CandidateRow(
                        user = user,
                        access = selected[user.key],
                        themeId = themeId,
                        dark = dark,
                        textColor = textColor,
                        mutedColor = mutedColor,
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
private fun CandidatePlaceholder(text: String, color: Color) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = color, fontSize = 14.sp, lineHeight = 20.sp)
    }
}

/** One person to pick: the whole row toggles them, the soft accent marks
 *  a pick, whose own access then shows before the check circle. */
@Composable
private fun CandidateRow(
    user: ShareCandidate,
    access: String?,
    themeId: String?,
    dark: Boolean,
    textColor: Color,
    mutedColor: Color,
    borderColor: Color,
    onToggle: () -> Unit,
    onAccess: (String) -> Unit,
) {
    val checked = access != null
    val accent = WorkspaceTheme.accent(themeId, dark)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (checked) WorkspaceTheme.accentSoftBg(themeId, dark) else Color.Transparent)
            .border(
                width = 1.dp,
                color = if (checked) WorkspaceTheme.accentSoftBorder(themeId, dark) else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onToggle() }
            .padding(9.dp),
    ) {
        AvatarCircle(avatarUrl = user.avatarUrl, name = user.name, size = 32.dp)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    user.name,
                    color = textColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (user.federated) ServerBadge(user.serverLabel, themeId, dark)
            }
            if (!user.federated && !user.email.isNullOrEmpty()) {
                Text(
                    user.email,
                    color = mutedColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (access != null) {
            AccessToggle(
                canWrite = access == "write",
                themeId = themeId,
                dark = dark,
                mutedColor = mutedColor,
                borderColor = borderColor,
                onChange = onAccess,
            )
        }
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(CircleShape)
                .background(if (checked) accent else Color.Transparent)
                .border(
                    width = 1.dp,
                    color = when {
                        checked -> accent
                        dark -> Color(0xFF4A5565)
                        else -> Color(0xFFD1D5DC)
                    },
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) TablerCheckIcon(size = 20.dp, tint = Color.White)
        }
    }
}

/** One roster row: avatar, name with its badges, e-mail, then the access
 *  toggle and the red remove cross for the owner. */
@Composable
private fun CollaboratorRow(
    collaborator: CollaboratorDto,
    isMe: Boolean,
    canManage: Boolean,
    themeId: String?,
    dark: Boolean,
    textColor: Color,
    mutedColor: Color,
    borderColor: Color,
    onSetAccess: (String) -> Unit,
    onRemove: () -> Unit,
) {
    val name = collaborator.name.ifEmpty { collaborator.email }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color(0xFF364153) else Color(0xFFF3F4F6))
            .padding(8.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.weight(1f),
        ) {
            AvatarCircle(avatarUrl = collaborator.avatarUrl, name = name, size = 32.dp)
            Column(Modifier.weight(1f, fill = false)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        name,
                        color = textColor,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (collaborator.federated) ServerBadge(collaborator.serverLabel, themeId, dark)
                    if (isMe) {
                        Text(
                            stringResource(R.string.native_collaborators_me),
                            color = WorkspaceTheme.accent(themeId, dark),
                            fontSize = 11.sp,
                            lineHeight = BadgeLineHeight,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .softAccentChip(themeId, dark)
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                    if (collaborator.isOwner) {
                        Text(
                            stringResource(R.string.native_collaborators_owner),
                            // indigo-500 / indigo-400.
                            color = if (dark) Color(0xFF7C86FF) else Color(0xFF615FFF),
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                        )
                    }
                }
                if (!collaborator.federated && collaborator.email.isNotEmpty()) {
                    Text(
                        collaborator.email,
                        color = mutedColor,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (canManage) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AccessToggle(
                    canWrite = collaborator.canWrite != 0,
                    themeId = themeId,
                    dark = dark,
                    mutedColor = mutedColor,
                    borderColor = borderColor,
                    onChange = onSetAccess,
                )
                val removeLabel = stringResource(R.string.native_collaborators_remove_action)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .semantics { contentDescription = removeLabel }
                        .gkTooltip(removeLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onRemove() }
                        .padding(6.dp),
                ) {
                    CloseIcon(size = 16.dp, tint = DangerRed, strokeWidth = 2.5f)
                }
            }
        }
    }
}

/** ServerBadge (CollaborationModal.jsx:23-30): the peer server a person
 *  lives on, by its friendly name, never a URL. */
@Composable
private fun ServerBadge(label: String?, themeId: String?, dark: Boolean) {
    val accent = WorkspaceTheme.accent(themeId, dark)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .softAccentChip(themeId, dark)
            .padding(start = 4.dp, end = 6.dp, top = 2.dp, bottom = 2.dp),
    ) {
        ServerIcon(size = 20.dp, tint = accent)
        Text(
            label ?: stringResource(R.string.native_collaborators_remote_server),
            color = accent,
            fontSize = 11.sp,
            lineHeight = BadgeLineHeight,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 160.dp),
        )
    }
}

/** The soft accent chip both badges share: the accent at 12% behind and
 *  at 24% on its 1px edge, 6dp corners. */
private fun Modifier.softAccentChip(themeId: String?, dark: Boolean): Modifier =
    clip(RoundedCornerShape(6.dp))
        .background(WorkspaceTheme.accentSoftBg(themeId, dark))
        .border(1.dp, WorkspaceTheme.accentSoftBorder(themeId, dark), RoundedCornerShape(6.dp))
        .padding(1.dp)

/** AccessToggle (CollaborationModal.jsx:43-73): an eye for read-only and a
 *  pencil for can-edit, the active half on the soft accent, never
 *  disabled. Tapping the half that is already on does nothing. */
@Composable
private fun AccessToggle(
    canWrite: Boolean,
    themeId: String?,
    dark: Boolean,
    mutedColor: Color,
    borderColor: Color,
    onChange: (String) -> Unit,
) {
    val accent = WorkspaceTheme.accent(themeId, dark)
    val activeBg = WorkspaceTheme.accentSoftBg(themeId, dark)
    val readLabel = stringResource(R.string.native_access_read_only)
    val writeLabel = stringResource(R.string.native_collaborators_can_write)
    Row(
        modifier = Modifier
            .height(IntrinsicSize.Min)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(1.dp)
            .clip(RoundedCornerShape(7.dp)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .background(if (!canWrite) activeBg else Color.Transparent)
                .semantics { contentDescription = readLabel }
                .gkTooltip(readLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { if (canWrite) onChange("read") }
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            TablerEyeIcon(size = 20.dp, tint = if (!canWrite) accent else mutedColor)
        }
        Box(Modifier.width(1.dp).fillMaxHeight().background(borderColor))
        Box(
            modifier = Modifier
                .background(if (canWrite) activeBg else Color.Transparent)
                .semantics { contentDescription = writeLabel }
                .gkTooltip(writeLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { if (!canWrite) onChange("write") }
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            PencilIcon(size = 20.dp, tint = if (canWrite) accent else mutedColor, strokeWidth = 1.75f)
        }
    }
}
