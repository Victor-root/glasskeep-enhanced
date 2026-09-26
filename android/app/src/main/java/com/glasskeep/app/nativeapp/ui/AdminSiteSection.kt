package com.glasskeep.app.nativeapp.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitHorizontalTouchSlopOrCancellation
import androidx.compose.foundation.gestures.horizontalDrag
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.BrandingImages
import com.glasskeep.app.nativeapp.ImageCompression
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.AdminBackgroundPatch
import com.glasskeep.app.nativeapp.data.network.AdminLogoPatch
import com.glasskeep.app.nativeapp.data.network.AdminSettingsPatch
import com.glasskeep.app.ui.DefaultBackdropPreview
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/**
 * The "Login page settings" section (AdminPanel.jsx:620-684): account
 * creation, the sign-in slogan and the passkey domain 16dp apart, then,
 * past a hairline, LoginBrandingSection.jsx's theme, name, logo,
 * background and blur rows 24dp apart. [highlightDomain] is the arrival
 * from the settings' passkey notice: the domain row is brought to the
 * middle of the panel and pulses three times.
 */
@Composable
internal fun AdminSiteSection(
    state: AdminPanelState,
    container: NativeAppContainer,
    expanded: Boolean,
    onToggle: () -> Unit,
    highlightDomain: Boolean,
    scrollState: ScrollState,
    content: CoordinatesHolder,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val scope = rememberCoroutineScope()
    val settings = state.settings
    SettingsAccordionSection(
        title = stringResource(R.string.native_admin_site_settings),
        expanded = expanded,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        icon = { tint -> HomeLockIcon(size = 20.dp, tint = tint) },
        onToggle = onToggle,
        contentSpacing = 16.dp,
    ) {
        SettingsSwitchRow(
            title = stringResource(R.string.native_admin_allow_new_accounts),
            subtitle = stringResource(R.string.native_admin_allow_new_accounts_desc),
            checked = settings.allowNewAccounts,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            icon = { tint -> UserPlusIcon(size = 20.dp, tint = tint) },
            onCheckedChange = {
                scope.launch {
                    state.updateSettings { patchAdminSettings(AdminSettingsPatch(allowNewAccounts = !settings.allowNewAccounts)) }
                }
            },
            switchAlignment = Alignment.CenterVertically,
        )
        SloganRow(state, themeId, dark, titleColor, borderColor)
        PasskeyDomainRow(state, highlightDomain, scrollState, content, themeId, dark, titleColor, borderColor)
        Column(
            modifier = Modifier.fillMaxWidth().topHairline(borderColor).padding(top = 9.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            LoginBranding(state, container, themeId, dark, titleColor, borderColor)
        }
    }
}

/** LoginSloganRow: the admin's own line under the sign-in title. */
@Composable
private fun SloganRow(state: AdminPanelState, themeId: String?, dark: Boolean, titleColor: Color, borderColor: Color) {
    val value = state.settings.loginSlogan
    var draft by remember(value) { mutableStateOf(value) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SettingsRowHeader(
            title = stringResource(R.string.native_admin_login_slogan_label),
            subtitle = stringResource(R.string.native_login_slogan),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            icon = { tint -> QuoteIcon(size = 20.dp, tint = tint) },
        )
        SaveableField(
            draft = draft,
            onDraftChange = { draft = it.take(200) },
            placeholder = stringResource(R.string.native_admin_login_slogan_placeholder),
            dirty = draft != value,
            idleLabel = stringResource(R.string.native_admin_save),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            onSave = { state.updateSettings { patchAdminSettings(AdminSettingsPatch(loginSlogan = draft)) } != null },
        )
    }
}

/**
 * PasskeyDomainRow: where the domain in force comes from, and, unless an
 * environment variable or the certificate settles it, the field to state
 * it once, with its "Confirm" while nothing is declared yet and the
 * warning that changing it strands the existing passkeys once it is.
 */
@Composable
private fun PasskeyDomainRow(
    state: AdminPanelState,
    highlight: Boolean,
    scrollState: ScrollState,
    content: CoordinatesHolder,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val domain = state.settings.passkeyDomainState
    val undecided = domain.source == "none"
    val readOnly = domain.lockedByEnv || domain.source == "certificate"
    val wanted = domain.declared.ifEmpty { if (undecided) domain.suggested else "" }
    var draft by remember(domain.declared, domain.suggested, undecided) { mutableStateOf(wanted) }
    val origin = when (domain.source) {
        "configured" -> R.string.native_admin_passkey_domain_from_env
        "admin" -> R.string.native_admin_passkey_domain_from_panel
        "certificate" -> R.string.native_admin_passkey_domain_from_certificate
        "local-request" -> R.string.native_admin_passkey_domain_from_local
        else -> null
    }

    val row = remember { CoordinatesHolder() }
    val pulse = remember { Animatable(0f) }
    LaunchedEffect(highlight) {
        if (!highlight) return@LaunchedEffect
        launch {
            // gk-attention-pulse: three 1.15s ease-in-out swells.
            repeat(3) {
                pulse.animateTo(1f, tween(durationMillis = 575, easing = CssEaseInOut))
                pulse.animateTo(0f, tween(durationMillis = 575, easing = CssEaseInOut))
            }
        }
        // scrollIntoView({ block: "center" }), once the section has unfolded.
        delay(300)
        val rowCoordinates = row.value?.takeIf { it.isAttached }
        val contentCoordinates = content.value?.takeIf { it.isAttached }
        if (rowCoordinates != null && contentCoordinates != null) {
            val top = contentCoordinates.localPositionOf(rowCoordinates, Offset.Zero).y
            val target = top + rowCoordinates.size.height / 2f - scrollState.viewportSize / 2f
            scrollState.animateScrollTo(target.roundToInt().coerceIn(0, scrollState.maxValue))
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .onGloballyPositioned { row.value = it }
            .drawBehind {
                val amount = pulse.value
                if (amount > 0f) {
                    val radius = 12.dp.toPx()
                    val ring = 2.dp.toPx()
                    drawRoundRect(AttentionIndigo.copy(alpha = 0.12f * amount), cornerRadius = CornerRadius(radius))
                    drawRoundRect(
                        color = AttentionIndigo.copy(alpha = 0.38f * amount),
                        topLeft = Offset(ring / 2f, ring / 2f),
                        size = Size(size.width - ring, size.height - ring),
                        cornerRadius = CornerRadius(radius - ring / 2f),
                        style = Stroke(ring),
                    )
                }
            }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SettingsRowHeader(
            title = stringResource(R.string.native_admin_passkey_domain_label),
            subtitle = stringResource(R.string.native_admin_passkey_domain_desc),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            icon = { tint -> TablerKeyIcon(size = 20.dp, tint = tint) },
        )
        if (origin != null) {
            val originText = stringResource(origin)
            Text(
                buildAnnotatedString {
                    append(originText)
                    if (domain.effective.isNotEmpty()) {
                        append(' ')
                        withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(domain.effective) }
                    }
                },
                color = SettingsSubtleColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
        if (!readOnly) {
            SaveableField(
                draft = draft,
                onDraftChange = { draft = it.take(253) },
                placeholder = domain.suggested.ifEmpty { stringResource(R.string.native_admin_passkey_domain_placeholder) },
                dirty = draft.trim().lowercase() != domain.declared,
                // Nothing declared yet: the field shows a suggestion, which
                // the admin confirms rather than saves.
                idleLabel = stringResource(if (undecided) R.string.native_admin_passkey_domain_confirm else R.string.native_admin_save),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                fontFamily = FontFamily.Monospace,
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                onSave = {
                    state.updateSettings { patchAdminSettings(AdminSettingsPatch(passkeyDomain = draft.trim().lowercase())) } != null
                },
            )
            if (domain.declared.isNotEmpty()) {
                Text(
                    stringResource(R.string.native_admin_passkey_domain_change_warning),
                    color = SettingsSubtleColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
            }
        }
    }
}

/** `gk-attention`'s rgba(99, 102, 241). */
private val AttentionIndigo = Color(0xFF6366F1)

/**
 * The draft field these rows edit and its own save button under it: the
 * button waits for a change, reads "Saving..." while the request runs and
 * "Saved" for 1.5s once [onSave] reports it stored, with the success
 * toast; the field is locked meanwhile, and the keyboard's action saves.
 */
@Composable
private fun SaveableField(
    draft: String,
    onDraftChange: (String) -> Unit,
    placeholder: String,
    dirty: Boolean,
    idleLabel: String,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onSave: suspend () -> Boolean,
    fontFamily: FontFamily? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
) {
    val toasts = LocalGkToasts.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var savedFlash by remember { mutableStateOf(false) }
    fun save() {
        if (!dirty || busy) return
        busy = true
        scope.launch {
            val stored = try {
                onSave()
            } finally {
                busy = false
            }
            if (stored) {
                toasts.success(context.getString(R.string.native_admin_saved))
                savedFlash = true
                delay(1_500)
                savedFlash = false
            }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        GkTextField(
            value = draft,
            onValueChange = onDraftChange,
            label = null,
            placeholder = placeholder,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            keyboardOptions = keyboardOptions,
            keyboardActions = KeyboardActions(onDone = { save() }),
            fontFamily = fontFamily,
            enabled = !busy,
        )
        GkGradientButton(
            label = when {
                busy -> stringResource(R.string.native_admin_saving_dots)
                savedFlash -> stringResource(R.string.native_admin_saved)
                else -> idleLabel
            },
            themeId = themeId,
            modifier = Modifier.fillMaxWidth(),
            enabled = dirty && !busy,
            onClick = { save() },
        )
    }
}

/** Which of the branding rows has a request running (LoginBrandingSection's
 *  busyField): its own buttons wait, and the blur is not saved meanwhile. */
private enum class BrandingField { LOGO, BACKGROUND, BLUR }

/** LoginBrandingSection.jsx's rows. */
@Composable
private fun LoginBranding(
    state: AdminPanelState,
    container: NativeAppContainer,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val scope = rememberCoroutineScope()
    val settings = state.settings
    var busyField by remember { mutableStateOf<BrandingField?>(null) }

    /** handlePick(): only PNG, JPEG or WebP, compressed like the web, held
     *  to the server's cap, and sent with its derived square icon or
     *  placeholders. */
    fun pick(uri: Uri, field: BrandingField) {
        val type = context.contentResolver.getType(uri)
        if (type != null && type !in BrandingImageTypes) {
            toasts.error(context.getString(R.string.native_admin_branding_invalid_format))
            return
        }
        val logo = field == BrandingField.LOGO
        busyField = field
        scope.launch {
            try {
                val dataUrl = withContext(Dispatchers.Default) {
                    if (logo) {
                        ImageCompression.compressToDataUrl(context, uri, 512, 92)
                    } else {
                        ImageCompression.compressToDataUrl(context, uri, 2560, 82)
                    }
                } ?: error("Unreadable image")
                if (dataUrl.length > if (logo) MaxLogoLength else MaxBackgroundLength) {
                    toasts.error(context.getString(R.string.native_admin_branding_too_large))
                    return@launch
                }
                val stored = if (logo) {
                    val icon = withContext(Dispatchers.Default) { BrandingImages.squarePngIcon(dataUrl) } ?: error("Unreadable logo")
                    state.updateSettings { patchAdminLogo(AdminLogoPatch(dataUrl, icon)) }
                } else {
                    val placeholders = withContext(Dispatchers.Default) { BrandingImages.backgroundPlaceholders(dataUrl) }
                    state.updateSettings {
                        patchAdminBackground(AdminBackgroundPatch(dataUrl, placeholders?.first, placeholders?.second))
                    }
                }
                if (stored != null) {
                    toasts.success(
                        context.getString(if (logo) R.string.native_admin_logo_updated else R.string.native_admin_background_updated),
                        icon = "camera",
                    )
                }
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Branding upload failed", t)
                toasts.error(context.getString(R.string.native_admin_upload_failed))
            } finally {
                busyField = null
            }
        }
    }

    fun remove(field: BrandingField) {
        val logo = field == BrandingField.LOGO
        busyField = field
        scope.launch {
            val stored = try {
                state.updateSettings {
                    if (logo) patchAdminLogo(AdminLogoPatch(null)) else patchAdminBackground(AdminBackgroundPatch(null))
                }
            } finally {
                busyField = null
            }
            if (stored != null) {
                toasts.show(
                    context.getString(if (logo) R.string.native_admin_logo_removed else R.string.native_admin_background_removed),
                    icon = "trash",
                )
            }
        }
    }

    val logoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) pick(uri, BrandingField.LOGO)
    }
    val backgroundPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) pick(uri, BrandingField.BACKGROUND)
    }
    val appName = settings.appName.ifEmpty { stringResource(R.string.native_default_app_name) }

    BrandingRow(R.string.native_admin_login_page_theme, R.string.native_admin_login_page_theme_desc, themeId, dark, titleColor, { tint ->
        PaintIcon(size = 20.dp, tint = tint)
    }) {
        ThemeGrid(
            currentThemeId = settings.loginTheme,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            accent = WorkspaceTheme.accent(themeId, dark),
            onSelect = { id ->
                if (id != settings.loginTheme) {
                    scope.launch {
                        if (state.updateSettings { patchAdminSettings(AdminSettingsPatch(loginTheme = id)) } != null) {
                            toasts.success(context.getString(R.string.native_admin_saved))
                        }
                    }
                }
            },
        )
    }
    AppNameRow(state, themeId, dark, titleColor, borderColor)
    BrandingRow(R.string.native_admin_custom_logo, R.string.native_admin_custom_logo_desc, themeId, dark, titleColor, { tint ->
        PhotoHexagonIcon(size = 20.dp, tint = tint)
    }) {
        BrandingHint(R.string.native_admin_custom_logo_recommend, dark)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            LogoPreview(settings.logo, Color.White, R.string.native_admin_light_mode, borderColor, dark, Modifier.weight(1f))
            LogoPreview(settings.logo, Color(0xFF222222), R.string.native_admin_dark_mode, borderColor, dark, Modifier.weight(1f))
        }
        ImageButtons(
            hasImage = settings.logo != null,
            busy = busyField == BrandingField.LOGO,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            onUpload = { logoPicker.launch("image/*") },
            onRemove = { remove(BrandingField.LOGO) },
        )
    }
    val persistedBlur = settings.loginBackgroundBlur
    var blur by remember(persistedBlur) { mutableIntStateOf(persistedBlur) }
    BrandingRow(R.string.native_admin_login_background_image, R.string.native_admin_login_background_desc, themeId, dark, titleColor, { tint ->
        BackgroundIcon(size = 20.dp, tint = tint)
    }) {
        BrandingHint(R.string.native_admin_login_background_recommend, dark)
        BackgroundPreview(container, settings.loginBackground, settings.logo, appName, blur, dark, titleColor, borderColor)
        ImageButtons(
            hasImage = settings.loginBackground != null,
            busy = busyField == BrandingField.BACKGROUND,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            onUpload = { backgroundPicker.launch("image/*") },
            onRemove = { remove(BrandingField.BACKGROUND) },
        )
    }
    BlurRow(
        blur = blur,
        onBlurChange = { blur = it },
        onRelease = {
            if (blur != persistedBlur && busyField == null) {
                busyField = BrandingField.BLUR
                scope.launch {
                    try {
                        state.updateSettings { patchAdminSettings(AdminSettingsPatch(loginBackgroundBlur = blur)) }
                    } finally {
                        busyField = null
                    }
                }
            }
        },
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
    )
}

