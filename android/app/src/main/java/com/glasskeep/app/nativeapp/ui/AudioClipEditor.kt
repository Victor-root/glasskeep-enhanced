package com.glasskeep.app.nativeapp.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AudioDownloadFormat
import com.glasskeep.app.nativeapp.AudioPlayerController
import com.glasskeep.app.nativeapp.AudioRecorderController
import com.glasskeep.app.nativeapp.AudioRecordingOutcome
import com.glasskeep.app.nativeapp.AudioRecordingResult
import com.glasskeep.app.nativeapp.NoteExporter
import com.glasskeep.app.nativeapp.data.AudioClipDto
import com.glasskeep.app.nativeapp.data.AudioContent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sqrt

/** AUDIO_MAX_TOTAL_BYTES (audioNote.js:38): 100 MiB of clips per note. */
private const val MaxAudioBytes = 100L * 1024L * 1024L

private val PopoverTextLight = Color(0xFF1E2939)
private val PopoverTextDark = Color(0xFFF3F4F6)
private val PopoverBgDark = Color(0xFF222222)

/**
 * An audio note's body, AudioNoteEditor.jsx natively: the recorder panel
 * while recording, the empty state before the first clip, else the hero
 * player for the current clip over the list of every clip, which scrolls
 * inside its own box. Owns the recorder and the player; the caller only
 * sees the stored clips and how they change. A [readOnly] note plays and
 * downloads, nothing more.
 *
 * Playing a clip recorded by the web (often WebM/Opus) depends on the
 * device's decoders (see AudioPlayerController): a clip that cannot play
 * says so under the list, a message the web never needs.
 */
@Composable
fun AudioClipsSection(
    clips: List<AudioClipDto>,
    noteTitle: String,
    accent: Color,
    themeId: String?,
    dark: Boolean,
    textColor: Color,
    borderColor: Color,
    readOnly: Boolean,
    onClipAdded: (AudioClipDto) -> Unit,
    onClipRemoved: (id: String) -> Unit,
    onClipRenamed: (id: String, newName: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val playback = remember { ClipPlayback(scope) }
    DisposableEffect(Unit) { onDispose { playback.stop() } }

    var recording by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf(false) }
    var currentIndex by remember { mutableIntStateOf(0) }
    LaunchedEffect(clips.size) {
        if (currentIndex >= clips.size) currentIndex = (clips.size - 1).coerceAtLeast(0)
    }
    val index = currentIndex.coerceAtMost(clips.lastIndex).coerceAtLeast(0)
    val current = clips.getOrNull(index)
    LaunchedEffect(current?.key) { playback.follow(current?.key) }
    LaunchedEffect(playback.playing) {
        if (playback.playing) playback.trackPosition()
    }
    val existingBytes = totalClipBytes(clips)

    fun startRecording() {
        if (readOnly) return
        playback.stop()
        saveError = false
        recording = true
    }

    when {
        recording -> AudioRecorderPanel(
            existingBytes = existingBytes,
            accent = accent,
            dark = dark,
            textColor = textColor,
            borderColor = borderColor,
            onSave = { result ->
                val clip = AudioContent.newClip(result.dataUrl, result.mimeType, result.durationSeconds, result.sizeBytes)
                // Checked once the recording is over, on the projected
                // total: the clip is refused, never truncated.
                if (existingBytes + clipBytes(clip) > MaxAudioBytes) {
                    saveError = true
                    false
                } else {
                    onClipAdded(clip)
                    currentIndex = clips.size
                    recording = false
                    saveError = false
                    true
                }
            },
            onCancel = { recording = false },
            modifier = modifier,
        )
        current == null -> AudioEmptyState(
            accent = accent,
            themeId = themeId,
            dark = dark,
            readOnly = readOnly,
            onStart = { startRecording() },
            modifier = modifier,
        )
        else -> {
            val focusManager = LocalFocusManager.current
            val body = remember { CoordinatesHolder() }
            val nameField = remember { CoordinatesHolder() }
            Column(
                modifier = modifier
                    .fillMaxWidth()
                    .onGloballyPositioned { body.value = it }
                    // A touch anywhere but on a name being edited ends the
                    // edit, as the input's blur does on the web.
                    .pointerInput(Unit) {
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                            val area = body.value ?: return@awaitEachGesture
                            val field = nameField.value?.takeIf { it.isAttached } ?: return@awaitEachGesture
                            if (!area.localBoundingBoxOf(field).contains(down.position)) focusManager.clearFocus()
                        }
                    },
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AudioHeroPlayer(
                    clip = current,
                    index = index,
                    total = clips.size,
                    downloadName = current.name.trim().ifEmpty { noteTitle },
                    playback = playback,
                    accent = accent,
                    themeId = themeId,
                    dark = dark,
                    textColor = textColor,
                    borderColor = borderColor,
                    readOnly = readOnly,
                    onPrevious = { if (index > 0) currentIndex = index - 1 },
                    onNext = { if (index < clips.lastIndex) currentIndex = index + 1 },
                    onAddRecording = { startRecording() },
                )
                AudioClipList(
                    clips = clips,
                    currentIndex = index,
                    playing = playback.owns(current) && playback.playing,
                    accent = accent,
                    dark = dark,
                    textColor = textColor,
                    readOnly = readOnly,
                    nameField = nameField,
                    onPlay = { i ->
                        currentIndex = i
                        playback.toggle(clips[i])
                    },
                    onRename = { i, name -> if (!readOnly) onClipRenamed(clips[i].id, name) },
                    onDelete = { i ->
                        if (!readOnly) {
                            // The current clip stays itself, or its nearest
                            // neighbour when it is the one going away.
                            val remaining = clips.size - 1
                            currentIndex = when {
                                remaining == 0 -> 0
                                i < index -> (index - 1).coerceAtLeast(0)
                                else -> index.coerceAtMost(remaining - 1)
                            }
                            onClipRemoved(clips[i].id)
                        }
                    },
                    modifier = Modifier.weight(1f),
                )
                if (saveError) {
                    AudioAlert(stringResource(R.string.native_audio_too_large), dark, Modifier.fillMaxWidth())
                }
                if (playback.failed) {
                    AudioAlert(stringResource(R.string.native_audio_playback_error), dark, Modifier.fillMaxWidth())
                }
            }
        }
    }
}

