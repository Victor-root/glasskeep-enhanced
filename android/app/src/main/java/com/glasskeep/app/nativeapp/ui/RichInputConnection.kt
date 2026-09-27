package com.glasskeep.app.nativeapp.ui

import android.os.Bundle
import android.os.Handler
import android.text.InputType
import android.text.TextUtils
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.CompletionInfo
import android.view.inputmethod.CorrectionInfo
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedText
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputContentInfo
import android.view.inputmethod.InputMethodManager
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusEventModifierNode
import androidx.compose.ui.focus.FocusState
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.platform.PlatformTextInputMethodRequest
import androidx.compose.ui.platform.PlatformTextInputModifierNode
import androidx.compose.ui.platform.establishTextInputSession
import androidx.core.view.SoftwareKeyboardControllerCompat
import androidx.core.view.inputmethod.EditorInfoCompat
import com.glasskeep.app.BuildConfig
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.RichEditing
import com.glasskeep.app.nativeapp.data.RichTyping
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * The keyboard as the editor sees it: the one text session of the whole
 * document, what the keyboard was last told of it, and how to tell it
 * more. EditText's contract: every change of the selection or of the
 * composition is reported, and a text the keyboard did not type itself
 * (an input rule, a toolbar command, undo) restarts its view of it.
 */
internal class RichKeyboard(private val view: View) {
    private val manager = view.context.getSystemService(InputMethodManager::class.java)
    private var reported: IntArray? = null

    /** The request token of an input method watching the whole text
     *  (getExtractedText with GET_EXTRACTED_TEXT_MONITOR). */
    var monitorToken: Int? = null

    fun show() = SoftwareKeyboardControllerCompat(view).show()

    fun hide() = SoftwareKeyboardControllerCompat(view).hide()

    /** The keyboard's own batch is over: [inSync] when the text is what
     *  its commands made it, else it starts again from the document. */
    fun settled(state: RichEditing, inSync: Boolean) = documentReplaced(state, textChanged = !inSync)

    fun documentReplaced(state: RichEditing, textChanged: Boolean) {
        val now = positions(state)
        if (textChanged) {
            reported = now
            monitorToken = null
            // Not from inside the keyboard's own call, which this may be.
            view.post { manager?.restartInput(view) }
            richImeLog { "restartInput sel=${now[0]}..${now[1]} comp=${now[2]}..${now[3]}" }
            return
        }
        if (now.contentEquals(reported)) return
        reported = now
        manager?.updateSelection(view, now[0], now[1], now[2], now[3])
        richImeLog { "updateSelection sel=${now[0]}..${now[1]} comp=${now[2]}..${now[3]}" }
        monitorToken?.let { manager?.updateExtractedText(view, it, extracted(state)) }
    }

    /** A new connection starts from the document as it is. */
    fun connected(state: RichEditing) {
        reported = positions(state)
    }

    /** The selection and composition ends, the composition -1 when none. */
    private fun positions(state: RichEditing): IntArray {
        val (start, end) = RichTyping.flatRange(state, state.selection) ?: (0 to 0)
        val composition = state.composition?.let { RichTyping.flatRange(state, it) }
        return intArrayOf(start, end, composition?.first ?: -1, composition?.second ?: -1)
    }

    fun extracted(state: RichEditing): ExtractedText {
        val (start, end) = RichTyping.flatRange(state, state.selection) ?: (0 to 0)
        return ExtractedText().apply {
            text = state.flat.text
            startOffset = 0
            partialStartOffset = -1
            partialEndOffset = state.flat.text.length
            selectionStart = start
            selectionEnd = end
            flags = if ('\n' in state.flat.text) 0 else ExtractedText.FLAG_SINGLE_LINE
        }
    }
}

/**
 * The input connection of the whole document: the text the keyboard reads
 * is [RichEditing.flat], every edit it sends goes to the state's
 * [RichImeSession][com.glasskeep.app.nativeapp.data.RichImeSession], its
 * keys to [handleKey], and Cut, Copy, Paste and Select all to [onMenu].
 */