private val BrandingImageTypes = setOf("image/png", "image/jpeg", "image/webp")

/** The server's caps on the data URL: 2 MB for the logo, 4 MB for the
 *  background. */
private const val MaxLogoLength = 2 * 1024 * 1024
private const val MaxBackgroundLength = 4 * 1024 * 1024

/** A branding row: its header, then its own controls 12dp apart. */
@Composable
private fun BrandingRow(
    @StringRes title: Int,
    @StringRes subtitle: Int,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    icon: @Composable (Color) -> Unit,
    content: @Composable () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SettingsRowHeader(
            title = stringResource(title),
            subtitle = stringResource(subtitle),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            icon = icon,
        )
        content()
    }
}

/** The rows' 12px `text-gray-400 dark:text-gray-500` notes. */
@Composable
private fun BrandingHint(@StringRes text: Int, dark: Boolean) {
    Text(
        stringResource(text),
        color = brandingHintColor(dark),
        fontSize = 12.sp,
        lineHeight = 16.sp,
    )
}

private fun brandingHintColor(dark: Boolean): Color = if (dark) Color(0xFF6A7282) else Color(0xFF99A1AF)

/** AppNameRow: the name shown instead of "Glass Keep", ten characters at
 *  most. */
@Composable
private fun AppNameRow(state: AdminPanelState, themeId: String?, dark: Boolean, titleColor: Color, borderColor: Color) {
    val value = state.settings.appName
    var draft by remember(value) { mutableStateOf(value) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SettingsRowHeader(
            title = stringResource(R.string.native_admin_custom_app_name),
            subtitle = stringResource(R.string.native_admin_custom_app_name_desc),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            icon = { tint -> SignatureIcon(size = 20.dp, tint = tint) },
        )
        SaveableField(
            draft = draft,
            onDraftChange = { draft = it.take(10) },
            placeholder = stringResource(R.string.native_default_app_name),
            dirty = draft != value,
            idleLabel = stringResource(R.string.native_admin_save),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            onSave = { state.updateSettings { patchAdminSettings(AdminSettingsPatch(appName = draft.trim())) } != null },
        )
        BrandingHint(R.string.native_admin_branding_reset_hint, dark)
    }
}

