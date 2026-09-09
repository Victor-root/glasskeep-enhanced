package com.glasskeep.app.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReminderSessionTest {
    private val legacy = ReminderSession(
        serverUrl = "https://old.example.com",
        token = "legacy-token",
        urlVetted = false,
    )

    @Test
    fun `native session takes precedence over the WebView session`() {
        assertEquals(
            ReminderSession("https://new.example.com", "native-token", urlVetted = true),
            selectReminderSession(
                nativeServerUrl = "https://new.example.com/",
                nativeToken = "native-token",
                legacySession = legacy,
            ),
        )
    }

    @Test
    fun `native sign out never revives the WebView token`() {
        assertNull(
            selectReminderSession(
                nativeServerUrl = "https://new.example.com",
                nativeToken = null,
                legacySession = legacy,
            ),
        )
    }

    @Test
    fun `partial native state never falls back to the WebView token`() {
        assertNull(
            selectReminderSession(
                nativeServerUrl = null,
                nativeToken = "native-token",
                legacySession = legacy,
            ),
        )
    }

    @Test
    fun `WebView session bridges upgrades before the first native login`() {
        assertEquals(
            legacy,
            selectReminderSession(
                nativeServerUrl = null,
                nativeToken = null,
                legacySession = legacy,
            ),
        )
    }
}
