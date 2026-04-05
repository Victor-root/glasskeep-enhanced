import React from "react";
import { t } from "../../i18n";

/**
 * Google Keep–style image grid displayed inside the note modal.
 * Purely presentational.
 */
export default function ModalImagesGrid({
  images,
  onOpenViewer,
  onRemoveImage,
}) {
  if (!images.length) return null;

  return (
    <div className="flex flex-wrap gap-2 justify-center px-2 pb-2">
      {images.map((im, idx) => (
        <div
          key={im.id}
          className="group relative overflow-hidden rounded-md border border-[var(--border-light)]"
          style={{
            width: images.length === 1 ? "100%" : "calc(50% - 4px)",
          }}
        >
          <img
            src={im.src}
            alt={im.name}
            className="w-full h-auto object-contain object-center cursor-pointer"
            style={{ maxHeight: "360px" }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenViewer(idx);
            }}
          />
          <button
            data-tooltip={t("removeImage")}
            className="absolute -top-1 right-0 text-black dark:text-white text-2xl leading-none opacity-0 group-hover:opacity-100 hover:opacity-60 transition-opacity cursor-pointer"
            onClick={() => onRemoveImage(im.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
