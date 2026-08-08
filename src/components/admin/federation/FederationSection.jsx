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
import { ServerPlusIcon, ServerUserIcon, WorldWwwIcon } from "./FederationIcons.jsx";
import { federationErrorMessage } from "./federationActions.js";

// The app's primary themed button — the exact gradient / theme / hover
// treatment of the admin panel's "Create user" button. `.btn-gradient`
// swaps the indigo->violet base for the active shell theme's gradient, so
// it follows the user theme. Inline variant: icon + label on one line.
const PRIMARY_BTN =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 " +
  "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 " +
  "shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none " +
  "hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none";

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
  const [copiedAddr, setCopiedAddr] = useState(false);

  const copyAddress = async () => {
    const value = fed.localBaseUrl || "";
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedAddr(true);
      window.setTimeout(() => setCopiedAddr(false), 1800);
    } catch {
      /* clipboard blocked — silent */
    }
  };

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
      showToast?.(federationErrorMessage(e, "fedErrGeneric"), "error");
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
    resend: fed.resend,
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
          <ServerUserIcon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
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
            className="flex-1 min-w-[12rem] text-sm px-3 py-2 rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          />
          <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
            {nameDraft.length}/{fed.maxLabelLen}
          </span>
          <button
            type="button"
            onClick={onSaveName}
            disabled={!nameDraft.trim() || !nameChanged || savingName}
            className={PRIMARY_BTN}
          >
            <TI.Check className="tabler-icon w-4 h-4" />
            {t("save")}
          </button>
        </div>
      </div>

      {/* This server's public address — copy-ready so it's easy to send
          to the other server's admin to pair from their side. */}
      <div className="rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1.5">
          <WorldWwwIcon className="shrink-0" />
          {t("fedThisServer")}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 text-xs font-mono text-gray-800 dark:text-gray-100 bg-white dark:bg-black/40 border border-[var(--border-light)] rounded-md px-2 py-1.5 whitespace-nowrap overflow-x-auto">
            {fed.localBaseUrl}
          </code>
          <button
            type="button"
            onClick={copyAddress}
            aria-label={t("copy")}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-500/10 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {copiedAddr ? (
              <TI.Check className="tabler-icon w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <TI.Copy className="tabler-icon w-3.5 h-3.5" />
            )}
            {copiedAddr ? t("copied") : t("copy")}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
          {t("fedThisServerHint")}
        </p>
      </div>

      {/* Invite form */}
      <div className="rounded-xl border border-[var(--border-light)] bg-white/60 dark:bg-white/5 p-4">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
          <ServerPlusIcon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
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
            className="flex-1 min-w-[12rem] text-sm px-3 py-2 rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          />
          <button
            type="button"
            onClick={onInvite}
            disabled={!peerInput.trim() || submitting || !hasSelfName}
            className={PRIMARY_BTN}
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
              hasSelfName={hasSelfName}
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
            {/* .tabler-icon is display:inline-flex (needed for its many
                icon+label button usages elsewhere), so mx-auto has no
                effect on it directly and it was sharing a text line with
                the message below, baseline-aligned against ~14px text —
                pushing most of this 32px icon above the line instead of
                centered over it. Wrapping it in its own block gives
                text-center something block-level to centre AND puts it on
                its own row, matching the stacked icon-then-text look the
                original mx-auto/mb-2 pairing was going for. */}
            <div className="mb-2"><TI.World className="tabler-icon w-8 h-8 opacity-40" /></div>
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
