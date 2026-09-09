package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.network.InstanceStatusResponse

/**
 * Whether the server's at-rest encryption is currently locked, and the two
 * flags that decide which of the unlock screen and the banner is showing.
 * The native counterpart of the web's useInstanceLockStatus hook plus
 * App.jsx's own lockBannerDismissed/lockOverlayOpen state (App.jsx:2094).
 *
 * A locked server answers HTTP 423 on every /api/ route but a small
 * allowlist (server/index.js's LOCK_ALLOW_PATHS), so without this the app
 * would just fail every call with no explanation and no way back in.
 *
 * Deliberately NOT cached in TokenStore: this is live server state, and a
 * stale "locked" read on a cold start would show the unlock screen to
 * someone whose server is perfectly fine. [status] starts null, meaning
 * "not asked yet", and nothing is gated until the first read comes back.
 *
 * Written from OkHttp's own threads too (see [markLocked]); Compose
 * snapshot state handles that.
 */
class InstanceLockState {
    var status: InstanceStatusResponse? by mutableStateOf(null)
        private set

    /** The user hid the banner by hand. Re-armed on every fresh lock, so a
     *  server that locks again after an unlock says so once more. */
    var bannerDismissed by mutableStateOf(false)

    /** The banner's "Unlock now" was pressed: show the full screen over the
     *  signed-in app rather than the banner. */
    var overlayOpen by mutableStateOf(false)

    /** Both flags, exactly as the web reads them: encryption configured at
     *  all AND currently locked. */
    val isLocked: Boolean
        get() = status?.let { it.enabled && it.locked } == true

    fun apply(fresh: InstanceStatusResponse) {
        val wasLocked = isLocked
        status = fresh
        if (!fresh.locked) {
            bannerDismissed = false
            overlayOpen = false
        } else if (!wasLocked) {
            bannerDismissed = false
        }
    }

    /**
     * A 423 landed, or the server pushed its instance_locked event: flip to
     * locked now instead of waiting up to 30 seconds for the next status
     * read. Mirrors the web's own `instance-locked` window event, whose two
     * senders are exactly the same two (api.js on a 423, App.jsx:3775 on
     * the SSE frame).
     */
    fun markLocked() {
        val current = status
        if (current != null && current.enabled && current.locked) return
        status = InstanceStatusResponse(enabled = true, locked = true, unlocked = false)
        bannerDismissed = false
    }
}
