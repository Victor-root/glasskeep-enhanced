package com.glasskeep.app.nativeapp.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.bodyOrRefusal
import com.glasskeep.app.nativeapp.data.network.AdminAiSettingsDto
import com.glasskeep.app.nativeapp.data.network.AdminAiSettingsPatch
import com.glasskeep.app.nativeapp.data.network.AdminAiTestRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * AiAdminSection.jsx's state: the three switches, the provider draft and
 * the last test's verdict, kept while the section is folded as the web's
 * always-mounted component keeps them. Every answer of the server is
 * applied back whole, which also resets the draft to what it stored.
 */
internal class AdminAiState(
    private val context: Context,
    private val api: GlassKeepApi,
    private val toasts: ToastController,
) {
    var loading by mutableStateOf(true)
        private set
    var saving by mutableStateOf(false)
        private set
    var testing by mutableStateOf(false)
        private set
    var testOutcome by mutableStateOf<AiTestOutcome?>(null)
        private set
    var enabled by mutableStateOf(false)
        private set
    var shareWithUsers by mutableStateOf(false)
        private set
    var privateForUsers by mutableStateOf(false)
        private set
    var hasApiKey by mutableStateOf(false)
        private set
    var draft by mutableStateOf(AiSettingsDraft("", "", "", "0.3", "800", false))

    private fun apply(config: AdminAiSettingsDto) {
        enabled = config.enabled
        shareWithUsers = config.allowServerAiForUsers
        privateForUsers = config.allowPrivateAiForUsers
        hasApiKey = config.hasApiKey
        draft = draft.copy(
            baseUrl = config.baseUrl,
            model = config.model,
            apiKey = "",
            temperature = jsNumberText(config.temperature),
            maxTokens = config.maxTokens.toString(),
        )
    }

    /** The first read, the controls held until it answers; a failure only
     *  leaves the defaults. */
    suspend fun load() {
        loading = true
        try {
            reload()
        } finally {
            loading = false
        }
    }

    /** admin_ai_settings_updated: another admin's change, read back. */
    suspend fun reload() {
        try {
            apply(api.getAdminAiSettings().bodyOrRefusal("GET /api/admin/ai/settings"))
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("Admin AI settings read failed", t)
        }
    }

    /** onToggleEnabled(): switching it off takes the two others down in
     *  the same write. */
    suspend fun toggleEnabled() {
        val next = !enabled
        enabled = next
        var patch = AdminAiSettingsPatch(enabled = next)
        if (!next && shareWithUsers) {
            patch = patch.copy(allowServerAiForUsers = false)
            shareWithUsers = false
        }
        if (!next && privateForUsers) {
            patch = patch.copy(allowPrivateAiForUsers = false)
            privateForUsers = false
        }
        persist(patch)
    }

    suspend fun toggleShare() {
        if (!enabled) return
        shareWithUsers = !shareWithUsers
        persist(AdminAiSettingsPatch(allowServerAiForUsers = shareWithUsers))
    }

    suspend fun togglePrivate() {
        if (!enabled) return
        privateForUsers = !privateForUsers
        persist(AdminAiSettingsPatch(allowPrivateAiForUsers = privateForUsers))
    }

    /** onSave(): the whole form, the key only when one was typed. */
    suspend fun save() {
        val patch = AdminAiSettingsPatch(
            enabled = enabled,
            allowServerAiForUsers = shareWithUsers,
            allowPrivateAiForUsers = privateForUsers,
            baseUrl = draft.baseUrl.trim(),
            model = draft.model.trim(),
            temperature = jsNumberOf(draft.temperature),
            maxTokens = jsNumberOf(draft.maxTokens).roundToInt(),
            apiKey = draft.apiKey.takeIf { it.isNotEmpty() },
        )
        if (persist(patch)) toasts.success(context.getString(R.string.native_settings_ai_saved))
    }

    /** onClearKey(): an empty key removes the stored one. */
    suspend fun clearKey() {
        if (persist(AdminAiSettingsPatch(apiKey = ""))) toasts.success(context.getString(R.string.native_settings_ai_api_key_cleared))
    }

    /** persistOne() and onSave()'s shared write: true once applied. */
    private suspend fun persist(patch: AdminAiSettingsPatch): Boolean {
        saving = true
        testOutcome = null
        return try {
            apply(api.putAdminAiSettings(patch).bodyOrRefusal("PUT /api/admin/ai/settings"))
            true
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            toasts.error(context.localizedServerError(context.requestErrorText(t), R.string.native_settings_save_failed))
            false
        } finally {
            saving = false
        }
    }

    /** onTest(): the form as typed, tried without being saved. */
    suspend fun test() {
        testing = true
        testOutcome = null
        try {
            val request = AdminAiTestRequest(
                baseUrl = draft.baseUrl.trim(),
                model = draft.model.trim(),
                temperature = jsNumberOf(draft.temperature),
                maxTokens = jsNumberOf(draft.maxTokens).roundToInt(),
                apiKey = draft.apiKey.takeIf { it.isNotEmpty() },
            )
            val reply = api.testAdminAi(request).bodyOrRefusal("POST /api/admin/ai/test").reply?.takeIf { it.isNotEmpty() }
            val ok = context.getString(R.string.native_settings_ai_test_ok)
            testOutcome = AiTestOutcome(true, if (reply != null) "$ok : $reply" else ok)
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            testOutcome = AiTestOutcome(false, context.aiTestFailureText(context.requestErrorText(t)))
        } finally {
            testing = false
        }
    }
}

