package com.glasskeep.app.net

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * F-07. The app used to accept any `http://` address without a word, so
 * a password typed into `http://notes.example.com` crossed the café
 * Wi-Fi in the clear.
 *
 * The whole difficulty is not to break the setup the project recommends
 * along the way: a server on your own network, reached by its address,
 * with no certificate. These tests hold both ends at once, so a later
 * tightening cannot quietly take the local case with it.
 *
 * Plain JVM tests: [CleartextPolicy] touches nothing Android-specific,
 * which is exactly why the decision lives there and not in a resource
 * file the tests could not reach.
 */
class CleartextPolicyTest {

    // ── What must keep working ────────────────────────────────────────

    @Test
    fun `https is never questioned`() {
        for (url in listOf(
            "https://notes.example.com",
            "https://example.com:3000",
            "https://192.168.1.10:8080",
            "https://localhost",
        )) {
            assertEquals(url, CleartextPolicy.Verdict.ENCRYPTED, CleartextPolicy.inspect(url))
        }
    }

    @Test
    fun `cleartext to your own network stays allowed`() {
        for (url in listOf(
            "http://192.168.1.10:8080",
            "http://10.0.0.5",
            "http://172.16.4.4:3000",
            "http://172.31.255.254",
            "http://127.0.0.1:8080",
            "http://localhost:8080",
            "http://169.254.10.10",
            "http://[fd00::1]:8080",
            "http://[::1]",
        )) {
            assertEquals(url, CleartextPolicy.Verdict.LOCAL_CLEARTEXT, CleartextPolicy.inspect(url))
        }
    }

    @Test
    fun `an overlay network address counts as your own network`() {
        // 100.64/10 is what Tailscale and other WireGuard overlays hand
        // out. Traffic there is already encrypted by the tunnel, and the
        // address is unreachable from the internet either way.
        assertEquals(
            CleartextPolicy.Verdict.LOCAL_CLEARTEXT,
            CleartextPolicy.inspect("http://100.100.20.3:8080"),
        )
    }

    @Test
    fun `names that only exist on the local network are allowed`() {
        for (url in listOf(
            "http://nas:8080",          // single label, no public namespace
            "http://glasskeep.local",   // mDNS
            "http://server.lan",
            "http://box.home.arpa",
            "http://notes.internal:3000",
        )) {
            assertEquals(url, CleartextPolicy.Verdict.LOCAL_CLEARTEXT, CleartextPolicy.inspect(url))
        }
    }

    // ── What must stop ────────────────────────────────────────────────

    @Test
    fun `cleartext to a public address is refused`() {
        for (url in listOf(
            "http://93.184.216.34",
            "http://8.8.8.8:8080",
            "http://[2606:2800:220:1::1]",
        )) {
            assertEquals(url, CleartextPolicy.Verdict.PUBLIC_CLEARTEXT, CleartextPolicy.inspect(url))
        }
    }

    @Test
    fun `a public name in cleartext is held back until it is resolved`() {
        // inspect() never touches the network, so it cannot rule on a
        // name. It must say so rather than wave it through.
        assertEquals(
            CleartextPolicy.Verdict.UNRESOLVED_CLEARTEXT,
            CleartextPolicy.inspect("http://notes.example.com"),
        )
    }

    @Test
    fun `anything that is not http or https is unusable`() {
        for (url in listOf(
            "ftp://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "example.com",
            "",
            "   ",
        )) {
            assertEquals(url, CleartextPolicy.Verdict.UNUSABLE, CleartextPolicy.inspect(url))
        }
    }

    // ── The gate the app start goes through ───────────────────────────

    @Test
    fun `a stored https address always starts`() {
        assertTrue(CleartextPolicy.isUsableAtStartup("https://notes.example.com", false))
    }

    @Test
    fun `a stored local address starts without any stored approval`() {
        assertTrue(CleartextPolicy.isUsableAtStartup("http://192.168.1.10:8080", false))
    }

    @Test
    fun `a stored public cleartext address never starts, approval or not`() {
        assertFalse(CleartextPolicy.isUsableAtStartup("http://93.184.216.34", false))
        assertFalse(CleartextPolicy.isUsableAtStartup("http://93.184.216.34", true))
    }

