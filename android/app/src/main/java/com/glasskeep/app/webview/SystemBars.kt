package com.glasskeep.app.webview

import android.animation.ValueAnimator
import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.core.graphics.ColorUtils
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updateLayoutParams

/**
 * The system bars of the WebView screen. The window draws edge-to-edge
 * behind transparent bars: [statusBarBackground] and
 * [navigationBarBackground] paint them in the page's colours, and the
 * page is told the insets it has to lay itself out against.
 */
class SystemBars(
    private val activity: Activity,
    private val statusBarBackground: View,
    private val navigationBarBackground: View,
) {

    // Latest system-bar / display-cutout insets in CSS pixels (dp). Captured by the
    // OnApplyWindowInsetsListener on the WebView and replayed via `injectInsets`
    // on every page load, so the React app has correct values BEFORE the first paint.
    //
    // We do this because the Android 15 WebView on stock Pixel images returns 0 for
    // env(safe-area-inset-bottom) (the FAB ended up half-hidden behind the gesture/
    // 3-button bar). The Activity already knows the real insets: we just hand them
    // to the page as CSS custom properties so styles can read `var(--safe-bottom)`
    // with `env(safe-area-inset-bottom)` as the fallback for non-WebView contexts.
    private var safeAreaTopDp = 0.0
    private var safeAreaBottomDp = 0.0
    private var safeAreaLeftDp = 0.0
    private var safeAreaRightDp = 0.0

    // Soft-keyboard height, same idea. The window draws edge-to-edge, so the IME
    // never resizes the WebView and the page's own visualViewport stays at full
    // height: without this hand-off the app has no way to know a keyboard is
    // covering its lower half. Reported on API 30+ only (see recordInsets).
    private var keyboardInsetDp = 0.0

    // Theme colour last sent by the page (see ThemeBridge.onThemeColor). Null
    // until the page reports one; the window theme keeps the bars transparent
    // until then.
    private var themeBarColor: Int? = null
    // Set while the page wants the navigation bar apart from the theme
    // colour (ThemeBridge.onNavBarColor).
    private var navBarColor: Int? = null
    // Share of black over the painted bars (ThemeBridge.setBarsScrim).
    private var barsScrim = 0f
    private var barsScrimAnimator: ValueAnimator? = null

    /** Portrait edge-to-edge: the user option is on and the phone is upright.
     *  The bars then stay transparent and the page draws behind them. */
    private fun isEdgeToEdgeActive(): Boolean =
        activity.getSharedPreferences("glasskeep", Context.MODE_PRIVATE)
            .getBoolean(KEY_EDGE_TO_EDGE_PORTRAIT, false) &&
            activity.resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT

    /** Settings → "Edge-to-edge in portrait". Stored natively so the bars
     *  are already right at the next cold start, before the page loads.
     *  False when the option already had that value. */
    fun setEdgeToEdgePortrait(enabled: Boolean): Boolean {
        val prefs = activity.getSharedPreferences("glasskeep", Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_EDGE_TO_EDGE_PORTRAIT, false) == enabled) return false
        prefs.edit().putBoolean(KEY_EDGE_TO_EDGE_PORTRAIT, enabled).apply()
        paint()
        return true
    }

    /** Keeps the WebView's insets, in CSS pixels, for [injectInsets]. */
    fun recordInsets(insets: WindowInsetsCompat) {
        // We use ONLY the systemBars insets (status bar + nav bar +
        // caption bar), NOT the union with displayCutout. Devices
        // with a centre-top punch-hole (Pixel 8 and friends) report a
        // cutout.top a few dp larger than the visible status bar
        // because the cutout's bounding box extends slightly below the
        // bar to leave room for the camera optics. Including it pushes
        // the header 1-5 px below the actual status bar bottom edge,
        // leaving a thin gap where the page background shows through.
        // The WebView's own env() computation goes through systemBars
        // for the same reason: we just want to match it pixel-for-
        // pixel when we override the value.
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
        // API 30+ only: there the window keeps its full height and the page
        // has to pull its own bottom edge up. Older releases resize the
        // window for real under adjustResize, so 100dvh already shrinks and
        // forwarding the inset would subtract the keyboard twice.
        val ime = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R)
            insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        else 0
        val density = activity.resources.displayMetrics.density
        safeAreaTopDp    = bars.top    / density.toDouble()
        safeAreaBottomDp = bars.bottom / density.toDouble()
        safeAreaLeftDp   = bars.left   / density.toDouble()
        safeAreaRightDp  = bars.right  / density.toDouble()
        keyboardInsetDp  = ime / density.toDouble()
    }

    /** The system-bar state the page lays itself out against: the insets, the
     *  keyboard height, and data-gk-edge-to-edge on <html> while the bars are
     *  transparent. */
    fun injectInsets(webView: WebView) {
        val js = """
            (function(){
              var d = document.documentElement;
              if (!d) return;
              var s = d.style;
              s.setProperty('--android-inset-top',    '${safeAreaTopDp}px');
              s.setProperty('--android-inset-bottom', '${safeAreaBottomDp}px');
              s.setProperty('--android-inset-left',   '${safeAreaLeftDp}px');
              s.setProperty('--android-inset-right',  '${safeAreaRightDp}px');
              s.setProperty('--android-keyboard-inset', '${keyboardInsetDp}px');
              d.toggleAttribute('data-gk-edge-to-edge', ${isEdgeToEdgeActive()});
              window.dispatchEvent(new Event('gk-android-insets'));
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    /** Lays the bar backgrounds over the system bars: the status bar along
     *  the top, the navigation bar along whichever edge it sits on (a side
     *  one in landscape with button navigation). */
    fun placeBackgrounds(insets: WindowInsetsCompat) {
        val status = insets.getInsets(WindowInsetsCompat.Type.statusBars())
        statusBarBackground.updateLayoutParams<FrameLayout.LayoutParams> { height = status.top }
        val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
        navigationBarBackground.updateLayoutParams<FrameLayout.LayoutParams> {
            when {
                nav.right > 0 -> {
                    width = nav.right
                    height = FrameLayout.LayoutParams.MATCH_PARENT
                    gravity = Gravity.RIGHT
                }
                nav.left > 0 -> {
                    width = nav.left
                    height = FrameLayout.LayoutParams.MATCH_PARENT
                    gravity = Gravity.LEFT
                }
                else -> {
                    width = FrameLayout.LayoutParams.MATCH_PARENT
                    height = nav.bottom
                    gravity = Gravity.BOTTOM
                }
            }
        }
    }

    fun setThemeColor(hexColor: String) {
        themeBarColor = try { Color.parseColor(hexColor) } catch (_: Exception) { return }
        paint()
    }

    /** Navigation bar colour of its own (an open note's footer), or ""
     *  to follow the theme colour again. */
    fun setNavBarColor(hexColor: String) {
        navBarColor = if (hexColor.isBlank()) null
        else try { Color.parseColor(hexColor) } catch (_: Exception) { return }
        paint()
    }

    /** Paints the bars in the page's colours (the navigation bar's own one
     *  when set, else the theme colour), or leaves them transparent in
     *  portrait edge-to-edge. The icons follow those colours either way: they
     *  are what sits behind them whenever the page is at rest. */
    fun paint() {
        val theme = themeBarColor ?: return
        val color = ColorUtils.blendARGB(theme, Color.BLACK, barsScrim)
        val navColor = ColorUtils.blendARGB(navBarColor ?: theme, Color.BLACK, barsScrim)
        val edgeToEdge = isEdgeToEdgeActive()
        statusBarBackground.setBackgroundColor(if (edgeToEdge) Color.TRANSPARENT else color)
        navigationBarBackground.setBackgroundColor(if (edgeToEdge) Color.TRANSPARENT else navColor)
        // The system bars themselves stay transparent over those backgrounds.
        // With 3-button navigation the system would otherwise lay its own
        // translucent white scrim over the navigation bar.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            activity.window.isNavigationBarContrastEnforced = false
        }

        val controller = WindowInsetsControllerCompat(activity.window, activity.window.decorView)
        controller.isAppearanceLightStatusBars = isLight(color)
        controller.isAppearanceLightNavigationBars = isLight(navColor)
    }

    /** Darkens the painted bars by this share of black. Same timing as the
     *  page overlay's fade (MobileCreateFab). */
    fun animateScrim(target: Float) {
        barsScrimAnimator?.cancel()
        barsScrimAnimator = ValueAnimator.ofFloat(barsScrim, target).apply {
            duration = BARS_SCRIM_MS
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                barsScrim = it.animatedValue as Float
                paint()
            }
            start()
        }
    }

    /** Stops the scrim animation, when the screen goes away. */
    fun release() {
        barsScrimAnimator?.cancel()
    }

    private fun isLight(color: Int): Boolean =
        (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255 > 0.5

    private companion object {
        const val KEY_EDGE_TO_EDGE_PORTRAIT = "edge_to_edge_portrait"
        // Matches the FAB overlay's fade (MobileCreateFab).
        const val BARS_SCRIM_MS = 200L
    }
}
