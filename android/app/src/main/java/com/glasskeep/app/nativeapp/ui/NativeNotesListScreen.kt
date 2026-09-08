package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import kotlinx.coroutines.launch

/**
 * Milestone 0 of the native rewrite: read-only list, no editing, no
 * checklists/rich text/drawing/audio rendering yet. The point of this
 * screen is to prove the whole pipe end to end (login, /api/notes, local
 * cache, display) before building anything on top of it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeNotesListScreen(container: NativeAppContainer, serverUrl: String) {
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val notes by repository.observeNotes().collectAsState(initial = emptyList())
    var refreshing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun refresh() {
        refreshing = true
        errorMessage = null
        scope.launch {
            try {
                repository.refresh()
            } catch (t: Throwable) {
                NativeDebug.e("Notes refresh failed", t)
                errorMessage = "Synchronisation impossible : ${t.message}"
            } finally {
                refreshing = false
            }
        }
    }

    LaunchedEffect(serverUrl) { refresh() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notes (${notes.size})") },
                actions = {
                    TextButton(onClick = { refresh() }, enabled = !refreshing) {
                        Text(if (refreshing) "..." else "Actualiser")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            errorMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            }
            if (notes.isEmpty() && !refreshing && errorMessage == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucune note pour l'instant.")
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(notes, key = { it.id }) { note -> NoteRow(note) }
                }
            }
        }
    }
}

@Composable
private fun NoteRow(note: NoteEntity) {
    ListItem(
        headlineContent = { Text(note.title.ifBlank { "(sans titre)" }) },
        supportingContent = { Text(note.type) },
    )
    Divider()
}
