package com.glasskeep.app.nativeapp.ui

import android.content.ClipData
import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LocalTextStyle
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextIndent
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.InstanceLockState
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.bodyOrRefusal
import com.glasskeep.app.nativeapp.data.network.ActivateEncryptionRequest
import com.glasskeep.app.nativeapp.data.network.ChangeEncryptionPassphraseRequest
import com.glasskeep.app.nativeapp.data.network.DeactivateEncryptionRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * EncryptionAdminSection.jsx's state, held above the panel since the web
 * never unmounts that section: the forms outlive the panel closing, a
 * request still lands with it shut and a recovery key waits for its
 * acknowledgement. Which side shows is the app's own live status read.
 */
internal class AdminEncryptionState(
    private val context: Context,
    private val api: GlassKeepApi,
    private val lockState: InstanceLockState,
    private val toasts: ToastController,
    private val scope: CoroutineScope,
    private val refreshStatus: () -> Unit,
) {
    val enabled: Boolean
        get() = lockState.status?.enabled == true

    var activateOpen by mutableStateOf(false)
    var passphrase by mutableStateOf("")
    var passphraseConfirm by mutableStateOf("")
    var activating by mutableStateOf(false)
        private set
    var activationError by mutableStateOf<String?>(null)
        private set

    /** Shown until acknowledged, even once the status reads enabled: the
     *  web loses it when its 30s status read comes first. */
    var activationKey by mutableStateOf<String?>(null)
        private set

    var rotateOpen by mutableStateOf(false)
    var regenerateOpen by mutableStateOf(false)
    var lockOpen by mutableStateOf(false)
    var deactivateOpen by mutableStateOf(false)

    var currentPassphrase by mutableStateOf("")
    var newPassphrase by mutableStateOf("")
    var newPassphraseConfirm by mutableStateOf("")
    var rotating by mutableStateOf(false)
        private set
    var rotateError by mutableStateOf<String?>(null)
        private set
    var rotateSaved by mutableStateOf(false)
        private set

    var regenerating by mutableStateOf(false)
        private set
    var regeneratedKey by mutableStateOf<String?>(null)
        private set

    var deactivatePassphrase by mutableStateOf("")
    var deactivateAcknowledged by mutableStateOf(false)
    var deactivating by mutableStateOf(false)
        private set
    var deactivationError by mutableStateOf<String?>(null)
        private set

    /** The web's forms live inside the side the status shows, so the side
     *  it hides comes back empty. */
    fun clearHiddenSide() {
        if (enabled) {
            passphrase = ""
            passphraseConfirm = ""
            activationError = null
        } else {
            rotateOpen = false
            regenerateOpen = false
            lockOpen = false
            deactivateOpen = false
            currentPassphrase = ""
            newPassphrase = ""
            newPassphraseConfirm = ""
            rotateError = null
            rotateSaved = false
            regeneratedKey = null
            deactivatePassphrase = ""
            deactivateAcknowledged = false
            deactivationError = null
        }
    }

    /** ActivationForm's submit: its two checks, then the activation, whose
     *  recovery key takes the form's place. */
    fun activate() {
        if (activating || passphrase.isEmpty() || passphraseConfirm.isEmpty()) return
        activationError = passphraseProblem(passphrase, passphraseConfirm)
        if (activationError != null) return
        val request = ActivateEncryptionRequest(passphrase, passphraseConfirm)
        activating = true
        scope.launch {
            try {
                api.activateEncryption(request).bodyOrRefusal("POST /api/instance/activate").recoveryKey
                    ?.takeIf { it.isNotEmpty() }
                    ?.let { activationKey = it }
                passphrase = ""
                passphraseConfirm = ""
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                val message = failureText(t, R.string.native_err_activation_failed)
                activationError = message
                toasts.error(message)
            } finally {
                activating = false
            }
        }
    }

    /** The key acknowledged, the activation closes and the status is read
     *  again at once. */
    fun acknowledgeActivation() {
        activationKey = null
        activateOpen = false
        refreshStatus()
    }

    /** RotatePassphraseForm's submit: "Saved" under the fields for 2.5s. */
    fun rotate() {
        if (rotating || currentPassphrase.isEmpty() || newPassphrase.isEmpty()) return
        rotateError = passphraseProblem(newPassphrase, newPassphraseConfirm)
        if (rotateError != null) return
        val request = ChangeEncryptionPassphraseRequest(currentPassphrase, newPassphrase, newPassphraseConfirm)
        rotating = true
        scope.launch {
            try {
                api.changeEncryptionPassphrase(request).bodyOrRefusal("POST /api/instance/passphrase")
                currentPassphrase = ""
                newPassphrase = ""
                newPassphraseConfirm = ""
                rotateSaved = true
                toasts.success(context.getString(R.string.native_admin_saved), "save")
                scope.launch {
                    delay(2_500)
                    rotateSaved = false
                }
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                rotateError = failureText(t, R.string.native_unlock_failed)
            } finally {
                rotating = false
            }
        }
    }

    /** RegenerateRecoverySection's button: the new key takes its place
     *  until acknowledged, a failure is only a toast. */
    fun regenerate() {
        if (regenerating) return
        regenerating = true
        scope.launch {
            try {
                api.regenerateRecoveryKey().bodyOrRefusal("POST /api/instance/recovery/regenerate").recoveryKey
                    ?.takeIf { it.isNotEmpty() }
                    ?.let { regeneratedKey = it }
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                toasts.error(failureText(t, R.string.native_unlock_failed))
            } finally {
                regenerating = false
            }
        }
    }

    fun acknowledgeRegenerated() {
        regeneratedKey = null
    }

    /** lockNow(), with no confirmation: once the server has dropped its
     *  key the app shows the lock at once, as the web's instance-locked
     *  event does. */
    fun lockNow() {
        scope.launch {
            try {
                api.lockInstance().bodyOrRefusal("POST /api/instance/lock")
                lockState.markLocked()
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                toasts.error(failureText(t, R.string.native_unlock_failed))
            }
        }
    }

    /** DeactivationForm's submit, which its button only allows with the
     *  passphrase typed and the box ticked. */
    fun deactivate() {
        if (deactivating || deactivatePassphrase.isEmpty() || !deactivateAcknowledged) return
        deactivationError = null
        val request = DeactivateEncryptionRequest(deactivatePassphrase)
        deactivating = true
        scope.launch {
            try {
                api.deactivateEncryption(request).bodyOrRefusal("POST /api/instance/deactivate")
                deactivatePassphrase = ""
                deactivateAcknowledged = false
                toasts.success(context.getString(R.string.native_admin_enc_deactivate_done), "shield")
                refreshStatus()
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                deactivationError = failureText(t, R.string.native_unlock_failed)
            } finally {
                deactivating = false
            }
        }
    }

    private fun passphraseProblem(passphrase: String, confirmation: String): String? = when {
        passphrase.length < 8 -> context.getString(R.string.native_err_passphrase_too_short)
        passphrase != confirmation -> context.getString(R.string.native_err_passphrase_mismatch)
        else -> null
    }

    /** localizeServerError(e.message, fallback). */
    private fun failureText(t: Throwable, @StringRes fallback: Int): String {
        NativeDebug.e("Admin encryption request failed", t)
        return context.localizedServerError(context.requestErrorText(t), fallback)
    }
}

