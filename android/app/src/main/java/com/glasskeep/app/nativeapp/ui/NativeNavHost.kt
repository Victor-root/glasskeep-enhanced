package com.glasskeep.app.nativeapp.ui

import android.Manifest
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
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
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.NotifCategoryFlags
import com.glasskeep.app.nativeapp.data.RealtimeClient
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.network.NotificationDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.nativeapp.data.renewSessionTokenIfStale
import com.glasskeep.app.nativeapp.syncErrorKindOf
import com.glasskeep.app.nativeapp.syncReminderAlarms
import com.glasskeep.app.reminders.ReminderSyncWorker
import kotlinx.coroutines.CancellationException
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
    val realtimeClient = remember(serverUrl) {
        RealtimeClient(
            serverUrl = serverUrl,
            tokenStore = container.tokenStore,
            onRefreshNeeded = { repository.refresh() },
            onInstanceLocked = { container.lockState.markLocked() },
            onInstanceUnlocked = { lockPokes++ },
            onLiveNotification = { liveNotification = it },
            onAuxiliaryEvent = { type ->
                when (type) {
                    "admin_settings_updated", "logo_added", "logo_deleted" -> brandingPokes++
                    else -> {
                        preferencePokes++
                        if (type == "user_ai_settings_updated") aiSettingsPokes++
                    }
                }
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
    LaunchedEffect(serverUrl, brandingPokes) {
        val api = container.api(serverUrl)
        runCatching { api.getBranding() }
            .getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.let { container.branding.apply(it) }
        // The admin's sign-in slogan, read alongside (App.jsx:4885).
        runCatching { api.getLoginSlogan() }
            .getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.let { container.branding.loginSlogan = it.loginSlogan.orEmpty() }
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
    val density = LocalDensity.current
    val toasts = rememberToastController()
    toasts.prefs = container.editorPrefs
    val settingsActions = rememberSettingsActions(container, repository, toasts)

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
                decidePendingRegistration(context, api, repository, toasts, id, notification.id, approve)
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
                    NativeLoginScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onLoggedIn = { mustChangePassword -> handleLoggedIn(mustChangePassword) },
                        onForgotPassword = { navController.navigate("login-secret") },
                        onRegister = { navController.navigate("register") },
                    )
                }
                composable(
                    route = "register",
                    enterTransition = { EnterTransition.None },
                    exitTransition = { ExitTransition.None },
                    popEnterTransition = { EnterTransition.None },
                    popExitTransition = { ExitTransition.None },
                ) {
                    RegisterScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(
                    route = "login-secret",
                    enterTransition = { EnterTransition.None },
                    exitTransition = { ExitTransition.None },
                    popEnterTransition = { EnterTransition.None },
                    popExitTransition = { ExitTransition.None },
                ) {
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
                // Under the settings panel the notes list neither fades nor
                // moves: it sits behind the web's instant bg-black/50 scrim
                // while the panel slides in, and is simply there again,
                // with no scrim, the moment the panel starts sliding out
                // (SettingsPanel.jsx:286-295).
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
                    val coveredBySettings = transition.targetState == EnterExitState.PostExit && nextRoute == "settings"
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
                            onOpenNote = { noteId -> navController.navigate("notes/$noteId") },
                            onOpenNewNote = { noteId -> navController.navigate("notes/$noteId?new=true") },
                            onOpenArchived = { navController.navigate("archived") },
                            onOpenTrash = { navController.navigate("trash") },
                            onOpenSettings = { navController.navigate("settings") },
                            onOpenAdmin = { navController.navigate("admin") },
                            onOpenQrScanner = { navController.navigate("qr-scan") },
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
                        if (coveredBySettings) {
                            Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.5f)))
                        }
                        if (noteScrim > 0f) {
                            Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = noteScrim)))
                        }
                    }
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
                        actions = settingsActions,
                        aiSettingsPokes = aiSettingsPokes,
                        onBack = { navController.popBackStack() },
                        onOpenQrScanner = { navController.navigate("qr-scan") },
                        // The web closes the panel and opens the admin one
                        // on the section holding the field.
                        onOpenPasskeyDomainSetting = {
                            navController.navigate("admin?focus=$AdminFocusPasskeyDomain") {
                                popUpTo("settings") { inclusive = true }
                            }
                        },
                    )
                }
                composable(
                    route = "admin?focus={focus}",
                    arguments = listOf(navArgument("focus") { type = NavType.StringType; nullable = true; defaultValue = null }),
                ) { backStackEntry ->
                    AdminScreen(
                        container = container,
                        serverUrl = serverUrl,
                        focus = backStackEntry.arguments?.getString("focus"),
                        onBack = { navController.popBackStack() },
                    )
                }
                composable("qr-scan") {
                    QrScanScreen(
                        container = container,
                        serverUrl = serverUrl,
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
                    )
                }
                composable("archived") {
                    ArchivedNotesScreen(
                        container = container,
                        serverUrl = serverUrl,
                        onOpenNote = { noteId -> navController.navigate("notes/$noteId") },
                        onOpenSideBySide = { first, second -> navController.navigate("compare/$first/$second") },
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
            SettingsActionDialogs(settingsActions, container.themeState.themeId, LocalGkDark.current)
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

/** Overlays the notes list stays in place under, rather than fading. */
private val ListOverlayRoutes = setOf("settings", NoteRoute)

// syncEngine.js's own health-check cadences (its lines 20-22), which the
// read above follows: it is both this app's reachability probe and its
// lock-status poll, so the tighter of the two schedules wins. The web
// polls the lock endpoint at 3s while locked too (useInstanceLockStatus.js).
private const val HEALTH_IDLE_MS = 10_000L
private const val HEALTH_PENDING_MS = 5_000L
private const val HEALTH_OFFLINE_MS = 3_000L

private val SignedOutRoutes = setOf("login", "register", "login-secret")
