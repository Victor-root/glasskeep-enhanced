// Changelog modal flags: the "show after update" flag set before the
// post-update reload, on-demand open requests, and the star prompt dismissal.

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

// Read-and-clear the "show after update" flag. Called by App.jsx on
// mount so the modal's open state can be lifted out of ChangelogModal
// (required for the Android back-button stack to know about it).
export function consumeChangelogShowFlag() {
    const flag = readShowFlag();
    if (flag) clearShowFlag();
    return flag;
}

// Subscribe to OPEN_EVENT requests. Returns an unsubscribe fn so
// useEffect's cleanup can detach the listener.
export function onOpenChangelogRequest(cb) {
    const handler = () => { try { cb(); } catch { /* ignore */ } };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
}

// Set once the user clicks "Already done" on the GitHub star footer, so
// the prompt is hidden for good on every future changelog view.
const STAR_DISMISS_KEY = "glass-keep-star-cta-dismissed";

export function readStarDismissed() {
    try {
        return localStorage.getItem(STAR_DISMISS_KEY) === "1";
    } catch {
        return false;
    }
}

export function dismissStarCta() {
    try {
        localStorage.setItem(STAR_DISMISS_KEY, "1");
    } catch {
        /* ignore — at worst the prompt shows once more next time */
    }
}
