// server/index.js
// Express + SQLite (better-sqlite3) + JWT auth API for Glass Keep
//
// The composition root: creates the app, wires the middlewares, opens the
// database, builds the shared services, attaches every route group and
// starts listening. The order below is both the order Express matches
// requests in and the order things happen at boot, so it is load-bearing.

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { PORT, NODE_ENV, dbFile } = require("./config");
const { completeRuntimeUpgrade } = require("./services/updateOrchestrator");
const { attachBodyParsing } = require("./middleware/bodyParsing");
const { configureTrustProxy } = require("./middleware/trustProxy");
const { attachSecurityHeaders } = require("./middleware/securityHeaders");
const { attachLockGate } = require("./middleware/lockGate");
const { openDatabase } = require("./db/schema");
const { uid } = require("./utils/ids");
const { nowISO, isNewerOrEqual, parseIsoTimestamp } = require("./utils/timestamps");

// AI provider — OpenAI-compatible HTTP layer (Ollama, Open WebUI,
// LiteLLM, OpenAI, OpenRouter, …). The server itself no longer ships
// an embedded model.
const { attachAiRoutes } = require("./ai/aiRoutes");

const instanceVault = require("./encryption/instanceVault");
const runtimeUnlock = require("./encryption/runtimeUnlockState");
const passkeyVaultModule = require("./encryption/passkeyVault");
const { attachUnlockRoutes } = require("./routes/unlockRoutes");
const { attachPasskeyRoutes } = require("./routes/passkeyRoutes");
const { attachUpdateRoutes } = require("./routes/updateRoutes");
const { attachSelfUpdateRoutes } = require("./routes/selfUpdateRoutes");
const { attachAssetLinksRoutes } = require("./routes/assetLinksRoutes");
const { attachDeviceLinkRoutes } = require("./routes/deviceLinkRoutes");
const { attachFederationRoutes } = require("./routes/federationRoutes");
const { attachOidcRoutes } = require("./routes/oidcRoutes");
const { attachEventsRoutes } = require("./routes/eventsRoutes");
const { attachAuthRoutes } = require("./routes/authRoutes");
const { attachAccountRoutes } = require("./routes/accountRoutes");
const { attachProfileRoutes } = require("./routes/profileRoutes");
const { attachNotesRoutes, attachNoteByIdRoutes } = require("./routes/notesRoutes");
const {
  attachCollaborationRoutes,
  attachCollaboratedNotesRoutes,
} = require("./routes/collaborationRoutes");
const { attachNotificationRoutes } = require("./routes/notificationRoutes");
const { attachArchiveRoutes } = require("./routes/archiveRoutes");
const { attachReminderRoutes } = require("./routes/reminderRoutes");
const { attachPushRoutes } = require("./routes/pushRoutes");
const { attachTrashRoutes } = require("./routes/trashRoutes");
const { attachNoteExportRoutes } = require("./routes/noteExportRoutes");
const { attachNoteImportRoutes } = require("./routes/noteImportRoutes");
const { attachUserSettingsRoutes } = require("./routes/userSettingsRoutes");
const { attachLogoRoutes } = require("./routes/logoRoutes");
const { attachAdminSettingsRoutes } = require("./routes/adminSettingsRoutes");
const { attachBrandingRoutes } = require("./routes/brandingRoutes");
const { attachUsersRoutes } = require("./routes/usersRoutes");
const { attachInstanceControlRoutes } = require("./routes/instanceControlRoutes");
const { attachHealthRoutes } = require("./routes/healthRoutes");
const { attachStaticRoutes } = require("./routes/staticRoutes");
const { promoteExistingAdmins } = require("./services/adminEmails");
const { createUserStore } = require("./services/userStore");
const { createSessions } = require("./services/sessions");
const { createNoteStore } = require("./services/noteStore");
const { createNoteUserState } = require("./services/noteUserState");
const { createNoteParticipants } = require("./services/noteParticipants");
const { createNoteSerializer } = require("./services/noteSerializer");
const { createRealtime } = require("./services/realtime");
const { createNotifications } = require("./services/notifications");
const { createProfileBroadcast } = require("./services/profileBroadcast");
const { createAppSettings } = require("./services/appSettings");
const { createReminderDispatch } = require("./services/reminderDispatch");
const pushService = require("./services/pushNotifications");
const { startReminderScheduler } = require("./services/reminderScheduler");
const { denySignIn, signInOnHold } = require("./services/signIn");

