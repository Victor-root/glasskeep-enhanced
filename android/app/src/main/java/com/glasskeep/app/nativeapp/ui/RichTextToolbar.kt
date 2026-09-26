package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.FlowRowScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.RichAlign
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.TypographyBlock
import com.glasskeep.app.nativeapp.data.TypographyProfile

/** editorToolbarMode: the user's saved choice between the phone default
 *  (one dense row of the most-used tools) and the full four-group bar. */
enum class RichToolbarMode { SIMPLE, ADVANCED }

fun richToolbarModeOf(raw: String?): RichToolbarMode =
    if (raw == "advanced") RichToolbarMode.ADVANCED else RichToolbarMode.SIMPLE

/** Everything the toolbar can do to the document, in one holder so the
 *  bar itself takes one parameter instead of a dozen lambdas. Each call
 *  names the block and the range it applies to, which is always the
 *  active block's current selection. */
class RichToolbarActions(
    val setBlockKind: (id: String, kind: RichBlockKind) -> Unit,
    val toggleCodeBlock: (id: String, start: Int, end: Int) -> Unit,
    val toggleMark: (id: String, start: Int, end: Int, type: RichMarkType) -> Unit,
    val setMark: (id: String, start: Int, end: Int, type: RichMarkType, value: String?, color: String?) -> Unit,
    val clearMark: (id: String, start: Int, end: Int, type: RichMarkType) -> Unit,
    val clearFormatting: (id: String, start: Int, end: Int) -> Unit,
    val setAlign: (id: String, align: RichAlign) -> Unit,
    val shiftIndent: (id: String, delta: Int) -> Unit,
    val insertDivider: (id: String, start: Int, end: Int) -> Unit,
)

/**
 * The toolbar's theme colours: `--rt-btn-active-bg` / `--rt-btn-active-text`
 * and `--rt-accent` of the workspace theme, the gradient of its primary
 * pills, and `--rt-divider`.
 */
internal class RichToolbarColors(themeId: String?, dark: Boolean) {
    val activeBg = WorkspaceTheme.rtActiveBg(themeId, dark)
    val activeText = WorkspaceTheme.rtActiveText(themeId, dark)
    val accent = WorkspaceTheme.rtAccent(themeId)
    val pill = WorkspaceTheme.accentGradient(themeId)
    val divider = if (dark) RtDividerDark else RtDividerLight

    fun background(active: Boolean): Color = if (active) activeBg else Color.Transparent
}

private enum class RichPopoverKind { FONT, SIZE, UNDERLINE, COLOR, HIGHLIGHT, TASK, LINK }

/** Where the link popover applies, fixed as it opens: the whole link the
 *  selection sits in (extendMarkRange), else the selection itself, and
 *  that link's address. */
private class RichLinkTarget(val blockId: String, val start: Int, val end: Int, val href: String?)

