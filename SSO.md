# 🔐 Single sign-on (OpenID Connect)

GlassKeep lets users sign in through an **OpenID Connect provider**:
Authentik, Keycloak, Authelia, Zitadel, Pocket ID, or any provider that
follows the standard. Nothing in GlassKeep is specific to one of them.

> 📘 A version with screenshots, in English and French, is on the
> [project website](https://victor-root.github.io/glasskeep-enhanced/sso.html).

> 🇫🇷 *Ce guide est en anglais comme le reste de la documentation du
> projet. Les écrans de GlassKeep, eux, sont traduits.*

---

## 📚 Table of contents

- [How it works, in plain words](#-how-it-works-in-plain-words)
- [For the admin: switch, policy, local network](#-for-the-admin-switch-policy-local-network)
- [Setting up a provider](#-setting-up-a-provider)
  - [Step 1: create the application at your provider](#step-1-create-the-application-at-your-provider)
  - [Step 2: enter it in GlassKeep](#step-2-enter-it-in-glasskeep)
  - [Step 3: link your account](#step-3-link-your-account)
- [Signing in](#-signing-in)
- [Android app](#-android-app)
- [Troubleshooting](#-troubleshooting)
- [Under the hood](#-under-the-hood)

---

## 🧠 How it works, in plain words

- The **admin** decides whether the instance allows single sign-on, and
  which providers count:
  - **Instance provider only**: the admin sets up one provider for the
    whole instance. Users link their account to it and cannot add their
    own.
  - **Personal providers allowed**: the same, and each user may also
    declare their own provider in their settings and link to that
    instead.
- Each **user** then **links** their GlassKeep account by signing in at
  the provider once. An account is linked to one provider at a time:
  linking another one replaces the previous link.
- On the login screen, **"Sign in with my provider"** asks for the
  GlassKeep username or email, sends you to that account's provider, and brings you
  back signed in. From then on GlassKeep works exactly as with a
  password.

Your provider's secret never reaches a browser. A provider never creates
a GlassKeep account and never grants any right: it only opens the
account that linked it.

---

## 🛡️ For the admin: switch, policy, local network

**Admin panel → Login page settings → Allow single sign-on (SSO).**
Once it is on, three more settings appear under it:

- **Which providers can be used**: *Instance provider only* (the
  default) or *Personal providers allowed*.
- **Allow providers on the local network** (only with personal
  providers, off by default): see below.
- **Instance provider**: the provider every user can link to, set up
  with the form described in the next section.

Turning single sign-on off hides the button from the login screen and
stops every sign-in through a provider. Switching back to *Instance
provider only* stops sign-ins through personal providers. Either way,
every configuration and every link is kept for when it comes back.

**Where the server may connect.** A provider is reached by the GlassKeep
server, not only by the browser. The instance's provider and an admin's
own provider may sit on the local network. A regular user's own provider
must be at a **public address** while *Allow providers on the local
network* is off: the server refuses to connect to a local network
address on their behalf, the same rule as for a user's own AI endpoint,
so that no account can use GlassKeep to probe the network it runs in.
Turn it on only if you trust every account with that.

---

## 👤 Setting up a provider

The same steps for the instance's provider (done by an admin) and for a
user's own provider (when personal providers are allowed). Before you
start, open GlassKeep **from the address you sign in with**
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

### Step 2: enter it in GlassKeep

The instance's provider: **Admin panel → Login page settings →
Instance provider**. A user's own provider: **Settings → Security →
Single sign-on** (with an instance provider set up, through *Use my own
provider instead*).

1. Check the **public address** and **redirect URI** shown at the top:
   the redirect URI is what you declared at your provider.
2. Fill in a **name** for your provider, the **issuer URL**, the
   **client ID** and the **client secret**.
3. **Test the configuration**: GlassKeep fetches the provider's
   `.well-known/openid-configuration` and signing keys. If the issuer you
   typed differs from the one the provider publishes (the trailing
   slash, typically), the test shows the right value with a button to
   use it.
4. **Save**.

The client secret stays on the server; leave the field empty to keep the
saved one. Changing the issuer or the client ID unlinks every account
linked through that provider, since it is no longer the same provider:
they link it again.

### Step 3: link your account

Each user, admins included: **Settings → Security → Single sign-on →
Link my account**, under the provider to use. GlassKeep asks for your
password (linking adds a way into your account, so a stolen session
alone cannot do it), you sign in at the provider once and come back with
*"Your account is now linked"*.

---

## 🔑 Signing in

On the login screen, **Sign in with my provider**, type your GlassKeep
username or email, **Continue**. From the profile picker, choosing your profile is
enough: the button then asks for nothing.

GlassKeep only opens your account if your provider vouches for **the
identity you linked** (issuer + subject). Signing in at the provider as
someone else, even with the same email, is refused.

---

## 📱 Android app

The app opens the provider in the phone's default browser, as a sheet
over the app (full screen when the browser has no such sheet). Passkeys
work there as on a computer, and the provider's pages never run next to
the app's native features (files, reminders, …). Once you are through,
the browser hands you back to the app; if it asks, tap **Back to
GlassKeep**. The browser does not share the app's cookies, so the
attempt is tied to a secret only the app holds instead. Use the same
server address in the app as the one the provider was set up from, and
keep the app up to date: older versions open the provider inside the
app, where passkeys are not available.

---

## 🧰 Troubleshooting

| What you see | What it means |
|---|---|
| No "Sign in with my provider" button | The admin has not allowed SSO, or no account has linked a provider the current policy allows yet. |
| *"No provider is linked to this account"* | Wrong username or email, the account has no linked provider, or it is linked to a personal provider while only the instance's is allowed: sign in another way and link it in Settings → Security. |
| *"The administrator does not allow personal providers"* | The policy is *Instance provider only*: link your account to the instance's provider. |
| *"This provider is on a local network address"* | A user's own provider may only be on the LAN once the admin turns on *Allow providers on the local network*. Expose it at a public address, or use the instance's provider. |
| *"The provider publishes a different issuer"* | Use exactly the issuer the provider publishes (the test offers it). |
| *"The provider could not be reached"* | The GlassKeep **server** must reach the issuer, not only your browser. Check DNS, firewall, and that a self-signed provider certificate is trusted by Node (`NODE_EXTRA_CA_CERTS`). |
| *"Open GlassKeep at the address your provider was set up from"* | Use that address, or save the configuration again from this one (and update the redirect URI at the provider). For the instance's provider, use the address the admin set it up from. |
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
  account; signing in only checks it, and checks again that the policy
  still allows that provider when the provider answers and when the
  ticket is traded.
- The attempt is bound to the browser that started it by an HttpOnly
  cookie, and the way back into the app is a one-time ticket valid for
  one minute, traded for the usual GlassKeep session.
- An unknown identifier and an account without a provider get the same
  answer, and both count towards the usual sign-in throttle.
- Every answer from a provider is size-capped and time-limited, so a
  provider cannot exhaust the server's memory or hold it waiting.
- Storage: `oidc_providers` (one row per account's own provider, plus
  the instance's with no owner) and `user_external_identities`
  (`issuer` + `subject`, unique, one per account).