/**
 * "AI assistant" (AiAdminSection.jsx): the amber privacy note, the three
 * switches without icons, the provider (one kind for now), the endpoint
 * fields the user settings share, the test verdict, then Test and Save.
 */
@Composable
internal fun AdminAiSection(
    ai: AdminAiState,
    expanded: Boolean,
    onToggle: () -> Unit,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val scope = rememberCoroutineScope()
    val held = ai.loading || ai.saving
    SettingsAccordionSection(
        title = stringResource(R.string.native_admin_ai_section),
        expanded = expanded,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        icon = { tint -> BrainIcon(size = 20.dp, tint = tint) },
        onToggle = onToggle,
    ) {
        Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            AiPrivacyWarning(amber = true, dark = dark)
            AdminAiSwitchRow(
                title = stringResource(R.string.native_admin_ai_enable_label),
                subtitle = stringResource(R.string.native_admin_ai_enable_desc),
                checked = ai.enabled,
                enabled = !held,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                onToggle = { scope.launch { ai.toggleEnabled() } },
            )
            AdminAiSwitchRow(
                title = stringResource(R.string.native_admin_ai_share_label),
                subtitle = stringResource(R.string.native_admin_ai_share_desc),
                checked = ai.shareWithUsers && ai.enabled,
                enabled = !held && ai.enabled,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                onToggle = { scope.launch { ai.toggleShare() } },
            )
            AdminAiSwitchRow(
                title = stringResource(R.string.native_admin_ai_private_label),
                subtitle = stringResource(R.string.native_admin_ai_private_desc),
                checked = ai.privateForUsers && ai.enabled,
                enabled = !held && ai.enabled,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                onToggle = { scope.launch { ai.togglePrivate() } },
            )
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                AiFieldLabel(stringResource(R.string.native_admin_ai_provider_label))
                // The field look, read-only: transparent in light mode (its
                // bg-black/5 loses to bg-transparent), white 5% in dark.
                Text(
                    stringResource(R.string.native_admin_ai_provider_value),
                    color = titleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (dark) Color.White.copy(alpha = 0.05f) else Color.Transparent, RoundedCornerShape(8.dp))
                        .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                        .padding(horizontal = 13.dp, vertical = 9.dp),
                )
                Text(
                    stringResource(R.string.native_admin_ai_provider_hint),
                    color = SettingsSubtleColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
            }
            AiProviderFields(
                draft = ai.draft,
                hasApiKey = ai.hasApiKey,
                busy = held,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onDraftChange = { ai.draft = it },
                onClearApiKey = { scope.launch { ai.clearKey() } },
                onSave = { if (!held) scope.launch { ai.save() } },
            )
            ai.testOutcome?.let { AiTestOutcomeBox(it, dark) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GkSecondaryButton(
                    label = stringResource(if (ai.testing) R.string.native_settings_ai_testing else R.string.native_settings_ai_test),
                    borderColor = borderColor,
                    textColor = titleColor,
                    enabled = !held && !ai.testing && ai.draft.baseUrl.isNotBlank() && ai.draft.model.isNotBlank(),
                    onClick = { scope.launch { ai.test() } },
                )
                GkGradientButton(
                    label = stringResource(if (ai.saving) R.string.native_settings_ai_saving else R.string.native_settings_ai_save),
                    themeId = themeId,
                    enabled = !held,
                    onClick = { scope.launch { ai.save() } },
                )
            }
        }
    }
}

/** One of the section's switches: title and grey description, and the
 *  switch centred beside them, dimmed while it cannot move. */
@Composable
private fun AdminAiSwitchRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    onToggle: () -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = titleColor, fontSize = 16.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = SettingsSubtleColor, fontSize = 14.sp, lineHeight = 20.sp)
        }
        Spacer(Modifier.width(12.dp))
        GkSwitch(checked = checked, themeId = themeId, dark = dark, onCheckedChange = { onToggle() }, enabled = enabled)
    }
}
