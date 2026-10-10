# Architecture

A map of the repository, to find where a behaviour lives before changing it.

| Path | Holds |
| --- | --- |
| `src/` | The web app (React 19, Vite, Tailwind v4), also loaded by the Android app. |
| `server/` | The API and static server (Express 5, better-sqlite3). |
| `android/` | The Android app: a WebView shell with native bridges. |
| `public/` | Static files and the service-worker add-ons. |
| `scripts/`, `install.sh`, `docker/`, `Dockerfile` | Install, update and maintenance tooling. |
| `website/` | The presentation site (plain HTML/JS, not part of the app). |
| `test/` | The automated test suites. |

## Front-end (`src/`)

### Entry points

- `main.jsx`: fonts, PWA service worker, the saved theme classes, then `AppRoot`.
- `AppRoot.jsx`: picks the phone/desktop tree (`App`) or the Android TV tree (`components/tv/TvApp`), under the notification and branding providers.
- `App.jsx`: the phone/desktop composition root. It wires the hooks below together and renders the routes (unlock screen, sign-in screens, admin route, notes). It holds no business logic of its own.

### Folders

| Folder | Holds |
| --- | --- |
| `components/<area>/` | UI, one component per file, grouped by area: `notes`, `modal`, `checklist`, `drawing`, `audio`, `richtext` (editor, toolbar, Tiptap `extensions/`), `panels` (settings and admin side sheets), `settings`, `admin` (and `admin/federation`), `auth`, `lock`, `notifications`, `tv`, `common` (shared by several areas: popovers, sheets, dialogs, `fieldClasses.js`). |
| `hooks/` | App-level state and every feature's logic, plus the generic hooks shared by several areas. |
| `sync/` | The local-first data layer: IndexedDB, sync engine, notes loading, live server events. |
| `utils/` | Pure functions and small API wrappers, no React. |
| `ai/`, `auth/`, `push/` | Clients of the AI, sign-in (OIDC, passkeys, QR device link) and Web Push endpoints. |
| `i18n/` | `t()` and the translations (`locales/en.js` first, then `fr.js`, same keys). |
| `theme/`, `styles/`, `branding/`, `icons/` | Workspace themes, the injected global stylesheet (`styles/global/*`, joined in cascade order by `globalCSS.js`), instance branding and favicon, icons. |

A hook or helper used by a single area may sit next to its components (`tv/`, `admin/`, `panels/`); anything shared moves to `hooks/` or `utils/`.

### Hooks used by `App`

App shell:
- `useSession` (session, profile refresh, token renewal, login completion), `useAuthActions` (sign-in, register, sign-out, expired session, SSO return)
- `useHashRoute`, `useDarkMode`, `useWindowSize`
- `useUserPreferences`: every preference synced with `/api/user/settings`; the per-preference rules are in `utils/userPreferences.js`
- `useAppNotifications` (preferences applied to the notification provider, `showToast`), `useShareNotifications`, `useServerUpdate`, `usePublicLoginInfo`, `useInstanceLock`
- `useOverlayBackStack`: the Android back button over every overlay
- `useLaunchShortcuts`, `useNoteDeepLinks`, `useAndroidReminderBridge`: entry points from outside the app
- `useAdminActions`, `useImportExport`, `useCollaboration`

