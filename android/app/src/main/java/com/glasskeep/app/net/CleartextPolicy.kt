package com.glasskeep.app.net

import java.net.InetAddress
import java.net.URI

/**
 * Decides whether the app may talk to a server address without TLS.
 *
 * THE TENSION, because it decides the shape of everything here. Android
 * blocks unencrypted traffic by default and GlassKeep switches that off
 * for the whole app, because pointing the phone at `http://192.168.1.10`
 * is a first-class way to use a self-hosted note server: no certificate
 * to obtain, nothing leaving the house. Turning the platform switch back
 * on would break that setup, which is the most private one there is.
 *
 * But the same switch also let someone type `http://notes.example.com`
 * and hand their password, their session token and every note they open
 * to whoever shares the Wi-Fi. Nothing warned them, nothing refused.
 *
 * So the line is drawn at WHERE the address points, not at whether it is
 * encrypted: unencrypted towards your own network is a choice; towards
 * the open internet it is an accident, and it is refused.
 *
 * Why this lives in Kotlin and not in res/xml/network_security_config.xml,
 * which is where a reader would expect it: Android's network security
 * config matches destinations by name, and IP literals only match
 * literally. There is no way to write "the private ranges" in it, and the
 * private ranges are exactly the case that has to keep working. The
 * platform switch therefore stays on, and the decision is taken at the
 * one place the address is chosen.
 */
object CleartextPolicy {

    enum class Verdict {
        /** https. Nothing to decide. */
        ENCRYPTED,

        /** http towards a destination that cannot leave the local network. */
        LOCAL_CLEARTEXT,

        /** http towards a destination reachable from the internet. Refused. */
        PUBLIC_CLEARTEXT,

        /** http towards a name this side cannot classify without a lookup. */
        UNRESOLVED_CLEARTEXT,

        /** Not an address the app can act on at all. */
        UNUSABLE,
    }

    /**
     * Verdict without touching the network. Safe on the main thread.
     * A host name that is not recognisably local comes back as
     * [Verdict.UNRESOLVED_CLEARTEXT]: only a lookup can tell.
     */
    fun inspect(baseUrl: String): Verdict {
        val host = hostOf(baseUrl) ?: return Verdict.UNUSABLE
        val scheme = schemeOf(baseUrl)
        return when {
            scheme == "https" -> Verdict.ENCRYPTED
            scheme != "http" -> Verdict.UNUSABLE
            isLiteralAddress(host) ->
                if (isPrivate(parseLiteral(host))) Verdict.LOCAL_CLEARTEXT else Verdict.PUBLIC_CLEARTEXT
            isLocalName(host) -> Verdict.LOCAL_CLEARTEXT
            else -> Verdict.UNRESOLVED_CLEARTEXT
        }
    }

    /**
     * Full verdict, resolving the host name when [inspect] could not
     * decide. Performs DNS, so it must never run on the main thread.
     *
     * A name that does not resolve is left as [Verdict.UNRESOLVED_CLEARTEXT]
     * rather than assumed hostile: an address that resolves to nothing
     * carries nothing either, and the connection attempt that follows
     * will fail on its own with a message the user can act on.
     */
    fun resolve(baseUrl: String): Verdict {
        val quick = inspect(baseUrl)
        if (quick != Verdict.UNRESOLVED_CLEARTEXT) return quick
        val host = hostOf(baseUrl) ?: return Verdict.UNUSABLE
        val addresses = try {
            InetAddress.getAllByName(host).toList()
        } catch (_: Exception) {
            return Verdict.UNRESOLVED_CLEARTEXT
        }
        if (addresses.isEmpty()) return Verdict.UNRESOLVED_CLEARTEXT
        // One public answer is enough to refuse. A name that resolves to
        // both a private and a public address is not a local server.
        return if (addresses.all { isPrivate(it) }) Verdict.LOCAL_CLEARTEXT else Verdict.PUBLIC_CLEARTEXT
    }