/** A clip's own byte size, or the web's estimate from its base64 length
 *  when it never carried one (audioNote.js:122-135). */
private fun clipBytes(clip: AudioClipDto): Long =
    clip.size ?: ((clip.audioDataUrl.length - clip.audioDataUrl.indexOf(',') - 1) * 0.75).toLong()

/** totalClipsBytes (audioNote.js:122-135): what the storage gauge shows. */
internal fun totalClipBytes(clips: List<AudioClipDto>): Long = clips.sumOf { clipBytes(it) }

internal fun formatDuration(seconds: Float): String {
    val total = seconds.toInt().coerceAtLeast(0)
    return "%d:%02d".format(total / 60, total % 60)
}

/** The red `role="alert"` box (AudioNoteEditor.jsx:201, 368): text-sm on
 *  red-100, red-900 at 40% in dark mode. */
@Composable
private fun AudioAlert(message: String, dark: Boolean, modifier: Modifier = Modifier, textAlign: TextAlign? = null) {
    Text(
        message,
        color = if (dark) Color(0xFFFFC9C9) else Color(0xFF9F0712),
        fontSize = 14.sp,
        lineHeight = 20.sp,
        textAlign = textAlign,
        modifier = modifier
            .background(if (dark) Color(0x6682181A) else Color(0xFFFFE2E2), RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}

/** Tailwind's `active:scale-*`: [pressedScale] while [interaction] is
 *  pressed, eased like its `transition`. */
@Composable
private fun pressScale(interaction: InteractionSource, pressedScale: Float): State<Float> {
    val pressed by interaction.collectIsPressedAsState()
    return animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = tween(durationMillis = 150, easing = GkStandardEasing),
        label = "pressScale",
    )
}

/** EmptyState (AudioNoteEditor.jsx:209-234), centred in the note. */
@Composable
private fun AudioEmptyState(
    accent: Color,
    themeId: String?,
    dark: Boolean,
    readOnly: Boolean,
    onStart: () -> Unit,
    modifier: Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        Box(
            modifier = Modifier.size(80.dp).tailwindShadowLg(CircleShape).background(accent, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            MicrophoneFilledIcon(size = 36.dp, tint = Color.White)
        }
        Text(
            stringResource(R.string.native_audio_empty_hint),
            color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565),
            fontSize = 14.sp,
            lineHeight = 20.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 320.dp),
        )
        GkGradientButton(
            label = stringResource(R.string.native_audio_start_recording),
            themeId = themeId,
            enabled = !readOnly,
            horizontalPadding = 20.dp,
            verticalPadding = 10.dp,
            shape = CircleShape,
            leading = { MicIcon(size = 20.dp, tint = Color.White) },
            onClick = onStart,
        )
    }
}

private enum class RecorderState { REQUESTING, RECORDING, PAUSED, STOPPING, READY, ERROR }

/**
 * RecorderPanel (AudioNoteEditor.jsx:236-422): starts recording as it
 * opens, asking for the microphone first when needed. The disc, timer and
 * status follow the recorder's state, the live storage bar counts what is
 * being recorded, and a failure keeps the panel up with its message and a
 * way to try again. [onSave] refuses a recording that does not fit.
 */
@Composable
private fun AudioRecorderPanel(
    existingBytes: Long,
    accent: Color,
    dark: Boolean,
    textColor: Color,
    borderColor: Color,
    onSave: (AudioRecordingResult) -> Boolean,
    onCancel: () -> Unit,
    modifier: Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorder = remember { AudioRecorderController(context) }
    DisposableEffect(Unit) { onDispose { recorder.close() } }
    val save by rememberUpdatedState(onSave)

    var state by remember { mutableStateOf(RecorderState.REQUESTING) }
    var error by remember { mutableStateOf<Int?>(null) }
    var saving by remember { mutableStateOf(false) }
    var elapsedSeconds by remember { mutableIntStateOf(0) }
    var liveBytes by remember { mutableLongStateOf(0L) }

    fun fail(@StringRes message: Int) {
        error = message
        state = RecorderState.ERROR
    }

    fun begin() {
        scope.launch {
            if (withContext(Dispatchers.IO) { recorder.start() }) {
                state = RecorderState.RECORDING
            } else {
                fail(R.string.native_audio_record_failed)
            }
        }
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) begin() else fail(R.string.native_audio_permission_denied)
    }

    fun start() {
        error = null
        elapsedSeconds = 0
        liveBytes = 0L
        state = RecorderState.REQUESTING
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) begin() else permission.launch(Manifest.permission.RECORD_AUDIO)
    }

    fun stop() {
        state = RecorderState.STOPPING
        scope.launch {
            when (val outcome = withContext(Dispatchers.IO) { recorder.stopAndFinish() }) {
                is AudioRecordingOutcome.Recorded -> {
                    state = RecorderState.READY
                    saving = true
                    if (!save(outcome.result)) {
                        error = R.string.native_audio_record_failed
                        saving = false
                    }
                }
                AudioRecordingOutcome.Empty -> fail(R.string.native_audio_record_empty)
                AudioRecordingOutcome.Failed -> fail(R.string.native_audio_record_failed)
            }
        }
    }

    LaunchedEffect(Unit) { start() }
    // The timer and the live gauge tick while recording; paused time is
    // left out, as in useAudioRecorder.js.
    LaunchedEffect(state) {
        while (state == RecorderState.RECORDING) {
            delay(250)
            elapsedSeconds = (recorder.elapsedMs() / 1000).toInt()
            liveBytes = recorder.currentBytes()
        }
    }

    val isRecording = state == RecorderState.RECORDING
    val isPaused = state == RecorderState.PAUSED
    val isError = state == RecorderState.ERROR
    val finalizing = state == RecorderState.STOPPING || state == RecorderState.READY || saving
    val discColor by animateColorAsState(
        targetValue = when {
            isRecording -> Color(0xFFFF2056)
            isPaused -> Color(0xFFFE9A00)
            isError -> if (dark) Color(0xFF4A5565) else Color(0xFF99A1AF)
            finalizing -> accent
            else -> Color(0xCCFF637E)
        },
        animationSpec = tween(durationMillis = 150, easing = GkStandardEasing),
        label = "recorderDisc",
    )
    val pulse = if (isRecording) rememberPulseAlpha() else null
    val discLabel = stringResource(if (isRecording) R.string.native_audio_state_recording else R.string.native_audio_recording_label)
    val status = when {
        isRecording -> stringResource(R.string.native_audio_state_recording)
        isPaused -> stringResource(R.string.native_audio_state_paused)
        finalizing -> stringResource(R.string.native_audio_state_saving)
        else -> ""
    }
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        Box(
            modifier = Modifier
                .graphicsLayer { alpha = pulse?.value ?: 1f }
                .size(80.dp)
                .tailwindShadowLg(CircleShape)
                .background(discColor, CircleShape)
                .semantics { contentDescription = discLabel },
            contentAlignment = Alignment.Center,
        ) {
            MicrophoneFilledIcon(size = 36.dp, tint = Color.White)
        }
        Text(
            formatDuration(elapsedSeconds.toFloat()),
            color = textColor,
            fontSize = 30.sp,
            lineHeight = 36.sp,
            fontWeight = FontWeight.SemiBold,
            style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
        )
        if (status.isEmpty()) {
            // min-h-[1em]: the empty status line still holds 12px.
            Spacer(Modifier.height(12.dp))
        } else {
            Text(status, color = if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565), fontSize = 12.sp, lineHeight = 16.sp)
        }
        AudioStorageGauge(
            usedBytes = existingBytes + liveBytes,
            dark = dark,
            borderColor = borderColor,
            bar = true,
            live = isRecording,
            modifier = Modifier.widthIn(max = 384.dp).fillMaxWidth().padding(horizontal = 8.dp),
        )
        error?.let { message ->
            AudioAlert(stringResource(message), dark, Modifier.widthIn(max = 384.dp), TextAlign.Center)
        }
        FlexShrinkRow(gap = 8.dp) {
            AudioPillButton(
                label = stringResource(R.string.native_note_detail_trash_confirm_cancel),
                textColor = textColor,
                borderColor = borderColor,
                enabled = !saving,
                onClick = onCancel,
            )
            if (isRecording) {
                AudioPillButton(
                    label = stringResource(R.string.native_audio_pause),
                    textColor = Color.White,
                    background = Color(0xFFFE9A00),
                    onClick = { if (recorder.pause()) state = RecorderState.PAUSED },
                )
            }
            if (isPaused) {
                AudioPillButton(
                    label = stringResource(R.string.native_audio_resume),
                    textColor = Color.White,
                    background = Color(0xFFFE9A00),
                    onClick = { if (recorder.resume()) state = RecorderState.RECORDING },
                )
            }
            if (isRecording || isPaused) {
                AudioPillButton(
                    label = stringResource(R.string.native_audio_stop),
                    textColor = Color.White,
                    background = Color(0xFFEC003F),
                    enabled = !saving,
                    onClick = { stop() },
                )
            }
            if (isError) {
                AudioPillButton(
                    label = stringResource(R.string.native_audio_start_recording),
                    textColor = Color.White,
                    background = Color(0xFFEC003F),
                    onClick = { start() },
                )
            }
        }
    }
}

