package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.FlowRowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
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
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.ui.Indigo

/** editorToolbarMode: the user's saved choice between the phone default
 *  (one dense row of the most-used tools) and the full four-group bar. */
enum class RichToolbarMode { SIMPLE, ADVANCED }

fun richToolbarModeOf(raw: String?): RichToolbarMode =
    if (raw == "advanced") RichToolbarMode.ADVANCED else RichToolbarMode.SIMPLE

/** Everything the toolbar can do to the document, in one holder so the
 *  bar itself takes one parameter instead of a dozen lambdas. Each call
 *  names the block and the range it applies to, which is always the
 *  focused block's current selection. */
class RichToolbarActions(
    val setBlockKind: (id: String, kind: RichBlockKind) -> Unit,
    val toggleMark: (id: String, start: Int, end: Int, type: RichMarkType) -> Unit,
    val setMark: (id: String, start: Int, end: Int, type: RichMarkType, value: String?, color: String?) -> Unit,
    val clearMark: (id: String, start: Int, end: Int, type: RichMarkType) -> Unit,
    val clearFormatting: (id: String, start: Int, end: Int) -> Unit,
    val setAlign: (id: String, align: RichAlign) -> Unit,
    val shiftIndent: (id: String, delta: Int) -> Unit,
    val insertDivider: (id: String) -> Unit,
    val requestLink: (id: String, start: Int, end: Int, existingHref: String?) -> Unit,
)

private enum class RichPopoverKind { FONT, SIZE, UNDERLINE, COLOR, HIGHLIGHT, TASK }