/** One of the logo's two legibility previews: the logo, or the app's own
 *  icon, on a white or a #222 tile, captioned. */
@Composable
private fun LogoPreview(
    logo: String?,
    tile: Color,
    @StringRes caption: Int,
    borderColor: Color,
    dark: Boolean,
    modifier: Modifier,
) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp)
                .background(tile, RoundedCornerShape(8.dp))
                .border(1.dp, borderColor, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            BrandingLogo(logo, 48.dp, 12.dp)
        }
        Text(stringResource(caption), color = brandingHintColor(dark), fontSize = 12.sp, lineHeight = 16.sp)
    }
}

/** `<img src={logo || "/pwa-192.png"} class="object-contain rounded-…">`. */
@Composable
private fun BrandingLogo(logo: String?, size: Dp, radius: Dp) {
    val bitmap = logo?.let { rememberDecodedImage(it) }
    val modifier = Modifier.size(size).clip(RoundedCornerShape(radius))
    if (bitmap != null) {
        Image(bitmap = bitmap, contentDescription = null, contentScale = ContentScale.Fit, modifier = modifier)
    } else {
        Image(painter = painterResource(R.drawable.glasskeep_logo), contentDescription = null, modifier = modifier)
    }
}

/**
 * The background's 144px preview: the photo with the blur scaled to this
 * height (and boosted 1.75 times), under dark mode's veil, and a sample
 * card with the logo and name; without a photo, the default backdrop and
 * its "Default backdrop" pill.
 */