/**
 * "At-rest encryption (server-side)" (EncryptionAdminSection.jsx): what it
 * does and the status line, then the activation while it is off, or the
 * four disclosures while it is on: new passphrase, new recovery key, lock
 * now and deactivate.
 */
@Composable
internal fun AdminEncryptionSection(
    encryption: AdminEncryptionState,
    expanded: Boolean,
    onToggle: () -> Unit,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val enabled = encryption.enabled
    LaunchedEffect(encryption, enabled) { encryption.clearHiddenSide() }
    SettingsAccordionSection(
        title = stringResource(R.string.native_admin_encryption_section),
        expanded = expanded,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        icon = { tint -> ShieldLockIcon(size = 20.dp, tint = tint) },
        onToggle = onToggle,
    ) {
        Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            EncryptionParagraph(stringResource(R.string.native_admin_enc_description), dark)
            EncryptionStatusLine(enabled, dark)
            val activationKey = encryption.activationKey
            when {
                activationKey != null -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        stringResource(R.string.native_admin_enc_activation_done),
                        color = if (dark) Green300 else Green700,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    RecoveryKeyBlock(activationKey, dark, titleColor, encryption::acknowledgeActivation)
                }
                !enabled -> EncryptionActivation(encryption, themeId, dark, titleColor, borderColor)
                else -> EncryptionManagement(encryption, themeId, dark, titleColor, borderColor)
            }
        }
    }
}

/** Off: the full-width button, replaced once tapped by the activation form
 *  with its explanation and threat model. */
