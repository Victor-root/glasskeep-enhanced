# 🛠️ GlassKeep Enhanced — Improvements Since the Fork

> This document provides a structured overview of the main changes introduced in this fork since its starting point based on [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep).

Before anything else: this fork was never intended as a replacement for the original project. It grew out of a codebase and a product direction I genuinely liked.  
If this fork became much larger over time, it is precisely because the original Glass Keep foundation made me want to invest a lot of time in improving it.

---

## 📌 Overview

Since the fork, the project has gradually evolved far beyond a simple translation effort or a handful of isolated fixes.

The work mainly covers:

- **local-first / offline-first behavior**
- **synchronization reliability in real-world conditions**
- a broad **UI/UX polish pass**
- many **mobile / responsive improvements**
- a cleaner, more extensible **i18n** base
- a proper **Trash / restore** flow
- a more **modular frontend structure**
- a much simpler **self-hosting experience**
- a native **Android companion app**
- improvements around **security**, **installation**, **deployment**, and **maintenance**

---

## 🔄 1) Local-first / offline-first

One of the biggest areas of work in this fork was adding behavior that remains genuinely usable without network access.

### What was added
- create, edit, reorder, pin, archive, trash, and restore notes **offline**
- local IndexedDB queue for write operations
- automatic synchronization when the server becomes reachable again
- retry and recovery logic after connection loss
- improved behavior on mobile when dealing with stale sockets or unstable reconnection
- visible sync status in the UI

### Goal
Make the app more reliable in everyday use, even when the connection is unstable or temporarily unavailable, instead of depending entirely on immediate server availability.

---

## 📡 2) Sync behavior and cross-device reliability

The fork also pushes the sync layer further.

### Main evolutions
- real-time synchronization via **SSE**
- more coherent cross-device refresh behavior
- better conflict handling
- clearer sync status semantics
- queue collapsing / smarter merging of rapid edits
- stricter logic before displaying a fully “synced” state

### Result
The project behaves much more consistently in real multi-device usage, with fewer ambiguous or fragile cases.

---

## 🗑️ 3) Trash / note lifecycle

Note deletion was redesigned to be safer and less destructive.

### Additions
- soft delete: notes go to **Trash** first
- dedicated Trash view
- restore from Trash
- permanent deletion only from Trash
- support for both single-note actions and bulk actions
- preservation of the note’s logical state when restoring (active / archived depending on the case)

### Why it matters
This reduces accidental data loss and makes the deletion flow much closer to what users expect from a daily-use notes app.

---

## 📱 4) Mobile and responsive rework

A large part of the effort focused on real-world phone usage.

### Main improvements
- reworked mobile grid
- better display density
- cleaner checklist previews
- improved handling of text overflow
- reduced padding and typography adjustments
- more coherent breakpoints
- cleaner full-screen modal behavior on mobile
- improved touch interactions
- clickable phone numbers in the full note view
- lower friction on small screens overall

### Result
The app feels much more credible as a daily mobile tool, where many small details previously made the experience rougher.

---

## 🤖 5) Native Android companion app

The fork also adds a true Android companion app.

### What was added
- dedicated Android project in `android/`
- first-launch server URL setup
- native wrapper around a self-hosted instance
- better Android integration
- landscape support
- UI choices more consistent with Android usage

### Goal
Offer a more app-like mobile experience alongside the web version.

---

## 🌍 6) Internationalization (i18n)

The fork started with French, but the real work was building a cleaner translation foundation.

### What was done
- creation of a dedicated i18n infrastructure
- automatic locale detection
- English fallback if a key is missing
- translation of a large part of the interface
- locale-aware date formatting
- cleaner text separation into dedicated locale files

### Languages currently implemented
- English
- French

### Philosophy
French was the first real implementation, but the actual goal is to make further language additions easier, not to restrict the project to two languages.

---

## ✨ 7) UI / UX polish and overall product feel

The fork also includes a broad layer of visual and ergonomic polish.

### Visible changes
- replacement of rougher visual elements with more coherent icons
- more consistent iconography
- more compact layout
- better use of space on wide screens
- richer note previews
- improved modal presentation
- stronger overall visual consistency
- many adjustments across spacing, alignment, buttons, previews, and UI states

### Goal
Keep the spirit of the original project while making it feel cleaner, more readable, and more finished.

---

## 🎨 8) Drawing mode overhaul

The drawing mode was heavily reworked and deserves to be called out explicitly.

### What changed
- major rework of the drawing mode both in structure and in usage
- better separation of drawing-specific components
- cleaner integration with the editor, previews, and modal flows
- stronger technical base for future drawing-related improvements
- more coherent overall experience than in the original state of the project

### Why it matters
Drawing is not the most frequently used feature in everyday note-taking, but it was still an important part of the original app. This fork gives it a much cleaner foundation and a more maintainable implementation.

---

