package com.glasskeep.app.nativeapp.ui

import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.glasskeep.app.R
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sqrt

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

/** Tailwind's `animate-pulse`: opacity 1 → .5 → 1 every 2s on
 *  `cubic-bezier(0.4, 0, 0.6, 1)`. That curve is symmetric, so playing the
 *  first half back reproduces the second one exactly. */
@Composable
internal fun rememberPulseAlpha(): State<Float> = rememberInfiniteTransition(label = "pulse").animateFloat(
    initialValue = 1f,
    targetValue = 0.5f,
    animationSpec = infiniteRepeatable(
        animation = tween(durationMillis = 1_000, easing = CubicBezierEasing(0.4f, 0f, 0.6f, 1f)),
        repeatMode = RepeatMode.Reverse,
    ),
    label = "pulseAlpha",
)

/** `text-gray-500`, the sub-label colour, which the web keeps in both
 *  modes for these rows (no `dark:` variant on any of them). */
internal val SettingsSubtleColor = Color(0xFF6A7282)

// Tailwind v4 greys as the web renders them: gray-300/600 for a switch
// that is off, gray-200/600, white/gray-800 and gray-500/400 for a
// segmented control's frame, idle fill and idle label.
private val SwitchOffLight = Color(0xFFD1D5DC)
private val SwitchOffDark = Color(0xFF4A5565)
private val SegmentBorderLight = Color(0xFFE5E7EB)
private val SegmentBorderDark = Color(0xFF4A5565)
private val SegmentBgLight = Color(0xFFFFFFFF)
private val SegmentBgDark = Color(0xFF1E2939)
private val SegmentFgLight = Color(0xFF6A7282)
private val SegmentFgDark = Color(0xFF99A1AF)
private val PopoverBgDark = Color(0xFF222222)
private val PopoverTextLight = Color(0xFF1E2939)
private val PopoverTextDark = Color(0xFFF3F4F6)
private val DialogBgDark = Color(0xFF282828)

/** `red-600`, the one red the workspace themes never retint. */
internal val DangerRed = Color(0xFFE7000B)

/** What an `<input type="checkbox">` without `accent-color` fills with. */
internal val ChromiumCheckboxAccent = Color(0xFF0075FF)

private val ChromiumCheckboxBorder = Color(0xFF767676)
private val ChromiumCheckboxDisabledFill = Color(0xADF5F5F5)
private val ChromiumCheckboxDisabledBorder = Color(0x4D767676)
private val ChromiumCheckboxDisabledCheck = Color(0x99FFFFFF)
private val ChromiumCheckboxDarkCheck = Color(0xFF3B3B3B)

/**
 * The WebView's own `<input type="checkbox">`, which the web never
 * restyles beyond `accent-color`: white box in a 1px #767676 frame, the
 * accent fill and Chromium's check once checked, translucent greys when
 * disabled, identical in dark mode. Measured on the same engine, down to
 * the check path and the rule that draws the check white or dark,
 * whichever contrasts more with the accent. A null [onCheckedChange]
 * draws it without making it tappable.
 */
@Composable
internal fun GkCheckbox(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    accent: Color = ChromiumCheckboxAccent,
    size: Dp = 16.dp,
) {
    val toggle = if (onCheckedChange != null && enabled) {
        Modifier.toggleable(
            value = checked,
            role = Role.Checkbox,
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onValueChange = onCheckedChange,
        )
    } else {
        Modifier
    }
    Canvas(modifier.then(toggle).size(size)) {
        val radius = CornerRadius(2.dp.toPx())
        val border = 1.dp.toPx()
        val frameTopLeft = Offset(border / 2f, border / 2f)
        val frameSize = Size(this.size.width - border, this.size.height - border)
        val frameRadius = CornerRadius(radius.x - border / 2f)
        when {
            enabled && checked -> drawRoundRect(accent, cornerRadius = radius)
            enabled -> {
                drawRoundRect(Color.White, cornerRadius = radius)
                drawRoundRect(ChromiumCheckboxBorder, frameTopLeft, frameSize, frameRadius, Stroke(border))
            }
            checked -> {
                drawRoundRect(ChromiumCheckboxDisabledFill, cornerRadius = radius)
                drawRoundRect(ChromiumCheckboxDisabledBorder, cornerRadius = radius)
            }
            else -> {
                drawRoundRect(ChromiumCheckboxDisabledFill, cornerRadius = radius)
                drawRoundRect(ChromiumCheckboxDisabledBorder, frameTopLeft, frameSize, frameRadius, Stroke(border))
            }
        }
        if (checked) {
            val w = this.size.width
            val h = this.size.height
            val check = Path().apply {
                moveTo(w * 0.2f, h * 0.5f)
                lineTo(w * 0.4f, h * 0.7f)
                lineTo(w * 0.8f, h * 0.2f)
            }
            val checkColor = when {
                !enabled -> ChromiumCheckboxDisabledCheck
                contrastRatio(Color.White, accent) >= contrastRatio(ChromiumCheckboxDarkCheck, accent) -> Color.White
                else -> ChromiumCheckboxDarkCheck
            }
            drawPath(check, checkColor, style = Stroke(width = h * 0.16f, cap = StrokeCap.Butt, join = StrokeJoin.Miter))
        }
    }
}

