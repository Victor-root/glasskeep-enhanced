package com.glasskeep.app.nativeapp

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import de.sciss.jump3r.mp3.BitStream
import de.sciss.jump3r.mp3.GainAnalysis
import de.sciss.jump3r.mp3.ID3Tag
import de.sciss.jump3r.mp3.Lame
import de.sciss.jump3r.mp3.LameGlobalFlags
import de.sciss.jump3r.mp3.MPEGMode
import de.sciss.jump3r.mp3.Presets
import de.sciss.jump3r.mp3.Quantize
import de.sciss.jump3r.mp3.QuantizePVT
import de.sciss.jump3r.mp3.Reservoir
import de.sciss.jump3r.mp3.Takehiro
import de.sciss.jump3r.mp3.VBRTag
import de.sciss.jump3r.mp3.Version
import de.sciss.jump3r.mpg.Common
import de.sciss.jump3r.mpg.Interface
import de.sciss.jump3r.mpg.MPGLib
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.min

/**
 * audioConvert.js natively: a clip decoded by the platform's own demuxer
 * and codecs (where the web calls decodeAudioData), then written as 16-bit
 * PCM WAV, or encoded to MP3 at 192 kbps by jump3r, a Java port of the
 * same LAME encoder the web bundles as lamejs. Like the web, at most the
 * first two channels are kept. Decoded audio streams straight to the file,
 * so a long clip never sits in memory as raw PCM.
 *
 * Both writers throw when the clip cannot be decoded or encoded: the
 * caller then falls back to the original file, as the web does.
 */
internal object AudioTranscoder {
    fun writeWav(source: ByteArray, target: File) {
        var dataBytes = 0L
        var bytes = ByteArray(0)
        val format = FileOutputStream(target).buffered().use { out ->
            out.write(ByteArray(WavHeaderBytes))
            decode(source) { format, samples, frames ->
                val count = frames * format.channels * 2
                if (bytes.size < count) bytes = ByteArray(count)
                ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(samples, 0, count / 2)
                out.write(bytes, 0, count)
                dataBytes += count
            }
        }
        check(dataBytes <= MaxWavDataBytes) { "too long for a WAV file" }
        RandomAccessFile(target, "rw").use { it.write(wavHeader(format, dataBytes)) }
    }

    fun writeMp3(source: ByteArray, target: File) {
        FileOutputStream(target).buffered().use { out ->
            var encoder: Mp3Encoder? = null
            try {
                decode(source) { format, samples, frames ->
                    val mp3 = encoder ?: Mp3Encoder(format).also { encoder = it }
                    mp3.encode(samples, frames, out)
                }
                encoder?.finish(out)
            } finally {
                encoder?.close()
            }
        }
    }

