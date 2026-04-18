# Glass Keep — Enhanced Fork

> **Fork of [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep)** with local-first sync (offline support), real-time multi-device sync, multi-language i18n support, UI improvements, and a **native Android app**.

---

## 📸 Screenshots

### 🖥️ Desktop

<table>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/7014fb9b-5f7d-4ba0-8ffe-7a91369c3dd1" width="170" height="96" /><br/><sub>Home — Light</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/d870ea4a-2413-4b4d-9553-1eb5110baab0" width="170" height="96" /><br/><sub>Home — Dark</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/0126f452-e273-45ab-b30c-2d14a9af7c10" width="170" height="96" /><br/><sub>Settings Panel 1</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/9de00d64-6dc3-4228-85f5-711a5877aeb3" width="170" height="96" /><br/><sub>Settings Panel 2</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/422068dc-4d0b-408e-b950-9c6df9a3044b" width="170" height="96" /><br/><sub>Admin Panel</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/fdbb102d-c8a4-4456-84a1-1aadea6cab0f" width="170" height="96" /><br/><sub>Text note — View</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/d6101ee3-93f3-40f2-9c85-91374a9a583d" width="170" height="96" /><br/><sub>Text note — Edit</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/36bfd2af-679b-481b-8c32-7337c5bf7685" width="170" height="96" /><br/><sub>Checklist</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/9a3ca927-e3ce-4b58-bf85-eec243912de1" width="170" height="96" /><br/><sub>Drawing — Edit</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/9c2ebd1f-84db-4de2-9234-2189d80317d9" width="170" height="96" /><br/><sub>Drawing — View</sub></td>
  </tr>
</table>

### 📱 Mobile

<table>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/1aa89208-a98d-4707-8690-84da537f9f33" width="185" /><br/><sub>Home — Light</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/931178dd-153b-44a2-83d2-47e82c0a97c7" width="185" /><br/><sub>Home — Dark</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/c78669a9-dbb4-4534-be11-73aed32855d0" width="185" /><br/><sub>New note — Light</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/d7a6f6e8-d6ff-4b2a-8270-9dfd56329d02" width="185" /><br/><sub>New note — Dark</sub></td>
  </tr>
</table>

---

## 📱 Android App

A native Android wrapper is available for GlassKeep, turning your self-hosted instance into a full mobile app.