/** WCAG contrast ratio, the measure Chromium uses to pick the check colour. */
private fun contrastRatio(a: Color, b: Color): Float {
    val la = a.luminance()
    val lb = b.luminance()
    return (maxOf(la, lb) + 0.05f) / (minOf(la, lb) + 0.05f)
}

/**
 * The 44x24 track / 16px knob switch used by every main settings row
 * (`SettingsPanel.jsx:388-397`). ON is the flat `--gk-switch-on` fill,
 * not the gradient: only the small switches inside the notification
 * sub-lists use a gradient.
 */
@Composable
internal fun GkSwitch(
    checked: Boolean,
    themeId: String?,
    dark: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
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
        modifier = modifier
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
 * (`SettingsPanel.jsx:865-887`). Its ON fill is the button gradient, not
 * the flat colour [GkSwitch] uses, and its knob carries Tailwind's
 * `shadow`. A disabled one is not dimmed by itself: its whole row is.
 */
@Composable
internal fun GkSmallSwitch(
    checked: Boolean,
    enabled: Boolean,
    themeId: String?,
    dark: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    val offColor = if (dark) SwitchOffDark else SwitchOffLight
    val knobOffset by animateDpAsState(
        targetValue = if (checked) 18.dp else 2.dp,
        animationSpec = tween(durationMillis = 150, easing = GkStandardEasing),
        label = "smallSwitchKnob",
    )
    Box(
        modifier = Modifier
            .width(36.dp)
            .height(20.dp)
            .clip(RoundedCornerShape(10.dp))
            .then(
                if (checked) {
                    Modifier.background(WorkspaceTheme.buttonGradient(themeId))
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
                .shadow(elevation = 1.dp, shape = CircleShape)
                .background(Color.White, CircleShape),
        )
    }
}

internal data class GkSegmentOption(val id: String, val label: String)

/**
 * The two-state segmented chip (`SettingsPanel.jsx:1196-1217` and its
 * siblings): 32px segments inside a rounded 8px frame whose 1px border
 * sits outside them, the selected one filled with the button gradient.
 * `btn-gradient` drops the shadow the Tailwind classes ask for, so on a
 * phone only the selected segment's press scale is left. The frame and
 * idle segment colours default to the common gray-200 / white / gray-500
 * set; the notification-position control passes its own.
 */
@Composable
internal fun GkSegmented(
    options: List<GkSegmentOption>,
    selectedId: String,
    themeId: String?,
    dark: Boolean,
    onSelect: (String) -> Unit,
    borderColor: Color = if (dark) SegmentBorderDark else SegmentBorderLight,
    idleBackground: Color = if (dark) SegmentBgDark else SegmentBgLight,
    idleTextColor: Color = if (dark) SegmentFgDark else SegmentFgLight,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(1.dp),
    ) {
        options.forEach { option ->
            val selected = option.id == selectedId
            val interactionSource = remember { MutableInteractionSource() }
            val pressed by interactionSource.collectIsPressedAsState()
            val scale by animateFloatAsState(
                targetValue = if (selected && pressed) 0.98f else 1f,
                animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
                label = "segmentScale",
            )
            val background = if (selected) {
                Modifier.background(WorkspaceTheme.buttonGradient(themeId))
            } else {
                Modifier.background(idleBackground)
            }
            Box(
                modifier = Modifier
                    .scale(scale)
                    .then(background)
                    .clickable(
                        interactionSource = interactionSource,
                        indication = null,
                        role = Role.RadioButton,
                    ) { if (!selected) onSelect(option.id) }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    option.label,
                    color = if (selected) Color.White else idleTextColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
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
 * grows over 300ms with no fade, uncovered from its top edge like the
 * web's grid-rows transition. The chevron keeps the text colour open or
 * closed: `.tabler-icon`'s unlayered `color: inherit` (globalCSS.js:3322)
 * beats both of its Tailwind colour classes. Every section starts
 * closed, as the web's empty `openSections` map does.
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
            ChevronDownIcon(modifier = Modifier.rotate(chevronRotation), size = 20.dp, tint = titleColor)
            Spacer(Modifier.width(12.dp))
            SettingsSectionIcon(themeId, dark, icon)
            Spacer(Modifier.width(12.dp))
            Text(title, color = titleColor, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(
                animationSpec = tween(durationMillis = 300, easing = GkEaseOut),
                expandFrom = Alignment.Top,
            ),
            exit = shrinkVertically(
                animationSpec = tween(durationMillis = 300, easing = GkEaseOut),
                shrinkTowards = Alignment.Top,
            ),
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
            color = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.6.sp,
        )
        Spacer(Modifier.width(8.dp))
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(if (dark) Color(0xFF4A5565).copy(alpha = 0.4f) else Color(0xFFD1D5DC).copy(alpha = 0.6f)),
        )
    }
}

/** A help link closing a settings row's description, in the accent and
 *  underlined, opened in the browser without triggering the row itself. */
internal data class SettingsInlineLink(val label: String, val url: String)

/**
 * The start of every settings row: the icon pill, then the 16px/500 title
 * over its 14px/20px grey description (`RowIcon` + `font-medium` +
 * `text-sm text-gray-500`). [footer] lands under the description, inside
 * the text column, as the QR card's shortcut control does on the web.
 */
@Composable
internal fun SettingsRowHeader(
    title: String,
    subtitle: String?,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    icon: @Composable (Color) -> Unit,
    modifier: Modifier = Modifier,
    subtitleColor: Color = SettingsSubtleColor,
    subtitleLink: SettingsInlineLink? = null,
    iconAlignment: Alignment.Vertical = Alignment.CenterVertically,
    footer: (@Composable () -> Unit)? = null,
) {
    Row(modifier = modifier, verticalAlignment = iconAlignment) {
        SettingsRowIcon(themeId, dark, icon)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = titleColor, fontSize = 16.sp, fontWeight = FontWeight.Medium)
            if (subtitle != null) {
                val accent = WorkspaceTheme.accent(themeId, dark)
                Text(
                    buildAnnotatedString {
                        append(subtitle)
                        if (subtitleLink != null) {
                            append(' ')
                            withLink(
                                LinkAnnotation.Url(
                                    subtitleLink.url,
                                    TextLinkStyles(SpanStyle(color = accent, textDecoration = TextDecoration.Underline)),
                                ),
                            ) { append(subtitleLink.label) }
                        }
                    },
                    color = subtitleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            }
            footer?.invoke()
        }
    }
}

/** The panel's plain preference row: [SettingsRowHeader] and a switch
 *  pinned to the right edge (`SettingsPanel.jsx:1067-1090` and every row
 *  shaped like it). On a phone that switch is `self-end`: it sits on the
 *  row's bottom edge while the header stays centred. */
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
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    switchAlignment: Alignment.Vertical = Alignment.Bottom,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingsRowHeader(
            title = title,
            subtitle = subtitle,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            icon = icon,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(12.dp))
        GkSwitch(
            checked = checked,
            themeId = themeId,
            dark = dark,
            onCheckedChange = onCheckedChange,
            modifier = Modifier.align(switchAlignment),
            enabled = enabled,
        )
    }
}

