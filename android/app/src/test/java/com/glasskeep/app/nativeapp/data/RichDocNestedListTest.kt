package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class RichDocNestedListTest {
    @Test
    fun structurallyNestedBulletListBecomesEditableIndentedBlocks() {
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
        assertEquals(listOf(0, 1), blocks.map { it.indent })
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
        assertEquals(listOf(0, 1), blocks.map { it.indent })
        assertEquals(listOf(RichBlockKind.TASK_ITEM, RichBlockKind.TASK_ITEM), blocks.map { it.kind })
    }

    @Test
    fun cardPreviewDoesNotExposeJsonWhenUnsupportedContentIsBelowVisibleBlocks() {
        val paragraphs = (1..8).joinToString(",") {
            """{"type":"paragraph","content":[{"type":"text","text":"Line $it"}]}"""
        }
        val content = """{"v":1,"format":"tiptap","doc":{"type":"doc","content":[$paragraphs,{"type":"table"}]}}"""

        val preview = requireNotNull(RichDoc.parsePreview(content, maxBlocks = 8))

        assertEquals((1..8).map { "Line $it" }, preview.map { it.text })
        assertEquals(null, RichDoc.parse(content))
    }

    private fun envelope(node: String): String =
        """{"v":1,"format":"tiptap","doc":{"type":"doc","content":[$node]}}"""
}
