package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.pm.PmAttrs
import com.glasskeep.app.nativeapp.data.pm.PmMarkType
import com.glasskeep.app.nativeapp.data.pm.PmResolvedPos
import com.glasskeep.app.nativeapp.data.pm.PmSchema
import com.glasskeep.app.nativeapp.data.pm.PmTextSelection
import com.glasskeep.app.nativeapp.data.pm.PmTransaction
import com.glasskeep.app.nativeapp.data.pm.clearNodes
import com.glasskeep.app.nativeapp.data.pm.extendMarkRange
import com.glasskeep.app.nativeapp.data.pm.indent
import com.glasskeep.app.nativeapp.data.pm.pmTextNear
import com.glasskeep.app.nativeapp.data.pm.removeEmptyTextStyle
import com.glasskeep.app.nativeapp.data.pm.setHorizontalRule
import com.glasskeep.app.nativeapp.data.pm.setMark
import com.glasskeep.app.nativeapp.data.pm.setNode
import com.glasskeep.app.nativeapp.data.pm.setTextAlign
import com.glasskeep.app.nativeapp.data.pm.sinkListItem
import com.glasskeep.app.nativeapp.data.pm.smartToggleCodeBlock
import com.glasskeep.app.nativeapp.data.pm.toggleList
import com.glasskeep.app.nativeapp.data.pm.toggleWrap
import com.glasskeep.app.nativeapp.data.pm.unsetAllMarks
import com.glasskeep.app.nativeapp.data.pm.unsetMark

/** A command of the formatting bar, what a button of RichTextToolbar.jsx
 *  or LinkPopover.jsx runs, or a key of the list extensions' keymaps. */
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

    /** Tab in a list: sinkListItem for a list item, then for a task item. */
    data object SinkListItem : RichCommand

    /** smartToggleCodeBlock. */
    data object CodeBlock : RichCommand

    /** toggleBlockquote. */
    data object Quote : RichCommand

    /** setMark: a mark's button turning it on, an underline's style or
     *  colour, a highlight, a colour, a font or a size. */
    data class SetMark(val type: RichMarkType, val value: String? = null, val color: String? = null) : RichCommand

    /** unsetMark; for a colour, font or size, `setMark("textStyle", {...: null})`
     *  then removeEmptyTextStyle, as unsetColor, unsetFontFamily and
     *  unsetFontSize do. */
    data class UnsetMark(val type: RichMarkType) : RichCommand

    /** LinkPopover's apply: `extendMarkRange("link").setLink({ href })`.
     *  The address it hands over always has a scheme isAllowedUri takes. */
    data class SetLink(val href: String) : RichCommand

    /** LinkPopover's remove: `extendMarkRange("link").unsetLink()`. */
    data object UnsetLink : RichCommand
}

/**
 * The formatting bar's commands run as the web runs them: on the note as
 * the web's own document ([RichTree]) and the marks armed at the caret as
 * its stored marks, by the ported Tiptap and ProseMirror commands
 * (data/pm/PmCommands.kt), the selection following their steps, then the
 * Link extension's autolink over what they changed, as after every edit
 * there but a link's own.
 */
object RichCommands {
    /** [command] run on [state]: the editor's next state, or null when
     *  nothing changes. */
    fun run(state: RichEditing, command: RichCommand): RichEditing? {
        val tree = RichTree(state.blocks)
        fun resolve(pos: RichPos): PmResolvedPos? {
            val index = state.blocks.indexOfFirst { it.id == pos.blockId }
            if (index < 0) return null
            return tree.doc.resolve(tree.position(index, pos.offset.coerceIn(0, state.blocks[index].textLength)))
        }
        val anchor = resolve(state.selection.anchor) ?: return null
        val head = resolve(state.selection.head) ?: return null
        val tr = PmTransaction(tree.doc, PmTextSelection(anchor, head), storedMarks(state))
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
                RichCommand.SinkListItem -> sinkListItem(tr, PmSchema.listItem) || sinkListItem(tr, PmSchema.taskItem)
                RichCommand.CodeBlock -> smartToggleCodeBlock(tr)
                RichCommand.Quote -> toggleWrap(tr, PmSchema.blockquote)
                is RichCommand.SetMark -> {
                    val (type, attributes) = webMark(command.type, command.value, command.color)
                    setMark(tr, type, attributes)
                }
                is RichCommand.UnsetMark -> {
                    val (type, attributes) = webMark(command.type, null, null)
                    if (type === PmSchema.textStyle) {
                        setMark(tr, type, attributes)
                        removeEmptyTextStyle(tr)
                    } else {
                        unsetMark(tr, type)
                    }
                }
                is RichCommand.SetLink -> {
                    extendMarkRange(tr, PmSchema.link)
                    setMark(tr, PmSchema.link, mapOf("href" to command.href))
                }
                RichCommand.UnsetLink -> {
                    extendMarkRange(tr, PmSchema.link)
                    unsetMark(tr, PmSchema.link, extendEmptyMarkRange = true)
                }
            }
        } catch (_: RuntimeException) {
            // What the web's own code throws on dispatches nothing there.
            return null
        }
        if (tr.steps.isEmpty() && !tr.selectionSet) {
            // Only what is typed next changes: the keyboard's composition stays.
            return if (tr.storedMarksSet) state.copy(pendingMarks = pendingMarks(tr.storedMarks, state)) else null
        }
        val selection = tr.selection
        val (anchorAt, headAt) = if (selection is PmTextSelection) {
            selection.anchor.pos to selection.head.pos
        } else {
            // A selected node: the caret goes to the text it starts at.
            pmTextNear(selection.rFrom, 1).let { it to it }
        }
        // setLink and unsetLink turn autolink off (preventAutolink).
        val linked = if (command is RichCommand.SetLink || command == RichCommand.UnsetLink) null else autolink(tree.doc, tr.doc, tr.steps)
        val next = tree.editing(linked?.doc ?: tr.doc, anchorAt, headAt) ?: return null
        return next.copy(
            blocks = if (next.blocks == state.blocks) state.blocks else next.blocks,
            // Autolink's steps drop the stored marks too.
            pendingMarks = pendingMarks(tr.storedMarks.takeIf { linked == null }, next),
        )
    }

    /** The web's mark for [type], and the attributes its command sets for
     *  [value] and [color]. */
    private fun webMark(type: RichMarkType, value: String?, color: String?): Pair<PmMarkType, PmAttrs> = when (type) {
        RichMarkType.BOLD -> PmSchema.bold to emptyMap()
        RichMarkType.ITALIC -> PmSchema.italic to emptyMap()
        RichMarkType.STRIKE -> PmSchema.strike to emptyMap()
        RichMarkType.CODE -> PmSchema.code to emptyMap()
        RichMarkType.SUBSCRIPT -> PmSchema.subscript to emptyMap()
        RichMarkType.SUPERSCRIPT -> PmSchema.superscript to emptyMap()
        RichMarkType.UNDERLINE -> PmSchema.underline to mapOf("style" to value, "color" to color)
        RichMarkType.HIGHLIGHT -> PmSchema.highlight to mapOf("color" to value)
        RichMarkType.LINK -> PmSchema.link to mapOf("href" to value)
        RichMarkType.TEXT_COLOR -> PmSchema.textStyle to mapOf("color" to value)
        RichMarkType.FONT_FAMILY -> PmSchema.textStyle to mapOf("fontFamily" to value)
        RichMarkType.FONT_SIZE -> PmSchema.textStyle to mapOf("fontSize" to value)
    }
}
