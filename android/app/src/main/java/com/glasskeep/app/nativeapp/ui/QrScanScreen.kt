package com.glasskeep.app.nativeapp.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.DeviceLinkInfoResponse
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkCardBg
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBgGradient
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightCardBg
import com.glasskeep.app.ui.LightSubtextColor
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

/**
 * Cross-device QR sign-in, phone side only (see server/routes/
 * deviceLinkRoutes.js and src/components/auth/QrScannerModal.jsx, the web
 * equivalent this screen ports). Reached from Settings -> Security
 * ("Sign in another device") or the launcher's existing "Scan PC login"
 * shortcut (see NativeAppActivity's EXTRA_OPEN_QR_SCANNER).
 *
 * Deliberately one-directional: this phone, already signed in, scans a QR
 * a PC's login screen is showing and approves it. There is no native
 * screen that DISPLAYS a QR for itself to sign in with, because nothing
 * in the product ever needed that direction (see this milestone's commit
 * message): the native app already has email/password and a passkey
 * button on its own login screen, both strictly easier than pointing a
 * second device's camera at this one.
 *
 * Phase machine mirrors QrScannerModal.jsx's own PHASES object exactly
 * (loading -> STARTING, scanning -> SCANNING, wrongOrigin -> WRONG_ORIGIN,
 * fetching -> FETCHING, confirm -> CONFIRM, approving -> APPROVING,
 * done -> DONE, error -> ERROR), including the one detail that looks like
 * an asymmetry but is faithfully ported, not invented: leaving this screen
 * any way other than tapping Reject (back arrow, system back, the
 * WRONG_ORIGIN/ERROR close button) never calls /api/device-link/reject,
 * it just abandons the challenge to expire on its own 2-minute TTL, same
 * as closing QrScannerModal's X button does on the web.
 */
private enum class QrScanPhase { STARTING, SCANNING, WRONG_ORIGIN, FETCHING, CONFIRM, APPROVING, DONE, ERROR }

@Composable
fun QrScanScreen(container: NativeAppContainer, serverUrl: String, onBack: () -> Unit) {
    val dark = isSystemInDarkTheme()
    val themeId = container.themeState.themeId
    val repository = remember(serverUrl) { container.notesRepository(serverUrl) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val bgModifier = if (dark) Modifier.background(DarkBgColor) else Modifier.background(LightBgGradient)
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val cardBg = if (dark) DarkCardBg else LightCardBg

    var phase by remember { mutableStateOf(QrScanPhase.STARTING) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var linkToken by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<DeviceLinkInfoResponse?>(null) }
    var scannedOrigin by remember { mutableStateOf<String?>(null) }
    var cameraGranted by remember { mutableStateOf(false) }
    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    // Checked (and set) only from inside handleDecoded below, which always
    // runs on the main thread via scope.launch: a shaky camera re-decoding
    // the same still-visible QR every frame can't double-submit, the same
    // guard QrScannerModal.jsx keeps in its own submittedRef.
    val hasScanned = remember { mutableStateOf(false) }

    val permissionDeniedMessage = stringResource(R.string.native_qr_scan_permission_denied)
    val wrongOriginBodyTemplate = stringResource(R.string.native_qr_scan_wrong_origin_body)
    val errorTemplate = stringResource(R.string.native_qr_scan_error_generic)
    val closeLabel = stringResource(R.string.native_qr_scan_close)

    fun handleDecoded(raw: String) {
        scope.launch {
            if (hasScanned.value) return@launch
            val parsed = parseDeviceLinkUrl(raw) ?: return@launch
            hasScanned.value = true
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
                NativeDebug.e("QrScanScreen fetchDeviceLinkInfo failed", t)
                errorMessage = String.format(errorTemplate, t.message ?: t.javaClass.simpleName)
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
                delay(900)
                onBack()
            } catch (t: Throwable) {
                NativeDebug.e("QrScanScreen approveDeviceLink failed", t)
                errorMessage = String.format(errorTemplate, t.message ?: t.javaClass.simpleName)
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
                    NativeDebug.e("QrScanScreen rejectDeviceLink failed (best-effort)", t)
                }
            }
            onBack()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            cameraGranted = true
        } else {
            errorMessage = permissionDeniedMessage
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
    var cameraProvider by remember { mutableStateOf<ProcessCameraProvider?>(null) }

    // Binds once permission is granted and the AndroidView below has
    // handed back its PreviewView. Navigation-Compose destinations share
    // the host Activity's lifecycle (there's no per-destination
    // LifecycleOwner the way Fragments get one), so bindToLifecycle alone
    // would keep the camera running after the user navigates back to
    // Settings; the DisposableEffect below unbinds explicitly instead.
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
            NativeDebug.e("QrScanScreen camera bind failed", t)
            errorMessage = String.format(errorTemplate, t.message ?: t.javaClass.simpleName)
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

    Box(Modifier.fillMaxSize().then(bgModifier)) {
        Column(Modifier.fillMaxSize()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(WorkspaceTheme.headerGradient(themeId, dark))
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onBack() }
                            .padding(6.dp),
                    ) {
                        BackArrowIcon(size = 22.dp, tint = titleColor)
                        Text(
                            stringResource(R.string.native_note_detail_back),
                            color = subtextColor,
                            fontSize = 14.sp,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.native_qr_scan_title),
                        color = titleColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                    )
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(WorkspaceTheme.headerBorderColor(themeId, dark)))
            }

            Column(Modifier.fillMaxSize().padding(16.dp)) {
                Text(
                    if (phase == QrScanPhase.CONFIRM) {
                        stringResource(R.string.native_qr_scan_confirm_explain)
                    } else {
                        stringResource(R.string.native_qr_scan_explain)
                    },
                    color = subtextColor,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(bottom = 12.dp),
                )

                if (cameraGranted) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(3f / 4f)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color.Black),
                        contentAlignment = Alignment.Center,
                    ) {
                        AndroidView(
                            factory = { ctx -> PreviewView(ctx).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } },
                            modifier = Modifier.fillMaxSize(),
                            update = { previewView = it },
                        )
                        if (phase == QrScanPhase.STARTING) {
                            CircularProgressIndicator(color = Color.White)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                }

                when (phase) {
                    QrScanPhase.FETCHING -> PhaseMessage(
                        title = stringResource(R.string.native_qr_scan_fetching),
                        subtextColor = subtextColor,
                        showSpinner = true,
                    )
                    QrScanPhase.APPROVING -> PhaseMessage(
                        title = stringResource(R.string.native_qr_scan_approving),
                        subtextColor = subtextColor,
                        showSpinner = true,
                    )
                    QrScanPhase.DONE -> PhaseMessage(
                        title = stringResource(R.string.native_qr_scan_approved_title),
                        subtextColor = subtextColor,
                        body = stringResource(R.string.native_qr_scan_approved_body),
                    )
                    QrScanPhase.WRONG_ORIGIN -> PhaseMessage(
                        title = stringResource(R.string.native_qr_scan_wrong_origin_title),
                        subtextColor = subtextColor,
                        body = String.format(wrongOriginBodyTemplate, scannedOrigin ?: "?"),
                        actionLabel = closeLabel,
                        onAction = onBack,
                    )
                    QrScanPhase.ERROR -> PhaseMessage(
                        title = stringResource(R.string.native_qr_scan_error_title),
                        subtextColor = subtextColor,
                        body = errorMessage.orEmpty(),
                        actionLabel = closeLabel,
                        onAction = onBack,
                    )
                    QrScanPhase.CONFIRM -> info?.let { data ->
                        ConfirmCard(
                            info = data,
                            titleColor = titleColor,
                            subtextColor = subtextColor,
                            borderColor = borderColor,
                            cardBg = cardBg,
                            onApprove = { approve() },
                            onReject = { reject() },
                        )
                    }
                    QrScanPhase.STARTING, QrScanPhase.SCANNING -> {}
                }
            }
        }
    }
}

