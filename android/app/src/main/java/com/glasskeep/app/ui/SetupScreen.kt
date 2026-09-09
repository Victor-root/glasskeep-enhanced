package com.glasskeep.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.res.Configuration
import com.glasskeep.app.R
import com.glasskeep.app.net.CleartextPolicy
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// Shared palette: setup + welcome screens both pull from these so the
// onboarding flow stays visually consistent. `internal` keeps the
// surface scoped to this module (no public API leak).

// Light theme
internal val LightBgGradient = Brush.linearGradient(
    colors = listOf(Color(0xFFf0e8ff), Color(0xFFe8f4fd), Color(0xFFfde8f0)),
    start = Offset(0f, 0f),
    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
)
internal val LightCardBg = Color(0xFFFFFFFF)
private val LightFloatingCardBg = Color.White.copy(alpha = 0.35f)
internal val LightTitleColor = Color(0xFF1f2937)
internal val LightSubtextColor = Color(0xFF6b7280)
internal val LightBorderColor = Color(0xFFd1d5db).copy(alpha = 0.3f)
private val LightLineColor = Color(0xFF9ca3af).copy(alpha = 0.15f)

// Dark theme
internal val DarkBgColor = Color(0xFF1a1a1a)
internal val DarkCardBg = Color(0xFF282828)
private val DarkFloatingCardBg = Color(0xFF1e1e28).copy(alpha = 0.65f)
internal val DarkTitleColor = Color(0xFFe5e7eb)
internal val DarkSubtextColor = Color(0xFF9ca3af)
internal val DarkBorderColor = Color(0xFF4b5563).copy(alpha = 0.3f)
private val DarkLineColor = Color(0xFF9ca3af).copy(alpha = 0.10f)

internal val ButtonGradient = Brush.horizontalGradient(
    colors = listOf(Color(0xFF6366f1), Color(0xFF7c3aed))
)
internal val Indigo = Color(0xFF6366f1)

// Amber, not red: an unencrypted address on your own network is allowed,
// it is just worth knowing about. Legible on both the light card and the
// dark TV backdrop.
private val CleartextNoticeColor = Color(0xFFd97706)

/** True on Android TV / leanback devices. We rely on it to swap the
 *  setup screen's theme to a dark-violet 10-foot
 *  layout (same vibe as the in-app TvLogin) without touching the
 *  phone / tablet experience. */
@Composable
private fun isTelevision(): Boolean {
    val ctx = LocalContext.current
    val uiMode = ctx.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK
    if (uiMode == Configuration.UI_MODE_TYPE_TELEVISION) return true
    return ctx.packageManager.hasSystemFeature("android.software.leanback")
}

// TV theme — mirrors the in-app TvLogin React component (dark radial
// gradient backdrop, violet→pink brand title, glass card, gradient
// submit button). Used only when isTelevision() returns true.
private val TvBgTop = Color(0xFF1a1530)
private val TvBgMid = Color(0xFF0b0d12)
private val TvBgBottom = Color(0xFF06070b)
private val TvCardBg = Color(0xFF0F1119).copy(alpha = 0.85f)
private val TvCardBorder = Color(0xFFffffff).copy(alpha = 0.08f)
private val TvTitleStart = Color(0xFFc4b5fd) // violet-300
private val TvTitleEnd = Color(0xFFf9a8d4)   // pink-300
private val TvSubtextColor = Color(0xFF9ca3af)
private val TvBodyColor = Color(0xFFf9fafb)
private val TvAccent = Color(0xFFa78bfa) // violet-400 — focus / accent

