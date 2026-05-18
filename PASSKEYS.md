# 🔑 Passkeys on GlassKeep — full guide

This document covers everything you need to know to use passkeys (the
fingerprint / face-unlock / hardware-key login flow) on GlassKeep,
whether you're a regular user installing the official Android APK or a
developer rebuilding the APK with your own keystore.

> 🇫🇷 *Ce guide est en anglais pour rester cohérent avec le reste de la
> documentation du projet, mais n'hésite pas à utiliser un traducteur si
> besoin — les explications sont faites pour être lisibles par tout le
> monde, code ou pas.*

---

## 📚 Table of contents

- [What is a passkey, in plain words](#-what-is-a-passkey-in-plain-words)
- [Why this guide exists](#-why-this-guide-exists)
- [Part 1 — For end users (zero code)](#part-1--for-end-users-zero-code)
  - [Prerequisites](#prerequisites)
  - [Step-by-step setup](#step-by-step-setup)
  - [Special case: GlassKeep on a non-standard port (e.g. 8090)](#-special-case-glasskeep-on-a-non-standard-port-eg-8090)
- [Part 2 — For developers rebuilding the APK](#part-2--for-developers-rebuilding-the-apk)
  - [Why you need to do anything at all](#why-you-need-to-do-anything-at-all)
  - [Find your signing fingerprint](#find-your-signing-fingerprint)
  - [Declare your fingerprint to the server](#declare-your-fingerprint-to-the-server)
  - [Sign your local debug builds the same way](#sign-your-local-debug-builds-the-same-way)
- [Troubleshooting](#-troubleshooting)
- [Under the hood — how the wiring works](#-under-the-hood--how-the-wiring-works)

---

## 🧠 What is a passkey, in plain words

A passkey is a replacement for passwords. Instead of typing a secret
into a form, you prove your identity with **something the device
already trusts** — your fingerprint, your face, a hardware key
(YubiKey…), or a synced credential manager (Google Password Manager,
1Password, Bitwarden, iCloud Keychain, …).

What makes them safer than passwords:

- **Phishing-resistant**: a passkey is cryptographically tied to the
  exact domain it was created on. A fake site can't trick the device
  into reusing it.
- **No shared secret**: nothing reusable ever leaves your phone or
  hardware key — only a one-shot cryptographic signature.
- **No password to remember, leak, or rotate**.

GlassKeep supports passkeys for two things:

1. **Sign in** — replaces the email + password form on the login
   screen.
2. **Unlock the encrypted instance** (admins only, requires a PRF-
   capable authenticator) — replaces the passphrase + recovery-key
   tabs on the lock screen.

You can mix and match: passwords still work as a fallback, and a
single user can register several passkeys.

---

## ❓ Why this guide exists

Passkeys work out-of-the-box in any modern browser that visits a
GlassKeep instance over HTTPS. **But making them work from inside the
native Android app is different** — Android only lets an app use a
domain's passkeys when it can prove, via a small JSON file, that the
domain explicitly authorised this specific app. That's what
`/.well-known/assetlinks.json` is for.

The GlassKeep server generates that file dynamically, so you don't
have to write it by hand. But there are a couple of network
configurations (custom HTTPS ports, reverse proxies fronting other
apps on the standard port, …) where you have to nudge things into
place. This guide walks through every case we've seen.

---

# Part 1 — For end users (zero code)

> 👋 If you just downloaded the official APK from the GitHub Releases
> page and want passkeys to work, this section is for you. No
> rebuilding, no fingerprint juggling, no env vars by default.

## Prerequisites

| What | Why it matters |
|---|---|
| **A GlassKeep server reachable over HTTPS** with a valid certificate (Let's Encrypt, your domain registrar's cert, …) | Passkeys are a "secure-context only" feature — browsers and Android both flat-out refuse them over plain HTTP. Self-signed certs are also rejected by Android (the cert chain must validate against the system trust store). |
| **The server must answer on the standard port `443`** for the `/.well-known/assetlinks.json` URL — see [the non-standard-port section](#-special-case-glasskeep-on-a-non-standard-port-eg-8090) below if you can't dedicate port 443 to GlassKeep. | When Android validates the app↔domain link, it ignores any custom port you might use elsewhere and goes straight to `https://your-domain.tld/.well-known/assetlinks.json` on port 443. If nothing serves that URL, association fails. |
| **Android 9+** (Android 14+ recommended) | Below Android 9, no `Credential Manager` API exists in any form. Below 14 you also need Google Play Services to be installed — most phones have it, /e/OS / GrapheneOS / Lineage-without-MicroG users will need a third-party credential provider (Bitwarden Android) installed instead. |
| **The official APK** from the [GlassKeep Releases page](https://github.com/Victor-root/glasskeep-enhanced/releases) — *or* the F-Droid build once it ships there. | Each APK is signed with one key. The server is pre-configured to trust the official key + the F-Droid key out of the box; custom rebuilds need extra setup ([Part 2](#part-2--for-developers-rebuilding-the-apk)). |

## Step-by-step setup

1. **Install GlassKeep** on your server using whatever method you
   prefer (the recommended `install.sh` Debian path, Docker, manual
   build — see the [main README](./README.md#-installation)).

2. **Make sure HTTPS works** by visiting your domain in any browser.
   No "Not secure" warning, no certificate-error page.

3. **Install the official APK** on your phone. Two ways:

   - **From a phone browser**: open the Releases page, tap the latest
     `GlassKeep-vX.Y.Z.apk` link, accept the "install from this
     source" prompt.
   - **From a PC** with adb: `adb install GlassKeep-vX.Y.Z.apk`.

4. **Open the app, enter your server URL, sign in** with email +
   password the usual way.

5. **Go to Settings → Passkeys → Add a passkey**. Android shows its
   passkey picker (fingerprint, face unlock, hardware key, or
   "another device" if you have a YubiKey or want to use a passkey
   from another device via QR code).

6. **Sign out, sign back in** — the login screen now shows a "Sign
   in with a passkey" button that needs nothing more than your finger
   or your face.

### ✅ Quick sanity check

Open this URL in any browser, replacing the domain with yours:

```
https://YOUR-DOMAIN/.well-known/assetlinks.json
```

You should see a JSON document that contains your APK's SHA-256
fingerprint. If you see anything else (the GlassKeep login page, a
404, a Nextcloud / Apache default page, …), passkeys will fail until
you fix this — jump to [troubleshooting](#-troubleshooting).

## 🚨 Special case: GlassKeep on a non-standard port (e.g. 8090)

This is **the** failure mode we've seen most often, so it deserves
its own section. If your GlassKeep is at `https://example.com:8090`
(or any port other than 443), here's what happens.

### Why it breaks

WebAuthn passkeys are always bound to a **bare domain** (no port).
The passkey you create at `https://example.com:8090` is internally
recorded as belonging to `example.com`. When Android later wants to
use that passkey from the native app, it asks **`https://example.com/.well-known/assetlinks.json`** — *the standard port 443, not 8090*. This is
hard-coded in the WebAuthn / Digital Asset Links specs.

If nothing answers on port 443, or if what answers is a *different*
service (Nextcloud, a static landing page, …), Android can't verify
the app↔domain link and rejects every passkey request with **"RP ID
cannot be validated"**.

### How to fix it

You have two options.

#### Option A — Make port 443 forward only the assetlinks file to GlassKeep

You keep your existing services running on port 443 (Nextcloud,
another web app, whatever) and add **a single rule** that intercepts
`/.well-known/assetlinks.json` on port 443 and forwards it to
GlassKeep on its real port. The rest of port 443 keeps doing
whatever it did before.

##### Apache 2 example

In your existing `<VirtualHost *:443>` block — yes, the same one
that already serves Nextcloud / the other app — add these two lines:

```apache
ProxyPass        /.well-known/assetlinks.json http://INTERNAL-IP:GLASSKEEP-PORT/.well-known/assetlinks.json
ProxyPassReverse /.well-known/assetlinks.json http://INTERNAL-IP:GLASSKEEP-PORT/.well-known/assetlinks.json
```

Where `INTERNAL-IP:GLASSKEEP-PORT` is whatever the rest of your
reverse-proxy config uses to reach GlassKeep (for example
`http://192.168.1.81:8080`). Don't forget to enable `mod_proxy` /
`mod_proxy_http` if they aren't already:

```bash
sudo a2enmod proxy proxy_http
sudo apache2ctl configtest && sudo systemctl reload apache2
```

##### Nginx example

In the `server { listen 443 ssl; … }` block for your domain:

```nginx
location = /.well-known/assetlinks.json {
    proxy_pass http://INTERNAL-IP:GLASSKEEP-PORT/.well-known/assetlinks.json;
    proxy_set_header Host $host;
}
```

##### Caddy example

In the matching `your-domain.tld { … }` block:

```caddy
handle_path /.well-known/assetlinks.json {
    reverse_proxy INTERNAL-IP:GLASSKEEP-PORT
}
```

#### Option B — Serve a static `assetlinks.json` on port 443

If you don't want to (or can't) proxy to GlassKeep from port 443,
copy the JSON once and drop it as a static file.

1. **Fetch the JSON** that GlassKeep generates:

   ```bash
   curl -sS https://YOUR-DOMAIN:GLASSKEEP-PORT/.well-known/assetlinks.json
   ```

2. **Save the output** to wherever your port-443 web server can serve
   static files from — e.g. `/var/www/html/.well-known/assetlinks.json`.

3. **Configure the port-443 server** to serve it at the right URL with
   `Content-Type: application/json` (most servers do this from the
   file extension automatically).

**Trade-off**: you'll have to re-copy the file by hand if you ever
change the list of authorised fingerprints (see [Part 2](#part-2--for-developers-rebuilding-the-apk)). Option A keeps everything in
sync automatically.

---

# Part 2 — For developers rebuilding the APK

> 👋 This section is for you if you compile the APK yourself with your
> own keystore — typically because you don't trust the upstream
> maintainer's signed artifact, want to publish a fork, or distribute
> through a non-default app store.

## Why you need to do anything at all

Every APK is signed with a **unique cryptographic key**. Android
identifies apps by their signing certificate, not by their package
name — `com.glasskeep.app` signed by the upstream maintainer is a
*different* identity than `com.glasskeep.app` signed by you.

The GlassKeep server's `/.well-known/assetlinks.json` only authorises
specific signing fingerprints. Out of the box, two are baked in:

- The official Victor-root release key
- The F-Droid main repository signing key

If your locally-built APK is signed with neither, Android refuses to
share the domain's passkeys with it — same "RP ID cannot be
validated" failure as the port-443 case above, but for a different
reason.

The fix is to **declare your fingerprint** to the server.

## Find your signing fingerprint

> 📁 Your `.jks` / `.keystore` file lives wherever you put it during
> the "Generate Signed App Bundle / APK…" wizard in Android Studio.
> The path is also stored in `~/.android/release-keystore.properties`
> on some setups, or visible in `android/keystore.properties` if you
> followed the local-signing setup below.

### From a terminal — quickest

```bash
keytool -list -v -keystore /path/to/your-release-key.jks
```

Enter the keystore password. You'll see output that includes:

```
SHA-256: AB:CD:EF:01:23:45:…:00:11:22
```

That's the value you need. Copy it (colons included) into your
clipboard.

### From Android Studio — same value via Gradle

From the `android/` directory of the project:

```bash
./gradlew signingReport            # Linux / Mac
.\gradlew signingReport            # Windows PowerShell
```

Look for the `Variant: release` section and grab the `SHA-256:` line
under it. (The `Variant: debug` section is a *different* key —
Android Studio auto-generates one per machine and that one's
fingerprint changes whenever you reset your IDE.)

## Declare your fingerprint to the server

On the server, set the environment variable:

```bash
ANDROID_EXTRA_FINGERPRINTS="AB:CD:EF:01:23:45:…:00:11:22"
```

**Multiple fingerprints** are supported via comma-separation:

```bash
ANDROID_EXTRA_FINGERPRINTS="AB:CD:…,FE:DC:BA:…,99:88:…"
```

Different deployment styles, same variable:

| Setup | Where to put it |
|---|---|
| **`install.sh` native install** (`/opt/glass-keep/app`) | Append a line to `/opt/glass-keep/app/.env` |
| **Docker / Docker Compose** | Add an `ANDROID_EXTRA_FINGERPRINTS: "AA:BB:…"` line under the `environment:` block of `docker-compose.yml` |
| **Manual systemd unit** | Add `Environment=ANDROID_EXTRA_FINGERPRINTS=AA:BB:…` to the `[Service]` section of your unit file |

Then **restart the GlassKeep service**:

```bash
sudo systemctl restart glass-keep    # native install
docker compose restart                # Docker
```

To verify it's been picked up, curl the asset links endpoint:

```bash
curl -sS https://your-domain.tld/.well-known/assetlinks.json | python3 -m json.tool
```

Your fingerprint should appear in the `sha256_cert_fingerprints`
array. Once it does, the **same** declaration also tells the
verification layer (the `expectedOrigin` check) to accept passkey
ceremonies coming from your APK. One env var, both sides covered.

## Sign your local debug builds the same way

By default, the green **Run / Debug** triangle in Android Studio
installs an APK signed with a per-machine auto-debug key. That APK
has a *different* fingerprint than your release key, so passkeys
inside it will fail unless you also list the debug fingerprint in
`ANDROID_EXTRA_FINGERPRINTS` — annoying, because the debug key
changes whenever you reset Android Studio.

A cleaner setup: tell Gradle to **sign debug builds with your release
key too**. That way the green triangle produces a passkey-capable
APK and you don't need to go through the "Generate Signed APK"
wizard for every test cycle.

1. **Copy the template** in `android/` to its real name:

   ```bash
   cp android/keystore.properties.example android/keystore.properties
   ```

   The `.example` file is committed; the actual `keystore.properties`
   is `.gitignore`d, so your passwords never leave your machine.

2. **Edit `android/keystore.properties`** and fill in:

   ```properties
   storeFile=/absolute/path/to/your-release-key.jks
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=YOUR_KEY_ALIAS
   keyPassword=YOUR_KEY_PASSWORD
   ```

   On Windows, use forward slashes in the path
   (`D:/keys/release.jks`) — Gradle accepts them and you avoid the
   escaping headache.

3. **Re-sync Gradle** in Android Studio (the elephant icon → Sync
   Project with Gradle Files, or File → Invalidate Caches & Restart
   if Android Studio is being grumpy after the change).

4. **Click the green triangle** — the resulting APK is now signed
   with your release key, fingerprint matches what you put into
   `ANDROID_EXTRA_FINGERPRINTS`, passkeys work.

---

## 🛠️ Troubleshooting

### "Passkeys are not available in the app" / "Update the app"

You're running an APK from before `1.3.0`. The native passkey bridge
shipped in `1.3.0`. Upgrade the APK.

### "RP ID cannot be validated"

Android can't reach a valid `/.well-known/assetlinks.json` for your
domain *on port 443*. In order of likelihood:

1. Your service is on a non-standard port and port 443 doesn't
   serve the file → [non-standard-port section above](#-special-case-glasskeep-on-a-non-standard-port-eg-8090).
2. A reverse proxy in front of your domain intercepts
   `/.well-known/*` for ACME challenges and returns 404 for everything
   else → add an explicit rule for `/.well-known/assetlinks.json` *before*
   the catch-all.
3. The HTTPS certificate at `https://your-domain` is invalid (self-
   signed, expired, hostname mismatch). Android refuses to fetch the
   asset links over an untrusted connection.
4. The service worker of a previously-installed PWA cached the URL
   while the route didn't exist yet. Clear browser data for the
   domain on the phone, or — easier — uninstall and reinstall the
   app to give Credential Manager a fresh cache.

**Check yourself**: open the official Google verifier in any browser
with your domain plugged in:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://YOUR-DOMAIN&relation=delegate_permission/common.get_login_creds
```

It returns the **same** statements Android sees. If `statements: []`
or an error, that's exactly what your phone sees too.

### "Échec de la vérification" / "Verification failed"

The asset-links handshake succeeded (Android believes your app is
allowed to use the domain's passkeys), but the server rejected the
ceremony response. The most common cause is **the APK was signed
with a key whose fingerprint isn't in `ANDROID_EXTRA_FINGERPRINTS`
on the server**. Native-app passkey responses carry an
`android:apk-key-hash:…` origin derived from the signing key —
GlassKeep cross-checks that origin against the same fingerprint list
as the asset links file.

Solution: [add your fingerprint as described in Part 2](#declare-your-fingerprint-to-the-server). If it's the official APK, the
fingerprint is already baked in — but make sure you're not running a
rebuilt APK from a previous experiment.

### The passkey button is missing in the app

- Inside settings: PRF / Credential Manager isn't reachable on this
  device. Most likely Play Services missing or out of date.
- On the login screen: same root cause; the button only renders when
  WebAuthn or the Android bridge is detected.

### Passkeys work in Brave but not in the app

This is a clear signature that the bridge / asset-links layer is the
problem (Brave doesn't use either — it has its own end-to-end
WebAuthn stack). Follow the asset-links checks above.

---

## 🔍 Under the hood — how the wiring works

For those who want the full picture, here's what happens during a
passkey login from the Android app:

1. The WebView loads the React app from `https://your-domain:PORT/`.
2. The user taps "Sign in with a passkey".
3. The JS layer (`src/auth/passkeyClient.js`) detects
   `window.GlassKeepAndroidPasskey` (injected by the Android shell)
   and routes the ceremony through it instead of the WebView's own
   `navigator.credentials`.
4. The shell (`android/.../WebAuthnBridge.kt`) hands the WebAuthn
   options JSON to **`androidx.credentials.CredentialManager`**.
5. Credential Manager:
   - resolves the RP ID (the bare domain) from the options;
   - fetches `https://<rpid>/.well-known/assetlinks.json` on port 443;
   - checks the calling APK's signing fingerprint is in the list;
   - shows the OS picker (fingerprint, face, password manager, …).
6. The user authenticates. Credential Manager produces a
   `RegistrationResponseJSON` / `AuthenticationResponseJSON` whose
   `clientDataJSON.origin` looks like
   `android:apk-key-hash:<urlsafe-base64(sha256(cert))>`.
7. The bridge sends that JSON back to the JS layer, which POSTs it
   to `/api/passkeys/{register,login}/verify`.
8. The server's `expectedOrigin` includes BOTH the regular web
   origin AND every `android:apk-key-hash:…` derived from
   `assetlinks.json`'s fingerprint list, so the verification
   accepts the response.

Same fingerprint list drives the OS-level link check and the
server-level origin check. Set it once via `ANDROID_EXTRA_FINGERPRINTS`,
both ends are satisfied.

---

If this guide didn't cover your situation, please open an issue with
the exact error message and (if relevant) the output of:

```bash
curl -i https://YOUR-DOMAIN/.well-known/assetlinks.json
```

— that's almost always enough to diagnose what's going on.
