package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.network.ActivateEncryptionRequest
import com.glasskeep.app.nativeapp.data.network.AdminAiSettingsDto
import com.glasskeep.app.nativeapp.data.network.AdminAiSettingsRequest
import com.glasskeep.app.nativeapp.data.network.AdminAiTestRequest
import com.glasskeep.app.nativeapp.data.network.AdminBackgroundPatch
import com.glasskeep.app.nativeapp.data.network.AdminLogoPatch
import com.glasskeep.app.nativeapp.data.network.AdminSettingsDto
import com.glasskeep.app.nativeapp.data.network.AdminSettingsPatch
import com.glasskeep.app.nativeapp.data.network.AdminUserDto
import com.glasskeep.app.nativeapp.data.network.BrandingDto
import com.glasskeep.app.nativeapp.data.network.ChangeEncryptionPassphraseRequest
import com.glasskeep.app.nativeapp.data.network.CreateAdminUserRequest
import com.glasskeep.app.nativeapp.data.network.DeactivateEncryptionRequest
import com.glasskeep.app.nativeapp.data.network.FederationAcceptRequest
import com.glasskeep.app.nativeapp.data.network.FederationActionResponse
import com.glasskeep.app.nativeapp.data.network.FederationAddressRequest
import com.glasskeep.app.nativeapp.data.network.FederationInviteRequest
import com.glasskeep.app.nativeapp.data.network.FederationLinkDto
import com.glasskeep.app.nativeapp.data.network.FederationRenameRequest
import com.glasskeep.app.nativeapp.data.network.FederationSelfNameRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.InstanceStatusResponse
import com.glasskeep.app.nativeapp.data.network.PasskeyDto
import com.glasskeep.app.nativeapp.data.network.PendingUserDto
import com.glasskeep.app.nativeapp.data.network.PromotePasskeyVerifyRequest
import com.glasskeep.app.nativeapp.data.network.SelfUpdateModeDto
import com.glasskeep.app.nativeapp.data.network.SelfUpdateStatusDto
import com.glasskeep.app.nativeapp.data.network.StartSelfUpdateRequest
import com.glasskeep.app.nativeapp.data.network.UpdateAdminUserRequest
import com.glasskeep.app.nativeapp.data.network.UpdateCheckDto
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.Response

private enum class AdminTab(val label: Int) {
    USERS(R.string.native_admin_tab_users),
    BRANDING(R.string.native_admin_tab_branding),
    AI(R.string.native_admin_tab_ai),
    SECURITY(R.string.native_admin_tab_security),
    FEDERATION(R.string.native_admin_tab_federation),
    SERVER(R.string.native_admin_tab_server),
}

/** Complete phone administration surface. Every mutation goes through the
 * same authenticated endpoints as AdminPanel.jsx; none opens web content. */
@Composable
fun AdminScreen(container: NativeAppContainer, serverUrl: String, onBack: () -> Unit) {
    val dark = LocalGkDark.current
    val api = remember(serverUrl) { container.api(serverUrl) }
    var tab by remember { mutableStateOf(AdminTab.USERS) }
    val title = if (dark) DarkTitleColor else LightTitleColor
    val subtext = if (dark) DarkSubtextColor else LightSubtextColor
    val border = if (dark) DarkBorderColor else LightBorderColor
    val background = WorkspaceTheme.appBackground(container.themeState.themeId, dark)

    Column(Modifier.fillMaxSize().background(background).windowInsetsPadding(WindowInsets.systemBars)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.clip(RoundedCornerShape(8.dp)).clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onBack() }.padding(8.dp),
            ) { BackArrowIcon(size = 22.dp, tint = title) }
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.native_admin_title), color = title, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AdminTab.entries.forEach { entry ->
                val selected = tab == entry
                Text(
                    stringResource(entry.label),
                    color = if (selected) Color.White else title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .then(if (selected) Modifier.background(ButtonGradient) else Modifier.border(1.dp, border, RoundedCornerShape(999.dp)))
                        .clickable { tab = entry }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(Modifier.weight(1f)) {
            when (tab) {
                AdminTab.USERS -> AdminUsersSection(api, dark, title, subtext, border)
                AdminTab.BRANDING -> AdminBrandingSection(container, api, dark, title, subtext, border)
                AdminTab.AI -> AdminAiSection(api, dark, title, subtext, border)
                AdminTab.SECURITY -> AdminSecuritySection(container, api, dark, title, subtext, border)
                AdminTab.FEDERATION -> AdminFederationSection(api, serverUrl, dark, title, subtext, border)
                AdminTab.SERVER -> AdminServerSection(api, dark, title, subtext, border)
            }
        }
    }
}