/** The 8px-radius, 1px `--border-light` frame of a settings card. */
internal fun Modifier.settingsCardBorder(color: Color): Modifier =
    clip(RoundedCornerShape(8.dp)).border(1.dp, color, RoundedCornerShape(8.dp))

/** The full-width bordered row card the panel uses for every action that
 *  opens something else (`SettingsPanel.jsx:400-412`). Like the CSS box,
 *  its 1px border adds to the 12px padding instead of eating into it. */
@Composable
internal fun SettingsCardButton(
    title: String,
    subtitle: String?,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    modifier: Modifier = Modifier,
    subtitleLink: SettingsInlineLink? = null,
    iconAlignment: Alignment.Vertical = Alignment.CenterVertically,
    footer: (@Composable () -> Unit)? = null,
    icon: @Composable (Color) -> Unit,
    onClick: () -> Unit,
) {
    SettingsRowHeader(
        title = title,
        subtitle = subtitle,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        icon = icon,
        subtitleLink = subtitleLink,
        iconAlignment = iconAlignment,
        footer = footer,
        modifier = modifier
            .fillMaxWidth()
            .settingsCardBorder(borderColor)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(13.dp),
    )
}

/**
 * The primary gradient button (`SettingsPanel.jsx:1543`, and every other
 * `btn-gradient` call site): `text-sm` 14px/20px/600 white on the button
 * gradient, 8px radius, no shadow at rest, `scale(0.98)` while pressed.
 * A dialog's buttons, which carry no `text-sm`, pass the 16px/24px body
 * size instead.
 */
