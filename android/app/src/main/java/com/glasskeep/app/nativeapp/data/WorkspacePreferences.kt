package com.glasskeep.app.nativeapp.data

/**
 * The account-wide preferences every screen reads at startup, fetched in
 * one GET /api/user/settings (see NotesRepository.fetchWorkspacePreferences).
 *
 * All of them are server-synced on the web too, so a look and a language
 * chosen on a laptop are what this phone opens with, the same way the
 * workspace theme already worked before this type existed.
 */
data class WorkspacePreferences(
    val shellTheme: String?,
    val editorToolbarMode: String?,
    val typography: TypographyPresets,
    /** The account's interface language ("en", "fr"), or null to follow
     *  the device, and whether this user administers the instance. Both
     *  live on the profile rather than the settings blob. */
    val language: String?,
    val isAdmin: Boolean?,
    /** Where the notification pill sits, and how long it stays (null =
     *  until dismissed). */
    val toastPosition: String?,
    val toastDurationMs: Long?,
    /** Whether notes open in read mode (the web's own default). */
    val readModeEnabled: Boolean?,
    /** Whether the content runs under the left cutout in landscape, and
     *  whether the sign-in screen animates its decorative cards. */
    val edgeToEdgeLandscape: Boolean?,
    val floatingCardsEnabled: Boolean?,
    /** "list" or "grid": how the notes screen lays its cards out. */
    val viewMode: String?,
    /** Whether a new notification rings, and the per-category opt-outs for
     *  the ring and for showing it at all. */
    val notificationsSound: Boolean?,
    val notificationsSoundTypes: Map<String, Boolean>?,
    val notificationsFilterTypes: Map<String, Boolean>?,
    /** Where a new checklist item goes, and what a removed section does
     *  with the items it owned. */
    val checklistInsertPosition: String?,
    val checklistRemoveSectionBehavior: String?,
)
