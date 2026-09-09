package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.TokenStore
import com.glasskeep.app.nativeapp.data.TypographyPresets
import com.glasskeep.app.nativeapp.data.TypographyPresetsDto
import kotlinx.serialization.json.Json

/**
 * How the rich-text editor looks and behaves for this user, live for as
 * long as this container's Activity is running. Same two-tier design as
 * [ThemeState]: each value starts from TokenStore's cached copy so the
 * editor is right from the first frame, and NativeNavHost then reconciles
 * it against the server's own settings blob once per session.
 *
 * [taskStrike] is the exception, and deliberately so: on the web it is a
 * per-device reading preference in localStorage, never synced to the
 * account (see theme/taskListStrike.js), so it only ever lives in the
 * local cache here too.
 */
class EditorPrefsState(private val tokenStore: TokenStore) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    var typography: TypographyPresets by mutableStateOf(readCachedTypography())
        private set

    var toolbarMode: String by mutableStateOf(tokenStore.editorToolbarMode ?: "simple")
        private set

    var taskStrike: Boolean by mutableStateOf(tokenStore.taskStrikeChecked)
        private set

    var readModeEnabled: Boolean by mutableStateOf(tokenStore.readModeEnabled)
        private set

    var toastPosition: String by mutableStateOf(tokenStore.toastPosition ?: "bottom")
        private set

    /** null means "stays until dismissed"; the cache stores that as -1. */
    var toastDurationMs: Long? by mutableStateOf(tokenStore.toastDurationMs.takeIf { it > 0 })
        private set

    fun applyTypography(presets: TypographyPresets) {
        typography = presets
        tokenStore.typographyPresetsJson = try {
            json.encodeToString(TypographyPresetsDto.serializer(), presets.toDto())
        } catch (t: Throwable) {
            NativeDebug.e("EditorPrefsState: caching typography failed", t)
            null
        }
    }

    fun applyToolbarMode(mode: String) {
        val resolved = if (mode == "advanced") "advanced" else "simple"
        toolbarMode = resolved
        tokenStore.editorToolbarMode = resolved
    }

    fun applyTaskStrike(on: Boolean) {
        taskStrike = on
        tokenStore.taskStrikeChecked = on
    }

    fun applyReadMode(enabled: Boolean) {
        readModeEnabled = enabled
        tokenStore.readModeEnabled = enabled
    }

    fun applyToastPosition(position: String) {
        val resolved = if (position == "top") "top" else "bottom"
        toastPosition = resolved
        tokenStore.toastPosition = resolved
    }

    fun applyToastDuration(durationMs: Long?) {
        toastDurationMs = durationMs
        tokenStore.toastDurationMs = durationMs ?: -1L
    }

    private fun readCachedTypography(): TypographyPresets {
        val raw = tokenStore.typographyPresetsJson ?: return TypographyPresets.DEFAULT
        return try {
            TypographyPresets.normalize(json.decodeFromString(TypographyPresetsDto.serializer(), raw))
        } catch (t: Throwable) {
            NativeDebug.e("EditorPrefsState: cached typography unreadable, using defaults", t)
            TypographyPresets.DEFAULT
        }
    }
}
