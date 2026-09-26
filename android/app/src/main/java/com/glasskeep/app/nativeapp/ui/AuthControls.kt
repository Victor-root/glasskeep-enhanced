package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** `text-indigo-600` as rendered: the signed-out screens' links, in both
 *  modes and whatever the login theme. */
internal val AuthLinkColor = Color(0xFF4F39F6)

/**
 * The sign-in forms' `<input>`: `px-4 py-2 rounded-lg border
 * bg-transparent` at the page's 16px/24px (42dp tall), text-gray-900 /
 * gray-100 with the caret in the same colour, and the focus ring outside
 * the unchanged border in the login theme's colour. [minHeight] makes it
 * the secret-key `<textarea>`, several lines from the top. The unlock
 * screen's taller `py-3` field passes its [verticalPadding], its [fill]
 * and no placeholder class, which leaves the placeholder at half the
 * text colour (Tailwind's preflight).
 */
@Composable
internal fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    colors: AuthShellColors,
    modifier: Modifier = Modifier,
    password: Boolean = false,
    minHeight: Dp? = null,
    focusRequester: FocusRequester? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    textStyle: TextStyle = TextStyle.Default,
    verticalPadding: Dp = 8.dp,
    fill: Color = Color.Transparent,
    preflightPlaceholder: Boolean = false,
    enabled: Boolean = true,
) {
    val dark = LocalGkDark.current
    val textColor = if (dark) Color(0xFFF3F4F6) else Color(0xFF101828)
    val placeholderColor = when {
        preflightPlaceholder -> textColor.copy(alpha = 0.5f)
        dark -> Color(0xFF99A1AF)
        else -> Color(0xFF6A7282)
    }
    var focused by remember { mutableStateOf(false) }
    val style = textStyle.merge(TextStyle(color = textColor, fontSize = 16.sp, lineHeight = 24.sp))
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = minHeight == null,
        textStyle = style,
        cursorBrush = SolidColor(textColor),
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        modifier = modifier
            .fillMaxWidth()
            .then(if (minHeight != null) Modifier.heightIn(min = minHeight) else Modifier)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .onFocusChanged { focused = it.isFocused }
            .focusRing(focused, WorkspaceTheme.fieldFocusRing(colors.themeId, dark))
            .background(fill, RoundedCornerShape(8.dp))
            .border(1.dp, colors.border, RoundedCornerShape(8.dp))
            .padding(horizontal = 17.dp, vertical = verticalPadding + 1.dp),
        decorationBox = { innerTextField ->
            Box {
                if (value.isEmpty()) {
                    Text(placeholder, style = style.copy(color = placeholderColor))
                }
                innerTextField()
            }
        },
    )
}

/** A text-button link of the sign-in screens: 14px/20px regular weight
 *  in [AuthLinkColor] (12px/16px for "Change server"). */
@Composable
internal fun AuthLink(
    label: String,
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = 20.sp,
    onClick: () -> Unit,
) {
    Text(
        label,
        color = AuthLinkColor,
        fontSize = fontSize,
        lineHeight = lineHeight,
        textAlign = TextAlign.Center,
        modifier = modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            role = Role.Button,
        ) { onClick() },
    )
}

/** `text-red-600 text-sm`, the form's error line in both modes. */
@Composable
internal fun AuthErrorText(message: String, modifier: Modifier = Modifier) {
    Text(message, color = DangerRed, fontSize = 14.sp, lineHeight = 20.sp, modifier = modifier)
}

/** A footer line of plain text followed by its link, both `text-sm`
 *  and centred ("Already have an account? Sign in"); like the web's
 *  inline button, the link moves to its own line rather than breaking. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AuthTextWithLink(text: String, link: String, colors: AuthShellColors, onClick: () -> Unit) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
    ) {
        Text(text, color = colors.title, fontSize = 14.sp, lineHeight = 20.sp)
        AuthLink(link, onClick = onClick)
    }
}

/**
 * The passkey and QR buttons under the sign-in forms: `w-full px-4 py-2
 * rounded-lg border text-sm font-medium`, a 16dp glyph 8dp before the
 * label, both text-gray-700 / gray-200, [dimmed] to 60% while busy.
 */
@Composable
internal fun AuthOutlineButton(
    label: String,
    colors: AuthShellColors,
    onClick: () -> Unit,
    enabled: Boolean = true,
    dimmed: Boolean = false,
    icon: @Composable (Color) -> Unit,
) {
    val tint = if (LocalGkDark.current) Color(0xFFE5E7EB) else Color(0xFF364153)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (dimmed) 0.6f else 1f)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, colors.border, RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 17.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon(tint)
        Text(label, color = tint, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
    }
}
