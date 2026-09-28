package com.glasskeep.app.nativeapp.ui

import com.glasskeep.app.nativeapp.data.RichAlign
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichCommand
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichEditing
import com.glasskeep.app.nativeapp.data.RichEdits
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.RichTree
import com.glasskeep.app.nativeapp.data.RichPos
import com.glasskeep.app.nativeapp.data.RichSelection
import com.glasskeep.app.nativeapp.data.RichTyping
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The formatting bar's commands, recorded in the web editor
 * (rich-commands/web-commands.json): a note, a selection (anchor then
 * head) and what the bar shows for it, then each button as
 * RichTextToolbar.jsx runs it, and what the web left. Replayed through the
 * app's own bar logic, each must leave the same blocks, the same selection,
 * at a caret the same marks for what is typed next, and the bar showing the
 * same.
 */
class RichCommandCorpusTest {
    private fun position(value: JsonElement): Pair<Int, Int> = value.jsonArray.let { it[0].jsonPrimitive.int to it[1].jsonPrimitive.int }

    private fun show(blocks: List<RichBlock>): String {
        val quoteIds = HashMap<String, Int>()
        return blocks.joinToString("\n") { b ->
            val quotes = b.quotes.joinToString(",") { "q${quoteIds.getOrPut(it.id) { quoteIds.size }}:${it.indent}" }
            val marks = b.marks.sortedWith(compareBy({ it.start }, { it.end }, { it.type.ordinal })).joinToString(",") {
                "${it.type}[${it.start},${it.end}]" + (it.value?.let { v -> "=$v" } ?: "") + (it.color?.let { c -> "/$c" } ?: "")
            }
            buildString {
                append(b.kind).append(' ').append(JsonPrimitive(b.text).toString())
                if (marks.isNotEmpty()) append(" {").append(marks).append('}')
                if (b.align != RichAlign.LEFT) append(" align=").append(b.align)
                if (b.indent != 0) append(" indent=").append(b.indent)
                if (b.lineIndent != 0) append(" lineIndent=").append(b.lineIndent)
                if (b.kind == RichBlockKind.TASK_ITEM) append(" checked=").append(b.checked)
                if (b.kind == RichBlockKind.CODE_BLOCK && b.language != null) append(" lang=").append(b.language)
                if (b.nestLevel != 0) append(" nest=").append(b.nestLevel)
                if (b.listStart != null) append(" start=").append(b.listStart)
                if (quotes.isNotEmpty()) append(" quotes=").append(quotes)
            }
        }
    }

