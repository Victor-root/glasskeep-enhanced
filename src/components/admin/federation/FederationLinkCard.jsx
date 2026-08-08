// src/components/admin/federation/FederationLinkCard.jsx
//
// One paired (or pending) peer server, rendered as a self-contained
// card: a status pill, the peer's address, what the last health
// handshake learned (version / protocol / last contact), a plain-
// language explanation whenever editing is blocked, and the actions
// available for the link's current state.
//
// Everything colour-wise is driven either by the active theme's accent
// CSS variables or by semantic state tones (see federationStatus.js), so
// the card sits correctly under every shell theme, light and dark.

import React, { useState } from "react";
import { t } from "../../../i18n";
import TI from "../../../icons/editor/index.jsx";
import { ServerCheckIcon } from "./FederationIcons.jsx";
import { getFederationStateMeta, fedToneClasses } from "./federationStatus.js";

function hostOf(url) {
  return String(url || "").replace(/^https?:\/\//i, "");
}

function formatWhen(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return null;
  }
}

// Turn the raw last_error (an English slug or a bare OpenSSL code recorded
// by the server) into a localized, human-readable reason for the panel.
// Unknown technical strings are surfaced as-is so nothing is hidden.
function federationErrorLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return s;
  const slugs = {
    "tls-certificate-invalid": "fedErrTls",
    "dns-not-found": "fedErrDns",
    "connection-refused": "fedErrConn",
    "protocol-incompatible": "fedErrProtocol",
    unreachable: "fedErrUnreachable",
  };
  if (slugs[s]) return t(slugs[s]);
  // OpenSSL certificate-verification failures can surface as a bare
  // numeric code (e.g. "20") — treat any pure number as a TLS cert issue.
  if (/^\d+$/.test(s)) return t("fedErrTls");
  const http = s.match(/^http\s+(.+)$/i);
  if (http) return t("fedErrHttp").replace("{status}", http[1]);
  return s;
}

// For an "incompatible" link, say explicitly WHICH side is out of date by
// comparing the two protocol versions each server advertises in the health
// handshake. Peer protocol higher than ours → we're behind; lower (or
// absent, i.e. a build predating protocol versioning) → the peer is behind.
function incompatibleDesc(link) {
  const peerName = link.peerLabel || hostOf(link.peerBaseUrl);
  const fill = (key) => t(key).replace("{peer}", peerName);
  const local = link.localProtocol;
  const peer = link.peerProtocol;
  if (!Number.isInteger(peer)) return fill("fedStateIncompatiblePeer");
  if (Number.isInteger(local)) {
    if (peer > local) return fill("fedStateIncompatibleSelf");
    if (peer < local) return fill("fedStateIncompatiblePeer");
  }
  return t("fedStateIncompatibleDesc");
}

// A neutral action button shared by most controls; variant tweaks the
// accent for the few that need to stand out.
function ActionButton({ icon: Icon, label, onClick, disabled, variant = "neutral" }) {
  const variants = {
    neutral:
      "bg-white dark:bg-white/10 border border-[var(--border-light)] hover:bg-gray-100 dark:hover:bg-white/15 text-gray-700 dark:text-gray-200",
    primary:
      "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600",
    danger:
      "bg-white dark:bg-white/10 border border-rose-300/60 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none ${variants[variant]}`}
    >
      {Icon && <Icon className="tabler-icon w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

// Small inline single-field editor (address / rename) so the admin never
// leaves the card for these quick edits.
function InlineEdit({ initial, placeholder, onSave, onCancel, disabled }) {
  const [value, setValue] = useState(initial || "");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value}
        autoFocus
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(value.trim());
          if (e.key === "Escape") onCancel();
        }}
        className="flex-1 min-w-[12rem] text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-black/30 border border-[var(--border-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
      />
      <ActionButton icon={TI.Check} label={t("save")} variant="primary" disabled={disabled} onClick={() => onSave(value.trim())} />
      <ActionButton icon={TI.X} label={t("cancel")} disabled={disabled} onClick={onCancel} />
    </div>
  );
}

// A muted, icon-led caption for a stat block.
function StatLabel({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {Icon && <Icon className="tabler-icon w-3.5 h-3.5 opacity-70 shrink-0" />}
      <span className="truncate">{label}</span>
    </div>
  );
}

// One aligned "label on top, value below" cell — keeps the health facts
// in tidy columns instead of inline label:value pairs that wrap unevenly.
function Stat({ icon, label, children }) {
  return (
    <div className="min-w-0">
      <StatLabel icon={icon} label={label} />
      <div className="mt-0.5 text-sm text-gray-800 dark:text-gray-100 truncate">
        {children}
      </div>
    </div>
  );
}

