package com.glasskeep.app.nativeapp.ui

import android.content.Context
import android.os.SystemClock
import androidx.annotation.StringRes
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.FederationEvent
import com.glasskeep.app.nativeapp.data.bodyOrRefusal
import com.glasskeep.app.nativeapp.data.network.FederationAcceptRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * FederationInviteWatcher.jsx, for an administrator: every pairing request
 * as a notice with Accept and Decline, those already waiting at sign-in
 * and each new one as it arrives, withdrawn once handled from the panel;
 * and a short notice for the other news of the links (a peer offline, back,
 * locked, unlocked or out of date, a request accepted, declined or
 * withdrawn, an unpairing).
 */
internal class FederationInviteWatcher(
    private val context: Context,
    private val api: GlassKeepApi,
    private val toasts: ToastController,
    private val scope: CoroutineScope,
    private val localBaseUrl: String,
) {
    private val seen = mutableSetOf<String>()
    private val stateSeen = mutableMapOf<String, Long>()
    private val toastIdByLink = mutableMapOf<String, Long>()

    /** The durable catch-up: every request already waiting. */
    suspend fun catchUp() {
        try {
            api.getFederationLinks().bodyOrRefusal("GET /api/admin/federation/links").links
                .filter { it.status == "incoming_pending" }
                .forEach { raiseRequest(it.id, it.peerBaseUrl, it.peerLabel) }
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("Pending pairing requests read failed", t)
        }
    }

    fun onEvent(event: FederationEvent) {
        val who = event.peerLabel?.takeIf { it.isNotEmpty() } ?: hostOf(event.peerBaseUrl.orEmpty())
        when (event.type) {
            "federation_invitation" -> raiseRequest(event.linkId, event.peerBaseUrl.orEmpty(), event.peerLabel)
            // Handled from the panel instead: the notice would offer a
            // decision already made.
            "federation_invitation_resolved" -> event.linkId?.let { toastIdByLink.remove(it) }?.let(toasts::remove)
            "federation_link_state" -> announceState(event, who)
            "federation_linked" -> connectionNotice(NotifVariant.SUCCESS, R.string.native_fed_linked_toast, who)
            "federation_refused" -> connectionNotice(
                NotifVariant.WARNING,
                if (event.cancelled) R.string.native_fed_cancelled_toast else R.string.native_fed_declined_toast,
                who,
            )
            "federation_dissociated" -> connectionNotice(NotifVariant.WARNING, R.string.native_fed_dissociated_toast, who)
        }
    }

    /** The request's name comes from its sender and proves nothing, so the
     *  address it would reach is always shown with it, unless both read
     *  the same. */
    private fun raiseRequest(linkId: String?, peerBaseUrl: String, peerLabel: String?) {
        if (linkId != null && !seen.add(linkId)) return
        val host = hostOf(peerBaseUrl)
        val who = peerLabel?.takeIf { it.isNotEmpty() } ?: host
        val request = if (who == host) {
            context.getString(R.string.native_fed_invite_received, who)
        } else {
            context.getString(R.string.native_fed_invite_received_from, who, host)
        }
        val toastId = toasts.show(
            message = "$request ${context.getString(R.string.native_fed_invite_verify_address)}",
            variant = NotifVariant.INFO,
            title = context.getString(R.string.native_fed_invite_received_title),
            type = "federation",
            persistent = true,
            stacked = true,
            actionLabel = context.getString(R.string.native_fed_accept),
            action = linkId?.let { { accept(it) } },
            secondaryActionLabel = context.getString(R.string.native_fed_refuse),
            secondaryAction = linkId?.let { { refuse(it) } },
            secondaryOutlined = false,
        )
        if (linkId != null && toastId != null) toastIdByLink[linkId] = toastId
    }

    private fun accept(linkId: String) {
        scope.launch {
            try {
                api.acceptFederation(linkId, FederationAcceptRequest(localBaseUrl))
                    .bodyOrRefusal("POST /api/admin/federation/links/$linkId/accept")
                toasts.success(context.getString(R.string.native_fed_accepted_toast), "user-check")
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Pairing request accept failed", t)
                toasts.error(context.federationErrorText(t, R.string.native_fed_action_failed))
            }
        }
    }

    private fun refuse(linkId: String) {
        scope.launch {
            try {
                api.refuseFederation(linkId).bodyOrRefusal("POST /api/admin/federation/links/$linkId/refuse")
                toasts.show(context.getString(R.string.native_fed_refused_toast), NotifVariant.INFO, icon = "user-x")
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Pairing request decline failed", t)
                toasts.error(context.federationErrorText(t, R.string.native_fed_action_failed))
            }
        }
    }

    /** A connectivity flip on an active link. The same peer and state
     *  within 8s speaks once (two links to one peer, a frame sent twice);
     *  a link's very first check after pairing says nothing. */
    private fun announceState(event: FederationEvent, who: String) {
        val signature = "$who|${event.state}"
        val now = SystemClock.elapsedRealtime()
        if (stateSeen[signature]?.let { now - it < 8_000 } == true) return
        stateSeen[signature] = now
        val previous = event.previousState
        when (event.state) {
            "offline" -> connectionNotice(NotifVariant.WARNING, R.string.native_fed_peer_offline, who)
            "online" -> when (previous) {
                "locked" -> connectionNotice(NotifVariant.SUCCESS, R.string.native_fed_peer_unlocked, who)
                "offline", "incompatible" -> connectionNotice(NotifVariant.SUCCESS, R.string.native_fed_peer_online, who)
            }
            "locked" -> connectionNotice(NotifVariant.WARNING, R.string.native_fed_peer_locked, who)
            "incompatible" -> connectionNotice(NotifVariant.WARNING, R.string.native_fed_peer_incompatible, who)
        }
    }

    private fun connectionNotice(variant: NotifVariant, @StringRes message: Int, who: String) {
        toasts.show(
            context.getString(message, who),
            variant,
            title = context.getString(R.string.native_fed_conn_title),
            type = "federation",
        )
    }
}