/**
 * The formatting bar as the web draws it inside the mobile sheet
 * (globalCSS.js:1711-1747): super-groups stacked in a column, each one a
 * centred row that wraps, 4px between buttons, 6px above and below, and a
 * `--rt-divider` hairline between groups (never after the last one).
 * Vertical separators are hidden on a phone.
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
    titleColor: Color,
    taskStrike: Boolean,
    onTaskStrikeChange: (Boolean) -> Unit,
    actions: RichToolbarActions,
) {
    val focusedBlock = blocks.find { it.id == state.focusedId }
    val selection = state.safeSelectionIn(focusedBlock)
    val enabled = focusedBlock != null
    val divider = if (dark) RtDividerDark else RtDividerLight
    var openPopover by remember { mutableStateOf<RichPopoverKind?>(null) }

    // A mark is "on" either because it covers the selection, or because it
    // is waiting to be applied to whatever gets typed next at a collapsed
    // cursor (the web's own stored-marks behaviour, see RichEditorState).
    fun isActive(type: RichMarkType): Boolean {
        val block = focusedBlock ?: return false
        if (state.pendingMarks.any { it.type == type }) return true
        return RichDoc.isMarkActive(block.marks, type, selection.min, selection.max)
    }

    fun valueOf(type: RichMarkType): String? {
        val block = focusedBlock ?: return null
        state.pendingMarks.firstOrNull { it.type == type }?.let { return it.value }
        return RichDoc.markAt(block.marks, type, selection.min, selection.max)?.value
    }

    fun underlineColor(): String? {
        val block = focusedBlock ?: return null
        state.pendingMarks.firstOrNull { it.type == RichMarkType.UNDERLINE }?.let { return it.color }
        return RichDoc.markAt(block.marks, RichMarkType.UNDERLINE, selection.min, selection.max)?.color
    }

    fun toggle(type: RichMarkType) {
        val block = focusedBlock ?: return
        if (selection.collapsed) state.togglePending(type) else actions.toggleMark(block.id, selection.min, selection.max, type)
    }

    fun apply(type: RichMarkType, value: String?, color: String? = null) {
        val block = focusedBlock ?: return
        if (selection.collapsed) {
            state.setPending(type, value, color)
        } else {
            actions.setMark(block.id, selection.min, selection.max, type, value, color)
        }
    }

    fun clear(type: RichMarkType) {
        val block = focusedBlock ?: return
        state.clearPending(type)
        if (!selection.collapsed) actions.clearMark(block.id, selection.min, selection.max, type)
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
                popover = {
                    RichFontPopover(
                        current = valueOf(RichMarkType.FONT_FAMILY),
                        dark = dark,
                        titleColor = titleColor,
                        onPick = { value ->
                            if (value.isEmpty()) clear(RichMarkType.FONT_FAMILY) else apply(RichMarkType.FONT_FAMILY, value)
                            openPopover = null
                        },
                    )
                },
            ) { open ->
                RichMenuButton(
                    label = richFontFor(valueOf(RichMarkType.FONT_FAMILY))?.label ?: RichFonts.first().label,
                    minWidth = 110.dp,
                    enabled = enabled,
                    dark = dark,
                    // .rt-btn--wide wears the active look permanently, even
                    // with no font chosen (globalCSS.js:3227-3263).
                    alwaysActive = true,
                    fontFamily = richFontFor(valueOf(RichMarkType.FONT_FAMILY))?.family,
                    onClick = { openPopover = if (open) null else RichPopoverKind.FONT },
                )
            }
        }
        val sizeButton: @Composable FlowRowScope.() -> Unit = {
            RichAnchoredButton(
                open = openPopover == RichPopoverKind.SIZE,
                onOpenChange = { openPopover = if (it) RichPopoverKind.SIZE else null },
                dark = dark,
                popover = {
                    RichSizePopover(
                        current = valueOf(RichMarkType.FONT_SIZE),
                        dark = dark,
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
                    minWidth = 64.dp,
                    enabled = enabled,
                    dark = dark,
                    active = valueOf(RichMarkType.FONT_SIZE) != null,
                    onClick = { openPopover = if (open) null else RichPopoverKind.SIZE },
                )
            }
        }
        val boldButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_bold),
                active = isActive(RichMarkType.BOLD),
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { toggle(RichMarkType.BOLD) },
            ) { tint -> BoldIcon(size = 20.dp, tint = tint) }
        }
        val italicButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_italic),
                active = isActive(RichMarkType.ITALIC),
                enabled = enabled,
                dark = dark,
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
                    dark = dark,
                    titleColor = titleColor,
                    contentDescription = stringResource(R.string.native_richtext_underline),
                    chevronDescription = stringResource(R.string.native_richtext_underline_options),
                    onClick = { apply(RichMarkType.UNDERLINE, valueOf(RichMarkType.UNDERLINE), underlineColor()) },
                    onChevron = { openPopover = if (open) null else RichPopoverKind.UNDERLINE },
                ) { tint -> UnderlineIcon(size = 20.dp, tint = tint) }
            }
        }
        val strikeButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_strikethrough),
                active = isActive(RichMarkType.STRIKE),
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { toggle(RichMarkType.STRIKE) },
            ) { tint -> StrikeIcon(size = 20.dp, tint = tint) }
        }
        val clearButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_clear_formatting),
                active = false,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = {
                    val block = focusedBlock ?: return@RichToolbarButton
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
                        label = stringResource(R.string.native_richtext_text_color),
                        swatches = RichTextColors,
                        current = valueOf(RichMarkType.TEXT_COLOR),
                        dark = dark,
                        titleColor = titleColor,
                        onPick = { apply(RichMarkType.TEXT_COLOR, it); openPopover = null },
                        onClear = { clear(RichMarkType.TEXT_COLOR); openPopover = null },
                    )
                },
            ) { open ->
                RichSwatchButton(
                    contentDescription = stringResource(R.string.native_richtext_text_color),
                    barColor = richColorOf(valueOf(RichMarkType.TEXT_COLOR), dark) ?: Color(0xFF111827),
                    active = valueOf(RichMarkType.TEXT_COLOR) != null || open,
                    enabled = enabled,
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
                        label = stringResource(R.string.native_richtext_highlight),
                        swatches = RichHighlights,
                        current = valueOf(RichMarkType.HIGHLIGHT),
                        dark = dark,
                        titleColor = titleColor,
                        onPick = { apply(RichMarkType.HIGHLIGHT, it); openPopover = null },
                        onClear = { clear(RichMarkType.HIGHLIGHT); openPopover = null },
                    )
                },
            ) { open ->
                RichSwatchButton(
                    contentDescription = stringResource(R.string.native_richtext_highlight),
                    barColor = richColorOf(valueOf(RichMarkType.HIGHLIGHT) ?: RichDoc.DefaultHighlight, dark) ?: Color.Transparent,
                    active = valueOf(RichMarkType.HIGHLIGHT) != null || open,
                    enabled = enabled,
                    dark = dark,
                    titleColor = titleColor,
                    onClick = { openPopover = if (open) null else RichPopoverKind.HIGHLIGHT },
                ) { tint -> HighlightIcon(size = 18.dp, tint = tint) }
            }
        }
        val bulletButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_bullet_list),
                active = focusedBlock?.kind == RichBlockKind.BULLET_ITEM,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                fixedTint = BulletListTint,
                onClick = { focusedBlock?.let { actions.setBlockKind(it.id, RichBlockKind.BULLET_ITEM) } },
            ) { tint -> BulletListIcon(size = 20.dp, tint = tint) }
        }
        val numberedButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_numbered_list),
                active = focusedBlock?.kind == RichBlockKind.NUMBERED_ITEM,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                fixedTint = NumberedListTint,
                onClick = { focusedBlock?.let { actions.setBlockKind(it.id, RichBlockKind.NUMBERED_ITEM) } },
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
                        dark = dark,
                        titleColor = titleColor,
                        onStrikeChange = onTaskStrikeChange,
                    )
                },
            ) { open ->
                RichSplitButton(
                    active = focusedBlock?.kind == RichBlockKind.TASK_ITEM,
                    chevronActive = open,
                    enabled = enabled,
                    dark = dark,
                    titleColor = titleColor,
                    fixedTint = if (dark) TaskListTintDark else TaskListTintLight,
                    contentDescription = stringResource(R.string.native_richtext_task_list),
                    chevronDescription = stringResource(R.string.native_richtext_task_list_options),
                    onClick = { focusedBlock?.let { actions.setBlockKind(it.id, RichBlockKind.TASK_ITEM) } },
                    onChevron = { openPopover = if (open) null else RichPopoverKind.TASK },
                ) { tint -> TaskListIcon(size = 20.dp, tint = tint) }
            }
        }
        val alignButtons: @Composable FlowRowScope.(withJustify: Boolean) -> Unit = { withJustify ->
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_align_left),
                // "Left" reads as active whenever nothing else is chosen
                // (RichTextToolbar.jsx:444), not only after an explicit set.
                active = focusedBlock?.align == RichAlign.LEFT,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { focusedBlock?.let { actions.setAlign(it.id, RichAlign.LEFT) } },
            ) { tint -> AlignLeftIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_align_center),
                active = focusedBlock?.align == RichAlign.CENTER,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { focusedBlock?.let { actions.setAlign(it.id, RichAlign.CENTER) } },
            ) { tint -> AlignCenterIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_align_right),
                active = focusedBlock?.align == RichAlign.RIGHT,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { focusedBlock?.let { actions.setAlign(it.id, RichAlign.RIGHT) } },
            ) { tint -> AlignRightIcon(size = 20.dp, tint = tint) }
            if (withJustify) {
                RichToolbarButton(
                    contentDescription = stringResource(R.string.native_richtext_align_justify),
                    active = focusedBlock?.align == RichAlign.JUSTIFY,
                    enabled = enabled,
                    dark = dark,
                    titleColor = titleColor,
                    onClick = { focusedBlock?.let { actions.setAlign(it.id, RichAlign.JUSTIFY) } },
                ) { tint -> AlignJustifyIcon(size = 20.dp, tint = tint) }
            }
        }
        val separatorButton: @Composable FlowRowScope.() -> Unit = {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_separator),
                active = false,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { focusedBlock?.let { actions.insertDivider(it.id) } },
            ) { tint -> SeparatorIcon(size = 20.dp, tint = tint) }
        }
        val linkButton: @Composable FlowRowScope.() -> Unit = {
            RichLinkButton(
                active = isActive(RichMarkType.LINK),
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = {
                    val block = focusedBlock ?: return@RichLinkButton
                    val existing = RichDoc.markAt(block.marks, RichMarkType.LINK, selection.min, selection.max)?.value
                    actions.requestLink(block.id, selection.min, selection.max, existing)
                },
            )
        }

        when (mode) {
            RichToolbarMode.SIMPLE -> RichToolbarGroup(divider = divider, last = true) {
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
                RichToolbarGroup(divider = divider, last = false) {
                    fontButton()
                    sizeButton()
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_font_size_up),
                        active = false,
                        enabled = enabled,
                        dark = dark,
                        titleColor = titleColor,
                        onClick = { stepFontSize(1) },
                    ) { tint -> TextIncreaseIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_font_size_down),
                        active = false,
                        enabled = enabled,
                        dark = dark,
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
                        dark = dark,
                        titleColor = titleColor,
                        onClick = { toggle(RichMarkType.SUBSCRIPT) },
                    ) { tint -> SubscriptIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_superscript),
                        active = isActive(RichMarkType.SUPERSCRIPT),
                        enabled = enabled,
                        dark = dark,
                        titleColor = titleColor,
                        onClick = { toggle(RichMarkType.SUPERSCRIPT) },
                    ) { tint -> SuperscriptIcon(size = 20.dp, tint = tint) }
                }
                RichToolbarGroup(divider = divider, last = false) {
                    bulletButton()
                    numberedButton()
                    taskButton()
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_indent),
                        active = false,
                        enabled = enabled && focusedBlock.indent < 8,
                        dark = dark,
                        titleColor = titleColor,
                        fixedTint = IndentTint,
                        onClick = { focusedBlock?.let { actions.shiftIndent(it.id, 1) } },
                    ) { tint -> IndentIncreaseIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_outdent),
                        active = false,
                        enabled = enabled && focusedBlock.indent > 0,
                        dark = dark,
                        titleColor = titleColor,
                        fixedTint = OutdentTint,
                        onClick = { focusedBlock?.let { actions.shiftIndent(it.id, -1) } },
                    ) { tint -> IndentDecreaseIcon(size = 20.dp, tint = tint) }
                    alignButtons(true)
                }
                RichToolbarGroup(divider = divider, last = false) {
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_code_block),
                        active = focusedBlock?.kind == RichBlockKind.CODE_BLOCK,
                        enabled = enabled,
                        dark = dark,
                        titleColor = titleColor,
                        onClick = { focusedBlock?.let { actions.setBlockKind(it.id, RichBlockKind.CODE_BLOCK) } },
                    ) { tint -> CodeBlockIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_inline_code),
                        active = isActive(RichMarkType.CODE),
                        enabled = enabled,
                        dark = dark,
                        titleColor = titleColor,
                        onClick = { toggle(RichMarkType.CODE) },
                    ) { tint -> InlineCodeIcon(size = 20.dp, tint = tint) }
                    RichToolbarButton(
                        contentDescription = stringResource(R.string.native_richtext_quote),
                        active = focusedBlock?.kind == RichBlockKind.QUOTE,
                        enabled = enabled,
                        dark = dark,
                        titleColor = titleColor,
                        onClick = { focusedBlock?.let { actions.setBlockKind(it.id, RichBlockKind.QUOTE) } },
                    ) { tint -> QuoteIcon(size = 20.dp, tint = tint) }
                    separatorButton()
                    linkButton()
                }
                RichToolbarGroup(divider = divider, last = true) {
                    RichStyleButton(
                        label = stringResource(R.string.native_richtext_paragraph),
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Normal,
                        active = focusedBlock?.kind == RichBlockKind.PARAGRAPH,
                        enabled = enabled,
                        dark = dark,
                        titleColor = titleColor,
                        divider = divider,
                    ) { focusedBlock?.let { actions.setBlockKind(it.id, RichBlockKind.PARAGRAPH) } }
                    for (level in 1..5) {
                        val kind = headingKindFor(level)
                        RichStyleButton(
                            label = String.format(stringResource(R.string.native_richtext_heading_level), level),
                            fontSize = headingSampleSize(level),
                            fontWeight = FontWeight.SemiBold,
                            active = focusedBlock?.kind == kind,
                            enabled = enabled,
                            dark = dark,
                            titleColor = titleColor,
                            divider = divider,
                        ) { focusedBlock?.let { actions.setBlockKind(it.id, kind) } }
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

/** One `.rt-sg`: a centred wrapping row with 4px gaps, 6px of padding
 *  above and below, and a hairline underneath unless it is the last. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RichToolbarGroup(divider: Color, last: Boolean, content: @Composable FlowRowScope.() -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        FlowRow(
            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            content = content,
        )
        if (!last) Box(Modifier.fillMaxWidth().height(1.dp).background(divider))
    }
}

/** Wraps a button that owns a popover so the popup anchors to it. */
@Composable
private fun RichAnchoredButton(
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
    dark: Boolean,
    popover: @Composable () -> Unit,
    button: @Composable (open: Boolean) -> Unit,
) {
    Box {
        button(open)
        if (open) {
            RichPopover(dark = dark, onDismiss = { onOpenChange(false) }) { popover() }
        }
    }
}