/** The recorder's `px-4 py-2 rounded-full text-sm` buttons: a filled one
 *  eases to 98% while pressed, the bordered one does not; a label that
 *  does not fit wraps, centred, as a button's text does. */
@Composable
private fun AudioPillButton(
    label: String,
    textColor: Color,
    onClick: () -> Unit,
    background: Color? = null,
    borderColor: Color? = null,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val scale by pressScale(interaction, if (background != null) 0.98f else 1f)
    Box(
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .alpha(if (enabled) 1f else 0.5f)
            .then(if (background != null) Modifier.background(background, CircleShape) else Modifier)
            .then(if (borderColor != null) Modifier.border(1.dp, borderColor, CircleShape) else Modifier)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            // The border sits outside the padding, as in CSS.
            .padding(horizontal = if (borderColor != null) 17.dp else 16.dp, vertical = if (borderColor != null) 9.dp else 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = textColor, fontSize = 14.sp, lineHeight = 20.sp, textAlign = TextAlign.Center)
    }
}

/**
 * A `flex` row [gap] apart whose items shrink the CSS way: each starts at
 * its widest (one line), and when the row runs out of room they give it
 * back in proportion to that width, none below its longest word, wrapping
 * instead. Items are centred on the row's height.
 */
@Composable
private fun FlexShrinkRow(gap: Dp, content: @Composable () -> Unit) {
    Layout(content) { measurables, constraints ->
        val gapPx = gap.roundToPx()
        val room = (constraints.maxWidth - gapPx * (measurables.size - 1).coerceAtLeast(0)).toFloat()
        val bases = measurables.map { it.maxIntrinsicWidth(constraints.maxHeight).toFloat() }
        val floors = measurables.map { it.minIntrinsicWidth(constraints.maxHeight).toFloat() }
        val widths = shrinkToFit(bases, floors, room)
        val placeables = measurables.mapIndexed { i, measurable ->
            measurable.measure(Constraints.fixedWidth(ceil(widths[i]).toInt()))
        }
        val width = placeables.sumOf { it.width } + gapPx * (placeables.size - 1).coerceAtLeast(0)
        val height = placeables.maxOfOrNull { it.height } ?: 0
        layout(width.coerceIn(constraints.minWidth, constraints.maxWidth), height.coerceIn(constraints.minHeight, constraints.maxHeight)) {
            var x = 0
            placeables.forEach { placeable ->
                placeable.place(x, (height - placeable.height) / 2)
                x += placeable.width + gapPx
            }
        }
    }
}

/** CSS's flexible length resolution for shrinking with `min-width: auto`:
 *  items that would drop under their floor are frozen there and the rest
 *  of the overflow is shared out again among the others. */
private fun shrinkToFit(bases: List<Float>, floors: List<Float>, room: Float): List<Float> {
    val sizes = bases.toMutableList()
    val frozen = BooleanArray(bases.size) { bases[it] <= floors[it] }
    while (true) {
        val open = bases.indices.filter { !frozen[it] }
        if (open.isEmpty()) break
        val overflow = bases.indices.sumOf { (if (frozen[it]) sizes[it] else bases[it]).toDouble() }.toFloat() - room
        if (overflow <= 0f) {
            open.forEach { sizes[it] = bases[it] }
            break
        }
        val weight = open.sumOf { bases[it].toDouble() }.toFloat()
        var clamped = false
        open.forEach { i ->
            val target = bases[i] - overflow * bases[i] / weight
            if (target < floors[i]) {
                sizes[i] = floors[i]
                frozen[i] = true
                clamped = true
            } else {
                sizes[i] = target
            }
        }
        if (!clamped) break
    }
    return sizes
}

