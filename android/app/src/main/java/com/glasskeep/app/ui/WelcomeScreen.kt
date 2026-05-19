package com.glasskeep.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.glasskeep.app.R

/**
 * First-launch onboarding. Explains why each system permission is
 * needed (mic = audio notes, camera = QR sign-in, notifications =
 * update alerts, "install unknown apps" = self-update because we
 * aren't on the Play Store) and offers a per-card grant button.
 *
 * The screen never gates progress — "Continuer" stays enabled even
 * when nothing was granted, so a user who deliberately denied one of
 * the permissions can still reach the setup screen. The matching
 * features simply stay dormant.
 *
 * Caller (MainActivity) is responsible for remembering that the
 * welcome was completed so subsequent launches skip it.
 */
@Composable
fun WelcomeScreen(onContinue: () -> Unit) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current

    // Increment-on-event tick that forces a recomposition every time
    // a permission result comes back — we keep the "granted?" checks
    // read-time so the card UI flips green the instant Android
    // accepts.
    var recheckTick by remember { mutableIntStateOf(0) }
    val bump: () -> Unit = { recheckTick++ }

    val needsNotifPerm = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    val micGranted = remember(recheckTick) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
    }
    val cameraGranted = remember(recheckTick) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
    }
    val notifGranted = remember(recheckTick) {
        if (!needsNotifPerm) true
        else ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }
    val installGranted = remember(recheckTick) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) true
        else context.packageManager.canRequestPackageInstalls()
    }

    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { bump() }
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { bump() }
    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { bump() }
    val installSettingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { bump() }
    val appSettingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { bump() }

    val bgModifier = if (dark) {
        Modifier.background(DarkBgColor)
    } else {
        Modifier.background(LightBgGradient)
    }
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val cardBg = if (dark) DarkCardBg else LightCardBg
    val borderColor = if (dark) DarkBorderColor else LightBorderColor

    Box(modifier = Modifier.fillMaxSize().then(bgModifier)) {
        // Same animated background as SetupScreen — soft pastel cards
        // drifting in the back, theme-aware via the dark flag.
        FloatingCardsBackground(dark)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(id = R.drawable.glasskeep_logo),
                contentDescription = "GlassKeep",
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .shadow(8.dp, RoundedCornerShape(16.dp)),
            )
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = stringResource(R.string.welcome_title),
                color = titleColor,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.welcome_subtitle),
                color = subtextColor,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 480.dp),
            )
            Spacer(modifier = Modifier.height(28.dp))

            PermissionCard(
                iconRes = R.drawable.ic_tabler_microphone,
                title = stringResource(R.string.welcome_mic_title),
                description = stringResource(R.string.welcome_mic_desc),
                granted = micGranted,
                cardBg = cardBg,
                borderColor = borderColor,
                titleColor = titleColor,
                subtextColor = subtextColor,
                onGrant = { micLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                onSettings = { appSettingsLauncher.launch(appInfoIntent(context.packageName)) },
            )
            Spacer(modifier = Modifier.height(14.dp))
            PermissionCard(
                iconRes = R.drawable.ic_tabler_camera,
                title = stringResource(R.string.welcome_camera_title),
                description = stringResource(R.string.welcome_camera_desc),
                granted = cameraGranted,
                cardBg = cardBg,
                borderColor = borderColor,
                titleColor = titleColor,
                subtextColor = subtextColor,
                onGrant = { cameraLauncher.launch(Manifest.permission.CAMERA) },
                onSettings = { appSettingsLauncher.launch(appInfoIntent(context.packageName)) },
            )
            Spacer(modifier = Modifier.height(14.dp))
            PermissionCard(
                iconRes = R.drawable.ic_tabler_bell,
                title = stringResource(R.string.welcome_notif_title),
                description = stringResource(R.string.welcome_notif_desc),
                granted = notifGranted,
                cardBg = cardBg,
                borderColor = borderColor,
                titleColor = titleColor,
                subtextColor = subtextColor,
                onGrant = {
                    if (needsNotifPerm) {
                        notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        // Pre-Tiramisu: nothing to ask for; just bump so the
                        // card flips to "Accordé" without ceremony.
                        bump()
                    }
                },
                onSettings = { appSettingsLauncher.launch(appInfoIntent(context.packageName)) },
            )
            Spacer(modifier = Modifier.height(14.dp))
            PermissionCard(
                iconRes = R.drawable.ic_tabler_download,
                title = stringResource(R.string.welcome_install_title),
                description = stringResource(R.string.welcome_install_desc),
                granted = installGranted,
                cardBg = cardBg,
                borderColor = borderColor,
                titleColor = titleColor,
                subtextColor = subtextColor,
                // "Install unknown apps" is a special-access setting, never
                // a runtime permission popup. Route the grant flow straight
                // to the per-app toggle on every device.
                onGrant = {
                    installSettingsLauncher.launch(
                        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                            .setData(Uri.parse("package:${context.packageName}"))
                    )
                },
                onSettings = {
                    installSettingsLauncher.launch(
                        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                            .setData(Uri.parse("package:${context.packageName}"))
                    )
                },
                grantAlwaysOpensSettings = true,
            )

            Spacer(modifier = Modifier.height(32.dp))
            ContinueButton(onClick = onContinue)
            // Extra bottom room so the last button doesn't slide under
            // the pager's page indicator dots.
            Spacer(modifier = Modifier.height(48.dp))
        }
    }
}

@Composable
private fun PermissionCard(
    iconRes: Int,
    title: String,
    description: String,
    granted: Boolean,
    cardBg: Color,
    borderColor: Color,
    titleColor: Color,
    subtextColor: Color,
    onGrant: () -> Unit,
    onSettings: () -> Unit,
    grantAlwaysOpensSettings: Boolean = false,
) {
    // After a denial the system dialog can't be re-triggered for that
    // session (or the user picked "Don't ask again"). We track the
    // attempt locally so the second click lands the user on the app's
    // settings page where they can flip the toggle by hand.
    var tried by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 560.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(cardBg)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Indigo.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(iconRes),
                    contentDescription = null,
                    tint = Indigo,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(modifier = Modifier.size(12.dp))
            Text(
                text = title,
                color = titleColor,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = description,
            color = subtextColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        Spacer(modifier = Modifier.height(14.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            if (granted) {
                Text(
                    text = stringResource(R.string.welcome_granted),
                    color = Color(0xFF059669),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            } else {
                val showSettings = tried && !grantAlwaysOpensSettings
                PillButton(
                    label = stringResource(
                        if (showSettings) R.string.welcome_settings
                        else R.string.welcome_grant
                    ),
                    onClick = {
                        if (showSettings) onSettings() else {
                            tried = true
                            onGrant()
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun PillButton(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(ButtonGradient)
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 10.dp),
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun ContinueButton(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 560.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(ButtonGradient)
            .clickable(onClick = onClick)
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.welcome_continue),
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun appInfoIntent(pkg: String): Intent =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:$pkg"))
