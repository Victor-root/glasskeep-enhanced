package com.glasskeep.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.net.CleartextPolicy
import com.glasskeep.app.net.ServerCheck
import com.glasskeep.app.net.checkGlassKeepServer

// Amber, not red: an unencrypted address on your own network is allowed,
// it is just worth knowing about. Legible on both the light card and the
// dark TV backdrop.
private val CleartextNoticeColor = Color(0xFFd97706)

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
    val onUrlChange: (String) -> Unit = {
        url = it
        error = null
    }

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
            onUrlChange = onUrlChange,
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
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            GlassKeepLogo(size = 80.dp, cornerRadius = 18.dp, elevation = 8.dp)

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
                ServerUrlField(
                    url = url,
                    onUrlChange = onUrlChange,
                    error = error,
                    cleartextNotice = cleartextNotice,
                    onGo = doConnect,
                    textColor = textColor,
                    accentColor = Indigo,
                    borderColor = borderColor,
                    subtextColor = subtextColor,
                    errorColor = Color(0xFFdc2626),
                )

                Spacer(modifier = Modifier.height(20.dp))

                ConnectButton(loading = loading, onClick = doConnect, height = 48.dp)
            }
        }
    }
}

/** The server address field of both setup layouts, in their colours. Its
 *  note under the field is the error, else the notice of an unencrypted
 *  address, else the hint. */
@Composable
internal fun ServerUrlField(
    url: String,
    onUrlChange: (String) -> Unit,
    error: String?,
    cleartextNotice: Boolean,
    onGo: () -> Unit,
    textColor: Color,
    accentColor: Color,
    borderColor: Color,
    subtextColor: Color,
    errorColor: Color,
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
                Text(error, color = errorColor)
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
        keyboardActions = KeyboardActions(onGo = { onGo() }),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = textColor,
            unfocusedTextColor = textColor,
            focusedBorderColor = accentColor,
            unfocusedBorderColor = borderColor,
            focusedLabelColor = accentColor,
            unfocusedLabelColor = subtextColor,
            focusedPlaceholderColor = subtextColor,
            unfocusedPlaceholderColor = subtextColor,
            cursorColor = accentColor
        ),
        modifier = Modifier.fillMaxWidth()
    )
}

/** The full-width Connect button of both setup layouts. */
@Composable
internal fun ConnectButton(loading: Boolean, onClick: () -> Unit, height: Dp) {
    GradientButton(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        contentPadding = PaddingValues(0.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(height),
    ) {
        Text(
            stringResource(if (loading) R.string.connecting else R.string.setup_connect),
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            fontSize = 16.sp
        )
    }
}
