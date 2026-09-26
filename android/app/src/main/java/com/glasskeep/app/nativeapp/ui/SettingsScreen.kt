package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.glasskeep.app.BuildConfig
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.NotifCategory
import com.glasskeep.app.nativeapp.data.NotifCategoryFlags
import com.glasskeep.app.nativeapp.data.TypographyPresets
import com.glasskeep.app.nativeapp.data.network.InstanceStatusResponse
import com.glasskeep.app.nativeapp.data.network.PasskeyDto
import com.glasskeep.app.nativeapp.data.network.ProfileDto
import com.glasskeep.app.nativeapp.data.network.UserAiSettingsDto
import com.glasskeep.app.nativeapp.data.network.UserAiSettingsRequest
import com.glasskeep.app.nativeapp.data.network.UserAiTestRequest
import com.glasskeep.app.nativeapp.isUserCancellation
import com.glasskeep.app.nativeapp.prfOutputOf
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import com.glasskeep.app.update.ReleaseInfo
import com.glasskeep.app.update.UpdateManager
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

/** `red-500` as rendered, the "remove photo" link. */
private val LinkRed = Color(0xFFFB2C36)
private val PasskeyDeleteBorderLight = Color(0xFFFFA2A2)
private val PasskeyDeleteBorderDark = Color(0xFF9F0712)
private val PasskeyDeleteFgLight = Color(0xFFE7000B)
private val PasskeyDeleteFgDark = Color(0xFFFF6467)
private val BadgeAmberBgLight = Color(0xFFFEF3C6)
private val BadgeAmberFgLight = Color(0xFF973C00)
private val BadgeAmberBgDark = Color(0x667B3306)
private val BadgeAmberFgDark = Color(0xFFFEE685)
private val BadgeGrayBgLight = Color(0xFFF3F4F6)
private val BadgeGrayFgLight = Color(0xFF364153)
private val BadgeGrayBgDark = Color(0xFF364153)
private val BadgeGrayFgDark = Color(0xFFE5E7EB)

// Tailwind v4 greys as the web renders them (gray-500 is SettingsSubtleColor).
private val Gray200 = Color(0xFFE5E7EB)
private val Gray300 = Color(0xFFD1D5DC)
private val Gray400 = Color(0xFF99A1AF)
private val Gray600 = Color(0xFF4A5565)
private val Gray700 = Color(0xFF364153)
private val Gray800 = Color(0xFF1E2939)
private val Gray900 = Color(0xFF101828)
private val Gray100 = Color(0xFFF3F4F6)

/** Where the web's "Comment exporter ?" link sends a Google Keep user. */
private const val GoogleTakeoutHelpUrl = "https://support.google.com/accounts/answer/3024190?hl=en-AM&utm"

/** The web's sidebar width presets, in px, and their labels
 *  (SettingsPanel.jsx:19-25). */
private val SidebarBreakpointPresets = listOf(
    1024 to R.string.native_settings_sidebar_breakpoint_1024,
    1280 to R.string.native_settings_sidebar_breakpoint_1280,
    1366 to R.string.native_settings_sidebar_breakpoint_1366,
    1440 to R.string.native_settings_sidebar_breakpoint_1440,
    1600 to R.string.native_settings_sidebar_breakpoint_1600,
)

/**
 * SettingsPanel.jsx, natively. On a phone the web panel is a full-width
 * sheet sliding in from the right over `--gk-statusbar`, with a 72px
 * header, a 16px scrollable body, one profile block and eight accordion
 * sections, all closed on first open, and the app version pinned bottom
 * right. It draws at once from the account the device last knew, as the
 * web does from its session user, and refreshes that in the background.
 *
 * The account actions that close the panel on the web (password change,
 * export, imports, secret key, note order reset) run through [actions],
 * which outlives this route.
 */
