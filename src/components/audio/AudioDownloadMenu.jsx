import React, { useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import { DownloadIcon } from "../../icons/index.jsx";
import Popover from "../common/Popover.jsx";
import { extensionForMime } from "../../utils/audioNote.js";
import {
  canConvertToMp3,
  canConvertToWav,
  convertAudioToMp3,
  convertAudioToWav,
  dataUrlToBlob,
} from "../../utils/audioConvert.js";
import { sanitizeFilename, triggerBlobDownload } from "../../utils/files.js";
import { GRADIENT_BUTTON_CLASSES } from "../common/fieldClasses.js";

// Download button of the audio player (hero layout) and its format menu:
// the original recording, or an MP3 / WAV conversion when the browser can
// encode it.
export default function AudioDownloadMenu({ audio, title }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const btnRef = useRef(null);

  const baseName = useMemo(
    () => sanitizeFilename((title || "").trim() || t("audioFilenameDefault")),
    [title],
  );

  // The recording as stored, in its own format.
  const saveOriginal = async () => {
    const blob = dataUrlToBlob(audio.audioDataUrl);
    const ext = extensionForMime(audio.mimeType || blob.type);
    await triggerBlobDownload(`${baseName}.${ext}`, blob);
  };

  const downloadOriginal = async () => {
    setError(null);
    try {
      await saveOriginal();
    } catch {
      setError(t("audioRecordingFailed"));
    }
  };

  // Converted copy; falls back to the original when the conversion fails.
  const downloadConverted = async (convert, ext) => {
    setError(null);
    setBusy(true);
    try {
      const inputBlob = dataUrlToBlob(audio.audioDataUrl);
      const converted = await convert(inputBlob);
      await triggerBlobDownload(`${baseName}.${ext}`, converted);
    } catch {
      setError(t("audioDownloadConversionFailed"));
      try {
        await saveOriginal();
      } catch { /* ignore */ }
    } finally {
      setBusy(false);
    }
  };
  const downloadWav = () => downloadConverted(convertAudioToWav, "wav");
  const downloadMp3 = () => downloadConverted(convertAudioToMp3, "mp3");

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${GRADIENT_BUTTON_CLASSES} disabled:opacity-50 disabled:pointer-events-none`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DownloadIcon />
        <span>{busy ? t("audioDownloadConverting") : t("audioDownload")}</span>
        <svg className={`w-3 h-3 transition-transform opacity-90 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <Popover anchorRef={btnRef} open={open} onClose={() => setOpen(false)} showArrow>
        <div
          className="min-w-[200px] rounded-lg border border-[var(--border-light)] bg-white dark:bg-[#222222] text-gray-800 dark:text-gray-100 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10"
            onClick={() => { setOpen(false); downloadOriginal(); }}
          >
            <DownloadIcon />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{t("audioDownloadOriginal")}</div>
              <div className="text-[11px] opacity-70 uppercase">.{extensionForMime(audio.mimeType)}</div>
            </div>
          </button>
          {canConvertToMp3() && (
            <button
              type="button"
              disabled={busy}
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-60 disabled:cursor-wait"
              onClick={() => { setOpen(false); downloadMp3(); }}
            >
              <DownloadIcon />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{t("audioDownloadMp3")}</div>
                <div className="text-[11px] opacity-70 uppercase">.mp3</div>
              </div>
            </button>
          )}
          {canConvertToWav() && (
            <button
              type="button"
              disabled={busy}
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-60 disabled:cursor-wait"
              onClick={() => { setOpen(false); downloadWav(); }}
            >
              <DownloadIcon />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{t("audioDownloadWav")}</div>
                <div className="text-[11px] opacity-70 uppercase">.wav</div>
              </div>
            </button>
          )}
          {error && (
            <div className="px-3 py-2 text-xs text-red-700 dark:text-red-300 border-t border-[var(--border-light)]">
              {error}
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
}