@Composable
private fun PhaseMessage(
    title: String,
    subtextColor: Color,
    body: String? = null,
    showSpinner: Boolean = false,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
    ) {
        if (showSpinner) {
            CircularProgressIndicator(color = Indigo)
            Spacer(Modifier.height(12.dp))
        }
        Text(title, color = subtextColor, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        if (!body.isNullOrEmpty()) {
            Spacer(Modifier.height(6.dp))
            Text(body, color = subtextColor, fontSize = 13.sp)
        }
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(16.dp))
            TextButton(onClick = onAction) {
                Text(actionLabel, color = Indigo, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun ConfirmCard(
    info: DeviceLinkInfoResponse,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    cardBg: Color,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(cardBg)
            .border(width = 1.dp, color = borderColor, shape = RoundedCornerShape(12.dp))
            .padding(16.dp),
    ) {
        ConfirmRow(stringResource(R.string.native_qr_scan_field_browser), guessBrowser(info.userAgent), titleColor, subtextColor)
        Spacer(Modifier.height(6.dp))
        ConfirmRow(stringResource(R.string.native_qr_scan_field_os), guessOs(info.userAgent), titleColor, subtextColor)
        Spacer(Modifier.height(6.dp))
        ConfirmRow(stringResource(R.string.native_qr_scan_field_ip), info.ip ?: "?", titleColor, subtextColor)
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = onReject, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.native_qr_scan_reject), color = subtextColor, fontWeight = FontWeight.SemiBold)
            }
            TextButton(onClick = onApprove, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.native_qr_scan_approve), color = Indigo, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun ConfirmRow(label: String, value: String, titleColor: Color, subtextColor: Color) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = subtextColor, fontSize = 12.sp)
        Text(value, color = titleColor, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

private class BarcodeAnalyzer(
    private val scanner: BarcodeScanner,
    private val hasScanned: MutableState<Boolean>,
    private val onDecoded: (String) -> Unit,
) : ImageAnalysis.Analyzer {
    // Only this override touches the experimental ImageProxy.getImage()
    // getter (see mediaImage below); opting in here, rather than on the
    // whole class, keeps BarcodeAnalyzer itself an ordinary (stable)
    // constructor from QrScanScreen's point of view.
    @OptIn(ExperimentalGetImage::class)
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
private fun originOf(url: String): String? {
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
        ua.contains("Edg/") -> "Edge"
        ua.contains("OPR/") -> "Opera"
        ua.contains("Brave", ignoreCase = true) -> "Brave"
        ua.contains("Firefox", ignoreCase = true) -> "Firefox"
        ua.contains("Chrome/") && !ua.contains("Edg/") -> "Chrome"
        ua.contains("Safari", ignoreCase = true) && !ua.contains("Chrome") -> "Safari"
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