    /**
     * Gate used when the app starts on an address it stored earlier.
     * No lookup, so the launch is never held up by DNS.
     *
     * [vettedAtSetup] is the trace left by the setup screen when it
     * resolved a name and found a private destination. Without it an
     * unclassifiable name is refused, which sends the user back to the
     * setup screen once, where the name gets resolved properly. Storing
     * the answer is what stops that from happening at every launch.
     */
    fun isUsableAtStartup(baseUrl: String?, vettedAtSetup: Boolean): Boolean {
        if (baseUrl.isNullOrBlank()) return false
        return when (inspect(baseUrl)) {
            Verdict.ENCRYPTED, Verdict.LOCAL_CLEARTEXT -> true
            Verdict.UNRESOLVED_CLEARTEXT -> vettedAtSetup
            Verdict.PUBLIC_CLEARTEXT, Verdict.UNUSABLE -> false
        }
    }

    /** True for an address that cannot be reached from outside the local network. */
    fun isPrivate(address: InetAddress?): Boolean {
        if (address == null) return false
        if (address.isLoopbackAddress || address.isAnyLocalAddress) return true
        if (address.isLinkLocalAddress || address.isSiteLocalAddress) return true
        if (address.isMulticastAddress) return false
        val b = address.address ?: return false
        if (b.size == 4) {
            val first = b[0].toInt() and 0xff
            val second = b[1].toInt() and 0xff
            // 100.64/10, the carrier-grade range that WireGuard-style
            // overlays (Tailscale among them) hand out.
            if (first == 100 && second in 64..127) return true
            // 0.0.0.0/8, "this network".
            if (first == 0) return true
            return false
        }
        if (b.size == 16) {
            // fc00::/7, the IPv6 unique-local range. isSiteLocalAddress
            // only knows the deprecated fec0::/10 form.
            if ((b[0].toInt() and 0xfe) == 0xfc) return true
            return false
        }
        return false
    }

    private fun schemeOf(baseUrl: String): String? =
        baseUrl.trim().substringBefore("://", missingDelimiterValue = "").lowercase().ifBlank { null }

    private fun hostOf(baseUrl: String): String? {
        val trimmed = baseUrl.trim()
        if (trimmed.isEmpty()) return null
        val parsed = try {
            val uri = URI(trimmed)
            // URI.host is null for authorities the RFC calls illegal but
            // that a home network happily serves, an underscore in the
            // name being the usual one. The authority still carries it.
            uri.host ?: uri.authority?.substringAfterLast('@')?.let(::stripPort)
        } catch (_: Exception) {
            null
        } ?: return null
        return parsed.trim('[', ']').lowercase().ifBlank { null }
    }

    /** Drops a trailing `:port`, and only that: a bare IPv6 literal is all colons. */
    private fun stripPort(authority: String): String {
        val colon = authority.lastIndexOf(':')
        if (colon <= 0) return authority
        val tail = authority.substring(colon + 1)
        return if (tail.isNotEmpty() && tail.all { it.isDigit() }) authority.substring(0, colon) else authority
    }

    /** Names that can only ever mean something on the local network. */
    private fun isLocalName(host: String): Boolean {
        if (host == "localhost") return true
        // A single label has no public namespace to belong to: it is
        // resolved by the local network, by mDNS or by the hosts file.
        if (!host.contains('.')) return true
        return LOCAL_SUFFIXES.any { host.endsWith(it) }
    }

    private val LOCAL_SUFFIXES = listOf(
        ".local", ".lan", ".home", ".home.arpa", ".internal", ".localdomain",
    )

    private fun isLiteralAddress(host: String): Boolean = parseLiteral(host) != null

    /**
     * Parses an IP literal without ever consulting DNS.
     * [InetAddress.getByName] resolves names, so it cannot be used to ask
     * "is this a literal"; the shape is checked first.
     */
    private fun parseLiteral(host: String): InetAddress? {
        val looksNumeric = host.contains(':') || host.matches(IPV4_SHAPE)
        if (!looksNumeric) return null
        return try {
            InetAddress.getByName(host)
        } catch (_: Exception) {
            null
        }
    }

    private val IPV4_SHAPE = Regex("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$")
}