@Composable
private fun EncryptionActivation(
    encryption: AdminEncryptionState,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val cta = stringResource(R.string.native_admin_enc_activate_cta)
    if (!encryption.activateOpen) {
        GkGradientButton(
            label = cta,
            themeId = themeId,
            fontSize = 16.sp,
            lineHeight = 24.sp,
            modifier = Modifier.fillMaxWidth(),
            onClick = { encryption.activateOpen = true },
        )
        return
    }
    val focusManager = LocalFocusManager.current
    val busy = encryption.activating
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        EncryptionParagraph(stringResource(R.string.native_admin_enc_activate_explain), dark)
        EncryptionNotice(
            title = stringResource(R.string.native_admin_enc_scope_title),
            items = listOf(
                stringResource(R.string.native_admin_enc_scope_protects),
                stringResource(R.string.native_admin_enc_scope_not_protect),
                stringResource(R.string.native_admin_enc_scope_warn),
            ),
            background = if (dark) Amber900.copy(alpha = 0.3f) else Amber50,
            border = if (dark) Amber800 else Amber200,
            textColor = if (dark) Amber200 else Amber900,
        )
        PassphraseField(
            value = encryption.passphrase,
            onValueChange = { encryption.passphrase = it },
            placeholder = stringResource(R.string.native_admin_enc_passphrase),
            enabled = !busy,
            imeAction = ImeAction.Next,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
        ) { focusManager.moveFocus(FocusDirection.Down) }
        PassphraseField(
            value = encryption.passphraseConfirm,
            onValueChange = { encryption.passphraseConfirm = it },
            placeholder = stringResource(R.string.native_admin_enc_passphrase_confirm),
            enabled = !busy,
            imeAction = ImeAction.Go,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
        ) { encryption.activate() }
        encryption.activationError?.let { EncryptionError(it, dark) }
        GkGradientButton(
            label = if (busy) stringResource(R.string.native_admin_enc_activating) else cta,
            themeId = themeId,
            enabled = !busy && encryption.passphrase.isNotEmpty() && encryption.passphraseConfirm.isNotEmpty(),
            fontSize = 16.sp,
            lineHeight = 24.sp,
            modifier = Modifier.fillMaxWidth(),
            onClick = { encryption.activate() },
        )
    }
}

