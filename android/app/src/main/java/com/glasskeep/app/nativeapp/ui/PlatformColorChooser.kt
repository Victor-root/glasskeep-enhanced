package com.glasskeep.app.nativeapp.ui

import android.app.AlertDialog
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
import android.graphics.drawable.RippleDrawable
import android.util.TypedValue
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.GridView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.RelativeLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.glasskeep.app.R
import kotlin.math.roundToInt

/**
 * Chromium's HtmlColorPicker (components/embedder_support/android/delegate,
 * BSD licence, its slider handle images included), the dialog a web page's
 * `<input type="color">` opened in the WebView on a phone. A framework
 * AlertDialog on the old APK's theme, AppCompat Light, which never had a
 * dark variant, so always light: "Select color", eight suggestions four to
 * a row, a "Custom" button trading them for hue, saturation and value
 * sliders, which start at nought whatever the colour, the chosen colour
 * beside its label, then Cancel and Set. Back or a tap outside keeps the
 * chosen colour, as Set does.
 *
 * [initial] is the input's value; [onChoose] gets what its `input` event
 * carried, the colour chosen as `#rrggbb`, only when it differs (Blink's
 * DidChooseColor). [onDismiss] follows every close.
 */
@Composable
internal fun PlatformColorChooser(initial: String, onChoose: (String) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val currentOnChoose by rememberUpdatedState(onChoose)
    val currentOnDismiss by rememberUpdatedState(onDismiss)
    DisposableEffect(context) {
        val initialColor = simpleColor(initial)
        val themed = ContextThemeWrapper(context, androidx.appcompat.R.style.Theme_AppCompat_Light_NoActionBar)
        val content = HtmlColorPickerContent(themed, initialColor)
        fun choose() {
            if (content.chosen != initialColor) currentOnChoose(String.format("#%06x", content.chosen and 0xFFFFFF))
        }
        val dialog = AlertDialog.Builder(themed)
            .setTitle(R.string.native_color_picker_title)
            .setView(content.view)
            .setPositiveButton(R.string.native_color_picker_set) { _, _ -> choose() }
            .setNegativeButton(R.string.native_color_picker_cancel, null)
            .setOnCancelListener { choose() }
            .setOnDismissListener { currentOnDismiss() }
            .create()
        dialog.show()
        onDispose {
            dialog.setOnDismissListener(null)
            dialog.dismiss()
        }
    }
}

/** An `<input type="color">`'s value as the colour it holds: `#rrggbb`,
 *  anything else black, as Blink sanitizes it. */
private fun simpleColor(value: String): Int =
    if (SimpleColor.matches(value)) (0xFF000000L or value.substring(1).toLong(16)).toInt() else Color.BLACK

private val SimpleColor = Regex("#[0-9a-fA-F]{6}")

/** HtmlColorPickerCoordinator's default suggestions, and their labels. */
private val Suggestions = listOf(
    Color.RED to R.string.native_color_picker_red,
    Color.CYAN to R.string.native_color_picker_cyan,
    Color.BLUE to R.string.native_color_picker_blue,
    Color.GREEN to R.string.native_color_picker_green,
    Color.MAGENTA to R.string.native_color_picker_magenta,
    Color.YELLOW to R.string.native_color_picker_yellow,
    Color.BLACK to R.string.native_color_picker_black,
    Color.WHITE to R.string.native_color_picker_white,
)

/**
 * color_picker_dialog_view.xml, HtmlColorPickerDialogView and the state
 * HtmlColorPickerCoordinator and HtmlColorPickerAdvanced keep: the
 * suggestions grid or the sliders, the button switching between them, and
 * the colour chosen so far.
 */
private class HtmlColorPickerContent(private val context: Context, initial: Int) {
    var chosen = initial
        private set

    private val chosenSwatch = View(context)
    private val chosenContainer = LinearLayout(context)
    private val suggestions = SuggestionsGrid(context)
    private val advanced = LinearLayout(context)
    private val switcher = TextView(context)
    private var advancedShown = false
    private var selectedSuggestion = -1

    /** The sliders' hue, saturation and value, nought until one moves. */
    private val hsv = FloatArray(3)
    private val hue = Slider(R.string.native_color_picker_hue, max = 360)
    private val saturation = Slider(R.string.native_color_picker_saturation, max = 100)
    private val value = Slider(R.string.native_color_picker_value, max = 100)

    val view: View

