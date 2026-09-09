package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.glasskeep.app.BuildConfig
import com.glasskeep.app.MainActivity
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.NoteExporter
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.ChangePasswordResult
import com.glasskeep.app.nativeapp.data.NoteTransfer
import com.glasskeep.app.nativeapp.data.NotifCategory
import com.glasskeep.app.nativeapp.data.NotifCategoryFlags
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.TypographyPresets
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.ImportNotesResponse
import com.glasskeep.app.nativeapp.data.network.PasskeyDto
import com.glasskeep.app.nativeapp.data.network.ProfileDto
import com.glasskeep.app.nativeapp.data.network.UserAiSettingsDto
import com.glasskeep.app.nativeapp.data.network.UserAiSettingsRequest
import com.glasskeep.app.nativeapp.data.network.UserAiTestRequest
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.nativeapp.isUserCancellation
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import com.glasskeep.app.update.ReleaseInfo
import com.glasskeep.app.update.UpdateManager
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** The export file is written the way the web writes its own:
 *  JSON.stringify(payload, null, 2) (useImportExport.js:156). The
 *  two-space indent is what needs the opt-in; the rest is stable API. */
@OptIn(ExperimentalSerializationApi::class)
private val prettyJson = Json { prettyPrint = true; prettyPrintIndent = "  " }

/** `red-500`, the "remove photo" link. */
private val LinkRed = Color(0xFFEF4444)
private val PasskeyDeleteBorderLight = Color(0xFFFCA5A5)
private val PasskeyDeleteBorderDark = Color(0xFF991B1B)
private val PasskeyDeleteFgLight = Color(0xFFDC2626)
private val PasskeyDeleteFgDark = Color(0xFFF87171)
private val BadgeAmberBgLight = Color(0xFFFEF3C7)
private val BadgeAmberFgLight = Color(0xFF92400E)
private val BadgeAmberBgDark = Color(0x66451A03)
private val BadgeAmberFgDark = Color(0xFFFDE68A)
private val BadgeGrayBgLight = Color(0xFFF3F4F6)
private val BadgeGrayFgLight = Color(0xFF374151)
private val BadgeGrayBgDark = Color(0xFF374151)
private val BadgeGrayFgDark = Color(0xFFE5E7EB)
private val VersionBadgeLight = Color(0xFF9CA3AF)
private val VersionBadgeDark = Color(0xFF4B5563)

/**
 * SettingsPanel.jsx, natively. On a phone the web panel is a full-width
 * sheet sliding in from the right over `--gk-statusbar`, with a 72px
 * header, a 16px scrollable body, one profile block and eight accordion
 * sections, all closed on first open, and the app version pinned bottom
 * right.
 *
 * Five of those eight sections are ported (Security, UI Preferences,
 * Notes, Data Management, Language) plus the Android-only Application
 * section. Deliberately left out, because nothing native sits behind
 * them: Notifications (its six settings drive the web's own toast
 * system and Web Push, neither of which exists here), the AI assistant,
 * the desktop-only sidebar preferences, editor typography, and the
 * import/export rows that need a document picker and SAF writes. The
 * passkey rows also drop the admin-only "can unlock the instance"
 * toggle, which needs the admin panel and instance encryption.
 */
