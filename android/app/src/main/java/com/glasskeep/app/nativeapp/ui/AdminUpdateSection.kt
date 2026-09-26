package com.glasskeep.app.nativeapp.ui

import android.content.ClipData
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * AdminUpdateSection.jsx: the card at the top of the admin panel. The
 * server's version, with the newer one when there is one: then the
 * one-click update where this install takes it (its button and hint), the
 * one Docker line or notice when it could but does not yet, the manual
 * commands behind their toggle, and always the repository and the
 * changelog.
 */
@Composable
internal fun AdminUpdateSection(
    update: ServerUpdateState,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onOpenChangelog: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    val available = update.updateAvailable
    val latestVersion = update.info?.latestVersion.orEmpty()
    val oneClick = update.oneClickAvailable
    var showManualCommands by remember { mutableStateOf(false) }
    val bodyColor = if (dark) Gray300 else Gray600
    val subtleColor = if (dark) Gray400 else Gray500
    val shape = RoundedCornerShape(12.dp)

    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color.White.copy(alpha = if (dark) 0.05f else 0.6f))
            .border(
                1.dp,
                when {
                    !available -> borderColor
                    dark -> Emerald500.copy(alpha = 0.3f)
                    else -> Emerald300.copy(alpha = 0.6f)
                },
                shape,
            )
            .padding(17.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(40.dp)
                    .background(
                        when {
                            !available -> WorkspaceTheme.accentSoftBg(themeId, dark)
                            dark -> Emerald400.copy(alpha = 0.15f)
                            else -> Emerald500.copy(alpha = 0.1f)
                        },
                        RoundedCornerShape(8.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                RefreshIcon(
                    size = 20.dp,
                    tint = when {
                        !available -> WorkspaceTheme.accent(themeId, dark)
                        dark -> Emerald300
                        else -> Emerald600
                    },
                )
            }
            Spacer(Modifier.width(12.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    stringResource(R.string.native_update_section_title),
                    color = titleColor,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.alignByBaseline(),
                )
                update.info?.currentVersion?.let {
                    Text(
                        "v$it",
                        color = subtleColor,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        modifier = Modifier.alignByBaseline(),
                    )
                }
                if (available) {
                    Text(
                        stringResource(R.string.native_update_available_pill, latestVersion),
                        color = if (dark) Emerald300 else Emerald700,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .alignByBaseline()
                            .background(Emerald500.copy(alpha = 0.15f), CircleShape)
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            if (available) {
                stringResource(R.string.native_update_available_description, latestVersion)
            } else {
                stringResource(R.string.native_update_up_to_date)
            },
            color = bodyColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.height(12.dp))

        if (available) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (oneClick) {
                    GkGradientButton(
                        label = stringResource(
                            if (update.phase.active) R.string.native_update_running else R.string.native_update_now,
                        ),
                        themeId = themeId,
                        enabled = !update.phase.active,
                        gradient = UpdateNowGradient,
                        leading = { TablerDownloadIcon(size = 20.dp, tint = Color.White) },
                        onClick = { update.askToUpdate(latestVersion) },
                    )
                }
                val chevronTurn by animateFloatAsState(
                    targetValue = if (showManualCommands) 180f else 0f,
                    animationSpec = tween(durationMillis = 200, easing = GkStandardEasing),
                    label = "manualChevron",
                )
                GkGradientButton(
                    label = stringResource(R.string.native_update_manual),
                    themeId = themeId,
                    gradient = ManualUpdateGradient,
                    leading = { Terminal2Icon(size = 20.dp, tint = Color.White) },
                    trailing = { ChevronDownIcon(Modifier.rotate(chevronTurn), size = 20.dp, tint = Color.White) },
                    onClick = { showManualCommands = !showManualCommands },
                )
            }
            if (oneClick) {
                // The hint's -mt-1.5 eats half of the buttons' mb-3.
                Spacer(Modifier.height(6.dp))
                Text(
                    stringResource(R.string.native_update_now_hint),
                    color = subtleColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
            }
            Spacer(Modifier.height(12.dp))
            if (!oneClick && update.mode == "docker") {
                when (update.modeReason) {
                    "docker-socket-missing" -> {
                        DockerSocketHint(themeId, titleColor, dark)
                        Spacer(Modifier.height(12.dp))
                    }
                    "docker-socket-permission-denied" -> {
                        DockerNoticeHint(
                            intro = stringResource(R.string.native_update_docker_perm_intro),
                            footnote = stringResource(R.string.native_update_docker_perm_footnote),
                            dark = dark,
                        )
                        Spacer(Modifier.height(12.dp))
                    }
                    "docker-daemon-unreachable" -> {
                        DockerNoticeHint(intro = stringResource(R.string.native_update_docker_daemon_hint), footnote = null, dark = dark)
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }
            if (showManualCommands) {
                CommandRow(
                    icon = { Terminal2Icon(size = 20.dp, tint = it) },
                    label = stringResource(R.string.native_update_method_terminal),
                    description = stringResource(R.string.native_update_method_terminal_description),
                    command = InstallCommand,
                    titleColor = titleColor,
                    dark = dark,
                    borderColor = borderColor,
                )
                Spacer(Modifier.height(12.dp))
                CommandRow(
                    icon = { BrandDockerIcon(size = 20.dp, tint = it) },
                    label = stringResource(R.string.native_update_method_docker),
                    description = stringResource(R.string.native_update_method_docker_description),
                    command = DockerCommand,
                    titleColor = titleColor,
                    dark = dark,
                    borderColor = borderColor,
                )
                Spacer(Modifier.height(12.dp))
            }
        }

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CardLinkButton(
                label = stringResource(R.string.native_update_open_repo),
                dark = dark,
                icon = { BrandGithubIcon(size = 20.dp, tint = Color.White) },
                onClick = { uriHandler.openUri(RepoUrl) },
            )
            CardLinkButton(
                label = stringResource(R.string.native_update_open_changelog),
                dark = dark,
                icon = { SparklesIcon(size = 20.dp, tint = Color.White) },
                onClick = onOpenChangelog,
            )
        }
    }
}

/** The confirmation both "Update now" ask for, the card's and the
 *  notice's, in the web's positive colours. */
@Composable
internal fun ServerUpdateConfirmation(update: ServerUpdateState, themeId: String?, dark: Boolean) {
    val version = update.confirming ?: return
    GkConfirmDialog(
        title = stringResource(R.string.native_update_confirm_title, version),
        message = stringResource(R.string.native_update_confirm_message),
        confirmLabel = stringResource(R.string.native_update_confirm_button),
        cancelLabel = stringResource(R.string.native_dialog_cancel),
        themeId = themeId,
        dark = dark,
        borderColor = if (dark) DarkBorderColor else LightBorderColor,
        titleColor = if (dark) DarkTitleColor else LightTitleColor,
        subtextColor = if (dark) DialogBodyDark else DialogBodyLight,
        variant = GkConfirmVariant.SUCCESS,
        onConfirm = { update.startUpdate(version) },
        onDismiss = update::dismissConfirmation,
    )
}

/** The card's two dark buttons: `bg-gray-900`, `white/10` in dark mode. */
@Composable
private fun CardLinkButton(label: String, dark: Boolean, icon: @Composable () -> Unit, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color.White.copy(alpha = 0.1f) else Gray900)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon()
        Spacer(Modifier.width(8.dp))
        Text(label, color = Color.White, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
    }
}

/** A manual update method: its name, what to do, and the command to copy. */
@Composable
private fun CommandRow(
    icon: @Composable (Color) -> Unit,
    label: String,
    description: String,
    command: String,
    titleColor: Color,
    dark: Boolean,
    borderColor: Color,
) {
    val textColor = if (dark) Gray300 else Gray600
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (dark) Color.Black.copy(alpha = 0.3f) else Gray50, RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                icon(textColor)
                Spacer(Modifier.width(8.dp))
                Text(
                    label.uppercase(),
                    color = textColor,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.3.sp,
                )
            }
            Spacer(Modifier.width(8.dp))
            CopyCommandButton(command, titleColor, dark, borderColor)
        }
        Spacer(Modifier.height(8.dp))
        Text(description, color = textColor, fontSize = 12.sp, lineHeight = 16.sp)
        Spacer(Modifier.height(8.dp))
        CommandLine(
            command = command,
            color = if (dark) Gray100 else Gray800,
            borderColor = borderColor,
            dark = dark,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** DockerSocketHint: the one docker-compose.yml line that unlocks the
 *  one-click update, ready to copy, in the accent's soft box. */
@Composable
private fun DockerSocketHint(themeId: String?, titleColor: Color, dark: Boolean) {
    val accent = WorkspaceTheme.accent(themeId, dark)
    val softBorder = WorkspaceTheme.accentSoftBorder(themeId, dark)
    Column(
        Modifier
            .fillMaxWidth()
            .background(WorkspaceTheme.accentSoftBg(themeId, dark), RoundedCornerShape(8.dp))
            .border(1.dp, softBorder, RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        Text(stringResource(R.string.native_update_docker_hint_intro), color = accent, fontSize = 12.sp, lineHeight = 16.sp)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            CommandLine(
                command = DockerSocketMountLine,
                color = accent,
                borderColor = softBorder,
                dark = dark,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            CopyCommandButton(DockerSocketMountLine, titleColor, dark, softBorder)
        }
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.native_update_docker_hint_footnote),
            color = accent.copy(alpha = 0.8f),
            fontSize = 11.sp,
            lineHeight = 16.5.sp,
        )
    }
}