@Composable
private fun AdminUsersSection(api: GlassKeepApi, dark: Boolean, title: Color, subtext: Color, border: Color) {
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<AdminUserDto>>(emptyList()) }
    var pending by remember { mutableStateOf<List<PendingUserDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var newName by remember { mutableStateOf("") }
    var newEmail by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var newAdmin by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<AdminUserDto?>(null) }
    var deleting by remember { mutableStateOf<AdminUserDto?>(null) }

    suspend fun load() {
        loading = true
        try {
            users = api.getAdminUsers().requireBody("users")
            pending = api.getPendingUsers().requireBody("pending users")
            error = null
        } catch (t: Throwable) {
            error = t.message
        } finally { loading = false }
    }
    fun act(block: suspend () -> Unit) {
        if (busy) return
        busy = true
        scope.launch {
            try { block(); load() } catch (t: Throwable) { error = t.message } finally { busy = false }
        }
    }
    LaunchedEffect(Unit) { load() }

    AdminScroll {
        AdminHeading(R.string.native_admin_pending, title)
        if (pending.isEmpty() && !loading) AdminHint(R.string.native_admin_pending_empty, subtext)
        pending.forEach { user ->
            AdminCard(dark, border) {
                Text(user.name, color = title, fontWeight = FontWeight.SemiBold)
                Text(user.email, color = subtext, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallAction(stringResource(R.string.native_admin_reject), danger = true, enabled = !busy) {
                        act { api.rejectPendingUser(user.id).requireBody("reject") }
                    }
                    SmallAction(stringResource(R.string.native_admin_approve), enabled = !busy) {
                        act { api.approvePendingUser(user.id).requireBody("approve") }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        AdminHeading(R.string.native_admin_create_user, title)
        AdminField(newName, { newName = it }, R.string.native_register_name, title, subtext, border)
        AdminField(newEmail, { newEmail = it }, R.string.native_login_username, title, subtext, border)
        AdminField(newPassword, { newPassword = it }, R.string.native_register_password, title, subtext, border, password = true)
        CheckRow(stringResource(R.string.native_admin_is_admin), newAdmin, title) { newAdmin = it }
        AdminPrimary(stringResource(R.string.native_admin_create), !busy && newName.isNotBlank() && newEmail.isNotBlank() && newPassword.length >= 6) {
            act {
                api.createAdminUser(CreateAdminUserRequest(newName.trim(), newEmail.trim(), newPassword, newAdmin)).requireBody("create user")
                newName = ""; newEmail = ""; newPassword = ""; newAdmin = false
            }
        }
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AdminHeading(R.string.native_admin_users, title, Modifier.weight(1f))
            SmallAction(stringResource(R.string.native_admin_refresh), enabled = !loading) { scope.launch { load() } }
        }
        if (loading) AdminLoading()
        users.forEach { user ->
            AdminCard(dark, border) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(user.name, color = title, fontWeight = FontWeight.SemiBold)
                        Text(user.email, color = subtext, fontSize = 13.sp)
                        Text(
                            stringResource(R.string.native_admin_user_stats, user.notes, formatBytes(user.storageBytes)),
                            color = subtext, fontSize = 12.sp,
                        )
                    }
                    if (user.isAdmin) Text("ADMIN", color = Color(0xFF16A34A), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallAction(stringResource(R.string.native_admin_edit), enabled = !busy) { editing = user }
                    SmallAction(stringResource(R.string.native_admin_delete), danger = true, enabled = !busy) { deleting = user }
                }
            }
        }
        error?.let { AdminError(it) }
    }

    editing?.let { user ->
        EditUserDialog(user, dark, title, subtext, border, onDismiss = { editing = null }) { name, email, password, admin ->
            act { api.updateAdminUser(user.id, UpdateAdminUserRequest(name, email, password.ifBlank { null }, admin)).requireBody("update user") }
            editing = null
        }
    }
    deleting?.let { user ->
        ConfirmAdminDialog(
            title = stringResource(R.string.native_admin_delete_user_title),
            message = stringResource(R.string.native_admin_delete_user_body, user.name),
            dark = dark,
            onDismiss = { deleting = null },
        ) {
            act { api.deleteAdminUser(user.id).requireBody("delete user") }
            deleting = null
        }
    }
}

@Composable
private fun EditUserDialog(
    user: AdminUserDto, dark: Boolean, title: Color, subtext: Color, border: Color,
    onDismiss: () -> Unit, onSave: (String, String, String, Boolean) -> Unit,
) {
    var name by remember(user.id) { mutableStateOf(user.name) }
    var email by remember(user.id) { mutableStateOf(user.email) }
    var password by remember(user.id) { mutableStateOf("") }
    var admin by remember(user.id) { mutableStateOf(user.isAdmin) }
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (dark) Color(0xFF282828) else Color.White).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            AdminHeading(R.string.native_admin_edit_user, title)
            AdminField(name, { name = it }, R.string.native_register_name, title, subtext, border)
            AdminField(email, { email = it }, R.string.native_login_username, title, subtext, border)
            AdminField(password, { password = it }, R.string.native_admin_new_password_optional, title, subtext, border, password = true)
            CheckRow(stringResource(R.string.native_admin_is_admin), admin, title) { admin = it }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(onClick = onDismiss) { Text(stringResource(R.string.native_dialog_cancel)) }
                Spacer(Modifier.width(8.dp))
                Button(onClick = { onSave(name.trim(), email.trim(), password, admin) }) { Text(stringResource(R.string.native_admin_save)) }
            }
        }
    }
}

