package com.glasskeep.app.net

import android.content.Context
import android.content.SharedPreferences
import android.net.http.SslCertificate
import android.os.Build
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.URI
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * The server certificate the user chose to trust although Android does not,
 * a self-signed one typically. Only that exact certificate is accepted, and
 * only for the server it was accepted for: a certificate Android trusts on
 * its own is always accepted as before.
 */
object TrustedCertificate {

    private const val PREFS = "glasskeep"
    private const val KEY_HOST = "trusted_cert_host"
    private const val KEY_SHA256 = "trusted_cert_sha256"

    fun trust(context: Context, host: String, certificate: X509Certificate) {
        prefs(context).edit()
            .putString(KEY_HOST, host.lowercase())
            .putString(KEY_SHA256, fingerprint(certificate))
            .apply()
    }

    fun forget(editor: SharedPreferences.Editor): SharedPreferences.Editor =
        editor.remove(KEY_HOST).remove(KEY_SHA256)

    /** The fingerprint trusted for [host], if any. */
    fun pinFor(context: Context, host: String?): String? {
        val p = prefs(context)
        if (host == null || !host.equals(p.getString(KEY_HOST, null), ignoreCase = true)) return null
        return p.getString(KEY_SHA256, null)
    }

    /** True when the WebView's [certificate] for [url] is the trusted one. */
    fun matches(context: Context, url: String, certificate: SslCertificate?): Boolean {
        val pin = pinFor(context, hostOf(url)) ?: return false
        val x509 = certificate?.let(::toX509) ?: return false
        return fingerprint(x509) == pin
    }

    /** Lets [connection] reach a server with the trusted certificate. */
    fun applyTo(context: Context, connection: HttpURLConnection) {
        if (connection !is HttpsURLConnection) return
        val pin = pinFor(context, connection.url.host) ?: return
        val trustManager = PinnedTrustManager(pin)
        connection.sslSocketFactory = SSLContext.getInstance("TLS")
            .apply { init(null, arrayOf(trustManager), null) }
            .socketFactory
        val system = HttpsURLConnection.getDefaultHostnameVerifier()
        // The name in a self-signed certificate rarely matches the address
        // typed: the exact certificate trusted stands for the name.
        connection.hostnameVerifier = HostnameVerifier { host, session ->
            system.verify(host, session) ||
                (session.peerCertificates.firstOrNull() as? X509Certificate)?.let { fingerprint(it) == pin } == true
        }
    }

    /** The certificate [baseUrl]'s server presents, read from the TLS
     *  handshake alone: nothing is sent to a server not trusted yet.
     *  Blocking. */
    fun presentedBy(baseUrl: String): X509Certificate? {
        val uri = try { URI(baseUrl) } catch (_: Exception) { return null }
        val host = uri.host ?: return null
        val recorder = RecordingTrustManager()
        val factory = SSLContext.getInstance("TLS").apply { init(null, arrayOf(recorder), null) }.socketFactory
        try {
            (factory.createSocket() as SSLSocket).use { socket ->
                socket.connect(InetSocketAddress(host, if (uri.port > 0) uri.port else 443), 5000)
                socket.soTimeout = 5000
                socket.startHandshake()
            }
        } catch (_: Exception) {
            // The recorder refuses every certificate once it has read it.
        }
        return recorder.leaf
    }

    /** "AB:CD:…", as `openssl x509 -fingerprint -sha256` prints it. */
    fun formatted(certificate: X509Certificate): String =
        fingerprint(certificate).chunked(2).joinToString(":")

    private fun fingerprint(certificate: X509Certificate): String =
        MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
            .joinToString("") { "%02X".format(it) }

    private fun toX509(certificate: SslCertificate): X509Certificate? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            certificate.x509Certificate
        } else {
            SslCertificate.saveState(certificate).getByteArray("x509-certificate")?.let {
                CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(it)) as? X509Certificate
            }
        }

    private fun hostOf(url: String): String? = try { URI(url).host } catch (_: Exception) { null }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun systemTrustManager(): X509TrustManager =
        TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            .apply { init(null as KeyStore?) }
            .trustManagers.filterIsInstance<X509TrustManager>().first()

    /** Android's own verdict, else the trusted certificate. */
    private class PinnedTrustManager(private val pin: String) : X509TrustManager {
        private val system = systemTrustManager()

        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            try {
                system.checkServerTrusted(chain, authType)
            } catch (e: CertificateException) {
                if (chain.isEmpty() || fingerprint(chain[0]) != pin) throw e
            }
        }

        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) =
            system.checkClientTrusted(chain, authType)

        override fun getAcceptedIssuers(): Array<X509Certificate> = system.acceptedIssuers
    }

    /** Reads the server's certificate and refuses it, whatever it is. */
    private class RecordingTrustManager : X509TrustManager {
        var leaf: X509Certificate? = null

        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            leaf = chain.firstOrNull()
            throw CertificateException("only read")
        }

        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) =
            throw CertificateException("no client certificates")

        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }
}
