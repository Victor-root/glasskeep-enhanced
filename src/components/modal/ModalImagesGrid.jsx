import React from "react";
import { t } from "../../i18n";
import RemoveImageIcon from "./RemoveImageIcon.jsx";

/**
 * Google Keep–style image grid displayed inside the note modal.
 * Purely presentational.
 */
export default function ModalImagesGrid({
  images,
  onOpenViewer,
  onRemoveImage,
  canRemove,
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
          {canRemove && (
            <button
              data-tooltip={t("removeImage")}
              className="absolute top-1.5 right-1.5 w-8 h-8 hidden sm:flex items-center justify-center rounded-full bg-red-600 text-white sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-700 transition-all shadow-lg cursor-pointer"
              onClick={() => onRemoveImage(im.id)}
            >
              <RemoveImageIcon className="w-4.5 h-4.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
