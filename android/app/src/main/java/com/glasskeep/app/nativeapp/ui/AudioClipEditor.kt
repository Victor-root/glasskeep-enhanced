package com.glasskeep.app.nativeapp.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AudioPlayerController
import com.glasskeep.app.nativeapp.AudioRecorderController
import com.glasskeep.app.nativeapp.data.AudioClipDto
import com.glasskeep.app.nativeapp.data.AudioContent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** The gradient every primary audio button uses (indigo to violet). */
private val AudioButtonGradient = Brush.horizontalGradient(listOf(Color(0xFF6366F1), Color(0xFF7C3AED)))

/**
 * Audio note editor, ported from AudioNoteEditor.jsx: the three states
 * the web itself has, in this order. Empty (a big centered mic call to
 * action), recording (an elapsed timer, a pause/resume button and a live
 * storage gauge) and populated (a hero player for the selected clip over
 * a list of every clip, each renamable in place). Owns the actual
 * MediaRecorder/MediaPlayer controllers and every bit of recording/
 * playback state itself, same split as RichTextEditor/DrawingEditor: the
 * caller (NoteDetailScreen) only ever sees the persisted clip list and
 * three callbacks for how it changes, never the ephemeral "currently
 * recording"/"currently playing" state.
 *
 * Deliberately not ported from the web editor, disclosed rather than
 * silently dropped: the reserved-but-never-actually-used note-level
 * caption field (the web itself has never shipped any UI for it either,
 * see AudioContent.kt), and exporting/downloading a clip (the web's own
 * download menu also offers MP3/WAV re-encoding, a bigger feature than
 * this milestone's scope; a recorded clip still round-trips losslessly,
 * it just can't be saved out to the device's own files from here yet).
 *
 * Playing back a clip this app itself just recorded (AAC/M4A) is safe,
 * standard Android territory. A clip recorded by the *web* app is very
 * often WebM/Opus, whose container has a real, inconsistent support
 * history across Android OS versions/devices in the platform's own
 * MediaPlayer stack (see AudioPlayerController's own doc comment): this
 * editor always attempts playback rather than refusing up front, and
 * shows [R.string.native_audio_playback_error] if a specific device's
 * decoder actually can't handle a specific clip, rather than guessing
 * either way.
 */
