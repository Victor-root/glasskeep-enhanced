# Glass Keep — FR Fork + UX Improvements

> **French fork of [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep)** with full translation, smart tag suggestions, Material Design icons and UI improvements.

---

## 🆕 What this fork adds

### 🌍 Full French translation
- Entire interface translated to French (notes, editor, modal, admin, toasts, dates...)
- i18n architecture ready for adding other languages easily

### 🏷️ Smart tag suggestions
- **When creating a note**: a dropdown suggests existing tags as soon as you click the tag field
- **When editing a note**: same suggestion system with dropdown
- Add tags via **Enter**, **comma**, **click**, **paste** or **Backspace** to remove
- Multi-tag filter (AND) in the sidebar — select multiple tags to narrow down results

### 🎨 Modernized interface
- **Material Design SVG icons** replacing old emojis in the composer and modal
- **Icons in the tag sidebar** (notes, images, archive, tag)
- **Compact layout** — reduced spacing between notes, more columns on wide screens
- **Richer note preview** — renders Markdown with line breaks (16 lines instead of 6)
- **Wider modal** — responsive with adapted breakpoints to avoid truncated text

---

## 📸 Features inherited from the original project

- **Markdown** notes, **checklists**, **drawings**
- **Images** with compression, fullscreen gallery
- **Tags**, **colors**, **pinning**, **drag & drop**
- **Search** across titles, content, tags, checklists, images
- **Dark / light** mode
- Installable **PWA**
- **Real-time collaboration**
- **Local AI assistant** (Llama 3.2, 100% private)
- **Admin panel** with multi-user support
- **Import/Export** JSON + Google Keep import
- **Bulk actions** (multi-select)

---

## Installation

### One-line install (Debian / Ubuntu / Proxmox LXC)

Run the following as **root** on a fresh Debian-based system:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Victor-root/react-glass-keep/main/install.sh)
```

The script will:
- Install **Node.js 20** automatically if not present
- Clone the repo to `/opt/glass-keep/app`
- Build the app and generate a `.env` config file
- Register and start a **systemd service** (`glass-keep`)
- Prompt you for the port (default: `8080`)

It also handles **updates** and **uninstallation** from the same interactive menu. The script output language adapts to your system locale (English/French).

> **Default admin credentials:** `admin` / `admin` — change your password on first login.

---

### Local development

```bash
npm install
ADMIN_EMAILS="admin" npm run dev
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

- Change `JWT_SECRET` in production
- Serve over HTTPS for PWA support
- Treat the recovery secret key like a password

---

## 📝 License

MIT — Based on [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep) by [nikunjsingh93](https://github.com/nikunjsingh93)
