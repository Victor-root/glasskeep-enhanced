package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.RichAlign
import com.glasskeep.app.nativeapp.data.RichBlock
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.TypographyProfile
import com.glasskeep.app.nativeapp.data.isHeading
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.Indigo

private val NumberedListColor = Color(0xFF0ea5e9)

/** `1rem` in the web's own root font size, the unit every ported measure
 *  below is expressed in. */
private const val RemPx = 16f

/** Indent.js's INDENT_STEP_EM: one indent level is 1.75 times the block's
 *  own font size, so an indented heading shifts further than an indented
 *  paragraph, exactly as `margin-inline-start: Nem` does. */
private const val IndentStepEm = 1.75f

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

    /** ProseMirror's stored marks, ported: with nothing selected, tapping
     *  Bold (or picking a colour) arms that mark for whatever is typed
     *  next instead of doing nothing. Cleared as soon as the cursor moves
     *  or the text is inserted. */
    var pendingMarks by mutableStateOf<List<PendingMark>>(emptyList())
        private set

    fun togglePending(type: RichMarkType) {
        pendingMarks = if (pendingMarks.any { it.type == type }) {
            pendingMarks.filterNot { it.type == type }
        } else {
            pendingMarks + PendingMark(type)
        }
    }

    fun setPending(type: RichMarkType, value: String?, color: String? = null) {
        pendingMarks = pendingMarks.filterNot { it.type == type } + PendingMark(type, value, color)
    }

    fun clearPending(type: RichMarkType) {
        pendingMarks = pendingMarks.filterNot { it.type == type }
    }

    fun clearAllPending() {
        pendingMarks = emptyList()
    }
}

/** One armed-but-not-yet-applied mark (see [RichEditorState.pendingMarks]). */
data class PendingMark(val type: RichMarkType, val value: String? = null, val color: String? = null)

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
 * silently dropped" rule as every other milestone in this app:
 * Backspace-at-the-start-of-a-block merging it into the previous one (a
 * soft keyboard's backspace on an empty/start position isn't reliably
 * delivered as a real key event by every IME, same reasoning as the
 * checklist editor), tap-to-open a link while editing (tapping just
 * places the cursor, same as any other text; use the Link button with the
 * cursor inside it to edit or remove one instead), and the four
 * decorative underline variants: Compose's TextDecoration has exactly one
 * underline with no style and no separate colour, so a double/dotted/
 * dashed/wavy underline and its colour are stored, listed and round-
 * tripped faithfully but painted as a plain underline here.
 */
