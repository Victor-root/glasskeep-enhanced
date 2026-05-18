# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep our passkey bridge class so R8 doesn't rename it — WebView's
# addJavascriptInterface needs the runtime class to expose its methods
# under window.AndroidPasskey, and the JS polyfill calls those methods
# by name.
-keep class com.glasskeep.app.WebAuthnBridge { *; }
-keep class com.glasskeep.app.WebViewActivity$ThemeBridge { *; }

# Keep Compose
-dontwarn androidx.compose.**
