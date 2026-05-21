// Generate a short, discreet notification "ding" via Web Audio API.
//
// Synthesised on the fly so there's no audio asset to bundle and the
// volume / pitch is fully under our control. The sound is two soft
// sine tones (~880 Hz then ~660 Hz) at low gain with a fast attack
// and short decay — pleasant but easy to miss if you're not paying
// attention, which is exactly what the user asked for ("vraiment
// discret").
//
// Browsers require a user gesture before audio can play. We don't
// attempt to bypass that: the first `notify()` call on a freshly-
// loaded page may not produce sound if the user hasn't interacted
// yet. That's a feature, not a bug.

let audioCtx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    try { audioCtx = new AC(); } catch (_e) { return null; }
  }
  // Resume on demand — Chrome suspends the context on idle pages.
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function blip(ctx, freq, startOffset, durationMs, peakGain) {
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  // Envelope: 8 ms attack, then exponential decay to silence.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

export function playNotificationDing() {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    // Two-tone ding: high then slightly lower. Low gain (0.05) keeps
    // the sound subdued at default system volume.
    blip(ctx, 880, 0, 140, 0.05);
    blip(ctx, 660, 0.07, 200, 0.04);
  } catch (_e) {
    // Some browsers throw if the context was closed; nothing to do.
  }
}

export default playNotificationDing;