@Composable
internal fun SettingsScreen(
    container: NativeAppContainer,
    serverUrl: String,
    actions: SettingsActions,
    aiSettingsPokes: Int,
    onBack: () -> Unit,
    onOpenQrScanner: () -> Unit,
    onOpenPasskeyDomainSetting: () -> Unit,
) {
    val dark = LocalGkDark.current
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val activity = LocalView.current.context as Activity

    var profile by remember { mutableStateOf(container.tokenStore.profile) }
    var passkeys by remember { mutableStateOf<List<PasskeyDto>>(emptyList()) }

    var changingAvatar by remember { mutableStateOf(false) }
    var changingShowOnLogin by remember { mutableStateOf(false) }
    var changingLanguage by remember { mutableStateOf(false) }
    var changingTheme by remember { mutableStateOf(false) }
    var notifSoundTypesOpen by rememberSaveable { mutableStateOf(false) }
    var notifFilterTypesOpen by rememberSaveable { mutableStateOf(false) }
    var toastDurationMenuOpen by remember { mutableStateOf(false) }
    var sidebarBreakpointMenuOpen by remember { mutableStateOf(false) }
    var showTypographyModal by remember { mutableStateOf(false) }
    var addingPasskey by remember { mutableStateOf(false) }
    // The key being renamed, removed or given or denied the unlock right.
    var busyPasskeyId by remember { mutableStateOf<String?>(null) }
    var testingPasskeyId by remember { mutableStateOf<String?>(null) }
    // False while no admin has declared the instance's passkey domain.
    var passkeysAvailable by remember { mutableStateOf(true) }
    var instanceStatus by remember { mutableStateOf<InstanceStatusResponse?>(null) }

    var showAddPasskeyDialog by remember { mutableStateOf(false) }
    var renamePasskeyTarget by remember { mutableStateOf<PasskeyDto?>(null) }
    var pendingDeletePasskeyId by remember { mutableStateOf<String?>(null) }
    var pendingUnlockPasskeyId by remember { mutableStateOf<String?>(null) }

    var showResetOrderConfirm by remember { mutableStateOf(false) }

    var aiSettings by remember { mutableStateOf<UserAiSettingsDto?>(null) }
    var aiLoading by remember { mutableStateOf(true) }
    var aiDraft by remember { mutableStateOf(AiSettingsDraft("", "", "", "0.3", "800", false)) }
    var aiTestOutcome by remember { mutableStateOf<AiTestOutcome?>(null) }
    var savingAi by remember { mutableStateOf(false) }
    var testingAi by remember { mutableStateOf(false) }

    var showChangeServerDialog by remember { mutableStateOf(false) }
    var availableUpdate by remember { mutableStateOf<ReleaseInfo?>(UpdateManager.getStoredRelease(context)) }
    val installedFromFdroid = remember { UpdateManager.isFdroidInstall(context) }

    // Sections are collapsed on first open, exactly like the web's empty
    // `settingsOpenSections` map. Saved across configuration changes only;
    // current web intentionally does not sync accordion open state.
    var securityOpen by rememberSaveable { mutableStateOf(false) }
    var uiOpen by rememberSaveable { mutableStateOf(false) }
    var notificationsOpen by rememberSaveable { mutableStateOf(false) }
    var notesOpen by rememberSaveable { mutableStateOf(false) }
    var dataOpen by rememberSaveable { mutableStateOf(false) }
    var aiOpen by rememberSaveable { mutableStateOf(false) }
    var languageOpen by rememberSaveable { mutableStateOf(false) }
    var appOpen by rememberSaveable { mutableStateOf(false) }
    var passkeyListOpen by rememberSaveable { mutableStateOf(false) }
    var languageMenuOpen by remember { mutableStateOf(false) }

    val passkeyUntitledLabel = stringResource(R.string.native_settings_passkeys_untitled)
    val passkeyTestOkMessage = stringResource(R.string.native_settings_passkeys_test_ok)
    val aiSavedMessage = stringResource(R.string.native_settings_ai_saved)
    val aiKeyClearedMessage = stringResource(R.string.native_settings_ai_api_key_cleared)
    val aiTestOkMessage = stringResource(R.string.native_settings_ai_test_ok)
    val avatarUpdatedMessage = stringResource(R.string.native_settings_avatar_updated)
    val avatarRemovedMessage = stringResource(R.string.native_settings_avatar_removed)
    val avatarUploadFailedMessage = stringResource(R.string.native_settings_avatar_upload_failed)
    val avatarRemoveFailedMessage = stringResource(R.string.native_settings_avatar_remove_failed)
    val showOnLoginFailedMessage = stringResource(R.string.native_settings_show_on_login_failed)
    val languageSaveErrorMessage = stringResource(R.string.native_settings_language_save_error)
    val themeSaveErrorMessage = stringResource(R.string.native_settings_theme_save_error)

    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else SettingsSubtleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val accent = WorkspaceTheme.accent(themeId, dark)

    /** Keeps the device's copy of the account in step with what the
     *  screen shows, so the next opening starts from it. */
    fun updateProfile(transform: (ProfileDto) -> ProfileDto) {
        val next = profile?.let(transform) ?: return
        profile = next
        container.tokenStore.profile = next
    }

    LaunchedEffect(serverUrl) {
        try {
            val fresh = repository.fetchProfile()
            profile = fresh
            container.tokenStore.profile = fresh
        } catch (t: Throwable) {
            NativeDebug.e("SettingsScreen load failed", t)
        }
    }

    /** The list and whether the instance takes a new key at all; a
     *  failure leaves both as they were (PasskeySettingsSection.jsx's
     *  refresh). */
    suspend fun refreshPasskeys() {
        try {
            val result = repository.listPasskeys()
            passkeys = result.passkeys
            passkeysAvailable = result.available
        } catch (t: Throwable) {
            NativeDebug.e("SettingsScreen listPasskeys failed", t)
        }
    }

    // Its own effect, not folded into the one above: a passkey-list
    // failure is a lot less important than the profile fetch above (the
    // rest of the screen works fine without it). The encryption state
    // decides whether an admin's keys offer the unlock right.
    LaunchedEffect(serverUrl) {
        refreshPasskeys()
        instanceStatus = repository.fetchInstanceStatus()
    }

    /** The server always answers with its own public shape, so applying
     *  its response, never the values just sent, is what keeps the form
     *  honest (applyConfig, UserAiSettingsSection.jsx:63-80). */
    fun applyAiSettings(config: UserAiSettingsDto) {
        aiSettings = config
        container.shellPrefs.applyAiAssistant(config.enabled && config.adminAiEnabled)
        aiDraft = AiSettingsDraft(
            baseUrl = config.baseUrl,
            model = config.model,
            // Never prefilled: a stored key never comes back.
            apiKey = "",
            temperature = jsNumberText(config.temperature),
            maxTokens = config.maxTokens.toString(),
            showApiKey = false,
        )
    }

    // Best-effort like the passkey list: until it answers the section
    // shows its defaults with the controls held, and a failed read simply
    // leaves those defaults in place (UserAiSettingsSection.jsx:93-118).
    // Read again when another session changes them, as the web applies
    // its user-ai-settings-updated event.
    LaunchedEffect(serverUrl, aiSettingsPokes) {
        repository.fetchUserAiSettings()?.let { applyAiSettings(it) }
        aiLoading = false
    }

    /** Applies a preference at once and saves it behind, the way
     *  App.jsx's own effects do: local first, every change sent, a failed
     *  PATCH left silent. */
    fun <T> savePreference(key: String, previous: T, next: T, apply: (T) -> Unit, save: suspend (T) -> Unit) {
        if (next == previous) return
        apply(next)
        scope.launch {
            try {
                save(next)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen saving $key failed", t)
            }
        }
    }

    /** A failed passkey request's toast: the server's reason reworded,
     *  [fallback] without one. What reads as the user closing the system
     *  sheet stays silent, as on the web. */
    fun reportPasskeyError(message: String, @StringRes fallback: Int) {
        if (!PasskeyCancelRegex.containsMatchIn(message)) toasts.error(context.localizedServerError(message, fallback))
    }

    fun addPasskey(name: String) {
        if (addingPasskey) return
        addingPasskey = true
        scope.launch {
            try {
                val options = repository.fetchPasskeyRegisterOptions()
                when (val ceremony = NativePasskeys.register(activity, options.options.toString())) {
                    is PasskeyCeremonyResult.Success -> {
                        val saved = repository.verifyPasskeyRegistration(
                            Json.parseToJsonElement(ceremony.responseJson),
                            options.challengeId,
                            name,
                        )
                        toasts.success(context.getString(R.string.native_settings_passkeys_added))
                        // Said once, and long enough to be read: this key
                        // will never offer the unlock right.
                        if (!saved.prfSupported) {
                            toasts.show(
                                context.getString(R.string.native_settings_passkeys_no_prf_notice),
                                NotifVariant.INFO,
                                durationMs = 10_000,
                            )
                        }
                        refreshPasskeys()
                        passkeyListOpen = true
                    }
                    is PasskeyCeremonyResult.Failed -> if (!ceremony.isUserCancellation()) {
                        reportPasskeyError(ceremony.message, R.string.native_settings_passkeys_add_failed)
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen addPasskey failed", t)
                reportPasskeyError(context.requestErrorText(t), R.string.native_settings_passkeys_add_failed)
            } finally {
                addingPasskey = false
            }
        }
    }

    /** A full authentication ceremony scoped to one credential, whose
     *  only visible outcome is the toast: it tells the user this key
     *  still works before they rely on it (PasskeySettingsSection.jsx's
     *  own handleTest). */
    fun testPasskey(credentialId: String) {
        if (testingPasskeyId != null) return
        testingPasskeyId = credentialId
        scope.launch {
            try {
                val options = repository.fetchPasskeyTestOptions(credentialId)
                when (val ceremony = NativePasskeys.authenticate(activity, options.options.toString())) {
                    is PasskeyCeremonyResult.Success -> {
                        repository.verifyPasskeyTest(credentialId, Json.parseToJsonElement(ceremony.responseJson), options.challengeId)
                        toasts.success(passkeyTestOkMessage)
                    }
                    is PasskeyCeremonyResult.Failed -> if (!ceremony.isUserCancellation()) {
                        reportPasskeyError(ceremony.message, R.string.native_settings_passkeys_test_failed)
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen testPasskey failed", t)
                reportPasskeyError(context.requestErrorText(t), R.string.native_settings_passkeys_test_failed)
            } finally {
                testingPasskeyId = null
            }
        }
    }

    /** The trimmed name, cut at 64; an emptied one renames nothing. */
    fun renamePasskey(credentialId: String, input: String) {
        val name = input.trim().take(64)
        if (name.isEmpty()) return
        busyPasskeyId = credentialId
        scope.launch {
            try {
                repository.renamePasskey(credentialId, name)
                refreshPasskeys()
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen renamePasskey failed", t)
                toasts.error(context.localizedServerError(context.requestErrorText(t), R.string.native_settings_passkeys_rename_failed))
            } finally {
                busyPasskeyId = null
            }
        }
    }

    fun deletePasskey(credentialId: String) {
        busyPasskeyId = credentialId
        scope.launch {
            try {
                repository.deletePasskey(credentialId)
                refreshPasskeys()
                toasts.success(context.getString(R.string.native_settings_passkeys_deleted))
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen deletePasskey failed", t)
                toasts.error(context.localizedServerError(context.requestErrorText(t), R.string.native_settings_passkeys_delete_failed))
            } finally {
                busyPasskeyId = null
            }
        }
    }

    /** Takes the unlock right back: the server only drops the wrapped
     *  key, no ceremony needed. */
    fun disablePasskeyUnlock(credentialId: String) {
        busyPasskeyId = credentialId
        scope.launch {
            try {
                repository.disablePasskeyUnlock(credentialId)
                toasts.success(context.getString(R.string.native_settings_passkeys_unlock_disabled))
                refreshPasskeys()
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen disablePasskeyUnlock failed", t)
                toasts.error(context.localizedServerError(context.requestErrorText(t), R.string.native_settings_passkeys_toggle_failed))
            } finally {
                busyPasskeyId = null
            }
        }
    }

    /** Gives the unlock right: one authentication with the key, whose PRF
     *  output lets the server wrap the live data key under it. */
    fun enablePasskeyUnlock(credentialId: String) {
        busyPasskeyId = credentialId
        scope.launch {
            try {
                val options = repository.fetchPasskeyUnlockOptions(credentialId)
                when (val ceremony = NativePasskeys.authenticate(activity, options.options.toString())) {
                    is PasskeyCeremonyResult.Success -> {
                        val response = Json.parseToJsonElement(ceremony.responseJson)
                        val prfOutput = prfOutputOf(response.jsonObject)
                        if (prfOutput == null) {
                            reportPasskeyError(context.getString(R.string.native_passkey_no_prf_output), R.string.native_settings_passkeys_toggle_failed)
                        } else {
                            repository.verifyPasskeyUnlock(credentialId, response, options.challengeId, prfOutput)
                            toasts.success(context.getString(R.string.native_settings_passkeys_unlock_enabled))
                            refreshPasskeys()
                        }
                    }
                    is PasskeyCeremonyResult.Failed -> if (!ceremony.isUserCancellation()) {
                        reportPasskeyError(ceremony.message, R.string.native_settings_passkeys_toggle_failed)
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen enablePasskeyUnlock failed", t)
                reportPasskeyError(context.requestErrorText(t), R.string.native_settings_passkeys_toggle_failed)
            } finally {
                busyPasskeyId = null
            }
        }
    }

    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? ->
        uri?.let { picked ->
            if (changingAvatar) return@let
            changingAvatar = true
            scope.launch {
                try {
                    val dataUrl = withContext(Dispatchers.IO) {
                        // 256px, matching fileToCompressedDataURL(file, 256, 0.85) in
                        // SettingsPanel.jsx: an avatar never needs a full 1600px note image.
                        ImageCompression.compressToDataUrl(context, picked, maxDimension = 256)
                    }
                    if (dataUrl == null) {
                        toasts.error(avatarUploadFailedMessage)
                    } else {
                        val confirmedUrl = repository.setAvatar(dataUrl)
                        updateProfile { it.copy(avatarUrl = confirmedUrl) }
                        toasts.success(avatarUpdatedMessage, "camera")
                    }
                } catch (t: Throwable) {
                    NativeDebug.e("SettingsScreen setAvatar failed", t)
                    toasts.error(avatarUploadFailedMessage)
                } finally {
                    changingAvatar = false
                }
            }
        }
    }

    fun pickAvatar() {
        avatarPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    fun removeAvatar() {
        if (changingAvatar) return
        changingAvatar = true
        scope.launch {
            try {
                repository.removeAvatar()
                updateProfile { it.copy(avatarUrl = null) }
                toasts.show(avatarRemovedMessage, icon = "camera")
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen removeAvatar failed", t)
                toasts.error(avatarRemoveFailedMessage)
            } finally {
                changingAvatar = false
            }
        }
    }

    /** Flips at once and flips back if the server refuses, like the web's
     *  handleShowOnLoginToggle. */
    fun toggleShowOnLogin(value: Boolean) {
        if (changingShowOnLogin) return
        changingShowOnLogin = true
        updateProfile { it.copy(showOnLogin = value) }
        scope.launch {
            try {
                val confirmed = repository.setShowOnLogin(value)
                updateProfile { it.copy(showOnLogin = confirmed) }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setShowOnLogin failed", t)
                updateProfile { it.copy(showOnLogin = !value) }
                toasts.error(showOnLoginFailedMessage)
            } finally {
                changingShowOnLogin = false
            }
        }
    }

    /** The web saves the choice then reloads the whole app, landing on the
     *  notes list; here the panel closes and the Activity restarts in the
     *  new language. */
    fun changeLanguage(value: String?) {
        val previous = profile?.language
        if (changingLanguage || value == previous) return
        changingLanguage = true
        updateProfile { it.copy(language = value) }
        scope.launch {
            try {
                val confirmed = repository.setLanguage(value)
                updateProfile { it.copy(language = confirmed) }
                onBack()
                AppLanguage.apply(confirmed)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setLanguage failed", t)
                updateProfile { it.copy(language = previous) }
                toasts.error(languageSaveErrorMessage)
            } finally {
                changingLanguage = false
            }
        }
    }

    fun changeTheme(id: String) {
        if (changingTheme || id == themeId) return
        changingTheme = true
        // Applied immediately and kept even if the save below fails: the
        // web's own choose() applies and caches the theme first, and only
        // says the server copy could not be written.
        container.themeState.apply(id)
        scope.launch {
            try {
                repository.setShellTheme(id)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setShellTheme failed", t)
                toasts.error(themeSaveErrorMessage)
            } finally {
                changingTheme = false
            }
        }
    }

    val editorPrefs = container.editorPrefs
    val shellPrefs = container.shellPrefs

    /** buildPatch() (UserAiSettingsSection.jsx:120-132): the whole config
     *  every time, with [enabled] or [mode] for the one field the caller
     *  is actually changing, and the key only when something was typed. */
    fun aiPatch(
        enabled: Boolean = aiSettings?.enabled ?: false,
        mode: String = aiSettings?.mode ?: "server",
    ) = UserAiSettingsRequest(
        enabled = enabled,
        mode = mode,
        baseUrl = aiDraft.baseUrl.trim(),
        model = aiDraft.model.trim(),
        temperature = jsNumberOf(aiDraft.temperature),
        maxTokens = jsNumberOf(aiDraft.maxTokens).roundToInt(),
        apiKey = aiDraft.apiKey.takeIf { it.isNotEmpty() },
    )

    /** The failed test's line (UserAiSettingsSection.jsx:211-223): the
     *  reason reworded, plus the provider's own detail it would drop. */
    fun aiTestFailure(raw: String): String {
        val localized = context.localizedServerError(raw, R.string.native_settings_ai_test_failed)
        val detail = (AiProviderErrorRegex.find(raw) ?: AiUnreachableErrorRegex.find(raw))?.groupValues?.get(1)
        return if (detail != null && detail !in localized) "$localized : $detail" else localized
    }

    fun saveAiSettings(request: UserAiSettingsRequest, successMessage: String?) {
        if (savingAi) return
        savingAi = true
        aiTestOutcome = null
        scope.launch {
            try {
                applyAiSettings(repository.setUserAiSettings(request))
                successMessage?.let { toasts.success(it) }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setUserAiSettings failed", t)
                toasts.error(context.localizedServerError(context.requestErrorText(t), R.string.native_settings_save_failed))
            } finally {
                savingAi = false
            }
        }
    }

    fun testAiSettings() {
        val current = aiSettings ?: return
        if (testingAi) return
        testingAi = true
        aiTestOutcome = null
        scope.launch {
            try {
                val request = if (current.mode == "custom") {
                    UserAiTestRequest(
                        mode = "custom",
                        baseUrl = aiDraft.baseUrl.trim(),
                        model = aiDraft.model.trim(),
                        temperature = jsNumberOf(aiDraft.temperature),
                        maxTokens = jsNumberOf(aiDraft.maxTokens).roundToInt(),
                        apiKey = aiDraft.apiKey.takeIf { it.isNotEmpty() },
                    )
                } else {
                    UserAiTestRequest(mode = "server")
                }
                val result = repository.testUserAi(request)
                aiTestOutcome = if (result.ok) {
                    // The reply itself is worth showing: it is how you
                    // tell a working endpoint from a reachable one.
                    val reply = result.reply?.takeIf { it.isNotEmpty() }
                    AiTestOutcome(true, if (reply != null) "$aiTestOkMessage : $reply" else aiTestOkMessage)
                } else {
                    AiTestOutcome(false, aiTestFailure(result.error.orEmpty()))
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen testUserAi failed", t)
                aiTestOutcome = AiTestOutcome(false, aiTestFailure(context.requestErrorText(t)))
            } finally {
                testingAi = false
            }
        }
    }

    fun toggleSoundCategory(category: NotifCategory, enabled: Boolean) {
        val previous = editorPrefs.notificationsSoundTypes
        savePreference("notificationsSoundTypes", previous, previous.with(category, enabled), editorPrefs::applyNotificationsSoundTypes) {
            repository.setNotificationsSoundTypes(it.values)
        }
    }

    fun toggleFilterCategory(category: NotifCategory, enabled: Boolean) {
        val previous = editorPrefs.notificationsFilterTypes
        savePreference("notificationsFilterTypes", previous, previous.with(category, enabled), editorPrefs::applyNotificationsFilterTypes) {
            repository.setNotificationsFilterTypes(it.values)
        }
    }

    /** Saves the whole presets blob on every edit, same as the web's own
     *  setPresets: the modal has no Save button, each control is applied
     *  as it is touched. Local first like the web, whose PATCH failure is
     *  silent and leaves the change on screen. */
    fun changeTypography(presets: TypographyPresets) {
        editorPrefs.applyTypography(presets)
        scope.launch {
            try {
                repository.setTypographyPresets(presets)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setTypographyPresets failed", t)
            }
        }
    }

    // The update messages were Android's own toasts in the WebView era
    // too: the check has always run natively (WebViewActivity's
    // checkForUpdate / installAvailableUpdate bridge).
    fun checkForUpdate() {
        Toast.makeText(context, R.string.update_checking, Toast.LENGTH_SHORT).show()
        UpdateManager.forceCheck(context) { release ->
            availableUpdate = release
            if (release == null) Toast.makeText(context, R.string.update_up_to_date, Toast.LENGTH_LONG).show()
        }
    }

    fun downloadUpdate(release: ReleaseInfo) {
        Toast.makeText(context, R.string.update_downloading, Toast.LENGTH_SHORT).show()
        UpdateManager.downloadAndInstall(context, release) { ok ->
            if (!ok) Toast.makeText(context, R.string.update_download_failed, Toast.LENGTH_LONG).show()
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            // .gk-side-panel on a phone: the panel is opaque
            // --gk-statusbar, not the page background behind it, with a
            // 1px --border-light left edge.
            .background(WorkspaceTheme.statusBarColor(themeId, dark))
            .drawBehind { drawRect(borderColor, size = Size(1.dp.toPx(), size.height)) },
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .padding(start = 1.dp)
                .windowInsetsPadding(WindowInsets.systemBars),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SettingsIcon(size = 20.dp, tint = titleColor)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.native_settings_title),
                        color = titleColor,
                        fontSize = 18.sp,
                        lineHeight = 28.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                SidePanelCloseButton(titleColor, onBack)
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))

            BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
                val bodyMinHeight = maxHeight
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = bodyMinHeight)
                        .padding(16.dp),
                    // Two children only, so SpaceBetween is the web's
                    // `mt-auto` on the version badge: it sits at the
                    // bottom while the sections fit, and flows right
                    // after them once they don't.
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        profile?.let { current ->
                            ProfileBlock(
                                profile = current,
                                accent = accent,
                                titleColor = titleColor,
                                avatarEnabled = !changingAvatar,
                                onPickAvatar = { pickAvatar() },
                                onRemoveAvatar = { removeAvatar() },
                                onChangeServer = { showChangeServerDialog = true },
                            )
                        }

                        SettingsAccordionSection(
                            title = stringResource(R.string.native_settings_security_section),
                            expanded = securityOpen,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            icon = { tint -> ShieldLockIcon(size = 20.dp, tint = tint) },
                            onToggle = { securityOpen = !securityOpen },
                        ) {
                            SettingsSwitchRow(
                                title = stringResource(R.string.native_settings_show_on_login),
                                subtitle = null,
                                checked = profile?.showOnLogin ?: true,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> TablerEyeIcon(size = 20.dp, tint = tint) },
                                onCheckedChange = { toggleShowOnLogin(it) },
                            )

                            SettingsCardButton(
                                title = stringResource(R.string.native_settings_change_password),
                                subtitle = stringResource(R.string.native_settings_change_password_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                icon = { tint -> TablerKeyIcon(size = 20.dp, tint = tint) },
                                onClick = { onBack(); actions.openChangePassword() },
                            )

                            // mt-5 on the web, where the rows are
                            // already 12px apart (SettingsPanel.jsx:432).
                            QrSignInCard(
                                quickEnabled = shellPrefs.qrQuickEnabled,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                modifier = Modifier.padding(top = 8.dp),
                                onOpenScanner = onOpenQrScanner,
                                onQuickChange = { enabled ->
                                    savePreference("qrQuickEnabled", shellPrefs.qrQuickEnabled, enabled, shellPrefs::applyQrQuick) {
                                        repository.setQrQuick(it)
                                    }
                                },
                            )

                            val isAdmin = profile?.isAdmin == true
                            PasskeysCard(
                                passkeys = passkeys,
                                available = passkeysAvailable,
                                isAdmin = isAdmin,
                                encryptionEnabled = instanceStatus?.enabled == true,
                                instanceUnlocked = instanceStatus?.unlocked == true,
                                listOpen = passkeyListOpen,
                                adding = addingPasskey,
                                testingId = testingPasskeyId,
                                busyId = busyPasskeyId,
                                untitledLabel = passkeyUntitledLabel,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                onToggleList = { passkeyListOpen = !passkeyListOpen },
                                onAdd = { showAddPasskeyDialog = true },
                                onOpenDomainSetting = onOpenPasskeyDomainSetting,
                                onTest = { testPasskey(it) },
                                onRename = { renamePasskeyTarget = it },
                                onDelete = { pendingDeletePasskeyId = it },
                                onToggleUnlock = { passkey ->
                                    if (passkey.canUnlockInstance) {
                                        disablePasskeyUnlock(passkey.credentialId)
                                    } else {
                                        pendingUnlockPasskeyId = passkey.credentialId
                                    }
                                },
                            )
                        }

                        SettingsAccordionSection(
                            title = stringResource(R.string.native_settings_ui_section),
                            expanded = uiOpen,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            icon = { tint -> AdjustmentsIcon(size = 20.dp, tint = tint) },
                            onToggle = { uiOpen = !uiOpen },
                            contentSpacing = 16.dp,
                        ) {
                            SettingsSwitchRow(
                                title = stringResource(R.string.native_settings_sidebar_wide),
                                subtitle = stringResource(R.string.native_settings_sidebar_wide_desc),
                                checked = shellPrefs.alwaysShowSidebarOnWide,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> LayoutSidebarIcon(size = 20.dp, tint = tint) },
                                onCheckedChange = { enabled ->
                                    savePreference(
                                        "alwaysShowSidebarOnWide",
                                        shellPrefs.alwaysShowSidebarOnWide,
                                        enabled,
                                        shellPrefs::applyAlwaysShowSidebarOnWide,
                                    ) { repository.setAlwaysShowSidebarOnWide(it) }
                                },
                            )
                            if (shellPrefs.alwaysShowSidebarOnWide) {
                                SidebarBreakpointPicker(
                                    breakpoint = shellPrefs.sidebarBreakpoint,
                                    menuOpen = sidebarBreakpointMenuOpen,
                                    themeId = themeId,
                                    dark = dark,
                                    titleColor = titleColor,
                                    borderColor = borderColor,
                                    onToggleMenu = { sidebarBreakpointMenuOpen = !sidebarBreakpointMenuOpen },
                                    onDismissMenu = { sidebarBreakpointMenuOpen = false },
                                    onSelect = { widthPx ->
                                        sidebarBreakpointMenuOpen = false
                                        savePreference(
                                            "sidebarBreakpoint",
                                            shellPrefs.sidebarBreakpoint,
                                            widthPx,
                                            shellPrefs::applySidebarBreakpoint,
                                        ) { repository.setSidebarBreakpoint(it) }
                                    },
                                )
                            }
                            SettingsSwitchRow(
                                title = stringResource(R.string.native_settings_edge_to_edge_landscape),
                                subtitle = stringResource(R.string.native_settings_edge_to_edge_landscape_desc),
                                checked = shellPrefs.edgeToEdgeLandscape,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> DeviceMobileRotatedIcon(size = 20.dp, tint = tint) },
                                onCheckedChange = { enabled ->
                                    savePreference(
                                        "edgeToEdgeLandscape",
                                        shellPrefs.edgeToEdgeLandscape,
                                        enabled,
                                        shellPrefs::applyEdgeToEdgeLandscape,
                                    ) { repository.setEdgeToEdgeLandscape(it) }
                                },
                            )
                            SettingsSwitchRow(
                                title = stringResource(R.string.native_settings_animations),
                                subtitle = stringResource(R.string.native_settings_animations_desc),
                                checked = shellPrefs.floatingCards,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> SparklesIcon(size = 20.dp, tint = tint) },
                                onCheckedChange = { enabled ->
                                    savePreference("floatingCardsEnabled", shellPrefs.floatingCards, enabled, shellPrefs::applyFloatingCards) {
                                        repository.setFloatingCards(it)
                                    }
                                },
                            )
                            // The web fences the theme picker off from the
                            // switches above with a hairline and 8px of
                            // padding under it (SettingsPanel.jsx:656).
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .topHairline(borderColor)
                                    .padding(top = 9.dp)
                                    .padding(horizontal = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                SettingsRowHeader(
                                    title = stringResource(R.string.native_settings_theme_title),
                                    subtitle = stringResource(R.string.native_settings_theme_desc),
                                    themeId = themeId,
                                    dark = dark,
                                    titleColor = titleColor,
                                    icon = { tint -> PaintRollerIcon(size = 20.dp, tint = tint) },
                                )
                                ThemeGrid(
                                    currentThemeId = themeId,
                                    dark = dark,
                                    titleColor = titleColor,
                                    borderColor = borderColor,
                                    accent = accent,
                                    onSelect = { changeTheme(it) },
                                )
                            }
                        }

                        SettingsAccordionSection(
                            title = stringResource(R.string.native_settings_notifications_section),
                            expanded = notificationsOpen,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            icon = { tint -> TablerBellIcon(size = 20.dp, tint = tint) },
                            onToggle = { notificationsOpen = !notificationsOpen },
                            // The push row sits 8px under the rest (mt-2).
                            contentSpacing = 8.dp,
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().settingsCardBorder(borderColor).padding(13.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    SettingsRowHeader(
                                        title = stringResource(R.string.native_settings_notif_position),
                                        subtitle = stringResource(R.string.native_settings_notif_position_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        icon = { tint -> FloatCenterIcon(size = 20.dp, tint = tint) },
                                        modifier = Modifier.weight(1f),
                                    )
                                    Spacer(Modifier.width(12.dp))
                                    GkSegmented(
                                        options = listOf(
                                            GkSegmentOption("top", stringResource(R.string.native_settings_notif_position_top)),
                                            GkSegmentOption("bottom", stringResource(R.string.native_settings_notif_position_bottom)),
                                        ),
                                        selectedId = editorPrefs.toastPosition,
                                        themeId = themeId,
                                        dark = dark,
                                        onSelect = { position ->
                                            savePreference("notificationsPositionMobile", editorPrefs.toastPosition, position, editorPrefs::applyToastPosition) {
                                                repository.setToastPosition(it)
                                            }
                                        },
                                        borderColor = borderColor,
                                        idleBackground = Color.Transparent,
                                        idleTextColor = if (dark) Gray200 else Gray700,
                                    )
                                }

                                Column {
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        SettingsRowHeader(
                                            title = stringResource(R.string.native_settings_notif_sound),
                                            subtitle = stringResource(R.string.native_settings_notif_sound_desc),
                                            themeId = themeId,
                                            dark = dark,
                                            titleColor = titleColor,
                                            icon = { tint -> VolumeIcon(size = 20.dp, tint = tint) },
                                            modifier = Modifier.weight(1f),
                                        )
                                        Spacer(Modifier.width(12.dp))
                                        CategoryListToggle(
                                            open = notifSoundTypesOpen,
                                            label = stringResource(R.string.native_settings_notif_sound_types),
                                            themeId = themeId,
                                            dark = dark,
                                            onClick = { notifSoundTypesOpen = !notifSoundTypesOpen },
                                        )
                                        Spacer(Modifier.width(4.dp))
                                        GkSwitch(
                                            checked = editorPrefs.notificationsSound,
                                            themeId = themeId,
                                            dark = dark,
                                            onCheckedChange = { enabled ->
                                                savePreference("notificationsSound", editorPrefs.notificationsSound, enabled, editorPrefs::applyNotificationsSound) {
                                                    repository.setNotificationsSound(it)
                                                }
                                            },
                                        )
                                    }
                                    if (notifSoundTypesOpen) {
                                        NotifCategoryList(
                                            categories = NotifCategory.SOUND,
                                            flags = editorPrefs.notificationsSoundTypes,
                                            // Every row greys out while the
                                            // master switch is off: nothing
                                            // would ring anyway.
                                            enabled = editorPrefs.notificationsSound,
                                            themeId = themeId,
                                            dark = dark,
                                            titleColor = titleColor,
                                            borderColor = borderColor,
                                            onToggle = { category, on -> toggleSoundCategory(category, on) },
                                        )
                                    }
                                }

                                Column {
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        SettingsRowHeader(
                                            title = stringResource(R.string.native_settings_notif_filter),
                                            subtitle = stringResource(R.string.native_settings_notif_filter_desc),
                                            themeId = themeId,
                                            dark = dark,
                                            titleColor = titleColor,
                                            icon = { tint -> TablerBellIcon(size = 20.dp, tint = tint) },
                                            modifier = Modifier.weight(1f),
                                        )
                                        Spacer(Modifier.width(12.dp))
                                        CategoryListToggle(
                                            open = notifFilterTypesOpen,
                                            label = stringResource(R.string.native_settings_notif_filter_types),
                                            themeId = themeId,
                                            dark = dark,
                                            onClick = { notifFilterTypesOpen = !notifFilterTypesOpen },
                                        )
                                    }
                                    if (notifFilterTypesOpen) {
                                        NotifCategoryList(
                                            categories = NotifCategory.FILTER,
                                            flags = editorPrefs.notificationsFilterTypes,
                                            enabled = true,
                                            themeId = themeId,
                                            dark = dark,
                                            titleColor = titleColor,
                                            borderColor = borderColor,
                                            onToggle = { category, on -> toggleFilterCategory(category, on) },
                                        )
                                    }
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth().settingsCardBorder(borderColor).padding(13.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    SettingsRowHeader(
                                        title = stringResource(R.string.native_settings_notif_duration),
                                        subtitle = stringResource(R.string.native_settings_notif_duration_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        icon = { tint -> ClockIcon(size = 20.dp, tint = tint) },
                                        modifier = Modifier.weight(1f),
                                    )
                                    Spacer(Modifier.width(12.dp))
                                    ToastDurationPicker(
                                        durationMs = editorPrefs.toastDurationMs,
                                        menuOpen = toastDurationMenuOpen,
                                        themeId = themeId,
                                        dark = dark,
                                        borderColor = borderColor,
                                        onToggleMenu = { toastDurationMenuOpen = !toastDurationMenuOpen },
                                        onDismissMenu = { toastDurationMenuOpen = false },
                                        onSelect = { durationMs ->
                                            toastDurationMenuOpen = false
                                            savePreference("notificationsDuration", editorPrefs.toastDurationMs, durationMs, editorPrefs::applyToastDuration) {
                                                repository.setToastDuration(it)
                                            }
                                        },
                                    )
                                }
                            }

                            PushNotificationsRow(themeId = themeId, dark = dark, titleColor = titleColor)
                        }

                        SettingsAccordionSection(
                            title = stringResource(R.string.native_settings_notes_section),
                            expanded = notesOpen,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            icon = { tint -> NoteTablerIcon(size = 20.dp, tint = tint) },
                            onToggle = { notesOpen = !notesOpen },
                            contentSpacing = 16.dp,
                        ) {
                            SettingsSwitchRow(
                                title = stringResource(R.string.native_settings_read_mode),
                                subtitle = stringResource(R.string.native_settings_read_mode_desc),
                                checked = editorPrefs.readModeEnabled,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> TablerEyeIcon(size = 20.dp, tint = tint) },
                                onCheckedChange = { enabled ->
                                    savePreference("readModeEnabled", editorPrefs.readModeEnabled, enabled, editorPrefs::applyReadMode) {
                                        repository.setReadMode(it)
                                    }
                                },
                            )
                            SettingsStackedRow(
                                title = stringResource(R.string.native_settings_editor_toolbar_mode),
                                subtitle = stringResource(
                                    if (editorPrefs.toolbarMode == "advanced") {
                                        R.string.native_settings_editor_toolbar_advanced_desc
                                    } else {
                                        R.string.native_settings_editor_toolbar_simple_desc
                                    },
                                ),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> HeadingIcon(size = 20.dp, tint = tint) },
                            ) {
                                GkSegmented(
                                    options = listOf(
                                        GkSegmentOption("simple", stringResource(R.string.native_settings_editor_toolbar_simple)),
                                        GkSegmentOption("advanced", stringResource(R.string.native_settings_editor_toolbar_advanced)),
                                    ),
                                    selectedId = editorPrefs.toolbarMode,
                                    themeId = themeId,
                                    dark = dark,
                                    onSelect = { mode ->
                                        savePreference("editorToolbarMode", editorPrefs.toolbarMode, mode, editorPrefs::applyToolbarMode) {
                                            repository.setEditorToolbarMode(it)
                                        }
                                    },
                                )
                            }
                            SettingsStackedRow(
                                title = stringResource(R.string.native_typography_title),
                                subtitle = stringResource(R.string.native_typography_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> TypographyIcon(size = 20.dp, tint = tint) },
                                subtitleColor = if (dark) Gray400 else SettingsSubtleColor,
                            ) {
                                GkGradientButton(
                                    label = stringResource(R.string.native_typography_open),
                                    themeId = themeId,
                                    onClick = { showTypographyModal = true },
                                )
                            }
                            SettingsStackedRow(
                                title = stringResource(R.string.native_settings_paste_title),
                                subtitle = stringResource(
                                    if (editorPrefs.pasteMode == "plain") {
                                        R.string.native_settings_paste_plain_desc
                                    } else {
                                        R.string.native_settings_paste_rich_desc
                                    },
                                ),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> ClipboardIcon(size = 20.dp, tint = tint) },
                            ) {
                                GkSegmented(
                                    options = listOf(
                                        GkSegmentOption("rich", stringResource(R.string.native_settings_paste_rich)),
                                        GkSegmentOption("plain", stringResource(R.string.native_settings_paste_plain)),
                                    ),
                                    selectedId = editorPrefs.pasteMode,
                                    themeId = themeId,
                                    dark = dark,
                                    onSelect = { mode ->
                                        savePreference("pasteMode", editorPrefs.pasteMode, mode, editorPrefs::applyPasteMode) {
                                            repository.setPasteMode(it)
                                        }
                                    },
                                )
                            }

                            SettingsSubHeading(stringResource(R.string.native_settings_checklist_group), dark)

                            SettingsStackedRow(
                                title = stringResource(R.string.native_settings_checklist_insert_position),
                                subtitle = stringResource(R.string.native_settings_checklist_insert_position_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> IndentIncreaseIcon(size = 20.dp, tint = tint) },
                            ) {
                                GkSegmented(
                                    options = listOf(
                                        GkSegmentOption("top", stringResource(R.string.native_settings_checklist_insert_top)),
                                        GkSegmentOption("bottom", stringResource(R.string.native_settings_checklist_insert_bottom)),
                                    ),
                                    selectedId = editorPrefs.checklistInsertPosition,
                                    themeId = themeId,
                                    dark = dark,
                                    onSelect = { position ->
                                        savePreference(
                                            "checklistInsertPosition",
                                            editorPrefs.checklistInsertPosition,
                                            position,
                                            editorPrefs::applyChecklistInsertPosition,
                                        ) { repository.setChecklistInsertPosition(it) }
                                    },
                                )
                            }
                            SettingsStackedRow(
                                title = stringResource(R.string.native_settings_checklist_remove_section),
                                subtitle = stringResource(R.string.native_settings_checklist_remove_section_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                icon = { tint -> FilterQuestionIcon(size = 20.dp, tint = tint) },
                            ) {
                                GkSegmented(
                                    options = listOf(
                                        GkSegmentOption("cascade", stringResource(R.string.native_settings_checklist_remove_cascade)),
                                        GkSegmentOption("keep", stringResource(R.string.native_settings_checklist_remove_keep)),
                                    ),
                                    selectedId = editorPrefs.checklistRemoveSectionBehavior,
                                    themeId = themeId,
                                    dark = dark,
                                    onSelect = { behavior ->
                                        savePreference(
                                            "checklistRemoveSectionBehavior",
                                            editorPrefs.checklistRemoveSectionBehavior,
                                            behavior,
                                            editorPrefs::applyChecklistRemoveSectionBehavior,
                                        ) { repository.setChecklistRemoveSectionBehavior(it) }
                                    },
                                )
                            }
                        }

                        SettingsAccordionSection(
                            title = stringResource(R.string.native_settings_data_section),
                            expanded = dataOpen,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            icon = { tint -> DatabaseIcon(size = 20.dp, tint = tint) },
                            onToggle = { dataOpen = !dataOpen },
                        ) {
                            SettingsCardButton(
                                title = stringResource(R.string.native_settings_export_all),
                                subtitle = stringResource(R.string.native_settings_export_all_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                icon = { tint -> UploadIcon(size = 20.dp, tint = tint) },
                                onClick = { onBack(); actions.exportAll() },
                            )
                            SettingsCardButton(
                                title = stringResource(R.string.native_settings_import_json),
                                subtitle = stringResource(R.string.native_settings_import_json_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                icon = { tint -> TablerDownloadIcon(size = 20.dp, tint = tint) },
                                onClick = { onBack(); actions.pickGlassKeepExport() },
                            )
                            SettingsCardButton(
                                title = stringResource(R.string.native_settings_import_gkeep),
                                subtitle = stringResource(R.string.native_settings_import_gkeep_desc),
                                subtitleLink = SettingsInlineLink(
                                    stringResource(R.string.native_settings_import_gkeep_help),
                                    GoogleTakeoutHelpUrl,
                                ),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                icon = { tint -> BrandGoogleIcon(size = 20.dp, tint = tint) },
                                onClick = { onBack(); actions.pickGoogleKeep() },
                            )
                            SettingsCardButton(
                                title = stringResource(R.string.native_settings_import_markdown),
                                subtitle = stringResource(R.string.native_settings_import_markdown_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                icon = { tint -> FileTextIcon(size = 20.dp, tint = tint) },
                                onClick = { onBack(); actions.pickMarkdown() },
                            )
                            SettingsCardButton(
                                title = stringResource(R.string.native_settings_secret_key_generate),
                                subtitle = stringResource(R.string.native_settings_secret_key_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                icon = { tint -> TablerKeyIcon(size = 20.dp, tint = tint) },
                                onClick = { onBack(); actions.downloadSecretKey() },
                            )
                            SettingsCardButton(
                                title = stringResource(R.string.native_settings_reset_order),
                                subtitle = stringResource(R.string.native_settings_reset_order_desc),
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                icon = { tint -> ArrowsSortIcon(size = 20.dp, tint = tint) },
                                onClick = { showResetOrderConfirm = true },
                            )
                        }

                        SettingsAccordionSection(
                            title = stringResource(R.string.native_settings_ai_section),
                            expanded = aiOpen,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            icon = { tint -> BrainIcon(size = 20.dp, tint = tint) },
                            onToggle = { aiOpen = !aiOpen },
                        ) {
                            val ai = aiSettings ?: UserAiSettingsDto()
                            AiSettingsSection(
                                settings = ai,
                                draft = aiDraft,
                                testOutcome = aiTestOutcome,
                                busy = savingAi || aiLoading,
                                testing = testingAi,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                onToggleEnabled = { saveAiSettings(aiPatch(enabled = it), null) },
                                onSelectMode = { mode ->
                                    if (mode != ai.mode) saveAiSettings(aiPatch(mode = mode), null)
                                },
                                onDraftChange = { aiDraft = it },
                                // The key alone, empty on purpose:
                                // that is how the server is told to
                                // forget the stored one, and unsaved
                                // edits stay unsaved.
                                onClearApiKey = {
                                    saveAiSettings(UserAiSettingsRequest(apiKey = ""), aiKeyClearedMessage)
                                },
                                onTest = { testAiSettings() },
                                onSave = { saveAiSettings(aiPatch(), aiSavedMessage) },
                            )
                        }

                        SettingsAccordionSection(
                            title = stringResource(R.string.native_settings_app_section),
                            expanded = appOpen,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            icon = { tint -> RefreshIcon(size = 20.dp, tint = tint) },
                            onToggle = { appOpen = !appOpen },
                        ) {
                            val release = availableUpdate
                            when {
                                installedFromFdroid -> SettingsCardButton(
                                    title = stringResource(R.string.native_settings_open_fdroid),
                                    subtitle = null,
                                    themeId = themeId,
                                    dark = dark,
                                    titleColor = titleColor,
                                    borderColor = borderColor,
                                    icon = { tint -> TablerDownloadIcon(size = 20.dp, tint = tint) },
                                    onClick = { openFdroidPage(context) },
                                    footer = {
                                        Text(
                                            stringResource(R.string.native_settings_update_fdroid),
                                            color = SettingsSubtleColor,
                                            fontSize = 14.sp,
                                            lineHeight = 20.sp,
                                            modifier = Modifier.padding(top = 2.dp),
                                        )
                                        VersionLine(dark)
                                    },
                                )
                                release != null -> UpdateAvailableCard(
                                    release = release,
                                    themeId = themeId,
                                    dark = dark,
                                    titleColor = titleColor,
                                    onLater = {
                                        UpdateManager.clearAvailableRelease(context)
                                        availableUpdate = null
                                    },
                                    onDownload = { downloadUpdate(release) },
                                )
                                else -> SettingsCardButton(
                                    title = stringResource(R.string.native_settings_check_update),
                                    subtitle = stringResource(R.string.native_settings_check_update_desc),
                                    themeId = themeId,
                                    dark = dark,
                                    titleColor = titleColor,
                                    borderColor = borderColor,
                                    icon = { tint -> TablerDownloadIcon(size = 20.dp, tint = tint) },
                                    onClick = { checkForUpdate() },
                                    footer = { VersionLine(dark) },
                                )
                            }
                        }

                        SettingsAccordionSection(
                            title = stringResource(R.string.native_settings_language_section),
                            expanded = languageOpen,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            icon = { tint -> WorldIcon(size = 20.dp, tint = tint) },
                            onToggle = { languageOpen = !languageOpen },
                        ) {
                            LanguageRow(
                                language = profile?.language,
                                menuOpen = languageMenuOpen,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                borderColor = borderColor,
                                onToggleMenu = { languageMenuOpen = !languageMenuOpen },
                                onDismissMenu = { languageMenuOpen = false },
                                onSelect = { languageMenuOpen = false; changeLanguage(it) },
                            )
                        }
                    }

                    Box(Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.CenterEnd) {
                        Text(
                            "v${BuildConfig.VERSION_NAME}",
                            color = if (dark) Gray600 else Gray400,
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                        )
                    }
                }
            }
        }

        if (showTypographyModal) {
            TypographyModal(
                presets = editorPrefs.typography,
                themeId = themeId,
                dark = dark,
                onChange = { changeTypography(it) },
                onDismiss = { showTypographyModal = false },
            )
        }

        if (showAddPasskeyDialog) {
            PasskeyNameDialog(
                title = stringResource(R.string.native_settings_passkeys_add),
                message = stringResource(R.string.native_settings_passkeys_name_prompt),
                initialName = "",
                confirmLabel = stringResource(R.string.native_settings_passkeys_add),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onSubmit = { addPasskey(it.trim()) },
                onDismiss = { showAddPasskeyDialog = false },
            )
        }

        renamePasskeyTarget?.let { target ->
            PasskeyNameDialog(
                title = stringResource(R.string.native_settings_passkeys_rename),
                message = stringResource(R.string.native_settings_passkeys_rename_prompt),
                initialName = target.name.orEmpty(),
                confirmLabel = stringResource(R.string.native_settings_passkeys_rename),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onSubmit = { renamePasskey(target.credentialId, it) },
                onDismiss = { renamePasskeyTarget = null },
            )
        }

        pendingDeletePasskeyId?.let { credentialId ->
            GkConfirmDialog(
                title = stringResource(R.string.native_settings_passkeys_delete_confirm_title),
                message = stringResource(R.string.native_settings_passkeys_delete_confirm_body),
                confirmLabel = stringResource(R.string.native_settings_passkeys_delete),
                cancelLabel = stringResource(R.string.native_dialog_cancel),
                themeId = themeId,
                dark = dark,
                borderColor = borderColor,
                titleColor = titleColor,
                subtextColor = if (dark) DialogBodyDark else DialogBodyLight,
                variant = GkConfirmVariant.DANGER,
                onConfirm = { deletePasskey(credentialId) },
                onDismiss = { pendingDeletePasskeyId = null },
            )
        }

        pendingUnlockPasskeyId?.let { credentialId ->
            GkConfirmDialog(
                title = stringResource(R.string.native_settings_passkeys_enable_unlock),
                message = stringResource(R.string.native_settings_passkeys_enable_unlock_explain),
                confirmLabel = stringResource(R.string.native_settings_passkeys_enable_unlock),
                cancelLabel = stringResource(R.string.native_dialog_cancel),
                themeId = themeId,
                dark = dark,
                borderColor = borderColor,
                titleColor = titleColor,
                subtextColor = if (dark) DialogBodyDark else DialogBodyLight,
                onConfirm = { enablePasskeyUnlock(credentialId) },
                onDismiss = { pendingUnlockPasskeyId = null },
            )
        }

        if (showResetOrderConfirm) {
            ResetNoteOrderDialog(
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onConfirm = {
                    showResetOrderConfirm = false
                    onBack()
                    actions.resetNoteOrder()
                },
                onDismiss = { showResetOrderConfirm = false },
            )
        }

        if (showChangeServerDialog) {
            ChangeServerDialog(
                dark = dark,
                onConfirm = { showChangeServerDialog = false; scope.launch { switchServer(container, activity, toasts) } },
                onDismiss = { showChangeServerDialog = false },
            )
        }
    }
}

