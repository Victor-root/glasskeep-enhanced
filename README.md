# ✨ Glass Keep — Enhanced Fork

> Fork of [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep), with a strong focus on **local-first usage**, **offline support**, **Trash / restore**, **mobile usability**, **simpler self-hosting**, and a **native Android companion app**.

---

## 📸 Screenshots

### 🖥️ Desktop

<table width="100%">
  <tr>
    <td><img src="https://github.com/user-attachments/assets/7014fb9b-5f7d-4ba0-8ffe-7a91369c3dd1" width="100%" /></td>
    <td><img src="https://github.com/user-attachments/assets/d870ea4a-2413-4b4d-9553-1eb5110baab0" width="100%" /></td>
  </tr>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/fdbb102d-c8a4-4456-84a1-1aadea6cab0f" width="100%" /></td>
    <td><img src="https://github.com/user-attachments/assets/d6101ee3-93f3-40f2-9c85-91374a9a583d" width="100%" /></td>
  </tr>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/36bfd2af-679b-481b-8c32-7337c5bf7685" width="100%" /></td>
    <td><img src="https://github.com/user-attachments/assets/9a3ca927-e3ce-4b58-bf85-eec243912de1" width="100%" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="https://github.com/user-attachments/assets/9c2ebd1f-84db-4de2-9234-2189d80317d9" width="50%" /></td>
  </tr>
</table>

<table align="center">
  <tr>
    <td><img src="https://github.com/user-attachments/assets/0126f452-e273-45ab-b30c-2d14a9af7c10" width="240" /></td>
    <td><img src="https://github.com/user-attachments/assets/9de00d64-6dc3-4228-85f5-711a5877aeb3" width="240" /></td>
    <td><img src="https://github.com/user-attachments/assets/422068dc-4d0b-408e-b950-9c6df9a3044b" width="240" /></td>
  </tr>
</table>

### 📱 Mobile

<table width="100%">
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/90d91213-d9bc-48e9-951f-4d6905b9f03f" width="185" /></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/ffbb3584-1f0a-495a-9f3a-d45554050c63" width="185" /></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/dd8df55b-e478-4575-8ab3-1ce1ce5ea4f7" width="185" /></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/678c8c44-da5e-46db-8370-b41a568654e0" width="185" /></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/ea8c7a3e-5b59-4869-9615-611a34f1373d" width="185" /></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/d7ab134f-77bf-40a0-8b6f-2b56895ba47c" width="185" /></td>
  </tr>
</table>

---

## 🎯 What this fork mainly focuses on

Compared to the original project, this fork puts more emphasis on:

- **🔄 local-first usage and offline support**
- **🗑️ safer note deletion with Trash / restore**
- **📱 better mobile usability**
- **🤖 a native Android companion app**
- **🌍 a cleaner and more extensible i18n foundation**
- **🛠️ simpler self-hosting**
- **✨ a broad polish / stability pass**
- **🎨 a deeper overhaul of the drawing mode**

---

## 🌟 Main additions in this fork

### 🔄 Local-first / offline support
- create, edit, reorder, pin, archive, trash, and restore notes **without network access**
- local IndexedDB queue for write operations
- automatic sync when the server becomes reachable again
- real-time cross-device sync via SSE
- visible sync status indicator
- retry and recovery logic for unstable connections, especially on mobile

### 🗑️ Trash / restore
- soft delete: notes go to Trash first
- dedicated **Trash** view
- notes can be restored to their previous logical state
- permanent deletion only happens from Trash
- works for both single-note and multi-select actions

### 📱 Mobile / Android
- improved mobile grid
- better modal behavior on phones
- more direct note creation flow
- better handling of text overflow and previews
- clickable phone numbers in full note view on mobile
- more polish around touch interactions and small-screen usage
- native Android wrapper for self-hosted instances
- first-launch server URL setup
- pull-to-refresh
- better Android integration
- source code included in the `android/` directory

### 🌍 Internationalization
- proper i18n infrastructure
- automatic language detection
- English and French already implemented
- English fallback when a key is missing
- cleaner base for adding more languages later