/** `.rt-btn` at phone size: a 36dp tap target, 6px radius, no border or
 *  fill at rest, and the indigo active pair when the tool is on. */
@Composable
private fun RichToolbarButton(
    contentDescription: String,
    active: Boolean,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    fixedTint: Color? = null,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val tint = fixedTint ?: when {
        active -> if (dark) RtActiveTextDark else RtActiveTextLight
        else -> titleColor
    }
    Box(
        modifier = Modifier
            .heightIn(min = 36.dp)
            .widthIn(min = 36.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(richActiveBg(active, dark))
            .semantics { this.contentDescription = contentDescription }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        icon(tint)
    }
}

private fun richActiveBg(active: Boolean, dark: Boolean): Color = when {
    !active -> Color.Transparent
    dark -> RtActiveBgDark
    else -> RtActiveBgLight
}

/** `.rt-btn--menu`: a label and a chevron pushed apart, used by the font
 *  and size pickers. */
@Composable
private fun RichMenuButton(
    label: String,
    minWidth: Dp,
    enabled: Boolean,
    dark: Boolean,
    active: Boolean = false,
    alwaysActive: Boolean = false,
    fontFamily: androidx.compose.ui.text.font.FontFamily? = null,
    onClick: () -> Unit,
) {
    val on = active || alwaysActive
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier
            .height(36.dp)
            .widthIn(min = minWidth)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(richActiveBg(on, dark))
            .border(
                width = 1.dp,
                color = if (on) RtActiveTextLight.copy(alpha = 0.35f) else Color.Transparent,
                shape = RoundedCornerShape(6.dp),
            )
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
            color = if (on) (if (dark) RtActiveTextDark else RtActiveTextLight) else Color.Unspecified,
            fontSize = 14.08.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = fontFamily,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        Spacer(Modifier.width(6.dp))
        ChevronDownIcon(size = 14.dp, tint = if (on) (if (dark) RtActiveTextDark else RtActiveTextLight) else Color.Gray)
    }
}