const app = express();

attachBodyParsing(app);
configureTrustProxy(app);
attachSecurityHeaders(app);

// ---------- CORS (dev only) ----------
if (NODE_ENV !== "production") {
  app.use(
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: false,
    })
  );
}

// ---------- SQLite ----------
const db = openDatabase(dbFile);

// ---------- At-rest encryption (server-side, app-level unlock) ----------
// Sensitive fields of every note can be stored encrypted on disk. The
// data-encryption key (DEK) lives only in RAM after an admin unlocks
// the instance. See server/encryption/* for the full design.
instanceVault.ensureSchema(db);
{
  const row = instanceVault.getStatusRow(db);
  if (row && row.enabled) {
    runtimeUnlock.setEnabled(true);
    console.log("[encrypt] At-rest encryption is ENABLED. Instance starts LOCKED — admin must unlock.");
  } else {
    runtimeUnlock.setEnabled(false);
    console.log("[encrypt] At-rest encryption is disabled.");
  }
}

promoteExistingAdmins(db);

// ---------- Shared services ----------
// Set once the federation engine is attached (below). The services built
// before it reach it through getNoteFederation, so a note edit can be
// pushed to the peer the instant it lands.
let noteFederation = null;
const getNoteFederation = () => noteFederation;

const users = createUserStore(db);
const sessions = createSessions({ db, ...users });
const notes = createNoteStore(db);
const noteUserState = createNoteUserState({ db, ...notes });
const participants = createNoteParticipants({ db, ...users, getNoteFederation });
const { serializeNote } = createNoteSerializer({ ...noteUserState, ...participants, getNoteFederation });
const realtime = createRealtime({ db, ...notes, ...participants, getNoteFederation });
const notifications = createNotifications({ db, ...realtime });
const services = {
  db,
  ...users,
  ...sessions,
  ...notes,
  ...noteUserState,
  ...participants,
  serializeNote,
  ...realtime,
  ...notifications,
};
const { getUserById, getUserByEmail } = users;
const { auth, adminOnly, signToken, sessionResponse } = sessions;
const { sendEventToUser, broadcastToAdmins, broadcastToAll } = realtime;

// ---------- At-rest encryption: unlock routes + lock gate ----------
// These have to be registered BEFORE the bulk of the API so the lock
// middleware can short-circuit everything else with HTTP 423 while
// still letting unlock attempts and the public lock-status endpoint
// through. See server/encryption/* and server/routes/unlockRoutes.js.
// Late-bound: the federation engine is attached further down, so the
// unlock routes reach it through this ref to ping peers on lock/unlock.
let federationNotifyPeersRef = null;
attachUnlockRoutes(app, {
  db, auth, adminOnly, log: console, broadcastToAll,
  onLockStateChanged: () => { try { federationNotifyPeersRef?.(); } catch { /* peer ping is best-effort */ } },
});

// Passkey schema is created up-front (idempotent) so registration + login
// work even before encryption is activated. Routes attach next to the
// unlock routes so /api/passkeys/login/* and /api/instance/unlock-passkey/*
// can run while the lock gate is active (their paths are allow-listed
// below alongside /api/instance/*).
passkeyVaultModule.ensureSchema(db);
attachPasskeyRoutes(app, { db, auth, adminOnly, signToken, getUserById, log: console });
attachUpdateRoutes(app, { db, auth, adminOnly, log: console });
attachSelfUpdateRoutes(app, { auth, adminOnly, log: console });
completeRuntimeUpgrade(console);

