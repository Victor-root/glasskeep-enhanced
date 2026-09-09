package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.ChecklistEntry
import com.glasskeep.app.nativeapp.data.RichBlock

/**
 * useModalHistory.js, natively: chunk-level undo/redo for the open
 * note's title and body, the way Word or Google Keep group a burst of
 * typing into one step.
 *
 * Same rules as the web: at most 80 steps, a one-second debounce before
 * a snapshot is recorded (the caller's own delay), the redo tail dropped
 * as soon as a new change lands, and colour, tags, images, drawings and
 * audio deliberately left out of the tracked state.
 */
internal data class NoteSnapshot(
    val title: String,
    val body: String,
    val richBlocks: List<RichBlock>?,
    val checklistItems: List<ChecklistEntry>?,
)

internal class NoteHistory {
    private val entries = mutableListOf<NoteSnapshot>()
    private var index = -1

    var canUndo by mutableStateOf(false)
        private set
    var canRedo by mutableStateOf(false)
        private set

    /** Set while a snapshot is being applied so the change it causes
     *  doesn't record a step of its own (the web's restoringRef). */
    var restoring: Boolean = false

    fun reset(initial: NoteSnapshot) {
        entries.clear()
        entries.add(initial)
        index = 0
        refresh()
    }

    fun record(snapshot: NoteSnapshot) {
        if (index >= 0 && entries[index] == snapshot) return
        while (entries.size > index + 1) entries.removeAt(entries.size - 1)
        entries.add(snapshot)
        if (entries.size > MAX_HISTORY) entries.removeAt(0)
        index = entries.size - 1
        refresh()
    }

    fun undo(): NoteSnapshot? {
        if (index <= 0) return null
        index -= 1
        refresh()
        return entries[index]
    }

    fun redo(): NoteSnapshot? {
        if (index >= entries.size - 1) return null
        index += 1
        refresh()
        return entries[index]
    }

    private fun refresh() {
        canUndo = index > 0
        canRedo = index >= 0 && index < entries.size - 1
    }

    private companion object {
        const val MAX_HISTORY = 80
    }
}

@Composable
internal fun rememberNoteHistory(): NoteHistory = remember { NoteHistory() }
