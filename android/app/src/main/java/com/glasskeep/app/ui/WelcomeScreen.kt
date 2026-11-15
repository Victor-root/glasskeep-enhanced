package com.glasskeep.app.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
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
import kotlinx.coroutines.launch

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
    // F-Droid handles updates itself, so the "Install unknown apps"
    // permission card is useless (and a bit alarming) for those
    // installs — we skip it entirely.
    val isFdroid = remember {
        com.glasskeep.app.update.UpdateManager.isFdroidInstall(context)
    }

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
    val batteryIgnored = remember(recheckTick) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) true
        else (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)
            ?.isIgnoringBatteryOptimizations(context.packageName) ?: false
    }

    // Per-permission "the user has actually completed at least one
    // grant attempt" flags. Set INSIDE the launcher callback, never
    // synchronously in the click handler — that's what makes the red
    // "Refusé ✗" badge wait for an actual decision instead of flashing
    // the moment we kick the popup off.
    var micTried by remember { mutableStateOf(false) }
    var cameraTried by remember { mutableStateOf(false) }
    var notifTried by remember { mutableStateOf(false) }
    var installTried by remember { mutableStateOf(false) }
    var batteryTried by remember { mutableStateOf(false) }

    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { micTried = true; bump() }
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { cameraTried = true; bump() }
    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { notifTried = true; bump() }
    val installSettingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { installTried = true; bump() }
    val appSettingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { bump() }
    val batteryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { batteryTried = true; bump() }
    val openAppSettings: () -> Unit = {
        appSettingsLauncher.launch(appInfoIntent(context.packageName))
    }
    val openInstallSettings: () -> Unit = {
        installSettingsLauncher.launch(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                .setData(Uri.parse("package:${context.packageName}"))
        )
    }

    val bgModifier = if (dark) {
        Modifier.background(DarkBgColor)
    } else {
        Modifier.background(LightBgGradient)
    }
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
    val cardBg = if (dark) DarkCardBg else LightCardBg

    val permissions = buildList {
        add(
            Permission(
                iconRes = R.drawable.ic_tabler_microphone,
                title = stringResource(R.string.welcome_mic_title),
                description = stringResource(R.string.welcome_mic_desc),
                tvDescription = stringResource(R.string.welcome_mic_desc_tv),
                granted = micGranted,
                tried = micTried,
                onGrant = { micLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                onSettings = openAppSettings,
            )
        )
        add(
            Permission(
                iconRes = R.drawable.ic_tabler_camera,
                title = stringResource(R.string.welcome_camera_title),
                description = stringResource(R.string.welcome_camera_desc),
                tvDescription = stringResource(R.string.welcome_camera_desc_tv),
                granted = cameraGranted,
                tried = cameraTried,
                onGrant = { cameraLauncher.launch(Manifest.permission.CAMERA) },
                onSettings = openAppSettings,
            )
        )
        if (!isFdroid) {
            add(
                Permission(
                    iconRes = R.drawable.ic_tabler_bell,
                    title = stringResource(R.string.welcome_notif_title),
                    description = stringResource(R.string.welcome_notif_desc),
                    tvDescription = stringResource(R.string.welcome_notif_desc_tv),
                    granted = notifGranted,
                    tried = notifTried,
                    onGrant = {
                        if (needsNotifPerm) {
                            notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            // Pre-Tiramisu: nothing to ask for; just bump so the
                            // card flips to "Accordé" without ceremony.
                            bump()
                        }
                    },
                    onSettings = openAppSettings,
                )
            )
        }
        // Battery optimization: optional, shown for every install source.
        // It's a special-access setting (not a runtime permission), so it
        // lives here as a tappable card that opens the system dialog and
        // NEVER gates "Continuer". Lets background reminders fire reliably
        // on aggressive-power-management OEMs.
        add(
            Permission(
                iconRes = R.drawable.ic_tabler_bolt,
                title = stringResource(R.string.welcome_battery_title),
                description = stringResource(R.string.welcome_battery_desc),
                tvDescription = stringResource(R.string.welcome_battery_desc_tv),
                granted = batteryIgnored,
                tried = batteryTried,
                onGrant = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        batteryLauncher.launch(
                            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                                .setData(Uri.parse("package:${context.packageName}"))
                        )
                    } else {
                        bump()
                    }
                },
                onSettings = openAppSettings,
            )
        )
        if (!isFdroid) {
            add(
                Permission(
                    iconRes = R.drawable.ic_tabler_download,
                    title = stringResource(R.string.welcome_install_title),
                    description = stringResource(R.string.welcome_install_desc),
                    tvDescription = stringResource(R.string.welcome_install_desc_tv),
                    granted = installGranted,
                    tried = installTried,
                    // "Install unknown apps" is a special-access setting,
                    // never a runtime permission popup: both the initial
                    // grant action AND the post-denial "Ouvrir les
                    // réglages" route to the same per-app toggle.
                    onGrant = openInstallSettings,
                    onSettings = openInstallSettings,
                )
            )
        }
    }
    val colors = CardColors(cardBg, titleColor, subtextColor)

    Box(modifier = Modifier.fillMaxSize().then(bgModifier)) {
        // Same animated background as SetupScreen: soft pastel cards
        // drifting in the back, theme-aware via the dark flag.
        FloatingCardsBackground(dark)
        if (isTelevision()) {
            TvWelcome(permissions, colors, onContinue)
        } else {
            PhoneWelcome(permissions, colors, onContinue)
        }
    }
}

