import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { t } from "../i18n";
import { formatEditedStamp, normalizeImageFilename, downloadDataUrl } from "../utils/helpers.js";

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
export default function useModalState({ notes, currentUser, closeModalRef, runFormat }) {
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
  const [modalMenuOpen, setModalMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const modalClosingTimerRef = useRef(null);
  const [mItems, setMItems] = useState([]);
  const [mInput, setMInput] = useState("");
  const [mDrawingData, setMDrawingData] = useState({ paths: [], dimensions: null });

  // Modal formatting
  const [showModalFmt, setShowModalFmt] = useState(false);
  const modalFmtBtnRef = useRef(null);

  // Modal color popover
  const modalColorBtnRef = useRef(null);
  const [showModalColorPop, setShowModalColorPop] = useState(false);

  // Modal footer kebab menu
  const [modalKebabOpen, setModalKebabOpen] = useState(false);

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

  // Checklist item drag (for modal reordering)
  const checklistDragId = useRef(null);

  // Modal kebab anchor
  const modalMenuBtnRef = useRef(null);

  // Scrim click tracking to avoid closing when drag starts inside modal
  const scrimClickStartRef = useRef(false);

  // For code copy buttons in view mode
  const noteViewRef = useRef(null);

  // Modal scroll container ref + state
  const modalScrollRef = useRef(null);
  const [modalScrollable, setModalScrollable] = useState(false);
  const savedModalScrollRatioRef = useRef(0);

  // Track if we pushed a history entry for the modal (Android back button support)
  const modalHistoryRef = useRef(false);



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
    if ((mTitle || "") !== (activeNoteObj.title || "")) return true;
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
  const nextImage = () => setImgViewIndex((i) => (i + 1) % mImages.length);
  const prevImage = () =>
    setImgViewIndex((i) => (i - 1 + mImages.length) % mImages.length);

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
        note.collaborators !== undefined && note.collaborators !== null;
      const isOwnedByOther =
        note.user_id && currentUser && note.user_id !== currentUser.id;
      return hasCollaborators || isOwnedByOther;
    },
    [notes, currentUser],
  );

  // ─── formatModal ───
  const formatModal = useCallback(
    (type) => runFormat(() => mBody, setMBody, mBodyRef, type),
    [mBody, runFormat],
  );

  // ─── Auto-resize modal textarea with debouncing ───
  const resizeModalTextarea = useMemo(() => {
    let timeoutId = null;
    return () => {
      const el = mBodyRef.current;
      if (!el) return;

      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Debounce the resize to prevent excessive updates
      timeoutId = setTimeout(() => {
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
    };
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
    if (!open) setImgViewOpen(false);
  }, [open]);

  // Keyboard nav for image viewer
  useEffect(() => {
    if (!imgViewOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setImgViewOpen(false);
      if (e.key.toLowerCase() === "d") {
        const im = mImages[imgViewIndex];
        if (im) {
          const fname = normalizeImageFilename(
            im.name,
            im.src,
            imgViewIndex + 1,
          );
          downloadDataUrl(fname, im.src);
        }
      }
      if (e.key === "ArrowRight" && mImages.length > 1) {
        setImgViewIndex((i) => (i + 1) % mImages.length);
      }
      if (e.key === "ArrowLeft" && mImages.length > 1) {
        setImgViewIndex((i) => (i - 1 + mImages.length) % mImages.length);
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
  }, [activeId, imgViewOpen]);

  // Note: Android back button (popstate) for the modal is handled centrally in App.jsx

  // Auto-resize modal textarea effect
  useEffect(() => {
    if (!open || mType !== "text") return;
    if (!viewMode) resizeModalTextarea();
  }, [open, viewMode, mBody, mType]);

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

        // Keep copy button visible when code block top scrolls past the modal header
        const scrollEl = wrapper.closest(".modal-scroll-themed");
        if (scrollEl) {
          const stickyHeader = scrollEl.querySelector(".sticky");
          const adjustPos = () => {
            const headerBottom = stickyHeader
              ? stickyHeader.getBoundingClientRect().bottom
              : scrollEl.getBoundingClientRect().top;
            const wrapperTop = wrapper.getBoundingClientRect().top;
            const offset = headerBottom - wrapperTop;
            if (offset > 8) {
              const maxTop = wrapper.offsetHeight - btn.offsetHeight - 8;
              btn.style.top = Math.min(offset + 8, maxTop) + "px";
            } else {
              btn.style.top = "8px";
            }
          };
          scrollEl.addEventListener("scroll", adjustPos, { passive: true });
        }
      });

      // Inline code
      root.querySelectorAll("code").forEach((code) => {
        if (code.closest("pre")) return; // skip fenced
        if (
          code.nextSibling &&
          code.nextSibling.nodeType === 1 &&
          code.nextSibling.classList?.contains("inline-code-copy-btn")
        )
          return;
        const btn = document.createElement("button");
        btn.className = "inline-code-copy-btn";
        btn.textContent = t("copy");
        btn.setAttribute("data-copy-btn", "1");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(code.textContent || "");
          btn.textContent = t("copied");
          setTimeout(() => (btn.textContent = t("copy")), 1200);
        });
        code.insertAdjacentElement("afterend", btn);
      });
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
    } catch (e) {}

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      mo.disconnect();
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
    modalMenuOpen, setModalMenuOpen,
    confirmDeleteOpen, setConfirmDeleteOpen,
    isModalClosing, setIsModalClosing,
    modalClosingTimerRef,
    mItems, setMItems,
    mInput, setMInput,
    mDrawingData, setMDrawingData,
    showModalFmt, setShowModalFmt,
    showModalColorPop, setShowModalColorPop,
    modalKebabOpen, setModalKebabOpen,
    imgViewOpen, setImgViewOpen, imgViewIndex,
    mobileNavVisible,
    modalScrollable,
    // Refs
    modalTagInputRef,
    modalTagBtnRef,
    suppressTagBlurRef,
    mBodyRef,
    modalFileRef,
    modalFmtBtnRef,
    modalColorBtnRef,
    checklistDragId,
    modalMenuBtnRef,
    scrimClickStartRef,
    noteViewRef,
    modalScrollRef,
    savedModalScrollRatioRef,
    modalHistoryRef,
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
    formatModal,
    resizeModalTextarea,
  };
}
