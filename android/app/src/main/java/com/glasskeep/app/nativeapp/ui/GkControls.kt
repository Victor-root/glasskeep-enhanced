package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.glasskeep.app.ui.ButtonGradient

/**
 * The web app's own controls, rebuilt natively.
 *
 * The web hand-rolls every control (switch, segmented chip, accordion,
 * row card, dialog, popover) instead of using a component library, so
 * Material 3's Switch/Card/AlertDialog all miss by a few pixels and a
 * few milliseconds. These reproduce the markup's own geometry and
 * timings, and live in their own file because several screens draw the
 * same pieces.
 *
 * Tailwind's default transition curve, `cubic-bezier(0.4, 0, 0.2, 1)`,
 * covers everything here except the accordion body, which is `ease-out`
 * = `cubic-bezier(0, 0, 0.2, 1)`.
 */
internal val GkStandardEasing = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
internal val GkEaseOut = CubicBezierEasing(0f, 0f, 0.2f, 1f)

/** `text-gray-500`, the sub-label colour, which the web keeps in both
 *  modes for these rows (no `dark:` variant on any of them). */
internal val SettingsSubtleColor = Color(0xFF6B7280)

private val SwitchOffLight = Color(0xFFD1D5DB)
private val SwitchOffDark = Color(0xFF4B5563)
private val SegmentBorderLight = Color(0xFFE5E7EB)
private val SegmentBorderDark = Color(0xFF4B5563)
private val SegmentBgLight = Color(0xFFFFFFFF)
private val SegmentBgDark = Color(0xFF1F2937)
private val SegmentFgLight = Color(0xFF6B7280)
private val SegmentFgDark = Color(0xFF9CA3AF)
private val ChevronClosedLight = Color(0xFF9CA3AF)
private val ChevronClosedDark = Color(0xFF6B7280)
private val PopoverBgDark = Color(0xFF222222)
private val DialogBgDark = Color(0xFF282828)

/** `red-600`, the one red the workspace themes never retint. */
internal val DangerRed = Color(0xFFDC2626)

/**
 * The 44x24 track / 16px knob switch used by every main settings row
 * (`SettingsPanel.jsx:388-397`). ON is the flat `--gk-switch-on` fill,
 * not the gradient: only the small switches inside the notification
 * sub-lists use a gradient.
 */
@Composable
internal fun GkSwitch(
    checked: Boolean,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    val trackColor by animateColorAsState(
        targetValue = when {
            checked -> WorkspaceTheme.switchOnColor(themeId)
            dark -> SwitchOffDark
            else -> SwitchOffLight
        },
        animationSpec = tween(durationMillis = 150, easing = GkStandardEasing),
        label = "switchTrack",
    )
    val knobOffset by animateDpAsState(
        targetValue = if (checked) 24.dp else 4.dp,
        animationSpec = tween(durationMillis = 150, easing = GkStandardEasing),
        label = "switchKnob",
    )
    Box(
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.5f)
            .width(44.dp)
            .height(24.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(trackColor)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onValueChange = onCheckedChange,
            ),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .offset(x = knobOffset)
                .size(16.dp)
                .clip(CircleShape)
                .background(Color.White),
        )
    }
}

/**
 * The 36x20 track / 14px knob switch inside the notification sub-lists
 * (`SettingsPanel.jsx:855-864`). Its ON fill is the app's own indigo to
 * violet gradient, not the flat theme colour [GkSwitch] uses.
 */
@Composable
internal fun GkSmallSwitch(
    checked: Boolean,
    enabled: Boolean,
    dark: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    val offColor = if (dark) SwitchOffDark else SwitchOffLight
    val knobOffset by animateDpAsState(
        targetValue = if (checked) 20.dp else 2.dp,
        animationSpec = tween(durationMillis = 150, easing = GkStandardEasing),
        label = "smallSwitchKnob",
    )
    Box(
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.5f)
            .width(36.dp)
            .height(20.dp)
            .clip(RoundedCornerShape(10.dp))
            .then(
                if (checked) {
                    Modifier.background(ButtonGradient)
                } else {
                    Modifier.background(offColor)
                },
            )
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onValueChange = onCheckedChange,
            ),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .offset(x = knobOffset)
                .size(14.dp)
                .clip(CircleShape)
                .background(Color.White),
        )
    }
}

