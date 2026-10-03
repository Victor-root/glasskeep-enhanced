package com.glasskeep.app.nativeapp

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network

/**
 * Calls [onLost] the moment the phone loses its connection, which is what
 * the browser's offline event is for the web (App.jsx:4301-4310): the
 * server is reported unreachable at once instead of at the next probe.
 * Returns what stops the watch.
 */
fun watchNetworkLoss(context: Context, onLost: () -> Unit): () -> Unit {
    val manager = context.getSystemService(ConnectivityManager::class.java)
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onLost(network: Network) = onLost()
    }
    manager.registerDefaultNetworkCallback(callback)
    return { manager.unregisterNetworkCallback(callback) }
}
