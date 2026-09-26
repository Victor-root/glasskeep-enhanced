package com.glasskeep.app.nativeapp.ui

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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.network.UserAiSettingsDto
import kotlin.math.abs

/** Everything the section needs from its host, so the section itself
 *  stays a pure rendering of one [UserAiSettingsDto] plus the draft
 *  fields the user is typing into. */
data class AiSettingsDraft(
    val baseUrl: String,
    val model: String,
    val apiKey: String,
    val temperature: String,
    val maxTokens: String,
    val showApiKey: Boolean,
)

/** The outcome of the Test button: the server's own reply, or its own
 *  refusal. Null until the button has been pressed. */
data class AiTestOutcome(val ok: Boolean, val message: String)

/**
 * The AI section of Settings, ported from UserAiSettingsSection.jsx: the
 * master switch, the server-or-your-own provider pair, and, for your own,
 * the endpoint, model, key and the two advanced numbers, with a Test
 * button that tries the configuration before it is saved.
 *
 * The administrator's own base URL, model and key never travel here: the
 * server only ever says whether its shared AI is available at all
 * (aiSettings.js:272-292), which is what [UserAiSettingsDto.serverAiAvailable]
 * carries.
 */
@Composable
fun AiSettingsSection(
    settings: UserAiSettingsDto,
    draft: AiSettingsDraft,
    testOutcome: AiTestOutcome?,
    busy: Boolean,
    testing: Boolean,
    themeId: String,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onToggleEnabled: (Boolean) -> Unit,
    onSelectMode: (String) -> Unit,
    onDraftChange: (AiSettingsDraft) -> Unit,
    onClearApiKey: () -> Unit,
    onTest: () -> Unit,
    onSave: () -> Unit,
) {
    // With the master switch off server-side nothing here can be turned
    // on, not even a personal provider, so the form stays hidden.
    val effectiveEnabled = settings.enabled && settings.adminAiEnabled
    // The form's own `pl-3` (SettingsPanel.jsx:1376): no right inset.
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.native_settings_ai_enable),
                    color = when {
                        settings.adminAiEnabled -> titleColor
                        dark -> Color(0xFF6A7282)
                        else -> Color(0xFF99A1AF)
                    },
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    stringResource(
                        if (settings.adminAiEnabled) R.string.native_settings_ai_enable_desc
                        else R.string.native_settings_ai_admin_disabled
                    ),
                    // The "your admin turned this off" line is amber, not
                    // grey: it explains why the switch will not move.
                    color = when {
                        settings.adminAiEnabled -> SettingsSubtleColor
                        dark -> Color(0xFFFFB900)
                        else -> Color(0xFFBB4D00)
                    },
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            }
            Spacer(Modifier.width(12.dp))
            GkSwitch(
                checked = effectiveEnabled,
                enabled = !busy && settings.adminAiEnabled,
                themeId = themeId,
                dark = dark,
                onCheckedChange = { onToggleEnabled(it) },
            )
        }

        if (!effectiveEnabled) return@Column

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AiFieldLabel(stringResource(R.string.native_settings_ai_mode))
            AiModeCard(
                selected = settings.mode == "server",
                enabled = !busy && settings.serverAiAvailable,
                title = stringResource(R.string.native_settings_ai_mode_server),
                subtitle = stringResource(
                    if (settings.serverAiAvailable) R.string.native_settings_ai_mode_server_desc
                    else R.string.native_settings_ai_mode_server_unavailable
                ),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                icon = { tint -> WorldIcon(size = 20.dp, tint = tint) },
                onClick = { onSelectMode("server") },
            )
            AiModeCard(
                selected = settings.mode == "custom",
                enabled = !busy,
                title = stringResource(R.string.native_settings_ai_mode_custom),
                subtitle = stringResource(R.string.native_settings_ai_mode_custom_desc),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                icon = { tint -> BrainIcon(size = 20.dp, tint = tint) },
                onClick = { onSelectMode("custom") },
            )
        }

        AiPrivacyWarning(amber = settings.mode != "server", dark = dark)

        if (settings.mode == "custom") {
            AiProviderFields(
                draft = draft,
                hasApiKey = settings.hasApiKey,
                busy = busy,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onDraftChange = onDraftChange,
                onClearApiKey = onClearApiKey,
                onSave = onSave,
            )
        }

        testOutcome?.let { AiTestOutcomeBox(it, dark) }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GkSecondaryButton(
                label = stringResource(
                    if (testing) R.string.native_settings_ai_testing
                    else R.string.native_settings_ai_test
                ),
                borderColor = borderColor,
                textColor = titleColor,
                enabled = !busy && !testing && when (settings.mode) {
                    "server" -> settings.serverAiAvailable
                    else -> draft.baseUrl.isNotBlank() && draft.model.isNotBlank()
                },
                onClick = onTest,
            )
            if (settings.mode == "custom") {
                // A bare `from-indigo-500 to-violet-600`, without
                // `btn-gradient`: no workspace theme retints it.
                GkGradientButton(
                    label = stringResource(
                        if (busy) R.string.native_settings_ai_saving
                        else R.string.native_settings_ai_save
                    ),
                    themeId = themeId,
                    gradient = WorkspaceTheme.buttonGradient(WorkspaceTheme.DEFAULT_ID),
                    enabled = !busy,
                    onClick = onSave,
                )
            }
        }
    }
}

