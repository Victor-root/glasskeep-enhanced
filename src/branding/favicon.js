import { makeSquarePngIcon } from "../utils/images.js";

// The custom logo replaces the favicon. We capture the page's original
// icon links once so clearing the custom logo restores the bundled
// favicons exactly.
const ICON_SELECTOR = 'link[rel~="icon"], link[rel="apple-touch-icon"]';
const FAVICON_KEY = "gk:favicon";
let originalIconLinksHTML = null;

function getOriginalIconLinksHTML() {
  if (originalIconLinksHTML !== null) return originalIconLinksHTML;
  // Prefer the snapshot the index.html boot script took BEFORE it may
  // have swapped in a cached custom logo: that's the only place the
  // bundled defaults still exist verbatim. Fall back to the live DOM
  // when the boot script didn't run (e.g. SSR/tests).
  if (typeof window !== "undefined" && typeof window.__GK_DEFAULT_ICONS__ === "string") {
    originalIconLinksHTML = window.__GK_DEFAULT_ICONS__;
  } else {
    originalIconLinksHTML = Array.from(document.head.querySelectorAll(ICON_SELECTOR))
      .map((l) => l.outerHTML)
      .join("");
  }
  return originalIconLinksHTML;
}

function setIconLinks(href) {
  const head = document.head;
  head.querySelectorAll(ICON_SELECTOR).forEach((l) => l.remove());
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = href;
  head.appendChild(icon);
  const apple = document.createElement("link");
  apple.rel = "apple-touch-icon";
  apple.href = href;
  head.appendChild(apple);
}

export async function applyFavicon(logo) {
  const head = document.head;
  const originals = getOriginalIconLinksHTML();
  if (!logo) {
    head.querySelectorAll(ICON_SELECTOR).forEach((l) => l.remove());
    if (originals) head.insertAdjacentHTML("beforeend", originals);
    try { localStorage.removeItem(FAVICON_KEY); } catch { /* ignore */ }
    return;
  }
  let favicon = logo;
  // Browsers force a favicon into a square slot, so a non-square logo gets
  // flattened: draw it "contain"-fitted onto a square transparent canvas
  // first, keeping its aspect ratio in the tab.
  try { favicon = await makeSquarePngIcon(logo, 128, null, 0); } catch { /* fall back to raw */ }
  setIconLinks(favicon);
  // Cache the square favicon so the index.html boot script can apply it
  // (already square) on the next load without recomputing.
  try { localStorage.setItem(FAVICON_KEY, favicon); } catch { /* quota */ }
}
