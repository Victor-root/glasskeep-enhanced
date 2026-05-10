import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { t } from "../../i18n";
import { MicIcon, DownloadIcon, PlayFilledIcon, PauseFilledIcon, MicrophoneFilledIcon } from "../../icons/index.jsx";
import Popover from "../common/Popover.jsx";
import { formatDuration, extensionForMime } from "../../utils/audioNote.js";
import {
  canConvertToMp3,
  canConvertToWav,
  convertAudioToMp3,
  convertAudioToWav,
  dataUrlToBlob,
} from "../../utils/audioConvert.js";
import { sanitizeFilename, triggerBlobDownload } from "../../utils/helpers.js";

// Themed multimedia player for audio notes. Two layouts:
//  - variant="card" : compact preview shown inside a NoteCard.
//  - variant="hero" : large, music-app-style layout used inside the
//                     audio-note modal body.
//
// Color theming reads two CSS vars set by NoteModal:
//   --audio-accent : high-contrast accent (lightened in dark mode,
//                    darkened in light mode). Used for the play button
//                    bg, scrubber fill, and icon tints.
//   --note-color   : the raw note color for subtle background washes.
// Falls back to violet when no note color is set.
//
// Optional prev/next CLIP buttons (showClipNav) navigate between recordings
// in a multi-clip audio note. They're separate from the in-clip seek
// scrubber so users can both step between recordings and seek inside one.

const FALLBACK_ACCENT = "#7c3aed";

