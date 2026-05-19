package com.glasskeep.app

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ServiceWorkerClient
import android.webkit.ServiceWorkerController
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsControllerCompat

class WebViewActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: androidx.swiperefreshlayout.widget.SwipeRefreshLayout
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var webAuthnBridge: WebAuthnBridge

    // Held while we wait for the POST_NOTIFICATIONS runtime grant on
    // Android 13+. Once the user replies, we re-attempt the notif post
    // for this release (or drop it on the floor if denied).
    private var pendingUpdateRelease: com.glasskeep.app.update.ReleaseInfo? = null
    private val updateNotificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val release = pendingUpdateRelease ?: return@registerForActivityResult
        pendingUpdateRelease = null
        if (granted) com.glasskeep.app.update.UpdateNotifier.show(this, release)
    }

    private val fileChooserLauncher = registerForActivityResult(
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

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* handled */ }

    // Holds the WebView's PermissionRequest while we ask Android for the matching
    // runtime permission (RECORD_AUDIO / CAMERA). Resolved in the launchers below.
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var pendingWebPermissionResources: Array<String>? = null

    private val recordAudioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> resolvePendingWebPermission(Manifest.permission.RECORD_AUDIO, granted) }

    private val webCameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> resolvePendingWebPermission(Manifest.permission.CAMERA, granted) }

    private fun resolvePendingWebPermission(perm: String, granted: Boolean) {
        val req = pendingWebPermissionRequest ?: return
        val requested = pendingWebPermissionResources ?: req.resources
        if (!granted) {
            // User denied — drop the whole request. WebRTC code on the page
            // will receive a NotAllowedError and can show its own message.
            req.deny()
            pendingWebPermissionRequest = null
            pendingWebPermissionResources = null
            return
        }
        // Granted: re-check all requested resources. If anything else still
        // needs a runtime grant, chain into that launcher; otherwise resolve.
        val needsAudio = requested.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        val needsVideo = requested.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) !=
                PackageManager.PERMISSION_GRANTED
        when {
            needsAudio && perm != Manifest.permission.RECORD_AUDIO -> {
                recordAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
            needsVideo && perm != Manifest.permission.CAMERA -> {
                webCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
            else -> {
                req.grant(requested)
                pendingWebPermissionRequest = null
                pendingWebPermissionResources = null
            }
        }
    }

    /** Called from JavaScript for theme-color sync and server change */
    inner class ThemeBridge {
        @JavascriptInterface
        fun onThemeColor(hexColor: String) {
            runOnUiThread { applySystemBarColor(hexColor) }
        }

        @JavascriptInterface
        fun setRefreshEnabled(enabled: Boolean) {
            runOnUiThread { swipeRefresh.isEnabled = enabled }
        }

        @JavascriptInterface
        fun changeServer() {
            runOnUiThread { showChangeServerDialog() }
        }

        /** Manual "check for updates" hook for the in-app Settings
         *  panel. Bypasses the 12h throttle. The UI side calls this
         *  via window.AndroidTheme.checkForUpdate() and we surface
         *  the outcome with a Toast + the standard heads-up notif
         *  (so the user gets the same "tap to install" path as an
         *  automatic discovery) AND an in-app AlertDialog so a user
         *  who's still on the Settings panel gets an immediate,
         *  visible answer instead of having to drag down the
         *  notification shade. */
        @JavascriptInterface
        fun checkForUpdate() {
            runOnUiThread {
                Toast.makeText(
                    this@WebViewActivity,
                    R.string.update_checking,
                    Toast.LENGTH_SHORT,
                ).show()
                com.glasskeep.app.update.UpdateManager.forceCheck(this@WebViewActivity) { release ->
                    if (release != null) {
                        postUpdateNotification(release)
                        showUpdateAvailableDialog(release)
                    } else {
                        Toast.makeText(
                            this@WebViewActivity,
                            R.string.update_up_to_date,
                            Toast.LENGTH_LONG,
                        ).show()
                    }
                }
            }
        }

        /** Tell the webapp it's running inside the Android TV launcher.
         *  The web layer reads window.__isAndroidTV on boot to swap the
         *  edit-heavy phone UI for a comfy, focus-driven viewer. */
        @JavascriptInterface
        fun isAndroidTV(): Boolean = isTelevision()

        /** Open a URL in the device's external browser. Used by docs /
         *  changelog links so the user isn't navigated AWAY from the
         *  app inside the WebView (which would unmount the modal they
         *  were reading). `window.open(url, "_blank")` doesn't pop a
         *  new tab here because setSupportMultipleWindows(false), so
         *  the JS layer calls this bridge method instead. */
        @JavascriptInterface
        fun openExternalUrl(url: String?) {
            if (url.isNullOrBlank()) return
            runOnUiThread { openUrlExternally(Uri.parse(url)) }
        }

        @JavascriptInterface
        fun saveBlobFile(base64Data: String, filename: String, mimeType: String) {
            try {
                val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                val contentValues = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(android.provider.MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(android.provider.MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues
                )
                if (uri == null) {
                    runOnUiThread {
                        Toast.makeText(this@WebViewActivity, getString(R.string.download_error), Toast.LENGTH_SHORT).show()
                    }
                    return
                }
                contentResolver.openOutputStream(uri)?.use { out -> out.write(bytes) }
                val updateValues = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                }
                contentResolver.update(uri, updateValues, null, null)
                runOnUiThread {
                    Toast.makeText(this@WebViewActivity, getString(R.string.download_complete, filename), Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("GlassKeep", "saveBlobFile failed", e)
                runOnUiThread {
                    Toast.makeText(this@WebViewActivity, getString(R.string.download_error), Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    // Latest system-bar / display-cutout insets in CSS pixels (dp). Captured by the
    // OnApplyWindowInsetsListener on the WebView and replayed via `injectSafeAreaInsets`
    // on every page load, so the React app has correct values BEFORE the first paint.
    //
    // We do this because the Android 15 WebView on stock Pixel images returns 0 for
    // env(safe-area-inset-bottom) (the FAB ended up half-hidden behind the gesture/
    // 3-button bar). The Activity already knows the real insets — we just hand them
    // to the page as CSS custom properties so styles can read `var(--safe-bottom)`
    // with `env(safe-area-inset-bottom)` as the fallback for non-WebView contexts.
    private var safeAreaTopDp = 0.0
    private var safeAreaBottomDp = 0.0
    private var safeAreaLeftDp = 0.0
    private var safeAreaRightDp = 0.0

    private fun injectSafeAreaInsets() {
        // Skip injection if the WebView hasn't loaded any page yet — evaluating JS
        // before there's a document just queues a useless call.
        if (!this::webView.isInitialized) return
        val js = """
            (function(){
              var s = document.documentElement && document.documentElement.style;
              if (!s) return;
              s.setProperty('--android-inset-top',    '${safeAreaTopDp}px');
              s.setProperty('--android-inset-bottom', '${safeAreaBottomDp}px');
              s.setProperty('--android-inset-left',   '${safeAreaLeftDp}px');
              s.setProperty('--android-inset-right',  '${safeAreaRightDp}px');
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Self-update prompt. The background check just posts a system
        // notification when a newer APK is published — non-intrusive
        // and easy to dismiss. Tapping the notification triggers the
        // silent download + system installer.
        com.glasskeep.app.update.UpdateManager.checkInBackground(this) { release ->
            postUpdateNotification(release)
        }

        // Draw edge-to-edge: let the app handle system bar insets via CSS
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)

        // Allow content to render under the display cutout (status bar area in landscape)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        setContentView(R.layout.activity_webview)

        val url = intent.getStringExtra("url")
            ?: getSharedPreferences("glasskeep", MODE_PRIVATE).getString("server_url", null)
            ?: run { finish(); return }

        webView = findViewById(R.id.webview)

        // Pull-to-refresh
        swipeRefresh = findViewById(R.id.swipe_refresh)
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        // Shift the refresh spinner below the status bar (edge-to-edge layout
        // puts the SwipeRefreshLayout at y=0, so the default end position sits
        // behind the system bar and the arrow gets clipped on release).
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(swipeRefresh) { _, insets ->
            val topInset = insets.getInsets(
                androidx.core.view.WindowInsetsCompat.Type.statusBars()
            ).top
            val density = resources.displayMetrics.density
            val startPx = (-40 * density).toInt() + topInset
            val endPx = (64 * density).toInt() + topInset
            swipeRefresh.setProgressViewOffset(false, startPx, endPx)
            insets
        }
        // Hide spinner once page finishes loading (set in webViewClient below)

        // Service Worker support
        try {
            val swController = ServiceWorkerController.getInstance()
            swController.setServiceWorkerClient(object : ServiceWorkerClient() {
                override fun shouldInterceptRequest(
                    request: WebResourceRequest
                ): WebResourceResponse? = null
            })
        } catch (_: Exception) { }

        webAuthnBridge = WebAuthnBridge(this) { webView }

        // System-bar / display-cutout insets, in CSS pixels, exposed to the
        // WebView as `--android-inset-*` custom properties. The Android 15
        // WebView on stock Pixel images returns 0 for env(safe-area-inset-*)
        // even though the device IS edge-to-edge — the FAB ends up under the
        // navigation bar and the header floats below the status bar. Sourcing
        // the value from the Activity's WindowInsetsCompat avoids that bug
        // entirely, and the CSS keeps env() as a fallback for any non-WebView
        // context (PWA in a browser, desktop, etc.).
        //
        // Returning `insets` unchanged keeps the existing SwipeRefreshLayout
        // listener (registered above) working — insets only get consumed when
        // a listener returns CONSUMED, and we explicitly want them to keep
        // propagating to the WebView so other apps inside the layout still
        // see them.
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            // We use ONLY the systemBars insets (status bar + nav bar +
            // caption bar) — NOT the union with displayCutout. Devices
            // with a centre-top punch-hole (Pixel 8 and friends) report a
            // cutout.top a few dp larger than the visible status bar
            // because the cutout's bounding box extends slightly below the
            // bar to leave room for the camera optics. Including it pushes
            // the header 1-5 px below the actual status bar bottom edge,
            // leaving a thin gap where the page background shows through.
            // The WebView's own env() computation goes through systemBars
            // for the same reason — we just want to match it pixel-for-
            // pixel when we override the value.
            val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            val density = resources.displayMetrics.density
            safeAreaTopDp    = bars.top    / density.toDouble()
            safeAreaBottomDp = bars.bottom / density.toDouble()
            safeAreaLeftDp   = bars.left   / density.toDouble()
            safeAreaRightDp  = bars.right  / density.toDouble()
            injectSafeAreaInsets()
            insets
        }

        webView.apply {
            addJavascriptInterface(ThemeBridge(), "AndroidTheme")
            // Exposes window.AndroidPasskey to the WebView. The polyfill
            // injected on every page load (see onPageStarted below) wraps
            // it into the Promise-friendly window.GlassKeepAndroidPasskey
            // that passkeyClient.js looks for.
            addJavascriptInterface(webAuthnBridge, WebAuthnBridge.JS_INTERFACE_NAME)

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

                javaScriptCanOpenWindowsAutomatically = true
                setSupportMultipleWindows(false)
            }

            // Cookies
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(webView, true)
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val requestUrl = request.url.toString()
                    return if (requestUrl.startsWith(url)) {
                        false
                    } else {
                        // Link out of the app's own domain (a note's external
                        // link, a redirect to GitHub, etc.). Hand it to a
                        // Custom Tab so the user stays in our task stack —
                        // hitting back returns to the WebView instead of
                        // dumping them into a separate browser app.
                        openUrlExternally(request.url)
                        true
                    }
                }

                override fun onPageStarted(
                    view: WebView,
                    pageUrl: String?,
                    favicon: android.graphics.Bitmap?
                ) {
                    super.onPageStarted(view, pageUrl, favicon)
                    // Plant window.__isAndroidTV BEFORE React boots so the
                    // first render already picks the TV layout — otherwise
                    // we'd flash the phone UI for a few hundred ms while
                    // the bundle parses, then re-render.
                    val isTv = isTelevision()
                    view.evaluateJavascript(
                        "window.__isAndroidTV=$isTv;", null
                    )
                    if (isTv) {
                        // Pull-to-refresh has no place on a couch: there's
                        // no touch surface to swipe with, and a stray D-pad
                        // press shouldn't reload the whole web layer.
                        swipeRefresh.isEnabled = false
                    }
                    // Plant the system dark-mode flag BEFORE React mounts.
                    // Without this, the page initialised dark from
                    // matchMedia("(prefers-color-scheme: dark)") — which
                    // returns `false` in Android WebView unless dark mode
                    // is explicitly propagated to the renderer. Result: a
                    // pull-to-refresh would always boot the app in light
                    // mode even with the system in dark, because by the
                    // time onPageFinished's window.__setDarkMode(true) ran,
                    // React had already painted the light theme.
                    val isDarkBoot = isDarkMode()
                    view.evaluateJavascript(
                        "window.__isAndroidDarkMode=$isDarkBoot;", null
                    )
                    // Install the passkey polyfill before any page script
                    // runs. The polyfill is idempotent — re-injecting it
                    // on SPA navigations is harmless.
                    view.evaluateJavascript(WebAuthnBridge.POLYFILL_JS, null)
                    // Replay the cached system-bar insets so the React app
                    // has the correct --android-inset-* values BEFORE the
                    // first paint. We can't rely on the WindowInsets
                    // listener firing at the right moment relative to
                    // navigation — the page might mount on top of stale
                    // (or zero) values otherwise.
                    injectSafeAreaInsets()
                }

                override fun onPageFinished(view: WebView, pageUrl: String?) {
                    super.onPageFinished(view, pageUrl)
                    swipeRefresh.isRefreshing = false
                    // Re-assert the TV flag in case the page navigated
                    // (login → notes) and reset the global.
                    view.evaluateJavascript(
                        "window.__isAndroidTV=${isTelevision()};", null
                    )
                    // Push current system dark mode state to web app on load
                    val isDark = isDarkMode()
                    view.evaluateJavascript(
                        "if(window.__setDarkMode)window.__setDarkMode($isDark)", null
                    )
                    // Watch <meta name="theme-color"> for status/nav bar sync
                    view.evaluateJavascript("""
                        (function(){
                          if(window.__themeColorSync) return;
                          window.__themeColorSync=true;
                          var last='';
                          function sync(){
                            var m=document.querySelector('meta[name="theme-color"]');
                            var c=m?m.getAttribute('content'):'';
                            if(c&&c!==last){last=c;try{window.AndroidTheme.onThemeColor(c)}catch(e){}}
                          }
                          new MutationObserver(sync).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['content']});
                          sync();
                        })()
                    """.trimIndent(), null)
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams
                ): Boolean {
                    fileUploadCallback?.onReceiveValue(null)
                    fileUploadCallback = callback

                    if (ContextCompat.checkSelfPermission(
                            this@WebViewActivity, Manifest.permission.CAMERA
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }

                    fileChooserLauncher.launch(params.createIntent())
                    return true
                }

                // WebView denies all getUserMedia requests by default — without
                // this override, the audio-notes recorder (and any future
                // mic/camera feature) silently fails on Android. We grant the
                // request once the matching runtime permission is held.
                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread {
                        val supported = request.resources.filter {
                            it == PermissionRequest.RESOURCE_AUDIO_CAPTURE ||
                                it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
                        }.toTypedArray()
                        if (supported.isEmpty()) {
                            request.deny()
                            return@runOnUiThread
                        }
                        // Drop any in-flight request — only the latest matters.
                        pendingWebPermissionRequest?.deny()
                        pendingWebPermissionRequest = request
                        pendingWebPermissionResources = supported

                        val needsAudio = supported.contains(
                            PermissionRequest.RESOURCE_AUDIO_CAPTURE
                        ) && ContextCompat.checkSelfPermission(
                            this@WebViewActivity, Manifest.permission.RECORD_AUDIO
                        ) != PackageManager.PERMISSION_GRANTED
                        val needsVideo = supported.contains(
                            PermissionRequest.RESOURCE_VIDEO_CAPTURE
                        ) && ContextCompat.checkSelfPermission(
                            this@WebViewActivity, Manifest.permission.CAMERA
                        ) != PackageManager.PERMISSION_GRANTED

                        when {
                            needsAudio -> recordAudioPermissionLauncher.launch(
                                Manifest.permission.RECORD_AUDIO
                            )
                            needsVideo -> webCameraPermissionLauncher.launch(
                                Manifest.permission.CAMERA
                            )
                            else -> {
                                request.grant(supported)
                                pendingWebPermissionRequest = null
                                pendingWebPermissionResources = null
                            }
                        }
                    }
                }

                override fun onPermissionRequestCanceled(request: PermissionRequest) {
                    runOnUiThread {
                        if (pendingWebPermissionRequest == request) {
                            pendingWebPermissionRequest = null
                            pendingWebPermissionResources = null
                        }
                    }
                }
            }

            // Downloads
            setDownloadListener { downloadUrl, userAgent, contentDisposition, mimeType, _ ->
                if (downloadUrl.startsWith("blob:")) {
                    // blob: URLs can't be downloaded by DownloadManager —
                    // fetch in JS, convert to base64, pass to native bridge
                    val filename = URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType)
                    webView.evaluateJavascript("""
                        (async function(){
                          try {
                            var r = await fetch('$downloadUrl');
                            var b = await r.blob();
                            var reader = new FileReader();
                            reader.onloadend = function(){
                              var base64 = reader.result.split(',')[1] || '';
                              window.AndroidTheme.saveBlobFile(base64, '$filename', b.type || '$mimeType');
                            };
                            reader.readAsDataURL(b);
                          } catch(e){ console.error('blob download failed', e); }
                        })()
                    """.trimIndent(), null)
                } else {
                    try {
                        val req = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
                            setMimeType(mimeType)
                            addRequestHeader("Cookie", CookieManager.getInstance().getCookie(downloadUrl))
                            addRequestHeader("User-Agent", userAgent)
                            val filename = URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType)
                            setTitle(filename)
                            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                        }
                        getSystemService(DownloadManager::class.java).enqueue(req)
                        Toast.makeText(this@WebViewActivity, getString(R.string.download_started), Toast.LENGTH_SHORT).show()
                    } catch (_: Exception) {
                        Toast.makeText(this@WebViewActivity, getString(R.string.download_error), Toast.LENGTH_SHORT).show()
                    }
                }
            }

            loadUrl(url)
        }

        // Handle gesture back navigation (swipe back)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.history.back()", null)
            }
        })
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val isDark = (newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES
        webView.evaluateJavascript(
            "if(window.__setDarkMode)window.__setDarkMode($isDark)", null
        )
    }

    /** Open `uri` via the user's default browser using Android Custom
     *  Tabs — Chrome / Brave / Firefox / etc. render the page as an
     *  overlay on top of our task instead of a cold cross-app jump.
     *  Falls back to a plain ACTION_VIEW intent if no installed browser
     *  exposes a CustomTabsService (rare on modern devices), and to a
     *  short toast as a last resort so the tap is still acknowledged. */
    private fun openUrlExternally(uri: Uri) {
        try {
            val tab = androidx.browser.customtabs.CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
            tab.launchUrl(this, uri)
            return
        } catch (_: Exception) {
            // Fall through to the legacy ACTION_VIEW path.
        }
        try {
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, uri.toString(), Toast.LENGTH_SHORT).show()
        }
    }

    private fun applySystemBarColor(hexColor: String) {
        try {
            val color = Color.parseColor(hexColor)
            window.statusBarColor = color
            window.navigationBarColor = color

            val luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255
            val isLight = luminance > 0.5

            val controller = WindowInsetsControllerCompat(window, window.decorView)
            controller.isAppearanceLightStatusBars = isLight
            controller.isAppearanceLightNavigationBars = isLight
        } catch (_: Exception) { }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var backHeld = false
    private var dialogShown = false
    private val longBackRunnable = Runnable {
        dialogShown = true
        showChangeServerDialog()
    }

    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {
        if (keyCode == android.view.KeyEvent.KEYCODE_BACK) {
            if (!backHeld) {
                backHeld = true
                handler.postDelayed(longBackRunnable, 3000)
            }
            return true
        }
        // "More options" / "Menu" key on most TV remotes (also the same
        // key that opens the system settings rail in the Android TV
        // launcher). Forward it to the webapp as a custom event so the
        // TV viewer can use it to toggle its sidebar — same muscle
        // memory as native apps.
        if (keyCode == android.view.KeyEvent.KEYCODE_MENU) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('tv-menu-key'));", null
            )
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: android.view.KeyEvent?): Boolean {
        if (keyCode == android.view.KeyEvent.KEYCODE_BACK) {
            handler.removeCallbacks(longBackRunnable)
            backHeld = false
            if (!dialogShown) {
                webView.evaluateJavascript("window.history.back()", null)
            }
            dialogShown = false
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    private fun isDarkMode(): Boolean {
        return (resources.configuration.uiMode and
                android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                android.content.res.Configuration.UI_MODE_NIGHT_YES
    }

    /** True when we're running on Android TV / leanback (Nvidia Shield,
     *  Chromecast w/ Google TV, Mi Box, etc). Used to switch the webapp
     *  into the read-friendly TV viewer on boot. */
    private fun isTelevision(): Boolean {
        val uiMode = resources.configuration.uiMode and
                android.content.res.Configuration.UI_MODE_TYPE_MASK
        if (uiMode == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION) return true
        return packageManager.hasSystemFeature("android.software.leanback")
    }

    private fun showChangeServerDialog() {
        val dark = isDarkMode()
        val dialog = android.app.Dialog(this)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val dp = resources.displayMetrics.density
        val pad = (24 * dp).toInt()
        val padSmall = (16 * dp).toInt()
        val indigo = Color.parseColor("#6366f1")
        val violet = Color.parseColor("#7c3aed")

        val cardColor = if (dark) Color.parseColor("#282828") else Color.WHITE
        val titleColor = if (dark) Color.parseColor("#e5e7eb") else Color.parseColor("#1f2937")
        val msgColor = if (dark) Color.parseColor("#9ca3af") else Color.parseColor("#6b7280")
        val iconCircleColor = if (dark) Color.parseColor("#2d2644") else Color.parseColor("#f0e8ff")
        val cancelBgColor = if (dark) Color.parseColor("#363636") else Color.parseColor("#f3f4f6")
        val cancelTextColor = if (dark) Color.parseColor("#9ca3af") else Color.parseColor("#6b7280")

        // Card container
        val card = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            val bg = android.graphics.drawable.GradientDrawable().apply {
                setColor(cardColor)
                cornerRadius = 20 * dp
            }
            background = bg
            elevation = 16 * dp
        }

        // Icon circle
        val iconBg = android.widget.FrameLayout(this).apply {
            val size = (48 * dp).toInt()
            layoutParams = android.widget.LinearLayout.LayoutParams(size, size).apply {
                gravity = android.view.Gravity.CENTER_HORIZONTAL
                bottomMargin = padSmall
            }
            val circle = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(iconCircleColor)
            }
            background = circle
        }
        val iconView = android.widget.ImageView(this).apply {
            setImageResource(R.drawable.ic_swap_server)
            val iconPad = (12 * dp).toInt()
            setPadding(iconPad, iconPad, iconPad, iconPad)
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        iconBg.addView(iconView)
        card.addView(iconBg)

        // Title
        val title = android.widget.TextView(this).apply {
            text = getString(R.string.dialog_change_server)
            textSize = 18f
            setTextColor(titleColor)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = android.view.Gravity.CENTER
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (8 * dp).toInt() }
        }
        card.addView(title)

        // Message
        val msg = android.widget.TextView(this).apply {
            text = getString(R.string.dialog_change_message)
            textSize = 14f
            setTextColor(msgColor)
            gravity = android.view.Gravity.CENTER
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = pad }
        }
        card.addView(msg)

        // Buttons row
        val row = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Cancel button
        val btnCancel = android.widget.TextView(this).apply {
            text = getString(R.string.dialog_no)
            textSize = 15f
            setTextColor(cancelTextColor)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = android.view.Gravity.CENTER
            setPadding(0, (12 * dp).toInt(), 0, (12 * dp).toInt())
            val bg = android.graphics.drawable.GradientDrawable().apply {
                setColor(cancelBgColor)
                cornerRadius = 12 * dp
            }
            background = bg
            layoutParams = android.widget.LinearLayout.LayoutParams(
                0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f
            ).apply { marginEnd = (6 * dp).toInt() }
            setOnClickListener { dialog.dismiss() }
        }
        row.addView(btnCancel)

        // Confirm button with gradient
        val btnConfirm = android.widget.TextView(this).apply {
            text = getString(R.string.dialog_yes)
            textSize = 15f
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = android.view.Gravity.CENTER
            setPadding(0, (12 * dp).toInt(), 0, (12 * dp).toInt())
            val bg = android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(indigo, violet)
            ).apply { cornerRadius = 12 * dp }
            background = bg
            layoutParams = android.widget.LinearLayout.LayoutParams(
                0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f
            ).apply { marginStart = (6 * dp).toInt() }
            setOnClickListener {
                dialog.dismiss()
                getSharedPreferences("glasskeep", MODE_PRIVATE)
                    .edit().remove("server_url").apply()
                val intent = Intent(this@WebViewActivity, MainActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            }
        }
        row.addView(btnConfirm)

        card.addView(row)

        dialog.setContentView(card)
        dialog.window?.setLayout(
            (resources.displayMetrics.widthPixels * 0.85).toInt(),
            android.view.WindowManager.LayoutParams.WRAP_CONTENT
        )
        dialog.show()
    }

    /**
     * Fired on the main thread when UpdateManager's background check
     * confirms a newer APK is published. Posts the update-available
     * notification, requesting the POST_NOTIFICATIONS runtime grant
     * first on Android 13+ if needed. If the user denies, the update
     * path stays dormant until they enable notifications themselves.
     */
    /**
     * In-app AlertDialog popped after the manual update check from
     * Settings → Application → "Check for updates". The dialog mirrors
     * the notification's content but lives inside the app so a user
     * who runs the check from the panel gets an immediate, visible
     * answer instead of having to drag down the notification shade.
     */
    private fun showUpdateAvailableDialog(release: com.glasskeep.app.update.ReleaseInfo) {
        if (isFinishing || isDestroyed) return
        val message = getString(R.string.update_dialog_message, release.versionName)
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(R.string.update_dialog_title)
            .setMessage(message)
            .setCancelable(true)
            .setPositiveButton(R.string.update_dialog_download) { _, _ ->
                Toast.makeText(this, R.string.update_downloading, Toast.LENGTH_SHORT).show()
                com.glasskeep.app.update.UpdateManager.downloadAndInstall(this, release) { ok ->
                    if (!ok) {
                        Toast.makeText(this, R.string.update_download_failed, Toast.LENGTH_LONG).show()
                    }
                }
            }
            .setNegativeButton(R.string.update_dialog_later, null)
            .show()
    }

    private fun postUpdateNotification(release: com.glasskeep.app.update.ReleaseInfo) {
        if (isFinishing || isDestroyed) return
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            pendingUpdateRelease = release
            updateNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        com.glasskeep.app.update.UpdateNotifier.show(this, release)
    }
}
