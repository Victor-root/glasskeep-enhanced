package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.network.LoginByIdRequest
import com.glasskeep.app.nativeapp.data.network.LoginProfileDto
import com.glasskeep.app.nativeapp.data.network.LoginRequest
import com.glasskeep.app.nativeapp.data.network.LoginResponse
import com.glasskeep.app.nativeapp.data.network.PasskeyLoginVerifyRequest
import com.glasskeep.app.nativeapp.data.refusal
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import retrofit2.Response

/**
 * LoginView.jsx, ported: the sign-in screen and its three faces inside the
 * frame every signed-out screen shares (see AuthShell.kt). Like the web it
 * starts on the profile picker, which only shows once visible profiles
 * have arrived: until then, or with none, the manual form is on screen.
 * The passkey and QR buttons sit under each face, and the QR card opens
 * under the form.
 */
@Composable
fun NativeLoginScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onLoggedIn: (mustChangePassword: Boolean) -> Unit,
    onForgotPassword: () -> Unit,
    onRegister: () -> Unit,
) {
    val context = LocalContext.current
    var profiles by remember { mutableStateOf<List<LoginProfileDto>>(emptyList()) }
    var mode by remember { mutableStateOf(LoginMode.PROFILES) }
    var selectedProfile by remember { mutableStateOf<LoginProfileDto?>(null) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    // App.jsx assumes registration is open until the server says otherwise.
    var registrationAllowed by remember { mutableStateOf(true) }
    var qrOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(serverUrl) {
        val api = container.api(serverUrl)
        profiles = try {
            api.getLoginProfiles().body().orEmpty()
        } catch (t: Throwable) {
            NativeDebug.e("Login profiles fetch failed", t)
            emptyList()
        }
        registrationAllowed = runCatching { api.allowRegistration().body()?.allowNewAccounts == true }.getOrDefault(false)
    }

    fun completeLogin(token: String, mustChangePassword: Boolean) {
        container.tokenStore.serverUrl = serverUrl
        container.tokenStore.token = token
        onLoggedIn(mustChangePassword)
    }

    /** Both password sign-ins; errors worded like LoginView's own. */
    fun signIn(request: String, call: suspend () -> Response<LoginResponse>) {
        if (loading) return
        loading = true
        error = ""
        scope.launch {
            try {
                val response = call()
                val body = response.body()
                if (!response.isSuccessful || body == null) throw response.refusal(request)
                NativeDebug.d("Login OK for uid=${body.user.id}")
                completeLogin(body.token, body.mustChangePassword)
            } catch (t: Throwable) {
                error = context.loginErrorText(t)
            } finally {
                loading = false
            }
        }
    }

    fun submitManual() {
        if (email.isBlank() || password.isEmpty()) return
        signIn("POST /api/login") { container.api(serverUrl).login(LoginRequest(email.trim(), password)) }
    }

    fun submitProfile() {
        val profile = selectedProfile ?: return
        if (password.isEmpty()) return
        signIn("POST /api/login") { container.api(serverUrl).loginById(LoginByIdRequest(profile.id, password)) }
    }

    val showPicker = profiles.isNotEmpty() && mode == LoginMode.PROFILES
    val showPassword = !showPicker && mode == LoginMode.PASSWORD && selectedProfile != null

    AuthShell(
        container = container,
        subtitle = if (showPicker) stringResource(R.string.native_login_select_profile) else null,
        loginSlogan = container.branding.loginSlogan,
        sidePanel = if (qrOpen) {
            { colors ->
                QrLoginPanel(
                    container = container,
                    serverUrl = serverUrl,
                    colors = colors,
                    onApproved = { token, mustChange ->
                        qrOpen = false
                        completeLogin(token, mustChange)
                    },
                    onCancel = { qrOpen = false },
                )
            }
        } else {
            null
        },
    ) { colors ->
        val focusManager = LocalFocusManager.current
        when {
            showPicker -> {
                LoginProfileGrid(profiles, onPick = { profile ->
                    selectedProfile = profile
                    password = ""
                    error = ""
                    mode = LoginMode.PASSWORD
                })
                // The grid's mb-4, then the passkey button's own mt-3.
                Spacer(Modifier.height(16.dp))
                SignInShortcuts(container, serverUrl, colors, qrOpen, onToggleQr = { qrOpen = it }, onLoggedIn = ::completeLogin)
                Spacer(Modifier.height(16.dp))
                AuthLink(stringResource(R.string.native_login_manual), Modifier.fillMaxWidth()) {
                    mode = LoginMode.MANUAL
                    error = ""
                    password = ""
                    email = ""
                }
            }

            showPassword -> {
                val profile = selectedProfile!!
                val focus = remember { FocusRequester() }
                LaunchedEffect(profile.id) { focus.requestFocus() }
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    AvatarCircle(avatarUrl = profile.avatarUrl, name = profile.name, size = 80.dp)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        profile.name,
                        color = if (LocalGkDark.current) Color(0xFFF3F4F6) else Color(0xFF1E2939),
                        fontSize = 18.sp,
                        lineHeight = 28.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Spacer(Modifier.height(16.dp))
                AuthTextField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = stringResource(R.string.native_login_enter_password),
                    colors = colors,
                    password = true,
                    focusRequester = focus,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { submitProfile() }),
                )
                FormErrorAndSubmit(error, stringResource(R.string.native_login_submit), colors) { submitProfile() }
                SignInShortcuts(container, serverUrl, colors, qrOpen, onToggleQr = { qrOpen = it }, onLoggedIn = ::completeLogin)
                Spacer(Modifier.height(16.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterHorizontally)) {
                    if (profiles.isNotEmpty()) {
                        AuthLink(stringResource(R.string.native_login_back_to_profiles)) {
                            mode = LoginMode.PROFILES
                            error = ""
                            password = ""
                        }
                    }
                    AuthLink(stringResource(R.string.native_login_other_account)) {
                        mode = LoginMode.MANUAL
                        error = ""
                        password = ""
                        email = ""
                    }
                }
            }

            else -> {
                AuthTextField(
                    value = email,
                    onValueChange = { email = it },
                    placeholder = stringResource(R.string.native_login_username),
                    colors = colors,
                    keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                )
                Spacer(Modifier.height(16.dp))
                AuthTextField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = stringResource(R.string.native_login_password),
                    colors = colors,
                    password = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { submitManual() }),
                )
                FormErrorAndSubmit(error, stringResource(R.string.native_login_submit), colors) { submitManual() }
                SignInShortcuts(container, serverUrl, colors, qrOpen, onToggleQr = { qrOpen = it }, onLoggedIn = ::completeLogin)
                Spacer(Modifier.height(16.dp))
                // flex justify-between: a lone link stays at the start.
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (profiles.isNotEmpty()) {
                        AuthLink(stringResource(R.string.native_login_back_to_profiles), Modifier.weight(1f, fill = false)) {
                            mode = LoginMode.PROFILES
                            error = ""
                            password = ""
                        }
                    }
                    if (registrationAllowed) {
                        AuthLink(stringResource(R.string.native_login_create_account), Modifier.weight(1f, fill = false)) { onRegister() }
                    }
                    AuthLink(stringResource(R.string.native_login_forgot_password), Modifier.weight(1f, fill = false)) { onForgotPassword() }
                }
            }
        }
    }
}