private class RichInputConnection(
    private val state: RichEditorState,
    private val keyboard: RichKeyboard,
    private val handleKey: (KeyEvent) -> Boolean,
    private val onMenu: (Int) -> Boolean,
) : InputConnection {
    private var batchDepth = 0

    private fun range(): Pair<RichEditing, Pair<Int, Int>>? {
        val editing = state.editing ?: return null
        return editing to (RichTyping.flatRange(editing, editing.selection) ?: return null)
    }

    override fun getTextBeforeCursor(n: Int, flags: Int): CharSequence? {
        val (editing, selection) = range() ?: return null
        return editing.flat.text.substring(maxOf(0, selection.first - n), selection.first)
    }

    override fun getTextAfterCursor(n: Int, flags: Int): CharSequence? {
        val (editing, selection) = range() ?: return null
        return editing.flat.text.substring(selection.second, minOf(editing.flat.text.length, selection.second + n))
    }

    override fun getSelectedText(flags: Int): CharSequence? {
        val (editing, selection) = range() ?: return null
        return if (selection.first == selection.second) null else editing.flat.text.substring(selection.first, selection.second)
    }

    override fun getCursorCapsMode(reqModes: Int): Int {
        val (editing, selection) = range() ?: return 0
        return TextUtils.getCapsMode(editing.flat.text, selection.first, reqModes)
    }

    override fun getExtractedText(request: ExtractedTextRequest?, flags: Int): ExtractedText? {
        val editing = state.editing ?: return null
        keyboard.monitorToken = if (flags and InputConnection.GET_EXTRACTED_TEXT_MONITOR != 0) request?.token ?: 0 else null
        return keyboard.extracted(editing)
    }

    override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean =
        edit("deleteSurroundingText $beforeLength $afterLength") { state.ime.deleteSurroundingText(beforeLength, afterLength) }

    override fun deleteSurroundingTextInCodePoints(beforeLength: Int, afterLength: Int): Boolean =
        edit("deleteSurroundingTextInCodePoints $beforeLength $afterLength") {
            state.ime.deleteSurroundingTextInCodePoints(beforeLength, afterLength)
        }

    override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean =
        edit("setComposingText \"$text\" $newCursorPosition") { state.ime.setComposingText(text?.toString().orEmpty(), newCursorPosition) }

    override fun setComposingRegion(start: Int, end: Int): Boolean =
        edit("setComposingRegion $start $end") { state.ime.setComposingRegion(start, end) }

    override fun finishComposingText(): Boolean = edit("finishComposingText") { state.ime.finishComposingText() }

    override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean =
        edit("commitText \"$text\" $newCursorPosition") { state.ime.commitText(text?.toString().orEmpty(), newCursorPosition) }

    override fun commitCompletion(text: CompletionInfo?): Boolean = false

    override fun commitCorrection(correctionInfo: CorrectionInfo?): Boolean = state.editing != null

    override fun setSelection(start: Int, end: Int): Boolean = edit("setSelection $start $end") { state.ime.setSelection(start, end) }

    override fun performEditorAction(editorAction: Int): Boolean = edit("performEditorAction $editorAction") { state.ime.enter() }

    override fun performContextMenuAction(id: Int): Boolean {
        richImeLog { "performContextMenuAction $id" }
        return onMenu(id)
    }

    override fun beginBatchEdit(): Boolean {
        if (state.editing == null) return false
        batchDepth++
        state.ime.beginBatch()
        return true
    }

    override fun endBatchEdit(): Boolean {
        if (batchDepth == 0) return false
        batchDepth--
        state.ime.endBatch()
        return batchDepth > 0
    }

    override fun sendKeyEvent(event: KeyEvent): Boolean {
        richImeLog { "sendKeyEvent $event" }
        return state.editing != null && handleKey(event)
    }

    override fun clearMetaKeyStates(states: Int): Boolean = false

    override fun reportFullscreenMode(enabled: Boolean): Boolean = false

    override fun performPrivateCommand(action: String?, data: Bundle?): Boolean = false

    override fun requestCursorUpdates(cursorUpdateMode: Int): Boolean = false

    override fun getHandler(): Handler? = null

    override fun closeConnection() {
        while (batchDepth > 0) endBatchEdit()
        if (state.editing?.composition != null) state.ime.finishComposingText()
    }

    override fun commitContent(inputContentInfo: InputContentInfo, flags: Int, opts: Bundle?): Boolean = false

    private inline fun edit(call: String, block: () -> Unit): Boolean {
        if (state.editing == null) return false
        block()
        richImeLog {
            val editing = state.editing
            "$call -> sel=${editing?.let { RichTyping.flatRange(it, it.selection) }} " +
                "comp=${editing?.composition?.let { RichTyping.flatRange(editing, it) }} length=${editing?.flat?.text?.length}"
        }
        return true
    }
}