@Composable
fun AudioClipsSection(
    clips: List<AudioClipDto>,
    accent: Color,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    enabled: Boolean,
    onClipAdded: (AudioClipDto) -> Unit,
    onClipRemoved: (id: String) -> Unit,
    onClipRenamed: (id: String, newName: String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorder = remember { AudioRecorderController(context) }
    val player = remember { AudioPlayerController() }
    DisposableEffect(Unit) {
        onDispose {
            recorder.cancel()
            player.stop()
        }
    }

    var isRecording by remember { mutableStateOf(false) }
    var isPausedRecording by remember { mutableStateOf(false) }
    var recordingElapsedMs by remember { mutableStateOf(0L) }
    var recordingError by remember { mutableStateOf(false) }
    var liveBytes by remember { mutableStateOf(0L) }
    var tooLarge by remember { mutableStateOf(false) }

    var playingClipId by remember { mutableStateOf<String?>(null) }
    var isPaused by remember { mutableStateOf(false) }
    var positionMs by remember { mutableStateOf(0) }
    var durationMs by remember { mutableStateOf(0) }
    var playbackError by remember { mutableStateOf<String?>(null) }

    var renamingClipId by remember { mutableStateOf<String?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            scope.launch {
                if (withContext(Dispatchers.IO) { recorder.start() }) {
                    isRecording = true
                    recordingElapsedMs = 0L
                    recordingError = false
                } else {
                    recordingError = true
                }
            }
        } else {
            recordingError = true
        }
    }

    fun startRecording() {
        if (isRecording || !enabled) return
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPermission) {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        scope.launch {
            if (withContext(Dispatchers.IO) { recorder.start() }) {
                isRecording = true
                recordingElapsedMs = 0L
                recordingError = false
            } else {
                recordingError = true
            }
        }
    }

    fun stopRecording() {
        if (!isRecording && !isPausedRecording) return
        isRecording = false
        isPausedRecording = false
        scope.launch {
            val result = withContext(Dispatchers.IO) { recorder.stopAndFinish() }
            if (result == null) {
                recordingError = true
                return@launch
            }
            // The web checks the projected total only once the recording
            // is over, and refuses the clip rather than truncating it
            // (AudioNoteEditor.jsx:76-81).
            val projected = clips.sumOf { clipBytes(it) } + result.sizeBytes
            if (projected > MaxAudioBytes) {
                tooLarge = true
                return@launch
            }
            tooLarge = false
            onClipAdded(AudioContent.newClip(result.dataUrl, result.mimeType, result.durationSeconds, result.sizeBytes))
        }
    }

    fun pauseRecording() {
        if (!isRecording) return
        if (recorder.pause()) {
            isRecording = false
            isPausedRecording = true
        }
    }

    fun resumeRecording() {
        if (!isPausedRecording) return
        if (recorder.resume()) {
            isPausedRecording = false
            isRecording = true
        }
    }

    fun cancelRecording() {
        isRecording = false
        isPausedRecording = false
        recorder.cancel()
    }

    // The counter and the live storage bar both tick while recording;
    // paused time is not counted, same as useAudioRecorder.js.
    LaunchedEffect(isRecording) {
        while (isRecording) {
            delay(250)
            recordingElapsedMs += 250
            liveBytes = recorder.currentBytes()
        }
    }

    fun stopPlayback() {
        player.stop()
        playingClipId = null
        isPaused = false
        positionMs = 0
        durationMs = 0
    }

    fun playClip(clip: AudioClipDto) {
        if (playingClipId == clip.id) {
            if (isPaused) {
                player.resume()
                isPaused = false
            } else {
                player.pause()
                isPaused = true
            }
            return
        }
        playbackError = null
        scope.launch {
            val started = withContext(Dispatchers.IO) {
                player.play(
                    clip.audioDataUrl,
                    onError = { playbackError = clip.id },
                    onCompletion = { stopPlayback() },
                )
            }
            if (started) {
                playingClipId = clip.id
                isPaused = false
                positionMs = 0
                durationMs = player.durationMs()
            }
        }
    }

    // Polls MediaPlayer's own position, there is no push-based update API
    // for it. 150ms is frequent enough for a smooth-looking seek bar
    // without meaningfully taxing the main thread.
    LaunchedEffect(playingClipId, isPaused) {
        if (playingClipId == null || isPaused) return@LaunchedEffect
        while (true) {
            delay(150)
            if (!player.isPlaying()) break
            positionMs = player.currentPositionMs()
            val d = player.durationMs()
            if (d > 0) durationMs = d
        }
    }

    val recordErrorMessage = stringResource(R.string.native_audio_record_error)
    val playbackErrorMessage = stringResource(R.string.native_audio_playback_error)
    val tooLargeMessage = stringResource(R.string.native_audio_too_large)

    val storedBytes = remember(clips) { clips.sumOf { clipBytes(it) } }
    val currentIndex = clips.indexOfFirst { it.id == playingClipId }.let { if (it < 0) 0 else it }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (tooLarge) {
            Text(
                tooLargeMessage,
                color = if (dark) Color(0xFFFECACA) else Color(0xFF991B1B),
                fontSize = 14.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (dark) Color(0x66450A0A) else Color(0xFFFEE2E2))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
        if (recordingError) {
            Text(recordErrorMessage, color = DangerRed, fontSize = 12.sp)
        }
        if (playbackError != null) {
            Text(playbackErrorMessage, color = DangerRed, fontSize = 12.sp)
        }

        when {
            isRecording || isPausedRecording -> AudioRecorderPanel(
                paused = isPausedRecording,
                elapsedSeconds = (recordingElapsedMs / 1000).toInt(),
                accent = accent,
                dark = dark,
                titleColor = titleColor,
                subtextColor = subtextColor,
                borderColor = borderColor,
                usedBytes = storedBytes + liveBytes,
                onCancel = { cancelRecording() },
                onPauseResume = { if (isPausedRecording) resumeRecording() else pauseRecording() },
                onStop = { stopRecording() },
            )
            clips.isEmpty() -> AudioEmptyState(
                accent = accent,
                enabled = enabled,
                subtextColor = subtextColor,
                onStart = { startRecording() },
            )
            else -> {
                val current = clips.getOrNull(currentIndex) ?: clips.first()
                AudioHeroPlayer(
                    clip = current,
                    index = currentIndex,
                    total = clips.size,
                    accent = accent,
                    dark = dark,
                    titleColor = titleColor,
                    playing = playingClipId == current.id && !isPaused,
                    positionMs = if (playingClipId == current.id) positionMs else 0,
                    durationMs = if (playingClipId == current.id && durationMs > 0) {
                        durationMs
                    } else {
                        (current.duration * 1000).toInt()
                    },
                    canGoPrevious = currentIndex > 0,
                    canGoNext = currentIndex < clips.lastIndex,
                    onPlayPause = { playClip(current) },
                    onPrevious = { clips.getOrNull(currentIndex - 1)?.let { playClip(it) } },
                    onNext = { clips.getOrNull(currentIndex + 1)?.let { playClip(it) } },
                    onSeek = { ms -> player.seekTo(ms); positionMs = ms },
                    onAddRecording = { startRecording() },
                )
                AudioClipList(
                    clips = clips,
                    accent = accent,
                    dark = dark,
                    titleColor = titleColor,
                    subtextColor = subtextColor,
                    playingClipId = playingClipId,
                    isPaused = isPaused,
                    enabled = enabled,
                    renamingClipId = renamingClipId,
                    onSelect = { clip -> playClip(clip) },
                    onRenameStart = { clip -> renamingClipId = clip.id },
                    onRenameCommit = { clip, newName ->
                        renamingClipId = null
                        if (newName.isNotBlank() && newName != clip.name) onClipRenamed(clip.id, newName)
                    },
                    onRemove = { clip ->
                        if (playingClipId == clip.id) stopPlayback()
                        onClipRemoved(clip.id)
                    },
                )
                StorageGauge(
                    usedBytes = storedBytes,
                    dark = dark,
                    subtextColor = subtextColor,
                    live = false,
                )
            }
        }
    }
}


