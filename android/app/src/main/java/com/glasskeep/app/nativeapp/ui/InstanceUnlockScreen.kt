package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.network.UnlockPassphraseRequest
import com.glasskeep.app.nativeapp.data.network.UnlockPasskeyVerifyRequest
import com.glasskeep.app.nativeapp.data.network.UnlockRecoveryRequest
import com.glasskeep.app.nativeapp.data.network.UnlockResponse
import com.glasskeep.app.nativeapp.isUserCancellation
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.Indigo
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import retrofit2.Response

// text-red-600 / dark:text-red-400, the form's own error line.
private val UnlockErrorLight = Color(0xFFDC2626)
private val UnlockErrorDark = Color(0xFFF87171)

// The amber scope panel: bg amber-50 / amber-900 at 30%, border amber-200 /
// amber-800, text amber-900 / amber-200.
private val AmberBgLight = Color(0xFFFFFBEB)
private val AmberBgDark = Color(0x4D78350F)
private val AmberBorderLight = Color(0xFFFDE68A)
private val AmberBorderDark = Color(0xFF92400E)
private val AmberTextLight = Color(0xFF78350F)
private val AmberTextDark = Color(0xFFFDE68A)

// The banner is a stronger amber than the panel: bg amber-100 /
// amber-900 at 80%, a 2px amber-500 / amber-600 bottom rule, text
// amber-900 / amber-100, and an amber-600 CTA.
private val BannerBgLight = Color(0xFFFEF3C7)
private val BannerBgDark = Color(0xCC78350F)
private val BannerRuleLight = Color(0xFFF59E0B)
private val BannerRuleDark = Color(0xFFD97706)
private val BannerTextLight = Color(0xFF78350F)
private val BannerTextDark = Color(0xFFFEF3C7)
private val BannerCtaBg = Color(0xFFD97706)

// The inactive tab: black at 5% / white at 10%, with gray-700 /
// gray-200 text.
private val TabIdleBgLight = Color(0x0D000000)
private val TabIdleBgDark = Color(0x1AFFFFFF)
private val TabIdleFgLight = Color(0xFF374151)
private val TabIdleFgDark = Color(0xFFE5E7EB)

// text-gray-600 / gray-300 for the explanation, gray-500 / gray-400 for
// the CLI hint below the form.
private val ExplainLight = Color(0xFF4B5563)
private val ExplainDark = Color(0xFFD1D5DB)
private val HintLight = Color(0xFF6B7280)
private val HintDark = Color(0xFF9CA3AF)

/** Which unlock secret the form is asking for. */
private enum class UnlockMode { PASSPHRASE, RECOVERY, PASSKEY }

/** The recovery key's own shape, shown as the field's placeholder exactly
 *  as the web hard-codes it (InstanceUnlockScreen.jsx:126). */
private const val RecoveryKeyPlaceholder = "GKRV-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"

/**
 * InstanceUnlockScreen.jsx + PasskeyUnlockPanel.jsx: the screen a locked
 * server sends everyone to. At-rest encryption keeps the data key in the
 * server's RAM only, so a restart (or an admin's "lock now") leaves every
 * note unreadable until someone supplies the passphrase, the recovery key
 * or an authorised admin passkey. Until then the server answers HTTP 423
 * on all but a handful of routes, which is why this screen calls those
 * few directly instead of going through NotesRepository.
 *
 * [onBackToOffline] is non-null only when the user has a session AND
 * reached this screen from the banner's own CTA: a cold first visit has no
 * local cache to fall back to (App.jsx:7374).
 *
 * The passkey path also signs the admin in, so [onUnlockedWithSession]
 * carries that session for the caller to install exactly like a password
 * login; the other two paths hand back null.
 */
