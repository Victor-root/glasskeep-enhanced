import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import { CloseIcon, MicIcon } from "../../icons/index.jsx";
import useAudioRecorder, {
  RECORDER_STATE,
  RECORDER_ERROR,
} from "../../hooks/useAudioRecorder.js";
import {
  AUDIO_MAX_BYTES,
  blobToDataUrl,
  formatDuration,
} from "../../utils/audioNote.js";
import AudioPlayer from "./AudioPlayer.jsx";

// Modal that captures a microphone recording and hands the resulting blob +
// metadata up to the parent via onSave. Handles permission, fallback messages
// for unsupported browsers, pause/resume, cancel, and a preview before save.
//
// Mounted at the App.jsx orchestration layer; all UI lives here.

export default function AudioRecorderModal({
  open,
  dark,
  onClose,
  onSave,
}) {
  const recorder = useAudioRecorder();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Reset state every time the modal opens, ensuring a clean recorder for the
  // next session even if the previous one ended in an error.
  useEffect(() => {
    if (open) {
      setTitle("");
      setSaveError(null);
      setSaving(false);
      recorder.reset();
    } else {
      // Closing while a recording is active: cancel it so the mic indicator
      // doesn't stay on. cancel() is idempotent if there's nothing to stop.
      recorder.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc key closes the modal (unless mid-recording — user must explicitly stop/cancel).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (
        recorder.state === RECORDER_STATE.RECORDING ||
        recorder.state === RECORDER_STATE.PAUSED ||
        saving
      ) return;
      onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, recorder.state, saving, onClose]);

  if (!open) return null;

  const errorMessage = (() => {
    if (saveError) return saveError;
    if (recorder.error === RECORDER_ERROR.NOT_SUPPORTED)
      return t("audioRecordingNotSupported");
    if (recorder.error === RECORDER_ERROR.PERMISSION_DENIED)
      return t("audioPermissionDenied");
    if (recorder.error === RECORDER_ERROR.EMPTY)
      return t("audioRecordingEmpty");
    if (recorder.error === RECORDER_ERROR.RECORDING_FAILED)
      return t("audioRecordingFailed");
    return null;
  })();

  const isBusy = saving;
  const canCloseFreely =
    recorder.state !== RECORDER_STATE.RECORDING &&
    recorder.state !== RECORDER_STATE.PAUSED &&
    !saving;

  const handleBackdropClick = () => {
    if (!canCloseFreely) return;
    onClose?.();
  };

  const handleClose = () => {
    if (!canCloseFreely) return;
    onClose?.();
  };

  const previewAudio = recorder.result
    ? {
        audioDataUrl: recorder.result.url, // play directly from blob URL during preview
        mimeType: recorder.result.mimeType,
        duration: recorder.result.duration,
        size: recorder.result.size,
      }
    : null;

  const onSaveClick = async () => {
    if (!recorder.result || saving) return;
    setSaveError(null);
    if (recorder.result.size > AUDIO_MAX_BYTES) {
      setSaveError(t("audioRecordingTooLarge"));
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await blobToDataUrl(recorder.result.blob);
      await onSave?.({
        title: title.trim(),
        audioDataUrl: dataUrl,
        mimeType: recorder.result.mimeType,
        duration: recorder.result.duration,
        size: recorder.result.size,
      });
    } catch {
      setSaveError(t("audioRecordingFailed"));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={handleBackdropClick}
      />
      <div
        className="glass-card rounded-2xl shadow-2xl w-[92%] max-w-md relative overflow-hidden"
        style={{ backgroundColor: dark ? "#282828" : "#ffffff" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <span className="inline-flex items-center text-rose-600 dark:text-rose-300"><MicIcon /></span>
          <h2 className="text-base font-semibold flex-1">{t("audioRecording")}</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={!canCloseFreely}
            aria-label={t("close")}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("noteTitle")}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-light)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={isBusy}
          />

          <RecorderStage recorder={recorder} previewAudio={previewAudio} title={title} />

          {errorMessage && (
            <div
              role="alert"
              className="text-sm rounded-lg px-3 py-2 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
            >
              {errorMessage}
            </div>
          )}

          <RecorderControls
            recorder={recorder}
            saving={saving}
            onCancel={() => {
              recorder.cancel();
              onClose?.();
            }}
            onSave={onSaveClick}
          />
        </div>
      </div>
    </div>
  );
}

function RecorderStage({ recorder, previewAudio, title }) {
  const { state, elapsed } = recorder;

  // Big circular timer / status while no preview yet.
  if (state === RECORDER_STATE.READY && previewAudio) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
          {t("audioReady")}
        </div>
        <AudioPlayer audio={previewAudio} title={title} variant="hero" showDownload={false} />
      </div>
    );
  }

  const isRecording = state === RECORDER_STATE.RECORDING;
  const isPaused = state === RECORDER_STATE.PAUSED;
  const isRequesting = state === RECORDER_STATE.REQUESTING;

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <div
        className={`w-24 h-24 rounded-full flex items-center justify-center text-white transition-colors ${
          isRecording
            ? "bg-rose-500 shadow-lg shadow-rose-500/40 animate-pulse"
            : isPaused
              ? "bg-amber-500 shadow-md shadow-amber-500/30"
              : isRequesting
                ? "bg-indigo-500"
                : "bg-gray-300 dark:bg-gray-700"
        }`}
      >
        <span className="scale-150"><MicIcon /></span>
      </div>
      <div className="text-3xl font-semibold tabular-nums">
        {formatDuration(elapsed)}
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-300">
        {isRecording
          ? t("audioRecordingInProgress")
          : isPaused
            ? t("audioRecordingPaused")
            : isRequesting
              ? "…"
              : ""}
      </div>
    </div>
  );
}