@Composable
fun SettingsScreen(container: NativeAppContainer, serverUrl: String, onBack: () -> Unit, onOpenQrScanner: () -> Unit) {
    val dark = LocalGkDark.current
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val activity = LocalView.current.context as Activity
    val clipboard = LocalClipboard.current

    var profile by remember { mutableStateOf<ProfileDto?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var passkeys by remember { mutableStateOf<List<PasskeyDto>>(emptyList()) }

    var changingAvatar by remember { mutableStateOf(false) }
    var changingShowOnLogin by remember { mutableStateOf(false) }
    var changingLanguage by remember { mutableStateOf(false) }
    var changingTheme by remember { mutableStateOf(false) }
    var changingChecklistPosition by remember { mutableStateOf(false) }
    var changingRemoveSection by remember { mutableStateOf(false) }
    var changingToolbarMode by remember { mutableStateOf(false) }
    var changingReadMode by remember { mutableStateOf(false) }
    var changingEdgeToEdge by remember { mutableStateOf(false) }
    var changingFloatingCards by remember { mutableStateOf(false) }
    var changingToastPrefs by remember { mutableStateOf(false) }
    var changingNotifPrefs by remember { mutableStateOf(false) }
    var notifSoundTypesOpen by rememberSaveable { mutableStateOf(false) }
    var notifFilterTypesOpen by rememberSaveable { mutableStateOf(false) }
    var toastDurationMenuOpen by remember { mutableStateOf(false) }
    var showTypographyModal by remember { mutableStateOf(false) }
    var addingPasskey by remember { mutableStateOf(false) }
    var removingPasskeyId by remember { mutableStateOf<String?>(null) }
    var testingPasskeyId by remember { mutableStateOf<String?>(null) }
    var renamingPasskeyId by remember { mutableStateOf<String?>(null) }

    var showPasswordDialog by remember { mutableStateOf(false) }
    var changingPassword by remember { mutableStateOf(false) }
    var currentPasswordInput by remember { mutableStateOf("") }
    var newPasswordInput by remember { mutableStateOf("") }
    var confirmPasswordInput by remember { mutableStateOf("") }
    var passwordDialogError by remember { mutableStateOf<String?>(null) }

    var showAddPasskeyDialog by remember { mutableStateOf(false) }
    var addPasskeyNameInput by remember { mutableStateOf("") }
    var renamePasskeyTarget by remember { mutableStateOf<PasskeyDto?>(null) }
    var renamePasskeyInput by remember { mutableStateOf("") }
    var pendingDeletePasskeyId by remember { mutableStateOf<String?>(null) }

    var generatingSecretKey by remember { mutableStateOf(false) }
    var generatedSecretKey by remember { mutableStateOf<String?>(null) }

    var transferRunning by remember { mutableStateOf(false) }
    var showResetOrderConfirm by remember { mutableStateOf(false) }

    var aiSettings by remember { mutableStateOf<UserAiSettingsDto?>(null) }
    var aiDraft by remember { mutableStateOf(AiSettingsDraft("", "", "", "0.3", "800", false)) }
    var aiTestOutcome by remember { mutableStateOf<AiTestOutcome?>(null) }
    var savingAi by remember { mutableStateOf(false) }
    var testingAi by remember { mutableStateOf(false) }

    var showChangeServerDialog by remember { mutableStateOf(false) }
    var availableUpdate by remember { mutableStateOf<ReleaseInfo?>(UpdateManager.getStoredRelease(context)) }
    val installedFromFdroid = remember { UpdateManager.isFdroidInstall(context) }

    // Sections are collapsed on first open, exactly like the web's empty
    // `settingsOpenSections` map. Saved across configuration changes
    // only: the web syncs them to the server, which has no equivalent
    // route reachable from here.
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

    val errorLoadTemplate = stringResource(R.string.native_settings_error)
    val actionErrorTemplate = stringResource(R.string.native_settings_action_error)
    val passwordMismatchMessage = stringResource(R.string.native_settings_password_mismatch)
    val passwordTooShortMessage = stringResource(R.string.native_settings_password_too_short)
    val passwordErrorTemplate = stringResource(R.string.native_settings_password_error)
    val passwordSuccessMessage = stringResource(R.string.native_settings_password_success)
    val passkeyUntitledLabel = stringResource(R.string.native_settings_passkeys_untitled)
    val passkeyTestOkMessage = stringResource(R.string.native_settings_passkeys_test_ok)
    val passkeyTestFailedMessage = stringResource(R.string.native_settings_passkeys_test_failed)
    val copiedMessage = stringResource(R.string.native_settings_secret_key_copied)
    val aiSavedMessage = stringResource(R.string.native_settings_ai_saved)
    val aiKeyClearedMessage = stringResource(R.string.native_settings_ai_api_key_cleared)
    val aiTestOkMessage = stringResource(R.string.native_settings_ai_test_ok)
    val aiTestFailedMessage = stringResource(R.string.native_settings_ai_test_failed)
    val exportFailedMessage = stringResource(R.string.native_settings_export_failed)
    val importFailedMessage = stringResource(R.string.native_settings_import_failed)
    val importInvalidJsonMessage = stringResource(R.string.native_settings_import_invalid_json)
    val importNoNotesMessage = stringResource(R.string.native_settings_import_no_notes)
    val importedTemplate = stringResource(R.string.native_settings_import_done)
    val importedWithSkippedTemplate = stringResource(R.string.native_settings_import_done_skipped)
    val importAllSkippedTemplate = stringResource(R.string.native_settings_import_all_skipped)
    val importAllUpdatedTemplate = stringResource(R.string.native_settings_import_all_updated)
    val importAlsoUpdatedTemplate = stringResource(R.string.native_settings_import_also_updated)
    val importRejectedTemplate = stringResource(R.string.native_settings_import_rejected)
    val gkeepNoneMessage = stringResource(R.string.native_settings_import_gkeep_none)
    val gkeepImportedTemplate = stringResource(R.string.native_settings_import_gkeep_done)
    val gkeepFailedMessage = stringResource(R.string.native_settings_import_gkeep_failed)
    val markdownNoneMessage = stringResource(R.string.native_settings_import_md_none)
    val markdownImportedTemplate = stringResource(R.string.native_settings_import_md_done)
    val markdownFailedMessage = stringResource(R.string.native_settings_import_md_failed)
    val secretKeySavedMessage = stringResource(R.string.native_settings_secret_key_downloaded)
    val orderResetMessage = stringResource(R.string.native_settings_reset_order_done)
    val forgotPasswordLabel = stringResource(R.string.native_login_forgot_password)
    val secretLoginLabel = stringResource(R.string.native_secret_login_title)
    val updateCheckingMessage = stringResource(R.string.update_checking)
    val updateUpToDateMessage = stringResource(R.string.update_up_to_date)
    val updateDownloadingMessage = stringResource(R.string.update_downloading)
    val updateDownloadFailedMessage = stringResource(R.string.update_download_failed)

    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else SettingsSubtleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val accent = WorkspaceTheme.accent(themeId, dark)

    LaunchedEffect(serverUrl) {
        try {
            profile = repository.fetchProfile()
        } catch (t: Throwable) {
            NativeDebug.e("SettingsScreen load failed", t)
            loadError = String.format(errorLoadTemplate, t.message ?: t.javaClass.simpleName)
        }
    }

    // Its own effect, not folded into the one above: a passkey-list
    // failure is a lot less important than the profile fetch above (the
    // rest of the screen works fine without it), so it shouldn't turn
    // into the same full-screen loadError.
    LaunchedEffect(serverUrl) {
        try {
            passkeys = repository.listPasskeys()
        } catch (t: Throwable) {
            NativeDebug.e("SettingsScreen listPasskeys failed", t)
        }
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
            temperature = config.temperature.toString(),
            maxTokens = config.maxTokens.toString(),
            showApiKey = false,
        )
    }

    // Its own effect, best-effort like the passkey list: an instance with
    // no AI at all simply shows the section switched off.
    LaunchedEffect(serverUrl) {
        repository.fetchUserAiSettings()?.let { applyAiSettings(it) }
    }

    fun reportActionError(t: Throwable) {
        toasts.error(String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName))
    }

    fun addPasskey(name: String) {
        if (addingPasskey) return
        addingPasskey = true
        scope.launch {
            try {
                val options = repository.fetchPasskeyRegisterOptions()
                when (val ceremony = NativePasskeys.register(activity, options.options.toString())) {
                    is PasskeyCeremonyResult.Success -> {
                        repository.verifyPasskeyRegistration(Json.parseToJsonElement(ceremony.responseJson), options.challengeId, name)
                        passkeys = repository.listPasskeys()
                        showAddPasskeyDialog = false
                        addPasskeyNameInput = ""
                        passkeyListOpen = true
                    }
                    is PasskeyCeremonyResult.Failed -> {
                        // Same silent-no-op treatment as the login
                        // screen's own submitPasskeyLogin: the user
                        // dismissing the system picker isn't a failure.
                        if (!ceremony.isUserCancellation()) reportActionError(IllegalStateException(ceremony.message))
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen addPasskey failed", t)
                reportActionError(t)
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
                        passkeys = repository.listPasskeys()
                        toasts.success(passkeyTestOkMessage)
                    }
                    is PasskeyCeremonyResult.Failed -> {
                        if (!ceremony.isUserCancellation()) {
                            toasts.error(passkeyTestFailedMessage)
                        }
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen testPasskey failed", t)
                toasts.error(passkeyTestFailedMessage)
            } finally {
                testingPasskeyId = null
            }
        }
    }

    fun renamePasskey(credentialId: String, name: String) {
        if (renamingPasskeyId != null) return
        renamingPasskeyId = credentialId
        scope.launch {
            try {
                repository.renamePasskey(credentialId, name)
                passkeys = passkeys.map { if (it.credentialId == credentialId) it.copy(name = name) else it }
                renamePasskeyTarget = null
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen renamePasskey failed", t)
                reportActionError(t)
            } finally {
                renamingPasskeyId = null
            }
        }
    }

    fun deletePasskey(credentialId: String) {
        if (removingPasskeyId != null) return
        removingPasskeyId = credentialId
        scope.launch {
            try {
                repository.deletePasskey(credentialId)
                passkeys = passkeys.filter { it.credentialId != credentialId }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen deletePasskey failed", t)
                reportActionError(t)
            } finally {
                removingPasskeyId = null
            }
        }
    }

    // No confirmation step, matching useImportExport.js's own
    // downloadSecretKey(): the server always rotates on this call (there
    // is no separate "just show me the existing one" route), so tapping
    // the action link goes straight to a fresh key, shown here instead of
    // downloaded as a .txt file (a file picker ceremony for one short
    // string is friction the web's browser download button doesn't have
    // to pay).
    fun generateSecretKey() {
        if (generatingSecretKey) return
        generatingSecretKey = true
        scope.launch {
            try {
                generatedSecretKey = repository.generateSecretKey()
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen generateSecretKey failed", t)
                reportActionError(t)
            } finally {
                generatingSecretKey = false
            }
        }
    }

    /** buildImportMessage() (useImportExport.js:36-66): imported, restored,
     *  skipped and rejected each get said out loud, since a restore that
     *  only updates would otherwise report nothing at all. */
    fun importMessage(result: ImportNotesResponse, attempted: Int, successTemplate: String): String {
        val imported = result.imported
        val base = when {
            result.skipped > 0 && imported == 0 -> importAllSkippedTemplate.replace("{skipped}", "${result.skipped}")
            result.skipped > 0 -> importedWithSkippedTemplate
                .replace("{count}", "$imported")
                .replace("{skipped}", "${result.skipped}")
            else -> successTemplate.replace("{count}", "${if (imported > 0) imported else attempted}")
        }
        val withUpdated = when {
            result.updated == 0 -> base
            imported == 0 && result.skipped == 0 ->
                importAllUpdatedTemplate.replace("{updated}", "${result.updated}")
            else -> "$base ${importAlsoUpdatedTemplate.replace("{updated}", "${result.updated}")}"
        }
        if (result.rejected == 0) return withUpdated
        return "$withUpdated ${importRejectedTemplate.replace("{rejected}", "${result.rejected}")}"
    }

    /** The three imports differ only in how the files are read; everything
     *  after that (nothing usable, send, report) is the same. */
    fun runImport(
        emptyMessage: String,
        successTemplate: String,
        failureMessage: String,
        read: suspend () -> NoteTransfer.ImportPayload?,
    ) {
        if (transferRunning) return
        transferRunning = true
        scope.launch {
            try {
                val payload = withContext(Dispatchers.IO) { read() }
                if (payload == null) {
                    toasts.error(importInvalidJsonMessage)
                    return@launch
                }
                if (payload.notes.isEmpty()) {
                    toasts.error(emptyMessage)
                    return@launch
                }
                val result = repository.importNotes(payload.notes)
                toasts.success(importMessage(result, payload.attempted, successTemplate))
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen import failed", t)
                toasts.error(failureMessage)
            } finally {
                transferRunning = false
            }
        }
    }

    fun exportAllNotes() {
        if (transferRunning) return
        transferRunning = true
        scope.launch {
            try {
                val payload = repository.exportNotes()
                val filename = NoteTransfer.exportFilename(profile?.email) + ".json"
                val pretty = withContext(Dispatchers.IO) { prettyJson.encodeToString(JsonElement.serializer(), payload) }
                val shared = withContext(Dispatchers.IO) {
                    NoteExporter.exportTextFile(context, NoteExporter.sanitizeFilename(filename), pretty, "application/json")
                }
                if (!shared) toasts.error(exportFailedMessage)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen exportAllNotes failed", t)
                toasts.error(exportFailedMessage)
            } finally {
                transferRunning = false
            }
        }
    }

    fun downloadSecretKey() {
        if (generatingSecretKey) return
        generatingSecretKey = true
        scope.launch {
            try {
                val key = repository.generateSecretKey()
                val content = NoteTransfer.secretKeyFile(key, forgotPasswordLabel, secretLoginLabel)
                val shared = withContext(Dispatchers.IO) {
                    NoteExporter.exportTextFile(context, NoteTransfer.secretKeyFilename(), content, "text/plain")
                }
                // The key is also shown, and copyable: the file leaves
                // through the share sheet, which the user may well cancel.
                generatedSecretKey = key
                if (shared) toasts.success(secretKeySavedMessage)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen downloadSecretKey failed", t)
                reportActionError(t)
            } finally {
                generatingSecretKey = false
            }
        }
    }

    /**
     * resetNoteOrder() (App.jsx:6614): pinned first, then most recently
     * updated, then most recently created, sent through the same reorder
     * the drag-and-drop uses. The web's own "override positions" checkbox
     * has no counterpart here: it only decides whether ITS in-memory copy
     * gets provisional positions before the server answers, and the server
     * assigns the real ones from the id lists either way
     * (server/index.js:2917-2933), which this app's optimistic reorder
     * already mirrors.
     */
    fun resetNoteOrder() {
        if (transferRunning) return
        transferRunning = true
        scope.launch {
            try {
                val all = repository.observeNotes().first()
                // Pinned first, then most recently modified. The web adds
                // creation date as a last tie-break; the local cache does
                // not keep one (see NoteEntity), so two notes modified in
                // the very same millisecond keep whatever order they had.
                val sorted = all.sortedWith(
                    compareByDescending<NoteEntity> { it.pinned }
                        .thenByDescending { it.updatedAt?.let(::parseIsoToEpochMillis) ?: 0L },
                )
                repository.reorderQueued(sorted.filter { it.pinned }, sorted.filterNot { it.pinned })
                SyncQueueWorker.triggerNow(context)
                toasts.success(orderResetMessage)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen resetNoteOrder failed", t)
                reportActionError(t)
            } finally {
                transferRunning = false
            }
        }
    }

    val importJsonLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runImport(importNoNotesMessage, importedTemplate, importFailedMessage) {
            val raw = context.contentResolver.openInputStream(uri)?.use { it.readBytes().decodeToString() }
            raw?.let { NoteTransfer.readGlassKeepExport(it) }
        }
    }

    val importGkeepLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        runImport(gkeepNoneMessage, gkeepImportedTemplate, gkeepFailedMessage) {
            NoteTransfer.readGoogleKeep(context, uris)
        }
    }

    val importMarkdownLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        runImport(markdownNoneMessage, markdownImportedTemplate, markdownFailedMessage) {
            NoteTransfer.readMarkdown(context, uris)
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
                        reportActionError(IllegalStateException("unreadable image"))
                    } else {
                        val confirmedUrl = repository.setAvatar(dataUrl)
                        profile = profile?.copy(avatarUrl = confirmedUrl)
                    }
                } catch (t: Throwable) {
                    NativeDebug.e("SettingsScreen setAvatar failed", t)
                    reportActionError(t)
                } finally {
                    changingAvatar = false
                }
            }
        }
    }

    fun removeAvatar() {
        if (changingAvatar) return
        changingAvatar = true
        scope.launch {
            try {
                repository.removeAvatar()
                profile = profile?.copy(avatarUrl = null)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen removeAvatar failed", t)
                reportActionError(t)
            } finally {
                changingAvatar = false
            }
        }
    }

    fun toggleShowOnLogin(value: Boolean) {
        if (changingShowOnLogin) return
        changingShowOnLogin = true
        scope.launch {
            try {
                val confirmed = repository.setShowOnLogin(value)
                profile = profile?.copy(showOnLogin = confirmed)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setShowOnLogin failed", t)
                reportActionError(t)
            } finally {
                changingShowOnLogin = false
            }
        }
    }

    fun changeLanguage(value: String?) {
        if (changingLanguage) return
        changingLanguage = true
        scope.launch {
            try {
                val confirmed = repository.setLanguage(value)
                profile = profile?.copy(language = confirmed)
                // Applied to this app's own UI too, not just saved on the
                // account: this restarts the Activity in the new language.
                AppLanguage.apply(confirmed)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setLanguage failed", t)
                reportActionError(t)
            } finally {
                changingLanguage = false
            }
        }
    }

    fun changeTheme(id: String) {
        if (changingTheme || id == themeId) return
        changingTheme = true
        // Applied immediately (same optimistic-then-persist shape the web's
        // own setShellTheme() uses), not rolled back if the PATCH below
        // fails: a failed save just means the choice doesn't survive a
        // future refetch, same as the web leaving its own applied class in
        // place while only the persistence step can silently fail.
        container.themeState.apply(id)
        scope.launch {
            try {
                repository.setShellTheme(id)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setShellTheme failed", t)
                reportActionError(t)
            } finally {
                changingTheme = false
            }
        }
    }

    fun changeChecklistInsertPosition(position: String) {
        if (changingChecklistPosition || position == container.editorPrefs.checklistInsertPosition) return
        changingChecklistPosition = true
        val previous = container.editorPrefs.checklistInsertPosition
        container.editorPrefs.applyChecklistInsertPosition(position)
        scope.launch {
            try {
                repository.setChecklistInsertPosition(position)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setChecklistInsertPosition failed", t)
                container.editorPrefs.applyChecklistInsertPosition(previous)
                reportActionError(t)
            } finally {
                changingChecklistPosition = false
            }
        }
    }

    fun changeToastPosition(position: String) {
        if (changingToastPrefs || position == container.editorPrefs.toastPosition) return
        changingToastPrefs = true
        val previous = container.editorPrefs.toastPosition
        container.editorPrefs.applyToastPosition(position)
        scope.launch {
            try {
                repository.setToastPosition(position)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setToastPosition failed", t)
                container.editorPrefs.applyToastPosition(previous)
                reportActionError(t)
            } finally {
                changingToastPrefs = false
            }
        }
    }

    fun changeToastDuration(durationMs: Long?) {
        if (changingToastPrefs || durationMs == container.editorPrefs.toastDurationMs) return
        changingToastPrefs = true
        val previous = container.editorPrefs.toastDurationMs
        container.editorPrefs.applyToastDuration(durationMs)
        scope.launch {
            try {
                repository.setToastDuration(durationMs)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setToastDuration failed", t)
                container.editorPrefs.applyToastDuration(previous)
                reportActionError(t)
            } finally {
                changingToastPrefs = false
            }
        }
    }

    /** buildPatch() (UserAiSettingsSection.jsx:118-129): the whole config
     *  every time, with [overrides] for the one field the caller is
     *  actually changing, and the key only when something was typed. */
    fun aiPatch(
        enabled: Boolean = aiSettings?.enabled ?: false,
        mode: String = aiSettings?.mode ?: "server",
        apiKey: String? = aiDraft.apiKey.takeIf { it.isNotEmpty() },
    ) = UserAiSettingsRequest(
        enabled = enabled,
        mode = mode,
        baseUrl = aiDraft.baseUrl.trim(),
        model = aiDraft.model.trim(),
        temperature = aiDraft.temperature.trim().toDoubleOrNull() ?: 0.3,
        maxTokens = aiDraft.maxTokens.trim().toIntOrNull() ?: 800,
        apiKey = apiKey,
    )

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
                reportActionError(t)
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
                        temperature = aiDraft.temperature.trim().toDoubleOrNull() ?: 0.3,
                        maxTokens = aiDraft.maxTokens.trim().toIntOrNull() ?: 800,
                        apiKey = aiDraft.apiKey.takeIf { it.isNotEmpty() },
                    )
                } else {
                    UserAiTestRequest(mode = "server")
                }
                val result = repository.testUserAi(request)
                aiTestOutcome = if (result.ok) {
                    // The reply itself is worth showing: it is how you
                    // tell a working endpoint from a reachable one.
                    val reply = result.reply?.takeIf { it.isNotBlank() }
                    AiTestOutcome(true, if (reply != null) "$aiTestOkMessage : $reply" else aiTestOkMessage)
                } else {
                    val detail = result.error?.takeIf { it.isNotBlank() }
                    AiTestOutcome(false, if (detail != null) "$aiTestFailedMessage : $detail" else aiTestFailedMessage)
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen testUserAi failed", t)
                aiTestOutcome = AiTestOutcome(false, "$aiTestFailedMessage : ${t.message ?: t.javaClass.simpleName}")
            } finally {
                testingAi = false
            }
        }
    }

    fun changeRemoveSectionBehavior(behavior: String) {
        if (changingRemoveSection || behavior == container.editorPrefs.checklistRemoveSectionBehavior) return
        changingRemoveSection = true
        val previous = container.editorPrefs.checklistRemoveSectionBehavior
        container.editorPrefs.applyChecklistRemoveSectionBehavior(behavior)
        scope.launch {
            try {
                repository.setChecklistRemoveSectionBehavior(behavior)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setChecklistRemoveSectionBehavior failed", t)
                container.editorPrefs.applyChecklistRemoveSectionBehavior(previous)
                reportActionError(t)
            } finally {
                changingRemoveSection = false
            }
        }
    }

    fun toggleNotificationsSound(enabled: Boolean) {
        if (changingNotifPrefs) return
        changingNotifPrefs = true
        val previous = container.editorPrefs.notificationsSound
        container.editorPrefs.applyNotificationsSound(enabled)
        scope.launch {
            try {
                repository.setNotificationsSound(enabled)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setNotificationsSound failed", t)
                container.editorPrefs.applyNotificationsSound(previous)
                reportActionError(t)
            } finally {
                changingNotifPrefs = false
            }
        }
    }

    fun toggleSoundCategory(category: NotifCategory, enabled: Boolean) {
        if (changingNotifPrefs) return
        changingNotifPrefs = true
        val previous = container.editorPrefs.notificationsSoundTypes
        val next = previous.with(category, enabled)
        container.editorPrefs.applyNotificationsSoundTypes(next)
        scope.launch {
            try {
                repository.setNotificationsSoundTypes(next.values)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setNotificationsSoundTypes failed", t)
                container.editorPrefs.applyNotificationsSoundTypes(previous)
                reportActionError(t)
            } finally {
                changingNotifPrefs = false
            }
        }
    }

    fun toggleFilterCategory(category: NotifCategory, enabled: Boolean) {
        if (changingNotifPrefs) return
        changingNotifPrefs = true
        val previous = container.editorPrefs.notificationsFilterTypes
        val next = previous.with(category, enabled)
        container.editorPrefs.applyNotificationsFilterTypes(next)
        scope.launch {
            try {
                repository.setNotificationsFilterTypes(next.values)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setNotificationsFilterTypes failed", t)
                container.editorPrefs.applyNotificationsFilterTypes(previous)
                reportActionError(t)
            } finally {
                changingNotifPrefs = false
            }
        }
    }

    fun toggleEdgeToEdgeLandscape(enabled: Boolean) {
        if (changingEdgeToEdge) return
        changingEdgeToEdge = true
        val previous = container.shellPrefs.edgeToEdgeLandscape
        container.shellPrefs.applyEdgeToEdgeLandscape(enabled)
        scope.launch {
            try {
                repository.setEdgeToEdgeLandscape(enabled)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setEdgeToEdgeLandscape failed", t)
                container.shellPrefs.applyEdgeToEdgeLandscape(previous)
                reportActionError(t)
            } finally {
                changingEdgeToEdge = false
            }
        }
    }

    fun toggleFloatingCards(enabled: Boolean) {
        if (changingFloatingCards) return
        changingFloatingCards = true
        val previous = container.shellPrefs.floatingCards
        container.shellPrefs.applyFloatingCards(enabled)
        scope.launch {
            try {
                repository.setFloatingCards(enabled)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setFloatingCards failed", t)
                container.shellPrefs.applyFloatingCards(previous)
                reportActionError(t)
            } finally {
                changingFloatingCards = false
            }
        }
    }

    fun toggleReadMode(enabled: Boolean) {
        if (changingReadMode) return
        changingReadMode = true
        val previous = container.editorPrefs.readModeEnabled
        container.editorPrefs.applyReadMode(enabled)
        scope.launch {
            try {
                repository.setReadMode(enabled)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setReadMode failed", t)
                container.editorPrefs.applyReadMode(previous)
                reportActionError(t)
            } finally {
                changingReadMode = false
            }
        }
    }

    fun changeToolbarMode(mode: String) {
        if (changingToolbarMode || mode == container.editorPrefs.toolbarMode) return
        changingToolbarMode = true
        val previous = container.editorPrefs.toolbarMode
        container.editorPrefs.applyToolbarMode(mode)
        scope.launch {
            try {
                repository.setEditorToolbarMode(mode)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setEditorToolbarMode failed", t)
                container.editorPrefs.applyToolbarMode(previous)
                reportActionError(t)
            } finally {
                changingToolbarMode = false
            }
        }
    }

    /** Saves the whole presets blob on every edit, same as the web's own
     *  setPresets: the modal has no Save button, each control is applied
     *  as it is touched. */
    fun changeTypography(presets: TypographyPresets) {
        val previous = container.editorPrefs.typography
        container.editorPrefs.applyTypography(presets)
        scope.launch {
            try {
                repository.setTypographyPresets(presets)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setTypographyPresets failed", t)
                container.editorPrefs.applyTypography(previous)
                reportActionError(t)
            }
        }
    }

    fun submitPasswordChange() {
        if (changingPassword) return
        passwordDialogError = null
        if (newPasswordInput.length < 6) {
            passwordDialogError = passwordTooShortMessage
            return
        }
        if (newPasswordInput != confirmPasswordInput) {
            passwordDialogError = passwordMismatchMessage
            return
        }
        changingPassword = true
        scope.launch {
            try {
                when (val result = repository.changePassword(currentPasswordInput.ifBlank { null }, newPasswordInput)) {
                    is ChangePasswordResult.Saved -> {
                        // The server invalidated every other session with this
                        // change; this device keeps working only because it
                        // gets the fresh token below (see changePassword's own
                        // doc comment).
                        container.tokenStore.token = result.token
                        showPasswordDialog = false
                        currentPasswordInput = ""
                        newPasswordInput = ""
                        confirmPasswordInput = ""
                        toasts.success(passwordSuccessMessage)
                    }
                    is ChangePasswordResult.Rejected -> {
                        passwordDialogError = String.format(passwordErrorTemplate, result.httpCode)
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen changePassword failed", t)
                passwordDialogError = String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                changingPassword = false
            }
        }
    }

    /** Drops the stored address and restarts on the setup screen, the
     *  same two prefs and the same CLEAR_TASK restart WebViewActivity's
     *  own change-server dialog performs. */
    fun changeServer() {
        context.getSharedPreferences("glasskeep", Context.MODE_PRIVATE)
            .edit()
            .remove("server_url")
            .remove(MainActivity.KEY_URL_VETTED)
            .apply()
        val intent = Intent(context, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        context.startActivity(intent)
        activity.finish()
    }

    fun checkForUpdate() {
        toasts.show(updateCheckingMessage)
        UpdateManager.forceCheck(context) { release ->
            availableUpdate = release
            if (release == null) {
                toasts.success(updateUpToDateMessage)
            }
        }
    }

    fun downloadUpdate(release: ReleaseInfo) {
        toasts.show(updateDownloadingMessage)
        UpdateManager.downloadAndInstall(context, release) { ok ->
            if (!ok) toasts.error(updateDownloadFailedMessage)
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            // .gk-side-panel on a phone: the panel is opaque
            // --gk-statusbar, not the page background behind it.
            .background(WorkspaceTheme.statusBarColor(themeId, dark))
            .windowInsetsPadding(WindowInsets.systemBars),
    ) {
        Column(Modifier.fillMaxSize()) {
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
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                val closeLabel = stringResource(R.string.native_common_close)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .semantics { contentDescription = closeLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onBack() }
                        .padding(8.dp),
                ) {
                    CloseIcon(size = 24.dp, tint = titleColor)
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))

            when {
                loadError != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(loadError.orEmpty(), color = DangerRed, modifier = Modifier.padding(24.dp))
                }
                profile == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = accent)
                        Spacer(Modifier.height(12.dp))
                        Text(stringResource(R.string.native_settings_loading), color = subtextColor)
                    }
                }
                else -> {
                    val current = profile!!
                    BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
                        val bodyMinHeight = maxHeight
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .verticalScroll(rememberScrollState())
                                .heightIn(min = bodyMinHeight)
                                .padding(16.dp),
                            // Two children only, so SpaceBetween is the
                            // web's `mt-auto` on the version badge: it
                            // sits at the bottom while the sections fit,
                            // and flows right after them once they don't.
                            verticalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column {
                                // Profile block: mb-4 under the row plus
                                // the mb-8 wrapper (SettingsPanel.jsx:319).
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(bottom = 48.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    AvatarCircle(
                                        avatarUrl = current.avatarUrl,
                                        name = current.name.ifBlank { current.email },
                                        size = 64.dp,
                                        onClick = { avatarPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                    )
                                    Spacer(Modifier.width(16.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(
                                            current.name.ifBlank { current.email },
                                            color = titleColor,
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Row(modifier = Modifier.padding(top = 4.dp)) {
                                            ProfileLink(
                                                label = if (current.avatarUrl != null) {
                                                    stringResource(R.string.native_settings_change_avatar)
                                                } else {
                                                    stringResource(R.string.native_settings_upload_avatar)
                                                },
                                                color = accent,
                                                enabled = !changingAvatar,
                                                onClick = { avatarPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                            )
                                            if (current.avatarUrl != null) {
                                                Spacer(Modifier.width(8.dp))
                                                ProfileLink(
                                                    label = stringResource(R.string.native_settings_remove_avatar),
                                                    color = LinkRed,
                                                    enabled = !changingAvatar,
                                                    onClick = { removeAvatar() },
                                                )
                                            }
                                        }
                                        Row(modifier = Modifier.padding(top = 4.dp)) {
                                            ProfileLink(
                                                label = stringResource(R.string.native_settings_change_server),
                                                color = accent,
                                                enabled = true,
                                                onClick = { showChangeServerDialog = true },
                                            )
                                        }
                                    }
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
                                        checked = current.showOnLogin,
                                        enabled = !changingShowOnLogin,
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        icon = { tint -> EyeIcon(size = 20.dp, tint = tint) },
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
                                        onClick = { passwordDialogError = null; showPasswordDialog = true },
                                    )

                                    // mt-5 on the web, where the rows are
                                    // already 12px apart (SettingsPanel.jsx:434).
                                    SettingsCardButton(
                                        title = stringResource(R.string.native_settings_qr_signin),
                                        subtitle = stringResource(R.string.native_settings_qr_signin_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        icon = { tint -> QrCodeIcon(size = 20.dp, tint = tint) },
                                        onClick = onOpenQrScanner,
                                        modifier = Modifier.padding(top = 8.dp),
                                    )

                                    PasskeysCard(
                                        passkeys = passkeys,
                                        listOpen = passkeyListOpen,
                                        adding = addingPasskey,
                                        testingId = testingPasskeyId,
                                        renamingId = renamingPasskeyId,
                                        removingId = removingPasskeyId,
                                        untitledLabel = passkeyUntitledLabel,
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        onToggleList = { passkeyListOpen = !passkeyListOpen },
                                        onAdd = { addPasskeyNameInput = ""; showAddPasskeyDialog = true },
                                        onTest = { testPasskey(it) },
                                        onRename = { renamePasskeyTarget = it; renamePasskeyInput = it.name.orEmpty() },
                                        onDelete = { pendingDeletePasskeyId = it },
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
                                    contentSpacing = 12.dp,
                                ) {
                                    SettingsSwitchRow(
                                        title = stringResource(R.string.native_settings_edge_to_edge_landscape),
                                        subtitle = stringResource(R.string.native_settings_edge_to_edge_landscape_desc),
                                        checked = container.shellPrefs.edgeToEdgeLandscape,
                                        enabled = !changingEdgeToEdge,
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        icon = { tint -> DeviceMobileRotatedIcon(size = 20.dp, tint = tint) },
                                        onCheckedChange = { toggleEdgeToEdgeLandscape(it) },
                                    )
                                    SettingsSwitchRow(
                                        title = stringResource(R.string.native_settings_animations),
                                        subtitle = stringResource(R.string.native_settings_animations_desc),
                                        checked = container.shellPrefs.floatingCards,
                                        enabled = !changingFloatingCards,
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        icon = { tint -> SparklesIcon(size = 20.dp, tint = tint) },
                                        onCheckedChange = { toggleFloatingCards(it) },
                                    )
                                    // The web fences the theme picker off from
                                    // the switches above with a hairline
                                    // (SettingsPanel.jsx:655-657).
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .topHairline(borderColor)
                                            .padding(top = 8.dp)
                                            .padding(horizontal = 12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        SettingsRowIcon(themeId, dark) { tint -> PaintRollerIcon(size = 20.dp, tint = tint) }
                                        Spacer(Modifier.width(12.dp))
                                        Column {
                                            Text(
                                                stringResource(R.string.native_settings_theme_title),
                                                color = titleColor,
                                                fontSize = 16.sp,
                                                fontWeight = FontWeight.Medium,
                                            )
                                            Text(
                                                stringResource(R.string.native_settings_theme_desc),
                                                color = SettingsSubtleColor,
                                                fontSize = 14.sp,
                                                lineHeight = 20.sp,
                                            )
                                        }
                                    }
                                    ThemeGrid(
                                        currentThemeId = themeId,
                                        enabled = !changingTheme,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        accent = accent,
                                        modifier = Modifier.padding(horizontal = 12.dp),
                                        onSelect = { changeTheme(it) },
                                    )
                                }

                                SettingsAccordionSection(
                                    title = stringResource(R.string.native_settings_notifications_section),
                                    expanded = notificationsOpen,
                                    themeId = themeId,
                                    dark = dark,
                                    titleColor = titleColor,
                                    icon = { tint -> BellIcon(size = 20.dp, tint = tint) },
                                    onToggle = { notificationsOpen = !notificationsOpen },
                                    contentSpacing = 16.dp,
                                ) {
                                    Column(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            SettingsRowIcon(themeId, dark) { tint -> BellIcon(size = 20.dp, tint = tint) }
                                            Spacer(Modifier.width(12.dp))
                                            Column {
                                                Text(
                                                    stringResource(R.string.native_settings_notif_position),
                                                    color = titleColor,
                                                    fontSize = 16.sp,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                                Text(
                                                    stringResource(R.string.native_settings_notif_position_desc),
                                                    color = SettingsSubtleColor,
                                                    fontSize = 14.sp,
                                                    lineHeight = 20.sp,
                                                )
                                            }
                                        }
                                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                                            GkSegmented(
                                                options = listOf(
                                                    GkSegmentOption("top", stringResource(R.string.native_settings_notif_position_top)),
                                                    GkSegmentOption("bottom", stringResource(R.string.native_settings_notif_position_bottom)),
                                                ),
                                                selectedId = container.editorPrefs.toastPosition,
                                                enabled = !changingToastPrefs,
                                                themeId = themeId,
                                                dark = dark,
                                                onSelect = { changeToastPosition(it) },
                                            )
                                        }
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                                SettingsRowIcon(themeId, dark) { tint -> VolumeIcon(size = 20.dp, tint = tint) }
                                                Spacer(Modifier.width(12.dp))
                                                Column {
                                                    Text(
                                                        stringResource(R.string.native_settings_notif_sound),
                                                        color = titleColor,
                                                        fontSize = 16.sp,
                                                        fontWeight = FontWeight.Medium,
                                                    )
                                                    Text(
                                                        stringResource(R.string.native_settings_notif_sound_desc),
                                                        color = SettingsSubtleColor,
                                                        fontSize = 14.sp,
                                                        lineHeight = 20.sp,
                                                    )
                                                }
                                            }
                                            Spacer(Modifier.width(4.dp))
                                            CategoryListToggle(
                                                open = notifSoundTypesOpen,
                                                label = stringResource(R.string.native_settings_notif_sound_types),
                                                themeId = themeId,
                                                dark = dark,
                                                onClick = { notifSoundTypesOpen = !notifSoundTypesOpen },
                                            )
                                            Spacer(Modifier.width(4.dp))
                                            GkSwitch(
                                                checked = container.editorPrefs.notificationsSound,
                                                enabled = !changingNotifPrefs,
                                                themeId = themeId,
                                                dark = dark,
                                                onCheckedChange = { toggleNotificationsSound(it) },
                                            )
                                        }
                                        if (notifSoundTypesOpen) {
                                            NotifCategoryList(
                                                categories = NotifCategory.SOUND,
                                                flags = container.editorPrefs.notificationsSoundTypes,
                                                // Every row greys out while the
                                                // master switch is off: nothing
                                                // would ring anyway.
                                                enabled = container.editorPrefs.notificationsSound && !changingNotifPrefs,
                                                dark = dark,
                                                titleColor = titleColor,
                                                borderColor = borderColor,
                                                onToggle = { category, on -> toggleSoundCategory(category, on) },
                                            )
                                        }

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                                SettingsRowIcon(themeId, dark) { tint -> BellIcon(size = 20.dp, tint = tint) }
                                                Spacer(Modifier.width(12.dp))
                                                Column {
                                                    Text(
                                                        stringResource(R.string.native_settings_notif_filter),
                                                        color = titleColor,
                                                        fontSize = 16.sp,
                                                        fontWeight = FontWeight.Medium,
                                                    )
                                                    Text(
                                                        stringResource(R.string.native_settings_notif_filter_desc),
                                                        color = SettingsSubtleColor,
                                                        fontSize = 14.sp,
                                                        lineHeight = 20.sp,
                                                    )
                                                }
                                            }
                                            Spacer(Modifier.width(4.dp))
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
                                                flags = container.editorPrefs.notificationsFilterTypes,
                                                enabled = !changingNotifPrefs,
                                                dark = dark,
                                                titleColor = titleColor,
                                                borderColor = borderColor,
                                                onToggle = { category, on -> toggleFilterCategory(category, on) },
                                            )
                                        }

                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            SettingsRowIcon(themeId, dark) { tint -> RefreshIcon(size = 20.dp, tint = tint) }
                                            Spacer(Modifier.width(12.dp))
                                            Column {
                                                Text(
                                                    stringResource(R.string.native_settings_notif_duration),
                                                    color = titleColor,
                                                    fontSize = 16.sp,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                                Text(
                                                    stringResource(R.string.native_settings_notif_duration_desc),
                                                    color = SettingsSubtleColor,
                                                    fontSize = 14.sp,
                                                    lineHeight = 20.sp,
                                                )
                                            }
                                        }
                                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                                            ToastDurationPicker(
                                                durationMs = container.editorPrefs.toastDurationMs,
                                                menuOpen = toastDurationMenuOpen,
                                                enabled = !changingToastPrefs,
                                                themeId = themeId,
                                                dark = dark,
                                                titleColor = titleColor,
                                                borderColor = borderColor,
                                                onToggleMenu = { toastDurationMenuOpen = !toastDurationMenuOpen },
                                                onDismissMenu = { toastDurationMenuOpen = false },
                                                onSelect = { toastDurationMenuOpen = false; changeToastDuration(it) },
                                            )
                                        }
                                    }
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
                                    Column(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        SettingsSwitchRow(
                                            title = stringResource(R.string.native_settings_read_mode),
                                            subtitle = stringResource(R.string.native_settings_read_mode_desc),
                                            checked = container.editorPrefs.readModeEnabled,
                                            enabled = !changingReadMode,
                                            themeId = themeId,
                                            dark = dark,
                                            titleColor = titleColor,
                                            icon = { tint -> EyeIcon(size = 20.dp, tint = tint) },
                                            onCheckedChange = { toggleReadMode(it) },
                                        )
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            SettingsRowIcon(themeId, dark) { tint -> TextColorIcon(size = 20.dp, tint = tint) }
                                            Spacer(Modifier.width(12.dp))
                                            Column {
                                                Text(
                                                    stringResource(R.string.native_settings_editor_toolbar_mode),
                                                    color = titleColor,
                                                    fontSize = 16.sp,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                                Text(
                                                    stringResource(
                                                        if (container.editorPrefs.toolbarMode == "advanced") {
                                                            R.string.native_settings_editor_toolbar_advanced_desc
                                                        } else {
                                                            R.string.native_settings_editor_toolbar_simple_desc
                                                        },
                                                    ),
                                                    color = SettingsSubtleColor,
                                                    fontSize = 14.sp,
                                                    lineHeight = 20.sp,
                                                )
                                            }
                                        }
                                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                                            GkSegmented(
                                                options = listOf(
                                                    GkSegmentOption("simple", stringResource(R.string.native_settings_editor_toolbar_simple)),
                                                    GkSegmentOption("advanced", stringResource(R.string.native_settings_editor_toolbar_advanced)),
                                                ),
                                                selectedId = container.editorPrefs.toolbarMode,
                                                enabled = !changingToolbarMode,
                                                themeId = themeId,
                                                dark = dark,
                                                onSelect = { changeToolbarMode(it) },
                                            )
                                        }
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            SettingsRowIcon(themeId, dark) { tint -> PaintRollerIcon(size = 20.dp, tint = tint) }
                                            Spacer(Modifier.width(12.dp))
                                            Column {
                                                Text(
                                                    stringResource(R.string.native_typography_title),
                                                    color = titleColor,
                                                    fontSize = 16.sp,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                                Text(
                                                    stringResource(R.string.native_typography_desc),
                                                    color = SettingsSubtleColor,
                                                    fontSize = 14.sp,
                                                    lineHeight = 20.sp,
                                                )
                                            }
                                        }
                                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                                            GkGradientButton(
                                                label = stringResource(R.string.native_typography_open),
                                                themeId = themeId,
                                                onClick = { showTypographyModal = true },
                                            )
                                        }
                                    }

                                    SettingsSubHeading(stringResource(R.string.native_settings_checklist_group), dark)
                                    Column(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            SettingsRowIcon(themeId, dark) { tint -> IndentIncreaseIcon(size = 20.dp, tint = tint) }
                                            Spacer(Modifier.width(12.dp))
                                            Column {
                                                Text(
                                                    stringResource(R.string.native_settings_checklist_insert_position),
                                                    color = titleColor,
                                                    fontSize = 16.sp,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                                Text(
                                                    stringResource(R.string.native_settings_checklist_insert_position_desc),
                                                    color = SettingsSubtleColor,
                                                    fontSize = 14.sp,
                                                    lineHeight = 20.sp,
                                                )
                                            }
                                        }
                                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                                            GkSegmented(
                                                options = listOf(
                                                    GkSegmentOption("top", stringResource(R.string.native_settings_checklist_insert_top)),
                                                    GkSegmentOption("bottom", stringResource(R.string.native_settings_checklist_insert_bottom)),
                                                ),
                                                selectedId = container.editorPrefs.checklistInsertPosition,
                                                enabled = !changingChecklistPosition,
                                                themeId = themeId,
                                                dark = dark,
                                                onSelect = { changeChecklistInsertPosition(it) },
                                            )
                                        }
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            SettingsRowIcon(themeId, dark) { tint -> FilterQuestionIcon(size = 20.dp, tint = tint) }
                                            Spacer(Modifier.width(12.dp))
                                            Column {
                                                Text(
                                                    stringResource(R.string.native_settings_checklist_remove_section),
                                                    color = titleColor,
                                                    fontSize = 16.sp,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                                Text(
                                                    stringResource(R.string.native_settings_checklist_remove_section_desc),
                                                    color = SettingsSubtleColor,
                                                    fontSize = 14.sp,
                                                    lineHeight = 20.sp,
                                                )
                                            }
                                        }
                                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                                            GkSegmented(
                                                options = listOf(
                                                    GkSegmentOption("cascade", stringResource(R.string.native_settings_checklist_remove_cascade)),
                                                    GkSegmentOption("keep", stringResource(R.string.native_settings_checklist_remove_keep)),
                                                ),
                                                selectedId = container.editorPrefs.checklistRemoveSectionBehavior,
                                                enabled = !changingRemoveSection,
                                                themeId = themeId,
                                                dark = dark,
                                                onSelect = { changeRemoveSectionBehavior(it) },
                                            )
                                        }
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
                                        enabled = !transferRunning,
                                        icon = { tint -> UploadIcon(size = 20.dp, tint = tint) },
                                        onClick = { exportAllNotes() },
                                    )
                                    SettingsCardButton(
                                        title = stringResource(R.string.native_settings_import_json),
                                        subtitle = stringResource(R.string.native_settings_import_json_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        enabled = !transferRunning,
                                        icon = { tint -> TablerDownloadIcon(size = 20.dp, tint = tint) },
                                        // "*/*" as well: a .json picked from a
                                        // file manager often reports as
                                        // application/octet-stream.
                                        onClick = { importJsonLauncher.launch(arrayOf("application/json", "*/*")) },
                                    )
                                    SettingsCardButton(
                                        title = stringResource(R.string.native_settings_import_gkeep),
                                        subtitle = stringResource(R.string.native_settings_import_gkeep_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        enabled = !transferRunning,
                                        icon = { tint -> BrandGoogleIcon(size = 20.dp, tint = tint) },
                                        onClick = { importGkeepLauncher.launch(arrayOf("application/zip", "application/json", "image/*", "*/*")) },
                                    )
                                    SettingsCardButton(
                                        title = stringResource(R.string.native_settings_import_markdown),
                                        subtitle = stringResource(R.string.native_settings_import_markdown_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        enabled = !transferRunning,
                                        icon = { tint -> FileTextIcon(size = 20.dp, tint = tint) },
                                        onClick = { importMarkdownLauncher.launch(arrayOf("text/markdown", "text/plain", "*/*")) },
                                    )
                                    SettingsCardButton(
                                        title = stringResource(R.string.native_settings_secret_key_generate),
                                        subtitle = stringResource(R.string.native_settings_secret_key_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        enabled = !generatingSecretKey,
                                        icon = { tint -> TablerKeyIcon(size = 20.dp, tint = tint) },
                                        onClick = { downloadSecretKey() },
                                    )
                                    SettingsCardButton(
                                        title = stringResource(R.string.native_settings_reset_order),
                                        subtitle = stringResource(R.string.native_settings_reset_order_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        enabled = !transferRunning,
                                        icon = { tint -> ArrowsSortIcon(size = 20.dp, tint = tint) },
                                        onClick = { showResetOrderConfirm = true },
                                    )
                                }

                                aiSettings?.let { ai ->
                                    SettingsAccordionSection(
                                        title = stringResource(R.string.native_settings_ai_section),
                                        expanded = aiOpen,
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        icon = { tint -> BrainIcon(size = 20.dp, tint = tint) },
                                        onToggle = { aiOpen = !aiOpen },
                                    ) {
                                        AiSettingsSection(
                                            settings = ai,
                                            draft = aiDraft,
                                            testOutcome = aiTestOutcome,
                                            busy = savingAi,
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
                                            // The one call that sends an
                                            // empty key on purpose: that is
                                            // how the server is told to
                                            // forget the stored one.
                                            onClearApiKey = {
                                                saveAiSettings(aiPatch(apiKey = ""), aiKeyClearedMessage)
                                            },
                                            onTest = { testAiSettings() },
                                            onSave = { saveAiSettings(aiPatch(), aiSavedMessage) },
                                        )
                                    }
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
                                            subtitle = stringResource(R.string.native_settings_update_fdroid),
                                            themeId = themeId,
                                            dark = dark,
                                            titleColor = titleColor,
                                            borderColor = borderColor,
                                            icon = { tint -> TablerDownloadIcon(size = 20.dp, tint = tint) },
                                            onClick = { openFdroidPage(context) },
                                            footer = { VersionLine(dark) },
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
                                        language = current.language,
                                        menuOpen = languageMenuOpen,
                                        enabled = !changingLanguage,
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
                                    color = if (dark) VersionBadgeDark else VersionBadgeLight,
                                    fontSize = 12.sp,
                                )
                            }
                        }
                    }
                }
            }
        }

        if (showTypographyModal) {
            TypographyModal(
                presets = container.editorPrefs.typography,
                themeId = themeId,
                dark = dark,
                onChange = { changeTypography(it) },
                onDismiss = { showTypographyModal = false },
            )
        }

        if (showPasswordDialog) {
            GkDialog(
                onDismissRequest = { if (!changingPassword) showPasswordDialog = false },
                dark = dark,
                borderColor = borderColor,
                dismissOnClickOutside = false,
            ) {
                Text(
                    stringResource(R.string.native_settings_change_password),
                    color = titleColor,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
                GkTextField(
                    value = currentPasswordInput,
                    onValueChange = { currentPasswordInput = it; passwordDialogError = null },
                    label = stringResource(R.string.native_settings_password_current),
                    placeholder = stringResource(R.string.native_settings_password_current),
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                    visualTransformation = PasswordVisualTransformation(),
                )
                Spacer(Modifier.height(16.dp))
                GkTextField(
                    value = newPasswordInput,
                    onValueChange = { newPasswordInput = it; passwordDialogError = null },
                    label = stringResource(R.string.native_settings_password_new),
                    placeholder = stringResource(R.string.native_settings_password_new),
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                    visualTransformation = PasswordVisualTransformation(),
                )
                Spacer(Modifier.height(16.dp))
                GkTextField(
                    value = confirmPasswordInput,
                    onValueChange = { confirmPasswordInput = it; passwordDialogError = null },
                    label = stringResource(R.string.native_settings_password_confirm),
                    placeholder = stringResource(R.string.native_settings_password_confirm),
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    visualTransformation = PasswordVisualTransformation(),
                )
                passwordDialogError?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = DangerRed, fontSize = 14.sp)
                }
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                ) {
                    GkSecondaryButton(
                        label = stringResource(R.string.native_dialog_cancel),
                        borderColor = borderColor,
                        textColor = titleColor,
                        enabled = !changingPassword,
                        onClick = { showPasswordDialog = false },
                    )
                    GkGradientButton(
                        label = stringResource(R.string.native_settings_change_password),
                        themeId = themeId,
                        enabled = !changingPassword,
                        onClick = { submitPasswordChange() },
                    )
                }
            }
        }

        if (showAddPasskeyDialog) {
            GkDialog(
                onDismissRequest = { if (!addingPasskey) showAddPasskeyDialog = false },
                dark = dark,
                borderColor = borderColor,
            ) {
                Text(
                    stringResource(R.string.native_settings_passkeys_name_prompt),
                    color = titleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
                Spacer(Modifier.height(12.dp))
                GkTextField(
                    value = addPasskeyNameInput,
                    onValueChange = { addPasskeyNameInput = it.take(64) },
                    label = null,
                    placeholder = stringResource(R.string.native_settings_passkeys_add_name_placeholder),
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                )
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                ) {
                    GkSecondaryButton(
                        label = stringResource(R.string.native_dialog_cancel),
                        borderColor = borderColor,
                        textColor = titleColor,
                        enabled = !addingPasskey,
                        onClick = { showAddPasskeyDialog = false },
                    )
                    GkGradientButton(
                        label = stringResource(R.string.native_settings_passkeys_add),
                        themeId = themeId,
                        enabled = !addingPasskey,
                        onClick = { addPasskey(addPasskeyNameInput.trim()) },
                    )
                }
            }
        }

        renamePasskeyTarget?.let { target ->
            GkDialog(
                onDismissRequest = { if (renamingPasskeyId == null) renamePasskeyTarget = null },
                dark = dark,
                borderColor = borderColor,
            ) {
                Text(
                    stringResource(R.string.native_settings_passkeys_rename_prompt),
                    color = titleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
                Spacer(Modifier.height(12.dp))
                GkTextField(
                    value = renamePasskeyInput,
                    onValueChange = { renamePasskeyInput = it.take(64) },
                    label = null,
                    placeholder = stringResource(R.string.native_settings_passkeys_add_name_placeholder),
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                )
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                ) {
                    GkSecondaryButton(
                        label = stringResource(R.string.native_dialog_cancel),
                        borderColor = borderColor,
                        textColor = titleColor,
                        enabled = renamingPasskeyId == null,
                        onClick = { renamePasskeyTarget = null },
                    )
                    GkGradientButton(
                        label = stringResource(R.string.native_settings_passkeys_rename),
                        themeId = themeId,
                        enabled = renamingPasskeyId == null && renamePasskeyInput.isNotBlank(),
                        onClick = { renamePasskey(target.credentialId, renamePasskeyInput.trim()) },
                    )
                }
            }
        }

        val deletePasskeyTargetId = pendingDeletePasskeyId
        if (deletePasskeyTargetId != null) {
            GkDialog(
                onDismissRequest = { pendingDeletePasskeyId = null },
                dark = dark,
                borderColor = borderColor,
            ) {
                Text(
                    stringResource(R.string.native_settings_passkeys_delete_confirm_title),
                    color = titleColor,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.native_settings_passkeys_delete_confirm_body),
                    color = subtextColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
                Spacer(Modifier.height(20.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                ) {
                    GkSecondaryButton(
                        label = stringResource(R.string.native_dialog_cancel),
                        borderColor = borderColor,
                        textColor = titleColor,
                        onClick = { pendingDeletePasskeyId = null },
                    )
                    GkDangerButton(
                        label = stringResource(R.string.native_settings_passkeys_delete),
                        onClick = {
                            pendingDeletePasskeyId = null
                            deletePasskey(deletePasskeyTargetId)
                        },
                    )
                }
            }
        }

        generatedSecretKey?.let { key ->
            GkDialog(
                onDismissRequest = { generatedSecretKey = null },
                dark = dark,
                borderColor = borderColor,
            ) {
                Text(
                    stringResource(R.string.native_settings_secret_key_dialog_title),
                    color = titleColor,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    key,
                    color = titleColor,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 14.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(WorkspaceTheme.accentSoftBg(themeId, dark))
                        .padding(12.dp),
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    stringResource(R.string.native_settings_secret_key_warning),
                    color = subtextColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
                Spacer(Modifier.height(20.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                ) {
                    GkSecondaryButton(
                        label = stringResource(R.string.native_dialog_cancel),
                        borderColor = borderColor,
                        textColor = titleColor,
                        onClick = { generatedSecretKey = null },
                    )
                    GkGradientButton(
                        label = stringResource(R.string.native_settings_secret_key_copy),
                        themeId = themeId,
                        onClick = {
                            scope.launch {
                                clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("secret key", key)))
                                toasts.success(copiedMessage)
                            }
                        },
                    )
                }
            }
        }

        if (showResetOrderConfirm) {
            GkConfirmDialog(
                title = stringResource(R.string.native_settings_reset_order),
                message = stringResource(R.string.native_settings_reset_order_confirm),
                confirmLabel = stringResource(R.string.native_settings_reset_order_action),
                cancelLabel = stringResource(R.string.native_dialog_cancel),
                themeId = themeId,
                dark = dark,
                borderColor = borderColor,
                titleColor = titleColor,
                subtextColor = subtextColor,
                onConfirm = { showResetOrderConfirm = false; resetNoteOrder() },
                onDismiss = { showResetOrderConfirm = false },
            )
        }

        if (showChangeServerDialog) {
            GkDialog(
                onDismissRequest = { showChangeServerDialog = false },
                dark = dark,
                borderColor = borderColor,
            ) {
                Text(
                    stringResource(R.string.dialog_change_server),
                    color = titleColor,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.dialog_change_message),
                    color = subtextColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
                Spacer(Modifier.height(20.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                ) {
                    GkSecondaryButton(
                        label = stringResource(R.string.dialog_no),
                        borderColor = borderColor,
                        textColor = titleColor,
                        onClick = { showChangeServerDialog = false },
                    )
                    GkGradientButton(
                        label = stringResource(R.string.dialog_yes),
                        themeId = themeId,
                        onClick = { showChangeServerDialog = false; changeServer() },
                    )
                }
            }
        }
    }
}

