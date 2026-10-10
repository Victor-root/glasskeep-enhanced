package com.glasskeep.app.webview

import android.Manifest
import android.content.pm.PackageManager
import android.webkit.PermissionRequest
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

/**
 * WebView denies all getUserMedia requests by default: without this, the
 * audio-notes recorder (and any future mic/camera feature) silently fails
 * on Android. A request is granted once the matching runtime permission is
 * held. Its result launchers are registered when it is constructed, so it
 * is created while the activity is.
 */
class MediaCapturePermissions(private val activity: ComponentActivity) {

    // Holds the WebView's PermissionRequest while we ask Android for the matching
    // runtime permission (RECORD_AUDIO / CAMERA). Resolved in the launchers below.
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var pendingWebPermissionResources: Array<String>? = null

    private val recordAudioPermissionLauncher = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> resolvePendingWebPermission(Manifest.permission.RECORD_AUDIO, granted) }

    private val webCameraPermissionLauncher = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> resolvePendingWebPermission(Manifest.permission.CAMERA, granted) }

    /** WebChromeClient.onPermissionRequest. */
    fun onPermissionRequest(request: PermissionRequest) {
        activity.runOnUiThread {
            val supported = request.resources.filter {
                it == PermissionRequest.RESOURCE_AUDIO_CAPTURE ||
                    it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
            }.toTypedArray()
            if (supported.isEmpty()) {
                request.deny()
                return@runOnUiThread
            }
            // Drop any in-flight request: only the latest matters.
            pendingWebPermissionRequest?.deny()
            pendingWebPermissionRequest = request
            pendingWebPermissionResources = supported

            askNextOrGrant(request, supported, answered = null)
        }
    }

    /** WebChromeClient.onPermissionRequestCanceled. */
    fun onPermissionRequestCanceled(request: PermissionRequest) {
        activity.runOnUiThread {
            if (pendingWebPermissionRequest == request) {
                pendingWebPermissionRequest = null
                pendingWebPermissionResources = null
            }
        }
    }

    private fun resolvePendingWebPermission(perm: String, granted: Boolean) {
        val req = pendingWebPermissionRequest ?: return
        val requested = pendingWebPermissionResources ?: req.resources
        if (!granted) {
            // User denied: drop the whole request. WebRTC code on the page
            // will receive a NotAllowedError and can show its own message.
            req.deny()
            pendingWebPermissionRequest = null
            pendingWebPermissionResources = null
            return
        }
        // Granted: re-check all requested resources. If anything else still
        // needs a runtime grant, chain into that launcher; otherwise resolve.
        askNextOrGrant(req, requested, answered = perm)
    }

    /** Asks for the first runtime permission [requested] still lacks, other
     *  than the one the user has just [answered], or grants the request. */
    private fun askNextOrGrant(req: PermissionRequest, requested: Array<String>, answered: String?) {
        val needsAudio = requested.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        val needsVideo = requested.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) !=
                PackageManager.PERMISSION_GRANTED
        when {
            needsAudio && answered != Manifest.permission.RECORD_AUDIO -> {
                recordAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
            needsVideo && answered != Manifest.permission.CAMERA -> {
                webCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
            else -> {
                req.grant(requested)
                pendingWebPermissionRequest = null
                pendingWebPermissionResources = null
            }
        }
    }
}