@Composable
fun SetupScreen(initialUrl: String = "", onConnect: (String) -> Unit) {
    val dark = isSystemInDarkTheme()
    val isTv = isTelevision()
    // Pre-filled when the app sent the user back here because the stored
    // address needs a second look: pressing Connect is then enough, and
    // an address that turns out to be refused shows exactly why.
    var url by remember { mutableStateOf(initialUrl) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val handler = remember { android.os.Handler(android.os.Looper.getMainLooper()) }
    val errorEmpty = stringResource(R.string.error_empty_url)
    val errorInvalid = stringResource(R.string.error_invalid_url)
    val errorNotGlasskeep = stringResource(R.string.error_not_glasskeep)
    val errorUnreachable = stringResource(R.string.error_unreachable)
    val errorCleartextPublic = stringResource(R.string.error_cleartext_public)

    // An address that is not encrypted is worth saying out loud even when
    // it is allowed: on your own network it is a deliberate choice, and
    // the person making it should know they are making it.
    val cleartextNotice = url.trim().startsWith("http://", ignoreCase = true)

    val doConnect: () -> Unit = {
        val trimmed = url.trim().trimEnd('/')
        when {
            trimmed.isBlank() -> error = errorEmpty
            !trimmed.startsWith("http://") && !trimmed.startsWith("https://") -> error = errorInvalid
            loading -> {}
            else -> {
                loading = true
                error = null
                Thread {
                    // Resolving the address needs the network, so it
                    // happens here rather than on the main thread. An
                    // unencrypted address aimed at the open internet
                    // never reaches the connection attempt.
                    val verdict = CleartextPolicy.resolve(trimmed)
                    if (verdict == CleartextPolicy.Verdict.PUBLIC_CLEARTEXT ||
                        verdict == CleartextPolicy.Verdict.UNUSABLE
                    ) {
                        handler.post {
                            loading = false
                            error = if (verdict == CleartextPolicy.Verdict.UNUSABLE) {
                                errorInvalid
                            } else {
                                errorCleartextPublic
                            }
                        }
                        return@Thread
                    }
                    val result = checkGlassKeepServer(trimmed)
                    handler.post {
                        loading = false
                        when (result) {
                            ServerCheck.OK -> onConnect(trimmed)
                            ServerCheck.NOT_GLASSKEEP -> error = errorNotGlasskeep
                            ServerCheck.UNREACHABLE -> error = errorUnreachable
                        }
                    }
                }.start()
            }
        }
    }

    // Branch the whole screen for TV — same fields and behaviour, but a
    // dark-violet glass theme matching the in-app TvLogin so the user
    // doesn't get jolted between two visual languages.
    if (isTv) {
        TvSetupScreen(
            url = url,
            onUrlChange = { url = it; error = null },
            error = error,
            cleartextNotice = cleartextNotice,
            loading = loading,
            onConnect = doConnect
        )
        return
    }

    val bgModifier = if (dark) {
        Modifier.background(DarkBgColor)
    } else {
        Modifier.background(LightBgGradient)
    }
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val cardBg = if (dark) DarkCardBg else LightCardBg
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val textColor = if (dark) DarkTitleColor else LightTitleColor

    Box(
        modifier = Modifier
            .fillMaxSize()
            .then(bgModifier),
        contentAlignment = Alignment.Center
    ) {
        FloatingCardsBackground(dark)

        Column(
            modifier = Modifier.safeDrawingPadding().padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                painter = painterResource(id = R.drawable.glasskeep_logo),
                contentDescription = "GlassKeep",
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .shadow(8.dp, RoundedCornerShape(18.dp))
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Glass Keep",
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                color = titleColor
            )

            Text(
                text = stringResource(R.string.setup_subtitle),
                fontSize = 14.sp,
                color = subtextColor
            )

            Spacer(modifier = Modifier.height(32.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(cardBg)
                    .padding(24.dp)
            ) {
                OutlinedTextField(
                    value = url,
                    onValueChange = {
                        url = it
                        error = null
                    },
                    label = { Text(stringResource(R.string.setup_label)) },
                    placeholder = { Text(stringResource(R.string.setup_placeholder)) },
                    singleLine = true,
                    isError = error != null,
                    supportingText = {
                        if (error != null) {
                            Text(error!!, color = Color(0xFFdc2626))
                        } else if (cleartextNotice) {
                            Text(
                                stringResource(R.string.setup_cleartext_notice),
                                color = CleartextNoticeColor,
                                fontSize = 12.sp
                            )
                        } else {
                            Text(
                                stringResource(R.string.setup_hint),
                                color = subtextColor,
                                fontSize = 12.sp
                            )
                        }
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Go
                    ),
                    keyboardActions = KeyboardActions(
                        onGo = { doConnect() }
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = textColor,
                        unfocusedTextColor = textColor,
                        focusedBorderColor = Indigo,
                        unfocusedBorderColor = borderColor,
                        focusedLabelColor = Indigo,
                        unfocusedLabelColor = subtextColor,
                        focusedPlaceholderColor = subtextColor,
                        unfocusedPlaceholderColor = subtextColor,
                        cursorColor = Indigo
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(20.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ButtonGradient)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button
                        ) { doConnect() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        stringResource(if (loading) R.string.connecting else R.string.setup_connect),
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                        fontSize = 16.sp
                    )
                }
            }
        }
    }
}

// TV variant of the setup screen. Same fields and the same doConnect
// behaviour, but rendered with the dark-violet glass theme that
// matches the in-app TvLogin React component. No floating cards
// decoration here — keeps the layout calm at 10-foot distance.
@Composable
private fun TvSetupScreen(
    url: String,
    onUrlChange: (String) -> Unit,
    error: String?,
    cleartextNotice: Boolean,
    loading: Boolean,
    onConnect: () -> Unit,
) {
    val brandBrush = Brush.horizontalGradient(listOf(TvTitleStart, TvTitleEnd))
    val bgBrush = Brush.radialGradient(
        colors = listOf(TvBgTop, TvBgMid, TvBgBottom),
        center = Offset(0.2f, 0f),
        radius = 1800f
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(bgBrush),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.55f)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                painter = painterResource(id = R.drawable.glasskeep_logo),
                contentDescription = "GlassKeep",
                modifier = Modifier
                    .size(84.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .shadow(12.dp, RoundedCornerShape(20.dp))
            )

            Spacer(modifier = Modifier.height(10.dp))

            // TextStyle.brush (Compose 1.4+) fills the glyphs with the
            // gradient — same effect the web brand uses.
            Text(
                text = "GlassKeep TV",
                style = TextStyle(
                    brush = brandBrush,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = stringResource(R.string.setup_subtitle),
                fontSize = 13.sp,
                color = TvSubtextColor
            )

            Spacer(modifier = Modifier.height(18.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(TvCardBg)
                    .padding(24.dp)
            ) {
                OutlinedTextField(
                    value = url,
                    onValueChange = onUrlChange,
                    label = { Text(stringResource(R.string.setup_label)) },
                    placeholder = { Text(stringResource(R.string.setup_placeholder)) },
                    singleLine = true,
                    isError = error != null,
                    supportingText = {
                        if (error != null) {
                            Text(error, color = Color(0xFFfca5a5))
                        } else if (cleartextNotice) {
                            Text(
                                stringResource(R.string.setup_cleartext_notice),
                                color = CleartextNoticeColor,
                                fontSize = 12.sp
                            )
                        } else {
                            Text(
                                stringResource(R.string.setup_hint),
                                color = TvSubtextColor,
                                fontSize = 12.sp
                            )
                        }
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Go
                    ),
                    keyboardActions = KeyboardActions(onGo = { onConnect() }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TvBodyColor,
                        unfocusedTextColor = TvBodyColor,
                        focusedBorderColor = TvAccent,
                        unfocusedBorderColor = TvCardBorder,
                        focusedLabelColor = TvAccent,
                        unfocusedLabelColor = TvSubtextColor,
                        focusedPlaceholderColor = TvSubtextColor,
                        unfocusedPlaceholderColor = TvSubtextColor,
                        cursorColor = TvAccent
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(20.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ButtonGradient)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button
                        ) { onConnect() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        stringResource(if (loading) R.string.connecting else R.string.setup_connect),
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                        fontSize = 16.sp
                    )
                }
            }
        }
    }
}

private enum class ServerCheck { OK, NOT_GLASSKEEP, UNREACHABLE }

private fun checkGlassKeepServer(baseUrl: String): ServerCheck =
    try {
        val conn = URL("$baseUrl/api/health").openConnection() as HttpURLConnection
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        conn.requestMethod = "GET"
        conn.instanceFollowRedirects = true
        val code = conn.responseCode
        if (code != 200) {
            conn.disconnect()
            ServerCheck.UNREACHABLE
        } else {
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val json = JSONObject(body)
            if (json.optString("service") == "glasskeep") ServerCheck.OK
            else ServerCheck.NOT_GLASSKEEP
        }
    } catch (_: Throwable) {
        ServerCheck.UNREACHABLE
    }