/** One permission the welcome explains, with its state and its actions. */
private class Permission(
    val iconRes: Int,
    val title: String,
    val description: String,
    /** The TV's shorter wording: five tiles share one row there. */
    val tvDescription: String,
    val granted: Boolean,
    val tried: Boolean,
    val onGrant: () -> Unit,
    val onSettings: () -> Unit,
)

private class CardColors(val background: Color, val title: Color, val subtext: Color)

/** The phone's welcome: the permissions one under the other, scrolled. */
@Composable
private fun PhoneWelcome(
    permissions: List<Permission>,
    colors: CardColors,
    onContinue: () -> Unit,
) {
    // A remote moving up to the first card has nothing focusable above it
    // to scroll the title back into view: reaching that card does it.
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            // The scrolled page stops above the pager's dots, laid
            // over the bottom of the screen: no text runs under them.
            .padding(bottom = 40.dp)
            .verticalScroll(scrollState)
            .padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        GlassKeepLogo(size = 72.dp, cornerRadius = 16.dp, elevation = 8.dp)
        Spacer(modifier = Modifier.height(20.dp))
        Text(
            text = stringResource(R.string.welcome_title),
            color = colors.title,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.welcome_subtitle),
            color = colors.subtext,
            fontSize = 15.sp,
            lineHeight = 22.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 480.dp),
        )
        Spacer(modifier = Modifier.height(28.dp))

        permissions.forEachIndexed { index, permission ->
            if (index > 0) Spacer(modifier = Modifier.height(14.dp))
            PermissionCard(
                permission = permission,
                colors = colors,
                modifier = Modifier
                    .widthIn(max = 560.dp)
                    .fillMaxWidth()
                    .then(
                        if (index == 0) {
                            Modifier.onFocusChanged {
                                if (it.hasFocus) scope.launch { scrollState.animateScrollTo(0) }
                            }
                        } else {
                            Modifier
                        }
                    ),
            )
        }

        Spacer(modifier = Modifier.height(32.dp))
        ContinueButton(onClick = onContinue, modifier = Modifier.widthIn(max = 560.dp).fillMaxWidth())
        // Extra bottom room so the last button doesn't slide under
        // the pager's page indicator dots.
        Spacer(modifier = Modifier.height(48.dp))
    }
}

