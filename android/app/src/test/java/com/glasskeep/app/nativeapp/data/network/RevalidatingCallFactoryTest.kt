package com.glasskeep.app.nativeapp.data.network

import com.sun.net.httpserver.HttpServer
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.file.Files

class RevalidatingCallFactoryTest {
    private class Hit(val ifNoneMatch: String?, val marker: String?)

    private lateinit var server: HttpServer
    private lateinit var cacheDir: File
    private lateinit var factory: RevalidatingCallFactory
    private val hits = mutableListOf<Hit>()
    private var serverCacheControl: String? = null

    @Before
    fun start() {
        server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        server.createContext("/") { exchange ->
            val ifNoneMatch = exchange.requestHeaders.getFirst("If-None-Match")
            hits += Hit(ifNoneMatch, exchange.requestHeaders.getFirst(REVALIDATED_REQUEST_HEADER))
            exchange.responseHeaders.add("ETag", TAG)
            serverCacheControl?.let { exchange.responseHeaders.add("Cache-Control", it) }
            if (ifNoneMatch == TAG) {
                exchange.sendResponseHeaders(304, -1)
            } else {
                val body = BODY.toByteArray()
                exchange.sendResponseHeaders(200, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            }
            exchange.close()
        }
        server.start()
        cacheDir = Files.createTempDirectory("notes-http").toFile()
        factory = RevalidatingCallFactory(OkHttpClient(), Cache(cacheDir, 10L * 1024 * 1024))
    }

    @After
    fun stop() {
        server.stop(0)
        cacheDir.deleteRecursively()
    }

    private fun get(marked: Boolean): Pair<String, Int?> {
        val request = Request.Builder()
            .url("http://127.0.0.1:${server.address.port}/api/notes")
            .apply { if (marked) header(REVALIDATED_REQUEST_HEADER, "true") }
            .build()
        return factory.newCall(request).execute().use { it.body!!.string() to it.networkResponse?.code }
    }

    @Test
    fun aMarkedReadIsAskedAgainAndTheUnchangedAnswerIsNotDownloaded() {
        val first = get(marked = true)
        val second = get(marked = true)

        assertEquals(BODY, first.first)
        assertEquals(BODY, second.first)
        assertEquals(200, first.second)
        assertEquals(304, second.second)
        assertNull(hits[0].ifNoneMatch)
        assertEquals(TAG, hits[1].ifNoneMatch)
    }

    @Test
    fun theMarkerNeverLeavesThePhone() {
        get(marked = true)

        assertNull(hits.single().marker)
    }

    @Test
    fun aServerFreshnessDoesNotSkipTheQuestion() {
        serverCacheControl = "max-age=3600"

        get(marked = true)
        val second = get(marked = true)

        assertEquals(2, hits.size)
        assertEquals(304, second.second)
    }

    @Test
    fun anUnmarkedReadKeepsNothing() {
        get(marked = false)
        val second = get(marked = false)

        assertEquals(2, hits.size)
        assertNull(hits[1].ifNoneMatch)
        assertEquals(200, second.second)
    }

    private companion object {
        const val BODY = """[{"id":"n1","title":"one"}]"""

        // The weak tag Express puts on every JSON answer.
        const val TAG = "W/\"v1\""
    }
}
