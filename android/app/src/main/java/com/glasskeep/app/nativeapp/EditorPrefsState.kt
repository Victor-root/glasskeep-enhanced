package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.NotifCategory
import com.glasskeep.app.nativeapp.data.NotifCategoryFlags
import com.glasskeep.app.nativeapp.data.TokenStore
import com.glasskeep.app.nativeapp.data.TypographyPresets
import com.glasskeep.app.nativeapp.data.TypographyPresetsDto
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

private val FlagMapSerializer = MapSerializer(String.serializer(), Boolean.serializer())

/**
 * How the editor and the app's own messages look and behave for this
 * user, live for as long as this container's Activity is running. Same
 * two-tier design as [ThemeState]: each value starts from TokenStore's
 * cached copy so everything is right from the first frame, and
 * NativeNavHost then reconciles it against the server's own settings blob
 * once per session.
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

    var notificationsSound: Boolean by mutableStateOf(tokenStore.notificationsSound)
        private set

    var notificationsSoundTypes: NotifCategoryFlags by mutableStateOf(
        readCachedFlags(tokenStore.notificationsSoundTypesJson),
    )
        private set

    var notificationsFilterTypes: NotifCategoryFlags by mutableStateOf(
        readCachedFlags(tokenStore.notificationsFilterTypesJson),
    )
        private set

    fun applyNotificationsSound(on: Boolean) {
        notificationsSound = on
        tokenStore.notificationsSound = on
    }

    fun applyNotificationsSoundTypes(flags: NotifCategoryFlags) {
        notificationsSoundTypes = flags
        tokenStore.notificationsSoundTypesJson = encodeFlags(flags)
    }

    fun applyNotificationsFilterTypes(flags: NotifCategoryFlags) {
        notificationsFilterTypes = flags
        tokenStore.notificationsFilterTypesJson = encodeFlags(flags)
    }

    /** True when a message of this category should be shown at all, and
     *  true when it should also ring. Both read "absent means on", the
     *  web's own `types?.[key] !== false`. */
    fun allowsNotification(category: NotifCategory): Boolean = notificationsFilterTypes[category]

    fun ringsFor(category: NotifCategory): Boolean =
        notificationsSound && notificationsSoundTypes[category]

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

    private fun readCachedFlags(raw: String?): NotifCategoryFlags {
        if (raw == null) return NotifCategoryFlags.ALL_ON
        return try {
            NotifCategoryFlags(json.decodeFromString(FlagMapSerializer, raw))
        } catch (t: Throwable) {
            NativeDebug.e("EditorPrefsState: cached notification categories unreadable", t)
            NotifCategoryFlags.ALL_ON
        }
    }

    private fun encodeFlags(flags: NotifCategoryFlags): String? = try {
        json.encodeToString(FlagMapSerializer, flags.values)
    } catch (t: Throwable) {
        NativeDebug.e("EditorPrefsState: caching notification categories failed", t)
        null
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
