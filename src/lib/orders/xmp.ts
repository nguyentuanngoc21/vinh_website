/**
 * Nhúng 1 gói XMP thô vào file PNG dưới dạng chunk `iTXt` (đúng quy ước
 * Adobe: keyword "XML:com.adobe.xmp") — sharp 0.35 KHÔNG có API ghi XMP
 * tuỳ ý (chỉ giữ được EXIF/ICC gốc qua withMetadata()), nên tự thao tác
 * buffer PNG ở đây thay vì thêm 1 dependency chỉ để làm việc này.
 *
 * Đây là metadata KHAI BÁO thiện chí ("không cho phép huấn luyện AI"),
 * KHÔNG PHẢI cơ chế chặn kỹ thuật — công cụ scrape/train ảnh không bị
 * BẮT BUỘC phải đọc/tôn trọng trường này. Ghi rõ điều này ở
 * watermark.ts, không hứa hẹn quá mức với người dùng.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// CRC32 chuẩn (bảng tra cứu), dùng cho CRC bắt buộc ở cuối mỗi PNG chunk —
// tự viết thay vì phụ thuộc zlib.crc32 (Node không expose hàm này ra API
// công khai của module zlib).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Chèn 1 chunk `iTXt` chứa gói XMP ngay sau IHDR (đúng vị trí PNG spec
 * cho phép mọi ancillary chunk trước IDAT đầu tiên). */
export function injectPngXmp(png: Buffer, xmpPacket: string): Buffer {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("injectPngXmp: input is not a PNG buffer");
  }

  // IHDR luôn là chunk đầu tiên, dài cố định: 8 (signature) + 4 (length)
  // + 4 (type) + 13 (data) + 4 (crc) = 33 byte.
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;

  // iTXt: keyword\0 compressionFlag compressionMethod language\0 translatedKeyword\0 text
  const keyword = Buffer.from("XML:com.adobe.xmp", "ascii");
  const text = Buffer.from(xmpPacket, "utf8");
  const data = Buffer.concat([
    keyword,
    Buffer.from([0x00]), // null terminator sau keyword
    Buffer.from([0x00]), // compression flag = 0 (không nén)
    Buffer.from([0x00]), // compression method = 0
    Buffer.from([0x00]), // language tag rỗng + null terminator
    Buffer.from([0x00]), // translated keyword rỗng + null terminator
    text,
  ]);
  const chunk = buildChunk("iTXt", data);

  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}
