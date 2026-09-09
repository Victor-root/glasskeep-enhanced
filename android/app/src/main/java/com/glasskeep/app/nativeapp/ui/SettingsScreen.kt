package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
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
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.ChangePasswordResult
import com.glasskeep.app.nativeapp.data.network.PasskeyDto
import com.glasskeep.app.nativeapp.data.network.ProfileDto
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.nativeapp.isUserCancellation
import com.glasskeep.app.update.ReleaseInfo
import com.glasskeep.app.update.UpdateManager
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.text.DateFormat
import java.util.Date
import java.util.Locale

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
    val dark = isSystemInDarkTheme()
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val activity = LocalView.current.context as Activity
    val clipboard = LocalClipboard.current

    var profile by remember { mutableStateOf<ProfileDto?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var checklistInsertPosition by remember { mutableStateOf("top") }
    var passkeys by remember { mutableStateOf<List<PasskeyDto>>(emptyList()) }

    var changingAvatar by remember { mutableStateOf(false) }
    var changingShowOnLogin by remember { mutableStateOf(false) }
    var changingLanguage by remember { mutableStateOf(false) }
    var changingTheme by remember { mutableStateOf(false) }
    var changingChecklistPosition by remember { mutableStateOf(false) }
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

    var showChangeServerDialog by remember { mutableStateOf(false) }
    var availableUpdate by remember { mutableStateOf<ReleaseInfo?>(UpdateManager.getStoredRelease(context)) }
    val installedFromFdroid = remember { UpdateManager.isFdroidInstall(context) }

    // Sections are collapsed on first open, exactly like the web's empty
    // `settingsOpenSections` map. Saved across configuration changes
    // only: the web syncs them to the server, which has no equivalent
    // route reachable from here.
    var securityOpen by rememberSaveable { mutableStateOf(false) }
    var uiOpen by rememberSaveable { mutableStateOf(false) }
    var notesOpen by rememberSaveable { mutableStateOf(false) }
    var dataOpen by rememberSaveable { mutableStateOf(false) }
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
            checklistInsertPosition = repository.fetchChecklistInsertPosition()
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

    fun reportActionError(t: Throwable) {
        Toast.makeText(context, String.format(actionErrorTemplate, t.message ?: t.javaClass.simpleName), Toast.LENGTH_SHORT).show()
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
                        Toast.makeText(context, passkeyTestOkMessage, Toast.LENGTH_SHORT).show()
                    }
                    is PasskeyCeremonyResult.Failed -> {
                        if (!ceremony.isUserCancellation()) {
                            Toast.makeText(context, passkeyTestFailedMessage, Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen testPasskey failed", t)
                Toast.makeText(context, passkeyTestFailedMessage, Toast.LENGTH_SHORT).show()
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
        if (changingChecklistPosition || position == checklistInsertPosition) return
        changingChecklistPosition = true
        val previous = checklistInsertPosition
        checklistInsertPosition = position
        scope.launch {
            try {
                repository.setChecklistInsertPosition(position)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsScreen setChecklistInsertPosition failed", t)
                checklistInsertPosition = previous
                reportActionError(t)
            } finally {
                changingChecklistPosition = false
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
                        Toast.makeText(context, passwordSuccessMessage, Toast.LENGTH_SHORT).show()
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
        Toast.makeText(context, updateCheckingMessage, Toast.LENGTH_SHORT).show()
        UpdateManager.forceCheck(context) { release ->
            availableUpdate = release
            if (release == null) {
                Toast.makeText(context, updateUpToDateMessage, Toast.LENGTH_LONG).show()
            }
        }
    }

    fun downloadUpdate(release: ReleaseInfo) {
        Toast.makeText(context, updateDownloadingMessage, Toast.LENGTH_SHORT).show()
        UpdateManager.downloadAndInstall(context, release) { ok ->
            if (!ok) Toast.makeText(context, updateDownloadFailedMessage, Toast.LENGTH_LONG).show()
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
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                            SettingsRowIcon(themeId, dark) { tint -> EyeIcon(size = 20.dp, tint = tint) }
                                            Spacer(Modifier.width(12.dp))
                                            Text(
                                                stringResource(R.string.native_settings_show_on_login),
                                                color = titleColor,
                                                fontSize = 16.sp,
                                                fontWeight = FontWeight.Medium,
                                            )
                                        }
                                        Spacer(Modifier.width(12.dp))
                                        GkSwitch(
                                            checked = current.showOnLogin,
                                            enabled = !changingShowOnLogin,
                                            themeId = themeId,
                                            dark = dark,
                                            onCheckedChange = { toggleShowOnLogin(it) },
                                        )
                                    }

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
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
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
                                    title = stringResource(R.string.native_settings_notes_section),
                                    expanded = notesOpen,
                                    themeId = themeId,
                                    dark = dark,
                                    titleColor = titleColor,
                                    icon = { tint -> NoteTablerIcon(size = 20.dp, tint = tint) },
                                    onToggle = { notesOpen = !notesOpen },
                                    contentSpacing = 16.dp,
                                ) {
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
                                                selectedId = checklistInsertPosition,
                                                enabled = !changingChecklistPosition,
                                                themeId = themeId,
                                                dark = dark,
                                                onSelect = { changeChecklistInsertPosition(it) },
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
                                        title = stringResource(R.string.native_settings_secret_key_generate),
                                        subtitle = stringResource(R.string.native_settings_secret_key_desc),
                                        themeId = themeId,
                                        dark = dark,
                                        titleColor = titleColor,
                                        borderColor = borderColor,
                                        enabled = !generatingSecretKey,
                                        icon = { tint -> TablerKeyIcon(size = 20.dp, tint = tint) },
                                        onClick = { generateSecretKey() },
                                    )
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
                                Toast.makeText(context, copiedMessage, Toast.LENGTH_SHORT).show()
                            }
                        },
                    )
                }
            }
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

/** The language row and its popover (`SettingsPanel.jsx:1506-1569`). */
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
    val dark = isSystemInDarkTheme()
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
