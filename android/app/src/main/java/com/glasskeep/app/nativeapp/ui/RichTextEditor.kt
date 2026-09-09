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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.Indigo

private val NumberedListColor = Color(0xFF0ea5e9)

/**
 * Which block is being edited and where its cursor sits. Hoisted out of
 * [RichTextEditor] because the formatting bar is no longer drawn above
 * the text: on a phone the web puts it in a bottom sheet living between
 * the scroll area and the footer (NoteModal.jsx:927-948), so the two
 * halves are separate composables reading the same state.
 */
class RichEditorState {
    var focusedId by mutableStateOf<String?>(null)
    var selection by mutableStateOf(TextRange.Zero)
}

@Composable
fun rememberRichEditorState(): RichEditorState = remember { RichEditorState() }

/** The focused block's selection, clamped to that block's own current
 *  text: switching focus to a shorter block right after editing a longer
 *  one could otherwise leave a stale, out-of-range selection around for
 *  one frame. */
internal fun RichEditorState.safeSelectionIn(block: RichBlock?): TextRange =
    block?.let {
        TextRange(
            selection.start.coerceIn(0, it.text.length),
            selection.end.coerceIn(0, it.text.length),
        )
    } ?: TextRange.Zero

/**
 * The native rich-text editor's body: one row per block plus a trailing
 * "add paragraph" row. Its formatting bar is a separate composable
 * ([RichFormatToolbar]) because the web puts it in a bottom sheet at the
 * foot of the modal, not above the text. Only ever rendered for a doc
 * RichDoc.parse approved, everything it can represent is editable here,
 * there is no separate read-only-preview fallback the way sectioned
 * checklists have one, a doc outside this vocabulary never reaches this
 * composable at all (NoteDetailScreen keeps its existing
 * plain-text/notice fallback for those).
 *
 * Deliberately not ported from the web editor, same "disclosed, not
 * silently dropped" rule as every other milestone this app:
 * Backspace-at-the-start-of-a-block merging it into the previous one (a
 * soft keyboard's backspace on an empty/start position isn't reliably
 * delivered as a real key event by every IME, same reasoning as the
 * checklist editor), and tap-to-open a link while editing (tapping just
 * places the cursor, same as any other text; use the Link button with the
 * cursor inside it to edit or remove one instead).
 */
