import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";

// Notes of the signed-in TV user: loaded on sign-in, then refreshed by a
// poll, when the network comes back and when the window regains focus.
// An auth error ends the session through clearSession.
export default function useTvNotes(token, clearSession) {
  const [notes, setNotes] = useState([]);
  const notesEtagRef = useRef("");
  const [loadError, setLoadError] = useState(null);

  // Notes loader. Polls every 30s (very cheap on a LAN server) so the
  // viewer keeps up with edits made from the phone, even though we don't
  // attach an SSE listener in TV mode.
  const loadNotes = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api("/notes", { token });
      const list = Array.isArray(data?.notes) ? data.notes : Array.isArray(data) ? data : [];
      // Cheap signature: id+updated_at per note. If nothing actually
      // changed since the last poll, skip setState so React doesn't
      // re-render the whole grid on a no-op tick — big perf win on
      // older Shields where re-rendering 100+ cards is ~150ms.
      const sig = list.map((n) => `${n.id}:${n.updated_at || n.created_at || ""}`).join("|");
      if (sig !== notesEtagRef.current) {
        notesEtagRef.current = sig;
        setNotes(list);
      }
      setLoadError(null);
    } catch (err) {
      if (err?.isAuthError || err?.status === 401) {
        clearSession();
        return;
      }
      setLoadError(err?.message || t("tvFailedToLoadNotes"));
    }
  }, [token, clearSession]);

  useEffect(() => {
    if (!token) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- poll the notes; state is set only after each request resolves
    loadNotes();
    const id = setInterval(loadNotes, 30 * 1000);
    return () => clearInterval(id);
  }, [token, loadNotes]);

  // Refresh when the network comes back: a TV on Wi-Fi is more likely to
  // drop off than a phone.
  useEffect(() => {
    window.addEventListener("online", loadNotes);
    return () => window.removeEventListener("online", loadNotes);
  }, [loadNotes]);

  // Window-focus refresh — the user may have unlocked the TV after
  // hours of standby; pull the latest notes so they're current.
  useEffect(() => {
    const refresh = () => { if (token) loadNotes(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    return () => window.removeEventListener("focus", refresh);
  }, [token, loadNotes]);

  return { notes, setNotes, loadError };
}