/** Number() on a typed field: blank reads as 0, and so does anything
 *  that is not a number at all. */
private fun jsNumberOf(text: String): Double = text.trim().toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0

/** A number as JavaScript prints it: a whole one without its ".0". */
private fun jsNumberText(value: Double): String =
    if (value % 1.0 == 0.0 && abs(value) < 1e15) value.toLong().toString() else value.toString()

/** What PasskeySettingsSection.jsx reads as the user closing the system
 *  sheet rather than a failure. */
internal val PasskeyCancelRegex = Regex("""not[\s_-]*allowed|cancel|abort|interrupt|annul""", RegexOption.IGNORE_CASE)

private val AiProviderErrorRegex = Regex("""^AI provider error:\s*(.+)$""")
private val AiUnreachableErrorRegex = Regex("""^Failed to reach AI provider\s*\((.+)\)\.?$""")

/** f-droid.org resolves to whichever F-Droid client is installed; the
 *  section only shows this when the APK came from one of them. */
private fun openFdroidPage(context: Context) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://f-droid.org/packages/${context.packageName}/"))
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (t: Throwable) {
        NativeDebug.e("SettingsScreen openFdroidPage failed", t)
    }
}

/** The avatar, name and account links heading the panel: `mb-4` under the
 *  row plus the `mb-8` wrapper (SettingsPanel.jsx:319-367). */
