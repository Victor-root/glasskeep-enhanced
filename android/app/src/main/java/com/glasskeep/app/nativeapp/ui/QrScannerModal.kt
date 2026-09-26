package com.glasskeep.app.nativeapp.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.DeviceLinkInfoResponse
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.URI
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

private enum class QrScanPhase { STARTING, SCANNING, WRONG_ORIGIN, FETCHING, CONFIRM, APPROVING, DONE, ERROR }

/** How a phase's heading is coloured (QrScannerModal.jsx's PhaseCard kinds). */
private enum class PhaseKind { INFO, SUCCESS, WARNING, ERROR }

/** qr-scanner throws a bare string when the camera can't start, which the
 *  web's modal can only show as this. */
private const val CameraErrorMessage = "Camera error"

/** The library's scan-region brackets, drawn in a 238-unit square. */
private const val ScanRegionPath =
    "M31 2H10a8 8 0 0 0-8 8v21M207 2h21a8 8 0 0 1 8 8v21m0 176v21a8 8 0 0 1-8 8h-21m-176 0H10a8 8 0 0 1-8-8v-21"

/**
 * QrScannerModal.jsx, the phone half of the cross-device sign-in: a card
 * over whatever screen opened it (Settings, the header, the launcher
 * shortcut) that scans the QR another device's login screen shows,
 * checks it points at this server, then asks to approve that device.
 *
 * The phases are the web's own, including one detail that looks like an
 * asymmetry but is faithfully ported: leaving any way but Reject (the X,
 * back, the backdrop, the error and wrong-origin buttons) never calls
 * /api/device-link/reject, the challenge simply expires on its own.
 */
