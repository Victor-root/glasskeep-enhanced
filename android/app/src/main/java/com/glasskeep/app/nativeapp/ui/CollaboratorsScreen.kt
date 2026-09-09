package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import com.glasskeep.app.nativeapp.data.network.CollaboratorDto
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor

private val ErrorColor = Color(0xFFdc2626)

/**
 * Read-only participant roster for one note: who else has access, and
 * whether they can edit or only view. View-only this milestone, no add/
 * remove/change-access action anywhere here yet (see this milestone's own
 * commit message for the follow-up tasks that add those). Reached only
 * from NoteDetailScreen's kebab menu, and only offered there for a note
 * that already has at least one collaborator (see NoteDto.collaborators).
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

    var collaborators by remember { mutableStateOf<List<CollaboratorDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val errorTemplate = stringResource(R.string.native_collaborators_error)
    val ownerLabel = stringResource(R.string.native_collaborators_owner)
    val writeLabel = stringResource(R.string.native_collaborators_can_write)
    val readOnlyLabel = stringResource(R.string.native_collaborators_read_only)

    LaunchedEffect(noteId) {
        loading = true
        errorMessage = null
        try {
            collaborators = repository.fetchNoteCollaborators(noteId)
        } catch (t: Throwable) {
            NativeDebug.e("CollaboratorsScreen load failed", t)
            errorMessage = String.format(errorTemplate, t.message ?: t.javaClass.simpleName)
        } finally {
            loading = false
        }
    }

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