/**
 * The provider fields UserAiSettingsSection.jsx shows for an endpoint of
 * your own and AiAdminSection.jsx for the server's: the base URL and
 * model, the key (never shown once stored, with its reveal button while
 * one is typed and the link removing the stored one), and the two
 * advanced numbers, whose Go key saves the form.
 */
@Composable
internal fun AiProviderFields(
    draft: AiSettingsDraft,
    hasApiKey: Boolean,
    busy: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onDraftChange: (AiSettingsDraft) -> Unit,
    onClearApiKey: () -> Unit,
    onSave: () -> Unit,
) {
    AiField(
        label = stringResource(R.string.native_settings_ai_base_url),
        value = draft.baseUrl,
        placeholder = stringResource(R.string.native_settings_ai_base_url_placeholder),
        hint = stringResource(R.string.native_settings_ai_base_url_hint),
        enabled = !busy,
        keyboardType = KeyboardType.Uri,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        borderColor = borderColor,
        onValueChange = { onDraftChange(draft.copy(baseUrl = it)) },
    )
    AiField(
        label = stringResource(R.string.native_settings_ai_model),
        value = draft.model,
        placeholder = stringResource(R.string.native_settings_ai_model_placeholder),
        hint = stringResource(R.string.native_settings_ai_model_hint),
        enabled = !busy,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        borderColor = borderColor,
        onValueChange = { onDraftChange(draft.copy(model = it)) },
    )

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        AiFieldLabel(stringResource(R.string.native_settings_ai_api_key))
        // `flex gap-2`: the input stretches to the reveal button's
        // height when there is one.
        Row(
            modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            GkTextField(
                value = draft.apiKey,
                onValueChange = { if (!busy) onDraftChange(draft.copy(apiKey = it)) },
                label = null,
                // A stored key is never sent back, so the field
                // stays empty and its placeholder says so.
                placeholder = stringResource(
                    if (hasApiKey) R.string.native_settings_ai_api_key_placeholder_set
                    else R.string.native_settings_ai_api_key_placeholder
                ),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                modifier = Modifier.weight(1f).fillMaxHeight().alpha(if (busy) 0.5f else 1f),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                keyboardOptions = KeyboardOptions(
                    autoCorrectEnabled = false,
                    keyboardType = if (draft.showApiKey) KeyboardType.Text else KeyboardType.Password,
                    imeAction = ImeAction.Next,
                ),
                visualTransformation = if (draft.showApiKey) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                stretch = true,
            )
            if (!hasApiKey || draft.apiKey.isNotEmpty()) {
                val revealLabel = stringResource(
                    if (draft.showApiKey) R.string.native_common_hide else R.string.native_common_show
                )
                // `px-3 py-2` around a 20px icon that sits on the
                // text baseline of the button's 24px line: 9dp
                // above it, the line's descent added under it.
                Box(
                    modifier = Modifier
                        .alpha(if (busy) 0.5f else 1f)
                        .clip(RoundedCornerShape(8.dp))
                        .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                        .semantics { contentDescription = revealLabel }
                        .gkTooltip(revealLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            enabled = !busy,
                            role = Role.Button,
                        ) { onDraftChange(draft.copy(showApiKey = !draft.showApiKey)) }
                        .padding(start = 13.dp, end = 13.dp, top = 9.dp, bottom = 15.5.dp),
                ) {
                    if (draft.showApiKey) {
                        EyeOffIcon(size = 20.dp, tint = titleColor)
                    } else {
                        EyeIcon(size = 20.dp, tint = titleColor)
                    }
                }
            }
        }
        // `flex-wrap justify-between gap-2`: the hint takes the
        // whole line, the link wraps under it.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                stringResource(R.string.native_settings_ai_api_key_hint),
                color = SettingsSubtleColor,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
            if (hasApiKey) {
                Text(
                    stringResource(R.string.native_settings_ai_api_key_clear),
                    color = DangerRed,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier
                        .alpha(if (busy) 0.5f else 1f)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            enabled = !busy,
                            role = Role.Button,
                        ) { onClearApiKey() },
                )
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AiField(
                label = stringResource(R.string.native_settings_ai_temperature),
                value = draft.temperature,
                placeholder = "",
                hint = null,
                enabled = !busy,
                keyboardType = KeyboardType.Decimal,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                modifier = Modifier.weight(1f),
                onValueChange = { onDraftChange(draft.copy(temperature = it)) },
            )
            AiField(
                label = stringResource(R.string.native_settings_ai_max_tokens),
                value = draft.maxTokens,
                placeholder = "",
                hint = null,
                enabled = !busy,
                keyboardType = KeyboardType.Number,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                modifier = Modifier.weight(1f),
                // The form's last field: its Go key submits it,
                // like tapping Save.
                imeAction = ImeAction.Go,
                onImeAction = onSave,
                onValueChange = { onDraftChange(draft.copy(maxTokens = it)) },
            )
        }
        Text(
            stringResource(R.string.native_settings_ai_advanced_hint),
            color = SettingsSubtleColor,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/** The Test button's verdict: green with the provider's reply, red with
 *  the reason it failed. */
@Composable
internal fun AiTestOutcomeBox(outcome: AiTestOutcome, dark: Boolean) {
    val fg = if (outcome.ok) {
        if (dark) Color(0xFFA4F4CF) else Color(0xFF006045)
    } else {
        if (dark) Color(0xFFFFC9C9) else Color(0xFF9F0712)
    }
    val bg = if (outcome.ok) {
        if (dark) Color(0x4D004F3C) else Color(0xFFECFDF5)
    } else {
        if (dark) Color(0x4D81171A) else Color(0xFFFEF2F2)
    }
    val edge = if (outcome.ok) {
        if (dark) Color(0xFF006045) else Color(0xFFA4F4CF)
    } else {
        if (dark) Color(0xFF9F0712) else Color(0xFFFFC9C9)
    }
    Text(
        outcome.message,
        color = fg,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .border(1.dp, edge, RoundedCornerShape(8.dp))
            .padding(horizontal = 13.dp, vertical = 9.dp),
    )
}

/** One of the two provider tiles: a bordered box that takes the accent
 *  edge and its soft fill while it is the chosen one. */
@Composable
private fun AiModeCard(
    selected: Boolean,
    enabled: Boolean,
    title: String,
    subtitle: String,
    themeId: String,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    icon: @Composable (Color) -> Unit,
    onClick: () -> Unit,
) {
    val accent = WorkspaceTheme.accent(themeId, dark)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else 0.5f)
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) WorkspaceTheme.accentSoftBg(themeId, dark) else Color.Transparent)
            .border(1.dp, if (selected) accent else borderColor, RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 13.dp, vertical = 9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            icon(titleColor)
            Spacer(Modifier.width(8.dp))
            Text(title, color = titleColor, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        }
        Spacer(Modifier.height(4.dp))
        Text(subtitle, color = SettingsSubtleColor, fontSize = 12.sp, lineHeight = 16.sp)
    }
}

