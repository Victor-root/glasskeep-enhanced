import React, { useRef } from "react";
import AddImageMenu from "./AddImageMenu.jsx";
import LogoPickerPopover from "./LogoPickerPopover.jsx";
import { AddImageIcon, LogoIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

/**
 * Image button of the modal footer.
 *
 * Clicking it opens a small sub-menu offering either a regular image
 * upload or a note-icon upload ("logo badge"). Two separate hidden file
 * inputs keep the two flows from interfering with each other and let the
 * OS picker remember the right MIME hint per flow.
 *
 * `logoOnly` (audio notes): audio notes don't have a content-image flow,
 * so the button goes straight to the logo picker. The icon-only file input
 * and the LogoPickerPopover are the same, so the rest of the icon flow
 * (library, upload, delete) works identically.
 */
export default function FooterImageButton({
  logoOnly,
  dark,
  isDesktop,
  btnClass,
  sheetBg,
  // content images
  modalFileRef,
  addImagesToState,
  setMImages,
  // note icon: saved through setNoteIconFromFile (hooks/useNoteIconActions.js)
  modalIconFileRef,
  setNoteIconFromFile,
  removeNoteIcon,
  noteIcon,
  onPickIcon,
  logoLibrary,
  deleteLogoFromLibrary,
  // attachments: null when this note takes none
  addAttachments,
  // menus
  imageMenuOpen,
  setImageMenuOpen,
  logoPickerOpen,
  setLogoPickerOpen,
}) {
  const imageBtnRef = useRef(null);
  const attachmentInputRef = useRef(null);

  const handlePickExistingLogo = (logo) => {
    if (!logo?.src) return;
    onPickIcon?.(logo);
  };

  const noteIconBadge = noteIcon && (
    <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full overflow-hidden">
      <img
        src={noteIcon.src}
        alt=""
        className="w-full h-full"
        style={{ objectFit: "contain" }}
        draggable={false}
      />
    </span>
  );

  return (
    <>
      {!logoOnly && (
        <input
          ref={modalFileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files;
            if (f && f.length) await addImagesToState(f, setMImages);
            e.target.value = "";
          }}
        />
      )}
      <input
        ref={modalIconFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files && e.target.files[0];
          if (f && setNoteIconFromFile) await setNoteIconFromFile(f);
          e.target.value = "";
        }}
      />
      {addAttachments && (
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          className="hidden"
          aria-hidden="true"
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            await addAttachments(files);
          }}
        />
      )}
      {logoOnly ? (
        <button
          ref={imageBtnRef}
          className={`${btnClass} modal-footer-btn--image focus:outline-none`}
          onClick={() => setLogoPickerOpen((v) => !v)}
          data-tooltip={!isDesktop ? (noteIcon ? t("replaceLogo") : t("addLogo")) : undefined}
        >
          <LogoIcon />
          {isDesktop && <span>{noteIcon ? t("replaceLogo") : t("addLogo")}</span>}
          {noteIconBadge}
        </button>
      ) : (
        <button
          ref={imageBtnRef}
          className={`${btnClass} modal-footer-btn--image focus:outline-none`}
          onClick={() => setImageMenuOpen((v) => !v)}
          data-tooltip={!isDesktop ? t(addAttachments ? "attach" : "addImages") : undefined}
          aria-haspopup="menu"
          aria-expanded={imageMenuOpen ? "true" : "false"}
        >
          {addAttachments ? <TI.Paperclip className="tabler-icon w-5 h-5" /> : <AddImageIcon />}
          {isDesktop && <span>{t(addAttachments ? "attach" : "image")}</span>}
          {noteIconBadge}
        </button>
      )}
      {!logoOnly && (
        <AddImageMenu
          anchorRef={imageBtnRef}
          open={imageMenuOpen}
          onClose={() => setImageMenuOpen(false)}
          dark={dark}
          hasIcon={!!noteIcon}
          onAddImage={() => modalFileRef.current?.click()}
          onAddIcon={() => {
            setImageMenuOpen(false);
            setLogoPickerOpen(true);
          }}
          onRemoveIcon={() => removeNoteIcon && removeNoteIcon()}
          onAddFiles={addAttachments ? () => attachmentInputRef.current?.click() : null}
          asSheet={!isDesktop}
          sheetBackground={sheetBg}
        />
      )}
      <LogoPickerPopover
        anchorRef={imageBtnRef}
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        dark={dark}
        logos={logoLibrary}
        selectedSrc={noteIcon?.src}
        onPickExisting={handlePickExistingLogo}
        onUploadNew={() => modalIconFileRef?.current?.click()}
        onDeleteLogo={deleteLogoFromLibrary}
      />
    </>
  );
}
