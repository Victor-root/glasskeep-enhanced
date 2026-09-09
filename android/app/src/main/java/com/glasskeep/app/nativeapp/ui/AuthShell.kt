package com.glasskeep.app.nativeapp.ui

import android.app.Activity
import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.MainActivity
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkCardBg
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.FloatingCardsBackground
import com.glasskeep.app.ui.Indigo
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightCardBg
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.launch

/** The four surface colours every screen inside [AuthShell] draws with,
 *  handed to [content] so it doesn't resolve them a second time. */
internal data class AuthShellColors(
    val title: Color,
    val subtext: Color,
    val card: Color,
    val border: Color,
)

/**
 * AuthShell.jsx, the frame shared by every signed-out screen: the drifting
 * cards, the logo and app name, an optional subtitle, the glass card the
 * caller fills, then the theme toggle, the slogan pill, "change server"
 * and the credits line, in that order and with the web's own spacing.
 *
 * Deliberately not ported, disclosed rather than silently dropped: the
 * admin-configured custom login background image (and with it the boot
 * placeholder cross-fade), plus the QR side panel, which is a wide-screen
 * layout the phone never reaches.
 */
@Composable
internal fun AuthShell(
    container: NativeAppContainer,
    subtitle: String? = null,
    content: @Composable ColumnScope.(AuthShellColors) -> Unit,
) {
    val dark = LocalGkDark.current
    val colors = AuthShellColors(
        title = if (dark) DarkTitleColor else LightTitleColor,
        subtext = if (dark) DarkSubtextColor else LightSubtextColor,
        card = if (dark) DarkCardBg else LightCardBg,
        border = if (dark) DarkBorderColor else LightBorderColor,
    )
    val context = LocalContext.current
    val activity = LocalView.current.context as Activity
    val scope = rememberCoroutineScope()
    val toasts = LocalGkToasts.current

    /** Same complete server-scoped purge as Settings' own action. */
    fun changeServer() {
        scope.launch {
            try {
                container.clearForServerChange()
                val intent = Intent(context, MainActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                context.startActivity(intent)
                activity.finish()
            } catch (t: Throwable) {
                NativeDebug.e("AuthShell changeServer failed", t)
                toasts.error(context.getString(R.string.native_change_server_error))
            }
        }
    }

    // The signed-out screens wear the theme the admin picked for them, not
    // the one this account chose for its own workspace (AuthShell.jsx:33).
    val themeId = container.branding.loginThemeId ?: container.themeState.themeId
    Box(Modifier.fillMaxSize().background(WorkspaceTheme.appBackground(themeId, dark))) {
        if (container.shellPrefs.floatingCards) FloatingCardsBackground(dark)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(32.dp))
            // A custom logo is drawn raw: it may be a transparent PNG, and
            // the rounded tile plus shadow the bundled icon wears would put
            // an ugly box behind it (AuthShell.jsx:38).
            val customLogo = container.branding.logo?.let { rememberDecodedImage(it) }
            if (customLogo != null) {
                Image(
                    bitmap = customLogo,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(64.dp),
                )
            } else {
                Image(
                    painter = painterResource(id = R.drawable.glasskeep_logo),
                    contentDescription = null,
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .shadow(8.dp, RoundedCornerShape(16.dp)),
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                container.branding.appName ?: stringResource(R.string.app_name),
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                color = colors.title,
            )
            if (subtitle != null) {
                Spacer(Modifier.height(4.dp))
                Text(subtitle, fontSize = 14.sp, color = colors.subtext)
            }
            Spacer(Modifier.height(24.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.card)
                    .border(1.dp, colors.border, RoundedCornerShape(12.dp))
                    .padding(24.dp),
            ) {
                content(colors)
            }

            // mt-6, above the slogan pill (AuthShell.jsx:303-311). The
            // glyph shows the current mode, not the one the tap switches
            // to, unlike the header menu's own entry.
            Spacer(Modifier.height(24.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { container.shellPrefs.toggleDark(dark) },
            ) {
                val toggleColor = if (dark) Color(0xFFD1D5DB) else Color(0xFF374151)
                if (dark) {
                    SunIcon(size = 20.dp, tint = toggleColor)
                } else {
                    MoonIcon(size = 20.dp, tint = toggleColor)
                }
                Text(stringResource(R.string.native_login_toggle_theme), color = toggleColor, fontSize = 14.sp)
            }
            Spacer(Modifier.height(16.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(colors.card)
                    .padding(horizontal = 16.dp, vertical = 6.dp),
            ) {
                Text(stringResource(R.string.native_login_slogan), color = colors.subtext, fontSize = 14.sp)
            }
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(R.string.native_settings_change_server),
                color = Indigo,
                fontSize = 12.sp,
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { changeServer() },
            )
            Spacer(Modifier.height(16.dp))
            Text(
                AuthShellCredits,
                color = if (dark) Color(0xFF4B5563) else Color(0xFF9CA3AF),
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            )
        }
    }
}

/** AuthShell's footer line, deliberately untranslated on the web too. */
private const val AuthShellCredits =
    "Open source project \u00b7 Originally by nikunjsingh93 \u00b7 maintained and expanded by Victor-root"
