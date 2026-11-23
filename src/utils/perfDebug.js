// Smoothness trace for debug builds of the Android app, which expose
// window.AndroidPerfDebug (android/.../PerfDebug.kt): it writes to logcat
// under the GKPerf tag. Everywhere else (release APK, browsers) the bridge
// is absent and this does nothing.

const CAPTURE_MS = 1500;
let described = false;

const round = (n) => Math.round(n * 10) / 10;

function send(bridge, message) {
  try { bridge.log(message); } catch { /* debug trace is best-effort */ }
}

// The long frames of the capture (over 50 ms, as the browser reports them),
// split into scripts, style and layout, and painting.
function describeLongFrame(frame, origin) {
  const end = frame.startTime + frame.duration;
  const render = frame.renderStart ? end - frame.renderStart : 0;
  const styleLayout = frame.styleAndLayoutStart ? end - frame.styleAndLayoutStart : 0;
  const scripts = (frame.scripts || []).map((s) =>
    `${s.invokerType}:${s.invoker} ${round(s.duration)}ms forced=${round(s.forcedStyleAndLayoutDuration)}` +
    ` ${s.sourceFunctionName || "?"}@${(s.sourceURL || "").split("/").pop()}:${s.sourceCharPosition}`,
  );
  return `long frame at +${round(frame.startTime - origin)}ms: ${round(frame.duration)}ms, blocking ${round(frame.blockingDuration)},` +
    ` render ${round(render)} (style+layout ${round(styleLayout)}), scripts [${scripts.join(" | ")}]`;
}

/**
 * Logs the next moments of an animation that `label` starts. Android logs
 * every frame it draws; the page logs the gaps between its own frames, its
 * long frames with the scripts in them, and how long the tap that started it
 * took to answer and to show.
 */
export function perfCapture(label) {
  const bridge = typeof window !== "undefined" ? window.AndroidPerfDebug : null;
  if (!bridge) return;
  try { bridge.capture(label, CAPTURE_MS); } catch { return; }
  if (!described) {
    described = true;
    send(bridge, `page: ${navigator.userAgent}, ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`);
  }
  const origin = performance.now();
  const gaps = [];
  const entries = [];
  const observers = [];
  const supported = PerformanceObserver.supportedEntryTypes || [];
  for (const type of ["long-animation-frame", "event"]) {
    if (!supported.includes(type)) continue;
    const observer = new PerformanceObserver((list) => entries.push(...list.getEntries()));
    observer.observe(type === "event" ? { type, buffered: true, durationThreshold: 16 } : { type, buffered: true });
    observers.push(observer);
  }

  const report = () => {
    for (const observer of observers) observer.disconnect();
    const sorted = [...gaps].sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length / 2)] || 0;
    const late = gaps.filter((g) => g > typical * 1.5).length;
    send(bridge, `${label}: page frames ${gaps.length}, typical gap ${round(typical)}ms, late ${late}, longest ${round(sorted.at(-1) || 0)}ms`);
    send(bridge, `${label}: page gaps ${gaps.map((g) => Math.round(g)).join(" ")}`);
    for (const e of entries) {
      if (e.startTime < origin - 1000) continue;
      if (e.entryType === "event") {
        send(bridge, `${label}: ${e.name} at +${round(e.startTime - origin)}ms, waited ${round(e.processingStart - e.startTime)}ms,` +
          ` handled in ${round(e.processingEnd - e.processingStart)}ms, shown after ${round(e.duration)}ms`);
      } else {
        send(bridge, `${label}: ${describeLongFrame(e, origin)}`);
      }
    }
  };

  let last = origin;
  const tick = (now) => {
    gaps.push(now - last);
    last = now;
    if (now - origin < CAPTURE_MS) requestAnimationFrame(tick);
    else report();
  };
  requestAnimationFrame(tick);
}
