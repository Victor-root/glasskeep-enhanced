package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaContentEncodingTest {
    @Test
    fun audioEncodeWritesEveryFieldTheWebWrites() {
        val clip = AudioClipDto(id = "a", audioDataUrl = "data:audio/webm;base64,AAA", mimeType = "audio/webm")

        assertEquals(
            """{"version":2,"clips":[{"id":"a","name":"","audioDataUrl":"data:audio/webm;base64,AAA","mimeType":"audio/webm","duration":null,"size":null,"createdAt":null}],"text":""}""",
            AudioContent.encode(listOf(clip), ""),
        )
    }

    @Test
    fun audioParseReadsContentWrittenWithoutTheDefaults() {
        val clips = AudioContent.parse(
            """{"clips":[{"id":"a","audioDataUrl":"data:audio/webm;base64,AAA"}]}""",
        ).clips

        assertEquals("", clips.single().name)
        assertEquals("audio/webm", clips.single().mimeType)
        assertNull(clips.single().duration)
    }

    @Test
    fun drawingEncodeWritesTheToolAndCaptionTheWebWrites() {
        val stroke = DrawingStrokeDto(color = "#000000", size = 3f, points = listOf(DrawingPointDto(1f, 2f)))
        val dimensions = DrawingDimensionsDto(width = 100f, height = 200f, originalHeight = 200f)

        assertEquals(
            """{"paths":[{"tool":"pen","color":"#000000","size":3.0,"points":[{"x":1.0,"y":2.0}]}],"dimensions":{"width":100.0,"height":200.0,"originalHeight":200.0},"text":""}""",
            DrawingContent.encode(listOf(stroke), dimensions, ""),
        )
    }

    @Test
    fun drawingParseReadsLegacyStrokesWithoutATool() {
        val drawing = DrawingContent.parse("""[{"color":"#000000","size":2,"points":[{"x":1,"y":2}]}]""")

        assertEquals("pen", drawing?.paths?.single()?.tool)
    }
}
