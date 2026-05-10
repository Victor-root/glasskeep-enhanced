import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import { MicIcon, MicrophoneFilledIcon } from "../../icons/index.jsx";
import useAudioRecorder, {
  RECORDER_STATE,
  RECORDER_ERROR,
} from "../../hooks/useAudioRecorder.js";
import {
  AUDIO_MAX_TOTAL_BYTES,
  blobToDataUrl,
  formatDuration,
  makeClip,
  parseAudioContent,
  serializeAudioContent,
  totalClipsBytes,
} from "../../utils/audioNote.js";
import AudioPlayer from "./AudioPlayer.jsx";
import ClipList from "./ClipList.jsx";
import StorageGauge from "./StorageGauge.jsx";

// AudioNoteEditor — body of an audio note inside the standard NoteModal.
//
// Reads/writes the note via setBody(serialize(...)). Holds no persisted
// state of its own; the surrounding modal owns autosave (just like the
// drawing editor for draw notes).
//
// UI states:
//  - 0 clips:  big "tap to record" CTA (recorder inline)
//  - ≥1 clip:  themed player for current clip + prev/next + add/delete
//  - recording: pulsing mic + timer + cancel/stop, on top of the same
//               coloured shell so the modal layout never jumps.
//
// Notes:
//  - clip.id is the React key for navigation; ordering is insertion order.
//  - On stop, the new clip becomes the current selection so the user
//    immediately hears their take. Cancel discards in the recorder hook.

