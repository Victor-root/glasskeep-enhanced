package com.glasskeep.app.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AppLanguage
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.data.AiClient
import com.glasskeep.app.nativeapp.data.MarkdownDoc
import com.glasskeep.app.nativeapp.data.RichBlockKind
import com.glasskeep.app.nativeapp.data.RichMark
import com.glasskeep.app.nativeapp.data.RichMarkType
import com.glasskeep.app.nativeapp.data.network.UserAiSettingsDto
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.LightBorderColor
import kotlinx.coroutines.launch
import java.net.URI

/**
 * ChangelogModal.jsx on a phone: the whole screen, the release notes
 * shipped with the app under a "What's new" header with the server's
 * version, an AI translation into the interface's language (streamed in
 * as it comes, the original a tap away), and the GitHub star line until
 * "Already done". Opened from the admin panel, and on the launch that
 * follows a successful one-click update.
 */
@Composable
internal fun ChangelogModal(
    container: NativeAppContainer,
    serverUrl: String,
    version: String?,
    themeId: String?,
    dark: Boolean,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val aiClient = remember(serverUrl) { AiClient(serverUrl, container.tokenStore) }
    val source = remember { context.assets.open(ChangelogAsset).bufferedReader().use { it.readText() } }
    val aiAvailable by produceState(false, serverUrl) {
        value = container.notesRepository(serverUrl).fetchUserAiSettings()?.translatesChangelog() == true
    }
    var translating by remember { mutableStateOf(false) }
    var translated by remember { mutableStateOf<String?>(null) }
    var translateFailed by remember { mutableStateOf(false) }
    var showOriginal by remember { mutableStateOf(false) }
    var starDismissed by remember { mutableStateOf(container.tokenStore.starPromptDismissed) }
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    val subtle = if (dark) Gray400 else Gray500

    fun translate() {
        if (translating || !aiAvailable) return
        translateFailed = false
        translating = true
        showOriginal = false
        translated = ""
        scope.launch {
            var accumulated = ""
            val failure = aiClient.translateChangelog(source, if (AppLanguage.currentTag() == "fr") "fr" else "en") { delta ->
                accumulated += delta
                translated = accumulated
            }
            if (failure != null || accumulated.isEmpty()) {
                translateFailed = true
                translated = null
            }
            translating = false
        }
    }

    BackHandler(onBack = onClose)
    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.systemBars)
            .background(if (dark) DarkCard else Color.White)
            .blockTouchesBelow(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(Color.White.copy(alpha = if (dark) 0.05f else 0.6f))
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(36.dp).background(Emerald500.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    SparklesIcon(size = 20.dp, tint = if (dark) Emerald300 else Emerald600)
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        stringResource(R.string.native_changelog_title),
                        color = if (dark) Gray50 else Gray900,
                        fontSize = 16.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(stringResource(R.string.native_changelog_subtitle), color = subtle, fontSize = 12.sp, lineHeight = 16.sp)
                }
            }
            version?.let {
                Spacer(Modifier.width(12.dp))
                Text(
                    "v$it",
                    color = if (dark) Emerald300 else Emerald700,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    style = TextStyle(fontFeatureSettings = "tnum"),
                    modifier = Modifier
                        .background(Emerald500.copy(alpha = 0.15f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            val closeLabel = stringResource(R.string.native_common_close)
            Box(
                Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                        onClick = onClose,
                    )
                    .semantics { contentDescription = closeLabel },
                contentAlignment = Alignment.Center,
            ) {
                CloseIcon(size = 20.dp, tint = subtle, strokeWidth = 1.75f)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))

        FlowRow(
            Modifier
                .fillMaxWidth()
                .background(Color.White.copy(alpha = if (dark) 0.05f else 0.4f))
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            val unavailable = stringResource(R.string.native_changelog_translate_unavailable)
            GkGradientButton(
                label = stringResource(if (translating) R.string.native_changelog_translating else R.string.native_changelog_translate),
                themeId = themeId,
                enabled = aiAvailable && !translating,
                horizontalPadding = 12.dp,
                verticalPadding = 6.dp,
                leading = {
                    SparklesIcon(
                        if (translating) Modifier.rotate(rememberSpinAngle()) else Modifier,
                        size = 20.dp,
                        tint = Color.White,
                    )
                },
                modifier = if (aiAvailable) Modifier else Modifier.gkTooltip(unavailable),
                onClick = ::translate,
            )
            if (!translated.isNullOrEmpty() && !translating) {
                Text(
                    stringResource(if (showOriginal) R.string.native_changelog_show_translated else R.string.native_changelog_show_original),
                    color = if (dark) Gray200 else Gray700,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (dark) Color.White.copy(alpha = 0.1f) else Color.White)
                        .border(1.dp, borderColor, RoundedCornerShape(6.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { showOriginal = !showOriginal }
                        .padding(horizontal = 13.dp, vertical = 7.dp),
                )
            }
            if (translateFailed) {
                Text(
                    stringResource(R.string.native_changelog_translate_failed),
                    color = if (dark) Red300 else Red600,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))

        val shown = translated?.takeIf { it.isNotEmpty() && !showOriginal } ?: source
        Column(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 20.dp),
        ) {
            ChangelogDocument(shown, dark, borderColor)
        }

        if (!starDismissed) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
            StarFooter(dark) {
                container.tokenStore.starPromptDismissed = true
                starDismissed = true
            }
        }
    }
}