@Composable
fun InstanceUnlockScreen(
    container: NativeAppContainer,
    serverUrl: String,
    onUnlocked: () -> Unit,
    onUnlockedWithSession: (mustChangePassword: Boolean) -> Unit,
    onBackToOffline: (() -> Unit)? = null,
) {
    val dark = LocalGkDark.current
    var mode by remember { mutableStateOf(UnlockMode.PASSPHRASE) }
    var passphrase by remember { mutableStateOf("") }
    var recoveryKey by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val activity = LocalView.current.context as Activity

    val invalidPassphrase = stringResource(R.string.native_err_invalid_passphrase)
    val invalidRecoveryKey = stringResource(R.string.native_err_invalid_recovery_key)
    val tooManyAttempts = stringResource(R.string.native_err_too_many_unlock)
    val plaintextHttp = stringResource(R.string.native_err_plaintext_http)
    val encryptionOff = stringResource(R.string.native_err_encryption_not_enabled)
    val unlockFailedTemplate = stringResource(R.string.native_unlock_failed)
    val networkErrorTemplate = stringResource(R.string.native_login_error_network)
    val noPrfOutput = stringResource(R.string.native_passkey_no_prf_output)
    val passkeyCancelled = stringResource(R.string.native_passkey_unlock_cancelled)

    /** The same four cases the web's serverErrors.js separates out of an
     *  unlock rejection, keyed off the status the server actually sets
     *  rather than off its English message. */
    fun failureMessage(code: Int, rejected: String): String = when (code) {
        401 -> rejected
        429 -> tooManyAttempts
        400 -> plaintextHttp
        409 -> encryptionOff
        else -> String.format(unlockFailedTemplate, code)
    }

    /** Shared tail of all three paths: the server may answer "someone else
     *  already unlocked it", which is a success with nothing to install. */
    fun consumeUnlocked(body: UnlockResponse) {
        if (body.token != null && body.user != null) {
            container.tokenStore.serverUrl = serverUrl
            container.tokenStore.token = body.token
            onUnlockedWithSession(body.mustChangePassword)
        } else {
            onUnlocked()
        }
    }

    fun submitSecret() {
        val secret = if (mode == UnlockMode.RECOVERY) recoveryKey.trim() else passphrase
        if (loading || secret.isEmpty()) return
        loading = true
        errorMessage = null
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val response: Response<UnlockResponse> = if (mode == UnlockMode.RECOVERY) {
                    api.unlockInstanceWithRecoveryKey(UnlockRecoveryRequest(secret))
                } else {
                    api.unlockInstance(UnlockPassphraseRequest(secret))
                }
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    NativeDebug.d("Instance unlocked (mode=$mode)")
                    passphrase = ""
                    recoveryKey = ""
                    consumeUnlocked(body)
                } else {
                    NativeDebug.e("Unlock refused: HTTP ${response.code()} ${response.errorBody()?.string()}")
                    errorMessage = failureMessage(
                        response.code(),
                        if (mode == UnlockMode.RECOVERY) invalidRecoveryKey else invalidPassphrase,
                    )
                }
            } catch (t: Throwable) {
                NativeDebug.e("Unlock network error", t)
                errorMessage = String.format(networkErrorTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                loading = false
            }
        }
    }

    /** PasskeyUnlockPanel's ceremony: the options carry the PRF salt the
     *  server needs evaluated, Credential Manager reads that straight out
     *  of the request JSON (see passkeyClient.js:performAuthentication's
     *  own note for the Android bridge), and the result carries the PRF
     *  output the server unwraps the data key with. */
    fun submitPasskeyUnlock() {
        if (loading) return
        loading = true
        errorMessage = null
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val optionsResponse = api.unlockPasskeyOptions()
                val optionsBody = optionsResponse.body()
                if (!optionsResponse.isSuccessful || optionsBody == null) {
                    NativeDebug.e("Unlock passkey options failed: HTTP ${optionsResponse.code()}")
                    errorMessage = failureMessage(optionsResponse.code(), invalidPassphrase)
                    return@launch
                }
                val options = optionsBody.options
                val challengeId = optionsBody.challengeId
                if (optionsBody.alreadyUnlocked || options == null || challengeId == null) {
                    NativeDebug.d("Instance was already unlocked by the time the ceremony started")
                    onUnlocked()
                    return@launch
                }
                when (val ceremony = NativePasskeys.authenticate(activity, options.toString())) {
                    is PasskeyCeremonyResult.Success -> {
                        val assertion = Json.parseToJsonElement(ceremony.responseJson)
                        val prfOutput = prfOutputOf(assertion.jsonObject)
                        if (prfOutput == null) {
                            NativeDebug.e("Passkey unlock: no PRF output in the assertion")
                            errorMessage = noPrfOutput
                            return@launch
                        }
                        val verifyResponse = api.unlockPasskeyVerify(
                            UnlockPasskeyVerifyRequest(
                                response = assertion,
                                challengeId = challengeId,
                                prfOutput = prfOutput,
                            ),
                        )
                        val verifyBody = verifyResponse.body()
                        if (verifyResponse.isSuccessful && verifyBody != null) {
                            NativeDebug.d("Instance unlocked with a passkey")
                            consumeUnlocked(verifyBody)
                        } else {
                            NativeDebug.e("Unlock passkey verify failed: HTTP ${verifyResponse.code()} ${verifyResponse.errorBody()?.string()}")
                            errorMessage = failureMessage(verifyResponse.code(), invalidPassphrase)
                        }
                    }
                    is PasskeyCeremonyResult.Failed -> {
                        // Same split as the login screen's own: a dismissed
                        // picker is the user's choice, not an error worth
                        // shouting about, but the web does name it here.
                        errorMessage = if (ceremony.isUserCancellation()) {
                            passkeyCancelled
                        } else {
                            NativeDebug.e("Passkey unlock ceremony failed: ${ceremony.name} ${ceremony.message}")
                            String.format(unlockFailedTemplate, 0)
                        }
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("Passkey unlock network error", t)
                errorMessage = String.format(networkErrorTemplate, t.message ?: t.javaClass.simpleName)
            } finally {
                loading = false
            }
        }
    }

    AuthShell(container = container, subtitle = stringResource(R.string.native_instance_locked_title)) { colors ->
        Text(
            stringResource(R.string.native_instance_locked_explain),
            fontSize = 14.sp,
            color = if (dark) ExplainDark else ExplainLight,
        )
        Spacer(Modifier.height(16.dp))

        UnlockScopePanel(dark)
        Spacer(Modifier.height(16.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (tab in UnlockMode.entries) {
                UnlockModeTab(
                    label = stringResource(
                        when (tab) {
                            UnlockMode.PASSPHRASE -> R.string.native_instance_locked_tab_passphrase
                            UnlockMode.RECOVERY -> R.string.native_instance_locked_tab_recovery
                            UnlockMode.PASSKEY -> R.string.native_instance_locked_tab_passkey
                        },
                    ),
                    selected = mode == tab,
                    dark = dark,
                    modifier = Modifier.weight(1f),
                ) {
                    mode = tab
                    errorMessage = null
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        if (mode == UnlockMode.PASSKEY) {
            Text(
                stringResource(R.string.native_passkey_unlock_explain),
                fontSize = 14.sp,
                color = if (dark) ExplainDark else ExplainLight,
            )
            Spacer(Modifier.height(12.dp))
            UnlockSubmitButton(
                label = stringResource(
                    if (loading) R.string.native_passkey_unlock_in_progress else R.string.native_passkey_unlock_cta,
                ),
                enabled = !loading,
                onClick = { submitPasskeyUnlock() },
            )
            errorMessage?.let {
                Spacer(Modifier.height(12.dp))
                UnlockErrorLine(it, dark)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.native_passkey_unlock_fallback_hint),
                fontSize = 12.sp,
                color = if (dark) HintDark else HintLight,
            )
        } else {
            UnlockSecretField(
                value = if (mode == UnlockMode.RECOVERY) recoveryKey else passphrase,
                onValueChange = {
                    if (mode == UnlockMode.RECOVERY) recoveryKey = it else passphrase = it
                    errorMessage = null
                },
                placeholder = if (mode == UnlockMode.RECOVERY) {
                    RecoveryKeyPlaceholder
                } else {
                    stringResource(R.string.native_instance_locked_passphrase_placeholder)
                },
                recovery = mode == UnlockMode.RECOVERY,
                enabled = !loading,
                dark = dark,
                titleColor = colors.title,
                borderColor = colors.border,
            )
            errorMessage?.let {
                Spacer(Modifier.height(12.dp))
                UnlockErrorLine(it, dark)
            }
            Spacer(Modifier.height(12.dp))
            UnlockSubmitButton(
                label = stringResource(
                    if (loading) R.string.native_instance_locked_unlocking else R.string.native_instance_locked_unlock_cta,
                ),
                enabled = !loading && (if (mode == UnlockMode.RECOVERY) recoveryKey.isNotBlank() else passphrase.isNotEmpty()),
                onClick = { submitSecret() },
            )
        }

        Spacer(Modifier.height(16.dp))
        Text(
            stringResource(R.string.native_instance_locked_cli_hint),
            fontSize = 12.sp,
            color = if (dark) HintDark else HintLight,
        )

        if (onBackToOffline != null) {
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, colors.border, RoundedCornerShape(8.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onBackToOffline() }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ArrowLeftIcon(size = 16.dp, tint = colors.title)
                Spacer(Modifier.width(8.dp))
                Text(
                    stringResource(R.string.native_instance_locked_back_to_offline),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = colors.title,
                )
            }
        }
    }
}

/**
 * LockedBanner.jsx: the heads-up a signed-in user gets instead of the full
 * screen, since their local cache is still perfectly readable. Rendered
 * above the whole app so it pushes the screen below it down, the same
 * in-flow placement the web uses (App.jsx:7495).
 *
 * The web's own banner then scrolls away with the page, which no native
 * screen's own scroll container can do from up here; the dismiss button is
 * the same way out and is what the web offers for it anyway.
 */
@Composable
internal fun LockedBanner(dark: Boolean, onUnlock: () -> Unit, onDismiss: () -> Unit) {
    val textColor = if (dark) BannerTextDark else BannerTextLight
    Column(Modifier.fillMaxWidth().background(if (dark) BannerBgDark else BannerBgLight)) {
        // sm:flex-row: the phone stacks the message and keeps the two
        // buttons on their own row, right-aligned (self-end).
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LockIcon(size = 20.dp, tint = textColor)
                Text(
                    stringResource(R.string.native_locked_banner_message),
                    fontSize = 14.sp,
                    lineHeight = 18.sp,
                    color = textColor,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                Text(
                    stringResource(R.string.native_locked_banner_unlock),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(BannerCtaBg)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onUnlock() }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )
                Text(
                    stringResource(R.string.native_dismiss),
                    fontSize = 12.sp,
                    color = textColor,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onDismiss() }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                )
            }
        }
        // border-b-2, thicker than the hairline every other rule here uses.
        Box(
            Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(if (dark) BannerRuleDark else BannerRuleLight),
        )
    }
}

