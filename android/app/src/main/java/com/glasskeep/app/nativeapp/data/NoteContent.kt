package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/**
 * Kotlin port of the parts of src/utils/richText.js the native note editor
 * needs. Text notes are stored either as a raw legacy string, or as a
 * versioned Tiptap/ProseMirror JSON envelope:
 *
 *     { "v": 1, "format": "tiptap", "doc": { "type": "doc", "content": [...] } }
 *
 * The native app has no rich-text editor yet (see the migration report:
 * it's the single hardest piece of this whole rewrite), so it must never
 * write back a doc that had real formatting, marks, headings, lists,
 * anything beyond plain paragraphs, or that formatting is gone for good.
 * [isDocPlainStructure] is the gate that decides whether native editing is
 * safe for a given note; when it says no, the detail screen shows the text
 * read-only instead of guessing.
 */
object NoteContent {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Parses `content` as a rich envelope and returns its `doc`, or null
     *  if it's legacy plain text (anything that isn't our envelope). */
    fun parseRichDoc(content: String?): JsonObject? {
        if (content.isNullOrBlank()) return null
        if (!content.trimStart().startsWith("{")) return null
        return try {
            val root = json.parseToJsonElement(content) as? JsonObject ?: return null
            val format = (root["format"] as? JsonPrimitive)?.contentOrNull
            val doc = root["doc"] as? JsonObject ?: return null
            val docType = (doc["type"] as? JsonPrimitive)?.contentOrNull
            if (format == "tiptap" && docType == "doc") doc else null
        } catch (_: Exception) {
            null
        }
    }

    /** True only when every node in the doc is a plain paragraph/text/
     *  hardBreak, with no marks (bold, color, ...) and no node attrs
     *  (alignment, indent, ...). Anything else, headings, lists, code
     *  blocks, a single bold word, means "don't touch this natively yet". */
    fun isDocPlainStructure(doc: JsonObject): Boolean = isNodePlain(doc)

    private fun isNodePlain(node: JsonElement): Boolean {
        val obj = node as? JsonObject ?: return false
        val type = (obj["type"] as? JsonPrimitive)?.contentOrNull ?: return false
        if (type != "doc" && type != "paragraph" && type != "text" && type != "hardBreak") return false
        val marks = obj["marks"] as? JsonArray
        if (marks != null && marks.isNotEmpty()) return false
        val attrs = obj["attrs"] as? JsonObject
        if (attrs != null && attrs.isNotEmpty()) return false
        val content = obj["content"] as? JsonArray
        if (content != null) {
            for (child in content) if (!isNodePlain(child)) return false
        }
        return true
    }

    /** Plain-text rendering of a doc, for display and as the editable seed
     *  text. Mirrors richDocToPlain() in richText.js: paragraphs/headings/
     *  list items/blockquotes/code blocks each end in a newline. */
    fun docToPlainText(doc: JsonObject): String {
        val out = StringBuilder()
        walkPlain(doc, out)
        return out.toString().replace(Regex("\n{3,}"), "\n\n").trim()
    }

    private val BLOCK_TYPES =
        setOf("paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock")

    private fun walkPlain(node: JsonElement, out: StringBuilder) {
        val obj = node as? JsonObject ?: return
        val type = (obj["type"] as? JsonPrimitive)?.contentOrNull
        if (type == "text") {
            out.append((obj["text"] as? JsonPrimitive)?.contentOrNull.orEmpty())
            return
        }
        if (type == "hardBreak") {
            out.append("\n")
            return
        }
        val content = obj["content"] as? JsonArray ?: return
        for (child in content) walkPlain(child, out)
        if (type in BLOCK_TYPES) out.append("\n")
    }

    /** Wraps plain text back into a rich envelope, ready to send as
     *  `content`. Only ever called on text that came from
     *  [isDocPlainStructure]-approved docs, so there is no formatting to
     *  lose: single "\n" becomes a hardBreak, a blank line starts a new
     *  paragraph, matching plainTextToRichDoc() in richText.js exactly. */
    fun plainTextToRichContent(text: String): String {
        val blocks = text.split(Regex("\n\\s*\n"))
        val paragraphs = buildList {
            for ((blockIndex, block) in blocks.withIndex()) {
                val lines = block.split("\n")
                val inline = buildList {
                    for ((lineIndex, line) in lines.withIndex()) {
                        if (line.isNotEmpty()) {
                            add(buildJsonObject { put("type", "text"); put("text", line) })
                        }
                        if (lineIndex < lines.lastIndex) add(buildJsonObject { put("type", "hardBreak") })
                    }
                }
                add(
                    if (inline.isNotEmpty()) {
                        buildJsonObject {
                            put("type", "paragraph")
                            put("content", JsonArray(inline))
                        }
                    } else {
                        buildJsonObject { put("type", "paragraph") }
                    },
                )
                if (blockIndex < blocks.lastIndex) add(buildJsonObject { put("type", "paragraph") })
            }
        }
        val doc = buildJsonObject {
            put("type", "doc")
            put("content", JsonArray(paragraphs.ifEmpty { listOf(buildJsonObject { put("type", "paragraph") }) }))
        }
        val envelope = buildJsonObject {
            put("v", 1)
            put("format", "tiptap")
            put("doc", doc)
        }
        return envelope.toString()
    }
}
