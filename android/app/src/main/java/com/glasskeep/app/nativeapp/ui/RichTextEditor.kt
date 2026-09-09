package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
 * The native rich-text editor's body: a shared toolbar (block style, then
 * bold/italic/underline/strike/link) above one row per block plus a
 * trailing "add paragraph" row. Only ever rendered for a doc RichDoc.parse
 * approved, everything it can represent is editable here, there is no
 * separate read-only-preview fallback the way sectioned checklists have
 * one, a doc outside this vocabulary never reaches this composable at all
 * (NoteDetailScreen keeps its existing plain-text/notice fallback for
 * those).
 *
 * Deliberately not ported from the web editor, same "disclosed, not
 * silently dropped" rule as every other milestone this app: undo/redo (no
 * history stack, only whatever the OS keyboard offers on its own),
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
    titleColor: Color,
    subtextColor: Color,
    focusRequesterFor: (id: String) -> FocusRequester,
    onTextEdited: (id: String, newText: String, newMarks: List<RichMark>) -> Unit,
    onEnter: (id: String, atPosition: Int) -> Unit,
    onRemoveBlock: (id: String) -> Unit,
    onSetBlockKind: (id: String, kind: RichBlockKind) -> Unit,
    onToggleMark: (id: String, start: Int, end: Int, type: RichMarkType) -> Unit,
    onLinkRequest: (id: String, start: Int, end: Int, existingHref: String?) -> Unit,
    onAddBlock: () -> Unit,
) {
    var focusedId by remember { mutableStateOf<String?>(null) }
    var focusedSelection by remember { mutableStateOf(TextRange.Zero) }
    val focusedBlock = blocks.find { it.id == focusedId }
    // Clamp against the focused block's own current text: switching focus
    // to a shorter block right after editing a longer one could otherwise
    // leave a stale, out-of-range selection around for one frame.
    val safeSelection = focusedBlock?.let {
        TextRange(
            focusedSelection.start.coerceIn(0, it.text.length),
            focusedSelection.end.coerceIn(0, it.text.length),
        )
    } ?: TextRange.Zero
    val activeMarks = remember(focusedBlock, safeSelection) {
        if (focusedBlock == null) emptySet() else RichMarkType.entries
            .filter { RichDoc.isMarkActive(focusedBlock.marks, it, safeSelection.min, safeSelection.max) }
            .toSet()
    }

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
        RichToolbar(
            enabled = focusedBlock != null,
            currentKind = focusedBlock?.kind,
            activeMarks = activeMarks,
            titleColor = titleColor,
            subtextColor = subtextColor,
            onSetKind = { kind -> focusedId?.let { onSetBlockKind(it, kind) } },
            onToggleMark = { type -> focusedId?.let { onToggleMark(it, safeSelection.min, safeSelection.max, type) } },
            onLink = {
                val id = focusedId ?: return@RichToolbar
                val block = focusedBlock ?: return@RichToolbar
                val start = safeSelection.min
                val end = safeSelection.max
                val existingHref = if (RichDoc.isMarkActive(block.marks, RichMarkType.LINK, start, end)) {
                    block.marks.filter { it.type == RichMarkType.LINK && it.start < end && it.end > start }
                        .map { it.href }.distinct().singleOrNull()
                } else {
                    null
                }
                onLinkRequest(id, start, end, existingHref)
            },
        )
        Spacer(Modifier.height(12.dp))
        for (block in blocks) {
            RichBlockRow(
                block = block,
                titleColor = titleColor,
                subtextColor = subtextColor,
                numberedPosition = numberedPositions[block.id],
                focusRequester = focusRequesterFor(block.id),
                onFocusGained = { selection -> focusedId = block.id; focusedSelection = selection },
                onFocusLost = { if (focusedId == block.id) focusedId = null },
                onSelectionChanged = { selection -> if (focusedId == block.id) focusedSelection = selection },
                onTextEdited = { newText, newMarks, newSelection ->
                    onTextEdited(block.id, newText, newMarks)
                    if (focusedId == block.id) focusedSelection = newSelection
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

@Composable
private fun RichToolbar(
    enabled: Boolean,
    currentKind: RichBlockKind?,
    activeMarks: Set<RichMarkType>,
    titleColor: Color,
    subtextColor: Color,
    onSetKind: (RichBlockKind) -> Unit,
    onToggleMark: (RichMarkType) -> Unit,
    onLink: () -> Unit,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TextKindChip("P", stringResource(R.string.native_richtext_paragraph), currentKind == RichBlockKind.PARAGRAPH, enabled, titleColor, subtextColor) {
                onSetKind(RichBlockKind.PARAGRAPH)
            }
            for (level in 1..5) {
                val kind = headingKindFor(level)
                TextKindChip(
                    "H$level",
                    String.format(stringResource(R.string.native_richtext_heading_level), level),
                    currentKind == kind,
                    enabled,
                    titleColor,
                    subtextColor,
                ) { onSetKind(kind) }
            }
            IconKindChip(
                selected = currentKind == RichBlockKind.BULLET_ITEM,
                enabled = enabled,
                contentDescription = stringResource(R.string.native_richtext_bullet_list),
                subtextColor = subtextColor,
                onClick = { onSetKind(RichBlockKind.BULLET_ITEM) },
            ) { tint -> BulletListIcon(size = 18.dp, tint = tint) }
            IconKindChip(
                selected = currentKind == RichBlockKind.NUMBERED_ITEM,
                enabled = enabled,
                contentDescription = stringResource(R.string.native_richtext_numbered_list),
                subtextColor = subtextColor,
                onClick = { onSetKind(RichBlockKind.NUMBERED_ITEM) },
            ) { tint -> NumberedListIcon(size = 18.dp, tint = tint) }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            MarkChip(RichMarkType.BOLD in activeMarks, enabled, stringResource(R.string.native_richtext_bold), subtextColor, { t -> BoldIcon(size = 18.dp, tint = t) }) { onToggleMark(RichMarkType.BOLD) }
            MarkChip(RichMarkType.ITALIC in activeMarks, enabled, stringResource(R.string.native_richtext_italic), subtextColor, { t -> ItalicIcon(size = 18.dp, tint = t) }) { onToggleMark(RichMarkType.ITALIC) }
            MarkChip(RichMarkType.UNDERLINE in activeMarks, enabled, stringResource(R.string.native_richtext_underline), subtextColor, { t -> UnderlineIcon(size = 18.dp, tint = t) }) { onToggleMark(RichMarkType.UNDERLINE) }
            MarkChip(RichMarkType.STRIKE in activeMarks, enabled, stringResource(R.string.native_richtext_strikethrough), subtextColor, { t -> StrikeIcon(size = 18.dp, tint = t) }) { onToggleMark(RichMarkType.STRIKE) }
            MarkChip(RichMarkType.LINK in activeMarks, enabled, stringResource(R.string.native_richtext_link), subtextColor, { t -> LinkIcon(size = 18.dp, tint = t) }, onLink)
        }
    }
}

private fun headingKindFor(level: Int): RichBlockKind = when (level) {
    1 -> RichBlockKind.HEADING_1
    2 -> RichBlockKind.HEADING_2
    3 -> RichBlockKind.HEADING_3
    4 -> RichBlockKind.HEADING_4
    else -> RichBlockKind.HEADING_5
}

@Composable
private fun ChipContainer(selected: Boolean, enabled: Boolean, contentDescription: String, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) Indigo.copy(alpha = 0.16f) else Color.Transparent)
            .semantics { this.contentDescription = contentDescription }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 10.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun TextKindChip(label: String, contentDescription: String, selected: Boolean, enabled: Boolean, titleColor: Color, subtextColor: Color, onClick: () -> Unit) {
    ChipContainer(selected, enabled, contentDescription, onClick) {
        Text(
            label,
            color = if (!enabled) subtextColor.copy(alpha = 0.4f) else if (selected) Indigo else titleColor,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
        )
    }
}

@Composable
private fun IconKindChip(
    selected: Boolean,
    enabled: Boolean,
    contentDescription: String,
    subtextColor: Color,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val tint = if (!enabled) subtextColor.copy(alpha = 0.4f) else subtextColor
    ChipContainer(selected, enabled, contentDescription, onClick) { icon(tint) }
}

@Composable
private fun MarkChip(active: Boolean, enabled: Boolean, contentDescription: String, subtextColor: Color, icon: @Composable (Color) -> Unit, onClick: () -> Unit) {
    val tint = if (!enabled) subtextColor.copy(alpha = 0.4f) else subtextColor
    ChipContainer(active, enabled, contentDescription, onClick) { icon(tint) }
}

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
