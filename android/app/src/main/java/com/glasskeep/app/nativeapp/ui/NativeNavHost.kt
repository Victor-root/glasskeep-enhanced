package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.RealtimeClient
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.syncReminderAlarms
import com.glasskeep.app.reminders.ReminderSyncWorker
import kotlinx.coroutines.launch

/**
 * The native rewrite's navigation graph. One route per real screen; grows
 * as more of the web app's feature list gets ported (see the migration
 * report's difficulty tiers for the order that makes sense).
 */
@Composable
fun NativeNavHost(
    container: NativeAppContainer,
    serverUrl: String,
    pendingOpenNoteId: String? = null,
    onPendingOpenNoteIdConsumed: () -> Unit = {},
    pendingOpenQrScanner: Boolean = false,
    onPendingOpenQrScannerConsumed: () -> Unit = {},
) {
    val navController: NavHostController = rememberNavController()
    val startDestination = if (container.tokenStore.token != null) "notes" else "login"
    val context = LocalContext.current

    // Reminder alarms, kept in sync with this device's local note cache for
    // as long as the native app is running, same placement/lifetime as
    // App.jsx's own androidReminderSyncRef effect (the top-level app
    // component), so it reacts to a reminder set/changed/cleared from any
    // screen, and to a note being trashed/restored, not just the one
    // action that happens to be on screen right now. See ReminderSync.kt.
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val notes by repository.observeNotes().collectAsState(initial = null)
    LaunchedEffect(notes) {
        notes?.let { syncReminderAlarms(context, it) }
    }

    // Realtime cross-device updates (see RealtimeClient.kt's own doc
    // comment for why this is foreground-only, not spanning the whole
    // session the way the web's browser-tab EventSource does). A single
    // Activity app, so LocalLifecycleOwner already reflects the whole
    // app's foreground/background state - no need for the heavier,
    // separate androidx.lifecycle:lifecycle-process/ProcessLifecycleOwner
    // dependency this app doesn't otherwise pull in.
    val realtimeClient = remember(serverUrl) {
        RealtimeClient(
            serverUrl = serverUrl,
            tokenStore = container.tokenStore,
            onRefreshNeeded = { repository.refresh() },
        )
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, realtimeClient) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> if (container.tokenStore.token != null) realtimeClient.start()
                Lifecycle.Event.ON_STOP -> realtimeClient.stop()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            realtimeClient.stop()
        }
    }

    // Background reminder sync (WorkManager): arms the periodic "ask the
    // server for upcoming reminders" job and runs one immediately, so a
    // reminder set on another device, or missed while this device was
    // offline, is picked up without waiting on the local cache above.
    // Deliberately NOT ReminderSyncWorker.setAuthToken(): that writes into
    // the WebView-era shared prefs, which TokenStore's own doc comment
    // says the two apps "must not silently share or corrupt" between
    // each other. schedulePeriodic()/syncNow() only enqueue WorkManager
    // jobs; ReminderSyncWorker itself falls back to reading TokenStore
    // read-only when those legacy prefs are empty (see its own doc
    // comment), which is what actually lets this work for a native-only
    // sign-in with no WebView session on the device at all.
    LaunchedEffect(startDestination) {
        if (startDestination == "notes") {
            ReminderSyncWorker.schedulePeriodic(context)
            ReminderSyncWorker.syncNow(context)
            SyncQueueWorker.schedulePeriodic(context)
            SyncQueueWorker.triggerNow(context)
            realtimeClient.start()
        }
    }

    // Workspace theme, formatting bar and typography: TokenStore's cache
    // already made all three right from the very first frame (see
    // ThemeState/EditorPrefsState); this reconciles them against the
    // server's own copy, the source of truth, exactly once per session,
    // same "fetch on load, apply if different" shape as the web's own
    // applyStoredShellTheme()-then-server-sync design.
    LaunchedEffect(startDestination) {
        if (startDestination == "notes") {
            applyWorkspacePreferences(container, repository)
        }
    }

    // Deep-link from a reminder notification tap (NativeAppActivity's
    // EXTRA_OPEN_NOTE_ID / onNewIntent). Only handles the "already signed
    // in" case: startDestination is fixed for this composition's lifetime,
    // so a cold start with no session (startDestination == "login") is
    // instead handled from onLoggedIn below, once there's actually
    // somewhere to navigate to.
    LaunchedEffect(pendingOpenNoteId, startDestination) {
        if (pendingOpenNoteId != null && startDestination == "notes") {
            navController.navigate("notes/$pendingOpenNoteId")
            onPendingOpenNoteIdConsumed()
        }
    }

    // Same shape as the note deep-link above, but with no "resume after
    // login" fallback: approving another device's sign-in requires this
    // phone to already have a session (see GlassKeepApi.kt's device-link
    // comment), so a shortcut tap while signed out has nothing to resume
    // into and is simply dropped, same as the shortcut already silently
    // doing nothing today.
    LaunchedEffect(pendingOpenQrScanner, startDestination) {
        if (pendingOpenQrScanner) {
            if (startDestination == "notes") navController.navigate("qr-scan")
            onPendingOpenQrScannerConsumed()
        }
    }

    val scope = rememberCoroutineScope()

    // Shared by every login path (password, passkey, secret key): same
    // reminder/theme bootstrap regardless of which screen signed the user
    // in, and the same must_change_password branch (see
    // ForceChangePasswordScreen.kt) instead of ever landing on "notes"
    // with a temporary password still active. popUpTo("login") clears
    // whichever of "login"/"login-secret" is on the back stack either way,
    // since popUpTo removes everything up to and including its target.
    fun handleLoggedIn(mustChangePassword: Boolean) {
        ReminderSyncWorker.schedulePeriodic(context)
        ReminderSyncWorker.syncNow(context)
        SyncQueueWorker.schedulePeriodic(context)
        SyncQueueWorker.triggerNow(context)
        realtimeClient.start()
        scope.launch { applyWorkspacePreferences(container, repository) }
        if (mustChangePassword) {
            navController.navigate("force-change-password") {
                popUpTo("login") { inclusive = true }
            }
        } else {
            navController.navigate("notes") {
                popUpTo("login") { inclusive = true }
            }
            pendingOpenNoteId?.let {
                navController.navigate("notes/$it")
                onPendingOpenNoteIdConsumed()
            }
        }
    }

    // One pill for the whole app, over every screen: the web has exactly
    // one too, and it is what replaces the platform's own Toast here.
    val toasts = rememberToastController()
    // "Edge-to-edge in landscape" off means the whole shell stays clear of
    // the left cutout, exactly what the web does by putting --safe-left
    // back on <body> (App.jsx:1703). Left only: the other three edges are
    // always padded there, and each screen already handles its own.
    val safeLeft = if (container.shellPrefs.edgeToEdgeLandscape) {
        Modifier
    } else {
        Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Left))
    }
    CompositionLocalProvider(LocalGkToasts provides toasts) {
        Box(Modifier.fillMaxSize().then(safeLeft)) {
            NavHost(navController = navController, startDestination = startDestination) {
                composable("login") {
                    NativeLoginScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onLoggedIn = { mustChangePassword -> handleLoggedIn(mustChangePassword) },
                        onForgotPassword = { navController.navigate("login-secret") },
                    )
                }
                composable("login-secret") {
                    SecretKeyLoginScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onLoggedIn = { mustChangePassword -> handleLoggedIn(mustChangePassword) },
                        onBack = { navController.popBackStack() },
                    )
                }
                composable("force-change-password") {
                    ForceChangePasswordScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onChanged = {
                            navController.navigate("notes") {
                                popUpTo("force-change-password") { inclusive = true }
                            }
                            pendingOpenNoteId?.let {
                                navController.navigate("notes/$it")
                                onPendingOpenNoteIdConsumed()
                            }
                        },
                    )
                }
                composable("notes") {
                    NativeNotesListScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onOpenNote = { noteId -> navController.navigate("notes/$noteId") },
                        onOpenArchived = { navController.navigate("archived") },
                        onOpenTrash = { navController.navigate("trash") },
                        onOpenSettings = { navController.navigate("settings") },
                    )
                }
                // The web's settings panel is a full-width sheet that slides in
                // from the right in 200ms (SettingsPanel.jsx:295), with nothing
                // else animated; the route reproduces that entrance and its
                // mirror image on the way out.
                composable(
                    route = "settings",
                    enterTransition = {
                        slideInHorizontally(
                            animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
                            initialOffsetX = { it },
                        )
                    },
                    popExitTransition = {
                        slideOutHorizontally(
                            animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
                            targetOffsetX = { it },
                        )
                    },
                ) {
                    SettingsScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onBack = { navController.popBackStack() },
                        onOpenQrScanner = { navController.navigate("qr-scan") },
                    )
                }
                composable("qr-scan") {
                    QrScanScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable("notes/{noteId}") { backStackEntry ->
                    val noteId = backStackEntry.arguments?.getString("noteId") ?: return@composable
                    NoteDetailScreen(
                        container = container,
                        serverUrl = serverUrl,
                        noteId = noteId,
                        onBack = { navController.popBackStack() },
                        onOpenCollaborators = { navController.navigate("notes/$noteId/collaborators") },
                    )
                }
                composable("notes/{noteId}/collaborators") { backStackEntry ->
                    val noteId = backStackEntry.arguments?.getString("noteId") ?: return@composable
                    CollaboratorsScreen(
                        container = container,
                        serverUrl = serverUrl,
                        noteId = noteId,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable("archived") {
                    ArchivedNotesScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onOpenNote = { noteId -> navController.navigate("notes/$noteId") },
                        onBack = { navController.popBackStack() },
                    )
                }
                composable("trash") {
                    TrashScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onOpenNote = { noteId -> navController.navigate("notes/$noteId") },
                        onBack = { navController.popBackStack() },
                    )
                }
            }
            GkToastHost(
                controller = toasts,
                position = toastPositionOf(container.editorPrefs.toastPosition),
                dark = isSystemInDarkTheme(),
                durationMs = container.editorPrefs.toastDurationMs,
            )
        }
    }
}

/** One settings read, applied to both live states. Best-effort: a failure
 *  leaves whatever the local cache already made live, which is the right
 *  behaviour for a look-and-feel read on a phone that may be offline. */
private suspend fun applyWorkspacePreferences(container: NativeAppContainer, repository: NotesRepository) {
    val prefs = repository.fetchWorkspacePreferences() ?: return
    prefs.shellTheme?.let { container.themeState.apply(it) }
    prefs.editorToolbarMode?.let { container.editorPrefs.applyToolbarMode(it) }
    container.editorPrefs.applyTypography(prefs.typography)
    AppLanguage.apply(prefs.language)
    prefs.toastPosition?.let { container.editorPrefs.applyToastPosition(it) }
    container.editorPrefs.applyToastDuration(prefs.toastDurationMs)
    prefs.readModeEnabled?.let { container.editorPrefs.applyReadMode(it) }
    prefs.edgeToEdgeLandscape?.let { container.shellPrefs.applyEdgeToEdgeLandscape(it) }
    prefs.floatingCardsEnabled?.let { container.shellPrefs.applyFloatingCards(it) }
}