@Composable
private fun BackgroundPreview(
    container: NativeAppContainer,
    background: String?,
    logo: String?,
    appName: String,
    blur: Int,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val shape = RoundedCornerShape(8.dp)
    val windowHeight = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.height.toDp() }
    Box(
        modifier = Modifier.fillMaxWidth().height(PreviewHeight).clip(shape).border(1.dp, borderColor, shape),
        contentAlignment = Alignment.Center,
    ) {
        if (background != null) {
            val photo = rememberLoginBackground(container, background)
            photo.bitmap?.let { bitmap ->
                val previewBlur = if (blur > 0) {
                    (blur * (PreviewHeight / windowHeight) * 1.75f * 100).roundToInt() / 100f
                } else {
                    0f
                }
                Box(Modifier.matchParentSize().padding(1.dp)) { BlurredCoverImage(bitmap, previewBlur.dp) }
            }
            if (dark) Box(Modifier.matchParentSize().padding(1.dp).background(LoginBackgroundVeil))
            Row(
                modifier = Modifier
                    .glassCardShadow(shape)
                    .background(glassFill(dark), shape)
                    .border(1.dp, borderColor, shape)
                    .padding(horizontal = 17.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                BrandingLogo(logo, 24.dp, 6.dp)
                Text(appName, color = titleColor, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold)
            }
        } else {
            DefaultBackdropPreview(dark, Modifier.matchParentSize().padding(1.dp))
            Text(
                stringResource(R.string.native_admin_default_backdrop),
                color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                modifier = Modifier
                    .glassCardShadow(CircleShape)
                    .background(glassFill(dark), CircleShape)
                    .border(1.dp, borderColor, CircleShape)
                    .padding(horizontal = 13.dp, vertical = 5.dp),
            )
        }
    }
}

