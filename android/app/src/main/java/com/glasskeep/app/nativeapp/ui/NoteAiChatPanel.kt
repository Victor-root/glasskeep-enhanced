package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.AiMessage
import com.glasskeep.app.ui.ButtonGradient
import kotlinx.coroutines.launch

/**
 * The note's own AI conversation, ported from NoteAiChatPanel.jsx's
 * mobile face: a full screen over the note (the web's own
 * `.note-ai-panel-mobile`, a fixed inset-0 layer), with a back arrow that
 * returns to the note without losing the thread, an X that closes it for
 * good, and the save/clear pair for keeping the conversation.
 *
 * The desktop side-by-side layout has no counterpart here on purpose:
 * the web itself only ever uses it above 1024px, and drops to exactly
 * this full-screen panel on a phone.
 */
@Composable
fun NoteAiChatPanel(
    messages: List<AiMessage>,
    loading: Boolean,
    error: String?,
    saved: Boolean,
    background: Color,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onSend: (String) -> Unit,
    onStop: () -> Unit,
    onHide: () -> Unit,
    onClose: () -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit,
) {
    var draft by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val accent = if (dark) Color(0xFFA5B4FC) else Color(0xFF4338CA)
    val subtext = if (dark) Color(0xFFD1D5DB) else Color(0xFF6B7280)

    // Stick to the bottom while the answer grows, unless the reader has
    // scrolled up: the last item being on screen is what says so.
    val atBottom by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()
            last == null || last.index >= info.totalItemsCount - 1
        }
    }
    LaunchedEffect(messages.size, messages.lastOrNull()?.content, loading) {
        if (messages.isNotEmpty() && atBottom) {
            listState.animateScrollToItem(listState.layoutInfo.totalItemsCount - 1)
        }
    }

    fun submit() {
        val question = draft.trim()
        if (question.isEmpty() || loading) return
        draft = ""
        onSend(question)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(background)
            .windowInsetsPadding(WindowInsets.systemBars)
            .imePadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val backLabel = stringResource(R.string.native_note_ai_back)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .semantics { contentDescription = backLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onHide() }
                    .padding(4.dp),
            ) {
                ChevronLeftIcon(size = 22.dp, tint = accent)
                MessageSearchIcon(size = 26.dp, tint = accent)
            }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.native_note_ai_title),
                    color = accent,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    stringResource(
                        if (saved) R.string.native_note_ai_saved_badge
                        else R.string.native_note_ai_subtitle
                    ),
                    color = subtext,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            // Only one of the two ever shows: save while there is an
            // unsaved thread, clear once it has been kept.
            if (!saved && messages.isNotEmpty()) {
                AiHeaderAction(
                    label = stringResource(R.string.native_note_ai_save),
                    onClick = onSave,
                ) { MessageSaveIcon(size = 20.dp, tint = Color.White) }
                Spacer(Modifier.width(8.dp))
            } else if (saved) {
                AiHeaderAction(
                    label = stringResource(R.string.native_note_ai_reset),
                    onClick = onReset,
                ) { MessageResetIcon(size = 20.dp, tint = Color.White) }
                Spacer(Modifier.width(8.dp))
            }
            val closeLabel = stringResource(R.string.native_note_ai_close)
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
                    .padding(6.dp),
            ) {
                CloseIcon(size = 20.dp, tint = subtext)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))

        Box(Modifier.weight(1f)) {
            if (messages.isEmpty() && !loading && error == null) {
                AiChatEmptyState(
                    subtext = subtext,
                    onQuick = { prompt -> onSend(prompt) },
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    itemsIndexed(messages) { index, message ->
                        AiChatMessage(
                            message = message,
                            // A message still growing stays plain text:
                            // re-parsing Markdown on every chunk would
                            // make the answer flicker as it arrives.
                            streaming = loading && index == messages.lastIndex && message.role == "assistant",
                            showTopRule = message.role == "user" && index > 0,
                            showBottomRule = message.role == "user" && index < messages.lastIndex,
                            dark = dark,
                            titleColor = titleColor,
                        )
                    }
                    if (loading && messages.lastOrNull()?.role != "assistant") {
                        item {
                            Text(
                                stringResource(R.string.native_note_ai_thinking),
                                color = titleColor,
                                fontSize = 14.sp,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (dark) Color.White.copy(alpha = 0.1f) else Color.Black.copy(alpha = 0.1f))
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                            )
                        }
                    }
                }
                if (!atBottom && messages.isNotEmpty()) {
                    val scrollLabel = stringResource(R.string.native_note_ai_scroll_down)
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(12.dp)
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(background)
                            .border(1.dp, borderColor, CircleShape)
                            .semantics { contentDescription = scrollLabel }
                            .gkTooltip(scrollLabel)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) {
                                scope.launch {
                                    listState.animateScrollToItem(listState.layoutInfo.totalItemsCount - 1)
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        ArrowDownIcon(size = 20.dp, tint = accent)
                    }
                }
            }
        }

        error?.let {
            Text(
                it,
                color = if (dark) Color(0xFFFCA5A5) else Color(0xFFB91C1C),
                fontSize = 14.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .topHairline(Color(0x4DEF4444))
                    .background(Color(0x1AEF4444))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .topHairline(borderColor)
                .padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp, max = 128.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                if (draft.isEmpty()) {
                    Text(
                        stringResource(R.string.native_note_ai_placeholder),
                        color = subtext,
                        fontSize = 14.sp,
                    )
                }
                BasicTextField(
                    value = draft,
                    onValueChange = { if (!loading) draft = it },
                    textStyle = TextStyle(color = titleColor, fontSize = 14.sp),
                    cursorBrush = SolidColor(accent),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.width(8.dp))
            if (loading) {
                AiChatActionButton(label = stringResource(R.string.native_note_ai_stop), onClick = onStop) {
                    StopFilledIcon(size = 16.dp, tint = Color.White)
                }
            } else {
                AiChatActionButton(
                    label = stringResource(R.string.native_note_ai_send),
                    enabled = draft.isNotBlank(),
                    onClick = { submit() },
                )
            }
        }
    }
}