/** Which clip a playback belongs to: the web starts its player over when
 *  a clip's audio changes, not when it is renamed. */
private data class ClipKey(val id: String, val audioDataUrl: String)

private val AudioClipDto.key: ClipKey get() = ClipKey(id, audioDataUrl)

/**
 * The hero's `<audio>` element (AudioPlayer.jsx): one clip at a time, its
 * position kept while paused and seekable before it ever played, back at
 * 0 when it ends or when another clip takes its place.
 */
@Stable
private class ClipPlayback(private val scope: CoroutineScope) {
    private val player = AudioPlayerController()
    private var loading: Job? = null
    private var clip by mutableStateOf<ClipKey?>(null)

    var playing by mutableStateOf(false)
        private set
    var positionMs by mutableIntStateOf(0)
        private set

    /** The player's own duration for the clip, once it has loaded it. */
    var loadedDurationMs by mutableIntStateOf(0)
        private set
    var failed by mutableStateOf(false)
        private set

    fun owns(target: AudioClipDto): Boolean = clip == target.key

    /** Starts over when [key] is not the clip this playback holds. */
    fun follow(key: ClipKey?) {
        if (clip == key) return
        stop()
        failed = false
        clip = key
    }

    fun toggle(target: AudioClipDto) {
        follow(target.key)
        when {
            playing -> pause()
            player.isReady -> {
                player.resume()
                playing = true
            }
            else -> start(target)
        }
    }

    fun seek(target: AudioClipDto, ratio: Float, durationMs: Int) {
        follow(target.key)
        if (durationMs <= 0) return
        positionMs = (ratio.coerceIn(0f, 1f) * durationMs).toInt()
        if (player.isReady) player.seekTo(positionMs)
    }

    /** MediaPlayer has no push API for its position: it is polled while
     *  playing. */
    suspend fun trackPosition() {
        while (true) {
            delay(150)
            if (player.isPlaying()) positionMs = player.currentPositionMs()
        }
    }

    fun stop() {
        loading?.cancel()
        loading = null
        player.stop()
        playing = false
        positionMs = 0
        loadedDurationMs = 0
    }

    private fun pause() {
        loading?.cancel()
        loading = null
        if (player.isReady) {
            player.pause()
            positionMs = player.currentPositionMs()
        } else {
            player.stop()
        }
        playing = false
    }

    private fun start(target: AudioClipDto) {
        failed = false
        playing = true
        loading = scope.launch {
            player.load(
                target.audioDataUrl,
                onReady = {
                    loadedDurationMs = player.durationMs().coerceAtLeast(0)
                    player.seekTo(positionMs)
                    player.resume()
                },
                onError = {
                    playing = false
                    failed = true
                },
                onCompletion = {
                    player.stop()
                    playing = false
                    positionMs = 0
                },
            )
        }
    }
}

/**
 * The hero player (AudioPlayer.jsx:275-396): a translucent card lit by two
 * blurred accent discs, the clip's tile, name and counter, the transport,
 * the seek track with its times, then the download menu and the button
 * that records another clip.
 */
@Composable
private fun AudioHeroPlayer(
    clip: AudioClipDto,
    index: Int,
    total: Int,
    downloadName: String,
    playback: ClipPlayback,
    accent: Color,
    themeId: String?,
    dark: Boolean,
    textColor: Color,
    borderColor: Color,
    readOnly: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onAddRecording: () -> Unit,
) {
    val owned = playback.owns(clip)
    val playing = owned && playback.playing
    val durationMs = if (owned && playback.loadedDurationMs > 0) {
        playback.loadedDurationMs
    } else {
        ((clip.duration ?: 0f) * 1000).toInt()
    }
    var scrubRatio by remember(clip.key) { mutableStateOf<Float?>(null) }
    val positionMs = if (owned) playback.positionMs else 0
    val ratio = scrubRatio ?: if (durationMs > 0) positionMs.toFloat() / durationMs else 0f
    val shownMs = scrubRatio?.let { (it.coerceIn(0f, 1f) * durationMs).toInt() } ?: positionMs
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .tailwindShadowMd(shape)
            .clip(shape)
            .background(if (dark) Color.Black.copy(alpha = 0.35f) else Color.White.copy(alpha = 0.55f))
            .drawBehind {
                drawBlurredDisc(accent.copy(alpha = 0.4f), Offset(size.width - 32.dp.toPx(), 32.dp.toPx()), 72.dp.toPx())
                drawBlurredDisc(accent.copy(alpha = 0.3f), Offset(48.dp.toPx(), size.height - 48.dp.toPx()), 88.dp.toPx())
            }
            .border(1.dp, if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.15f), shape)
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .tailwindShadowLg(RoundedCornerShape(16.dp))
                    .background(accent, RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center,
            ) {
                MicrophoneFilledIcon(size = 28.dp, tint = Color.White)
            }
            Text(
                clip.name.trim().ifEmpty { stringResource(R.string.native_audio_clip_default_name, index + 1) },
                color = textColor,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            )
            if (total > 1) {
                Text(
                    stringResource(R.string.native_audio_clip_position, index + 1, total).uppercase(),
                    color = textColor.copy(alpha = 0.7f),
                    fontSize = 11.sp,
                    lineHeight = 16.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.55.sp,
                )
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (total > 1) {
                AudioNavButton(stringResource(R.string.native_audio_previous), index > 0, accent, dark, onPrevious) { tint ->
                    ChevronLeftIcon(size = 20.dp, tint = tint, strokeWidth = 2.4f)
                }
            }
            val playInteraction = remember { MutableInteractionSource() }
            val playScale by pressScale(playInteraction, 0.95f)
            val playLabel = stringResource(if (playing) R.string.native_audio_pause_playback else R.string.native_audio_play)
            Box(
                modifier = Modifier
                    .graphicsLayer {
                        scaleX = playScale
                        scaleY = playScale
                    }
                    .size(64.dp)
                    .tailwindShadowXl(CircleShape)
                    .background(accent, CircleShape)
                    .semantics { contentDescription = playLabel }
                    .clickable(
                        interactionSource = playInteraction,
                        indication = null,
                        role = Role.Button,
                    ) { playback.toggle(clip) },
                contentAlignment = Alignment.Center,
            ) {
                if (playing) {
                    PauseFilledIcon(size = 28.dp, tint = Color.White)
                } else {
                    PlayFilledIcon(size = 28.dp, tint = Color.White)
                }
            }
            if (total > 1) {
                AudioNavButton(stringResource(R.string.native_audio_next), index < total - 1, accent, dark, onNext) { tint ->
                    ChevronRightIcon(size = 20.dp, tint = tint, strokeWidth = 2.4f)
                }
            }
        }
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            AudioProgressTrack(
                ratio = ratio,
                accent = accent,
                dark = dark,
                onScrub = { scrubRatio = it },
                onSeek = { playback.seek(clip, it, durationMs) },
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                val timeStyle = LocalTextStyle.current.copy(fontFeatureSettings = "tnum")
                Text(
                    formatDuration(shownMs / 1000f),
                    color = textColor.copy(alpha = 0.9f),
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Medium,
                    style = timeStyle,
                )
                Text(
                    formatDuration(durationMs / 1000f),
                    color = textColor.copy(alpha = 0.9f),
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Medium,
                    style = timeStyle,
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AudioDownloadMenu(clip, downloadName, themeId, dark, borderColor)
            if (!readOnly) AudioAddRecordingButton(accent, dark, onAddRecording)
        }
    }
}