@Composable
internal fun QrScannerModal(container: NativeAppContainer, serverUrl: String, onClose: () -> Unit) {
    val dark = LocalGkDark.current
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val toasts = LocalGkToasts.current
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

    var phase by remember { mutableStateOf(QrScanPhase.STARTING) }
    var errorText by remember { mutableStateOf("") }
    var linkToken by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<DeviceLinkInfoResponse?>(null) }
    var scannedOrigin by remember { mutableStateOf<String?>(null) }
    var cameraGranted by remember { mutableStateOf(false) }
    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    var cameraProvider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    // Checked (and set) only from inside handleDecoded below, which always
    // runs on the main thread via scope.launch: a shaky camera re-decoding
    // the same still-visible QR every frame can't double-submit, the same
    // guard QrScannerModal.jsx keeps in its own submittedRef.
    val hasScanned = remember { mutableStateOf(false) }

    fun handleDecoded(raw: String) {
        scope.launch {
            if (hasScanned.value) return@launch
            val parsed = parseDeviceLinkUrl(raw) ?: return@launch
            hasScanned.value = true
            cameraProvider?.unbindAll()
            val ownOrigin = originOf(serverUrl)
            if (ownOrigin == null || parsed.origin != ownOrigin) {
                scannedOrigin = parsed.origin
                phase = QrScanPhase.WRONG_ORIGIN
                return@launch
            }
            linkToken = parsed.token
            phase = QrScanPhase.FETCHING
            try {
                info = repository.fetchDeviceLinkInfo(parsed.token)
                phase = QrScanPhase.CONFIRM
            } catch (t: Throwable) {
                errorText = context.localizedServerError(fetchErrorText(t), R.string.native_qr_scan_info_failed)
                phase = QrScanPhase.ERROR
            }
        }
    }

    fun approve() {
        val token = linkToken ?: return
        phase = QrScanPhase.APPROVING
        scope.launch {
            try {
                repository.approveDeviceLink(token)
                phase = QrScanPhase.DONE
                toasts.success(context.getString(R.string.native_qr_scan_approved_title), "qr")
                delay(900)
                onClose()
            } catch (t: Throwable) {
                errorText = context.localizedServerError(fetchErrorText(t), R.string.native_qr_scan_approve_failed)
                phase = QrScanPhase.ERROR
            }
        }
    }

    fun reject() {
        val token = linkToken
        scope.launch {
            if (token != null) {
                try {
                    repository.rejectDeviceLink(token)
                } catch (t: Throwable) {
                    NativeDebug.e("QrScannerModal rejectDeviceLink failed (best-effort)", t)
                }
            }
            onClose()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            cameraGranted = true
        } else {
            errorText = CameraErrorMessage
            phase = QrScanPhase.ERROR
        }
    }

    LaunchedEffect(Unit) {
        val already = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        if (already) cameraGranted = true else permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val barcodeScanner = remember {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    }

    // Binds once permission is granted and the AndroidView below has
    // handed back its PreviewView. Nothing here has a lifecycle of its own
    // (it shares the Activity's), so bindToLifecycle alone would keep the
    // camera running after the card closes; the DisposableEffect below
    // unbinds explicitly instead, as a decoded QR does.
    LaunchedEffect(cameraGranted, previewView) {
        val view = previewView ?: return@LaunchedEffect
        if (!cameraGranted) return@LaunchedEffect
        try {
            val provider = context.getCameraProvider()
            cameraProvider = provider
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { it.setAnalyzer(cameraExecutor, BarcodeAnalyzer(barcodeScanner, hasScanned) { raw -> handleDecoded(raw) }) }
            provider.unbindAll()
            provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            phase = QrScanPhase.SCANNING
        } catch (t: Throwable) {
            NativeDebug.e("QrScannerModal camera bind failed", t)
            errorText = CameraErrorMessage
            phase = QrScanPhase.ERROR
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            cameraProvider?.unbindAll()
            barcodeScanner.close()
            cameraExecutor.shutdown()
        }
    }

    GkDialog(
        onDismissRequest = onClose,
        dark = dark,
        borderColor = borderColor,
        maxWidth = 384.dp,
        screenPadding = 16.dp,
        widthFraction = 0.94f,
        cornerRadius = 16.dp,
        contentPadding = 20.dp,
    ) {
        Box(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth()) {
                Text(
                    stringResource(R.string.native_qr_scan_title),
                    color = titleColor,
                    fontSize = 18.sp,
                    lineHeight = 28.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(end = 32.dp),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(
                        if (phase == QrScanPhase.CONFIRM) R.string.native_qr_scan_confirm_explain else R.string.native_qr_scan_explain,
                    ),
                    color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                    fontSize = 14.sp,
                    lineHeight = 19.25.sp,
                )
                // The explanation's mb-3, which also swallows the next
                // card's own mt-2.
                Spacer(Modifier.height(12.dp))
                when (phase) {
                    QrScanPhase.STARTING, QrScanPhase.SCANNING -> CameraBox(
                        cameraGranted = cameraGranted,
                        starting = phase == QrScanPhase.STARTING,
                        onPreviewView = { previewView = it },
                    )
                    QrScanPhase.WRONG_ORIGIN -> PhaseCard(
                        kind = PhaseKind.WARNING,
                        title = stringResource(R.string.native_qr_scan_wrong_origin_title),
                        body = stringResource(R.string.native_qr_scan_wrong_origin_body, scannedOrigin ?: "?"),
                        dark = dark,
                        themeId = themeId,
                        primaryLabel = stringResource(R.string.native_qr_scan_close),
                        onPrimary = onClose,
                    )
                    QrScanPhase.FETCHING -> PhaseCard(
                        kind = PhaseKind.INFO,
                        title = stringResource(R.string.native_qr_scan_fetching),
                        dark = dark,
                        themeId = themeId,
                        spinner = true,
                    )
                    QrScanPhase.CONFIRM -> info?.let { data ->
                        ConfirmCard(data, dark, themeId, borderColor, onApprove = { approve() }, onReject = { reject() })
                    }
                    QrScanPhase.APPROVING -> PhaseCard(
                        kind = PhaseKind.INFO,
                        title = stringResource(R.string.native_qr_scan_approving),
                        dark = dark,
                        themeId = themeId,
                        spinner = true,
                    )
                    QrScanPhase.DONE -> PhaseCard(
                        kind = PhaseKind.SUCCESS,
                        title = stringResource(R.string.native_qr_scan_approved_title),
                        body = stringResource(R.string.native_qr_scan_approved_body),
                        dark = dark,
                        themeId = themeId,
                    )
                    QrScanPhase.ERROR -> PhaseCard(
                        kind = PhaseKind.ERROR,
                        title = stringResource(R.string.native_qr_scan_error_title),
                        body = errorText,
                        dark = dark,
                        themeId = themeId,
                        primaryLabel = stringResource(R.string.native_qr_scan_close),
                        onPrimary = onClose,
                    )
                }
            }
            // `absolute top-3 right-3`: 12px from the card's corner, over
            // its 20px padding.
            val closeLabel = stringResource(R.string.native_qr_scan_close)
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 8.dp, y = (-8).dp)
                    .size(32.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .semantics { contentDescription = closeLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onClose() },
                contentAlignment = Alignment.Center,
            ) {
                CloseIcon(size = 20.dp, tint = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282), strokeWidth = 2f)
            }
        }
    }
}

/** The 3:4 camera surface: the live preview under qr-scanner's pulsing
 *  amber brackets, covered by the camera glyph and a spinner until the
 *  stream runs. */
