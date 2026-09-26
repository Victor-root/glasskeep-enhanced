package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import android.graphics.BitmapFactory
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.pullToRefresh
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.ApiClientFactory
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.FloatingCardsBackground
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.net.URI

/** The colours every screen inside [AuthShell] draws with, handed to
 *  [content] so it doesn't resolve them a second time. [themeId] is the
 *  login theme, which paints the primary buttons and the focus rings. */
internal data class AuthShellColors(
    val themeId: String,
    val title: Color,
    val subtext: Color,
    val card: Color,
    val border: Color,
)

private val AuthCardShape = RoundedCornerShape(12.dp)

/** The WebView's pull-to-refresh on the signed-out pages, which reloaded
 *  them: [onRefresh] rereads what they show and resets their forms, the
 *  disc spinning while [refreshing]. */
internal class SignedOutReload(val refreshing: Boolean, val onRefresh: () -> Unit)

internal val LocalSignedOutReload = staticCompositionLocalOf<SignedOutReload?> { null }

/** `glass-card auth-card rounded-xl p-6`: the form card and the QR
 *  sign-in card below it wear the same chrome. */
internal fun Modifier.authCard(colors: AuthShellColors): Modifier = this
    .fillMaxWidth()
    .glassCardShadow(AuthCardShape)
    .background(colors.card, AuthCardShape)
    .border(1.dp, colors.border, AuthCardShape)
    .padding(24.dp)

/** `.glass-card`'s fill, for the theme toggle and slogan pills. */
internal fun glassFill(dark: Boolean): Color = if (dark) Color(0xEB282828) else Color(0xEBFFFFFF)

/**
 * AuthShell.jsx, the frame shared by every signed-out screen, at phone
 * width: the page is one screen tall below the status bar (`min-h-screen`
 * under the body's top inset), the logo, card and trailing rows sit centred
 * in it and the credits line closes it, then the navigation bar's inset.
 * The drifting cards scroll with that page, as they do on the web; a login
 * background configured by the admin replaces them, pulls the logo and the
 * name into the card and turns the toggle and the credits into pills.
 *
 * [loginSlogan] is the admin's own, which the unlock screen does not pass.
 * [sidePanel] is the QR sign-in card, stacked under the form behind the
 * web's down arrow.
 */