private val PreviewHeight = 144.dp

/** The upload button (bordered, "Upload image" or "Change image") and,
 *  when there is an image, the soft red "Remove". */
@Composable
private fun ImageButtons(
    hasImage: Boolean,
    busy: Boolean,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onUpload: () -> Unit,
    onRemove: () -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BrandingButton(
            label = stringResource(if (hasImage) R.string.native_admin_change_image else R.string.native_admin_upload_image),
            textColor = titleColor,
            enabled = !busy,
            modifier = Modifier.border(1.dp, borderColor, RoundedCornerShape(8.dp)).padding(horizontal = 17.dp, vertical = 9.dp),
            icon = { tint -> UploadIcon(size = 20.dp, tint = tint) },
            onClick = onUpload,
        )
        if (hasImage) {
            BrandingButton(
                label = stringResource(R.string.native_admin_remove),
                textColor = if (dark) Color(0xFFFFA2A2) else Color(0xFFC10007),
                enabled = !busy,
                modifier = Modifier
                    .background(if (dark) Color(0xFF82181A).copy(alpha = 0.4f) else Color(0xFFFFE2E2), RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                icon = { tint -> TablerTrashIcon(size = 20.dp, tint = tint) },
                onClick = onRemove,
            )
        }
    }
}

/** SUBTLE_BTN / DANGER_BTN: a 20px icon, 8px, then the 14px label. */
@Composable
private fun BrandingButton(
    label: String,
    textColor: Color,
    enabled: Boolean,
    modifier: Modifier,
    icon: @Composable (Color) -> Unit,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.5f)
            .clip(RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .then(modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        icon(textColor)
        Text(label, color = textColor, fontSize = 14.sp, lineHeight = 20.sp)
    }
}

