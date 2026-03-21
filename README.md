# Glass Keep — Enhanced Fork

> **Fork of [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep)** with UI improvements, smart tag suggestions, Material Design icons, and added French translation (language follows browser locale).

## 🆕 What this fork adds

### 🌍 French translation (+ i18n groundwork)
- French added as a second language — the app follows your **browser locale** automatically
- Entire UI translated (notes, editor, modal, admin, toasts, dates...)
- i18n architecture ready for adding other languages easily

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

### 🌍 i18n (French)
- Full French translation of the interface
- Translated all toasts, alerts, modals and UI labels
- French date format with 4-digit years
- Translated DrawingCanvas and tag placeholders
- i18n groundwork for adding other languages easily

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
