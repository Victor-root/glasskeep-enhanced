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
            className={`absolute top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity duration-300 sm:opacity-100 ${mobileNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
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
            className={`absolute top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity duration-300 sm:opacity-100 ${mobileNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
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