/** `.rt-splitbtn`: a body button and a chevron sharing one pill, with the
 *  inner corners squared off. */
@Composable
private fun RichSplitButton(
    active: Boolean,
    chevronActive: Boolean,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    contentDescription: String,
    chevronDescription: String,
    fixedTint: Color? = null,
    onClick: () -> Unit,
    onChevron: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val tint = fixedTint ?: if (active) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .height(36.dp)
                .widthIn(min = 33.dp)
                .alpha(if (enabled) 1f else 0.38f)
                .clip(RoundedCornerShape(topStart = 6.dp, bottomStart = 6.dp))
                .background(richActiveBg(active, dark))
                .semantics { this.contentDescription = contentDescription }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onClick() }
                .padding(start = 7.dp, end = 3.dp),
            contentAlignment = Alignment.Center,
        ) {
            icon(tint)
        }
        Box(
            modifier = Modifier
                .height(36.dp)
                .widthIn(min = 20.dp)
                .alpha(if (enabled) 1f else 0.38f)
                .clip(RoundedCornerShape(topEnd = 6.dp, bottomEnd = 6.dp))
                .background(richActiveBg(chevronActive, dark))
                .semantics { this.contentDescription = chevronDescription }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onChevron() },
            contentAlignment = Alignment.Center,
        ) {
            ChevronDownIcon(size = 14.dp, tint = if (chevronActive) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor)
        }
    }
}

