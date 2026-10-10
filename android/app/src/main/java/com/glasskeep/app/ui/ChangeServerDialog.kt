package com.glasskeep.app.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import com.glasskeep.app.MainActivity
import com.glasskeep.app.R

/**
 * "Change server?" confirmation of the WebView screen, built from plain
 * views in the onboarding's colours. Confirming forgets the server
 * address and goes back to the setup screen.
 */
internal object ChangeServerDialog {

    fun show(activity: Activity) {
        val dark = isDarkMode(activity.resources.configuration)
        val dialog = android.app.Dialog(activity)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val dp = activity.resources.displayMetrics.density
        val pad = (24 * dp).toInt()
        val padSmall = (16 * dp).toInt()
        val indigo = Color.parseColor("#6366f1")
        val violet = Color.parseColor("#7c3aed")

        val cardColor = if (dark) Color.parseColor("#282828") else Color.WHITE
        val titleColor = if (dark) Color.parseColor("#e5e7eb") else Color.parseColor("#1f2937")
        val msgColor = if (dark) Color.parseColor("#9ca3af") else Color.parseColor("#6b7280")
        val iconCircleColor = if (dark) Color.parseColor("#2d2644") else Color.parseColor("#f0e8ff")
        val cancelBgColor = if (dark) Color.parseColor("#363636") else Color.parseColor("#f3f4f6")
        val cancelTextColor = if (dark) Color.parseColor("#9ca3af") else Color.parseColor("#6b7280")

        // Card container
        val card = android.widget.LinearLayout(activity).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            val bg = android.graphics.drawable.GradientDrawable().apply {
                setColor(cardColor)
                cornerRadius = 20 * dp
            }
            background = bg
            elevation = 16 * dp
        }

        // Icon circle
        val iconBg = android.widget.FrameLayout(activity).apply {
            val size = (48 * dp).toInt()
            layoutParams = android.widget.LinearLayout.LayoutParams(size, size).apply {
                gravity = android.view.Gravity.CENTER_HORIZONTAL
                bottomMargin = padSmall
            }
            val circle = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(iconCircleColor)
            }
            background = circle
        }
        val iconView = android.widget.ImageView(activity).apply {
            setImageResource(R.drawable.ic_swap_server)
            val iconPad = (12 * dp).toInt()
            setPadding(iconPad, iconPad, iconPad, iconPad)
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        iconBg.addView(iconView)
        card.addView(iconBg)

        // Title
        val title = android.widget.TextView(activity).apply {
            text = activity.getString(R.string.dialog_change_server)
            textSize = 18f
            setTextColor(titleColor)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = android.view.Gravity.CENTER
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (8 * dp).toInt() }
        }
        card.addView(title)

        // Message
        val msg = android.widget.TextView(activity).apply {
            text = activity.getString(R.string.dialog_change_message)
            textSize = 14f
            setTextColor(msgColor)
            gravity = android.view.Gravity.CENTER
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = pad }
        }
        card.addView(msg)

        // Buttons row
        val row = android.widget.LinearLayout(activity).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Cancel button
        val btnCancel = android.widget.TextView(activity).apply {
            text = activity.getString(R.string.dialog_no)
            textSize = 15f
            setTextColor(cancelTextColor)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = android.view.Gravity.CENTER
            setPadding(0, (12 * dp).toInt(), 0, (12 * dp).toInt())
            val bg = android.graphics.drawable.GradientDrawable().apply {
                setColor(cancelBgColor)
                cornerRadius = 12 * dp
            }
            background = bg
            layoutParams = android.widget.LinearLayout.LayoutParams(
                0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f
            ).apply { marginEnd = (6 * dp).toInt() }
            setOnClickListener { dialog.dismiss() }
        }
        row.addView(btnCancel)

        // Confirm button with gradient
        val btnConfirm = android.widget.TextView(activity).apply {
            text = activity.getString(R.string.dialog_yes)
            textSize = 15f
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = android.view.Gravity.CENTER
            setPadding(0, (12 * dp).toInt(), 0, (12 * dp).toInt())
            val bg = android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(indigo, violet)
            ).apply { cornerRadius = 12 * dp }
            background = bg
            layoutParams = android.widget.LinearLayout.LayoutParams(
                0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f
            ).apply { marginStart = (6 * dp).toInt() }
            setOnClickListener {
                dialog.dismiss()
                activity.getSharedPreferences("glasskeep", Context.MODE_PRIVATE)
                    .edit()
                    .remove("server_url")
                    .remove(MainActivity.KEY_URL_VETTED)
                    .apply()
                val intent = Intent(activity, MainActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                activity.startActivity(intent)
                activity.finish()
            }
        }
        row.addView(btnConfirm)

        card.addView(row)

        dialog.setContentView(card)
        dialog.window?.setLayout(
            (activity.resources.displayMetrics.widthPixels * 0.85).toInt(),
            android.view.WindowManager.LayoutParams.WRAP_CONTENT
        )
        dialog.show()
    }
}
