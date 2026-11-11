// Reads a ZIP archive the user picked without loading it into memory: only
// its directory is read, and a stored entry is handed back as a slice of
// the file. A backup with its attachments can weigh gigabytes.

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const ZIP64_EXTRA = 0x0001;
const MAX_COMMENT = 0xffff;

const utf8 = new TextDecoder();

async function view(file, start, length) {
  return new DataView(await file.slice(start, start + length).arrayBuffer());
}

const u64 = (dv, at) => Number(dv.getBigUint64(at, true));

/** True when the file starts like a ZIP archive. */
export async function isZip(file) {
  if (file.size < 4) return false;
  return (await view(file, 0, 4)).getUint32(0, true) === LOCAL;
}

async function directory(file) {
  const tailLength = Math.min(file.size, 22 + MAX_COMMENT);
  const tailStart = file.size - tailLength;
  const tail = await view(file, tailStart, tailLength);
  let at = tailLength - 22;
  while (at >= 0 && tail.getUint32(at, true) !== EOCD) at--;
  if (at < 0) throw new Error("Not a ZIP archive");

  let count = tail.getUint16(at + 10, true);
  let size = tail.getUint32(at + 12, true);
  let offset = tail.getUint32(at + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locator = at - 20;
    if (locator < 0 || tail.getUint32(locator, true) !== ZIP64_LOCATOR) throw new Error("Not a ZIP archive");
    const record = await view(file, u64(tail, locator + 8), 56);
    if (record.getUint32(0, true) !== ZIP64_EOCD) throw new Error("Not a ZIP archive");
    count = u64(record, 32);
    size = u64(record, 40);
    offset = u64(record, 48);
  }
  return { count, size, offset };
}

/** The archive's files by path: { path, method, compressedSize, size, headerOffset }. */
export async function readZipEntries(file) {
  const { count, size, offset } = await directory(file);
  const dv = await view(file, offset, size);
  const entries = new Map();
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(at, true) !== CENTRAL) throw new Error("Damaged ZIP archive");
    const flags = dv.getUint16(at + 8, true);
    const method = dv.getUint16(at + 10, true);
    let compressedSize = dv.getUint32(at + 20, true);
    let uncompressedSize = dv.getUint32(at + 24, true);
    const nameLength = dv.getUint16(at + 28, true);
    const extraLength = dv.getUint16(at + 30, true);
    const commentLength = dv.getUint16(at + 32, true);
    let headerOffset = dv.getUint32(at + 42, true);
    const path = utf8.decode(new Uint8Array(dv.buffer, dv.byteOffset + at + 46, nameLength));

    // The ZIP64 field only holds the values its header could not.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = dv.getUint16(extra, true);
      const length = dv.getUint16(extra + 2, true);
      if (id === ZIP64_EXTRA) {
        let field = extra + 4;
        if (uncompressedSize === 0xffffffff) { uncompressedSize = u64(dv, field); field += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(dv, field); field += 8; }
        if (headerOffset === 0xffffffff) headerOffset = u64(dv, field);
      }
      extra += 4 + length;
    }

    const encrypted = (flags & 1) === 1;
    if (!path.endsWith("/") && !encrypted && (method === 0 || method === 8)) {
      entries.set(path, { path, method, compressedSize, size: uncompressedSize, headerOffset });
    }
    at = extraEnd + commentLength;
  }
  return entries;
}

/** The contents of one entry, as a Blob. */
export async function zipEntryBlob(file, entry) {
  const header = await view(file, entry.headerOffset, 30);
  if (header.getUint32(0, true) !== LOCAL) throw new Error("Damaged ZIP archive");
  const start = entry.headerOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const data = file.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  return new Response(data.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
}
