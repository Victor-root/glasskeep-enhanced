# 🤝 Contributing to GlassKeep Enhanced

First of all: thank you 🙌
Issues, ideas, feature requests, bug reports and pull requests are all very welcome.

This project evolves a lot, and I am **very open to improvements and community PRs**, so please do not hesitate to contribute.

## 🐛 Before opening an issue

A few minutes spent writing a clear issue saves a lot of back-and-forth, so please try to include:

**For a bug report:**

* a clear title
* what actually happened vs. what you expected
* exact steps to reproduce
* screenshots or a screen recording if relevant
* the platform: Web / PWA / Android app / Android TV, desktop or mobile, OS/browser/device version
* whether it happens every time, sometimes, or only after a specific action
* console or server logs if you have them — see **Useful log filters** below

**For a feature or improvement request:**

* the problem or limitation you're running into
* the improvement you'd like to see
* why it would be useful in real usage — a concrete use case beats a one-line request
* whether it's mainly about desktop, mobile, TV, self-hosting, federation, or offline use

**If it's a sync / offline / cross-server collaboration (federation) issue, also mention:**

* a single self-hosted instance, or federation between multiple servers?
* did it happen fully offline, right after reconnecting, or fully online?
* one device, or several devices/tabs touching the same note at the same time?
* anything under `[SyncEngine]`, `[Sync]`, `[SSE]` or `[federation]` in the browser console?
* anything under `[federation]`, `[federation/notes]`, `[LWW]` or `[SSE]` in the server log?

**If it's an install / update issue, also mention:**

* native install (`install.sh`) or Docker?
* a fresh install, or an update from a previous version — which one?
* for native: the OS/distro; for Docker: the host (Portainer, Synology, Unraid, CasaOS, TrueNAS SCALE, plain `docker run`…)
* is at-rest encryption enabled on this instance?
* did you update through the admin panel's one-click updater, or manually (`git pull` / new image)?
* the server log around `[Migration]` or `[cancelUpdate]`, and `systemctl status glass-keep` (native) or `docker logs` (Docker)

**If it's an Android app / Android TV issue, also mention:**

* phone/tablet app, or Android TV?
* Android version, and for TV, the device (Shield, Chromecast with Google TV, a TV's built-in Android TV, etc.)
* does the same bug reproduce in the web/PWA version? This helps tell a WebView-wrapper bug from a bug in the shared React app
* for TV: happened using the remote/D-pad, or did you force TV mode manually with `?tv=1`?

### Useful log filters

```
Browser console (F12 → Console):
[SyncEngine]     local-first sync engine — queue, leases, conflict resolution
[Sync]           save/sync calls from the main app
[SSE]            live updates over the /api/events stream
[federation]     cross-server collaboration (client side)
[SBS]            side-by-side note viewing
[Auth]           login / session
[passkeys]       WebAuthn passkey sign-in
[push]           Web Push subscription
[reminders]      in-app / push reminders
[notifications]  notification delivery
[gkeep]          Google Keep import
[ai]             AI assistant settings
[logoLibrary]    note icon/logo picker

Server log (journalctl -u glass-keep -f, or docker logs -f):
[federation]        cross-server collaboration (server side)
[federation/notes]  note sync between federated servers
[LWW]               last-write-wins conflict resolution
[SSE]               /api/events stream
[Migration]         database migrations
[cancelUpdate]      self-update from the admin panel
[encrypt]           at-rest encryption / unlock
[device-link]       QR cross-device sign-in
[Import]            Google Keep / generic import
[logos]             site icon fetching for links
[notifications]     notification delivery
[reminders]         scheduled reminders
[push]              Web Push sending
[ai-retrieval]      AI assistant note retrieval
```

## 🔧 Pull requests

* Keep PRs **focused on one thing**. A PR that fixes a checklist bug and also reformats three unrelated files is much harder to review — and much harder to revert cleanly if something goes wrong.
* GlassKeep runs on several paths at once — please make sure a fix for one doesn't quietly break another:
  * **native install (`install.sh` + systemd) and Docker** both need to keep working
  * **a solo self-hosted instance and cross-server federation** both need to keep working
  * **Web/PWA, the Android app, and Android TV** share the same React codebase — check that a fix doesn't assume a mouse/keyboard or a screen size that TV/mobile doesn't have
  * **online and offline/local-first** behavior — a change that only works while connected can quietly break the offline queue
* UI changes must **match the existing visual language exactly**. GlassKeep has 6 workspace themes (GlassKeep, Emerald, Amber, Ruby, Graphite, Blush) plus light/dark mode — please check your change in at least the default theme and dark mode, and in one alternate theme if you touched shared chrome (header/sidebar). The frosted "glass" look is deliberately flattened in most places for performance, so don't reach for `backdrop-filter` outside the few places that already use it.
* Prefer **several small PRs** over one large one:
  * ✅ one PR for "fix checklist drag on touch", another for "add Ctrl+]/Ctrl+[ indent shortcuts" — related, but reviewable and revertible independently
  * ⚠️ one PR that fixes a federation sync bug, refactors `NoteCard.jsx` "while in there", and updates two translation files — hard to review, and hard to revert cleanly if the sync fix alone needs a follow-up
* The change should be **tested and stable before opening the PR** — please avoid PRs that are still experimental or obviously broken.
* There's no CI that lints or builds PRs yet, so please run these yourself first:
  ```
  npx eslint .
  npm run build
  ```

### Please include

* a short summary of what the PR changes and why
* screenshots or a short recording for UI changes
* `Closes #XXX` or `Related to #XXX` when the PR addresses an issue
* a **Testing** section explaining what you tested (see below)

## 🤖 Contributing with AI assistance

Using Claude, Copilot, ChatGPT or any other AI tool to help write a PR is completely fine and welcome here — a good part of this project is itself built that way.

What doesn't work well is "one prompt, one PR": pasting an issue into an AI tool and opening whatever it produces without reading it. Please:

* read and understand the actual code you're changing, not just the diff the AI produced
* give the AI **targeted, surgical prompts** ("fix X in file Y, don't touch Z") rather than open-ended ones — it produces smaller, more reviewable diffs and avoids the tool inventing unrelated "improvements"
* re-read the full diff yourself before opening the PR, and remove anything that isn't actually needed — leftover comments, dead code, or debris from an approach that didn't pan out

An AI-written PR title/description is totally fine as long as it's accurate, readable, and you disclose that AI helped write it.

**Testing matters even more here.** GlassKeep's sync, federation and offline behavior is genuinely finicky, and easy to *look* fixed in one quick check while still being broken in a real scenario. In your Testing section, please state plainly:

* which browser(s)/device(s) you tested on
* a single device, or multiple devices/tabs syncing the same note?
* tested offline → back online, not just online?
* native install or Docker, if the change touches server/install/update code
* which theme(s), and light or dark, if the change touches UI

If one of these doesn't apply to your change, that's fine — just say so instead of leaving it silent.

## 🙏 Thanks

Even a small fix, a translation tweak, or a clear bug report genuinely helps. Thanks for taking the time to contribute to GlassKeep Enhanced ❤️