@Composable
internal fun GkGradientButton(
    label: String,
    themeId: String?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    horizontalPadding: Dp = 16.dp,
    verticalPadding: Dp = 8.dp,
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = 20.sp,
    // Non-null only for the semantic variants that must not follow the
    // workspace accent (see GkConfirmVariant).
    gradient: Brush? = null,
    fontWeight: FontWeight = FontWeight.SemiBold,
    leading: (@Composable () -> Unit)? = null,
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
            .background(gradient ?: WorkspaceTheme.buttonGradient(themeId))
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
        if (leading != null) {
            leading()
            Spacer(Modifier.width(8.dp))
        }
        Text(
            label,
            color = Color.White,
            fontSize = fontSize,
            lineHeight = lineHeight,
            fontWeight = fontWeight,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (trailing != null) {
            Spacer(Modifier.width(8.dp))
            trailing()
        }
    }
}

/**
 * The `Popover` list the panel opens under its pickers (`Popover.jsx` +
 * `SettingsPanel.jsx:1535-1568`): no animation, a 12px card as wide as its
 * widest option (and at least [minWidth]), whose left edge follows the
 * button, kept 8px from the screen's right edge, 6px under the button or
 * flipped above it when the screen ends first.
 *
 * Placed inside the button's own Box: Compose hands the position provider
 * that Box's window bounds, what the web reads from `getBoundingClientRect()`.
 */
@Composable
internal fun SettingsPopover(
    dark: Boolean,
    borderColor: Color,
    minWidth: Dp,
    onDismiss: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val density = LocalDensity.current
    val positionProvider = remember(density) {
        object : PopupPositionProvider {
            override fun calculatePosition(
                anchorBounds: IntRect,
                windowSize: IntSize,
                layoutDirection: LayoutDirection,
                popupContentSize: IntSize,
            ): IntOffset {
                val marginPx = with(density) { 8.dp.roundToPx() }
                val gapPx = with(density) { 6.dp.roundToPx() }
                val left = if (anchorBounds.left + popupContentSize.width + marginPx > windowSize.width) {
                    (windowSize.width - popupContentSize.width - marginPx).coerceAtLeast(marginPx)
                } else {
                    anchorBounds.left
                }
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
                .width(IntrinsicSize.Max)
                .widthIn(min = minWidth)
                .shadow(elevation = 12.dp, shape = RoundedCornerShape(12.dp))
                .clip(RoundedCornerShape(12.dp))
                .background(if (dark) PopoverBgDark else Color.White)
                .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                .padding(vertical = 6.dp),
            content = content,
        )
    }
}

/** One option of a [SettingsPopover]: `text-gray-800`/`gray-100` 14px,
 *  or the accent at 600 over the soft accent fill, with a 20px check,
 *  when it is the current choice. */
@Composable
internal fun SettingsPopoverOption(
    label: String,
    selected: Boolean,
    themeId: String?,
    dark: Boolean,
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
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            label,
            color = when {
                selected -> accent
                dark -> PopoverTextDark
                else -> PopoverTextLight
            },
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            modifier = Modifier.weight(1f),
        )
        if (selected) TablerCheckIcon(size = 20.dp, tint = accent)
    }
}