/** On: the four `<details>` boxes, each closed until tapped. */
@Composable
private fun EncryptionManagement(
    encryption: AdminEncryptionState,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val focusManager = LocalFocusManager.current
    val nextField: () -> Unit = { focusManager.moveFocus(FocusDirection.Down) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        EncryptionDisclosure(
            title = stringResource(R.string.native_admin_enc_rotate_cta),
            open = encryption.rotateOpen,
            onToggle = { encryption.rotateOpen = !encryption.rotateOpen },
            borderColor = borderColor,
            summaryColor = titleColor,
            contentSpacing = 8.dp,
        ) {
            val busy = encryption.rotating
            PassphraseField(
                value = encryption.currentPassphrase,
                onValueChange = { encryption.currentPassphrase = it },
                placeholder = stringResource(R.string.native_admin_enc_current_passphrase),
                enabled = !busy,
                imeAction = ImeAction.Next,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onImeAction = nextField,
            )
            PassphraseField(
                value = encryption.newPassphrase,
                onValueChange = { encryption.newPassphrase = it },
                placeholder = stringResource(R.string.native_admin_enc_new_passphrase),
                enabled = !busy,
                imeAction = ImeAction.Next,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onImeAction = nextField,
            )
            PassphraseField(
                value = encryption.newPassphraseConfirm,
                onValueChange = { encryption.newPassphraseConfirm = it },
                placeholder = stringResource(R.string.native_admin_enc_passphrase_confirm),
                enabled = !busy,
                imeAction = ImeAction.Go,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
            ) { encryption.rotate() }
            encryption.rotateError?.let { EncryptionError(it, dark) }
            if (encryption.rotateSaved) {
                Text(
                    stringResource(R.string.native_admin_saved),
                    color = if (dark) Green400 else Green600,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            }
            EncryptionButton(
                label = stringResource(R.string.native_admin_enc_rotate_cta),
                color = Indigo600,
                enabled = !busy && encryption.currentPassphrase.isNotEmpty() && encryption.newPassphrase.isNotEmpty(),
            ) { encryption.rotate() }
        }
        EncryptionDisclosure(
            title = stringResource(R.string.native_admin_enc_regen_cta),
            open = encryption.regenerateOpen,
            onToggle = { encryption.regenerateOpen = !encryption.regenerateOpen },
            borderColor = borderColor,
            summaryColor = titleColor,
            contentSpacing = 8.dp,
        ) {
            val key = encryption.regeneratedKey
            if (key != null) {
                RecoveryKeyBlock(key, dark, titleColor, encryption::acknowledgeRegenerated)
            } else {
                EncryptionParagraph(stringResource(R.string.native_admin_enc_regen_explain), dark)
                EncryptionButton(
                    label = stringResource(R.string.native_admin_enc_regen_cta),
                    color = Amber600,
                    enabled = !encryption.regenerating,
                ) { encryption.regenerate() }
            }
        }
        EncryptionDisclosure(
            title = stringResource(R.string.native_admin_enc_lock_cta),
            open = encryption.lockOpen,
            onToggle = { encryption.lockOpen = !encryption.lockOpen },
            borderColor = borderColor,
            summaryColor = titleColor,
            contentSpacing = 8.dp,
        ) {
            EncryptionParagraph(stringResource(R.string.native_admin_enc_lock_explain), dark)
            EncryptionButton(label = stringResource(R.string.native_admin_enc_lock_cta), color = DangerRed) {
                encryption.lockNow()
            }
        }
        EncryptionDisclosure(
            title = stringResource(R.string.native_admin_enc_deactivate_cta),
            open = encryption.deactivateOpen,
            onToggle = { encryption.deactivateOpen = !encryption.deactivateOpen },
            borderColor = if (dark) Red800 else Red300,
            summaryColor = if (dark) Red300 else Red700,
            contentSpacing = 12.dp,
        ) {
            val busy = encryption.deactivating
            EncryptionNotice(
                title = stringResource(R.string.native_admin_enc_deactivate_warn_title),
                items = listOf(
                    stringResource(R.string.native_admin_enc_deactivate_warn1),
                    stringResource(R.string.native_admin_enc_deactivate_warn2),
                    stringResource(R.string.native_admin_enc_deactivate_warn3),
                ),
                background = if (dark) Red900.copy(alpha = 0.3f) else Red50,
                border = if (dark) Red800 else Red200,
                textColor = if (dark) Red200 else Red900,
            )
            PassphraseField(
                value = encryption.deactivatePassphrase,
                onValueChange = { encryption.deactivatePassphrase = it },
                placeholder = stringResource(R.string.native_admin_enc_current_passphrase),
                enabled = !busy,
                imeAction = ImeAction.Go,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
            ) { encryption.deactivate() }
            // The whole label ticks the box, as the web's <label> does.
            Row(
                Modifier
                    .fillMaxWidth()
                    .toggleable(
                        value = encryption.deactivateAcknowledged,
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = !busy,
                        role = Role.Checkbox,
                    ) { encryption.deactivateAcknowledged = it },
            ) {
                GkCheckbox(
                    checked = encryption.deactivateAcknowledged,
                    onCheckedChange = null,
                    modifier = Modifier.padding(top = 4.dp),
                    enabled = !busy,
                    size = 13.dp,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    stringResource(R.string.native_admin_enc_deactivate_ack),
                    color = titleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            }
            encryption.deactivationError?.let { EncryptionError(it, dark) }
            EncryptionButton(
                label = stringResource(if (busy) R.string.native_admin_enc_deactivating else R.string.native_admin_enc_deactivate_cta),
                color = DangerRed,
                enabled = !busy && encryption.deactivatePassphrase.isNotEmpty() && encryption.deactivateAcknowledged,
            ) { encryption.deactivate() }
        }
    }
}

/** The status line, which reads only `enabled`: green on, grey off (a
 *  locked instance still says it is unlocked, as on the web). */
@Composable
private fun EncryptionStatusLine(enabled: Boolean, dark: Boolean) {
    val background = when {
        enabled && dark -> Green900.copy(alpha = 0.3f)
        enabled -> Green50
        dark -> Gray800.copy(alpha = 0.6f)
        else -> Gray50
    }
    val textColor = when {
        enabled && dark -> Green300
        enabled -> Green700
        dark -> DialogBodyDark
        else -> Gray700
    }
    Row(
        Modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(6.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).background(if (enabled) Green500 else Gray400, CircleShape))
        Spacer(Modifier.width(8.dp))
        Text(
            stringResource(if (enabled) R.string.native_admin_enc_status_enabled else R.string.native_admin_enc_status_disabled),
            color = textColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

/** `text-sm text-gray-600`: the section's explanations. */
@Composable
private fun EncryptionParagraph(text: String, dark: Boolean) {
    Text(text, color = if (dark) DialogBodyDark else DialogBodyLight, fontSize = 14.sp, lineHeight = 20.sp)
}

@Composable
private fun EncryptionError(message: String, dark: Boolean) {
    Text(message, color = if (dark) Red400 else DangerRed, fontSize = 14.sp, lineHeight = 20.sp)
}

/** The threat model and the deactivation warning: a bold line over three
 *  `list-inside` bullets, whose wrapped lines go back under the dot. */
@Composable
private fun EncryptionNotice(title: String, items: List<String>, background: Color, border: Color, textColor: Color) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(8.dp))
            .border(1.dp, border, RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        Text(title, color = textColor, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            items.forEach { item ->
                Text(
                    item,
                    color = textColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    style = LocalTextStyle.current.copy(textIndent = TextIndent(firstLine = 17.sp)),
                    // Chromium's inside disc: 4px, centred 2.5px in and 1px
                    // under the middle of the first 16px line.
                    modifier = Modifier.drawBehind {
                        drawCircle(textColor, radius = 2.sp.toPx(), center = Offset(2.5.sp.toPx(), 9.sp.toPx()))
                    },
                )
            }
        }
    }
}

/** A `<details>` box: its 1px frame, the summary behind Chromium's
 *  disclosure triangle in the summary's colour and, open, [content] 12px
 *  under it. It opens and closes at once, as the web's does. */
@Composable
private fun EncryptionDisclosure(
    title: String,
    open: Boolean,
    onToggle: () -> Unit,
    borderColor: Color,
    summaryColor: Color,
    contentSpacing: Dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .border(1.dp, borderColor, RoundedCornerShape(6.dp))
            .padding(13.dp),
    ) {
        Text(
            title,
            color = summaryColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.Medium,
            style = LocalTextStyle.current.copy(textIndent = TextIndent(firstLine = 14.83.sp)),
            modifier = Modifier
                .fillMaxWidth()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                    onClick = onToggle,
                )
                .drawBehind { drawDisclosureTriangle(open, summaryColor) },
        )
        if (open) {
            Column(
                Modifier.padding(top = 12.dp),
                verticalArrangement = Arrangement.spacedBy(contentSpacing),
                content = content,
            )
        }
    }
}

