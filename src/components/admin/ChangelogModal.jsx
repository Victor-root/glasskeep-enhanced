import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { installStyleGuard } from "../../utils/safeStyle.js";
import changelogRaw from "../../../CHANGELOG.md?raw";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { resolveChangelogHref, openExternalUrl } from "./changelogLinks.js";
import useChangelogTranslation from "./useChangelogTranslation.js";
import ChangelogStarCta from "./ChangelogStarCta.jsx";
import { readStarDismissed, dismissStarCta } from "./changelogFlags.js";

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

// One filter for every sanitizing path in the app. See safeStyle.js.
installStyleGuard(DOMPurify);

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

// Controlled component: `open` / `onClose` are owned by App.jsx so the
// modal can be registered with the central Android-back-button stack
// (overlayOpenCount + popstate handler). The localStorage "show after
// update" flag and the OPEN_EVENT custom-event listener have been
// hoisted to App.jsx alongside.
export default function ChangelogModal({ open, onClose }) {
    const {
        aiAvailable,
        translating,
        translatedRaw,
        translateError,
        showOriginal,
        setShowOriginal,
        onTranslate,
    } = useChangelogTranslation(open);
    // Whether the user has permanently dismissed the GitHub star footer.
    const [starDismissed, setStarDismissed] = useState(readStarDismissed);

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
            onClick={() => onClose?.()}
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
                        onClick={() => onClose?.()}
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
                {!starDismissed && (
                    <ChangelogStarCta onDismiss={() => { dismissStarCta(); setStarDismissed(true); }} />
                )}
            </div>
        </div>
    );
}