/** f-droid.org resolves to whichever F-Droid client is installed, same
 *  as WebViewActivity's own openFdroidPage(): the section only shows
 *  this when the APK came from one of them. */
private fun openFdroidPage(context: Context) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://f-droid.org/packages/${context.packageName}/"))
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (t: Throwable) {
        NativeDebug.e("SettingsScreen openFdroidPage failed", t)
    }
}

/** The 12px accent links under the profile name. */
@Composable
private fun ProfileLink(label: String, color: Color, enabled: Boolean, onClick: () -> Unit) {
    Text(
        label,
        color = color,
        fontSize = 12.sp,
        modifier = Modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            enabled = enabled,
            role = Role.Button,
        ) { onClick() },
    )
}

/** The `tabular-nums` version line the update rows carry under their
 *  subtitle (`SettingsPanel.jsx:1425`). */
@Composable
private fun VersionLine(dark: Boolean) {
    Text(
        stringResource(R.string.native_settings_current_version, BuildConfig.VERSION_NAME),
        color = if (dark) VersionBadgeDark else VersionBadgeLight,
        fontSize = 12.sp,
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
            .padding(horizontal = 12.dp, vertical = 12.dp),
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
                    color = titleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Text(
                    stringResource(R.string.native_settings_update_server_hint),
                    color = SettingsSubtleColor,
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
                    color = if (dark) DarkSubtextColor else Color(0xFF4B5563),
                    fontSize = 14.sp,
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
 * list (SettingsPanel.jsx:804-816): a small square that fills with the
 * accent while the list is open, and whose glyph flips over.
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
            .padding(6.dp),
    ) {
        ChevronDownIcon(
            size = 16.dp,
            tint = tint,
            modifier = Modifier.graphicsLayer { rotationZ = if (open) 180f else 0f },
        )
    }
}

/**
 * The per-category list under a Notifications row: one line per bucket,
 * each with its own glyph and a smaller switch, inside a bordered, faintly
 * tinted panel indented to clear the row's icon above
 * (SettingsPanel.jsx:834-864).
 */
@Composable
private fun NotifCategoryList(
    categories: List<NotifCategory>,
    flags: NotifCategoryFlags,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onToggle: (NotifCategory, Boolean) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 40.dp, top = 8.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color.White.copy(alpha = 0.03f) else Color.Black.copy(alpha = 0.02f))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for (category in categories) {
            val on = flags[category]
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .alpha(if (enabled) 1f else 0.5f)
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    NotifCategoryIcon(category, dark)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(notifCategoryLabel(category)), color = titleColor, fontSize = 14.sp)
                }
                Spacer(Modifier.width(12.dp))
                GkSmallSwitch(
                    checked = on,
                    enabled = enabled,
                    dark = dark,
                    onCheckedChange = { onToggle(category, it) },
                )
            }
        }
    }
}

