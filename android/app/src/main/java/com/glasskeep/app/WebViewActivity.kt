package com.glasskeep.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ServiceWorkerClient
import android.webkit.ServiceWorkerController
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
import androidx.browser.customtabs.CustomTabsIntent
import com.glasskeep.app.net.CleartextPolicy
import com.glasskeep.app.reminders.RemindersBridge
import com.glasskeep.app.ui.ChangeServerDialog
import com.glasskeep.app.ui.isDarkMode
import com.glasskeep.app.ui.isTelevision
import com.glasskeep.app.update.UpdatePrompts
import com.glasskeep.app.webview.FileChooser
import com.glasskeep.app.webview.MediaCapturePermissions
import com.glasskeep.app.webview.SystemBars
import com.glasskeep.app.webview.ToastBridge
import com.glasskeep.app.webview.WebDownloads

class WebViewActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: androidx.swiperefreshlayout.widget.SwipeRefreshLayout
    private lateinit var systemBars: SystemBars
    private lateinit var webAuthnBridge: WebAuthnBridge
    // Debug builds only, see NetDebug.
    private var netDebug: NetDebug? = null

    // Reminder notification deep-link: the target note id (from a tap) plus a
    // flag for whether the web app has finished loading, so we only fire the
    // window.__glasskeepOpenNote hook when the page can actually handle it.
    private var pendingOpenNoteId: String? = null
    private var pageLoaded = false

    // The server address this screen was opened on.
    private lateinit var appUrl: String

    // Single sign-on: the provider is a third-party site that must not run
    // next to the bridges of this WebView, and passkeys only work in a real
    // browser. So it opens in the default browser as a sheet over the app
    // (a partial Custom Tab, which must be launched for a result), and the
    // outcome comes back through SsoReturnActivity, not as a result here.
    private val ssoLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { }

    // These register their result launchers as they are created, so they
    // are created with the activity. Keep their order: after a process
    // restart, results find their launcher by registration order.
    private val updatePrompts = UpdatePrompts(this) { webView }
    private val remindersBridge = RemindersBridge(this)
    private val fileChooser = FileChooser(this)
    private val mediaCapturePermissions = MediaCapturePermissions(this)

    private val downloads = WebDownloads(this)

    /** Called from JavaScript for theme-color sync and server change */
    inner class ThemeBridge {
        @JavascriptInterface
        fun onThemeColor(hexColor: String) {
            runOnUiThread { systemBars.setThemeColor(hexColor) }
        }

        /** Navigation bar colour of its own (an open note's footer), or ""
         *  to follow the theme colour again. */
        @JavascriptInterface
        fun onNavBarColor(hexColor: String) {
            runOnUiThread { systemBars.setNavBarColor(hexColor) }
        }

        /** Off while the page draws its own scrollbar, under its header,
         *  which the WebView's (always on top) cannot do. */
        @JavascriptInterface
        fun setNativePageScrollbar(enabled: Boolean) {
            runOnUiThread { webView.isVerticalScrollBarEnabled = enabled }
        }

        /** Darkens the painted bars by this share of black, alongside a
         *  dimming overlay the page lays over itself (0 lifts it). */
        @JavascriptInterface
        fun setBarsScrim(alpha: Float) {
            runOnUiThread { systemBars.animateScrim(alpha.coerceIn(0f, 1f)) }
        }

        /** Settings → "Edge-to-edge in portrait". */
        @JavascriptInterface
        fun setEdgeToEdgePortrait(enabled: Boolean) {
            runOnUiThread {
                if (systemBars.setEdgeToEdgePortrait(enabled)) injectSafeAreaInsets()
            }
        }

        @JavascriptInterface
        fun setRefreshEnabled(enabled: Boolean) {
            runOnUiThread { swipeRefresh.isEnabled = enabled }
        }

        @JavascriptInterface
        fun changeServer() {
            runOnUiThread { ChangeServerDialog.show(this@WebViewActivity) }
        }

        @JavascriptInterface
        fun checkForUpdate() {
            updatePrompts.checkForUpdate()
        }

        /** Returns the currently-installed APK version as a plain
         *  string ("1.4.0"). Used by the Settings panel to surface
         *  "you're on v…" next to the manual update-check trigger so
         *  the user can confirm at a glance which build is running. */
        @JavascriptInterface
        fun getAppVersion(): String =
            com.glasskeep.app.BuildConfig.VERSION_NAME

        /** True when the running APK was installed by F-Droid (or one
         *  of its variants). The Settings panel hides its update
         *  controls in that case so we don't fight the F-Droid update
         *  mechanism — same APK still works fine sideloaded or
         *  installed from a GitHub Release. */
        @JavascriptInterface
        fun isFdroidInstall(): Boolean =
            com.glasskeep.app.update.UpdateManager.isFdroidInstall(this@WebViewActivity)

        @JavascriptInterface
        fun openFdroidPage() {
            updatePrompts.openFdroidPage()
        }

        @JavascriptInterface
        fun getAvailableUpdate(): String? = updatePrompts.getAvailableUpdate()

        @JavascriptInterface
        fun installAvailableUpdate() {
            updatePrompts.installAvailableUpdate()
        }

        /** Settings card's "Plus tard" action. */
        @JavascriptInterface
        fun dismissAvailableUpdate() {
            com.glasskeep.app.update.UpdateManager.clearAvailableRelease(this@WebViewActivity)
        }

        /** Tell the webapp it's running inside the Android TV launcher.
         *  The web layer reads window.__isAndroidTV on boot to swap the
         *  edit-heavy phone UI for a comfy, focus-driven viewer. */
        @JavascriptInterface
        fun isAndroidTV(): Boolean = isTelevision(this@WebViewActivity)

        /** Opens the single sign-on provider. Only an authorization URL
         *  that returns to this server's callback is accepted. */
        @JavascriptInterface
        fun openSingleSignOn(authorizationUrl: String?) {
            if (authorizationUrl.isNullOrBlank()) return
            runOnUiThread { openSingleSignOnSheet(Uri.parse(authorizationUrl)) }
        }

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
            downloads.saveBlobFile(base64Data, filename, mimeType)
        }
    }

    /** Hands the page its system-bar state (see SystemBars.injectInsets). */
    private fun injectSafeAreaInsets() {
        // Skip injection if the WebView hasn't loaded any page yet: evaluating JS
        // before there's a document just queues a useless call.
        if (!this::webView.isInitialized) return
        systemBars.injectInsets(webView)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Self-update prompt. The background check just posts a system
        // notification when a newer APK is published — non-intrusive
        // and easy to dismiss. Tapping the notification triggers the
        // silent download + system installer.
        com.glasskeep.app.update.UpdateManager.checkInBackground(this) { release ->
            updatePrompts.postUpdateNotification(release)
        }

        // Draw edge-to-edge: let the app handle system bar insets via CSS
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)

        // Allow content to render under the display cutout (status bar area in landscape)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        setContentView(R.layout.activity_webview)

        systemBars = SystemBars(
            this,
            findViewById(R.id.status_bar_background),
            findViewById(R.id.navigation_bar_background),
        )
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { _, insets ->
            systemBars.placeBackgrounds(insets)
            insets
        }

        // MainActivity has already vetted the address it passes here. The
        // fallback (a reminder notification tap, say) reads the stored one
        // straight from preferences, so it goes through the same gate.
        val url = intent.getStringExtra("url")
            ?: getSharedPreferences("glasskeep", MODE_PRIVATE).let { prefs ->
                prefs.getString("server_url", null)?.takeIf {
                    CleartextPolicy.isUsableAtStartup(
                        it,
                        prefs.getBoolean(MainActivity.KEY_URL_VETTED, false),
                    )
                }
            }
            ?: run {
                startActivity(Intent(this, MainActivity::class.java))
                finish()
                return
            }

        appUrl = url

        // Deep-link target if we were launched by a reminder notification tap.
        pendingOpenNoteId = intent.getStringExtra(EXTRA_OPEN_NOTE_ID)

        // Returning user with a stored token → ensure the background reminder
        // sync is scheduled (covers reboots / updates where the web layer might
        // not immediately re-hand the token).
        if (!getSharedPreferences("glasskeep", MODE_PRIVATE)
                .getString("auth_token", null).isNullOrBlank()) {
            com.glasskeep.app.reminders.ReminderSyncWorker.schedulePeriodic(applicationContext)
        }

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
            systemBars.recordInsets(insets)
            injectSafeAreaInsets()
            insets
        }

        webView.apply {
            addJavascriptInterface(ThemeBridge(), "AndroidTheme")
            // window.AndroidToast.show(message, durationLong) — the
            // mobile notification toast uses this when running inside
            // the Android wrapper so it renders the real native
            // Toast.makeText widget instead of a CSS pill. Pure-PWA
            // sessions don't see the bridge and fall back to the JS
            // implementation in NotificationMobileToast.
            addJavascriptInterface(ToastBridge(this@WebViewActivity), "AndroidToast")
            // Exposes window.AndroidPasskey to the WebView. The polyfill
            // injected on every page load (see onPageStarted below) wraps
            // it into the Promise-friendly window.GlassKeepAndroidPasskey
            // that passkeyClient.js looks for.
            addJavascriptInterface(webAuthnBridge, WebAuthnBridge.JS_INTERFACE_NAME)
            // window.AndroidReminders — lets the web app schedule LOCAL
            // alarms for note reminders (Web Push isn't available in a
            // WebView). The web app calls schedule/cancel when a reminder
            // changes and syncAll on load. See ReminderScheduler.
            addJavascriptInterface(remindersBridge, "AndroidReminders")
            if (BuildConfig.DEBUG) {
                val origin = Uri.parse(url).let { "${it.scheme}://${it.encodedAuthority}" }
                netDebug = NetDebug(this@WebViewActivity, origin).also {
                    it.start()
                    addJavascriptInterface(it.Bridge(), NetDebug.JS_INTERFACE_NAME)
                }
            }

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = false

                // The three settings below were open with nothing asking
                // for them, next to four bridges into native code. No way
                // in was found, but a WebView that can read the phone's
                // files and content providers is a wider target than this
                // app needs, and none of it is used:
                //
                //   - the app only ever loads http(s) from its own server
                //     (see shouldOverrideUrlLoading, which sends anything
                //     off-host to a Custom Tab), so file:// and content://
                //     have no legitimate reader here;
                //   - note content cannot even carry an <img>, let alone
                //     one pointing at content://, because neither
                //     sanitizer allows the tag.
                //
                // The one thing to watch on a device: picking a photo for
                // a note goes through the file chooser, which hands the
                // WebView a content:// URI. That path reads the file
                // through the app's own resolver with the permission the
                // picker granted, not through content-URL loading, so it
                // is unaffected. If an attachment ever fails to upload,
                // this is the line to look at first.
                allowFileAccess = false
                allowContentAccess = false

                // An https page has no business pulling http resources.
                // The server's content-security-policy already refuses
                // them; this says the same thing one layer lower, where
                // no policy header can be missing.
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

                javaScriptCanOpenWindowsAutomatically = true
                setSupportMultipleWindows(false)
            }

            // Disable the native WebView overscroll bounce. Without this,
            // flinging to the top of the page triggers an Android-level glow
            // / stretch animation that briefly shifts the WebView's content
            // down by a few pixels before snapping back. The sticky header
            // moves with the content and leaves a visible gap against the
            // status bar. CSS overscroll-behavior-y:none is not enough because
            // the bounce happens at the native View layer.
            // Pull-to-refresh is handled by SwipeRefreshLayout (a sibling view),
            // so disabling WebView's own overscroll doesn't affect it.
            overScrollMode = android.view.View.OVER_SCROLL_NEVER

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
                    val target = request.url
                    // Compare host and port, not a string prefix. The app's
                    // own pages must always stay in the WebView, but a brittle
                    // requestUrl.startsWith(url) check let some same-server
                    // navigations slip through to the external browser — SPA
                    // hash routes (#/notes), reloads (manual / SW auto-update /
                    // pull-to-refresh), and server redirects don't necessarily
                    // start with the exact launch URL. That's the intermittent
                    // "the app reopens in Brave on top of itself" bug. The
                    // scheme is left out (a server may upgrade http to https);
                    // the port is not: a sign-on provider may share the
                    // server's host on another one, and must never load here.
                    val appPage = try {
                        val app = Uri.parse(url)
                        app.host != null &&
                            app.host.equals(target.host, ignoreCase = true) &&
                            app.port == target.port
                    } catch (_: Exception) { false }
                    return if (appPage) {
                        false
                    } else {
                        // Genuinely external link (a note's link, GitHub, …) —
                        // hand it to a Custom Tab so Back returns to the WebView
                        // instead of dumping the user into a separate browser app.
                        openUrlExternally(target)
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
                    val isTv = isTelevision(this@WebViewActivity)
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
                    val isDarkBoot = isDarkMode(resources.configuration)
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

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: android.webkit.WebResourceError,
                ) {
                    super.onReceivedError(view, request, error)
                    if (BuildConfig.DEBUG) NetDebug.log("load error ${error.errorCode} ${error.description} on ${request.method} ${request.url.path} (main frame: ${request.isForMainFrame})")
                }

                override fun onReceivedHttpError(
                    view: WebView,
                    request: WebResourceRequest,
                    errorResponse: WebResourceResponse,
                ) {
                    super.onReceivedHttpError(view, request, errorResponse)
                    if (BuildConfig.DEBUG) NetDebug.log("HTTP ${errorResponse.statusCode} on ${request.method} ${request.url.path}")
                }

                override fun onPageFinished(view: WebView, pageUrl: String?) {
                    super.onPageFinished(view, pageUrl)
                    if (BuildConfig.DEBUG) NetDebug.log("page finished: $pageUrl")
                    swipeRefresh.isRefreshing = false
                    // Re-assert the TV flag in case the page navigated
                    // (login → notes) and reset the global.
                    view.evaluateJavascript(
                        "window.__isAndroidTV=${isTelevision(this@WebViewActivity)};", null
                    )
                    // Push current system dark mode state to web app on load
                    val isDark = isDarkMode(resources.configuration)
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
                    // Web app is ready — replay any pending reminder deep-link.
                    pageLoaded = true
                    maybeDispatchOpenNote()
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams
                ): Boolean = fileChooser.show(callback, params)

                override fun onPermissionRequest(request: PermissionRequest) {
                    mediaCapturePermissions.onPermissionRequest(request)
                }

                override fun onPermissionRequestCanceled(request: PermissionRequest) {
                    mediaCapturePermissions.onPermissionRequestCanceled(request)
                }
            }

            // Downloads
            setDownloadListener { downloadUrl, userAgent, contentDisposition, mimeType, _ ->
                downloads.onDownloadStart(webView, downloadUrl, userAgent, contentDisposition, mimeType)
            }

            loadUrl(ssoReturnUrl(intent) ?: url)
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
        val isDark = isDarkMode(newConfig)
        webView.evaluateJavascript(
            "if(window.__setDarkMode)window.__setDarkMode($isDark)", null
        )
        // Portrait edge-to-edge follows the orientation.
        systemBars.paint()
        injectSafeAreaInsets()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTask: a reminder tap on the already-running app lands here.
        // Adopt the new intent and deep-link to the note it carries.
        setIntent(intent)
        intent.getStringExtra(EXTRA_OPEN_NOTE_ID)?.let {
            pendingOpenNoteId = it
            maybeDispatchOpenNote()
        }
        ssoReturnUrl(intent)?.let { webView.loadUrl(it) }
    }

    /** The web app's address that finishes single sign-on, when [intent]
     *  carries the outcome SsoReturnActivity received. It goes to the
     *  origin of the page shown (the one that started the attempt), or of
     *  the server address when the screen is only being created. */
    private fun ssoReturnUrl(intent: Intent): String? {
        val outcome = intent.getStringExtra(EXTRA_SSO_OUTCOME) ?: return null
        val app = Uri.parse(webView.url ?: appUrl)
        return "${app.scheme}://${app.encodedAuthority}/?$outcome"
    }

    /** The provider in the default browser, as a sheet over the app (a
     *  full-screen tab where the browser has no such sheet). Its
     *  redirect_uri must be this server's callback, on the origin of the
     *  page asking. */
    private fun openSingleSignOnSheet(authorization: Uri) {
        val page = webView.url?.let { Uri.parse(it) } ?: return
        val callback = authorization.getQueryParameter("redirect_uri")?.let { Uri.parse(it) } ?: return
        val isCallback = callback.scheme == page.scheme &&
            callback.encodedAuthority == page.encodedAuthority &&
            callback.path == SSO_CALLBACK_PATH
        if (!isCallback || authorization.scheme !in setOf("https", "http")) return
        val tab = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setInitialActivityHeightPx((resources.displayMetrics.heightPixels * 0.9).toInt())
            .setToolbarCornerRadiusDp(16)
            .build()
        tab.intent.data = authorization
        try {
            ssoLauncher.launch(tab.intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.sso_no_browser, Toast.LENGTH_LONG).show()
        }
    }

    /** Open `uri` via the user's default browser using Android Custom
     *  Tabs — Chrome / Brave / Firefox / etc. render the page as an
     *  overlay on top of our task instead of a cold cross-app jump.
     *  Falls back to a plain ACTION_VIEW intent if no installed browser
     *  exposes a CustomTabsService (rare on modern devices), and to a
     *  short toast as a last resort so the tap is still acknowledged. */
    private fun openUrlExternally(uri: Uri) {
        try {
            val tab = CustomTabsIntent.Builder()
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

    private val handler = Handler(Looper.getMainLooper())
    private var backHeld = false
    private var dialogShown = false
    private val longBackRunnable = Runnable {
        dialogShown = true
        ChangeServerDialog.show(this@WebViewActivity)
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

    // Track foreground state so ReminderAlarmReceiver can skip the system
    // notification while the app is open (the in-app/SSE notification
    // already shows it) — avoids a visible duplicate.
    override fun onResume() {
        super.onResume()
        isForeground = true
        netDebug?.onResume()
    }

    override fun onPause() {
        super.onPause()
        isForeground = false
        netDebug?.onPause()
    }

    override fun onDestroy() {
        netDebug?.stop()
        if (this::systemBars.isInitialized) systemBars.release()
        super.onDestroy()
    }

    /**
     * Fire the web app's reminder deep-link hook for any pending note id,
     * but only once the page is loaded (so the React handler exists). The
     * hook itself tolerates a not-yet-hydrated notes list — it stashes the
     * id and opens the modal when the note appears — so a single shot here
     * is enough for both warm taps and cold starts.
     */
    private fun maybeDispatchOpenNote() {
        val id = pendingOpenNoteId ?: return
        if (!pageLoaded || !this::webView.isInitialized) return
        pendingOpenNoteId = null
        val esc = id.replace("\\", "\\\\").replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                "if(window.__glasskeepOpenNote){try{window.__glasskeepOpenNote('$esc')}catch(e){}}",
                null,
            )
        }
    }

    companion object {
        // Read by ReminderAlarmReceiver (possibly from another thread).
        @Volatile
        var isForeground: Boolean = false

        // Reminder notification deep-link: ReminderNotifier stashes the target
        // note id here; we forward it to window.__glasskeepOpenNote once loaded.
        const val EXTRA_OPEN_NOTE_ID = "openNoteId"

        // Single sign-on outcome as a query string, from SsoReturnActivity.
        const val EXTRA_SSO_OUTCOME = "ssoOutcome"
        private const val SSO_CALLBACK_PATH = "/api/auth/oidc/callback"
    }
}
