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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// Light theme
private val LightBgGradient = Brush.linearGradient(
    colors = listOf(Color(0xFFf0e8ff), Color(0xFFe8f4fd), Color(0xFFfde8f0)),
    start = Offset(0f, 0f),
    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
)
private val LightCardBg = Color(0xFFFFFFFF).copy(alpha = 0.7f)
private val LightFloatingCardBg = Color.White.copy(alpha = 0.35f)
private val LightTitleColor = Color(0xFF1f2937)
private val LightSubtextColor = Color(0xFF6b7280)
private val LightBorderColor = Color(0xFFd1d5db).copy(alpha = 0.3f)
private val LightLineColor = Color(0xFF9ca3af).copy(alpha = 0.15f)

// Dark theme
private val DarkBgColor = Color(0xFF1a1a1a)
private val DarkCardBg = Color(0xFF282828).copy(alpha = 0.6f)
private val DarkFloatingCardBg = Color(0xFF1e1e28).copy(alpha = 0.65f)
private val DarkTitleColor = Color(0xFFe5e7eb)
private val DarkSubtextColor = Color(0xFF9ca3af)
private val DarkBorderColor = Color(0xFF4b5563).copy(alpha = 0.3f)
private val DarkLineColor = Color(0xFF9ca3af).copy(alpha = 0.10f)

private val ButtonGradient = Brush.horizontalGradient(
    colors = listOf(Color(0xFF6366f1), Color(0xFF7c3aed))
)
private val Indigo = Color(0xFF6366f1)

// Floating card accent colors
private val FloatingCardColors = listOf(
    Color(0xFF6366f1), Color(0xFFa855f7), Color(0xFF10b981),
    Color(0xFFf59e0b), Color(0xFFf97316), Color(0xFF0ea5e9),
    Color(0xFF84cc16), Color(0xFFec4899), Color(0xFF14b8a6),
    Color(0xFFf43f5e),
)

private data class FloatingCard(
    val xFraction: Float,
    val yFraction: Float,
    val rotation: Float,
    val colorIndex: Int,
    val durationMs: Int,
    val delayMs: Int,
    val widthDp: Dp
)

private val floatingCards = listOf(
    FloatingCard(0.05f, 0.08f, -12f, 0, 7000, 0, 110.dp),
    FloatingCard(0.70f, 0.05f, 8f, 1, 8000, 500, 100.dp),
    FloatingCard(0.85f, 0.22f, -6f, 2, 9000, 1200, 95.dp),
    FloatingCard(0.02f, 0.35f, 10f, 3, 10000, 800, 105.dp),
    FloatingCard(0.75f, 0.42f, -15f, 4, 8500, 2000, 90.dp),
    FloatingCard(0.10f, 0.62f, 5f, 5, 9500, 1500, 100.dp),
    FloatingCard(0.80f, 0.65f, -8f, 6, 7500, 3000, 95.dp),
    FloatingCard(0.00f, 0.82f, 13f, 7, 10500, 600, 110.dp),
    FloatingCard(0.65f, 0.85f, -10f, 8, 11000, 2500, 85.dp),
    FloatingCard(0.35f, 0.92f, 7f, 9, 8000, 1800, 100.dp),
)

@Composable
private fun FloatingCardsBackground(dark: Boolean) {
    val transition = rememberInfiniteTransition(label = "float")
    val cardBg = if (dark) DarkFloatingCardBg else LightFloatingCardBg
    val lineColor = if (dark) DarkLineColor else LightLineColor

    Box(modifier = Modifier.fillMaxSize()) {
        floatingCards.forEach { card ->
            val animOffset by transition.animateFloat(
                initialValue = 0f,
                targetValue = -18f,
                animationSpec = infiniteRepeatable(
                    animation = tween(
                        durationMillis = card.durationMs,
                        delayMillis = card.delayMs,
                        easing = LinearEasing
                    ),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "card_${card.colorIndex}"
            )

            val accentColor = FloatingCardColors[card.colorIndex]

            Box(modifier = Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .offset(x = (card.xFraction * 300).dp, y = (card.yFraction * 700).dp)
                        .offset(y = animOffset.dp)
                        .rotate(card.rotation)
                        .width(card.widthDp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(cardBg)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .background(accentColor.copy(alpha = 0.7f))
                    )
                    Column(modifier = Modifier.padding(10.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.7f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(accentColor.copy(alpha = 0.2f))
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.9f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(lineColor)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.6f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(lineColor)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.75f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(lineColor)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun SetupScreen(onConnect: (String) -> Unit) {
    val dark = isSystemInDarkTheme()
    var url by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val handler = remember { android.os.Handler(android.os.Looper.getMainLooper()) }
    val errorEmpty = stringResource(R.string.error_empty_url)
    val errorInvalid = stringResource(R.string.error_invalid_url)
    val errorNotGlasskeep = stringResource(R.string.error_not_glasskeep)
    val errorUnreachable = stringResource(R.string.error_unreachable)

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
            modifier = Modifier.padding(horizontal = 32.dp),
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
                    supportingText = error?.let { msg -> { Text(msg, color = Color(0xFFdc2626)) } },
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