/** MAX_AUDIO_BYTES (audioNote.js:38): 100 MiB of clips per note, checked
 *  after a recording ends, on the projected total. */
private const val MaxAudioBytes = 100L * 1024L * 1024L

/** A clip's own byte size, or the web's own estimate from the base64
 *  length when it never carried one (audioNote.js:122-135). */
private fun clipBytes(clip: AudioClipDto): Long =
    if (clip.size > 0) clip.size else (clip.audioDataUrl.substringAfter("base64,", "").length * 0.75).toLong()

/** EmptyState (AudioNoteEditor.jsx:209-234). */
@Composable
private fun AudioEmptyState(accent: Color, enabled: Boolean, subtextColor: Color, onStart: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(
            modifier = Modifier.size(80.dp).clip(CircleShape).background(accent),
            contentAlignment = Alignment.Center,
        ) {
            MicIcon(size = 36.dp, tint = Color.White)
        }
        Text(
            stringResource(R.string.native_audio_empty_hint),
            color = subtextColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 320.dp),
        )
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(AudioButtonGradient)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onStart() }
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MicIcon(size = 20.dp, tint = Color.White)
            Text(
                stringResource(R.string.native_audio_start_recording),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/** RecorderPanel (AudioNoteEditor.jsx:236-422): the state disc, the
 *  m:ss counter, the live storage bar and the three pill buttons. */
@Composable
private fun AudioRecorderPanel(
    paused: Boolean,
    elapsedSeconds: Int,
    accent: Color,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    usedBytes: Long,
    onCancel: () -> Unit,
    onPauseResume: () -> Unit,
    onStop: () -> Unit,
) {
    val discColor = if (paused) Color(0xFFFE9A00) else Color(0xFFFF2056)
    val pulse = rememberInfiniteTransition(label = "recordingPulse")
    val pulseAlpha by pulse.animateFloat(
        initialValue = 1f,
        targetValue = if (paused) 1f else 0.55f,
        animationSpec = infiniteRepeatable(tween(1000), RepeatMode.Reverse),
        label = "recordingPulseAlpha",
    )
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .alpha(pulseAlpha)
                .clip(CircleShape)
                .background(discColor),
            contentAlignment = Alignment.Center,
        ) {
            MicIcon(size = 36.dp, tint = Color.White)
        }
        Text(
            formatDuration(elapsedSeconds.toFloat()),
            color = titleColor,
            fontSize = 30.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            stringResource(
                if (paused) R.string.native_audio_state_paused else R.string.native_audio_state_recording,
            ),
            color = subtextColor,
            fontSize = 12.sp,
        )
        Box(Modifier.fillMaxWidth().widthIn(max = 384.dp).padding(horizontal = 8.dp)) {
            StorageGauge(
                usedBytes = usedBytes,
                dark = dark,
                subtextColor = subtextColor,
                live = !paused,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AudioPillButton(
                label = stringResource(R.string.native_note_detail_trash_confirm_cancel),
                textColor = titleColor,
                borderColor = borderColor,
                onClick = onCancel,
            )
            AudioPillButton(
                label = stringResource(
                    if (paused) R.string.native_audio_resume else R.string.native_audio_pause,
                ),
                textColor = Color.White,
                background = Color(0xFFFE9A00),
                onClick = onPauseResume,
            )
            AudioPillButton(
                label = stringResource(R.string.native_audio_stop),
                textColor = Color.White,
                background = Color(0xFFEC003F),
                onClick = onStop,
            )
        }
    }
}

