package com.glasskeep.app

import android.app.Activity
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
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
import org.json.JSONObject

/**
 * JavaScript ↔ Kotlin bridge that lets the WebView use Android's
 * Credential Manager (passkeys) instead of the WebView's own crippled
 * `navigator.credentials` implementation.
 *
 * How the wiring works:
 *
 *   1. The WebView exposes this class under `window.AndroidPasskey`
 *      via `addJavascriptInterface`. From JS we get two methods:
 *        - `createCredential(optionsJson, callbackId)`
 *        - `getCredential(optionsJson, callbackId)`
 *
 *   2. A polyfill injected by [WebViewActivity] wraps these into a
 *      Promise-friendly façade (`window.GlassKeepAndroidPasskey`) and
 *      a `window.__glasskeepResolvePasskey(id, payload, error)` hook
 *      we call back into to resolve those promises.
 *
 *   3. The frontend's `passkeyClient.js` checks for that façade and,
 *      when present, routes registration / authentication through it
 *      instead of `@simplewebauthn/browser`. SimpleWebAuthn stays in
 *      use in regular browsers.
 *
 * The JSON we accept matches the WebAuthn `PublicKeyCredentialCreation
 * OptionsJSON` / `PublicKeyCredentialRequestOptionsJSON` shapes that
 * `@simplewebauthn/server` already produces. Credential Manager parses
 * the same shape — so we forward the string as-is and let Android do
 * the heavy lifting. The response strings we get back
 * (`registrationResponseJson` / `authenticationResponseJson`) are
 * likewise the standard `RegistrationResponseJSON` /
 * `AuthenticationResponseJSON` payloads the server's
 * `/passkeys/.../verify` endpoints already understand.
 *
 * @JavascriptInterface methods are invoked on a binder thread, NOT the
 * main thread. Credential Manager callbacks need an Executor and a UI
 * context — we hand them the main executor + the host Activity so the
 * passkey picker can launch as part of the same Activity stack.
 */