function RecorderControls({ recorder, saving, onCancel, onSave }) {
  const { state, supported, start, pause, resume, stop, reset, result } = recorder;

  if (!supported) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
          onClick={onCancel}
        >
          {t("close")}
        </button>
      </div>
    );
  }

  // Idle / error states: big "Start" + "Cancel"
  if (
    state === RECORDER_STATE.IDLE ||
    state === RECORDER_STATE.ERROR ||
    state === RECORDER_STATE.STOPPING
  ) {
    return (
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
        >
          {t("audioCancelRecording")}
        </button>
        <button
          type="button"
          onClick={() => start()}
          className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-rose-500"
        >
          {state === RECORDER_STATE.ERROR && recorder.error === RECORDER_ERROR.PERMISSION_DENIED
            ? t("audioRequestPermission")
            : t("audioStartRecording")}
        </button>
      </div>
    );
  }

  if (state === RECORDER_STATE.REQUESTING) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          disabled
          className="px-4 py-2 rounded-lg bg-rose-600/70 text-white cursor-wait"
        >
          {t("audioStartRecording")}
        </button>
      </div>
    );
  }

  if (state === RECORDER_STATE.RECORDING || state === RECORDER_STATE.PAUSED) {
    const isRecording = state === RECORDER_STATE.RECORDING;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="col-span-1 px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
        >
          {t("audioCancelRecording")}
        </button>
        <button
          type="button"
          onClick={() => (isRecording ? pause() : resume())}
          className="col-span-1 px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {isRecording ? t("audioPauseRecording") : t("audioResumeRecording")}
        </button>
        <button
          type="button"
          onClick={() => stop()}
          className="col-span-2 sm:col-span-1 px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-rose-500"
        >
          {t("audioStopRecording")}
        </button>
      </div>
    );
  }

  if (state === RECORDER_STATE.READY && result) {
    return (
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          {t("audioCancelRecording")}
        </button>
        <button
          type="button"
          onClick={() => reset()}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          {t("audioReRecord")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-wait"
        >
          {saving ? `${t("audioSaveRecording")}…` : t("audioSaveRecording")}
        </button>
      </div>
    );
  }

  return null;
}
