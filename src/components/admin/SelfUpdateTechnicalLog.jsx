import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import { fetchSelfUpdateLive } from "./selfUpdateHelpers.js";

// Asset listing lines vite emits at the end of every build. There can
// be hundreds of them for the @fontsource packages, and they drown
// out the lines that actually matter (the JS bundle size, the
// warnings). Detect and collapse them into a single expandable group.
const FONT_ASSET_RE = /^dist\/assets\/.+\.(woff2?|otf|ttf|eot)\s/;

function processLog(text) {
    if (!text) return [];
    const out = [];
    let fonts = [];
    const flush = () => {
        if (fonts.length > 0) {
            out.push({ type: "fonts", count: fonts.length, lines: fonts });
            fonts = [];
        }
    };
    for (const line of text.split("\n")) {
        if (FONT_ASSET_RE.test(line)) {
            fonts.push(line);
        } else {
            flush();
            out.push({ type: "line", text: line });
        }
    }
    flush();
    // Drop trailing empty lines for tidiness.
    while (
        out.length > 0 &&
        out[out.length - 1].type === "line" &&
        out[out.length - 1].text === ""
    ) {
        out.pop();
    }
    return out;
}

function FontGroup({ count, lines }) {
    const [open, setOpen] = useState(false);
    const action = open ? t("selfUpdateLogHideFonts") : t("selfUpdateLogShowFonts");
    const label = t("selfUpdateLogFontAssets").replace("{count}", count);
    return (
        <div className="text-gray-500 dark:text-gray-400">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
            >
                <span className="opacity-70">{open ? "▼" : "▶"}</span>
                <span className="italic">+ {label}</span>
                <span className="opacity-60">({action})</span>
            </button>
            {open && (
                <div className="pl-4 mt-0.5 opacity-70">
                    {lines.map((l, i) => (
                        <div key={i} className="whitespace-pre-wrap break-words">
                            {l}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function SelfUpdateTechnicalLog({ token, phase, onTextChanged }) {
    const [text, setText] = useState("");

    // Tell the parent every time the log text changes so the modal's
    // outer scroll container can stick to the bottom AND so the
    // parent can scan the latest output for known failure patterns
    // (OOM during build, lost network, etc.) to surface a friendlier
    // hint in the header. Auto-scrolling lives at the modal level
    // now — the technical log no longer has its own scroll area: a
    // long log just grows the modal and the user scrolls the whole
    // thing.
    useEffect(() => {
        if (typeof onTextChanged === "function") onTextChanged(text);
    }, [text, onTextChanged]);

    useEffect(() => {
        // Fetch the log whenever the modal is non-idle, even if the
        // details section is collapsed — the parent uses the text to
        // detect failure hints, which need to be available the
        // moment we hit a terminal failure state regardless of
        // whether the user expanded the panel.
        if (!token) return;
        const active =
            phase === "starting" ||
            phase === "running" ||
            phase === "waiting_for_server";
        const terminal =
            phase === "success" ||
            phase === "error" ||
            phase === "rolled_back";
        if (!active && !terminal) return;
        let cancelled = false;
        let timer = null;

        const fetchOnce = async () => {
            if (cancelled) return;
            // Same bound as the system endpoint — the build can stall
            // the server's event loop badly enough that a default
            // fetch would wait minutes.
            const ctrl = new AbortController();
            const tHandle = setTimeout(() => ctrl.abort(), 5000);
            try {
                const res = await fetchSelfUpdateLive("log", token, ctrl.signal);
                if (cancelled) return;
                if (res.status === 204) {
                    setText("");
                } else if (res.ok) {
                    const raw = await res.text();
                    if (!cancelled) setText(raw);
                }
            } catch {
                /* ignore — the modal is not the place to surface a fetch hiccup */
            } finally {
                clearTimeout(tHandle);
            }
            // Re-poll only while the update is still running. Once
            // we hit a terminal state we fetched the final log
            // content above; no need to keep hammering the server.
            const stillActive =
                phase === "starting" ||
                phase === "running" ||
                phase === "waiting_for_server";
            if (!cancelled && stillActive) {
                timer = setTimeout(fetchOnce, 1000);
            }
        };

        fetchOnce();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [token, phase]);

    const items = processLog(text);

    return (
        <div className="mt-3 rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3 text-[11px] font-mono text-gray-700 dark:text-gray-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                {t("selfUpdateLogTitle")}
            </div>
            <div className="-mx-1 px-1">
                {items.length === 0 ? (
                    <div className="opacity-60 italic">
                        {t("selfUpdateLogEmpty")}
                    </div>
                ) : (
                    items.map((it, i) =>
                        it.type === "fonts" ? (
                            <FontGroup
                                key={i}
                                count={it.count}
                                lines={it.lines}
                            />
                        ) : (
                            <div key={i} className="whitespace-pre-wrap break-words">
                                {it.text || " "}
                            </div>
                        )
                    )
                )}
            </div>
        </div>
    );
}
