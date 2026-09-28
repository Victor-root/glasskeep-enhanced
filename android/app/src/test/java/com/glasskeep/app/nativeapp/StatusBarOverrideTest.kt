package com.glasskeep.app.nativeapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StatusBarOverrideTest {
    private val override = StatusBarOverride()

    private fun claim(argb: Int?) = StatusBarOverride.Claim().also {
        it.argb = argb
        override.add(it)
    }

    @Test
    fun `no claim leaves the theme's colour`() {
        assertNull(override.argb)
    }

    @Test
    fun `a note opened over another takes the bars, and keeps them once the first goes`() {
        val first = claim(1)
        claim(2)
        assertEquals(2, override.argb)
        override.remove(first)
        assertEquals(2, override.argb)
    }

    @Test
    fun `the note left takes the bars back once the one over it goes`() {
        claim(1)
        val second = claim(2)
        override.remove(second)
        assertEquals(1, override.argb)
    }

    @Test
    fun `a claim without a colour leaves the bars to the one under it`() {
        claim(1)
        val growing = claim(null)
        assertEquals(1, override.argb)
        growing.argb = 2
        assertEquals(2, override.argb)
    }
}