/** The glyph each category carries, and the fixed colour the filled ones
 *  paint with (SettingsPanel.jsx:838-843 and 926-933). */
@Composable
private fun NotifCategoryIcon(category: NotifCategory, dark: Boolean) {
    val neutral = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280)
    when (category) {
        NotifCategory.FEDERATION -> WorldWwwIcon(size = 16.dp, tint = neutral)
        NotifCategory.SHARE -> UserShareIcon(size = 16.dp, tint = neutral)
        NotifCategory.ACCESS -> UserXIcon(size = 16.dp, tint = neutral)
        NotifCategory.REMINDER -> BellRingingFilledIcon(size = 16.dp, tint = Color(0xFF6366F1))
        NotifCategory.SUCCESS -> CircleCheckFilledIcon(size = 16.dp, tint = Color(0xFF10B981))
        NotifCategory.WARNING -> AlertFilledIcon(size = 16.dp, tint = Color(0xFFF59E0B))
        NotifCategory.ERROR -> InfoFilledIcon(size = 16.dp, tint = Color(0xFFEF4444))
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

/** The five durations the web offers, "Persistent" included: a pill that
 *  opens a small popover, same shape as the language row below. */
@Composable
private fun ToastDurationPicker(
    durationMs: Long?,
    menuOpen: Boolean,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
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
        var buttonHeight by remember { mutableStateOf(0) }
        val density = LocalDensity.current
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .alpha(if (enabled) 1f else 0.5f)
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                .onSizeChanged { buttonHeight = it.height }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onToggleMenu() }
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(selectedLabel, color = titleColor, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            ChevronDownIcon(
                modifier = Modifier.rotate(if (menuOpen) 180f else 0f),
                size = 14.dp,
                tint = SettingsSubtleColor,
            )
        }
        if (menuOpen) {
            Popup(
                alignment = Alignment.TopEnd,
                offset = IntOffset(0, buttonHeight + with(density) { 6.dp.roundToPx() }),
                onDismissRequest = onDismissMenu,
                properties = PopupProperties(focusable = true),
            ) {
                SettingsPopoverCard(dark = dark, borderColor = borderColor) {
                    for ((value, label) in options) {
                        SettingsPopoverOption(
                            label = label,
                            selected = value == durationMs,
                            themeId = themeId,
                            dark = dark,
                            titleColor = titleColor,
                            onClick = { onSelect(value) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LanguageRow(
    language: String?,
    menuOpen: Boolean,
    enabled: Boolean,
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
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 12.dp),
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
            // Measured on the button itself so the menu opens 6px under
            // its bottom edge, the offset Popover.jsx uses.
            var buttonHeight by remember { mutableStateOf(0) }
            val density = LocalDensity.current
            GkGradientButton(
                label = selectedLabel,
                themeId = themeId,
                enabled = enabled,
                horizontalPadding = 12.dp,
                verticalPadding = 6.dp,
                modifier = Modifier
                    .widthIn(min = 144.dp)
                    .onSizeChanged { buttonHeight = it.height },
                trailing = {
                    ChevronDownIcon(
                        modifier = Modifier.rotate(if (menuOpen) 180f else 0f),
                        size = 16.dp,
                        tint = Color.White,
                    )
                },
                onClick = onToggleMenu,
            )
            if (menuOpen) {
                Popup(
                    alignment = Alignment.TopEnd,
                    offset = IntOffset(0, buttonHeight + with(density) { 6.dp.roundToPx() }),
                    onDismissRequest = onDismissMenu,
                    properties = PopupProperties(focusable = true),
                ) {
                    SettingsPopoverCard(dark = dark, borderColor = borderColor) {
                        options.forEach { (code, label) ->
                            SettingsPopoverOption(
                                label = label,
                                selected = code == language,
                                themeId = themeId,
                                dark = dark,
                                titleColor = titleColor,
                                onClick = { onSelect(code) },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** The Passkeys card: header row, explanation, split add/expand button
 *  and the saved-key rows (`SettingsPanel.jsx:479-497` wrapping
 *  `PasskeySettingsSection.jsx`). */
@Composable
private fun PasskeysCard(
    passkeys: List<PasskeyDto>,
    listOpen: Boolean,
    adding: Boolean,
    testingId: String?,
    renamingId: String?,
    removingId: String?,
    untitledLabel: String,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onToggleList: () -> Unit,
    onAdd: () -> Unit,
    onTest: (String) -> Unit,
    onRename: (PasskeyDto) -> Unit,
    onDelete: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
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
        Text(
            stringResource(R.string.native_settings_passkeys_explain),
            color = SettingsSubtleColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )

        // The web's split button: one gradient surface, a 1px white
        // divider, and two independent click zones.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min)
                .alpha(if (adding) 0.5f else 1f)
                .clip(RoundedCornerShape(8.dp))
                .background(WorkspaceTheme.accentGradient(themeId)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = !adding,
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
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (passkeys.isNotEmpty()) {
                Box(Modifier.width(1.dp).fillMaxHeight().background(Color.White.copy(alpha = 0.3f)))
                val toggleLabel = stringResource(R.string.native_settings_passkeys_toggle_list)
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
                        modifier = Modifier.rotate(if (listOpen) 180f else 0f),
                        size = 16.dp,
                        tint = Color.White,
                    )
                }
            }
        }

        if (passkeys.isEmpty()) {
            Text(
                stringResource(R.string.native_settings_passkeys_empty),
                color = SettingsSubtleColor,
                fontSize = 14.sp,
            )
        } else if (listOpen) {
            passkeys.forEach { passkey ->
                PasskeyRow(
                    passkey = passkey,
                    untitledLabel = untitledLabel,
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    testing = testingId == passkey.credentialId,
                    busy = renamingId == passkey.credentialId || removingId == passkey.credentialId,
                    onTest = { onTest(passkey.credentialId) },
                    onRename = { onRename(passkey) },
                    onDelete = { onDelete(passkey.credentialId) },
                )
            }
        }
    }
}

/** One saved passkey: name, badges, last use, then the three small
 *  bordered actions (`PasskeySettingsSection.jsx:387-460`). The
 *  admin-only instance-unlock toggle is not ported. */
@Composable
private fun PasskeyRow(
    passkey: PasskeyDto,
    untitledLabel: String,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    testing: Boolean,
    busy: Boolean,
    onTest: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                passkey.name?.takeIf { it.isNotBlank() } ?: untitledLabel,
                color = titleColor,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.width(8.dp))
            PasskeyBadge(
                label = stringResource(R.string.native_settings_passkeys_badge_login),
                background = WorkspaceTheme.accentSoftBg(themeId, dark),
                foreground = WorkspaceTheme.accent(themeId, dark),
            )
            if (passkey.canUnlockInstance) {
                Spacer(Modifier.width(8.dp))
                PasskeyBadge(
                    label = stringResource(R.string.native_settings_passkeys_badge_unlock),
                    background = if (dark) BadgeAmberBgDark else BadgeAmberBgLight,
                    foreground = if (dark) BadgeAmberFgDark else BadgeAmberFgLight,
                )
            }
            if (passkey.backedUp) {
                Spacer(Modifier.width(8.dp))
                PasskeyBadge(
                    label = stringResource(R.string.native_settings_passkeys_badge_synced),
                    background = if (dark) BadgeGrayBgDark else BadgeGrayBgLight,
                    foreground = if (dark) BadgeGrayFgDark else BadgeGrayFgLight,
                )
            }
        }
        Text(
            passkey.lastUsedAt?.let { stringResource(R.string.native_settings_passkeys_last_used, formatPasskeyDate(it)) }
                ?: stringResource(R.string.native_settings_passkeys_never_used),
            color = SettingsSubtleColor,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 2.dp),
        )
        Row(
            modifier = Modifier.padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PasskeySmallButton(
                label = if (testing) {
                    stringResource(R.string.native_settings_passkeys_testing)
                } else {
                    stringResource(R.string.native_settings_passkeys_test)
                },
                borderColor = borderColor,
                textColor = titleColor,
                enabled = !testing && !busy,
                onClick = onTest,
            )
            PasskeySmallButton(
                label = stringResource(R.string.native_settings_passkeys_rename),
                borderColor = borderColor,
                textColor = titleColor,
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
        }
    }
}

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
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.25.sp,
        )
    }
}

@Composable
private fun PasskeySmallButton(
    label: String,
    borderColor: Color,
    textColor: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, color = textColor, fontSize = 12.sp)
    }
}

/** `new Date(iso).toLocaleString()`, the web's own passkey date. */
private fun formatPasskeyDate(iso: String): String {
    val ms = parseIsoToEpochMillis(iso) ?: return iso
    return DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, Locale.getDefault()).format(Date(ms))
}

