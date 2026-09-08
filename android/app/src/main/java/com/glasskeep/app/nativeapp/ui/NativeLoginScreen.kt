package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.network.LoginRequest
import com.glasskeep.app.nativeapp.data.network.PasskeyLoginVerifyRequest
import com.glasskeep.app.nativeapp.isUserCancellation
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkCardBg
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.FloatingCardsBackground
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightCardBg
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

// Same red the setup screen uses for its own field errors (see
// SetupScreen.kt), not promoted to `internal` there for one shared use.
private val ErrorColor = Color(0xFFdc2626)

/**
 * Milestone 0 of the native rewrite: a plain email/password form calling
 * the same `/api/login` the web app uses, since grown a passkey sign-in
 * option (see submitPasskeyLogin/NativePasskeys.kt). QR sign-in and the
 * recovery-key flow are still follow-up milestones, not skipped on
 * purpose.
 *
 * Deliberately reuses SetupScreen's palette and layout language (gradient
 * backdrop, logo, white/dark card, indigo-to-violet button) instead of
 * inventing a second visual style for the same app.
 */
@Composable
fun NativeLoginScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onLoggedIn: () -> Unit,
) {
    val dark = isSystemInDarkTheme()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var passkeyLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val activity = LocalView.current.context as Activity

    // Resolved here, inside composable scope, so the click handler below
    // (a plain suspend lambda, not @Composable) can still use them.
    val errorRejectedTemplate = stringResource(R.string.native_login_error_rejected)
    val errorNetworkTemplate = stringResource(R.string.native_login_error_network)
    val passkeyErrorTemplate = stringResource(R.string.native_login_passkey_error)

    val bgModifier = if (dark) Modifier.background(DarkBgColor) else Modifier.background(LightBgGradient)
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val cardBg = if (dark) DarkCardBg else LightCardBg
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

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
                    onLoggedIn()
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
                            onLoggedIn()
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

    Box(Modifier.fillMaxSize().then(bgModifier), contentAlignment = Alignment.Center) {
        // Same floating note-card decoration as SetupScreen.kt: this
        // screen reuses that screen's visual language on purpose, not a
        // trimmed-down version of it.
        FloatingCardsBackground(dark)

        Column(
            modifier = Modifier.safeDrawingPadding().padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(id = R.drawable.glasskeep_logo),
                contentDescription = "GlassKeep",
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .shadow(8.dp, RoundedCornerShape(16.dp)),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(R.string.native_login_title),
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = titleColor,
            )
            Spacer(Modifier.height(4.dp))
            Text(serverUrl, fontSize = 13.sp, color = subtextColor)
            Spacer(Modifier.height(28.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(cardBg)
                    .padding(24.dp),
            ) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it; errorMessage = null },
                    label = { Text(stringResource(R.string.native_login_email)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    colors = fieldColors(titleColor, subtextColor, borderColor),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; errorMessage = null },
                    label = { Text(stringResource(R.string.native_login_password)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    colors = fieldColors(titleColor, subtextColor, borderColor),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))

                errorMessage?.let {
                    Text(it, color = ErrorColor, fontSize = 12.sp)
                    Spacer(Modifier.height(12.dp))
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ButtonGradient)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            enabled = !loading,
                            role = Role.Button,
                        ) { submit() },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        stringResource(if (loading) R.string.connecting else R.string.native_login_submit),
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                        fontSize = 16.sp,
                    )
                }

                Spacer(Modifier.height(12.dp))

                // Always offered, same as WebAuthnBridge.isAvailable()'s
                // own hardcoded true: neither probes whether this device
                // actually has Credential Manager / Play Services, the
                // system picker says "nothing to use here" on its own if
                // there's genuinely no provider rather than us guessing
                // first.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .border(width = 1.dp, color = borderColor, shape = RoundedCornerShape(12.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            enabled = !passkeyLoading,
                            role = Role.Button,
                        ) { submitPasskeyLogin() },
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    KeyIcon(size = 18.dp, tint = titleColor)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(if (passkeyLoading) R.string.native_login_passkey_in_progress else R.string.native_login_passkey_signin),
                        fontWeight = FontWeight.Medium,
                        color = titleColor,
                        fontSize = 14.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun fieldColors(textColor: Color, subtextColor: Color, borderColor: Color) =
    OutlinedTextFieldDefaults.colors(
        focusedTextColor = textColor,
        unfocusedTextColor = textColor,
        focusedBorderColor = Indigo,
        unfocusedBorderColor = borderColor,
        focusedLabelColor = Indigo,
        unfocusedLabelColor = subtextColor,
        cursorColor = Indigo,
    )
