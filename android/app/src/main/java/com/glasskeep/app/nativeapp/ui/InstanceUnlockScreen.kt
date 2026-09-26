package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NativePasskeys
import com.glasskeep.app.nativeapp.PasskeyCeremonyResult
import com.glasskeep.app.nativeapp.data.network.UnlockPasskeyVerifyRequest
import com.glasskeep.app.nativeapp.data.network.UnlockPassphraseRequest
import com.glasskeep.app.nativeapp.data.network.UnlockRecoveryRequest
import com.glasskeep.app.nativeapp.data.network.UnlockResponse
import com.glasskeep.app.nativeapp.data.refusal
import com.glasskeep.app.nativeapp.prfOutputOf
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

// The amber scope panel: bg amber-50 / amber-900 at 30%, border amber-200 /
// amber-800, text amber-900 / amber-200, in Tailwind v4's values.
private val AmberBgLight = Color(0xFFFFFBEB)
private val AmberBgDark = Color(0x4D7B3306)
private val AmberBorderLight = Color(0xFFFEE685)
private val AmberBorderDark = Color(0xFF973C00)
private val AmberTextLight = Color(0xFF7B3306)
private val AmberTextDark = Color(0xFFFEE685)

// The banner is a stronger amber than the panel: bg amber-100 /
// amber-900 at 80%, a 2px amber-500 / amber-600 bottom rule, text
// amber-900 / amber-100, an amber-600 CTA and an amber-800 / amber-100
// dismiss link, in the Tailwind v4 values the web paints.
private val BannerBgLight = Color(0xFFFEF3C6)
private val BannerBgDark = Color(0xCC7B3306)
private val BannerRuleLight = Color(0xFFFE9A00)
private val BannerRuleDark = Color(0xFFE17100)
private val BannerTextLight = Color(0xFF7B3306)
private val BannerTextDark = Color(0xFFFEF3C6)
private val BannerCtaBg = Color(0xFFE17100)
private val BannerDismissLight = Color(0xFF973C00)

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
 * login; the other two paths hand back nothing.
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
    val context = LocalContext.current
    var mode by remember { mutableStateOf(UnlockMode.PASSPHRASE) }
    var passphrase by remember { mutableStateOf("") }
    var recoveryKey by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val activity = LocalView.current.context as Activity

    fun installSession(body: UnlockResponse) {
        container.tokenStore.serverUrl = serverUrl
        container.tokenStore.token = body.token
        onUnlockedWithSession(body.mustChangePassword)
    }

    fun submitSecret() {
        val recovery = mode == UnlockMode.RECOVERY
        val secret = if (recovery) recoveryKey else passphrase
        // The submit button is disabled while empty, which also stops the
        // keyboard's Go from sending the form.
        if (loading || secret.isEmpty()) return
        loading = true
        error = ""
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val response = if (recovery) {
                    api.unlockInstanceWithRecoveryKey(UnlockRecoveryRequest(secret))
                } else {
                    api.unlockInstance(UnlockPassphraseRequest(secret))
                }
                if (!response.isSuccessful) throw response.refusal("POST /api/instance/unlock")
                NativeDebug.d("Instance unlocked (mode=$mode)")
                passphrase = ""
                recoveryKey = ""
                onUnlocked()
            } catch (t: Throwable) {
                error = context.secretRejectionText(
                    t,
                    if (recovery) R.string.native_err_invalid_recovery_key else R.string.native_err_invalid_passphrase,
                    R.string.native_unlock_failed,
                )
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
        error = ""
        scope.launch {
            try {
                val api = container.api(serverUrl)
                val optionsResponse = api.unlockPasskeyOptions()
                val optionsBody = optionsResponse.body()
                if (!optionsResponse.isSuccessful || optionsBody == null) throw optionsResponse.refusal("POST /api/instance/unlock-passkey/options")
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
                            error = context.getString(R.string.native_passkey_no_prf_output)
                            return@launch
                        }
                        val verify = api.unlockPasskeyVerify(
                            UnlockPasskeyVerifyRequest(response = assertion, challengeId = challengeId, prfOutput = prfOutput),
                        )
                        val session = verify.body()
                        if (!verify.isSuccessful || session == null) throw verify.refusal("POST /api/instance/unlock-passkey/verify")
                        when {
                            session.alreadyUnlocked -> onUnlocked()
                            session.token != null && session.user != null -> installSession(session)
                            else -> error = context.localizedServerError("Verification failed", R.string.native_unlock_failed)
                        }
                    }
                    is PasskeyCeremonyResult.Failed -> {
                        NativeDebug.e("Passkey unlock ceremony failed: ${ceremony.name} ${ceremony.message}")
                        error = passkeyUnlockError(context, ceremony.name, ceremony.message)
                    }
                }
            } catch (t: Throwable) {
                // passkeyClient.js reads its answers with a bare fetch().
                error = passkeyUnlockError(context, null, fetchErrorText(t))
            } finally {
                loading = false
            }
        }
    }

    AuthShell(container = container, subtitle = stringResource(R.string.native_instance_locked_title)) { colors ->
        val bodyColor = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565)
        val hintColor = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282)
        Text(stringResource(R.string.native_instance_locked_explain), color = bodyColor, fontSize = 14.sp, lineHeight = 20.sp)
        Spacer(Modifier.height(16.dp))
        UnlockScopePanel(dark)
        Spacer(Modifier.height(16.dp))
        // flex gap-2: every tab stretches to the tallest, whose label may wrap.
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                ) {
                    mode = tab
                    error = ""
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        val errorColor = if (dark) Color(0xFFFF6467) else Color(0xFFE7000B)
        if (mode == UnlockMode.PASSKEY) {
            Text(stringResource(R.string.native_passkey_unlock_explain), color = bodyColor, fontSize = 14.sp, lineHeight = 20.sp)
            Spacer(Modifier.height(12.dp))
            UnlockSubmitButton(
                label = stringResource(if (loading) R.string.native_passkey_unlock_in_progress else R.string.native_passkey_unlock_cta),
                themeId = colors.themeId,
                enabled = !loading,
                onClick = { submitPasskeyUnlock() },
            )
            if (error.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Text(error, color = errorColor, fontSize = 14.sp, lineHeight = 20.sp)
            }
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.native_passkey_unlock_fallback_hint), color = hintColor, fontSize = 12.sp, lineHeight = 19.5.sp)
        } else {
            val recovery = mode == UnlockMode.RECOVERY
            // autoFocus: each tab mounts its own field, focused on arrival.
            val focus = remember(mode) { FocusRequester() }
            LaunchedEffect(mode) { focus.requestFocus() }
            key(mode) {
                AuthTextField(
                    value = if (recovery) recoveryKey else passphrase,
                    onValueChange = { if (recovery) recoveryKey = it else passphrase = it },
                    placeholder = if (recovery) RecoveryKeyPlaceholder else stringResource(R.string.native_instance_locked_passphrase_placeholder),
                    colors = colors,
                    password = !recovery,
                    focusRequester = focus,
                    keyboardOptions = if (recovery) {
                        KeyboardOptions(autoCorrectEnabled = false, keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Go)
                    } else {
                        KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go)
                    },
                    keyboardActions = KeyboardActions(onGo = { submitSecret() }),
                    // font-mono tracking-wider for the recovery key only.
                    textStyle = if (recovery) TextStyle(fontFamily = FontFamily.Monospace, letterSpacing = 0.05.em) else TextStyle.Default,
                    verticalPadding = 12.dp,
                    fill = if (dark) Color(0x991E2939) else Color.White.copy(alpha = 0.7f),
                    preflightPlaceholder = true,
                    enabled = !loading,
                )
            }
            if (error.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Text(error, color = errorColor, fontSize = 14.sp, lineHeight = 20.sp)
            }
            Spacer(Modifier.height(12.dp))
            UnlockSubmitButton(
                label = stringResource(if (loading) R.string.native_instance_locked_unlocking else R.string.native_instance_locked_unlock_cta),
                themeId = colors.themeId,
                enabled = !loading && (if (recovery) recoveryKey else passphrase).isNotEmpty(),
                onClick = { submitSecret() },
            )
        }

        Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.native_instance_locked_cli_hint), color = hintColor, fontSize = 12.sp, lineHeight = 16.sp)

        if (onBackToOffline != null) {
            Spacer(Modifier.height(16.dp))
            AuthOutlineButton(
                label = stringResource(R.string.native_instance_locked_back_to_offline),
                colors = colors,
                onClick = onBackToOffline,
            ) { tint -> LongArrowLeftIcon(size = 16.dp, tint = tint) }
        }
    }
}

