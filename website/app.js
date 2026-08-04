/* GlassKeep presentation site: language, theme picker, dark mode, reveal-on-scroll.
   The six themes mirror the app's own workspace themes (src/theme/shellTheme.js);
   ids and labels are kept identical so the site and the app speak the same language. */

(function () {
  "use strict";

  var THEMES = [
    { id: "glasskeep", label: "GlassKeep", swatch: ["#6366f1", "#7c3aed", "#dce1fb"] },
    { id: "emerald",   label: "Emerald",   swatch: ["#10b981", "#0d9488", "#d2ecdf"] },
    { id: "amber",     label: "Amber",     swatch: ["#d97706", "#b45309", "#f6e3c9"] },
    { id: "rosewood",  label: "Ruby",      swatch: ["#e11d1d", "#9f1010", "#f7cccc"] },
    { id: "graphite",  label: "Graphite",  swatch: ["#64748b", "#475569", "#dde1e7"] },
    { id: "blush",     label: "Blush",     swatch: ["#ec4899", "#be185d", "#f7d4ea"] }
  ];

  var STORE_THEME = "gk-site:theme";
  var STORE_MODE = "gk-site:mode";
  var STORE_LANG = "gk-site:lang";
  var root = document.documentElement;
  var lang = "en";

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  /* ── Language ─────────────────────────────────────────────────────── */
  var DICT = window.GK_I18N || { en: {}, fr: {} };

  function t(key) {
    var table = DICT[lang] || {};
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    return (DICT.en && DICT.en[key]) || "";
  }

  // Browser preference wins on a first visit; an explicit choice is remembered.
  function detectLang() {
    var saved = read(STORE_LANG);
    if (saved === "fr" || saved === "en") return saved;

    var list = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || navigator.userLanguage || "en"];

    for (var i = 0; i < list.length; i++) {
      var code = String(list[i] || "").toLowerCase();
      if (code.indexOf("fr") === 0) return "fr";
      if (code.indexOf("en") === 0) return "en";
    }
    return "en";
  }

  function applyLang(next, persist) {
    lang = (next === "fr") ? "fr" : "en";
    root.setAttribute("lang", lang);
    if (persist) store(STORE_LANG, lang);

    // Plain text nodes.
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var value = t(nodes[i].dataset.i18n);
      if (value) nodes[i].textContent = value;
    }

    // Markup-bearing strings (headings with <br> and gradient spans).
    var rich = document.querySelectorAll("[data-i18n-html]");
    for (var j = 0; j < rich.length; j++) {
      var html = t(rich[j].dataset.i18nHtml);
      if (html) rich[j].innerHTML = html;
    }

    // Attributes, declared as "attr:key" pairs separated by ";".
    var attrs = document.querySelectorAll("[data-i18n-attr]");
    for (var k = 0; k < attrs.length; k++) {
      var pairs = attrs[k].dataset.i18nAttr.split(";");
      for (var p = 0; p < pairs.length; p++) {
        var bits = pairs[p].split(":");
        if (bits.length !== 2) continue;
        var text = t(bits[1]);
        if (text) attrs[k].setAttribute(bits[0], text);
      }
    }

    document.title = t("meta.title");
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("meta.desc"));

    var label = document.getElementById("langCurrent");
    if (label) label.textContent = lang.toUpperCase();

    refreshSwatchLabels();
  }

  function initLang() {
    applyLang(detectLang(), false);
    var toggle = document.getElementById("langToggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        applyLang(lang === "fr" ? "en" : "fr", true);
      });
    }
  }

  /* ── Theme picker ─────────────────────────────────────────────────── */
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  function buildSwatches() {
    var grid = document.getElementById("swatchGrid");
    if (!grid) return;

    THEMES.forEach(function (theme) {
      var btn = document.createElement("button");
      btn.className = "swatch";
      btn.type = "button";
      btn.dataset.theme = theme.id;
      btn.style.setProperty("--sw-primary", theme.swatch[0]);
      btn.style.setProperty("--sw-secondary", theme.swatch[1]);
      btn.style.setProperty("--sw-surface", theme.swatch[2]);
      btn.innerHTML =
        '<span class="swatch-top"><span class="swatch-pill"></span></span>' +
        '<span class="swatch-name">' + theme.label +
        '<span class="swatch-check">' + CHECK + "</span></span>";
      btn.addEventListener("click", function () { setTheme(theme.id); });
      grid.appendChild(btn);
    });
    refreshSwatchLabels();
  }

  // Theme names stay in English (they are product names, same as in the app);
  // only the accessible label around them is translated.
  function refreshSwatchLabels() {
    var buttons = document.querySelectorAll(".swatch");
    for (var i = 0; i < buttons.length; i++) {
      var id = buttons[i].dataset.theme;
      var theme = null;
      for (var j = 0; j < THEMES.length; j++) {
        if (THEMES[j].id === id) { theme = THEMES[j]; break; }
      }
      if (!theme) continue;
      var prefix = lang === "fr" ? "Utiliser le thème " : "Use the ";
      var suffix = lang === "fr" ? "" : " theme";
      buttons[i].setAttribute("aria-label", prefix + theme.label + suffix);
    }
  }

  function setTheme(id) {
    var known = THEMES.some(function (t) { return t.id === id; });
    var theme = known ? id : "glasskeep";
    root.setAttribute("data-theme", theme);
    store(STORE_THEME, theme);

    var buttons = document.querySelectorAll(".swatch");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("active", buttons[i].dataset.theme === theme);
    }
    syncMetaThemeColor();
  }

  /* Keep the mobile browser chrome in step with the active palette. */
  function syncMetaThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var accent = getComputedStyle(root).getPropertyValue("--primary").trim();
    if (accent) meta.setAttribute("content", accent);
  }

  /* ── Dark mode ────────────────────────────────────────────────────── */
  var SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>';
  var MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';

  function paintMode(mode) {
    root.setAttribute("data-mode", mode);
    var icon = document.getElementById("modeIcon");
    if (icon) icon.innerHTML = mode === "dark" ? MOON : SUN;
    syncMetaThemeColor();
    // refreshLightboxMode is declared further down but hoisted (function
    // declaration), and is a no-op when the lightbox isn't open.
    refreshLightboxMode();
  }

  function initMode() {
    var query = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
    var saved = read(STORE_MODE);
    var explicit = (saved === "dark" || saved === "light");

    paintMode(explicit ? saved : (query && query.matches ? "dark" : "light"));

    // With no explicit choice, keep following the OS live: flipping the system
    // theme repaints the page immediately, no reload needed.
    if (query) {
      var onSystemChange = function (event) {
        if (read(STORE_MODE)) return; // user took control
        paintMode(event.matches ? "dark" : "light");
      };
      if (query.addEventListener) query.addEventListener("change", onSystemChange);
      else if (query.addListener) query.addListener(onSystemChange);
    }

    var toggle = document.getElementById("modeToggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = root.getAttribute("data-mode") === "dark" ? "light" : "dark";
        paintMode(next);
        store(STORE_MODE, next);
      });
    }
  }

  /* ── Reveal on scroll ─────────────────────────────────────────────── */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add("in");
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, index) {
        if (!entry.isIntersecting) return;
        // Small stagger so a row of cards cascades instead of popping at once.
        var delay = Math.min(index * 70, 280);
        setTimeout(function () { entry.target.classList.add("in"); }, delay);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });

    for (var j = 0; j < items.length; j++) observer.observe(items[j]);
  }

  /* ── Nav: shadow on scroll, plus auto-hide on phones ──────────────── */
  // Headroom pattern: scrolling down retracts the bar, the first upward
  // scroll brings it straight back. Phones only, so the desktop bar stays
  // put; the matching .nav-hidden rule lives in the 640px media query.
  var HIDE_MAX_WIDTH = 640;  // phones only, matches the CSS breakpoint
  var HIDE_AFTER = 140;      // px scrolled before hiding is allowed at all
  var DELTA_MIN = 6;         // ignore jitter and sub-pixel scroll noise

  function initNav() {
    var nav = document.getElementById("nav");
    if (!nav) return;
    var lastY = window.scrollY || 0;
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY || 0;
      if (y < 0) y = 0; // iOS rubber-band overscroll

      nav.classList.toggle("scrolled", y > 20);

      if (window.innerWidth > HIDE_MAX_WIDTH) {
        nav.classList.remove("nav-hidden");
        lastY = y;
        return;
      }

      // Always visible near the top, whichever way we got there.
      if (y <= HIDE_AFTER) {
        nav.classList.remove("nav-hidden");
        lastY = y;
        return;
      }

      var delta = y - lastY;
      if (Math.abs(delta) < DELTA_MIN) return; // too small to be intent
      nav.classList.toggle("nav-hidden", delta > 0);
      lastY = y;
    }

    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });

    // Rotating to a wider layout mid-scroll must not strand the bar off-screen.
    window.addEventListener("resize", function () {
      if (window.innerWidth > HIDE_MAX_WIDTH) nav.classList.remove("nav-hidden");
    }, { passive: true });
  }

  /* ── Copy buttons ─────────────────────────────────────────────────── */
  function initCopy() {
    var buttons = document.querySelectorAll(".copy-btn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var btn = this;
        var text = btn.dataset.copy || "";
        var done = function () {
          btn.textContent = t("copied");
          setTimeout(function () { btn.textContent = t("copy"); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { /* denied */ });
        } else {
          var ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
          document.body.removeChild(ta);
        }
      });
    }
  }

  /* ── Screenshot lightbox ──────────────────────────────────────────── */
  // Opens each .shot-media at near-fullscreen with a FLIP transform: the
  // lightbox image is laid out at its final centred size first (plain CSS),
  // then a `transform` is computed and applied with no transition so it
  // LOOKS like it's still sitting at the clicked thumbnail's rect, and that
  // transform is cleared on the next frame: the browser animates the
  // difference as a single composited transform (smooth, GPU-only, no
  // layout thrashing). Closing runs the same transform in reverse.
  var gallery = [];        // [{ media, }] in DOM order
  var lbIndex = -1;
  var lbOpenerMedia = null;
  var lbSwitchTimer = null;
  var lbCloseTimer = null;

  var lb, lbImg, lbBackdrop, lbCaption, lbCount, lbClose, lbPrev, lbNext;

  function activeImg(media) {
    var wantDark = root.getAttribute("data-mode") === "dark";
    var sel = wantDark ? ".shot-dark" : ".shot-light";
    return media.querySelector(sel) || media.querySelector("img");
  }

  // Classic "object-fit: contain" math, capped at 1x so UI screenshots never
  // render past their native resolution (upscaling would soften text/lines).
  function containFit(natW, natH, maxW, maxH) {
    var ratio = Math.min(maxW / natW, maxH / natH, 1);
    return { w: natW * ratio, h: natH * ratio };
  }

  function layoutFinalBox(img) {
    var maxW = window.innerWidth * 0.94;
    var maxH = window.innerHeight * 0.88;
    var natW = img.naturalWidth || img.width || 1;
    var natH = img.naturalHeight || img.height || 1;
    var size = containFit(natW, natH, maxW, maxH);
    return {
      w: size.w,
      h: size.h,
      left: (window.innerWidth - size.w) / 2,
      top: (window.innerHeight - size.h) / 2
    };
  }

  function applyBox(box) {
    lbImg.style.width = box.w + "px";
    lbImg.style.height = box.h + "px";
    lbImg.style.left = box.left + "px";
    lbImg.style.top = box.top + "px";
  }

  // Computes the transform that would make the (already final-positioned)
  // lightbox image visually overlap `rect` instead.
  function flipTransformTo(box, rect) {
    var scaleX = rect.width / box.w;
    var scaleY = rect.height / box.h;
    var dx = rect.left + rect.width / 2 - (box.left + box.w / 2);
    var dy = rect.top + rect.height / 2 - (box.top + box.h / 2);
    return "translate(" + dx + "px, " + dy + "px) scale(" + scaleX + ", " + scaleY + ")";
  }

  function updateMeta() {
    var media = gallery[lbIndex];
    if (!media) return;
    var img = activeImg(media);
    lbCaption.textContent = img.getAttribute("alt") || "";
    lbCount.textContent = (lbIndex + 1) + " / " + gallery.length;
  }

  function showAt(index, opts) {
    var animate = !opts || opts.animate !== false;
    lbIndex = (index + gallery.length) % gallery.length;
    var img = activeImg(gallery[lbIndex]);

    var finish = function () {
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.getAttribute("alt") || "";
      applyBox(layoutFinalBox(img));
      updateMeta();
      if (animate) {
        // rAF so the src/box change above paints before the fade-in starts.
        requestAnimationFrame(function () {
          lbImg.style.opacity = "1";
          lbSwitchTimer = setTimeout(function () {
            lbImg.classList.remove("is-switching");
          }, 240);
        });
      }
    };

    if (animate) {
      lbImg.classList.add("is-switching");
      lbImg.style.opacity = "0";
      clearTimeout(lbSwitchTimer);
      lbSwitchTimer = setTimeout(finish, 200);
    } else {
      finish();
    }
  }

  function open(index, media) {
    if (!lb || lbIndex !== -1) return;
    lbOpenerMedia = media;
    var openerImg = activeImg(media);
    var rect = openerImg.getBoundingClientRect();

    lb.classList.toggle("single-item", gallery.length <= 1);
    lb.classList.add("is-open");
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    showAt(index, { animate: false });

    // Start the lightbox image pinned exactly over the clicked thumbnail...
    var box = layoutFinalBox(activeImg(gallery[lbIndex]));
    lbImg.style.transition = "none";
    lbImg.style.transform = flipTransformTo(box, rect);
    lbImg.style.opacity = "1";
    var _reflow = lbImg.offsetWidth; // force layout: commits the line above as the start state
    // One rAF is the standard FLIP recipe (the synchronous reflow above is
    // what actually guarantees the "start" state got painted; the callback
    // just needs to land on the frame after that, not several frames after).
    requestAnimationFrame(function () {
      // ...then let it animate to its natural (transform: none) position:
      // the CSS `transition: transform …` on .lightbox-img takes it from
      // here, growing it from the thumbnail into the centred final box.
      lbImg.style.transition = "";
      lbImg.style.transform = "none";
      lb.classList.add("is-visible");
    });

    document.addEventListener("keydown", onKeydown);
    lbClose.focus();
  }

  function close() {
    if (lbIndex === -1) return;
    var media = gallery[lbIndex] || lbOpenerMedia;
    var img = activeImg(media);
    var rect = img.getBoundingClientRect();
    var box = { w: parseFloat(lbImg.style.width), h: parseFloat(lbImg.style.height),
                left: parseFloat(lbImg.style.left), top: parseFloat(lbImg.style.top) };

    lb.classList.remove("is-visible");
    lbImg.style.transform = flipTransformTo(box, rect);

    var opener = lbOpenerMedia;
    // `{once:true}` alone isn't enough: if the safety timeout fires FIRST
    // (observed for real: closing the very first thumbnail sometimes never
    // dispatches a transform transitionend at all, so `done` used to run
    // only via the timeout), the listener stays armed and silently fires on
    // some LATER, unrelated transition, e.g. the next open()'s FLIP, which
    // then yanked a freshly-opened image closed out from under the user.
    // The guard + explicit removal below make whichever path runs first
    // cancel the other, so the listener can never fire twice.
    var finished = false;
    var done = function () {
      if (finished) return;
      finished = true;
      clearTimeout(lbCloseTimer);
      lbImg.removeEventListener("transitionend", done);
      lb.classList.remove("is-open", "single-item");
      lb.setAttribute("aria-hidden", "true");
      lbImg.removeAttribute("style");
      lbImg.src = "";
      lbIndex = -1;
      lbOpenerMedia = null;
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeydown);
      if (opener) opener.focus();
    };
    clearTimeout(lbCloseTimer);
    lbImg.addEventListener("transitionend", done);
    lbCloseTimer = setTimeout(done, 500); // safety net if transitionend never fires
  }

  // Keeps Tab from leaving a dialog that visually covers the whole page.
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    // offsetParent is unusable here: it's always null for position:fixed
    // elements (which every .lightbox-btn is), regardless of visibility.
    // getClientRects().length is the standard "is this actually rendered"
    // check and doesn't have that false-negative.
    var focusables = Array.prototype.filter.call(
      lb.querySelectorAll("button"),
      function (el) { return el.getClientRects().length > 0; }
    );
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") showAt(lbIndex - 1);
    else if (e.key === "ArrowRight") showAt(lbIndex + 1);
    else if (e.key === "Tab") trapFocus(e);
  }

  // Mode toggle while the lightbox is open: swap instantly, same rule as the
  // inline thumbnails (no cross-fade, see the .shot-media CSS comment).
  function refreshLightboxMode() {
    if (lbIndex === -1 || !lbImg) return;
    var img = activeImg(gallery[lbIndex]);
    lbImg.src = img.currentSrc || img.src;
  }

  function initLightbox() {
    lb = document.getElementById("lightbox");
    if (!lb) return;
    lbImg = document.getElementById("lightboxImg");
    lbBackdrop = document.getElementById("lightboxBackdrop");
    lbCaption = document.getElementById("lightboxCaption");
    lbCount = document.getElementById("lightboxCount");
    lbClose = document.getElementById("lightboxClose");
    lbPrev = document.getElementById("lightboxPrev");
    lbNext = document.getElementById("lightboxNext");

    gallery = Array.prototype.slice.call(document.querySelectorAll(".shot-media"));
    gallery.forEach(function (media, index) {
      media.setAttribute("role", "button");
      media.setAttribute("tabindex", "0");
      media.addEventListener("click", function () { open(index, media); });
      media.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(index, media); }
      });
    });

    lbBackdrop.addEventListener("click", close);
    lbClose.addEventListener("click", close);
    lbPrev.addEventListener("click", function () { showAt(lbIndex - 1); });
    lbNext.addEventListener("click", function () { showAt(lbIndex + 1); });

    window.addEventListener("resize", function () {
      if (lbIndex === -1) return;
      applyBox(layoutFinalBox(activeImg(gallery[lbIndex])));
    });
  }

  /* ── Boot ─────────────────────────────────────────────────────────── */
  buildSwatches();
  setTheme(read(STORE_THEME) || "glasskeep");
  initLang();
  initMode();
  initNav();
  initReveal();
  initCopy();
  initLightbox();

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