/** "Enjoying GlassKeep? Leave a ⭐ on GitHub · Already done". */
@Composable
private fun StarFooter(dark: Boolean, onDone: () -> Unit) {
    val color = if (dark) Gray500 else Gray400
    val intro = stringResource(R.string.native_changelog_star_us)
    val link = stringResource(R.string.native_changelog_star_us_link)
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = if (dark) 0.05f else 0.4f))
            .padding(horizontal = 20.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            buildAnnotatedString {
                append("$intro ")
                withLink(LinkAnnotation.Url(RepoUrl, TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline)))) {
                    append(link)
                }
            },
            color = color,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.weight(1f, fill = false),
        )
        Text("·", color = if (dark) Gray600 else Gray300, fontSize = 16.sp, lineHeight = 24.sp)
        Text(
            stringResource(R.string.native_changelog_star_us_done),
            color = color,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onDone,
            ),
        )
    }
}

/**
 * The Markdown as the web's `.gk-changelog` styles it: the release
 * headings (the second level in indigo over a rule, the third in small
 * capitals), paragraphs and lists at 1.55, quotes behind a bar, code
 * blocks in a grey box, inline code on its own rounded wash, and links
 * leaving the app. Between two blocks the larger of their two margins,
 * as CSS collapses them.
 */
@Composable
private fun ChangelogDocument(markdown: String, dark: Boolean, borderColor: Color) {
    val blocks = remember(markdown) { docBlocksOf(markdown) }
    val textColor = if (dark) Gray100 else Gray800
    var previousBottom: Dp? = null
    blocks.forEachIndexed { index, block ->
        val listItem = block.kind in ListKinds
        val previousIsList = blocks.getOrNull(index - 1)?.kind in ListKinds
        val nextIsList = blocks.getOrNull(index + 1)?.kind in ListKinds
        val (top, bottom) = when {
            listItem -> (if (previousIsList) 3.2.dp else 8.dp) to (if (nextIsList) 3.2.dp else 8.dp)
            else -> marginsOf(block.kind)
        }
        Spacer(Modifier.height(previousBottom?.let { maxOf(it, top) } ?: top))
        when (block.kind) {
            RichBlockKind.CODE_BLOCK -> Text(
                block.text,
                color = textColor,
                fontSize = 11.9.sp,
                lineHeight = 20.sp,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(if (dark) Color.White.copy(alpha = 0.04f) else Color.Black.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )
            RichBlockKind.DIVIDER -> Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
            RichBlockKind.QUOTE -> Row(Modifier.height(IntrinsicSize.Min).alpha(0.85f)) {
                Box(Modifier.width(3.dp).fillMaxHeight().background(borderColor))
                Spacer(Modifier.width(16.dp))
                DocText(block, BodyStyle, textColor, dark, Modifier.weight(1f))
            }
            RichBlockKind.HEADING_1 -> DocText(block, H1Style, textColor, dark)
            RichBlockKind.HEADING_2 -> Column {
                DocText(block, H2Style, if (dark) Indigo300 else Indigo600, dark)
                Spacer(Modifier.height(4.dp))
                Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
            }
            RichBlockKind.HEADING_3 -> DocText(block, H3Style, textColor, dark, Modifier.alpha(0.85f))
            RichBlockKind.HEADING_4, RichBlockKind.HEADING_5 -> DocText(block, PlainStyle, textColor, dark)
            RichBlockKind.BULLET_ITEM, RichBlockKind.TASK_ITEM, RichBlockKind.NUMBERED_ITEM -> {
                val start = (24 * (block.indent + 1)).dp
                Box(Modifier.fillMaxWidth()) {
                    if (block.kind == RichBlockKind.NUMBERED_ITEM) {
                        Text(
                            "${block.number}.",
                            color = textColor,
                            fontSize = 14.sp,
                            lineHeight = 21.7.sp,
                            modifier = Modifier.width(start - 6.dp),
                            textAlign = TextAlign.End,
                        )
                    } else {
                        // Chromium's outside disc for a 14px list item.
                        Box(
                            Modifier.drawBehind {
                                drawCircle(
                                    color = textColor,
                                    radius = (0.15625f * 14).dp.toPx(),
                                    center = Offset((start - (0.88f * 14).dp).toPx(), (21.7f / 2).dp.toPx()),
                                )
                            },
                        )
                    }
                    DocText(block, BodyStyle, textColor, dark, Modifier.padding(start = start))
                }
            }
            RichBlockKind.PARAGRAPH -> DocText(block, BodyStyle, textColor, dark)
        }
        previousBottom = bottom
    }
    Spacer(Modifier.height(previousBottom ?: 0.dp))
}

/** One block's text: its marks as spans, inline code padded by a
 *  placeholder on either side and painted on a rounded wash, links
 *  opening outside the app. */
@Composable
private fun DocText(block: DocBlock, style: DocStyle, color: Color, dark: Boolean, modifier: Modifier = Modifier) {
    val linkColor = if (dark) Indigo400 else Indigo600
    val doc = remember(block, style, linkColor) { docTextOf(block, style, linkColor) }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val codeWash = if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f)
    Text(
        doc.text,
        color = color,
        fontSize = style.size.sp,
        lineHeight = style.lineHeight.sp,
        fontWeight = style.weight,
        letterSpacing = style.letterSpacing.sp,
        inlineContent = remember(style) {
            mapOf(
                CodePadId to InlineTextContent(
                    Placeholder((CodePadX / style.size).em, 0.1.em, PlaceholderVerticalAlign.AboveBaseline),
                ) {},
            )
        },
        onTextLayout = { layout = it },
        modifier = modifier.drawBehind {
            val result = layout ?: return@drawBehind
            val em = (style.size * CodeScale).sp.toPx()
            val padY = CodePadY.dp.toPx()
            for (range in doc.codeRanges) {
                forEachLineSegment(result, range.first, range.last + 1) { left, right, baseline ->
                    drawRoundRect(
                        codeWash,
                        Offset(left, baseline - 0.93f * em - padY),
                        Size(right - left, 1.17f * em + 2 * padY),
                        CornerRadius(CodeRadius.dp.toPx()),
                    )
                }
            }
        },
    )
}