internal data class GkSegmentOption(val id: String, val label: String)

/**
 * The two-state segmented chip (`SettingsPanel.jsx:1196-1217` and its
 * siblings): one rounded 8px box, a 1px border, the selected half filled
 * with the theme gradient. `btn-gradient` drops the shadow the Tailwind
 * classes ask for, so on a phone only the press scale is left.
 */
@Composable
internal fun GkSegmented(
    options: List<GkSegmentOption>,
    selectedId: String,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, if (dark) SegmentBorderDark else SegmentBorderLight, RoundedCornerShape(8.dp)),
    ) {
        options.forEach { option ->
            val selected = option.id == selectedId
            val interactionSource = remember { MutableInteractionSource() }
            val pressed by interactionSource.collectIsPressedAsState()
            val scale by animateFloatAsState(
                targetValue = if (pressed) 0.98f else 1f,
                animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
                label = "segmentScale",
            )
            val background = if (selected) {
                Modifier.background(WorkspaceTheme.accentGradient(themeId))
            } else {
                Modifier.background(if (dark) SegmentBgDark else SegmentBgLight)
            }
            Box(
                modifier = Modifier
                    .scale(scale)
                    .then(background)
                    .clickable(
                        interactionSource = interactionSource,
                        indication = null,
                        enabled = enabled && !selected,
                        role = Role.RadioButton,
                    ) { onSelect(option.id) }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    option.label,
                    color = when {
                        selected -> Color.White
                        dark -> SegmentFgDark
                        else -> SegmentFgLight
                    },
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

/** `RowIcon` (`SettingsAccordion.jsx:15-21`): the indigo 32x32 pill in
 *  front of every option. */
@Composable
internal fun SettingsRowIcon(themeId: String?, dark: Boolean, icon: @Composable (Color) -> Unit) {
    SettingsPill(
        background = WorkspaceTheme.iconPillBg(themeId, dark),
        tint = WorkspaceTheme.iconPillFg(themeId, dark),
        icon = icon,
    )
}

/** `SectionIcon` (`SettingsAccordion.jsx:27-33`): the same pill one step
 *  along the gradient, used by the accordion headers. */
@Composable
internal fun SettingsSectionIcon(themeId: String?, dark: Boolean, icon: @Composable (Color) -> Unit) {
    SettingsPill(
        background = WorkspaceTheme.sectionPillBg(themeId, dark),
        tint = WorkspaceTheme.sectionPillFg(themeId, dark),
        icon = icon,
    )
}

@Composable
private fun SettingsPill(background: Color, tint: Color, icon: @Composable (Color) -> Unit) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(background),
        contentAlignment = Alignment.Center,
    ) {
        icon(tint)
    }
}

/**
 * One accordion section (`SettingsAccordion.jsx:45-80`): a 48px header
 * with a chevron that rotates from -90 to 0 in 200ms, and a body that
 * grows over 300ms with no fade. Every section starts closed, as the
 * web's empty `openSections` map does.
 */
@Composable
internal fun SettingsAccordionSection(
    title: String,
    expanded: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    icon: @Composable (Color) -> Unit,
    onToggle: () -> Unit,
    contentSpacing: Dp = 12.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 0f else -90f,
        animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
        label = "accordionChevron",
    )
    val chevronColor by animateColorAsState(
        targetValue = if (expanded) {
            WorkspaceTheme.sectionPillFg(themeId, dark)
        } else if (dark) {
            ChevronClosedDark
        } else {
            ChevronClosedLight
        },
        animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
        label = "accordionChevronColor",
    )
    Column(Modifier.padding(bottom = 8.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onToggle() }
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChevronDownIcon(modifier = Modifier.rotate(chevronRotation), size = 20.dp, tint = chevronColor)
            Spacer(Modifier.width(12.dp))
            SettingsSectionIcon(themeId, dark, icon)
            Spacer(Modifier.width(12.dp))
            Text(title, color = titleColor, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(animationSpec = tween(durationMillis = 300, easing = GkEaseOut)),
            exit = shrinkVertically(animationSpec = tween(durationMillis = 300, easing = GkEaseOut)),
        ) {
            Column(
                modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(contentSpacing),
                content = content,
            )
        }
    }
}