/** The blur row: its value in the accent at the end of the title line,
 *  then the slider and its "0" / "20 px" ends. */
@Composable
private fun BlurRow(
    blur: Int,
    onBlurChange: (Int) -> Unit,
    onRelease: () -> Unit,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SettingsRowIcon(themeId, dark) { tint -> DropletIcon(size = 20.dp, tint = tint) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.native_admin_blur_label),
                        color = titleColor,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.native_admin_blur_value, blur),
                        color = WorkspaceTheme.accent(themeId, dark),
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Text(
                    stringResource(R.string.native_admin_blur_desc),
                    color = SettingsSubtleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            }
        }
        Column {
            BlurSlider(blur, onBlurChange, onRelease, themeId, dark)
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("0", color = brandingHintColor(dark), fontSize = 12.sp, lineHeight = 16.sp)
                Text(
                    stringResource(R.string.native_admin_blur_value, MaxBlur),
                    color = brandingHintColor(dark),
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
            }
        }
    }
}

private const val MaxBlur = 20

/**
 * `.gk-range` from 0 to 20: an 8px rounded track filled with the theme's
 * gradient up to the value, a 20px white thumb ringed with the accent, and
 * no tick marks. The input is inline, so it stands on the text baseline of
 * a 24px line: 9px under its top. A tap puts the thumb where it lands and
 * a sideways drag carries it, a vertical one scrolls the panel instead;
 * the value is saved when the finger lifts. While pressed, the light
 * theme swaps the thumb's shadow for a 4px accent halo.
 */