/**
 * The formatting bar as the web draws it inside the mobile sheet
 * (globalCSS.js:1711-1747, 4690-4706): super-groups stacked in a column,
 * each one a centred row that wraps, 4px between buttons, 6px above and
 * below, and a `--rt-divider` hairline between groups (never after the
 * last one). Vertical separators are hidden on a phone.
 *
 * [RichToolbarMode.SIMPLE] is RichTextToolbar.jsx:493-653, one group with
 * every tool in its exact order; [RichToolbarMode.ADVANCED] is
 * :656-889, four groups (font, paragraph, insert, block-style gallery).
 * Which one shows is the user's own `editorToolbarMode` setting, same as
 * on the web, not a guess from the screen size.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RichFormatToolbar(
    blocks: List<RichBlock>,
    state: RichEditorState,
    mode: RichToolbarMode,
    dark: Boolean,
    themeId: String?,
    titleColor: Color,
    taskStrike: Boolean,
    onTaskStrikeChange: (Boolean) -> Unit,
    actions: RichToolbarActions,
    typography: TypographyProfile,
) {
    val activeBlock = blocks.find { it.id == state.activeId }
    val selection = state.safeSelectionIn(activeBlock)
    val enabled = activeBlock != null
    val colors = remember(themeId, dark) { RichToolbarColors(themeId, dark) }
    var openPopover by remember { mutableStateOf<RichPopoverKind?>(null) }
    var linkTarget by remember { mutableStateOf<RichLinkTarget?>(null) }
    val caretMarks = activeBlock?.takeIf { selection.collapsed }
        ?.let { RichDoc.marksAtCaret(it.marks, it.text.length, selection.start) }
        .orEmpty()

    /** The mark of [type] the selection sits in: the one covering the whole
     *  selection, or at a collapsed caret the one it types into. */
    fun markOf(type: RichMarkType): RichMark? {
        val block = activeBlock ?: return null
        if (selection.collapsed) return caretMarks.firstOrNull { it.type == type }
        return RichDoc.markAt(block.marks, type, selection.min, selection.max)
    }

    // At a collapsed caret, what is armed for the next keystroke wins over
    // the marks around it (ProseMirror's stored marks, see RichEditorState).
    fun pendingOf(type: RichMarkType): PendingMark? =
        state.pendingMarks.firstOrNull { it.type == type }

    fun isActive(type: RichMarkType): Boolean {
        val block = activeBlock ?: return false
        if (!selection.collapsed) return RichDoc.isMarkActive(block.marks, type, selection.min, selection.max)
        pendingOf(type)?.let { return !it.remove }
        return caretMarks.any { it.type == type }
    }

    fun valueOf(type: RichMarkType): String? {
        pendingOf(type)?.let { return if (it.remove) null else it.value }
        return markOf(type)?.value
    }

    fun underlineColor(): String? {
        pendingOf(RichMarkType.UNDERLINE)?.let { return if (it.remove) null else it.color }
        return markOf(RichMarkType.UNDERLINE)?.color
    }

    fun toggle(type: RichMarkType) {
        val block = activeBlock ?: return
        if (selection.collapsed) {
            state.togglePending(type, activeAtCaret = caretMarks.any { it.type == type })
        } else {
            actions.toggleMark(block.id, selection.min, selection.max, type)
        }
    }

    fun apply(type: RichMarkType, value: String?, color: String? = null) {
        val block = activeBlock ?: return
        if (selection.collapsed) {
            state.setPending(type, value, color)
        } else {
            actions.setMark(block.id, selection.min, selection.max, type, value, color)
        }
    }

    fun clear(type: RichMarkType) {
        val block = activeBlock ?: return
        if (selection.collapsed) {
            state.clearPending(type, activeAtCaret = caretMarks.any { it.type == type })
        } else {
            actions.clearMark(block.id, selection.min, selection.max, type)
        }
    }

    /** stepFontSize(editor, ±1) (RichTextToolbar.jsx:306-315): walks the
     *  offered sizes from wherever the selection currently sits. */
    fun stepFontSize(delta: Int) {
        val current = valueOf(RichMarkType.FONT_SIZE) ?: RichDefaultFontSize
        val index = RichFontSizes.indexOf(current).takeIf { it >= 0 } ?: RichFontSizes.indexOf(RichDefaultFontSize)
        val next = RichFontSizes.getOrNull(index + delta) ?: return
        if (next == RichDefaultFontSize) clear(RichMarkType.FONT_SIZE) else apply(RichMarkType.FONT_SIZE, next)
    }

    val toolbarLabel = stringResource(R.string.native_richtext_toolbar_label)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = toolbarLabel }
            .padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 10.dp),
    ) {
        val fontButton: @Composable FlowRowScope.() -> Unit = {
            RichAnchoredButton(
                open = openPopover == RichPopoverKind.FONT,
                onOpenChange = { openPopover = if (it) RichPopoverKind.FONT else null },
                dark = dark,
                padding = 4.dp,
                popover = {
                    RichFontPopover(
                        current = valueOf(RichMarkType.FONT_FAMILY),
                        colors = colors,
                        titleColor = titleColor,
                        onPick = { value ->
                            if (value.isEmpty()) clear(RichMarkType.FONT_FAMILY) else apply(RichMarkType.FONT_FAMILY, value)
                            openPopover = null
                        },
                    )
                },
            ) { open ->
                val font = richFontFor(valueOf(RichMarkType.FONT_FAMILY))
                RichMenuButton(
                    label = font?.label ?: RichFonts.first().label,
                    tooltip = stringResource(R.string.native_richtext_font_family),
                    wide = true,
                    active = true,
                    enabled = enabled,
                    colors = colors,
                    titleColor = titleColor,
                    fontFamily = font?.family,
                    onClick = { openPopover = if (open) null else RichPopoverKind.FONT },
                )
            }
        }
        val sizeButton: @Composable FlowRowScope.() -> Unit = {
            RichAnchoredButton(
                open = openPopover == RichPopoverKind.SIZE,
                onOpenChange = { openPopover = if (it) RichPopoverKind.SIZE else null },
                dark = dark,
                padding = 4.dp,
                popover = {
                    RichSizePopover(
                        current = valueOf(RichMarkType.FONT_SIZE),
                        colors = colors,
                        titleColor = titleColor,
                        onPick = { value ->
                            if (value == RichDefaultFontSize) clear(RichMarkType.FONT_SIZE) else apply(RichMarkType.FONT_SIZE, value)
                            openPopover = null
                        },
                    )
                },
            ) { open ->
                RichMenuButton(
                    label = (valueOf(RichMarkType.FONT_SIZE) ?: RichDefaultFontSize).removeSuffix("px"),
                    tooltip = stringResource(R.string.native_richtext_font_size),
                    wide = false,
                    active = valueOf(RichMarkType.FONT_SIZE) != null,
                    enabled = enabled,
                    colors = colors,
                    titleColor = titleColor,
                    onClick = { openPopover = if (open) null else RichPopoverKind.SIZE },
                )
            }
        }
        val boldButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_bold),
                active = isActive(RichMarkType.BOLD),
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                onClick = { toggle(RichMarkType.BOLD) },
            ) { tint -> BoldIcon(size = 20.dp, tint = tint) }
        }
        val italicButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_italic),
                active = isActive(RichMarkType.ITALIC),
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                onClick = { toggle(RichMarkType.ITALIC) },
            ) { tint -> ItalicIcon(size = 20.dp, tint = tint) }
        }
        val underlineButton: @Composable FlowRowScope.() -> Unit = {
            RichAnchoredButton(
                open = openPopover == RichPopoverKind.UNDERLINE,
                onOpenChange = { openPopover = if (it) RichPopoverKind.UNDERLINE else null },
                dark = dark,
                popover = {
                    RichUnderlinePopover(
                        style = valueOf(RichMarkType.UNDERLINE) ?: "simple",
                        color = underlineColor(),
                        colors = colors,
                        dark = dark,
                        titleColor = titleColor,
                        onStyle = { apply(RichMarkType.UNDERLINE, it, underlineColor()) },
                        onColor = { apply(RichMarkType.UNDERLINE, valueOf(RichMarkType.UNDERLINE) ?: "simple", it) },
                        onRemove = { clear(RichMarkType.UNDERLINE); openPopover = null },
                    )
                },
            ) { open ->
                RichSplitButton(
                    active = isActive(RichMarkType.UNDERLINE),
                    chevronActive = open,
                    enabled = enabled,
                    colors = colors,
                    titleColor = titleColor,
                    contentDescription = stringResource(R.string.native_richtext_underline),
                    chevronDescription = stringResource(R.string.native_richtext_underline_options),
                    // toggleUnderline: off when on, else in the style of an
                    // underline the selection already touches (getAttributes).
                    onClick = {
                        if (isActive(RichMarkType.UNDERLINE)) {
                            clear(RichMarkType.UNDERLINE)
                        } else {
                            val touched = activeBlock?.marks?.firstOrNull {
                                it.type == RichMarkType.UNDERLINE && it.start < selection.max && it.end > selection.min
                            }
                            apply(RichMarkType.UNDERLINE, touched?.value ?: "simple", touched?.color)
                        }
                    },
                    onChevron = { openPopover = if (open) null else RichPopoverKind.UNDERLINE },
                ) { tint ->
                    UnderlineIcon(
                        size = 20.dp,
                        tint = tint,
                        style = valueOf(RichMarkType.UNDERLINE),
                        lineColor = richColorOf(underlineColor(), dark),
                    )
                }
            }
        }
        val strikeButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_strikethrough),
                active = isActive(RichMarkType.STRIKE),
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                onClick = { toggle(RichMarkType.STRIKE) },
            ) { tint -> StrikeIcon(size = 20.dp, tint = tint) }
        }
        val clearButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_clear_formatting),
                active = false,
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                onClick = {
                    val block = activeBlock ?: return@RichToolbarButton
                    state.clearAllPending()
                    actions.clearFormatting(block.id, selection.min, selection.max)
                },
            ) { tint -> ClearFormattingIcon(size = 20.dp, tint = tint) }
        }
        val colorButton: @Composable FlowRowScope.() -> Unit = {
            RichAnchoredButton(
                open = openPopover == RichPopoverKind.COLOR,
                onOpenChange = { openPopover = if (it) RichPopoverKind.COLOR else null },
                dark = dark,
                popover = {
                    RichSwatchPopover(
                        swatches = RichTextColors,
                        current = valueOf(RichMarkType.TEXT_COLOR),
                        colors = colors,
                        dark = dark,
                        onPick = { apply(RichMarkType.TEXT_COLOR, it); openPopover = null },
                        onClear = { clear(RichMarkType.TEXT_COLOR); openPopover = null },
                    )
                },
            ) { open ->
                RichSwatchButton(
                    contentDescription = stringResource(R.string.native_richtext_text_color),
                    barColor = richColorOf(valueOf(RichMarkType.TEXT_COLOR), dark) ?: Color(0xFF111827),
                    active = valueOf(RichMarkType.TEXT_COLOR) != null,
                    enabled = enabled,
                    colors = colors,
                    dark = dark,
                    titleColor = titleColor,
                    onClick = { openPopover = if (open) null else RichPopoverKind.COLOR },
                ) { tint -> TextColorIcon(size = 18.dp, tint = tint) }
            }
        }
        val highlightButton: @Composable FlowRowScope.() -> Unit = {
            RichAnchoredButton(
                open = openPopover == RichPopoverKind.HIGHLIGHT,
                onOpenChange = { openPopover = if (it) RichPopoverKind.HIGHLIGHT else null },
                dark = dark,
                popover = {
                    RichSwatchPopover(
                        swatches = RichHighlights,
                        current = valueOf(RichMarkType.HIGHLIGHT),
                        colors = colors,
                        dark = dark,
                        onPick = { apply(RichMarkType.HIGHLIGHT, it); openPopover = null },
                        onClear = { clear(RichMarkType.HIGHLIGHT); openPopover = null },
                    )
                },
            ) { open ->
                RichSwatchButton(
                    contentDescription = stringResource(R.string.native_richtext_highlight),
                    barColor = richColorOf(valueOf(RichMarkType.HIGHLIGHT) ?: RichDoc.DefaultHighlight, dark) ?: Color.Transparent,
                    active = valueOf(RichMarkType.HIGHLIGHT) != null,
                    enabled = enabled,
                    colors = colors,
                    dark = dark,
                    titleColor = titleColor,
                    onClick = { openPopover = if (open) null else RichPopoverKind.HIGHLIGHT },
                ) { tint -> HighlightIcon(size = 18.dp, tint = tint) }
            }
        }
        val bulletButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_bullet_list),
                active = activeBlock?.kind == RichBlockKind.BULLET_ITEM,
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                fixedTint = BulletListTint,
                onClick = { activeBlock?.let { actions.setBlockKind(it.id, RichBlockKind.BULLET_ITEM) } },
            ) { tint -> BulletListIcon(size = 20.dp, tint = tint) }
        }
        val numberedButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_numbered_list),
                active = activeBlock?.kind == RichBlockKind.NUMBERED_ITEM,
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                fixedTint = NumberedListTint,
                onClick = { activeBlock?.let { actions.setBlockKind(it.id, RichBlockKind.NUMBERED_ITEM) } },
            ) { tint -> NumberedListIcon(size = 20.dp, tint = tint) }
        }
        val taskButton: @Composable FlowRowScope.() -> Unit = {
            RichAnchoredButton(
                open = openPopover == RichPopoverKind.TASK,
                onOpenChange = { openPopover = if (it) RichPopoverKind.TASK else null },
                dark = dark,
                popover = {
                    RichTaskOptionsPopover(
                        strike = taskStrike,
                        colors = colors,
                        titleColor = titleColor,
                        onStrikeChange = onTaskStrikeChange,
                    )
                },
            ) { open ->
                RichSplitButton(
                    active = activeBlock?.kind == RichBlockKind.TASK_ITEM,
                    chevronActive = open,
                    enabled = enabled,
                    colors = colors,
                    titleColor = titleColor,
                    fixedTint = if (dark) TaskListTintDark else TaskListTintLight,
                    contentDescription = stringResource(R.string.native_richtext_task_list),
                    chevronDescription = stringResource(R.string.native_richtext_task_list_options),
                    onClick = { activeBlock?.let { actions.setBlockKind(it.id, RichBlockKind.TASK_ITEM) } },
                    onChevron = { openPopover = if (open) null else RichPopoverKind.TASK },
                ) { tint -> TaskListIcon(size = 20.dp, tint = tint) }
            }
        }
        val alignButtons: @Composable FlowRowScope.(withJustify: Boolean) -> Unit = { withJustify ->
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_align_left),
                // "Left" reads as active whenever nothing else is chosen
                // (RichTextToolbar.jsx:444), not only after an explicit set.
                active = activeBlock?.align == RichAlign.LEFT,
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                onClick = { activeBlock?.let { actions.setAlign(it.id, RichAlign.LEFT) } },
            ) { tint -> AlignLeftIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_align_center),
                active = activeBlock?.align == RichAlign.CENTER,
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                onClick = { activeBlock?.let { actions.setAlign(it.id, RichAlign.CENTER) } },
            ) { tint -> AlignCenterIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_align_right),
                active = activeBlock?.align == RichAlign.RIGHT,
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                onClick = { activeBlock?.let { actions.setAlign(it.id, RichAlign.RIGHT) } },
            ) { tint -> AlignRightIcon(size = 20.dp, tint = tint) }
            if (withJustify) {
                RichToolbarButton(
                    contentDescription = stringResource(R.string.native_richtext_align_justify),
                    active = activeBlock?.align == RichAlign.JUSTIFY,
                    enabled = enabled,
                    colors = colors,
                    titleColor = titleColor,
                    onClick = { activeBlock?.let { actions.setAlign(it.id, RichAlign.JUSTIFY) } },
                ) { tint -> AlignJustifyIcon(size = 20.dp, tint = tint) }
            }
        }
        val separatorButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_separator),
                active = false,
                enabled = enabled,
                colors = colors,
                titleColor = titleColor,
                onClick = { activeBlock?.let { actions.insertDivider(it.id, selection.min, selection.max) } },
            ) { tint -> SeparatorIcon(size = 20.dp, tint = tint) }
        }
        val linkButton: @Composable FlowRowScope.() -> Unit = {
            RichAnchoredButton(
                open = openPopover == RichPopoverKind.LINK,
                onOpenChange = { openPopover = if (it) RichPopoverKind.LINK else null },
                dark = dark,
                padding = 10.dp,
                popover = {
                    linkTarget?.let { target ->
                        RichLinkPopover(
                            existingHref = target.href,
                            colors = colors,
                            dark = dark,
                            titleColor = titleColor,
                            onApply = { raw ->
                                val url = RichDoc.ensureSchemeUrl(raw)
                                if (url.isNotEmpty()) {
                                    // With nothing selected the link is armed
                                    // for what is typed next, as setLink does.
                                    if (target.start < target.end) {
                                        actions.setMark(target.blockId, target.start, target.end, RichMarkType.LINK, url, null)
                                    } else {
                                        state.setPending(RichMarkType.LINK, url)
                                    }
                                    openPopover = null
                                }
                            },
                            onRemove = {
                                if (target.start < target.end) {
                                    actions.clearMark(target.blockId, target.start, target.end, RichMarkType.LINK)
                                } else {
                                    state.clearPending(RichMarkType.LINK, activeAtCaret = false)
                                }
                                openPopover = null
                            },
                        )
                    }
                },
            ) { open ->
                RichLinkButton(
                    active = isActive(RichMarkType.LINK) || open,
                    enabled = enabled,
                    colors = colors,
                    titleColor = titleColor,
                    onClick = {
                        if (open) {
                            openPopover = null
                        } else {
                            val block = activeBlock ?: return@RichLinkButton
                            // extendMarkRange("link"): inside a link, the whole link.
                            val link = RichDoc.markAt(block.marks, RichMarkType.LINK, selection.min, selection.max)
                            val armed = pendingOf(RichMarkType.LINK)?.takeUnless { it.remove }?.value
                            linkTarget = RichLinkTarget(
                                block.id,
                                link?.start ?: selection.min,
                                link?.end ?: selection.max,
                                armed ?: link?.value,
                            )
                            openPopover = RichPopoverKind.LINK
                        }
                    },
                )
            }
        }

        when (mode) {
            RichToolbarMode.SIMPLE -> RichToolbarGroup(divider = colors.divider, last = true) {
                fontButton()
                sizeButton()
                boldButton()
                italicButton()
                underlineButton()
                strikeButton()
                clearButton()
                colorButton()
                highlightButton()
                bulletButton()
                numberedButton()
                taskButton()
                alignButtons(false)
                separatorButton()
                linkButton()
            }
            RichToolbarMode.ADVANCED -> {
                RichToolbarGroup(divider = colors.divider, last = false) {
                    fontButton()
                    sizeButton()
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_font_size_up),
                        active = false,
                        enabled = enabled,
                        colors = colors,
                        titleColor = titleColor,
                        onClick = { stepFontSize(1) },
                    ) { tint -> TextIncreaseIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_font_size_down),
                        active = false,
                        enabled = enabled,
                        colors = colors,
                        titleColor = titleColor,
                        onClick = { stepFontSize(-1) },
                    ) { tint -> TextDecreaseIcon(size = 20.dp, tint = tint) }
                    clearButton()
                    boldButton()
                    italicButton()
                    underlineButton()
                    strikeButton()
                    colorButton()
                    highlightButton()
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_subscript),
                        active = isActive(RichMarkType.SUBSCRIPT),
                        enabled = enabled,
                        colors = colors,
                        titleColor = titleColor,
                        onClick = { toggle(RichMarkType.SUBSCRIPT) },
                    ) { tint -> SubscriptIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_superscript),
                        active = isActive(RichMarkType.SUPERSCRIPT),
                        enabled = enabled,
                        colors = colors,
                        titleColor = titleColor,
                        onClick = { toggle(RichMarkType.SUPERSCRIPT) },
                    ) { tint -> SuperscriptIcon(size = 20.dp, tint = tint) }
                }
                RichToolbarGroup(
                    divider = colors.divider,
                    last = false,
                    // The DOM order (RichTextToolbar.jsx) is actually lists+
                    // Indent, THEN align x4, THEN Outdent - but the mobile
                    // sheet's own CSS (globalCSS.js:1749-1775) explicitly
                    // reorders Outdent up next to Indent with `order:` and
                    // forces a hard line break before the align group with
                    // a zero-height 100%-width spacer, "so that single flat
                    // wrapping line reads better as: row 1 -> lists +
                    // Increase/Decrease indent together, row 2 -> the four
                    // alignment buttons". A single auto-wrapping FlowRow
                    // can't reproduce a GUARANTEED break (it only wraps if
                    // it happens to run out of width), so this group is two
                    // explicit rows instead, mirroring that forced split.
                    secondRow = { alignButtons(true) },
                ) {
                    bulletButton()
                    numberedButton()
                    taskButton()
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_indent),
                        active = false,
                        enabled = enabled && activeBlock.indent < 8,
                        colors = colors,
                        titleColor = titleColor,
                        fixedTint = IndentTint,
                        onClick = { activeBlock?.let { actions.shiftIndent(it.id, 1) } },
                    ) { tint -> IndentIncreaseIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_outdent),
                        active = false,
                        enabled = enabled && activeBlock.indent > 0,
                        colors = colors,
                        titleColor = titleColor,
                        fixedTint = OutdentTint,
                        onClick = { activeBlock?.let { actions.shiftIndent(it.id, -1) } },
                    ) { tint -> IndentDecreaseIcon(size = 20.dp, tint = tint) }
                }
                RichToolbarGroup(divider = colors.divider, last = false) {
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_code_block),
                        active = activeBlock?.kind == RichBlockKind.CODE_BLOCK,
                        enabled = enabled,
                        colors = colors,
                        titleColor = titleColor,
                        onClick = { activeBlock?.let { actions.toggleCodeBlock(it.id, selection.min, selection.max) } },
                    ) { tint -> CodeBlockIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_inline_code),
                        active = isActive(RichMarkType.CODE),
                        enabled = enabled,
                        colors = colors,
                        titleColor = titleColor,
                        onClick = { toggle(RichMarkType.CODE) },
                    ) { tint -> InlineCodeIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_quote),
                        active = activeBlock?.kind == RichBlockKind.QUOTE,
                        enabled = enabled,
                        colors = colors,
                        titleColor = titleColor,
                        onClick = { activeBlock?.let { actions.setBlockKind(it.id, RichBlockKind.QUOTE) } },
                    ) { tint -> QuoteIcon(size = 20.dp, tint = tint) }
                    separatorButton()
                    linkButton()
                }
                RichToolbarGroup(divider = colors.divider, last = true) {
                    val hint = stringResource(R.string.native_richtext_block_style_hint)
                    val paragraph = stringResource(R.string.native_richtext_paragraph)
                    RichStyleButton(
                        label = paragraph,
                        tooltip = String.format(hint, paragraph),
                        cap = 12.48f,
                        block = typography.p,
                        // BlockStyleButtons.jsx: `current = headingLevel ? h${level} : "p"` -
                        // Paragraphe reads active for ANY non-heading block
                        // (a bullet/numbered/task item, a quote...), not
                        // only the literal RichBlockKind.PARAGRAPH.
                        active = activeBlock != null && (1..5).none { activeBlock.kind == headingKindFor(it) },
                        enabled = enabled,
                        colors = colors,
                        dark = dark,
                        titleColor = titleColor,
                    ) { activeBlock?.let { actions.setBlockKind(it.id, RichBlockKind.PARAGRAPH) } }
                    for (level in 1..5) {
                        val kind = headingKindFor(level)
                        val label = String.format(stringResource(R.string.native_richtext_heading_level), level)
                        RichStyleButton(
                            label = label,
                            tooltip = String.format(hint, label),
                            cap = HeadingSampleCaps[level - 1],
                            block = typography.forKind(kind),
                            active = activeBlock?.kind == kind,
                            enabled = enabled,
                            colors = colors,
                            dark = dark,
                            titleColor = titleColor,
                        ) { activeBlock?.let { actions.setBlockKind(it.id, kind) } }
                    }
                }
            }
        }
    }
}

