import React, { memo } from "react";
import { t } from "../../i18n";

const NoteViewContent = memo(function NoteViewContent({ html, noteViewRef }) {
  return (
    <div
      ref={noteViewRef}
      className="note-content note-content--dense"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}, (prev, next) => prev.html === next.html);
import DrawingCanvas from "../../DrawingCanvas";
import ModalHeader from "./ModalHeader.jsx";
import ModalFooter from "./ModalFooter.jsx";
import NoteAiChatPanel from "../notes/NoteAiChatPanel.jsx";
import ModalImagesGrid from "./ModalImagesGrid.jsx";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog.jsx";
import CollaborationModal from "./CollaborationModal.jsx";
import FullscreenImageViewer from "./FullscreenImageViewer.jsx";
import OfflineCollabBanner from "./OfflineCollabBanner.jsx";
import ChecklistEditor from "../checklist/ChecklistEditor.jsx";
import useModalHistory from "../../hooks/useModalHistory.js";
import { getContentImages } from "../../utils/noteIcon.js";
import { renderSafeMarkdown, linkifyContactsHTML } from "../../utils/markdown.jsx";
import RichTextEditor from "../richtext/RichTextEditor.jsx";
import { contentToHTML, serializeRichContent, isRichContent } from "../../utils/richText.js";
import { modalBgFor, scrollColorsFor, solid, bgFor, toHex } from "../../utils/colors.js";
import { setThemeColor } from "../../utils/helpers.js";

export default function NoteModal({
  // visibility / animation
  open,
  isModalClosing,
  // split / side-by-side mode — when true, the outer scrim is suppressed
  // so a parent shell can host two NoteModal panels side-by-side under
  // a single shared scrim. The panel positions itself via flex inside
  // that shell instead of fixed-position fullscreen layout.
  splitMode,
  splitSide,    // "left" | "right" | undefined
  splitClosing, // pane-close animation flag (slide+fade out, sibling recenters)
  // theme & layout
  dark,
  windowWidth,
  isLandscapeMobile,
  isWebView,
  edgeToEdgeLandscape,
  // modal state
  activeId,
  mType,
  mTitle,
  setMTitle,
  mBody,
  setMBody,
  mColor,
  setMColor,
  viewMode,
  setViewMode,
  mImages,
  setMImages,
  mItems,
  setMItems,
  mInput,
  setMInput,
  mDrawingData,
  setMDrawingData,
  mTagList,
  setMTagList,
  tagInput,
  setTagInput,
  modalTagFocused,
  setModalTagFocused,
  // refs
  modalScrollRef,
  mBodyRef,
  noteViewRef,
  modalFileRef,
  modalIconFileRef,
  modalMenuBtnRef,
  modalFmtBtnRef,
  modalTagInputRef,
  modalTagBtnRef,
  suppressTagBlurRef,
  modalColorBtnRef,
  scrimClickStartRef,
  savedModalScrollRatioRef,
  // derived
  activeNoteObj,
  editedStamp,
  modalHasChanges,
  modalScrollable,
  tagsWithCounts,
  addTags,
  handleTagKeyDown,
  handleTagBlur,
  handleTagPaste,
  // modal menu
  modalMenuOpen,
  setModalMenuOpen,
  // formatting
  showModalFmt,
  setShowModalFmt,
  formatModal,
  // color popover
  showModalColorPop,
  setShowModalColorPop,
  // kebab menu
  modalKebabOpen,
  setModalKebabOpen,
  // confirm delete
  confirmDeleteOpen,
  setConfirmDeleteOpen,
  // saving
  savingModal,
  // collaboration
  collaborationModalOpen,
  setCollaborationModalOpen,
  collaboratorUsername,
  setCollaboratorUsername,
  addModalCollaborators,
  showUserDropdown,
  setShowUserDropdown,
  filteredUsers,
  setFilteredUsers,
  loadingUsers,
  dropdownPosition,
  collaboratorInputRef,
  addCollaborator,
  removeCollaborator,
  searchUsers,
  updateDropdownPosition,
  loadCollaboratorsForAddModal,
  // image viewer
  imgViewOpen,
  imgViewIndex,
  mobileNavVisible,
  openImageViewer,
  closeImageViewer,
  nextImage,
  prevImage,
  resetMobileNav,
  // note context
  notes,
  currentUser,
  tagFilter,
  // handlers
  closeModal,
  saveModal,
  deleteModal,
  restoreFromTrash,
  handleArchiveNote,
  handleDownloadNote,
  togglePin,
  addImagesToState,
  setNoteIconFromFile,
  removeNoteIcon,
  logoLibrary,
  addLogoToLibrary,
  deleteLogoFromLibrary,
  isCollaborativeNote,
  syncState,
  onModalBodyClick,
  resizeModalTextarea,
  // checklist handlers
  syncChecklistItems,
  checklistInsertPosition,
  checklistRemoveSectionBehavior,
  editorToolbarMode,
  // note type conversion (text <-> checklist)
  onConvertNoteType,
  onDuplicateNote,
  // direct draw mode
  initialDrawMode,
  onConsumeInitialDrawMode,
  // per-note AI chat panel — owned by App, presentational here
  aiAssistantEnabled,
  noteAiOpen,
  noteAiHasBeenOpened,
  noteAiMessages,
  noteAiLoading,
  noteAiError,
  noteAiSaved,
  noteAiCanSave,
  onOpenNoteAi,
  onCloseNoteAi,
  onHideNoteAi,
  onSendNoteAiMessage,
  onStopNoteAi,
  onSaveNoteAi,
  onResetNoteAi,
}) {
  const [drawMode, setDrawMode] = React.useState("view");
  const [drawToolbarEl, setDrawToolbarEl] = React.useState(null);
  const [drawTransition, setDrawTransition] = React.useState(null); // 'entering' | 'leaving' | null
  const isDrawEdit = mType === 'draw' && drawMode === 'draw';
  const isDrawView = mType === 'draw' && drawMode !== 'draw';

  // Track draw mode transitions for animation
  const prevDrawEditRef = React.useRef(false);
  React.useEffect(() => {
    const wasDrawEdit = prevDrawEditRef.current;
    prevDrawEditRef.current = isDrawEdit;
    if (isDrawEdit && !wasDrawEdit) {
      setDrawTransition('entering');
    } else if (!isDrawEdit && wasDrawEdit) {
      setDrawTransition('leaving');
    }
  }, [isDrawEdit]);
  // Rendered HTML for view mode. Rich-format notes render through Tiptap's
  // generateHTML (also sanitized); legacy Markdown notes keep the old marked
  // pipeline so they look identical until the user edits and upgrades them.
  const viewHtml = React.useMemo(() => {
    if (isRichContent(mBody)) return linkifyContactsHTML(contentToHTML(mBody));
    return linkifyContactsHTML(renderSafeMarkdown(mBody));
  }, [mBody]);

  // Serialize a Tiptap doc from the editor back into the string shape that
  // mBody / autosave / sync expect. Centralised here so the two editor mount
  // points (text note / draw-note body) stay in lockstep.
  const handleRichDocChange = React.useCallback(
    (doc) => {
      const serialized = serializeRichContent(doc);
      setMBody(serialized);
    },
    [setMBody],
  );

  const { undo, redo, canUndo, canRedo } = useModalHistory({
    mTitle, mBody, mItems,
    setMTitle, setMBody, setMItems,
    open, activeId, mType, viewMode,
  });

  // DOM node of the slot inside ModalHeader where the rich-text toolbar is
  // portaled. Using useState-as-ref so the RichTextEditor re-renders once
  // the slot actually mounts (a useRef wouldn't trigger the re-render).
  const [toolbarSlot, setToolbarSlot] = React.useState(null);
  // Refs used for the Tab / Shift+Tab focus dance between the title
  // textarea and the rich-text editor body.
  const modalTitleInputRef = React.useRef(null);
  const richEditorRef = React.useRef(null);
  const focusModalTitle = React.useCallback(() => {
    const el = modalTitleInputRef.current;
    if (!el) return;
    el.focus();
    // Drop the caret at the end so typing continues the existing title.
    if (typeof el.value === "string") {
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch {}
    }
  }, []);
  // Mobile-only: the rich-text toolbar moves out of the sticky header
  // (which is too cramped on phone widths) and lives inside a bottom
  // sheet the user opens via the "Mise en forme" footer button. The
  // sheet's content div is registered here as a portal target.
  const [mobileToolbarSlot, setMobileToolbarSlot] = React.useState(null);
  const isDesktopLayout = windowWidth >= 768 && !isLandscapeMobile && !isWebView;
  const toolbarMount = isDesktopLayout ? toolbarSlot : mobileToolbarSlot;

  /* ── Mobile fmt-sheet swipe-to-close ──
     The grabber captures pointer events so the user can drag the
     panel down to dismiss it. We drive the gesture via the sheet's
     max-height (not transform) for two reasons:
       1. The sheet is the bottom-anchored flex child of the modal,
          so shrinking max-height moves its top edge down 1:1 with
          the finger AND lets the editor above expand into the space
          the sheet vacates — the user sees their note re-appear
          progressively while dragging.
       2. When the user lets go past threshold, we just animate the
          max-height we already have down to 0 — no transform reset
          first, so the close stays continuous (no flash where the
          sheet snaps back to full open before collapsing).
     Direct DOM mutation via a ref keeps the per-frame work off the
     React render path. */
  const fmtSheetRef = React.useRef(null);
  const fmtDragRef = React.useRef({ active: false, startY: 0, currentY: 0, baseHeight: 0 });
  const fmtCleanupTimerRef = React.useRef(null);
  const FMT_CLOSE_THRESHOLD = 60; // px

  const handleFmtGrabberDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const sheet = fmtSheetRef.current;
    if (fmtCleanupTimerRef.current) {
      clearTimeout(fmtCleanupTimerRef.current);
      fmtCleanupTimerRef.current = null;
    }
    fmtDragRef.current = {
      active: true,
      startY: e.clientY,
      currentY: 0,
      baseHeight: sheet ? sheet.getBoundingClientRect().height : 0,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    if (sheet) {
      // Disable the sheet's own transitions during the drag so
      // max-height tracks the finger 1:1.
      sheet.style.transition = "none";
    }
  };
  const handleFmtGrabberMove = (e) => {
    if (!fmtDragRef.current.active) return;
    const dy = Math.max(0, e.clientY - fmtDragRef.current.startY);
    fmtDragRef.current.currentY = dy;
    const sheet = fmtSheetRef.current;
    if (sheet) {
      const newH = Math.max(0, fmtDragRef.current.baseHeight - dy);
      sheet.style.maxHeight = `${newH}px`;
    }
  };
  const handleFmtGrabberUp = (e) => {
    if (!fmtDragRef.current.active) return;
    const dy = fmtDragRef.current.currentY;
    fmtDragRef.current.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    const sheet = fmtSheetRef.current;
    if (!sheet) return;
    // Restore the CSS transition so the next height change animates.
    sheet.style.transition = "";
    if (dy > FMT_CLOSE_THRESHOLD) {
      // Continue the close from the current dragged height down to 0
      // in one smooth motion — no snap-back to full-open in between.
      sheet.style.maxHeight = "0px";
      setShowModalFmt(false);
      // Once the close animation has finished, drop the inline
      // max-height so a future re-open returns to the CSS-defined
      // height via .is-open.
      fmtCleanupTimerRef.current = setTimeout(() => {
        fmtCleanupTimerRef.current = null;
        if (fmtSheetRef.current) fmtSheetRef.current.style.maxHeight = "";
      }, 360);
    } else {
      // Snap back: clearing the inline max-height lets the CSS rule
      // animate the sheet back to its open height.
      sheet.style.maxHeight = "";
    }
  };

  /* Suppress the mobile virtual keyboard while the formatting sheet
     is open. The user wants to long-press to select text and apply
     toolbar formatting without the keyboard popping up over the
     sheet. Setting inputmode="none" on the ProseMirror DOM element
     tells the OS not to raise the keyboard on focus; we also blur
     any active editor so an already-open keyboard dismisses. The
     attribute is restored when the sheet closes so plain typing
     works again. Desktop is unaffected. */
  React.useEffect(() => {
    if (isDesktopLayout) return undefined;
    if (!showModalFmt) return undefined;
    const editors = Array.from(
      modalScrollRef.current?.querySelectorAll(".rt-editor-content") || [],
    );
    if (!editors.length) return undefined;
    const previous = editors.map((el) => el.getAttribute("inputmode"));
    editors.forEach((el) => {
      el.setAttribute("inputmode", "none");
      if (document.activeElement === el) el.blur();
    });
    return () => {
      editors.forEach((el, i) => {
        if (previous[i] == null) el.removeAttribute("inputmode");
        else el.setAttribute("inputmode", previous[i]);
      });
    };
  }, [showModalFmt, isDesktopLayout, viewMode, mType]);

  /* Set draw mode when modal opens (reset to view, or honour initialDrawMode) */
  React.useEffect(() => {
    if (open) {
      if (initialDrawMode) {
        setDrawMode(initialDrawMode);
        if (onConsumeInitialDrawMode) onConsumeInitialDrawMode();
      } else {
        setDrawMode("view");
      }
    }
  }, [open, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sync PWA / Android status bar color with note color.
     No cleanup function — avoids the cleanup→default→effect→noteColor race
     that caused a flash on Android WebView. The default is set explicitly
     when `open` becomes false. */
  React.useEffect(() => {
    const pageColor = dark ? "#1a1a1a" : "#f0e8ff";
    if (!open) {
      window.__noteModalOpen = false;
      setThemeColor(pageColor);
      return;
    }
    window.__noteModalOpen = true;
    const color = (!mColor || mColor === "default") ? pageColor : toHex(modalBgFor(mColor, dark));
    setThemeColor(color);
  }, [open, mColor, dark]);

  /* Intercept Ctrl+Z/Y at the modal level for title-only undo.
   *
   * For the text-note body, the rich editor owns its own history and
   * keyboard shortcuts (bold/italic/strike/code/headings/lists/link/quote
   * all come from Tiptap's StarterKit keymaps). We deliberately skip those
   * here to avoid double-handling. The modal-level Ctrl+Z still works for
   * checklist/draw note title changes and anywhere outside a contenteditable.
   */
  const handleModalKeyDown = React.useCallback(
    (e) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // If the keystroke originated inside a Tiptap contenteditable we bail
      // out: the editor handles formatting and undo natively.
      const active = document.activeElement;
      if (active && active.isContentEditable) return;

      if (e.code === "KeyZ" && !shift && !alt) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.code === "KeyZ" && shift && !alt) || (e.code === "KeyY" && !shift && !alt)) {
        e.preventDefault();
        redo();
        return;
      }
    },
    [undo, redo],
  );

  // Force mobile layout when running inside Android WebView (tablets)
  const mobileLayout = windowWidth < 640 || isLandscapeMobile || isWebView;

  // Per-note AI side panel.
  //   - Desktop layout (≥1024px non-mobile): the panel sits beside the
  //     modal as a flex sibling, animating width.
  //   - Mobile / narrow layout: the panel becomes a full-screen overlay
  //     that slides in over the modal from the right.
  const noteAiSidebarLayout = !mobileLayout && windowWidth >= 1024;
  const noteAiAvailable = aiAssistantEnabled && !isDrawEdit;
  const noteAiPanelVisible = noteAiAvailable && noteAiOpen && !isModalClosing;

  // Adaptive AI-panel width — fills whatever horizontal space is left
  // over after the modal claims its full max-w-4xl (≈ 896 px) plus a
  // small gutter on each side. Capped at MODAL_WIDTH so the panel
  // never grows wider than the note itself: on very large monitors the
  // pair stays a coherent reading width and lets the page background
  // fill the unused sides. Lower bound of 360 px keeps the panel
  // usable on the tightest screens where it's still rendered.
  const SIDE_GUTTER = 16;
  const MODAL_GAP = 8;
  const MODAL_WIDTH = 896; // Tailwind max-w-4xl in px
  // Always compute the target width when AI is available — the wrapper div
  // animates between 0 and this value regardless of noteAiPanelVisible, so
  // we need a stable target even while the panel is collapsed.
  const aiPanelWidth = noteAiSidebarLayout
    ? Math.min(MODAL_WIDTH, Math.max(360, windowWidth - MODAL_WIDTH - SIDE_GUTTER * 2 - MODAL_GAP))
    : 360;

  // Mirror of the open animation — when noteAiPanelVisible flips false,
  // we keep the panel mounted briefly so the inner push-back animation
  // can play before the wrapper width collapses. The "closing" class on
  // the wrapper switches the width transition to a delayed variant so
  // the panel content gets time to slide back behind the note before
  // the wrapper starts shrinking.
  //
  // We compute `startingClose` synchronously during render (via a ref)
  // so the closing class is applied in the SAME paint where width drops
  // to 0 — otherwise the browser would apply the no-delay transition
  // first and the panel would never get to animate out.
  //
  // Skipped entirely when the whole modal is closing (isModalClosing) —
  // in that case the modal's own close animation handles the disappearance.
  const [aiClosing, setAiClosing] = React.useState(false);
  const aiCloseTimerRef = React.useRef(null);
  const prevAiVisibleRef = React.useRef(false);
  const startingAiClose =
    prevAiVisibleRef.current && !noteAiPanelVisible && !isModalClosing;
  const isAiClosing = startingAiClose || aiClosing;
  React.useEffect(() => {
    prevAiVisibleRef.current = noteAiPanelVisible;
    if (startingAiClose) {
      if (aiCloseTimerRef.current) clearTimeout(aiCloseTimerRef.current);
      setAiClosing(true);
      aiCloseTimerRef.current = setTimeout(() => {
        setAiClosing(false);
        aiCloseTimerRef.current = null;
      }, 620);
    } else if (noteAiPanelVisible && aiClosing) {
      if (aiCloseTimerRef.current) {
        clearTimeout(aiCloseTimerRef.current);
        aiCloseTimerRef.current = null;
      }
      setAiClosing(false);
    }
  }, [noteAiPanelVisible, startingAiClose, aiClosing]);
  React.useEffect(
    () => () => {
      if (aiCloseTimerRef.current) clearTimeout(aiCloseTimerRef.current);
    },
    [],
  );

  if (!open && !isModalClosing) return null;

  return (
    <>
      <div
        className={`modal-scrim note-scrim-anim${isModalClosing ? ' closing' : ''} fixed inset-0 ${mobileLayout ? 'bg-black' : 'bg-black/40 max-sm:bg-black'} z-40 flex items-center justify-center ${noteAiSidebarLayout && noteAiAvailable ? 'gap-2' : ''} overscroll-contain`}
        data-split-mode={splitMode ? "true" : undefined}
        data-split-side={splitMode ? splitSide : undefined}
        data-split-closing={splitClosing ? "true" : undefined}
        onMouseDown={(e) => {
          if (splitMode) return; // shell handles scrim clicks
          scrimClickStartRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (splitMode) return;
          if (scrimClickStartRef.current && e.target === e.currentTarget) {
            closeModal();
          }
          scrimClickStartRef.current = false;
        }}
      >
        <div
          className={`note-modal-anim${isModalClosing ? ' closing' : ''} glass-card rounded-none shadow-none w-full max-w-none ${
            mobileLayout ? ''
            : isDrawEdit ? 'sm:w-screen sm:max-w-none sm:h-screen sm:!rounded-none'
            : 'sm:w-11/12 sm:max-w-3xl lg:max-w-4xl sm:h-[95vh] sm:rounded-xl'
          }${drawTransition === 'entering' ? ' draw-expand' : drawTransition === 'leaving' ? ' draw-collapse' : ''} flex flex-col relative overflow-hidden`}
          style={{
            backgroundColor: modalBgFor(mColor, dark),
            height: mobileLayout ? '100dvh' : undefined,
            paddingTop: mobileLayout ? 'env(safe-area-inset-top)' : undefined,
            paddingBottom: mobileLayout ? 'env(safe-area-inset-bottom)' : undefined,
            paddingLeft: mobileLayout && !edgeToEdgeLandscape ? 'env(safe-area-inset-left)' : undefined,
            paddingRight: mobileLayout ? 'env(safe-area-inset-right)' : undefined,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleModalKeyDown}
        >
          {/* Scroll container */}
          <div
            ref={modalScrollRef}
            data-modal-scroll
            className={`relative flex-1 min-h-0 mobile-hide-scrollbar modal-scroll-themed ${isDrawEdit ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overflow-x-auto'}`}
            style={(() => {
              const sc = scrollColorsFor(mColor, dark);
              const noteColorBtn = (!dark && (!mColor || mColor === "default"))
                ? "#a78bfa"
                : solid(bgFor(mColor, dark));
              const noteColorOpaque = typeof noteColorBtn === "string" ? noteColorBtn.replace(/,\s*[\d.]+\)$/, ', 1)') : noteColorBtn;
              return { '--sb-thumb': sc.thumb, '--sb-track': sc.track, '--note-color': noteColorBtn, '--note-color-opaque': noteColorOpaque, backgroundColor: 'inherit' };
            })()}
          >
            <ModalHeader
              dark={dark}
              mColor={mColor}
              mTitle={mTitle}
              setMTitle={setMTitle}
              mType={mType}
              viewMode={viewMode}
              windowWidth={windowWidth}
              isLandscapeMobile={isLandscapeMobile}
              isWebView={isWebView}
              // formatting
              modalFmtBtnRef={modalFmtBtnRef}
              showModalFmt={showModalFmt}
              setShowModalFmt={setShowModalFmt}
              onFormatModal={formatModal}
              // pin
              onTogglePin={togglePin}
              activeId={activeId}
              notes={notes}
              tagFilter={tagFilter}
              // close
              onClose={closeModal}
              // save
              modalHasChanges={modalHasChanges}
              savingModal={savingModal}
              onSave={saveModal}
              // drawing
              drawMode={drawMode}
              drawToolbarMount={setDrawToolbarEl}
              onToggleDrawMode={() => setDrawMode((m) => m === "view" ? "draw" : "view")}
              toolbarSlotRef={setToolbarSlot}
              titleInputRef={modalTitleInputRef}
              // AI toggle in the header (mobile/non-sidebar only)
              noteAiAvailable={noteAiAvailable}
              noteAiSidebarLayout={noteAiSidebarLayout}
              noteAiOpen={noteAiOpen}
              noteAiHasBeenOpened={noteAiHasBeenOpened}
              noteAiHasMessages={(noteAiMessages || []).length > 0}
              onOpenNoteAi={onOpenNoteAi}
              onHideNoteAi={onHideNoteAi}
              // keyboard: Tab from title → body, skipping the toolbar buttons
              onTitleTab={() => {
                if (mType === "checklist") {
                  const first = document.querySelector(
                    '[data-checklist-list] textarea, [data-checklist-list] input[type="text"]'
                  );
                  if (first) first.focus();
                  return;
                }
                // Text / draw note body is the Tiptap editor — focus
                // it via its imperative API. Falls back to the legacy
                // textarea ref if the editor isn't ready yet.
                const ed = richEditorRef.current;
                if (ed && typeof ed.commands?.focus === "function") {
                  ed.commands.focus("end", { scrollIntoView: false });
                  return;
                }
                mBodyRef.current?.focus();
              }}
            />

            {!isDrawEdit && (
              /* Content images only — the optional note icon (logo
                 badge) lives in mImages with role:"icon" and is
                 managed exclusively through the footer "Image"
                 sub-menu, never as an inline modal block. */
              <ModalImagesGrid
                images={getContentImages(mImages)}
                onOpenViewer={openImageViewer}
                onRemoveImage={(id) => setMImages((prev) => prev.filter((x) => x.id !== id))}
                canRemove={mType === "checklist" || !viewMode}
              />
            )}

            <OfflineCollabBanner visible={isCollaborativeNote(activeId) && syncState === "offline"} />

            {/* Content area */}
            <div
              key={isDrawEdit ? 'draw' : viewMode ? 'view' : 'edit'}
              className={`${isDrawEdit ? "flex-1 min-h-0 flex flex-col" : isDrawView ? "px-6 pt-3 pb-6 max-sm:px-4 max-sm:pt-1 max-sm:pb-4" : "px-6 pt-3 pb-12 max-sm:pt-1 max-sm:pb-4"} ${!isDrawEdit ? "modal-content-fade" : ""}`}
              onClick={onModalBodyClick}
            >

              {/* Text, Checklist, or Drawing */}
              {mType === "text" ? (
                viewMode ? (
                  <NoteViewContent html={viewHtml} noteViewRef={noteViewRef} />
                ) : (
                  <div className="relative min-h-[160px]">
                    <RichTextEditor
                      key={activeId || "new"}
                      value={mBody}
                      onDocChange={handleRichDocChange}
                      placeholder={t("writeYourNoteEllipsis")}
                      dark={dark}
                      autoFocus={!mTitle}
                      minHeightClass="min-h-[160px]"
                      toolbarContainer={toolbarMount}
                      toolbarMode={editorToolbarMode}
                      onReady={(ed) => { richEditorRef.current = ed; }}
                      onShiftTabExit={focusModalTitle}
                    />
                  </div>
                )
              ) : mType === "checklist" ? (
                <div data-checklist-list>
                  <ChecklistEditor
                    entries={mItems}
                    setEntries={setMItems}
                    syncEntries={syncChecklistItems}
                    insertPosition={checklistInsertPosition}
                    removeSectionBehavior={checklistRemoveSectionBehavior}
                    noteId={activeNoteObj?.id}
                  />
                </div>
              ) : drawMode === 'draw' ? (
                /* Draw mode: fullscreen interactive canvas */
                <DrawingCanvas
                  data={mDrawingData}
                  onChange={setMDrawingData}
                  width={1200}
                  height={800}
                  readOnly={false}
                  darkMode={dark}
                  hideModeToggle
                  externalMode={drawMode}
                  onModeChange={setDrawMode}
                  fillContainer
                  toolbarPortalTarget={drawToolbarEl}
                />
              ) : viewMode ? (
                /* View mode: rendered text + read-only drawing preview */
                <>
                  {mBody && (
                    <NoteViewContent html={viewHtml} />
                  )}
                  <div className="mt-4">
                    <DrawingCanvas
                      data={mDrawingData}
                      width={1200}
                      height={800}
                      readOnly
                      darkMode={dark}
                      hideModeToggle
                    />
                  </div>
                </>
              ) : (
                /* Edit mode: rich text body + drawing preview */
                <>
                  <RichTextEditor
                    key={`draw-${activeId || "new"}`}
                    value={mBody}
                    onDocChange={handleRichDocChange}
                    placeholder={t("writeYourNoteEllipsis")}
                    dark={dark}
                    minHeightClass="min-h-[80px]"
                    toolbarContainer={toolbarMount}
                    toolbarMode={editorToolbarMode}
                    onReady={(ed) => { richEditorRef.current = ed; }}
                    onShiftTabExit={focusModalTitle}
                  />
                  <DrawingCanvas
                    data={mDrawingData}
                    width={1200}
                    height={800}
                    readOnly
                    darkMode={dark}
                    hideModeToggle
                  />
                </>
              )}

              {/* Inline Edited stamp: only when scrollable (hidden in draw edit mode) */}
              {editedStamp && modalScrollable && !(mType === 'draw' && drawMode === 'draw') && (
                <div className="mt-6 text-xs text-gray-600 dark:text-gray-300 text-right flex items-center justify-end gap-1.5">
                  <span>{t("editedPrefix")} {editedStamp}</span>
                  {activeId && (
                    <span
                      className="opacity-30 hover:opacity-100 cursor-default transition-opacity"
                      data-tooltip={`Note ID : ${activeId}`}
                    >ⓘ</span>
                  )}
                </div>
              )}
            </div>

            {/* Absolute Edited stamp: only when NOT scrollable (hidden in draw edit mode) */}
            {editedStamp && !modalScrollable && !(mType === 'draw' && drawMode === 'draw') && (
              <div className="absolute bottom-3 right-4 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <span className="pointer-events-none">{t("editedPrefix")} {editedStamp}</span>
                {activeId && (
                  <span
                    className="opacity-30 hover:opacity-100 cursor-default transition-opacity"
                    data-tooltip={`Note ID : ${activeId}`}
                  >ⓘ</span>
                )}
              </div>
            )}
          </div>

          {/* Mobile-only formatting bottom sheet — hosts the rich-text
              toolbar via a portal. Always mounted so the editor's toolbar
              keeps a stable target across open/close; visibility is
              driven by the "is-open" class. Closed by tapping the
              "Mise en forme" footer toggle again. Only relevant for
              text notes (and the inline text body of draw notes) in
              edit mode. */}
          {!isDesktopLayout && mType !== "checklist" && !viewMode && !(mType === 'draw' && drawMode === 'draw') && (
            <div
              ref={fmtSheetRef}
              className={`mobile-fmt-sheet${showModalFmt ? " is-open" : ""}${dark ? " mobile-fmt-sheet--dark" : ""}`}
              role="dialog"
              aria-label={t("formatting")}
              aria-hidden={showModalFmt ? "false" : "true"}
              style={{ backgroundColor: modalBgFor(mColor, dark) }}
            >
              <div
                className="mobile-fmt-sheet-grabber"
                role="button"
                tabIndex={-1}
                aria-label={t("close")}
                onPointerDown={handleFmtGrabberDown}
                onPointerMove={handleFmtGrabberMove}
                onPointerUp={handleFmtGrabberUp}
                onPointerCancel={handleFmtGrabberUp}
              />
              <div ref={setMobileToolbarSlot} className="mobile-fmt-sheet-content" />
            </div>
          )}

          <ModalFooter
            dark={dark}
            windowWidth={windowWidth}
            isLandscapeMobile={isLandscapeMobile}
            isWebView={isWebView}
            // tags
            mTagList={mTagList}
            setMTagList={setMTagList}
            tagInput={tagInput}
            setTagInput={setTagInput}
            modalTagFocused={modalTagFocused}
            setModalTagFocused={setModalTagFocused}
            modalTagInputRef={modalTagInputRef}
            modalTagBtnRef={modalTagBtnRef}
            suppressTagBlurRef={suppressTagBlurRef}
            tagsWithCounts={tagsWithCounts}
            addTags={addTags}
            handleTagKeyDown={handleTagKeyDown}
            handleTagBlur={handleTagBlur}
            handleTagPaste={handleTagPaste}
            // color
            mColor={mColor}
            setMColor={setMColor}
            modalColorBtnRef={modalColorBtnRef}
            showModalColorPop={showModalColorPop}
            setShowModalColorPop={setShowModalColorPop}
            // images
            modalFileRef={modalFileRef}
            addImagesToState={addImagesToState}
            setMImages={setMImages}
            mImages={mImages}
            modalIconFileRef={modalIconFileRef}
            setNoteIconFromFile={setNoteIconFromFile}
            removeNoteIcon={removeNoteIcon}
            logoLibrary={logoLibrary}
            addLogoToLibrary={addLogoToLibrary}
            deleteLogoFromLibrary={deleteLogoFromLibrary}
            // collaboration
            onOpenCollaboration={async () => {
              setCollaborationModalOpen(true);
              if (activeId) {
                await loadCollaboratorsForAddModal(activeId);
              }
            }}
            // formatting (mobile)
            modalFmtBtnRef={modalFmtBtnRef}
            showModalFmt={showModalFmt}
            setShowModalFmt={setShowModalFmt}
            // view/edit toggle
            mType={mType}
            viewMode={viewMode}
            onToggleViewMode={() => {
              setViewMode((v) => !v);
              setShowModalFmt(false);
            }}
            // drawing mode toggle
            drawMode={drawMode}
            onToggleDrawMode={() => setDrawMode((m) => m === "view" ? "draw" : "view")}
            onExitDrawToView={() => { setDrawMode("view"); setViewMode(true); }}
            modalScrollRef={modalScrollRef}
            savedModalScrollRatioRef={savedModalScrollRatioRef}
            // actions
            activeId={activeId}
            notes={notes}
            tagFilter={tagFilter}
            activeNoteObj={activeNoteObj}
            addModalCollaborators={addModalCollaborators}
            currentUser={currentUser}
            onDownloadNote={handleDownloadNote}
            onRestoreFromTrash={restoreFromTrash}
            onArchiveNote={handleArchiveNote}
            onOpenConfirmDelete={() => setConfirmDeleteOpen(true)}
            modalKebabOpen={modalKebabOpen}
            setModalKebabOpen={setModalKebabOpen}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onConvertNoteType={onConvertNoteType}
            onDuplicateNote={onDuplicateNote}
            // Per-note AI chat — kebab entry only when the panel is
            // available on this viewport (desktop ≥ 1024 px) and the user
            // has the AI assistant turned on.
            noteAiAvailable={noteAiAvailable}
            onOpenNoteAi={onOpenNoteAi}
          />

          <ConfirmDeleteDialog
            open={confirmDeleteOpen}
            dark={dark}
            isTrashed={tagFilter === "TRASHED"}
            collabOwner={
              tagFilter !== "TRASHED"
              && activeNoteObj?.user_id === currentUser?.id
              && (activeNoteObj?.collaborators?.length || 0) > 0
            }
            onClose={() => setConfirmDeleteOpen(false)}
            onConfirm={async (mode) => {
              setConfirmDeleteOpen(false);
              await deleteModal(mode);
            }}
          />

          <CollaborationModal
            open={collaborationModalOpen}
            dark={dark}
            activeId={activeId}
            notes={notes}
            currentUser={currentUser}
            collaboratorUsername={collaboratorUsername}
            setCollaboratorUsername={setCollaboratorUsername}
            addModalCollaborators={addModalCollaborators}
            showUserDropdown={showUserDropdown}
            setShowUserDropdown={setShowUserDropdown}
            filteredUsers={filteredUsers}
            setFilteredUsers={setFilteredUsers}
            loadingUsers={loadingUsers}
            dropdownPosition={dropdownPosition}
            collaboratorInputRef={collaboratorInputRef}
            onClose={() => setCollaborationModalOpen(false)}
            onAddCollaborator={addCollaborator}
            onRemoveCollaborator={removeCollaborator}
            searchUsers={searchUsers}
            updateDropdownPosition={updateDropdownPosition}
          />
        </div>
        {/* Per-note AI panel — wrapped in a width-animating div so the
            modal slides left/right smoothly via flex reflow. On open,
            the wrapper expands 0→target while the panel content pushes
            out from behind the note. On close, the panel content slides
            back behind the note first, then the wrapper collapses to 0.
            The .closing class adds a transition-delay so the wrapper
            shrink waits for the panel push-back. */}
        {noteAiAvailable && noteAiSidebarLayout && (
          <div
            className={`note-ai-panel-wrapper${isAiClosing ? " closing" : ""}`}
            style={{
              width: noteAiPanelVisible ? aiPanelWidth : 0,
              flexShrink: 0,
              overflow: "hidden",
              height: "95vh",
            }}
          >
            {(noteAiPanelVisible || isAiClosing) && (
              <NoteAiChatPanel
                dark={dark}
                mColor={mColor}
                open={noteAiPanelVisible}
                messages={noteAiMessages || []}
                loading={!!noteAiLoading}
                error={noteAiError}
                saved={!!noteAiSaved}
                canSave={!!noteAiCanSave}
                onSend={onSendNoteAiMessage}
                onStop={onStopNoteAi}
                onClose={onCloseNoteAi}
                onSave={onSaveNoteAi}
                onReset={onResetNoteAi}
              />
            )}
          </div>
        )}
      </div>
      {/* Mobile / narrow-layout AI panel — full-screen overlay that
          slides in from the right above the modal scrim. Mounted as a
          sibling to the scrim so its z-index can sit above the modal
          without fighting the scrim's flex layout. */}
      {noteAiAvailable && !noteAiSidebarLayout && (noteAiPanelVisible || isAiClosing) && (
        <div
          className={`note-ai-panel-mobile fixed inset-0 z-50${isAiClosing ? " closing" : ""}`}
          style={{
            backgroundColor: modalBgFor(mColor, dark),
            height: '100dvh',
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          <NoteAiChatPanel
            dark={dark}
            mColor={mColor}
            isMobile
            open={noteAiPanelVisible}
            messages={noteAiMessages || []}
            loading={!!noteAiLoading}
            error={noteAiError}
            saved={!!noteAiSaved}
            canSave={!!noteAiCanSave}
            onSend={onSendNoteAiMessage}
            onStop={onStopNoteAi}
            onHide={onHideNoteAi}
            onClose={onCloseNoteAi}
            onSave={onSaveNoteAi}
            onReset={onResetNoteAi}
          />
        </div>
      )}

      {/* Fullscreen Image Viewer — content images only; the icon is
          intentionally hidden from the viewer and never indexable. */}
      {(() => {
        const viewerImages = getContentImages(mImages);
        if (!imgViewOpen || viewerImages.length === 0) return null;
        return (
          <FullscreenImageViewer
            images={viewerImages}
            currentIndex={Math.min(imgViewIndex, viewerImages.length - 1)}
            dark={dark}
            onClose={closeImageViewer}
            onNext={nextImage}
            onPrev={prevImage}
            mobileNavVisible={mobileNavVisible}
            onResetMobileNav={resetMobileNav}
            canRemove={mType === "checklist" || !viewMode}
            onRemoveImage={(id) => setMImages((prev) => prev.filter((x) => x.id !== id))}
          />
        );
      })()}
    </>
  );
}
