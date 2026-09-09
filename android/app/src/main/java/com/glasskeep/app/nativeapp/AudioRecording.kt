package com.glasskeep.app.nativeapp

import android.content.Context
import android.media.MediaDataSource
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.util.Base64
import java.io.File
import java.util.UUID

/**
 * Records a new clip with the platform's own MediaRecorder, targeting
 * AAC-in-M4A (`audio/mp4`): universally supported for both recording and
 * playback across this app's whole minSdk 24 range, and already one of
 * the MIME types the server's own validateAudioContent() accepts (it's
 * what Safari's MediaRecorder produces on the web side too).
 *
 * One instance records at most one clip at a time; call [cancel] or
 * [stopAndFinish] before [start]ing another.
 */
class AudioRecorderController(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null

    /** True on success. False (and no recorder left running) if the
     *  platform refused to start, e.g. the mic is already in use by
     *  another app, or genuinely unsupported hardware. */
    fun start(): Boolean {
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
            true
        } catch (t: Throwable) {
            NativeDebug.e("AudioRecorderController.start failed", t)
            rec.release()
            file.delete()
            false
        }
    }

    /** Stops the recording and returns its data: URL, MIME, duration
     *  (seconds) and byte size, or null on any failure (including a
     *  recording so short MediaRecorder captured nothing usable, the same
     *  "stop() throws with no prior data" case the platform itself
     *  documents). Must be called off the main thread: reads the whole
     *  recorded file into memory to base64-encode it. */
    fun stopAndFinish(): AudioRecordingResult? {
        val rec = recorder
        val file = outputFile
        recorder = null
        outputFile = null
        if (rec == null || file == null) return null
        return try {
            try {
                rec.stop()
            } finally {
                rec.release()
            }
            val bytes = file.readBytes()
            if (bytes.isEmpty()) {
                file.delete()
                return null
            }
            val durationMs = readDurationMs(file)
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            file.delete()
            AudioRecordingResult(
                dataUrl = "data:audio/mp4;base64,$base64",
                mimeType = "audio/mp4",
                durationSeconds = durationMs / 1000f,
                sizeBytes = bytes.size.toLong(),
            )
        } catch (t: Throwable) {
            NativeDebug.e("AudioRecorderController.stopAndFinish failed", t)
            file.delete()
            null
        }
    }

    /** Pauses the recording in place, keeping the same file. Supported
     *  since API 24, this app's own minimum. Returns false when the
     *  platform refused (nothing is left in a broken state either way). */
    fun pause(): Boolean = try {
        recorder?.pause() != null
    } catch (t: Throwable) {
        NativeDebug.e("AudioRecorderController.pause failed", t)
        false
    }

    fun resume(): Boolean = try {
        recorder?.resume() != null
    } catch (t: Throwable) {
        NativeDebug.e("AudioRecorderController.resume failed", t)
        false
    }

    /** How many bytes the in-progress recording has written so far, for
     *  the live storage gauge. Zero when nothing is recording. */
    fun currentBytes(): Long = outputFile?.length() ?: 0L

    /** Discards an in-progress recording without saving anything. */
    fun cancel() {
        val rec = recorder
        val file = outputFile
        recorder = null
        outputFile = null
        try {
            rec?.stop()
        } catch (t: Throwable) {
            NativeDebug.e("AudioRecorderController.cancel: stop failed (ignored)", t)
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

/** In-memory MediaDataSource over an already-decoded byte array, so a
 *  clip stored as a data: URL can be handed to MediaPlayer directly, no
 *  temp file needed for playback. */
private class ByteArrayMediaDataSource(private val data: ByteArray) : MediaDataSource() {
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
 * Plays one clip at a time through the platform's own MediaPlayer.
 *
 * Native-recorded clips (audio/mp4, AAC) are safe, standard Android
 * territory. An existing clip recorded by the web app is very often
 * audio/webm;codecs=opus (Chromium/Firefox's own MediaRecorder default):
 * Opus decoding itself is a mandatory Android codec, but the WebM
 * container demuxer inside the stock MediaPlayer/MediaExtractor stack has
 * a real, documented history of inconsistent support across OS versions
 * and OEMs. Rather than guess either way, [play] always attempts
 * playback and reports a real failure through [onError] (MediaPlayer's
 * own error listener, plus this class's own try/catch around prepare()),
 * so the caller can show "can't play this recording on this device"
 * instead of hanging or crashing when a given device's decoder actually
 * can't handle a given clip.
 */
class AudioPlayerController {
    private var player: MediaPlayer? = null

    /** Must be called off the main thread: prepare() is synchronous I/O
     *  and decoder setup. Returns false immediately if the data: URL
     *  itself is malformed; a failure that only shows up once the decoder
     *  actually runs is reported asynchronously through [onError] instead. */
    fun play(dataUrl: String, onError: () -> Unit, onCompletion: () -> Unit): Boolean {
        stop()
        val base64 = dataUrl.substringAfter("base64,", "")
        if (base64.isEmpty()) {
            NativeDebug.e("AudioPlayerController.play: not a base64 data: URL")
            return false
        }
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val mp = MediaPlayer()
            mp.setOnErrorListener { _, what, extra ->
                NativeDebug.e("AudioPlayerController playback error what=$what extra=$extra")
                onError()
                true
            }
            mp.setOnCompletionListener { onCompletion() }
            mp.setDataSource(ByteArrayMediaDataSource(bytes))
            mp.prepare()
            mp.start()
            player = mp
            true
        } catch (t: Throwable) {
            NativeDebug.e("AudioPlayerController.play failed", t)
            onError()
            false
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

    /** Safe to call even with nothing playing. Must be called when the
     *  screen goes away (see NoteDetailScreen's DisposableEffect): a
     *  MediaPlayer holds a real native decoder resource that is never
     *  reclaimed on its own just because Compose stopped referencing it. */
    fun stop() {
        val p = player
        player = null
        try {
            p?.stop()
        } catch (t: Throwable) {
            NativeDebug.e("AudioPlayerController.stop failed (ignored)", t)
        }
        try {
            p?.release()
        } catch (t: Throwable) {
            NativeDebug.e("AudioPlayerController.release failed (ignored)", t)
        }
    }
}
