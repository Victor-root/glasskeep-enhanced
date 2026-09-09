package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
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
import com.glasskeep.app.nativeapp.data.network.PasskeyLoginVerifyRequest
import com.glasskeep.app.nativeapp.isUserCancellation
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.Indigo
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

// Same red the setup screen uses for its own field errors (see
// SetupScreen.kt), not promoted to `internal` there for one shared use.
private val ErrorColor = Color(0xFFdc2626)

/**
 * LoginView, ported: the sign-in screen and its three modes, inside the
 * frame every signed-out screen shares (see AuthShell.kt).
 *
 * A server with visible profiles opens on the "Who's watching?" grid, the
 * same Jellyfin-style picker the web shows; tapping a face asks only for
 * that account's password (POST /api/login with a user_id), and "Manual
 * login" falls back to the username-and-password form. A server with no
 * visible profile opens straight on that form, again like the web.
 *
 * Account creation is offered only when the public registration-capability
 * endpoint allows it; the resulting pending request is managed by the
 * native admin surface. QR sign-in lives on its own scanner screen.
 */
@Composable
fun NativeLoginScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onLoggedIn: (mustChangePassword: Boolean) -> Unit,
    onForgotPassword: () -> Unit,
    onRegister: () -> Unit,
) {
    val dark = LocalGkDark.current
    var profiles by remember { mutableStateOf<List<LoginProfileDto>>(emptyList()) }
    var mode by remember { mutableStateOf(LoginMode.PROFILES) }
    var selectedProfile by remember { mutableStateOf<LoginProfileDto?>(null) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var passkeyLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var registrationAllowed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val activity = LocalView.current.context as Activity

    // Resolved here, inside composable scope, so the click handler below
    // (a plain suspend lambda, not @Composable) can still use them.
    val errorRejectedTemplate = stringResource(R.string.native_login_error_rejected)
    val errorNetworkTemplate = stringResource(R.string.native_login_error_network)
    val passkeyErrorTemplate = stringResource(R.string.native_login_passkey_error)

    fun submit() {
        if (loading || email.isBlank() || password.isBlank()) return
        loading = true
        errorMessage = null
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val response = api.login(LoginRequest(email.trim(), password))
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    NativeDebug.d("Login OK for uid=${body.user.id}")
                    container.tokenStore.serverUrl = serverUrl
                    container.tokenStore.token = body.token
                    onLoggedIn(body.mustChangePassword)
                } else {
                    NativeDebug.e("Login failed: HTTP ${response.code()} ${response.errorBody()?.string()}")
                    errorMessage = String.format(errorRejectedTemplate, response.code())
                }
            } catch (t: Throwable) {
                NativeDebug.e("Login network error", t)
                errorMessage = String.format(errorNetworkTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                loading = false
            }
        }
    }

    /** The profile picker's own sign-in: same endpoint, but identified by
     *  the id the picker already knows instead of a typed username
     *  (App.jsx's signInById). */
    fun submitProfile() {
        val profile = selectedProfile ?: return
        if (loading || password.isBlank()) return
        loading = true
        errorMessage = null
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val response = api.loginById(LoginByIdRequest(profile.id, password))
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    NativeDebug.d("Profile login OK for uid=${body.user.id}")
                    container.tokenStore.serverUrl = serverUrl
                    container.tokenStore.token = body.token
                    onLoggedIn(body.mustChangePassword)
                } else {
                    NativeDebug.e("Profile login failed: HTTP ${response.code()}")
                    errorMessage = String.format(errorRejectedTemplate, response.code())
                }
            } catch (t: Throwable) {
                NativeDebug.e("Profile login network error", t)
                errorMessage = String.format(errorNetworkTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                loading = false
            }
        }
    }

    // The visible profiles, read once. A server with none simply opens on
    // the manual form, exactly as the web decides it (LoginView:47).
    LaunchedEffect(serverUrl) {
        val api = container.api(serverUrl)
        profiles = try {
            api.getLoginProfiles().body().orEmpty()
        } catch (t: Throwable) {
            NativeDebug.e("Login profiles fetch failed", t)
            emptyList()
        }
        registrationAllowed = runCatching { api.allowRegistration().body()?.allowNewAccounts == true }.getOrDefault(false)
        if (profiles.isEmpty()) mode = LoginMode.MANUAL
    }

    /** Mirrors submit() above: same server, same tokenStore write, same
     *  onLoggedIn() on success. The only new surface area is the ceremony
     *  itself (see NativePasskeys.kt): everything after a verified
     *  passkey is exactly what a verified password already does. */
    fun submitPasskeyLogin() {
        if (loading || passkeyLoading) return
        passkeyLoading = true
        errorMessage = null
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val optionsResponse = api.passkeyLoginOptions()
                val optionsBody = optionsResponse.body()
                if (!optionsResponse.isSuccessful || optionsBody == null) {
                    NativeDebug.e("Passkey login options failed: HTTP ${optionsResponse.code()}")
                    errorMessage = String.format(passkeyErrorTemplate, optionsResponse.code())
                    return@launch
                }
                when (val ceremony = NativePasskeys.authenticate(activity, optionsBody.options.toString())) {
                    is PasskeyCeremonyResult.Success -> {
                        val verifyResponse = api.passkeyLoginVerify(
                            PasskeyLoginVerifyRequest(
                                response = Json.parseToJsonElement(ceremony.responseJson),
                                challengeId = optionsBody.challengeId,
                            ),
                        )
                        val verifyBody = verifyResponse.body()
                        if (verifyResponse.isSuccessful && verifyBody != null) {
                            NativeDebug.d("Passkey login OK for uid=${verifyBody.user.id}")
                            container.tokenStore.serverUrl = serverUrl
                            container.tokenStore.token = verifyBody.token
                            onLoggedIn(verifyBody.mustChangePassword)
                        } else {
                            NativeDebug.e("Passkey login verify failed: HTTP ${verifyResponse.code()} ${verifyResponse.errorBody()?.string()}")
                            errorMessage = String.format(passkeyErrorTemplate, verifyResponse.code())
                        }
                    }
                    is PasskeyCeremonyResult.Failed -> {
                        // The user dismissing the system picker isn't an
                        // error to report, same as the web's own
                        // PasskeyLoginButton treating it as a silent,
                        // retry-able no-op.
                        if (!ceremony.isUserCancellation()) {
                            NativeDebug.e("Passkey login ceremony failed: ${ceremony.name} ${ceremony.message}")
                            errorMessage = ceremony.message
                        }
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("Passkey login network error", t)
                errorMessage = String.format(errorNetworkTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                passkeyLoading = false
            }
        }
    }

    // The subtitle is only filled in on the profile picker; the two form
    // modes deliberately leave it empty (LoginView).
    AuthShell(
        container = container,
        subtitle = if (mode == LoginMode.PROFILES) stringResource(R.string.native_login_select_profile) else null,
    ) { colors ->
        val (titleColor, subtextColor, _, borderColor) = colors
        when (mode) {
            LoginMode.PROFILES -> {
                LoginProfileGrid(
                    profiles = profiles,
                    titleColor = titleColor,
                    onPick = { profile ->
                        selectedProfile = profile
                        password = ""
                        errorMessage = null
                        mode = LoginMode.PASSWORD
                    },
                )
                Spacer(Modifier.height(16.dp))
                PasskeyButton(
                    loading = passkeyLoading,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    onClick = { submitPasskeyLogin() },
                )
                Spacer(Modifier.height(16.dp))
                AuthLink(stringResource(R.string.native_login_manual), Modifier.fillMaxWidth()) {
                    mode = LoginMode.MANUAL
                    errorMessage = null
                }
            }

            LoginMode.PASSWORD -> {
                val profile = selectedProfile
                Column(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    AvatarCircle(
                        avatarUrl = profile?.avatarUrl,
                        name = profile?.name.orEmpty(),
                        size = 80.dp,
                        onClick = {},
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        profile?.name.orEmpty(),
                        color = titleColor,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; errorMessage = null },
                    placeholder = { Text(stringResource(R.string.native_login_enter_password)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    colors = detailFieldColors(titleColor, subtextColor, borderColor),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                errorMessage?.let {
                    Text(it, color = ErrorColor, fontSize = 14.sp)
                    Spacer(Modifier.height(12.dp))
                }
                AuthPrimaryButton(
                    label = stringResource(if (loading) R.string.connecting else R.string.native_login_submit),
                    enabled = !loading,
                    onClick = { submitProfile() },
                )
                Spacer(Modifier.height(12.dp))
                PasskeyButton(
                    loading = passkeyLoading,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    onClick = { submitPasskeyLogin() },
                )
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterHorizontally),
                ) {
                    AuthLink(stringResource(R.string.native_login_back_to_profiles)) {
                        mode = LoginMode.PROFILES
                        errorMessage = null
                    }
                    AuthLink(stringResource(R.string.native_login_other_account)) {
                        mode = LoginMode.MANUAL
                        errorMessage = null
                    }
                }
            }

            LoginMode.MANUAL -> {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it; errorMessage = null },
                    placeholder = { Text(stringResource(R.string.native_login_username)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    colors = detailFieldColors(titleColor, subtextColor, borderColor),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; errorMessage = null },
                    placeholder = { Text(stringResource(R.string.native_login_password)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    colors = detailFieldColors(titleColor, subtextColor, borderColor),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                errorMessage?.let {
                    Text(it, color = ErrorColor, fontSize = 14.sp)
                    Spacer(Modifier.height(12.dp))
                }
                AuthPrimaryButton(
                    label = stringResource(if (loading) R.string.connecting else R.string.native_login_submit),
                    enabled = !loading,
                    onClick = { submit() },
                )
                Spacer(Modifier.height(12.dp))
                PasskeyButton(
                    loading = passkeyLoading,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    onClick = { submitPasskeyLogin() },
                )
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (profiles.isNotEmpty()) {
                        AuthLink(stringResource(R.string.native_login_back_to_profiles)) {
                            mode = LoginMode.PROFILES
                            errorMessage = null
                        }
                    } else {
                        Spacer(Modifier.width(1.dp))
                    }
                    AuthLink(stringResource(R.string.native_login_forgot_password)) { onForgotPassword() }
                }
                if (registrationAllowed) {
                    Spacer(Modifier.height(16.dp))
                    AuthLink(stringResource(R.string.native_register_create_account), Modifier.fillMaxWidth()) {
                        onRegister()
                    }
                }
            }
        }
    }
}

/** Which of LoginView's three faces is on screen. */
private enum class LoginMode { PROFILES, PASSWORD, MANUAL }

/** The Jellyfin-style picker: one tile per visible profile, wrapping. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LoginProfileGrid(
    profiles: List<LoginProfileDto>,
    titleColor: Color,
    onPick: (LoginProfileDto) -> Unit,
) {
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
                    color = titleColor,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 100.dp),
                )
            }
        }
    }
}

/** The indigo-to-violet primary button every auth view shares. */
@Composable
private fun AuthPrimaryButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(ButtonGradient)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontWeight = FontWeight.SemiBold, color = Color.White, fontSize = 16.sp)
    }
}

/** The secondary indigo link (14sp) the auth views use under their form. */
@Composable
private fun AuthLink(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Text(
        label,
        color = Indigo,
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
        textAlign = TextAlign.Center,
        modifier = modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            role = Role.Button,
        ) { onClick() },
    )
}

/**
 * PasskeyLoginButton: always offered. It does not probe whether this device
 * actually has Credential Manager: the system picker says "nothing to use here" on its
 * own if there is genuinely no provider, rather than us guessing first.
 */
@Composable
private fun PasskeyButton(loading: Boolean, titleColor: Color, borderColor: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(width = 1.dp, color = borderColor, shape = RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = !loading,
                role = Role.Button,
            ) { onClick() }
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        KeyIcon(size = 18.dp, tint = titleColor)
        Spacer(Modifier.width(8.dp))
        Text(
            stringResource(if (loading) R.string.native_login_passkey_in_progress else R.string.native_login_passkey_signin),
            fontWeight = FontWeight.Medium,
            color = titleColor,
            fontSize = 14.sp,
        )
    }
}
