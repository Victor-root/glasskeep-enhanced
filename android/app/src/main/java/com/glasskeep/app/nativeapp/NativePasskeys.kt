package com.glasskeep.app.nativeapp

import android.app.Activity
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** Outcome of a passkey register/authenticate ceremony. */
sealed class PasskeyCeremonyResult {
    /** The standard WebAuthn RegistrationResponseJSON / AuthenticationResponseJSON
     *  text, forwarded to the matching server verify route untouched. */
    data class Success(val responseJson: String) : PasskeyCeremonyResult()

    /** A failure, [name] mirroring the WebAuthn-spec DOMException name
     *  where recognisable, else the platform exception's own type string.
     *  The user dismissing the system picker (or having nothing to pick
     *  from) lands here too, always named "NotAllowedError" (see
     *  mapCreateError/mapGetError below): check with [isUserCancellation]
     *  to treat that one case as a silent, retry-able no-op the same way
     *  the web's own PasskeyLoginButton checks e.name, rather than a
     *  separate case every caller would need its own branch for. */
    data class Failed(val name: String, val message: String) : PasskeyCeremonyResult()
}

/**
 * Direct (non-WebView) Credential Manager caller for the native login
 * screen and the Settings screen's passkey management section. Mirrors
 * com.glasskeep.app.WebAuthnBridge exactly (same CredentialManager calls,
 * same cancellation-detection heuristic: CredentialManagerCallback
 * doesn't give a clean "the user cancelled" signal on its own, it's spread
 * across several exception types and locale-dependent messages), minus
 * everything that file only needs for its JS-bridge role (no
 * @JavascriptInterface, no callback-id map, no window.__glasskeepResolvePasskey
 * round-trip): native code already runs on Kotlin coroutines, so this
 * wraps the same callback API in suspendCancellableCoroutine instead of a
 * hand-rolled Promise bridge.
 *
 * Needs no new server-side config: a passkey ceremony's expected origin
 * (see the server's androidApkOrigins()) is a function of which signed
 * package made the call, not of which Activity or UI framework (WebView
 * vs. Compose) issued it: NativeAppActivity ships in the exact same
 * signed APK as WebViewActivity already does.
 */
object NativePasskeys {
    suspend fun register(activity: Activity, optionsJson: String): PasskeyCeremonyResult {
        val request = try {
            CreatePublicKeyCredentialRequest(optionsJson)
        } catch (e: Throwable) {
            return PasskeyCeremonyResult.Failed("InvalidStateError", e.message ?: "Invalid options")
        }
        val credentialManager = CredentialManager.create(activity)
        val mainExecutor = ContextCompat.getMainExecutor(activity)
        return suspendCancellableCoroutine { cont ->
            val cancellationSignal = CancellationSignal()
            cont.invokeOnCancellation { cancellationSignal.cancel() }
            try {
                credentialManager.createCredentialAsync(
                    context = activity,
                    request = request,
                    cancellationSignal = cancellationSignal,
                    executor = mainExecutor,
                    callback = object : CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
                        override fun onResult(result: CreateCredentialResponse) {
                            val pk = result as? CreatePublicKeyCredentialResponse
                            if (cont.isActive) {
                                cont.resume(
                                    if (pk == null) {
                                        PasskeyCeremonyResult.Failed("UnknownError", "Unexpected response type: ${result.javaClass.simpleName}")
                                    } else {
                                        PasskeyCeremonyResult.Success(pk.registrationResponseJson)
                                    }
                                )
                            }
                        }

                        override fun onError(e: CreateCredentialException) {
                            if (cont.isActive) cont.resume(mapCreateError(e))
                        }
                    },
                )
            } catch (e: Throwable) {
                if (cont.isActive) cont.resume(PasskeyCeremonyResult.Failed("UnknownError", e.message ?: "Credential Manager error"))
            }
        }
    }

    suspend fun authenticate(activity: Activity, optionsJson: String): PasskeyCeremonyResult {
        val option = try {
            GetPublicKeyCredentialOption(optionsJson)
        } catch (e: Throwable) {
            return PasskeyCeremonyResult.Failed("InvalidStateError", e.message ?: "Invalid options")
        }
        val request = GetCredentialRequest(listOf(option))
        val credentialManager = CredentialManager.create(activity)
        val mainExecutor = ContextCompat.getMainExecutor(activity)
        return suspendCancellableCoroutine { cont ->
            val cancellationSignal = CancellationSignal()
            cont.invokeOnCancellation { cancellationSignal.cancel() }
            try {
                credentialManager.getCredentialAsync(
                    context = activity,
                    request = request,
                    cancellationSignal = cancellationSignal,
                    executor = mainExecutor,
                    callback = object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                        override fun onResult(result: GetCredentialResponse) {
                            if (!cont.isActive) return
                            val cred = result.credential as? PublicKeyCredential
                            cont.resume(
                                if (cred == null) {
                                    PasskeyCeremonyResult.Failed("UnknownError", "Unexpected credential type: ${result.credential.javaClass.simpleName}")
                                } else {
                                    PasskeyCeremonyResult.Success(cred.authenticationResponseJson)
                                }
                            )
                        }

                        override fun onError(e: GetCredentialException) {
                            if (cont.isActive) cont.resume(mapGetError(e))
                        }
                    },
                )
            } catch (e: Throwable) {
                if (cont.isActive) cont.resume(PasskeyCeremonyResult.Failed("UnknownError", e.message ?: "Credential Manager error"))
            }
        }
    }

    // Same cancellation-detection rationale as WebAuthnBridge's own create
    // branch: CredentialManagerCallback surfaces "user dismissed the
    // picker" through several exception classes, plus a possibly-localized
    // message we can't grep for "cancel" in reliably.
    private fun mapCreateError(e: CreateCredentialException): PasskeyCeremonyResult.Failed {
        val typeStr = e.type
        val isCancel = e is CreateCredentialCancellationException ||
            typeStr.contains("USER_CANCELED", ignoreCase = true) ||
            typeStr.contains("CANCEL", ignoreCase = true) ||
            typeStr.contains("INTERRUPT", ignoreCase = true)
        val name = if (isCancel) "NotAllowedError" else typeStr.ifBlank { e.javaClass.simpleName }
        return PasskeyCeremonyResult.Failed(name, e.errorMessage?.toString() ?: e.message ?: name)
    }

    private fun mapGetError(e: GetCredentialException): PasskeyCeremonyResult.Failed {
        val typeStr = e.type
        val isCancel = e is GetCredentialCancellationException ||
            typeStr.contains("USER_CANCELED", ignoreCase = true) ||
            typeStr.contains("CANCEL", ignoreCase = true) ||
            typeStr.contains("INTERRUPT", ignoreCase = true)
        val name = if (isCancel) "NotAllowedError" else typeStr.ifBlank { e.javaClass.simpleName }
        return PasskeyCeremonyResult.Failed(name, e.errorMessage?.toString() ?: e.message ?: name)
    }
}

/** True for a [PasskeyCeremonyResult.Failed] whose name is the WebAuthn-spec
 *  cancellation name, exactly the check the web's own PasskeyLoginButton
 *  does on e.name before deciding whether to show an error at all. */
fun PasskeyCeremonyResult.isUserCancellation(): Boolean =
    this is PasskeyCeremonyResult.Failed && name == "NotAllowedError"