/** Chromium's disclosure-closed and disclosure-open markers: its own
 *  triangles in a 9px square, 0.5px in and 4.75px down the summary line. */
private fun DrawScope.drawDisclosureTriangle(open: Boolean, color: Color) {
    val side = 9.sp.toPx()
    val left = 0.5.sp.toPx()
    val top = 4.75.sp.toPx()
    val path = Path()
    (if (open) DisclosureOpen else DisclosureClosed).forEachIndexed { index, (x, y) ->
        if (index == 0) path.moveTo(left + x * side, top + y * side) else path.lineTo(left + x * side, top + y * side)
    }
    path.close()
    drawPath(path, color)
}

private val DisclosureClosed = listOf(0f to 0f, 0.86f to 0.5f, 0f to 1f)
private val DisclosureOpen = listOf(0f to 0.07f, 0.5f to 0.93f, 1f to 0.07f)

/** The section's password inputs: no focus classes, so Chromium's own
 *  outline, and Tailwind's placeholder at half the text colour. */
@Composable
private fun PassphraseField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    enabled: Boolean,
    imeAction: ImeAction,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onImeAction: () -> Unit,
) {
    GkTextField(
        value = value,
        onValueChange = onValueChange,
        label = null,
        placeholder = placeholder,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        borderColor = borderColor,
        browserFocusRing = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = imeAction),
        keyboardActions = KeyboardActions(onNext = { onImeAction() }, onGo = { onImeAction() }),
        visualTransformation = PasswordVisualTransformation(),
        background = if (dark) Gray800.copy(alpha = 0.6f) else Color.White.copy(alpha = 0.7f),
        cornerRadius = 6.dp,
        placeholderColor = titleColor.copy(alpha = 0.5f),
        enabled = enabled,
    )
}

/** `px-3 py-2 rounded-md` in one solid colour, on the body's 16px text. */
@Composable
private fun EncryptionButton(label: String, color: Color, enabled: Boolean = true, onClick: () -> Unit) {
    GkSolidButton(
        label = label,
        color = color,
        enabled = enabled,
        horizontalPadding = 12.dp,
        cornerRadius = 6.dp,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.Normal,
        onClick = onClick,
    )
}