@Composable
private fun AdminBrandingSection(
    container: NativeAppContainer, api: GlassKeepApi, dark: Boolean, title: Color, subtext: Color, border: Color,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<AdminSettingsDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var appName by remember { mutableStateOf("") }
    var slogan by remember { mutableStateOf("") }
    var domain by remember { mutableStateOf("") }
    var blur by remember { mutableStateOf(0f) }

    fun apply(fresh: AdminSettingsDto) {
        settings = fresh; appName = fresh.appName; slogan = fresh.loginSlogan
        domain = fresh.passkeyDomain; blur = fresh.loginBackgroundBlur.toFloat()
        container.branding.apply(fresh.toBrandingDto(publicBackground = fresh.loginBackground))
    }
    suspend fun load() {
        loading = true
        try { apply(api.getAdminSettings().requireBody("admin settings")); error = null }
        catch (t: Throwable) { error = t.message } finally { loading = false }
    }
    fun save(block: suspend () -> AdminSettingsDto) {
        if (busy) return
        busy = true
        scope.launch { try { apply(block()); error = null } catch (t: Throwable) { error = t.message } finally { busy = false } }
    }
    val logoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) save {
            val data = withContext(Dispatchers.Default) { ImageCompression.compressToDataUrl(context, uri, 512, 88) }
                ?: throw IllegalArgumentException("Invalid image")
            api.patchAdminLogo(AdminLogoPatch(data)).requireBody("logo")
        }
    }
    val backgroundPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) save {
            val data = withContext(Dispatchers.Default) { ImageCompression.compressToDataUrl(context, uri, 1920, 85) }
                ?: throw IllegalArgumentException("Invalid image")
            api.patchAdminBackground(AdminBackgroundPatch(data)).requireBody("background")
        }
    }
    LaunchedEffect(Unit) { load() }

    AdminScroll {
        if (loading) AdminLoading()
        settings?.let { current ->
            AdminHeading(R.string.native_admin_registration, title)
            CheckRow(stringResource(R.string.native_admin_allow_accounts), current.allowNewAccounts, title) { enabled ->
                save { api.patchAdminSettings(AdminSettingsPatch(allowNewAccounts = enabled)).requireBody("registration") }
            }
            Spacer(Modifier.height(12.dp))
            AdminHeading(R.string.native_admin_identity, title)
            AdminField(appName, { appName = it.take(10) }, R.string.native_admin_app_name, title, subtext, border)
            AdminField(slogan, { slogan = it.take(200) }, R.string.native_admin_slogan, title, subtext, border)
            AdminField(domain, { domain = it }, R.string.native_admin_passkey_domain, title, subtext, border)
            AdminHintText(
                current.passkeyDomainState.effective.ifBlank { stringResource(R.string.native_admin_passkey_domain_hint) },
                subtext,
            )
            AdminPrimary(stringResource(R.string.native_admin_save), !busy) {
                save {
                    api.patchAdminSettings(
                        AdminSettingsPatch(appName = appName.trim(), loginSlogan = slogan, passkeyDomain = domain.trim().lowercase()),
                    ).requireBody("branding")
                }
            }
            Spacer(Modifier.height(16.dp))
            AdminHeading(R.string.native_admin_login_theme, title)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("glasskeep", "emerald", "amber", "rosewood", "graphite", "blush").forEach { theme ->
                    SmallAction(theme, enabled = !busy, selected = current.loginTheme == theme) {
                        save { api.patchAdminSettings(AdminSettingsPatch(loginTheme = theme)).requireBody("login theme") }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            AdminHeading(R.string.native_admin_logo, title)
            current.logo?.let { rememberDecodedImage(it)?.let { bitmap -> androidx.compose.foundation.Image(bitmap, null, Modifier.size(72.dp)) } }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallAction(stringResource(R.string.native_admin_choose_image), enabled = !busy) { logoPicker.launch("image/*") }
                if (current.logo != null) SmallAction(stringResource(R.string.native_admin_remove), danger = true, enabled = !busy) {
                    save { api.patchAdminLogo(AdminLogoPatch(null)).requireBody("remove logo") }
                }
            }
            Spacer(Modifier.height(16.dp))
            AdminHeading(R.string.native_admin_login_background, title)
            current.loginBackground?.let { rememberDecodedImage(it)?.let { bitmap -> androidx.compose.foundation.Image(bitmap, null, Modifier.fillMaxWidth().height(140.dp)) } }
            Text(stringResource(R.string.native_admin_blur, blur.toInt()), color = title, fontSize = 13.sp)
            Slider(value = blur, onValueChange = { blur = it }, valueRange = 0f..20f, steps = 19, onValueChangeFinished = {
                save { api.patchAdminSettings(AdminSettingsPatch(loginBackgroundBlur = blur.toInt())).requireBody("blur") }
            })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallAction(stringResource(R.string.native_admin_choose_image), enabled = !busy) { backgroundPicker.launch("image/*") }
                if (current.loginBackground != null) SmallAction(stringResource(R.string.native_admin_remove), danger = true, enabled = !busy) {
                    save { api.patchAdminBackground(AdminBackgroundPatch(null)).requireBody("remove background") }
                }
            }
        }
        error?.let { AdminError(it) }
    }
}