/** `SettingsSubHeading` (`SettingsAccordion.jsx:88-96`): a small capital
 *  label followed by a hairline filling the rest of the row. */
@Composable
internal fun SettingsSubHeading(label: String, dark: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 12.dp, top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label.uppercase(),
            color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.6.sp,
        )
        Spacer(Modifier.width(8.dp))
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(if (dark) Color(0xFF4B5563).copy(alpha = 0.4f) else Color(0xFFD1D5DB).copy(alpha = 0.6f)),
        )
    }
}

/** The panel's plain preference row: coloured glyph, title, optional
 *  description, and a switch pinned to the right edge
 *  (`SettingsPanel.jsx:1067-1090` and every row shaped like it). */
@Composable
internal fun SettingsSwitchRow(
    title: String,
    subtitle: String?,
    checked: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    icon: @Composable (Color) -> Unit,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
            SettingsRowIcon(themeId, dark, icon)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    title,
                    color = titleColor,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                )
                if (subtitle != null) {
                    Text(
                        subtitle,
                        color = SettingsSubtleColor,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                }
            }
        }
        Spacer(Modifier.width(12.dp))
        GkSwitch(
            checked = checked,
            enabled = enabled,
            themeId = themeId,
            dark = dark,
            onCheckedChange = onCheckedChange,
        )
    }
}

/** The full-width bordered row card the panel uses for every action that
 *  opens something else (`SettingsPanel.jsx:400-412`). */
@Composable
internal fun SettingsCardButton(
    title: String,
    subtitle: String?,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    footer: (@Composable () -> Unit)? = null,
    icon: @Composable (Color) -> Unit,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingsRowIcon(themeId, dark, icon)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = titleColor, fontSize = 16.sp, fontWeight = FontWeight.Medium)
            if (subtitle != null) {
                Text(subtitle, color = SettingsSubtleColor, fontSize = 14.sp, lineHeight = 20.sp)
            }
            footer?.invoke()
        }
    }
}

/**
 * The primary gradient button (`SettingsPanel.jsx:1543`, and every other
 * `btn-gradient` call site): 14px/600 white on the theme gradient, 8px
 * radius, no shadow at rest, `scale(0.98)` while pressed.
 */
@Composable
internal fun GkGradientButton(
    label: String,
    themeId: String?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    horizontalPadding: Dp = 16.dp,
    verticalPadding: Dp = 8.dp,
    // Non-null only for the semantic variants that must not follow the
    // workspace accent (see GkConfirmVariant).
    gradient: Brush? = null,
    trailing: (@Composable () -> Unit)? = null,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
        label = "gradientButtonScale",
    )
    Row(
        modifier = modifier
            .scale(scale)
            .alpha(if (enabled) 1f else 0.5f)
            .clip(RoundedCornerShape(8.dp))
            .background(gradient ?: WorkspaceTheme.accentGradient(themeId))
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = if (trailing == null) Arrangement.Center else Arrangement.SpaceBetween,
    ) {
        Text(
            label,
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (trailing != null) {
            Spacer(Modifier.width(8.dp))
            trailing()
        }
    }
}

/** The `Popover` list (`Popover.jsx` + `SettingsPanel.jsx:1544-1568`):
 *  no animation, a 12px card, and the selected option tinted with the
 *  theme accent. */
@Composable
internal fun SettingsPopoverOption(
    label: String,
    selected: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    onClick: () -> Unit,
) {
    val accent = WorkspaceTheme.accent(themeId, dark)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (selected) WorkspaceTheme.accentSoftBg(themeId, dark) else Color.Transparent)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            label,
            color = if (selected) accent else titleColor,
            fontSize = 14.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        )
        if (selected) {
            Spacer(Modifier.width(12.dp))
            CheckmarkIcon(size = 16.dp, tint = accent)
        }
    }
}

/**
 * The panel's own dialog shell (`ChangePasswordModal.jsx:55-60`,
 * `PasskeySettingsSection.jsx:540-600`): a 90%-wide card capped at
 * 448px, 12px radius, 24px padding, over a flat `rgba(0,0,0,0.6)`
 * scrim. No entrance animation, matching the web's plain conditional
 * render. The web also blurs the scrim by 8px; a dialog window can't
 * blur what is behind it here, so the scrim stays flat.
 */