@Composable
internal fun AuthShell(
    container: NativeAppContainer,
    subtitle: String? = null,
    loginSlogan: String? = null,
    sidePanel: (@Composable (AuthShellColors) -> Unit)? = null,
    content: @Composable ColumnScope.(AuthShellColors) -> Unit,
) {
    val dark = LocalGkDark.current
    val branding = container.branding
    val customBackground = branding.loginBackground
    val colors = AuthShellColors(
        // The theme the admin picked for these screens, never the one an
        // account chose for its own workspace (AuthShell.jsx:31).
        themeId = branding.loginThemeId ?: WorkspaceTheme.DEFAULT_ID,
        title = if (dark) DarkTitleColor else LightTitleColor,
        subtext = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
        // Over a photo the form card turns fully opaque (globalCSS.js:711).
        card = when {
            customBackground == null -> glassFill(dark)
            dark -> Color(0xFF282828)
            else -> Color.White
        },
        border = if (dark) DarkBorderColor else LightBorderColor,
    )
    val activity = LocalView.current.context as Activity
    val scope = rememberCoroutineScope()
    val toasts = LocalGkToasts.current
    var confirmServerChange by remember { mutableStateOf(false) }
    val appName = branding.appName ?: stringResource(R.string.native_default_app_name)

    val placeholder = remember(branding.loginBackgroundColor) {
        branding.loginBackgroundColor?.let { value ->
            runCatching { Color(android.graphics.Color.parseColor(value)) }.getOrNull()
        }
    }
    val background = customBackground?.let { rememberLoginBackground(container, it) }
    // The boot placeholder colour stays under the photo until its fade is
    // over, and goes as soon as the photo fails (removeBootBgLayer).
    var placeholderShown by remember(customBackground) { mutableStateOf(true) }
    LaunchedEffect(background?.bitmap, background?.failed) {
        when {
            background?.failed == true -> placeholderShown = false
            background?.bitmap != null -> {
                delay(450)
                placeholderShown = false
            }
        }
    }
    val pageBackground = if (customBackground != null && placeholder != null && placeholderShown) {
        Modifier.background(placeholder)
    } else {
        Modifier.background(WorkspaceTheme.appBackground(colors.themeId, dark))
    }

    val reload = LocalSignedOutReload.current
    val pullState = rememberPullToRefreshState()
    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .then(pageBackground)
            .then(
                if (reload != null) {
                    Modifier.pullToRefresh(
                        isRefreshing = reload.refreshing,
                        state = pullState,
                        threshold = PullRefreshTrigger,
                        onRefresh = reload.onRefresh,
                    )
                } else {
                    Modifier
                },
            ),
    ) {
        val screenHeight = maxHeight
        if (background != null) {
            LoginBackgroundLayer(background.bitmap, hasPlaceholder = placeholder != null, blur = branding.loginBackgroundBlur, dark = dark)
        }
        Column(
            Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)),
        ) {
            Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
            Box(Modifier.fillMaxWidth().heightIn(min = screenHeight)) {
                if (customBackground == null) {
                    FloatingCardsBackground(dark, Modifier.matchParentSize(), fadeIn = false)
                }
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = screenHeight)
                        .padding(horizontal = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(Modifier.weight(1f))
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        if (customBackground == null) {
                            AuthLogo(branding.logo, appName, 64.dp) { tailwindShadowLg(it) }
                            Spacer(Modifier.height(16.dp))
                            Text(
                                appName,
                                color = colors.title,
                                fontSize = 30.sp,
                                lineHeight = 36.sp,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (subtitle != null) {
                                Text(
                                    subtitle,
                                    color = colors.subtext,
                                    fontSize = 16.sp,
                                    lineHeight = 24.sp,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            Spacer(Modifier.height(24.dp))
                        }
                        Column(Modifier.authCard(colors)) {
                            if (customBackground != null) {
                                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                                    AuthLogo(branding.logo, appName, 56.dp) { tailwindShadowMd(it) }
                                    Spacer(Modifier.height(12.dp))
                                    Text(
                                        appName,
                                        color = colors.title,
                                        fontSize = 24.sp,
                                        lineHeight = 32.sp,
                                        fontWeight = FontWeight.Bold,
                                        textAlign = TextAlign.Center,
                                    )
                                    if (subtitle != null) {
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            subtitle,
                                            color = colors.subtext,
                                            fontSize = 14.sp,
                                            lineHeight = 20.sp,
                                            textAlign = TextAlign.Center,
                                        )
                                    }
                                }
                                Spacer(Modifier.height(20.dp))
                            }
                            content(colors)
                        }
                        if (sidePanel != null) {
                            Spacer(Modifier.height(24.dp))
                            ArrowBadgeDownIcon(size = 20.dp, tint = if (dark) Color(0xFF7C86FF) else Color(0xFF615FFF))
                            // The glyph's line box: 7px of the page's strut under it.
                            Spacer(Modifier.height(7.dp + 24.dp))
                            sidePanel(colors)
                        }
                        Spacer(Modifier.height(24.dp))
                        ThemeToggle(dark, pill = customBackground != null, border = colors.border) {
                            container.shellPrefs.toggleDark(dark)
                        }
                        // The row keeps the page's 24px strut: 7px of descent
                        // under the plain button, none under the pill, whose own
                        // padding and border already reach that deep.
                        if (customBackground == null) Spacer(Modifier.height(7.dp))
                        Spacer(Modifier.height(16.dp))
                        Text(
                            loginSlogan?.takeIf { it.isNotEmpty() } ?: stringResource(R.string.native_login_slogan),
                            color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.glassPill(dark, colors.border),
                        )
                        Spacer(Modifier.height(16.dp))
                        Box(Modifier.fillMaxWidth().height(24.dp), contentAlignment = Alignment.TopCenter) {
                            AuthLink(
                                stringResource(R.string.native_settings_change_server),
                                modifier = Modifier.padding(top = 5.dp),
                                fontSize = 12.sp,
                                lineHeight = 16.sp,
                            ) { confirmServerChange = true }
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    AuthCredits(dark, pill = customBackground != null)
                }
            }
            Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
        }
        if (reload != null) SwipeRefreshIndicator(pullState, reload.refreshing)
    }

    // The WebView's AndroidTheme.changeServer() always asked first.
    if (confirmServerChange) {
        ChangeServerDialog(
            dark = dark,
            onConfirm = {
                confirmServerChange = false
                scope.launch { switchServer(container, activity, toasts) }
            },
            onDismiss = { confirmServerChange = false },
        )
    }
}

