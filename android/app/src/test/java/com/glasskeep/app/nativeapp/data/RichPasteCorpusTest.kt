package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pastes and copies recorded in the web editor (rich-paste/web-*.json).
 * A paste: the note, the selection (anchor then head), the clipboard, and
 * what the web left; replayed here, it must leave the same blocks, the same
 * selection and, at a caret, the same marks for what is typed next. A copy:
 * the note, the selection, and the clipboard's markup and text, which the
 * app's copy must match.
 */
class RichPasteCorpusTest {
    private class Case(json: JsonObject, val plain: Boolean) {
        val name = json.getValue("name").jsonPrimitive.content
        val doc = json.getValue("doc").jsonObject
        val from: Pair<Int, Int> = position(json.getValue("from"))
        val to: Pair<Int, Int> = position(json.getValue("to"))
        val html = (json["html"] as? JsonPrimitive)?.contentOrNull
        val text = json.getValue("text").jsonPrimitive.content
        val shift = (json["shift"] as? JsonPrimitive)?.booleanOrNull ?: false
        val expected = json.getValue("expected").jsonObject
        val anchor: Pair<Int, Int> = position(json.getValue("anchor"))
        val head: Pair<Int, Int> = position(json.getValue("head"))
        val typing = (json["typing"] as? JsonArray)?.map { it.jsonPrimitive.content }?.sorted()

        private fun position(value: JsonElement): Pair<Int, Int> = value.jsonArray.let { it[0].jsonPrimitive.int to it[1].jsonPrimitive.int }
    }

    private fun load(resource: String, plain: Boolean): List<Case> {
        val text = requireNotNull(javaClass.classLoader!!.getResource(resource)).readText()
        return (Json.parseToJsonElement(text) as JsonArray).map { Case(it.jsonObject, plain) }
    }

    private fun show(blocks: List<RichBlock>): String {
        val quoteIds = HashMap<String, Int>()
        val listIds = HashMap<String?, Int>()
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
                if (b.kind == RichBlockKind.TASK_ITEM) append(" checked=").append(b.checked)
                if (b.kind == RichBlockKind.CODE_BLOCK && b.language != null) append(" lang=").append(b.language)
                if (b.nestLevel != 0) append(" nest=").append(b.nestLevel)
                if (b.listStart != null) append(" start=").append(b.listStart)
                if (b.kind.isListItem) append(" list=l").append(listIds.getOrPut(b.listId) { listIds.size })
                if (quotes.isNotEmpty()) append(" quotes=").append(quotes)
            }
        }
    }

    @Test
    fun pastesAsTheWebEditorDoes() {
        val cases = load("rich-paste/web-rich.json", plain = false) + load("rich-paste/web-plain.json", plain = true) +
            load("rich-paste/web-links.json", plain = false) + load("rich-paste/web-links-plain.json", plain = true)
        val failures = mutableListOf<String>()
        var checked = 0
        for (case in cases) {
            val blocks = RichDoc.parseDocJson(case.doc) ?: error("${case.name}: the note does not parse")
            val selection = RichSelection(
                RichPos(blocks[case.from.first].id, case.from.second),
                RichPos(blocks[case.to.first].id, case.to.second),
            )
            val state = RichEditing(blocks, selection)
            val result = try {
                RichPaste.paste(state, case.text, case.html, case.plain, case.shift) ?: state
            } catch (e: Exception) {
                failures += "${case.name}: ${e.javaClass.simpleName} ${e.message}\n${e.stackTrace.take(6).joinToString("\n")}"
                continue
            }
            val expected = RichDoc.parseDocJson(RichTree.flatModel(case.expected).single())
                ?: error("${case.name}: the web's result does not parse")
            val got = show(result.blocks)
            val want = show(expected)
            fun at(pos: RichPos) = result.blocks.indexOfFirst { it.id == pos.blockId } to pos.offset
            val anchor = at(result.selection.anchor)
            val head = at(result.selection.head)
            val typing = if (result.selection.collapsed) typingMarks(result) else null
            if (got != want || anchor != case.anchor || head != case.head || typing != case.typing) {
                failures += "${case.name}\n--- web (${case.anchor}..${case.head}, typing ${case.typing}):\n$want\n" +
                    "--- app ($anchor..$head, typing $typing):\n$got"
            }
            checked++
        }
        if (failures.isNotEmpty()) {
            System.err.println("${failures.size} of $checked differ:\n" + failures.joinToString("\n\n"))
        }
        assertEquals(emptyList<String>(), failures.map { it.lineSequence().first() })
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

    /** The web's text walker glues a task list's items on one line; the app
     *  copies them one per line (RichClipboard.plainText). */
    private val GluedTaskItems = setOf("C07_tasks")

    @Test
    fun copiesTheWebEditorsMarkupAndText() {
        val text = requireNotNull(javaClass.classLoader!!.getResource("rich-paste/web-copy.json")).readText()
        val failures = mutableListOf<String>()
        for (element in Json.parseToJsonElement(text) as JsonArray) {
            val case = element.jsonObject
            val name = case.getValue("name").jsonPrimitive.content
            val blocks = RichDoc.parseDocJson(case.getValue("doc").jsonObject) ?: error("$name: the note does not parse")
            val (from, fromOffset) = case.getValue("from").jsonArray.map { it.jsonPrimitive.int }
            val (to, toOffset) = case.getValue("to").jsonArray.map { it.jsonPrimitive.int }
            val clip = RichClipboard.copy(blocks, RichSpan(from, fromOffset, to, toOffset))
            val want = case.getValue("html").jsonPrimitive.content
            if (clip.html != want) failures += "$name\n--- web:\n$want\n--- app:\n${clip.html}"
            val wantText = case.getValue("text").jsonPrimitive.content
            if (clip.text != wantText && name !in GluedTaskItems) failures += "$name text\n--- web:\n$wantText\n--- app:\n${clip.text}"
        }
        if (failures.isNotEmpty()) System.err.println(failures.joinToString("\n\n"))
        assertEquals(emptyList<String>(), failures.map { it.lineSequence().first() })
    }
}