@Composable
fun RichTextEditor(
    blocks: List<RichBlock>,
    state: RichEditorState,
    typography: TypographyProfile,
    taskStrike: Boolean,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    focusRequesterFor: (id: String) -> FocusRequester,
    onTextEdited: (id: String, newText: String, newMarks: List<RichMark>) -> Unit,
    onEnter: (id: String, atPosition: Int) -> Unit,
    onToggleChecked: (id: String) -> Unit,
    onRemoveBlock: (id: String) -> Unit,
    onAddBlock: () -> Unit,
) {
    // The web numbers ordered lists with its own `gk-ol` counter, reset by
    // a paragraph, a heading, a quote, a bullet/task list or a rule, but
    // deliberately NOT by a code block (globalCSS.js:1140-1185), so a list
    // interrupted by a snippet keeps counting.
    val numberedPositions = remember(blocks) {
        val map = mutableMapOf<String, Int>()
        var counter = 0
        for (b in blocks) {
            when (b.kind) {
                RichBlockKind.NUMBERED_ITEM -> {
                    counter += 1
                    map[b.id] = counter
                }
                RichBlockKind.CODE_BLOCK -> Unit
                else -> counter = 0
            }
        }
        map
    }

    Column {
        for (block in blocks) {
            RichBlockRow(
                block = block,
                typography = typography,
                taskStrike = taskStrike,
                dark = dark,
                titleColor = titleColor,
                subtextColor = subtextColor,
                numberedPosition = numberedPositions[block.id],
                focusRequester = focusRequesterFor(block.id),
                pendingMarks = if (state.focusedId == block.id) state.pendingMarks else emptyList(),
                onConsumePending = { state.clearAllPending() },
                onFocusGained = { selection ->
                    state.focusedId = block.id
                    state.selection = selection
                    state.clearAllPending()
                },
                onFocusLost = {
                    if (state.focusedId == block.id) {
                        state.focusedId = null
                        state.clearAllPending()
                    }
                },
                onSelectionChanged = { selection ->
                    if (state.focusedId == block.id) {
                        state.selection = selection
                        state.clearAllPending()
                    }
                },
                onTextEdited = { newText, newMarks, newSelection ->
                    onTextEdited(block.id, newText, newMarks)
                    if (state.focusedId == block.id) state.selection = newSelection
                },
                onEnter = { position -> onEnter(block.id, position) },
                onToggleChecked = { onToggleChecked(block.id) },
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

/**
 * The same document, read-only: what the web renders in view mode
 * (`.note-content`), which is its default for a text note until the user
 * taps the edit toggle. Same styles as the editor above, minus every
 * editable affordance: no text fields, no per-block remove button, no
 * trailing "add a paragraph" row.
 */
@Composable
fun RichTextReader(
    blocks: List<RichBlock>,
    typography: TypographyProfile,
    taskStrike: Boolean,
    dark: Boolean,
    titleColor: Color,
) {
    val numberedPositions = remember(blocks) {
        val map = mutableMapOf<String, Int>()
        var counter = 0
        for (b in blocks) {
            when (b.kind) {
                RichBlockKind.NUMBERED_ITEM -> {
                    counter += 1
                    map[b.id] = counter
                }
                RichBlockKind.CODE_BLOCK -> Unit
                else -> counter = 0
            }
        }
        map
    }
    Column(Modifier.fillMaxWidth()) {
        for (block in blocks) {
            val style = richBlockTextStyle(block, typography, taskStrike, dark, titleColor)
            val indent = (block.indent * IndentStepEm * style.fontSize.value).dp
            when (block.kind) {
                RichBlockKind.DIVIDER -> Box(Modifier.padding(start = indent)) { RichDividerBlock(dark) }
                RichBlockKind.CODE_BLOCK -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = indent, top = RemPx.dp, bottom = RemPx.dp)
                        .clip(RoundedCornerShape((0.5f * RemPx).dp))
                        .background(if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.06f))
                        .border(
                            width = 1.dp,
                            color = if (dark) RtDividerDark else RtDividerLight,
                            shape = RoundedCornerShape((0.5f * RemPx).dp),
                        )
                        .padding(horizontal = (0.85f * RemPx).dp, vertical = (0.6f * RemPx).dp),
                ) {
                    Text(annotatedTextFor(block, style, dark), style = style)
                }
                RichBlockKind.QUOTE -> {
                    val bar = if (dark) Color(0xFFA5B4FC) else Indigo.copy(alpha = 0.85f)
                    val wash = if (dark) Color(0xFFA5B4FC).copy(alpha = 0.13f) else Indigo.copy(alpha = 0.07f)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = indent, top = (0.6f * RemPx).dp, bottom = (0.6f * RemPx).dp)
                            .clip(RoundedCornerShape(topEnd = 8.dp, bottomEnd = 8.dp))
                            .background(wash)
                            .drawBehind { drawRect(color = bar, size = Size(8.dp.toPx(), size.height)) }
                            .padding(
                                start = (2.6f * RemPx).dp,
                                end = (1.1f * RemPx).dp,
                                top = (0.9f * RemPx).dp,
                                bottom = (0.9f * RemPx).dp,
                            ),
                    ) {
                        Text(annotatedTextFor(block, style, dark), style = style.copy(fontStyle = FontStyle.Italic))
                    }
                }
                else -> Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.fillMaxWidth().padding(start = indent, top = 3.dp, bottom = 3.dp),
                ) {
                    RichBlockPrefix(
                        block = block,
                        style = style,
                        dark = dark,
                        numberedPosition = numberedPositions[block.id],
                        onToggleChecked = {},
                    )
                    Text(annotatedTextFor(block, style, dark), style = style, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun RichBlockRow(
    block: RichBlock,
    typography: TypographyProfile,
    taskStrike: Boolean,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    numberedPosition: Int?,
    focusRequester: FocusRequester,
    pendingMarks: List<PendingMark>,
    onConsumePending: () -> Unit,
    onFocusGained: (TextRange) -> Unit,
    onFocusLost: () -> Unit,
    onSelectionChanged: (TextRange) -> Unit,
    onTextEdited: (newText: String, newMarks: List<RichMark>, newSelection: TextRange) -> Unit,
    onEnter: (position: Int) -> Unit,
    onToggleChecked: () -> Unit,
    onRemove: () -> Unit,
) {
    val style = richBlockTextStyle(block, typography, taskStrike, dark, titleColor)
    val indent = (block.indent * IndentStepEm * style.fontSize.value).dp

    Row(
        verticalAlignment = Alignment.Top,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = indent, top = 3.dp, bottom = 3.dp),
    ) {
        Box(Modifier.weight(1f)) {
            when (block.kind) {
                RichBlockKind.DIVIDER -> RichDividerBlock(dark)
                RichBlockKind.CODE_BLOCK -> RichCodeBlock(
                    block = block,
                    style = style,
                    dark = dark,
                    focusRequester = focusRequester,
                    pendingMarks = pendingMarks,
                    onConsumePending = onConsumePending,
                    onFocusGained = onFocusGained,
                    onFocusLost = onFocusLost,
                    onSelectionChanged = onSelectionChanged,
                    onTextEdited = onTextEdited,
                )
                RichBlockKind.QUOTE -> RichQuoteBlock(
                    block = block,
                    style = style,
                    dark = dark,
                    focusRequester = focusRequester,
                    pendingMarks = pendingMarks,
                    onConsumePending = onConsumePending,
                    onFocusGained = onFocusGained,
                    onFocusLost = onFocusLost,
                    onSelectionChanged = onSelectionChanged,
                    onTextEdited = onTextEdited,
                    onEnter = onEnter,
                )
                else -> Row(verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
                    RichBlockPrefix(
                        block = block,
                        style = style,
                        dark = dark,
                        numberedPosition = numberedPosition,
                        onToggleChecked = onToggleChecked,
                    )
                    RichTextBlockField(
                        block = block,
                        style = style,
                        dark = dark,
                        focusRequester = focusRequester,
                        pendingMarks = pendingMarks,
                        onConsumePending = onConsumePending,
                        onFocusGained = onFocusGained,
                        onFocusLost = onFocusLost,
                        onSelectionChanged = onSelectionChanged,
                        onTextEdited = onTextEdited,
                        onEnter = onEnter,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        val removeLabel = stringResource(R.string.native_richtext_remove_block)
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

/** The shared editable field: one BasicTextField carrying the block's own
 *  style, with Enter splitting the block in two (see [onEnter]). */
@Composable
private fun RichTextBlockField(
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    focusRequester: FocusRequester,
    pendingMarks: List<PendingMark>,
    onConsumePending: () -> Unit,
    onFocusGained: (TextRange) -> Unit,
    onFocusLost: () -> Unit,
    onSelectionChanged: (TextRange) -> Unit,
    onTextEdited: (newText: String, newMarks: List<RichMark>, newSelection: TextRange) -> Unit,
    onEnter: ((position: Int) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    // Cursor at the start on first composition, not at the end: a freshly
    // split-off block's whole text is "what came after the cursor", so
    // this is also where editing should resume once it gains focus (see
    // NoteDetailScreen's pendingRichFocus).
    var fieldValue by remember(block.id) {
        mutableStateOf(TextFieldValue(annotatedTextFor(block, style, dark), TextRange.Zero))
    }
    // Safety net for changes that didn't originate in this row's own
    // onValueChange (a toolbar mark toggle, a split/merge): rebuild the
    // styled value from the model, keeping whatever selection still fits.
    LaunchedEffect(block.text, block.marks, style) {
        val rebuilt = annotatedTextFor(block, style, dark)
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

    BasicTextField(
        value = fieldValue,
        onValueChange = { new ->
            if (new.text != fieldValue.text) {
                val span = RichDoc.diffEdit(fieldValue.text, new.text)
                val insertedNewline = span.newEnd == span.start + 1 && span.oldEnd == span.start &&
                    new.text.getOrNull(span.start) == '\n'
                if (insertedNewline && onEnter != null) {
                    onEnter(span.start)
                } else {
                    var newMarks = RichDoc.adjustMarksForEdit(fieldValue.text, new.text, block.marks)
                    val inserted = span.oldEnd == span.start && span.newEnd > span.start
                    if (inserted && pendingMarks.isNotEmpty()) {
                        newMarks = pendingMarks.fold(newMarks) { acc, pending ->
                            RichDoc.setMark(acc, pending.type, span.start, span.newEnd, pending.value, pending.color)
                        }
                        onConsumePending()
                    }
                    val updated = block.copy(text = new.text, marks = newMarks)
                    fieldValue = TextFieldValue(annotatedTextFor(updated, style, dark), new.selection)
                    onTextEdited(new.text, newMarks, new.selection)
                }
            } else {
                fieldValue = new
                onSelectionChanged(new.selection)
            }
        },
        textStyle = style,
        cursorBrush = SolidColor(Indigo),
        modifier = modifier
            .focusRequester(focusRequester)
            .onFocusChanged { focus -> if (focus.isFocused) onFocusGained(fieldValue.selection) else onFocusLost() },
    )
}

/** `.rt-editor-content hr` (globalCSS.js:3096-3101). */
@Composable
private fun RichDividerBlock(dark: Boolean) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = (0.85f * RemPx).dp)
            .height(1.dp)
            .background(if (dark) Color.White.copy(alpha = 0.2f) else Color.Black.copy(alpha = 0.2f)),
    )
}

/** `.rt-editor-content pre` (globalCSS.js:3069-3083). Enter is a real
 *  newline inside a snippet, so this field never splits the block. */
@Composable
private fun RichCodeBlock(
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    focusRequester: FocusRequester,
    pendingMarks: List<PendingMark>,
    onConsumePending: () -> Unit,
    onFocusGained: (TextRange) -> Unit,
    onFocusLost: () -> Unit,
    onSelectionChanged: (TextRange) -> Unit,
    onTextEdited: (newText: String, newMarks: List<RichMark>, newSelection: TextRange) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = RemPx.dp)
            .clip(RoundedCornerShape((0.5f * RemPx).dp))
            .background(if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.06f))
            .border(
                width = 1.dp,
                color = if (dark) RtDividerDark else RtDividerLight,
                shape = RoundedCornerShape((0.5f * RemPx).dp),
            )
            .padding(horizontal = (0.85f * RemPx).dp, vertical = (0.6f * RemPx).dp),
    ) {
        RichTextBlockField(
            block = block,
            style = style,
            dark = dark,
            focusRequester = focusRequester,
            pendingMarks = pendingMarks,
            onConsumePending = onConsumePending,
            onFocusGained = onFocusGained,
            onFocusLost = onFocusLost,
            onSelectionChanged = onSelectionChanged,
            onTextEdited = onTextEdited,
            onEnter = null,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** `.rt-editor-content blockquote` (globalCSS.js:3004-3067): an 8px accent
 *  bar, a 7% accent wash, the big serif opening quote hanging in the left
 *  gutter, and 8px radius on the right corners only. */
@Composable
private fun RichQuoteBlock(
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    focusRequester: FocusRequester,
    pendingMarks: List<PendingMark>,
    onConsumePending: () -> Unit,
    onFocusGained: (TextRange) -> Unit,
    onFocusLost: () -> Unit,
    onSelectionChanged: (TextRange) -> Unit,
    onTextEdited: (newText: String, newMarks: List<RichMark>, newSelection: TextRange) -> Unit,
    onEnter: (position: Int) -> Unit,
) {
    val bar = if (dark) Color(0xFFA5B4FC) else Indigo.copy(alpha = 0.85f)
    val wash = if (dark) Color(0xFFA5B4FC).copy(alpha = 0.13f) else Indigo.copy(alpha = 0.07f)
    val quoteGlyph = if (dark) Color(0xFFA5B4FC).copy(alpha = 0.6f) else Indigo.copy(alpha = 0.55f)
    val shape = RoundedCornerShape(topEnd = 8.dp, bottomEnd = 8.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = (0.6f * RemPx).dp)
            .clip(shape)
            .background(wash)
            .drawBehind { drawRect(color = bar, size = Size(8.dp.toPx(), size.height)) },
    ) {
        Text(
            "“",
            color = quoteGlyph,
            fontSize = (3.4f * RemPx).sp,
            fontFamily = FontFamily.Serif,
            modifier = Modifier.offset(x = (0.45f * RemPx).dp, y = (-0.25f * RemPx).dp),
        )
        RichTextBlockField(
            block = block,
            style = style.copy(fontStyle = FontStyle.Italic),
            dark = dark,
            focusRequester = focusRequester,
            pendingMarks = pendingMarks,
            onConsumePending = onConsumePending,
            onFocusGained = onFocusGained,
            onFocusLost = onFocusLost,
            onSelectionChanged = onSelectionChanged,
            onTextEdited = onTextEdited,
            onEnter = onEnter,
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = (2.6f * RemPx).dp,
                    end = (1.1f * RemPx).dp,
                    top = (0.9f * RemPx).dp,
                    bottom = (0.9f * RemPx).dp,
                ),
        )
    }
}

/** The gutter marker: a bullet, a number, or a task checkbox. The web puts
 *  it in the list's own `padding-left: 1.1rem` (globalCSS.js:1035), and
 *  gives task items an 8px gap instead (globalCSS.js:1067-1076). */
@Composable
private fun RichBlockPrefix(
    block: RichBlock,
    style: TextStyle,
    dark: Boolean,
    numberedPosition: Int?,
    onToggleChecked: () -> Unit,
) {
    when (block.kind) {
        RichBlockKind.TASK_ITEM -> {
            val label = stringResource(R.string.native_richtext_task_toggle)
            Box(
                modifier = Modifier
                    .padding(top = (0.18f * style.fontSize.value).dp, end = (0.5f * RemPx).dp)
                    .size(RemPx.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(if (block.checked) Indigo else Color.Transparent)
                    .border(
                        width = if (block.checked) 0.dp else 1.5.dp,
                        color = if (dark) Color.White.copy(alpha = 0.45f) else Color.Black.copy(alpha = 0.35f),
                        shape = RoundedCornerShape(3.dp),
                    )
                    .semantics { contentDescription = label }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Checkbox,
                    ) { onToggleChecked() },
                contentAlignment = Alignment.Center,
            ) {
                if (block.checked) CheckmarkIcon(size = 12.dp, tint = Color.White)
            }
        }
        RichBlockKind.BULLET_ITEM, RichBlockKind.NUMBERED_ITEM -> {
            val numbered = block.kind == RichBlockKind.NUMBERED_ITEM
            Text(
                if (numbered) "${numberedPosition ?: 1}." else "•",
                color = if (numbered) NumberedListColor else Indigo,
                fontSize = style.fontSize,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.width((1.1f * RemPx).dp).padding(top = 2.dp, end = 2.dp),
            )
        }
        else -> Unit
    }
}

/**
 * The block's own text style, straight from the user's active typography
 * profile (typographyPresets.js's DEFAULT_PROFILE until they change it):
 * size, weight, colour, italic and underline all come from there, which is
 * why an H1 is indigo and an H4 is amber italic out of the box.
 *
 * The line heights are the CSS ones: 1.55 for body text
 * (`.rt-editor-content`), 1.5 for headings, 1.45 for list items, 1.6 for
 * quotes, and 1.45 for code.
 */
private fun richBlockTextStyle(
    block: RichBlock,
    typography: TypographyProfile,
    taskStrike: Boolean,
    dark: Boolean,
    titleColor: Color,
): TextStyle {
    val preset = typography.forKind(block.kind)
    val code = block.kind == RichBlockKind.CODE_BLOCK
    val fontSize = if (code) (preset.size * RemPx * 0.9f).sp else (preset.size * RemPx).sp
    val lineHeightFactor = when {
        block.kind.isHeading -> 1.5f
        block.kind == RichBlockKind.QUOTE -> 1.6f
        block.kind == RichBlockKind.BULLET_ITEM ||
            block.kind == RichBlockKind.NUMBERED_ITEM ||
            block.kind == RichBlockKind.TASK_ITEM -> 1.45f
        code -> 1.45f
        else -> 1.55f
    }
    // gk-strike-checked (globalCSS.js:1130-1135): a per-device reading
    // preference that strikes a checked task item and fades it to 60%,
    // without ever writing a Strike mark into the note.
    val struck = taskStrike && block.kind == RichBlockKind.TASK_ITEM && block.checked
    val decorations = buildList {
        if (preset.underline) add(TextDecoration.Underline)
        if (struck) add(TextDecoration.LineThrough)
    }
    return TextStyle(
        color = (richColorOf(preset.color, dark) ?: titleColor).let { if (struck) it.copy(alpha = 0.6f) else it },
        fontSize = fontSize,
        fontWeight = FontWeight(preset.weight),
        fontStyle = if (preset.italic) FontStyle.Italic else FontStyle.Normal,
        textDecoration = if (decorations.isEmpty()) TextDecoration.None else TextDecoration.combine(decorations),
        fontFamily = if (code) FontFamily.Monospace else null,
        lineHeight = (fontSize.value * lineHeightFactor).sp,
        textAlign = when (block.align) {
            RichAlign.LEFT -> TextAlign.Start
            RichAlign.CENTER -> TextAlign.Center
            RichAlign.RIGHT -> TextAlign.End
            RichAlign.JUSTIFY -> TextAlign.Justify
        },
    )
}

/**
 * Builds the styled value a block's field should show. Bold, italic,
 * colour, highlight, font and size map straight onto a SpanStyle;
 * underline, strike and link have to be combined by hand into one
 * TextDecoration per run (addStyle's own overlap resolution between two
 * different single-decoration spans isn't something to rely on here).
 *
 * `<strong>` is `font-weight: bolder` in the browser preflight, i.e.
 * RELATIVE to the block's own weight, which is why bold text inside a
 * 800-weight H1 comes out at 900 rather than the flat 700 a fixed
 * FontWeight.Bold would give.
 */
private fun annotatedTextFor(block: RichBlock, style: TextStyle, dark: Boolean) = buildAnnotatedString {
    val text = block.text
    val marks = block.marks
    append(text)
    if (text.isEmpty() || marks.isEmpty()) return@buildAnnotatedString
    val linkColor = if (dark) Color(0xFF93c5fd) else Color(0xFF2563eb)
    val codeBg = if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f)
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
        var color: Color? = null
        var background: Color? = null
        var fontFamily: FontFamily? = null
        var fontSize = style.fontSize.value
        var sizeSet = false
        var baseline: BaselineShift? = null
        var mono = false
        val decorations = mutableListOf<TextDecoration>()

        for (m in active) when (m.type) {
            RichMarkType.BOLD -> bold = true
            RichMarkType.ITALIC -> italic = true
            RichMarkType.UNDERLINE -> decorations.add(TextDecoration.Underline)
            RichMarkType.STRIKE -> decorations.add(TextDecoration.LineThrough)
            RichMarkType.LINK -> { decorations.add(TextDecoration.Underline); isLink = true }
            RichMarkType.CODE -> { mono = true; background = codeBg }
            RichMarkType.SUBSCRIPT -> baseline = BaselineShift.Subscript
            RichMarkType.SUPERSCRIPT -> baseline = BaselineShift.Superscript
            RichMarkType.TEXT_COLOR -> color = richColorOf(m.value, dark)
            RichMarkType.HIGHLIGHT -> background = richColorOf(m.value, dark)
            RichMarkType.FONT_FAMILY -> fontFamily = richFontFor(m.value)?.family
            RichMarkType.FONT_SIZE -> richFontSizeOf(m.value)?.let { fontSize = it; sizeSet = true }
        }
        if (mono) fontSize *= 0.9f
        if (baseline != null) fontSize *= 0.8f

        addStyle(
            SpanStyle(
                color = if (isLink) linkColor else (color ?: Color.Unspecified),
                background = background ?: Color.Unspecified,
                fontWeight = if (bold) bolderThan(style.fontWeight) else null,
                fontStyle = if (italic) FontStyle.Italic else null,
                fontFamily = fontFamily ?: if (mono) FontFamily.Monospace else null,
                fontSize = if (sizeSet || mono || baseline != null) fontSize.sp else TextUnit.Unspecified,
                baselineShift = baseline,
                textDecoration = if (decorations.isEmpty()) null else TextDecoration.combine(decorations.distinct()),
            ),
            start,
            end,
        )
    }
}

/** CSS `font-weight: bolder`: 100-300 becomes 400, 400-500 becomes 700,
 *  anything heavier becomes 900. */
private fun bolderThan(weight: FontWeight?): FontWeight = when (weight?.weight ?: 400) {
    in 0..300 -> FontWeight.Normal
    in 301..500 -> FontWeight.Bold
    else -> FontWeight.Black
}

/** --rt-btn-active-bg / --rt-btn-active-text and --rt-divider
 *  (globalCSS.js:2855-2890). */
internal val RtActiveBgLight = Color(0x246366F1)
internal val RtActiveBgDark = Color(0x426366F1)
internal val RtActiveTextLight = Color(0xFF6366F1)
internal val RtActiveTextDark = Color(0xFFA1A3F7)
internal val RtDividerLight = Color(0x14000000)
internal val RtDividerDark = Color(0x1AFFFFFF)

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