/** The card's `blur-3xl` accent discs, drawn as the Gaussian a disc blurred
 *  that much all but is: the blur's spread and the disc's own combined,
 *  the same total light. [color] carries the disc's opacity. */
private fun DrawScope.drawBlurredDisc(color: Color, center: Offset, radius: Float) {
    val blur = 64.dp.toPx()
    val spread = sqrt(blur * blur + radius * radius / 4f)
    val peak = radius * radius / (2f * spread * spread)
    val reach = 3f * spread
    val stops = Array(GlowSteps + 1) { step ->
        val fraction = step.toFloat() / GlowSteps
        val distance = fraction * reach
        fraction to color.copy(alpha = color.alpha * peak * exp(-distance * distance / (2f * spread * spread)))
    }
    drawCircle(Brush.radialGradient(*stops, center = center, radius = reach), radius = reach, center = center)
}

private const val GlowSteps = 12

/** NavButton (AudioPlayer.jsx:434-450): a 40px accent chevron, faded when
 *  there is no clip that way. */
@Composable
private fun AudioNavButton(
    label: String,
    enabled: Boolean,
    accent: Color,
    dark: Boolean,
    onClick: () -> Unit,
    glyph: @Composable (Color) -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val scale by pressScale(interaction, 0.95f)
    Box(
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (enabled) 1f else 0.3f
            }
            .size(40.dp)
            .tailwindShadowSm(CircleShape)
            .background(if (dark) Color.White.copy(alpha = 0.15f) else Color.White.copy(alpha = 0.8f), CircleShape)
            .border(1.dp, if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.1f), CircleShape)
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        glyph(accent)
    }
}

/**
 * ProgressTrack (AudioPlayer.jsx:398-432): an 8px track whose white thumb,
 * ringed in the accent, sits 2px above its middle. Touching it moves the
 * thumb there and dragging follows the finger ([onScrub]); letting go
 * seeks ([onSeek]), a plain tap included.
 */
@Composable
private fun AudioProgressTrack(
    ratio: Float,
    accent: Color,
    dark: Boolean,
    onScrub: (Float?) -> Unit,
    onSeek: (Float) -> Unit,
) {
    val label = stringResource(R.string.native_audio_progress)
    val scrub by rememberUpdatedState(onScrub)
    val seek by rememberUpdatedState(onSeek)
    val shown = ratio.coerceIn(0f, 1f)
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
            .semantics {
                contentDescription = label
                progressBarRangeInfo = ProgressBarRangeInfo(shown, 0f..1f)
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    down.consume()
                    scrub(down.position.x / size.width)
                    var last = down.position.x
                    while (true) {
                        val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                        change.consume()
                        last = change.position.x
                        if (!change.pressed) break
                        scrub(last / size.width)
                    }
                    seek(last / size.width)
                    scrub(null)
                }
            }
            .background(if (dark) Color.White.copy(alpha = 0.2f) else Color.Black.copy(alpha = 0.2f), CircleShape),
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(shown)
                .background(accent, CircleShape),
        )
        Box(
            Modifier
                .offset(x = maxWidth * shown - 8.dp, y = (-6).dp)
                .size(16.dp)
                .dropShadow(CircleShape, Shadow(radius = 3.dp, color = Color.Black.copy(alpha = 0.3f), offset = DpOffset(0.dp, 1.dp)))
                .drawBehind { drawCircle(accent, radius = size.minDimension / 2f + 2.dp.toPx()) }
                .background(Color.White, CircleShape),
        )
    }
}

/**
 * DownloadMenu (AudioPlayer.jsx:473-603): the gradient pill opens the
 * three formats under it. A conversion reads "Conversion…" on the pill
 * and, should it fail, hands over the original file instead and says so
 * the next time the menu opens. Files go to the share sheet.
 */