// Digital Asset Links — must answer at /.well-known/assetlinks.json
// before the production catch-all sends every unknown path to
// index.html. Stays public (no auth, no lock gate) because Android's
// verifier hits the URL unauthenticated and from outside any session.
attachAssetLinksRoutes(app, { log: console });

// Cross-device QR-code sign-in (the foreign PC shows a QR, the
// phone scans + approves, the PC trades the token for a JWT on its
// next poll). Schema is created lazily inside the route module.
attachDeviceLinkRoutes(app, { db, auth, signToken, getUserById, log: console });

// Cross-server collaboration ("federation"). Pairs two GlassKeep
// servers so their users can share notes across instances. The returned
// `tick` drives the pairing handshake retries and the per-link health
// probes; we run it on an interval (unref'd so it never keeps the
// process alive on its own) and the routes also kick it on demand.
const federation = attachFederationRoutes(app, {
  db,
  auth,
  adminOnly,
  log: console,
  broadcastToAdmins,
  // Note helpers the note-federation engine reuses, so mirrored notes go
  // through the SAME encryption-aware write path as local notes.
  noteDeps: {
    nowISO,
    uid,
    isLocked: () => runtimeUnlock.isEnabled() && !runtimeUnlock.isUnlocked(),
    sendEventToUser,
    getUserById,
    getUserByEmail,
    getUserByName: users.getUserByName,
    getRealUserByEmail: users.getRealUserByEmail,
    getRealUserByName: users.getRealUserByName,
    getNoteById: notes.getNoteById,
    getUserTags: noteUserState.getUserTags,
    runInsertNote: notes.runInsertNote,
    runUpdateNoteFullCollab: notes.runUpdateNoteFullCollab,
    addCollaborator: participants.addCollaborator,
    setCollaboratorCanWrite: participants.setCollaboratorCanWrite,
    removeCollaborator: participants.removeCollaboratorRow,
    getNoteRoster: participants.getNoteRoster,
    getNoteCollaborators: participants.getNoteCollaborators,
    getMaxUserEffectivePosition: noteUserState.getMaxUserEffectivePosition,
    upsertUserPosition: noteUserState.upsertUserPosition,
    updateNoteWithEditor: notes.updateNoteWithEditor,
    createShareNotification: notifications.createShareNotification,
    createSharedNoteDeletedNotification: notifications.createSharedNoteDeletedNotification,
    createAccessRevokedNotification: notifications.createAccessRevokedNotification,
    broadcastNoteUpdated: realtime.broadcastNoteUpdated,
    isNewerOrEqual,
    parseIsoTimestamp,
  },
});
// Wire the instant-push hook the services built above reach through
// getNoteFederation.
noteFederation = federation.noteFederation;
// Wire the late-bound ref the unlock routes use to ping peers on lock/unlock.
federationNotifyPeersRef = federation.notifyPeersStateChanged;
const FEDERATION_TICK_MS = (() => {
  const raw = parseInt(process.env.FEDERATION_TICK_MS, 10);
  return Number.isFinite(raw) && raw >= 5000 ? raw : 10000;
})();
setInterval(() => {
  federation.tick().catch((e) => console.warn("[federation] tick error:", e?.message));
}, FEDERATION_TICK_MS).unref();

attachLockGate(app);

// Everything the route groups below need. The admin settings and the
// reminder scheduler are created further down; the routes registered
// before them read them at request time.
const deps = {
  ...services,
  noteFederation,
  ...createProfileBroadcast({ getUserById, noteFederation }),
  getAdminSettings: () => adminSettings,
  getReminderScheduler: () => reminderScheduler,
};

attachEventsRoutes(app, deps);

// ---------- Auth ----------
attachAuthRoutes(app, deps);
attachAccountRoutes(app, deps);