/**
 * The panel's own dialog shell (`ChangePasswordModal.jsx:55-60`,
 * `PasskeySettingsSection.jsx:540-600`): a 90%-wide card capped at
 * 448px, 12px radius, 24px padding, over a flat `rgba(0,0,0,0.6)`
 * scrim, the platform's own dialog dim. No entrance animation, matching
 * the web's plain conditional render. The web also blurs the scrim by
 * 8px; a dialog window can't blur what is behind it here, so the scrim
 * stays flat. [scrimAlpha] replaces the dim for a web dialog drawn over
 * a lighter `bg-black/40`.
 */
@Composable
internal fun GkDialog(
    onDismissRequest: () -> Unit,
    dark: Boolean,
    borderColor: Color,
    dismissOnClickOutside: Boolean = true,
    maxWidth: Dp = 448.dp,
    background: Color = if (dark) DialogBgDark else Color.White,
    elevation: Dp = 24.dp,
    scrimAlpha: Float? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(
        onDismissRequest = onDismissRequest,
        properties = DialogProperties(
            dismissOnClickOutside = dismissOnClickOutside,
            usePlatformDefaultWidth = false,
        ),
    ) {
        if (scrimAlpha != null) {
            val window = (LocalView.current.parent as? DialogWindowProvider)?.window
            SideEffect {
                window?.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
                window?.setDimAmount(scrimAlpha)
            }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .widthIn(max = maxWidth)
                .shadow(elevation = elevation, shape = RoundedCornerShape(12.dp))
                .clip(RoundedCornerShape(12.dp))
                .background(background)
                .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                .padding(24.dp),
            content = content,
        )
    }
}

/**
 * What the WebView showed for the web's `alert()` (its import results and
 * failures, the secret-key confirmation): the message alone and an OK
 * button, in the app's own dialog shell.
 */
@Composable
internal fun GkAlertDialog(
    message: String,
    themeId: String?,
    dark: Boolean,
    borderColor: Color,
    textColor: Color,
    onDismiss: () -> Unit,
) {
    GkDialog(onDismissRequest = onDismiss, dark = dark, borderColor = borderColor, maxWidth = 384.dp) {
        Text(message, color = textColor)
        Spacer(Modifier.height(20.dp))
        GkGradientButton(
            label = stringResource(R.string.native_dialog_ok),
            themeId = themeId,
            fontSize = 16.sp,
            lineHeight = 24.sp,
            modifier = Modifier.align(Alignment.End),
            onClick = onDismiss,
        )
    }
}

/** GenericConfirmDialog.jsx's three button palettes: the brand gradient
 *  by default, flat red for a destructive action, an emerald gradient for
 *  a positive one. The two semantic variants deliberately ignore the
 *  workspace theme (the web marks them `gk-fixed-btn` for the same
 *  reason): a delete button stays red whatever the accent colour is. */
enum class GkConfirmVariant { DEFAULT, DANGER, SUCCESS }

/** GenericConfirmDialog.jsx's `from-indigo-500 to-violet-600` confirm
 *  button: the GlassKeep theme has no theme class on the web, so its
 *  `.btn-gradient` keeps these Tailwind v4 stops instead of the theme's
 *  own gradient tokens. */
private val ConfirmGradientGlassKeep = Brush.horizontalGradient(listOf(Color(0xFF615FFF), Color(0xFF7F22FE)))

/** `bg-black/40`, the scrim of the web's confirmation dialogs. */
internal const val ConfirmDialogDim = 0.4f

/**
 * GenericConfirmDialog.jsx: the one confirmation used all over the web app
 * (converting a note, resetting the note order, restarting the server).
 * Title 18sp semibold, message 14sp muted, then Cancel and the confirm
 * button right-aligned 20dp below, both at the body's 16px.
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
    GkDialog(
        onDismissRequest = onDismiss,
        dark = dark,
        borderColor = borderColor,
        maxWidth = 384.dp,
        scrimAlpha = ConfirmDialogDim,
    ) {
        Text(title, color = titleColor, fontSize = 18.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold)
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
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Normal,
                onClick = onDismiss,
            )
            when (variant) {
                GkConfirmVariant.DANGER -> GkDangerButton(
                    label = confirmLabel,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    onClick = { onDismiss(); onConfirm() },
                )
                GkConfirmVariant.SUCCESS -> GkGradientButton(
                    label = confirmLabel,
                    themeId = null,
                    gradient = Brush.horizontalGradient(listOf(Color(0xFF10B981), Color(0xFF16A34A))),
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    onClick = { onDismiss(); onConfirm() },
                )
                GkConfirmVariant.DEFAULT -> GkGradientButton(
                    label = confirmLabel,
                    themeId = themeId,
                    gradient = ConfirmGradientGlassKeep.takeIf {
                        WorkspaceTheme.forId(themeId).id == WorkspaceTheme.DEFAULT_ID
                    },
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    onClick = { onDismiss(); onConfirm() },
                )
            }
        }
    }
}

/** The bordered secondary button (Cancel, Test connection):
 *  `px-4 py-2 rounded-lg border border-[var(--border-light)]`. A dialog's
 *  Cancel, with no `text-sm font-semibold`, passes the 16px/24px normal
 *  weight body text instead of the 14px/20px/600 default. */