@Composable
private fun AudioDownloadMenu(
    clip: AudioClipDto,
    name: String,
    themeId: String?,
    dark: Boolean,
    borderColor: Color,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<Int?>(null) }
    val turn by animateFloatAsState(
        targetValue = if (open) 180f else 0f,
        animationSpec = tween(durationMillis = 150, easing = GkStandardEasing),
        label = "downloadChevron",
    )
    val baseName = name.trim().ifEmpty { stringResource(R.string.native_audio_filename_default) }

    fun download(format: AudioDownloadFormat) {
        open = false
        error = null
        busy = format != AudioDownloadFormat.ORIGINAL
        scope.launch {
            val shared = withContext(Dispatchers.IO) { NoteExporter.exportAudio(context, clip, baseName, format) }
            if (!shared) {
                if (format == AudioDownloadFormat.ORIGINAL) {
                    error = R.string.native_audio_record_failed
                } else {
                    error = R.string.native_audio_download_conversion_failed
                    withContext(Dispatchers.IO) {
                        NoteExporter.exportAudio(context, clip, baseName, AudioDownloadFormat.ORIGINAL)
                    }
                }
            }
            busy = false
        }
    }

    Box {
        GkGradientButton(
            label = stringResource(if (busy) R.string.native_audio_download_converting else R.string.native_audio_download),
            themeId = themeId,
            enabled = !busy,
            shape = CircleShape,
            leading = { DownloadIcon(size = 20.dp, tint = Color.White) },
            trailing = {
                ChevronDownIcon(
                    modifier = Modifier.rotate(turn),
                    size = 12.dp,
                    tint = Color.White.copy(alpha = 0.9f),
                    strokeWidth = 2.5f,
                )
            },
            onClick = { open = !open },
        )
        if (open) {
            val text = if (dark) PopoverTextDark else PopoverTextLight
            FooterPopover(
                gap = 8.dp,
                background = if (dark) PopoverBgDark else Color.White,
                borderColor = borderColor,
                onDismiss = { open = false },
                minWidth = 200.dp,
                cornerRadius = 8.dp,
                below = true,
                flip = true,
            ) {
                AudioDownloadRow(
                    stringResource(R.string.native_audio_download_original),
                    NoteExporter.audioExtension(clip.mimeType),
                    text,
                ) { download(AudioDownloadFormat.ORIGINAL) }
                AudioDownloadRow(stringResource(R.string.native_audio_download_mp3), "mp3", text) {
                    download(AudioDownloadFormat.MP3)
                }
                AudioDownloadRow(stringResource(R.string.native_audio_download_wav), "wav", text) {
                    download(AudioDownloadFormat.WAV)
                }
                error?.let { message ->
                    Text(
                        stringResource(message),
                        color = if (dark) Color(0xFFFFA2A2) else Color(0xFFC10007),
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .topHairline(borderColor)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
        }
    }
}

/** One format of the download menu: its title over the file extension. */
@Composable
private fun AudioDownloadRow(title: String, extension: String, textColor: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DownloadIcon(size = 20.dp, tint = textColor)
        Column(Modifier.weight(1f)) {
            Text(title, color = textColor, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
            // 11px under the row's text-sm, which keeps its 20/14 line ratio.
            Text(".$extension".uppercase(), color = textColor.copy(alpha = 0.7f), fontSize = 11.sp, lineHeight = 15.7.sp)
        }
    }
}

/** The hero's add-recording button (AudioPlayer.jsx:366-390): the mic with
 *  a "+" badge that pokes out of the circle. */
@Composable
private fun AudioAddRecordingButton(accent: Color, dark: Boolean, onClick: () -> Unit) {
    val label = stringResource(R.string.native_audio_add_recording)
    val interaction = remember { MutableInteractionSource() }
    val scale by pressScale(interaction, 0.98f)
    Box(
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .size(40.dp)
            .tailwindShadowSm(CircleShape)
            .background(if (dark) Color.White.copy(alpha = 0.1f) else Color.White.copy(alpha = 0.7f), CircleShape)
            .border(1.dp, if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.1f), CircleShape)
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Box {
            MicIcon(size = 20.dp, tint = accent)
            Canvas(Modifier.align(Alignment.TopEnd).offset(x = 8.dp, y = (-8).dp).size(12.dp)) {
                val unit = size.width / 8f
                drawCircle(accent)
                drawLine(Color.White, Offset(4 * unit, 2 * unit), Offset(4 * unit, 6 * unit), 1.5f * unit, StrokeCap.Round)
                drawLine(Color.White, Offset(2 * unit, 4 * unit), Offset(6 * unit, 4 * unit), 1.5f * unit, StrokeCap.Round)
            }
        }
    }
}

/**
 * ClipList (ClipList.jsx) in its bordered box, which takes the room left
 * and scrolls on its own. [nameField] tracks the name being edited.
 */
@Composable
private fun AudioClipList(
    clips: List<AudioClipDto>,
    currentIndex: Int,
    playing: Boolean,
    accent: Color,
    dark: Boolean,
    textColor: Color,
    readOnly: Boolean,
    nameField: CoordinatesHolder,
    onPlay: (Int) -> Unit,
    onRename: (Int, String) -> Unit,
    onDelete: (Int) -> Unit,
    modifier: Modifier,
) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(if (dark) Color.Black.copy(alpha = 0.2f) else Color.White.copy(alpha = 0.55f), shape)
            .border(1.dp, if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.15f), shape)
            .clip(shape)
            .verticalScroll(rememberScrollState()),
    ) {
        clips.forEachIndexed { index, clip ->
            if (index > 0) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(if (dark) Color.White.copy(alpha = 0.1f) else Color.Black.copy(alpha = 0.1f)),
                )
            }
            AudioClipRow(
                clip = clip,
                index = index,
                current = index == currentIndex,
                playing = index == currentIndex && playing,
                accent = accent,
                dark = dark,
                textColor = textColor,
                readOnly = readOnly,
                nameField = nameField,
                onPlay = { onPlay(index) },
                onRename = { name -> onRename(index, name) },
                onDelete = { onDelete(index) },
            )
        }
    }
}

/**
 * ClipRow (ClipList.jsx:53-207): the index pill, a play or pause glyph on
 * the current clip, the name, the duration, then rename and a delete that
 * asks twice within 3 seconds. Renaming edits the name in place, focused
 * and selected; Enter or leaving the field keeps it, Escape does not.
 */
