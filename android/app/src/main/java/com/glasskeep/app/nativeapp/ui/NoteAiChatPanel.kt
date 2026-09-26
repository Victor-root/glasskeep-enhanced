package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.AiMessage
import com.glasskeep.app.nativeapp.data.TypographyProfile
import com.glasskeep.app.ui.ButtonGradient
import com.glasskeep.app.ui.LightBorderColor
import kotlinx.coroutines.delay
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
    typography: TypographyProfile,
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
    // .modal-icon-btn--ai / .note-ai-panel-icon, then the Tailwind v4
    // indigo-700 / indigo-300 of the title and the gray-500 / gray-200
    // of its subtitle.
    val aiIconTint = if (dark) Color(0xFFA5B4FC) else Color(0xFF6366F1)
    val titleTint = if (dark) Color(0xFFA3B3FF) else Color(0xFF432DD7)
    val subtitleTint = if (dark) Color(0xFFE5E7EB) else Color(0xFF6A7282)
    val divider = if (dark) Color.White.copy(alpha = 0.10f) else LightBorderColor
    val answerColor = if (dark) Color.White else Color(0xFF1E2939)
    val focusRequester = remember { FocusRequester() }
    // The web focuses the question field 60ms after the panel opens.
    LaunchedEffect(Unit) {
        delay(60)
        focusRequester.requestFocus()
    }

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
            .blockTouchesBelow()
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
                // The chevron's -mr-1 tucks it 4px into the glyph.
                horizontalArrangement = Arrangement.spacedBy((-4).dp),
                modifier = Modifier
                    .height(32.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .semantics { contentDescription = backLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onHide() }
                    .padding(horizontal = 4.dp),
            ) {
                ChevronLeftIcon(size = 22.dp, tint = aiIconTint)
                MessageSearchIcon(size = 26.dp, tint = aiIconTint)
            }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.native_note_ai_title),
                    color = titleTint,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    stringResource(
                        if (saved) R.string.native_note_ai_saved_badge
                        else R.string.native_note_ai_subtitle
                    ),
                    color = subtitleTint,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            // Only one of the two ever shows: save while there is an
            // unsaved thread, clear once it has been kept.
            if (!saved && messages.isNotEmpty()) {
                key(false) {
                    AiHeaderAction(
                        label = stringResource(R.string.native_note_ai_save),
                        dark = dark,
                        onClick = onSave,
                    ) { MessageSaveIcon(size = 20.dp, tint = Color.White) }
                }
                Spacer(Modifier.width(8.dp))
            } else if (saved) {
                key(true) {
                    AiHeaderAction(
                        label = stringResource(R.string.native_note_ai_reset),
                        dark = dark,
                        onClick = onReset,
                    ) { MessageResetIcon(size = 20.dp, tint = Color.White) }
                }
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
                CloseIcon(size = 24.dp, tint = if (dark) Color(0xFFD1D5DC) else Color(0xFF6A7282))
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(divider))

        Box(Modifier.weight(1f)) {
            if (messages.isEmpty() && !loading && error == null) {
                AiChatEmptyState(
                    textColor = if (dark) Color(0xFFD1D5DC) else Color(0xFF99A1AF),
                    dark = dark,
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
                            answerColor = answerColor,
                            typography = typography,
                        )
                    }
                    if (loading && messages.lastOrNull()?.role != "assistant") {
                        item {
                            AiThinkingBubble(dark)
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
                            // shadow-md
                            .dropShadow(CircleShape, Shadow(radius = 6.dp, color = Color.Black.copy(alpha = 0.10f), spread = (-1).dp, offset = DpOffset(0.dp, 4.dp)))
                            .dropShadow(CircleShape, Shadow(radius = 4.dp, color = Color.Black.copy(alpha = 0.10f), spread = (-2).dp, offset = DpOffset(0.dp, 2.dp)))
                            .clip(CircleShape)
                            .background(background)
                            .border(1.dp, if (dark) Color.White.copy(alpha = 0.10f) else Color.Black.copy(alpha = 0.10f), CircleShape)
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
                        ArrowDownIcon(size = 20.dp, tint = if (dark) Color(0xFFC6D2FF) else Color(0xFF432DD7))
                    }
                }
            }
        }

        error?.let {
            Text(
                it,
                // text-red-700 / red-300 on red-500 at 10%, its border at 30%.
                color = if (dark) Color(0xFFFFA2A2) else Color(0xFFC10007),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .topHairline(Color(0x4DFB2C36))
                    .background(Color(0x1AFB2C36))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .topHairline(divider)
                .padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            var inputFocused by remember { mutableStateOf(false) }
            val inputShape = RoundedCornerShape(8.dp)
            // rows=2 (58px with its padding and border), up to 8rem, a 2px
            // indigo ring while focused, dimmed while an answer runs.
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 58.dp, max = 128.dp)
                    .alpha(if (loading) 0.6f else 1f)
                    .clip(inputShape)
                    .border(1.dp, if (dark) Color.White.copy(alpha = 0.15f) else LightBorderColor, inputShape)
                    .then(if (inputFocused) Modifier.border(2.dp, Color(0xFF615FFF), inputShape) else Modifier)
                    .padding(horizontal = 13.dp, vertical = 9.dp),
            ) {
                if (draft.isEmpty()) {
                    Text(
                        stringResource(R.string.native_note_ai_placeholder),
                        color = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                }
                BasicTextField(
                    value = draft,
                    onValueChange = { if (!loading) draft = it },
                    readOnly = loading,
                    textStyle = TextStyle(color = answerColor, fontSize = 14.sp, lineHeight = 20.sp),
                    cursorBrush = SolidColor(Color(0xFF615FFF)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester)
                        .onFocusChanged { inputFocused = it.isFocused },
                )
            }
            Spacer(Modifier.width(8.dp))
            if (loading) {
                AiChatActionButton(label = stringResource(R.string.native_note_ai_stop), dark = dark, onClick = onStop) {
                    // .tabler-icon strips the glyph's fill: an outlined square.
                    PlayerStopIcon(size = 20.dp, tint = Color.White)
                }
            } else {
                AiChatActionButton(
                    label = stringResource(R.string.native_note_ai_send),
                    dark = dark,
                    enabled = draft.isNotBlank(),
                    onClick = { submit() },
                )
            }
        }
    }
}