export default function AudioNoteEditor({ body, setBody, title }) {
  const parsed = useMemo(() => parseAudioContent(body), [body]);
  const clips = parsed.clips;

  // currentIndex tracks the clip the player is showing. Defaults to 0; clamps
  // automatically when clips are added/removed so the carousel never points
  // at a missing clip.
  const [currentIndex, setCurrentIndex] = useState(0);
  useEffect(() => {
    if (currentIndex >= clips.length) {
      setCurrentIndex(Math.max(0, clips.length - 1));
    }
  }, [clips.length, currentIndex]);

  const [recording, setRecording] = useState(false);
  const [saveError, setSaveError] = useState(null);
  // Mirrors the player's playing state so the playlist row can show a
  // "now playing" pause icon. AudioPlayer pushes updates via onPlayingChange.
  const [playerPlaying, setPlayerPlaying] = useState(false);
  // Bumped each time the user clicks a clip in the playlist. AudioPlayer
  // toggles play/pause when the key changes — so clicking the current row
  // pauses, clicking a different row plays it.
  const [playToggleKey, setPlayToggleKey] = useState(0);
  const onPlayClip = useCallback((i) => {
    setCurrentIndex(i);
    setPlayToggleKey((k) => k + 1);
  }, []);

  const writeClips = useCallback(
    (nextClips) => {
      setBody(serializeAudioContent({ clips: nextClips, text: parsed.text }));
    },
    [setBody, parsed.text],
  );

  const onRecorderSave = useCallback(
    async ({ audioDataUrl, mimeType, duration, size }) => {
      const newClip = makeClip({ audioDataUrl, mimeType, duration, size });
      const next = [...clips, newClip];
      const projected = totalClipsBytes(next);
      if (projected > AUDIO_MAX_TOTAL_BYTES) {
        setSaveError(t("audioRecordingTooLarge"));
        return false;
      }
      writeClips(next);
      setCurrentIndex(next.length - 1);
      setRecording(false);
      setSaveError(null);
      return true;
    },
    [clips, writeClips],
  );

  const onDeleteIndex = useCallback(
    (idx) => {
      if (idx < 0 || idx >= clips.length) return;
      const next = clips.filter((_, i) => i !== idx);
      writeClips(next);
      // Keep the currently-playing clip pointed at a sensible neighbour:
      // if we deleted what was current (or earlier), shift left by one.
      setCurrentIndex((cur) => {
        if (next.length === 0) return 0;
        if (idx < cur) return Math.max(0, cur - 1);
        if (idx === cur) return Math.max(0, Math.min(cur, next.length - 1));
        return Math.min(cur, next.length - 1);
      });
    },
    [clips, writeClips],
  );

  const onRenameIndex = useCallback(
    (idx, name) => {
      if (idx < 0 || idx >= clips.length) return;
      const next = clips.map((c, i) => (i === idx ? { ...c, name } : c));
      writeClips(next);
    },
    [clips, writeClips],
  );

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : 0));
  }, []);
  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i < clips.length - 1 ? i + 1 : i));
  }, [clips.length]);

  const startRecording = useCallback(() => {
    setSaveError(null);
    setRecording(true);
  }, []);
  const cancelRecording = useCallback(() => {
    setRecording(false);
  }, []);

  // Total bytes already on disk for this note's clips. Used to drive the
  // storage gauge (and the live total during recording = existing + chunks).
  const existingTotalBytes = totalClipsBytes(clips);

  if (recording) {
    return (
      <RecorderPanel
        onCancel={cancelRecording}
        onSave={onRecorderSave}
        existingTotalBytes={existingTotalBytes}
      />
    );
  }

  if (clips.length === 0) {
    return (
      <EmptyState onStart={startRecording} />
    );
  }

  const current = clips[Math.min(currentIndex, clips.length - 1)];
  // Display title used for the download filename: prefer the per-clip name,
  // fall back to the note title so single-clip downloads still get a
  // meaningful filename like "Meeting.webm".
  const playerTitle = (current?.name && current.name.trim()) || title || "";
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Player: fixed at the top of the body, never scrolls. */}
      <div className="shrink-0">
        <AudioPlayer
          audio={current}
          title={playerTitle}
          variant="hero"
          showDownload
          showClipNav={clips.length > 1}
          clipIndex={currentIndex}
          clipCount={clips.length}
          onPrevClip={goPrev}
          onNextClip={goNext}
          playToggleKey={playToggleKey}
          onPlayingChange={setPlayerPlaying}
          onAddRecording={startRecording}
        />
      </div>
      {/* Playlist: takes the remaining space and scrolls internally so the
          modal itself never grows a scrollbar of its own.
          Two-layer setup so the scrollbar's TRACK (not just the thumb)
          gets clipped at the rounded right corners:
            - Outer: rounded frame + border + bg, overflow-hidden so it
              acts as the clipping mask.
            - Inner: full-height, holds overflow-y-auto + the themed
              scrollbar styling. The scrollbar sits flush against the
              right edge of the outer frame and its rectangular track
              follows the outer's border-radius. */}
      <div className="flex-1 min-h-0 rounded-xl border border-black/15 dark:border-white/15 bg-white/55 dark:bg-black/20 overflow-hidden">
        <div className="h-full overflow-y-auto modal-scroll-themed">
          <ClipList
            clips={clips}
            currentIndex={currentIndex}
            isPlaying={playerPlaying}
            onPlayClip={onPlayClip}
            onRenameClip={onRenameIndex}
            onDeleteClip={onDeleteIndex}
          />
        </div>
      </div>
      {saveError && (
        <div role="alert" className="text-sm rounded-lg px-3 py-2 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 shrink-0">
          {saveError}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onStart }) {
  return (
    // flex-1 + justify-center: modal is now a fixed height, so this keeps
    // the empty CTA optically centred instead of clinging to the top edge.
    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg"
        style={{ backgroundColor: "var(--audio-accent, #7c3aed)" }}
      >
        <MicrophoneFilledIcon className="w-9 h-9" />
      </div>
      <div className="text-sm text-center text-gray-600 dark:text-gray-300 max-w-xs">
        {t("audioNoteEmptyHint")}
      </div>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
      >
        <MicIcon />
        <span>{t("audioStartRecording")}</span>
      </button>
    </div>
  );
}

