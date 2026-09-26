package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.network.RegisterRequest
import com.glasskeep.app.nativeapp.data.refusal
import kotlinx.coroutines.launch

/** RegisterView.jsx: the public account request. The server answers
 *  202/pending; no token is installed until an administrator approves. */
@Composable
fun RegisterScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun submit() {
        // The fields the web marks `required` never reach its handler empty.
        if (loading || email.isEmpty() || password.isEmpty() || confirmation.isEmpty()) return
        when {
            password.length < 6 -> error = context.getString(R.string.native_register_password_short)
            password != confirmation -> error = context.getString(R.string.native_register_password_mismatch)
            else -> {
                loading = true
                scope.launch {
                    try {
                        val response = container.api(serverUrl).register(
                            RegisterRequest(name.trim().ifEmpty { "User" }, email.trim(), password),
                        )
                        if (!response.isSuccessful) throw response.refusal("POST /api/register")
                        submitted = true
                    } catch (t: Throwable) {
                        error = context.localizedServerError(context.requestErrorText(t), R.string.native_register_failed)
                    } finally {
                        loading = false
                    }
                }
            }
        }
    }

    AuthShell(container = container, loginSlogan = container.branding.loginSlogan) { colors ->
        if (submitted) {
            val dark = LocalGkDark.current
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("⏳", fontSize = 48.sp, lineHeight = 48.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(16.dp))
                Text(
                    stringResource(R.string.native_register_pending_title),
                    color = if (dark) Color(0xFFF3F4F6) else Color(0xFF1E2939),
                    fontSize = 18.sp,
                    lineHeight = 28.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    stringResource(R.string.native_register_pending_body),
                    color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                GkGradientButton(
                    label = stringResource(R.string.native_register_back),
                    themeId = colors.themeId,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    onClick = onBack,
                )
            }
        } else {
            val focusManager = LocalFocusManager.current
            val next = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
            AuthTextField(
                value = name,
                onValueChange = { name = it },
                placeholder = stringResource(R.string.native_register_name),
                colors = colors,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            Spacer(Modifier.height(16.dp))
            AuthTextField(
                value = email,
                onValueChange = { email = it },
                placeholder = stringResource(R.string.native_login_username),
                colors = colors,
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            Spacer(Modifier.height(16.dp))
            AuthTextField(
                value = password,
                onValueChange = { password = it },
                placeholder = stringResource(R.string.native_register_password),
                colors = colors,
                password = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            Spacer(Modifier.height(16.dp))
            AuthTextField(
                value = confirmation,
                onValueChange = { confirmation = it },
                placeholder = stringResource(R.string.native_register_confirm),
                colors = colors,
                password = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { submit() }),
            )
            FormErrorAndSubmit(error, stringResource(R.string.native_register_submit), colors) { submit() }
            Spacer(Modifier.height(16.dp))
            AuthTextWithLink(
                text = stringResource(R.string.native_register_have_account),
                link = stringResource(R.string.native_register_sign_in),
                colors = colors,
                onClick = onBack,
            )
        }
    }
}
