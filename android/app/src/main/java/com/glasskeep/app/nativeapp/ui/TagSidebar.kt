package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import com.glasskeep.app.ui.Indigo

/** The two entries that are not folders but lenses over the notes
 *  already loaded: only those carrying an image, and only those carrying
 *  a reminder (ALL_IMAGES / REMINDERS, utils/constants.js). Sentinels
 *  rather than an enum so they share [activeTag] with the web's singular
 *  `tagFilter`; ordinary tags use [activeTags] for single or multi-filter. */
internal const val SidebarAllImages = "__ALL_IMAGES__"
internal const val SidebarReminders = "__REMINDERS__"

/**
 * Notes drawer, ported from TagSidebar.jsx's own non-permanent (mobile)
 * mode: a 288dp panel over a plain scrim, both shown and hidden without
 * any transition (Tailwind v4's translate utilities are not covered by the
 * aside's transition list, so the web's drawer pops too), matching the
 * web's own tap-outside-to-close / no-swipe-to-close behaviour.
 */
@Composable
fun TagSidebar(
    open: Boolean,
    dark: Boolean,
    themeId: String?,
    tags: List<Pair<String, Int>>,
    activeTag: String?,
    activeTags: Set<String>,
    onSelectNotes: () -> Unit,
    onSelectTag: (tag: String, additive: Boolean) -> Unit,
    onClearTagFilters: () -> Unit,
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

    if (open) {
        val titleColor = if (dark) DarkTitleColor else LightTitleColor
        val subtextColor = if (dark) DarkSubtextColor else LightSubtextColor
        // Mobile web keeps this an opaque --gk-statusbar surface, rather
        // than the generic white card background.
        val panelBg = WorkspaceTheme.statusBarColor(themeId, dark)
        // --gk-chrome-grad-from/to drive .gk-side-item--active on the web.
        // They belong to the selected workspace theme, not to GlassKeep's
        // violet default.
        val activeGradient = WorkspaceTheme.accentGradient(themeId)
        val chrome = WorkspaceTheme.colorsFor(themeId, dark)
        val closeLabel = stringResource(R.string.native_common_close)

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
                    .height(76.dp)
                    .padding(horizontal = 16.dp),
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
                        .semantics { contentDescription = closeLabel }
                        .gkTooltip(closeLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onClose() }
                        .padding(8.dp),
                ) {
                    CloseIcon(size = 24.dp, tint = titleColor)
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .sidebarBodyEdge(chrome.chromeBorder, chrome.chromeShadow)
                    .verticalScroll(rememberScrollState())
                    // The 1dp border sits inside the nav box, before its padding.
                    .padding(start = 8.dp, top = 8.dp, end = 9.dp, bottom = 8.dp),
            ) {
                if (activeTags.size > 1) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 4.dp, vertical = 4.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Indigo.copy(alpha = if (dark) 0.18f else 0.12f))
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            stringResource(R.string.native_sidebar_active_tags, activeTags.size),
                            color = if (dark) Color(0xFFC7D2FE) else Color(0xFF3730A3),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            stringResource(R.string.native_sidebar_clear_tags),
                            color = if (dark) Color(0xFFA5B4FC) else Color(0xFF4F46E5),
                            fontSize = 12.sp,
                            modifier = Modifier.clickable(role = Role.Button) { onClearTagFilters() },
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
                SidebarNavItem(
                    icon = { tint -> NotesIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_notes_all),
                    active = activeTag == null && activeTags.isEmpty(),
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    onClick = onSelectNotes,
                )
                Spacer(Modifier.height(4.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarImagesIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_all_images),
                    active = activeTag == SidebarAllImages,
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    onClick = onSelectImages,
                )
                Spacer(Modifier.height(8.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarArchiveIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_archived_notes),
                    active = false,
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    onClick = onOpenArchived,
                )
                Spacer(Modifier.height(8.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarRemindersIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_reminders),
                    active = activeTag == SidebarReminders,
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    onClick = onSelectReminders,
                )
                Spacer(Modifier.height(8.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarTrashIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_trash_title),
                    active = false,
                    titleColor = titleColor,
                    activeGradient = activeGradient,
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
                            icon = { tint -> TagIcon(size = 20.dp, tint = tint, dotRadius = 0.9f) },
                            label = tag,
                            count = count,
                            active = activeTags.any { it.equals(tag, ignoreCase = true) },
                            titleColor = titleColor,
                            activeGradient = activeGradient,
                            iconGap = 8.dp,
                            onClick = { onSelectTag(tag, false) },
                            onLongClick = { onSelectTag(tag, true) },
                        )
                        if (index != tags.lastIndex) Spacer(Modifier.height(4.dp))
                    }
                }
            }

            Box(Modifier.windowInsetsPadding(WindowInsets.navigationBars))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SidebarNavItem(
    icon: @Composable (tint: Color) -> Unit,
    label: String,
    active: Boolean,
    titleColor: Color,
    activeGradient: Brush,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    count: Int? = null,
    iconGap: Dp = 12.dp,
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
                        // TagSidebar.jsx paints the active background over
                        // the full usable nav-row width (`nav p-2` is the
                        // only outer inset). Keeping a second inner inset
                        // made the colour stop too close to the icon.
                        .drawBehind {
                            drawRoundRect(
                                brush = activeGradient,
                                topLeft = Offset.Zero,
                                size = size,
                                cornerRadius = CornerRadius(6.dp.toPx()),
                            )
                        }
                } else {
                    Modifier
                },
            )
            .combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
                onLongClick = onLongClick,
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        icon(if (active) Color.White else titleColor)
        Spacer(Modifier.width(iconGap))
        Text(
            label,
            color = if (active) Color.White else titleColor,
            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
            fontSize = 16.sp,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        if (count != null) {
            Spacer(Modifier.width(12.dp))
            Text(
                count.toString(),
                color = (if (active) Color.White else titleColor).copy(alpha = 0.7f),
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
    }
}

/**
 * `.gk-sidebar-body`'s `border-right: 1px` and its
 * `box-shadow: 8px 0 24px -16px` (globalCSS.js:667-670): the line inside
 * the right edge, then the strip the shadow casts past it. The shadow's box
 * ends 8dp short of that edge (8dp offset, 16dp inset), blurred with a
 * standard deviation of 12dp.
 */
private fun Modifier.sidebarBodyEdge(border: Color, shadow: Color): Modifier = drawBehind {
    val stops = Array(SidebarShadowSteps + 1) { step ->
        val fraction = step.toFloat() / SidebarShadowSteps
        val distance = fraction * SidebarShadowDepth.value
        fraction to shadow.copy(alpha = shadow.alpha * gaussianCdf(-(distance + 8f) / 12f))
    }
    val depthPx = SidebarShadowDepth.toPx()
    drawRect(
        brush = Brush.horizontalGradient(*stops, startX = size.width, endX = size.width + depthPx),
        topLeft = Offset(size.width, 0f),
        size = Size(depthPx, size.height),
    )
    val stroke = 1.dp.toPx()
    drawRect(color = border, topLeft = Offset(size.width - stroke, 0f), size = Size(stroke, size.height))
}

private val SidebarShadowDepth = 24.dp
private const val SidebarShadowSteps = 12