@Composable
private fun AudioPillButton(
    label: String,
    textColor: Color,
    background: Color? = null,
    borderColor: Color? = null,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .then(if (background != null) Modifier.background(background) else Modifier)
            .then(
                if (borderColor != null) {
                    Modifier.border(1.dp, borderColor, RoundedCornerShape(999.dp))
                } else {
                    Modifier
                },
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(label, color = textColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** The "hero" player (AudioPlayer.jsx:284-392). */
@Composable
private fun AudioHeroPlayer(
    clip: AudioClipDto,
    index: Int,
    total: Int,
    accent: Color,
    dark: Boolean,
    titleColor: Color,
    playing: Boolean,
    positionMs: Int,
    durationMs: Int,
    canGoPrevious: Boolean,
    canGoNext: Boolean,
    onPlayPause: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onSeek: (Int) -> Unit,
    onAddRecording: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (dark) Color.Black.copy(alpha = 0.35f) else Color.White.copy(alpha = 0.55f))
            .border(
                width = 1.dp,
                color = if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.15f),
                shape = RoundedCornerShape(16.dp),
            )
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(
            modifier = Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(accent),
            contentAlignment = Alignment.Center,
        ) {
            MicIcon(size = 28.dp, tint = Color.White)
        }
        Text(
            clip.name.ifBlank { stringResource(R.string.native_audio_clip_default_name, index + 1) },
            color = titleColor,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
        )
        if (total > 1) {
            Text(
                stringResource(R.string.native_audio_clip_position, index + 1, total).uppercase(),
                color = titleColor.copy(alpha = 0.7f),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.5.sp,
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AudioTransportButton(
                contentDescription = stringResource(R.string.native_audio_previous),
                enabled = canGoPrevious,
                dark = dark,
                size = 40.dp,
                onClick = onPrevious,
            ) { tint -> PreviousTrackIcon(size = 18.dp, tint = tint) }
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(accent)
                    .semantics {
                        contentDescription = if (playing) "pause" else "play"
                    }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onPlayPause() },
                contentAlignment = Alignment.Center,
            ) {
                if (playing) {
                    PauseIcon(size = 24.dp, tint = Color.White)
                } else {
                    PlayIcon(size = 24.dp, tint = Color.White)
                }
            }
            AudioTransportButton(
                contentDescription = stringResource(R.string.native_audio_next),
                enabled = canGoNext,
                dark = dark,
                size = 40.dp,
                onClick = onNext,
            ) { tint -> NextTrackIcon(size = 18.dp, tint = tint) }
        }
        AudioSeekBar(
            positionMs = positionMs,
            durationMs = durationMs,
            accent = accent,
            dark = dark,
            onSeek = onSeek,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(formatDuration(positionMs / 1000f), color = titleColor.copy(alpha = 0.9f), fontSize = 12.sp)
            Text(formatDuration(durationMs / 1000f), color = titleColor.copy(alpha = 0.9f), fontSize = 12.sp)
        }
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(if (dark) Color.White.copy(alpha = 0.1f) else Color.White.copy(alpha = 0.7f))
                .border(
                    width = 1.dp,
                    color = if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.1f),
                    shape = CircleShape,
                )
                .semantics { contentDescription = "" }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onAddRecording() },
            contentAlignment = Alignment.Center,
        ) {
            MicIcon(size = 20.dp, tint = accent)
        }
    }
}

