# 🤝 Contributing to GlassKeep Enhanced

First of all: thank you 🙌
Issues, ideas, feature requests, bug reports and pull requests are all very welcome.

This project evolves a lot, and I am **very open to improvements and community PRs**, so please do not hesitate to contribute.

## 🐛 Before opening an issue

**For a bug report:**

* a clear title, and what happened vs. what you expected
* exact steps to reproduce, with screenshots or a recording if relevant
* the platform: Web / PWA / Android app / Android TV, desktop or mobile, OS/browser version
* whether it happens every time, sometimes, or only after a specific action

**For a feature or improvement request:**

* the problem or limitation you're running into, and the improvement you'd like
* a concrete use case, and whether it's mainly about desktop, mobile, TV, self-hosting, federation, or offline use

**If it's a sync / offline / federation issue, also mention:**

* a single instance, or federation between multiple servers
* offline, right after reconnecting, or fully online
* one device, or several devices/tabs touching the same note at once

**If it's an install / update issue, also mention:**

* native install (`install.sh`) or Docker, and the OS or host platform
* a fresh install or an update, and from which version
* whether you updated via the admin panel or manually

**If it's an Android app / Android TV issue, also mention:**

* phone/tablet or Android TV, and the Android version
* whether the same bug reproduces in the web/PWA version
* for TV: the remote, or a manual `?tv=1` override

## 🔧 Pull requests

* Keep PRs **focused on one thing**. Mixing a bug fix with unrelated reformatting makes review, and reverting, much harder.
* GlassKeep runs on several paths at once: native install and Docker, solo and federated, Web/PWA/Android/TV, online and offline. Please check that a fix for one doesn't quietly break another.
* UI changes must **match the existing look**: 6 workspace themes (GlassKeep, Emerald, Amber, Ruby, Graphite, Blush) plus light/dark mode. Check your change in the default theme, dark mode, and one alternate theme if you touched shared chrome.
* Prefer **several small PRs** over one large one:
  * ✅ one PR for "fix checklist drag on touch", another for "add Ctrl+]/Ctrl+[ shortcuts"
  * ⚠️ one PR that fixes a sync bug, refactors an unrelated file, and updates translations
* There's no CI lint/build check yet, so please run these first:
  ```
  npx eslint .
  npm run build
  ```
* Please include a short summary, screenshots for UI changes, `Closes #XXX` when relevant, and a **Testing** section describing what you tested.

## 🤖 Contributing with AI assistance

Using Claude, Copilot, ChatGPT or any other AI tool to help write a PR is completely fine and welcome here. What doesn't work well is "one prompt, one PR": pasting an issue into an AI tool and opening whatever it produces without reading it.

* Read and understand the code you're changing, not just the diff.
* Give the AI targeted, surgical prompts rather than open-ended ones.
* Re-read the full diff before opening the PR, and remove anything that isn't needed.

An AI-written PR title or description is fine as long as it's accurate and disclosed.

**Testing matters even more here**, since GlassKeep's sync, federation and offline behavior is genuinely finicky. In your Testing section, state which browsers or devices you tested, whether multiple devices synced the same note, whether you tested offline to online, and which theme or mode if relevant.

## 🙏 Thanks

Even a small fix, a translation tweak, or a clear bug report genuinely helps. Thanks for taking the time to contribute to GlassKeep Enhanced ❤️
