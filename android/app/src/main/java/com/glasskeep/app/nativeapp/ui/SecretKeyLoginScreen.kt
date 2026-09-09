package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.SecretKeyLoginRequest
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.Indigo
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/**
 * The "Forgot username/password?" destination from NativeLoginScreen,
 * mirroring SecretLoginView.jsx: paste the one secret key this account
 * ever had shown to it (see SettingsScreen.kt's Security section for
 * where it's generated) and sign in with that instead of a password.
 * POST /api/login/secret returns the exact same shape as /api/login, so
 * this shares LoginResponse and the mustChangePassword handling in
 * NativeNavHost rather than inventing a parallel one.
 */
@Composable
fun SecretKeyLoginScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onLoggedIn: (mustChangePassword: Boolean) -> Unit,
    onBack: () -> Unit,
) {
    var key by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val errorRejectedTemplate = stringResource(R.string.native_login_error_rejected)
    val errorNetworkTemplate = stringResource(R.string.native_login_error_network)

    fun submit() {
        val trimmed = key.trim()
        if (loading || trimmed.isEmpty()) return
        loading = true
        errorMessage = null
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val response = api.loginWithSecretKey(SecretKeyLoginRequest(trimmed))
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    NativeDebug.d("Secret-key login OK for uid=${body.user.id}")
                    container.tokenStore.serverUrl = serverUrl
                    container.tokenStore.token = body.token
                    onLoggedIn(body.mustChangePassword)
                } else {
                    NativeDebug.e("Secret-key login failed: HTTP ${response.code()} ${response.errorBody()?.string()}")
                    errorMessage = String.format(errorRejectedTemplate, response.code())
                }
            } catch (t: Throwable) {
                NativeDebug.e("Secret-key login network error", t)
                errorMessage = String.format(errorNetworkTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                loading = false
            }
        }
    }

    AuthShell(container = container) { colors ->
        OutlinedTextField(
            value = key,
            onValueChange = { key = it; errorMessage = null },
            placeholder = { Text(stringResource(R.string.native_secret_login_placeholder)) },
            colors = detailFieldColors(colors.title, colors.subtext, colors.border),
            modifier = Modifier.fillMaxWidth().heightIn(min = 100.dp),
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
                stringResource(if (loading) R.string.connecting else R.string.native_secret_login_title),
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                fontSize = 16.sp,
            )
        }

        Spacer(Modifier.height(16.dp))

        Text(
            stringResource(R.string.native_secret_login_back),
            color = Indigo,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onBack() },
        )
    }
}