// Sign-in through an OpenID Connect provider, the instance's or each
// user's own, as the admin allows. Registered after the lock gate, like
// the password sign-in: a locked instance opens no session either way.
// adminSettings is read at request time, it is set up below.
attachOidcRoutes(app, {
  db,
  auth,
  adminOnly,
  getUserById,
  getUserByEmail,
  ssoSettings: () => ({
    allowed: adminSettings.ssoAllowed,
    policy: adminSettings.ssoPolicy,
    allowPrivateNetwork: adminSettings.ssoAllowPrivateNetwork,
  }),
  signInOnHold,
  denySignIn,
  sessionResponse,
  log: console,
});

attachProfileRoutes(app, deps);

// ---------- Notes ----------
attachNotesRoutes(app, deps);
attachCollaborationRoutes(app, deps);
attachNotificationRoutes(app, deps);
attachCollaboratedNotesRoutes(app, deps);
attachArchiveRoutes(app, deps);
attachReminderRoutes(app, deps);
attachPushRoutes(app, deps);
attachTrashRoutes(app, deps);
attachNoteExportRoutes(app, deps);
// MUST be after all literal /api/notes/xxx GET routes to avoid shadowing
attachNoteByIdRoutes(app, deps);
attachNoteImportRoutes(app, deps);

// ---------- User settings & logo library ----------
attachUserSettingsRoutes(app, deps);
attachLogoRoutes(app, deps);

// ---------- Admin ----------
const appSettings = createAppSettings({ db });
const { adminSettings } = appSettings;
attachAdminSettingsRoutes(app, { ...deps, ...appSettings });
attachBrandingRoutes(app, appSettings);
attachUsersRoutes(app, deps);
attachInstanceControlRoutes(app, deps);

// ---------- AI Assistant (OpenAI-compatible provider) ----------
// All AI endpoints (admin settings + user chat) live in server/ai/.
attachAiRoutes(app, { db, auth, adminOnly, sendEventToUser, broadcastToAdmins });

// ---------- Health ----------
attachHealthRoutes(app, { nodeEnv: NODE_ENV });

// ---------- Static (production) ----------
if (NODE_ENV === "production") {
  attachStaticRoutes(app, appSettings);
}

// ---------- Reminders: scheduler + delivery ----------
const { dispatchReminder } = createReminderDispatch(services);

// Resolve VAPID keys with auto-generation: env -> persisted file (next to
// the DB) -> freshly generated + persisted. Push thus works with no manual
// setup on a fresh install or after an upgrade; an explicit env pair wins.
pushService.init(console, { persistFile: path.join(path.dirname(dbFile), ".vapid.json") });
const reminderScheduler = startReminderScheduler({
  db,
  dispatch: dispatchReminder,
  log: console,
  // Sweep cadence (ms). Default 30s; override with REMINDER_SWEEP_MS.
  intervalMs: Number(process.env.REMINDER_SWEEP_MS) || undefined,
});

// ---------- Listen ----------
const SSL_CERT    = process.env.SSL_CERT;
const SSL_KEY     = process.env.SSL_KEY;
const HTTPS_ENABLED = process.env.HTTPS_ENABLED !== "false";

if (
  HTTPS_ENABLED &&
  SSL_CERT && SSL_KEY &&
  fs.existsSync(SSL_CERT) && fs.existsSync(SSL_KEY)
) {
  const https = require("https");
  const sslOptions = {
    cert: fs.readFileSync(SSL_CERT),
    key:  fs.readFileSync(SSL_KEY),
  };
  https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
    console.log(`API listening on https://0.0.0.0:${PORT}  (env=${NODE_ENV})`);
  });
} else {
  app.listen(PORT, "0.0.0.0", (err) => {
    if (err) throw err;
    console.log(`API listening on http://0.0.0.0:${PORT}  (env=${NODE_ENV})`);
  });
}
