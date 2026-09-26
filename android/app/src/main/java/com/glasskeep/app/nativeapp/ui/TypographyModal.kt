package com.glasskeep.app.nativeapp.ui

import android.app.AlertDialog
import android.view.ContextThemeWrapper
import android.widget.ArrayAdapter
import android.widget.ListView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.max
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.TypographyBlock
import com.glasskeep.app.nativeapp.data.TypographyPresets
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightTitleColor

/**
 * TypographyModal.jsx, ported: the full-screen editor for the three
 * typography profiles. One card per block style (paragraph, headings 1-5)
 * showing a live preview of that style over its four controls, and a
 * segmented tab row switching which profile is being edited.
 *
 * Full-screen on purpose, not a floating card: the web's own `max-width:
 * 560px` media query drops the radius and stretches it to 100dvh on a
 * phone, which is every screen this app runs on. A layer over the
 * settings rather than a dialog window: the WebView painted it under the
 * system bars, whose theme-coloured scrim stayed on top, undimmed.
 */
@Composable
fun TypographyModal(
    presets: TypographyPresets,
    themeId: String?,
    dark: Boolean,
    onChange: (TypographyPresets) -> Unit,
    onDismiss: () -> Unit,
) {
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val divider = if (dark) RtDividerDark else RtDividerLight
    val activeProfile = presets.activeProfile
    // `max(32px, safe-top + 12px)` above the title and `max(16px,
    // safe-bottom)` under the last card, both measured from the screen
    // edges, which this layer stops short of by the bars themselves.
    val density = LocalDensity.current
    val headerTop = max(32.dp - with(density) { WindowInsets.statusBars.getTop(this).toDp() }, 12.dp)
    val bodyBottom = (16.dp - with(density) { WindowInsets.navigationBars.getBottom(this).toDp() }).coerceAtLeast(0.dp)

    BackHandler(onBack = onDismiss)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.systemBars)
            .background(if (dark) Color(0xFF1F2937) else Color.White)
            .blockTouchesBelow(),
    ) {
        // Header: title, description, profile tabs, then the reset CTA
        // on its own row with the close button pinned to the corner
        // (the phone layout of .typo-modal-header).
        Box(Modifier.fillMaxWidth()) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 20.dp, end = 20.dp, top = headerTop, bottom = 14.dp),
            ) {
                Text(
                    stringResource(R.string.native_typography_title),
                    color = titleColor,
                    fontSize = 16.8.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    stringResource(R.string.native_typography_desc),
                    color = titleColor.copy(alpha = 0.7f),
                    fontSize = 13.6.sp,
                    lineHeight = 1.35.em,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Spacer(Modifier.height(12.dp))
                ProfileTabs(
                    active = presets.active,
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    divider = divider,
                    onSwitch = { key -> if (key != presets.active) onChange(presets.copy(active = key)) },
                )
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    GkGradientButton(
                        label = stringResource(R.string.native_typography_reset_active),
                        themeId = themeId,
                        onClick = {
                            onChange(presets.withProfile(presets.active, TypographyPresets.DEFAULT_PROFILE))
                        },
                    )
                }
            }
            val closeLabel = stringResource(R.string.native_common_close)
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = headerTop, end = 12.dp)
                    .size(32.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .semantics { contentDescription = closeLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onDismiss() },
                contentAlignment = Alignment.Center,
            ) {
                CloseIcon(size = 24.dp, tint = titleColor)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(divider))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = bodyBottom),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            for (key in TypographyPresets.BLOCK_KEYS) {
                TypographyBlockCard(
                    blockKey = key,
                    block = activeProfile.byKey(key),
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    divider = divider,
                    onUpdate = { updated ->
                        onChange(presets.withProfile(presets.active, activeProfile.withBlock(key, updated)))
                    },
                )
            }
        }
    }
}