// internal, not private: CollaboratorsScreen.kt (same package, different
// file) reuses this for the same avatar-with-initials-fallback rendering.
// Kotlin's top-level `private` is file-scoped.
@Composable
internal fun AvatarCircle(avatarUrl: String?, name: String, size: Dp, onClick: () -> Unit) {
    val dark = LocalGkDark.current
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
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(bitmap = bitmap, contentDescription = null, modifier = Modifier.fillMaxSize())
        } else {
            Text(
                name.trim().take(1).uppercase().ifBlank { "?" },
                color = if (dark) AvatarFallbackFgDark else AvatarFallbackFgLight,
                fontWeight = FontWeight.SemiBold,
                // text-2xl (24px) at the 64px profile size, text-xs
                // (12px) at the 32px collaborator size.
                fontSize = (size.value * 0.375f).sp,
            )
        }
    }
}

private val AvatarFallbackBgLight = Color(0xFFE0E7FF)
private val AvatarFallbackFgLight = Color(0xFF4338CA)
private val AvatarFallbackBgDark = Color(0x406366F1)
private val AvatarFallbackFgDark = Color(0xFFA5B4FC)

/** The theme picker (`WorkspaceThemeSection.jsx:63-100`): two columns of
 *  cards, each a 36px swatch band over a labelled foot. */
@Composable
private fun ThemeGrid(
    currentThemeId: String,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    accent: Color,
    modifier: Modifier = Modifier,
    onSelect: (String) -> Unit,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        WorkspaceTheme.ALL.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { entry ->
                    ThemeCard(
                        entry = entry,
                        selected = entry.id == currentThemeId,
                        enabled = enabled,
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

@Composable
private fun ThemeCard(
    entry: WorkspaceThemeEntry,
    selected: Boolean,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    accent: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .border(
                width = if (selected) 3.dp else 1.dp,
                color = if (selected) accent else borderColor,
                shape = RoundedCornerShape(12.dp),
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.RadioButton,
            ) { onClick() },
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
                .background(if (dark) ThemeCardFootDark else Color.White)
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                entry.label,
                color = titleColor,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (selected) CheckmarkIcon(size = 16.dp, tint = accent)
        }
    }
}

private val ThemeCardFootDark = Color(0xFF1F2937)
