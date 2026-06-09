// src/components/admin/federation/FederationSection.jsx
//
// The "Federation" block of the admin panel: pair this GlassKeep server
// with another one so their users can collaborate on notes across
// instances. Composes an explainer, THIS server's federation name
// (mandatory — it becomes the badge the peer's users see) and public
// address, the invite form, and the list of links.
//
// Pairing here is the server-to-server handshake only; once two servers
// are linked, ordinary note sharing can target users on the peer.

import React, { useState, useEffect } from "react";
import { t } from "../../../i18n";
import TI from "../../../icons/editor/index.jsx";
import { SettingsSubHeading } from "../../common/SettingsAccordion.jsx";
import { useFederation } from "../../../hooks/useFederation.js";
import FederationLinkCard from "./FederationLinkCard.jsx";
import { ServerShareIcon } from "./FederationIcons.jsx";

// Map a server error code to a friendly, translated sentence.
function inviteErrorMessage(err) {
  const code = err?.message || "";
  const map = {
    invalid_peer_url: "fedErrInvalidPeerUrl",
    invalid_local_url: "fedErrInvalidLocalUrl",
    cannot_pair_with_self: "fedErrSelf",
    already_linked_or_pending: "fedErrAlready",
    self_name_required: "fedSelfNameRequired",
  };
  return t(map[code] || "fedErrGeneric");
}

