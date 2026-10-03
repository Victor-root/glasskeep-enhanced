package com.glasskeep.app.nativeapp.ui

import android.view.KeyEvent
import com.glasskeep.app.nativeapp.data.RichAlign
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichCommand
import com.glasskeep.app.nativeapp.data.RichMarkType

/**
 * The shortcuts of the web editor's Tiptap keymaps, for a hardware keyboard
 * (Bluetooth, DeX), each running the command of the matching bar button.
 * ProseMirror's keymap reads a capital letter's binding first, which is why
 * Ctrl+Shift+B, I and U toggle bold, italic and underline like the plain
 * keys do and the quote's Ctrl+Shift+B never fires. Shift+Enter, Ctrl+Enter,
 * Tab and Shift+Tab are the editor's own keys, not matched here.
 */
internal object RichShortcuts {
    /** Whether [event], a key press with Ctrl held, is a shortcut, run on [state]. */
    fun handle(state: RichEditorState, event: KeyEvent): Boolean {
        if (!event.isCtrlPressed) return false
        val key = event.keyCode
        val shift = event.isShiftPressed
        return when {
            event.isAltPressed -> !shift && alt(state, key)
            shift -> withShift(state, key)
            else -> plain(state, key)
        }
    }

    private fun alt(state: RichEditorState, key: Int): Boolean {
        when (key) {
            KeyEvent.KEYCODE_C -> state.command(RichCommand.CodeBlock)
            KeyEvent.KEYCODE_0 -> state.command(RichCommand.SetStyle(RichBlockKind.PARAGRAPH))
            in KeyEvent.KEYCODE_1..KeyEvent.KEYCODE_5 -> state.toggleHeading(headingKindFor(key - KeyEvent.KEYCODE_0))
            else -> return false
        }
        return true
    }

    private fun withShift(state: RichEditorState, key: Int): Boolean {
        when (key) {
            KeyEvent.KEYCODE_B -> state.toggleMark(RichMarkType.BOLD)
            KeyEvent.KEYCODE_I -> state.toggleMark(RichMarkType.ITALIC)
            KeyEvent.KEYCODE_U -> state.toggleMark(RichMarkType.UNDERLINE)
            KeyEvent.KEYCODE_S -> state.toggleMark(RichMarkType.STRIKE)
            KeyEvent.KEYCODE_H -> state.toggleMark(RichMarkType.HIGHLIGHT)
            KeyEvent.KEYCODE_7 -> state.command(RichCommand.ToggleList(RichBlockKind.NUMBERED_ITEM))
            KeyEvent.KEYCODE_8 -> state.command(RichCommand.ToggleList(RichBlockKind.BULLET_ITEM))
            KeyEvent.KEYCODE_9 -> state.command(RichCommand.ToggleList(RichBlockKind.TASK_ITEM))
            KeyEvent.KEYCODE_L -> state.command(RichCommand.Align(RichAlign.LEFT))
            KeyEvent.KEYCODE_E -> state.command(RichCommand.Align(RichAlign.CENTER))
            KeyEvent.KEYCODE_R -> state.command(RichCommand.Align(RichAlign.RIGHT))
            KeyEvent.KEYCODE_J -> state.command(RichCommand.Align(RichAlign.JUSTIFY))
            KeyEvent.KEYCODE_Z -> state.onRedo()
            else -> return false
        }
        return true
    }

    private fun plain(state: RichEditorState, key: Int): Boolean {
        when (key) {
            KeyEvent.KEYCODE_B -> state.toggleMark(RichMarkType.BOLD)
            KeyEvent.KEYCODE_I -> state.toggleMark(RichMarkType.ITALIC)
            KeyEvent.KEYCODE_U -> state.toggleMark(RichMarkType.UNDERLINE)
            KeyEvent.KEYCODE_E -> state.toggleMark(RichMarkType.CODE)
            KeyEvent.KEYCODE_COMMA -> state.toggleMark(RichMarkType.SUBSCRIPT)
            KeyEvent.KEYCODE_PERIOD -> state.toggleMark(RichMarkType.SUPERSCRIPT)
            KeyEvent.KEYCODE_Z -> state.onUndo()
            KeyEvent.KEYCODE_Y -> state.onRedo()
            else -> return false
        }
        return true
    }
}