/** DockerNoticeHint: the socket is there but unusable, which only the
 *  container or the daemon can fix, so an amber note with nothing to copy. */
@Composable
private fun DockerNoticeHint(intro: String, footnote: String?, dark: Boolean) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (dark) Amber500.copy(alpha = 0.1f) else Amber50, RoundedCornerShape(8.dp))
            .border(1.dp, if (dark) Amber500.copy(alpha = 0.3f) else Amber300.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        Text(intro, color = if (dark) Amber200 else Amber900, fontSize = 12.sp, lineHeight = 16.sp)
        footnote?.let {
            Spacer(Modifier.height(8.dp))
            Text(
                it,
                color = if (dark) Amber200.copy(alpha = 0.7f) else Amber800.copy(alpha = 0.8f),
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}

/** A command on one line, scrolled sideways when it runs past the box. */
@Composable
private fun CommandLine(command: String, color: Color, borderColor: Color, dark: Boolean, modifier: Modifier) {
    Text(
        command,
        color = color,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontFamily = FontFamily.Monospace,
        softWrap = false,
        modifier = modifier
            .background(if (dark) Color.Black.copy(alpha = 0.4f) else Color.White, RoundedCornerShape(6.dp))
            .border(1.dp, borderColor, RoundedCornerShape(6.dp))
            .padding(horizontal = 9.dp, vertical = 7.dp)
            .horizontalScroll(rememberScrollState()),
    )
}

/** Copy, and "Copied" with a check for 1.8s after, in the card's own text
 *  colour. The web draws its download glyph here, not a copy one. */
@Composable
private fun CopyCommandButton(command: String, textColor: Color, dark: Boolean, borderColor: Color) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    Row(
        Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (dark) Color.White.copy(alpha = 0.1f) else Color.White)
            .border(1.dp, borderColor, RoundedCornerShape(6.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) {
                scope.launch {
                    clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("command", command)))
                    copied = true
                    delay(1_800)
                    copied = false
                }
            }
            .padding(horizontal = 9.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (copied) {
            TablerCheckIcon(size = 20.dp, tint = if (dark) Emerald300 else Emerald600)
        } else {
            TablerDownloadIcon(Modifier.alpha(0.7f), size = 20.dp, tint = textColor)
        }
        Spacer(Modifier.width(4.dp))
        Text(
            stringResource(if (copied) R.string.native_common_copied else R.string.native_common_copy),
            color = textColor,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

private const val RepoUrl = "https://github.com/Victor-root/glasskeep-enhanced"
private const val InstallCommand =
    "curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash"
private const val DockerCommand = "cd ~/glasskeep && docker compose pull && docker compose up -d"
private const val DockerSocketMountLine = "- /var/run/docker.sock:/var/run/docker.sock"

/** `gk-update-btn`: the two gradients no workspace theme retints. */
private val UpdateNowGradient = Brush.horizontalGradient(listOf(Color(0xFF00BC7D), Color(0xFF00A63E)))
private val ManualUpdateGradient = Brush.horizontalGradient(listOf(Color(0xFF101828), Color.Black))

private val Gray50 = Color(0xFFF9FAFB)
private val Gray100 = Color(0xFFF3F4F6)
private val Gray300 = Color(0xFFD1D5DC)
private val Gray400 = Color(0xFF99A1AF)
private val Gray500 = Color(0xFF6A7282)
private val Gray600 = Color(0xFF4A5565)
private val Gray800 = Color(0xFF1E2939)
private val Gray900 = Color(0xFF101828)
private val Emerald300 = Color(0xFF5EE9B5)
private val Emerald400 = Color(0xFF00D492)
private val Emerald500 = Color(0xFF00BC7D)
private val Emerald600 = Color(0xFF009966)
private val Emerald700 = Color(0xFF007A55)
private val Amber50 = Color(0xFFFFFBEB)
private val Amber200 = Color(0xFFFEE685)
private val Amber300 = Color(0xFFFFD230)
private val Amber500 = Color(0xFFFE9A00)
private val Amber800 = Color(0xFF973C00)
private val Amber900 = Color(0xFF7B3306)