/** The header's own square gradient button (save / clear). */
@Composable
private fun AiHeaderAction(label: String, onClick: () -> Unit, icon: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(ButtonGradient)
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

/** Send / Stop: the same gradient pill, with the stop glyph in front of
 *  its label when a turn is in flight. */
@Composable
private fun AiChatActionButton(
    label: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    icon: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(ButtonGradient)
            .alpha(if (enabled) 1f else 0.5f)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        icon?.invoke()
        Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** The two quick prompts and the one line of explanation the panel opens
 *  on (NoteAiChatPanel.jsx:217-245). */
@Composable
private fun AiChatEmptyState(
    subtext: Color,
    onQuick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            stringResource(R.string.native_note_ai_empty),
            color = subtext,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val summarizePrompt = stringResource(R.string.native_note_ai_quick_summarize_prompt)
            val explainPrompt = stringResource(R.string.native_note_ai_quick_explain_prompt)
            AiQuickAction(
                label = stringResource(R.string.native_note_ai_quick_summarize),
                onClick = { onQuick(summarizePrompt) },
            ) { FileAiIcon(size = 20.dp, tint = Color.White) }
            AiQuickAction(
                label = stringResource(R.string.native_note_ai_quick_explain),
                onClick = { onQuick(explainPrompt) },
            ) { FileTextSparkIcon(size = 20.dp, tint = Color.White) }
        }
    }
}

@Composable
private fun AiQuickAction(label: String, onClick: () -> Unit, icon: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(ButtonGradient)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        icon()
        Text(label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** One turn: the question as an indigo bubble against the right edge,
 *  the answer as full-width Markdown, each question fenced off from the
 *  turn before and after by a fading rule. */
@Composable
private fun AiChatMessage(
    message: AiMessage,
    streaming: Boolean,
    showTopRule: Boolean,
    showBottomRule: Boolean,
    dark: Boolean,
    titleColor: Color,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (showTopRule) AiChatRule(if (dark) Color(0xB3818CF8) else Color(0xB36366F1))
        if (message.role == "user") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Text(
                    message.content,
                    color = Color.White,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier
                        .fillMaxWidth(0.85f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFF4F46E5))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        } else if (streaming) {
            Text(message.content, color = titleColor, fontSize = 14.sp, lineHeight = 20.sp)
        } else {
            MarkdownText(markdown = message.content, color = titleColor, dark = dark)
        }
        if (showBottomRule) AiChatRule(if (dark) Color(0xB3A78BFA) else Color(0xB38B5CF6))
    }
}

@Composable
private fun AiChatRule(color: Color) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(Brush.horizontalGradient(listOf(Color.Transparent, color, Color.Transparent))),
    )
}