/** The amber "what this protects" panel, honest about its own scope in
 *  the same two bullets the web spells out. */
@Composable
private fun UnlockScopePanel(dark: Boolean) {
    val textColor = if (dark) AmberTextDark else AmberTextLight
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) AmberBgDark else AmberBgLight)
            .border(1.dp, if (dark) AmberBorderDark else AmberBorderLight, RoundedCornerShape(8.dp))
            .padding(12.dp),
    ) {
        Text(
            stringResource(R.string.native_instance_locked_scope_title),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = textColor,
        )
        Spacer(Modifier.height(4.dp))
        for (line in listOf(
            stringResource(R.string.native_instance_locked_scope_protects),
            stringResource(R.string.native_instance_locked_scope_not_protect),
        )) {
            Row(Modifier.padding(top = 4.dp)) {
                Text("•", fontSize = 12.sp, color = textColor)
                Spacer(Modifier.width(6.dp))
                Text(line, fontSize = 12.sp, color = textColor)
            }
        }
    }
}

/** One of the three tab buttons: indigo-500 filled while selected, a faint
 *  wash otherwise. */
@Composable
private fun UnlockModeTab(
    label: String,
    selected: Boolean,
    dark: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(
                when {
                    selected -> Indigo
                    dark -> TabIdleBgDark
                    else -> TabIdleBgLight
                },
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            color = when {
                selected -> Color.White
                dark -> TabIdleFgDark
                else -> TabIdleFgLight
            },
        )
    }
}

