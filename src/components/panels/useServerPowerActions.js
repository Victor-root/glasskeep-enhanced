import { useState } from "react";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";

// Shows `seconds` counting down once a second, then reloads the page.
function reloadAfterCountdown(seconds, setCountdown) {
  setCountdown(seconds);
  let n = seconds;
  const tick = setInterval(() => {
    n -= 1;
    setCountdown(n);
    if (n <= 0) {
      clearInterval(tick);
      window.location.reload();
    }
  }, 1000);
}

// The Admin panel's restart and shutdown buttons: confirmation, the
// request, then polling /api/health until the server is back (restart)
// or gone (shutdown), and a countdown before the page reloads.
export default function useServerPowerActions({ showGenericConfirm, showToast, authToken }) {
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartPhase, setRestartPhase] = useState(null); // null | "waiting" | "countdown"
  const [restartCountdown, setRestartCountdown] = useState(5);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [shutdownPhase, setShutdownPhase] = useState(null); // null | "waiting" | "countdown"
  const [shutdownCountdown, setShutdownCountdown] = useState(3);

  const handleRestart = () => {
    showGenericConfirm({
      title: t("restartServerTitle"),
      message: t("restartServerConfirm"),
      confirmText: t("restartServerConfirmBtn"),
      danger: true,
      onConfirm: async () => {
        setIsRestarting(true);
        setRestartPhase("waiting");
        try {
          const healthBefore = await fetch("/api/health").then((r) => r.json()).catch(() => null);
          const startedAtBefore = healthBefore?.startedAt ?? Date.now();

          const res = await fetch("/api/admin/restart", {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showToast(localizeServerError(data.error, "error"), "error");
            setIsRestarting(false);
            setRestartPhase(null);
            return;
          }

          // Poll /api/health until startedAt is newer → confirmed new instance.
          const deadline = Date.now() + 60_000;
          const poll = async () => {
            if (Date.now() > deadline) {
              setIsRestarting(false);
              setRestartPhase(null);
              showToast(t("restartServerTimeout"), "error");
              return;
            }
            try {
              const h = await fetch("/api/health").then((r) => r.json());
              if (h?.startedAt && h.startedAt > startedAtBefore) {
                setIsRestarting(false);
                setRestartPhase("countdown");
                reloadAfterCountdown(5, setRestartCountdown);
                return;
              }
            } catch {
              // Server still down: keep polling.
            }
            setTimeout(poll, 1500);
          };
          setTimeout(poll, 1500);
        } catch {
          showToast(t("error"), "error");
          setIsRestarting(false);
          setRestartPhase(null);
        }
      },
    });
  };

  const handleShutdown = () => {
    showGenericConfirm({
      title: t("shutdownServerTitle"),
      message: t("shutdownServerConfirm"),
      confirmText: t("shutdownServerConfirmBtn"),
      danger: true,
      onConfirm: async () => {
        setIsShuttingDown(true);
        setShutdownPhase("waiting");
        try {
          const res = await fetch("/api/admin/shutdown", {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showToast(localizeServerError(data.error, "error"), "error");
            setIsShuttingDown(false);
            setShutdownPhase(null);
            return;
          }

          // Poll /api/health until it fails → server is stopped.
          // AbortController caps each attempt at 3 s so a hanging TCP
          // connection doesn't block detection of the server going down.
          const deadline = Date.now() + 30_000;
          const poll = async () => {
            if (Date.now() > deadline) {
              setIsShuttingDown(false);
              setShutdownPhase(null);
              showToast(t("shutdownServerTimeout"), "error");
              return;
            }
            try {
              const ctrl = new AbortController();
              const t0 = setTimeout(() => ctrl.abort(), 3000);
              await fetch("/api/health", { signal: ctrl.signal });
              clearTimeout(t0);
              // Still responding: keep polling.
              setTimeout(poll, 1500);
            } catch {
              // Fetch failed or aborted → server is down. Start 3s countdown then reload.
              setIsShuttingDown(false);
              setShutdownPhase("countdown");
              reloadAfterCountdown(3, setShutdownCountdown);
            }
          };
          setTimeout(poll, 1500);
        } catch {
          showToast(t("error"), "error");
          setIsShuttingDown(false);
          setShutdownPhase(null);
        }
      },
    });
  };

  return {
    isRestarting,
    restartPhase,
    restartCountdown,
    isShuttingDown,
    shutdownPhase,
    shutdownCountdown,
    handleRestart,
    handleShutdown,
  };
}