private class DocTextLayout(val text: AnnotatedString, val codeRanges: List<IntRange>)

private fun docTextOf(block: DocBlock, style: DocStyle, linkColor: Color): DocTextLayout {
    val source = if (style.uppercase) block.text.map { it.uppercaseChar() }.joinToString("") else block.text
    val length = source.length
    val codes = block.marks.filter { it.type == RichMarkType.CODE && it.start < it.end }
    val opens = IntArray(length + 1)
    val closes = IntArray(length + 1)
    codes.forEach {
        opens[it.start.coerceIn(0, length)]++
        closes[it.end.coerceIn(0, length)]++
    }
    val positions = IntArray(length + 1)
    val builder = AnnotatedString.Builder()
    for (i in 0..length) {
        repeat(closes[i]) { builder.appendInlineContent(CodePadId) }
        positions[i] = builder.length
        repeat(opens[i]) { builder.appendInlineContent(CodePadId) }
        if (i < length) builder.append(source[i])
    }
    for (mark in block.marks) {
        val start = positions[mark.start.coerceIn(0, length)]
        val end = positions[mark.end.coerceIn(0, length)]
        if (start >= end) continue
        when (mark.type) {
            RichMarkType.BOLD -> builder.addStyle(SpanStyle(fontWeight = FontWeight.SemiBold), start, end)
            RichMarkType.ITALIC -> builder.addStyle(SpanStyle(fontStyle = FontStyle.Italic), start, end)
            RichMarkType.STRIKE -> builder.addStyle(SpanStyle(textDecoration = TextDecoration.LineThrough), start, end)
            // The placeholders keep the surrounding size: only the code
            // itself shrinks to 0.85em.
            RichMarkType.CODE -> builder.addStyle(
                SpanStyle(fontFamily = FontFamily.Monospace, fontSize = (style.size * CodeScale).sp),
                start + 1,
                end - 1,
            )
            RichMarkType.LINK -> changelogHref(mark.value)?.let { href ->
                builder.addLink(
                    LinkAnnotation.Url(href, TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline))),
                    start,
                    end,
                )
            }
            else -> Unit
        }
    }
    return DocTextLayout(builder.toAnnotatedString(), codes.map { positions[it.start.coerceIn(0, length)] until positions[it.end.coerceIn(0, length)] })
}

