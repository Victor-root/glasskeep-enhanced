package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.ChangePasswordResult
import com.glasskeep.app.nativeapp.data.network.PasskeyDto
import com.glasskeep.app.nativeapp.data.network.ProfileDto
import com.glasskeep.app.nativeapp.isUserCancellation
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkCardBg
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightCardBg
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

private val ErrorColor = Color(0xFFdc2626)

/**
 * Milestone: a real Settings screen, reachable from the notes list's
 * hamburger menu. Scope is deliberately narrower than SettingsPanel.jsx's
 * full 9 sections (see each milestone's own commit message for the
 * itemized cut list: admin-only sections, push notifications (Web Push
 * doesn't exist in a Kotlin app), data import/export, typography, AI
 * assistant): profile (avatar, read-only name/email, language,
 * show-on-login), security (change password, cross-device QR sign-in,
 * see QrScanScreen.kt, and generating a new secret recovery key, see
 * SecretKeyLoginScreen.kt for where it's used to sign in), passkeys
 * (list/add/delete, see NativePasskeys.kt), appearance (the six
 * workspace themes), and the one already-half-wired Notes preference
 * (checklist insert position).
 */
@Composable
fun SettingsScreen(container: NativeAppContainer, serverUrl: String, onBack: () -> Unit, onOpenQrScanner: () -> Unit) {
    val dark = isSystemInDarkTheme()
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val activity = LocalView.current.context as Activity
    val clipboardManager = LocalClipboardManager.current

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

    var showPasswordDialog by remember { mutableStateOf(false) }
    var changingPassword by remember { mutableStateOf(false) }
    var currentPasswordInput by remember { mutableStateOf("") }
    var newPasswordInput by remember { mutableStateOf("") }
    var confirmPasswordInput by remember { mutableStateOf("") }
    var passwordDialogError by remember { mutableStateOf<String?>(null) }

    var showAddPasskeyDialog by remember { mutableStateOf(false) }
    var addPasskeyNameInput by remember { mutableStateOf("") }
    var pendingDeletePasskeyId by remember { mutableStateOf<String?>(null) }

    var generatingSecretKey by remember { mutableStateOf(false) }
    var generatedSecretKey by remember { mutableStateOf<String?>(null) }

    val errorLoadTemplate = stringResource(R.string.native_settings_error)
    val actionErrorTemplate = stringResource(R.string.native_settings_action_error)
    val passwordMismatchMessage = stringResource(R.string.native_settings_password_mismatch)
    val passwordTooShortMessage = stringResource(R.string.native_settings_password_too_short)
    val passwordErrorTemplate = stringResource(R.string.native_settings_password_error)
    val passwordSuccessMessage = stringResource(R.string.native_settings_password_success)
    val passkeyUntitledLabel = stringResource(R.string.native_settings_passkeys_untitled)
    val copiedMessage = stringResource(R.string.native_settings_secret_key_copied)

    val bgModifier = if (dark) Modifier.background(DarkBgColor) else Modifier.background(LightBgGradient)
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val cardBg = if (dark) DarkCardBg else LightCardBg

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

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(WorkspaceTheme.headerGradient(themeId, dark))
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onBack() }
                            .padding(6.dp),
                    ) {
                        BackArrowIcon(size = 22.dp, tint = titleColor)
                        Text(
                            stringResource(R.string.native_note_detail_back),
                            color = subtextColor,
                            fontSize = 14.sp,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.native_settings_title),
                        color = titleColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                    )
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(WorkspaceTheme.headerBorderColor(themeId, dark)))
            }

            when {
                loadError != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(loadError.orEmpty(), color = ErrorColor, modifier = Modifier.padding(24.dp))
                }
                profile == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = Indigo)
                        Spacer(Modifier.height(12.dp))
                        Text(stringResource(R.string.native_settings_loading), color = subtextColor)
                    }
                }
                else -> {
                    val current = profile!!
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        SettingsSection(stringResource(R.string.native_settings_profile_section), subtextColor, cardBg, borderColor) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                AvatarCircle(
                                    avatarUrl = current.avatarUrl,
                                    name = current.name.ifBlank { current.email },
                                    size = 64.dp,
                                    onClick = { avatarPickerLauncher.launch(ActivityResultContracts.PickVisualMedia.ImageOnly) },
                                )
                                Spacer(Modifier.width(14.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(current.name.ifBlank { current.email }, color = titleColor, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    Text(current.email, color = subtextColor, fontSize = 13.sp)
                                    Spacer(Modifier.height(6.dp))
                                    Row {
                                        Text(
                                            stringResource(R.string.native_settings_change_avatar),
                                            color = Indigo,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier
                                                .clickable(
                                                    interactionSource = remember { MutableInteractionSource() },
                                                    indication = null,
                                                    enabled = !changingAvatar,
                                                    role = Role.Button,
                                                ) { avatarPickerLauncher.launch(ActivityResultContracts.PickVisualMedia.ImageOnly) },
                                        )
                                        if (current.avatarUrl != null) {
                                            Spacer(Modifier.width(14.dp))
                                            Text(
                                                stringResource(R.string.native_settings_remove_avatar),
                                                color = subtextColor,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier
                                                    .clickable(
                                                        interactionSource = remember { MutableInteractionSource() },
                                                        indication = null,
                                                        enabled = !changingAvatar,
                                                        role = Role.Button,
                                                    ) { removeAvatar() },
                                            )
                                        }
                                    }
                                }
                            }

                            SettingsDivider(borderColor)
                            SettingsToggleRow(
                                label = stringResource(R.string.native_settings_show_on_login),
                                checked = current.showOnLogin,
                                enabled = !changingShowOnLogin,
                                titleColor = titleColor,
                                onCheckedChange = { toggleShowOnLogin(it) },
                            )

                            SettingsDivider(borderColor)
                            Text(stringResource(R.string.native_settings_language), color = titleColor, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                LanguageChip(stringResource(R.string.native_settings_language_system), current.language == null, !changingLanguage, dark) { changeLanguage(null) }
                                LanguageChip(stringResource(R.string.native_settings_language_english), current.language == "en", !changingLanguage, dark) { changeLanguage("en") }
                                LanguageChip(stringResource(R.string.native_settings_language_french), current.language == "fr", !changingLanguage, dark) { changeLanguage("fr") }
                            }
                        }

                        SettingsSection(stringResource(R.string.native_settings_security_section), subtextColor, cardBg, borderColor) {
                            Text(
                                stringResource(R.string.native_settings_change_password),
                                color = Indigo,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                                modifier = Modifier
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null,
                                        role = Role.Button,
                                    ) { passwordDialogError = null; showPasswordDialog = true },
                            )
                            Spacer(Modifier.height(10.dp))
                            Text(
                                stringResource(R.string.native_settings_qr_signin),
                                color = Indigo,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                                modifier = Modifier
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null,
                                        role = Role.Button,
                                    ) { onOpenQrScanner() },
                            )
                            Spacer(Modifier.height(10.dp))
                            Text(
                                stringResource(R.string.native_settings_secret_key_generate),
                                color = Indigo,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                                modifier = Modifier
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null,
                                        enabled = !generatingSecretKey,
                                        role = Role.Button,
                                    ) { generateSecretKey() },
                            )
                        }

                        SettingsSection(stringResource(R.string.native_settings_passkeys_section), subtextColor, cardBg, borderColor) {
                            if (passkeys.isEmpty()) {
                                Text(stringResource(R.string.native_settings_passkeys_empty), color = subtextColor, fontSize = 13.sp)
                                Spacer(Modifier.height(10.dp))
                            } else {
                                passkeys.forEachIndexed { index, passkey ->
                                    if (index > 0) SettingsDivider(borderColor)
                                    PasskeyRow(
                                        passkey = passkey,
                                        untitledLabel = passkeyUntitledLabel,
                                        titleColor = titleColor,
                                        subtextColor = subtextColor,
                                        removing = removingPasskeyId == passkey.credentialId,
                                        onDelete = { pendingDeletePasskeyId = passkey.credentialId },
                                    )
                                }
                                Spacer(Modifier.height(10.dp))
                            }
                            Text(
                                stringResource(R.string.native_settings_passkeys_add),
                                color = Indigo,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                                modifier = Modifier
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null,
                                        enabled = !addingPasskey,
                                        role = Role.Button,
                                    ) { addPasskeyNameInput = ""; showAddPasskeyDialog = true },
                            )
                        }

                        SettingsSection(stringResource(R.string.native_settings_appearance_section), subtextColor, cardBg, borderColor) {
                            Text(stringResource(R.string.native_settings_theme_title), color = titleColor, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Spacer(Modifier.height(10.dp))
                            ThemeGrid(currentThemeId = themeId, enabled = !changingTheme, subtextColor = subtextColor, onSelect = { changeTheme(it) })
                        }

                        SettingsSection(stringResource(R.string.native_settings_notes_section), subtextColor, cardBg, borderColor) {
                            Text(stringResource(R.string.native_settings_checklist_insert_position), color = titleColor, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                LanguageChip(stringResource(R.string.native_settings_checklist_insert_top), checklistInsertPosition == "top", !changingChecklistPosition, dark) {
                                    changeChecklistInsertPosition("top")
                                }
                                LanguageChip(stringResource(R.string.native_settings_checklist_insert_bottom), checklistInsertPosition == "bottom", !changingChecklistPosition, dark) {
                                    changeChecklistInsertPosition("bottom")
                                }
                            }
                        }
                    }
                }
            }
        }

        if (showPasswordDialog) {
            AlertDialog(
                onDismissRequest = { if (!changingPassword) showPasswordDialog = false },
                title = { Text(stringResource(R.string.native_settings_change_password)) },
                text = {
                    Column {
                        OutlinedTextField(
                            value = currentPasswordInput,
                            onValueChange = { currentPasswordInput = it; passwordDialogError = null },
                            label = { Text(stringResource(R.string.native_settings_password_current)) },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                            colors = detailFieldColors(titleColor, subtextColor, borderColor),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = newPasswordInput,
                            onValueChange = { newPasswordInput = it; passwordDialogError = null },
                            label = { Text(stringResource(R.string.native_settings_password_new)) },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                            colors = detailFieldColors(titleColor, subtextColor, borderColor),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = confirmPasswordInput,
                            onValueChange = { confirmPasswordInput = it; passwordDialogError = null },
                            label = { Text(stringResource(R.string.native_settings_password_confirm)) },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                            colors = detailFieldColors(titleColor, subtextColor, borderColor),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        passwordDialogError?.let {
                            Spacer(Modifier.height(8.dp))
                            Text(it, color = ErrorColor, fontSize = 12.sp)
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { submitPasswordChange() }, enabled = !changingPassword) {
                        Text(stringResource(R.string.native_settings_change_password))
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showPasswordDialog = false }, enabled = !changingPassword) {
                        Text(stringResource(R.string.native_dialog_cancel))
                    }
                },
            )
        }

        if (showAddPasskeyDialog) {
            AlertDialog(
                onDismissRequest = { if (!addingPasskey) showAddPasskeyDialog = false },
                title = { Text(stringResource(R.string.native_settings_passkeys_add)) },
                text = {
                    OutlinedTextField(
                        value = addPasskeyNameInput,
                        onValueChange = { addPasskeyNameInput = it },
                        placeholder = { Text(stringResource(R.string.native_settings_passkeys_add_name_placeholder)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        colors = detailFieldColors(titleColor, subtextColor, borderColor),
                        modifier = Modifier.fillMaxWidth(),
                    )
                },
                confirmButton = {
                    TextButton(onClick = { addPasskey(addPasskeyNameInput.trim()) }, enabled = !addingPasskey) {
                        Text(stringResource(R.string.native_settings_passkeys_add))
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showAddPasskeyDialog = false }, enabled = !addingPasskey) {
                        Text(stringResource(R.string.native_dialog_cancel))
                    }
                },
            )
        }

        val deletePasskeyTargetId = pendingDeletePasskeyId
        if (deletePasskeyTargetId != null) {
            AlertDialog(
                onDismissRequest = { pendingDeletePasskeyId = null },
                title = { Text(stringResource(R.string.native_settings_passkeys_delete_confirm_title)) },
                text = { Text(stringResource(R.string.native_settings_passkeys_delete_confirm_body)) },
                confirmButton = {
                    TextButton(
                        onClick = {
                            pendingDeletePasskeyId = null
                            deletePasskey(deletePasskeyTargetId)
                        },
                    ) {
                        Text(stringResource(R.string.native_settings_passkeys_delete), color = Color(0xFFdc2626))
                    }
                },
                dismissButton = {
                    TextButton(onClick = { pendingDeletePasskeyId = null }) {
                        Text(stringResource(R.string.native_dialog_cancel))
                    }
                },
            )
        }

        generatedSecretKey?.let { key ->
            AlertDialog(
                onDismissRequest = { generatedSecretKey = null },
                title = { Text(stringResource(R.string.native_settings_secret_key_dialog_title)) },
                text = {
                    Column {
                        Text(
                            key,
                            color = titleColor,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 14.sp,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (dark) DarkBgColor else LightBgGradient)
                                .padding(12.dp),
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(stringResource(R.string.native_settings_secret_key_warning), color = subtextColor, fontSize = 12.sp)
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        clipboardManager.setText(AnnotatedString(key))
                        Toast.makeText(context, copiedMessage, Toast.LENGTH_SHORT).show()
                    }) {
                        Text(stringResource(R.string.native_settings_secret_key_copy))
                    }
                },
                dismissButton = {
                    TextButton(onClick = { generatedSecretKey = null }) {
                        Text(stringResource(R.string.native_dialog_cancel))
                    }
                },
            )
        }
    }
}

