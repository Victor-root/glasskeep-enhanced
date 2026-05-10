import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { t } from "../../i18n";
import { MicIcon, DownloadIcon } from "../../icons/index.jsx";
import Popover from "../common/Popover.jsx";
import { formatDuration, extensionForMime } from "../../utils/audioNote.js";
import { canConvertToWav, convertAudioToWav, dataUrlToBlob } from "../../utils/audioConvert.js";
import { sanitizeFilename, triggerBlobDownload } from "../../utils/helpers.js";

// Themed multimedia player for audio notes. Two layouts:
//  - variant="card" : compact preview shown inside a NoteCard.
//  - variant="hero" : large, music-app-style layout used inside the
//                     audio-note modal and the recorder preview.
//
// The native <audio> element drives playback under the hood (events,
// seeking, decoding) but is hidden — we render our own controls so the
// player matches the app's gradient/glass aesthetic.

export default function AudioPlayer({
  audio,
  title,
  variant = "hero",
  showDownload = true,
  className = "",
}) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(
    Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : null,
  );
  const [scrubRatio, setScrubRatio] = useState(null); // 0..1 while user drags
  const trackRef = useRef(null);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setScrubRatio(null);
    setResolvedDuration(
      Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : null,
    );
  }, [audio?.audioDataUrl, audio?.duration]);

  const duration = resolvedDuration ?? 0;
  const ratio =
    scrubRatio != null
      ? scrubRatio
      : duration > 0
        ? Math.min(1, Math.max(0, currentTime / duration))
        : 0;

  const togglePlay = (e) => {
    e?.stopPropagation();
    e?.preventDefault();
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => { /* autoplay blocked, ignore */ });
    } else {
      el.pause();
    }
  };

  const seekToRatio = useCallback((newRatio) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const r = Math.min(1, Math.max(0, newRatio));
    try {
      el.currentTime = r * duration;
      setCurrentTime(r * duration);
    } catch { /* ignore */ }
  }, [duration]);

  const ratioFromEvent = (clientX) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return (clientX - rect.left) / rect.width;
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    const el = trackRef.current;
    if (!el) return;
    el.setPointerCapture?.(e.pointerId);
    const r = ratioFromEvent(e.clientX);
    setScrubRatio(r);
  };
  const onPointerMove = (e) => {
    if (scrubRatio == null) return;
    e.stopPropagation();
    setScrubRatio(ratioFromEvent(e.clientX));
  };
  const onPointerUp = (e) => {
    if (scrubRatio == null) return;
    e.stopPropagation();
    const final = ratioFromEvent(e.clientX);
    seekToRatio(final);
    setScrubRatio(null);
    try { trackRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const onTrackKeyDown = (e) => {
    if (!duration) return;
    const step = e.shiftKey ? 5 : 1; // seconds
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekToRatio((currentTime - step) / duration);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seekToRatio((currentTime + step) / duration);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      togglePlay(e);
    }
  };

  const skip = (delta) => (e) => {
    e?.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    seekToRatio(((el.currentTime || 0) + delta) / Math.max(0.001, duration));
  };

  return (
    <div
      className={variant === "card" ? `audio-player audio-player--card ${className}` : `audio-player audio-player--hero ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {variant === "hero" ? (
        <HeroLayout
          ratio={ratio}
          duration={duration}
          currentTime={scrubRatio != null ? scrubRatio * duration : currentTime}
          playing={playing}
          togglePlay={togglePlay}
          onSkip={skip}
          onTrackPointerDown={onPointerDown}
          onTrackPointerMove={onPointerMove}
          onTrackPointerUp={onPointerUp}
          onTrackKeyDown={onTrackKeyDown}
          trackRef={trackRef}
          showDownload={showDownload}
          audio={audio}
          title={title}
        />
      ) : (
        <CardLayout
          ratio={ratio}
          duration={duration}
          playing={playing}
          togglePlay={togglePlay}
          trackRef={trackRef}
          onTrackPointerDown={onPointerDown}
          onTrackPointerMove={onPointerMove}
          onTrackPointerUp={onPointerUp}
        />
      )}

      <audio
        ref={audioRef}
        src={audio?.audioDataUrl}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={(e) => {
          if (scrubRatio == null) setCurrentTime(e.currentTarget.currentTime || 0);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setResolvedDuration(d);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setResolvedDuration(d);
        }}
      />
    </div>
  );
}

function CardLayout({ ratio, duration, playing, togglePlay, trackRef, onTrackPointerDown, onTrackPointerMove, onTrackPointerUp }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-fuchsia-200/40 bg-gradient-to-br from-fuchsia-50/80 via-white/40 to-pink-50/80 dark:from-fuchsia-900/30 dark:via-transparent dark:to-pink-900/30 dark:border-fuchsia-700/30 shadow-sm">
      <button
        type="button"
        aria-label={playing ? t("audioPause") : t("audioPlay")}
        onClick={togglePlay}
        className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full text-white shadow-md bg-gradient-to-br from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700 active:scale-95 transition focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
      >
        {playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] text-fuchsia-700 dark:text-fuchsia-300 font-medium">
          <MicIcon />
          <span>{t("audioRecording")}</span>
        </div>
        <div className="mt-1.5">
          <ProgressTrack
            ratio={ratio}
            trackRef={trackRef}
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            onKeyDown={() => {}}
            color="fuchsia"
            compact
          />
        </div>
      </div>
      <span className="shrink-0 tabular-nums text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-200">
        {formatDuration(duration)}
      </span>
    </div>
  );
}

function HeroLayout({
  ratio, duration, currentTime, playing, togglePlay, onSkip,
  onTrackPointerDown, onTrackPointerMove, onTrackPointerUp, onTrackKeyDown,
  trackRef, showDownload, audio, title,
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-fuchsia-200/50 dark:border-fuchsia-700/30 bg-gradient-to-br from-fuchsia-100 via-white/60 to-pink-100 dark:from-fuchsia-950/60 dark:via-fuchsia-900/30 dark:to-pink-950/60 shadow-lg">
      {/* Decorative blurred orbs for the music-app vibe */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-10 w-40 h-40 rounded-full bg-pink-300/40 dark:bg-pink-500/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-10 w-44 h-44 rounded-full bg-fuchsia-300/40 dark:bg-fuchsia-500/20 blur-3xl" />

      <div className="relative px-5 py-6 sm:px-6 sm:py-7 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-fuchsia-500 to-pink-600">
            <span className="scale-150"><MicIcon /></span>
          </div>
          <div className="text-xs uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
            {t("audioRecording")}
          </div>
        </div>

        {/* Transport row */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <SkipButton direction="back" onClick={onSkip(-10)} />
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? t("audioPause") : t("audioPlay")}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full text-white shadow-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700 active:scale-95 transition focus:outline-none focus:ring-4 focus:ring-fuchsia-400/50"
          >
            {playing ? <PauseGlyph large /> : <PlayGlyph large />}
          </button>
          <SkipButton direction="forward" onClick={onSkip(10)} />
        </div>

        {/* Progress + time */}
        <div className="w-full flex flex-col gap-1.5">
          <ProgressTrack
            ratio={ratio}
            trackRef={trackRef}
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            onKeyDown={onTrackKeyDown}
            color="fuchsia"
          />
          <div className="flex justify-between text-xs tabular-nums text-fuchsia-800/90 dark:text-fuchsia-100/90 font-medium">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {showDownload && audio?.audioDataUrl && (
          <DownloadMenu audio={audio} title={title} />
        )}
      </div>
    </div>
  );
}

function ProgressTrack({ ratio, trackRef, onPointerDown, onPointerMove, onPointerUp, onKeyDown, color = "fuchsia", compact = false }) {
  const filledColor = color === "fuchsia"
    ? "bg-gradient-to-r from-fuchsia-500 to-pink-600"
    : "bg-indigo-500";
  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Audio progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={`relative w-full ${compact ? "h-1.5" : "h-2"} rounded-full bg-fuchsia-200/70 dark:bg-fuchsia-700/30 cursor-pointer touch-none focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60`}
    >
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${filledColor}`}
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
      />
      <div
        className={`absolute -top-1.5 ${compact ? "w-3 h-3" : "w-4 h-4"} rounded-full bg-white shadow ring-2 ring-fuchsia-500 dark:ring-fuchsia-300 transition-transform`}
        style={{ left: `calc(${Math.min(100, Math.max(0, ratio * 100))}% - ${compact ? "6px" : "8px"})` }}
      />
    </div>
  );
}