@Composable
private fun AdminAiSection(api: GlassKeepApi, dark: Boolean, title: Color, subtext: Color, border: Color) {
    val scope = rememberCoroutineScope()
    var config by remember { mutableStateOf<AdminAiSettingsDto?>(null) }
    var enabled by remember { mutableStateOf(false) }
    var share by remember { mutableStateOf(false) }
    var privateEndpoints by remember { mutableStateOf(false) }
    var baseUrl by remember { mutableStateOf("") }
    var model by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }
    var temperature by remember { mutableStateOf("0.3") }
    var maxTokens by remember { mutableStateOf("800") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    fun apply(fresh: AdminAiSettingsDto) {
        config = fresh; enabled = fresh.enabled; share = fresh.allowServerAiForUsers
        privateEndpoints = fresh.allowPrivateAiForUsers; baseUrl = fresh.baseUrl; model = fresh.model
        temperature = fresh.temperature.toString(); maxTokens = fresh.maxTokens.toString(); apiKey = ""
    }
    fun body() = AdminAiSettingsRequest(
        enabled, baseUrl.trim(), model.trim(), temperature.toDoubleOrNull()?.coerceIn(0.0, 2.0) ?: 0.3,
        maxTokens.toIntOrNull()?.coerceIn(1, 32768) ?: 800, share && enabled, privateEndpoints && enabled,
        apiKey = apiKey.takeIf { it.isNotEmpty() },
    )
    LaunchedEffect(Unit) {
        try { apply(api.getAdminAiSettings().requireBody("AI settings")) } catch (t: Throwable) { message = t.message }
    }
    fun run(block: suspend () -> Unit) {
        if (busy) return; busy = true; message = null
        scope.launch { try { block() } catch (t: Throwable) { message = t.message } finally { busy = false } }
    }

    AdminScroll {
        AdminHeading(R.string.native_admin_ai_server, title)
        CheckRow(stringResource(R.string.native_admin_ai_enabled), enabled, title) { enabled = it; if (!it) { share = false; privateEndpoints = false } }
        CheckRow(stringResource(R.string.native_admin_ai_share), share, title, enabled) { share = it }
        CheckRow(stringResource(R.string.native_admin_ai_private), privateEndpoints, title, enabled) { privateEndpoints = it }
        AdminField(baseUrl, { baseUrl = it }, R.string.native_admin_ai_url, title, subtext, border)
        AdminField(model, { model = it }, R.string.native_admin_ai_model, title, subtext, border)
        AdminField(apiKey, { apiKey = it }, if (config?.hasApiKey == true) R.string.native_admin_ai_key_keep else R.string.native_admin_ai_key, title, subtext, border, password = true)
        if (config?.hasApiKey == true) {
            SmallAction(stringResource(R.string.native_admin_ai_key_clear), danger = true, enabled = !busy) {
                run { apply(api.putAdminAiSettings(body().copy(apiKey = "")).requireBody("clear AI key")); message = "OK" }
            }
        }
        AdminField(temperature, { temperature = it }, R.string.native_admin_ai_temperature, title, subtext, border, numeric = true)
        AdminField(maxTokens, { maxTokens = it }, R.string.native_admin_ai_tokens, title, subtext, border, numeric = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SmallAction(stringResource(R.string.native_admin_ai_test), enabled = !busy) {
                run {
                    val request = body()
                    val result = api.testAdminAi(AdminAiTestRequest(request.baseUrl, request.model, request.temperature, request.maxTokens, request.apiKey)).requireBody("AI test")
                    message = result.reply ?: stringResourceUnavailable
                }
            }
            AdminPrimary(stringResource(R.string.native_admin_save), !busy) {
                run { apply(api.putAdminAiSettings(body()).requireBody("save AI")); message = "OK" }
            }
        }
        message?.let { AdminHintText(it, if (it == "OK") Color(0xFF16A34A) else subtext) }
    }
}

