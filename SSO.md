# 🔐 Single sign-on (OpenID Connect)

GlassKeep can let people sign in through an **OpenID Connect provider**:
Authentik, Keycloak, Authelia, Zitadel, PocketID, or any provider that
follows the standard. Nothing in GlassKeep is specific to one of them.

> 🇫🇷 *Ce guide est en anglais comme le reste de la documentation du
> projet. Les écrans de GlassKeep, eux, sont traduits.*

---

## 📚 Table of contents

- [How it works, in plain words](#-how-it-works-in-plain-words)
- [Before you start](#-before-you-start)
- [Step 1: create the application at your provider](#step-1-create-the-application-at-your-provider)
  - [Authentik](#authentik)
  - [Keycloak](#keycloak)
  - [Authelia](#authelia)
- [Step 2: configure GlassKeep](#step-2-configure-glasskeep)
- [Who gets in, and with which account](#-who-gets-in-and-with-which-account)
- [Android app](#-android-app)
- [Troubleshooting](#-troubleshooting)
- [Under the hood](#-under-the-hood)

---

## 🧠 How it works, in plain words

The login screen shows an extra button, **"Sign in with &lt;provider&gt;"**.
It sends you to your provider's own login page; once you are signed in
there, you come back to GlassKeep already signed in. From then on
GlassKeep works exactly as with a password: the rest of the app does
not know, or care, how you signed in.

Your provider's secret never reaches your browser, and GlassKeep never
gives admin rights because of something the provider says (a group, a
role, a claim). Admins stay admins of GlassKeep, decided in GlassKeep.

---

## ✅ Before you start

- **GlassKeep should be reachable over HTTPS.** Most providers refuse a
  plain `http://` redirect address, and sign-in data would travel
  unencrypted. The admin panel warns you when it is not the case.
- Open the admin panel **from the address your users use** (for example
  `https://notes.example.com`, not a LAN IP). GlassKeep reads its own
  public address from the page you are on, the same way the
  cross-server pairing does, so there is nothing to type for it.
- The instance must be unlocked if at-rest encryption is on, like any
  other sign-in.

---

## Step 1: create the application at your provider

Whatever the provider, you need:

| What the provider asks for | Value |
|---|---|
| Client type | **Confidential** (it has a client secret) |
| Grant / flow | **Authorization Code** |
| Redirect URI | `https://<your GlassKeep address>/api/auth/oidc/callback` (shown in the admin panel, with a copy button) |
| Scopes | `openid`, `profile`, `email` |
| Signing | RS256 (or any asymmetric algorithm the provider publishes in its JWKS) |

PKCE (S256) is always used by GlassKeep; you can enforce it at the
provider if it has that option.

You will come back with three things: the **issuer URL**, the
**client ID** and the **client secret**.

### Authentik

1. **Applications → Providers → Create → OAuth2/OpenID Provider.**
2. Client type: **Confidential**. Redirect URIs: the callback shown in
   GlassKeep, mode *strict*. Signing key: any certificate (for RS256).
3. **Applications → Applications → Create**, pick that provider, and
   bind the users or groups allowed in.
4. The issuer is shown on the provider page as **OpenID Configuration
   Issuer**, for example `https://auth.example.com/application/o/glasskeep/`.
   Copy it **with its trailing slash**.

### Keycloak

1. In your realm, **Clients → Create client**, type *OpenID Connect*.
2. **Client authentication: On** (confidential), **Standard flow: On**.
3. **Valid redirect URIs**: the callback shown in GlassKeep.
4. The client secret is in the **Credentials** tab.
5. The issuer is `https://keycloak.example.com/realms/<realm>` (no
   trailing slash).

### Authelia

Declare a client in `identity_providers.oidc.clients`:

```yaml
- client_id: glasskeep
  client_name: GlassKeep
  client_secret: '<hashed secret, see Authelia docs>'
  public: false
  authorization_policy: two_factor
  require_pkce: true
  pkce_challenge_method: S256
  redirect_uris:
    - https://notes.example.com/api/auth/oidc/callback
  scopes: [openid, profile, email]
  grant_types: [authorization_code]
  response_types: [code]
  token_endpoint_auth_method: client_secret_basic
```

The issuer is your Authelia address, for example `https://auth.example.com`.
Authelia only puts the email in the userinfo answer by default;
GlassKeep reads it from there when the token does not carry it.

---

## Step 2: configure GlassKeep

**Admin panel → Single sign-on (SSO):**

1. Check the **public address** and the **redirect URI** shown at the
   top; the redirect URI is what you declared at the provider.
2. Fill in the **provider name** (it appears on the button, e.g.
   "Authentik" or "SSO"), the **issuer URL**, the **client ID** and the
   **client secret**.
3. Press **Test the configuration**. GlassKeep fetches the provider's
   `.well-known/openid-configuration` and its signing keys. If the
   issuer you typed differs from the one the provider publishes (the
   trailing slash, typically), the test shows the right value with a
   button to use it.
4. **Save**, then switch **Enable OpenID Connect** on. GlassKeep refuses
   to enable a provider it cannot reach.

The client secret is stored on the server only. The panel never shows
it again; leave the field empty to keep the saved one.

The client ID and secret themselves can only be proven by a real sign-in:
try it from a private window.

---

## 👥 Who gets in, and with which account

GlassKeep identifies a person by what the provider guarantees to be
stable and unique: the **issuer and subject** (`iss` + `sub`), kept in
their own table. **The email is never used to decide which account
opens**, because many providers let people change their email.

- **Someone already linked** signs in to their account, whatever their
  email has become at the provider.
- **Someone new**, with **"Create accounts automatically"** on (the
  default), gets a regular GlassKeep account named and addressed after
  their provider profile, as long as no account or pending registration
  already uses that email. Access control is then your provider's job:
  bind the application to the users or groups allowed in. Turn the option
  off if your provider is open to the public.
- **Someone whose email is already used by a GlassKeep account** is
  refused, with a message explaining what to do: sign in the usual way,
  then **Settings → Security → Single sign-on → Link**. Linking while
  signed in proves the person owns both, which matching emails would not.
- Addresses listed in `ADMIN_EMAILS` are never created automatically,
  since that variable would promote them to admin at the next start.
  Create the account by hand, then link it.

An account created through the provider has no password. It cannot
unlink its only way in; an admin can set it a password from the user
list if needed.

---

## 📱 Android app

The app signs in through the provider inside its own window, then comes
back to GlassKeep by itself. Use the same server address in the app as
the one the admin saved the configuration from.

---

## 🧰 Troubleshooting

| What you see | What it means |
|---|---|
| *"The provider publishes a different issuer"* | Use exactly the issuer the provider publishes (the test offers it). |
| *"The provider could not be reached"* | The GlassKeep **server** must reach the issuer, not only your browser. Check DNS, firewall, and that a self-signed provider certificate is trusted by Node (`NODE_EXTRA_CA_CERTS`). |
| *"To sign in with this provider, open GlassKeep at …"* | You are on another address than the one the configuration was saved from. Use that one, or save the configuration again from this one (and update the redirect URI at the provider). |
| *"This sign-in attempt expired or was started in another browser"* | The round trip took more than 10 minutes, the server restarted in between, or the browser blocks cookies for GlassKeep. |
| *"An account already uses this email"* | See [linking](#-who-gets-in-and-with-which-account). |
| The provider says *redirect_uri mismatch* | The redirect URI declared at the provider must match the one shown in the admin panel character for character. |

The server log says why a sign-in was refused, prefixed with `[oidc]`.
It never logs tokens or secrets.

---

## 🔬 Under the hood

- The whole flow runs on the server, with
  [openid-client](https://github.com/panva/openid-client) (certified
  OpenID Connect relying party library): discovery from the issuer,
  **Authorization Code + PKCE S256**, `state` and `nonce`.
- The ID token is validated by the library: signature against the
  provider's JWKS (checked even though the token comes straight from the
  token endpoint), issuer, audience, expiry, nonce.
- The attempt is bound to the browser that started it by an HttpOnly
  cookie, and the way back into the app is a one-time ticket valid for
  one minute, traded for the usual GlassKeep session. A stolen callback
  link or ticket is useless in another browser.
- Storage: `oidc_providers` (one instance-wide row for now, with an
  `owner_user_id` column reserved for providers users bring for their
  own account later) and `user_external_identities` (`issuer` +
  `subject`, unique).