@Composable
private fun BlurSlider(value: Int, onValueChange: (Int) -> Unit, onRelease: () -> Unit, themeId: String?, dark: Boolean) {
    val currentOnValueChange by rememberUpdatedState(onValueChange)
    val currentOnRelease by rememberUpdatedState(onRelease)
    var pressed by remember { mutableStateOf(false) }
    val halo by animateFloatAsState(
        targetValue = if (pressed && !dark) 1f else 0f,
        animationSpec = tween(durationMillis = 150, easing = CssEase),
        label = "rangeHalo",
    )
    val accent = WorkspaceTheme.rtAccent(themeId)
    val track = if (dark) Color.White.copy(alpha = 0.14f) else Color(0xFF94A3B8).copy(alpha = 0.35f)
    val fraction = value / MaxBlur.toFloat()
    BoxWithConstraints(Modifier.fillMaxWidth().height(24.dp)) {
        val widthPx = constraints.maxWidth.toFloat()
        val thumbPx = with(LocalDensity.current) { 20.dp.toPx() }
        fun valueAt(x: Float): Int =
            ((x - thumbPx / 2f) / (widthPx - thumbPx) * MaxBlur).roundToInt().coerceIn(0, MaxBlur)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 9.dp)
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(track)
                .drawBehind {
                    // The gradient spans the filled part only, then stops dead.
                    val filled = size.width * fraction
                    if (filled > 0f) {
                        drawRect(
                            brush = Brush.horizontalGradient(
                                listOf(WorkspaceTheme.gradFrom(themeId), WorkspaceTheme.gradTo(themeId)),
                                startX = 0f,
                                endX = filled,
                            ),
                            size = Size(filled, size.height),
                        )
                    }
                },
        )
        Box(
            modifier = Modifier
                .offset { IntOffset(((widthPx - thumbPx) * fraction).roundToInt(), 3.dp.roundToPx()) }
                .size(20.dp)
                .dropShadow(
                    CircleShape,
                    if (dark) {
                        Shadow(radius = 6.dp, color = Color.Black.copy(alpha = 0.5f), offset = DpOffset(0.dp, 1.dp))
                    } else {
                        Shadow(
                            radius = lerp(4.dp, 0.dp, halo),
                            color = accent.copy(alpha = 0.45f + (0.25f - 0.45f) * halo),
                            spread = lerp(0.dp, 4.dp, halo),
                            offset = DpOffset(0.dp, lerp(1.dp, 0.dp, halo)),
                        )
                    },
                )
                .background(if (dark) Color(0xFFE5E7EB) else Color.White, CircleShape)
                .border(2.dp, WorkspaceTheme.rangeThumbBorder(themeId, dark), CircleShape),
        )
        Box(
            Modifier
                .matchParentSize()
                .pointerInput(widthPx) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        pressed = true
                        val drag = awaitHorizontalTouchSlopOrCancellation(down.id) { change, _ -> change.consume() }
                        val released = if (drag != null) {
                            currentOnValueChange(valueAt(drag.position.x))
                            horizontalDrag(drag.id) { change ->
                                change.consume()
                                currentOnValueChange(valueAt(change.position.x))
                            }
                        } else {
                            currentEvent.changes.any { it.id == down.id && it.changedToUp() }.also { tapped ->
                                if (tapped) currentOnValueChange(valueAt(down.position.x))
                            }
                        }
                        pressed = false
                        if (released) currentOnRelease()
                    }
                },
        )
    }
}
