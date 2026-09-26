package com.glasskeep.app.nativeapp.ui

import android.net.Uri
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.nativeapp.data.refusal
import io.nayuki.qrcodegen.QrCode
import io.nayuki.qrcodegen.QrSegmentAdvanced
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/** QrLoginPanel.jsx's states. */
private enum class QrLoginStatus { LOADING, PENDING, APPROVED, EXPIRED, REJECTED, ERROR }

/** Never poll faster than this, whatever the server asks for. */
private const val MinPollIntervalMs = 1000L

/** The QR's quiet zone, `margin: 1` like the web's QRCode.toDataURL. */
private const val QrMargin = 1

private val QrDark = Color(0xFF1F1F1F)

/**
 * QrLoginPanel.jsx: the cross-device sign-in card the login screen opens
 * under its form. It creates a device-link challenge, draws its URL as a
 * QR code, polls until a signed-in device approves it (or it expires, or
 * is rejected there), then hands over the session the poll carries.
 */
@Composable
internal fun QrLoginPanel(
    container: NativeAppContainer,
    serverUrl: String,
    colors: AuthShellColors,
    onApproved: (token: String, mustChangePassword: Boolean) -> Unit,
    onCancel: () -> Unit,
) {
    val dark = LocalGkDark.current
    var status by remember { mutableStateOf(QrLoginStatus.LOADING) }
    var errorText by remember { mutableStateOf("") }
    var qr by remember { mutableStateOf<QrCode?>(null) }
    var linkToken by remember { mutableStateOf<String?>(null) }
    var expiresAt by remember { mutableStateOf<Long?>(null) }
    var pollIntervalMs by remember { mutableLongStateOf(2000L) }
    var secondsLeft by remember { mutableStateOf<Int?>(null) }
    var generation by remember { mutableIntStateOf(0) }

    LaunchedEffect(generation) {
        status = QrLoginStatus.LOADING
        errorText = ""
        qr = null
        linkToken = null
        try {
            val response = container.api(serverUrl).createDeviceLink()
            val created = response.body()
            if (!response.isSuccessful || created == null) throw response.refusal("POST /api/device-link/create")
            linkToken = created.token
            expiresAt = created.expiresAt?.let { parseIsoToEpochMillis(it) }
            pollIntervalMs = maxOf(MinPollIntervalMs, created.pollIntervalMs.takeIf { it != 0L } ?: 2000L)
            qr = encodeLinkQr(deviceLinkUrl(serverUrl, created.token))
            status = QrLoginStatus.PENDING
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            errorText = fetchErrorText(t).ifEmpty { "Network error" }
            status = QrLoginStatus.ERROR
        }
    }

    LaunchedEffect(linkToken, status, pollIntervalMs) {
        val token = linkToken
        if (token == null || status != QrLoginStatus.PENDING) return@LaunchedEffect
        while (true) {
            delay(pollIntervalMs)
            try {
                val response = container.api(serverUrl).pollDeviceLink(token)
                val body = response.body()
                when {
                    response.code() == 404 || response.code() == 410 -> {
                        status = QrLoginStatus.EXPIRED
                        return@LaunchedEffect
                    }
                    !response.isSuccessful || body == null -> Unit
                    body.status == "approved" && body.token != null && body.user != null -> {
                        status = QrLoginStatus.APPROVED
                        onApproved(body.token, body.mustChangePassword)
                        return@LaunchedEffect
                    }
                    body.status == "expired" || body.status == "consumed" -> {
                        status = QrLoginStatus.EXPIRED
                        return@LaunchedEffect
                    }
                    body.status == "rejected" -> {
                        status = QrLoginStatus.REJECTED
                        return@LaunchedEffect
                    }
                }
            } catch (t: CancellationException) {
                throw t
            } catch (_: Throwable) {
                // A transient blip: the next tick tries again.
            }
        }
    }

    LaunchedEffect(expiresAt) {
        val end = expiresAt
        if (end == null) {
            secondsLeft = null
            return@LaunchedEffect
        }
        while (true) {
            secondsLeft = maxOf(0, ((end - System.currentTimeMillis()) / 1000.0).roundToInt())
            delay(1000)
        }
    }

    Column(Modifier.authCard(colors), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            stringResource(R.string.native_qr_login_title),
            color = colors.title,
            fontSize = 16.sp,
            lineHeight = 24.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        QrLoginCanvas(status, qr, dark, colors)
        Spacer(Modifier.height(12.dp))
        Text(
            stringResource(R.string.native_qr_login_explain),
            color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
            fontSize = 12.sp,
            lineHeight = 16.5.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().heightIn(min = 24.dp), contentAlignment = Alignment.TopCenter) {
            QrLoginStatusLine(status, errorText, secondsLeft, dark, colors)
        }
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (status == QrLoginStatus.EXPIRED || status == QrLoginStatus.ERROR || status == QrLoginStatus.REJECTED) {
                GkGradientButton(
                    label = stringResource(R.string.native_qr_login_regenerate),
                    themeId = colors.themeId,
                    verticalPadding = 6.dp,
                ) { generation++ }
            }
            GkSecondaryButton(
                label = stringResource(R.string.native_dialog_cancel),
                borderColor = colors.border,
                textColor = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153),
                fontWeight = FontWeight.Medium,
                verticalPadding = 6.dp,
                onClick = onCancel,
            )
        }
    }
}