## 🧱 9) Frontend refactor and modularization

The project was also restructured significantly internally.

### What evolved
- extraction of many dedicated components
- clearer separation between auth / notes / modals / panels / shared components
- creation of dedicated hooks
- reduction of overly centralized logic
- dedicated modules for:
  - i18n
  - sync
  - import/export
  - modal state
  - checklist dragging
  - draft creation
  - drawing history
  - helpers / constants / global styles

### Benefit
The codebase is more readable, more maintainable, and easier to evolve.

---

## 📝 10) Note creation and editing flow

The fork also reworked how note creation behaves.

### Evolutions
- more direct opening into the edit modal
- deferred **draft note** lifecycle
- empty notes are no longer materialized too early
- closing without any meaningful action no longer pollutes the app with blank notes
- cleaner behavior between draft state, actual save, and sync

### Why it matters
This is exactly the kind of product detail that has a large impact on how polished the app feels in daily use.

---

## 🏷️ 11) Tags, filters, and note organization

Tag handling became richer and more practical.

### Improvements
- tag suggestions while creating a note
- tag suggestions while editing a note
- multiple convenient ways to add tags
- cleaner removal / correction behavior
- more practical multi-tag filtering
- OR logic for multi-select filtering
- richer tag sidebar behavior

---

## ✅ 12) Checklists and content interactions

Checklist notes received a lot of attention too.

### Changes
- better checklist rendering in previews
- better interactions on mobile
- fixes for overflow issues
- cleaner checkbox alignment
- better drag / reorder behavior
- improved readability overall

---

## 👥 13) Collaboration and UX guardrails

The fork keeps the real-time collaboration capability inherited from the original project, with additional work around real-world usage.

### Notable elements
- dedicated collaboration components
- better frontend separation of collaboration logic
- UI guardrails when certain situations are incompatible with offline usage
- improved clarity around some collaborative flows

---

## 🔐 14) Authentication, account handling, and security

The project also improved around security and account management.

### Additions / improvements
- dedicated password change flow
- improved auth screens
- healthier multi-user base
- cleaner admin initialization logic
- less reliance on default credentials in the native install flow
- automatic generation of a real `JWT_SECRET` during installation
- server-side refusal to start with weak or placeholder secrets

### Result
A healthier base for real self-hosted usage.

---

## 👑 15) Easier native installation

One of the biggest strengths of the fork is the simpler installation path.

### New `install.sh`
- install
- update
- uninstall
- Debian / Ubuntu / Proxmox LXC support
- FR / EN language detection
- `.env` generation
- systemd service creation
- guided HTTPS configuration
- admin account creation during installation

### HTTPS options
The script can handle three common cases:
- let a **reverse proxy** handle HTTPS
- generate a **self-signed certificate**
- use an existing **custom SSL certificate**

### Why it matters
This significantly reduces deployment friction for people who want a self-hosted instance that is easy to install and maintain.

---

## 🐳 16) Docker and distribution

The Docker side was also improved.

### Evolutions
- new `docker-compose.yml`
- first-run admin bootstrap
- dedicated entrypoint
- image published on **GHCR**
- **multi-architecture** publishing for amd64 / arm64
- better support for NAS / appliance / small-server use cases

---

## 🧠 17) Local AI behavior made saner

The fork does not remove the local AI part of the project, but it makes it more predictable and more respectful of self-hosted realities.

### Changes
- no automatic model download on startup
- explicit user opt-in
- better transparency about model size and server impact
- dedicated status / initialization endpoints
- more coherent behavior for personal hosting

---

## 📦 18) Import / export and recovery flows

Migration and recovery tooling was also consolidated.

### Present in the fork
- JSON export
- JSON import
- Google Keep import
- Markdown import
- downloadable recovery secret key
- dedicated logic in hooks / utilities

---

## 🧹 19) Repository hygiene and cleanup

The fork also benefited from structural cleanup.

### Notable points
- removal of unnecessary files
- cleaner repository layout
- removal of runtime files that should not remain in the tracked tree
- better separation between app source, runtime, Docker, and Android
- clearer documentation around recommended usage

---

## 📚 20) Documentation

Documentation was reworked significantly.

### What exists today
- README focused on installation / usage
- dedicated improvements document
- dedicated AI behavior changes document
- clearer presentation of the fork’s philosophy
- desktop / mobile screenshots
- Android documentation presence
- clearer explanation of installation paths

---

## 📌 Global summary

In practice, this fork mainly moves Glass Keep further in six big directions:

1. **local-first / offline / sync reliability**
2. **mobile quality and UI/UX polish**
3. **safer note lifecycle with Trash and better account handling**
4. **cleaner and more extensible i18n**
5. **much easier self-hosting**
6. **ecosystem expansion with better Docker support and a native Android companion app**

So this is not really a “new separate project”, but rather a substantial evolution built on top of a base I genuinely liked from the beginning.