@Composable
internal fun GkDialog(
    onDismissRequest: () -> Unit,
    dark: Boolean,
    borderColor: Color,
    dismissOnClickOutside: Boolean = true,
    maxWidth: Dp = 448.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(
        onDismissRequest = onDismissRequest,
        properties = DialogProperties(
            dismissOnClickOutside = dismissOnClickOutside,
            usePlatformDefaultWidth = false,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .widthIn(max = maxWidth)
                .shadow(elevation = 24.dp, shape = RoundedCornerShape(12.dp))
                .clip(RoundedCornerShape(12.dp))
                .background(if (dark) DialogBgDark else Color.White)
                .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                .padding(24.dp),
            content = content,
        )
    }
}

/** GenericConfirmDialog.jsx's three button palettes: the brand gradient
 *  by default, flat red for a destructive action, an emerald gradient for
 *  a positive one. The two semantic variants deliberately ignore the
 *  workspace theme (the web marks them `gk-fixed-btn` for the same
 *  reason): a delete button stays red whatever the accent colour is. */
enum class GkConfirmVariant { DEFAULT, DANGER, SUCCESS }

/**
 * GenericConfirmDialog.jsx: the one confirmation used all over the web app
 * (converting a note, resetting the note order, restarting the server).
 * Title 18sp semibold, message 14sp muted, then Cancel and the confirm
 * button right-aligned 20dp below.
 */
