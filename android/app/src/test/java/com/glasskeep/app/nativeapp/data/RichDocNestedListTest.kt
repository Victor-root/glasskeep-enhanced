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
    fun listStyleTheEditorCannotKeepLeavesTheNoteReadOnly() {
        val content = envelope(
            """{"type":"orderedList","attrs":{"start":1,"type":"a"},"content":[
                {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Alpha"}]}]}
            ]}""",
        )

        assertEquals(null, RichDoc.parse(content))
    }

    private fun envelope(node: String): String =
        """{"v":1,"format":"tiptap","doc":{"type":"doc","content":[$node]}}"""
}