@Composable
internal fun GkSecondaryButton(
    label: String,
    borderColor: Color,
    textColor: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = 20.sp,
    fontWeight: FontWeight = FontWeight.SemiBold,
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
            .padding(1.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = textColor, fontSize = fontSize, lineHeight = lineHeight, fontWeight = fontWeight)
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
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = 20.sp,
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
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Color.White, fontSize = fontSize, lineHeight = lineHeight, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * The dialog text field (`ChangePasswordModal.jsx:78`): a transparent
 * `px-3 py-2` box inside a 1px `--border-light` edge, with a 2px
 * [focusRingColor] ring drawn outside that edge while focused (Tailwind's
 * `ring-2`, a box-shadow), and its label above it (14px/500, 4px gap).
 * The text is the page's 16px/24px unless the input is `text-sm`.
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
    focusRingColor: Color = WorkspaceTheme.accent(themeId, dark),
    focusRequester: FocusRequester? = null,
    fontSize: TextUnit = 16.sp,
    lineHeight: TextUnit = 24.sp,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    var focused by remember { mutableStateOf(false) }
    Column(modifier) {
        if (label != null) {
            Text(label, color = titleColor, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(4.dp))
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(color = titleColor, fontSize = fontSize, lineHeight = lineHeight),
            cursorBrush = SolidColor(WorkspaceTheme.accent(themeId, dark)),
            keyboardOptions = keyboardOptions,
            visualTransformation = visualTransformation,
            modifier = Modifier
                .fillMaxWidth()
                .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
                .onFocusChanged { focused = it.isFocused }
                .drawBehind {
                    if (focused) {
                        val ring = 2.dp.toPx()
                        drawRoundRect(
                            color = focusRingColor,
                            topLeft = Offset(-ring / 2f, -ring / 2f),
                            size = Size(size.width + ring, size.height + ring),
                            cornerRadius = CornerRadius(8.dp.toPx() + ring / 2f),
                            style = Stroke(ring),
                        )
                    }
                }
                .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                .padding(horizontal = 13.dp, vertical = 9.dp),
            decorationBox = { innerTextField ->
                if (value.isEmpty()) {
                    Text(
                        placeholder,
                        color = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
                        fontSize = fontSize,
                        lineHeight = lineHeight,
                    )
                }
                innerTextField()
            },
        )
    }
}

/** The anchor button's window bounds and the window's width, as the popup
 *  reports them: everything [FooterPopover] needs to place its panel. */
private data class FooterPopoverAnchor(val bounds: IntRect, val windowWidth: Int)

/** Where a footer popover's panel lands, in window pixels, once both its
 *  anchor and its own natural width are known. [arrowLeft] is the arrow
 *  square's CSS `left`, measured from the panel's padding edge. */
private data class FooterPopoverPlacement(
    val left: Int,
    val width: Int,
    val arrowLeft: Int,
    val squareBottomStart: Boolean,
    val squareBottomEnd: Boolean,
)

/** The corner radius the web drops to next to an arrow sitting close to
 *  the panel's edge (Popover.jsx:43-48, ColorPickerPanel.jsx:51-66). */
private val FooterPopoverArrowCorner = 4.dp