@Composable
private fun AudioTransportButton(
    contentDescription: String,
    enabled: Boolean,
    dark: Boolean,
    size: Dp,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    Box(
        modifier = Modifier
            .size(size)
            .alpha(if (enabled) 1f else 0.35f)
            .clip(CircleShape)
            .background(if (dark) Color.White.copy(alpha = 0.15f) else Color.White.copy(alpha = 0.8f))
            .semantics { this.contentDescription = contentDescription }
            .gkTooltip(contentDescription)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        icon(if (dark) Color.White else Color(0xFF1F2937))
    }
}

/** The 8px track with its instant fill and the 16px white thumb ringed
 *  in the accent colour (AudioPlayer.jsx:346-358). */
@Composable
private fun AudioSeekBar(
    positionMs: Int,
    durationMs: Int,
    accent: Color,
    dark: Boolean,
    onSeek: (Int) -> Unit,
) {
    var dragRatio by remember { mutableStateOf<Float?>(null) }
    val ratio = dragRatio ?: if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .height(16.dp)
            .pointerInput(durationMs) {
                detectHorizontalDragGestures(
                    onDragStart = { offset -> dragRatio = (offset.x / size.width).coerceIn(0f, 1f) },
                    onHorizontalDrag = { change, _ ->
                        change.consume()
                        dragRatio = (change.position.x / size.width).coerceIn(0f, 1f)
                    },
                    onDragEnd = {
                        dragRatio?.let { if (durationMs > 0) onSeek((it * durationMs).toInt()) }
                        dragRatio = null
                    },
                    onDragCancel = { dragRatio = null },
                )
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        val trackWidth = maxWidth
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(if (dark) Color.White.copy(alpha = 0.2f) else Color.Black.copy(alpha = 0.2f)),
        )
        Box(
            modifier = Modifier
                .width(trackWidth * ratio)
                .height(8.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(accent),
        )
        Box(
            modifier = Modifier
                .offset(x = (trackWidth * ratio) - 8.dp)
                .size(16.dp)
                .clip(CircleShape)
                .background(Color.White)
                .border(2.dp, accent, CircleShape),
        )
    }
}

/** ClipList.jsx: one bordered card holding the rows, each with its index
 *  pill, name, duration and two actions. */
@Composable
private fun AudioClipList(
    clips: List<AudioClipDto>,
    accent: Color,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    playingClipId: String?,
    isPaused: Boolean,
    enabled: Boolean,
    renamingClipId: String?,
    onSelect: (AudioClipDto) -> Unit,
    onRenameStart: (AudioClipDto) -> Unit,
    onRenameCommit: (AudioClipDto, String) -> Unit,
    onRemove: (AudioClipDto) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (dark) Color.Black.copy(alpha = 0.2f) else Color.White.copy(alpha = 0.55f))
            .border(
                width = 1.dp,
                color = if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.15f),
                shape = RoundedCornerShape(12.dp),
            ),
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
                accent = accent,
                dark = dark,
                titleColor = titleColor,
                subtextColor = subtextColor,
                current = playingClipId == clip.id,
                playing = playingClipId == clip.id && !isPaused,
                enabled = enabled,
                renaming = renamingClipId == clip.id,
                onSelect = { onSelect(clip) },
                onRenameStart = { onRenameStart(clip) },
                onRenameCommit = { newName -> onRenameCommit(clip, newName) },
                onRemove = { onRemove(clip) },
            )
        }
    }
}