@Composable
private fun CameraBox(cameraGranted: Boolean, starting: Boolean, onPreviewView: (PreviewView) -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(3f / 4f)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black),
    ) {
        if (cameraGranted) {
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).apply {
                        // A TextureView, so the rounded clip applies to it.
                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }
                },
                modifier = Modifier.fillMaxSize(),
                update = onPreviewView,
            )
        }
        if (starting) {
            Column(
                modifier = Modifier.fillMaxSize().background(Color.Black),
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CameraIcon(size = 96.dp, tint = Color.White.copy(alpha = 0.8f), strokeWidth = 1.5f)
                SpinnerIcon(size = 24.dp, tint = Color(0xFF615FFF))
            }
        } else {
            ScanRegionHighlight(Modifier.fillMaxSize())
        }
    }
}

/** `highlightScanRegion`: brackets around the middle two thirds of the
 *  picture, breathing between 98% and 101% every 400ms. */
@Composable
private fun ScanRegionHighlight(modifier: Modifier) {
    val scale by rememberInfiniteTransition(label = "scanRegion").animateFloat(
        initialValue = 0.98f,
        targetValue = 1.01f,
        animationSpec = infiniteRepeatable(
            tween(durationMillis = 400, easing = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)),
            RepeatMode.Reverse,
        ),
        label = "scanRegionScale",
    )
    val path = remember { PathParser().parsePathString(ScanRegionPath).toPath() }
    Canvas(modifier) {
        val side = size.minDimension * 2f / 3f * scale
        val unit = side / 238f
        translate((size.width - side) / 2f, (size.height - side) / 2f) {
            scale(unit, unit, pivot = Offset.Zero) {
                drawPath(
                    path,
                    color = Color(0xFFE9B213),
                    style = Stroke(width = 4f, cap = StrokeCap.Round, join = StrokeJoin.Round),
                )
            }
        }
    }
}

/** PhaseCard: an optional spinner, the heading in its kind's colour, the
 *  body and an optional gradient button, all centred. */
@Composable
private fun PhaseCard(
    kind: PhaseKind,
    title: String,
    dark: Boolean,
    themeId: String,
    body: String? = null,
    spinner: Boolean = false,
    primaryLabel: String? = null,
    onPrimary: () -> Unit = {},
) {
    val titleColor = when (kind) {
        PhaseKind.SUCCESS -> if (dark) Color(0xFF5EE9B5) else Color(0xFF009966)
        PhaseKind.ERROR -> if (dark) Color(0xFFFF6467) else Color(0xFFE7000B)
        PhaseKind.WARNING -> if (dark) Color(0xFFFFD230) else Color(0xFFE17100)
        PhaseKind.INFO -> if (dark) Color(0xFFE5E7EB) else Color(0xFF364153)
    }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        if (spinner) {
            SpinnerIcon(size = 24.dp, tint = Color(0xFF615FFF))
            Spacer(Modifier.height(12.dp))
        }
        Text(title, color = titleColor, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        if (!body.isNullOrEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(
                body,
                color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
                fontSize = 14.sp,
                lineHeight = 19.25.sp,
                textAlign = TextAlign.Center,
            )
        }
        if (primaryLabel != null) {
            Spacer(Modifier.height(16.dp))
            GkGradientButton(label = primaryLabel, themeId = themeId, verticalPadding = 6.dp, onClick = onPrimary)
        }
    }
}

/** What the server knows of the other device, then Reject / Approve. */
@Composable
private fun ConfirmCard(
    info: DeviceLinkInfoResponse,
    dark: Boolean,
    themeId: String,
    borderColor: Color,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (dark) Color(0xFF1F1F1F) else Color(0xFFF9FAFB))
            .border(1.dp, borderColor, shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ConfirmRow(stringResource(R.string.native_qr_scan_field_browser), guessBrowser(info.userAgent), dark)
        ConfirmRow(stringResource(R.string.native_qr_scan_field_os), guessOs(info.userAgent), dark)
        ConfirmRow(stringResource(R.string.native_qr_scan_field_ip), info.ip ?: "?", dark, monospace = true)
    }
    Spacer(Modifier.height(16.dp))
    Row(
        modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        GkSecondaryButton(
            label = stringResource(R.string.native_qr_scan_reject),
            borderColor = borderColor,
            textColor = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153),
            modifier = Modifier.weight(1f).fillMaxHeight(),
            onClick = onReject,
        )
        GkGradientButton(
            label = stringResource(R.string.native_qr_scan_approve),
            themeId = themeId,
            modifier = Modifier.weight(1f).fillMaxHeight(),
            onClick = onApprove,
        )
    }
}

