package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.ui.DarkCardBg
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightCardBg
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor

private val SidebarActiveGradient = Brush.linearGradient(listOf(Color(0xFF6366f1), Color(0xFF7c3aed)))
private val SidebarActiveShadowTint = Color(0xFF7C3AED)

/** The two entries that are not folders but lenses over the notes
 *  already loaded: only those carrying an image, and only those carrying
 *  a reminder (ALL_IMAGES / REMINDERS, utils/constants.js). Sentinels
 *  rather than an enum so they share [activeTag] with a real tag name,
 *  exactly as the web shares one `tagFilter`. */
internal const val SidebarAllImages = "__ALL_IMAGES__"
internal const val SidebarReminders = "__REMINDERS__"

/**
 * Notes drawer, ported from TagSidebar.jsx's own non-permanent (mobile)
 * mode: a 288dp panel sliding in from the left over a plain, non-animated
 * scrim, matching the web's own tap-outside-to-close / no-swipe-to-close
 * behaviour.
 */
@Composable
fun TagSidebar(
    open: Boolean,
    dark: Boolean,
    tags: List<Pair<String, Int>>,
    activeTag: String?,
    onSelectNotes: () -> Unit,
    onSelectTag: (String) -> Unit,
    onSelectImages: () -> Unit,
    onSelectReminders: () -> Unit,
    onOpenArchived: () -> Unit,
    onOpenTrash: () -> Unit,
    onClose: () -> Unit,
) {
    if (open) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.3f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { onClose() },
        )
    }

    AnimatedVisibility(
        visible = open,
        enter = slideInHorizontally(animationSpec = tween(200)) { -it },
        exit = slideOutHorizontally(animationSpec = tween(200)) { -it },
    ) {
        val titleColor = if (dark) DarkTitleColor else LightTitleColor
        val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
        val panelBg = if (dark) DarkCardBg else LightCardBg
        val openMenuLabel = stringResource(R.string.native_sidebar_open)

        Column(
            modifier = Modifier
                .width(288.dp)
                .fillMaxHeight()
                .background(panelBg),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.native_sidebar_tags_title),
                    color = titleColor,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 18.sp,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .semantics { contentDescription = openMenuLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onClose() }
                        .padding(6.dp),
                ) {
                    CloseIcon(size = 20.dp, tint = titleColor)
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(8.dp),
            ) {
                SidebarNavItem(
                    icon = { tint -> NotesIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_header_notes_label),
                    active = activeTag == null,
                    titleColor = titleColor,
                    onClick = onSelectNotes,
                )
                Spacer(Modifier.height(4.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarImagesIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_all_images),
                    active = activeTag == SidebarAllImages,
                    titleColor = titleColor,
                    onClick = onSelectImages,
                )
                Spacer(Modifier.height(4.dp))
                SidebarNavItem(
                    icon = { tint -> ArchiveIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_archived_title),
                    active = false,
                    titleColor = titleColor,
                    onClick = onOpenArchived,
                )
                Spacer(Modifier.height(4.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarRemindersIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_reminders),
                    active = activeTag == SidebarReminders,
                    titleColor = titleColor,
                    onClick = onSelectReminders,
                )
                Spacer(Modifier.height(4.dp))
                SidebarNavItem(
                    icon = { tint -> TrashIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_trash_title),
                    active = false,
                    titleColor = titleColor,
                    onClick = onOpenTrash,
                )
                Spacer(Modifier.height(8.dp))

                if (tags.isEmpty()) {
                    Text(
                        stringResource(R.string.native_sidebar_tags_empty),
                        color = subtextColor,
                        fontSize = 14.sp,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                } else {
                    tags.forEachIndexed { index, (tag, count) ->
                        SidebarNavItem(
                            icon = { tint -> TagIcon(size = 20.dp, tint = tint) },
                            label = tag,
                            count = count,
                            active = tag == activeTag,
                            titleColor = titleColor,
                            subtextColor = subtextColor,
                            onClick = { onSelectTag(tag) },
                        )
                        if (index != tags.lastIndex) Spacer(Modifier.height(4.dp))
                    }
                }
            }

            Box(Modifier.windowInsetsPadding(WindowInsets.navigationBars))
        }
    }
}

@Composable
private fun SidebarNavItem(
    icon: @Composable (tint: Color) -> Unit,
    label: String,
    active: Boolean,
    titleColor: Color,
    onClick: () -> Unit,
    count: Int? = null,
    subtextColor: Color = titleColor,
) {
    val shape = RoundedCornerShape(6.dp)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .then(
                if (active) {
                    Modifier
                        .shadow(elevation = 2.dp, shape = shape, ambientColor = SidebarActiveShadowTint.copy(alpha = 0.55f), spotColor = SidebarActiveShadowTint.copy(alpha = 0.55f))
                        .background(SidebarActiveGradient)
                } else {
                    Modifier
                },
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        icon(if (active) Color.White else titleColor)
        Text(
            label,
            color = if (active) Color.White else titleColor,
            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
            fontSize = 14.sp,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        if (count != null) {
            Text(
                count.toString(),
                color = if (active) Color.White.copy(alpha = 0.85f) else subtextColor.copy(alpha = 0.7f),
                fontSize = 12.sp,
            )
        }
    }
}