/** `.rt-btn--swatch`: the glyph with the current colour as a 16x3 bar
 *  under it (globalCSS.js:3546-3562). */
@Composable
private fun RichSwatchButton(
    contentDescription: String,
    barColor: Color,
    active: Boolean,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .height(36.dp)
            .widthIn(min = 36.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(richActiveBg(active, dark))
            .semantics { this.contentDescription = contentDescription }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 6.dp),
    ) {
        icon(if (active) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor)
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
}

/** `.rt-btn--link`: a 16px chain glyph over the lowercase "www" label,
 *  with the decorative blue underline the web draws with ::after. */
@Composable
private fun RichLinkButton(
    active: Boolean,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    onClick: () -> Unit,
) {
    val density = LocalDensity.current
    val label = stringResource(R.string.native_richtext_link)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .height(36.dp)
            .width(68.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(richActiveBg(active, dark))
            .semantics { contentDescription = label }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .drawBehind {
                val width = with(density) { 39.dp.toPx() }
                val height = with(density) { 1.5.dp.toPx() }
                val bottom = with(density) { 7.dp.toPx() }
                drawRect(
                    color = Color(0xFF2563EB),
                    topLeft = Offset(size.width / 2f - width * 0.45f, size.height - bottom - height),
                    size = Size(width, height),
                )
            }
            .padding(start = 6.dp, end = 6.dp, bottom = 2.dp),
    ) {
        LinkIcon(size = 16.dp, tint = if (active) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor)
        Text(
            "www",
            color = if (active) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor,
            fontSize = 12.48.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.02.em,
        )
    }
}