/** colouredList() (RichIcons.jsx:124-140): these five glyphs keep their own
 *  colour even when the button is active. */
private val BulletListTint = Color(0xFF6366F1)
private val NumberedListTint = Color(0xFF0EA5E9)
private val TaskListTintLight = Color(0xFF4B5563)
private val TaskListTintDark = Color(0xFFCBD5E1)
private val IndentTint = Color(0xFF10B981)
private val OutdentTint = Color(0xFFF59E0B)

/** `.tabler-icon--chevron`: 12px, stroke 2, at 75% inside a 75% span. */
private const val ChevronAlpha = 0.5625f

/** The same chevron in the colour and highlight buttons, whose span is at
 *  70% (`.rt-btn--has-chevron > .tabler-icon--chevron`). */
private const val SwatchChevronAlpha = 0.525f

/** One `.rt-sg`: a centred wrapping row with 4px gaps, 6px of padding
 *  above and below, and a hairline underneath unless it is the last.
 *  [secondRow], when given, renders as its own forced-separate wrapping
 *  row below [content], 8px under it (the flex gap on both sides of the
 *  zero-height break line) - for the one group (paragraph/list) whose
 *  mobile CSS guarantees a hard line break at a fixed point instead of
 *  only wrapping when it runs out of width (globalCSS.js:1749-1775). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RichToolbarGroup(
    divider: Color,
    last: Boolean,
    secondRow: (@Composable FlowRowScope.() -> Unit)? = null,
    content: @Composable FlowRowScope.() -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        FlowRow(
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = if (secondRow != null) 0.dp else 6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            content = content,
        )
        if (secondRow != null) {
            FlowRow(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                content = secondRow,
            )
        }
        if (!last) Box(Modifier.fillMaxWidth().height(1.dp).background(divider))
    }
}

/** Wraps a button that owns a popover so the popup anchors to it. */
@Composable
private fun RichAnchoredButton(
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
    dark: Boolean,
    padding: Dp = 8.dp,
    popover: @Composable () -> Unit,
    button: @Composable (open: Boolean) -> Unit,
) {
    Box {
        button(open)
        if (open) {
            RichPopover(dark = dark, onDismiss = { onOpenChange(false) }, padding = padding) { popover() }
        }
    }
}