@Composable
internal fun GkConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String,
    cancelLabel: String,
    themeId: String?,
    dark: Boolean,
    borderColor: Color,
    titleColor: Color,
    subtextColor: Color,
    variant: GkConfirmVariant = GkConfirmVariant.DEFAULT,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    GkDialog(onDismissRequest = onDismiss, dark = dark, borderColor = borderColor, maxWidth = 384.dp) {
        Text(title, color = titleColor, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(message, color = subtextColor, fontSize = 14.sp, lineHeight = 20.sp)
        Spacer(Modifier.height(20.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GkSecondaryButton(
                label = cancelLabel,
                borderColor = borderColor,
                textColor = titleColor,
                onClick = onDismiss,
            )
            when (variant) {
                GkConfirmVariant.DANGER -> GkDangerButton(
                    label = confirmLabel,
                    onClick = { onDismiss(); onConfirm() },
                )
                GkConfirmVariant.SUCCESS -> GkGradientButton(
                    label = confirmLabel,
                    themeId = null,
                    gradient = Brush.horizontalGradient(listOf(Color(0xFF10B981), Color(0xFF16A34A))),
                    onClick = { onDismiss(); onConfirm() },
                )
                GkConfirmVariant.DEFAULT -> GkGradientButton(
                    label = confirmLabel,
                    themeId = themeId,
                    onClick = { onDismiss(); onConfirm() },
                )
            }
        }
    }
}

/** The bordered secondary button (Cancel, Test connection):
 *  `px-4 py-2 rounded-lg border border-[var(--border-light)]`. */
@Composable
internal fun GkSecondaryButton(
    label: String,
    borderColor: Color,
    textColor: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.5f)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(label, color = textColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** The solid red confirmation button
 *  (`PasskeySettingsSection.jsx:585`), the one button the workspace
 *  themes deliberately leave alone (`gk-fixed-btn`). */
@Composable
internal fun GkDangerButton(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.5f)
            .clip(RoundedCornerShape(8.dp))
            .background(DangerRed)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * The dialog text field (`ChangePasswordModal.jsx:78`): a transparent
 * 8px box with a 1px `--border-light` edge that becomes a 2px accent
 * ring while focused, and its label above it (14px/500, 4px gap).
 */
@Composable
internal fun GkTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String?,
    placeholder: String,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    modifier: Modifier = Modifier,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    var focused by remember { mutableStateOf(false) }
    val accent = WorkspaceTheme.accent(themeId, dark)
    Column(modifier) {
        if (label != null) {
            Text(label, color = titleColor, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(4.dp))
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(color = titleColor, fontSize = 16.sp),
            cursorBrush = SolidColor(accent),
            keyboardOptions = keyboardOptions,
            visualTransformation = visualTransformation,
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { focused = it.isFocused }
                .border(
                    width = if (focused) 2.dp else 1.dp,
                    color = if (focused) accent else borderColor,
                    shape = RoundedCornerShape(8.dp),
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
            decorationBox = { innerTextField ->
                if (value.isEmpty()) {
                    Text(
                        placeholder,
                        color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                        fontSize = 16.sp,
                    )
                }
                innerTextField()
            },
        )
    }
}

/**
 * The note footer's popovers (`ColorPickerPanel.jsx:14-65` and
 * `ModalFooter.jsx:384-417`): a fixed-width card that opens upwards from
 * the tapped footer button, kept 8px away from the screen edges, with a
 * 12x6 arrow pointing back down at the button's centre. Neither panel
 * has any open or close animation on the web.
 *
 * The caller places this inside the button's own Box: Compose hands the
 * position provider that button's window bounds, which is exactly what
 * the web reads from `getBoundingClientRect()`.
 */
@Composable
internal fun FooterPopover(
    gap: Dp,
    background: Color,
    borderColor: Color,
    onDismiss: () -> Unit,
    width: Dp? = null,
    minWidth: Dp = 0.dp,
    cornerRadius: Dp = 16.dp,
    elevation: Dp = 24.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val density = LocalDensity.current
    var arrowLeft by remember { mutableStateOf(0.dp) }
    var panelWidth by remember { mutableStateOf(width ?: minWidth) }
    val positionProvider = remember(density, width, gap) {
        object : PopupPositionProvider {
            override fun calculatePosition(
                anchorBounds: IntRect,
                windowSize: IntSize,
                layoutDirection: LayoutDirection,
                popupContentSize: IntSize,
            ): IntOffset {
                val widthPx = width?.let { with(density) { it.roundToPx() } } ?: popupContentSize.width
                val marginPx = with(density) { 8.dp.roundToPx() }
                val gapPx = with(density) { gap.roundToPx() }
                val left = minOf(anchorBounds.left, windowSize.width - widthPx - marginPx)
                    .coerceAtLeast(marginPx)
                // Half the arrow's width, so its tip lands on the
                // button's centre.
                val halfArrowPx = with(density) { 6.dp.roundToPx() }
                arrowLeft = with(density) { (anchorBounds.center.x - left - halfArrowPx).toDp() }
                panelWidth = with(density) { widthPx.toDp() }
                return IntOffset(left, anchorBounds.top - gapPx - popupContentSize.height)
            }
        }
    }
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(if (width != null) Modifier.width(width) else Modifier.widthIn(min = minWidth)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(elevation = elevation, shape = RoundedCornerShape(cornerRadius))
                    .clip(RoundedCornerShape(cornerRadius))
                    .background(background)
                    .border(1.dp, borderColor, RoundedCornerShape(cornerRadius)),
                content = content,
            )
            Canvas(
                modifier = Modifier
                    .padding(start = arrowLeft.coerceIn(12.dp, (panelWidth - 24.dp).coerceAtLeast(12.dp)))
                    .size(width = 12.dp, height = 6.dp),
            ) {
                val arrow = Path().apply {
                    moveTo(0f, 0f)
                    lineTo(size.width, 0f)
                    lineTo(size.width / 2f, size.height)
                    close()
                }
                drawPath(arrow, color = background)
            }
        }
    }
}

/** Lets a block spill past its parent's horizontal padding, the way the
 *  checklist deliberately does on a phone (`max-sm:-mx-4`). */
internal fun Modifier.bleedHorizontally(amount: Dp): Modifier = layout { measurable, constraints ->
    val extra = amount.roundToPx() * 2
    val placeable = measurable.measure(
        constraints.copy(minWidth = 0, maxWidth = constraints.maxWidth + extra),
    )
    layout(placeable.width - extra, placeable.height) {
        placeable.place(-amount.roundToPx(), 0)
    }
}

/** A 1px line under the content, in the given colour (null draws
 *  nothing), without adding a full border box. */
internal fun Modifier.bottomHairline(color: Color?): Modifier =
    if (color == null) this else drawBehind {
        val stroke = 1.dp.toPx()
        drawRect(
            color = color,
            topLeft = Offset(0f, size.height - stroke),
            size = Size(size.width, stroke),
        )
    }

