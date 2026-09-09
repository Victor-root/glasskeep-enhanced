package com.glasskeep.app.nativeapp.data.network

import okhttp3.OkHttpClient

/** The release build logs no HTTP at all: see the debug twin of this
 *  file for why the two are split rather than gated on BuildConfig. */
internal fun OkHttpClient.Builder.addNetworkLogging(): OkHttpClient.Builder = this
