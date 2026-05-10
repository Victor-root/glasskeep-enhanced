// audioConvert.js — client-side audio format helpers.
//
// MediaRecorder produces webm/opus on Chromium/Firefox and m4a on Safari.
// We can re-encode to WAV in-browser via AudioContext.decodeAudioData and a
// hand-rolled RIFF writer (no dependencies). MP3 uses @breezystack/lamejs,
// a pure-JS port of LAME (~100 KB minified) — bundled here so the download
// menu can offer the format users most commonly ask for.
//
// All conversions return a Blob. Callers can download or re-upload them.

import { Mp3Encoder } from "@breezystack/lamejs";

export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("Not a data URL");
  }
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = (mimeMatch ? mimeMatch[1] : "application/octet-stream");
  const bin = atob(base64 || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function decodeAudioBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio API not supported");
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close?.();
  }
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// 16-bit PCM WAV encoder. Handles mono and stereo (downmixes to stereo at
// most). Float samples in [-1, 1] are clamped and scaled to Int16.
export function encodeWavFromAudioBuffer(audioBuffer) {
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  let interleaved;
  if (numChannels === 2) {
    interleaved = new Float32Array(length * 2);
    const l = audioBuffer.getChannelData(0);
    const r = audioBuffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      interleaved[i * 2] = l[i];
      interleaved[i * 2 + 1] = r[i];
    }
  } else {
    interleaved = audioBuffer.getChannelData(0);
  }

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = interleaved.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  // fmt sub-chunk
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);              // PCM fmt size
  view.setUint16(20, 1, true);               // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);              // bits per sample
  // data sub-chunk
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    let s = Math.max(-1, Math.min(1, interleaved[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, s, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function convertAudioToWav(inputBlob) {
  const audioBuffer = await decodeAudioBuffer(inputBlob);
  return encodeWavFromAudioBuffer(audioBuffer);
}

// Returns true when this browser exposes enough Web Audio surface area to
// re-encode WAV from the recorded blob. Used to gate the "WAV" menu option
// so we don't show a button that will throw on click.
export function canConvertToWav() {
  return !!(window.AudioContext || window.webkitAudioContext);
}

// MP3 encoding via @breezystack/lamejs. lamejs accepts the standard MPEG
// sample rates: 8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000.
// MediaRecorder typically captures at 48000 Hz, but if we ever encounter a
// non-standard rate we resample down to 44100 Hz first via an OfflineAudio-
// Context (best-supported MP3 rate) so the encoder doesn't reject the input.
const MP3_SUPPORTED_SAMPLE_RATES = new Set([
  8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000,
]);

async function ensureMp3CompatibleBuffer(audioBuffer) {
  if (MP3_SUPPORTED_SAMPLE_RATES.has(audioBuffer.sampleRate)) return audioBuffer;
  const targetRate = 44100;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return audioBuffer;
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const offline = new Offline(
    numChannels,
    Math.ceil(audioBuffer.duration * targetRate),
    targetRate,
  );
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0);
  return await offline.startRendering();
}

function floatToInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export async function convertAudioToMp3(inputBlob, { kbps = 192 } = {}) {
  const decoded = await decodeAudioBuffer(inputBlob);
  const buffer = await ensureMp3CompatibleBuffer(decoded);
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const left = floatToInt16(buffer.getChannelData(0));
  const right = numChannels === 2 ? floatToInt16(buffer.getChannelData(1)) : null;

  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps);
  const chunks = [];
  // 1152-sample frames are the LAME-recommended chunk size: it's the MPEG
  // frame length, so encodeBuffer can emit one MP3 frame per call.
  const blockSize = 1152;
  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const rightChunk = right ? right.subarray(i, i + blockSize) : undefined;
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) chunks.push(mp3buf);
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) chunks.push(flushed);
  return new Blob(chunks, { type: "audio/mpeg" });
}

export function canConvertToMp3() {
  return !!(window.AudioContext || window.webkitAudioContext);
}