@Composable
private fun ProfileBlock(
    profile: ProfileDto,
    accent: Color,
    titleColor: Color,
    avatarEnabled: Boolean,
    onPickAvatar: () -> Unit,
    onRemoveAvatar: () -> Unit,
    onChangeServer: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(bottom = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarCircle(
            avatarUrl = profile.avatarUrl,
            name = profile.name.ifBlank { profile.email },
            size = 64.dp,
            onClick = onPickAvatar,
        )
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text(
                profile.name.ifBlank { profile.email },
                color = titleColor,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(modifier = Modifier.padding(top = 4.dp)) {
                ProfileLink(
                    label = if (profile.avatarUrl != null) {
                        stringResource(R.string.native_settings_change_avatar)
                    } else {
                        stringResource(R.string.native_settings_upload_avatar)
                    },
                    color = accent,
                    enabled = avatarEnabled,
                    onClick = onPickAvatar,
                )
                if (profile.avatarUrl != null) {
                    Spacer(Modifier.width(8.dp))
                    ProfileLink(
                        label = stringResource(R.string.native_settings_remove_avatar),
                        color = LinkRed,
                        enabled = avatarEnabled,
                        onClick = onRemoveAvatar,
                    )
                }
            }
            Row(modifier = Modifier.padding(top = 4.dp)) {
                ProfileLink(
                    label = stringResource(R.string.native_settings_change_server),
                    color = accent,
                    enabled = true,
                    onClick = onChangeServer,
                )
            }
        }
    }
}