@Composable
private fun ConfirmRow(label: String, value: String, dark: Boolean, monospace: Boolean = false) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            label.uppercase(),
            color = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.3.sp,
            modifier = Modifier.alignByBaseline(),
        )
        Spacer(Modifier.width(12.dp))
        Text(
            value.ifEmpty { "-" },
            color = if (dark) Color(0xFFF3F4F6) else Color(0xFF1E2939),
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontFamily = if (monospace) FontFamily.Monospace else null,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.alignByBaseline().weight(1f, fill = false),
        )
    }
}

private class BarcodeAnalyzer(
    private val scanner: BarcodeScanner,
    private val hasScanned: MutableState<Boolean>,
    private val onDecoded: (String) -> Unit,
) : ImageAnalysis.Analyzer {
    override fun analyze(imageProxy: ImageProxy) {
        if (hasScanned.value) {
            imageProxy.close()
            return
        }
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        scanner.process(image)
            .addOnSuccessListener { barcodes ->
                barcodes.firstOrNull { !it.rawValue.isNullOrEmpty() }?.rawValue?.let(onDecoded)
            }
            .addOnCompleteListener {
                imageProxy.close()
            }
    }
}

private suspend fun Context.getCameraProvider(): ProcessCameraProvider = suspendCoroutine { cont ->
    val future = ProcessCameraProvider.getInstance(this)
    future.addListener({ cont.resume(future.get()) }, ContextCompat.getMainExecutor(this))
}

private data class DeviceLinkTarget(val token: String, val origin: String)

private val DEVICE_LINK_FRAGMENT_REGEX = Regex("^/device-link/([A-Za-z0-9_-]+)$")

// Mirrors window.location.origin normalization (scheme + host, lower-
// cased, default ports 443/80 omitted) so a phone whose configured
// server address happens to spell out ":443" still matches a PC whose
// browser address bar never shows a default port.
internal fun originOf(url: String): String? {
    val uri = try { URI(url) } catch (e: Exception) { return null }
    val scheme = uri.scheme?.lowercase() ?: return null
    val host = uri.host?.lowercase() ?: return null
    val port = uri.port
    val isDefaultPort = (scheme == "https" && port == 443) || (scheme == "http" && port == 80)
    return if (port == -1 || isDefaultPort) "$scheme://$host" else "$scheme://$host:$port"
}

// Mirrors deviceLinkClient.js's own parseLinkUrl(): the QR encodes
// "<origin>/#/device-link/<token>", treated as untrusted input since the
// camera has no idea what it's actually looking at.
private fun parseDeviceLinkUrl(scanned: String): DeviceLinkTarget? {
    val trimmed = scanned.trim()
    if (trimmed.isEmpty()) return null
    val uri = try { URI(trimmed) } catch (e: Exception) { return null }
    val fragment = uri.fragment ?: return null
    val match = DEVICE_LINK_FRAGMENT_REGEX.find(fragment) ?: return null
    val origin = originOf(trimmed) ?: return null
    return DeviceLinkTarget(token = match.groupValues[1], origin = origin)
}

// Quick-and-dirty UA fingerprinting for the confirmation card only, same
// scope and same bare-string matching as QrScannerModal.jsx's own
// guessBrowser/guessOs: never used for any security decision.
private fun guessBrowser(ua: String?): String {
    if (ua.isNullOrEmpty()) return "?"
    return when {
        ua.contains("Edg/", ignoreCase = true) -> "Edge"
        ua.contains("OPR/", ignoreCase = true) -> "Opera"
        ua.contains("Brave", ignoreCase = true) -> "Brave"
        ua.contains("Firefox", ignoreCase = true) -> "Firefox"
        ua.contains("Chrome/", ignoreCase = true) && !ua.contains("Edg/", ignoreCase = true) -> "Chrome"
        ua.contains("Safari", ignoreCase = true) && !ua.contains("Chrome", ignoreCase = true) -> "Safari"
        else -> ua.take(40)
    }
}

private fun guessOs(ua: String?): String {
    if (ua.isNullOrEmpty()) return "?"
    return when {
        ua.contains("Windows NT", ignoreCase = true) -> "Windows"
        ua.contains("Mac OS X", ignoreCase = true) -> "macOS"
        ua.contains("Android", ignoreCase = true) -> "Android"
        Regex("iPhone|iPad|iOS", RegexOption.IGNORE_CASE).containsMatchIn(ua) -> "iOS"
        ua.contains("Linux", ignoreCase = true) -> "Linux"
        else -> "?"
    }
}