export default function FederationSection({
  open,
  authToken,
  showToast,
  showGenericConfirm,
}) {
  const fed = useFederation({ token: authToken, enabled: open });
  const [peerInput, setPeerInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Keep the name field in sync with what the server reports.
  useEffect(() => {
    setNameDraft(fed.selfName || "");
  }, [fed.selfName]);

  const isHttps =
    typeof window !== "undefined" && window.location
      ? window.location.protocol === "https:"
      : true;

  const hasSelfName = !!(fed.selfName || "").trim();
  const nameChanged = nameDraft.trim() !== (fed.selfName || "").trim();

  const onSaveName = async () => {
    const name = nameDraft.trim();
    if (!name || savingName) return;
    setSavingName(true);
    try {
      await fed.saveSelfName(name);
      showToast?.(t("fedSelfNameSaved"), "success");
    } catch {
      showToast?.(t("fedErrGeneric"), "error");
    } finally {
      setSavingName(false);
    }
  };

  const onInvite = async () => {
    const peerBaseUrl = peerInput.trim();
    if (!peerBaseUrl || submitting) return;
    if (!hasSelfName) {
      showToast?.(t("fedSelfNameRequired"), "error");
      return;
    }
    setSubmitting(true);
    try {
      await fed.invite({ peerBaseUrl });
      setPeerInput("");
      showToast?.(t("fedInviteSent"), "success");
    } catch (e) {
      showToast?.(inviteErrorMessage(e), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const actions = {
    accept: fed.accept,
    refuse: fed.refuse,
    updateAddress: fed.updateAddress,
    rename: fed.rename,
    unpair: fed.unpair,
    recheck: fed.recheck,
  };

  const incoming = fed.incoming;
  const others = fed.links.filter((l) => l.status !== "incoming_pending");

  return (
    <div className="space-y-4">
      {/* What this is */}
      <p className="text-sm text-gray-600 dark:text-gray-300">{t("fedIntro")}</p>

      {/* HTTPS prerequisite — federation refuses plain http. */}
      {!isHttps && (
        <div className="rounded-lg border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <TI.AlertTriangleFilled className="tabler-icon w-4 h-4 mt-0.5 shrink-0" />
          <span>{t("fedHttpsRequired")}</span>
        </div>
      )}

      {/* This server's federation name (mandatory) — shown to the peer's
          users as the badge on shared notes. */}
      <div
        className={`rounded-xl border p-4 ${
          hasSelfName
            ? "border-[var(--border-light)] bg-white/60 dark:bg-white/5"
            : "border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10"
        }`}
      >
        <div className="text-sm font-semibold mb-1 flex items-center gap-2">
          <TI.Server className="tabler-icon w-4 h-4 text-[var(--gk-chrome-accent)]" />
          {t("fedSelfNameTitle")}
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
          {t("fedSelfNameHint")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={nameDraft}
            maxLength={fed.maxLabelLen}
            placeholder={t("fedSelfNamePlaceholder")}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveName();
            }}
            className="flex-1 min-w-[12rem] text-sm px-3 py-2 rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          />
          <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
            {nameDraft.length}/{fed.maxLabelLen}
          </span>
          <button
            type="button"
            onClick={onSaveName}
            disabled={!nameDraft.trim() || !nameChanged || savingName}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg text-white bg-[var(--gk-chrome-accent)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:pointer-events-none"
          >
            <TI.Check className="tabler-icon w-4 h-4" />
            {t("save")}
          </button>
        </div>
      </div>

      {/* This server's public address (what the peer will see). */}
      <div className="rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1.5">
          <TI.WorldWww className="tabler-icon w-4 h-4" />
          {t("fedThisServer")}
        </div>
        <code className="block text-xs font-mono text-gray-800 dark:text-gray-100 break-all">
          {fed.localBaseUrl}
        </code>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          {t("fedThisServerHint")}
        </p>
      </div>

      {/* Invite form */}
      <div className="rounded-xl border border-[var(--border-light)] bg-white/60 dark:bg-white/5 p-4">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
          <ServerShareIcon className="w-5 h-5 text-[var(--gk-chrome-accent)]" />
          {t("fedPairTitle")}
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
          {t("fedPairHint")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={peerInput}
            placeholder="server.example.com"
            onChange={(e) => setPeerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onInvite();
            }}
            className="flex-1 min-w-[12rem] text-sm px-3 py-2 rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          />
          <button
            type="button"
            onClick={onInvite}
            disabled={!peerInput.trim() || submitting || !hasSelfName}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white bg-[var(--gk-chrome-accent)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:pointer-events-none"
          >
            <TI.Link className="tabler-icon w-4 h-4" />
            {submitting ? t("fedInviteSending") : t("fedInviteSend")}
          </button>
        </div>
        {!hasSelfName && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
            {t("fedSelfNameRequired")}
          </p>
        )}
      </div>

      {/* Incoming invitations — surfaced first so a waiting request is
          impossible to miss when the admin opens the panel. */}
      {incoming.length > 0 && (
        <div className="space-y-3">
          <SettingsSubHeading label={t("fedIncomingHeading")} />
          {incoming.map((link) => (
            <FederationLinkCard
              key={link.id}
              link={link}
              busy={fed.busyId === link.id || fed.busyId === "__global__"}
              actions={actions}
              showGenericConfirm={showGenericConfirm}
            />
          ))}
        </div>
      )}

      {/* Linked + pending-outgoing + terminal links */}
      <div className="space-y-3">
        {others.length > 0 && <SettingsSubHeading label={t("fedLinkedHeading")} />}
        {others.map((link) => (
          <FederationLinkCard
            key={link.id}
            link={link}
            busy={fed.busyId === link.id || fed.busyId === "__global__"}
            actions={actions}
            showGenericConfirm={showGenericConfirm}
          />
        ))}

        {/* Empty / loading states */}
        {fed.loaded && fed.links.length === 0 && (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">
            <TI.World className="tabler-icon w-8 h-8 mx-auto mb-2 opacity-40" />
            {t("fedNoLinks")}
          </div>
        )}
        {!fed.loaded && fed.loading && (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">
            {t("fedLoading")}
          </div>
        )}
        {fed.error && (
          <div className="text-center text-sm text-rose-600 dark:text-rose-300 py-2">
            {fed.error}
          </div>
        )}
      </div>
    </div>
  );
}