**Download the latest APK from the [Releases](https://github.com/Victor-root/glasskeep-enhanced/releases) page.**

### Features
- **Connect to your server** — enter your GlassKeep URL on first launch, the app remembers it
- **Pull-to-refresh** — swipe down on the home screen to reload
- **Photo picker support** — add images from your gallery (Android 13+ photo picker compatible)
- **Theme-aware status bar** — status bar and navigation bar colors change to match the note you're editing
- **Long-press back button** — hold the back button for 3 seconds to switch server

> The Android source code is in the `android/` directory. Build it with Android Studio.

---

## 🆕 What this fork adds

### 🔄 Local-first sync (offline support)
- **Works offline** — create, edit, reorder, pin, archive, trash and restore notes without network
- Changes are queued locally (IndexedDB) and synced automatically when the server is reachable
- **Real-time sync** between devices via SSE (Server-Sent Events)
- **Smart conflict handling** — queue collapsing merges rapid edits into a single request
- **Sync status indicator** — shows offline (grey), syncing (blue), or synced (green) in real time
- Green = everything is done: local queue drained AND remote changes fetched and displayed
- Automatic recovery with retry logic after network loss (including mobile-specific stale socket handling)

### 🌍 Multi-language i18n infrastructure
- Complete i18n architecture with locale auto-detection based on **browser settings**
- Full UI translation support (notes, editor, modal, admin, toasts, dates, placeholders...)
- Currently implemented: English + French — easy to add more languages
- Missing translation keys gracefully fall back to English

### 🏷️ Smart tag suggestions
- **When creating a note**: a dropdown suggests existing tags as soon as you click the tag field
- **When editing a note**: same suggestion system with dropdown
- Add tags via **Enter**, **comma**, **click**, **paste** or **Backspace** to remove
- Multi-tag filter in the sidebar — Ctrl+click for multi-select with OR logic

### 🎨 Modernized interface
- **Material Design SVG icons** replacing old emojis in the composer and modal
- **Icons in the tag sidebar** (notes, images, archive, tag)
- **Compact layout** — reduced spacing between notes, more columns on wide screens
- **Richer note preview** — renders Markdown with line breaks (16 lines instead of 6)
- **Wider modal** — responsive with adapted breakpoints to avoid truncated text

### 🗑️ Trash / Recycle bin
- **Deleting a note no longer removes it permanently** — it moves to the Trash
- Dedicated **Trash view** in the sidebar, alongside Home and Archive
- **Restore** a note from the trash — it returns to its original state (active or archived)
- **Permanent deletion** is only possible from the Trash, with a clear confirmation dialog
- Works with single notes and bulk selection
- Full EN/FR translations

<details>
<summary>📋 Full changelog since fork</summary>

### 📱 Mobile
- Auto-hide header on scroll down
- Adaptive title size based on text length
- Close note with Android back button (History API)
- 2-column grid layout for pinned and regular notes
- Reduced note card padding and title size
- Fixed text overflow on note cards
- Fixed checklist text overflow on cards
- Highlight clickable phone numbers in checklist items
- Disable phone links and checkboxes in note preview

### 🎨 UI & Theming
- Themed scrollbars matching note color (light + dark mode)
- Aurora Pastel color theme
- Floating decorative note cards on login background
- App logo above login title
- Saturated color palette inspired by Google Keep
- Material Design icons in composer and tag sidebar
- Modernized icons with compact layout and richer note preview
- Tag suggestions dropdown in composer and modal

### 🗂️ Layout & Grid
- Masonry layout for both pinned and regular notes grid
- Match Google Keep responsive column breakpoints
- Fixed ResizeObserver infinite loop in masonry grid

### 🏷️ Tags & Filtering
- Single-click tag filter replaces selection, Ctrl+click for multi-select
- OR logic for multi-tag filtering
- Multi-tag banner moved below tag list
- Hidden multi-tag banner for single tag selection

### 🗑️ Trash
- Soft delete: notes go to trash instead of being permanently deleted
- Trash view with restore and permanent delete actions
- Archived state preserved through trash/restore cycle
- Composer hidden in trash view
- Bulk trash, restore and permanent delete support

### 🔄 Local-first sync
- IndexedDB queue for all write operations (offline-capable)
- SyncEngine with automatic retry, exponential backoff, and queue collapsing
- SSE for real-time cross-device sync with auto-reconnection
- Health check system with rate-limit detection (403/429 backoff)
- Pull tracking (beginPull/endPull) — green status only after full data refresh
- Position interpolation on restore from trash
- Mobile recovery: Connection: close header + progressive retry on visibility/online events
- Service Worker configured to never cache API calls (NetworkOnly for /api/)

### 📝 Notes & Modal
- Close note modal with Escape key
- Clicking a card always opens the modal
- Links in cards open in a new tab without opening the modal
- Saving a note no longer closes the modal
- Scroll resets to top when formatting a long note
- Images displayed full-width like Google Keep
- Reset note order option in settings
- Sidebar visibility persisted server-side

### 🐛 Bug Fixes
- Removed blue focus ring on note close button
- Fixed × button size, cursor-pointer, and drag handle alignment
- Fixed checkbox and × button alignment in task lists
- Fixed note preview height in grid
- Fixed toggle buttons overflowing in settings panel
- Fixed login title and logo covered by decorative cards
- Fixed sidebar flash on load in private browsing
- Fixed code block wrapping in notes
- Fixed note sorting when positions are equal
- Fixed missing "Confirm" i18n key

### 🌍 i18n (Multi-language)
- Complete i18n infrastructure with locale auto-detection
- English (base language) + French as first implementation
- Translated all toasts, alerts, modals, UI labels, and placeholders
- Locale-aware date formatting (EN: MM/DD/YYYY, FR: DD/MM/YYYY)
- Architecture ready for adding more languages easily

</details>

---

## Installation

### One-line install (Debian / Ubuntu / Proxmox LXC)

Run the following as **root** on a fresh Debian-based system:

```bash
curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash
```

The script will:
- Install **Node.js 20** automatically if not present
- Clone the repo to `/opt/glass-keep/app`
- Build the app and generate a `.env` config file
- Register and start a **systemd service** (`glass-keep`)
- Prompt you for the port (default: `8080`)

Re-running the same command on an existing installation brings up an interactive menu with three options:

- **Install** — fresh installation
- **Update** — pulls the latest version, rebuilds, and restarts the service. Your notes and config are preserved, but a **backup of `/opt/glass-keep/data` is recommended** before updating.
- **Uninstall** — removes the app, the service, and **all your notes** (`/opt/glass-keep/data` is deleted). This is irreversible.

The script output language adapts to your system locale (English/French).

> **First install:** the install script will prompt you to create an admin account (login + password). No default credentials are hardcoded.

---

### Recommended system requirements

#### Without AI features

- **Minimum:** 1 vCPU, 1 GB RAM, 3–5 GB storage
- **Recommended:** 2 vCPU, 2 GB RAM, 5–10 GB storage

#### With AI features enabled

GlassKeep can load a server-side ONNX Llama model on first use. This significantly increases RAM and storage usage.

- **Minimum:** 2 vCPU, 4 GB RAM, 8–10 GB storage
- **Recommended:** 4 vCPU, 6–8 GB RAM, 10–20 GB storage

> Actual requirements depend on the number of users, the amount of notes/images stored, and whether AI is actively used.

---

### Local development

```bash
npm install
JWT_SECRET="$(openssl rand -hex 32)" ADMIN_EMAILS="admin" npm run dev
```

---

## 🌍 Adding a new language

1. Copy `src/i18n/locales/en.js` to a new file (e.g. `it.js`)
2. Translate the values
3. Import the new locale in `src/i18n/index.js`
4. Adapt the language detection logic
5. Rebuild the app

Missing keys will fall back to English.

---

## 🔐 Security

- `JWT_SECRET` is **automatically generated** by the install script and saved in `/etc/glass-keep.env` — no manual action required. If you run the server outside of the install script, you must set it yourself (the server will refuse to start without a valid, non-placeholder secret). Generate one with: `openssl rand -hex 32`
- Serve over HTTPS for PWA support
- Treat the recovery secret key like a password

---

## 📝 License

MIT — Based on [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep) by [nikunjsingh93](https://github.com/nikunjsingh93)
