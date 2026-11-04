package com.glasskeep.app.webview

import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Hands the page the soft keyboard's slide. The framework applies the final
 * inset as soon as the slide starts, so without this the page jumps to its end
 * position while the keyboard is still on its way.
 *
 * The whole course goes out as the slide starts: an open note plays it on the
 * compositor (useNoteKeyboardLayout), in step with the keyboard however busy
 * the page is. A frame sent to the page each time the keyboard moves would
 * reach the screen too late on a phone. Those frames remain for the screens
 * that only move a little.
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
    private var live = 0
    private var keyboardAnimations = 0

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
            val duration = animation.durationMillis.takeIf { it > 0 } ?: FALLBACK_DURATION_MS
            systemBars.injectKeyboardSlide(webView, live, target, duration, course(animation))
        }
        return bounds
    }

    /** The slide's course, evenly sampled in time from 0 to 1. */
    private fun course(animation: WindowInsetsAnimationCompat): List<Float> =
        (0..COURSE_STEPS).map { step ->
            val time = step.toFloat() / COURSE_STEPS
            animation.interpolator?.getInterpolation(time) ?: time
        }

    override fun onProgress(
        insets: WindowInsetsCompat,
        runningAnimations: MutableList<WindowInsetsAnimationCompat>,
    ): WindowInsetsCompat {
        if (runningAnimations.any { it.isKeyboard() }) {
            live = insets.getInsets(ime).bottom
            systemBars.injectKeyboardFrame(webView, live, target)
        }
        return insets
    }

    override fun onEnd(animation: WindowInsetsAnimationCompat) {
        if (animation.isKeyboard() && --keyboardAnimations == 0) {
            live = target
            systemBars.keyboardAnimating = false
            systemBars.settleKeyboard(webView, target)
        }
    }

    private companion object {
        const val COURSE_STEPS = 16
        const val FALLBACK_DURATION_MS = 285L
    }
}
