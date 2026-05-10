import { useCallback, useEffect, useRef, useState } from "react";
import { pickSupportedAudioMime } from "../utils/audioNote.js";

// useAudioRecorder — thin wrapper around MediaRecorder.
//
// Responsibilities:
//  - Request the microphone only when the caller invokes start().
//  - Track recording state (idle | requesting | recording | paused | stopping | ready | error).
//  - Stream chunks into a Blob, expose its size/duration on stop.
//  - Always release the mic tracks in stop(), cancel(), and on unmount, so
//    the browser's recording indicator goes away when we're done.
//  - Surface a typed `error` so the modal can show the right i18n string.

export const RECORDER_STATE = Object.freeze({
  IDLE: "idle",
  REQUESTING: "requesting",
  RECORDING: "recording",
  PAUSED: "paused",
  STOPPING: "stopping",
  READY: "ready",
  ERROR: "error",
});

export const RECORDER_ERROR = Object.freeze({
  NOT_SUPPORTED: "not_supported",
  PERMISSION_DENIED: "permission_denied",
  RECORDING_FAILED: "recording_failed",
  EMPTY: "empty",
});

function isRecorderSupported() {
  return (
    typeof window !== "undefined" &&
    !!window.MediaRecorder &&
    !!navigator?.mediaDevices?.getUserMedia
  );
}

export default function useAudioRecorder() {
  const [state, setState] = useState(
    isRecorderSupported() ? RECORDER_STATE.IDLE : RECORDER_STATE.ERROR,
  );
  const [error, setError] = useState(
    isRecorderSupported() ? null : RECORDER_ERROR.NOT_SUPPORTED,
  );
  const [elapsed, setElapsed] = useState(0); // seconds (whole)
  const [result, setResult] = useState(null); // { blob, mimeType, duration, size, url }

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startTsRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pausedAtRef = useRef(0);
  const tickTimerRef = useRef(null);
  const blobUrlRef = useRef(null);

  const supported = isRecorderSupported();

  const stopTick = () => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  };

  const releaseStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      try {
        s.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
    }
    streamRef.current = null;
  }, []);

  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      try { URL.revokeObjectURL(blobUrlRef.current); } catch { /* ignore */ }
      blobUrlRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopTick();
    releaseStream();
    revokeBlobUrl();
    chunksRef.current = [];
    recorderRef.current = null;
    startTsRef.current = 0;
    pausedAccumRef.current = 0;
    pausedAtRef.current = 0;
    setElapsed(0);
    setResult(null);
    setError(null);
    setState(supported ? RECORDER_STATE.IDLE : RECORDER_STATE.ERROR);
  }, [releaseStream, revokeBlobUrl, supported]);

  useEffect(() => {
    return () => {
      // Component unmount: stop tick, kill stream, drop blob URL.
      stopTick();
      releaseStream();
      revokeBlobUrl();
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      recorderRef.current = null;
    };
  }, [releaseStream, revokeBlobUrl]);

  const start = useCallback(async () => {
    if (!supported) {
      setError(RECORDER_ERROR.NOT_SUPPORTED);
      setState(RECORDER_STATE.ERROR);
      return false;
    }
    if (
      state === RECORDER_STATE.RECORDING ||
      state === RECORDER_STATE.PAUSED ||
      state === RECORDER_STATE.REQUESTING
    ) {
      return false;
    }
    setError(null);
    setState(RECORDER_STATE.REQUESTING);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const isPermission =
        e?.name === "NotAllowedError" || e?.name === "SecurityError";
      setError(
        isPermission
          ? RECORDER_ERROR.PERMISSION_DENIED
          : RECORDER_ERROR.RECORDING_FAILED,
      );
      setState(RECORDER_STATE.ERROR);
      return false;
    }
    streamRef.current = stream;

    let mr;
    const mime = pickSupportedAudioMime();
    try {
      mr = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch {
      try {
        mr = new MediaRecorder(stream);
      } catch {
        releaseStream();
        setError(RECORDER_ERROR.RECORDING_FAILED);
        setState(RECORDER_STATE.ERROR);
        return false;
      }
    }

    chunksRef.current = [];
    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    mr.onerror = () => {
      setError(RECORDER_ERROR.RECORDING_FAILED);
      setState(RECORDER_STATE.ERROR);
      releaseStream();
      stopTick();
    };
    mr.onstop = () => {
      stopTick();
      releaseStream();
      const totalElapsed =
        ((Date.now() - startTsRef.current) - pausedAccumRef.current) / 1000;
      const blobMime = mr.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: blobMime });
      chunksRef.current = [];
      if (!blob.size) {
        setError(RECORDER_ERROR.EMPTY);
        setState(RECORDER_STATE.ERROR);
        return;
      }
      revokeBlobUrl();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setResult({
        blob,
        mimeType: blobMime,
        duration: Math.max(0, totalElapsed),
        size: blob.size,
        url,
      });
      setState(RECORDER_STATE.READY);
    };

    recorderRef.current = mr;
    startTsRef.current = Date.now();
    pausedAccumRef.current = 0;
    pausedAtRef.current = 0;
    setElapsed(0);
    try {
      mr.start(1000); // emit chunks every second so size grows incrementally
    } catch {
      releaseStream();
      setError(RECORDER_ERROR.RECORDING_FAILED);
      setState(RECORDER_STATE.ERROR);
      return false;
    }
    setState(RECORDER_STATE.RECORDING);
    tickTimerRef.current = setInterval(() => {
      const r = recorderRef.current;
      if (!r) return;
      if (r.state === "paused") return;
      const ms = (Date.now() - startTsRef.current) - pausedAccumRef.current;
      setElapsed(Math.max(0, Math.floor(ms / 1000)));
    }, 250);
    return true;
  }, [releaseStream, revokeBlobUrl, state, supported]);

  const pause = useCallback(() => {
    const r = recorderRef.current;
    if (!r || state !== RECORDER_STATE.RECORDING) return;
    try { r.pause(); } catch { return; }
    pausedAtRef.current = Date.now();
    setState(RECORDER_STATE.PAUSED);
  }, [state]);

  const resume = useCallback(() => {
    const r = recorderRef.current;
    if (!r || state !== RECORDER_STATE.PAUSED) return;
    try { r.resume(); } catch { return; }
    if (pausedAtRef.current) {
      pausedAccumRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = 0;
    }
    setState(RECORDER_STATE.RECORDING);
  }, [state]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (state === RECORDER_STATE.PAUSED && pausedAtRef.current) {
      pausedAccumRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = 0;
    }
    setState(RECORDER_STATE.STOPPING);
    try { r.stop(); } catch {
      releaseStream();
      setError(RECORDER_ERROR.RECORDING_FAILED);
      setState(RECORDER_STATE.ERROR);
    }
  }, [releaseStream, state]);

  const cancel = useCallback(() => {
    // Discard everything: stop the recorder if any, release tracks, drop blob.
    const r = recorderRef.current;
    chunksRef.current = [];
    try {
      if (r && r.state !== "inactive") {
        // Suppress onstop result handling — we discard the chunks.
        r.ondataavailable = null;
        r.onstop = null;
        r.stop();
      }
    } catch { /* ignore */ }
    recorderRef.current = null;
    reset();
  }, [reset]);

  return {
    supported,
    state,
    error,
    elapsed,
    result,
    start,
    pause,
    resume,
    stop,
    cancel,
    reset,
  };
}