/** `.rt-style-btn`: an 80x34 preview button whose own label is rendered
 *  in the style it applies. */
@Composable
private fun RichStyleButton(
    label: String,
    fontSize: TextUnit,
    fontWeight: FontWeight,
    active: Boolean,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    divider: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .width(80.dp)
            .height(34.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(richActiveBg(active, dark))
            .border(
                width = 1.dp,
                color = if (active) RtActiveTextLight.copy(alpha = 0.45f) else divider,
                shape = RoundedCornerShape(6.dp),
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            label,
            color = if (active) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor,
            fontSize = fontSize,
            fontWeight = fontWeight,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
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

/** The gallery's preview size: the block's own size times 0.7, capped,
 *  per .rt-style-btn-sample (globalCSS.js:3444-3518). */
private fun headingSampleSize(level: Int): TextUnit = when (level) {
    1 -> 17.6.sp
    2 -> 16.sp
    3 -> 14.4.sp
    4 -> 13.1.sp
    else -> 12.5.sp
}

// ---------------------------------------------------------------------------
// Popovers

/**
 * `.rt-pop` (globalCSS.js:3565-3583): a 220dp-wide (on a phone) card
 * pinned under its button, flipping above it when there is no room below,
 * always clamped 8dp inside the screen, exactly as usePopoverPosition
 * does on the web (Popover.jsx:35-79).
 */
@Composable
private fun RichPopover(dark: Boolean, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val density = LocalDensity.current
    val positionProvider = remember(density) {
        object : PopupPositionProvider {
            override fun calculatePosition(
                anchorBounds: IntRect,
                windowSize: IntSize,
                layoutDirection: LayoutDirection,
                popupContentSize: IntSize,
            ): IntOffset {
                val margin = with(density) { 8.dp.roundToPx() }
                val gap = with(density) { 6.dp.roundToPx() }
                val left = anchorBounds.left
                    .coerceIn(margin, (windowSize.width - popupContentSize.width - margin).coerceAtLeast(margin))
                val below = anchorBounds.bottom + gap
                val top = if (below + popupContentSize.height + margin > windowSize.height) {
                    (anchorBounds.top - gap - popupContentSize.height).coerceAtLeast(margin)
                } else {
                    below
                }
                return IntOffset(left, top)
            }
        }
    }
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(
            modifier = Modifier
                .widthIn(min = 220.dp)
                .shadow(elevation = 16.dp, shape = RoundedCornerShape(10.dp))
                .clip(RoundedCornerShape(10.dp))
                .background(if (dark) Color(0xFF1F2937) else Color.White)
                .border(
                    width = 1.dp,
                    color = if (dark) Color.White.copy(alpha = 0.12f) else Color.Black.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(10.dp),
                )
                .padding(8.dp),
        ) {
            content()
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

/** `.rt-swatches`: six per row, 28dp squares with a double ring, the
 *  current one wearing a 2dp accent halo. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RichSwatchGrid(swatches: List<String>, current: String?, dark: Boolean, onPick: (String) -> Unit) {
    FlowRow(
        maxItemsInEachRow = 6,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        for (swatch in swatches) {
            val selected = swatch == current
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(richColorOf(swatch, dark) ?: Color.Transparent)
                    .border(
                        width = if (selected) 2.dp else 1.dp,
                        color = if (selected) {
                            Indigo.copy(alpha = 0.9f)
                        } else if (dark) {
                            Color.White.copy(alpha = 0.25f)
                        } else {
                            Color.Black.copy(alpha = 0.12f)
                        },
                        shape = RoundedCornerShape(6.dp),
                    )
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onPick(swatch) },
            )
        }
    }
}

/** `.rt-pop-clear`: the full-width indigo-to-violet "Default" pill. */
@Composable
private fun RichPopClearButton(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(Brush.horizontalGradient(listOf(Color(0xFF6366F1), Color(0xFF7C3AED))))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 10.dp, vertical = 6.dp),
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
            .padding(horizontal = 10.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = color, fontSize = 12.8.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun RichSwatchPopover(
    label: String,
    swatches: List<String>,
    current: String?,
    dark: Boolean,
    titleColor: Color,
    onPick: (String) -> Unit,
    onClear: () -> Unit,
) {
    RichPopLabel(label, titleColor)
    RichSwatchGrid(swatches, current, dark, onPick)
    RichPopClearButton(stringResource(R.string.native_richtext_default), onClear)
}

/**
 * The underline popover (RichTextToolbar.jsx:182-234): the five line
 * styles, then eight colours, then a red "remove underline". Picking a
 * style or a colour deliberately leaves it open, only removing closes it.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RichUnderlinePopover(
    style: String,
    color: String?,
    dark: Boolean,
    titleColor: Color,
    onStyle: (String) -> Unit,
    onColor: (String) -> Unit,
    onRemove: () -> Unit,
) {
    RichPopLabel(stringResource(R.string.native_richtext_underline_style), titleColor)
    FlowRow(
        maxItemsInEachRow = 5,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for (option in RichUnderlineStyles) {
            val selected = option == style
            Box(
                modifier = Modifier
                    .height(36.dp)
                    .widthIn(min = 38.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(richActiveBg(selected, dark))
                    .border(
                        width = 1.dp,
                        color = if (selected) RtActiveTextLight.copy(alpha = 0.45f) else if (dark) RtDividerDark else RtDividerLight,
                        shape = RoundedCornerShape(6.dp),
                    )
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onStyle(option) },
                contentAlignment = Alignment.Center,
            ) {
                UnderlineSample(
                    style = option,
                    color = richColorOf(color, dark) ?: if (selected) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor,
                    textColor = if (selected) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor,
                )
            }
        }
    }
    RichPopLabel(stringResource(R.string.native_richtext_underline_color), titleColor, spaced = true)
    RichSwatchGrid(RichUnderlineColors, color, dark, onColor)
    RichPopDangerButton(stringResource(R.string.native_richtext_underline_remove), dark, onRemove)
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

/** `.rt-pop--font`: a 260dp-tall scrolling list, each family written in
 *  itself, opening centred on whichever one is active. */
@Composable
private fun RichFontPopover(current: String?, dark: Boolean, titleColor: Color, onPick: (String) -> Unit) {
    val activeIndex = RichFonts.indexOfFirst { it.value == (current ?: "") }.coerceAtLeast(0)
    val listState = rememberLazyListState()
    LaunchedEffect(activeIndex) {
        listState.scrollToItem((activeIndex - 4).coerceAtLeast(0))
    }
    LazyColumn(state = listState, modifier = Modifier.heightIn(max = 260.dp)) {
        items(RichFonts, key = { it.label }) { option ->
            val selected = option.value == (current ?: "")
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(6.dp))
                    .background(richActiveBg(selected, dark))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onPick(option.value) }
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            ) {
                Text(
                    option.label,
                    color = if (selected) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor,
                    fontSize = 13.6.sp,
                    fontFamily = option.family,
                )
            }
        }
    }
}

/** `.rt-pop--fontsize`: the eight offered sizes, the default one bold and
 *  badged. */
@Composable
private fun RichSizePopover(current: String?, dark: Boolean, titleColor: Color, onPick: (String) -> Unit) {
    Column(modifier = Modifier.heightIn(max = 260.dp)) {
        for (size in RichFontSizes) {
            val selected = size == (current ?: RichDefaultFontSize)
            val isDefault = size == RichDefaultFontSize
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(6.dp))
                    .background(richActiveBg(selected, dark))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onPick(size) }
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            ) {
                if (isDefault) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(if (dark) RtActiveBgDark else RtActiveBgLight)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            stringResource(R.string.native_richtext_default).uppercase(),
                            color = if (dark) RtActiveTextDark else RtActiveTextLight,
                            fontSize = 10.4.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.05.em,
                        )
                    }
                } else {
                    Spacer(Modifier.width(1.dp))
                }
                Text(
                    size.removeSuffix("px"),
                    color = if (selected) (if (dark) RtActiveTextDark else RtActiveTextLight) else titleColor,
                    fontSize = 13.6.sp,
                    fontWeight = if (isDefault) FontWeight.Bold else FontWeight.SemiBold,
                    textAlign = TextAlign.End,
                    modifier = Modifier.widthIn(min = 26.dp),
                )
            }
        }
    }
}

/** `.rt-pop--task`: the one display option, "strike through checked
 *  items", a per-device reading preference that never touches the note. */
@Composable
private fun RichTaskOptionsPopover(
    strike: Boolean,
    dark: Boolean,
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
        Box(
            modifier = Modifier
                .size(16.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(if (strike) Indigo else Color.Transparent)
                .border(
                    width = if (strike) 0.dp else 1.5.dp,
                    color = if (dark) Color.White.copy(alpha = 0.45f) else Color.Black.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(3.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (strike) CheckmarkIcon(size = 12.dp, tint = Color.White)
        }
        Text(
            stringResource(R.string.native_richtext_task_list_strike),
            color = titleColor,
            fontSize = 13.6.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}