export default function AudioPlayer({
  audio,
  title,
  variant = "hero",
  showDownload = true,
  className = "",
  showClipNav = false,
  clipIndex = 0,
  clipCount = 1,
  onPrevClip,
  onNextClip,
  // playToggleKey: when this number changes (parent calls onPlayClip), the
  // player toggles play/pause without forcing always-play. Lets the playlist
  // act like Spotify — click a row to start it, click again to pause.
  playToggleKey = 0,
  onPlayingChange,
  // When provided, the hero footer renders an "Add recording" pill next to
  // the Download button so the actions sit on a single row, leaving the
  // playlist below as much room as possible.
  onAddRecording,
  addRecordingLabel,
}) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(
    Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : null,
  );
  const [scrubRatio, setScrubRatio] = useState(null);
  // Ref mirror of "is scrubbing in progress?". Needed because pointermove
  // fires synchronously after pointerdown in the same tick, before React has
  // applied the scrubRatio state update — so the move handler's closure
  // would still see scrubRatio == null and bail out, breaking drag-to-seek.
  // The ref is the source of truth for the gate; scrubRatio is purely visual.
  const scrubbingRef = useRef(false);
  const trackRef = useRef(null);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setScrubRatio(null);
    setResolvedDuration(
      Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : null,
    );
  }, [audio?.audioDataUrl, audio?.duration]);

  // Bubble play state up so the playlist can show a pause icon on the
  // currently playing row (Spotify-style "now playing" indicator).
  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  // Toggle play/pause whenever the parent bumps playToggleKey. Skip the
  // first render (key=0) so opening a note doesn't auto-play.
  const playToggleSeenRef = useRef(0);
  useEffect(() => {
    if (playToggleKey === playToggleSeenRef.current) return;
    playToggleSeenRef.current = playToggleKey;
    if (playToggleKey === 0) return;
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => { /* autoplay blocked */ });
    } else {
      el.pause();
    }
  }, [playToggleKey]);

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
    try { el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    scrubbingRef.current = true;
    const r = ratioFromEvent(e.clientX);
    setScrubRatio(r);
  };
  const onPointerMove = (e) => {
    if (!scrubbingRef.current) return;
    e.stopPropagation();
    setScrubRatio(ratioFromEvent(e.clientX));
  };
  const onPointerUp = (e) => {
    if (!scrubbingRef.current) return;
    e.stopPropagation();
    scrubbingRef.current = false;
    const final = ratioFromEvent(e.clientX);
    seekToRatio(final);
    setScrubRatio(null);
    try { trackRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const onTrackKeyDown = (e) => {
    if (!duration) return;
    const step = e.shiftKey ? 5 : 1;
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

  // Card variant lives inside a closed NoteCard. The card's job is to open
  // the modal on click — so the player must NOT swallow pointer events
  // (no stopPropagation, no functional play/seek). It's a static visual
  // indicator; the user opens the note to actually play.
  if (variant === "card") {
    return (
      <div className={`audio-player audio-player--card ${className}`}>
        <CardLayout duration={duration} />
      </div>
    );
  }

  return (
    <div
      className={`audio-player audio-player--hero ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <HeroLayout
        ratio={ratio}
        duration={duration}
        currentTime={scrubRatio != null ? scrubRatio * duration : currentTime}
        playing={playing}
        togglePlay={togglePlay}
        onTrackPointerDown={onPointerDown}
        onTrackPointerMove={onPointerMove}
        onTrackPointerUp={onPointerUp}
        onTrackKeyDown={onTrackKeyDown}
        trackRef={trackRef}
        showDownload={showDownload}
        audio={audio}
        title={title}
        showClipNav={showClipNav}
        clipIndex={clipIndex}
        clipCount={clipCount}
        onPrevClip={onPrevClip}
        onNextClip={onNextClip}
        onAddRecording={onAddRecording}
        addRecordingLabel={addRecordingLabel}
      />

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

function CardLayout({ duration }) {
  // Static, non-interactive preview. The whole NoteCard is the click target
  // (it opens the modal); the player is just a visual cue that this is an
  // audio note. No play handler, no scrubber — everything is `pointer-events:
  // none` so clicks reach the underlying card.
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-black/[0.04] dark:bg-white/[0.06] shadow-sm pointer-events-none select-none">
      <div
        className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full text-white shadow-md"
        style={{ backgroundColor: `var(--audio-accent, ${FALLBACK_ACCENT})` }}
        aria-hidden="true"
      >
        <PlayGlyph />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">
          <MicIcon />
          <span>{t("audioRecording")}</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-black/15 dark:bg-white/20 overflow-hidden">
          <div
            className="h-full w-1/4 rounded-full"
            style={{ backgroundColor: `var(--audio-accent, ${FALLBACK_ACCENT})` }}
          />
        </div>
      </div>
      <span className="shrink-0 tabular-nums text-xs font-semibold opacity-90">
        {formatDuration(duration)}
      </span>
    </div>
  );
}

function HeroLayout({
  ratio, duration, currentTime, playing, togglePlay,
  onTrackPointerDown, onTrackPointerMove, onTrackPointerUp, onTrackKeyDown,
  trackRef, showDownload, audio, title,
  showClipNav, clipIndex, clipCount, onPrevClip, onNextClip,
  onAddRecording, addRecordingLabel,
}) {
  const showActionRow = (showDownload && audio?.audioDataUrl) || !!onAddRecording;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/15 dark:border-white/15 bg-white/55 dark:bg-black/35 shadow-md backdrop-blur-sm">
      {/* Decorative blurred orbs in the accent color, gives the music-app glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-10 w-36 h-36 rounded-full opacity-40 blur-3xl"
        style={{ backgroundColor: `var(--audio-accent, ${FALLBACK_ACCENT})` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -left-10 w-44 h-44 rounded-full opacity-30 blur-3xl"
        style={{ backgroundColor: `var(--audio-accent, ${FALLBACK_ACCENT})` }}
      />

      <div className="relative px-5 py-5 sm:px-6 sm:py-6 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-2 w-full">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg"
            style={{ backgroundColor: `var(--audio-accent, ${FALLBACK_ACCENT})` }}
          >
            <MicrophoneFilledIcon className="w-7 h-7" />
          </div>
          <ClipTitle
            audio={audio}
            clipIndex={clipIndex}
          />
          {showClipNav && clipCount > 1 && (
            <div className="text-[11px] uppercase tracking-wider font-semibold opacity-70" aria-live="polite">
              {t("audioClipCounter")
                .replace("{current}", String(clipIndex + 1))
                .replace("{total}", String(clipCount))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 sm:gap-4">
          {showClipNav && (
            <NavButton
              direction="back"
              onClick={onPrevClip}
              disabled={clipIndex <= 0}
              ariaLabel={t("audioPrevClip")}
            />
          )}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? t("audioPause") : t("audioPlay")}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full text-white shadow-xl active:scale-95 transition focus:outline-none focus:ring-4 focus:ring-offset-1"
            style={{ backgroundColor: `var(--audio-accent, ${FALLBACK_ACCENT})` }}
          >
            {playing ? <PauseGlyph large /> : <PlayGlyph large />}
          </button>
          {showClipNav && (
            <NavButton
              direction="forward"
              onClick={onNextClip}
              disabled={clipIndex >= clipCount - 1}
              ariaLabel={t("audioNextClip")}
            />
          )}
        </div>

        <div className="w-full flex flex-col gap-1.5">
          <ProgressTrack
            ratio={ratio}
            trackRef={trackRef}
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            onKeyDown={onTrackKeyDown}
          />
          <div className="flex justify-between text-xs tabular-nums font-medium opacity-90">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {showActionRow && (
          <div className="w-full flex items-center justify-center gap-2">
            {showDownload && audio?.audioDataUrl && (
              <DownloadMenu audio={audio} title={title} />
            )}
            {onAddRecording && (
              <button
                type="button"
                onClick={onAddRecording}
                aria-label={addRecordingLabel || t("audioAddRecording")}
                data-tooltip={addRecordingLabel || t("audioAddRecording")}
                className="shrink-0 inline-flex items-center justify-center border border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 shadow-sm hover:shadow-md hover:scale-[1.03] active:scale-[0.98] transition focus:outline-none focus:ring-2
                  w-10 h-10 rounded-full
                  sm:w-auto sm:h-auto sm:rounded-full sm:px-4 sm:py-2 sm:gap-2"
                style={{ color: `var(--audio-accent, ${FALLBACK_ACCENT})` }}
              >
                {/* Mic icon with '+' badge — shown on both mobile and desktop */}
                <span className="relative inline-flex items-center justify-center">
                  <MicIcon />
                  <svg viewBox="0 0 8 8" className="absolute -top-2 -right-2 w-3 h-3" aria-hidden="true">
                    <circle cx="4" cy="4" r="4" fill="currentColor" />
                    <path d="M4 2v4M2 4h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                {/* Label shown on desktop only */}
                <span className="hidden sm:block text-sm font-semibold">
                  {addRecordingLabel || t("audioAddRecording")}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressTrack({ ratio, trackRef, onPointerDown, onPointerMove, onPointerUp, onKeyDown, compact = false }) {
  const filledColor = `var(--audio-accent, ${FALLBACK_ACCENT})`;
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
      className={`relative w-full ${compact ? "h-1.5" : "h-2"} rounded-full bg-black/20 dark:bg-white/20 cursor-pointer touch-none focus:outline-none`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
          backgroundColor: filledColor,
        }}
      />
      <div
        className={`absolute -top-1.5 ${compact ? "w-3 h-3" : "w-4 h-4"} rounded-full bg-white transition-transform pointer-events-none`}
        style={{
          left: `calc(${Math.min(100, Math.max(0, ratio * 100))}% - ${compact ? "6px" : "8px"})`,
          boxShadow: `0 0 0 2px ${filledColor}, 0 1px 3px rgba(0,0,0,0.3)`,
        }}
      />
    </div>
  );
}

function NavButton({ direction, onClick, disabled, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-tooltip={ariaLabel}
      className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/80 dark:bg-white/15 hover:bg-white dark:hover:bg-white/25 active:scale-95 transition focus:outline-none focus:ring-2 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm border border-black/10 dark:border-white/15"
      style={{ color: `var(--audio-accent, ${FALLBACK_ACCENT})` }}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {direction === "back" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}

function ClipTitle({ audio, clipIndex }) {
  const fallback = t("audioClipDefaultName").replace("{n}", String((clipIndex || 0) + 1));
  const name = (audio?.name && audio.name.trim()) || fallback;
  return (
    <div
      className="text-base sm:text-lg font-semibold text-center truncate w-full px-2"
      title={name}
    >
      {name}
    </div>
  );
}

function PlayGlyph({ large = false }) {
  return <PlayFilledIcon className={large ? "w-7 h-7" : "w-4 h-4"} />;
}

function PauseGlyph({ large = false }) {
  return <PauseFilledIcon className={large ? "w-7 h-7" : "w-4 h-4"} />;
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

  const downloadMp3 = async () => {
    setError(null);
    setBusy(true);
    try {
      const inputBlob = dataUrlToBlob(audio.audioDataUrl);
      const mp3 = await convertAudioToMp3(inputBlob);
      await triggerBlobDownload(`${baseName}.mp3`, mp3);
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
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
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
