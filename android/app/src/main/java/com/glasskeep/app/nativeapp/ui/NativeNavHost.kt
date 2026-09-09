package com.glasskeep.app.nativeapp.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.core.content.ContextCompat
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.NotifCategoryFlags
import com.glasskeep.app.nativeapp.data.RealtimeClient
import com.glasskeep.app.nativeapp.data.network.NotificationDto
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.renewSessionTokenIfStale
import com.glasskeep.app.nativeapp.syncReminderAlarms
import com.glasskeep.app.reminders.ReminderSyncWorker
import kotlinx.coroutines.delay
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
    pendingNewNoteType: String? = null,
    onPendingNewNoteTypeConsumed: () -> Unit = {},
) {
    val navController: NavHostController = rememberNavController()
    // Set when the unlock screen signs an admin in (its passkey path does)
    // on a cold start, i.e. before the NavHost has ever composed and so
    // before there is a graph to navigate: the start destination below is
    // what carries the must-change-password detour in that one case.
    var unlockedIntoForcedPasswordChange by remember { mutableStateOf(false) }
    val startDestination = when {
        unlockedIntoForcedPasswordChange -> "force-change-password"
        container.tokenStore.token != null -> "notes"
        else -> "login"
    }
    val context = LocalContext.current

    // Existing installs skip onboarding, so the first native reconciliation
    // that finds a live reminder also inherits the WebView's old contextual
    // POST_NOTIFICATIONS request. Without this, Android 13+ would arm the
    // alarm correctly but silently suppress it when it fired.
    var reminderPermissionAsked by remember { mutableStateOf(false) }
    val reminderPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* The alarm stays scheduled if the user declines. */ }

    // Reminder alarms, kept in sync with this device's local note cache for
    // as long as the native app is running, same placement/lifetime as
    // App.jsx's own androidReminderSyncRef effect (the top-level app
    // component), so it reacts to a reminder set/changed/cleared from any
    // screen, and to a note being trashed/restored, not just the one
    // action that happens to be on screen right now. See ReminderSync.kt.
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val notes by repository.observeNotes().collectAsState(initial = null)
    LaunchedEffect(notes) {
        val hasUpcomingReminder = notes?.let { syncReminderAlarms(context, it) } ?: false
        if (
            hasUpcomingReminder &&
            !reminderPermissionAsked &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            reminderPermissionAsked = true
            reminderPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Realtime cross-device updates (see RealtimeClient.kt's own doc
    // comment for why this is foreground-only, not spanning the whole
    // session the way the web's browser-tab EventSource does). A single
    // Activity app, so LocalLifecycleOwner already reflects the whole
    // app's foreground/background state - no need for the heavier,
    // separate androidx.lifecycle:lifecycle-process/ProcessLifecycleOwner
    // dependency this app doesn't otherwise pull in.
    //
    // The two lock callbacks below are at-rest encryption's instant paths,
    // the server's own broadcast to every connected client (App.jsx:3769),
    // alongside the scheduled read further down. "Unlocked" is not taken
    // on trust: it only pokes that read into running now instead of on its
    // next tick, same as the web's own listener calling refresh().
    var lockPokes by remember { mutableIntStateOf(0) }
    // The last share/revoke frame the server pushed, waiting to become a
    // pill (the web's own showShareNotificationToast, App.jsx:3841).
    var liveNotification by remember { mutableStateOf<NotificationDto?>(null) }
    val realtimeClient = remember(serverUrl) {
        RealtimeClient(
            serverUrl = serverUrl,
            tokenStore = container.tokenStore,
            onRefreshNeeded = { repository.refresh() },
            onInstanceLocked = { container.lockState.markLocked() },
            onInstanceUnlocked = { lockPokes++ },
            onLiveNotification = { liveNotification = it },
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

    // The instance's own name, logo and sign-in theme. Read once per
    // session, unauthenticated, so the sign-in screen gets it too; the
    // cached copy already painted the right one on the first frame, this
    // just reconciles it (BrandingContext.jsx's own load-then-cache shape).
    LaunchedEffect(serverUrl) {
        runCatching { container.api(serverUrl).getBranding() }
            .getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.let { container.branding.apply(it) }
    }

    // Trade an ageing token for a fresh one whenever the app comes back to
    // the foreground, which is this app's own "window focus" (App.jsx:207).
    // Skipped while signed out, and a no-op on a token younger than a day.
    LaunchedEffect(lifecycleOwner, startDestination) {
        if (startDestination == "login") return@LaunchedEffect
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            renewSessionTokenIfStale(container.api(serverUrl), container.tokenStore)
        }
    }

    // The one read this app makes on its own schedule, doing both jobs the
    // web splits across two: it reports the lock state AND, by answering at
    // all, whether the server is reachable (the header's cloud icon and its
    // panel read that, see SyncStatusState). Cadence is syncEngine.js's own
    // health-check one; repeatOnLifecycle also covers the web's
    // visibilitychange / focus listeners, since coming back to the
    // foreground restarts the loop and it reads immediately. A failed read
    // marks the server unreachable but never a lock, so a phone with no
    // signal keeps its cached notes instead of landing on the unlock screen.
    val pendingSyncIds by repository.observePendingSyncNoteIds().collectAsState(initial = emptySet())
    LaunchedEffect(lifecycleOwner, lockPokes) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                val outcome = runCatching { container.api(serverUrl).instanceStatus() }
                val body = outcome.getOrNull()?.takeIf { it.isSuccessful }?.body()
                if (body != null) {
                    container.lockState.apply(body)
                    container.syncStatus.recordReachable(System.currentTimeMillis())
                } else {
                    val error = outcome.exceptionOrNull()
                    container.syncStatus.recordUnreachable(
                        error?.message ?: error?.javaClass?.simpleName
                            ?: outcome.getOrNull()?.let { "HTTP ${it.code()}" },
                    )
                }
                delay(
                    when {
                        container.syncStatus.serverReachable == false -> HEALTH_OFFLINE_MS
                        container.lockState.isLocked -> HEALTH_OFFLINE_MS
                        pendingSyncIds.isNotEmpty() -> HEALTH_PENDING_MS
                        else -> HEALTH_IDLE_MS
                    },
                )
            }
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
        if (startDestination != "login") {
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
        if (startDestination != "login") {
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

    // Same rule for the three "new note" shortcuts, which the notes
    // screen itself acts on: a tap while signed out is dropped rather
    // than kept for whenever the user next signs in, exactly as the web
    // only runs a shortcut when there is already a valid session.
    LaunchedEffect(pendingNewNoteType, startDestination) {
        if (pendingNewNoteType != null && startDestination != "notes") {
            onPendingNewNoteTypeConsumed()
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
    toasts.prefs = container.editorPrefs

    // Raised from the composition rather than from the SSE thread, so the
    // pill's own strings resolve against the app's current language.
    LaunchedEffect(liveNotification) {
        val notification = liveNotification ?: return@LaunchedEffect
        liveNotification = null
        val noteTitle = notification.noteTitle.ifBlank { context.getString(R.string.native_notes_untitled) }
        val template = notificationMessageRes(notification.type, notification.variant)
        toasts.show(
            message = template
                ?.let { context.getString(it, notification.senderName, noteTitle) }
                ?: notification.message.orEmpty().ifBlank { noteTitle },
            variant = variantOf(notification),
            title = context.getString(notificationTitleRes(notification.type)),
            actionLabel = notification.noteId?.let { context.getString(R.string.native_notifications_open) },
            action = notification.noteId?.let { id -> { navController.navigate("notes/$id") } },
            type = notification.type,
        )
    }
    // Same "one instance for the whole app" placement as the pill above,
    // and the same reason: the web keeps exactly one tooltip portal at its
    // own root (TooltipPortal.jsx).
    val tooltips = rememberTooltipController()
    // "Edge-to-edge in landscape" off means the whole shell stays clear of
    // the left cutout, exactly what the web does by putting --safe-left
    // back on <body> (App.jsx:1703). Left only: the other three edges are
    // always padded there, and each screen already handles its own.
    val safeLeft = if (container.shellPrefs.edgeToEdgeLandscape) {
        Modifier
    } else {
        Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Left))
    }
    // Which of the unlock screen and the banner a locked server gets, on
    // App.jsx:7367's own two rules. "Signed in" is read off the current
    // route rather than off the token: it is the app's own answer to that
    // question, and unlike the token it is Compose state, so signing out
    // moves the screen straight to the full unlock version.
    val currentEntry by navController.currentBackStackEntryAsState()
    val route = currentEntry?.destination?.route ?: startDestination
    val signedIn = route != "login" && route != "login-secret"
    val lock = container.lockState
    val showUnlockScreen = lock.isLocked && (!signedIn || lock.overlayOpen)
    val showLockedBanner = lock.isLocked && signedIn && !lock.bannerDismissed && !lock.overlayOpen

    CompositionLocalProvider(LocalGkToasts provides toasts, LocalGkTooltips provides tooltips) {
        Box(Modifier.fillMaxSize().then(safeLeft)) {
            if (showUnlockScreen) {
                InstanceUnlockScreen(
                    container = container,
                    serverUrl = serverUrl,
                    // The next status read confirms it; closing the overlay
                    // now is what stops the screen lingering for the
                    // round-trip (App.jsx:7381).
                    onUnlocked = { lock.overlayOpen = false; lockPokes++ },
                    onUnlockedWithSession = { mustChangePassword ->
                        lock.overlayOpen = false
                        lockPokes++
                        // handleLoggedIn navigates, which needs a graph.
                        // A cold start behind this screen never composed
                        // the NavHost and has none; it is about to compose
                        // with the session now in place, so all that has
                        // to carry over is the password detour.
                        if (currentEntry != null) {
                            handleLoggedIn(mustChangePassword)
                        } else {
                            unlockedIntoForcedPasswordChange = mustChangePassword
                        }
                    },
                    // Only from the banner's CTA: a cold start with no
                    // session has no local cache to go back to.
                    onBackToOffline = if (signedIn) {
                        { lock.overlayOpen = false; lock.bannerDismissed = true }
                    } else {
                        null
                    },
                )
            } else Column(Modifier.fillMaxSize()) {
                if (showLockedBanner) {
                    LockedBanner(
                        dark = LocalGkDark.current,
                        onUnlock = { lock.overlayOpen = true },
                        onDismiss = { lock.bannerDismissed = true },
                    )
                }
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
                        onOpenQrScanner = { navController.navigate("qr-scan") },
                        pendingNewNoteType = pendingNewNoteType,
                        onPendingNewNoteTypeConsumed = onPendingNewNoteTypeConsumed,
                        onSignedOut = {
                            realtimeClient.stop()
                            navController.navigate("login") {
                                popUpTo(navController.graph.id) { inclusive = true }
                            }
                        },
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
            }
            GkToastHost(
                controller = toasts,
                position = toastPositionOf(container.editorPrefs.toastPosition),
                dark = LocalGkDark.current,
                durationMs = container.editorPrefs.toastDurationMs,
            )
            GkTooltipHost(tooltips)
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
    prefs.isAdmin?.let { container.shellPrefs.applyIsAdmin(it) }
    prefs.toastPosition?.let { container.editorPrefs.applyToastPosition(it) }
    container.editorPrefs.applyToastDuration(prefs.toastDurationMs)
    prefs.readModeEnabled?.let { container.editorPrefs.applyReadMode(it) }
    prefs.edgeToEdgeLandscape?.let { container.shellPrefs.applyEdgeToEdgeLandscape(it) }
    prefs.floatingCardsEnabled?.let { container.shellPrefs.applyFloatingCards(it) }
    prefs.viewMode?.let { container.shellPrefs.applyListView(it == "list") }
    prefs.notificationsSound?.let { container.editorPrefs.applyNotificationsSound(it) }
    prefs.notificationsSoundTypes?.let { container.editorPrefs.applyNotificationsSoundTypes(NotifCategoryFlags(it)) }
    prefs.notificationsFilterTypes?.let { container.editorPrefs.applyNotificationsFilterTypes(NotifCategoryFlags(it)) }
    prefs.checklistInsertPosition?.let { container.editorPrefs.applyChecklistInsertPosition(it) }
    prefs.checklistRemoveSectionBehavior?.let { container.editorPrefs.applyChecklistRemoveSectionBehavior(it) }

    // The AI assistant's own availability lives on its own endpoint, not
    // in the settings blob, but it is needed at exactly the same moment:
    // the notes screen's search field asks about it on its first frame.
    repository.fetchUserAiSettings()?.let {
        container.shellPrefs.applyAiAssistant(it.enabled && it.adminAiEnabled)
    }
}

// syncEngine.js's own health-check cadences (its lines 20-22), which the
// read above follows: it is both this app's reachability probe and its
// lock-status poll, so the tighter of the two schedules wins. The web
// polls the lock endpoint at 3s while locked too (useInstanceLockStatus.js).
private const val HEALTH_IDLE_MS = 10_000L
private const val HEALTH_PENDING_MS = 5_000L
private const val HEALTH_OFFLINE_MS = 3_000L
