import type { AgreementPartyInfo, AuthorInfoKey, PlatformInfoKey } from "./contract-parties";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Điền 1 field vào dòng "Nhãn: ....." đầu tiên còn lại trong `html`.
 * KHÔNG dùng cờ `g` — .replace() không global chỉ khớp LẦN XUẤT HIỆN
 * ĐẦU TIÊN, đây chính là cơ chế giúp các nhãn LẶP LẠI (Địa chỉ, Điện
 * thoại, Email xuất hiện cả ở khối Bên A lẫn Bên B) không bị điền nhầm —
 * xem giải thích thứ tự gọi ở fillPartyBlanksIntoHtml() bên dưới.
 *
 * value rỗng/null -> điền "(chưa cập nhật)" thay vì để nguyên dấu chấm —
 * rõ với người đọc đây là chỗ CÓ THỂ điền, chỉ là chưa có dữ liệu, không
 * phải lỗi hiển thị.
 */
function fillOne(html: string, label: string, rawValue: string | null | undefined): string {
  const display = rawValue ? escapeHtml(rawValue) : "(chưa cập nhật)";
  // "i" vì 1 vài nhãn trong văn bản gốc viết thường giữa câu (vd "cấp
  // ngày" trong dòng "Số CCCD/Hộ chiếu: ..... cấp ngày: ....."), khác
  // hoa/thường với nhãn hiển thị "Cấp ngày" dùng chung cho khối tóm tắt.
  //
  // "(?:<[^>]+>\\s*)*" giữa dấu ":" và chuỗi dấu chấm — nhãn có thể được
  // bọc <strong>...</strong> (cam-ket-quyen-so-huu.ts) hay để trần
  // (chinh-sach-doc-quyen.ts), nên thẻ đóng có thể nằm NGAY SAU dấu ":"
  // trước khi tới các dấu chấm; không có phần này thì bản có
  // <strong>Nhãn:</strong> ..... không khớp được.
  const pattern = new RegExp(`(${escapeRegExp(label)}\\s*:\\s*(?:<[^>]+>\\s*)*)\\.{4,}`, "i");
  return html.replace(pattern, `$1<u>${display}</u>`);
}

/**
 * Điền 1 field spec vào `html` — tự phân biệt field thường (1 field = 1
 * chỗ trống, dùng thẳng `values[key]`) với field `mergedWith` (2 field hồ
 * sơ gộp chung 1 chỗ trống, vd "Số CCCD/Hộ chiếu, cấp ngày" — xem comment
 * `mergedWith` ở contract-parties.ts): CHỈ ghép chuỗi khi CẢ HAI giá trị
 * đều có, để tránh điền nửa vời kiểu "001234567, cấp ngày (chưa cập
 * nhật)" — thiếu 1 trong 2 thì coi cả dòng là chưa có gì, giữ nguyên
 * fallback "(chưa cập nhật)" của fillOne().
 */
function fillField<K extends string>(
  html: string,
  field: { key: K; label: string; mergedWith?: { key: K; join: (primary: string, extra: string) => string } },
  source: Record<K, string | null | undefined>
): string {
  const primary = source[field.key];
  if (field.mergedWith) {
    const extra = source[field.mergedWith.key];
    return fillOne(html, field.label, primary && extra ? field.mergedWith.join(primary, extra) : null);
  }
  return fillOne(html, field.label, primary);
}

/**
 * Điền trực tiếp vào các dòng "....." NẰM TRONG chính nội dung văn bản
 * (không chỉ ở khối tóm tắt "Thông tin các bên" phía trên nó) — dùng
 * đúng field/nhãn đã khai báo cho văn bản đó ở contract-parties.ts.
 *
 * An toàn với nhãn lặp lại (Địa chỉ/Điện thoại/Email xuất hiện ở CẢ Bên A
 * lẫn Bên B) nhờ 2 điều: (1) mỗi fillOne() chỉ khớp lần xuất hiện ĐẦU
 * TIÊN còn lại, và lần khớp đó bị "tiêu thụ" (dấu chấm biến mất) nên lần
 * gọi kế tiếp cho CÙNG NHÃN đó tự nhiên rơi vào lần xuất hiện tiếp theo;
 * (2) xử lý TOÀN BỘ field của Bên A xong mới tới Bên B — đúng thứ tự
 * xuất hiện thật trong văn bản (khối Bên A luôn đứng trước khối Bên B ở
 * đầu hợp đồng). Không đụng tới bất kỳ chỗ trống nào khác xuất hiện SAU
 * 2 khối này (vd Điều 19 - Thông báo có "Email:"/"Số điện thoại:" riêng)
 * — cố tình để nguyên, vì không chắc field đó cùng ý nghĩa hay không.
 */
export function fillPartyBlanksIntoHtml(
  html: string,
  spec: AgreementPartyInfo,
  values: {
    author: Record<AuthorInfoKey, string | null | undefined>;
    platform?: Record<PlatformInfoKey, string | null | undefined>;
  }
): string {
  let result = html;
  for (const field of spec.author ?? []) {
    result = fillField(result, field, values.author);
  }
  for (const field of spec.platform ?? []) {
    result = fillField(result, field, values.platform ?? ({} as Record<PlatformInfoKey, string | null | undefined>));
  }
  return result;
}