/** `.rt-btn` at phone size: a 36dp tap target, 6px radius, a transparent
 *  1px border, 7px of padding, no fill at rest, and the theme's active
 *  pair when the tool is on. */
@Composable
private fun RichToolbarButton(
    contentDescription: String,
    active: Boolean,
    enabled: Boolean,
    colors: RichToolbarColors,
    titleColor: Color,
    fixedTint: Color? = null,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    Box(
        modifier = Modifier
            .heightIn(min = 36.dp)
            .widthIn(min = 36.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(colors.background(active))
            .semantics { this.contentDescription = contentDescription }
            .gkTooltip(contentDescription)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        icon(fixedTint ?: if (active) colors.activeText else titleColor)
    }
}

/**
 * `.rt-btn--menu`: a label and a chevron 4px apart. The font picker
 * ([wide], `.rt-btn--wide` in the sheet) is at least 110 wide and at most
 * half the row, always wears the active look with its accent outline and
 * centres its label, clipped; the size picker is as wide as its number.
 */
@Composable
private fun RichMenuButton(
    label: String,
    tooltip: String,
    wide: Boolean,
    active: Boolean,
    enabled: Boolean,
    colors: RichToolbarColors,
    titleColor: Color,
    fontFamily: FontFamily? = null,
    onClick: () -> Unit,
) {
    val content = if (active) colors.activeText else titleColor
    val shape = RoundedCornerShape(6.dp)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .then(
                if (wide) {
                    Modifier
                        .layout { measurable, constraints ->
                            val placeable = measurable.measure(constraints.copy(maxWidth = constraints.maxWidth / 2))
                            layout(placeable.width, placeable.height) { placeable.place(0, 0) }
                        }
                        .widthIn(min = 110.dp)
                        .width(IntrinsicSize.Max)
                } else {
                    Modifier.widthIn(min = 36.dp)
                },
            )
            .height(36.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(shape)
            .background(colors.background(active))
            .border(1.dp, if (wide) colors.accent.copy(alpha = 0.35f) else Color.Transparent, shape)
            .gkTooltip(tooltip)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 8.dp),
    ) {
        Text(
            label,
            color = content,
            fontSize = 14.08.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = fontFamily,
            letterSpacing = 0.01.em,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = if (wide) Modifier.weight(1f) else Modifier,
        )
        ChevronDownIcon(size = 12.dp, strokeWidth = 2f, tint = content.copy(alpha = ChevronAlpha))
    }
}