/**
 * The note footer's popovers (`Popover.jsx`, `ColorPickerPanel.jsx` and
 * `ModalFooter.jsx:379-417`): a card that opens upwards from the tapped
 * footer button, [gap] above it, kept 8px from the screen edges, with the
 * web's rotated-square arrow pointing back down at the button. None of
 * them animates: the web only reveals them once they are positioned.
 *
 * [width] fixes the card's width. Without it the card follows Popover.jsx:
 * measured where the button starts ([minWidth] at least), shifted left
 * when it overflows the screen, then re-flowed in the room left there.
 * [arrowEndInset] is the distance from the right edge under which the
 * arrow squares that bottom corner (32px in Popover.jsx, 36px in the
 * colour panel).
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
    // Was 24.dp: much heavier than every other popover shadow in the app
    // (SettingsPopover uses 12.dp) and, being inside a Popup with no
    // buffer around it (see shadowPad below), had nowhere to blur into -
    // together that read as one big, hard-edged, overly dark halo.
    elevation: Dp = 12.dp,
    // The arrow's two outer edges are always drawn in `--border-light`,
    // whatever border the card itself has.
    arrowBorderColor: Color = borderColor,
    arrowEndInset: Dp = 32.dp,
    // Tailwind's `ring-1`: a hairline just outside the card's border.
    ringColor: Color? = null,
    // Opens under the anchor with the arrow on top, for anchors near the
    // top of the screen (the selection dock).
    below: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val density = LocalDensity.current
    // Compose's Popup sizes its window tightly around its content, with no
    // allowance for a shadow's blur to bleed past that content's own laid
    // out bounds - so Modifier.shadow() inside a Popup, unlike inside a
    // normal layout, gets a hard, uneven cut wherever the blur would have
    // extended past the window edge. Padding the whole popup content by
    // more than the blur (or the arrow) can reach reserves that room; the
    // position math below shifts the window itself back by the same
    // amount so the visible panel still lands exactly where it should.
    val shadowPad = 16.dp
    var anchor by remember { mutableStateOf<FooterPopoverAnchor?>(null) }
    var placement by remember { mutableStateOf<FooterPopoverPlacement?>(null) }
    val positionProvider = remember(density, gap, placement, below) {
        object : PopupPositionProvider {
            override fun calculatePosition(
                anchorBounds: IntRect,
                windowSize: IntSize,
                layoutDirection: LayoutDirection,
                popupContentSize: IntSize,
            ): IntOffset {
                anchor = FooterPopoverAnchor(anchorBounds, windowSize.width)
                val shadowPadPx = with(density) { shadowPad.roundToPx() }
                val gapPx = with(density) { gap.roundToPx() }
                return IntOffset(
                    (placement?.left ?: anchorBounds.left) - shadowPadPx,
                    if (below) anchorBounds.bottom + gapPx - shadowPadPx
                    else anchorBounds.top - gapPx - popupContentSize.height + shadowPadPx,
                )
            }
        }
    }
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        val placed = placement
        val arrowStart = if (placed?.squareBottomStart == true) FooterPopoverArrowCorner else cornerRadius
        val arrowEnd = if (placed?.squareBottomEnd == true) FooterPopoverArrowCorner else cornerRadius
        val shape = if (below) {
            RoundedCornerShape(topStart = arrowStart, topEnd = arrowEnd, bottomEnd = cornerRadius, bottomStart = cornerRadius)
        } else {
            RoundedCornerShape(topStart = cornerRadius, topEnd = cornerRadius, bottomEnd = arrowEnd, bottomStart = arrowStart)
        }
        Box(
            Modifier
                .padding(shadowPad)
                .layout { measurable, constraints ->
                    val fixedWidth = width?.roundToPx()
                    val minWidthPx = minWidth.roundToPx()
                    val natural = if (fixedWidth == null) measurable.maxIntrinsicWidth(constraints.maxHeight) else 0
                    val current = anchor
                    val panelWidth = if (current == null) {
                        fixedWidth ?: maxOf(minWidthPx, minOf(natural, constraints.maxWidth))
                    } else {
                        val margin = 8.dp.roundToPx()
                        val windowWidth = current.windowWidth
                        val anchorLeft = current.bounds.left
                        val firstWidth = fixedWidth ?: maxOf(minWidthPx, minOf(natural, windowWidth - anchorLeft))
                        val left = (
                            if (anchorLeft + firstWidth + margin > windowWidth) windowWidth - firstWidth - margin
                            else anchorLeft
                            ).coerceAtLeast(margin)
                        val finalWidth = fixedWidth ?: maxOf(minWidthPx, minOf(natural, windowWidth - left))
                        val arrowLeft = current.bounds.center.x - left - 6.dp.roundToPx()
                        val next = FooterPopoverPlacement(
                            left = left,
                            width = finalWidth,
                            arrowLeft = arrowLeft,
                            squareBottomStart = arrowLeft < 20.dp.roundToPx(),
                            squareBottomEnd = arrowLeft > firstWidth - arrowEndInset.roundToPx(),
                        )
                        if (next != placement) placement = next
                        finalWidth
                    }
                    val clamped = panelWidth.coerceAtMost(constraints.maxWidth)
                    val placeable = measurable.measure(constraints.copy(minWidth = clamped, maxWidth = clamped))
                    layout(placeable.width, placeable.height) { placeable.place(0, 0) }
                }
                .drawWithContent {
                    if (placed == null) return@drawWithContent
                    drawContent()
                    drawFooterPopoverArrow(placed.arrowLeft, background, arrowBorderColor, pointsUp = below)
                },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(elevation = elevation, shape = shape)
                    .then(if (ringColor != null) Modifier.outsideRing(ringColor, shape) else Modifier)
                    .clip(shape)
                    .background(background)
                    .border(1.dp, borderColor, shape),
                content = content,
            )
        }
    }
}

/**
 * The `[data-arrow="down"]::after` square (globalCSS.js:2587-2607): 12px,
 * border-box, rotated 45deg, filled with the card's own colour and edged
 * on its two outer sides, its bottom 6px under the card's padding edge.
 * Drawn over the card, so it covers the card's own border where they
 * meet, exactly as the pseudo-element does.
 */