@Composable
private fun SettingsSection(
    title: String,
    subtextColor: Color,
    cardBg: Color,
    borderColor: Color,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column {
        Text(title.uppercase(), color = subtextColor, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(cardBg)
                .padding(16.dp),
            content = content,
        )
    }
}

@Composable
private fun SettingsDivider(borderColor: Color) {
    Spacer(Modifier.height(14.dp))
    Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
    Spacer(Modifier.height(14.dp))
}

/** One row in the Passkeys section: name (or a generic fallback, the
 *  server itself allows an unnamed passkey) and a delete action. No
 *  rename here (disclosed cut, see this milestone's commit message):
 *  the server route exists (PATCH /api/passkeys/:id) but the row would
 *  need its own small text-edit dialog for one secondary action. */
@Composable
private fun PasskeyRow(
    passkey: PasskeyDto,
    untitledLabel: String,
    titleColor: Color,
    subtextColor: Color,
    removing: Boolean,
    onDelete: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        KeyIcon(size = 18.dp, tint = subtextColor)
        Spacer(Modifier.width(10.dp))
        Text(
            passkey.name?.takeIf { it.isNotBlank() } ?: untitledLabel,
            color = titleColor,
            fontSize = 14.sp,
            modifier = Modifier.weight(1f),
        )
        if (removing) {
            CircularProgressIndicator(color = Indigo, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
        } else {
            Text(
                stringResource(R.string.native_settings_passkeys_delete),
                color = Color(0xFFdc2626),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onDelete() },
            )
        }
    }
}

