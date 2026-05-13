import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Masonry from "react-masonry-css";
import { t } from "../../i18n";
import TvNoteCard from "./TvNoteCard.jsx";
import TvNoteDetail from "./TvNoteDetail.jsx";
import TvSidebar from "./TvSidebar.jsx";
import useSpatialFocus from "./useSpatialFocus.js";
import { getContentImages } from "../../utils/noteIcon.js";
import { Menu, LayoutGrid, Rows3, Sun, Moon, ChevronLeft, ChevronRight } from "lucide-react";

// TV-mode "home" screen.
//
// Two layouts:
//   - "grid": real Pinterest-style masonry (react-masonry-css). Cards
//     keep their natural height and stack without horizontal gaps,
//     exactly like the phone and desktop views.
//   - "carousel": single row, horizontal scroll-snap. Cards are roughly
//     twice the grid size; 2-3 fit on screen and you flick between them.
//
// Sidebar is closed by default. Both preferences persisted in
// localStorage so the user lands on the same view next time.

const STORAGE_VIEW = "tv-view-mode";
const STORAGE_SIDEBAR = "tv-sidebar";
const STORAGE_THEME = "tv-theme";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useViewportWidth() {
  const [w, setW] = useState(() => window.innerWidth || 1280);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth || 1280);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

function sortNotes(list) {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const at = a.updated_at || a.created_at || "";
    const bt = b.updated_at || b.created_at || "";
    return bt.localeCompare(at);
  });
}

function partitionNotes(notes, filter) {
  const list = notes.filter((n) => {
    if (!n) return false;
    if (n.archived || n.trashed) return false;
    if (!filter || filter.type === "all") return true;
    if (filter.type === "images") return getContentImages(n.images).length > 0;
    if (filter.type === "tag") return Array.isArray(n.tags) && n.tags.includes(filter.value);
    return true;
  });
  return sortNotes(list);
}

function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// Column count from viewport width — independent of sidebar state so
// toggling the rail doesn't force the masonry to re-bucket every card
// (the root cause of the 3-4s freeze on older Shields). With ~7 cols
// at 1080p, each card still gets a comfortable ~220-260px regardless
// of whether the sidebar is open.
function pickColumnCount(width) {
  if (width < 700) return 2;
  if (width < 950) return 3;
  if (width < 1200) return 4;
  if (width < 1500) return 5;
  if (width < 1800) return 6;
  return 7;
}

const PAGER_PAGE_SIZE = 2;

// Two-cards-at-a-time pager.
// Arrows are PURELY DECORATIVE (no click target, no focus): the user
// pages by pressing Right at the last card of the current page or Left
// at the first one. The intercept handler lives in TvNotesViewer
// because the page state is lifted up (so the header can show the
// indicator).
function TvPager({ slice, hasPrev, hasNext, onActivate }) {
  return (
    <div className="tv-pager">
      <div className="tv-pager__arrow tv-pager__arrow--decorative" aria-hidden="true">
        {hasPrev && <ChevronLeft size={36} />}
      </div>
      <div className="tv-pager__page">
        {slice.map((n) => (
          <TvNoteCard key={n.id} note={n} variant="carousel" onActivate={onActivate} />
        ))}
        {/* Fill any empty slot on the last page so the grid stays 2-column. */}
        {slice.length < PAGER_PAGE_SIZE && Array.from({ length: PAGER_PAGE_SIZE - slice.length }).map((_, i) => (
          <div key={`pad-${i}`} aria-hidden="true" />
        ))}
      </div>
      <div className="tv-pager__arrow tv-pager__arrow--decorative" aria-hidden="true">
        {hasNext && <ChevronRight size={36} />}
      </div>
    </div>
  );
}

function HeaderUserChip({ currentUser }) {
  const initial = (currentUser?.name?.[0] || currentUser?.email?.[0] || "?").toUpperCase();
  const label = currentUser?.name || currentUser?.email || "";
  return (
    <span className="tv-header__user" aria-label={label}>
      <span className="tv-header__avatar">
        {currentUser?.avatar_url
          ? <img src={currentUser.avatar_url} alt="" />
          : <span>{initial}</span>}
      </span>
      <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </span>
  );
}

