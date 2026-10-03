# 🔐 Single sign-on (OpenID Connect)

GlassKeep lets each user sign in through **their own OpenID Connect
provider**: Authentik, Keycloak, Authelia, Zitadel, PocketID, or any
provider that follows the standard. Nothing in GlassKeep is specific to
one of them.

> 🇫🇷 *Ce guide est en anglais comme le reste de la documentation du
> projet. Les écrans de GlassKeep, eux, sont traduits.*

---

## 📚 Table of contents

- [How it works, in plain words](#-how-it-works-in-plain-words)
- [For the admin: one switch](#-for-the-admin-one-switch)
- [For each user: set up your provider](#-for-each-user-set-up-your-provider)
  - [Step 1: create the application at your provider](#step-1-create-the-application-at-your-provider)
  - [Step 2: enter it in GlassKeep and link your account](#step-2-enter-it-in-glasskeep-and-link-your-account)
- [Signing in](#-signing-in)
- [Android app](#-android-app)
- [Troubleshooting](#-troubleshooting)
- [Under the hood](#-under-the-hood)

---

## 🧠 How it works, in plain words

- The **admin** only decides whether the instance allows single sign-on.
- Each **user** who wants it declares their own provider in their
  settings, then **links** their GlassKeep account by signing in there
  once.
- On the login screen, **"Sign in with my provider"** asks for the
  GlassKeep email, sends you to that account's provider, and brings you
  back signed in. From then on GlassKeep works exactly as with a
  password.

Your provider's secret never reaches a browser. A provider never creates
a GlassKeep account and never grants any right: it only opens the
account that linked it.

---

## 🛡️ For the admin: one switch

**Admin panel → Login page settings → Allow single sign-on (SSO).**

That is all. Turning it off hides the button from the login screen and
stops every sign-in through a provider; each user's configuration is
kept for when it comes back on.

A regular user's provider must be reachable at a **public address**: the
server refuses to connect to a local network address on their behalf,
the same rule as for a user's own AI endpoint, so that no account can use
GlassKeep to probe the network it runs in. An admin's own provider may
sit on the local network.

---

## 👤 For each user: set up your provider

Before you start, open GlassKeep **from the address you sign in with**
(for example `https://notes.example.com`), ideally over HTTPS: most
providers refuse a plain `http://` redirect address.

### Step 1: create the application at your provider

Whatever the provider, you need:

| What the provider asks for | Value |
|---|---|
| Client type | **Confidential** (it has a client secret) |
| Grant / flow | **Authorization Code** |
| Redirect URI | `https://<your GlassKeep address>/api/auth/oidc/callback` (shown in your settings, with a copy button) |
| Scopes | `openid`, `profile`, `email` |
| Signing | RS256 (or any asymmetric algorithm the provider publishes in its JWKS) |

PKCE (S256) is always used by GlassKeep; you can enforce it at the
provider if it has that option. You will come back with three things:
the **issuer URL**, the **client ID** and the **client secret**.

**Authentik**

1. **Applications → Applications → Create with Provider**, provider type
   **OAuth2/OpenID Provider**.
2. Client type **Confidential**, redirect URI the one shown in GlassKeep
   (mode *strict*), signing key: any certificate (for RS256).
3. Optionally, in the application's **Policy / Group / User Bindings**
   tab, use **Bind existing policy / group / user** to restrict who may
   use it. With no binding, every Authentik user can.
4. The issuer is shown on the provider page as **OpenID Configuration
   Issuer**, for example `https://auth.example.com/application/o/glasskeep/`.
   Copy it **with its trailing slash**.

**Keycloak**

1. In your realm, **Clients → Create client**, type *OpenID Connect*.
2. **Client authentication: On**, **Standard flow: On**, **Valid
   redirect URIs**: the one shown in GlassKeep.
3. The client secret is in the **Credentials** tab. The issuer is
   `https://keycloak.example.com/realms/<realm>` (no trailing slash).

**Authelia**

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
GlassKeep reads it from there.

### Step 2: enter it in GlassKeep and link your account

**Settings → Security → Single sign-on:**

1. Check the **public address** and **redirect URI** shown at the top:
   the redirect URI is what you declared at your provider.
2. Fill in a **name** for your provider, the **issuer URL**, the
   **client ID** and the **client secret**.
3. **Test the configuration**: GlassKeep fetches the provider's
   `.well-known/openid-configuration` and signing keys. If the issuer you
   typed differs from the one the provider publishes (the trailing
   slash, typically), the test shows the right value with a button to
   use it.
4. **Save**, then **Link my account**. You sign in at your provider once
   and come back with *"Your account is now linked"*.

The client secret stays on the server; leave the field empty to keep the
saved one. Changing the issuer or the client ID unlinks the account,
since it is no longer the same provider: link it again.

---

## 🔑 Signing in

On the login screen, **Sign in with my provider**, type your GlassKeep
email, **Continue**. From the profile picker, choosing your profile is
enough: the button then needs no email.

GlassKeep only opens your account if your provider vouches for **the
identity you linked** (issuer + subject). Signing in at the provider as
someone else, even with the same email, is refused.

---

## 📱 Android app

The app signs in through the provider inside its own window, then comes
back to GlassKeep by itself. Use the same server address in the app as
the one you set up your provider from.

---

## 🧰 Troubleshooting

| What you see | What it means |
|---|---|
| No "Sign in with my provider" button | The admin has not allowed SSO, or no account has linked a provider yet. |
| *"No provider is linked to this account"* | Wrong email, or the account has no linked provider: sign in another way and set it up in Settings → Security. |
| *"This provider is on a local network address"* | Only an admin's provider may be on the LAN. Expose the provider at a public address. |
| *"The provider publishes a different issuer"* | Use exactly the issuer the provider publishes (the test offers it). |
| *"The provider could not be reached"* | The GlassKeep **server** must reach the issuer, not only your browser. Check DNS, firewall, and that a self-signed provider certificate is trusted by Node (`NODE_EXTRA_CA_CERTS`). |
| *"Open GlassKeep at the address your provider was set up from"* | Use that address, or save the configuration again from this one (and update the redirect URI at the provider). |
| *"You signed in at your provider with another identity"* | Sign out at the provider and sign in there with the account you linked. |
| *"This sign-in attempt expired or was started in another browser"* | More than 10 minutes passed, the server restarted in between, or the browser blocks cookies for GlassKeep. |
| The provider says *redirect_uri mismatch* | The redirect URI at the provider must match the one shown in GlassKeep character for character. |

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
- Identities are stored as `issuer` + `subject` and are never matched on
  email. Linking, while signed in, is the only thing that ties one to an
  account; signing in only checks it.
- The attempt is bound to the browser that started it by an HttpOnly
  cookie, and the way back into the app is a one-time ticket valid for
  one minute, traded for the usual GlassKeep session.
- An unknown email and an account without a provider get the same
  answer, and both count towards the usual sign-in throttle.
- Storage: `oidc_providers` (one row per account's provider) and
  `user_external_identities` (`issuer` + `subject`, unique).
