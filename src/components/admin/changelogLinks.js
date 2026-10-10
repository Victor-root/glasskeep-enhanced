// How the changelog's links open: relative paths resolve against the
// repository on GitHub, and every link leaves the app for the browser.

// Where relative changelog links (e.g. `./PASSKEYS.md`) live online.
// The changelog is markdown checked into the repo, so any in-repo
// reference makes sense once resolved against the GitHub view URL.
const REPO_BLOB_BASE =
    "https://github.com/Victor-root/glasskeep-enhanced/blob/main/";

export function resolveChangelogHref(href) {
    if (!href) return null;
    // Already absolute (http(s):, mailto:, tel:, etc.): pass through.
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

export function openExternalUrl(url) {
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
    } catch { /* ignore: fall through to window.open */ }
    try { window.open(url, "_blank", "noopener,noreferrer"); }
    catch { /* nothing else we can do */ }
}