function RecorderPanel({ onCancel, onSave, existingTotalBytes = 0 }) {
  const recorder = useAudioRecorder();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Stable handles for the latest onSave + saving guard. Without these we'd
  // either need `onSave` in the save effect's deps (which makes the effect
  // re-run + cancel its in-flight save when the parent rerenders), or a
  // stale closure. Refs sidestep both — the effect runs once per state
  // transition to READY and reads the freshest onSave at that moment.
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  const savingRef = useRef(false);

  // Auto-start when the panel mounts so the user only ever clicks once
  // ("add recording" button) before recording begins. Permission prompt
  // will surface here. If the user declines or recording isn't supported,
  // recorder.error handles the messaging.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    recorder.start();
    return () => {
      // Cancel any in-flight recording when this panel is unmounted.
      // Safe even after a successful save: cancel() is a no-op once the
      // recorder has reset to IDLE post-save.
      recorder.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = () => {
    recorder.stop();
  };

  const handleCancel = () => {
    recorder.cancel();
    onCancel?.();
  };

  // When the recorder reaches READY, push the result up to the editor
  // immediately. We deliberately keep `saving` and `onSave` OUT of this
  // effect's deps: those values would force the effect to re-run mid-save,
  // and the cleanup `cancelled = true` would abort the in-flight save —
  // resulting in a recording that gets captured but never reaches the note.
  // Use refs to read the freshest values without triggering re-runs.
  useEffect(() => {
    if (recorder.state !== RECORDER_STATE.READY || !recorder.result) return;
    if (savingRef.current) return;
    savingRef.current = true;
    let cancelled = false;
    setSaving(true);
    setError(null);
    (async () => {
      try {
        const dataUrl = await blobToDataUrl(recorder.result.blob);
        if (cancelled) return;
        const ok = await onSaveRef.current?.({
          audioDataUrl: dataUrl,
          mimeType: recorder.result.mimeType,
          duration: recorder.result.duration,
          size: recorder.result.size,
        });
        if (!ok) {
          setError(t("audioRecordingFailed"));
          setSaving(false);
          savingRef.current = false;
        }
      } catch {
        if (!cancelled) {
          setError(t("audioRecordingFailed"));
          setSaving(false);
          savingRef.current = false;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [recorder.state, recorder.result]);

  const errorMessage = (() => {
    if (error) return error;
    if (recorder.error === RECORDER_ERROR.NOT_SUPPORTED) return t("audioRecordingNotSupported");
    if (recorder.error === RECORDER_ERROR.PERMISSION_DENIED) return t("audioPermissionDenied");
    if (recorder.error === RECORDER_ERROR.EMPTY) return t("audioRecordingEmpty");
    if (recorder.error === RECORDER_ERROR.RECORDING_FAILED) return t("audioRecordingFailed");
    return null;
  })();

  const isRecording = recorder.state === RECORDER_STATE.RECORDING;
  const isPaused = recorder.state === RECORDER_STATE.PAUSED;
  const isStopping = recorder.state === RECORDER_STATE.STOPPING;
  const isReady = recorder.state === RECORDER_STATE.READY;
  const isError = recorder.state === RECORDER_STATE.ERROR;
  const isFinalizing = isStopping || isReady || saving;

  return (
    // Same centring trick as EmptyState: modal height is fixed, so the
    // recorder UI sits in the middle rather than pinned to the top.
    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-4">
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg transition-colors ${
          isRecording ? "bg-rose-500 animate-pulse"
          : isPaused ? "bg-amber-500"
          : isError ? "bg-gray-400 dark:bg-gray-600"
          : isFinalizing ? "" // accent color via inline style
          : "bg-rose-400/80"
        }`}
        style={isFinalizing && !isError && !isPaused && !isRecording ? { backgroundColor: "var(--audio-accent, #7c3aed)" } : undefined}
        aria-label={isRecording ? t("audioRecordingInProgress") : t("audioRecording")}
      >
        <MicrophoneFilledIcon className="w-9 h-9" />
      </div>
      <div className="text-3xl font-semibold tabular-nums">
        {formatDuration(recorder.elapsed)}
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-300 min-h-[1em]">
        {isRecording ? t("audioRecordingInProgress")
          : isPaused ? t("audioRecordingPaused")
          : isFinalizing ? t("audioFinalizing")
          : ""}
      </div>
      {/* Live storage gauge — pulses while recording so the user can see
          their note filling up before they hit the cap. */}
      <div className="w-full max-w-sm px-2">
        <StorageGauge
          usedBytes={existingTotalBytes + recorder.currentBytes}
          live={isRecording}
          variant="bar"
        />
      </div>

      {errorMessage && (
        <div role="alert" className="text-sm rounded-lg px-3 py-2 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 max-w-sm text-center">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="px-4 py-2 rounded-full text-sm border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          {t("audioCancelRecording")}
        </button>
        {isRecording && (
          <button
            type="button"
            onClick={() => recorder.pause()}
            className="px-4 py-2 rounded-full text-sm bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.98] transition focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          >
            {t("audioPauseRecording")}
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            onClick={() => recorder.resume()}
            className="px-4 py-2 rounded-full text-sm bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.98] transition focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          >
            {t("audioResumeRecording")}
          </button>
        )}
        {(isRecording || isPaused) && (
          <button
            type="button"
            onClick={handleStop}
            disabled={saving}
            className="px-4 py-2 rounded-full text-sm bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition focus:outline-none focus:ring-2 focus:ring-rose-400/50 disabled:opacity-50"
          >
            {t("audioStopRecording")}
          </button>
        )}
        {isError && (
          <button
            type="button"
            onClick={() => { recorder.reset(); recorder.start(); }}
            className="px-4 py-2 rounded-full text-sm bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition focus:outline-none focus:ring-2 focus:ring-rose-400/50"
          >
            {t("audioStartRecording")}
          </button>
        )}
      </div>
    </div>
  );
}
