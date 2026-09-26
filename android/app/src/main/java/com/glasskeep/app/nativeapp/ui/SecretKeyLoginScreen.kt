package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.SecretKeyLoginRequest
import com.glasskeep.app.nativeapp.data.refusal
import kotlinx.coroutines.launch

/**
 * SecretLoginView.jsx, the "Forgot username/password?" destination: paste
 * the account's secret key (see Settings' Security section) and sign in
 * with it. POST /api/login/secret answers like /api/login, so the
 * must_change_password handling is NativeNavHost's shared one.
 */
@Composable
fun SecretKeyLoginScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onLoggedIn: (mustChangePassword: Boolean) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var key by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun submit() {
        if (loading || key.isEmpty()) return
        loading = true
        scope.launch {
            try {
                val response = container.api(serverUrl).loginWithSecretKey(SecretKeyLoginRequest(key.trim()))
                val body = response.body()
                if (!response.isSuccessful || body == null) throw response.refusal("POST /api/login/secret")
                NativeDebug.d("Secret-key login OK for uid=${body.user.id}")
                container.tokenStore.serverUrl = serverUrl
                container.tokenStore.token = body.token
                onLoggedIn(body.mustChangePassword)
            } catch (t: Throwable) {
                error = context.localizedServerError(context.requestErrorText(t), R.string.native_login_failed)
            } finally {
                loading = false
            }
        }
    }

    AuthShell(container = container, loginSlogan = container.branding.loginSlogan) { colors ->
        AuthTextField(
            value = key,
            onValueChange = { key = it },
            placeholder = stringResource(R.string.native_secret_login_placeholder),
            colors = colors,
            minHeight = 100.dp,
        )
        FormErrorAndSubmit(error, stringResource(R.string.native_secret_login_title), colors) { submit() }
        Spacer(Modifier.height(16.dp))
        AuthTextWithLink(
            text = stringResource(R.string.native_secret_login_remember),
            link = stringResource(R.string.native_secret_login_back),
            colors = colors,
            onClick = onBack,
        )
    }
}
