package com.glasskeep.app.nativeapp

import android.content.Context
import android.media.MediaDataSource
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * Records a new clip with the platform's own MediaRecorder, targeting
 * AAC-in-M4A (`audio/mp4`): universally supported for both recording and
 * playback across this app's whole minSdk 24 range, and already one of
 * the MIME types the server's own validateAudioContent() accepts (it's
 * what Safari's MediaRecorder produces on the web side too).
 *
 * One instance records at most one clip at a time; call [stopAndFinish]
 * before [start]ing another, and [close] once done with it. [start] and
 * [stopAndFinish] run off the main thread while [close] may come from it,
 * so the three take turns on the recorder itself.
 */
class AudioRecorderController(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var closed = false

    // useAudioRecorder.js's clock: wall time since the start, minus the
    // time spent paused.
    private var startedAt = 0L
    private var pausedAt = 0L
    private var pausedTotal = 0L

    /** True on success. False (and no recorder left running) if the
     *  platform refused to start, e.g. the mic is already in use by
     *  another app, or genuinely unsupported hardware, or once closed. */
    @Synchronized
    fun start(): Boolean {
        if (closed) return false
        val file = File(context.cacheDir, "audio_rec_${UUID.randomUUID()}.m4a")
        @Suppress("DEPRECATION")
        val rec = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else MediaRecorder()
        return try {
            rec.setAudioSource(MediaRecorder.AudioSource.MIC)
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            rec.setAudioEncodingBitRate(128_000)
            rec.setAudioSamplingRate(44_100)
            rec.setOutputFile(file.absolutePath)
            rec.prepare()
            rec.start()
            recorder = rec
            outputFile = file
            startedAt = SystemClock.elapsedRealtime()
            pausedAt = 0L
            pausedTotal = 0L
            true
        } catch (t: Throwable) {
            NativeDebug.e("AudioRecorderController.start failed", t)
            rec.release()
            file.delete()
            false
        }
    }

    /** How long the current recording has been capturing, pauses left
     *  out. */
    fun elapsedMs(): Long {
        if (recorder == null) return 0L
        val now = if (pausedAt != 0L) pausedAt else SystemClock.elapsedRealtime()
        return (now - startedAt - pausedTotal).coerceAtLeast(0L)
    }

    /** Stops the recording and returns what it captured. Must be called
     *  off the main thread: reads the whole recorded file into memory to
     *  base64-encode it. */
    fun stopAndFinish(): AudioRecordingOutcome {
        val (rec, file) = synchronized(this) {
            val taken = recorder to outputFile
            recorder = null
            outputFile = null
            taken
        }
        if (rec == null || file == null) return AudioRecordingOutcome.Failed
        try {
            try {
                rec.stop()
            } finally {
                rec.release()
            }
        } catch (e: RuntimeException) {
            // The platform's documented answer to a stop() that came before
            // any audio did.
            NativeDebug.e("AudioRecorderController.stopAndFinish: nothing captured", e)
            file.delete()
            return AudioRecordingOutcome.Empty
        }
        return try {
            val bytes = file.readBytes()
            if (bytes.isEmpty()) {
                AudioRecordingOutcome.Empty
            } else {
                AudioRecordingOutcome.Recorded(
                    AudioRecordingResult(
                        dataUrl = "data:audio/mp4;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP),
                        mimeType = "audio/mp4",
                        durationSeconds = readDurationMs(file) / 1000f,
                        sizeBytes = bytes.size.toLong(),
                    ),
                )
            }
        } catch (t: Throwable) {
            NativeDebug.e("AudioRecorderController.stopAndFinish failed", t)
            AudioRecordingOutcome.Failed
        } finally {
            file.delete()
        }
    }

    /** Pauses the recording in place, keeping the same file. Supported
     *  since API 24, this app's own minimum. Returns false when the
     *  platform refused (nothing is left in a broken state either way). */
    fun pause(): Boolean = try {
        val rec = recorder
        if (rec == null) {
            false
        } else {
            rec.pause()
            pausedAt = SystemClock.elapsedRealtime()
            true
        }
    } catch (t: Throwable) {
        NativeDebug.e("AudioRecorderController.pause failed", t)
        false
    }

    fun resume(): Boolean = try {
        val rec = recorder
        if (rec == null) {
            false
        } else {
            rec.resume()
            pausedTotal += SystemClock.elapsedRealtime() - pausedAt
            pausedAt = 0L
            true
        }
    } catch (t: Throwable) {
        NativeDebug.e("AudioRecorderController.resume failed", t)
        false
    }

    /** How many bytes the in-progress recording has written so far, for
     *  the live storage gauge. Zero when nothing is recording. */
    fun currentBytes(): Long = outputFile?.length() ?: 0L

    /** Discards any recording in progress for good: a [start] still
     *  running finishes first and is stopped, a later one records
     *  nothing. */
    @Synchronized
    fun close() {
        closed = true
        val rec = recorder
        val file = outputFile
        recorder = null
        outputFile = null
        try {
            rec?.stop()
        } catch (t: Throwable) {
            NativeDebug.e("AudioRecorderController.close: stop failed (ignored)", t)
        }
        rec?.release()
        file?.delete()
    }

    private fun readDurationMs(file: File): Long {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        } catch (t: Throwable) {
            NativeDebug.e("AudioRecorderController.readDurationMs failed", t)
            0L
        } finally {
            retriever.release()
        }
    }
}

