package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.bodyOrRefusal
import com.glasskeep.app.nativeapp.data.network.AdminSettingsDto
import com.glasskeep.app.nativeapp.data.network.AdminUserDto
import com.glasskeep.app.nativeapp.data.network.CreateAdminUserRequest
import com.glasskeep.app.nativeapp.data.network.DeletedAdminUserDto
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.PendingUserDto
import com.glasskeep.app.nativeapp.data.network.UpdateAdminUserRequest
import com.glasskeep.app.nativeapp.data.refusal
import com.glasskeep.app.nativeapp.restartApp
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import retrofit2.Response
import java.io.IOException

/** What [AdminScreen]'s `focus` names: the passkey domain field, which
 *  the settings' passkey notice sends an admin to. */
const val AdminFocusPasskeyDomain = "passkeyDomain"

/**
 * AdminPanel.jsx on a phone: a full-width sheet in the status bar colour,
 * its header with the two server commands, then one scrolling column: the
 * server version, the pending registrations while there are any, and the
 * accordion sections, every one closed on arrival. [focus] opens it where
 * that setting lives; [liveEvents] are the server frames its lists follow
 * while it is open; [encryption] and [serverUpdate] outlive it, as the
 * web's own state does.
 */
@Composable
internal fun AdminScreen(
    container: NativeAppContainer,
    serverUrl: String,
    focus: String?,
    liveEvents: SharedFlow<String>,
    encryption: AdminEncryptionState,
    serverUpdate: ServerUpdateState,
    onOpenChangelog: () -> Unit,
    onBack: () -> Unit,
) {
    val dark = LocalGkDark.current
    val themeId = container.themeState.themeId
    val context = LocalContext.current
    val activity = LocalView.current.context as Activity
    val toasts = LocalGkToasts.current
    val alerts = LocalGkAlerts.current
    val scope = rememberCoroutineScope()
    val state = remember(serverUrl) { AdminPanelState(context, container, serverUrl, scope, alerts) }
    val power = remember(serverUrl) { ServerPower(context, state.api, toasts, activity) }
    val ai = remember(serverUrl) { AdminAiState(context, state.api, toasts) }
    val federation = remember(serverUrl) {
        AdminFederationState(context, state.api, originOf(serverUrl) ?: serverUrl.trimEnd('/'), toasts, scope)
    }
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val scrollState = rememberScrollState()
    val content = remember { CoordinatesHolder() }

    var highlightDomain by rememberSaveable { mutableStateOf(focus == AdminFocusPasskeyDomain) }
    var pendingOpen by rememberSaveable { mutableStateOf(false) }
    var siteOpen by rememberSaveable { mutableStateOf(false) }
    var usersOpen by rememberSaveable { mutableStateOf(false) }
    var createOpen by rememberSaveable { mutableStateOf(false) }
    var aiOpen by rememberSaveable { mutableStateOf(false) }
    var encryptionOpen by rememberSaveable { mutableStateOf(false) }
    var federationOpen by rememberSaveable { mutableStateOf(false) }
    var confirmPower by remember { mutableStateOf<PowerAction?>(null) }

    // openAdminPanel(): everything is read afresh each time it opens.
    LaunchedEffect(state) {
        launch { state.loadAll() }
        launch { ai.load() }
    }
    LaunchedEffect(state, liveEvents) {
        liveEvents.collect { type ->
            state.onLiveEvent(type)
            if (type == "admin_ai_settings_updated") ai.reload()
            if (type.startsWith("federation_")) federation.load(silent = true)
        }
    }
    // Sent from the settings' passkey notice, the panel opens with that
    // section unfolding (App.jsx:7576) and the row is pointed out until
    // its flag clears, 3.6s on (AdminPanel.jsx:119-124).
    LaunchedEffect(Unit) {
        if (highlightDomain) {
            siteOpen = true
            delay(3_600)
            highlightDomain = false
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(WorkspaceTheme.statusBarColor(themeId, dark))
            .drawBehind { drawRect(borderColor, size = Size(1.dp.toPx(), size.height)) },
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .padding(start = 1.dp)
                .windowInsetsPadding(WindowInsets.systemBars),
        ) {
            AdminHeader(
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                serverOffline = container.syncStatus.serverReachable == false,
                running = power.running,
                onPower = { confirmPower = it },
                onClose = onBack,
            )
            Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
            Column(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(scrollState)
                    .onGloballyPositioned { content.value = it }
                    .padding(16.dp),
            ) {
                AdminUpdateSection(
                    update = serverUpdate,
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    onOpenChangelog = onOpenChangelog,
                )
                Spacer(Modifier.height(24.dp))
                if (state.pending.isNotEmpty()) {
                    AdminPendingSection(
                        state = state,
                        expanded = pendingOpen,
                        onToggle = { pendingOpen = !pendingOpen },
                        themeId = themeId,
                        dark = dark,
                        titleColor = titleColor,
                        borderColor = borderColor,
                    )
                }
                AdminSiteSection(
                    state = state,
                    container = container,
                    expanded = siteOpen,
                    onToggle = { siteOpen = !siteOpen },
                    highlightDomain = highlightDomain,
                    scrollState = scrollState,
                    content = content,
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                )
                AdminUsersSection(
                    state = state,
                    currentUserId = container.tokenStore.profile?.id,
                    expanded = usersOpen,
                    onToggle = { usersOpen = !usersOpen },
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                )
                AdminCreateUserSection(
                    state = state,
                    expanded = createOpen,
                    onToggle = { createOpen = !createOpen },
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                )
                AdminAiSection(
                    ai = ai,
                    expanded = aiOpen,
                    onToggle = { aiOpen = !aiOpen },
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                )
                AdminEncryptionSection(
                    encryption = encryption,
                    expanded = encryptionOpen,
                    onToggle = { encryptionOpen = !encryptionOpen },
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                )
                AdminFederationSection(
                    federation = federation,
                    expanded = federationOpen,
                    onToggle = { federationOpen = !federationOpen },
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                )
            }
        }
    }

    confirmPower?.let { action ->
        val restart = action == PowerAction.RESTART
        GkConfirmDialog(
            title = stringResource(if (restart) R.string.native_admin_restart_title else R.string.native_admin_shutdown_title),
            message = stringResource(if (restart) R.string.native_admin_restart_confirm else R.string.native_admin_shutdown_confirm),
            confirmLabel = stringResource(if (restart) R.string.native_admin_restart_confirm_btn else R.string.native_admin_shutdown_confirm_btn),
            cancelLabel = stringResource(R.string.native_dialog_cancel),
            themeId = themeId,
            dark = dark,
            borderColor = borderColor,
            titleColor = titleColor,
            subtextColor = if (dark) DialogBodyDark else DialogBodyLight,
            variant = GkConfirmVariant.DANGER,
            onConfirm = { scope.launch { if (restart) power.restart() else power.shutdown() } },
            onDismiss = { confirmPower = null },
        )
    }
    power.progress?.let { PowerProgressDialog(it, dark, titleColor, borderColor) }
}