/** A relative link points into the repository, as GitHub shows it; an
 *  anchor stays put. */
private fun changelogHref(href: String?): String? = when {
    href.isNullOrEmpty() || href.startsWith("#") -> null
    AbsoluteUrl.containsMatchIn(href) -> href
    else -> runCatching { URI(RepoBlobBase).resolve(href.removePrefix("./")).toString() }.getOrNull()
}

private data class DocBlock(
    val kind: RichBlockKind,
    val text: String,
    val marks: List<RichMark>,
    val indent: Int = 0,
    val number: Int = 0,
)

/** The Markdown's blocks as `marked` lays them out: a paragraph's lines
 *  run together, consecutive quoted lines are one quote, and an ordered
 *  list counts from one. */
private fun docBlocksOf(markdown: String): List<DocBlock> {
    val out = mutableListOf<DocBlock>()
    for (block in MarkdownDoc.toRichBlocks(markdown)) {
        val previous = out.lastOrNull()
        when (block.kind) {
            RichBlockKind.PARAGRAPH -> if (block.text.isNotEmpty()) {
                out.add(DocBlock(block.kind, block.text.replace('\n', ' '), block.marks))
            }
            RichBlockKind.QUOTE -> if (previous?.kind == RichBlockKind.QUOTE) {
                val offset = previous.text.length + 1
                out[out.lastIndex] = previous.copy(
                    text = previous.text + " " + block.text,
                    marks = previous.marks + block.marks.map { it.copy(start = it.start + offset, end = it.end + offset) },
                )
            } else {
                out.add(DocBlock(block.kind, block.text, block.marks))
            }
            RichBlockKind.NUMBERED_ITEM -> out.add(
                DocBlock(
                    block.kind,
                    block.text,
                    block.marks,
                    block.indent,
                    number = if (previous?.kind == RichBlockKind.NUMBERED_ITEM) previous.number + 1 else 1,
                ),
            )
            else -> out.add(DocBlock(block.kind, block.text, block.marks, block.indent))
        }
    }
    return out
}

