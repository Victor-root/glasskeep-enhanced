# Front-end architecture

A map of `src/`, to find where a behaviour lives before changing it.

## Entry points

- `main.jsx`: fonts, PWA service worker, the saved theme classes, then `AppRoot`.
- `AppRoot.jsx`: picks the phone/desktop tree (`App`) or the Android TV tree (`components/tv/TvApp`), under the notification and branding providers.
- `App.jsx`: the phone/desktop shell. It wires the hooks below together and renders the routes (unlock screen, sign-in screens, admin route, notes). It holds no business logic of its own.

## Folders

| Folder | Holds |
| --- | --- |
| `components/` | UI, grouped by area (`notes`, `modal`, `checklist`, `drawing`, `audio`, `panels`, `settings`, `admin`, `auth`, `lock`, `notifications`, `tv`, `richtext`, `common`). |
| `hooks/` | React hooks: app-level state and every feature's logic (see below). |
| `sync/` | The local-first data layer: IndexedDB, sync engine, notes loading, live server events. |
| `utils/` | Pure functions and small API wrappers, no React. |
| `ai/`, `auth/`, `push/` | Clients of the AI, sign-in (OIDC, passkeys, device link) and Web Push endpoints. |
| `i18n/` | Translations (English first, then French) and `t()`. |
| `theme/`, `styles/`, `branding/`, `icons/` | Workspace themes, the global stylesheet, instance branding, icons. |

## Hooks used by `App`

App shell:
- `useSession` (session, profile refresh, token renewal, login completion), `useAuthActions` (sign-in, register, sign-out, expired session, SSO return)
- `useHashRoute`, `useDarkMode`, `useWindowSize`
- `useUserPreferences`: every preference synced with `/api/user/settings`; the per-preference rules are in `utils/userPreferences.js`
- `useAppNotifications` (preferences applied to the notification provider, `showToast`), `useServerUpdate`, `usePublicLoginInfo`, `useInstanceLock`
- `useOverlayBackStack`: the Android back button over every overlay
- `useLaunchShortcuts`, `useNoteDeepLinks`, `useAndroidReminderBridge`: entry points from outside the app

Notes:
- `useNoteEditor`: persistence of the open note (drafts via `useDraftNote`, autosave of every note type, live sync into the editor)
- `useNoteActions`: open, close, save, delete, restore, archive, pin, reminder, convert, duplicate, download
- `useNoteFilters`, `useNoteReorder`, `useMultiSelect`, `useBulkActions`, `useLogoLibrary`, `useAiSearch`, `useNoteAiChat`
- `useSideBySide`: two notes side by side; the right pane is `components/modal/SecondaryNoteInstance`

## Data flow (local-first)

1. A local change writes React state and IndexedDB (`sync/localDb.js`), then queues a sync action (`useNoteSync`'s `enqueueAndSync`), under a lease (`sync/useLocalLeases.js`) so a server update can't overwrite it meanwhile.
2. The sync engine (`sync/syncEngine.js`) sends the queue; each answer goes through `sync/reconcileSyncResult.js`.
3. Lists are loaded by `sync/useNotesLoader.js`: IndexedDB first, then the server, without overwriting protected notes.
4. Live server events (`sync/useServerEvents.js`) batch note changes into `sync/remoteNotePatches.js`; every other event is routed by `sync/dispatchServerEvent.js`.
