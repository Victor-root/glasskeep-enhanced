import React, { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import { MicIcon, DownloadIcon } from "../../icons/index.jsx";
import { formatDuration, extensionForMime } from "../../utils/audioNote.js";
import { sanitizeFilename, triggerBlobDownload } from "../../utils/helpers.js";

// AudioPlayer — renders the standard playback affordance for an audio note.
// Two layouts:
//   - variant="card"     : compact preview used in NoteCard (no native controls).
//   - variant="full"     : full <audio controls> + duration meta + download.
//
// Receives the parsed audio content (audioDataUrl, mimeType, duration, size).

export default function AudioPlayer({
  audio,
  title,
  variant = "full",
  showDownload = true,
  className = "",
}) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [resolvedDuration, setResolvedDuration] = useState(
    Number.isFinite(audio?.duration) ? audio.duration : null,
  );

  useEffect(() => {
    setPlaying(false);
    setResolvedDuration(Number.isFinite(audio?.duration) ? audio.duration : null);
  }, [audio?.audioDataUrl, audio?.duration]);

  const onPlayPauseToggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => { /* autoplay block */ });
    } else {
      el.pause();
    }
  };

  const filename = useMemo(() => {
    const base = sanitizeFilename((title || "").trim() || t("audioFilenameDefault"));
    const ext = extensionForMime(audio?.mimeType);
    return `${base}.${ext}`;
  }, [title, audio?.mimeType]);

  const onDownload = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!audio?.audioDataUrl) return;
    try {
      // Convert data URL to a Blob for cleaner downloads.
      const [meta, base64] = audio.audioDataUrl.split(",");
      const mime = (meta.match(/:(.*?);/) || [])[1] || audio.mimeType || "audio/webm";
      const bin = atob(base64 || "");
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      triggerBlobDownload(filename, blob);
    } catch {
      // Fallback: anchor with the data URL directly
      const a = document.createElement("a");
      a.href = audio.audioDataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  if (!audio?.audioDataUrl) {
    return null;
  }

  if (variant === "card") {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/10 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={playing ? t("audioPause") : t("audioPlay")}
          onClick={onPlayPauseToggle}
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {playing ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
          <span className="inline-flex items-center text-indigo-600 dark:text-indigo-300"><MicIcon /></span>
          <span className="font-medium tabular-nums">
            {formatDuration(resolvedDuration ?? 0)}
          </span>
        </div>
        <audio
          ref={audioRef}
          src={audio.audioDataUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setResolvedDuration(d);
          }}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        <span className="inline-flex items-center text-indigo-600 dark:text-indigo-300"><MicIcon /></span>
        <span className="font-medium">{t("audioRecording")}</span>
        <span className="text-xs opacity-70">·</span>
        <span className="text-xs tabular-nums opacity-80">
          {formatDuration(resolvedDuration ?? 0)}
        </span>
        {showDownload && (
          <button
            type="button"
            onClick={onDownload}
            aria-label={t("audioDownload")}
            data-tooltip={t("audioDownload")}
            className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <DownloadIcon />
          </button>
        )}
      </div>
      <audio
        ref={audioRef}
        src={audio.audioDataUrl}
        controls
        preload="metadata"
        className="w-full"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setResolvedDuration(d);
        }}
      />
    </div>
  );
}