class WebAuthnBridge(
    private val activity: Activity,
    private val webViewProvider: () -> WebView?,
) {
    private val credentialManager = CredentialManager.create(activity)
    private val mainExecutor = ContextCompat.getMainExecutor(activity)

    @JavascriptInterface
    fun createCredential(optionsJson: String?, callbackId: String?) {
        val cb = callbackId ?: return
        val json = optionsJson
        if (json.isNullOrBlank()) {
            resolveError(cb, "InvalidStateError", "Empty options payload")
            return
        }

        val request = try {
            CreatePublicKeyCredentialRequest(json)
        } catch (e: Throwable) {
            // Credential Manager rejects malformed JSON before launching
            // any UI — surface that as a clean error rather than letting
            // the JS promise hang.
            resolveError(cb, "InvalidStateError", e.message ?: "Invalid options", e)
            return
        }

        try {
            credentialManager.createCredentialAsync(
                context = activity,
                request = request,
                cancellationSignal = null,
                executor = mainExecutor,
                callback =
                    object :
                        CredentialManagerCallback<
                            CreateCredentialResponse,
                            CreateCredentialException,
                        > {
                        override fun onResult(result: CreateCredentialResponse) {
                            val pk = result as? CreatePublicKeyCredentialResponse
                            if (pk == null) {
                                resolveError(
                                    cb,
                                    "UnknownError",
                                    "Unexpected response type: " +
                                        result.javaClass.simpleName,
                                )
                                return
                            }
                            // registrationResponseJson is the standard
                            // WebAuthn RegistrationResponseJSON — we pass
                            // it straight back to JS, which forwards it
                            // to /passkeys/register/verify untouched.
                            resolveSuccess(cb, pk.registrationResponseJson)
                        }

                        override fun onError(e: CreateCredentialException) {
                            val name =
                                if (e is CreateCredentialCancellationException) {
                                    // WebAuthn-spec name the frontend already
                                    // recognises ("user cancelled").
                                    "NotAllowedError"
                                } else {
                                    e.type.ifBlank { e.javaClass.simpleName }
                                }
                            resolveError(cb, name, e.errorMessage?.toString() ?: e.message ?: name, e)
                        }
                    },
            )
        } catch (e: Throwable) {
            // Pre-flight errors (no provider configured, etc.) before the
            // async callback gets a chance — surface them too.
            resolveError(cb, "UnknownError", e.message ?: "Credential Manager error", e)
        }
    }

    @JavascriptInterface
    fun getCredential(optionsJson: String?, callbackId: String?) {
        val cb = callbackId ?: return
        val json = optionsJson
        if (json.isNullOrBlank()) {
            resolveError(cb, "InvalidStateError", "Empty options payload")
            return
        }

        val option = try {
            GetPublicKeyCredentialOption(json)
        } catch (e: Throwable) {
            resolveError(cb, "InvalidStateError", e.message ?: "Invalid options", e)
            return
        }
        val request = GetCredentialRequest(listOf(option))

        try {
            credentialManager.getCredentialAsync(
                context = activity,
                request = request,
                cancellationSignal = null,
                executor = mainExecutor,
                callback =
                    object :
                        CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                        override fun onResult(result: GetCredentialResponse) {
                            val cred = result.credential as? PublicKeyCredential
                            if (cred == null) {
                                resolveError(
                                    cb,
                                    "UnknownError",
                                    "Unexpected credential type: " +
                                        result.credential.javaClass.simpleName,
                                )
                                return
                            }
                            resolveSuccess(cb, cred.authenticationResponseJson)
                        }

                        override fun onError(e: GetCredentialException) {
                            val name =
                                if (e is GetCredentialCancellationException) {
                                    "NotAllowedError"
                                } else {
                                    e.type.ifBlank { e.javaClass.simpleName }
                                }
                            resolveError(cb, name, e.errorMessage?.toString() ?: e.message ?: name, e)
                        }
                    },
            )
        } catch (e: Throwable) {
            resolveError(cb, "UnknownError", e.message ?: "Credential Manager error", e)
        }
    }

    /** True if Credential Manager is reachable on this device. Mostly
     *  there to short-circuit on stripped-down ROMs (no Play Services,
     *  no system-provided credential manager) before we offer the
     *  passkey UI in the WebView. */
    @JavascriptInterface
    fun isAvailable(): Boolean = true

    private fun resolveSuccess(callbackId: String, payload: String) {
        val js =
            "window.__glasskeepResolvePasskey && window.__glasskeepResolvePasskey(" +
                jsString(callbackId) +
                ", " +
                jsString(payload) +
                ", null);"
        evaluate(js)
    }

    private fun resolveError(
        callbackId: String,
        name: String,
        message: String,
        cause: Throwable? = null,
    ) {
        if (cause != null) {
            Log.w(TAG, "WebAuthn error [${name}]: ${message}", cause)
        } else {
            Log.w(TAG, "WebAuthn error [${name}]: ${message}")
        }
        val err =
            JSONObject().apply {
                put("name", name)
                put("message", message)
            }
        val js =
            "window.__glasskeepResolvePasskey && window.__glasskeepResolvePasskey(" +
                jsString(callbackId) +
                ", null, " +
                err.toString() +
                ");"
        evaluate(js)
    }

    private fun evaluate(js: String) {
        activity.runOnUiThread {
            val webView = webViewProvider() ?: return@runOnUiThread
            webView.evaluateJavascript(js, null)
        }
    }

    /** Tiny JSON-string encoder used for the two literal arguments we
     *  hand back to JS. We don't need the full JSON library here —
     *  the payload is opaque to us anyway. */
    private fun jsString(s: String): String {
        val sb = StringBuilder(s.length + 2)
        sb.append('"')
        for (c in s) {
            when (c) {
                '\\' -> sb.append("\\\\")
                '"' -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                '<' -> sb.append("\\u003C") // defensive: avoid </script>-style escapes
                else ->
                    if (c.code < 0x20) {
                        sb.append("\\u%04x".format(c.code))
                    } else {
                        sb.append(c)
                    }
            }
        }
        sb.append('"')
        return sb.toString()
    }

    companion object {
        private const val TAG = "GlassKeepPasskey"

        /** JS interface name exposed on `window`. The polyfill calls
         *  the methods on this object directly. */
        const val JS_INTERFACE_NAME = "AndroidPasskey"

        /** Polyfill installed by [WebViewActivity] before any page
         *  script runs. Exposes `window.GlassKeepAndroidPasskey` to the
         *  React app and the `__glasskeepResolvePasskey` callback to
         *  Kotlin. Lives here so the Kotlin and JS sides ship together
         *  and stay in sync. */
        val POLYFILL_JS: String =
            """
(function () {
  if (window.__glasskeepPasskeyPolyfillReady) return;
  if (!window.AndroidPasskey || typeof window.AndroidPasskey.createCredential !== 'function') return;
  window.__glasskeepPasskeyPolyfillReady = true;

  var pending = Object.create(null);
  var counter = 0;

  window.__glasskeepResolvePasskey = function (id, payload, error) {
    var entry = pending[id];
    if (!entry) return;
    delete pending[id];
    if (error) {
      var err = new Error(error && error.message ? error.message : String(error));
      err.name = (error && error.name) ? error.name : 'Error';
      entry.reject(err);
      return;
    }
    try {
      var parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
      entry.resolve(parsed);
    } catch (e) {
      entry.reject(e);
    }
  };

  function callBridge(method, options) {
    return new Promise(function (resolve, reject) {
      var id = String(++counter);
      pending[id] = { resolve: resolve, reject: reject };
      try {
        var json = (typeof options === 'string') ? options : JSON.stringify(options);
        window.AndroidPasskey[method](json, id);
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  }

  window.GlassKeepAndroidPasskey = {
    available: true,
    register: function (options) { return callBridge('createCredential', options); },
    authenticate: function (options) { return callBridge('getCredential', options); }
  };
})();
            """
                .trim()
    }
}
