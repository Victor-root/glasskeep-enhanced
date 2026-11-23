package com.glasskeep.app

import android.app.Activity
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import android.view.FrameMetrics
import android.view.Window
import android.webkit.JavascriptInterface

/**
 * Debug builds only: a logcat trace, under [TAG], of how smoothly the app draws
 * while something moves. The page calls [Bridge.capture] when it starts an
 * animation (a sheet opening...); every frame Android draws for the next
 * moments is then logged with the time each stage took, and the page sends
 * its own measures of the same moments through [Bridge.log]. In release builds
 * BuildConfig.DEBUG_TOOLS is a constant false: nothing here runs and R8 drops it.
 */
class PerfDebug(private val activity: Activity) {

    private val thread = HandlerThread("GKPerf").apply { start() }
    private val handler = Handler(thread.looper)
    private var listener: Window.OnFrameMetricsAvailableListener? = null

    // Written from the page's bridge thread, read on the metrics thread.
    @Volatile private var captureLabel: String? = null
    @Volatile private var captureStartNs = 0L
    @Volatile private var captureEndNs = 0L
    private var frameIndex = 0

    fun start() {
        if (!BuildConfig.DEBUG_TOOLS || listener != null) return
        val l = Window.OnFrameMetricsAvailableListener { _, metrics, dropped ->
            onFrame(metrics, dropped)
        }
        activity.window.addOnFrameMetricsAvailableListener(l, handler)
        listener = l
    }

    fun stop() {
        listener?.let { activity.window.removeOnFrameMetricsAvailableListener(it) }
        listener = null
        thread.quitSafely()
    }

    private fun onFrame(metrics: FrameMetrics, dropped: Int) {
        val label = captureLabel ?: return
        val now = System.nanoTime()
        if (now > captureEndNs) {
            log("$label: end of capture, $frameIndex frames")
            captureLabel = null
            return
        }
        frameIndex += 1
        fun ms(id: Int) = "%.1f".format(metrics.getMetric(id) / 1_000_000.0)
        val since = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            "%.0f".format((metrics.getMetric(FrameMetrics.INTENDED_VSYNC_TIMESTAMP) - captureStartNs) / 1_000_000.0)
        else "?"
        val gpu = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            " gpu=${ms(FrameMetrics.GPU_DURATION)} deadline=${ms(FrameMetrics.DEADLINE)}"
        else ""
        log(
            "$label frame $frameIndex at +${since}ms total=${ms(FrameMetrics.TOTAL_DURATION)}" +
                " delay=${ms(FrameMetrics.UNKNOWN_DELAY_DURATION)} input=${ms(FrameMetrics.INPUT_HANDLING_DURATION)}" +
                " anim=${ms(FrameMetrics.ANIMATION_DURATION)} layout=${ms(FrameMetrics.LAYOUT_MEASURE_DURATION)}" +
                " draw=${ms(FrameMetrics.DRAW_DURATION)} sync=${ms(FrameMetrics.SYNC_DURATION)}" +
                " issue=${ms(FrameMetrics.COMMAND_ISSUE_DURATION)} swap=${ms(FrameMetrics.SWAP_BUFFERS_DURATION)}" +
                "$gpu missedBefore=$dropped"
        )
    }

    /** Exposed to the page as window.[JS_INTERFACE_NAME]. */
    inner class Bridge {
        /** Logs the next [durationMs] of frames under [label]. */
        @JavascriptInterface
        fun capture(label: String?, durationMs: Int) {
            if (!BuildConfig.DEBUG_TOOLS) return
            val display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) activity.display else null
            val rate = display?.refreshRate?.let { "%.0f Hz".format(it) } ?: "?"
            val modes = display?.supportedModes?.joinToString { "%.0f".format(it.refreshRate) } ?: "?"
            captureStartNs = System.nanoTime()
            captureEndNs = captureStartNs + durationMs * 1_000_000L
            frameIndex = 0
            captureLabel = label ?: "capture"
            Companion.log("${captureLabel}: capture start, display $rate (modes $modes), uptime ${SystemClock.uptimeMillis()}")
        }

        @JavascriptInterface
        fun log(message: String?) {
            Companion.log("web: $message")
        }
    }

    companion object {
        const val TAG = "GKPerf"
        const val JS_INTERFACE_NAME = "AndroidPerfDebug"

        fun log(message: String) {
            if (BuildConfig.DEBUG_TOOLS) Log.d(TAG, message)
        }
    }
}