/** The 12px accent links under the profile name. */
@Composable
private fun ProfileLink(label: String, color: Color, enabled: Boolean, onClick: () -> Unit) {
    Text(
        label,
        color = color,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        modifier = Modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            enabled = enabled,
            role = Role.Button,
        ) { onClick() },
    )
}

/**
 * The "Connecter un autre appareil" card (SettingsPanel.jsx:422-472): the
 * whole card opens the scanner, its icon at the top, and under the
 * description the header-shortcut label and its Show/Hide control, which
 * wrap onto their own lines on a phone. That line swallows its own taps,
 * the web's stopPropagation, so it never opens the scanner.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QrSignInCard(
    quickEnabled: Boolean,
    themeId: String,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    modifier: Modifier,
    onOpenScanner: () -> Unit,
    onQuickChange: (Boolean) -> Unit,
) {
    SettingsCardButton(
        title = stringResource(R.string.native_settings_qr_signin),
        subtitle = stringResource(R.string.native_settings_qr_signin_desc),
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        borderColor = borderColor,
        modifier = modifier,
        iconAlignment = Alignment.Top,
        icon = { tint -> QrCodeIcon(size = 20.dp, tint = tint) },
        onClick = onOpenScanner,
        footer = {
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
                    .pointerInput(Unit) { detectTapGestures() },
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    stringResource(R.string.native_settings_qr_quick),
                    color = if (dark) Gray400 else SettingsSubtleColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.align(Alignment.CenterVertically),
                )
                GkSegmented(
                    options = listOf(
                        GkSegmentOption("show", stringResource(R.string.native_settings_qr_quick_show)),
                        GkSegmentOption("hide", stringResource(R.string.native_settings_qr_quick_hide)),
                    ),
                    selectedId = if (quickEnabled) "show" else "hide",
                    themeId = themeId,
                    dark = dark,
                    onSelect = { onQuickChange(it == "show") },
                )
            }
        },
    )
}

/**
 * The block the sidebar switch opens (SettingsPanel.jsx:539-599): a
 * title and description with no icon, then a full-width picker showing
 * the chosen width, its chevron in a small gradient square, over a
 * popover of the five presets.
 */
