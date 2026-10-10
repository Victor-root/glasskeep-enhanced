import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { t } from "../i18n";
import { normalizeImageFilename, downloadDataUrl } from "../utils/files.js";
import { formatEditedStamp } from "../utils/dates.js";
import { attachPlainTextCodeCopy } from "../utils/plainTextCodeCopy.js";
import { attachReadModeInlineCopy } from "../components/richtext/extensions/inlineCodeCopy.js";
import { attachStickyCopyButton } from "../utils/codeCopySticky.js";

/**
 * useModalState — Pure UI state and effects for the note modal.
 *
 * Owns: modal visibility, modal field state, derived values, tag helpers,
 * image viewer, keyboard handlers, scroll/resize effects, code copy buttons.
 *
 * Does NOT own: any IDB calls, sync/lease/enqueue logic, autosave effects,
 * openModal, closeModal, saveModal, deleteModal, or any sync-coupled refs
 * (initialModalStateRef, committedBaselineRef, prevItemsRef, prevDrawingRef, etc.).
 */
export default function useModalState({ notes, currentUser, closeModalRef }) {
  // ─── Modal state ───
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const activeIdRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const [mType, setMType] = useState("text");
  const [mTitle, setMTitle] = useState("");
  const [mBody, setMBody] = useState("");
  const [mTagList, setMTagList] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [modalTagFocused, setModalTagFocused] = useState(false);
  const modalTagInputRef = useRef(null);
  const modalTagBtnRef = useRef(null);
  const suppressTagBlurRef = useRef(false);
  const [mColor, setMColor] = useState("default");
  const [viewMode, setViewMode] = useState(true);
  const [mImages, setMImages] = useState([]);
  const [savingModal, setSavingModal] = useState(false);
  const mBodyRef = useRef(null);
  const modalFileRef = useRef(null);
  // Separate hidden file input for the note icon (logo badge) — keeps
  // the OS picker semantics independent from the regular images flow.
  const modalIconFileRef = useRef(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const modalClosingTimerRef = useRef(null);
  const [mItems, setMItems] = useState([]);
  const [mDrawingData, setMDrawingData] = useState({ paths: [], dimensions: null });

  // Modal formatting
  const [showModalFmt, setShowModalFmt] = useState(false);
  const modalFmtBtnRef = useRef(null);

  // Modal color popover
  const modalColorBtnRef = useRef(null);
  const [showModalColorPop, setShowModalColorPop] = useState(false);

  // Modal footer kebab menu
  const [modalKebabOpen, setModalKebabOpen] = useState(false);
  // Modal footer image menu, and the logo picker it leads to
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  // Image Viewer state (fullscreen)
  const [imgViewOpen, setImgViewOpen] = useState(false);
  const [imgViewIndex, setImgViewIndex] = useState(0);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const mobileNavTimer = useRef(null);
  const resetMobileNav = () => {
    setMobileNavVisible(true);
    clearTimeout(mobileNavTimer.current);
    mobileNavTimer.current = setTimeout(() => setMobileNavVisible(false), 3000);
  };

  // Scrim click tracking to avoid closing when drag starts inside modal
  const scrimClickStartRef = useRef(false);

  // For code copy buttons in view mode
  const noteViewRef = useRef(null);

  // Modal scroll container ref + state
  const modalScrollRef = useRef(null);
  const [modalScrollable, setModalScrollable] = useState(false);
  const savedModalScrollRatioRef = useRef(0);



  // ─── Derived values ───
  const activeNoteObj = useMemo(
    () => notes.find((x) => String(x.id) === String(activeId)),
    [notes, activeId],
  );
  const editedStamp = useMemo(() => {
    const ts = activeNoteObj?.updated_at || activeNoteObj?.timestamp;
    const baseStamp = ts ? formatEditedStamp(ts) : "";

    // Add collaborator info if available
    if (activeNoteObj?.lastEditedBy && activeNoteObj?.lastEditedAt) {
      const editorName = activeNoteObj.lastEditedBy;
      const editTime = formatEditedStamp(activeNoteObj.lastEditedAt);
      return `${editorName}, ${editTime}`;
    }

    return baseStamp;
  }, [activeNoteObj]);

  const modalHasChanges = useMemo(() => {
    if (!activeNoteObj) return false;
    // Saved titles are trimmed: trailing spaces being typed are not a change.
    if ((mTitle || "").trim() !== (activeNoteObj.title || "")) return true;
    if ((mColor || "default") !== (activeNoteObj.color || "default"))
      return true;
    const tagsA = JSON.stringify(mTagList || []);
    const tagsB = JSON.stringify(activeNoteObj.tags || []);
    if (tagsA !== tagsB) return true;
    const imagesA = JSON.stringify(mImages || []);
    const imagesB = JSON.stringify(activeNoteObj.images || []);
    if (imagesA !== imagesB) return true;
    if ((mType || "text") !== (activeNoteObj.type || "text")) return true;
    if ((mType || "text") === "text") {
      if ((mBody || "") !== (activeNoteObj.content || "")) return true;
    } else {
      const itemsA = JSON.stringify(mItems || []);
      const itemsB = JSON.stringify(activeNoteObj.items || []);
      if (itemsA !== itemsB) return true;
    }
    return false;
  }, [activeNoteObj, mTitle, mColor, mTagList, mImages, mType, mBody, mItems]);

  // ─── Modal tag helpers ───
  const addTags = (raw) => {
    const parts = String(raw)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setMTagList((prev) => {
      const set = new Set(prev.map((x) => x.toLowerCase()));
      const merged = [...prev];
      for (const p of parts)
        if (!set.has(p.toLowerCase())) {
          merged.push(p);
          set.add(p.toLowerCase());
        }
      return merged;
    });
  };
  const handleTagKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (tagInput.trim()) {
        addTags(tagInput);
        setTagInput("");
      }
    } else if (e.key === "Backspace" && !tagInput) {
      setMTagList((prev) => prev.slice(0, -1));
    }
  };
  const handleTagBlur = () => {
    if (tagInput.trim()) {
      addTags(tagInput);
      setTagInput("");
    }
  };
  const handleTagPaste = (e) => {
    const text = e.clipboardData?.getData("text");
    if (text && text.includes(",")) {
      e.preventDefault();
      addTags(text);
    }
  };

  // ─── Image viewer helpers ───
  const openImageViewer = (index) => {
    setImgViewIndex(index);
    setImgViewOpen(true);
    resetMobileNav();
  };
  const closeImageViewer = () => setImgViewOpen(false);
  // Cycle only across content images — the optional note icon lives
  // in mImages too (with role:"icon") but is never shown in the
  // viewer, so its index must stay out of the modulo math.
  const contentImagesLength = () =>
    mImages.filter((im) => im && im.role !== "icon").length;
  const nextImage = () => setImgViewIndex((i) => {
    const len = contentImagesLength();
    return len ? (i + 1) % len : 0;
  });
  const prevImage = () => setImgViewIndex((i) => {
    const len = contentImagesLength();
    return len ? (i - 1 + len) % len : 0;
  });

  // ─── Modal link handler ───
  const onModalBodyClick = (e) => {
    if (!viewMode) return;

    const a = e.target.closest("a");
    if (a) {
      const href = a.getAttribute("href") || "";
      if (/^(mailto:|tel:)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = href;
        return;
      }
      if (/^https?:/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
    }
    // NO automatic edit-mode toggle
  };

  // ─── isCollaborativeNote ───
  const isCollaborativeNote = useCallback(
    (noteId) => {
      if (!noteId) return false;
      const note = notes.find((n) => String(n.id) === String(noteId));
      if (!note) return false;
      const hasCollaborators =
        Array.isArray(note.collaborators) && note.collaborators.length > 0;
      const isOwnedByOther =
        note.user_id && currentUser && note.user_id !== currentUser.id;
      return hasCollaborators || isOwnedByOther;
    },
    [notes, currentUser],
  );

  // ─── Auto-resize modal textarea with debouncing ───
  const resizeTimeoutRef = useRef(null);
  const resizeModalTextarea = useCallback(() => {
    const el = mBodyRef.current;
    if (!el) return;

    // Clear previous timeout
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    // Debounce the resize to prevent excessive updates
    resizeTimeoutRef.current = setTimeout(() => {
      const modalScrollEl = modalScrollRef.current;

      // Save scroll position before collapsing textarea height
      const savedScrollTop = modalScrollEl ? modalScrollEl.scrollTop : 0;

      const MIN = 160;
      el.style.height = "0px";
      el.style.height = Math.max(el.scrollHeight, MIN) + "px";

      requestAnimationFrame(() => {
        if (!modalScrollEl) return;
        // Mode-switch ratio takes priority, otherwise restore pre-resize position
        const ratio = savedModalScrollRatioRef.current;
        if (ratio > 0) {
          const maxScroll = modalScrollEl.scrollHeight - modalScrollEl.clientHeight;
          modalScrollEl.scrollTop = ratio * maxScroll;
          savedModalScrollRatioRef.current = 0;
        } else {
          modalScrollEl.scrollTop = savedScrollTop;
        }
      });
    }, 10); // Small delay to batch rapid changes
  }, []);

  // ─── UI Effects ───

  // Lock body scroll on modal & image viewer (compensate scrollbar width to prevent layout shift)
  useEffect(() => {
    if (!open && !imgViewOpen) return;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open, imgViewOpen]);

  // Close image viewer if modal closes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the image viewer is also opened and closed on its own; this only reacts to the modal closing
    if (!open) setImgViewOpen(false);
  }, [open]);

  // Keyboard nav for image viewer (content images only — the note icon
  // is excluded so arrow-keys never land on a hidden entry).
  useEffect(() => {
    if (!imgViewOpen) return;
    const onKey = (e) => {
      const content = mImages.filter((im) => im && im.role !== "icon");
      if (e.key === "Escape") setImgViewOpen(false);
      if (e.key.toLowerCase() === "d") {
        const im = content[imgViewIndex];
        if (im) {
          const fname = normalizeImageFilename(
            im.name,
            im.src,
            imgViewIndex + 1,
          );
          downloadDataUrl(fname, im.src);
        }
      }
      if (e.key === "ArrowRight" && content.length > 1) {
        setImgViewIndex((i) => (i + 1) % content.length);
      }
      if (e.key === "ArrowLeft" && content.length > 1) {
        setImgViewIndex((i) => (i - 1 + content.length) % content.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [imgViewOpen, mImages, imgViewIndex]);

  // Close note modal with Escape key (uses ref to avoid circular dep with closeModal)
  useEffect(() => {
    if (activeId == null) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !imgViewOpen) closeModalRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeId, imgViewOpen, closeModalRef]);

  // Note: Android back button (popstate) for the modal is handled centrally by useOverlayBackStack

  // Auto-resize modal textarea effect
  useEffect(() => {
    if (!open || mType !== "text") return;
    if (!viewMode) resizeModalTextarea();
  }, [open, viewMode, mBody, mType, resizeModalTextarea]);

  // Restore scroll ratio when switching edit→view (no textarea resize in this direction)
  useEffect(() => {
    if (!viewMode) return; // view→edit is handled inside resizeModalTextarea
    const el = modalScrollRef.current;
    const ratio = savedModalScrollRatioRef.current;
    if (!el || ratio === 0) return;
    requestAnimationFrame(() => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll > 0) el.scrollTop = ratio * maxScroll;
      savedModalScrollRatioRef.current = 0;
    });
  }, [viewMode]);

  // Ensure modal formatting menu hides when switching to view mode or non-text
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the menu is toggled by the user; this only forces it closed when it no longer applies
    if (viewMode || mType !== "text") setShowModalFmt(false);
  }, [viewMode, mType]);

  // Detect if modal body is scrollable to decide Edited stamp placement
  useEffect(() => {
    if (!open) return;
    const el = modalScrollRef.current;
    if (!el) return;

    const check = () => {
      // +1 fudge factor to avoid off-by-one on some browsers
      setModalScrollable(el.scrollHeight > el.clientHeight + 1);
    };
    check();

    // React to container size changes and window resizes
    let ro;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(check);
      ro.observe(el);
    }
    window.addEventListener("resize", check);

    // Also recheck shortly after (images rendering, fonts, etc.)
    const t1 = setTimeout(check, 50);
    const t2 = setTimeout(check, 200);

    return () => {
      window.removeEventListener("resize", check);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
  }, [open, mBody, mTitle, mItems.length, mImages.length, viewMode, mType]);

  /** Add copy buttons to code (view mode, text notes) */
  useEffect(() => {
    if (!(open && viewMode && mType === "text")) return;
    const root = noteViewRef.current;
    if (!root) return;

    const attach = () => {
      // Wrap code blocks so the copy button can stay fixed even on horizontal scroll
      root.querySelectorAll("pre").forEach((pre) => {
        // Ensure wrapper
        let wrapper = pre.closest(".code-block-wrapper");
        if (!wrapper) {
          wrapper = document.createElement("div");
          wrapper.className = "code-block-wrapper";
          pre.parentNode?.insertBefore(wrapper, pre);
          wrapper.appendChild(pre);
        }
        if (wrapper.querySelector(".code-copy-btn")) return;
        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.textContent = t("copy");
        btn.setAttribute("data-copy-btn", "1");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const codeEl = pre.querySelector("code");
          const text = codeEl ? codeEl.textContent : pre.textContent;
          navigator.clipboard?.writeText(text || "");
          btn.textContent = t("copied");
          setTimeout(() => (btn.textContent = t("copy")), 1200);
        });
        wrapper.appendChild(btn);

        // Keep the copy button visible when a tall code block scrolls past
        // the modal header. attachStickyCopyButton does this without
        // layout-thrashing (rAF coalescing + skips off-screen blocks), so a
        // note with many code blocks no longer janks on scroll.
        attachStickyCopyButton(wrapper.closest(".modal-scroll-themed"), wrapper, btn);
      });

      // Inline code: handled by the shared floating overlay (see
      // attachReadModeInlineCopy below). No per-element sibling button
      // is inserted, so hover (desktop) / tap-to-arm (mobile) behavior
      // matches edit-mode 1:1 — same singleton, same 2 s visibility
      // timer, same theming.
    };

    attach();
    // Ensure buttons after layout/async renders
    requestAnimationFrame(attach);
    const t1 = setTimeout(attach, 50);
    const t2 = setTimeout(attach, 200);

    // Observe DOM changes while in view mode
    const mo = new MutationObserver(() => attach());
    try {
      mo.observe(root, { childList: true, subtree: true });
    } catch { /* root not observable: timed attach() calls still run */ }

    // Force plain-text clipboard payload when the user selects inside
    // a <pre>/<code>. The dedicated copy button already does the right
    // thing — this catches manual Ctrl+C / OS long-press copy from a
    // selection that the in-block button doesn't drive.
    const detachCodeCopy = attachPlainTextCodeCopy(root);
    // Wire the same inline-code hover / tap-to-arm overlay the editor
    // uses, scoped to the rendered container. Behavior parity with
    // edit-mode is automatic — both surfaces drive the same singleton.
    const detachInlineCopy = attachReadModeInlineCopy(root);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      mo.disconnect();
      detachCodeCopy();
      detachInlineCopy();
    };
  }, [open, viewMode, mType, mBody, activeId]);

  return {
    // State + setters
    open, setOpen,
    activeId, setActiveId,
    activeIdRef,
    mType, setMType,
    mTitle, setMTitle,
    mBody, setMBody,
    mTagList, setMTagList,
    tagInput, setTagInput,
    modalTagFocused, setModalTagFocused,
    mColor, setMColor,
    viewMode, setViewMode,
    mImages, setMImages,
    savingModal, setSavingModal,
    confirmDeleteOpen, setConfirmDeleteOpen,
    isModalClosing, setIsModalClosing,
    modalClosingTimerRef,
    mItems, setMItems,
    mDrawingData, setMDrawingData,
    showModalFmt, setShowModalFmt,
    showModalColorPop, setShowModalColorPop,
    modalKebabOpen, setModalKebabOpen,
    imageMenuOpen, setImageMenuOpen,
    logoPickerOpen, setLogoPickerOpen,
    imgViewOpen, setImgViewOpen, imgViewIndex,
    mobileNavVisible,
    modalScrollable,
    // Refs
    modalTagInputRef,
    modalTagBtnRef,
    suppressTagBlurRef,
    mBodyRef,
    modalFileRef,
    modalIconFileRef,
    modalFmtBtnRef,
    modalColorBtnRef,
    scrimClickStartRef,
    noteViewRef,
    modalScrollRef,
    savedModalScrollRatioRef,
    // Derived
    activeNoteObj,
    editedStamp,
    modalHasChanges,
    // Tag helpers
    addTags,
    handleTagKeyDown,
    handleTagBlur,
    handleTagPaste,
    // Image viewer
    openImageViewer,
    closeImageViewer,
    nextImage,
    prevImage,
    resetMobileNav,
    // Handlers
    onModalBodyClick,
    isCollaborativeNote,
  };
}