/** `.rt-splitbtn`: a 36dp body button and a 36dp chevron sharing one pill,
 *  with the inner corners squared off and the padding shifted outwards. */
@Composable
private fun RichSplitButton(
    active: Boolean,
    chevronActive: Boolean,
    enabled: Boolean,
    colors: RichToolbarColors,
    titleColor: Color,
    contentDescription: String,
    chevronDescription: String,
    fixedTint: Color? = null,
    onClick: () -> Unit,
    onChevron: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .height(36.dp)
                .widthIn(min = 36.dp)
                .alpha(if (enabled) 1f else 0.38f)
                .clip(RoundedCornerShape(topStart = 6.dp, bottomStart = 6.dp))
                .background(colors.background(active))
                .semantics { this.contentDescription = contentDescription }
                .gkTooltip(contentDescription)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onClick() }
                .padding(start = 8.dp, end = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            icon(fixedTint ?: if (active) colors.activeText else titleColor)
        }
        Box(
            modifier = Modifier
                .height(36.dp)
                .widthIn(min = 36.dp)
                .alpha(if (enabled) 1f else 0.38f)
                .clip(RoundedCornerShape(topEnd = 6.dp, bottomEnd = 6.dp))
                .background(colors.background(chevronActive))
                .semantics { this.contentDescription = chevronDescription }
                .gkTooltip(chevronDescription)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onChevron() }
                .padding(start = 3.dp, end = 8.dp),
            contentAlignment = Alignment.Center,
        ) {
            val tint = if (chevronActive) colors.activeText else titleColor
            ChevronDownIcon(size = 12.dp, strokeWidth = 2f, tint = tint.copy(alpha = ChevronAlpha))
        }
    }
}

/** `.rt-btn--swatch.rt-btn--has-chevron`: the 18px glyph over the current
 *  colour as a 16x3 bar (`.rt-icon-swatch`, 1px apart), then the dropdown
 *  chevron 2px further, 48dp in all. */
@Composable
private fun RichSwatchButton(
    contentDescription: String,
    barColor: Color,
    active: Boolean,
    enabled: Boolean,
    colors: RichToolbarColors,
    dark: Boolean,
    titleColor: Color,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val content = if (active) colors.activeText else titleColor
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterHorizontally),
        modifier = Modifier
            .height(36.dp)
            .widthIn(min = 36.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(colors.background(active))
            .semantics { this.contentDescription = contentDescription }
            .gkTooltip(contentDescription)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 8.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            icon(content)
            Spacer(Modifier.height(1.dp))
            Box(
                modifier = Modifier
                    .width(16.dp)
                    .height(3.dp)
                    .clip(RoundedCornerShape(1.dp))
                    .background(barColor)
                    .border(
                        width = 1.dp,
                        color = if (dark) Color.White.copy(alpha = 0.12f) else Color.Black.copy(alpha = 0.08f),
                        shape = RoundedCornerShape(1.dp),
                    ),
            )
        }
        ChevronDownIcon(size = 12.dp, strokeWidth = 2f, tint = content.copy(alpha = SwatchChevronAlpha))
    }
}

/** `.rt-btn--link`: a 68dp button, the 16px chain glyph and the lowercase
 *  "www" side by side in the middle, over the blue bar the web draws with
 *  ::after (39 x 1.5, 7px above the inner bottom edge, centred at 45%). */
@Composable
private fun RichLinkButton(
    active: Boolean,
    enabled: Boolean,
    colors: RichToolbarColors,
    titleColor: Color,
    onClick: () -> Unit,
) {
    val label = stringResource(R.string.native_richtext_link)
    val content = if (active) colors.activeText else titleColor
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
        modifier = Modifier
            .height(36.dp)
            .width(68.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(colors.background(active))
            .drawBehind {
                drawRoundRect(
                    color = Color(0xFF2563EB),
                    topLeft = Offset(16.45.dp.toPx(), size.height - (1f + 7f + 1.5f).dp.toPx()),
                    size = Size(39.dp.toPx(), 1.5.dp.toPx()),
                    cornerRadius = CornerRadius(1.dp.toPx()),
                )
            }
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() },
    ) {
        LinkIcon(size = 16.dp, tint = content)
        Text(
            "www",
            color = content,
            fontSize = 12.48.sp,
            lineHeight = 12.48.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.02.em,
        )
    }
}

/** `.rt-style-btn-sample`'s caps on the user's size x 0.7, H1 to H5. */
private val HeadingSampleCaps = listOf(17.6f, 16f, 14.4f, 13.12f, 12.48f)

/** `.rt-style-btn`: an 80x34 preview button whose own label is written in
 *  the style it applies, from the user's typography profile: its size x
 *  0.7 up to [cap] (globalCSS.js:3444-3519), weight, colour, italic and
 *  underline. Active, the label takes the active colour instead. */
