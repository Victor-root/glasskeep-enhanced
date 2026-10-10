package com.glasskeep.app.webview

import android.app.Activity
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * Native Android Toast bridge. The in-app notification system on
 * mobile delegates to this so the small dark pill at the bottom
 * is the real system widget (Toast.makeText) instead of a CSS
 * imitation rendered by the WebView.
 *
 * `show(message, durationLong)` honours Android's two canonical
 * lengths: SHORT (~2 s) or LONG (~3.5 s). The JS side picks
 * LONG when the notification is persistent or carries a >3 s
 * duration so a verbose share message stays on screen long
 * enough to read.
 *
 * Toasts are passive by design (no actions, no close button),
 * so any action button on the original notification stays
 * accessible only through the in-app notification centre.
 */
class ToastBridge(private val activity: Activity) {
    @JavascriptInterface
    fun show(message: String) {
        show(message, false)
    }

    @JavascriptInterface
    fun show(message: String, durationLong: Boolean) {
        activity.runOnUiThread {
            val length = if (durationLong) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
            Toast.makeText(activity, message, length).show()
        }
    }
}