@Composable
private fun AudioClipRow(
    clip: AudioClipDto,
    index: Int,
    current: Boolean,
    playing: Boolean,
    accent: Color,
    dark: Boolean,
    textColor: Color,
    readOnly: Boolean,
    nameField: CoordinatesHolder,
    onPlay: () -> Unit,
    onRename: (String) -> Unit,
    onDelete: () -> Unit,
) {
    var editing by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf(TextFieldValue()) }
    var confirmingDelete by remember { mutableStateOf(false) }
    if (confirmingDelete) {
        LaunchedEffect(Unit) {
            delay(3000)
            confirmingDelete = false
        }
    }

    fun startEdit() {
        draft = TextFieldValue(clip.name, TextRange(0, clip.name.length))
        editing = true
    }

    fun commit() {
        if (!editing) return
        editing = false
        val next = draft.text.trim()
        if (next != clip.name) onRename(next)
    }

    val renameLabel = stringResource(R.string.native_audio_rename_clip)
    val deleteLabel = stringResource(
        if (confirmingDelete) R.string.native_audio_remove_clip_confirm else R.string.native_audio_remove_clip,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                when {
                    !current -> Color.Transparent
                    dark -> Color.White.copy(alpha = 0.1f)
                    else -> Color.Black.copy(alpha = 0.06f)
                },
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { if (!editing) onPlay() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .then(
                    if (current) {
                        Modifier.tailwindShadowSm(CircleShape).background(accent, CircleShape)
                    } else {
                        Modifier.background(if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.1f), CircleShape)
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            when {
                current && playing -> PauseFilledIcon(size = 14.dp, tint = Color.White)
                current -> PlayFilledIcon(modifier = Modifier.offset(x = (-1).dp), size = 14.dp, tint = Color.White)
                else -> Text(
                    (index + 1).toString(),
                    color = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153),
                    fontSize = 12.sp,
                    lineHeight = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
                )
            }
        }
        if (editing) {
            AudioClipNameField(
                value = draft,
                onValueChange = { draft = it },
                textColor = textColor,
                accent = accent,
                dark = dark,
                onCommit = { commit() },
                onCancel = { editing = false },
                modifier = Modifier.weight(1f).onGloballyPositioned { nameField.value = it },
            )
        } else {
            Text(
                clip.name.trim().ifEmpty { stringResource(R.string.native_audio_clip_default_name, index + 1) },
                color = textColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        Text(
            formatDuration(clip.duration ?: 0f),
            color = textColor.copy(alpha = 0.8f),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Medium,
            style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
        )
        if (!readOnly) {
            AudioRowButton(renameLabel, onClick = { if (editing) commit() else startEdit() }) {
                EditLineIcon(
                    modifier = Modifier.alpha(0.6f),
                    size = 16.dp,
                    tint = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153),
                )
            }
            val deleteTint = when {
                !confirmingDelete -> if (dark) Color(0xFFFFA2A2) else Color(0xFFE7000B)
                dark -> Color(0xFFFFC9C9)
                else -> Color(0xFFE7000B)
            }
            AudioRowButton(
                label = deleteLabel,
                modifier = if (confirmingDelete) {
                    Modifier
                        .outsideRing(Color(0x99FF6467), CircleShape)
                        .background(if (dark) Color(0x6682181A) else Color(0xFFFFE2E2), CircleShape)
                } else {
                    Modifier.alpha(0.6f)
                },
                onClick = {
                    if (confirmingDelete) {
                        confirmingDelete = false
                        onDelete()
                    } else {
                        confirmingDelete = true
                    }
                },
            ) {
                if (confirmingDelete) {
                    SaveCheckIcon(size = 16.dp, tint = deleteTint, strokeWidth = 2.5f)
                } else {
                    TrashIcon(size = 20.dp, tint = deleteTint)
                }
            }
        }
    }
}

/** A row's 32px round action, easing to 95% while pressed. */
@Composable
private fun AudioRowButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    glyph: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val scale by pressScale(interaction, 0.95f)
    Box(
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .size(32.dp)
            .then(modifier)
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        glyph()
    }
}

/** The rename input (ClipList.jsx:145-160): focused with its text selected
 *  as it opens, underlined, the underline taking the text colour while
 *  focused, the caret in the accent. */
@Composable
private fun AudioClipNameField(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    textColor: Color,
    accent: Color,
    dark: Boolean,
    onCommit: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    val style = TextStyle(color = textColor, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        textStyle = style,
        cursorBrush = SolidColor(accent),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onCommit() }),
        modifier = modifier
            .focusRequester(focusRequester)
            .onFocusChanged { state ->
                if (focused && !state.isFocused) onCommit()
                focused = state.isFocused
            }
            .onPreviewKeyEvent { event ->
                if (event.key == Key.Escape && event.type == KeyEventType.KeyDown) {
                    onCancel()
                    true
                } else {
                    false
                }
            }
            .bottomHairline(
                when {
                    focused -> textColor
                    dark -> Color.White.copy(alpha = 0.3f)
                    else -> Color.Black.copy(alpha = 0.3f)
                },
            ),
        decorationBox = { inner ->
            Box {
                if (value.text.isEmpty()) {
                    // Tailwind's placeholder: the text colour at half strength.
                    Text(stringResource(R.string.native_audio_clip_name_placeholder), style = style.copy(color = textColor.copy(alpha = 0.5f)))
                }
                inner()
            }
        },
    )
}

private class StorageZone(val ring: Color, val fill: Brush, val text: Color)

/** zoneFor (StorageGauge.jsx:33-49): green under 70%, amber under 90%,
 *  red above. */
private fun storageZone(pct: Int, dark: Boolean): StorageZone = when {
    pct < 70 -> StorageZone(
        ring = Color(0xFF10B981),
        fill = Brush.horizontalGradient(listOf(Color(0xFF00D492), Color(0xFF00BC7D))),
        text = if (dark) Color(0xFF00D492) else Color(0xFF009966),
    )
    pct < 90 -> StorageZone(
        ring = Color(0xFFF59E0B),
        fill = Brush.horizontalGradient(listOf(Color(0xFFFFB900), Color(0xFFFF6900))),
        text = if (dark) Color(0xFFFFB900) else Color(0xFFE17100),
    )
    else -> StorageZone(
        ring = Color(0xFFE11D48),
        fill = Brush.horizontalGradient(listOf(Color(0xFFFF2056), Color(0xFFE7000B))),
        text = if (dark) Color(0xFFFF637E) else Color(0xFFEC003F),
    )
}

/** formatBytes (StorageGauge.jsx:18-27): the web writes Ko and Mo in every
 *  language. */
private fun formatBytes(bytes: Long): String {
    if (bytes <= 0L) return "0 Ko"
    val megabytes = bytes / (1024.0 * 1024.0)
    return when {
        megabytes < 1.0 -> "${(bytes / 1024.0).roundToLong()} Ko"
        megabytes >= 10.0 || megabytes == floor(megabytes) -> "${megabytes.roundToLong()} Mo"
        else -> "${String.format(Locale.US, "%.1f", megabytes)} Mo"
    }
}

