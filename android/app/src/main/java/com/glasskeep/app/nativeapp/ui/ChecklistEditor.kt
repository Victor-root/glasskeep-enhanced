package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.ChecklistItemData
import com.glasskeep.app.nativeapp.data.ChecklistPreview
import com.glasskeep.app.ui.Indigo
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement

/**
 * The native checklist editor's list body: one row per item plus a
 * trailing "add item" row. Flat only, no section markers, see
 * ChecklistItems.parseFlat for why (NoteDetailScreen falls back to a
 * read-only view instead of rendering this when a checklist has sections).
 *
 * Two web behaviors are deliberately not ported, both disclosed rather than
 * silently dropped:
 *  - Enter always inserts adjacent to the current item according to the
 *    top/bottom insert-position setting; the web's extra "Enter with the
 *    caret at the very start of the text always inserts above" exception
 *    isn't replicated, since knowing where the caret was would mean
 *    tracking TextFieldValue/selection per row instead of plain text, for
 *    a minor convenience.
 *  - Backspace-on-empty-deletes-and-focuses-previous isn't wired up: a
 *    soft keyboard's backspace on an already-empty field isn't reliably
 *    delivered as a real key event by every IME (same reasoning as the
 *    tag search field's input, see NativeNotesListScreen). Deleting an
 *    empty item still works two other ways: the remove button, and
 *    blurring away from it (see onBlur below), both of which use reliable
 *    Compose APIs instead of raw key interception.
 */
@Composable
fun ChecklistItemsList(
    items: List<ChecklistItemData>,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    focusRequesterFor: (id: String) -> FocusRequester,
    onToggle: (id: String, checked: Boolean) -> Unit,
    onTextChange: (id: String, text: String) -> Unit,
    onBlur: (id: String) -> Unit,
    onEnter: (id: String) -> Unit,
    onIndentToggle: (id: String) -> Unit,
    canIndent: (id: String) -> Boolean,
    onRemove: (id: String) -> Unit,
    onAddItem: () -> Unit,
) {
    Column {
        if (items.isEmpty()) {
            Text(
                stringResource(R.string.native_checklist_empty),
                color = subtextColor,
                fontSize = 13.sp,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        }
        for (item in items) {
            ChecklistItemRow(
                item = item,
                titleColor = titleColor,
                subtextColor = subtextColor,
                borderColor = borderColor,
                focusRequester = focusRequesterFor(item.id),
                canIndent = canIndent(item.id),
                onToggle = { checked -> onToggle(item.id, checked) },
                onTextChange = { text -> onTextChange(item.id, text) },
                onBlur = { onBlur(item.id) },
                onEnter = { onEnter(item.id) },
                onIndentToggle = { onIndentToggle(item.id) },
                onRemove = { onRemove(item.id) },
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
                ) { onAddItem() }
                .padding(vertical = 8.dp),
        ) {
            PlusIcon(size = 16.dp, tint = Indigo)
            Spacer(Modifier.width(10.dp))
            Text(
                stringResource(R.string.native_checklist_add_item),
                color = Indigo,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun ChecklistItemRow(
    item: ChecklistItemData,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    focusRequester: FocusRequester,
    canIndent: Boolean,
    onToggle: (Boolean) -> Unit,
    onTextChange: (String) -> Unit,
    onBlur: () -> Unit,
    onEnter: () -> Unit,
    onIndentToggle: () -> Unit,
    onRemove: () -> Unit,
) {
    val removeLabel = stringResource(R.string.native_checklist_remove_item)
    val indentLabel = stringResource(
        if (item.indent == 1) R.string.native_checklist_outdent else R.string.native_checklist_indent
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = if (item.indent == 1) 28.dp else 0.dp, top = 2.dp, bottom = 2.dp),
    ) {
        Checkbox(
            checked = item.done,
            onCheckedChange = onToggle,
            colors = CheckboxDefaults.colors(checkedColor = Indigo, uncheckedColor = borderColor),
        )
        BasicTextField(
            value = item.text,
            onValueChange = onTextChange,
            textStyle = TextStyle(
                color = if (item.done) subtextColor else titleColor,
                fontSize = 15.sp,
                textDecoration = if (item.done) TextDecoration.LineThrough else TextDecoration.None,
            ),
            singleLine = true,
            cursorBrush = SolidColor(Indigo),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { onEnter() }),
            modifier = Modifier
                .weight(1f)
                .focusRequester(focusRequester)
                .onFocusChanged { state -> if (!state.isFocused) onBlur() },
        )
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .semantics { contentDescription = indentLabel }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = canIndent || item.indent == 1,
                    role = Role.Button,
                ) { onIndentToggle() }
                .padding(6.dp),
        ) {
            BackArrowIcon(
                size = 16.dp,
                tint = if (canIndent || item.indent == 1) subtextColor else subtextColor.copy(alpha = 0.35f),
                modifier = if (item.indent == 1) Modifier else Modifier.rotate(180f),
            )
        }
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
            CloseIcon(size = 16.dp, tint = subtextColor)
        }
    }
}

/** Full, non-interactive listing (every item, checked included, unlike the
 *  capped/unchecked-only NoteCard preview) for a checklist NoteDetailScreen
 *  can't safely open in the real editor (it has section markers, see
 *  ChecklistItems.parseFlat). Reuses ChecklistPreview's own parsing, which
 *  already discriminates and drops section markers, rather than
 *  duplicating that logic here. */
@Composable
fun ChecklistReadOnlyPreview(items: List<JsonElement>, titleColor: Color, subtextColor: Color) {
    val parsed = remember(items) { ChecklistPreview.parse(JsonArray(items).toString()) }
    Column {
        for (row in parsed) {
            Row(modifier = Modifier.padding(start = if (row.indented) 28.dp else 0.dp, top = 3.dp, bottom = 3.dp)) {
                Text(if (row.done) "☑ " else "☐ ", color = subtextColor, fontSize = 14.sp)
                Text(
                    row.text,
                    color = if (row.done) subtextColor else titleColor,
                    fontSize = 14.sp,
                    textDecoration = if (row.done) TextDecoration.LineThrough else TextDecoration.None,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