export default function FederationLinkCard({
  link,
  busy,
  actions,
  showGenericConfirm,
  hasSelfName = true,
}) {
  const [edit, setEdit] = useState(null); // null | 'address' | 'rename'
  const meta = getFederationStateMeta(link.state);
  const StateIcon = meta.icon;
  const isActive = link.status === "active";
  const isIncoming = link.status === "incoming_pending";
  const isOutgoing = link.status === "outgoing_pending" || link.status === "accepting";
  const isTerminal = link.status === "refused" || link.status === "cancelled" || link.status === "revoked";
  const blocked = isActive && !link.writable; // offline / locked / incompatible

  const title = link.peerLabel || hostOf(link.peerBaseUrl);
  const lastSeen = formatWhen(link.lastSeenAt);

  const confirmDanger = (opts, onConfirm) => {
    if (typeof showGenericConfirm === "function") {
      showGenericConfirm({ ...opts, variant: "danger", onConfirm });
    } else {
      onConfirm();
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border-light)] bg-white/60 dark:bg-white/5 p-4">
      {/* Header: peer identity + live status pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--gk-icon2-bg)] text-[var(--gk-icon2-fg)]">
            <ServerCheckIcon size={22} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold truncate">{title}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
              {hostOf(link.peerBaseUrl)}
            </div>
          </div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${fedToneClasses(meta.tone)}`}
        >
          <StateIcon className="tabler-icon w-3.5 h-3.5" />
          {t(meta.labelKey)}
        </span>
      </div>

      {/* Plain-language explanation whenever editing is blocked or the
          link is mid-handshake — the "never leave anyone guessing" rule. */}
      {(blocked || isOutgoing || isIncoming || link.state === "unknown") && (
        <p
          className={`mt-3 text-xs leading-relaxed ${
            blocked && link.state === "offline"
              ? "text-rose-600 dark:text-rose-300"
              : blocked || (isIncoming && !hasSelfName)
                ? "text-amber-700 dark:text-amber-300"
                : "text-gray-600 dark:text-gray-300"
          }`}
        >
          {link.state === "incompatible"
            ? incompatibleDesc(link)
            : isIncoming && !hasSelfName
              ? t("fedIncomingNeedsSelfName")
              : t(meta.descKey)}
        </p>
      )}

      {/* Health facts (active links), as aligned stat blocks. Versions
          are surfaced for diagnostics even though compatibility is
          decided by protocol. */}
      {isActive && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <Stat icon={TI.Tag} label={t("fedPeerVersion")}>
            <span className="font-semibold">
              {link.peerAppVersion ? `v${link.peerAppVersion}` : "-"}
            </span>
            {Number.isInteger(link.peerProtocol) && (
              <span className="text-gray-400 dark:text-gray-500">
                {" · "}
                {t("fedProtocol")} {link.peerProtocol}
              </span>
            )}
          </Stat>
          <Stat icon={TI.Clock} label={t("fedLastContact")}>
            {lastSeen || t("fedNever")}
          </Stat>
          {/* Raw technical reason of the last failure — surfaced for
              self-hosters debugging proxy / certificate / DNS issues. */}
          {link.lastError && link.state !== "online" && (
            <div className="min-w-0 sm:col-span-2">
              <StatLabel icon={TI.AlertTriangle} label={t("fedDetail")} />
              <p
                className="mt-0.5 text-xs leading-relaxed text-gray-700 dark:text-gray-200"
                title={link.lastError}
              >
                {federationErrorLabel(link.lastError)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Inline editors */}
      {edit === "address" && (
        <InlineEdit
          initial={hostOf(link.peerBaseUrl)}
          placeholder="server.example.com"
          disabled={busy}
          onSave={(v) => {
            if (v) actions.updateAddress(link.id, v);
            setEdit(null);
          }}
          onCancel={() => setEdit(null)}
        />
      )}
      {edit === "rename" && (
        <InlineEdit
          initial={link.peerLabel || ""}
          placeholder={t("fedLabelPlaceholder")}
          disabled={busy}
          onSave={(v) => {
            actions.rename(link.id, v);
            setEdit(null);
          }}
          onCancel={() => setEdit(null)}
        />
      )}

      {/* Actions */}
      {edit === null && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isIncoming && (
            <>
              <ActionButton
                icon={TI.Check}
                label={t("fedAccept")}
                variant="primary"
                disabled={busy || !hasSelfName}
                onClick={() => actions.accept(link.id)}
              />
              <ActionButton
                icon={TI.X}
                label={t("fedRefuse")}
                variant="danger"
                disabled={busy}
                onClick={() =>
                  confirmDanger(
                    {
                      title: t("fedRefuseTitle"),
                      message: t("fedRefuseConfirm").replace("{peer}", title),
                      confirmText: t("fedRefuse"),
                      cancelText: t("cancel"),
                    },
                    () => actions.refuse(link.id),
                  )
                }
              />
            </>
          )}

          {isOutgoing && (
            <ActionButton
              icon={TI.X}
              label={t("fedCancelInvite")}
              variant="danger"
              disabled={busy}
              onClick={() =>
                confirmDanger(
                  {
                    title: t("fedCancelInviteTitle"),
                    message: t("fedCancelInviteConfirm").replace("{peer}", title),
                    confirmText: t("fedCancelInviteAction"),
                    cancelText: t("cancel"),
                  },
                  () => actions.refuse(link.id),
                )
              }
            />
          )}

          {isActive && (
            <>
              <ActionButton
                icon={TI.Refresh}
                label={t("fedRecheck")}
                disabled={busy}
                onClick={() => actions.recheck(link.id)}
              />
              <ActionButton
                icon={TI.ExternalLink}
                label={t("fedChangeAddress")}
                disabled={busy}
                onClick={() => setEdit("address")}
              />
              <ActionButton
                icon={TI.Pencil}
                label={t("fedRename")}
                disabled={busy}
                onClick={() => setEdit("rename")}
              />
              <ActionButton
                icon={TI.Trash}
                label={t("fedUnpair")}
                variant="danger"
                disabled={busy}
                onClick={() =>
                  confirmDanger(
                    {
                      title: t("fedUnpairTitle"),
                      message: t("fedUnpairConfirm").replace("{peer}", title),
                      confirmText: t("fedUnpair"),
                      cancelText: t("cancel"),
                    },
                    () => actions.unpair(link.id),
                  )
                }
              />
            </>
          )}

          {isTerminal && (
            <>
              <ActionButton
                icon={TI.Link}
                label={t("fedResendInvite")}
                disabled={busy}
                onClick={() => actions.resend(link.id)}
              />
              <ActionButton
                icon={TI.Trash}
                label={t("fedRemove")}
                variant="danger"
                disabled={busy}
                onClick={() => actions.unpair(link.id)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