/**
 * The panel's header: the red shield and the title, then the power and
 * restart buttons (gone while the server is unreachable, dimmed while
 * either command runs, the running one's icon spinning) and the close X.
 */
@Composable
private fun AdminHeader(
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    serverOffline: Boolean,
    running: PowerAction?,
    onPower: (PowerAction) -> Unit,
    onClose: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(Modifier.weight(1f, fill = false), verticalAlignment = Alignment.CenterVertically) {
            ShieldCheckIcon(size = 20.dp, tint = if (dark) Color(0xFFFF6467) else Color(0xFFE7000B))
            Spacer(Modifier.width(8.dp))
            Text(
                stringResource(R.string.native_notes_admin_panel),
                color = titleColor,
                fontSize = 18.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (!serverOffline) {
                PowerButton(
                    label = stringResource(R.string.native_admin_shutdown_server),
                    themeId = themeId,
                    enabled = running == null,
                    onClick = { onPower(PowerAction.SHUTDOWN) },
                ) {
                    val angle = if (running == PowerAction.SHUTDOWN) rememberSpinAngle() else 0f
                    PowerIcon(Modifier.rotate(angle), size = 20.dp, tint = Color.White)
                }
                PowerButton(
                    label = stringResource(R.string.native_admin_restart_server),
                    themeId = themeId,
                    enabled = running == null,
                    onClick = { onPower(PowerAction.RESTART) },
                ) {
                    val angle = if (running == PowerAction.RESTART) rememberSpinAngle() else 0f
                    RefreshIcon(Modifier.rotate(angle), size = 20.dp, tint = Color.White)
                }
            }
            SidePanelCloseButton(titleColor, onClose)
        }
    }
}

