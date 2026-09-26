package com.glasskeep.app.nativeapp.ui

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.EaseIn
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.FederationEvent
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.NotifCategoryFlags
import com.glasskeep.app.nativeapp.data.RealtimeClient
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.network.NotificationDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.nativeapp.data.renewSessionTokenIfStale
import com.glasskeep.app.nativeapp.restartApp
import com.glasskeep.app.nativeapp.syncErrorKindOf
import com.glasskeep.app.nativeapp.syncReminderAlarms
import com.glasskeep.app.reminders.ReminderSyncWorker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
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
    // on a cold start, i.e. before the NavHost has ever composed: the
    // forced password change that sign-in carries opens once it has.
    var unlockedIntoForcedPasswordChange by remember { mutableStateOf(false) }
    // QrScannerModal, over whichever screen opened it (App.jsx:7913).
    var qrScannerOpen by remember { mutableStateOf(false) }
    val startDestination = if (container.tokenStore.token != null) "notes" else "login"
    val context = LocalContext.current
    val activity = LocalView.current.context as Activity

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
    val api = remember(serverUrl) { container.api(serverUrl) }
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
    var preferencePokes by remember { mutableIntStateOf(0) }
    var aiSettingsPokes by remember { mutableIntStateOf(0) }
    var brandingPokes by remember { mutableIntStateOf(0) }
    // The last share/revoke frame the server pushed, waiting to become a
    // pill (the web's own showShareNotificationToast, App.jsx:3841).
    var liveNotification by remember { mutableStateOf<NotificationDto?>(null) }
    // What the admin panel reloads its lists on while it is open.
    val adminEvents = remember { MutableSharedFlow<String>(extraBufferCapacity = 16) }
    // The same federation frames whole, for the pairing notices.
    val federationEvents = remember { MutableSharedFlow<FederationEvent>(extraBufferCapacity = 16) }
    val realtimeClient = remember(serverUrl) {
        RealtimeClient(
            serverUrl = serverUrl,
            tokenStore = container.tokenStore,
            onRefreshNeeded = { repository.refresh() },
            onInstanceLocked = { container.lockState.markLocked() },
            onInstanceUnlocked = { lockPokes++ },
            onLiveNotification = { liveNotification = it },
            onAuxiliaryEvent = { type ->
                adminEvents.tryEmit(type)
                when (type) {
                    "admin_settings_updated", "logo_added", "logo_deleted" -> brandingPokes++
                    in AdminPanelEvents -> Unit
                    else -> {
                        preferencePokes++
                        if (type == "user_ai_settings_updated") aiSettingsPokes++
                    }
                }
            },
            onFederationEvent = { event ->
                adminEvents.tryEmit(event.type)
                federationEvents.tryEmit(event)
            },
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
    LaunchedEffect(serverUrl, brandingPokes) { reloadBranding(container, serverUrl) }

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
    // Only a successful push takes an item out of the queue (a failure
    // keeps it, retried or given up), so a shrinking queue is the moment
    // syncEngine.js stamps its "last sync" time.
    LaunchedEffect(repository) {
        var previous: Int? = null
        repository.observeSyncQueue().collect { queue ->
            previous?.let { if (queue.size < it) container.syncStatus.recordPushed(System.currentTimeMillis()) }
            previous = queue.size
        }
    }
    LaunchedEffect(lifecycleOwner, lockPokes) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                val outcome = runCatching { container.api(serverUrl).instanceStatus() }
                val body = outcome.getOrNull()?.takeIf { it.isSuccessful }?.body()
                if (body != null) {
                    container.lockState.apply(body)
                    container.syncStatus.recordReachable()
                } else {
                    container.syncStatus.recordUnreachable(
                        syncErrorKindOf(outcome.exceptionOrNull(), outcome.getOrNull()?.code()),
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
    LaunchedEffect(startDestination, preferencePokes) {
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
            if (startDestination == "notes") qrScannerOpen = true
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

    // Pulling a signed-out page down reloaded it in the WebView: its form
    // starts over (the screens below are keyed on the count) and what it
    // shows is read again, the disc spinning until the branding is back.
    var signedOutReloads by remember { mutableIntStateOf(0) }
    var signedOutReloading by remember { mutableStateOf(false) }
    val signedOutReload = SignedOutReload(signedOutReloading) {
        signedOutReloading = true
        signedOutReloads++
        lockPokes++
        scope.launch {
            try {
                reloadBranding(container, serverUrl)
            } finally {
                signedOutReloading = false
            }
        }
    }

    // One pill for the whole app, over every screen: the web has exactly
    // one too, and it is what replaces the platform's own Toast here.
    val toasts = rememberToastController()
    toasts.prefs = container.editorPrefs
    val alerts = remember { GkAlerts() }
    val settingsActions = rememberSettingsActions(container, repository, toasts, alerts)

    // Shared by every login path (password, passkey, QR, secret key): same
    // reminder/theme bootstrap regardless of which screen signed the user
    // in. A temporary password lands on the notes like any other sign-in,
    // under the change-password dialog it cannot leave (App.jsx:7951).
    // popUpTo("login") clears whichever signed-out screens are on the back
    // stack, since popUpTo removes everything up to and including its target.
    fun handleLoggedIn(mustChangePassword: Boolean) {
        ReminderSyncWorker.schedulePeriodic(context)
        ReminderSyncWorker.syncNow(context)
        SyncQueueWorker.schedulePeriodic(context)
        SyncQueueWorker.triggerNow(context)
        realtimeClient.start()
        scope.launch { applyWorkspacePreferences(container, repository) }
        navController.navigate("notes") {
            popUpTo("login") { inclusive = true }
        }
        if (mustChangePassword) settingsActions.openForcedPasswordChange()
        pendingOpenNoteId?.let {
            navController.navigate("notes/$it")
            onPendingOpenNoteIdConsumed()
        }
    }
    LaunchedEffect(unlockedIntoForcedPasswordChange) {
        if (unlockedIntoForcedPasswordChange) {
            settingsActions.openForcedPasswordChange()
            unlockedIntoForcedPasswordChange = false
        }
    }

    val density = LocalDensity.current

    toasts.removeServerRow = { id -> scope.launch { repository.removeNotifications(listOf(id)) } }

    // A server row as a pill (the web's showShareNotificationToast,
    // App.jsx:3841), called from the composition rather than from the SSE
    // thread so the pill's strings resolve against the app's language.
    fun showNotificationPill(notification: NotificationDto) {
        val openLabel = notificationOpenLabelRes(notification.type)?.takeIf { notification.noteId != null }
        val pendingId = notification.message?.toIntOrNull()
            ?.takeIf { notification.type == "pending_user_registered" }
        fun decide(approve: Boolean) {
            val id = pendingId ?: return
            scope.launch {
                decidePendingRegistration(context, api, repository, toasts, alerts, id, notification.id, approve)
            }
        }
        toasts.show(
            message = notificationMessageText(context, notification),
            variant = variantOf(notification),
            title = notificationTitleText(context, notification, withFallback = false),
            icon = notificationIconKey(notification),
            actionLabel = when {
                openLabel != null -> context.getString(openLabel)
                pendingId != null -> context.getString(R.string.native_admin_approve)
                else -> null
            },
            action = when {
                openLabel != null -> { { navController.navigate("notes/${notification.noteId}") } }
                pendingId != null -> { { decide(approve = true) } }
                else -> null
            },
            secondaryActionLabel = pendingId?.let { context.getString(R.string.native_admin_reject) },
            secondaryAction = pendingId?.let { { decide(approve = false) } },
            type = notification.type,
            serverId = notification.id,
            persistent = notification.persistent == 1 || notification.type == "reminder",
        )
    }
    LaunchedEffect(liveNotification) {
        val notification = liveNotification ?: return@LaunchedEffect
        liveNotification = null
        showNotificationPill(notification)
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
    // Whether a locked server gets the full unlock screen, on App.jsx:7367's
    // own rule; otherwise the notes list shows the banner (the web's other
    // case). "Signed in" is read off the current route rather than off the
    // token: it is the app's own answer to that question, and unlike the
    // token it is Compose state, so signing out moves the screen straight
    // to the full unlock version.
    val currentEntry by navController.currentBackStackEntryAsState()
    val route = currentEntry?.destination?.route ?: startDestination
    val signedIn = route !in SignedOutRoutes
    // The notes screen's drawer view (the web's tagFilter, App.jsx:216),
    // kept here because a note unarchived from the archive takes the list
    // back to the notes (App.jsx:4855-4859). Each session starts on them.
    var notesView by rememberSaveable(signedIn) { mutableStateOf<String?>(null) }
    fun onNoteUnarchived() {
        if (notesView == SidebarArchived) notesView = null
    }
    // Every sign-in or launch replays the rows still pending as a burst of
    // pills, oldest first, without acknowledging them: that is left to
    // the bell (useShareNotifications.js:451-578).
    LaunchedEffect(signedIn, serverUrl) {
        if (!signedIn) return@LaunchedEffect
        try {
            repository.fetchPendingNotifications()
                .sortedBy { parseIsoToEpochMillis(it.createdAt) ?: 0L }
                .forEach { showNotificationPill(it) }
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("Pending notifications replay failed", t)
        }
    }
    val lock = container.lockState
    val showUnlockScreen = lock.isLocked && (!signedIn || lock.overlayOpen)
    // The admin panel's encryption section, kept for the whole session as
    // the web keeps it mounted: a recovery key survives the panel closing.
    val adminEncryption = remember(serverUrl, signedIn) {
        AdminEncryptionState(context, api, lock, toasts, scope) { lockPokes++ }
    }
    // FederationInviteWatcher.jsx, which the web mounts for administrators.
    val federationWatcher = remember(serverUrl, signedIn) {
        FederationInviteWatcher(context, api, toasts, scope, originOf(serverUrl) ?: serverUrl.trimEnd('/'))
    }
    val isAdmin = container.shellPrefs.isAdmin
    LaunchedEffect(federationWatcher, isAdmin) {
        if (!signedIn || !isAdmin) return@LaunchedEffect
        federationWatcher.catchUp()
        federationEvents.collect { federationWatcher.onEvent(it) }
    }
    // useUpdateCheck.js and useSelfUpdate.js, which the web runs at its
    // root for administrators: the header's dots, the admin panel's
    // version card and the update window all read this one.
    val serverUpdate = remember(serverUrl, signedIn) { ServerUpdateState(context, api, scope) }
    // Told once per launch about a given version, and three times in all
    // (the server keeps the count, across devices).
    var updateNoticeVersion by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(serverUpdate, isAdmin) {
        if (!signedIn || !isAdmin) return@LaunchedEffect
        launch { serverUpdate.recover() }
        val info = serverUpdate.checkForUpdate() ?: return@LaunchedEffect
        container.shellPrefs.applyServerUpdateAvailable(info.updateAvailable)
        val latest = info.latestVersion
        if (!info.updateAvailable || latest == null || latest == updateNoticeVersion || info.notificationShownCount >= 3) {
            return@LaunchedEffect
        }
        updateNoticeVersion = latest
        serverUpdate.markNotificationShown(latest)
        toasts.show(
            message = context.getString(R.string.native_update_notice_message, latest),
            variant = NotifVariant.SUCCESS,
            title = context.getString(R.string.native_update_notice_title),
            icon = "refresh",
            actionLabel = context.getString(R.string.native_update_now),
            action = { serverUpdate.askToUpdate(latest) },
            type = "update_available",
            durationMs = UpdateNoticeDurationMs,
            stacked = true,
        )
    }
    // ChangelogModal.jsx's open state, lifted to the root as the web lifts
    // it; the launch right after a successful update opens it at once.
    var changelogOpen by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (container.tokenStore.showChangelogOnLaunch) {
            container.tokenStore.showChangelogOnLaunch = false
            changelogOpen = true
        }
    }

    CompositionLocalProvider(
        LocalGkToasts provides toasts,
        LocalGkAlerts provides alerts,
        LocalGkTooltips provides tooltips,
        LocalSignedOutReload provides signedOutReload,
        LocalUriHandler provides remember(context) { CustomTabUriHandler(context) },
    ) {
        Box(Modifier.fillMaxSize().then(safeLeft)) {
            if (showUnlockScreen) {
                key(signedOutReloads) {
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
                }
            } else {
            NavHost(navController = navController, startDestination = startDestination) {
                // The signed-out screens are hash routes on the web: they swap
                // instantly, with none of NavHost's default cross-fade.
                composable(
                    route = "login",
                    enterTransition = { EnterTransition.None },
                    exitTransition = { ExitTransition.None },
                    popEnterTransition = { EnterTransition.None },
                    popExitTransition = { ExitTransition.None },
                ) {
                    key(signedOutReloads) {
                        NativeLoginScreen(
                            container = container,
                            serverUrl = serverUrl,
                            onLoggedIn = { mustChangePassword -> handleLoggedIn(mustChangePassword) },
                            onForgotPassword = { navController.navigate("login-secret") },
                            onRegister = { navController.navigate("register") },
                        )
                    }
                }
                composable(
                    route = "register",
                    enterTransition = { EnterTransition.None },
                    exitTransition = { ExitTransition.None },
                    popEnterTransition = { EnterTransition.None },
                    popExitTransition = { ExitTransition.None },
                ) {
                    key(signedOutReloads) {
                        RegisterScreen(
                            container = container,
                            serverUrl = serverUrl,
                            onBack = { navController.popBackStack() },
                        )
                    }
                }
                composable(
                    route = "login-secret",
                    enterTransition = { EnterTransition.None },
                    exitTransition = { ExitTransition.None },
                    popEnterTransition = { EnterTransition.None },
                    popExitTransition = { ExitTransition.None },
                ) {
                    key(signedOutReloads) {
                        SecretKeyLoginScreen(
                            container = container,
                            serverUrl = serverUrl,
                            onLoggedIn = { mustChangePassword -> handleLoggedIn(mustChangePassword) },
                            onBack = { navController.popBackStack() },
                        )
                    }
                }
                // Under the settings and admin panels the notes list neither
                // fades nor moves: it sits behind the web's instant
                // bg-black/50 scrim while the panel slides in, and is simply
                // there again, with no scrim, the moment the panel starts
                // sliding out (SettingsPanel.jsx:286-295, AdminPanel.jsx:477).
                // An open note leaves it in place too, under the web's
                // `scrimFadeIn` 50% black (200ms in, 180ms out).
                composable(
                    route = "notes",
                    // Signing in swaps the page at once, like the web's hash route.
                    enterTransition = {
                        if (initialState.destination.route in SignedOutRoutes) EnterTransition.None else null
                    },
                    exitTransition = {
                        if (targetState.destination.route in ListOverlayRoutes) ExitTransition.KeepUntilTransitionsFinished else null
                    },
                    popEnterTransition = {
                        if (initialState.destination.route in ListOverlayRoutes) EnterTransition.None else null
                    },
                ) {
                    val nextRoute = navController.currentBackStackEntryAsState().value?.destination?.route
                    val coveredByPanel = transition.targetState == EnterExitState.PostExit && nextRoute in SidePanelRoutes
                    // Which overlay last covered the list, kept after it pops
                    // so its scrim can fade back out.
                    var coveringRoute by remember { mutableStateOf<String?>(null) }
                    LaunchedEffect(nextRoute) {
                        if (nextRoute != null && nextRoute != "notes") coveringRoute = nextRoute
                    }
                    val noteScrim by transition.animateFloat(
                        transitionSpec = {
                            if (targetState == EnterExitState.PostExit) tween(200, easing = EaseOut) else tween(180, easing = EaseIn)
                        },
                        label = "noteScrim",
                    ) { state ->
                        if (state != EnterExitState.Visible && coveringRoute == NoteRoute) 0.5f else 0f
                    }
                    Box {
                        NativeNotesListScreen(
                            container = container,
                            serverUrl = serverUrl,
                            activeTagFilter = notesView,
                            onActiveTagFilterChange = { notesView = it },
                            onOpenNote = { noteId -> navController.navigate("notes/$noteId") },
                            onOpenNewNote = { noteId -> navController.navigate("notes/$noteId?new=true") },
                            onOpenSettings = { navController.navigate("settings") },
                            onOpenAdmin = { navController.navigate("admin") },
                            onOpenQrScanner = { qrScannerOpen = true },
                            onOpenSideBySide = { first, second -> navController.navigate("compare/$first/$second") },
                            pendingNewNoteType = pendingNewNoteType,
                            onPendingNewNoteTypeConsumed = onPendingNewNoteTypeConsumed,
                            onSignedOut = {
                                realtimeClient.stop()
                                navController.navigate("login") {
                                    popUpTo(navController.graph.id) { inclusive = true }
                                }
                            },
                        )
                        if (coveredByPanel) {
                            Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.5f)))
                        }
                        if (noteScrim > 0f) {
                            Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = noteScrim)))
                        }
                    }
                }
                // The web's settings panel, a full-width sheet sliding in from
                // the right.
                composable(
                    route = "settings",
                    enterTransition = { SidePanelEnter },
                    // Handing over to the admin panel, this one stays put
                    // until the other has slid over it: the web slides it out
                    // underneath, over the notes list, which is not composed
                    // here at that moment.
                    exitTransition = {
                        if (targetState.destination.route == AdminRoute) ExitTransition.KeepUntilTransitionsFinished else null
                    },
                    popExitTransition = { SidePanelExit },
                ) {
                    SettingsScreen(
                        container = container,
                        serverUrl = serverUrl,
                        actions = settingsActions,
                        aiSettingsPokes = aiSettingsPokes,
                        onBack = { navController.popBackStack() },
                        onOpenQrScanner = { qrScannerOpen = true },
                        // The web closes the panel and opens the admin one
                        // on the section holding the field.
                        onOpenPasskeyDomainSetting = {
                            navController.navigate("admin?focus=$AdminFocusPasskeyDomain") {
                                popUpTo("settings") { inclusive = true }
                            }
                        },
                    )
                }
                // The admin panel is the same sliding sheet (AdminPanel.jsx:486).
                composable(
                    route = AdminRoute,
                    arguments = listOf(navArgument("focus") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    enterTransition = { SidePanelEnter },
                    popExitTransition = { SidePanelExit },
                ) { backStackEntry ->
                    AdminScreen(
                        container = container,
                        serverUrl = serverUrl,
                        focus = backStackEntry.arguments?.getString("focus"),
                        liveEvents = adminEvents,
                        encryption = adminEncryption,
                        serverUpdate = serverUpdate,
                        onOpenChangelog = { changelogOpen = true },
                        onBack = { navController.popBackStack() },
                    )
                }
                // noteModalIn / noteModalOut on a phone: a fade plus a 14px
                // rise, 200ms ease-out in, 180ms ease-in out.
                composable(
                    route = NoteRoute,
                    arguments = listOf(navArgument("new") { type = NavType.BoolType; defaultValue = false }),
                    enterTransition = {
                        if (initialState.destination.route == "notes") {
                            fadeIn(tween(200, easing = EaseOut)) +
                                slideInVertically(tween(200, easing = EaseOut)) { with(density) { NoteRise.roundToPx() } }
                        } else {
                            null
                        }
                    },
                    popExitTransition = {
                        if (targetState.destination.route == "notes") {
                            fadeOut(tween(180, easing = EaseIn)) +
                                slideOutVertically(tween(180, easing = EaseIn)) { with(density) { NoteRise.roundToPx() } }
                        } else {
                            null
                        }
                    },
                ) { backStackEntry ->
                    val noteId = backStackEntry.arguments?.getString("noteId") ?: return@composable
                    NoteDetailScreen(
                        container = container,
                        serverUrl = serverUrl,
                        noteId = noteId,
                        onBack = { navController.popBackStack() },
                        isNew = backStackEntry.arguments?.getBoolean("new") == true,
                        onUnarchived = { onNoteUnarchived() },
                    )
                }
                composable("compare/{firstId}/{secondId}") { backStackEntry ->
                    val firstId = backStackEntry.arguments?.getString("firstId") ?: return@composable
                    val secondId = backStackEntry.arguments?.getString("secondId") ?: return@composable
                    SideBySideNotesScreen(
                        container = container,
                        serverUrl = serverUrl,
                        firstId = firstId,
                        secondId = secondId,
                        onKeepOnly = { survivor ->
                            navController.popBackStack()
                            navController.navigate("notes/$survivor")
                        },
                        onUnarchived = { onNoteUnarchived() },
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
            // Over the pills, which the web keeps under its modals.
            if (changelogOpen) {
                ChangelogModal(
                    container = container,
                    serverUrl = serverUrl,
                    version = serverUpdate.info?.currentVersion,
                    themeId = container.themeState.themeId,
                    dark = LocalGkDark.current,
                    onClose = { changelogOpen = false },
                )
            }
            GkTooltipHost(tooltips)
            SettingsActionDialogs(settingsActions, container.themeState.themeId, LocalGkDark.current)
            GkAlertHost(alerts, container.themeState.themeId, LocalGkDark.current)
            if (qrScannerOpen) {
                QrScannerModal(container = container, serverUrl = serverUrl, onClose = { qrScannerOpen = false })
            }
            ServerUpdateConfirmation(serverUpdate, container.themeState.themeId, LocalGkDark.current)
            SelfUpdateProgress(
                update = serverUpdate,
                themeId = container.themeState.themeId,
                dark = LocalGkDark.current,
                // The web reloads the page on the new version, the
                // changelog opening once it is back.
                onReload = {
                    scope.launch {
                        serverUpdate.acknowledge()
                        container.tokenStore.showChangelogOnLaunch = true
                        restartApp(activity)
                    }
                },
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
    AppLanguage.apply(prefs.profile?.language)
    prefs.profile?.let {
        container.shellPrefs.applyIsAdmin(it.isAdmin)
        container.tokenStore.profile = it
    }
    prefs.toastPosition?.let { container.editorPrefs.applyToastPosition(it) }
    container.editorPrefs.applyToastDuration(prefs.toastDurationMs)
    prefs.readModeEnabled?.let { container.editorPrefs.applyReadMode(it) }
    prefs.taskStrikeEnabled?.let { container.editorPrefs.applyTaskStrike(it) }
    prefs.qrQuickEnabled?.let { container.shellPrefs.applyQrQuick(it) }
    prefs.edgeToEdgeLandscape?.let { container.shellPrefs.applyEdgeToEdgeLandscape(it) }
    prefs.floatingCardsEnabled?.let { container.shellPrefs.applyFloatingCards(it) }
    prefs.viewMode?.let { container.shellPrefs.applyListView(it == "list") }
    prefs.notificationsSound?.let { container.editorPrefs.applyNotificationsSound(it) }
    prefs.notificationsSoundTypes?.let { container.editorPrefs.applyNotificationsSoundTypes(NotifCategoryFlags(it)) }
    prefs.notificationsFilterTypes?.let { container.editorPrefs.applyNotificationsFilterTypes(NotifCategoryFlags(it)) }
    prefs.checklistInsertPosition?.let { container.editorPrefs.applyChecklistInsertPosition(it) }
    prefs.checklistRemoveSectionBehavior?.let { container.editorPrefs.applyChecklistRemoveSectionBehavior(it) }
    prefs.alwaysShowSidebarOnWide?.let { container.shellPrefs.applyAlwaysShowSidebarOnWide(it) }
    prefs.sidebarBreakpoint?.let { container.shellPrefs.applySidebarBreakpoint(it) }
    prefs.pasteMode?.let { container.editorPrefs.applyPasteMode(it) }

    // The AI assistant's own availability lives on its own endpoint, not
    // in the settings blob, but it is needed at exactly the same moment:
    // the notes screen's search field asks about it on its first frame.
    repository.fetchUserAiSettings()?.let {
        container.shellPrefs.applyAiAssistant(it.enabled && it.adminAiEnabled)
    }
}

/** `new`: a note just created opens the way the web's
 *  createAndOpenBlankNote opens it (see NoteDetailScreen's isNew). */
private const val NoteRoute = "notes/{noteId}?new={new}"
private val NoteRise = 14.dp

private const val AdminRoute = "admin?focus={focus}"

/** The frames only the admin panel follows. */
private val AdminPanelEvents = setOf(
    "pending_user_registered",
    "pending_user_resolved",
    "user_list_changed",
    "user_deleted_notification",
    "admin_ai_settings_updated",
)

/** The full-width sheets that slide in from the right over the notes. */
private val SidePanelRoutes = setOf("settings", AdminRoute)

/** Overlays the notes list stays in place under, rather than fading. */
private val ListOverlayRoutes = SidePanelRoutes + NoteRoute

/** A side sheet's 200ms slide in from the right edge, and back out
 *  (SettingsPanel.jsx:295): nothing else of it animates. */
private val SidePanelEnter = slideInHorizontally(
    animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
    initialOffsetX = { it },
)
private val SidePanelExit = slideOutHorizontally(
    animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
    targetOffsetX = { it },
)

// syncEngine.js's own health-check cadences (its lines 20-22), which the
// read above follows: it is both this app's reachability probe and its
// lock-status poll, so the tighter of the two schedules wins. The web
// polls the lock endpoint at 3s while locked too (useInstanceLockStatus.js).
private const val HEALTH_IDLE_MS = 10_000L
private const val HEALTH_PENDING_MS = 5_000L
private const val HEALTH_OFFLINE_MS = 3_000L

private val SignedOutRoutes = setOf("login", "register", "login-secret")

/** The "update available" notice stays its 30s whatever the user's own
 *  notification duration (App.jsx:870-873). */
private const val UpdateNoticeDurationMs = 30_000L

/** The instance's public branding and its admin's sign-in slogan
 *  (App.jsx:4885), both read without a session. */
internal suspend fun reloadBranding(container: NativeAppContainer, serverUrl: String) {
    val api = container.api(serverUrl)
    runCatching { api.getBranding() }
        .getOrNull()
        ?.takeIf { it.isSuccessful }
        ?.body()
        ?.let { container.branding.apply(it) }
    runCatching { api.getLoginSlogan() }
        .getOrNull()
        ?.takeIf { it.isSuccessful }
        ?.body()
        ?.let { container.branding.loginSlogan = it.loginSlogan.orEmpty() }
}
