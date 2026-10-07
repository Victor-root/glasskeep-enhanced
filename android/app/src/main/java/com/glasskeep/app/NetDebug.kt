package com.glasskeep.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.SystemClock
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.net.HttpURLConnection
import java.net.URL

/**
 * Debug builds only: a logcat trace, under [TAG], of everything that decides
 * whether the app reaches its server. The system's default network and its
 * changes, the page's own sync log (through the [JS_INTERFACE_NAME] bridge)
 * and, when the page loses the server, a probe of the server from outside the
 * WebView, which tells a network or server problem from one inside the
 * WebView. In release builds BuildConfig.DEBUG is a constant false: nothing
 * here runs and R8 drops it.
 */
class NetDebug(private val context: Context, private val serverOrigin: String) {

    private val connectivity =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private var callback: ConnectivityManager.NetworkCallback? = null
    private var lastCapabilities: String? = null
    private var lastLink: String? = null
    private var pausedAt = 0L

    fun start() {
        if (!BuildConfig.DEBUG || callback != null) return
        val webViewPackage = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WebView.getCurrentWebViewPackage()?.let { "${it.packageName} ${it.versionName}" }
        else null
        log("start: app ${BuildConfig.VERSION_NAME}, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), WebView $webViewPackage, server $serverOrigin")
        log("default network at start: ${describeActiveNetwork()}")
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                log("default network available: $network")
            }

            override fun onLost(network: Network) {
                log("default network LOST: $network")
            }

            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                val summary = describeCapabilities(caps)
                if (summary == lastCapabilities) return
                lastCapabilities = summary
                log("default network $network capabilities: $summary")
            }

            override fun onLinkPropertiesChanged(network: Network, link: LinkProperties) {
                val summary = describeLink(link)
                if (summary == lastLink) return
                lastLink = summary
                log("default network $network link: $summary")
            }

            override fun onBlockedStatusChanged(network: Network, blocked: Boolean) {
                log("default network $network blocked for this app: $blocked")
            }
        }
        connectivity.registerDefaultNetworkCallback(cb)
        callback = cb
    }

    fun onPause() {
        if (!BuildConfig.DEBUG) return
        pausedAt = SystemClock.elapsedRealtime()
        log("activity paused")
    }

    fun onResume() {
        if (!BuildConfig.DEBUG) return
        val away = if (pausedAt == 0L) "first resume" else "back after ${(SystemClock.elapsedRealtime() - pausedAt) / 1000}s in background"
        log("activity resumed ($away), network: ${describeActiveNetwork()}")
    }

    fun stop() {
        callback?.let { connectivity.unregisterNetworkCallback(it) }
        callback = null
    }

    /** Exposed to the page as window.[JS_INTERFACE_NAME]. */
    inner class Bridge {
        @JavascriptInterface
        fun log(message: String?) {
            Companion.log("web: $message")
        }

        /** Same trace under another GK* tag, for an investigation unrelated
         *  to connectivity (kept apart so each can be filtered on its own). */
        @JavascriptInterface
        fun logTagged(tag: String?, message: String?) {
            if (BuildConfig.DEBUG && tag != null && tag.startsWith("GK")) Log.d(tag, "web: $message")
        }

        /** Fetches /api/health with the platform HTTP stack, outside the
         *  WebView and its service worker, and logs the outcome. */
        @JavascriptInterface
        fun probe(reason: String?) {
            if (!BuildConfig.DEBUG) return
            Thread {
                val network = describeActiveNetwork()
                val started = SystemClock.elapsedRealtime()
                val outcome = try {
                    val conn = URL("$serverOrigin/api/health?_probe=${System.currentTimeMillis()}")
                        .openConnection() as HttpURLConnection
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000
                    conn.useCaches = false
                    try {
                        val body = (if (conn.responseCode < 400) conn.inputStream else conn.errorStream)
                            ?.bufferedReader()?.use { it.readText().take(120) }
                        "HTTP ${conn.responseCode} $body"
                    } finally {
                        conn.disconnect()
                    }
                } catch (e: Exception) {
                    "FAILED ${e.javaClass.simpleName}: ${e.message}"
                }
                val ms = SystemClock.elapsedRealtime() - started
                Companion.log("native probe ($reason) after ${ms}ms: $outcome | network: $network")
            }.start()
        }
    }

    // The deprecated NetworkInfo is the one place that reports whether the
    // system currently blocks this app's own traffic (DetailedState.BLOCKED,
    // e.g. Doze or app standby), which is exactly what this trace looks for.
    @Suppress("DEPRECATION")
    private fun describeActiveNetwork(): String {
        val appState = "appState=${connectivity.activeNetworkInfo?.detailedState} dataSaver=${connectivity.restrictBackgroundStatus}"
        val network = connectivity.activeNetwork ?: return "none $appState"
        val caps = connectivity.getNetworkCapabilities(network)?.let(::describeCapabilities)
        val link = connectivity.getLinkProperties(network)?.let(::describeLink)
        return "$network $appState caps=[$caps] link=[$link]"
    }

    private fun describeCapabilities(caps: NetworkCapabilities): String {
        val transports = listOfNotNull(
            "wifi".takeIf { caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) },
            "cellular".takeIf { caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) },
            "ethernet".takeIf { caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) },
            "vpn".takeIf { caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) },
        )
        val flags = listOfNotNull(
            "internet".takeIf { caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) },
            "validated".takeIf { caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) },
            "not-vpn".takeIf { caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN) },
            "captive-portal".takeIf { caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL) },
        )
        return "transports=$transports flags=$flags"
    }

    private fun describeLink(link: LinkProperties): String {
        val privateDns = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
            " privateDns=${link.isPrivateDnsActive}/${link.privateDnsServerName}"
        else ""
        return "iface=${link.interfaceName} addrs=${link.linkAddresses} dns=${link.dnsServers}$privateDns"
    }

    companion object {
        const val TAG = "GKNet"
        const val JS_INTERFACE_NAME = "AndroidNetDebug"

        fun log(message: String) {
            if (BuildConfig.DEBUG) Log.d(TAG, message)
        }
    }
}