@Composable
private fun AdminSecuritySection(
    container: NativeAppContainer, api: GlassKeepApi, dark: Boolean, title: Color, subtext: Color, border: Color,
) {
    val activity = LocalView.current.context as Activity
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<InstanceStatusResponse?>(null) }
    var passkeys by remember { mutableStateOf<List<PasskeyDto>>(emptyList()) }
    var passphrase by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var currentPassphrase by remember { mutableStateOf("") }
    var newPassphrase by remember { mutableStateOf("") }
    var newConfirmation by remember { mutableStateOf("") }
    var recovery by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDeactivate by remember { mutableStateOf(false) }

    suspend fun load() {
        status = api.instanceStatus().requireBody("encryption status")
        container.lockState.apply(status!!)
        passkeys = runCatching { api.listPasskeys().requireBody("passkeys").passkeys }.getOrDefault(emptyList())
    }
    fun run(block: suspend () -> Unit) {
        if (busy) return; busy = true; error = null
        scope.launch { try { block(); load() } catch (t: Throwable) { error = t.message } finally { busy = false } }
    }
    LaunchedEffect(Unit) { try { load() } catch (t: Throwable) { error = t.message } }

    AdminScroll {
        AdminHeading(R.string.native_admin_encryption, title)
        val state = status
        if (state == null) AdminLoading() else {
            AdminHintText(stringResource(if (!state.enabled) R.string.native_admin_encryption_off else if (state.locked) R.string.native_admin_encryption_locked else R.string.native_admin_encryption_on), subtext)
            if (!state.enabled) {
                AdminField(passphrase, { passphrase = it }, R.string.native_admin_passphrase, title, subtext, border, password = true)
                AdminField(confirmation, { confirmation = it }, R.string.native_register_confirm, title, subtext, border, password = true)
                AdminPrimary(stringResource(R.string.native_admin_activate), !busy && passphrase.length >= 8 && passphrase == confirmation) {
                    run {
                        val result = api.activateEncryption(ActivateEncryptionRequest(passphrase, confirmation)).requireBody("activate encryption")
                        recovery = result.recoveryKey; passphrase = ""; confirmation = ""
                    }
                }
            } else if (!state.locked) {
                AdminHeading(R.string.native_admin_change_passphrase, title)
                AdminField(currentPassphrase, { currentPassphrase = it }, R.string.native_admin_current_passphrase, title, subtext, border, password = true)
                AdminField(newPassphrase, { newPassphrase = it }, R.string.native_admin_new_passphrase, title, subtext, border, password = true)
                AdminField(newConfirmation, { newConfirmation = it }, R.string.native_register_confirm, title, subtext, border, password = true)
                AdminPrimary(stringResource(R.string.native_admin_save), !busy && newPassphrase.length >= 8 && newPassphrase == newConfirmation) {
                    run {
                        api.changeEncryptionPassphrase(ChangeEncryptionPassphraseRequest(currentPassphrase, newPassphrase, newConfirmation)).requireBody("change passphrase")
                        currentPassphrase = ""; newPassphrase = ""; newConfirmation = ""
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallAction(stringResource(R.string.native_admin_recovery_regenerate), enabled = !busy) {
                        run { recovery = api.regenerateRecoveryKey().requireBody("recovery key").recoveryKey }
                    }
                    SmallAction(stringResource(R.string.native_lock_instance), danger = true, enabled = !busy) {
                        run { api.lockInstance().requireBody("lock") }
                    }
                }
                Spacer(Modifier.height(12.dp))
                SmallAction(stringResource(R.string.native_admin_deactivate), danger = true, enabled = !busy) { confirmDeactivate = true }
            }
        }
        recovery?.let {
            AdminCard(dark, border) {
                Text(stringResource(R.string.native_admin_recovery_once), color = Color(0xFFD97706), fontWeight = FontWeight.Bold)
                Text(it, color = title, fontSize = 14.sp)
            }
        }
        if (status?.enabled == true && status?.unlocked == true && passkeys.isNotEmpty()) {
            Spacer(Modifier.height(18.dp))
            AdminHeading(R.string.native_admin_passkey_unlock, title)
            passkeys.forEach { key ->
                AdminCard(dark, border) {
                    Text(key.name ?: stringResource(R.string.native_settings_passkeys_untitled), color = title, fontWeight = FontWeight.SemiBold)
                    AdminHintText(if (key.prfSupported) stringResource(R.string.native_admin_passkey_prf_yes) else stringResource(R.string.native_admin_passkey_prf_no), subtext)
                    if (key.canUnlockInstance) {
                        SmallAction(stringResource(R.string.native_admin_passkey_disable), danger = true, enabled = !busy) {
                            run { api.disablePasskeyUnlock(key.credentialId).requireBody("disable passkey unlock") }
                        }
                    } else {
                        SmallAction(stringResource(R.string.native_admin_passkey_enable), enabled = !busy && key.prfSupported) {
                            run {
                                val options = api.promotePasskeyOptions(key.credentialId).requireBody("passkey options")
                                when (val ceremony = NativePasskeys.authenticate(activity, options.options.toString())) {
                                    is PasskeyCeremonyResult.Failed -> error(ceremony.message)
                                    is PasskeyCeremonyResult.Success -> {
                                        val response = Json.parseToJsonElement(ceremony.responseJson)
                                        val prf = adminPrfOutput(response.jsonObject) ?: error("No PRF output")
                                        api.promotePasskeyVerify(key.credentialId, PromotePasskeyVerifyRequest(response, options.challengeId, prf)).requireBody("enable passkey unlock")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        error?.let { AdminError(it) }
    }
    if (confirmDeactivate) {
        ConfirmAdminDialog(
            title = stringResource(R.string.native_admin_deactivate_title),
            message = stringResource(R.string.native_admin_deactivate_body),
            dark = dark,
            onDismiss = { confirmDeactivate = false },
        ) {
            confirmDeactivate = false
            run { api.deactivateEncryption(DeactivateEncryptionRequest(currentPassphrase)).requireBody("deactivate encryption") }
        }
    }
}

@Composable
private fun AdminFederationSection(api: GlassKeepApi, serverUrl: String, dark: Boolean, title: Color, subtext: Color, border: Color) {
    val scope = rememberCoroutineScope()
    var links by remember { mutableStateOf<List<FederationLinkDto>>(emptyList()) }
    var selfName by remember { mutableStateOf("") }
    var peerUrl by remember { mutableStateOf("") }
    var peerLabel by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val localBaseUrl = remember(serverUrl) { serverUrl.trimEnd('/') }

    suspend fun load() {
        val result = api.getFederationLinks().requireBody("federation")
        links = result.links; selfName = result.selfName
    }
    fun run(block: suspend () -> Unit) {
        if (busy) return; busy = true; error = null
        scope.launch { try { block(); load() } catch (t: Throwable) { error = t.message } finally { busy = false } }
    }
    LaunchedEffect(Unit) { try { load() } catch (t: Throwable) { error = t.message } }

    AdminScroll {
        AdminHeading(R.string.native_admin_federation_identity, title)
        AdminField(selfName, { selfName = it.take(24) }, R.string.native_admin_federation_name, title, subtext, border)
        AdminPrimary(stringResource(R.string.native_admin_save), !busy && selfName.isNotBlank()) {
            run { api.setFederationSelfName(FederationSelfNameRequest(selfName.trim())).requireBody("federation name") }
        }
        Spacer(Modifier.height(18.dp))
        AdminHeading(R.string.native_admin_federation_invite, title)
        AdminField(peerUrl, { peerUrl = it }, R.string.native_admin_federation_url, title, subtext, border)
        AdminField(peerLabel, { peerLabel = it }, R.string.native_admin_federation_label, title, subtext, border)
        AdminPrimary(stringResource(R.string.native_admin_federation_pair), !busy && peerUrl.isNotBlank() && selfName.isNotBlank()) {
            run {
                api.inviteFederation(FederationInviteRequest(peerUrl.trim(), localBaseUrl, peerLabel.trim().ifBlank { null })).requireBody("federation invite")
                peerUrl = ""; peerLabel = ""
            }
        }
        Spacer(Modifier.height(20.dp))
        AdminHeading(R.string.native_admin_federation_links, title)
        if (links.isEmpty()) AdminHint(R.string.native_admin_federation_empty, subtext)
        links.forEach { link ->
            FederationLinkCard(link, dark, title, subtext, border, !busy,
                onAccept = { run { api.acceptFederation(link.id, FederationAcceptRequest(localBaseUrl, link.peerLabel)).requireBody("accept federation") } },
                onRefuse = { run { api.refuseFederation(link.id).requireBody("refuse federation") } },
                onResend = { run { api.resendFederation(link.id, FederationAcceptRequest(localBaseUrl, link.peerLabel)).requireBody("resend federation") } },
                onRecheck = { run { api.recheckFederation(link.id).requireBody("recheck federation") } },
                onRename = { label -> run { api.renameFederation(link.id, FederationRenameRequest(label)).requireBody("rename federation") } },
                onAddress = { address -> run { api.updateFederationAddress(link.id, FederationAddressRequest(address)).requireBody("update address") } },
                onUnpair = { run { api.unpairFederation(link.id).requireBody("unpair federation") } },
            )
        }
        error?.let { AdminError(it) }
    }
}

@Composable
private fun FederationLinkCard(
    link: FederationLinkDto, dark: Boolean, title: Color, subtext: Color, border: Color, enabled: Boolean,
    onAccept: () -> Unit, onRefuse: () -> Unit, onResend: () -> Unit, onRecheck: () -> Unit,
    onRename: (String) -> Unit, onAddress: (String) -> Unit, onUnpair: () -> Unit,
) {
    var label by remember(link.id, link.peerLabel) { mutableStateOf(link.peerLabel.orEmpty()) }
    var address by remember(link.id, link.peerBaseUrl) { mutableStateOf(link.peerBaseUrl) }
    AdminCard(dark, border) {
        Text(link.peerLabel ?: link.peerBaseUrl, color = title, fontWeight = FontWeight.SemiBold)
        Text("${link.status} · ${link.state}", color = if (link.state == "online") Color(0xFF16A34A) else subtext, fontSize = 12.sp)
        link.lastError?.let { Text(it, color = Color(0xFFDC2626), fontSize = 12.sp) }
        if (link.status == "incoming_pending") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallAction(stringResource(R.string.native_admin_reject), danger = true, enabled = enabled, onClick = onRefuse)
                SmallAction(stringResource(R.string.native_admin_approve), enabled = enabled, onClick = onAccept)
            }
        } else if (link.status == "outgoing_pending") {
            SmallAction(stringResource(R.string.native_admin_cancel), danger = true, enabled = enabled, onClick = onRefuse)
        } else {
            AdminField(label, { label = it.take(24) }, R.string.native_admin_federation_label, title, subtext, border)
            AdminField(address, { address = it }, R.string.native_admin_federation_url, title, subtext, border)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallAction(stringResource(R.string.native_admin_save_name), enabled = enabled) { onRename(label.trim()) }
                SmallAction(stringResource(R.string.native_admin_save_address), enabled = enabled) { onAddress(address.trim()) }
                SmallAction(stringResource(R.string.native_admin_recheck), enabled = enabled, onClick = onRecheck)
                if (link.status in setOf("refused", "cancelled", "revoked")) SmallAction(stringResource(R.string.native_admin_resend), enabled = enabled, onClick = onResend)
                SmallAction(stringResource(R.string.native_admin_unpair), danger = true, enabled = enabled, onClick = onUnpair)
            }
        }
    }
}

@Composable
private fun AdminServerSection(api: GlassKeepApi, dark: Boolean, title: Color, subtext: Color, border: Color) {
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf<UpdateCheckDto?>(null) }
    var mode by remember { mutableStateOf<SelfUpdateModeDto?>(null) }
    var status by remember { mutableStateOf<SelfUpdateStatusDto?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmation by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        update = api.checkServerUpdate().requireBody("update check")
        mode = api.selfUpdateMode().requireBody("update mode")
        val statusResponse = api.selfUpdateStatus()
        status = if (statusResponse.code() == 204) null else statusResponse.requireBody("update status")
    }
    fun run(block: suspend () -> Unit) {
        if (busy) return; busy = true; error = null
        scope.launch { try { block(); load() } catch (t: Throwable) { error = t.message } finally { busy = false } }
    }
    LaunchedEffect(Unit) { try { load() } catch (t: Throwable) { error = t.message } }
    LaunchedEffect(status?.inProgress) {
        while (status?.inProgress == true) {
            delay(1_500)
            runCatching { api.selfUpdateStatus() }.getOrNull()?.let { response ->
                if (response.isSuccessful) status = response.body()
            }
        }
    }

    AdminScroll {
        AdminHeading(R.string.native_admin_server_update, title)
        update?.let { info ->
            AdminCard(dark, border) {
                Text(stringResource(R.string.native_admin_version_current, info.currentVersion ?: "?"), color = title)
                Text(stringResource(R.string.native_admin_version_latest, info.latestVersion ?: "?"), color = subtext)
                Text(stringResource(if (info.updateAvailable) R.string.native_admin_update_available else R.string.native_admin_up_to_date), color = if (info.updateAvailable) Color(0xFFD97706) else Color(0xFF16A34A))
                if (info.updateAvailable && mode?.oneClickAvailable == true && info.latestVersion != null) {
                    AdminPrimary(stringResource(R.string.native_admin_update_now), !busy && status?.inProgress != true) { confirmation = "update" }
                }
                if (mode?.oneClickAvailable != true) AdminHintText(mode?.reason ?: stringResource(R.string.native_admin_update_manual), subtext)
            }
        }
        status?.let { progress ->
            AdminCard(dark, border) {
                Text(progress.state ?: "idle", color = title, fontWeight = FontWeight.SemiBold)
                Text(progress.message ?: progress.step.orEmpty(), color = subtext, fontSize = 13.sp)
                if (progress.inProgress) SmallAction(stringResource(R.string.native_admin_cancel_update), danger = true, enabled = !busy) {
                    run { api.cancelSelfUpdate().requireBody("cancel update") }
                }
            }
        }
        Spacer(Modifier.height(18.dp))
        AdminHeading(R.string.native_admin_server_power, title)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SmallAction(stringResource(R.string.native_admin_restart), danger = true, enabled = !busy) { confirmation = "restart" }
            SmallAction(stringResource(R.string.native_admin_shutdown), danger = true, enabled = !busy) { confirmation = "shutdown" }
            SmallAction(stringResource(R.string.native_admin_refresh), enabled = !busy) { run { } }
        }
        error?.let { AdminError(it) }
    }
    confirmation?.let { action ->
        val isUpdate = action == "update"
        ConfirmAdminDialog(
            title = stringResource(if (isUpdate) R.string.native_admin_update_confirm_title else if (action == "restart") R.string.native_admin_restart else R.string.native_admin_shutdown),
            message = stringResource(if (isUpdate) R.string.native_admin_update_confirm_body else R.string.native_admin_power_confirm),
            dark = dark,
            onDismiss = { confirmation = null },
        ) {
            confirmation = null
            run {
                when (action) {
                    "update" -> api.startSelfUpdate(StartSelfUpdateRequest(update?.latestVersion ?: error("No version"))).requireBody("start update")
                    "restart" -> api.restartServer().requireBody("restart")
                    else -> api.shutdownServer().requireBody("shutdown")
                }
            }
        }
    }
}

@Composable
private fun AdminScroll(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) { content() }
}

@Composable
private fun AdminHeading(res: Int, color: Color, modifier: Modifier = Modifier) {
    Text(stringResource(res), color = color, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = modifier)
}

@Composable
private fun AdminHint(res: Int, color: Color) = Text(stringResource(res), color = color, fontSize = 13.sp)

@Composable
private fun AdminHintText(value: String, color: Color) = Text(value, color = color, fontSize = 13.sp)

@Composable
private fun AdminCard(dark: Boolean, border: Color, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(if (dark) Color(0xFF242424) else Color.White)
            .border(1.dp, border, RoundedCornerShape(12.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
}

@Composable
private fun AdminField(
    value: String, onValue: (String) -> Unit, label: Int, title: Color, subtext: Color, border: Color,
    password: Boolean = false, numeric: Boolean = false,
) {
    OutlinedTextField(
        value = value, onValueChange = onValue,
        label = { Text(stringResource(label)) }, singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (numeric) KeyboardType.Decimal else if (password) KeyboardType.Password else KeyboardType.Text),
        colors = detailFieldColors(title, subtext, border), modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun CheckRow(label: String, checked: Boolean, color: Color, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = color, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Checkbox(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

@Composable
private fun AdminPrimary(label: String, enabled: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))) { Text(label) }
}

@Composable
private fun SmallAction(label: String, danger: Boolean = false, enabled: Boolean = true, selected: Boolean = false, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick, enabled = enabled,
        colors = ButtonDefaults.outlinedButtonColors(contentColor = if (danger) Color(0xFFDC2626) else if (selected) Color(0xFF6366F1) else Color.Unspecified),
    ) { Text(label, fontSize = 12.sp, maxLines = 1) }
}

@Composable
private fun AdminLoading() = Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) {
    CircularProgressIndicator(Modifier.size(28.dp))
}

@Composable
private fun AdminError(value: String) = Text(value, color = Color(0xFFDC2626), fontSize = 13.sp)

@Composable
private fun ConfirmAdminDialog(title: String, message: String, dark: Boolean, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (dark) Color(0xFF282828) else Color.White).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(title, color = if (dark) DarkTitleColor else LightTitleColor, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(message, color = if (dark) DarkSubtextColor else LightSubtextColor, fontSize = 14.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(onClick = onDismiss) { Text(stringResource(R.string.native_dialog_cancel)) }
                Spacer(Modifier.width(8.dp))
                Button(onClick = onConfirm, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))) { Text(stringResource(R.string.native_admin_confirm)) }
            }
        }
    }
}