/**
 * StorageGauge.jsx: the "Stockage ◯" pill of the note's bottom row, or
 * with [bar] the recorder panel's linear gauge, whose fill pulses while
 * [live]. Both turn to the zone colour from 90% and open the storage
 * details, under them or above when the room runs out.
 */
@Composable
internal fun AudioStorageGauge(
    usedBytes: Long,
    dark: Boolean,
    borderColor: Color,
    modifier: Modifier = Modifier,
    bar: Boolean = false,
    live: Boolean = false,
) {
    var open by remember { mutableStateOf(false) }
    val pct = ((usedBytes.toFloat() / MaxAudioBytes).coerceIn(0f, 1f) * 100f).roundToInt()
    val zone = storageZone(pct, dark)
    val color = if (pct >= 90) zone.text else if (dark) Color(0xFFD1D5DC) else Color(0xFF4A5565)
    val gaugeLabel = stringResource(R.string.native_audio_storage_used, pct)
    val tooltip = stringResource(R.string.native_audio_storage_tooltip)
    Box(modifier) {
        val trigger = Modifier
            .semantics { contentDescription = gaugeLabel }
            .gkTooltip(tooltip)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { open = !open }
        if (bar) {
            val fill by animateFloatAsState(
                targetValue = pct / 100f,
                animationSpec = tween(durationMillis = 300, easing = GkEaseOut),
                label = "storageBar",
            )
            val pulse = if (live) rememberPulseAlpha() else null
            Row(
                modifier = trigger.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(stringResource(R.string.native_audio_storage), color = color, fontSize = 11.sp, lineHeight = 16.5.sp, fontWeight = FontWeight.Medium)
                Box(
                    Modifier
                        .weight(1f)
                        .height(6.dp)
                        .background(if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.1f), CircleShape),
                ) {
                    Box(
                        Modifier
                            .fillMaxHeight()
                            .fillMaxWidth(fill)
                            .graphicsLayer { alpha = pulse?.value ?: 1f }
                            .background(zone.fill, CircleShape),
                    )
                }
                Text(
                    "$pct%",
                    color = color,
                    fontSize = 11.sp,
                    lineHeight = 16.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
                )
            }
        } else {
            Row(
                modifier = trigger.padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(stringResource(R.string.native_audio_storage), color = color, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium)
                StorageRing(pct, zone.ring, color)
            }
        }
        if (open) {
            FooterPopover(
                gap = 8.dp,
                background = if (dark) PopoverBgDark else Color.White,
                borderColor = borderColor,
                onDismiss = { open = false },
                width = 288.dp,
                cornerRadius = 12.dp,
                below = true,
                flip = true,
                arrow = false,
            ) {
                AudioStorageDetails(usedBytes, pct, zone, dark, borderColor)
            }
        }
    }
}

/** CircularRing (StorageGauge.jsx:51-86): a 14px ring, its track the text
 *  colour at 25%, filled clockwise from 12 o'clock. */
@Composable
private fun StorageRing(pct: Int, color: Color, trackColor: Color) {
    val sweep by animateFloatAsState(
        targetValue = pct * 3.6f,
        animationSpec = tween(durationMillis = 300, easing = CssEaseOut),
        label = "storageRing",
    )
    val arc by animateColorAsState(
        targetValue = color,
        animationSpec = tween(durationMillis = 200, easing = CssEaseOut),
        label = "storageRingColor",
    )
    Canvas(Modifier.size(14.dp)) {
        val stroke = 2.5.dp.toPx()
        drawCircle(trackColor.copy(alpha = trackColor.alpha * 0.25f), radius = (size.minDimension - stroke) / 2f, style = Stroke(stroke))
        if (sweep > 0f) {
            drawArc(
                color = arc,
                startAngle = -90f,
                sweepAngle = sweep,
                useCenter = false,
                topLeft = Offset(stroke / 2f, stroke / 2f),
                size = Size(size.width - stroke, size.height - stroke),
                style = Stroke(stroke, cap = StrokeCap.Round),
            )
        }
    }
}

/** The storage popover's card (StorageGauge.jsx:144-188). */
@Composable
private fun AudioStorageDetails(usedBytes: Long, pct: Int, zone: StorageZone, dark: Boolean, borderColor: Color) {
    val text = if (dark) PopoverTextDark else PopoverTextLight
    val numbers = LocalTextStyle.current.copy(fontFeatureSettings = "tnum")
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.native_audio_storage_title), color = text, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold)
            Text(stringResource(R.string.native_audio_storage_description), color = text.copy(alpha = 0.7f), fontSize = 11.sp, lineHeight = 15.125.sp)
        }
        Column {
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.native_audio_storage_note_usage).uppercase(),
                    color = text.copy(alpha = 0.6f),
                    fontSize = 10.sp,
                    lineHeight = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.5.sp,
                )
                Text("$pct%", color = zone.text, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Bold, style = numbers)
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .background(if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.1f), CircleShape),
            ) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(pct / 100f).background(zone.fill, CircleShape))
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatBytes(usedBytes), color = text.copy(alpha = 0.7f), fontSize = 11.sp, lineHeight = 16.5.sp, style = numbers)
                Text(formatBytes(MaxAudioBytes), color = text.copy(alpha = 0.7f), fontSize = 11.sp, lineHeight = 16.5.sp, style = numbers)
            }
        }
        Column(
            modifier = Modifier.topHairline(borderColor).padding(top = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            StorageDetailRow(stringResource(R.string.native_audio_storage_limit), formatBytes(MaxAudioBytes), text, numbers)
            StorageDetailRow(stringResource(R.string.native_audio_storage_estimate), stringResource(R.string.native_audio_storage_estimate_value), text, null)
        }
        Text(stringResource(R.string.native_audio_storage_hint), color = text.copy(alpha = 0.6f), fontSize = 11.sp, lineHeight = 17.875.sp)
    }
}

@Composable
private fun StorageDetailRow(label: String, value: String, text: Color, valueStyle: TextStyle?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = text.copy(alpha = 0.7f), fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.weight(1f))
        Text(
            value,
            color = text,
            fontSize = 12.sp,
            lineHeight = 18.sp,
            fontWeight = FontWeight.SemiBold,
            style = valueStyle ?: LocalTextStyle.current,
        )
    }
}
