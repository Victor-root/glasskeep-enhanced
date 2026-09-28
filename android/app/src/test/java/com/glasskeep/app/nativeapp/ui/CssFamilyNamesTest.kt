package com.glasskeep.app.nativeapp.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class CssFamilyNamesTest {
    @Test
    fun `a list's names come out unquoted and in order`() {
        assertEquals(listOf("JetBrains Mono", "monospace"), cssFamilyNames("\"JetBrains Mono\", monospace"))
        assertEquals(listOf("Lobster", "cursive"), cssFamilyNames("Lobster, cursive"))
    }

    @Test
    fun `a comma inside quotes stays in its name`() {
        assertEquals(listOf("A, B", "serif"), cssFamilyNames("'A, B',serif"))
    }

    @Test
    fun `an unquoted name's spaces collapse and empty entries go`() {
        assertEquals(listOf("Times New Roman", "serif"), cssFamilyNames("  Times   New Roman , , serif "))
        assertEquals(emptyList<String>(), cssFamilyNames(""))
    }
}
