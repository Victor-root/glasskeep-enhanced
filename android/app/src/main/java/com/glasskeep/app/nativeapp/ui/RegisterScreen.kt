package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.RegisterRequest
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.Indigo
import kotlinx.coroutines.launch

/** Public account request. The server deliberately answers 202/pending;
 * no token is installed until an administrator approves the account. */
@Composable
fun RegisterScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onBack: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val minError = stringResource(R.string.native_register_password_short)
    val matchError = stringResource(R.string.native_register_password_mismatch)
    val rejected = stringResource(R.string.native_register_failed)

    fun submit() {
        if (loading) return
        when {
            email.isBlank() -> error = rejected
            password.length < 6 -> error = minError
            password != confirmation -> error = matchError
            else -> {
                loading = true
                error = null
                scope.launch {
                    try {
                        val response = container.api(serverUrl).register(
                            RegisterRequest(name.trim().ifBlank { "User" }, email.trim(), password),
                        )
                        submitted = response.code() == 202 && response.body()?.pending == true
                        if (!submitted) error = "$rejected (HTTP ${response.code()})"
                    } catch (t: Throwable) {
                        NativeDebug.e("Registration failed", t)
                        error = "$rejected: ${t.message ?: t.javaClass.simpleName}"
                    } finally {
                        loading = false
                    }
                }
            }
        }
    }

    AuthShell(container = container) { colors ->
        if (submitted) {
            Text("⏳", fontSize = 44.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.native_register_pending_title),
                color = colors.title,
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.native_register_pending_body),
                color = colors.subtext,
                fontSize = 14.sp,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(20.dp))
        } else {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it; error = null },
                placeholder = { Text(stringResource(R.string.native_register_name)) },
                singleLine = true,
                colors = detailFieldColors(colors.title, colors.subtext, colors.border),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = email,
                onValueChange = { email = it; error = null },
                placeholder = { Text(stringResource(R.string.native_login_username)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                singleLine = true,
                colors = detailFieldColors(colors.title, colors.subtext, colors.border),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it; error = null },
                placeholder = { Text(stringResource(R.string.native_register_password)) },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                colors = detailFieldColors(colors.title, colors.subtext, colors.border),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = confirmation,
                onValueChange = { confirmation = it; error = null },
                placeholder = { Text(stringResource(R.string.native_register_confirm)) },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                colors = detailFieldColors(colors.title, colors.subtext, colors.border),
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, color = Color(0xFFDC2626), fontSize = 13.sp)
            }
            Spacer(Modifier.height(16.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(ButtonGradient)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = !loading,
                        role = Role.Button,
                    ) { submit() }
                    .height(44.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(if (loading) R.string.native_admin_saving else R.string.native_register_submit),
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(16.dp))
        }
        Text(
            stringResource(R.string.native_register_back),
            color = Indigo,
            fontSize = 14.sp,
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