/** StorageGauge.jsx's `bar` variant plus its detail popover. */
@Composable
private fun StorageGauge(
    usedBytes: Long,
    dark: Boolean,
    subtextColor: Color,
    live: Boolean,
) {
    val pct = ((usedBytes.toFloat() / MaxAudioBytes).coerceIn(0f, 1f) * 100f).roundToInt()
    val zone = when {
        pct < 70 -> Color(0xFF10B981)
        pct < 90 -> Color(0xFFF59E0B)
        else -> Color(0xFFE11D48)
    }
    val width by animateFloatAsState(
        targetValue = pct / 100f,
        animationSpec = tween(durationMillis = 300),
        label = "storageGauge",
    )
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            stringResource(R.string.native_audio_storage),
            color = subtextColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(6.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(if (dark) Color.White.copy(alpha = 0.15f) else Color.Black.copy(alpha = 0.1f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(width)
                    .height(6.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(zone)
                    .alpha(if (live) 0.85f else 1f),
            )
        }
        Text(
            "$pct%",
            color = if (pct >= 90) zone else subtextColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/** ClipRow (ClipList.jsx:114-206): the index or play pill, the name, the
 *  duration, then rename and a delete that asks twice. */
@Composable
private fun AudioClipRow(
    clip: AudioClipDto,
    index: Int,
    accent: Color,
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    current: Boolean,
    playing: Boolean,
    enabled: Boolean,
    renaming: Boolean,
    onSelect: () -> Unit,
    onRenameStart: () -> Unit,
    onRenameCommit: (String) -> Unit,
    onRemove: () -> Unit,
) {
    var confirmingRemove by remember(clip.id) { mutableStateOf(false) }
    if (confirmingRemove) {
        LaunchedEffect(clip.id, confirmingRemove) {
            delay(3000)
            confirmingRemove = false
        }
    }
    val removeLabel = stringResource(R.string.native_audio_remove_clip)
    val renameLabel = stringResource(R.string.native_audio_rename_clip)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
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
                enabled = enabled,
                role = Role.Button,
            ) { onSelect() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(
                    when {
                        current -> accent
                        dark -> Color.White.copy(alpha = 0.15f)
                        else -> Color.Black.copy(alpha = 0.1f)
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            when {
                current && playing -> PauseIcon(size = 14.dp, tint = Color.White)
                current -> PlayIcon(size = 14.dp, tint = Color.White)
                else -> Text(
                    (index + 1).toString(),
                    color = if (dark) Color(0xFFE5E7EB) else Color(0xFF374151),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        if (renaming) {
            var draft by remember(clip.id) { mutableStateOf(clip.name) }
            BasicTextField(
                value = draft,
                onValueChange = { draft = it },
                singleLine = true,
                textStyle = TextStyle(color = titleColor, fontSize = 14.sp, fontWeight = FontWeight.Medium),
                cursorBrush = SolidColor(accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onRenameCommit(draft.trim()) }),
                modifier = Modifier
                    .weight(1f)
                    .drawBehind {
                        drawRect(
                            color = if (dark) Color.White.copy(alpha = 0.3f) else Color.Black.copy(alpha = 0.3f),
                            topLeft = Offset(0f, size.height - 1.dp.toPx()),
                            size = Size(size.width, 1.dp.toPx()),
                        )
                    },
            )
        } else {
            Text(
                clip.name.ifBlank { stringResource(R.string.native_audio_clip_default_name, index + 1) },
                color = titleColor,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        Text(
            formatDuration(clip.duration),
            color = titleColor.copy(alpha = 0.8f),
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .alpha(0.6f)
                .semantics { contentDescription = renameLabel }
                .gkTooltip(renameLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) { onRenameStart() },
            contentAlignment = Alignment.Center,
        ) {
            PencilIcon(size = 16.dp, tint = if (dark) Color(0xFFE5E7EB) else Color(0xFF374151))
        }
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(
                    when {
                        !confirmingRemove -> Color.Transparent
                        dark -> Color(0x66450A0A)
                        else -> Color(0xFFFEE2E2)
                    },
                )
                .alpha(if (confirmingRemove) 1f else 0.6f)
                .semantics { contentDescription = removeLabel }
                .gkTooltip(removeLabel)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                ) {
                    if (confirmingRemove) onRemove() else confirmingRemove = true
                },
            contentAlignment = Alignment.Center,
        ) {
            val tint = if (dark) Color(0xFFFCA5A5) else Color(0xFFDC2626)
            if (confirmingRemove) {
                CheckmarkIcon(size = 16.dp, tint = tint)
            } else {
                TrashIcon(size = 20.dp, tint = tint)
            }
        }
    }
}

private fun formatDuration(seconds: Float): String {
    val total = seconds.toInt().coerceAtLeast(0)
    val minutes = total / 60
    val secs = total % 60
    return "%d:%02d".format(minutes, secs)
}
