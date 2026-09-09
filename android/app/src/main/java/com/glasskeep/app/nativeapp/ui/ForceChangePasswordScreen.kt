package com.glasskeep.app.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.ChangePasswordResult
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkCardBg
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightCardBg
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.launch

private val ErrorColor = Color(0xFFdc2626)

/**
 * Forced password change, shown right after a successful login when the
 * server says must_change_password (an admin-created account or an
 * admin-reset password, see server/index.js's /api/admin/users routes).
 * Mirrors ChangePasswordModal.jsx's forced=true mode exactly: no current-
 * password field (the server itself skips that check while the flag is
 * set), no cancel, no way out except submitting a new password. The
 * BackHandler below exists for that last part: Compose Navigation's
 * default back behaviour would otherwise pop this screen back to login.
 */
@Composable
fun ForceChangePasswordScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onChanged: () -> Unit,
) {
    val dark = LocalGkDark.current
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()

    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val mismatchMessage = stringResource(R.string.native_settings_password_mismatch)
    val tooShortMessage = stringResource(R.string.native_settings_password_too_short)
    val errorTemplate = stringResource(R.string.native_force_password_error)

    val bgModifier = Modifier.background(WorkspaceTheme.appBackground(container.themeState.themeId, dark))
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val cardBg = if (dark) DarkCardBg else LightCardBg
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

    BackHandler(enabled = true) { /* absorbed: this screen has no way out but submitting */ }

    fun submit() {
        if (loading) return
        if (newPassword.length < 6) {
            errorMessage = tooShortMessage
            return
        }
        if (newPassword != confirmPassword) {
            errorMessage = mismatchMessage
            return
        }
        loading = true
        errorMessage = null
        scope.launch {
            when (val result = repository.changePassword(null, newPassword)) {
                is ChangePasswordResult.Saved -> {
                    NativeDebug.d("ForceChangePasswordScreen: password changed")
                    container.tokenStore.token = result.token
                    loading = false
                    onChanged()
                }
                is ChangePasswordResult.Rejected -> {
                    NativeDebug.e("ForceChangePasswordScreen: rejected HTTP ${result.httpCode}")
                    errorMessage = String.format(errorTemplate, result.httpCode)
                    loading = false
                }
            }
        }
    }

    Box(Modifier.fillMaxSize().then(bgModifier), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.safeDrawingPadding().padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                stringResource(R.string.native_force_password_title),
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = titleColor,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.native_force_password_desc),
                fontSize = 13.sp,
                color = subtextColor,
            )
            Spacer(Modifier.height(24.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(cardBg)
                    .padding(24.dp),
            ) {
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it; errorMessage = null },
                    label = { Text(stringResource(R.string.native_settings_password_new)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    colors = detailFieldColors(titleColor, subtextColor, borderColor),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; errorMessage = null },
                    label = { Text(stringResource(R.string.native_settings_password_confirm)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    colors = detailFieldColors(titleColor, subtextColor, borderColor),
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
                        stringResource(if (loading) R.string.native_note_detail_saving else R.string.native_settings_change_password),
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                        fontSize = 16.sp,
                    )
                }
            }
        }
    }
}