/** The 220px square: a spinner while the code is made, a cross when it
 *  could not be, then the code itself, dimmed and crossed once dead, or
 *  washed green with a tick once approved. */
@Composable
private fun QrLoginCanvas(status: QrLoginStatus, qr: QrCode?, dark: Boolean, colors: AuthShellColors) {
    val shape = RoundedCornerShape(12.dp)
    val showQr = status != QrLoginStatus.LOADING && qr != null
    Box(
        modifier = Modifier
            .size(220.dp)
            .clip(shape)
            .background(
                when {
                    showQr -> Color.White
                    dark -> Color(0xFF1F1F1F)
                    else -> Color(0xFFF9FAFB)
                },
            )
            .border(1.dp, colors.border, shape)
            .padding(1.dp),
        contentAlignment = Alignment.Center,
    ) {
        when {
            status == QrLoginStatus.LOADING -> SpinnerIcon(size = 32.dp, tint = Color(0xFF615FFF))
            qr == null -> CloseIcon(size = 20.dp, tint = colors.title, strokeWidth = 2f)
            else -> {
                val dead = status == QrLoginStatus.EXPIRED || status == QrLoginStatus.REJECTED
                val qrAlpha by animateFloatAsState(
                    targetValue = if (dead) 0.3f else 1f,
                    animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
                    label = "qrLoginFade",
                )
                QrCodeImage(qr, Modifier.fillMaxSize().alpha(qrAlpha))
                if (dead) CloseIcon(size = 40.dp, tint = Color(0xFF364153), strokeWidth = 2f)
                if (status == QrLoginStatus.APPROVED) {
                    Box(
                        Modifier.fillMaxSize().background(Color(0xFF00BC7D).copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        BoldCheckIcon(size = 48.dp, tint = Color(0xFF009966))
                    }
                }
            }
        }
    }
}

@Composable
private fun QrLoginStatusLine(
    status: QrLoginStatus,
    errorText: String,
    secondsLeft: Int?,
    dark: Boolean,
    colors: AuthShellColors,
) {
    val red = if (dark) Color(0xFFFF6467) else Color(0xFFE7000B)
    when (status) {
        QrLoginStatus.LOADING -> StatusText(stringResource(R.string.native_qr_login_generating), colors.subtext)
        QrLoginStatus.ERROR -> StatusText(errorText, red)
        QrLoginStatus.PENDING -> {
            val waiting = stringResource(R.string.native_qr_login_waiting)
            val expires = secondsLeft?.let { stringResource(R.string.native_qr_login_expires_in, it) }
            Text(
                buildAnnotatedString {
                    append(waiting)
                    if (expires != null) {
                        append(" · ")
                        withStyle(SpanStyle(fontFeatureSettings = "tnum")) { append(expires) }
                    }
                },
                color = colors.subtext,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                textAlign = TextAlign.Center,
            )
        }
        QrLoginStatus.APPROVED -> StatusText(
            stringResource(R.string.native_qr_login_approved),
            if (dark) Color(0xFF5EE9B5) else Color(0xFF009966),
            FontWeight.Medium,
        )
        QrLoginStatus.REJECTED -> StatusText(stringResource(R.string.native_qr_login_rejected), red)
        QrLoginStatus.EXPIRED -> StatusText(stringResource(R.string.native_qr_login_expired), colors.subtext)
    }
}

@Composable
private fun StatusText(text: String, color: Color, fontWeight: FontWeight = FontWeight.Normal) {
    Text(text, color = color, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = fontWeight, textAlign = TextAlign.Center)
}

/** The code's dark modules as one path, drawn crisp at any size. */
@Composable
private fun QrCodeImage(qr: QrCode, modifier: Modifier) {
    val path = remember(qr) {
        Path().apply {
            for (y in 0 until qr.size) {
                for (x in 0 until qr.size) {
                    if (qr.getModule(x, y)) addRect(Rect(x.toFloat(), y.toFloat(), x + 1f, y + 1f))
                }
            }
        }
    }
    Canvas(modifier) {
        val module = size.minDimension / (qr.size + 2 * QrMargin)
        scale(module, module, pivot = Offset.Zero) {
            translate(QrMargin.toFloat(), QrMargin.toFloat()) { drawPath(path, QrDark) }
        }
    }
}

/** deviceLinkClient.js's buildLinkUrl(), from this server's origin. */
private fun deviceLinkUrl(serverUrl: String, token: String): String =
    "${originOf(serverUrl) ?: serverUrl.trimEnd('/')}/#/device-link/${Uri.encode(token)}"

/** Like the web's `qrcode` package: level M, never boosted, the mask and
 *  the mode segmentation chosen for the smallest code. */
private fun encodeLinkQr(url: String): QrCode = QrCode.encodeSegments(
    QrSegmentAdvanced.makeSegmentsOptimally(url, QrCode.Ecc.MEDIUM, QrCode.MIN_VERSION, QrCode.MAX_VERSION),
    QrCode.Ecc.MEDIUM,
    QrCode.MIN_VERSION,
    QrCode.MAX_VERSION,
    -1,
    false,
)