@Composable
private fun SettingsToggleRow(
    label: String,
    checked: Boolean,
    enabled: Boolean,
    titleColor: Color,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(label, color = titleColor, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = Indigo),
        )
    }
}

@Composable
private fun LanguageChip(label: String, selected: Boolean, enabled: Boolean, dark: Boolean, onClick: () -> Unit) {
    val bg = if (selected) Indigo else if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f)
    val fg = if (selected) Color.White else if (dark) Color.White.copy(alpha = 0.85f) else Color.Black.copy(alpha = 0.75f)
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(label, color = fg, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

// internal, not private: CollaboratorsScreen.kt (same package, different
// file) reuses this for the same avatar-with-initials-fallback rendering.
// Kotlin's top-level `private` is file-scoped.
@Composable
internal fun AvatarCircle(avatarUrl: String?, name: String, size: Dp, onClick: () -> Unit) {
    val bitmap = avatarUrl?.let { rememberDecodedImage(it) }
    val label = stringResource(R.string.native_settings_avatar_description)
    val backgroundModifier = if (bitmap == null) Modifier.background(ButtonGradient) else Modifier
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .then(backgroundModifier)
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
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = (size.value / 2.4f).sp,
            )
        }
    }
}

@Composable
private fun ThemeGrid(currentThemeId: String, enabled: Boolean, subtextColor: Color, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        WorkspaceTheme.ALL.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { entry ->
                    ThemeSwatch(
                        entry = entry,
                        selected = entry.id == currentThemeId,
                        enabled = enabled,
                        subtextColor = subtextColor,
                        onClick = { onSelect(entry.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ThemeSwatch(entry: WorkspaceThemeEntry, selected: Boolean, enabled: Boolean, subtextColor: Color, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(entry.swatchPrimary, entry.swatchSecondary))),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) {
                Box(modifier = Modifier.size(22.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.92f)), contentAlignment = Alignment.Center) {
                    CheckmarkIcon(size = 14.dp, tint = entry.swatchPrimary)
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(entry.label, fontSize = 11.sp, color = if (selected) Indigo else subtextColor, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
    }
}