/**
 * RecoveryKeyBlock: the amber card with the key in its white box, cut
 * wherever a line is full as `break-all` does, then Copy ("Copied" for 2s)
 * and the acknowledgement that closes it.
 */
@Composable
private fun RecoveryKeyBlock(key: String, dark: Boolean, titleColor: Color, onAcknowledge: () -> Unit) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (dark) Amber900.copy(alpha = 0.3f) else Amber50, RoundedCornerShape(8.dp))
            .border(1.dp, if (dark) Amber800 else Amber200, RoundedCornerShape(8.dp))
            .padding(17.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            stringResource(R.string.native_admin_enc_recovery_label),
            color = if (dark) Amber100 else Amber900,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
        )
        BreakAllText(
            text = key,
            style = LocalTextStyle.current.merge(
                TextStyle(
                    color = titleColor,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.8.sp,
                ),
            ),
            modifier = Modifier
                .fillMaxWidth()
                .background(if (dark) Gray900 else Color.White, RoundedCornerShape(4.dp))
                .border(1.dp, if (dark) Amber700 else Amber300, RoundedCornerShape(4.dp))
                .padding(horizontal = 13.dp, vertical = 9.dp),
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            RecoveryKeyButton(
                label = stringResource(if (copied) R.string.native_admin_enc_recovery_copied else R.string.native_admin_enc_recovery_copy),
                color = if (dark) Amber800 else Amber200,
                textColor = if (dark) Amber100 else Amber900,
            ) {
                scope.launch {
                    clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("recovery key", key)))
                    copied = true
                    delay(2_000)
                    copied = false
                }
            }
            RecoveryKeyButton(
                label = stringResource(R.string.native_admin_enc_recovery_ack),
                color = Amber600,
                textColor = Color.White,
                onClick = onAcknowledge,
            )
        }
    }
}

/** The key card's `px-3 py-1.5 text-xs rounded-md` buttons. */
@Composable
private fun RecoveryKeyButton(label: String, color: Color, textColor: Color, onClick: () -> Unit) {
    GkSolidButton(
        label = label,
        color = color,
        textColor = textColor,
        horizontalPadding = 12.dp,
        verticalPadding = 6.dp,
        cornerRadius = 6.dp,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.Normal,
        onClick = onClick,
    )
}

/** Monospace [text] in lines of as many characters as fit, which is how
 *  `word-break: break-all` cuts it; Android would only break after a
 *  hyphen. */
@Composable
private fun BreakAllText(text: String, style: TextStyle, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(modifier) {
        val advance = remember(text, style, measurer) {
            measurer.measure(text, style, softWrap = false).size.width.toFloat() / text.length
        }
        val perLine = (constraints.maxWidth / advance).toInt().coerceAtLeast(1)
        Text(text.chunked(perLine).joinToString("\n"), style = style)
    }
}

private val Amber50 = Color(0xFFFFFBEB)
private val Amber100 = Color(0xFFFEF3C6)
private val Amber200 = Color(0xFFFEE685)
private val Amber300 = Color(0xFFFFD230)
private val Amber600 = Color(0xFFE17100)
private val Amber700 = Color(0xFFBB4D00)
private val Amber800 = Color(0xFF973C00)
private val Amber900 = Color(0xFF7B3306)
private val Red50 = Color(0xFFFEF2F2)
private val Red200 = Color(0xFFFFC9C9)
private val Red300 = Color(0xFFFFA2A2)
private val Red400 = Color(0xFFFF6467)
private val Red700 = Color(0xFFC10007)
private val Red800 = Color(0xFF9F0712)
private val Red900 = Color(0xFF82181A)
private val Green50 = Color(0xFFF0FDF4)
private val Green300 = Color(0xFF7BF1A8)
private val Green400 = Color(0xFF05DF72)
private val Green500 = Color(0xFF00C951)
private val Green600 = Color(0xFF00A63E)
private val Green700 = Color(0xFF008236)
private val Green900 = Color(0xFF0D542B)
private val Gray50 = Color(0xFFF9FAFB)
private val Gray400 = Color(0xFF99A1AF)
private val Gray700 = Color(0xFF364153)
private val Gray800 = Color(0xFF1E2939)
private val Gray900 = Color(0xFF101828)
private val Indigo600 = Color(0xFF4F39F6)
