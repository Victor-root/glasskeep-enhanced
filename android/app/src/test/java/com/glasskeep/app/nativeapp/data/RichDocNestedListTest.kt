package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class RichDocNestedListTest {
    @Test
    fun structurallyNestedBulletListBecomesEditableNestedBlocks() {
        val content = envelope(
            """{"type":"bulletList","content":[
                {"type":"listItem","content":[
                    {"type":"paragraph","content":[{"type":"text","text":"Parent"}]},
                    {"type":"bulletList","content":[
                        {"type":"listItem","content":[
                            {"type":"paragraph","content":[{"type":"text","text":"Child"}]}
                        ]}
                    ]}
                ]}
            ]}""",
        )

        val blocks = requireNotNull(RichDoc.parse(content))

        assertEquals(listOf("Parent", "Child"), blocks.map { it.text })
        assertEquals(listOf(0, 1), blocks.map { it.nestLevel })
        assertEquals(listOf(RichBlockKind.BULLET_ITEM, RichBlockKind.BULLET_ITEM), blocks.map { it.kind })
        assertNotNull(RichDoc.parse(RichDoc.encode(blocks)))
    }

    @Test
    fun aListItemsParagraphKeepsItsOwnIndent() {
        // An item holding a paragraph indented twice, what the web leaves
        // once an indented paragraph goes into a list.
        val content = envelope(
            """{"type":"bulletList","content":[
                {"type":"listItem","attrs":{"indent":1},"content":[
                    {"type":"paragraph","attrs":{"indent":2},"content":[{"type":"text","text":"moved"}]}
                ]}
            ]}""",
        )

        val blocks = requireNotNull(RichDoc.parse(content))

        assertEquals(1, blocks.single().indent)
        assertEquals(2, blocks.single().lineIndent)
        assertEquals(
            blocks.map { it.copy(id = "", listId = null) },
            requireNotNull(RichDoc.parse(RichDoc.encode(blocks))).map { it.copy(id = "", listId = null) },
        )
        // Enter passes it on to the next item, out of the list the
        // paragraph takes it back.
        assertEquals(listOf(2, 2), requireNotNull(RichEdits.split(blocks, blocks.single().id, 2)).blocks.map { it.lineIndent })
        val lifted = requireNotNull(RichEdits.joinBackward(blocks, blocks.single().id)).blocks.single()
        assertEquals(RichBlockKind.PARAGRAPH to 2, lifted.kind to lifted.indent)
        // "- " typed in an indented paragraph: the item takes no indent.
        val paragraph = RichDoc.newBlock().copy(text = "- x", indent = 2)
        val wrapped = requireNotNull(RichInputRules.typed(listOf(paragraph), paragraph.id, "- x", emptyList(), 2, " ")).edit.blocks.single()
        assertEquals(listOf(RichBlockKind.BULLET_ITEM, 0, 2), listOf(wrapped.kind, wrapped.indent, wrapped.lineIndent))
    }

    @Test
    fun nestedTaskListKeepsCheckedStateAndDepth() {
        val content = envelope(
            """{"type":"taskList","content":[
                {"type":"taskItem","attrs":{"checked":true},"content":[
                    {"type":"paragraph","content":[{"type":"text","text":"Parent"}]},
                    {"type":"taskList","content":[
                        {"type":"taskItem","attrs":{"checked":false},"content":[
                            {"type":"paragraph","content":[{"type":"text","text":"Child"}]}
                        ]}
                    ]}
                ]}
            ]}""",
        )

        val blocks = requireNotNull(RichDoc.parse(content))

        assertEquals(listOf(true, false), blocks.map { it.checked })
        assertEquals(listOf(0, 1), blocks.map { it.nestLevel })
        assertEquals(listOf(RichBlockKind.TASK_ITEM, RichBlockKind.TASK_ITEM), blocks.map { it.kind })
    }

    @Test
    fun cardPreviewDoesNotExposeJsonWhenUnsupportedContentIsBelowVisibleBlocks() {
        val paragraphs = (1..8).joinToString(",") {
            """{"type":"paragraph","content":[{"type":"text","text":"Line $it"}]}"""
        }
        val content = """{"v":1,"format":"tiptap","doc":{"type":"doc","content":[$paragraphs,{"type":"table"}]}}"""

        val preview = requireNotNull(RichDoc.parsePreview(content, maxNodes = 8))

        assertEquals((1..8).map { "Line $it" }, preview.map { it.text })
        assertEquals(null, RichDoc.parse(content))
    }

    @Test
    fun numberedListSavedByTheWebEditorStaysEditable() {
        // What Tiptap 3 writes for "3. " typed on the web: every attribute
        // of the schema, `type` included though no list style was chosen.
        val content = envelope(
            """{"type":"orderedList","attrs":{"start":3,"type":null},"content":[
                {"type":"listItem","attrs":{"indent":0},"content":[
                    {"type":"paragraph","attrs":{"textAlign":null,"indent":0},"content":[{"type":"text","text":"Trois"}]}
                ]}
            ]}""",
        )

        val blocks = requireNotNull(RichDoc.parse(content))

        assertEquals(listOf("Trois"), blocks.map { it.text })
        assertEquals(listOf(RichBlockKind.NUMBERED_ITEM), blocks.map { it.kind })
    }

    @Test
    fun aListStyleStaysEditableAndIsNotKept() {
        // Pasted from a word processor: the web draws its own numbers over it.
        val content = envelope(
            """{"type":"orderedList","attrs":{"start":1,"type":"a"},"content":[
                {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Alpha"}]}]}
            ]}""",
        )

        val blocks = requireNotNull(RichDoc.parse(content))

        assertEquals(listOf("Alpha"), blocks.map { it.text })
        assertEquals(false, RichDoc.encode(blocks).contains("\"type\":\"a\""))
    }

    private fun envelope(node: String): String =
        """{"v":1,"format":"tiptap","doc":{"type":"doc","content":[$node]}}"""
}