@Composable
private fun RichStyleButton(
    label: String,
    tooltip: String,
    cap: Float,
    block: TypographyBlock,
    active: Boolean,
    enabled: Boolean,
    colors: RichToolbarColors,
    dark: Boolean,
    titleColor: Color,
    onClick: () -> Unit,
) {
    val fontSize = minOf(block.size * 16f * 0.7f, cap)
    Box(
        modifier = Modifier
            .width(80.dp)
            .height(34.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(colors.background(active))
            .border(
                width = 1.dp,
                color = if (active) colors.accent.copy(alpha = 0.45f) else colors.divider,
                shape = RoundedCornerShape(6.dp),
            )
            .semantics { contentDescription = label }
            .gkTooltip(tooltip)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 7.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            label,
            color = if (active) colors.activeText else (richColorOf(block.color, dark) ?: titleColor),
            fontSize = fontSize.sp,
            lineHeight = (fontSize * 1.3f).sp,
            letterSpacing = 0.sp,
            fontWeight = FontWeight(block.weight),
            fontStyle = if (block.italic) FontStyle.Italic else FontStyle.Normal,
            textDecoration = if (block.underline) TextDecoration.Underline else TextDecoration.None,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            // padding-block: 1px 3px, so the line sits a pixel high.
            modifier = Modifier.padding(top = 1.dp, bottom = 3.dp),
        )
    }
}

internal fun headingKindFor(level: Int): RichBlockKind = when (level) {
    1 -> RichBlockKind.HEADING_1
    2 -> RichBlockKind.HEADING_2
    3 -> RichBlockKind.HEADING_3
    4 -> RichBlockKind.HEADING_4
    else -> RichBlockKind.HEADING_5
}

// ---------------------------------------------------------------------------
// Popovers

/** Room around the card for its shadow, which the Popup's window would
 *  otherwise cut (the same reason FooterPopover pads its own). */
private val RichPopoverShadowRoom = 40.dp

/**
 * `.rt-pop` (globalCSS.js:3565-3583, 4703): a card at least 220dp wide on
 * a phone and otherwise as wide as its content, [padding] inside its 1px
 * border, pinned 6dp under its button, flipped above it when there is no
 * room below (or kept 8dp off the bottom when there is none above either),
 * always 8dp inside the screen, exactly as usePopoverPosition does
 * (Popover.jsx:35-79). It fades in over 0.12s from 2px higher, and a tap
 * anywhere outside it closes it.
 */
@Composable
internal fun RichPopover(
    dark: Boolean,
    onDismiss: () -> Unit,
    padding: Dp = 8.dp,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val positionProvider = remember(density) {
        object : PopupPositionProvider {
            override fun calculatePosition(
                anchorBounds: IntRect,
                windowSize: IntSize,
                layoutDirection: LayoutDirection,
                popupContentSize: IntSize,
            ): IntOffset {
                val room = with(density) { RichPopoverShadowRoom.roundToPx() }
                val margin = with(density) { 8.dp.roundToPx() }
                val gap = with(density) { 6.dp.roundToPx() }
                val width = popupContentSize.width - 2 * room
                val height = popupContentSize.height - 2 * room
                val left = anchorBounds.left
                    .coerceAtMost(windowSize.width - width - margin)
                    .coerceAtLeast(margin)
                val below = anchorBounds.bottom + gap
                val above = anchorBounds.top - gap - height
                val top = when {
                    below + height + margin <= windowSize.height -> below
                    above >= margin -> above
                    else -> maxOf(margin, windowSize.height - height - margin)
                }
                return IntOffset(left - room, top - room)
            }
        }
    }
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        val shape = RoundedCornerShape(10.dp)
        val appear = remember { Animatable(0f) }
        LaunchedEffect(Unit) { appear.animateTo(1f, tween(durationMillis = 120, easing = EaseOut)) }
        Box(
            Modifier
                .pointerInput(Unit) {
                    val room = RichPopoverShadowRoom.toPx()
                    detectTapGestures { tap ->
                        val onCard = tap.x >= room && tap.y >= room && tap.x <= size.width - room && tap.y <= size.height - room
                        if (!onCard) onDismiss()
                    }
                }
                .padding(RichPopoverShadowRoom),
        ) {
            Column(
                modifier = Modifier
                    .graphicsLayer {
                        alpha = appear.value
                        translationY = (appear.value - 1f) * 2.dp.toPx()
                    }
                    .widthIn(min = 220.dp)
                    .width(IntrinsicSize.Max)
                    .dropShadow(
                        shape,
                        Shadow(
                            radius = 32.dp,
                            color = if (dark) Color.Black.copy(alpha = 0.7f) else Color(0xFF111827).copy(alpha = 0.28f),
                            spread = (-6).dp,
                            offset = DpOffset(0.dp, 12.dp),
                        ),
                    )
                    .dropShadow(
                        shape,
                        Shadow(
                            radius = 8.dp,
                            color = if (dark) Color.Black.copy(alpha = 0.5f) else Color(0xFF111827).copy(alpha = 0.1f),
                            offset = DpOffset(0.dp, 2.dp),
                        ),
                    )
                    .clip(shape)
                    .background(if (dark) Color(0xFF1F2937) else Color.White)
                    .border(
                        width = 1.dp,
                        color = if (dark) Color.White.copy(alpha = 0.12f) else Color.Black.copy(alpha = 0.1f),
                        shape = shape,
                    )
                    .padding(padding + 1.dp),
            ) {
                content()
            }
        }
    }
}

/** `.rt-pop-label`. */
@Composable
private fun RichPopLabel(text: String, titleColor: Color, spaced: Boolean = false) {
    Text(
        text.uppercase(),
        color = titleColor.copy(alpha = 0.65f),
        fontSize = 11.52.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.04.em,
        modifier = Modifier.padding(top = if (spaced) 8.dp else 0.dp, bottom = 4.dp),
    )
}

/** `.rt-swatches`: six 1fr columns 5px apart, each holding a 28dp square
 *  with an inner and an outer ring, the current one ringed in the accent. */
@Composable
private fun RichSwatchGrid(swatches: List<String>, current: String?, colors: RichToolbarColors, dark: Boolean, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        for (row in swatches.chunked(6)) {
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                for (column in 0 until 6) {
                    Box(Modifier.weight(1f)) {
                        row.getOrNull(column)?.let { swatch ->
                            RichSwatch(swatch, swatch == current, colors, dark) { onPick(swatch) }
                        }
                    }
                }
            }
        }
    }
}

/** `.rt-swatch`: an inset 1px ring over the colour and a 1px ring outside
 *  it (black 12% / 8%, white 25% / 12% in dark mode); the current swatch's
 *  outer ring is 2px of the accent at 90%. */
