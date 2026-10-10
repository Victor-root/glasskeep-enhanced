import { useEffect, useRef, useState } from "react";
import changelogRaw from "../../../CHANGELOG.md?raw";
import { t, locale } from "../../i18n";
import { api, getAuth, API_BASE } from "../../utils/api.js";
import { readSseFrames } from "../../utils/sse.js";

// True when the requesting user has a usable AI config (either the
// shared "server" provider opted-in by the admin, or their own custom
// endpoint). The "Translate with AI" button stays visible but disabled
// when this is false, so the feature is always discoverable.
async function fetchAiAvailable(token) {
    try {
        const cfg = await api("/user/ai/settings", { token, timeoutMs: 4000 });
        if (!cfg || !cfg.enabled || !cfg.adminAiEnabled) return false;
        if (cfg.mode === "server") return !!cfg.serverAiAvailable;
        if (cfg.mode === "custom") return !!cfg.baseUrl && !!cfg.model;
        return false;
    } catch {
        return false;
    }
}

// "Translate with AI" for the changelog modal: availability, the streamed
// translation and the original / translated toggle.
export default function useChangelogTranslation(open) {
    const [aiAvailable, setAiAvailable] = useState(false);
    const [translating, setTranslating] = useState(false);
    const [translatedRaw, setTranslatedRaw] = useState(null);
    const [translateError, setTranslateError] = useState(null);
    const [showOriginal, setShowOriginal] = useState(false);
    // Holds the AbortController of an in-flight translation stream so
    // closing the modal mid-stream tears the upstream request down
    // (no more tokens wasted after the admin walks away).
    const translateAbortRef = useRef(null);

    // Pull the AI availability flag once the modal opens so the
    // translate button starts in the right enabled / disabled state.
    // Only the bundled `en` text can be skipped here, but we still
    // probe because the user may want to translate EN → other (and
    // a future locale could ship with EN bundled by default).
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const token = getAuth()?.token || null;
        (async () => {
            const ok = await fetchAiAvailable(token);
            if (!cancelled) setAiAvailable(ok);
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    // Whenever the modal closes (or re-opens), drop the local
    // translation state so the next session starts fresh. Keeping
    // the cache on the server means re-translating is instant.
    // An in-flight stream is aborted so we don't keep spending
    // tokens after the admin walked away.
    useEffect(() => {
        if (!open) {
            if (translateAbortRef.current) {
                try { translateAbortRef.current.abort(); } catch { /* ignore */ }
                translateAbortRef.current = null;
            }
            // eslint-disable-next-line react-hooks/set-state-in-effect -- reset translation state when the modal closes, together with aborting the stream
            setTranslatedRaw(null);
            setTranslateError(null);
            setShowOriginal(false);
            setTranslating(false);
        }
    }, [open]);

    const onTranslate = async () => {
        if (translating || !aiAvailable) return;
        setTranslateError(null);
        setTranslating(true);
        setShowOriginal(false);
        setTranslatedRaw("");

        const controller = new AbortController();
        translateAbortRef.current = controller;
        const token = getAuth()?.token || null;
        let accumulated = "";

        try {
            const res = await fetch(`${API_BASE}/ai/translate-changelog`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    content: String(changelogRaw || ""),
                    lang: locale,
                }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                // Best-effort attempt to read a JSON error body: the
                // server only switches to SSE once it has validated the
                // request, so early failures still come back as JSON.
                let msg = `HTTP ${res.status}`;
                try {
                    const j = await res.json();
                    if (j?.error) msg = j.error;
                } catch {
                    /* ignore: keep the HTTP status */
                }
                throw new Error(msg);
            }

            // Within an SSE frame each line is `<field>: <value>`. We
            // only care about `event:` (delta | done | error) and the
            // first `data:` line, which is JSON.
            for await (const frame of readSseFrames(res.body)) {
                let evtName = "message";
                let dataLine = "";
                for (const rawLine of frame.split("\n")) {
                    const line = rawLine.replace(/\r$/, "");
                    if (line.startsWith("event:")) {
                        evtName = line.slice(6).trim();
                    } else if (line.startsWith("data:")) {
                        // SSE allows multi-line data; we only emit
                        // single-line payloads, so the first hit wins.
                        if (!dataLine) dataLine = line.slice(5).trim();
                    }
                }
                if (!dataLine) continue;
                let payload;
                try {
                    payload = JSON.parse(dataLine);
                } catch {
                    continue;
                }
                if (evtName === "delta") {
                    if (typeof payload.delta === "string") {
                        accumulated += payload.delta;
                        setTranslatedRaw(accumulated);
                    }
                } else if (evtName === "error") {
                    throw new Error(payload.error || "stream error");
                }
                // "done" needs no action; the loop ends when the
                // server closes the stream after emitting it.
            }
            if (!accumulated) throw new Error("empty");
        } catch (e) {
            if (e?.name !== "AbortError") {
                setTranslateError(e?.message || t("changelogTranslateFailed"));
                setTranslatedRaw(null);
            }
        } finally {
            translateAbortRef.current = null;
            setTranslating(false);
        }
    };

    return {
        aiAvailable,
        translating,
        translatedRaw,
        translateError,
        showOriginal,
        setShowOriginal,
        onTranslate,
    };
}