/** `.typo-modal-profiles`: a 3px-padded pill holding the three tabs. */
@Composable
private fun ProfileTabs(
    active: String,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    divider: Color,
    onSwitch: (String) -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.05f))
            .border(1.dp, divider, RoundedCornerShape(8.dp))
            .padding(3.dp),
    ) {
        for ((index, key) in TypographyPresets.PROFILE_KEYS.withIndex()) {
            val selected = key == active
            val shape = RoundedCornerShape(6.dp)
            Box(
                modifier = Modifier
                    .then(
                        if (selected && !dark) {
                            Modifier.dropShadow(shape, Shadow(radius = 2.dp, color = Color(0x1F111827), offset = DpOffset(0.dp, 1.dp)))
                        } else {
                            Modifier
                        },
                    )
                    .clip(shape)
                    .background(
                        when {
                            !selected -> Color.Transparent
                            // The dark tab keeps the default indigo in every theme.
                            dark -> Indigo.copy(alpha = 0.22f)
                            else -> Color.White
                        },
                    )
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Tab,
                    ) { onSwitch(key) }
                    .padding(horizontal = 12.dp, vertical = 5.dp),
            ) {
                Text(
                    stringResource(
                        when (index) {
                            0 -> R.string.native_typography_profile_1
                            1 -> R.string.native_typography_profile_2
                            else -> R.string.native_typography_profile_3
                        },
                    ),
                    color = when {
                        !selected -> titleColor
                        dark -> Color(0xFFC4B5FD)
                        else -> WorkspaceTheme.rtAccent(themeId)
                    },
                    fontSize = 13.12.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                )
            }
        }
    }
}

/** `.typo-modal-card`: the live preview over the four controls. */
@Composable
private fun TypographyBlockCard(
    blockKey: String,
    block: TypographyBlock,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    divider: Color,
    onUpdate: (TypographyBlock) -> Unit,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (dark) Color.White.copy(alpha = 0.04f) else Color.Black.copy(alpha = 0.03f))
            .border(1.dp, divider, RoundedCornerShape(12.dp))
            .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 16.dp),
    ) {
        Text(
            stringResource(blockLabel(blockKey)),
            color = richColorOf(block.color, dark) ?: titleColor,
            fontSize = (block.size * 16f).sp,
            lineHeight = 1.2.em,
            fontWeight = FontWeight(block.weight),
            fontStyle = if (block.italic) FontStyle.Italic else FontStyle.Normal,
            textDecoration = if (block.underline) TextDecoration.Underline else TextDecoration.None,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .fillMaxWidth()
                .dashedUnderline(divider)
                // `padding: 2px 0 6px`, then the dashed border's own pixel.
                .padding(top = 2.dp, bottom = 7.dp),
        )
        Text(
            stringResource(R.string.native_typography_card_hint),
            color = titleColor.copy(alpha = 0.6f),
            fontSize = 11.52.sp,
            lineHeight = 1.3.em,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            val sizeLabels = TypographyPresets.SIZE_PRESETS.map(::sizeLabel)
            TypographyField(
                label = stringResource(R.string.native_typography_field_size),
                titleColor = titleColor,
                modifier = Modifier.weight(1f),
            ) {
                TypographySelect(
                    current = sizeLabel(block.size),
                    options = sizeLabels,
                    selected = TypographyPresets.SIZE_PRESETS.indexOf(block.size),
                    dark = dark,
                    titleColor = titleColor,
                    border = if (dark) FieldBorderDark else divider,
                    onPick = { onUpdate(block.copy(size = TypographyPresets.SIZE_PRESETS[it])) },
                )
            }
            val weightLabels = TypographyPresets.WEIGHT_PRESETS.map { stringResource(weightLabel(it)) }
            TypographyField(
                label = stringResource(R.string.native_typography_field_weight),
                titleColor = titleColor,
                modifier = Modifier.weight(1f),
            ) {
                TypographySelect(
                    current = stringResource(weightLabel(block.weight)),
                    options = weightLabels,
                    selected = TypographyPresets.WEIGHT_PRESETS.indexOf(block.weight),
                    dark = dark,
                    titleColor = titleColor,
                    border = if (dark) FieldBorderDark else divider,
                    onPick = { onUpdate(block.copy(weight = TypographyPresets.WEIGHT_PRESETS[it])) },
                )
            }
        }

        TypographyField(
            label = stringResource(R.string.native_typography_field_color),
            titleColor = titleColor,
            modifier = Modifier.fillMaxWidth(),
        ) {
            TypographyColorRow(
                current = block.color,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                divider = divider,
                onPick = { onUpdate(block.copy(color = it)) },
            )
        }

        TypographyField(
            label = stringResource(R.string.native_typography_field_style),
            titleColor = titleColor,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TypographyToggle(
                    label = stringResource(R.string.native_typography_field_italic),
                    active = block.italic,
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    divider = divider,
                    onClick = { onUpdate(block.copy(italic = !block.italic)) },
                ) { tint -> ItalicIcon(size = 18.dp, tint = tint) }
                TypographyToggle(
                    label = stringResource(R.string.native_typography_field_underline),
                    active = block.underline,
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    divider = divider,
                    onClick = { onUpdate(block.copy(underline = !block.underline)) },
                ) { tint -> UnderlineIcon(size = 18.dp, tint = tint) }
            }
        }
    }
}

