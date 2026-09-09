package com.glasskeep.app.nativeapp

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sin

/**
 * The notification "ding", synthesised rather than shipped as an asset,
 * exactly like the web's own notificationSound.js: two soft sine tones
 * (880 Hz then 660 Hz) at low gain, 8 ms attack and an exponential decay.
 * Same frequencies, same offsets, same durations, same gains, so the
 * phone makes the sound the browser makes.
 *
 * The samples are computed once and kept, then handed to a fresh
 * AudioTrack per play: a static AudioTrack cannot be restarted from its
 * beginning reliably across versions, and one short buffer is cheap.
 */
object NotificationDing {
    private const val SAMPLE_RATE = 44_100

    /** The web's own blip() calls: frequency, start offset, duration, peak
     *  gain (notificationSound.js:51-52). */
    private val BLIPS = listOf(
        Blip(880.0, 0.0, 0.140, 0.05),
        Blip(660.0, 0.07, 0.200, 0.04),
    )

    private data class Blip(
        val frequency: Double,
        val startSeconds: Double,
        val durationSeconds: Double,
        val peakGain: Double,
    )

    private val samples: ShortArray by lazy { render() }

    fun play() {
        try {
            val data = samples
            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build(),
                )
                .setBufferSizeInBytes(data.size * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()
            track.write(data, 0, data.size)
            track.setNotificationMarkerPosition(data.size)
            track.setPlaybackPositionUpdateListener(
                object : AudioTrack.OnPlaybackPositionUpdateListener {
                    override fun onMarkerReached(playedTrack: AudioTrack?) {
                        playedTrack?.release()
                    }

                    override fun onPeriodicNotification(playedTrack: AudioTrack?) = Unit
                },
            )
            track.play()
        } catch (t: Throwable) {
            NativeDebug.e("NotificationDing.play failed", t)
        }
    }

    private fun render(): ShortArray {
        val tail = 0.02
        val totalSeconds = BLIPS.maxOf { it.startSeconds + it.durationSeconds } + tail
        val out = ShortArray((totalSeconds * SAMPLE_RATE).toInt())
        for (blip in BLIPS) {
            val start = (blip.startSeconds * SAMPLE_RATE).toInt()
            val length = (blip.durationSeconds * SAMPLE_RATE).toInt()
            for (i in 0 until length) {
                val index = start + i
                if (index >= out.size) break
                val seconds = i.toDouble() / SAMPLE_RATE
                val value = sin(2.0 * PI * blip.frequency * seconds) * envelope(blip, seconds)
                val mixed = out[index] + (value * Short.MAX_VALUE)
                out[index] = mixed.coerceIn(Short.MIN_VALUE.toDouble(), Short.MAX_VALUE.toDouble()).toInt().toShort()
            }
        }
        return out
    }

    /** The Web Audio envelope this reproduces: exponentialRampToValueAtTime
     *  from a near-zero floor up to the peak over the first 8 ms, then back
     *  down to that floor over the rest of the blip. */
    private fun envelope(blip: Blip, seconds: Double): Double {
        val floor = 0.0001
        val attack = 0.008
        return if (seconds < attack) {
            exponentialRamp(floor, blip.peakGain, seconds / attack)
        } else {
            val remaining = (blip.durationSeconds - attack).coerceAtLeast(0.0001)
            exponentialRamp(blip.peakGain, floor, ((seconds - attack) / remaining).coerceAtMost(1.0))
        }
    }

    private fun exponentialRamp(from: Double, to: Double, progress: Double): Double =
        from * exp(ln(to / from) * progress)
}