function SkipButton({ direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "back" ? "Skip back 10 seconds" : "Skip forward 10 seconds"}
      className="inline-flex items-center justify-center w-10 h-10 rounded-full text-fuchsia-700 dark:text-fuchsia-200 bg-white/60 dark:bg-fuchsia-900/40 hover:bg-white dark:hover:bg-fuchsia-800/50 active:scale-95 transition focus:outline-none focus:ring-2 focus:ring-fuchsia-400/50"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {direction === "back" ? (
          <>
            <path d="M11 17l-5-5 5-5" />
            <path d="M18 17l-5-5 5-5" />
          </>
        ) : (
          <>
            <path d="M13 17l5-5-5-5" />
            <path d="M6 17l5-5-5-5" />
          </>
        )}
      </svg>
    </button>
  );
}

function PlayGlyph({ large = false }) {
  const size = large ? "w-7 h-7 ml-1" : "w-4 h-4 ml-0.5";
  return (
    <svg className={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseGlyph({ large = false }) {
  const size = large ? "w-7 h-7" : "w-4 h-4";
  return (
    <svg className={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function DownloadMenu({ audio, title }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const btnRef = useRef(null);

  const baseName = useMemo(
    () => sanitizeFilename((title || "").trim() || t("audioFilenameDefault")),
    [title],
  );

  const downloadOriginal = async () => {
    setError(null);
    try {
      const blob = dataUrlToBlob(audio.audioDataUrl);
      const ext = extensionForMime(audio.mimeType || blob.type);
      await triggerBlobDownload(`${baseName}.${ext}`, blob);
    } catch {
      setError(t("audioRecordingFailed"));
    }
  };

  const downloadWav = async () => {
    setError(null);
    setBusy(true);
    try {
      const inputBlob = dataUrlToBlob(audio.audioDataUrl);
      const wav = await convertAudioToWav(inputBlob);
      await triggerBlobDownload(`${baseName}.wav`, wav);
    } catch {
      setError(t("audioDownloadConversionFailed"));
      try {
        const blob = dataUrlToBlob(audio.audioDataUrl);
        const ext = extensionForMime(audio.mimeType || blob.type);
        await triggerBlobDownload(`${baseName}.${ext}`, blob);
      } catch { /* ignore */ }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-100 text-sm font-medium hover:bg-white dark:hover:bg-fuchsia-800/50 shadow-sm border border-fuchsia-200/60 dark:border-fuchsia-700/40 active:scale-[0.98] transition focus:outline-none focus:ring-2 focus:ring-fuchsia-400/50 disabled:opacity-60 disabled:cursor-wait"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DownloadIcon />
        <span>{busy ? t("audioDownloadConverting") : t("audioDownload")}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
