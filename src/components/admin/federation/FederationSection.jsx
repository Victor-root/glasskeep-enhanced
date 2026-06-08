// src/components/admin/federation/FederationSection.jsx
//
// The "Federation" block of the admin panel: pair this GlassKeep server
// with another one so their users can collaborate on notes across
// instances. Composes an explainer, this server's own public address,
// the invite form, and the list of links (incoming invitations first,
// then linked servers) rendered as FederationLinkCard.
//
// Pairing here is the server-to-server handshake only; once two servers
// are linked, ordinary note sharing can target users on the peer.

import React, { useState } from "react";
import { t } from "../../../i18n";
import TI from "../../../icons/editor/index.jsx";
import { SettingsSubHeading } from "../../common/SettingsAccordion.jsx";
import { useFederation } from "../../../hooks/useFederation.js";
import FederationLinkCard from "./FederationLinkCard.jsx";

// Map a server error code to a friendly, translated sentence.
function inviteErrorMessage(err) {
  const code = err?.message || "";
  const map = {
    invalid_peer_url: "fedErrInvalidPeerUrl",
    invalid_local_url: "fedErrInvalidLocalUrl",
    cannot_pair_with_self: "fedErrSelf",
    already_linked_or_pending: "fedErrAlready",
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
  const [labelInput, setLabelInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isHttps =
    typeof window !== "undefined" && window.location
      ? window.location.protocol === "https:"
      : true;

  const onInvite = async () => {
    const peerBaseUrl = peerInput.trim();
    if (!peerBaseUrl || submitting) return;
    setSubmitting(true);
    try {
      await fed.invite({ peerBaseUrl, label: labelInput.trim() });
      setPeerInput("");
      setLabelInput("");
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
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("fedIntro")}
      </p>

      {/* HTTPS prerequisite — federation refuses plain http. */}
      {!isHttps && (
        <div className="rounded-lg border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <TI.AlertTriangleFilled className="tabler-icon w-4 h-4 mt-0.5 shrink-0" />
          <span>{t("fedHttpsRequired")}</span>
        </div>
      )}

      {/* This server's public address (what the peer will see). */}
      <div className="rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1.5">
          <TI.World className="tabler-icon w-4 h-4" />
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
          <TI.UserPlus className="tabler-icon w-4 h-4 text-[var(--gk-chrome-accent)]" />
          {t("fedPairTitle")}
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
          {t("fedPairHint")}
        </p>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={peerInput}
            placeholder="server.example.com"
            onChange={(e) => setPeerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onInvite();
            }}
            className="w-full text-sm px-3 py-2 rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={labelInput}
              placeholder={t("fedLabelPlaceholder")}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onInvite();
              }}
              className="flex-1 min-w-[12rem] text-sm px-3 py-2 rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            />
            <button
              type="button"
              onClick={onInvite}
              disabled={!peerInput.trim() || submitting}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white bg-[var(--gk-chrome-accent)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:pointer-events-none"
            >
              <TI.Link className="tabler-icon w-4 h-4" />
              {submitting ? t("fedInviteSending") : t("fedInviteSend")}
            </button>
          </div>
        </div>
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