/** One of the header's 36px gradient squares, pressed down to 0.98. */
@Composable
private fun PowerButton(
    label: String,
    themeId: String?,
    enabled: Boolean,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
        label = "powerButtonScale",
    )
    Box(
        modifier = Modifier
            .scale(scale)
            .alpha(if (enabled) 1f else 0.5f)
            .size(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(WorkspaceTheme.buttonGradient(themeId))
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

/**
 * useAdminActions.js: the panel's settings and lists, and the requests
 * that change them. A failure the web raises as a blocking `alert()` goes
 * to the app's [alerts], as the WebView showed its own message dialog.
 */
internal class AdminPanelState(
    private val context: Context,
    private val container: NativeAppContainer,
    private val serverUrl: String,
    private val scope: CoroutineScope,
    private val alerts: GkAlerts,
) {
    val api: GlassKeepApi = container.api(serverUrl)

    /** The web's own defaults until the first read lands. */
    var settings by mutableStateOf(AdminSettingsDto(allowNewAccounts = true))
        private set
    var users by mutableStateOf<List<AdminUserDto>>(emptyList())
        private set
    var pending by mutableStateOf<List<PendingUserDto>>(emptyList())
        private set

    suspend fun loadAll() = coroutineScope {
        launch { loadSettings() }
        launch { loadUsers() }
        launch { loadPending() }
    }

    private suspend fun loadSettings() {
        read("GET /api/admin/settings") { getAdminSettings() }?.let { settings = it }
    }

    private suspend fun loadUsers() {
        read("GET /api/admin/users") { getAdminUsers() }?.let { users = it }
    }

    private suspend fun loadPending() {
        read("GET /api/admin/pending-users") { getPendingUsers() }?.let { pending = it }
    }

    /** A read that fails leaves the panel as it was: the web only logs it. */
    private suspend fun <T : Any> read(request: String, call: suspend GlassKeepApi.() -> Response<T>): T? = try {
        api.call().bodyOrRefusal(request)
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        NativeDebug.e("Admin read failed: $request", t)
        null
    }

    /** The frames App.jsx reloads the panel's lists on. A resolved
     *  registration reads the users too: the frame's outcome is not passed
     *  on, and only an approval changes them. */
    suspend fun onLiveEvent(type: String) {
        when (type) {
            "pending_user_registered" -> loadPending()
            "pending_user_resolved" -> {
                loadPending()
                loadUsers()
            }
            "user_list_changed", "user_deleted_notification" -> loadUsers()
            "admin_settings_updated" -> loadSettings()
        }
    }

    /** updateAdminSettings(): the settings as stored, or null once the
     *  refusal is on screen. The live branding is read again after it. */
    suspend fun updateSettings(request: suspend GlassKeepApi.() -> Response<AdminSettingsDto>): AdminSettingsDto? = try {
        api.request().bodyOrRefusal("PATCH /api/admin/settings").also { fresh ->
            settings = fresh
            container.branding.loginSlogan = fresh.loginSlogan
            scope.launch { reloadBranding(container, serverUrl) }
        }
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        alerts.show(failureText(t, R.string.native_admin_failed_update_settings))
        null
    }

    /** createUser(): true once the account exists. */
    suspend fun createUser(request: CreateAdminUserRequest): Boolean = try {
        val created = api.createAdminUser(request).bodyOrRefusal("POST /api/admin/users")
        users = listOf(created) + users
        true
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        alerts.show(failureText(t, R.string.native_admin_failed_create_user))
        false
    }

    /** deleteUser(): who the server says it deleted, or null. */
    suspend fun deleteUser(id: Int): DeletedAdminUserDto? = try {
        val response = api.deleteAdminUser(id).bodyOrRefusal("DELETE /api/admin/users/$id")
        users = users.filterNot { it.id == id }
        response.deletedUser
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        alerts.show(failureText(t, R.string.native_admin_failed_delete_user))
        null
    }

    /** updateUser(), which throws: the edit dialog toasts the failure. The
     *  answer carries no counts, so the row keeps the ones it had. */
    suspend fun updateUser(id: Int, request: UpdateAdminUserRequest) {
        val updated = api.updateAdminUser(id, request).bodyOrRefusal("PATCH /api/admin/users/$id")
        users = users.map {
            if (it.id == id) updated.copy(notes = it.notes, storageBytes = it.storageBytes, avatarUrl = it.avatarUrl) else it
        }
    }

    /** approvePendingUser(): null once done, else the failure, alerted and
     *  handed back for the panel's own toast. */
    suspend fun approve(id: Int): String? = try {
        val user = api.approvePendingUser(id).bodyOrRefusal("POST /api/admin/pending-users/$id/approve")
        pending = pending.filterNot { it.id == id }
        users = listOf(user) + users
        null
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        failureText(t, R.string.native_admin_failed_approve_user).also(alerts::show)
    }

    /** rejectPendingUser(), answered like [approve]. */
    suspend fun reject(id: Int): String? = try {
        api.rejectPendingUser(id).bodyOrRefusal("POST /api/admin/pending-users/$id/reject")
        pending = pending.filterNot { it.id == id }
        null
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        failureText(t, R.string.native_admin_failed_reject_user).also(alerts::show)
    }

    /** localizeServerError(e.message, fallback). */
    fun failureText(t: Throwable, @StringRes fallback: Int): String =
        context.localizedServerError(context.requestErrorText(t), fallback)
}

/** The header's two server commands. */
internal enum class PowerAction { RESTART, SHUTDOWN }

/** What the centred card says while a command runs: waiting, or done with
 *  [secondsLeft] before the app starts over. */
private data class PowerProgress(val action: PowerAction, val secondsLeft: Int? = null)

/**
 * AdminPanel.jsx's handleRestart / handleShutdown once confirmed: the
 * request, then /api/health read every 1.5s until the server is back with
 * a new start time (restart, 60s at most) or stops answering (shutdown,
 * 30s at most), then a countdown and the app starts over, the native side
 * of the page reload.
 */
private class ServerPower(
    private val context: Context,
    private val api: GlassKeepApi,
    private val toasts: ToastController,
    private val activity: Activity,
) {
    /** isRestarting / isShuttingDown. */
    var running by mutableStateOf<PowerAction?>(null)
        private set
    var progress by mutableStateOf<PowerProgress?>(null)
        private set

    suspend fun restart() {
        running = PowerAction.RESTART
        progress = PowerProgress(PowerAction.RESTART)
        try {
            val startedBefore = api.startedAt() ?: System.currentTimeMillis()
            val response = api.restartServer()
            if (!response.isSuccessful) return fail(response.refusal("POST /api/admin/restart").error)
            val deadline = System.currentTimeMillis() + 60_000
            while (true) {
                delay(1_500)
                if (System.currentTimeMillis() > deadline) return timeOut(R.string.native_admin_restart_timeout)
                val startedAt = api.startedAt()
                if (startedAt != null && startedAt > startedBefore) break
            }
            running = null
            countDown(PowerAction.RESTART, 5)
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("Server restart failed", t)
            fail(null)
        }
    }

    suspend fun shutdown() {
        running = PowerAction.SHUTDOWN
        progress = PowerProgress(PowerAction.SHUTDOWN)
        try {
            val response = api.shutdownServer()
            if (!response.isSuccessful) return fail(response.refusal("POST /api/admin/shutdown").error)
            val deadline = System.currentTimeMillis() + 30_000
            while (true) {
                delay(1_500)
                if (System.currentTimeMillis() > deadline) return timeOut(R.string.native_admin_shutdown_timeout)
                if (!api.answers()) break
            }
            running = null
            countDown(PowerAction.SHUTDOWN, 3)
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("Server shutdown failed", t)
            fail(null)
        }
    }

    /** The refusal's own text, reworded, else the web's `t("error")`. */
    private fun fail(error: String?) {
        toasts.error(context.localizedServerError(error, R.string.native_admin_missing_error_key))
        running = null
        progress = null
    }

    private fun timeOut(@StringRes message: Int) {
        running = null
        progress = null
        toasts.error(context.getString(message))
    }

    private suspend fun countDown(action: PowerAction, seconds: Int) {
        var left = seconds
        progress = PowerProgress(action, left)
        while (left > 0) {
            delay(1_000)
            left--
            progress = PowerProgress(action, left)
        }
        restartApp(activity)
    }
}

/** GET /api/health's start time, or null while the server gives none
 *  (down, starting, a proxy's error page). */
private suspend fun GlassKeepApi.startedAt(): Long? = try {
    health().takeIf { it.isSuccessful }?.body()?.startedAt
} catch (t: CancellationException) {
    throw t
} catch (t: Exception) {
    null
}

/** Whether /api/health answers at all within 3s, whatever it says. */
private suspend fun GlassKeepApi.answers(): Boolean = try {
    withTimeoutOrNull(3_000) { health() } != null
} catch (t: IOException) {
    false
} catch (t: CancellationException) {
    throw t
} catch (t: Exception) {
    true
}

/** The centred card over a restart or shutdown, which nothing dismisses:
 *  the command's icon turning while it waits, a check once it is done. */
@Composable
private fun PowerProgressDialog(progress: PowerProgress, dark: Boolean, titleColor: Color, borderColor: Color) {
    val restart = progress.action == PowerAction.RESTART
    val done = progress.secondsLeft != null
    GkDialog(
        onDismissRequest = {},
        dark = dark,
        borderColor = borderColor,
        dismissOnClickOutside = false,
        maxWidth = 384.dp,
        scrimAlpha = 0.5f,
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            when {
                done -> TablerCheckIcon(size = 20.dp, tint = titleColor)
                restart -> RefreshIcon(Modifier.rotate(rememberSpinAngle()), size = 20.dp, tint = titleColor)
                else -> PowerIcon(Modifier.rotate(rememberSpinAngle()), size = 20.dp, tint = titleColor)
            }
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(
                    when {
                        !done && restart -> R.string.native_admin_restart_in_progress
                        !done -> R.string.native_admin_shutdown_in_progress
                        restart -> R.string.native_admin_restart_done
                        else -> R.string.native_admin_shutdown_done
                    },
                ),
                color = titleColor,
                fontSize = 18.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                when {
                    done -> stringResource(R.string.native_admin_reload_in, progress.secondsLeft)
                    restart -> stringResource(R.string.native_admin_restart_waiting)
                    else -> stringResource(R.string.native_admin_shutdown_waiting)
                },
                color = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
