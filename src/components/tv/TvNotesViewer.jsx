import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Masonry from "react-masonry-css";
import { t } from "../../i18n";
import TvNoteCard from "./TvNoteCard.jsx";
import TvNoteDetail from "./TvNoteDetail.jsx";
import TvSidebar from "./TvSidebar.jsx";
import useSpatialFocus from "./useSpatialFocus.js";
import { getContentImages } from "../../utils/noteIcon.js";
import { Menu, LayoutGrid, Rows3 } from "lucide-react";

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

// Column count depends on available width (sidebar open vs closed
// matters here — we feed sidebarVisible into the calc).
function pickColumnCount(width, sidebarOpen) {
  const usable = sidebarOpen ? width - 260 : width - 60;
  if (usable < 700) return 2;
  if (usable < 1100) return 3;
  if (usable < 1500) return 4;
  if (usable < 1900) return 5;
  return 6;
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
  const [viewMode, setViewMode] = useState(() => loadPref(STORAGE_VIEW, "grid") === "carousel" ? "carousel" : "grid");
  const clock = useClock();
  const width = useViewportWidth();
  const detailHistoryRef = useRef(null);

  useEffect(() => { savePref(STORAGE_SIDEBAR, sidebarVisible ? "open" : "closed"); }, [sidebarVisible]);
  useEffect(() => { savePref(STORAGE_VIEW, viewMode); }, [viewMode]);

  const visible = useMemo(() => partitionNotes(notes, filter), [notes, filter]);
  const colCount = useMemo(() => pickColumnCount(width, sidebarVisible), [width, sidebarVisible]);

  const closeDetail = useCallback(() => setOpenNote(null), []);
  const openDetail = useCallback((note) => setOpenNote(note), []);

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
  });

  const toggleSidebar = useCallback(() => setSidebarVisible((v) => !v), []);
  const toggleView = useCallback(() => setViewMode((v) => v === "grid" ? "carousel" : "grid"), []);

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
        <div className="tv-header__title-wrap">
          <div className="tv-header__title">GlassKeep</div>
          <div className="tv-header__subtitle">{dateStr} · {timeStr}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
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

        <main className="tv-notes-scroll" aria-label={filterLabel}>
          {visible.length === 0 ? (
            <div className="tv-empty">
              <div className="tv-empty__title">{t("noNotesYet") || "No notes yet"}</div>
              <div className="tv-empty__hint">
                {t("tvEmptyHint") ||
                  "Once you create notes from your phone or the web app they'll show up here, ready to read on the big screen."}
              </div>
            </div>
          ) : viewMode === "carousel" ? (
            <div className="tv-carousel">
              {visible.map((n) => (
                <TvNoteCard key={n.id} note={n} variant="carousel" onActivate={openDetail} />
              ))}
            </div>
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
