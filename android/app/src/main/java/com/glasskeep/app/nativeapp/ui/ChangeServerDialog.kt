package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.restartApp
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor

/** Purges all state owned by this server, then restarts on the setup
 *  screen: what "Oui, changer" has always done, from Settings and from the
 *  sign-in screens alike. */
internal suspend fun switchServer(container: NativeAppContainer, activity: Activity, toasts: ToastController) {
    try {
        container.clearForServerChange()
        restartApp(activity)
    } catch (t: Throwable) {
        NativeDebug.e("changeServer failed", t)
        toasts.error(activity.getString(R.string.native_change_server_error))
    }
}

/** A platform TextView's line box with its default font padding, which
 *  the WebView-era change-server dialog was built from. */
private val TextViewLineHeight = 1.33.em

/**
 * The change-server confirmation the APK has always shown natively
 * (WebViewActivity's showChangeServerDialog): an 85%-wide, 20dp-radius
 * card, the swap glyph in a tinted circle, centred title and message, and
 * two equal buttons, the confirm one on the fixed indigo-to-violet
 * gradient the old dialog hardcoded.
 */
@Composable
internal fun ChangeServerDialog(dark: Boolean, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val cardShape = RoundedCornerShape(20.dp)
    val buttonShape = RoundedCornerShape(12.dp)
    val mutedColor = if (dark) DarkSubtextColor else LightSubtextColor
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .shadow(elevation = 16.dp, shape = cardShape)
                .background(if (dark) Color(0xFF282828) else Color.White, cardShape)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(if (dark) Color(0xFF2D2644) else Color(0xFFF0E8FF), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                SwapServerIcon(size = 24.dp, tint = Color(0xFF6366F1))
            }
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(R.string.dialog_change_server),
                color = if (dark) DarkTitleColor else LightTitleColor,
                fontSize = 18.sp,
                lineHeight = TextViewLineHeight,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.dialog_change_message),
                color = mutedColor,
                fontSize = 14.sp,
                lineHeight = TextViewLineHeight,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(24.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ChangeServerButton(
                    label = stringResource(R.string.dialog_no),
                    textColor = mutedColor,
                    background = Brush.horizontalGradient(
                        List(2) { if (dark) Color(0xFF363636) else Color(0xFFF3F4F6) },
                    ),
                    shape = buttonShape,
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                ChangeServerButton(
                    label = stringResource(R.string.dialog_yes),
                    textColor = Color.White,
                    background = ButtonGradient,
                    shape = buttonShape,
                    onClick = onConfirm,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ChangeServerButton(
    label: String,
    textColor: Color,
    background: Brush,
    shape: RoundedCornerShape,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    Box(
        modifier = modifier
            .clip(shape)
            .background(background)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = textColor,
            fontSize = 15.sp,
            lineHeight = TextViewLineHeight,
            fontWeight = FontWeight.Bold,
        )
    }
}