Notes:
- `useModalState`: the open note's fields and the modal's UI state
- `useNoteEditor`: persistence of the open note (loading, drafts via `useDraftNote`, autosave of every note type, flush on close, live sync into the editor)
- `useNoteActions`: close, save, delete, restore, archive, pin, reminder, convert, duplicate, download
- `usePrimaryNoteModal`: the primary modal's open, animated close and forced close
- `useLogoLibrary` (logo library, `applyNoteIcon`) and `useNoteIconActions` (the open note's icon)
- `useNoteFilters`, `useNoteReorder`, `useMultiSelect`, `useBulkActions`, `useAiSearch`, `useNoteAiChat`
- `useSideBySide`: two notes side by side. The right pane is `components/modal/SecondaryNoteInstance`, which runs `useModalState`, `useNoteEditor` and `useNoteActions` on its own state. Their options (`audioNotes`, `followRemoteEdits`, `autosaveRerunsOnAppRender`, ...) keep where the two panes differ.

### Data flow (local-first)

1. A local change writes React state and IndexedDB (`sync/localDb.js`, `patchNote` for a partial update), then queues a sync action (`useNoteSync`'s `enqueueAndSync`), under a lease (`sync/useLocalLeases.js`) so a server update can't overwrite it meanwhile.
2. The sync engine (`sync/syncEngine.js`) schedules the queue (retries, backoff, health checks, status); `sync/syncActions.js` sends each action. Each answer goes through `sync/reconcileSyncResult.js`.
3. Lists are loaded by `sync/useNotesLoader.js`: IndexedDB first, then the server, without overwriting protected notes.
4. Live server events (`sync/useServerEvents.js`) batch note changes into `sync/remoteNotePatches.js`; every other event is routed by `sync/dispatchServerEvent.js`.

Other API calls go through `utils/api.js` (`api()`: token, timeout, 401/423 handling); the sign-in clients use `auth/jsonRequest.js`.

## Server (`server/`)

- `index.js`: the composition root. It applies the middlewares, opens the database, builds the shared services, attaches every route group and starts the reminder scheduler. The attach order is the order Express matches requests in, so it is load-bearing: unlock, passkey, update, asset-links, device-link and federation routes come first, then `middleware/lockGate.js` answers 423 to the rest while the instance is locked, then the API, then health and static routes.
- `config.js`: port, run mode, database path, and the JWT secret checked fail-closed.
- `middleware/`: body parsing, trust proxy, security headers (CSP), lock gate.
- `db/schema.js`: opens SQLite and creates or migrates the tables.
- `services/`: the shared logic built once in `index.js` and handed to the routes as `deps`: users and sessions (`userStore`, `sessions`: `auth`, `adminOnly`, tokens), notes (`noteStore`, `noteUserState`, `noteParticipants`, `noteSerializer`), live events (`realtime`), notifications and Web Push, reminders (`reminderScheduler`, `reminderDispatch`), settings, passkey ceremonies, sign-in throttling, self-update (`updateOrchestrator`, `dockerControl`, `updateStatus`).
- `routes/`: one `attach<Name>Routes(app, deps)` per group of endpoints.
- `utils/`: ids, timestamps (LWW validation, `readClientUpdatedAt`), note previews, audio content checks.
- `encryption/`: at-rest encryption of notes. The data key lives only in RAM once an admin unlocks the instance (`runtimeUnlockState`); `instanceVault` (passphrase and recovery-key wraps), `passkeyVault` (passkeys, PRF unlock wraps), `noteCipher`, `challengeStore`.
- `federation/`: pairing two GlassKeep servers and sharing notes across them: signed peer calls (`peer`, `protocol`, `store`) and the note engine (`notes`, with `notesSync`, `notesParticipants`, `notesProfiles`, `notesTeardown`, `notesSchema`).
- `ai/`: the OpenAI-compatible provider, per-admin and per-user settings, the chat and note-chat routes, and the note retrieval that picks the context (`noteRetrieval`, `retrievalText`, `snippets`).
- `oidc/`: single sign-on (provider discovery, flow state, stored configurations).
- `i18n/`: the server's own translations (push and in-app notification texts).

## Android app (`android/`)

Package `com.glasskeep.app`:
- `MainActivity` (setup, welcome, server choice), `WebViewActivity` (the app itself), `SsoReturnActivity` (SSO redirect back into the app).
- `ui/`: the native setup and onboarding screens (Compose), phone and TV.
- `webview/`: file chooser, downloads, media permissions, system bars, toasts.
- `reminders/`: local reminder alarms, boot and sync workers, notifications.
- `update/`: in-app APK updates. `net/`: server checks and cleartext policy.

JavaScript bridges added to the WebView, and their callers in `src/`:
- `AndroidTheme`: the general bridge: status and navigation bar colours (`utils/systemBars.js`), file saves (`utils/files.js`), SSO (`auth/oidcClient.js`), app updates (`components/panels/useAndroidAppUpdate.js`), pull-to-refresh, edge-to-edge and scrollbar preferences, server change.
- `AndroidToast` (`components/notifications/NotificationMobileToast.jsx`), `AndroidReminders` (`utils/androidReminders.js`), `AndroidPasskey` with its `window.GlassKeepAndroidPasskey` façade (`auth/passkeyClient.js`), `AndroidNetDebug` in debug builds (`utils/netDebug.js`).

Build from `android/` with an Android SDK: `./gradlew assembleDebug assembleRelease testDebugUnitTest` (release builds go through R8, rules in `app/proguard-rules.pro`).

## Tooling

- `install.sh`: native install, update and uninstall (Debian, Ubuntu, Proxmox LXC).
- `scripts/self-update.sh`: native self-update, run by the admin panel through a systemd unit. `scripts/docker-update-helper.cjs`: the Docker self-update sidecar; standalone on purpose, it runs in its own short-lived container.
- `scripts/unlock-instance.cjs` (`npm run unlock-instance`), `scripts/test-notification.cjs`, `scripts/test-reminder.cjs`, `scripts/test-reminder-native.sh`: maintenance and test CLIs; `scripts/lib/` holds what they share (.env, HTTPS rule, admin token).
- `Dockerfile`, `docker-compose.yml`, `docker/`: the image, its entrypoint and the first-run admin bootstrap.
- `public/push-sw.js`, `public/sw-routes.js`: layered onto the generated service worker (`vite.config.js`).

## Tests

See `test/README.md`. From the repository root:

- `npm test`: pure checks, no server (`test/unit`, `test/invariants`, `test/federation/t7`).
- `npm run test:functional`: each scenario of `test/functional` starts its own instance.
- `npm run test:integration`: two TLS-paired instances, every federation scenario, then the functional ones (needs `openssl`).
- `node server/ai/noteRetrieval.test.js`: the AI retrieval scenarios.
- `npx eslint src server test scripts docker public website *.config.js`: lint.
