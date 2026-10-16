import { inflateRawSync } from "node:zlib";
import mammoth from "mammoth";
import { extractHeadingChapters } from "./split-chapters";

export class InvalidDocxError extends Error {}
const MAX_EXPANDED = 12 * 1024 * 1024;
export const MAX_IMPORT_RESULT_BYTES = 2 * 1024 * 1024;

/** Bound actual decompression before the document parser sees any archive entries. */
export function validateDocxArchive(buffer: Buffer) {
  const fail = (): never => { throw new InvalidDocxError("File DOCX không hợp lệ hoặc vượt giới hạn xử lý."); };
  if (buffer.length < 22 || buffer.length > 4 * 1024 * 1024) fail();
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0) fail();
  const count = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const central = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || buffer.readUInt16LE(end + 8) !== count ||
      count < 1 || count > 256 || central + centralSize !== end) fail();
  let cursor = central, total = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) fail();
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20), expanded = buffer.readUInt32LE(cursor + 24);
    const nameSize = buffer.readUInt16LE(cursor + 28), extra = buffer.readUInt16LE(cursor + 30), comment = buffer.readUInt16LE(cursor + 32);
    const local = buffer.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameSize + extra + comment > end || (flags & 1) || ![0, 8].includes(method) ||
        buffer.readUInt16LE(cursor + 34) !== 0 || total + expanded > MAX_EXPANDED || local + 30 > central) fail();
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameSize);
    const name = nameBytes.toString("utf8");
    if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || name.split("/").includes("..") || names.has(name)) fail();
    names.add(name);
    if (buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 8) !== method || buffer.readUInt16LE(local + 6) !== flags) fail();
    const localNameSize = buffer.readUInt16LE(local + 26);
    const start = local + 30 + localNameSize + buffer.readUInt16LE(local + 28);
    if (start + compressed > central || !buffer.subarray(local + 30, local + 30 + localNameSize).equals(nameBytes)) fail();
    const raw = buffer.subarray(start, start + compressed);
    let content: Buffer;
    try { content = method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: Math.max(1, expanded + 1) }); }
    catch { fail(); }
    if (content!.length !== expanded) fail();
    if (/\.(xml|rels)$/i.test(name)) {
      if (content![0] === 0xff || content![0] === 0xfe || /<!DOCTYPE|<!ENTITY/i.test(content!.toString("utf8"))) fail();
    }
    total += expanded;
    cursor += 46 + nameSize + extra + comment;
  }
  if (cursor !== end || !names.has("[Content_Types].xml") || !names.has("word/document.xml")) fail();
}

export async function extractDocx(buffer: Buffer) {
  validateDocxArchive(buffer);
  const raw = await mammoth.extractRawText({ buffer });
  if (!raw.value.trim() || raw.value.length > 500_000) throw new InvalidDocxError("Bản thảo rỗng hoặc quá dài để nhập trong một lượt.");
  const html = await mammoth.convertToHtml({ buffer }, {
    externalFileAccess: false,
    convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
  });
  if (Buffer.byteLength(html.value) > MAX_IMPORT_RESULT_BYTES) throw new InvalidDocxError("Bản thảo có quá nhiều định dạng.");
  const result = { text: raw.value, headingChapters: extractHeadingChapters(html.value) };
  if (result.headingChapters.length > 300 || Buffer.byteLength(JSON.stringify(result)) > MAX_IMPORT_RESULT_BYTES) {
    throw new InvalidDocxError("Bản thảo quá dài. Vui lòng chia thành các file nhỏ hơn.");
  }
  return result;
}
