/**
 * A small, dependency-free zip reader for the passport viewer.
 *
 * Reads the End Of Central Directory record (and its Zip64 form), walks the
 * central directory, and decompresses entries on demand: method 0 (stored)
 * and method 8 (deflate, via the browser's DecompressionStream). Nothing is
 * decompressed until it is asked for, so a zip with hundreds of images opens
 * quickly and only the files actually shown are inflated.
 */

export interface ZipEntry {
  /** Normalised path inside the zip, forward slashes, no leading folder strip. */
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

export class ZipError extends Error {}

const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export function looksLikeZip(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const v = new DataView(buf);
  const sig = v.getUint32(0, true);
  // Local file header, or an empty archive (EOCD only).
  return sig === SIG_LOCAL || sig === SIG_EOCD;
}

/** True when a path is unsafe: parent segments, absolute, or a drive letter. */
function isUnsafePath(name: string): boolean {
  if (name.startsWith("/")) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  return name.split("/").some((seg) => seg === "..");
}

export class ZipReader {
  private view: DataView;
  readonly entries: ZipEntry[] = [];
  /** Entries rejected for unsafe paths or unsupported features. */
  readonly skipped: { name: string; reason: string }[] = [];

  constructor(private buf: ArrayBuffer) {
    this.view = new DataView(buf);
    this.readDirectory();
  }

  private readDirectory() {
    const v = this.view;
    const len = this.buf.byteLength;
    if (len < 22) throw new ZipError("The file is too short to be a zip.");

    // EOCD sits in the last 22 bytes plus up to a 65535-byte comment.
    let eocd = -1;
    const stop = Math.max(0, len - 22 - 0xffff);
    for (let i = len - 22; i >= stop; i--) {
      if (v.getUint32(i, true) === SIG_EOCD) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipError("No zip directory found - the zip may be damaged or incomplete.");

    let count = v.getUint16(eocd + 10, true);
    let cdSize = v.getUint32(eocd + 12, true);
    let cdOffset = v.getUint32(eocd + 16, true);

    // Zip64: the locator sits just before the EOCD.
    if ((count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) && eocd >= 20) {
      const loc = eocd - 20;
      if (v.getUint32(loc, true) === SIG_ZIP64_LOCATOR) {
        const z64 = Number(v.getBigUint64(loc + 8, true));
        if (z64 + 56 <= len && v.getUint32(z64, true) === SIG_ZIP64_EOCD) {
          count = Number(v.getBigUint64(z64 + 32, true));
          cdSize = Number(v.getBigUint64(z64 + 40, true));
          cdOffset = Number(v.getBigUint64(z64 + 48, true));
        }
      }
    }
    if (cdOffset + cdSize > len) throw new ZipError("The zip directory points past the end of the file.");

    const dec = new TextDecoder("utf-8");
    let p = cdOffset;
    for (let n = 0; n < count; n++) {
      if (p + 46 > len || v.getUint32(p, true) !== SIG_CENTRAL) {
        throw new ZipError("The zip directory is damaged.");
      }
      const flags = v.getUint16(p + 8, true);
      const method = v.getUint16(p + 10, true);
      let compressedSize = v.getUint32(p + 20, true);
      let size = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      let localHeaderOffset = v.getUint32(p + 42, true);
      const rawName = dec.decode(new Uint8Array(this.buf, p + 46, nameLen));

      // Zip64 extended information extra field (0x0001).
      let e = p + 46 + nameLen;
      const eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        const id = v.getUint16(e, true);
        const sz = v.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (size === 0xffffffff && q + 8 <= e + 4 + sz) { size = Number(v.getBigUint64(q, true)); q += 8; }
          if (compressedSize === 0xffffffff && q + 8 <= e + 4 + sz) { compressedSize = Number(v.getBigUint64(q, true)); q += 8; }
          if (localHeaderOffset === 0xffffffff && q + 8 <= e + 4 + sz) { localHeaderOffset = Number(v.getBigUint64(q, true)); }
        }
        e += 4 + sz;
      }
      p += 46 + nameLen + extraLen + commentLen;

      // Some Windows tools write backslashes.
      const name = rawName.replace(/\\/g, "/");
      if (name.endsWith("/")) continue; // directory
      if (isUnsafePath(name)) {
        this.skipped.push({ name, reason: "unsafe path" });
        continue;
      }
      if (flags & 0x1) {
        this.skipped.push({ name, reason: "encrypted" });
        continue;
      }
      if (method !== 0 && method !== 8) {
        this.skipped.push({ name, reason: `compression method ${method} not supported` });
        continue;
      }
      this.entries.push({ name, method, flags, compressedSize, size, localHeaderOffset });
    }
  }

  /** Raw bytes of an entry, decompressed. */
  async read(entry: ZipEntry): Promise<Uint8Array> {
    const v = this.view;
    const off = entry.localHeaderOffset;
    if (off + 30 > this.buf.byteLength || v.getUint32(off, true) !== SIG_LOCAL) {
      throw new ZipError(`The zip entry ${entry.name} is damaged.`);
    }
    const nameLen = v.getUint16(off + 26, true);
    const extraLen = v.getUint16(off + 28, true);
    const start = off + 30 + nameLen + extraLen;
    const end = start + entry.compressedSize;
    if (end > this.buf.byteLength) throw new ZipError(`The zip entry ${entry.name} runs past the end of the file.`);
    const data = new Uint8Array(this.buf, start, entry.compressedSize);
    if (entry.method === 0) return data;
    if (typeof DecompressionStream === "undefined") {
      throw new ZipError("This browser cannot decompress zip files (no DecompressionStream). Try a current browser.");
    }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
}
