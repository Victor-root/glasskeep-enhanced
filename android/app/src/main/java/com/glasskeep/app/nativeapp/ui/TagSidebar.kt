package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.platform.ViewConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightTitleColor

/** The drawer's views other than the plain notes: two lenses over the
 *  notes already loaded, only those carrying an image and only those
 *  carrying a reminder, and the archive and the trash, each its own list
 *  (ALL_IMAGES / REMINDERS, utils/constants.js, and "ARCHIVED" /
 *  "TRASHED"). Sentinels rather than an enum so they share [activeTag]
 *  with the web's singular `tagFilter`; ordinary tags use [activeTags] for
 *  single or multi-filter. */
internal const val SidebarAllImages = "__ALL_IMAGES__"
internal const val SidebarReminders = "__REMINDERS__"
internal const val SidebarArchived = "ARCHIVED"
internal const val SidebarTrashed = "TRASHED"

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
    onSelectArchived: () -> Unit,
    onSelectTrash: () -> Unit,
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
        // Mobile web keeps this an opaque --gk-statusbar surface, rather
        // than the generic white card background.
        val panelBg = WorkspaceTheme.statusBarColor(themeId, dark)
        // --gk-chrome-grad-from/to drive .gk-side-item--active on the web.
        // They belong to the selected workspace theme, not to GlassKeep's
        // violet default.
        val activeGradient = WorkspaceTheme.accentGradient(themeId)
        val activeGlow = WorkspaceTheme.gradTo(themeId).copy(alpha = 0.55f)
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
                    MultiTagBanner(
                        count = activeTags.size,
                        dark = dark,
                        onClear = onClearTagFilters,
                    )
                }
                SidebarNavItem(
                    icon = { tint -> NotesIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_notes_all),
                    active = activeTag == null && activeTags.isEmpty(),
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    activeGlow = activeGlow,
                    onClick = onSelectNotes,
                )
                Spacer(Modifier.height(4.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarImagesIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_all_images),
                    active = activeTag == SidebarAllImages,
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    activeGlow = activeGlow,
                    onClick = onSelectImages,
                )
                Spacer(Modifier.height(8.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarArchiveIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_archived_notes),
                    active = activeTag == SidebarArchived,
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    activeGlow = activeGlow,
                    onClick = onSelectArchived,
                )
                Spacer(Modifier.height(8.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarRemindersIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_sidebar_reminders),
                    active = activeTag == SidebarReminders,
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    activeGlow = activeGlow,
                    onClick = onSelectReminders,
                )
                Spacer(Modifier.height(8.dp))
                SidebarNavItem(
                    icon = { tint -> SidebarTrashIcon(size = 20.dp, tint = tint) },
                    label = stringResource(R.string.native_trash_title),
                    active = activeTag == SidebarTrashed,
                    titleColor = titleColor,
                    activeGradient = activeGradient,
                    activeGlow = activeGlow,
                    onClick = onSelectTrash,
                )
                Spacer(Modifier.height(8.dp))

                if (tags.isEmpty()) {
                    Text(
                        stringResource(R.string.native_sidebar_tags_empty),
                        color = Color(0xFF6A7282),
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        modifier = Modifier.padding(top = 8.dp),
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
                            activeGlow = activeGlow,
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
    activeGlow: Color,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    count: Int? = null,
    iconGap: Dp = 12.dp,
) {
    val shape = RoundedCornerShape(6.dp)
    // TagSidebar.jsx starts its long press on a plain 500ms timer, with no
    // vibration.
    val baseConfiguration = LocalViewConfiguration.current
    val webLongPress = remember(baseConfiguration) {
        object : ViewConfiguration by baseConfiguration {
            override val longPressTimeoutMillis = 500L
        }
    }
    CompositionLocalProvider(LocalViewConfiguration provides webLongPress) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (active) {
                        Modifier.dropShadow(
                            shape,
                            Shadow(radius = 10.dp, color = activeGlow, spread = (-4).dp, offset = DpOffset(0.dp, 2.dp)),
                        )
                    } else {
                        Modifier
                    },
                )
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
                    hapticFeedbackEnabled = false,
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
}

/** TagSidebar.jsx's multi-tag filter indicator, shown once two or more
 *  tags are selected: funnel, count, then its "clear" button. */
@Composable
private fun MultiTagBanner(count: Int, dark: Boolean, onClear: () -> Unit) {
    val shape = RoundedCornerShape(8.dp)
    val fg = if (dark) Color(0xFFC6D2FF) else Color(0xFF372AAC)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 4.dp, end = 4.dp, bottom = 12.dp)
            .clip(shape)
            .background(if (dark) Color(0x26615FFF) else Color(0xE6E0E7FF))
            .border(1.dp, if (dark) Color(0x667C86FF) else Color(0xFFA3B3FF), shape)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FunnelIcon(size = 16.dp, tint = fg)
        Text(
            stringResource(R.string.native_sidebar_active_tags, count),
            color = fg,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )
        Text(
            stringResource(R.string.native_sidebar_clear_tags),
            color = if (dark) Color(0xFFC6D2FF) else Color(0xFF432DD7),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .clickable(role = Role.Button) { onClear() }
                .padding(horizontal = 8.dp, vertical = 2.dp),
        )
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
