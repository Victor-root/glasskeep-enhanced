import React, { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Sheet from "../common/Sheet.jsx";
import NoteTagPicker from "./NoteTagPicker.jsx";
import { t } from "../../i18n";

// Tag button of the modal footer, with its count badge and the tag picker:
// a dropdown under the button on desktop, a bottom sheet on phones.
export default function FooterTagButton({
  isDesktop,
  btnClass,
  sheetBg,
  mTagList,
  setMTagList,
  tagInput,
  setTagInput,
  modalTagFocused,
  setModalTagFocused,
  modalTagInputRef,
  modalTagBtnRef,
  suppressTagBlurRef,
  tagsWithCounts,
  addTags,
  handleTagKeyDown,
  handleTagBlur,
  handleTagPaste,
}) {
  const closeTagPicker = () => setModalTagFocused(false);
  const tagPickerProps = {
    tagInput,
    setTagInput,
    tagsWithCounts,
    mTagList,
    setMTagList,
    addTags,
    inputRef: modalTagInputRef,
    suppressTagBlurRef,
    handleTagKeyDown,
    handleTagBlur,
    handleTagPaste,
    onClose: closeTagPicker,
  };

  /* Close the desktop tag dropdown on outside click (the mobile sheet has
     its own backdrop). */
  const tagDropdownRef = useRef(null);
  useEffect(() => {
    if (!modalTagFocused || !isDesktop) return;
    const onDown = (e) => {
      const drop = tagDropdownRef.current;
      const btn = modalTagBtnRef?.current;
      if (drop && drop.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      setModalTagFocused(false);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [modalTagFocused, setModalTagFocused, modalTagBtnRef, isDesktop]);

  return (
    <div className="relative">
      <button
        ref={modalTagBtnRef}
        className={`${btnClass} focus:outline-none`}
        onClick={() => {
          setModalTagFocused((v) => {
            if (!v) setTimeout(() => { if (isDesktop) modalTagInputRef.current?.focus(); }, 0);
            return !v;
          });
          setTagInput("");
        }}
        data-tooltip={!isDesktop ? t("addTag") : undefined}
      >
        {/* Tabler tag */}
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
          <path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a2 2 0 0 0 -2 2z" />
        </svg>
        {isDesktop && <span>{t("tags")}</span>}
        {/* Badge: tag count */}
        {mTagList.length > 0 && (
          <span className="gk-tag-count-badge absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold leading-none px-1">
            {mTagList.length}
          </span>
        )}
      </button>

      {/* Tag picker: dropdown on desktop, bottom sheet on mobile */}
      {/* eslint-disable-next-line react-hooks/refs -- positions the portal dropdown from the tag button's rect, measured on each render while open */}
      {isDesktop ? modalTagFocused && (() => {
        const rect = modalTagBtnRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropUp = spaceBelow < 320;
        const dropWidth = 260;
        const dropLeft = Math.min(rect.left, window.innerWidth - dropWidth - 8);

        const arrowLeft = rect.left + rect.width / 2 - dropLeft - 6;
        const arrowDir = dropUp ? "down" : "up";
        const nearLeft = arrowLeft < 20;
        const nearRight = arrowLeft > dropWidth - 32;

        return createPortal(
          <div
            ref={tagDropdownRef}
            data-arrow={arrowDir}
            style={{
              position: "fixed",
              ...(dropUp
                ? { bottom: window.innerHeight - rect.top + 6, left: dropLeft }
                : { top: rect.bottom + 6, left: dropLeft }),
              width: dropWidth,
              zIndex: 99999,
              '--arrow-left': `${arrowLeft}px`,
              ...(nearLeft && arrowDir === "up" && { borderTopLeftRadius: '4px' }),
              ...(nearLeft && arrowDir === "down" && { borderBottomLeftRadius: '4px' }),
              ...(nearRight && arrowDir === "up" && { borderTopRightRadius: '4px' }),
              ...(nearRight && arrowDir === "down" && { borderBottomRightRadius: '4px' }),
            }}
            className="gk-tag-popover rounded-2xl shadow-2xl bg-white dark:bg-gray-900 border border-indigo-100/80 dark:border-indigo-800/50 ring-1 ring-black/5 dark:ring-white/5"
          >
            <NoteTagPicker variant="popover" {...tagPickerProps} />
          </div>,
          document.body
        );
      })() : (
        <Sheet open={modalTagFocused} onClose={closeTagPicker} title={t("tags")} background={sheetBg}>
          <NoteTagPicker variant="sheet" {...tagPickerProps} />
        </Sheet>
      )}
    </div>
  );
}