    init {
        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

        suggestions.apply {
            numColumns = 4
            horizontalSpacing = dp(8f)
            verticalSpacing = dp(8f)
            gravity = Gravity.CENTER
            adapter = SuggestionsAdapter()
            accessibilityDelegate = object : View.AccessibilityDelegate() {
                override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                    super.onInitializeAccessibilityNodeInfo(host, info)
                    info.collectionInfo = AccessibilityNodeInfo.CollectionInfo.obtain(
                        Suggestions.size, 1, false, AccessibilityNodeInfo.CollectionInfo.SELECTION_MODE_SINGLE,
                    )
                    info.text = context.getString(R.string.native_color_picker_suggestions)
                    info.className = ListView::class.java.name
                }
            }
        }
        column.addView(suggestions, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        advanced.orientation = LinearLayout.VERTICAL
        for (slider in listOf(hue, saturation, value)) advanced.addView(slider.root)
        column.addView(advanced, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        refreshSliders()

        val bottom = RelativeLayout(context)
        chosenContainer.apply {
            id = View.generateViewId()
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(
                TextView(context).apply {
                    maxWidth = dp(150f)
                    setText(R.string.native_color_picker_chosen)
                    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                    setTextColor(DefaultTextColor)
                },
            )
            val frame = FrameLayout(context).apply {
                background = pickerBorder()
                setPadding(dp(6f), dp(6f), dp(6f), dp(6f))
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
                addView(chosenSwatch, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }
            addView(
                frame,
                LinearLayout.LayoutParams(dp(48f), dp(48f)).apply {
                    gravity = Gravity.CENTER
                    marginEnd = dp(13f)
                    marginStart = dp(8f)
                },
            )
        }
        bottom.addView(
            chosenContainer,
            RelativeLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                addRule(RelativeLayout.ALIGN_PARENT_END)
            },
        )
        switcher.apply {
            minWidth = dp(88f)
            minHeight = dp(48f)
            setPaddingRelative(dp(8f), dp(5f), dp(8f), dp(5f))
            gravity = Gravity.CENTER_VERTICAL
            isFocusable = true
            isClickable = true
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(LinkTextColor)
            background = textButtonRipple()
            setOnClickListener { switchView() }
        }
        val switcherHolder = LinearLayout(context).apply {
            addView(
                switcher,
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.START
                    marginStart = dp(11f)
                },
            )
        }
        bottom.addView(
            switcherHolder,
            RelativeLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                marginEnd = dp(20f)
                addRule(RelativeLayout.START_OF, chosenContainer.id)
            },
        )
        column.addView(
            bottom,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(10f)
            },
        )

        view = ScrollView(context).apply {
            setPaddingRelative(dp(24f), dp(10f), dp(24f), dp(10f))
            isScrollbarFadingEnabled = false
            addView(column, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        showView(custom = false)
        setChosen(initial)
    }

    private fun setChosen(color: Int) {
        chosen = color
        chosenSwatch.setBackgroundColor(color)
        chosenContainer.contentDescription =
            context.getString(R.string.native_color_picker_chosen) + String.format("#%06X", color and 0xFFFFFF)
    }

    private fun switchView() = showView(!advancedShown)

    /** The sliders with [custom], else the suggestions (switchViewType). */
    private fun showView(custom: Boolean) {
        advancedShown = custom
        switcher.setText(if (custom) R.string.native_color_picker_suggestions else R.string.native_color_picker_custom)
        suggestions.visibility = if (custom) View.GONE else View.VISIBLE
        advanced.visibility = if (custom) View.VISIBLE else View.GONE
    }

    private fun pickSuggestion(index: Int) {
        selectedSuggestion = index
        (suggestions.adapter as BaseAdapter).notifyDataSetChanged()
        setChosen(Suggestions[index].first)
    }

    /** A slider moved: the colour of all three, the saturation and value
     *  rails following the hue. */
    private fun onSliderMoved() {
        hsv[0] = hue.bar.progress.toFloat()
        hsv[1] = saturation.bar.progress / 100f
        hsv[2] = value.bar.progress / 100f
        val color = Color.HSVToColor(hsv)
        updateSaturationRail()
        updateValueRail()
        if (selectedSuggestion != -1) {
            selectedSuggestion = -1
            (suggestions.adapter as BaseAdapter).notifyDataSetChanged()
        }
        setChosen(color)
    }

    private fun refreshSliders() {
        hue.bar.progress = hsv[0].toInt()
        saturation.bar.progress = (hsv[1] * 100f).roundToInt().coerceIn(0, 100)
        value.bar.progress = (hsv[2] * 100f).roundToInt().coerceIn(0, 100)
        hue.setRail(IntArray(7) { Color.HSVToColor(floatArrayOf(it * 60f, 1f, 1f)) })
        updateSaturationRail()
        updateValueRail()
    }

    private fun updateSaturationRail() =
        saturation.setRail(intArrayOf(Color.HSVToColor(floatArrayOf(hsv[0], 0f, 1f)), Color.HSVToColor(floatArrayOf(hsv[0], 1f, 1f))))

    private fun updateValueRail() =
        value.setRail(intArrayOf(Color.HSVToColor(floatArrayOf(hsv[0], hsv[1], 0f)), Color.HSVToColor(floatArrayOf(hsv[0], hsv[1], 1f))))

    /** color_picker_advanced_component.xml: a label over a gradient rail
     *  in a frame, the handle of a seek bar riding it. */
    private inner class Slider(label: Int, max: Int) {
        val root = RelativeLayout(context)
        val bar = SeekBar(context)
        private val rail = View(context)

        init {
            val margin = dp(14.5f)
            val text = TextView(context).apply {
                id = View.generateViewId()
                setText(label)
                setTextAppearance(android.R.style.TextAppearance_Medium)
            }
            root.addView(
                text,
                RelativeLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    marginStart = margin
                    marginEnd = margin
                },
            )
            val frame = FrameLayout(context).apply {
                background = pickerBorder()
                setPadding(dp(1f), dp(1f), dp(1f), dp(1f))
                addView(rail, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }
            root.addView(
                frame,
                RelativeLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50f)).apply {
                    addRule(RelativeLayout.BELOW, text.id)
                    marginStart = margin
                    marginEnd = margin
                    topMargin = dp(3f)
                },
            )
            bar.apply {
                progressDrawable = ColorDrawable(Color.TRANSPARENT)
                val handle = requireNotNull(ContextCompat.getDrawable(context, R.drawable.color_picker_advanced_select_handle))
                thumb = handle
                translationY = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 25f, context.resources.displayMetrics)
                this.max = max
                // The handle travels to each end of the rail.
                thumbOffset = handle.intrinsicWidth / 2
                contentDescription = context.getString(label)
                setOnSeekBarChangeListener(
                    object : SeekBar.OnSeekBarChangeListener {
                        override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
                            if (fromUser) onSliderMoved()
                        }

                        override fun onStartTrackingTouch(seekBar: SeekBar) = Unit

                        override fun onStopTrackingTouch(seekBar: SeekBar) = Unit
                    },
                )
            }
            root.addView(
                bar,
                RelativeLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(75f)).apply {
                    addRule(RelativeLayout.BELOW, text.id)
                },
            )
        }

        fun setRail(colors: IntArray) {
            rail.background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, colors)
        }
    }

    /** color_picker_suggestion_view.xml for each suggestion: its colour in
     *  a frame, a column wide and 48dp tall. */
    private inner class SuggestionsAdapter : BaseAdapter() {
        override fun getCount() = Suggestions.size

        override fun getItem(position: Int) = Suggestions[position]

        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val (color, label) = Suggestions[position]
            return FrameLayout(context).apply {
                layoutParams = AbsListView.LayoutParams(dp(48f), dp(48f))
                background = pickerBorder()
                setPadding(dp(6f), dp(6f), dp(6f), dp(6f))
                addView(
                    View(context).apply { setBackgroundColor(color) },
                    FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
                )
                contentDescription = context.getString(label)
                isSelected = position == selectedSuggestion
                accessibilityDelegate = object : View.AccessibilityDelegate() {
                    override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                        super.onInitializeAccessibilityNodeInfo(host, info)
                        info.collectionItemInfo = AccessibilityNodeInfo.CollectionItemInfo.obtain(position, 1, 1, 1, false)
                    }
                }
                setOnClickListener { pickSuggestion(position) }
            }
        }
    }

    /** color_picker_border.xml: a 4dp-rounded white box in a 2px hairline. */
    private fun pickerBorder() = GradientDrawable().apply {
        cornerRadius = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 4f, context.resources.displayMetrics)
        setStroke(2, HairlineColor)
        setColor(Color.WHITE)
    }

    /** ButtonCompat's text button background: no fill, a pill of blue at 6%
     *  while pressed, 4dp in from the top and bottom. */
    private fun textButtonRipple(): RippleDrawable {
        val pressed = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_pressed), intArrayOf()),
            intArrayOf((LinkTextColor and 0xFFFFFF) or (0x0F shl 24), Color.TRANSPARENT),
        )
        val pill = GradientDrawable().apply {
            cornerRadius = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 500f, context.resources.displayMetrics)
            setColor(Color.WHITE)
        }
        return RippleDrawable(pressed, null, InsetDrawable(pill, 0, dp(4f), 0, dp(4f)))
    }

    private fun dp(value: Float): Int =
        (TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics) + 0.5f).toInt()

    /** HtmlColorPickerSuggestionsView: a grid as tall as all its rows, a
     *  GridView being no good at wrapping its content in a ScrollView. */
    private class SuggestionsGrid(context: Context) : GridView(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) =
            super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(View.MEASURED_SIZE_MASK, MeasureSpec.AT_MOST))
    }

    private companion object {
        /** `default_text_color_baseline`, `default_text_color_link_baseline`
         *  and `hairline_stroke_color_baseline` of Chromium's light palette. */
        const val DefaultTextColor = 0xFF1F1F1F.toInt()
        const val LinkTextColor = 0xFF0B57D0.toInt()
        const val HairlineColor = 0xFF747775.toInt()
    }
}