### 🛠️ Easier self-hosting
- native install script for Debian / Ubuntu / Proxmox LXC
- install / update / uninstall support
- guided setup from the start
- admin account creation during installation
- automatic JWT secret generation
- simple HTTPS handling with three possible approaches:
  - use a **reverse proxy**
  - generate a **self-signed certificate**
  - use your **own SSL certificate**

### 🎨 Drawing mode overhaul
- major rework of the drawing mode, both technically and in day-to-day usage
- better separation of drawing-related components
- cleaner integration in the editor, previews, and modals
- a stronger base for future drawing-related improvements

---

## 🧩 Important Glass Keep features still present

This fork also keeps the main capabilities that already made the original project attractive:

- 🔐 authentication and multi-user support
- 👑 admin panel
- 🗝️ secret recovery key login
- 📝 Markdown notes, checklists, drawings, and images
- 👥 real-time collaboration on notes
- 📦 import / export
- 📥 Google Keep import
- 🧠 optional local AI assistant
- 📲 PWA support

---

## 📱 Android app

A native Android companion app is available for GlassKeep, making self-hosted mobile usage more convenient.

**Download:** see the [Releases](https://github.com/Victor-root/glasskeep-enhanced/releases) page

> The Android source code is available in the `android/` directory.

---

## 🛠️ Installation

### Recommended native installation (Debian / Ubuntu / Proxmox LXC)

Run as **root** on a clean Debian-based system:

```bash
curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash
```

The script is designed to make installation as simple as possible:
- it directly offers **install / update / uninstall**
- it asks for the important information up front
- it creates the admin account
- it generates the configuration automatically
- it sets up the systemd service
- it can handle **HTTPS** depending on your setup:
  - **reverse proxy**
  - **self-signed certificate**
  - **custom SSL certificate**

> This is the main installation method recommended for this fork.

---

### 🐳 Docker installation

Docker is also available, especially for NAS and similar environments.

#### Install

```bash
mkdir -p ~/glasskeep && cd ~/glasskeep && cat > docker-compose.yml <<'EOF'
services:
  glasskeep:
    image: ghcr.io/victor-root/glasskeep-enhanced:latest
    container_name: glasskeep
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      ADMIN_EMAIL: "admin"
      ADMIN_PASSWORD: "admin"
    volumes:
      - ./data:/data
EOF
docker compose up -d
```

Then:
1. open `http://<your-host>:8080`
2. sign in with `admin` / `admin`
3. change the admin password immediately from the admin panel

#### Update

```bash
cd ~/glasskeep && docker compose pull && docker compose up -d
```

Your data stays preserved in the `./data` directory.

---

## 🌍 Adding a new language

1. Copy `src/i18n/locales/en.js` to a new file, for example `it.js`
2. Translate the values
3. Import the locale in `src/i18n/index.js`
4. Adjust detection logic if needed
5. Rebuild the app

Missing keys will automatically fall back to English.

---

## 🗺️ Roadmap

### 🗓️ Planned
- Server-side encryption to better protect data in case the server or its drives are stolen
- More translations with better RTL language support
- Make the Android app available on **F-Droid**
- Rich Text / Live Formatting Editor

### 💭 Under consideration
- Explore an edit flow closer to Google Keep

---

## 🔐 Security

- `JWT_SECRET` is automatically generated by the native install script
- if you run the server outside the script, you must provide your own valid secret
- serving the app behind HTTPS is still recommended
- the recovery secret key should be treated like a password

---

## 🙏 About this fork

This repository is first and foremost a fork built on a foundation I genuinely liked.

I originally started looking for a self-hosted and open-source alternative to Google Keep. I found **Glass Keep**, liked its direction, its interface, and especially the potential of its foundation. This fork started very modestly, with the idea of adding a French translation, and gradually evolved into a broader set of improvements.

The goal here is not to replace the original project, nor to move “against” it.  
On the contrary, the reason this fork grew so much is precisely because the foundation of **Glass Keep** made me want to spend a lot of time improving it.

Thanks to [nikunjsingh93](https://github.com/nikunjsingh93) for the original project and its foundation.

---

## 📚 Detailed changelog and fork history

For a more complete and structured overview of the changes made since the fork, see:

👉 [`IMPROVEMENTS.md`](./IMPROVEMENTS.md)

---

## 📝 License

MIT — based on [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep) by [nikunjsingh93](https://github.com/nikunjsingh93)