    /** What RichFormatToolbar's button for [cmd] does. */
    private fun press(state: RichEditorState, cmd: String) {
        fun indent(delta: Int) {
            val editing = requireNotNull(state.editing)
            val span = editing.span ?: return
            if (RichEdits.canShiftIndent(editing.blocks, span, delta)) state.blockCommand(RichCommand.Indent(delta))
        }
        when (cmd) {
            "bold" -> state.toggleMark(RichMarkType.BOLD)
            "italic" -> state.toggleMark(RichMarkType.ITALIC)
            "strike" -> state.toggleMark(RichMarkType.STRIKE)
            "code" -> state.toggleMark(RichMarkType.CODE)
            "sub" -> state.toggleMark(RichMarkType.SUBSCRIPT)
            "sup" -> state.toggleMark(RichMarkType.SUPERSCRIPT)
            "underline" -> state.toggleUnderline()
            "ulDouble" -> state.applyMark(RichMarkType.UNDERLINE, "double", state.underlineColor())
            "ulColor" -> state.applyMark(RichMarkType.UNDERLINE, state.markValue(RichMarkType.UNDERLINE) ?: "simple", "#ef4444")
            "ulColorClear" -> state.applyMark(RichMarkType.UNDERLINE, state.markValue(RichMarkType.UNDERLINE) ?: "simple", null)
            "ulRemove" -> state.clearMark(RichMarkType.UNDERLINE)
            "color" -> state.applyMark(RichMarkType.TEXT_COLOR, "#ef4444")
            "colorClear" -> state.clearMark(RichMarkType.TEXT_COLOR)
            "hl" -> state.applyMark(RichMarkType.HIGHLIGHT, "var(--rt-hl-2)")
            "hlClear" -> state.clearMark(RichMarkType.HIGHLIGHT)
            "size20" -> state.applyMark(RichMarkType.FONT_SIZE, "20px")
            "sizeDefault" -> state.clearMark(RichMarkType.FONT_SIZE)
            "sizeUp" -> state.stepFontSize(1)
            "sizeDown" -> state.stepFontSize(-1)
            "family" -> state.applyMark(RichMarkType.FONT_FAMILY, "Inter, sans-serif")
            "familyClear" -> state.clearMark(RichMarkType.FONT_FAMILY)
            "clear" -> state.blockCommand(RichCommand.ClearFormatting)
            "bullet" -> state.blockCommand(RichCommand.ToggleList(RichBlockKind.BULLET_ITEM))
            "ordered" -> state.blockCommand(RichCommand.ToggleList(RichBlockKind.NUMBERED_ITEM))
            "task" -> state.blockCommand(RichCommand.ToggleList(RichBlockKind.TASK_ITEM))
            "alignLeft" -> state.blockCommand(RichCommand.Align(RichAlign.LEFT))
            "alignCenter" -> state.blockCommand(RichCommand.Align(RichAlign.CENTER))
            "alignRight" -> state.blockCommand(RichCommand.Align(RichAlign.RIGHT))
            "alignJustify" -> state.blockCommand(RichCommand.Align(RichAlign.JUSTIFY))
            "hr" -> state.blockCommand(RichCommand.Divider)
            "indent" -> indent(1)
            "outdent" -> indent(-1)
            "codeBlock" -> state.blockCommand(RichCommand.CodeBlock)
            "quote" -> state.blockCommand(RichCommand.Quote)
            "paragraph" -> state.blockCommand(RichCommand.SetStyle(RichBlockKind.PARAGRAPH))
            "h1" -> state.blockCommand(RichCommand.SetStyle(RichBlockKind.HEADING_1))
            "h3" -> state.blockCommand(RichCommand.SetStyle(RichBlockKind.HEADING_3))
            else -> error("unknown command $cmd")
        }
    }

    /** What the bar shows, as the web's recording names it: the buttons lit
     *  and the values shown, defaults left out. */
    private fun display(state: RichEditorState): Map<String, Any> = buildMap {
        fun flag(name: String, on: Boolean) {
            if (on) put(name, true)
        }
        fun value(name: String, value: String?) {
            if (value != null) put(name, value)
        }
        flag("bold", state.isMarkActive(RichMarkType.BOLD))
        flag("italic", state.isMarkActive(RichMarkType.ITALIC))
        flag("underline", state.isMarkActive(RichMarkType.UNDERLINE))
        flag("strike", state.isMarkActive(RichMarkType.STRIKE))
        flag("code", state.isMarkActive(RichMarkType.CODE))
        flag("sub", state.isMarkActive(RichMarkType.SUBSCRIPT))
        flag("sup", state.isMarkActive(RichMarkType.SUPERSCRIPT))
        flag("link", state.isMarkActive(RichMarkType.LINK))
        value("color", state.markValue(RichMarkType.TEXT_COLOR))
        value("size", state.markValue(RichMarkType.FONT_SIZE))
        value("family", state.markValue(RichMarkType.FONT_FAMILY))
        value("highlight", state.markValue(RichMarkType.HIGHLIGHT))
        value("ulStyle", state.markValue(RichMarkType.UNDERLINE))
        value("ulColor", state.underlineColor())
        val lists = state.listKinds()
        flag("bullet", RichBlockKind.BULLET_ITEM in lists)
        flag("ordered", RichBlockKind.NUMBERED_ITEM in lists)
        flag("task", RichBlockKind.TASK_ITEM in lists)
        flag("codeBlock", state.nodeActive { it.kind == RichBlockKind.CODE_BLOCK })
        flag("quote", state.quoted())
        state.headingShown()?.let { put("style", "h" + RichDoc.headingLevel(it)) }
        flag("center", state.alignActive(RichAlign.CENTER))
        flag("right", state.alignActive(RichAlign.RIGHT))
        flag("justify", state.alignActive(RichAlign.JUSTIFY))
        flag("canIndent", state.canIndent(1))
        flag("canOutdent", state.canIndent(-1))
    }

