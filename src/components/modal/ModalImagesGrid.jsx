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
  viewMode,
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
          {!viewMode && (
            <button
              data-tooltip={t("removeImage")}
              className="absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-red-600 text-white sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-700 transition-all shadow-lg cursor-pointer"
              onClick={() => onRemoveImage(im.id)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
