package com.glasskeep.app.webview

import android.os.SystemClock
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

/**
 * Hands the page the soft keyboard's slide frame by frame. The framework
 * applies the final inset as soon as the slide starts, so without this the
 * page jumps to its end position while the keyboard is still on its way.
 *
 * API 30+ only: older releases resize the window for real (see
 * [SystemBars.recordInsets]), there is no inset to follow.
 */
class KeyboardFollower(
    private val webView: WebView,
    private val systemBars: SystemBars,
) : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {

    private val ime = WindowInsetsCompat.Type.ime()
    private var target = 0
    private var keyboardAnimations = 0
    private var live = 0
    private var from = 0
    private var startedAt = 0L

    private fun WindowInsetsAnimationCompat.isKeyboard() = typeMask and ime != 0

    override fun onPrepare(animation: WindowInsetsAnimationCompat) {
        if (animation.isKeyboard() && keyboardAnimations++ == 0) systemBars.keyboardAnimating = true
    }

    override fun onStart(
        animation: WindowInsetsAnimationCompat,
        bounds: WindowInsetsAnimationCompat.BoundsCompat,
    ): WindowInsetsAnimationCompat.BoundsCompat {
        if (animation.isKeyboard()) {
            val shown = ViewCompat.getRootWindowInsets(webView)?.isVisible(ime) == true
            target = if (shown) bounds.upperBound.bottom else 0
            from = live
            startedAt = SystemClock.uptimeMillis()
        }
        return bounds
    }

    override fun onProgress(
        insets: WindowInsetsCompat,
        runningAnimations: MutableList<WindowInsetsAnimationCompat>,
    ): WindowInsetsCompat {
        val keyboard = runningAnimations.firstOrNull { it.isKeyboard() }
        if (keyboard != null) {
            live = insets.getInsets(ime).bottom
            systemBars.injectKeyboardFrame(webView, ahead(keyboard) ?: live, target)
        }
        return insets
    }

    /** Where the keyboard will be once the page has drawn this frame. A frame
     *  sent now reaches the screen [PAGE_LATENCY_FRAMES] later, behind a
     *  keyboard that has moved on. Null for a slide of unknown course, one
     *  the user's finger drives. */
    private fun ahead(animation: WindowInsetsAnimationCompat): Int? {
        val interpolator = animation.interpolator ?: return null
        if (animation.durationMillis <= 0) return null
        val lead = PAGE_LATENCY_FRAMES * 1000f / (webView.display?.refreshRate ?: 60f)
        val elapsed = SystemClock.uptimeMillis() - startedAt + lead
        val progress = interpolator.getInterpolation((elapsed / animation.durationMillis).coerceAtMost(1f))
        return from + ((target - from) * progress).roundToInt()
    }

    override fun onEnd(animation: WindowInsetsAnimationCompat) {
        if (animation.isKeyboard() && --keyboardAnimations == 0) {
            systemBars.keyboardAnimating = false
            systemBars.settleKeyboard(webView, target)
        }
    }

    private companion object {
        const val PAGE_LATENCY_FRAMES = 1
    }
}