/** The header's own square gradient button (save / clear), popping in
 *  each time the pair swaps (noteAiSaveBtnIn: 0.28s, overshooting to
 *  1.25x at 65%). */
@Composable
private fun AiHeaderAction(label: String, dark: Boolean, onClick: () -> Unit, icon: @Composable () -> Unit) {
    val pop = remember { Animatable(0f) }
    LaunchedEffect(Unit) { pop.animateTo(1f, tween(durationMillis = 280, easing = CubicBezierEasing(0.34f, 1.56f, 0.64f, 1f))) }
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = Modifier
            .size(36.dp)
            .graphicsLayer {
                val t = pop.value
                // Keyframes 0% (0.2, -45deg, transparent), 65% (1.25, 6deg), 100% (1, 0).
                val scale = if (t < 0.65f) 0.2f + (1.25f - 0.2f) * (t / 0.65f) else 1.25f - 0.25f * ((t - 0.65f) / 0.35f)
                scaleX = scale
                scaleY = scale
                rotationZ = if (t < 0.65f) -45f + 51f * (t / 0.65f) else 6f - 6f * ((t - 0.65f) / 0.35f)
                alpha = (t / 0.65f).coerceIn(0f, 1f)
            }
            .aiButtonShadow(dark, shape)
            .clip(shape)
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

/** `shadow-md shadow-indigo-300/40`, dropped in dark mode. */
private fun Modifier.aiButtonShadow(dark: Boolean, shape: Shape): Modifier =
    if (dark) {
        this
    } else {
        this
            .dropShadow(shape, Shadow(radius = 6.dp, color = Color(0x66A3B3FF), spread = (-1).dp, offset = DpOffset(0.dp, 4.dp)))
            .dropShadow(shape, Shadow(radius = 4.dp, color = Color(0x66A3B3FF), spread = (-2).dp, offset = DpOffset(0.dp, 2.dp)))
    }

/** Send / Stop: the same gradient pill, with the stop glyph in front of
 *  its label when a turn is in flight. */
@Composable
private fun AiChatActionButton(
    label: String,
    dark: Boolean,
    onClick: () -> Unit,
    enabled: Boolean = true,
    icon: (@Composable () -> Unit)? = null,
) {
    val shape = RoundedCornerShape(8.dp)
    Row(
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.5f)
            .aiButtonShadow(dark, shape)
            .clip(shape)
            .background(ButtonGradient)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        icon?.invoke()
        Text(label, color = Color.White, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** The two quick prompts and the one line of explanation the panel opens
 *  on (NoteAiChatPanel.jsx:217-245): the text at most 260px wide, then a
 *  two-column grid 70% of the width. */
@Composable
private fun AiChatEmptyState(
    textColor: Color,
    dark: Boolean,
    onQuick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(horizontal = 16.dp, vertical = 12.dp).padding(vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            stringResource(R.string.native_note_ai_empty),
            color = textColor,
            fontSize = 14.sp,
            lineHeight = 22.75.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 260.dp),
        )
        Row(Modifier.fillMaxWidth(0.7f), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val summarizePrompt = stringResource(R.string.native_note_ai_quick_summarize_prompt)
            val explainPrompt = stringResource(R.string.native_note_ai_quick_explain_prompt)
            AiQuickAction(
                label = stringResource(R.string.native_note_ai_quick_summarize),
                dark = dark,
                onClick = { onQuick(summarizePrompt) },
                modifier = Modifier.weight(1f),
            ) { FileAiIcon(size = 20.dp, tint = Color.White) }
            AiQuickAction(
                label = stringResource(R.string.native_note_ai_quick_explain),
                dark = dark,
                onClick = { onQuick(explainPrompt) },
                modifier = Modifier.weight(1f),
            ) { FileTextSparkIcon(size = 20.dp, tint = Color.White) }
        }
    }
}

@Composable
private fun AiQuickAction(
    label: String,
    dark: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
    icon: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier = modifier
            .aiButtonShadow(dark, shape)
            .clip(shape)
            .background(ButtonGradient)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        icon()
        Text(label, color = Color.White, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    }
}

/** "Réflexion en cours…": an 8px indigo dot bouncing (animate-bounce, 1s)
 *  in front of the text, on a 10% veil. */
@Composable
private fun AiThinkingBubble(dark: Boolean) {
    val bounce = rememberInfiniteTransition(label = "aiThinking")
    val lift by bounce.animateFloat(
        initialValue = 0f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            keyframes {
                durationMillis = 1_000
                0f at 0 using CubicBezierEasing(0.8f, 0f, 1f, 1f)
                -0.25f at 500 using CubicBezierEasing(0f, 0f, 0.2f, 1f)
            },
        ),
        label = "aiThinkingLift",
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color.White.copy(alpha = 0.10f) else Color.Black.copy(alpha = 0.10f))
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Box(
            Modifier
                .graphicsLayer { translationY = lift * 8.dp.toPx() }
                .size(8.dp)
                .clip(CircleShape)
                .background(Color(0xFF615FFF)),
        )
        Text(
            stringResource(R.string.native_note_ai_thinking),
            color = if (dark) Color.White else Color(0xFF364153),
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
    }
}

/** One turn: the question as an indigo bubble against the right edge,
 *  hugging its text up to 85% of the width, the answer as full-width
 *  Markdown, each question fenced off from the turn before and after by a
 *  fading rule. */
@Composable
private fun AiChatMessage(
    message: AiMessage,
    streaming: Boolean,
    showTopRule: Boolean,
    showBottomRule: Boolean,
    dark: Boolean,
    answerColor: Color,
    typography: TypographyProfile,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // via-indigo-500/70 (dark indigo-400/70), then via-violet-500/70
        // (dark violet-400/70), Tailwind v4.
        if (showTopRule) AiChatRule(if (dark) Color(0xB37C86FF) else Color(0xB3615FFF))
        if (message.role == "user") {
            BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                Text(
                    message.content,
                    color = Color.White,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier
                        .widthIn(max = maxWidth * 0.85f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFF4F39F6))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        } else if (streaming) {
            Text(
                message.content,
                color = answerColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(4.dp),
            )
        } else {
            Box(Modifier.padding(4.dp)) {
                MarkdownText(markdown = message.content, color = answerColor, dark = dark, typography = typography)
            }
        }
        if (showBottomRule) AiChatRule(if (dark) Color(0xB3A684FF) else Color(0xB38E51FF))
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

