import React from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, CloseIcon, ArrowLeft, ArrowRight } from "../../icons/index.jsx";
import { normalizeImageFilename, downloadDataUrl } from "../../utils/helpers.js";
import { t } from "../../i18n";

/**
 * Fullscreen image viewer portal — displays modal images in a lightbox overlay.
 * Purely presentational, no sync/state coupling.
 */
export default function FullscreenImageViewer({
  images,
  currentIndex,
  dark,
  onClose,
  onNext,
  onPrev,
  mobileNavVisible,
  onResetMobileNav,
  canRemove,
  onRemoveImage,
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] backdrop-blur-md bg-black/30 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
        onResetMobileNav();
      }}
    >
      {/* Controls */}
      <div className="absolute z-10 flex items-center gap-2" style={{ top: "calc(env(safe-area-inset-top) + 1rem)", right: "calc(env(safe-area-inset-right) + 1rem)" }}>
        <button
          className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
          data-tooltip={t("downloadShortcut")}
          onClick={async (e) => {
            e.stopPropagation();
            const im = images[currentIndex];
            if (im) {
              const fname = normalizeImageFilename(
                im.name,
                im.src,
                currentIndex + 1,
              );
              await downloadDataUrl(fname, im.src);
            }
          }}
        >
          <DownloadIcon />
        </button>
        {canRemove && (
          <button
            className="px-3 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600"
            data-tooltip={t("removeImage")}
            onClick={(e) => {
              e.stopPropagation();
              const im = images[currentIndex];
              if (!im) return;
              onRemoveImage(im.id);
              if (images.length <= 1) {
                onClose();
              } else if (currentIndex >= images.length - 1) {
                onPrev();
              }
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <button
          className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
          data-tooltip={t("closeEsc")}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Prev / Next */}
      {images.length > 1 && (
        <>
          <button
            className={`absolute top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity duration-300 sm:opacity-100 sm:pointer-events-auto ${mobileNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{ left: "calc(env(safe-area-inset-left) + 1rem)" }}
            data-tooltip={t("previousArrow")}
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
              onResetMobileNav();
            }}
          >
            <ArrowLeft />
          </button>
          <button
            className={`absolute top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity duration-300 sm:opacity-100 sm:pointer-events-auto ${mobileNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{ right: "calc(env(safe-area-inset-right) + 1rem)" }}
            data-tooltip={t("nextArrow")}
            onClick={(e) => {
              e.stopPropagation();
              onNext();
              onResetMobileNav();
            }}
          >
            <ArrowRight />
          </button>
        </>
      )}

      {/* Image */}
      <img
        src={images[currentIndex].src}
        alt={images[currentIndex].name || `image-${currentIndex + 1}`}
        className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
        style={{ background: dark ? "#000" : "#fff" }}
        onClick={(e) => { e.stopPropagation(); onResetMobileNav(); }}
      />
      {/* Caption */}
      <div className="absolute left-0 right-0 z-10 text-xs text-white text-center pointer-events-none" style={{ top: "calc(env(safe-area-inset-top) + 1rem)" }}>
        <span className="hidden sm:inline">{images[currentIndex].name || `image-${currentIndex + 1}`} </span>
        {images.length > 1 && (
          <span>{currentIndex + 1}/{images.length}</span>
        )}
      </div>
    </div>,
    document.body,
  );
}