/** The banner both modes carry: blue for the server's own AI, amber for
 *  an endpoint of your own, since that one is the user's to vet. */
@Composable
internal fun AiPrivacyWarning(amber: Boolean, dark: Boolean) {
    val fg = when {
        amber && dark -> Color(0xFFFEF3C6)
        amber -> Color(0xFF7B3306)
        dark -> Color(0xFFDBEAFE)
        else -> Color(0xFF1C398E)
    }
    val bg = when {
        amber && dark -> Color(0x337D3205)
        amber -> Color(0xFFFFFBEB)
        dark -> Color(0x331E378C)
        else -> Color(0xFFEFF6FF)
    }
    val edge = when {
        amber && dark -> Color(0xFFBB4D00)
        amber -> Color(0xFFFFD230)
        dark -> Color(0xFF1447E6)
        else -> Color(0xFF8EC5FF)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .border(1.dp, edge, RoundedCornerShape(8.dp))
            .padding(horizontal = 13.dp, vertical = 9.dp),
    ) {
        // `mt-0.5`: centred on the first 20px line.
        ShieldLockIcon(modifier = Modifier.padding(top = 2.dp), size = 20.dp, tint = fg)
        Spacer(Modifier.width(8.dp))
        Text(
            stringResource(R.string.native_settings_ai_privacy),
            color = fg,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
    }
}

/** `text-xs font-semibold uppercase tracking-wide text-gray-500`: the
 *  small caption above each of the section's fields. */
@Composable
internal fun AiFieldLabel(text: String) {
    Text(
        text.uppercase(),
        color = SettingsSubtleColor,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.025.em,
    )
}

/** One `text-sm` input of the form, no autocorrect (`spellCheck={false}`),
 *  its keyboard's action key moving on to the next field unless
 *  [imeAction] says otherwise. */
@Composable
private fun AiField(
    label: String,
    value: String,
    placeholder: String,
    hint: String?,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        AiFieldLabel(label)
        GkTextField(
            value = value,
            onValueChange = { if (enabled) onValueChange(it) },
            label = null,
            placeholder = placeholder,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            keyboardOptions = KeyboardOptions(
                autoCorrectEnabled = false,
                keyboardType = keyboardType,
                imeAction = imeAction,
            ),
            keyboardActions = if (onImeAction != null) KeyboardActions(onGo = { onImeAction() }) else KeyboardActions.Default,
            modifier = Modifier.fillMaxWidth().alpha(if (enabled) 1f else 0.5f),
        )
        if (hint != null) {
            Text(hint, color = SettingsSubtleColor, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

/** Number() on a typed field: blank reads as 0, and so does anything
 *  that is not a number at all. */
internal fun jsNumberOf(text: String): Double = text.trim().toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0

/** A number as JavaScript prints it: a whole one without its ".0". */
internal fun jsNumberText(value: Double): String =
    if (value % 1.0 == 0.0 && abs(value) < 1e15) value.toLong().toString() else value.toString()

/** A failed test's line (UserAiSettingsSection.jsx:211-223 and its admin
 *  twin): the reason reworded, plus the provider's own detail it would
 *  drop, since the button is there to diagnose. */
internal fun Context.aiTestFailureText(raw: String): String {
    val localized = localizedServerError(raw, R.string.native_settings_ai_test_failed)
    val detail = (AiProviderErrorRegex.find(raw) ?: AiUnreachableErrorRegex.find(raw))?.groupValues?.get(1)
    return if (detail != null && detail !in localized) "$localized : $detail" else localized
}

private val AiProviderErrorRegex = Regex("""^AI provider error:\s*(.+)$""")
private val AiUnreachableErrorRegex = Regex("""^Failed to reach AI provider\s*\((.+)\)\.?$""")
