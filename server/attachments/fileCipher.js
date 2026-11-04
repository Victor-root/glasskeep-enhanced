// server/attachments/fileCipher.js
//
// At-rest encryption of attachment files, as streams: a file can be far
// bigger than what fits in memory, so it is cut into frames sealed one by
// one with the instance's data key.
//
// On disk: MAGIC, then frames of
//   flag (1 byte, 1 on the last frame) | length (4 bytes, big endian)
//   | iv | tag | ciphertext
// Each frame's additional data binds it to the file, to its rank and to
// the flag, so frames cannot be swapped, replayed in another file or cut
// off the end without the open failing. A file always ends on a flagged
// frame, even an empty one.

const { Transform } = require("stream");
const aead = require("../encryption/aeadGcm");

const MAGIC = Buffer.from("GKAF1\n", "latin1");
const FRAME_BYTES = 1024 * 1024;
const FRAME_HEADER = 1 + 4 + aead.IV_LENGTH + aead.TAG_LENGTH;

const frameAad = (fileId, index, last) =>
  Buffer.from(`glasskeep|attachment-file|v1|${fileId}|${index}|${last ? 1 : 0}`, "utf8");

function sealFrame(key, fileId, index, plain, last) {
  const { iv, ct, tag } = aead.encrypt(key, plain, frameAad(fileId, index, last));
  const head = Buffer.alloc(5);
  head[0] = last ? 1 : 0;
  head.writeUInt32BE(ct.length, 1);
  return Buffer.concat([head, iv, tag, ct]);
}

function createEncryptStream(key, fileId) {
  let pending = [];
  let pendingBytes = 0;
  let index = 0;

  // Holds back at least one byte: the last frame has to be known as such.
  const drain = (stream) => {
    while (pendingBytes > FRAME_BYTES) {
      const all = Buffer.concat(pending, pendingBytes);
      stream.push(sealFrame(key, fileId, index++, all.subarray(0, FRAME_BYTES), false));
      pending = [all.subarray(FRAME_BYTES)];
      pendingBytes = pending[0].length;
    }
  };

  const stream = new Transform({
    transform(chunk, _enc, done) {
      try {
        pending.push(chunk);
        pendingBytes += chunk.length;
        drain(this);
        done();
      } catch (e) {
        done(e);
      }
    },
    flush(done) {
      try {
        this.push(sealFrame(key, fileId, index, Buffer.concat(pending, pendingBytes), true));
        done();
      } catch (e) {
        done(e);
      }
    },
  });
  stream.push(MAGIC);
  return stream;
}

function createDecryptStream(key, fileId) {
  let buffered = Buffer.alloc(0);
  let index = 0;
  let sawMagic = false;
  let finished = false;

  return new Transform({
    transform(chunk, _enc, done) {
      try {
        buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
        if (!sawMagic) {
          if (buffered.length < MAGIC.length) return done();
          if (!buffered.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not an encrypted attachment");
          buffered = buffered.subarray(MAGIC.length);
          sawMagic = true;
        }
        while (buffered.length >= FRAME_HEADER) {
          if (finished) throw new Error("Data after the last frame");
          const last = buffered[0] === 1;
          const length = buffered.readUInt32BE(1);
          if (length > FRAME_BYTES + aead.TAG_LENGTH) throw new Error("Oversized frame");
          if (buffered.length < FRAME_HEADER + length) break;
          const iv = buffered.subarray(5, 5 + aead.IV_LENGTH);
          const tag = buffered.subarray(5 + aead.IV_LENGTH, FRAME_HEADER);
          const ct = buffered.subarray(FRAME_HEADER, FRAME_HEADER + length);
          this.push(aead.decrypt(key, iv, ct, tag, frameAad(fileId, index++, last)));
          buffered = buffered.subarray(FRAME_HEADER + length);
          finished = last;
        }
        done();
      } catch (e) {
        done(e);
      }
    },
    flush(done) {
      done(finished && buffered.length === 0 ? null : new Error("Truncated attachment"));
    },
  });
}

module.exports = { createEncryptStream, createDecryptStream };
