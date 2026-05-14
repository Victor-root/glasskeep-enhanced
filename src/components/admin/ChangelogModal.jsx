import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import changelogRaw from "../../../CHANGELOG.md?raw";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

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

// Compile the markdown once at module load — it is identical for every
// render and parsing 5 KB of changelog on every mount would be silly.
const compiledChangelog = (() => {
    try {
        const html = marked.parse(String(changelogRaw || ""), {
            breaks: false,
            gfm: true,
        });
        return DOMPurify.sanitize(html);
    } catch {
        return "";
    }
})();

export default function ChangelogModal() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (readShowFlag()) {
            clearShowFlag();
            setOpen(true);
        }
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

    const html = useMemo(() => compiledChangelog, []);

    if (!open) return null;

    const currentVersion =
        typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;

    return (
        <div
            className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
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
            `}</style>
            <div
                className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-[var(--border-light)] bg-white dark:bg-[var(--bg-elevated,#1a1a1f)] shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border-light)] bg-white/60 dark:bg-white/5">
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
                <div
                    className="gk-changelog overflow-y-auto px-6 py-5 text-sm text-gray-800 dark:text-gray-100"
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            </div>
        </div>
    );
}