/** The passphrase / recovery-key field. The recovery key is typed in the
 *  clear and monospaced with the web's own `tracking-wider`; the
 *  passphrase is masked. */
@Composable
private fun UnlockSecretField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    recovery: Boolean,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val textStyle = TextStyle(
        color = titleColor,
        fontSize = 16.sp,
        fontFamily = if (recovery) FontFamily.Monospace else FontFamily.Default,
        // tracking-wider, the only field on the screen the web spaces out.
        letterSpacing = if (recovery) 0.05.em else TextUnit.Unspecified,
    )
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = true,
        textStyle = textStyle,
        cursorBrush = SolidColor(Indigo),
        keyboardOptions = KeyboardOptions(
            keyboardType = if (recovery) KeyboardType.Ascii else KeyboardType.Password,
        ),
        visualTransformation = if (recovery) VisualTransformation.None else PasswordVisualTransformation(),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        decorationBox = { innerTextField ->
            if (value.isEmpty()) {
                Text(
                    placeholder,
                    style = textStyle.copy(color = if (dark) HintDark else HintLight),
                )
            }
            innerTextField()
        },
    )
}

/** The full-width gradient submit button the three paths share. */
@Composable
private fun UnlockSubmitButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else 0.5f)
            .clip(RoundedCornerShape(8.dp))
            .background(ButtonGradient)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
    }
}

@Composable
private fun UnlockErrorLine(message: String, dark: Boolean) {
    Text(message, fontSize = 14.sp, color = if (dark) UnlockErrorDark else UnlockErrorLight)
}

/**
 * The PRF output Credential Manager put in the assertion, at
 * `clientExtensionResults.prf.results.first`. It arrives already
 * base64url-encoded (JSON can't carry the raw bytes), which is exactly
 * the string the server's own base64UrlToBuf() expects, so this only has
 * to find it and reject an empty one.
 */
private fun prfOutputOf(assertion: JsonObject): String? {
    val results = (assertion["clientExtensionResults"] as? JsonObject)
        ?.get("prf")?.let { it as? JsonObject }
        ?.get("results")?.let { it as? JsonObject }
    val first = (results?.get("first") as? JsonPrimitive)?.contentOrNull
    return first?.takeIf { it.isNotEmpty() }
}