/** The 3px left accent bar a coloured section block carries
 *  (ChecklistEditor.jsx:353). */
internal fun Modifier.drawSectionAccent(color: Color, dark: Boolean): Modifier = drawBehind {
    drawRect(
        color = color.copy(alpha = if (dark) 0.8f else 0.6f),
        size = Size(3.dp.toPx(), size.height),
    )
}

/** The mirror of [bottomHairline] for a strip that sits under content:
 *  one hairline along the TOP edge (the notification sheet's grabber). */
internal fun Modifier.topHairline(color: Color): Modifier = drawBehind {
    val stroke = 1.dp.toPx()
    drawRect(color = color, size = Size(size.width, stroke))
}

/** `border-bottom: 1px dashed`: the rule under the typography modal's
 *  live preview (globalCSS.js:4470-4476). */
internal fun Modifier.dashedUnderline(color: Color): Modifier = drawBehind {
    drawLine(
        color = color,
        start = Offset(0f, size.height),
        end = Offset(size.width, size.height),
        strokeWidth = 1.dp.toPx(),
        pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx())),
    )
}

internal fun Modifier.dashedBorder(color: Color, shape: Shape): Modifier = drawBehind {
    val stroke = Stroke(
        width = 1.dp.toPx(),
        pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx())),
    )
    val outline = shape.createOutline(size, layoutDirection, this)
    when (outline) {
        is Outline.Rounded -> drawPath(Path().apply { addRoundRect(outline.roundRect) }, color, style = stroke)
        is Outline.Generic -> drawPath(outline.path, color, style = stroke)
        is Outline.Rectangle -> drawRect(color, style = stroke)
    }
}

/**
 * ToolbarPopover (`DrawingToolbar.jsx:110-174`): a fixed-width card that
 * opens 10px under its button, centred on it, kept 8px from the screen
 * edges and flipped above when the bottom runs out. 16px radius, 12px of
 * padding, and no animation.
 */
@Composable
internal fun ToolbarPopover(
    width: Dp,
    dark: Boolean,
    onDismiss: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val density = LocalDensity.current
    val positionProvider = remember(density, width) {
        object : PopupPositionProvider {
            override fun calculatePosition(
                anchorBounds: IntRect,
                windowSize: IntSize,
                layoutDirection: LayoutDirection,
                popupContentSize: IntSize,
            ): IntOffset {
                val widthPx = with(density) { width.roundToPx() }
                val marginPx = with(density) { 8.dp.roundToPx() }
                val gapPx = with(density) { 10.dp.roundToPx() }
                val left = (anchorBounds.center.x - widthPx / 2)
                    .coerceIn(marginPx, (windowSize.width - widthPx - marginPx).coerceAtLeast(marginPx))
                val below = anchorBounds.bottom + gapPx
                val top = if (below + popupContentSize.height + marginPx > windowSize.height) {
                    (anchorBounds.top - gapPx - popupContentSize.height).coerceAtLeast(marginPx)
                } else {
                    below
                }
                return IntOffset(left, top)
            }
        }
    }
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(
            modifier = Modifier
                .width(width)
                .shadow(elevation = 24.dp, shape = RoundedCornerShape(16.dp))
                .clip(RoundedCornerShape(16.dp))
                .background(if (dark) Color(0xFA111827) else Color(0xFAFFFFFF))
                .border(
                    width = 1.dp,
                    color = if (dark) Color(0x80374151) else Color(0xCCF3F4F6),
                    shape = RoundedCornerShape(16.dp),
                )
                .padding(12.dp),
            content = content,
        )
    }
}

/** One entry of the note footer's kebab menu (`ModalFooter.jsx:700-807`):
 *  12/8px padding, an 8px gap, and the entry's own colour on the label
 *  as much as on the icon. */
@Composable
internal fun PopoverMenuItem(
    label: String,
    color: Color,
    enabled: Boolean = true,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else 0.5f)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        icon()
        Text(label, color = color, fontSize = 14.sp)
    }
}

@Composable
internal fun SettingsPopoverCard(dark: Boolean, borderColor: Color, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .widthIn(min = 160.dp)
            .shadow(elevation = 12.dp, shape = RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(if (dark) PopoverBgDark else Color.White)
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .padding(vertical = 6.dp),
        content = content,
    )
}