@Composable
private fun RichSwatch(swatch: String, current: Boolean, colors: RichToolbarColors, dark: Boolean, onClick: () -> Unit) {
    val fill = richColorOf(swatch, dark) ?: Color.Transparent
    val inner = when {
        dark -> Color.White.copy(alpha = 0.25f)
        current -> Color.Black.copy(alpha = 0.2f)
        else -> Color.Black.copy(alpha = 0.12f)
    }
    val outer = when {
        current -> colors.accent.copy(alpha = 0.9f)
        dark -> Color.White.copy(alpha = 0.12f)
        else -> Color.Black.copy(alpha = 0.08f)
    }
    Box(
        modifier = Modifier
            .size(28.dp)
            .drawBehind {
                val radius = 6.dp.toPx()
                val ring = (if (current) 2 else 1).dp.toPx()
                val line = 1.dp.toPx()
                drawRoundRect(
                    outer,
                    topLeft = Offset(-ring, -ring),
                    size = Size(size.width + 2 * ring, size.height + 2 * ring),
                    cornerRadius = CornerRadius(radius + ring),
                )
                drawRoundRect(fill, cornerRadius = CornerRadius(radius))
                drawRoundRect(
                    inner,
                    topLeft = Offset(line / 2f, line / 2f),
                    size = Size(size.width - line, size.height - line),
                    cornerRadius = CornerRadius(radius - line / 2f),
                    style = Stroke(line),
                )
            }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
    )
}

/** `.rt-pop-clear`: the full-width "Default" pill in the theme's gradient. */
@Composable
private fun RichPopClearButton(label: String, colors: RichToolbarColors, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(colors.pill)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 11.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Color.White, fontSize = 12.8.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** `.rt-pop-clear--danger`: same pill, outlined in red instead. */
@Composable
private fun RichPopDangerButton(label: String, dark: Boolean, onClick: () -> Unit) {
    val color = if (dark) Color(0xFFF87171) else Color(0xFFDC2626)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 6.dp)
            .clip(RoundedCornerShape(6.dp))
            .border(
                width = 1.dp,
                color = if (dark) Color(0xFFF87171).copy(alpha = 0.32f) else Color(0xFFDC2626).copy(alpha = 0.28f),
                shape = RoundedCornerShape(6.dp),
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 11.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = color, fontSize = 12.8.sp, fontWeight = FontWeight.Medium)
    }
}

/** The colour and highlight popovers (RichTextToolbar.jsx:236-268): the
 *  swatches and the "Default" pill, nothing else. */
@Composable
private fun RichSwatchPopover(
    swatches: List<String>,
    current: String?,
    colors: RichToolbarColors,
    dark: Boolean,
    onPick: (String) -> Unit,
    onClear: () -> Unit,
) {
    RichSwatchGrid(swatches, current, colors, dark, onPick)
    RichPopClearButton(stringResource(R.string.native_richtext_default), colors, onClear)
}

/**
 * The underline popover (RichTextToolbar.jsx:182-234): the five line
 * styles in 1fr columns, eight colours, the "Default" pill that takes the
 * colour back off, then a red "remove underline". Picking a style or a
 * colour deliberately leaves it open, only removing closes it.
 */
@Composable
private fun RichUnderlinePopover(
    style: String,
    color: String?,
    colors: RichToolbarColors,
    dark: Boolean,
    titleColor: Color,
    onStyle: (String) -> Unit,
    onColor: (String?) -> Unit,
    onRemove: () -> Unit,
) {
    RichPopLabel(stringResource(R.string.native_richtext_underline_style), titleColor)
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (option in RichUnderlineStyles) {
            val selected = option == style
            val label = stringResource(underlineStyleLabel(option))
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(36.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(colors.background(selected))
                    .border(
                        width = 1.dp,
                        color = if (selected) colors.accent.copy(alpha = 0.45f) else colors.divider,
                        shape = RoundedCornerShape(6.dp),
                    )
                    .semantics { contentDescription = label }
                    .gkTooltip(label)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onStyle(option) },
                contentAlignment = Alignment.Center,
            ) {
                val textColor = if (selected) colors.activeText else titleColor
                UnderlineSample(style = option, color = richColorOf(color, dark) ?: textColor, textColor = textColor)
            }
        }
    }
    RichPopLabel(stringResource(R.string.native_richtext_underline_color), titleColor, spaced = true)
    RichSwatchGrid(RichUnderlineColors, color, colors, dark) { onColor(it) }
    RichPopClearButton(stringResource(R.string.native_richtext_default), colors) { onColor(null) }
    RichPopDangerButton(stringResource(R.string.native_richtext_underline_remove), dark, onRemove)
}

private fun underlineStyleLabel(style: String): Int = when (style) {
    "double" -> R.string.native_richtext_underline_double
    "dotted" -> R.string.native_richtext_underline_dotted
    "dashed" -> R.string.native_richtext_underline_dashed
    "wavy" -> R.string.native_richtext_underline_wavy
    else -> R.string.native_richtext_underline_simple
}

/** The "Aa" preview of one underline style, drawn rather than decorated:
 *  a dotted, dashed, double or wavy rule can't be expressed with
 *  TextDecoration, so the sample paints its own line. */
@Composable
private fun UnderlineSample(style: String, color: Color, textColor: Color) {
    val density = LocalDensity.current
    Text(
        "Aa",
        color = textColor,
        fontSize = 15.2.sp,
        modifier = Modifier
            .padding(horizontal = 6.dp)
            .drawBehind {
                val strokeWidth = with(density) { 1.4.dp.toPx() }
                val y = size.height - with(density) { 4.dp.toPx() }
                val dash = with(density) { 3.dp.toPx() }
                val gap = with(density) { 2.dp.toPx() }
                when (style) {
                    "double" -> {
                        drawLine(color, Offset(0f, y - strokeWidth * 1.6f), Offset(size.width, y - strokeWidth * 1.6f), strokeWidth)
                        drawLine(color, Offset(0f, y + strokeWidth * 1.6f), Offset(size.width, y + strokeWidth * 1.6f), strokeWidth)
                    }
                    "dotted" -> {
                        var x = 0f
                        while (x < size.width) {
                            drawLine(color, Offset(x, y), Offset(x + strokeWidth, y), strokeWidth)
                            x += strokeWidth + gap
                        }
                    }
                    "dashed" -> {
                        var x = 0f
                        while (x < size.width) {
                            drawLine(color, Offset(x, y), Offset(minOf(x + dash, size.width), y), strokeWidth)
                            x += dash + gap
                        }
                    }
                    "wavy" -> {
                        val step = dash + gap
                        var x = 0f
                        var up = true
                        while (x < size.width) {
                            val next = minOf(x + step, size.width)
                            drawLine(
                                color,
                                Offset(x, if (up) y + strokeWidth else y - strokeWidth),
                                Offset(next, if (up) y - strokeWidth else y + strokeWidth),
                                strokeWidth,
                            )
                            up = !up
                            x = next
                        }
                    }
                    else -> drawLine(color, Offset(0f, y), Offset(size.width, y), strokeWidth)
                }
            },
    )
}

/** One `.rt-font-row` / `.rt-size-row`: 6px 8px of padding, 13.6px text on
 *  a 20.4px line, the current one in the active pair. */
@Composable
private fun RichMenuRow(
    current: Boolean,
    colors: RichToolbarColors,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .background(colors.background(current))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        content()
    }
}

/** `.rt-pop--font`: every family written in itself, 1px apart, scrolling
 *  past 260dp and opening with the current one centred. */