/** Which of LoginView's three faces the user last asked for. */
private enum class LoginMode { PROFILES, PASSWORD, MANUAL }

/** A form's `space-y-4` tail: 16dp, the error line and 16dp when there
 *  is one, then the full-width primary button, which the web never
 *  disables. Shared by every sign-in form. */
@Composable
internal fun FormErrorAndSubmit(error: String, label: String, colors: AuthShellColors, onSubmit: () -> Unit) {
    Spacer(Modifier.height(16.dp))
    if (error.isNotEmpty()) {
        AuthErrorText(error)
        Spacer(Modifier.height(16.dp))
    }
    GkGradientButton(
        label = label,
        themeId = colors.themeId,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 16.sp,
        lineHeight = 24.sp,
        onClick = onSubmit,
    )
}

/** The Jellyfin-style picker: one tile per visible profile, wrapping. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LoginProfileGrid(profiles: List<LoginProfileDto>, onPick: (LoginProfileDto) -> Unit) {
    val nameColor = if (LocalGkDark.current) Color(0xFFE5E7EB) else Color(0xFF364153)
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        for (profile in profiles) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .widthIn(min = 90.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onPick(profile) }
                    .padding(12.dp),
            ) {
                AvatarCircle(avatarUrl = profile.avatarUrl, name = profile.name, size = 64.dp, onClick = { onPick(profile) })
                Text(
                    profile.name,
                    color = nameColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 100.dp),
                )
            }
        }
    }
}

/**
 * PasskeyLoginButton and QrLoginButton, each `mt-3`: the passkey one keeps
 * its own error line under it (`mt-2 text-xs`), a dismissed system picker
 * reading as a cancellation like the WebView's bridge reported it.
 */
