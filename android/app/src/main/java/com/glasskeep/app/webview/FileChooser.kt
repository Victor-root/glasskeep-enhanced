package com.glasskeep.app.webview

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

/**
 * The page's file inputs: opens the system picker and hands the chosen
 * files back to the WebView. Its result launchers are registered when it
 * is constructed, so it is created while the activity is.
 */
class FileChooser(private val activity: ComponentActivity) {

    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = activity.registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = if (result.resultCode == Activity.RESULT_OK) {
            result.data?.let { intent ->
                // Single URI (file manager)
                intent.data?.let { arrayOf(it) }
                    // clipData (Android 13+ photo picker)
                    ?: intent.clipData?.let { clip ->
                        Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                    }
                    ?: WebChromeClient.FileChooserParams.parseResult(result.resultCode, intent)
            }
        } else null
        fileUploadCallback?.onReceiveValue(data)
        fileUploadCallback = null
    }

    private val cameraPermissionLauncher = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* handled */ }

    /** WebChromeClient.onShowFileChooser. */
    fun show(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        fileUploadCallback?.onReceiveValue(null)
        fileUploadCallback = callback

        if (ContextCompat.checkSelfPermission(
                activity, Manifest.permission.CAMERA
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }

        fileChooserLauncher.launch(params.createIntent())
        return true
    }
}