private fun DrawScope.drawFooterPopoverArrow(arrowLeft: Int, fill: Color, edge: Color, pointsUp: Boolean) {
    val border = 1.dp.toPx()
    val side = 12.dp.toPx()
    val top = if (pointsUp) border - 6.dp.toPx() else size.height - border + 6.dp.toPx() - side
    val topLeft = Offset(border + arrowLeft, top)
    rotate(45f, pivot = Offset(topLeft.x + side / 2f, topLeft.y + side / 2f)) {
        drawRect(fill, topLeft, Size(side, side))
        if (pointsUp) {
            drawRect(edge, topLeft, Size(border, side))
            drawRect(edge, topLeft, Size(side, border))
        } else {
            drawRect(edge, Offset(topLeft.x + side - border, topLeft.y), Size(border, side))
            drawRect(edge, Offset(topLeft.x, topLeft.y + side - border), Size(side, border))
        }
    }
}

/** Tailwind's `ring-1` (`box-shadow: 0 0 0 1px`): a 1px band hugging the
 *  outside of [shape]. Placed before any clip so it is not cut away. */
private fun Modifier.outsideRing(color: Color, shape: Shape): Modifier = drawBehind {
    val ring = 1.dp.toPx()
    val outline = shape.createOutline(Size(size.width + ring, size.height + ring), layoutDirection, this)
    translate(-ring / 2f, -ring / 2f) {
        drawOutline(outline, color, style = Stroke(width = ring))
    }
}

/** Standard normal CDF, through Abramowitz and Stegun's 7.1.26 erf: the
 *  profile of a CSS box-shadow edge, whose blur is a Gaussian with a
 *  standard deviation of half the blur radius. */
internal fun gaussianCdf(x: Float): Float {
    val z = abs(x) / sqrt(2f)
    val t = 1f / (1f + 0.3275911f * z)
    val erf = 1f - ((((1.0614054f * t - 1.4531521f) * t + 1.4214137f) * t - 0.28449672f) * t + 0.2548296f) * t * exp(-z * z)
    return if (x >= 0f) 0.5f * (1f + erf) else 0.5f * (1f - erf)
}

/** The web's capturing outside-pointerdown on its top sheets: any touch
 *  here closes the sheet and the whole gesture is swallowed, so nothing
 *  underneath is activated. Put it behind the sheet itself. */
internal fun Modifier.dismissOnOutsideTouch(onDismiss: () -> Unit): Modifier = pointerInput(onDismiss) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false).consume()
        onDismiss()
        do {
            val event = awaitPointerEvent()
            event.changes.forEach { it.consume() }
        } while (event.changes.any { it.pressed })
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

/** One entry of the note footer's kebab menu (`ModalFooter.jsx:700-815`)
 *  and of the image sub-menu (AddImageMenu.jsx): `px-3 py-2 text-sm
 *  gap-2`, the label wrapping when the card is too narrow for it. */
@Composable
internal fun PopoverMenuItem(
    label: String,
    color: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    Row(
        modifier = modifier
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
        Text(label, color = color, fontSize = 14.sp, lineHeight = 20.sp)
    }
}
