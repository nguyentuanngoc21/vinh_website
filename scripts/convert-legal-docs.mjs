// One-off/rerunnable converter: turns the Word source docs in docs/ into
// static HTML modules under src/lib/legal/, which the site renders in the
// Terms/Privacy modal (see src/components/legal/legal-link.tsx) and in the
// "Cam kết & Thỏa thuận" tab (see src/components/profile/agreements-tab.tsx).
//
// Source filenames MUST end with " - UTD ddMMyyyy.docx" (UTD = "updated" —
// the date the .docx content was last revised, chosen by whoever edits the
// document, NOT the file's OS mtime). Every generated module exports that
// date as `<name>UpdatedAt` (ISO "yyyy-MM-dd") alongside the HTML. The app
// reads this to show "Ngày cập nhật" and to know when a user's earlier
// acceptance (recorded against a past UTD) is stale and must be re-confirmed
// — see src/lib/legal/registry.ts and migrations/20260828_add_agreement_acceptances.sql.
//
// Rerun this whenever a .docx source in docs/ is replaced with a newer
// revision (rename the file with its new UTD first, update the `source`
// path below, then run):
//   node scripts/convert-legal-docs.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "src", "lib", "legal");

const DOCS = [
  {
    source: path.join(ROOT, "docs", "Điều khoản sử dụng - UTD 03092026.docx"),
    outFile: "dieu-khoan-su-dung.ts",
    exportName: "dieuKhoanSuDungHtml",
  },
  {
    source: path.join(ROOT, "docs", "Chính sách bảo mật - UTD 03092026.docx"),
    outFile: "chinh-sach-bao-mat.ts",
    exportName: "chinhSachBaoMatHtml",
  },
  {
    source: path.join(ROOT, "docs", "Cam kết quyền sở hữu & chống đạo nhái - UTD 03092026.docx"),
    outFile: "cam-ket-quyen-so-huu.ts",
    exportName: "camKetQuyenSoHuuHtml",
  },
  {
    source: path.join(ROOT, "docs", "Chính sách hoạt động cho Tác giả - UTD 03092026.docx"),
    outFile: "chinh-sach-hoat-dong-tac-gia.ts",
    exportName: "chinhSachHoatDongTacGiaHtml",
  },
  {
    // Tên file/outFile/exportName vẫn giữ "chinh-sach-doc-quyen" (lịch sử —
    // trước khi có bản .docx thật, đây từng là 1 bản nháp viết tay cùng
    // tên) dù văn bản thật là 1 HỢP ĐỒNG, không phải "chính sách". Đổi lại
    // 3 chỗ này sẽ kéo theo đổi registry.ts's AgreementId, mọi hàng
    // agreement_acceptances đã lưu (agreement_id = 'chinh-sach-doc-quyen')
    // và exclusivity-agreement.ts — không đáng, vì đây chỉ là slug nội bộ.
    // Tên HIỂN THỊ thật ("Hợp đồng khai thác tác phẩm độc quyền") nằm ở
    // registry.ts, không phải ở đây.
    source: path.join(ROOT, "docs", "Hợp đồng khai thác tác phẩm độc quyền - UTD 03092026.docx"),
    outFile: "chinh-sach-doc-quyen.ts",
    exportName: "chinhSachDocQuyenHtml",
  },
  {
    source: path.join(ROOT, "docs", "Bộ quy tắc giao dịch Commission - UTD 03092026.docx"),
    outFile: "bo-quy-tac-commission.ts",
    exportName: "boQuyTacCommissionHtml",
  },
];