@Composable
private fun SidebarBreakpointPicker(
    breakpoint: Int,
    menuOpen: Boolean,
    themeId: String,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onToggleMenu: () -> Unit,
    onDismissMenu: () -> Unit,
    onSelect: (Int) -> Unit,
) {
    val label = SidebarBreakpointPresets.firstOrNull { it.first == breakpoint }
        ?.let { stringResource(it.second) }
        ?: stringResource(R.string.native_settings_sidebar_breakpoint_custom, breakpoint)
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.99f else 1f,
        animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
        label = "breakpointScale",
    )
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column {
            Text(
                stringResource(R.string.native_settings_sidebar_breakpoint),
                color = titleColor,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                stringResource(R.string.native_settings_sidebar_breakpoint_desc),
                color = SettingsSubtleColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
        }
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .scale(scale)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (dark) Gray800 else Color.White)
                    .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                    .clickable(
                        interactionSource = interactionSource,
                        indication = null,
                        role = Role.Button,
                    ) { onToggleMenu() }
                    .padding(1.dp)
                    .padding(start = 12.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    label,
                    color = if (dark) Gray100 else Gray900,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(WorkspaceTheme.buttonGradient(themeId)),
                    contentAlignment = Alignment.Center,
                ) {
                    ChevronDownIcon(
                        modifier = Modifier.rotate(if (menuOpen) 180f else 0f),
                        size = 20.dp,
                        tint = Color.White,
                    )
                }
            }
            if (menuOpen) {
                SettingsPopover(dark = dark, borderColor = borderColor, minWidth = 256.dp, onDismiss = onDismissMenu) {
                    for ((widthPx, labelRes) in SidebarBreakpointPresets) {
                        SettingsPopoverOption(
                            label = stringResource(labelRes),
                            selected = widthPx == breakpoint,
                            themeId = themeId,
                            dark = dark,
                            onClick = { onSelect(widthPx) },
                        )
                    }
                }
            }
        }
    }
}

/** A Notes-section row: its header, then its control right-aligned 8px
 *  under it (`flex flex-col gap-2 px-3` with a `self-end` control). */
@Composable
private fun SettingsStackedRow(
    title: String,
    subtitle: String,
    themeId: String,
    dark: Boolean,
    titleColor: Color,
    icon: @Composable (Color) -> Unit,
    subtitleColor: Color = SettingsSubtleColor,
    control: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SettingsRowHeader(
            title = title,
            subtitle = subtitle,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            icon = icon,
            subtitleColor = subtitleColor,
        )
        Box(Modifier.align(Alignment.End)) { control() }
    }
}

/**
 * PushNotificationToggle.jsx as the Android app's WebView rendered it: it
 * has no Web Push, so the switch stays off and disabled, and the line
 * under it says the reminders already arrive as local notifications.
 */
@Composable
private fun PushNotificationsRow(themeId: String, dark: Boolean, titleColor: Color) {
    Column {
        SettingsSwitchRow(
            title = stringResource(R.string.native_settings_push_title),
            subtitle = stringResource(R.string.native_settings_push_desc),
            checked = false,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            icon = { tint -> TablerBellIcon(size = 20.dp, tint = tint) },
            onCheckedChange = {},
            modifier = Modifier.padding(vertical = 8.dp),
            enabled = false,
            switchAlignment = Alignment.CenterVertically,
        )
        Text(
            stringResource(R.string.native_settings_push_note),
            color = if (dark) Gray400 else SettingsSubtleColor,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(start = 52.dp, end = 12.dp, bottom = 4.dp),
        )
    }
}

/** The `tabular-nums` version line the update rows carry under their
 *  subtitle (`SettingsPanel.jsx:1423`). */
@Composable
private fun VersionLine(dark: Boolean) {
    Text(
        stringResource(R.string.native_settings_current_version, BuildConfig.VERSION_NAME),
        color = if (dark) SettingsSubtleColor else Gray400,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        modifier = Modifier.padding(top = 4.dp),
    )
}

/** The accent card that replaces the check button once a release is
 *  known (`SettingsPanel.jsx:1434-1466`). */
@Composable
private fun UpdateAvailableCard(
    release: ReleaseInfo,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    onLater: () -> Unit,
    onDownload: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(WorkspaceTheme.accentSoftBg(themeId, dark))
            .border(1.dp, WorkspaceTheme.accentSoftBorder(themeId, dark), RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        Row {
            SettingsRowIcon(themeId, dark) { tint -> SparklesIcon(size = 20.dp, tint = tint) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.native_settings_update_available_header),
                    color = titleColor,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    stringResource(R.string.native_settings_update_available_version, release.versionName),
                    color = if (dark) Gray200 else Gray700,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Text(
                    stringResource(R.string.native_settings_update_server_hint),
                    color = if (dark) Gray400 else SettingsSubtleColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onLater() }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    stringResource(R.string.native_settings_update_later),
                    color = if (dark) Gray300 else Gray600,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
            GkGradientButton(
                label = stringResource(R.string.native_settings_update_download),
                themeId = themeId,
                verticalPadding = 6.dp,
                onClick = onDownload,
            )
        }
    }
}

/**
 * The chevron next to a Notifications row that opens its per-category
 * list (SettingsPanel.jsx:803-817): a small box that fills with the soft
 * accent while the list is open, and whose glyph flips over. The web
 * button's 24px line box sets its 20px icon 6px from its top and leaves
 * 13px under it, hence a 32x39 box.
 */
@Composable
private fun CategoryListToggle(
    open: Boolean,
    label: String,
    themeId: String?,
    dark: Boolean,
    onClick: () -> Unit,
) {
    val tint = if (open) WorkspaceTheme.accent(themeId, dark) else SettingsSubtleColor
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (open) WorkspaceTheme.accentSoftBg(themeId, dark) else Color.Transparent)
            .semantics { contentDescription = label }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(start = 6.dp, top = 6.dp, end = 6.dp, bottom = 13.dp),
    ) {
        ChevronDownIcon(
            size = 20.dp,
            tint = tint,
            modifier = Modifier.rotate(if (open) 180f else 0f),
        )
    }
}

/**
 * The per-category list under a Notifications row: one line per bucket,
 * each with its own glyph and a smaller switch, inside a bordered, faintly
 * tinted panel indented 40px to clear the row's icon above and 12px from
 * the right edge (SettingsPanel.jsx:836-891). A disabled list greys out
 * row by row, as the sound list does while the master switch is off.
 */
@Composable
private fun NotifCategoryList(
    categories: List<NotifCategory>,
    flags: NotifCategoryFlags,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onToggle: (NotifCategory, Boolean) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 40.dp, top = 8.dp, end = 12.dp)
            .settingsCardBorder(borderColor)
            .background(if (dark) Color.White.copy(alpha = 0.03f) else Color.Black.copy(alpha = 0.02f))
            .padding(horizontal = 13.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for (category in categories) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .alpha(if (enabled) 1f else 0.5f)
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NotifCategoryIcon(category, titleColor)
                Spacer(Modifier.width(8.dp))
                Text(
                    stringResource(notifCategoryLabel(category)),
                    color = titleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(12.dp))
                GkSmallSwitch(
                    checked = flags[category],
                    enabled = enabled,
                    themeId = themeId,
                    dark = dark,
                    onCheckedChange = { onToggle(category, it) },
                )
            }
        }
    }
}

/** The glyph each category carries: the outline ones take the text
 *  colour (`.tabler-icon` inherits it), the filled ones their own fixed
 *  colour (SettingsPanel.jsx:838-843 and 926-933). */
