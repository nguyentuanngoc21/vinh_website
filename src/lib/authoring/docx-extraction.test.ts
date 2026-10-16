import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { extractDocx, validateDocxArchive } from "./docx-extraction";

function zip(entries: { name: string; value: string; declared?: number }[]) {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), plain = Buffer.from(entry.value), data = deflateRawSync(plain);
    let crc = 0xffffffff;
    for (const byte of plain) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(entry.declared ?? plain.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(entry.declared ?? plain.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    const part = Buffer.concat([local, name, data]); locals.push(part); centrals.push(Buffer.concat([central, name])); offset += part.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const document = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Bản thảo kiểm thử.</w:t></w:r></w:p></w:body></w:document>';
const fixture = () => zip([
  { name: "[Content_Types].xml", value: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: "_rels/.rels", value: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
  { name: "word/document.xml", value: document },
]);
describe("bounded DOCX extraction", () => {
  it("extracts a real minimal DOCX archive", async () => {
    expect((await extractDocx(fixture())).text).toContain("Bản thảo kiểm thử.");
  });
  it("rejects truncated/non-ZIP files", () => {
    expect(() => validateDocxArchive(Buffer.from("not zip"))).toThrow();
    expect(() => validateDocxArchive(fixture().subarray(0, 100))).toThrow();
  });
  it("bounds actual inflation even if ZIP metadata lies", () => {
    const archive = zip([{ name: "word/document.xml", value: "x".repeat(1000000), declared: 10 }]);
    expect(() => validateDocxArchive(archive)).toThrow();
  });
  it("rejects DTD/entity declarations and unsafe names", () => {
    for (const entry of [{ name: "word/document.xml", value: "<!DOCTYPE x>" }, { name: "../outside.xml", value: "x" }]) {
      expect(() => validateDocxArchive(zip([entry]))).toThrow();
    }
  });
  it("rejects declared expansion over budget before parsing", () => {
    expect(() => validateDocxArchive(zip([{ name: "word/document.xml", value: "x", declared: 13 * 1024 * 1024 }]))).toThrow();
  });
});