@Composable
private fun RichFontPopover(current: String?, colors: RichToolbarColors, titleColor: Color, onPick: (String) -> Unit) {
    val scroll = rememberScrollState()
    var currentRow by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    LaunchedEffect(currentRow, scroll.viewportSize) {
        val (top, height) = currentRow ?: return@LaunchedEffect
        if (scroll.viewportSize > 0) scroll.scrollTo((top - scroll.viewportSize / 2 + height / 2).coerceAtLeast(0))
    }
    Column(
        verticalArrangement = Arrangement.spacedBy(1.dp),
        modifier = Modifier
            .heightIn(max = RichMenuPopoverMaxHeight)
            .verticalScroll(scroll),
    ) {
        for (option in RichFonts) {
            val selected = option.value == (current ?: "")
            RichMenuRow(
                current = selected,
                colors = colors,
                modifier = if (selected) {
                    Modifier.onGloballyPositioned { currentRow = it.positionInParent().y.toInt() to it.size.height }
                } else {
                    Modifier
                },
                onClick = { onPick(option.value) },
            ) {
                Text(
                    option.label,
                    color = if (selected) colors.activeText else titleColor,
                    fontSize = 13.6.sp,
                    lineHeight = 20.4.sp,
                    fontFamily = option.family,
                    maxLines = 1,
                )
            }
        }
    }
}

/** The list popovers' 260px cap, less their 4px padding and 1px border. */
private val RichMenuPopoverMaxHeight = 250.dp

/** `.rt-pop--fontsize`: the eight offered sizes, each number on the left,
 *  right-aligned in 26px, and the "Default" badge at the far end of the
 *  16 row. */
@Composable
private fun RichSizePopover(current: String?, colors: RichToolbarColors, titleColor: Color, onPick: (String) -> Unit) {
    Column(
        verticalArrangement = Arrangement.spacedBy(1.dp),
        modifier = Modifier
            .heightIn(max = RichMenuPopoverMaxHeight)
            .verticalScroll(rememberScrollState()),
    ) {
        for (size in RichFontSizes) {
            val selected = size == (current ?: RichDefaultFontSize)
            RichMenuRow(current = selected, colors = colors, onClick = { onPick(size) }) {
                Text(
                    size.removeSuffix("px"),
                    color = if (selected) colors.activeText else titleColor,
                    fontSize = 13.6.sp,
                    lineHeight = 20.4.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.End,
                    style = TextStyle(fontFeatureSettings = "tnum"),
                    modifier = Modifier.widthIn(min = 26.dp),
                )
                Spacer(Modifier.weight(1f))
                if (size == RichDefaultFontSize) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(colors.activeBg)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            stringResource(R.string.native_richtext_default).uppercase(),
                            color = colors.activeText,
                            fontSize = 10.4.sp,
                            lineHeight = 10.4.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.05.em,
                        )
                    }
                }
            }
        }
    }
}

/** `.rt-pop--task`: the one display option, "strike through checked
 *  items", a per-device reading preference that never touches the note. */
@Composable
private fun RichTaskOptionsPopover(
    strike: Boolean,
    colors: RichToolbarColors,
    titleColor: Color,
    onStrikeChange: (Boolean) -> Unit,
) {
    RichPopLabel(stringResource(R.string.native_richtext_task_list_options), titleColor)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Checkbox,
            ) { onStrikeChange(!strike) }
            .padding(horizontal = 6.dp, vertical = 7.dp),
    ) {
        GkCheckbox(checked = strike, onCheckedChange = null, accent = colors.accent)
        Text(
            stringResource(R.string.native_richtext_task_list_strike),
            color = titleColor,
            fontSize = 13.6.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

/**
 * LinkPopover.jsx: the address field, focused as it opens (Enter applies),
 * over the actions: "Apply" (or "Update" when the selection already is a
 * link), and for an existing link an icon button opening it and a red
 * "Remove". As wide as the actions need, never narrower than the phone's
 * 220dp popover; the address itself never widens it.
 */
@Composable
private fun RichLinkPopover(
    existingHref: String?,
    colors: RichToolbarColors,
    dark: Boolean,
    titleColor: Color,
    onApply: (String) -> Unit,
    onRemove: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    val focusRequester = remember { FocusRequester() }
    var href by remember { mutableStateOf(existingHref.orEmpty()) }
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    val linked = !existingHref.isNullOrEmpty()
    val shape = RoundedCornerShape(6.dp)
    val danger = if (dark) Color(0xFFF87171) else Color(0xFFDC2626)
    val openLabel = stringResource(R.string.native_richtext_link_open)
    val placeholder = stringResource(R.string.native_richtext_link_placeholder)
    Layout(
        content = {
            BasicTextField(
                value = href,
                onValueChange = { href = it },
                singleLine = true,
                textStyle = TextStyle(color = titleColor, fontSize = 14.08.sp),
                cursorBrush = SolidColor(titleColor),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onApply(href) }),
                modifier = Modifier
                    .height(32.dp)
                    .then(
                        if (focused) {
                            Modifier.dropShadow(shape, Shadow(radius = 0.dp, color = colors.accent.copy(alpha = 0.18f), spread = 3.dp))
                        } else {
                            Modifier
                        },
                    )
                    .border(1.dp, if (focused) colors.accent.copy(alpha = 0.5f) else colors.divider, shape)
                    .focusRequester(focusRequester)
                    .onFocusChanged { focused = it.isFocused },
                decorationBox = { inner ->
                    Box(Modifier.padding(horizontal = 11.dp), contentAlignment = Alignment.CenterStart) {
                        if (href.isEmpty()) {
                            Text(placeholder, color = titleColor.copy(alpha = 0.5f), fontSize = 14.08.sp, maxLines = 1)
                        }
                        inner()
                    }
                },
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val canApply = href.isNotBlank()
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(30.dp)
                        .alpha(if (canApply) 1f else 0.5f)
                        .clip(shape)
                        .background(colors.pill)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            enabled = canApply,
                            role = Role.Button,
                        ) { onApply(href) }
                        .padding(horizontal = 11.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        stringResource(if (linked) R.string.native_richtext_link_update else R.string.native_richtext_link_apply),
                        color = Color.White,
                        fontSize = 13.12.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                }
                if (linked) {
                    Box(
                        modifier = Modifier
                            .size(width = 34.dp, height = 30.dp)
                            .clip(shape)
                            .border(1.dp, colors.divider, shape)
                            .semantics { contentDescription = openLabel }
                            .gkTooltip(openLabel)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { uriHandler.openSafely(RichDoc.ensureSchemeUrl(href.ifBlank { existingHref.orEmpty() })) },
                        contentAlignment = Alignment.Center,
                    ) {
                        ExternalLinkIcon(size = 16.dp, tint = titleColor)
                    }
                    Box(
                        modifier = Modifier
                            .height(30.dp)
                            .clip(shape)
                            .border(1.dp, danger.copy(alpha = if (dark) 0.32f else 0.28f), shape)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onRemove() }
                            .padding(horizontal = 11.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            stringResource(R.string.native_richtext_link_remove),
                            color = danger,
                            fontSize = 13.12.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                        )
                    }
                }
            }
        },
    ) { measurables, constraints ->
        val gap = 8.dp.roundToPx()
        // 220dp less the 10dp padding and 1dp border on each side.
        val minWidth = 198.dp.roundToPx()
        val width = maxOf(minWidth, measurables[1].maxIntrinsicWidth(Constraints.Infinity))
            .coerceAtMost(constraints.maxWidth)
        val field = measurables[0].measure(Constraints.fixedWidth(width))
        val actions = measurables[1].measure(Constraints.fixedWidth(width))
        layout(width, field.height + gap + actions.height) {
            field.place(0, 0)
            actions.place(0, field.height + gap)
        }
    }
}