/** The keyboard's calls and what the editor made of them, in debug builds
 *  only, where they are the one way to see what an input method sends. */
private inline fun richImeLog(message: () -> String) {
    if (BuildConfig.DEBUG) NativeDebug.d("RichIME ${message()}")
}

/**
 * The editor's side of the text input: while the text has the focus, one
 * keyboard session for the whole document, as a multi-line text field that
 * capitalizes sentences and corrects words (a contenteditable's own
 * defaults), the keyboard brought up unless the sheet keeps it down.
 */
internal fun Modifier.richTextInput(
    state: RichEditorState,
    handleKey: (KeyEvent) -> Boolean,
    onMenu: (Int) -> Boolean,
): Modifier = this then RichTextInputElement(state, handleKey, onMenu)

private data class RichTextInputElement(
    val state: RichEditorState,
    val handleKey: (KeyEvent) -> Boolean,
    val onMenu: (Int) -> Boolean,
) : ModifierNodeElement<RichTextInputNode>() {
    override fun create() = RichTextInputNode(state, handleKey, onMenu)

    override fun update(node: RichTextInputNode) {
        node.state = state
        node.handleKey = handleKey
        node.onMenu = onMenu
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "richTextInput"
    }
}

private class RichTextInputNode(
    var state: RichEditorState,
    var handleKey: (KeyEvent) -> Boolean,
    var onMenu: (Int) -> Boolean,
) : Modifier.Node(), PlatformTextInputModifierNode, FocusEventModifierNode {
    private var session: Job? = null

    override fun onFocusEvent(focusState: FocusState) {
        state.focused = focusState.isFocused
        if (!focusState.isFocused) {
            session?.cancel()
            session = null
            return
        }
        if (session != null) return
        session = coroutineScope.launch {
            establishTextInputSession {
                val keyboard = RichKeyboard(view)
                state.keyboard = keyboard
                try {
                    launch { if (!state.keyboardSuppressed) keyboard.show() }
                    startInputMethod(
                        PlatformTextInputMethodRequest { info ->
                            val editing = requireNotNull(state.editing)
                            keyboard.connected(editing)
                            info.fill(editing)
                            RichInputConnection(state, keyboard, { handleKey(it) }, { onMenu(it) })
                        },
                    )
                } finally {
                    if (state.keyboard === keyboard) state.keyboard = null
                }
            }
        }
    }

    override fun onDetach() {
        session?.cancel()
        session = null
    }
}

private fun EditorInfo.fill(editing: RichEditing) {
    val (start, end) = RichTyping.flatRange(editing, editing.selection) ?: (0 to 0)
    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or
        InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_AUTO_CORRECT
    imeOptions = EditorInfo.IME_ACTION_NONE or EditorInfo.IME_FLAG_NO_ENTER_ACTION or EditorInfo.IME_FLAG_NO_FULLSCREEN
    initialSelStart = start
    initialSelEnd = end
    initialCapsMode = TextUtils.getCapsMode(editing.flat.text, start, inputType)
    EditorInfoCompat.setInitialSurroundingText(this, editing.flat.text)
}