    @Test
    fun `a stored name in cleartext starts only once setup has vouched for it`() {
        // This is the upgrade path: someone who configured a local DNS
        // name before this version gets sent back to setup once, where
        // the name is resolved for real, and never again afterwards.
        assertFalse(CleartextPolicy.isUsableAtStartup("http://nas.mynetwork.org", false))
        assertTrue(CleartextPolicy.isUsableAtStartup("http://nas.mynetwork.org", true))
    }

    @Test
    fun `no stored address means no start`() {
        assertFalse(CleartextPolicy.isUsableAtStartup(null, true))
        assertFalse(CleartextPolicy.isUsableAtStartup("", true))
    }

    // ── The resolving verdict ─────────────────────────────────────────

    @Test
    fun `resolve agrees with inspect whenever inspect could decide`() {
        // No network needed for any of these: inspect() already ruled.
        assertEquals(CleartextPolicy.Verdict.ENCRYPTED, CleartextPolicy.resolve("https://example.com"))
        assertEquals(CleartextPolicy.Verdict.LOCAL_CLEARTEXT, CleartextPolicy.resolve("http://192.168.1.10"))
        assertEquals(CleartextPolicy.Verdict.PUBLIC_CLEARTEXT, CleartextPolicy.resolve("http://8.8.8.8"))
        assertEquals(CleartextPolicy.Verdict.UNUSABLE, CleartextPolicy.resolve("ftp://example.com"))
    }

    @Test
    fun `a name that resolves to nothing is not called hostile`() {
        // An address that resolves to nothing carries nothing either.
        // The connection attempt right after fails on its own, with a
        // message the user can act on.
        assertEquals(
            CleartextPolicy.Verdict.UNRESOLVED_CLEARTEXT,
            CleartextPolicy.resolve("http://this-name-does-not-exist.invalid"),
        )
    }

    @Test
    fun `resolving localhost through the system resolver lands on local`() {
        // "localhost" is short-circuited by name, but this checks the
        // resolving path itself against something guaranteed to answer.
        assertEquals(
            CleartextPolicy.Verdict.LOCAL_CLEARTEXT,
            CleartextPolicy.resolve("http://localhost.localdomain:8080"),
        )
    }

    // ── The two gates must not fight each other ───────────────────────

    @Test
    fun `anything setup accepts also passes the startup gate afterwards`() {
        // The loop this rules out: the startup gate sends the user to
        // setup, setup accepts the same address, the next launch sends
        // them back. Setup lets through everything except
        // PUBLIC_CLEARTEXT and UNUSABLE, and records that it vetted the
        // address; the gate must then agree.
        val acceptedBySetup = listOf(
            "https://notes.example.com",
            "http://192.168.1.10:8080",
            "http://nas",
            "http://glasskeep.local",
            "http://nas.mynetwork.org",   // a name setup resolved to a private address
        )
        for (url in acceptedBySetup) {
            assertTrue(url, CleartextPolicy.isUsableAtStartup(url, vettedAtSetup = true))
        }
    }

    @Test
    fun `what setup refuses, the startup gate refuses too`() {
        for (url in listOf("http://93.184.216.34", "ftp://example.com", "http://")) {
            assertFalse(url, CleartextPolicy.isUsableAtStartup(url, vettedAtSetup = true))
        }
    }

    // ── The private-range decision, address by address ────────────────

    @Test
    fun `the private ranges are drawn where they should be`() {
        val private = listOf(
            "10.0.0.1", "10.255.255.255",
            "172.16.0.1", "172.31.255.255",
            "192.168.0.1", "192.168.255.255",
            "127.0.0.1", "0.0.0.0",
            "169.254.1.1",
            "100.64.0.1", "100.127.255.255",
            "::1", "fd12:3456::1", "fc00::1", "fe80::1",
        )
        val public = listOf(
            "9.255.255.255", "11.0.0.1",
            "172.15.255.255", "172.32.0.1",
            "192.167.255.255", "192.169.0.1",
            "100.63.255.255", "100.128.0.1",
            "8.8.8.8", "1.1.1.1",
            "2606:2800:220:1::1", "2001:4860:4860::8888",
        )
        for (ip in private) {
            assertEquals(ip, CleartextPolicy.Verdict.LOCAL_CLEARTEXT, CleartextPolicy.inspect(literal(ip)))
        }
        for (ip in public) {
            assertEquals(ip, CleartextPolicy.Verdict.PUBLIC_CLEARTEXT, CleartextPolicy.inspect(literal(ip)))
        }
    }

    private fun literal(ip: String) = if (ip.contains(':')) "http://[$ip]" else "http://$ip"
}