/** PasskeyUnlockPanel's reading of a failed ceremony: a dismissed picker is
 *  a cancellation, anything else the message reworded, "Unlock failed."
 *  without one. */
private fun passkeyUnlockError(context: Context, name: String?, message: String): String =
    if (name == "NotAllowedError" || PasskeyCancelRegex.containsMatchIn(message)) {
        context.getString(R.string.native_passkey_unlock_cancelled)
    } else {
        context.localizedServerError(message, R.string.native_unlock_failed)
    }

/**
 * LockedBanner.jsx: the heads-up a signed-in user gets instead of the full
 * screen, since their local cache is still perfectly readable. The notes
 * list draws it at the top of its own scrolling page, above the header, so
 * it scrolls away with the notes exactly like the web's in-flow banner
 * (App.jsx:7495). On a phone the web stacks glyph, message and buttons,
 * and tops the banner with its own `max(safe-top, 12px)` padding even
 * though the page already starts under the status bar.
 */
@Composable
internal fun LockedBanner(dark: Boolean, onUnlock: () -> Unit, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    val textColor = if (dark) BannerTextDark else BannerTextLight
    val safeTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    // relative z-10 shadow-md: the shadow falls over the header below.
    Column(
        modifier
            .zIndex(1f)
            .fillMaxWidth()
            .tailwindShadowMd(RectangleShape)
            .background(if (dark) BannerBgDark else BannerBgLight),
    ) {
        Column(
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = maxOf(safeTop, 12.dp), bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PadlockIcon(size = 20.dp, tint = textColor)
            Text(
                stringResource(R.string.native_locked_banner_message),
                fontSize = 14.sp,
                lineHeight = 19.25.sp,
                color = textColor,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                Text(
                    stringResource(R.string.native_locked_banner_unlock),
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
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
                    lineHeight = 16.sp,
                    color = if (dark) BannerTextDark else BannerDismissLight,
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
 *  the same two bullets the web spells out. `list-inside`: a wrapped
 *  bullet line runs back under its dot. */
@Composable
private fun UnlockScopePanel(dark: Boolean) {
    val textColor = if (dark) AmberTextDark else AmberTextLight
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (dark) AmberBgDark else AmberBgLight)
            .border(1.dp, if (dark) AmberBorderDark else AmberBorderLight, shape)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            stringResource(R.string.native_instance_locked_scope_title),
            color = textColor,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
        for (line in listOf(
            stringResource(R.string.native_instance_locked_scope_protects),
            stringResource(R.string.native_instance_locked_scope_not_protect),
        )) {
            Text("\u2022 $line", color = textColor, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

/** One of the three tab buttons: indigo-500 filled while selected (a
 *  colour the themes leave alone), a faint wash otherwise. */
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
                    selected -> Color(0xFF615FFF)
                    dark -> Color(0x1AFFFFFF)
                    else -> Color(0x0D000000)
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
            lineHeight = 20.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            color = when {
                selected -> Color.White
                dark -> Color(0xFFE5E7EB)
                else -> Color(0xFF364153)
            },
        )
    }
}

/** `w-full px-4 py-3 rounded-lg font-semibold btn-gradient`, 48dp tall,
 *  half transparent while disabled. */
@Composable
private fun UnlockSubmitButton(label: String, themeId: String, enabled: Boolean, onClick: () -> Unit) {
    GkGradientButton(
        label = label,
        themeId = themeId,
        modifier = Modifier.fillMaxWidth(),
        enabled = enabled,
        verticalPadding = 12.dp,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        onClick = onClick,
    )
}
