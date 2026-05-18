import React, { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import changelogRaw from "../../../CHANGELOG.md?raw";
import { t, locale } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { api, getAuth, API_BASE } from "../../utils/api.js";

// =============================================================================
//  ChangelogModal
//
//  Auto-shown after a successful in-app update. The flag that gates it
//  is set by SelfUpdateProgress's "Reload" button right before the
//  page reloads, then read (and cleared) here on mount. This keeps
//  the modal scoped strictly to the in-app update flow — CLI updates
//  never set the flag, so they never trigger it.
//
//  The full CHANGELOG.md is bundled at build time via Vite's `?raw`
//  import. It is rendered through marked + DOMPurify so the HTML
//  injected via dangerouslySetInnerHTML is sanitized.
// =============================================================================

const SHOW_FLAG_KEY = "glass-keep-show-changelog-next-mount";

function readShowFlag() {
    try {
        return localStorage.getItem(SHOW_FLAG_KEY) === "1";
    } catch {
        return false;
    }
}

function clearShowFlag() {
    try {
        localStorage.removeItem(SHOW_FLAG_KEY);
    } catch {
        /* ignore — at worst the modal shows once more on next visit */
    }
}

// Public helper: SelfUpdateProgress calls this just before reloading
// the page so the post-reload mount knows it should pop the modal.
export function markChangelogToShow() {
    try {
        localStorage.setItem(SHOW_FLAG_KEY, "1");
    } catch {
        /* ignore */
    }
}

// Public helper: opens the modal on demand (used by the "View
// changelog" link in the admin panel, so admins can re-read the
// release notes even outside of an update flow).
const OPEN_EVENT = "glass-keep:open-changelog";
export function openChangelog() {
    try {
        window.dispatchEvent(new CustomEvent(OPEN_EVENT));
    } catch {
        /* ignore — best-effort */
    }
}

function compileMarkdown(md) {
    try {
        const html = marked.parse(String(md || ""), {
            breaks: false,
            gfm: true,
        });
        return DOMPurify.sanitize(html);
    } catch {
        return "";
    }
}

// Compile the bundled changelog once at module load — it is identical
// for every render and parsing 5 KB of changelog on every mount would
// be silly. AI-translated variants are compiled on the fly when the
// user clicks "Translate with AI".
const compiledChangelog = compileMarkdown(changelogRaw);

// Where relative changelog links (e.g. `./PASSKEYS.md`) live online.
// The changelog is markdown checked into the repo, so any in-repo
// reference makes sense once resolved against the GitHub view URL.
const REPO_BLOB_BASE =
    "https://github.com/Victor-root/glasskeep-enhanced/blob/main/";

function resolveChangelogHref(href) {
    if (!href) return null;
    // Already absolute (http(s):, mailto:, tel:, etc.) — pass through.
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    // Strip a leading `./` so URL doesn't fold it into the basename, then
    // build against the GitHub blob root. Anchors and query strings are
    // preserved because URL handles them natively.
    try {
        return new URL(href.replace(/^\.\//, ""), REPO_BLOB_BASE).toString();
    } catch {
        return null;
    }
}

function openExternalUrl(url) {
    if (!url) return;
    // The native Android shell exposes a bridge that hands the URL to
    // the system browser. Using window.open here would silently fail
    // (the WebView has multi-window support disabled), so the bridge
    // path is preferred whenever it's available.
    try {
        if (window.AndroidTheme && typeof window.AndroidTheme.openExternalUrl === "function") {
            window.AndroidTheme.openExternalUrl(url);
            return;
        }
    } catch { /* ignore — fall through to window.open */ }
    try { window.open(url, "_blank", "noopener,noreferrer"); }
    catch { /* nothing else we can do */ }
}

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

export default function ChangelogModal() {
    const [open, setOpen] = useState(false);
    const [aiAvailable, setAiAvailable] = useState(false);
    const [translating, setTranslating] = useState(false);
    const [translatedRaw, setTranslatedRaw] = useState(null);
    const [translateError, setTranslateError] = useState(null);
    const [showOriginal, setShowOriginal] = useState(false);
    // Holds the AbortController of an in-flight translation stream so
    // closing the modal mid-stream tears the upstream request down
    // (no more tokens wasted after the admin walks away).
    const translateAbortRef = useRef(null);

    useEffect(() => {
        if (readShowFlag()) {
            clearShowFlag();
            setOpen(true);
        }
    }, []);

    // Pull the AI availability flag once the modal opens so the
    // translate button starts in the right enabled / disabled state.
    // Only the bundled `en` text can be skipped here — but we still
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
        let buf = "";
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
                // Best-effort attempt to read a JSON error body — the
                // server only switches to SSE once it has validated the
                // request, so early failures still come back as JSON.
                let msg = `HTTP ${res.status}`;
                try {
                    const j = await res.json();
                    if (j?.error) msg = j.error;
                } catch {
                    /* ignore — keep the HTTP status */
                }
                throw new Error(msg);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            // Drain the SSE stream. Events are separated by a blank line
            // ("\n\n"); within an event each line is `<field>: <value>`.
            // We only care about `event:` (delta | done | error) and the
            // first `data:` line, which is JSON.
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });

                let sep;
                while ((sep = buf.indexOf("\n\n")) !== -1) {
                    const frame = buf.slice(0, sep);
                    buf = buf.slice(sep + 2);
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

    // On-demand opener: any module can dispatch the OPEN_EVENT to
    // pop the modal (currently the "View changelog" link in the
    // admin panel). Kept as a custom event so we don't have to lift
    // open-state up into App.jsx for one button.
    useEffect(() => {
        const handler = () => setOpen(true);
        window.addEventListener(OPEN_EVENT, handler);
        return () => window.removeEventListener(OPEN_EVENT, handler);
    }, []);

    // Lock body scroll while the changelog is open so the underlying
    // admin panel can't drift behind a fullscreen modal on mobile.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    // Translated markdown is compiled on the fly; the original is
    // pre-compiled once at module load. The "Show original" toggle
    // flips between the two without re-parsing the source.
    const translatedHtml = useMemo(
        () => (translatedRaw ? compileMarkdown(translatedRaw) : ""),
        [translatedRaw],
    );
    const displayHtml =
        translatedRaw && !showOriginal ? translatedHtml : compiledChangelog;

    if (!open) return null;

    const currentVersion =
        typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;

    return (
        <div
            // Mobile: edge-to-edge backdrop with no padding so the
            // modal card stretches to the full viewport. Desktop: keep
            // the classic dimmed-backdrop look with a 1 rem gutter
            // around the centered card.
            className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="changelog-modal-title"
            onClick={() => setOpen(false)}
        >
            {/* Scoped typography for the rendered markdown so the modal
                does not have to depend on a global prose stylesheet. */}
            <style>{`
                .gk-changelog h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 1rem; }
                .gk-changelog h1:first-child { margin-top: 0; }
                .gk-changelog h2 {
                    font-size: 1.15rem; font-weight: 600;
                    margin: 1.5rem 0 0.5rem;
                    padding-bottom: 0.25rem;
                    border-bottom: 1px solid var(--border-light);
                    color: rgb(79 70 229);
                }
                :is(.dark) .gk-changelog h2 { color: rgb(165 180 252); }
                .gk-changelog h3 {
                    font-size: 0.95rem; font-weight: 600;
                    margin: 1rem 0 0.25rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    opacity: 0.85;
                }
                .gk-changelog ul, .gk-changelog ol { padding-left: 1.5rem; margin: 0.5rem 0; }
                .gk-changelog ul { list-style: disc; }
                .gk-changelog ol { list-style: decimal; }
                .gk-changelog li { margin: 0.2rem 0; line-height: 1.55; }
                .gk-changelog p { margin: 0.5rem 0; line-height: 1.55; }
                .gk-changelog code {
                    font-family: ui-monospace, monospace;
                    background: rgba(0,0,0,0.06);
                    padding: 0.1rem 0.35rem;
                    border-radius: 0.3rem;
                    font-size: 0.85em;
                }
                :is(.dark) .gk-changelog code { background: rgba(255,255,255,0.08); }
                .gk-changelog pre {
                    background: rgba(0,0,0,0.05);
                    padding: 0.75rem 1rem;
                    border-radius: 0.5rem;
                    overflow-x: auto;
                    margin: 0.5rem 0;
                }
                :is(.dark) .gk-changelog pre { background: rgba(255,255,255,0.04); }
                .gk-changelog pre code { background: transparent; padding: 0; }
                .gk-changelog a {
                    color: rgb(79 70 229);
                    text-decoration: underline;
                    text-underline-offset: 2px;
                }
                :is(.dark) .gk-changelog a { color: rgb(129 140 248); }
                .gk-changelog hr {
                    border: 0;
                    border-top: 1px solid var(--border-light);
                    margin: 1rem 0;
                }
                .gk-changelog blockquote {
                    border-left: 3px solid var(--border-light);
                    padding-left: 1rem;
                    margin: 0.5rem 0;
                    opacity: 0.85;
                }
                .gk-changelog strong { font-weight: 600; }
                /* Avoid horizontal scrollbars on narrow phones — long
                   code spans / URLs / tokens used to push the viewport
                   wider than its container and create a horizontal
                   scrollbar inside the modal. Wrap-anywhere keeps the
                   prose body contained; <pre> blocks keep their own
                   x-scroll because wrapping arbitrary code would harm
                   readability. */
                .gk-changelog,
                .gk-changelog p,
                .gk-changelog li,
                .gk-changelog code { overflow-wrap: anywhere; word-break: break-word; }
                .gk-changelog pre { white-space: pre-wrap; word-break: break-word; }
            `}</style>
            <div
                // On mobile we go full-screen (the X in the top-right
                // is the close affordance). The 85vh + rounded-2xl
                // look only kicks in from sm: upwards where there's
                // viewport to spare around the card.
                className="w-full h-full sm:h-[85vh] max-w-none sm:max-w-2xl rounded-none sm:rounded-2xl border-0 sm:border border-[var(--border-light)] bg-white dark:bg-[var(--bg-elevated,#1a1a1f)] shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    // Mobile fullscreen layout sits edge-to-edge so the
                    // Android status bar overlaps the header — push the
                    // header's content below the safe-area inset. On
                    // desktop, --safe-top is 0 so the resolved padding
                    // matches the original py-3 exactly.
                    className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border-light)] bg-white/60 dark:bg-white/5"
                    style={{ paddingTop: "calc(var(--safe-top) + 0.75rem)" }}
                >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                            <TI.Sparkles className="tabler-icon w-5 h-5" />
                        </span>
                        <div className="min-w-0">
                            <h2
                                id="changelog-modal-title"
                                className="text-base font-semibold text-gray-900 dark:text-gray-50 leading-tight"
                            >
                                {t("changelogModalTitle")}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t("changelogModalSubtitle")}
                            </p>
                        </div>
                    </div>
                    {currentVersion && (
                        <span className="shrink-0 px-2 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 tabular-nums">
                            v{currentVersion}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label={t("changelogModalClose")}
                        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-500 hover:text-gray-800 hover:bg-black/5 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-white/10"
                    >
                        <TI.X className="tabler-icon w-5 h-5" />
                    </button>
                </div>
                {/* AI translation toolbar. The button is always rendered
                    so the feature is discoverable; it just sits disabled
                    when the user has no working AI config. After a
                    successful translation, a secondary toggle lets the
                    user flip back to the original English source. */}
                <div className="flex items-center flex-wrap gap-2 px-5 py-2 border-b border-[var(--border-light)] bg-white/40 dark:bg-white/5">
                    {/* Wrapper carries data-tooltip so the global
                        TooltipPortal can show a hint even when the
                        button itself is disabled (browsers swallow
                        pointer events on disabled buttons, so the
                        attribute would not fire on the button alone). */}
                    <span
                        data-tooltip={
                            !aiAvailable
                                ? t("changelogTranslateUnavailable")
                                : undefined
                        }
                    >
                        <button
                            type="button"
                            onClick={onTranslate}
                            disabled={!aiAvailable || translating}
                            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <TI.Sparkles
                                className={`tabler-icon w-4 h-4 ${translating ? "animate-spin" : ""}`}
                            />
                            {translating
                                ? t("changelogTranslateInProgress")
                                : t("changelogTranslateButton")}
                        </button>
                    </span>
                    {translatedRaw && !translating && (
                        <button
                            type="button"
                            onClick={() => setShowOriginal((v) => !v)}
                            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-white/10 border border-[var(--border-light)] hover:bg-gray-100 dark:hover:bg-white/15"
                        >
                            {showOriginal
                                ? t("changelogShowTranslated")
                                : t("changelogShowOriginal")}
                        </button>
                    )}
                    {translateError && (
                        <span className="text-xs text-red-600 dark:text-red-300">
                            {t("changelogTranslateFailed")}
                        </span>
                    )}
                </div>
                <div
                    className="gk-changelog flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-5 text-sm text-gray-800 dark:text-gray-100"
                    dangerouslySetInnerHTML={{ __html: displayHtml }}
                    onClick={(e) => {
                        // Markdown anchors are sanitised into real <a>
                        // tags by DOMPurify, but their default action
                        // navigates the WebView/SPA and the catch-all
                        // server route returns index.html — so a click
                        // on ./PASSKEYS.md sends the user back home.
                        // Intercept here, resolve relative paths against
                        // the GitHub blob root, and hand the URL to the
                        // system browser (native bridge in the APK,
                        // window.open in a regular browser).
                        const a = e.target.closest && e.target.closest("a");
                        if (!a) return;
                        const href = a.getAttribute("href");
                        if (!href || href.startsWith("#")) return;
                        e.preventDefault();
                        openExternalUrl(resolveChangelogHref(href));
                    }}
                />
            </div>
        </div>
    );
}