@Composable
fun RichTextEditor(
    blocks: List<RichBlock>,
    state: RichEditorState,
    titleColor: Color,
    subtextColor: Color,
    focusRequesterFor: (id: String) -> FocusRequester,
    onTextEdited: (id: String, newText: String, newMarks: List<RichMark>) -> Unit,
    onEnter: (id: String, atPosition: Int) -> Unit,
    onRemoveBlock: (id: String) -> Unit,
    onAddBlock: () -> Unit,
) {
    val numberedPositions = remember(blocks) {
        val map = mutableMapOf<String, Int>()
        var counter = 0
        for (b in blocks) {
            counter = if (b.kind == RichBlockKind.NUMBERED_ITEM) counter + 1 else 0
            if (b.kind == RichBlockKind.NUMBERED_ITEM) map[b.id] = counter
        }
        map
    }

    Column {
        for (block in blocks) {
            RichBlockRow(
                block = block,
                titleColor = titleColor,
                subtextColor = subtextColor,
                numberedPosition = numberedPositions[block.id],
                focusRequester = focusRequesterFor(block.id),
                onFocusGained = { selection -> state.focusedId = block.id; state.selection = selection },
                onFocusLost = { if (state.focusedId == block.id) state.focusedId = null },
                onSelectionChanged = { selection -> if (state.focusedId == block.id) state.selection = selection },
                onTextEdited = { newText, newMarks, newSelection ->
                    onTextEdited(block.id, newText, newMarks)
                    if (state.focusedId == block.id) state.selection = newSelection
                },
                onEnter = { position -> onEnter(block.id, position) },
                onRemove = { onRemoveBlock(block.id) },
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onAddBlock() }
                .padding(vertical = 8.dp),
        ) {
            PlusIcon(size = 16.dp, tint = Indigo)
            Spacer(Modifier.width(10.dp))
            Text(
                stringResource(R.string.native_richtext_add_block),
                color = Indigo,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun RichBlockRow(
    block: RichBlock,
    titleColor: Color,
    subtextColor: Color,
    numberedPosition: Int?,
    focusRequester: FocusRequester,
    onFocusGained: (TextRange) -> Unit,
    onFocusLost: () -> Unit,
    onSelectionChanged: (TextRange) -> Unit,
    onTextEdited: (newText: String, newMarks: List<RichMark>, newSelection: TextRange) -> Unit,
    onEnter: (position: Int) -> Unit,
    onRemove: () -> Unit,
) {
    // Cursor at the start on first composition, not at the end: a freshly
    // split-off block's whole text is "what came after the cursor", so
    // this is also where editing should resume once it gains focus (see
    // NoteDetailScreen's pendingRichFocus).
    var fieldValue by remember(block.id) {
        mutableStateOf(TextFieldValue(annotatedTextFor(block.text, block.marks, titleColor), TextRange.Zero))
    }
    // Safety net for changes that didn't originate in this row's own
    // onValueChange (a toolbar mark toggle, a split/merge): rebuild the
    // styled value from the model, keeping whatever selection still fits.
    LaunchedEffect(block.text, block.marks, titleColor) {
        val rebuilt = annotatedTextFor(block.text, block.marks, titleColor)
        if (fieldValue.annotatedString.text != rebuilt.text || fieldValue.annotatedString.spanStyles != rebuilt.spanStyles) {
            fieldValue = TextFieldValue(
                rebuilt,
                TextRange(
                    fieldValue.selection.start.coerceIn(0, rebuilt.length),
                    fieldValue.selection.end.coerceIn(0, rebuilt.length),
                ),
            )
        }
    }

    val removeLabel = stringResource(R.string.native_richtext_remove_block)
    Row(
        verticalAlignment = Alignment.Top,
        modifier = Modifier.fillMaxWidth().padding(top = 3.dp, bottom = 3.dp),
    ) {
        BlockPrefix(kind = block.kind, numberedPosition = numberedPosition)
        BasicTextField(
            value = fieldValue,
            onValueChange = { new ->
                if (new.text != fieldValue.text) {
                    val span = RichDoc.diffEdit(fieldValue.text, new.text)
                    val insertedNewline = span.newEnd == span.start + 1 && span.oldEnd == span.start &&
                        new.text.getOrNull(span.start) == '\n'
                    if (insertedNewline) {
                        onEnter(span.start)
                    } else {
                        val adjustedMarks = RichDoc.adjustMarksForEdit(fieldValue.text, new.text, block.marks)
                        fieldValue = TextFieldValue(annotatedTextFor(new.text, adjustedMarks, titleColor), new.selection)
                        onTextEdited(new.text, adjustedMarks, new.selection)
                    }
                } else {
                    fieldValue = new
                    onSelectionChanged(new.selection)
                }
            },
            textStyle = blockTextStyle(block.kind, titleColor),
            cursorBrush = SolidColor(Indigo),
            modifier = Modifier
                .weight(1f)
                .focusRequester(focusRequester)
                .onFocusChanged { state -> if (state.isFocused) onFocusGained(fieldValue.selection) else onFocusLost() },
        )
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .semantics { contentDescription = removeLabel }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onRemove() }
                .padding(6.dp),
        ) {
            CloseIcon(size = 15.dp, tint = subtextColor)
        }
    }
}

@Composable
private fun BlockPrefix(kind: RichBlockKind, numberedPosition: Int?) {
    val text = when (kind) {
        RichBlockKind.BULLET_ITEM -> "•"
        RichBlockKind.NUMBERED_ITEM -> "${numberedPosition ?: 1}."
        else -> null
    } ?: return
    Text(
        text,
        color = if (kind == RichBlockKind.NUMBERED_ITEM) NumberedListColor else Indigo,
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.width(24.dp).padding(top = 2.dp, end = 2.dp),
    )
}

private fun blockTextStyle(kind: RichBlockKind, titleColor: Color) = TextStyle(
    color = titleColor,
    fontSize = when (kind) {
        RichBlockKind.HEADING_1 -> 22.sp
        RichBlockKind.HEADING_2 -> 20.sp
        RichBlockKind.HEADING_3 -> 18.sp
        RichBlockKind.HEADING_4 -> 16.5.sp
        RichBlockKind.HEADING_5 -> 15.5.sp
        else -> 15.sp
    },
    fontWeight = when (kind) {
        RichBlockKind.HEADING_1, RichBlockKind.HEADING_2, RichBlockKind.HEADING_3,
        RichBlockKind.HEADING_4, RichBlockKind.HEADING_5,
        -> FontWeight.Bold
        else -> FontWeight.Normal
    },
)

/** Builds the styled value a block's field should show: bold/italic marks
 *  as simple SpanStyle toggles, underline/strike/link combined by hand into
 *  one TextDecoration per run (addStyle's own overlap resolution between
 *  two different single-decoration spans isn't something to rely on here). */
private fun annotatedTextFor(text: String, marks: List<RichMark>, linkColor: Color) = buildAnnotatedString {
    append(text)
    if (text.isEmpty() || marks.isEmpty()) return@buildAnnotatedString
    val cuts = sortedSetOf(0, text.length)
    for (m in marks) {
        cuts.add(m.start.coerceIn(0, text.length))
        cuts.add(m.end.coerceIn(0, text.length))
    }
    val points = cuts.toList()
    for (i in 0 until points.size - 1) {
        val start = points[i]
        val end = points[i + 1]
        if (start >= end) continue
        val active = marks.filter { it.start <= start && it.end >= end }
        if (active.isEmpty()) continue
        var bold = false
        var italic = false
        var isLink = false
        val decorations = mutableListOf<TextDecoration>()
        for (m in active) when (m.type) {
            RichMarkType.BOLD -> bold = true
            RichMarkType.ITALIC -> italic = true
            RichMarkType.UNDERLINE -> decorations.add(TextDecoration.Underline)
            RichMarkType.STRIKE -> decorations.add(TextDecoration.LineThrough)
            RichMarkType.LINK -> { decorations.add(TextDecoration.Underline); isLink = true }
        }
        addStyle(
            SpanStyle(
                color = if (isLink) linkColor else Color.Unspecified,
                fontWeight = if (bold) FontWeight.Bold else null,
                fontStyle = if (italic) FontStyle.Italic else null,
                textDecoration = if (decorations.isEmpty()) null else TextDecoration.combine(decorations.distinct()),
            ),
            start,
            end,
        )
    }
}

/**
 * The formatting bar as the web draws it inside the mobile sheet
 * (globalCSS.js:1711-1747): super-groups stacked in a column, each one a
 * centred row that wraps, 4px between buttons, 6px above and below, and
 * a `--rt-divider` hairline between groups (never after the last one).
 * Vertical separators are hidden on a phone.
 *
 * The block-style gallery comes first, exactly as the web's advanced
 * toolbar mode shows it; the marks, the lists and the link follow. The
 * web's simple mode also carries font, size, colour, highlight,
 * alignment, task lists and a horizontal rule, none of which the native
 * document model can hold yet (see RichDoc.kt's own vocabulary note).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RichFormatToolbar(
    blocks: List<RichBlock>,
    state: RichEditorState,
    dark: Boolean,
    titleColor: Color,
    onSetBlockKind: (id: String, kind: RichBlockKind) -> Unit,
    onToggleMark: (id: String, start: Int, end: Int, type: RichMarkType) -> Unit,
    onClearFormatting: (id: String, start: Int, end: Int) -> Unit,
    onLinkRequest: (id: String, start: Int, end: Int, existingHref: String?) -> Unit,
) {
    val focusedBlock = blocks.find { it.id == state.focusedId }
    val selection = state.safeSelectionIn(focusedBlock)
    val enabled = focusedBlock != null
    val activeMarks = remember(focusedBlock, selection) {
        if (focusedBlock == null) {
            emptySet()
        } else {
            RichMarkType.entries
                .filter { RichDoc.isMarkActive(focusedBlock.marks, it, selection.min, selection.max) }
                .toSet()
        }
    }
    val divider = if (dark) RtDividerDark else RtDividerLight

    fun withFocused(action: (String) -> Unit) {
        state.focusedId?.let(action)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 10.dp),
    ) {
        RichToolbarGroup(divider = divider, last = false) {
            RichStyleButton(
                label = stringResource(R.string.native_richtext_paragraph),
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Normal,
                active = focusedBlock?.kind == RichBlockKind.PARAGRAPH,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                divider = divider,
            ) { withFocused { onSetBlockKind(it, RichBlockKind.PARAGRAPH) } }
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
                ) { withFocused { onSetBlockKind(it, kind) } }
            }
        }

        RichToolbarGroup(divider = divider, last = false) {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_bold),
                active = RichMarkType.BOLD in activeMarks,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { withFocused { onToggleMark(it, selection.min, selection.max, RichMarkType.BOLD) } },
            ) { tint -> BoldIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_italic),
                active = RichMarkType.ITALIC in activeMarks,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { withFocused { onToggleMark(it, selection.min, selection.max, RichMarkType.ITALIC) } },
            ) { tint -> ItalicIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_underline),
                active = RichMarkType.UNDERLINE in activeMarks,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { withFocused { onToggleMark(it, selection.min, selection.max, RichMarkType.UNDERLINE) } },
            ) { tint -> UnderlineIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_strikethrough),
                active = RichMarkType.STRIKE in activeMarks,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { withFocused { onToggleMark(it, selection.min, selection.max, RichMarkType.STRIKE) } },
            ) { tint -> StrikeIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_clear_formatting),
                active = false,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { withFocused { onClearFormatting(it, selection.min, selection.max) } },
            ) { tint -> ClearFormattingIcon(size = 20.dp, tint = tint) }
        }

        RichToolbarGroup(divider = divider, last = false) {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_bullet_list),
                active = focusedBlock?.kind == RichBlockKind.BULLET_ITEM,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { withFocused { onSetBlockKind(it, RichBlockKind.BULLET_ITEM) } },
            ) { tint -> BulletListIcon(size = 20.dp, tint = tint) }
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_numbered_list),
                active = focusedBlock?.kind == RichBlockKind.NUMBERED_ITEM,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = { withFocused { onSetBlockKind(it, RichBlockKind.NUMBERED_ITEM) } },
            ) { tint -> NumberedListIcon(size = 20.dp, tint = tint) }
        }

        RichToolbarGroup(divider = divider, last = true) {
            RichToolbarButton(
                contentDescription = stringResource(R.string.native_richtext_link),
                active = RichMarkType.LINK in activeMarks,
                enabled = enabled,
                dark = dark,
                titleColor = titleColor,
                onClick = {
                    val block = focusedBlock ?: return@RichToolbarButton
                    val existingHref = if (RichDoc.isMarkActive(block.marks, RichMarkType.LINK, selection.min, selection.max)) {
                        block.marks
                            .filter { it.type == RichMarkType.LINK && it.start < selection.max && it.end > selection.min }
                            .map { it.href }
                            .distinct()
                            .singleOrNull()
                    } else {
                        null
                    }
                    onLinkRequest(block.id, selection.min, selection.max, existingHref)
                },
            ) { tint -> LinkIcon(size = 20.dp, tint = tint) }
        }
    }
}

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

/** `.rt-btn` at phone size: a 36dp tap target, 6px radius, no border or
 *  fill at rest, and the indigo active pair when the mark is on. */
@Composable
private fun RichToolbarButton(
    contentDescription: String,
    active: Boolean,
    enabled: Boolean,
    dark: Boolean,
    titleColor: Color,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val tint = when {
        active -> if (dark) RtActiveTextDark else RtActiveTextLight
        else -> titleColor
    }
    Box(
        modifier = Modifier
            .heightIn(min = 36.dp)
            .widthIn(min = 36.dp)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(RoundedCornerShape(6.dp))
            .background(
                when {
                    !active -> Color.Transparent
                    dark -> RtActiveBgDark
                    else -> RtActiveBgLight
                },
            )
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
            .background(
                when {
                    !active -> Color.Transparent
                    dark -> RtActiveBgDark
                    else -> RtActiveBgLight
                },
            )
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

private fun headingKindFor(level: Int): RichBlockKind = when (level) {
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

/** --rt-btn-active-bg / --rt-btn-active-text and --rt-divider
 *  (globalCSS.js:2855-2890). */
private val RtActiveBgLight = Color(0x246366F1)
private val RtActiveBgDark = Color(0x426366F1)
private val RtActiveTextLight = Color(0xFF6366F1)
private val RtActiveTextDark = Color(0xFFA1A3F7)
private val RtDividerLight = Color(0x14000000)
private val RtDividerDark = Color(0x1AFFFFFF)

@Composable
fun RichLinkDialog(
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    initialHref: String?,
    onDismiss: () -> Unit,
    onConfirm: (href: String) -> Unit,
    onRemove: () -> Unit,
) {
    var text by remember(initialHref) { mutableStateOf(initialHref.orEmpty()) }
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(if (dark) DarkBgColor else Color.White)
                .padding(20.dp),
        ) {
            Text(
                stringResource(R.string.native_richtext_link_title),
                color = titleColor,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                placeholder = { Text(stringResource(R.string.native_richtext_link_placeholder)) },
                singleLine = true,
                colors = detailFieldColors(titleColor, subtextColor, borderColor),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                if (initialHref != null) {
                    TextButton(onClick = onRemove) {
                        Text(stringResource(R.string.native_richtext_link_remove), color = Color(0xFFdc2626))
                    }
                }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.native_note_detail_trash_confirm_cancel), color = subtextColor)
                }
                TextButton(onClick = { onConfirm(text) }, enabled = text.isNotBlank()) {
                    Text(stringResource(R.string.native_richtext_link_apply), color = Indigo, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
