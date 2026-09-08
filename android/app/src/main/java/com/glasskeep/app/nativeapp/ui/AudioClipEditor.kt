package com.glasskeep.app.nativeapp.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.AudioPlayerController
import com.glasskeep.app.nativeapp.AudioRecorderController
import com.glasskeep.app.nativeapp.data.AudioClipDto
import com.glasskeep.app.nativeapp.data.AudioContent
import com.glasskeep.app.ui.DarkBgColor
import com.glasskeep.app.ui.Indigo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Audio note editor: a "Record" row that turns into an elapsed-time panel
 * while recording, plus one row per existing clip (play/pause, a seek
 * bar, its name, a rename and a delete button). Owns the actual
 * MediaRecorder/MediaPlayer controllers and every bit of recording/
 * playback state itself, same split as RichTextEditor/DrawingEditor: the
 * caller (NoteDetailScreen) only ever sees the persisted clip list and
 * three callbacks for how it changes, never the ephemeral "currently
 * recording"/"currently playing" state.
 *
 * Deliberately not ported from the web editor, disclosed rather than
 * silently dropped: pausing and resuming mid-recording (stopping and
 * recording yet another clip costs nothing, clips are unlimited), the
 * reserved-but-never-actually-used note-level caption field (the web
 * itself has never shipped any UI for it either, see AudioContent.kt),
 * and exporting/downloading a clip (the web's own download menu also
 * offers MP3/WAV re-encoding, a bigger feature than this milestone's
 * scope; a recorded clip still round-trips losslessly, it just can't be
 * saved out to the device's own files from here yet).
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
    var recordingElapsedSec by remember { mutableStateOf(0) }
    var recordingError by remember { mutableStateOf(false) }

    var playingClipId by remember { mutableStateOf<String?>(null) }
    var isPaused by remember { mutableStateOf(false) }
    var positionMs by remember { mutableStateOf(0) }
    var durationMs by remember { mutableStateOf(0) }
    var playbackError by remember { mutableStateOf<String?>(null) }

    var renameTarget by remember { mutableStateOf<AudioClipDto?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            scope.launch {
                if (withContext(Dispatchers.IO) { recorder.start() }) {
                    isRecording = true
                    recordingElapsedSec = 0
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
                recordingElapsedSec = 0
                recordingError = false
            } else {
                recordingError = true
            }
        }
    }

    fun stopRecording() {
        if (!isRecording) return
        isRecording = false
        scope.launch {
            val result = withContext(Dispatchers.IO) { recorder.stopAndFinish() }
            if (result != null) {
                onClipAdded(AudioContent.newClip(result.dataUrl, result.mimeType, result.durationSeconds, result.sizeBytes))
            } else {
                recordingError = true
            }
        }
    }

    fun cancelRecording() {
        isRecording = false
        recorder.cancel()
    }

    LaunchedEffect(isRecording) {
        while (isRecording) {
            delay(1000)
            recordingElapsedSec += 1
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

    Column {
        if (clips.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                for (clip in clips) {
                    AudioClipRow(
                        clip = clip,
                        titleColor = titleColor,
                        subtextColor = subtextColor,
                        enabled = enabled && !isRecording,
                        isCurrent = playingClipId == clip.id,
                        isPaused = isPaused,
                        positionMs = positionMs,
                        durationMs = if (playingClipId == clip.id && durationMs > 0) durationMs else (clip.duration * 1000).toInt(),
                        hasError = playbackError == clip.id,
                        onPlayPause = { playClip(clip) },
                        onSeekCommit = { ms ->
                            player.seekTo(ms)
                            positionMs = ms
                        },
                        onRename = { renameTarget = clip },
                        onRemove = {
                            if (playingClipId == clip.id) stopPlayback()
                            onClipRemoved(clip.id)
                        },
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
        }
        if (playbackError != null) {
            Text(playbackErrorMessage, color = Color(0xFFdc2626), fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
        }

        if (isRecording) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(Color(0xFFdc2626)))
                Spacer(Modifier.width(8.dp))
                Text(formatDuration(recordingElapsedSec.toFloat()), color = titleColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { cancelRecording() }) {
                    Text(stringResource(R.string.native_note_detail_trash_confirm_cancel), color = subtextColor)
                }
                TextButton(onClick = { stopRecording() }) {
                    StopIcon(size = 16.dp, tint = Color(0xFFdc2626))
                }
            }
        } else {
            if (recordingError) {
                Text(recordErrorMessage, color = Color(0xFFdc2626), fontSize = 12.sp)
                Spacer(Modifier.height(4.dp))
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = enabled,
                        role = Role.Button,
                    ) { startRecording() }
                    .padding(vertical = 8.dp),
            ) {
                MicIcon(size = 16.dp, tint = if (enabled) Indigo else subtextColor)
                Spacer(Modifier.width(10.dp))
                Text(
                    stringResource(R.string.native_audio_record),
                    color = if (enabled) Indigo else subtextColor,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }

    renameTarget?.let { target ->
        AudioRenameDialog(
            dark = dark,
            titleColor = titleColor,
            subtextColor = subtextColor,
            borderColor = borderColor,
            initialName = target.name,
            onDismiss = { renameTarget = null },
            onConfirm = { newName ->
                onClipRenamed(target.id, newName)
                renameTarget = null
            },
        )
    }
}

@Composable
private fun AudioClipRow(
    clip: AudioClipDto,
    titleColor: Color,
    subtextColor: Color,
    enabled: Boolean,
    isCurrent: Boolean,
    isPaused: Boolean,
    positionMs: Int,
    durationMs: Int,
    hasError: Boolean,
    onPlayPause: () -> Unit,
    onSeekCommit: (Int) -> Unit,
    onRename: () -> Unit,
    onRemove: () -> Unit,
) {
    val playing = isCurrent && !isPaused
    // Local while actively dragging: the seek only actually applies (and
    // the shared position state updates) once the user lifts their
    // finger, see onValueChangeFinished below.
    var dragValue by remember(clip.id) { mutableStateOf<Float?>(null) }
    val removeLabel = stringResource(R.string.native_audio_remove_clip)
    val renameLabel = stringResource(R.string.native_audio_rename_clip)
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(Indigo.copy(alpha = 0.14f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = enabled,
                        role = Role.Button,
                    ) { onPlayPause() },
                contentAlignment = Alignment.Center,
            ) {
                if (playing) PauseIcon(size = 16.dp, tint = Indigo) else PlayIcon(size = 16.dp, tint = Indigo)
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    clip.name.ifBlank { stringResource(R.string.native_audio_untitled_clip) },
                    color = if (hasError) subtextColor else titleColor,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(formatDuration(if (isCurrent) durationMs / 1000f else clip.duration), color = subtextColor, fontSize = 11.sp)
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .semantics { contentDescription = renameLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = enabled,
                        role = Role.Button,
                    ) { onRename() }
                    .padding(6.dp),
            ) {
                Text("✎", color = subtextColor, fontSize = 14.sp)
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .semantics { contentDescription = removeLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = enabled,
                        role = Role.Button,
                    ) { onRemove() }
                    .padding(6.dp),
            ) {
                CloseIcon(size = 15.dp, tint = subtextColor)
            }
        }
        if (isCurrent && durationMs > 0) {
            Slider(
                value = dragValue ?: positionMs.toFloat().coerceIn(0f, durationMs.toFloat()),
                onValueChange = { dragValue = it },
                onValueChangeFinished = {
                    val finalValue = dragValue
                    dragValue = null
                    if (finalValue != null) onSeekCommit(finalValue.toInt())
                },
                valueRange = 0f..durationMs.toFloat(),
                colors = SliderDefaults.colors(thumbColor = Indigo, activeTrackColor = Indigo, inactiveTrackColor = subtextColor.copy(alpha = 0.25f)),
                modifier = Modifier.fillMaxWidth().padding(start = 42.dp),
            )
        }
    }
}

@Composable
private fun AudioRenameDialog(
    dark: Boolean,
    titleColor: Color,
    subtextColor: Color,
    borderColor: Color,
    initialName: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var text by remember { mutableStateOf(initialName) }
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(if (dark) DarkBgColor else Color.White)
                .padding(20.dp),
        ) {
            Text(
                stringResource(R.string.native_audio_rename_title),
                color = titleColor,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                singleLine = true,
                colors = detailFieldColors(titleColor, subtextColor, borderColor),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                Spacer(Modifier.weight(1f))
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.native_note_detail_trash_confirm_cancel), color = subtextColor)
                }
                TextButton(onClick = { onConfirm(text) }) {
                    Text(stringResource(R.string.native_richtext_link_apply), color = Indigo, fontWeight = FontWeight.SemiBold)
                }
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