@Composable
private fun NotifCategoryIcon(category: NotifCategory, textColor: Color) {
    when (category) {
        NotifCategory.FEDERATION -> WorldWwwIcon(size = 16.dp, tint = textColor)
        NotifCategory.SHARE -> UserShareIcon(size = 16.dp, tint = textColor)
        NotifCategory.ACCESS -> UserXIcon(size = 16.dp, tint = textColor)
        NotifCategory.REMINDER -> BellRingingFilledIcon(size = 16.dp, tint = Color(0xFF6366F1))
        NotifCategory.SUCCESS -> CircleCheckFilledIcon(size = 16.dp, tint = Color(0xFF10B981))
        NotifCategory.WARNING -> AlertFilledIcon(size = 16.dp, tint = Color(0xFFF59E0B))
        NotifCategory.ERROR -> AlertCircleFilledIcon(size = 16.dp, tint = Color(0xFFEF4444))
        NotifCategory.INFO -> InfoFilledIcon(size = 16.dp, tint = Color(0xFF3B82F6))
    }
}

private fun notifCategoryLabel(category: NotifCategory): Int = when (category) {
    NotifCategory.FEDERATION -> R.string.native_settings_notif_type_federation
    NotifCategory.SHARE -> R.string.native_settings_notif_type_share
    NotifCategory.ACCESS -> R.string.native_settings_notif_type_access
    NotifCategory.REMINDER -> R.string.native_settings_notif_type_reminder
    NotifCategory.SUCCESS -> R.string.native_settings_notif_type_success
    NotifCategory.WARNING -> R.string.native_settings_notif_type_warning
    NotifCategory.ERROR -> R.string.native_settings_notif_type_error
    NotifCategory.INFO -> R.string.native_settings_notif_type_info
}

/** The five durations the web offers, "Persistent" included: the same
 *  gradient pill as the language row, over a popover at least 9rem wide. */
@Composable
private fun ToastDurationPicker(
    durationMs: Long?,
    menuOpen: Boolean,
    themeId: String?,
    dark: Boolean,
    borderColor: Color,
    onToggleMenu: () -> Unit,
    onDismissMenu: () -> Unit,
    onSelect: (Long?) -> Unit,
) {
    val secondsTemplate = stringResource(R.string.native_settings_notif_duration_seconds)
    val options = listOf(
        5_000L to String.format(secondsTemplate, 5),
        10_000L to String.format(secondsTemplate, 10),
        20_000L to String.format(secondsTemplate, 20),
        30_000L to String.format(secondsTemplate, 30),
        null to stringResource(R.string.native_settings_notif_duration_persistent),
    )
    val selectedLabel = options.firstOrNull { it.first == durationMs }?.second ?: options[1].second
    Box {
        GkGradientButton(
            label = selectedLabel,
            themeId = themeId,
            horizontalPadding = 12.dp,
            verticalPadding = 6.dp,
            modifier = Modifier.widthIn(min = 112.dp),
            trailing = {
                ChevronDownIcon(
                    modifier = Modifier.rotate(if (menuOpen) 180f else 0f),
                    size = 20.dp,
                    tint = Color.White,
                )
            },
            onClick = onToggleMenu,
        )
        if (menuOpen) {
            SettingsPopover(dark = dark, borderColor = borderColor, minWidth = 144.dp, onDismiss = onDismissMenu) {
                for ((value, label) in options) {
                    SettingsPopoverOption(
                        label = label,
                        selected = value == durationMs,
                        themeId = themeId,
                        dark = dark,
                        onClick = { onSelect(value) },
                    )
                }
            }
        }
    }
}

@Composable
private fun LanguageRow(
    language: String?,
    menuOpen: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onToggleMenu: () -> Unit,
    onDismissMenu: () -> Unit,
    onSelect: (String?) -> Unit,
) {
    val options = listOf(
        null to stringResource(R.string.native_settings_language_auto),
        "fr" to stringResource(R.string.native_settings_language_french),
        "en" to stringResource(R.string.native_settings_language_english),
    )
    val selectedLabel = options.firstOrNull { it.first == language }?.second ?: options.first().second
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .settingsCardBorder(borderColor)
            .padding(13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                stringResource(R.string.native_settings_language),
                color = titleColor,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                stringResource(R.string.native_settings_language_desc),
                color = SettingsSubtleColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
        }
        Box {
            GkGradientButton(
                label = selectedLabel,
                themeId = themeId,
                horizontalPadding = 12.dp,
                verticalPadding = 6.dp,
                modifier = Modifier.widthIn(min = 144.dp),
                trailing = {
                    ChevronDownIcon(
                        modifier = Modifier.rotate(if (menuOpen) 180f else 0f),
                        size = 20.dp,
                        tint = Color.White,
                    )
                },
                onClick = onToggleMenu,
            )
            if (menuOpen) {
                SettingsPopover(dark = dark, borderColor = borderColor, minWidth = 160.dp, onDismiss = onDismissMenu) {
                    options.forEach { (code, label) ->
                        SettingsPopoverOption(
                            label = label,
                            selected = code == language,
                            themeId = themeId,
                            dark = dark,
                            onClick = { onSelect(code) },
                        )
                    }
                }
            }
        }
    }
}

/** The web's reset-order dialog (SettingsPanel.jsx:1590-1638): a
 *  95%-opaque `glass-card` over a `bg-black/40` scrim, the message, the
 *  "overwrite custom positions" box (checked by default), then Cancel and
 *  Confirm. The glass card's faint violet shadow does not show on that
 *  scrim, so the card carries none. */
@Composable
private fun ResetNoteOrderDialog(
    themeId: String,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    var overridePositions by remember { mutableStateOf(true) }
    GkDialog(
        onDismissRequest = onDismiss,
        dark = dark,
        borderColor = borderColor,
        maxWidth = 384.dp,
        background = if (dark) Color(0xF2282828) else Color(0xF2FFFFFF),
        elevation = 0.dp,
        scrimAlpha = 0.4f,
    ) {
        Text(
            stringResource(R.string.native_settings_reset_order),
            color = titleColor,
            fontSize = 18.sp,
            lineHeight = 28.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.native_settings_reset_order_confirm),
            color = if (dark) Gray300 else Gray600,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier.toggleable(
                value = overridePositions,
                role = Role.Checkbox,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onValueChange = { overridePositions = it },
            ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Squeezed to Chromium's 13px intrinsic width by the long label.
            GkCheckbox(checked = overridePositions, onCheckedChange = null, size = 13.dp)
            Spacer(Modifier.width(8.dp))
            Text(
                stringResource(R.string.native_settings_reset_order_override),
                color = titleColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
        }
        Spacer(Modifier.height(20.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GkSecondaryButton(
                label = stringResource(R.string.native_dialog_cancel),
                borderColor = borderColor,
                textColor = titleColor,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Normal,
                onClick = onDismiss,
            )
            GkGradientButton(
                label = stringResource(R.string.native_settings_reset_order_action),
                themeId = themeId,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                onClick = onConfirm,
            )
        }
    }
}

/** The Passkeys card: header row, explanation, split add/expand button
 *  and the saved-key rows (`SettingsPanel.jsx:479-497` wrapping
 *  `PasskeySettingsSection.jsx`). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PasskeysCard(
    passkeys: List<PasskeyDto>,
    available: Boolean,
    isAdmin: Boolean,
    encryptionEnabled: Boolean,
    instanceUnlocked: Boolean,
    listOpen: Boolean,
    adding: Boolean,
    testingId: String?,
    busyId: String?,
    untitledLabel: String,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onToggleList: () -> Unit,
    onAdd: () -> Unit,
    onOpenDomainSetting: () -> Unit,
    onTest: (String) -> Unit,
    onRename: (PasskeyDto) -> Unit,
    onDelete: (String) -> Unit,
    onToggleUnlock: (PasskeyDto) -> Unit,
) {
    val mutedColor = if (dark) Gray400 else SettingsSubtleColor
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .settingsCardBorder(borderColor)
            .padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SettingsRowIcon(themeId, dark) { tint -> TablerKeyIcon(size = 20.dp, tint = tint) }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    stringResource(R.string.native_settings_passkeys_section),
                    color = titleColor,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    stringResource(R.string.native_settings_passkeys_subtitle),
                    color = SettingsSubtleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        // `leading-snug`.
        Text(
            stringResource(R.string.native_settings_passkeys_explain),
            color = mutedColor,
            fontSize = 14.sp,
            lineHeight = 1.375.em,
        )
        Spacer(Modifier.height(12.dp))

        // Said before the button rather than after a failure: nobody can
        // create a passkey until an admin declares the domain, and only
        // an admin has somewhere to be sent.
        if (!available) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (dark) Color(0x1AFE9A00) else Color(0xFFFFFBEB))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                val noticeColor = if (dark) Color(0xFFFFD230) else Color(0xFF7B3306)
                Text(
                    stringResource(
                        if (isAdmin) R.string.native_settings_passkeys_domain_not_set_admin
                        else R.string.native_settings_passkeys_domain_not_set_user
                    ),
                    color = noticeColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
                if (isAdmin) {
                    Text(
                        stringResource(R.string.native_settings_passkeys_domain_go_to_setting),
                        color = noticeColor,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onOpenDomainSetting() },
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        // The web's split button: one gradient surface, a 1px white
        // divider, and two independent click zones.
        val canAdd = !adding && available
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min)
                .alpha(if (canAdd) 1f else 0.5f)
                .clip(RoundedCornerShape(8.dp))
                .background(WorkspaceTheme.buttonGradient(themeId)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = canAdd,
                        role = Role.Button,
                    ) { onAdd() }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    when {
                        adding -> stringResource(R.string.native_settings_passkeys_adding)
                        passkeys.isNotEmpty() -> stringResource(R.string.native_settings_passkeys_add_count, passkeys.size)
                        else -> stringResource(R.string.native_settings_passkeys_add)
                    },
                    color = Color.White,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (passkeys.isNotEmpty()) {
                Box(Modifier.width(1.dp).fillMaxHeight().background(Color.White.copy(alpha = 0.3f)))
                val toggleLabel = stringResource(if (listOpen) R.string.native_common_close else R.string.native_common_show)
                val rotation by animateFloatAsState(
                    targetValue = if (listOpen) 180f else 0f,
                    animationSpec = tween(durationMillis = 200),
                    label = "passkeyListChevron",
                )
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .semantics { contentDescription = toggleLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onToggleList() }
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    ChevronDownIcon(
                        modifier = Modifier.rotate(rotation),
                        size = 20.dp,
                        tint = Color.White,
                    )
                }
            }
        }

        // `space-y-3`: the block above keeps its 12px margin even while
        // the list under it is folded away.
        if (passkeys.isEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.native_settings_passkeys_empty),
                color = mutedColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontStyle = FontStyle.Italic,
            )
        } else {
            Spacer(Modifier.height(12.dp))
            if (listOpen) {
                Column(
                    modifier = Modifier.padding(top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    passkeys.forEach { passkey ->
                        PasskeyRow(
                            passkey = passkey,
                            untitledLabel = untitledLabel,
                            isAdmin = isAdmin,
                            encryptionEnabled = encryptionEnabled,
                            unlockToggleAllowed = isAdmin && encryptionEnabled && instanceUnlocked,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            borderColor = borderColor,
                            testing = testingId == passkey.credentialId,
                            busy = busyId == passkey.credentialId,
                            onTest = { onTest(passkey.credentialId) },
                            onRename = { onRename(passkey) },
                            onDelete = { onDelete(passkey.credentialId) },
                            onToggleUnlock = { onToggleUnlock(passkey) },
                        )
                    }
                }
            }
        }
    }
}

/** One saved passkey: name and badges wrapping together, last use, then
 *  the small bordered actions, wrapping too, the unlock right last for an
 *  admin of an encrypted instance (`PasskeySettingsSection.jsx:387-460`). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PasskeyRow(
    passkey: PasskeyDto,
    untitledLabel: String,
    isAdmin: Boolean,
    encryptionEnabled: Boolean,
    unlockToggleAllowed: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    testing: Boolean,
    busy: Boolean,
    onTest: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    onToggleUnlock: () -> Unit,
) {
    val mutedColor = if (dark) Gray400 else SettingsSubtleColor
    val actionColor = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                passkey.name?.takeIf { it.isNotEmpty() } ?: untitledLabel,
                color = titleColor,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            PasskeyBadge(
                label = stringResource(R.string.native_settings_passkeys_badge_login),
                background = WorkspaceTheme.accentSoftBg(themeId, dark),
                foreground = WorkspaceTheme.accent(themeId, dark),
            )
            if (passkey.canUnlockInstance) {
                PasskeyBadge(
                    label = stringResource(R.string.native_settings_passkeys_badge_unlock),
                    background = if (dark) BadgeAmberBgDark else BadgeAmberBgLight,
                    foreground = if (dark) BadgeAmberFgDark else BadgeAmberFgLight,
                )
            }
            if (passkey.backedUp) {
                PasskeyBadge(
                    label = stringResource(R.string.native_settings_passkeys_badge_synced),
                    background = if (dark) BadgeGrayBgDark else BadgeGrayBgLight,
                    foreground = if (dark) BadgeGrayFgDark else BadgeGrayFgLight,
                )
            }
        }
        Text(
            passkey.lastUsedAt?.let { stringResource(R.string.native_settings_passkeys_last_used, localeDateTimeString(it)) }
                ?: stringResource(R.string.native_settings_passkeys_never_used),
            color = mutedColor,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(top = 2.dp),
        )
        if (!passkey.prfSupported && isAdmin && encryptionEnabled) {
            Text(
                stringResource(R.string.native_settings_passkeys_no_prf_row),
                color = mutedColor,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontStyle = FontStyle.Italic,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        FlowRow(
            modifier = Modifier.padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PasskeySmallButton(
                label = if (testing) {
                    stringResource(R.string.native_settings_passkeys_testing)
                } else {
                    stringResource(R.string.native_settings_passkeys_test)
                },
                borderColor = borderColor,
                textColor = actionColor,
                enabled = !testing && !busy,
                onClick = onTest,
            )
            PasskeySmallButton(
                label = stringResource(R.string.native_settings_passkeys_rename),
                borderColor = borderColor,
                textColor = actionColor,
                enabled = !busy,
                onClick = onRename,
            )
            PasskeySmallButton(
                label = stringResource(R.string.native_settings_passkeys_delete),
                borderColor = if (dark) PasskeyDeleteBorderDark else PasskeyDeleteBorderLight,
                textColor = if (dark) PasskeyDeleteFgDark else PasskeyDeleteFgLight,
                enabled = !busy,
                onClick = onDelete,
            )
            if (isAdmin && encryptionEnabled && passkey.prfSupported) {
                PasskeySmallButton(
                    label = stringResource(
                        if (passkey.canUnlockInstance) R.string.native_settings_passkeys_disable_unlock
                        else R.string.native_settings_passkeys_enable_unlock
                    ),
                    borderColor = if (passkey.canUnlockInstance) Color(0xFFFE9A00) else borderColor,
                    textColor = when {
                        !passkey.canUnlockInstance -> actionColor
                        dark -> Color(0xFFFFD230)
                        else -> Color(0xFFBB4D00)
                    },
                    fontWeight = FontWeight.Medium,
                    enabled = !busy && unlockToggleAllowed,
                    onClick = onToggleUnlock,
                )
            }
        }
    }
}

/** `text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5
 *  rounded`, on the inherited 1.5 line height. */
@Composable
private fun PasskeyBadge(label: String, background: Color, foreground: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(background)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            label.uppercase(),
            color = foreground,
            fontSize = 10.sp,
            lineHeight = 15.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.025.em,
        )
    }
}