// Từ bản UTD 03092026 trở đi, các dòng "Nhãn: ....." cần tự điền (Họ và
// tên, CCCD, Địa chỉ...) không còn gõ dấu chấm thật trong .docx — được
// thay bằng viền dưới đoạn văn (Word: "Borders > Bottom Border" áp cho cả
// paragraph) để nhìn liền mạch hơn. mammoth không có mapping cho paragraph
// border nên bản HTML sinh ra mất sạch dấu hiệu "đây là chỗ trống", khiến
// cả phần hiển thị (đường kẻ) lẫn fillOne() (cần dấu chấm để nhận diện chỗ
// trống, xem fill-party-blanks.ts) đều hỏng.
//
// Khôi phục bằng cách chèn lại dấu chấm: paragraph nào có toàn bộ nội dung
// là "<strong>Nhãn:</strong>" (không có gì khác sau dấu ":") — đúng hình
// dạng 1 dòng trống kiểu này — được coi là 1 chỗ cần điền, bất kể có khai
// báo tự điền ở AGREEMENT_PARTY_INFO hay không (có những dòng dạng này chưa
// có nguồn dữ liệu để tự điền, ví dụ "Phương án được lựa chọn" ở Điều 4 hợp
// đồng khai thác độc quyền — vẫn cần hiện đường chấm để người đọc biết đây
// là chỗ trống, chỉ là phải điền tay/qua kênh khác, không phải lỗi hiển
// thị). Đã rà bằng tay qua cả 6 văn bản UTD 03092026 để chắc quy tắc này
// không khớp nhầm bất kỳ đoạn nào khác (không có đoạn nội dung thật nào
// hình dạng "<strong>cụm ngắn:</strong>" đứng riêng 1 mình).
const BLANK_LINE_DOTS = "....................................";

function restoreBorderBlankLines(html) {
  // Dấu chấm đặt SAU </strong> (không in đậm) — giữ đúng kiểu trình bày cũ
  // "<strong>Họ và tên:</strong> ....." (xem src/lib/legal/cam-ket-quyen-so-huu.ts
  // bản trước UTD 03092026), không phải in đậm cả cụm dấu chấm.
  return html.replace(/(<p><strong>[^<:]{1,60}:)\s*<\/strong><\/p>/g, `$1</strong> ${BLANK_LINE_DOTS}</p>`);
}

// "... - UTD 22082026.docx" -> { key: "22082026", iso: "2026-08-22", label: "22-08-2026" }
function parseUtd(fileName) {
  const match = /UTD\s*(\d{2})(\d{2})(\d{4})\.docx$/.exec(fileName);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return { key: `${dd}${mm}${yyyy}`, iso: `${yyyy}-${mm}-${dd}`, label: `${dd}-${mm}-${yyyy}` };
}

async function convertOne({ source, outFile, exportName }) {
  const utd = parseUtd(path.basename(source));
  if (!utd) {
    throw new Error(
      `"${path.basename(source)}" thiếu hậu tố " - UTD ddMMyyyy.docx" (ví dụ " - UTD 22082026.docx") — ` +
        `không xác định được ngày cập nhật cho tài liệu này.`
    );
  }

  const buffer = await readFile(source);
  const { value: rawHtml, messages } = await mammoth.convertToHtml(
    { buffer },
    { includeDefaultStyleMap: true },
  );
  const html = restoreBorderBlankLines(rawHtml);

  for (const message of messages) {
    if (message.type === "warning") {
      console.warn(`[${path.basename(source)}] ${message.message}`);
    }
  }

  const updatedAtExport = `${exportName.replace(/Html$/, "")}UpdatedAt`;
  const contents = `// Auto-generated by scripts/convert-legal-docs.mjs from
// "${path.relative(ROOT, source).replace(/\\/g, "/")}".
// Do not edit by hand — update the .docx source (keep the " - UTD ddMMyyyy"
// filename suffix current) and rerun the script instead.

export const ${exportName} = ${JSON.stringify(html)};

// Ngày cập nhật nội dung, đọc từ hậu tố "UTD ${utd.key}" trong tên file nguồn.
export const ${updatedAtExport} = ${JSON.stringify(utd.iso)};
`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, outFile), contents, "utf8");
  console.log(`Wrote src/lib/legal/${outFile} (updated: ${utd.label})`);
}

for (const doc of DOCS) {
  await convertOne(doc);
}