export default function TvNotesViewer({
  notes,
  currentUser,
  onSignOut,
  onExitTvMode,
}) {
  const [filter, setFilter] = useState({ type: "all" });
  const [openNote, setOpenNote] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(() => loadPref(STORAGE_SIDEBAR, "closed") === "open");
  // Remember the *preference* (= the state set by the hamburger button)
  // separately from the *current* state. Left-edge reveal toggles the
  // current state but never updates the preference, so closing via
  // right-edge only kicks in when the user prefers the sidebar hidden.
  const sidebarPrefHiddenRef = useRef(loadPref(STORAGE_SIDEBAR, "closed") !== "open");
  const [viewMode, setViewMode] = useState(() => loadPref(STORAGE_VIEW, "grid") === "carousel" ? "carousel" : "grid");
  const [theme, setTheme] = useState(() => loadPref(STORAGE_THEME, "dark") === "light" ? "light" : "dark");
  // Carousel/pager page state lives here so the header can show the
  // "X / N" indicator and the keydown interceptor can paginate.
  const [pagerPage, setPagerPage] = useState(0);
  const clock = useClock();
  const width = useViewportWidth();
  const detailHistoryRef = useRef(null);

  // NOTE: do NOT auto-persist sidebarVisible. The preference is only
  // updated when the user explicitly toggles the hamburger (or the
  // remote MENU key). Auto-revealing the rail by D-pad-left shouldn't
  // change the stored default.
  useEffect(() => { savePref(STORAGE_VIEW, viewMode); }, [viewMode]);

  // Reflect the theme on <html> so all CSS rules under
  // html[data-tv-theme="..."] flip atomically.
  useEffect(() => {
    savePref(STORAGE_THEME, theme);
    if (theme === "light") document.documentElement.setAttribute("data-tv-theme", "light");
    else document.documentElement.removeAttribute("data-tv-theme");
    return () => document.documentElement.removeAttribute("data-tv-theme");
  }, [theme]);

  const visible = useMemo(() => partitionNotes(notes, filter), [notes, filter]);
  const colCount = useMemo(() => pickColumnCount(width), [width]);

  // Pager derived state. Clamp the page index when the visible list
  // shrinks (filter changed, notes deleted from another device).
  const pagerTotalPages = Math.max(1, Math.ceil(visible.length / PAGER_PAGE_SIZE));
  useEffect(() => {
    if (pagerPage >= pagerTotalPages) setPagerPage(Math.max(0, pagerTotalPages - 1));
  }, [pagerPage, pagerTotalPages]);
  useEffect(() => { setPagerPage(0); }, [filter]); // reset on filter change
  const pagerSlice = useMemo(() => {
    if (viewMode !== "carousel") return [];
    const start = pagerPage * PAGER_PAGE_SIZE;
    return visible.slice(start, start + PAGER_PAGE_SIZE);
  }, [viewMode, visible, pagerPage]);

  // D-pad page intercept. Runs in capture phase so we win the race
  // against useSpatialFocus (which is bound on document in bubble
  // phase). Activated only when focus is on a pager card.
  useEffect(() => {
    if (viewMode !== "carousel") return undefined;
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const active = document.activeElement;
      if (!active?.closest?.(".tv-pager__page")) return;
      const pageEl = active.closest(".tv-pager__page");
      const cards = Array.from(pageEl.querySelectorAll("[data-note-id]"));
      const idx = cards.indexOf(active);
      if (idx < 0) return;

      if (e.key === "ArrowRight" && idx === cards.length - 1) {
        if (pagerPage < pagerTotalPages - 1) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setPagerPage((p) => Math.min(pagerTotalPages - 1, p + 1));
          requestAnimationFrame(() => {
            const first = document.querySelector(".tv-pager__page [data-note-id]");
            if (first instanceof HTMLElement) {
              window.dispatchEvent(new CustomEvent("tv-focus", { detail: { target: first } }));
            }
          });
        }
      } else if (e.key === "ArrowLeft" && idx === 0) {
        if (pagerPage > 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setPagerPage((p) => Math.max(0, p - 1));
          requestAnimationFrame(() => {
            const els = document.querySelectorAll(".tv-pager__page [data-note-id]");
            const target = els[els.length - 1];
            if (target instanceof HTMLElement) {
              window.dispatchEvent(new CustomEvent("tv-focus", { detail: { target } }));
            }
          });
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [viewMode, pagerPage, pagerTotalPages]);

  // Remember the card the user activated so we can drop focus back on
  // it when the detail closes — otherwise the focus loop snaps to the
  // first focusable on screen (the hamburger) and the user has to
  // re-navigate down to where they were.
  const lastFocusedNoteIdRef = useRef(null);
  const closeDetail = useCallback(() => setOpenNote(null), []);
  const openDetail = useCallback((note) => {
    lastFocusedNoteIdRef.current = note.id;
    setOpenNote(note);
  }, []);

  // Detail viewer just closed — refocus the originating card. We wait
  // a frame so the masonry/carousel layer is mounted again before we
  // try to grab a ref to it.
  useEffect(() => {
    if (openNote) return undefined;
    const id = lastFocusedNoteIdRef.current;
    if (!id) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-note-id="${CSS.escape(id)}"]`);
      if (el instanceof HTMLElement) {
        window.dispatchEvent(new CustomEvent("tv-focus", { detail: { target: el } }));
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [openNote]);

  // Back key: push a history marker on detail-open, listen popstate.
  useEffect(() => {
    if (!openNote) {
      detailHistoryRef.current = null;
      return undefined;
    }
    const marker = { tvDetail: openNote.id, ts: Date.now() };
    window.history.pushState(marker, "");
    detailHistoryRef.current = marker;
    const onPop = () => {
      detailHistoryRef.current = null;
      setOpenNote(null);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (detailHistoryRef.current && window.history.state?.tvDetail === marker.tvDetail) {
        window.history.back();
      }
      detailHistoryRef.current = null;
    };
  }, [openNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openNote) return;
    const stillThere = notes.find((n) => n.id === openNote.id);
    if (!stillThere || stillThere.archived || stillThere.trashed) closeDetail();
    else if (stillThere !== openNote) setOpenNote(stillThere);
  }, [notes, openNote, closeDetail]);

  useSpatialFocus({
    enabled: true,
    onBack: () => {
      if (openNote) { closeDetail(); return; }
      if (sidebarVisible) setSidebarVisible(false);
    },
    onEdgeReached: (direction, anchor) => {
      // Left at the leftmost card → pop the rail open.
      if (direction === "left" && !anchor?.closest?.(".tv-sidebar") && !sidebarVisible) {
        revealSidebarFromEdge();
      }
    },
    onZoneChange: (from, to, dir) => {
      // Right from sidebar to main: useSpatialFocus already moved the
      // focus onto the first card. Close the rail iff the preference
      // is hidden — otherwise keep it pinned.
      if (from === "sidebar" && to === "main" && dir === "right" && sidebarPrefHiddenRef.current) {
        setSidebarVisible(false);
      }
    },
  });

  // Hamburger / MENU-key toggle updates BOTH the current state and
  // the stored preference (so the next launch lands on the user's
  // last explicit choice), and re-parks the focus on the side the
  // user is now on: opening the rail focuses its first item, closing
  // it drops focus on the first card.
  const toggleSidebar = useCallback(() => {
    setSidebarVisible((v) => {
      const next = !v;
      savePref(STORAGE_SIDEBAR, next ? "open" : "closed");
      sidebarPrefHiddenRef.current = !next;
      requestAnimationFrame(() => {
        const target = next
          ? document.querySelector(".tv-sidebar .tv-focusable")
          : document.querySelector("[data-note-id]");
        if (target instanceof HTMLElement) {
          window.dispatchEvent(new CustomEvent("tv-focus", { detail: { target } }));
        }
      });
      return next;
    });
  }, []);

  // Left-edge: reveal the sidebar (without touching the preference)
  // and drop focus on its first focusable so the user can browse it.
  const revealSidebarFromEdge = useCallback(() => {
    setSidebarVisible(true);
    requestAnimationFrame(() => {
      const first = document.querySelector(".tv-sidebar .tv-focusable");
      if (first instanceof HTMLElement) {
        window.dispatchEvent(new CustomEvent("tv-focus", { detail: { target: first } }));
      }
    });
  }, []);

  // Right-edge close-on-leave is handled by the onZoneChange callback
  // (see useSpatialFocus call below) — useSpatialFocus already focuses
  // the first card on the way out, so we just need to flip the rail.
  const toggleView = useCallback(() => setViewMode((v) => v === "grid" ? "carousel" : "grid"), []);
  const toggleTheme = useCallback(() => setTheme((t) => t === "dark" ? "light" : "dark"), []);

  // The Android wrapper forwards KEYCODE_MENU (the "options" / "kebab"
  // key on most TV remotes — the same one Android TV uses to open the
  // settings rail in its home launcher) as a custom 'tv-menu-key'
  // window event. Wire it to the sidebar so the user gets the same
  // muscle memory as system apps.
  useEffect(() => {
    const onMenuKey = () => toggleSidebar();
    window.addEventListener("tv-menu-key", onMenuKey);
    return () => window.removeEventListener("tv-menu-key", onMenuKey);
  }, [toggleSidebar]);

  const timeStr = clock.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const dateStr = clock.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const filterLabel = (() => {
    if (!filter || filter.type === "all") return t("allNotes") || "All notes";
    if (filter.type === "images") return t("image") || "Images";
    if (filter.type === "tag") return `#${filter.value}`;
    return "";
  })();

  return (
    <div className="tv-screen">
      <header className="tv-header">
        <button
          type="button"
          className="tv-header__hamburger tv-focusable tv-focusable--flat"
          aria-label={t("toggleSidebar") || "Toggle sidebar"}
          onClick={toggleSidebar}
        >
          <Menu size={18} />
        </button>
        <button
          type="button"
          className="tv-header__viewtoggle tv-focusable tv-focusable--flat"
          aria-label={t("toggleView") || "Toggle view"}
          onClick={toggleView}
        >
          {viewMode === "grid" ? <Rows3 size={18} /> : <LayoutGrid size={18} />}
        </button>
        <button
          type="button"
          className="tv-header__themetoggle tv-focusable tv-focusable--flat"
          aria-label={t("toggleTheme") || "Toggle theme"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="tv-header__title-wrap">
          <div className="tv-header__title">GlassKeep</div>
          <div className="tv-header__subtitle">{dateStr} · {timeStr}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {viewMode === "carousel" && pagerTotalPages > 1 && (
            <span className="tv-header__count" aria-label="Pager page">
              {pagerPage + 1} / {pagerTotalPages}
            </span>
          )}
          <span className="tv-header__count">{filterLabel} · {visible.length}</span>
          <HeaderUserChip currentUser={currentUser} />
        </div>
      </header>

      <div className={`tv-layout${sidebarVisible ? "" : " tv-layout--sidebar-hidden"}`}>
        <TvSidebar
          notes={notes}
          filter={filter}
          onSelectFilter={(next) => {
            setFilter(next);
            closeDetail();
          }}
          onExit={onExitTvMode}
          onSignOut={onSignOut}
        />

        <main className={`tv-notes-scroll${viewMode === "carousel" ? " tv-notes-scroll--pager" : ""}`} aria-label={filterLabel}>
          {visible.length === 0 ? (
            <div className="tv-empty">
              <div className="tv-empty__title">{t("noNotesYet") || "No notes yet"}</div>
              <div className="tv-empty__hint">
                {t("tvEmptyHint") ||
                  "Once you create notes from your phone or the web app they'll show up here, ready to read on the big screen."}
              </div>
            </div>
          ) : viewMode === "carousel" ? (
            <TvPager
              slice={pagerSlice}
              hasPrev={pagerPage > 0}
              hasNext={pagerPage < pagerTotalPages - 1}
              onActivate={openDetail}
            />
          ) : (
            <Masonry
              breakpointCols={colCount}
              className="tv-masonry"
              columnClassName="tv-masonry__col"
            >
              {visible.map((n) => (
                <TvNoteCard key={n.id} note={n} variant="grid" onActivate={openDetail} />
              ))}
            </Masonry>
          )}
        </main>
      </div>

      {openNote && <TvNoteDetail note={openNote} onClose={closeDetail} />}
    </div>
  );
}