data class AudioRecordingResult(val dataUrl: String, val mimeType: String, val durationSeconds: Float, val sizeBytes: Long)

/** How a recording ended: useAudioRecorder.js's READY, or its EMPTY and
 *  RECORDING_FAILED errors. */
sealed interface AudioRecordingOutcome {
    data class Recorded(val result: AudioRecordingResult) : AudioRecordingOutcome
    data object Empty : AudioRecordingOutcome
    data object Failed : AudioRecordingOutcome
}

/** In-memory MediaDataSource over an already-decoded byte array, so a
 *  clip stored as a data: URL can be handed to MediaPlayer (or
 *  AudioTranscoder's MediaExtractor) directly, no temp file needed. */
internal class ByteArrayMediaDataSource(private val data: ByteArray) : MediaDataSource() {
    override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
        if (position >= data.size) return -1
        val length = minOf(size.toLong(), data.size - position).toInt()
        System.arraycopy(data, position.toInt(), buffer, offset, length)
        return length
    }

    override fun getSize(): Long = data.size.toLong()

    override fun close() {}
}

/**
 * Plays one clip at a time through the platform's own MediaPlayer, from
 * the main thread: the clip is decoded from its data: URL in the
 * background and prepared asynchronously, and every callback comes back
 * on the main thread.
 *
 * Native-recorded clips (audio/mp4, AAC) are safe, standard Android
 * territory. An existing clip recorded by the web app is very often
 * audio/webm;codecs=opus (Chromium/Firefox's own MediaRecorder default):
 * Opus decoding itself is a mandatory Android codec, but the WebM
 * container demuxer inside the stock MediaPlayer/MediaExtractor stack has
 * a real, documented history of inconsistent support across OS versions
 * and OEMs. Rather than guess either way, [load] always attempts playback
 * and reports a real failure through its onError, so the caller can show
 * "can't play this recording on this device" instead of hanging or
 * crashing when a given device's decoder actually can't handle a clip.
 */
class AudioPlayerController {
    private var player: MediaPlayer? = null

    /** True once the loaded clip can play: paused or playing, no longer
     *  preparing. */
    var isReady = false
        private set

    /** Loads [dataUrl], replacing whatever was loaded; [onReady] runs once
     *  it can start. A malformed URL or a decoder failure, now or later,
     *  reaches [onError] with nothing left loaded. */
    suspend fun load(dataUrl: String, onReady: () -> Unit, onError: () -> Unit, onCompletion: () -> Unit) {
        stop()
        val bytes = withContext(Dispatchers.Default) {
            try {
                Base64.decode(dataUrl.substringAfter("base64,", ""), Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                NativeDebug.e("AudioPlayerController.load: not a base64 data: URL", e)
                null
            }
        }
        if (bytes == null || bytes.isEmpty()) {
            onError()
            return
        }
        val mp = MediaPlayer()
        player = mp
        mp.setOnPreparedListener {
            isReady = true
            onReady()
        }
        mp.setOnErrorListener { _, what, extra ->
            NativeDebug.e("AudioPlayerController playback error what=$what extra=$extra")
            stop()
            onError()
            true
        }
        mp.setOnCompletionListener { onCompletion() }
        try {
            mp.setDataSource(ByteArrayMediaDataSource(bytes))
            mp.prepareAsync()
        } catch (t: Throwable) {
            NativeDebug.e("AudioPlayerController.load failed", t)
            stop()
            onError()
        }
    }

    fun pause() {
        try {
            player?.pause()
        } catch (t: Throwable) {
            NativeDebug.e("AudioPlayerController.pause failed", t)
        }
    }

    fun resume() {
        try {
            player?.start()
        } catch (t: Throwable) {
            NativeDebug.e("AudioPlayerController.resume failed", t)
        }
    }

    fun seekTo(positionMs: Int) {
        try {
            player?.seekTo(positionMs)
        } catch (t: Throwable) {
            NativeDebug.e("AudioPlayerController.seekTo failed", t)
        }
    }

    fun currentPositionMs(): Int = try {
        player?.currentPosition ?: 0
    } catch (t: Throwable) {
        0
    }

    fun durationMs(): Int = try {
        player?.duration ?: 0
    } catch (t: Throwable) {
        0
    }

    fun isPlaying(): Boolean = try {
        player?.isPlaying ?: false
    } catch (t: Throwable) {
        false
    }

    /** Safe to call even with nothing loaded. Must be called when the
     *  screen goes away (see AudioClipsSection's DisposableEffect): a
     *  MediaPlayer holds a real native decoder resource that is never
     *  reclaimed on its own just because Compose stopped referencing it. */
    fun stop() {
        val p = player
        player = null
        isReady = false
        try {
            // Valid in every state, preparing included, and stops playback.
            p?.release()
        } catch (t: Throwable) {
            NativeDebug.e("AudioPlayerController.release failed (ignored)", t)
        }
    }
}