@Composable
private fun SignInShortcuts(
    container: NativeAppContainer,
    serverUrl: String,
    colors: AuthShellColors,
    qrOpen: Boolean,
    onToggleQr: (Boolean) -> Unit,
    onLoggedIn: (token: String, mustChangePassword: Boolean) -> Unit,
) {
    val context = LocalContext.current
    val activity = LocalView.current.context as Activity
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    fun signInWithPasskey() {
        if (loading) return
        error = ""
        loading = true
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val optionsResponse = api.passkeyLoginOptions()
                val options = optionsResponse.body()
                if (!optionsResponse.isSuccessful || options == null) throw optionsResponse.refusal("POST /api/passkeys/login/options")
                when (val ceremony = NativePasskeys.authenticate(activity, options.options.toString())) {
                    is PasskeyCeremonyResult.Success -> {
                        val verify = api.passkeyLoginVerify(
                            PasskeyLoginVerifyRequest(
                                response = Json.parseToJsonElement(ceremony.responseJson),
                                challengeId = options.challengeId,
                            ),
                        )
                        val session = verify.body()
                        if (!verify.isSuccessful || session == null) throw verify.refusal("POST /api/passkeys/login/verify")
                        onLoggedIn(session.token, session.mustChangePassword)
                    }
                    is PasskeyCeremonyResult.Failed -> {
                        NativeDebug.e("Passkey login ceremony failed: ${ceremony.name} ${ceremony.message}")
                        val message = ceremony.message
                        error = if (ceremony.name == "NotAllowedError" || PasskeyCancelRegex.containsMatchIn(message)) {
                            context.getString(R.string.native_login_passkey_cancelled)
                        } else {
                            context.localizedServerError(message, R.string.native_login_passkey_failed)
                        }
                    }
                }
            } catch (t: Throwable) {
                val message = context.requestErrorText(t)
                error = if (PasskeyCancelRegex.containsMatchIn(message)) {
                    context.getString(R.string.native_login_passkey_cancelled)
                } else {
                    context.localizedServerError(message, R.string.native_login_passkey_failed)
                }
            } finally {
                loading = false
            }
        }
    }

    Spacer(Modifier.height(12.dp))
    AuthOutlineButton(
        label = stringResource(if (loading) R.string.native_login_passkey_in_progress else R.string.native_login_passkey_signin),
        colors = colors,
        onClick = { signInWithPasskey() },
        enabled = !loading,
        dimmed = loading,
    ) { tint -> KeyIcon(size = 16.dp, tint = tint) }
    if (error.isNotEmpty()) {
        Spacer(Modifier.height(8.dp))
        Text(
            error,
            color = if (LocalGkDark.current) Color(0xFFFF6467) else Color(0xFFE7000B),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    Spacer(Modifier.height(12.dp))
    AuthOutlineButton(
        label = stringResource(if (qrOpen) R.string.native_qr_login_hide else R.string.native_qr_login_cta),
        colors = colors,
        onClick = { onToggleQr(!qrOpen) },
    ) { tint -> QrLoginIcon(size = 16.dp, tint = tint) }
}