/** `html.dark .typo-modal-field select` and `.typo-modal-toggle`: a
 *  border a shade stronger than the dark divider. */
private val FieldBorderDark = Color.White.copy(alpha = 0.12f)

/** `.typo-modal-field`: a small uppercase label over its control, the
 *  whole field, control included, at 75% opacity. */
@Composable
private fun TypographyField(
    label: String,
    titleColor: Color,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier = modifier.alpha(0.75f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            label.uppercase(),
            color = titleColor,
            fontSize = 11.2.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.03.em,
        )
        content()
    }
}

/** The card's `<select>`: a 30dp pill that opens what the WebView showed
 *  for one on a phone, the platform's own single-choice list. */
@Composable
private fun TypographySelect(
    current: String,
    options: List<String>,
    selected: Int,
    dark: Boolean,
    titleColor: Color,
    border: Color,
    onPick: (Int) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier
            .fillMaxWidth()
            .height(30.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(if (dark) Color.Black.copy(alpha = 0.35f) else Color.White.copy(alpha = 0.6f))
            .border(1.dp, border, RoundedCornerShape(6.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { open = true }
            .padding(horizontal = 8.dp),
    ) {
        Text(current, color = titleColor, fontSize = 13.6.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        ChevronDownIcon(size = 14.dp, tint = titleColor.copy(alpha = 0.7f))
    }
    if (open) {
        PlatformSelectDialog(
            options = options,
            selected = selected,
            onPick = onPick,
            onDismiss = { open = false },
        )
    }
}

/**
 * Chromium's SelectPopupDialog, the popup a `<select>` opened in the
 * WebView on a phone: a framework AlertDialog around a list of the
 * platform's single-choice rows, the current option checked, closing on
 * a pick. Built on the old APK's theme, AppCompat Light, which never had
 * a dark variant: that popup was always light.
 */
@Composable
private fun PlatformSelectDialog(
    options: List<String>,
    selected: Int,
    onPick: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val currentOnPick by rememberUpdatedState(onPick)
    val currentOnDismiss by rememberUpdatedState(onDismiss)
    DisposableEffect(context, options, selected) {
        val themed = ContextThemeWrapper(context, androidx.appcompat.R.style.Theme_AppCompat_Light_NoActionBar)
        val list = ListView(themed).apply {
            adapter = ArrayAdapter(themed, android.R.layout.select_dialog_singlechoice, options)
            choiceMode = ListView.CHOICE_MODE_SINGLE
            isFocusableInTouchMode = true
            if (selected >= 0) {
                setSelection(selected)
                setItemChecked(selected, true)
            }
        }
        val dialog = AlertDialog.Builder(themed).setView(list).create()
        list.setOnItemClickListener { _, _, position, _ ->
            currentOnPick(position)
            dialog.dismiss()
        }
        dialog.setOnDismissListener { currentOnDismiss() }
        dialog.show()
        onDispose {
            dialog.setOnDismissListener(null)
            dialog.dismiss()
        }
    }
}

/** `.typo-modal-colors`: "inherit", the nine presets, then the free-form
 *  picker the web gets from `<input type="color">`, all centred on the
 *  line the taller picker sets. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TypographyColorRow(
    current: String?,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    divider: Color,
    onPick: (String?) -> Unit,
) {
    var pickerOpen by remember { mutableStateOf(false) }
    val defaultLabel = stringResource(R.string.native_richtext_default)
    val customLabel = stringResource(R.string.native_typography_field_color)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        TypographySwatch(
            label = defaultLabel,
            fill = if (dark) Color.Black.copy(alpha = 0.35f) else Color.White,
            selected = current == null,
            themeId = themeId,
            dark = dark,
            onClick = { onPick(null) },
        ) {
            Canvas(Modifier.size(14.dp)) {
                drawLine(
                    color = if (dark) Color.White.copy(alpha = 0.5f) else Color.Black.copy(alpha = 0.4f),
                    start = Offset(size.width * 0.15f, size.height * 0.85f),
                    end = Offset(size.width * 0.85f, size.height * 0.15f),
                    strokeWidth = 1.4.dp.toPx(),
                    cap = StrokeCap.Round,
                )
            }
        }
        for (swatch in TypographyPresets.COLOR_PRESETS) {
            TypographySwatch(
                label = swatch,
                fill = richColorOf(swatch, dark) ?: Color.Transparent,
                selected = swatch == current,
                themeId = themeId,
                dark = dark,
                onClick = { onPick(swatch) },
            )
        }
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(
                    cssAngleGradient(
                        135f,
                        listOf(
                            Color(0xFFEF4444), Color(0xFFEAB308), Color(0xFF22C55E),
                            Color(0xFF0EA5E9), Color(0xFFA855F7),
                        ),
                    ),
                )
                .dashedBorder(divider, RoundedCornerShape(6.dp))
                .semantics { contentDescription = customLabel }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { pickerOpen = true },
        )
    }
    if (pickerOpen) {
        ColorPickerDialog(
            initial = current ?: "#111827",
            themeId = themeId,
            dark = dark,
            borderColor = divider,
            titleColor = titleColor,
            subtextColor = titleColor.copy(alpha = 0.7f),
            onDismiss = { pickerOpen = false },
            onConfirm = { onPick(it); pickerOpen = false },
        )
    }
}

/** `.typo-modal-color`: a 24dp swatch in a 1px frame; the current one
 *  wears a 2px accent ring outside it (a spread box-shadow), its frame
 *  turning transparent in light mode. */
@Composable
private fun TypographySwatch(
    label: String,
    fill: Color,
    selected: Boolean,
    themeId: String?,
    dark: Boolean,
    onClick: () -> Unit,
    content: @Composable () -> Unit = {},
) {
    val shape = RoundedCornerShape(5.dp)
    Box(
        modifier = Modifier
            .then(
                if (selected) {
                    Modifier.dropShadow(shape, Shadow(radius = 0.dp, spread = 2.dp, color = WorkspaceTheme.rtAccent(themeId).copy(alpha = 0.85f)))
                } else {
                    Modifier
                },
            )
            .size(24.dp)
            .clip(shape)
            .background(fill)
            .border(
                width = 1.dp,
                color = when {
                    dark -> Color.White.copy(alpha = 0.18f)
                    selected -> Color.Transparent
                    else -> Color.Black.copy(alpha = 0.15f)
                },
                shape = shape,
            )
            .semantics { contentDescription = label }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

/** `.typo-modal-toggle`: an icon and a label in a 30dp outlined pill. In
 *  dark mode `html.dark .typo-modal-toggle` outranks `.is-current`, so an
 *  active toggle keeps the idle fill and border and only takes the
 *  active text colour. */
@Composable
private fun TypographyToggle(
    label: String,
    active: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    divider: Color,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val tint = if (active) WorkspaceTheme.rtActiveText(themeId, dark) else titleColor
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .height(30.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(
                when {
                    dark -> Color.Black.copy(alpha = 0.35f)
                    active -> WorkspaceTheme.rtActiveBg(themeId, dark = false)
                    else -> Color.White.copy(alpha = 0.55f)
                },
            )
            .border(
                width = 1.dp,
                color = when {
                    dark -> FieldBorderDark
                    active -> WorkspaceTheme.rtAccent(themeId).copy(alpha = 0.45f)
                    else -> divider
                },
                shape = RoundedCornerShape(6.dp),
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 10.dp),
    ) {
        icon(tint)
        Text(label, color = tint, fontSize = 12.48.sp, fontWeight = FontWeight.Medium)
    }
}

/**
 * The free-form colour picker Android has no built-in equivalent of: a
 * saturation/value square over a hue rail, plus the hex the web's own
 * `<input type="color">` would have produced. Kept here rather than in
 * GkControls because this is the only place the web offers one.
 */
@Composable
private fun ColorPickerDialog(
    initial: String,
    themeId: String?,
    dark: Boolean,
    borderColor: Color,
    titleColor: Color,
    subtextColor: Color,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val startHsv = remember(initial) { hsvOf(richColorOf(initial, dark) ?: Color(0xFF111827)) }
    var hue by remember(initial) { mutableStateOf(startHsv[0]) }
    var saturation by remember(initial) { mutableStateOf(startHsv[1]) }
    var value by remember(initial) { mutableStateOf(startHsv[2]) }
    var hexText by remember(initial) { mutableStateOf(hexOf(colorOfHsv(startHsv[0], startHsv[1], startHsv[2]))) }
    val current = colorOfHsv(hue, saturation, value)

    fun updateFromWheel() {
        hexText = hexOf(colorOfHsv(hue, saturation, value))
    }

    GkDialog(onDismissRequest = onDismiss, dark = dark, borderColor = borderColor) {
        Text(
            stringResource(R.string.native_typography_custom_color),
            color = titleColor,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(14.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Brush.horizontalGradient(listOf(Color.White, Color.hsv(hue, 1f, 1f))))
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
                .pointerInput(hue) {
                    fun pick(offset: Offset) {
                        saturation = (offset.x / size.width).coerceIn(0f, 1f)
                        value = 1f - (offset.y / size.height).coerceIn(0f, 1f)
                        updateFromWheel()
                    }
                    detectTapGestures { pick(it) }
                }
                .pointerInput(hue) {
                    detectDragGestures { change, _ ->
                        change.consume()
                        saturation = (change.position.x / size.width).coerceIn(0f, 1f)
                        value = 1f - (change.position.y / size.height).coerceIn(0f, 1f)
                        updateFromWheel()
                    }
                },
        )
        Spacer(Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(24.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(
                    Brush.horizontalGradient(
                        (0..6).map { Color.hsv(it * 60f, 1f, 1f) },
                    ),
                )
                .pointerInput(Unit) {
                    fun pick(x: Float) {
                        hue = (x / size.width).coerceIn(0f, 1f) * 360f
                        updateFromWheel()
                    }
                    detectTapGestures { pick(it.x) }
                }
                .pointerInput(Unit) {
                    detectDragGestures { change, _ ->
                        change.consume()
                        hue = (change.position.x / size.width).coerceIn(0f, 1f) * 360f
                        updateFromWheel()
                    }
                },
        )
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(current)
                    .border(1.dp, if (dark) Color.White.copy(alpha = 0.18f) else Color.Black.copy(alpha = 0.15f), RoundedCornerShape(6.dp)),
            )
            BasicTextField(
                value = hexText,
                onValueChange = { raw ->
                    hexText = raw
                    val parsed = richColorOf(if (raw.startsWith("#")) raw else "#$raw", dark)
                    if (parsed != null) {
                        val hsv = hsvOf(parsed)
                        hue = hsv[0]
                        saturation = hsv[1]
                        value = hsv[2]
                    }
                },
                singleLine = true,
                textStyle = TextStyle(color = titleColor, fontSize = 14.sp),
                cursorBrush = SolidColor(Indigo),
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(6.dp))
                    .border(1.dp, if (dark) RtDividerDark else RtDividerLight, RoundedCornerShape(6.dp))
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            )
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            Spacer(Modifier.weight(1f))
            GkSecondaryButton(
                label = stringResource(R.string.native_note_detail_trash_confirm_cancel),
                borderColor = borderColor,
                textColor = subtextColor,
                onClick = onDismiss,
            )
            GkGradientButton(
                label = stringResource(R.string.native_richtext_link_apply),
                themeId = themeId,
                onClick = { onConfirm(hexOf(current)) },
            )
        }
    }
}

private fun hsvOf(color: Color): FloatArray {
    val hsv = FloatArray(3)
    android.graphics.Color.colorToHSV(color.toArgb(), hsv)
    return hsv
}

private fun colorOfHsv(hue: Float, saturation: Float, value: Float): Color =
    Color.hsv(hue.coerceIn(0f, 360f), saturation.coerceIn(0f, 1f), value.coerceIn(0f, 1f))

private fun hexOf(color: Color): String = String.format(
    "#%02x%02x%02x",
    (color.red * 255).toInt(),
    (color.green * 255).toInt(),
    (color.blue * 255).toInt(),
)

/** "1.75rem" is written "28" in the picker, the same px number the web's
 *  own TYPOGRAPHY_SIZE_PRESETS labels use. */
private fun sizeLabel(rem: Float): String = (rem * 16f).toInt().toString()

private fun blockLabel(key: String): Int = when (key) {
    "h1" -> R.string.native_typography_block_h1
    "h2" -> R.string.native_typography_block_h2
    "h3" -> R.string.native_typography_block_h3
    "h4" -> R.string.native_typography_block_h4
    "h5" -> R.string.native_typography_block_h5
    else -> R.string.native_typography_block_paragraph
}

private fun weightLabel(weight: Int): Int = when (weight) {
    500 -> R.string.native_typography_weight_medium
    600 -> R.string.native_typography_weight_semibold
    700 -> R.string.native_typography_weight_bold
    else -> R.string.native_typography_weight_normal
}