/** `.glass-card rounded-full px-4 py-1.5 shadow-sm`: the slogan, and the
 *  theme toggle over a login background. */
private fun Modifier.glassPill(dark: Boolean, border: Color): Modifier = this
    .glassCardShadow(CircleShape)
    .background(glassFill(dark), CircleShape)
    .border(1.dp, border, CircleShape)
    .padding(horizontal = 17.dp, vertical = 7.dp)

/** The logo above the name: a custom one drawn raw, since it may be a
 *  transparent PNG, the bundled icon on its rounded tile and shadow. */
@Composable
private fun AuthLogo(logo: String?, appName: String, size: Dp, tileShadow: Modifier.(Shape) -> Modifier) {
    val customLogo = logo?.let { rememberDecodedImage(it) }
    if (customLogo != null) {
        Image(
            bitmap = customLogo,
            contentDescription = appName,
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(size),
        )
    } else {
        val tile = RoundedCornerShape(16.dp)
        Image(
            painter = painterResource(id = R.drawable.glasskeep_logo),
            contentDescription = appName,
            modifier = Modifier
                .size(size)
                .tileShadow(tile)
                .clip(tile),
        )
    }
}

/** "Changer de thème": the glyph of the current mode, not the one a tap
 *  switches to, unlike the header menu's own entry. */
@Composable
private fun ThemeToggle(dark: Boolean, pill: Boolean, border: Color, onClick: () -> Unit) {
    val tint = if (dark) Color(0xFFD1D5DC) else Color(0xFF364153)
    Row(
        modifier = Modifier
            .then(
                if (pill) {
                    Modifier
                        .glassCardShadow(CircleShape)
                        .background(glassFill(dark), CircleShape)
                        .border(1.dp, border, CircleShape)
                } else {
                    Modifier
                },
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .then(if (pill) Modifier.padding(horizontal = 17.dp, vertical = 7.dp) else Modifier),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dark) MoonIcon(size = 24.dp, tint = tint) else AuthSunIcon(size = 24.dp, tint = tint)
        Text(stringResource(R.string.native_login_toggle_theme), color = tint, fontSize = 14.sp, lineHeight = 20.sp)
    }
}

/** AuthShell's footer line, deliberately untranslated on the web too, with
 *  its two underlined links; over a login background it sits on a dark
 *  translucent pill. */
@Composable
private fun AuthCredits(dark: Boolean, pill: Boolean) {
    val linkStyles = TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline))
    val credits = buildAnnotatedString {
        append("Open source project · Originally by ")
        withLink(LinkAnnotation.Url(CreditsAuthorUrl, linkStyles)) {
            append("nikunjsingh93")
        }
        append(" · maintained and expanded by ")
        withLink(LinkAnnotation.Url(CreditsMaintainerUrl, linkStyles)) {
            append("Victor-root")
        }
    }
    Box(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 16.dp), contentAlignment = Alignment.Center) {
        Text(
            credits,
            color = if (dark) Color(0xFF4A5565) else Color(0xFF99A1AF),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            textAlign = TextAlign.Center,
            modifier = if (pill) {
                Modifier
                    .background(Color.Black.copy(alpha = 0.2f), CircleShape)
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            } else {
                Modifier
            },
        )
    }
}

