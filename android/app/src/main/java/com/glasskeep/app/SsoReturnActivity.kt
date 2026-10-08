package com.glasskeep.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * Where the phone's browser hands single sign-on back to the app
 * (com.glasskeep.app:/oidc, see server/routes/oidcRoutes.js).
 *
 * Any app can open this address, so only the outcome's own parameters go
 * through, and only to the app's own page. A ticket brought here by
 * someone else is useless: it only redeems with the secret the app's page
 * kept for its own attempt.
 */
class SsoReturnActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        outcome(intent.data)?.let {
            startActivity(
                Intent(this, WebViewActivity::class.java)
                    .putExtra(WebViewActivity.EXTRA_SSO_OUTCOME, it)
            )
        }
        finish()
    }

    private fun outcome(uri: Uri?): String? {
        if (uri == null || uri.path != "/oidc") return null
        val ticket = uri.getQueryParameter("oidc_ticket")
        val error = uri.getQueryParameter("oidc_error")
        return when {
            ticket != null && TICKET.matches(ticket) -> "oidc_ticket=$ticket"
            error != null && ERROR.matches(error) -> "oidc_error=$error"
            uri.getQueryParameter("oidc_linked") == "1" -> "oidc_linked=1"
            else -> null
        }
    }

    private companion object {
        val TICKET = Regex("[A-Za-z0-9_-]{43}")
        val ERROR = Regex("[a-z_]{1,64}")
    }
}