    /**
     * Runs [source] through the platform decoder and hands over each
     * decoded block as interleaved 16-bit samples of its first two
     * channels, with its format and frame count. Returns that format;
     * throws when nothing could be decoded or the format changes midway.
     */
    private fun decode(source: ByteArray, onBlock: (PcmFormat, ShortArray, Int) -> Unit): PcmFormat {
        val extractor = MediaExtractor()
        var decoder: MediaCodec? = null
        try {
            extractor.setDataSource(ByteArrayMediaDataSource(source))
            val track = (0 until extractor.trackCount).firstOrNull { index ->
                extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            } ?: throw IllegalArgumentException("no audio track")
            extractor.selectTrack(track)
            val trackFormat = extractor.getTrackFormat(track)
            val codec = MediaCodec.createDecoderByType(checkNotNull(trackFormat.getString(MediaFormat.KEY_MIME)))
            decoder = codec
            codec.configure(trackFormat, null, null, 0)
            codec.start()
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var decoded: PcmFormat? = null
            var samples = ShortArray(0)
            while (true) {
                if (!inputDone) {
                    val inIndex = codec.dequeueInputBuffer(DequeueTimeoutUs)
                    if (inIndex >= 0) {
                        val size = extractor.readSampleData(checkNotNull(codec.getInputBuffer(inIndex)), 0)
                        if (size < 0) {
                            codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }
                val outIndex = codec.dequeueOutputBuffer(info, DequeueTimeoutUs)
                if (outIndex < 0) continue
                if (info.size > 0) {
                    val outputFormat = codec.getOutputFormat(outIndex)
                    val sourceChannels = outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    val format = PcmFormat(outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE), min(2, sourceChannels))
                    if (decoded == null) decoded = format else check(format == decoded) { "the format changed midway" }
                    val encoding = if (outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                        outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
                    } else {
                        AudioFormat.ENCODING_PCM_16BIT
                    }
                    val buffer = checkNotNull(codec.getOutputBuffer(outIndex)).order(ByteOrder.nativeOrder())
                    buffer.position(info.offset)
                    buffer.limit(info.offset + info.size)
                    val frames: Int
                    when (encoding) {
                        AudioFormat.ENCODING_PCM_16BIT -> {
                            val pcm = buffer.asShortBuffer()
                            frames = pcm.remaining() / sourceChannels
                            if (samples.size < frames * format.channels) samples = ShortArray(frames * format.channels)
                            for (frame in 0 until frames) {
                                for (channel in 0 until format.channels) {
                                    samples[frame * format.channels + channel] = pcm.get(frame * sourceChannels + channel)
                                }
                            }
                        }
                        AudioFormat.ENCODING_PCM_FLOAT -> {
                            val pcm = buffer.asFloatBuffer()
                            frames = pcm.remaining() / sourceChannels
                            if (samples.size < frames * format.channels) samples = ShortArray(frames * format.channels)
                            for (frame in 0 until frames) {
                                for (channel in 0 until format.channels) {
                                    samples[frame * format.channels + channel] = floatToInt16(pcm.get(frame * sourceChannels + channel))
                                }
                            }
                        }
                        else -> throw IllegalStateException("unsupported PCM encoding $encoding")
                    }
                    onBlock(format, samples, frames)
                }
                codec.releaseOutputBuffer(outIndex, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
            }
            return decoded ?: throw IllegalStateException("nothing decoded")
        } finally {
            decoder?.release()
            extractor.release()
        }
    }

    /** floatToInt16 (audioConvert.js:137-144): clamped, then scaled to
     *  0x8000 below zero and 0x7fff above. */
    private fun floatToInt16(sample: Float): Short {
        val s = sample.coerceIn(-1f, 1f)
        return (if (s < 0f) s * 0x8000 else s * 0x7fff).toInt().toShort()
    }

    /** encodeWavFromAudioBuffer's RIFF header (audioConvert.js:71-86). */
    private fun wavHeader(format: PcmFormat, dataBytes: Long): ByteArray {
        val blockAlign = format.channels * 2
        return ByteBuffer.allocate(WavHeaderBytes).order(ByteOrder.LITTLE_ENDIAN)
            .put("RIFF".toByteArray(Charsets.US_ASCII))
            .putInt((36 + dataBytes).toInt())
            .put("WAVE".toByteArray(Charsets.US_ASCII))
            .put("fmt ".toByteArray(Charsets.US_ASCII))
            .putInt(16)
            .putShort(1)
            .putShort(format.channels.toShort())
            .putInt(format.sampleRate)
            .putInt(format.sampleRate * blockAlign)
            .putShort(blockAlign.toShort())
            .putShort(16)
            .put("data".toByteArray(Charsets.US_ASCII))
            .putInt(dataBytes.toInt())
            .array()
    }

    private const val WavHeaderBytes = 44
    private const val MaxWavDataBytes = 0xFFFFFFFFL - 36
    private const val DequeueTimeoutUs = 10_000L
}

/** A decoded clip's sample rate and kept channel count (one or two). */
private data class PcmFormat(val sampleRate: Int, val channels: Int)

/**
 * lamejs's Mp3Encoder on jump3r: LAME's modules wired as jump3r's own
 * LameEncoder wires them (minus its file-reading front end), with the web's
 * settings: 192 kbps, stereo mode, quality 3, no VBR tag, no bit
 * reservoir, no automatic ID3 tag. Fed 1152 frames at a time, one MPEG
 * frame, as audioConvert.js feeds it.
 */
private class Mp3Encoder(format: PcmFormat) {
    private val channels = format.channels
    private val lame = Lame()
    private val flags: LameGlobalFlags
    private val left = IntArray(Mp3BlockFrames)
    private val right = IntArray(Mp3BlockFrames)
    private var filled = 0
    private val output = ByteArray((1.25 * Mp3BlockFrames + 7200).toInt())

    init {
        val gain = GainAnalysis()
        val bits = BitStream()
        val presets = Presets()
        val quantizePvt = QuantizePVT()
        val quantize = Quantize()
        val vbrTag = VBRTag()
        val version = Version()
        val id3 = ID3Tag()
        val reservoir = Reservoir()
        val takehiro = Takehiro()
        val mpg = MPGLib()
        val mpgInterface = Interface()
        val common = Common()
        lame.setModules(gain, bits, presets, quantizePvt, quantize, vbrTag, version, id3, mpg)
        bits.setModules(gain, mpg, version, vbrTag)
        id3.setModules(bits, version)
        presets.setModules(lame)
        quantize.setModules(bits, reservoir, quantizePvt, takehiro)
        quantizePvt.setModules(takehiro, reservoir, lame.enc.psy)
        reservoir.setModules(bits)
        takehiro.setModules(quantizePvt)
        vbrTag.setModules(lame, bits, version)
        mpg.setModules(mpgInterface, common)
        mpgInterface.setModules(vbrTag, common)
        flags = lame.lame_init().apply {
            num_channels = channels
            in_samplerate = format.sampleRate
            brate = 192
            mode = MPEGMode.STEREO
            quality = 3
            bWriteVbrTag = false
            disable_reservoir = true
            write_id3tag_automatic = false
        }
        check(lame.lame_init_params(flags) >= 0) { "LAME refused $channels channel(s) at ${format.sampleRate} Hz" }
    }

    /** [frames] interleaved frames of [samples]; LAME reads samples
     *  scaled up by 2^16. A mono clip repeats its channel, as lamejs does. */
    fun encode(samples: ShortArray, frames: Int, out: OutputStream) {
        for (frame in 0 until frames) {
            val l = samples[frame * channels].toInt() shl 16
            left[filled] = l
            right[filled] = if (channels > 1) samples[frame * channels + 1].toInt() shl 16 else l
            if (++filled == Mp3BlockFrames) encodeBlock(out)
        }
    }

    fun finish(out: OutputStream) {
        if (filled > 0) encodeBlock(out)
        val size = lame.lame_encode_flush(flags, output, 0, output.size)
        check(size >= 0) { "LAME flush failed ($size)" }
        out.write(output, 0, size)
    }

    fun close() {
        lame.lame_close(flags)
    }

    private fun encodeBlock(out: OutputStream) {
        val size = lame.lame_encode_buffer_int(flags, left, right, filled, output, 0, output.size)
        check(size >= 0) { "LAME encoding failed ($size)" }
        out.write(output, 0, size)
        filled = 0
    }
}

private const val Mp3BlockFrames = 1152