private const val CreditsAuthorUrl = "https://github.com/nikunjsingh93"
private const val CreditsMaintainerUrl = "https://github.com/Victor-root/glasskeep-enhanced"

/** The admin's login background: still loading, drawn, or given up on. */
internal class LoginBackground(val bitmap: ImageBitmap?, val failed: Boolean)

/** Fetches the login background with the app's own HTTP client and lets
 *  Android decode it; no browser or image-loader dependency is involved. */
@Composable
internal fun rememberLoginBackground(container: NativeAppContainer, ref: String): LoginBackground {
    var state by remember(ref) { mutableStateOf(LoginBackground(bitmap = null, failed = false)) }
    LaunchedEffect(ref) {
        val bitmap = withContext(Dispatchers.IO) {
            try {
                if (ref.startsWith("data:")) {
                    decodeDataUrl(ref)
                } else {
                    val absolute = URI(container.tokenStore.serverUrl.orEmpty()).resolve(ref).toString()
                    val client = ApiClientFactory.okHttpClient(container.tokenStore) { container.lockState.markLocked() }
                    client.newCall(Request.Builder().url(absolute).build()).execute().use { response ->
                        if (!response.isSuccessful) {
                            null
                        } else {
                            response.body?.bytes()?.let { bytes ->
                                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                            }
                        }
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("Auth background load failed", t)
                null
            }
        }
        state = LoginBackground(bitmap, failed = bitmap == null)
    }
    return state
}

private fun decodeDataUrl(dataUrl: String): ImageBitmap? = runCatching {
    val base64 = dataUrl.substringAfter("base64,", "")
    val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
}.getOrNull()

/** The veil dark mode lays over the admin's photo, `rgba(17,17,17,.55)`. */
internal val LoginBackgroundVeil = Color(0x8C111111)

/**
 * `.login-custom-bg`: the photo under the dark mode's veil (light mode
 * shows it raw). It fades in over 400ms when there is a placeholder
 * colour to fade from, and is simply there otherwise.
 */
@Composable
private fun LoginBackgroundLayer(bitmap: ImageBitmap?, hasPlaceholder: Boolean, blur: Int, dark: Boolean) {
    val layerAlpha by animateFloatAsState(
        targetValue = if (bitmap != null || !hasPlaceholder) 1f else 0f,
        animationSpec = if (hasPlaceholder) tween(durationMillis = 400, easing = CssEase) else snap(),
        label = "loginBackgroundFade",
    )
    Box(Modifier.fillMaxSize().clipToBounds().graphicsLayer { alpha = layerAlpha }) {
        if (bitmap != null) BlurredCoverImage(bitmap, blur.dp)
        if (dark) Box(Modifier.fillMaxSize().background(LoginBackgroundVeil))
    }
}

/** A photo cover-cropped over its box and CSS-blurred by [blur], on a
 *  layer that overscans the box by twice the blur so the soft edges fall
 *  outside it (`inset: -2×blur`). */
@Composable
internal fun BlurredCoverImage(bitmap: ImageBitmap, blur: Dp) {
    val density = LocalDensity.current
    val overscan = with(density) { (blur * 2).roundToPx() }
    // CSS blur(Npx) is a Gaussian of standard deviation N; Android turns a
    // blur radius r into sigma = 0.57735 r + 0.5.
    val radius = with(density) { ((blur.toPx() - 0.5f) / 0.57735f).coerceAtLeast(0f).toDp() }
    Image(
        bitmap = bitmap,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .layout { measurable, constraints ->
                val placeable = measurable.measure(
                    Constraints.fixed(constraints.maxWidth + 2 * overscan, constraints.maxHeight + 2 * overscan),
                )
                layout(constraints.maxWidth, constraints.maxHeight) { placeable.place(-overscan, -overscan) }
            }
            .then(if (blur > 0.dp) Modifier.blur(radius, BlurredEdgeTreatment.Unbounded) else Modifier),
    )
}