    private fun recorded(value: JsonElement): Map<String, Any> = value.jsonObject.mapValues { (_, v) ->
        v.jsonPrimitive.let { it.booleanOrNull ?: it.content }
    }

    /** The web's names of the marks what is typed at the caret takes. */
    private fun typingMarks(state: RichEditing): List<String> {
        val head = state.selection.head
        val block = state.blocks.first { it.id == head.blockId }
        return RichTyping.typingMarks(block, head.offset, state.pendingMarks).map {
            when (it.type) {
                RichMarkType.TEXT_COLOR, RichMarkType.FONT_FAMILY, RichMarkType.FONT_SIZE -> "textStyle"
                else -> it.type.name.lowercase()
            }
        }.distinct().sorted()
    }

    @Test
    fun formatsAsTheWebEditorDoes() {
        val text = requireNotNull(javaClass.classLoader!!.getResource("rich-commands/web-commands.json")).readText()
        val failures = mutableListOf<String>()
        var checked = 0
        for (element in Json.parseToJsonElement(text) as JsonArray) {
            val group = element.jsonObject
            val name = group.getValue("name").jsonPrimitive.content
            val from = position(group.getValue("from"))
            val to = position(group.getValue("to"))
            fun selected(): RichEditorState {
                val blocks = RichDoc.parseDocJson(group.getValue("doc").jsonObject) ?: error("$name: the note does not parse")
                return RichEditorState().apply {
                    sync(blocks)
                    select(RichSelection(RichPos(blocks[from.first].id, from.second), RichPos(blocks[to.first].id, to.second)))
                }
            }
            val shown = recorded(group.getValue("display"))
            val before = display(selected())
            if (before != shown) failures += "$name shown\n--- web: $shown\n--- app: $before"
            for (runElement in group.getValue("runs").jsonArray) {
                val run = runElement.jsonObject
                val cmd = run.getValue("cmd").jsonPrimitive.content
                val label = "$name.$cmd"
                val state = selected()
                val result = try {
                    press(state, cmd)
                    // NoteDetailScreen's TrailingNode, once the command landed.
                    val pressed = requireNotNull(state.editing).blocks
                    if (RichEdits.needsTrailingParagraph(pressed)) state.sync(pressed + RichDoc.newBlock())
                    requireNotNull(state.editing)
                } catch (e: Exception) {
                    failures += "$label: ${e.javaClass.simpleName} ${e.message}\n${e.stackTrace.take(6).joinToString("\n")}"
                    continue
                }
                val expected = RichDoc.parseDocJson(RichTree.flatModel(run.getValue("expected").jsonObject).single())
                    ?: error("$label: the web's result does not parse")
                val wantAnchor = position(run.getValue("anchor"))
                val wantHead = position(run.getValue("head"))
                val wantTyping = (run["typing"] as? JsonArray)?.map { it.jsonPrimitive.content }?.sorted()
                val got = show(result.blocks)
                val want = show(expected)
                fun at(pos: RichPos) = result.blocks.indexOfFirst { it.id == pos.blockId } to pos.offset
                val anchor = at(result.selection.anchor)
                val head = at(result.selection.head)
                val typing = if (result.selection.collapsed) typingMarks(result) else null
                if (got != want || anchor != wantAnchor || head != wantHead || typing != wantTyping) {
                    failures += "$label\n--- web ($wantAnchor..$wantHead, typing $wantTyping):\n$want\n" +
                        "--- app ($anchor..$head, typing $typing):\n$got"
                }
                val wantShown = recorded(run.getValue("display"))
                val gotShown = display(state)
                if (gotShown != wantShown) failures += "$label shown\n--- web: $wantShown\n--- app: $gotShown"
                checked++
            }
        }
        if (failures.isNotEmpty()) {
            System.err.println("${failures.size} of $checked differ:\n" + failures.joinToString("\n\n"))
        }
        assertEquals(emptyList<String>(), failures.map { it.lineSequence().first() })
    }
}