private fun AdminSettingsDto.toBrandingDto(publicBackground: String?) = BrandingDto(
    appName = appName, logo = logo, loginBackground = publicBackground,
    loginBackgroundColor = loginBackgroundColor, loginBackgroundHash = loginBackgroundHash,
    loginBackgroundBlur = loginBackgroundBlur, loginTheme = loginTheme,
)

private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = listOf("B", "KB", "MB", "GB", "TB")
    var value = bytes.toDouble(); var index = 0
    while (value >= 1024 && index < units.lastIndex) { value /= 1024; index++ }
    return if (value >= 100) "%.0f %s".format(value, units[index]) else "%.1f %s".format(value, units[index])
}

private fun adminPrfOutput(assertion: JsonObject): String? =
    ((assertion["clientExtensionResults"] as? JsonObject)?.get("prf") as? JsonObject)
        ?.get("results")?.jsonObject?.get("first")?.jsonPrimitive?.content

private suspend fun <T> Response<T>.requireBody(action: String): T {
    val body = body()
    if (isSuccessful && body != null) return body
    val detail = runCatching { errorBody()?.string() }.getOrNull().orEmpty()
    throw IllegalStateException("$action: HTTP ${code()}${if (detail.isBlank()) "" else " · $detail"}")
}

private const val stringResourceUnavailable = "Connection succeeded"
