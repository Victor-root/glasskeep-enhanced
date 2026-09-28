package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.pm.PmResolvedPos
import com.glasskeep.app.nativeapp.data.pm.PmSchema
import com.glasskeep.app.nativeapp.data.pm.PmTextSelection
import com.glasskeep.app.nativeapp.data.pm.PmTransaction
import com.glasskeep.app.nativeapp.data.pm.clearNodes
import com.glasskeep.app.nativeapp.data.pm.indent
import com.glasskeep.app.nativeapp.data.pm.pmTextNear
import com.glasskeep.app.nativeapp.data.pm.setHorizontalRule
import com.glasskeep.app.nativeapp.data.pm.setNode
import com.glasskeep.app.nativeapp.data.pm.setTextAlign
import com.glasskeep.app.nativeapp.data.pm.smartToggleCodeBlock
import com.glasskeep.app.nativeapp.data.pm.toggleList
import com.glasskeep.app.nativeapp.data.pm.toggleWrap
import com.glasskeep.app.nativeapp.data.pm.unsetAllMarks

/** A block command of the formatting bar, what RichTextToolbar.jsx's
 *  button runs. */
sealed interface RichCommand {
    /** The eraser: `clearNodes().unsetAllMarks()`. */
    data object ClearFormatting : RichCommand

    /** A list button: toggleBulletList, toggleOrderedList, toggleTaskList. */
    data class ToggleList(val kind: RichBlockKind) : RichCommand

    /** The style gallery: setParagraph, setHeading. */
    data class SetStyle(val kind: RichBlockKind) : RichCommand

    /** setTextAlign. */
    data class Align(val align: RichAlign) : RichCommand

    /** setHorizontalRule. */
    data object Divider : RichCommand

    /** indent() with a [direction] of 1, outdent() with -1. */
    data class Indent(val direction: Int) : RichCommand

    /** smartToggleCodeBlock. */
    data object CodeBlock : RichCommand

    /** toggleBlockquote. */
    data object Quote : RichCommand
}

/**
 * The formatting bar's block commands run as the web runs them: on the
 * note as the web's own document ([RichTree]), by the ported Tiptap and
 * ProseMirror commands (data/pm/PmCommands.kt), the selection following
 * their steps, then the Link extension's autolink over what they changed,
 * as after every edit there.
 */
object RichCommands {
    /** [command] run on [state]: the editor's next state, or null when
     *  nothing changes. The marks armed at the caret go when the document
     *  or the selection changes, as the stored marks do. */
    fun run(state: RichEditing, command: RichCommand): RichEditing? {
        val tree = RichTree(state.blocks)
        fun resolve(pos: RichPos): PmResolvedPos? {
            val index = state.blocks.indexOfFirst { it.id == pos.blockId }
            if (index < 0) return null
            return tree.doc.resolve(tree.position(index, pos.offset.coerceIn(0, state.blocks[index].textLength)))
        }
        val anchor = resolve(state.selection.anchor) ?: return null
        val head = resolve(state.selection.head) ?: return null
        val tr = PmTransaction(tree.doc, PmTextSelection(anchor, head))
        try {
            when (command) {
                RichCommand.ClearFormatting -> {
                    clearNodes(tr)
                    unsetAllMarks(tr)
                }
                is RichCommand.ToggleList -> when (command.kind) {
                    RichBlockKind.BULLET_ITEM -> toggleList(tr, PmSchema.bulletList, PmSchema.listItem)
                    RichBlockKind.NUMBERED_ITEM -> toggleList(tr, PmSchema.orderedList, PmSchema.listItem)
                    else -> toggleList(tr, PmSchema.taskList, PmSchema.taskItem)
                }
                is RichCommand.SetStyle -> when (val level = RichDoc.headingLevel(command.kind)) {
                    null -> setNode(tr, PmSchema.paragraph)
                    else -> setNode(tr, PmSchema.heading, mapOf("level" to level))
                }
                is RichCommand.Align -> setTextAlign(tr, command.align.name.lowercase())
                RichCommand.Divider -> setHorizontalRule(tr)
                is RichCommand.Indent -> indent(tr, command.direction)
                RichCommand.CodeBlock -> smartToggleCodeBlock(tr)
                RichCommand.Quote -> toggleWrap(tr, PmSchema.blockquote)
            }
        } catch (_: RuntimeException) {
            // What the web's own code throws on dispatches nothing there.
            return null
        }
        if (tr.steps.isEmpty() && !tr.selectionSet) return null
        val selection = tr.selection
        val (anchorAt, headAt) = if (selection is PmTextSelection) {
            selection.anchor.pos to selection.head.pos
        } else {
            // A selected node: the caret goes to the text it starts at.
            pmTextNear(selection.rFrom, 1).let { it to it }
        }
        val result = autolink(tree.doc, tr.doc, tr.steps)?.doc ?: tr.doc
        val next = tree.editing(result, anchorAt, headAt) ?: return null
        return if (next.blocks == state.blocks) next.copy(blocks = state.blocks) else next
    }
}