/** The TV's welcome: a screen is wider than tall, so the permissions sit
 *  side by side, every one on screen, as tiles of one height under a short
 *  header, and the remote moves along them with left and right. Nothing
 *  scrolls. */
@Composable
private fun TvWelcome(
    permissions: List<Permission>,
    colors: CardColors,
    onContinue: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            // Clear of the pager's dots, laid over the bottom of the screen.
            .padding(start = 48.dp, end = 48.dp, top = 20.dp, bottom = 44.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            GlassKeepLogo(size = 52.dp, cornerRadius = 13.dp, elevation = 8.dp)
            Spacer(modifier = Modifier.width(16.dp))
            Text(
                text = stringResource(R.string.welcome_title),
                color = colors.title,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.welcome_subtitle),
            color = colors.subtext,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(20.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Max),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            permissions.forEach { permission ->
                PermissionCard(
                    permission = permission,
                    colors = colors,
                    tile = true,
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                )
            }
        }
        Spacer(modifier = Modifier.height(20.dp))
        ContinueButton(onClick = onContinue, modifier = Modifier.width(320.dp))
    }
}

/** A permission's card: what it is for, then its state or the button
 *  asking for it. [tile] is the TV's narrow tile: the icon over the title,
 *  the short wording, and that button pinned to the bottom of a tile
 *  given its height. */
@Composable
private fun PermissionCard(
    permission: Permission,
    colors: CardColors,
    modifier: Modifier = Modifier,
    tile: Boolean = false,
) {
    // `tried` is owned by the parent — it flips to true ONLY when the
    // matching launcher's callback fires (i.e. Android actually
    // returned a decision), never synchronously on click. That keeps
    // the "Refusé ✗" badge from flashing the instant we kick off a
    // permission request: it only ever appears once the user has
    // actually completed an attempt.

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(colors.background)
            .padding(if (tile) 14.dp else 16.dp),
    ) {
        val icon = @Composable {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Indigo.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(permission.iconRes),
                    contentDescription = null,
                    tint = Indigo,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
        val title = @Composable {
            Text(
                text = permission.title,
                color = colors.title,
                fontSize = if (tile) 16.sp else 17.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        if (tile) {
            icon()
            Spacer(modifier = Modifier.height(10.dp))
            title()
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                icon()
                Spacer(modifier = Modifier.size(12.dp))
                title()
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = if (tile) permission.tvDescription else permission.description,
            color = colors.subtext,
            fontSize = if (tile) 13.sp else 14.sp,
            lineHeight = if (tile) 18.sp else 20.sp,
        )
        Spacer(modifier = Modifier.height(14.dp))
        if (tile) Spacer(modifier = Modifier.weight(1f))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (permission.granted) {
                Text(
                    text = stringResource(R.string.welcome_granted),
                    color = Color(0xFF059669),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            } else if (permission.tried) {
                // Launcher fired and the OS returned without a grant —
                // either the user clicked Deny in the popup, dismissed
                // the system settings page without flipping the toggle,
                // or hit Android 11+'s auto-deny rate limit. In every
                // case it counts as a real refusal: red status badge +
                // a follow-up "Open settings" button so they can still
                // flip the toggle by hand.
                Text(
                    text = stringResource(R.string.welcome_denied),
                    color = Color(0xFFdc2626),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.size(12.dp))
                PillButton(
                    label = stringResource(R.string.welcome_settings),
                    onClick = permission.onSettings,
                )
            } else {
                // Idle state — the user hasn't kicked off any attempt
                // yet for this card. Tapping fires onGrant which either
                // pops the system permission dialog (runtime perms) or
                // jumps to the per-app settings page (install perm).
                PillButton(
                    label = stringResource(R.string.welcome_grant),
                    onClick = permission.onGrant,
                )
            }
        }
    }
}

@Composable
private fun PillButton(label: String, onClick: () -> Unit) {
    GradientButton(
        onClick = onClick,
        shape = RoundedCornerShape(10.dp),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
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
private fun ContinueButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    GradientButton(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        modifier = modifier,
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