/** A block's own top and bottom margins in the stylesheet. */
private fun marginsOf(kind: RichBlockKind): Pair<Dp, Dp> = when (kind) {
    RichBlockKind.HEADING_1 -> 0.dp to 16.dp
    RichBlockKind.HEADING_2 -> 24.dp to 8.dp
    RichBlockKind.HEADING_3 -> 16.dp to 4.dp
    RichBlockKind.DIVIDER -> 16.dp to 16.dp
    RichBlockKind.HEADING_4, RichBlockKind.HEADING_5 -> 0.dp to 0.dp
    else -> 8.dp to 8.dp
}

/** Only the server's own AI or a custom endpoint with a model can
 *  translate (fetchAiAvailable, ChangelogModal.jsx). */
private fun UserAiSettingsDto.translatesChangelog(): Boolean = enabled && adminAiEnabled && when (mode) {
    "server" -> serverAiAvailable
    "custom" -> baseUrl.isNotEmpty() && model.isNotEmpty()
    else -> false
}

private class DocStyle(
    val size: Float,
    val lineHeight: Float,
    val weight: FontWeight = FontWeight.Normal,
    val letterSpacing: Float = 0f,
    val uppercase: Boolean = false,
)

// `.gk-changelog` is text-sm, whose 1.4286 line height the headings and
// code blocks inherit; paragraphs and list items set 1.55.
private val BodyStyle = DocStyle(14f, 21.7f)
private val PlainStyle = DocStyle(14f, 20f)
private val H1Style = DocStyle(24f, 34.2857f, FontWeight.SemiBold)
private val H2Style = DocStyle(18.4f, 26.2857f, FontWeight.SemiBold)
private val H3Style = DocStyle(15.2f, 21.7143f, FontWeight.SemiBold, letterSpacing = 0.76f, uppercase = true)

private val ListKinds = setOf(RichBlockKind.BULLET_ITEM, RichBlockKind.TASK_ITEM, RichBlockKind.NUMBERED_ITEM)

private const val ChangelogAsset = "CHANGELOG.md"
private const val RepoUrl = "https://github.com/Victor-root/glasskeep-enhanced"
private const val RepoBlobBase = "https://github.com/Victor-root/glasskeep-enhanced/blob/main/"
private val AbsoluteUrl = Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE)

private const val CodePadId = "codePad"

/** Inline code: 0.85em, padded 0.1rem by 0.35rem, 0.3rem corners. */
private const val CodeScale = 0.85f
private const val CodePadX = 5.6f
private const val CodePadY = 1.6f
private const val CodeRadius = 4.8f

// The stylesheet's own rgb() values, Tailwind v3's indigos.
private val Indigo300 = Color(0xFFA5B4FC)
private val Indigo400 = Color(0xFF818CF8)
private val Indigo600 = Color(0xFF4F46E5)
private val DarkCard = Color(0xFF1A1A1F)
private val Gray50 = Color(0xFFF9FAFB)
private val Gray100 = Color(0xFFF3F4F6)
private val Gray200 = Color(0xFFE5E7EB)
private val Gray300 = Color(0xFFD1D5DC)
private val Gray400 = Color(0xFF99A1AF)
private val Gray500 = Color(0xFF6A7282)
private val Gray600 = Color(0xFF4A5565)
private val Gray700 = Color(0xFF364153)
private val Gray800 = Color(0xFF1E2939)
private val Gray900 = Color(0xFF101828)
private val Emerald300 = Color(0xFF5EE9B5)
private val Emerald500 = Color(0xFF00BC7D)
private val Emerald600 = Color(0xFF009966)
private val Emerald700 = Color(0xFF007A55)
private val Red300 = Color(0xFFFFA2A2)
private val Red600 = Color(0xFFE7000B)