/** `px-2.5 py-1 rounded text-xs border`: 26dp tall, the 1px border
 *  outside the padding like the CSS box. */
@Composable
private fun PasskeySmallButton(
    label: String,
    borderColor: Color,
    textColor: Color,
    enabled: Boolean,
    onClick: () -> Unit,
    fontWeight: FontWeight = FontWeight.Normal,
) {
    Box(
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.5f)
            .clip(RoundedCornerShape(4.dp))
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 11.dp, vertical = 5.dp),
    ) {
        Text(label, color = textColor, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = fontWeight)
    }
}

/** The dialog the web's passkey section opens to name a key
 *  (PasskeyTextDialog): a title, its prompt and the name field, focused
 *  at once; Enter or the confirm button close it before the action runs. */
@Composable
private fun PasskeyNameDialog(
    title: String,
    message: String,
    initialName: String,
    confirmLabel: String,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onSubmit: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initialName) }
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    val submit = {
        onDismiss()
        onSubmit(name)
    }
    GkDialog(
        onDismissRequest = onDismiss,
        dark = dark,
        borderColor = borderColor,
        maxWidth = 384.dp,
        scrimAlpha = ConfirmDialogDim,
    ) {
        Text(title, color = titleColor, fontSize = 18.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(message, color = if (dark) DialogBodyDark else DialogBodyLight, fontSize = 14.sp, lineHeight = 20.sp)
        Spacer(Modifier.height(12.dp))
        GkTextField(
            value = name,
            onValueChange = { name = it.take(64) },
            label = null,
            placeholder = stringResource(R.string.native_settings_passkeys_add_name_placeholder),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            focusRequester = focusRequester,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            background = if (dark) Color(0xFF1F1F1F) else Color.White,
        )
        Spacer(Modifier.height(20.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GkSecondaryButton(
                label = stringResource(R.string.native_dialog_cancel),
                borderColor = borderColor,
                textColor = titleColor,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Normal,
                onClick = onDismiss,
            )
            GkGradientButton(
                label = confirmLabel,
                themeId = themeId,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                onClick = submit,
            )
        }
    }
}

// internal, not private: CollaboratorsScreen.kt and NativeLoginScreen.kt
// (same package, different files) reuse this for the same
// avatar-with-initials-fallback rendering, UserAvatar.jsx on the web.
// Kotlin's top-level `private` is file-scoped. Without [onClick] it is a
// plain picture, and a tap goes to whatever row it sits in. [dark] is
// false where the web leaves UserAvatar's own prop out (the admin's user
// list), and [fontSize] its `textSize` class.
@Composable
internal fun AvatarCircle(
    avatarUrl: String?,
    name: String,
    size: Dp,
    onClick: (() -> Unit)? = null,
    dark: Boolean = LocalGkDark.current,
    // text-2xl (24px) at the 64px profile size, text-xs (12px) at the
    // 32px collaborator size.
    fontSize: TextUnit = (size.value * 0.375f).sp,
) {
    val bitmap = avatarUrl?.let { rememberDecodedImage(it) }
    val label = stringResource(R.string.native_settings_avatar_description)
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            // UserAvatar.jsx's fallback is a flat indigo disc, not the
            // button gradient, and it is one of the few surfaces the
            // workspace themes deliberately leave alone.
            .background(if (bitmap == null) (if (dark) AvatarFallbackBgDark else AvatarFallbackBgLight) else Color.Transparent)
            .semantics { contentDescription = label }
            .then(
                if (onClick != null) {
                    Modifier.clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onClick() }
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            // object-cover: a photo that is not square fills the circle.
            Image(bitmap = bitmap, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Text(
                name.trim().take(1).uppercase().ifBlank { "?" },
                color = if (dark) AvatarFallbackFgDark else AvatarFallbackFgLight,
                fontWeight = FontWeight.SemiBold,
                fontSize = fontSize,
            )
        }
    }
}

// indigo-100 / indigo-700 light, indigo-500 at 25% / indigo-300 dark, as
// Tailwind v4 renders them.
private val AvatarFallbackBgLight = Color(0xFFE0E7FF)
private val AvatarFallbackFgLight = Color(0xFF432DD7)
private val AvatarFallbackBgDark = Color(0x40615FFF)
private val AvatarFallbackFgDark = Color(0xFFA3B3FF)

/** The theme picker (`WorkspaceThemeSection.jsx:63-100`, and the admin's
 *  login page theme in LoginBrandingSection.jsx): two columns of cards,
 *  each a 36px swatch band over a labelled foot. */
@Composable
internal fun ThemeGrid(
    currentThemeId: String,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    accent: Color,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        WorkspaceTheme.ALL.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { entry ->
                    ThemeCard(
                        entry = entry,
                        selected = entry.id == currentThemeId,
                        dark = dark,
                        titleColor = titleColor,
                        borderColor = borderColor,
                        accent = accent,
                        modifier = Modifier.weight(1f),
                        onClick = { onSelect(entry.id) },
                    )
                }
                // Keeps the last row's single card at one column width
                // when the theme count is odd.
                repeat(2 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** One theme card: a 1px border, the accent when selected plus Tailwind's
 *  `ring-2` drawn outside the card like the box-shadow it is, the check in
 *  the text colour (`.tabler-icon` inherits it), and the 0.99 press scale. */
@Composable
private fun ThemeCard(
    entry: WorkspaceThemeEntry,
    selected: Boolean,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    accent: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.99f else 1f,
        animationSpec = tween(durationMillis = 150, easing = GkStandardEasing),
        label = "themeCardScale",
    )
    Column(
        modifier = modifier
            .scale(scale)
            .drawBehind {
                if (selected) {
                    val ring = 2.dp.toPx()
                    drawRoundRect(
                        color = accent,
                        topLeft = Offset(-ring / 2f, -ring / 2f),
                        size = Size(size.width + ring, size.height + ring),
                        cornerRadius = CornerRadius(12.dp.toPx() + ring / 2f),
                        style = Stroke(ring),
                    )
                }
            }
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, if (selected) accent else borderColor, RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.RadioButton,
            ) { onClick() }
            .padding(1.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(36.dp)
                .background(entry.swatchSurface)
                .padding(horizontal = 8.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(
                modifier = Modifier
                    .width(48.dp)
                    .height(14.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(Brush.horizontalGradient(listOf(entry.swatchPrimary, entry.swatchSecondary))),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (dark) Gray800 else Color.White)
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                entry.label,
                color = titleColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (selected) TablerCheckIcon(size = 20.dp, tint = titleColor)
        }
    }
}
