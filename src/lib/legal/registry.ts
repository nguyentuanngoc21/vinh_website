import { dieuKhoanSuDungHtml, dieuKhoanSuDungUpdatedAt } from "./dieu-khoan-su-dung";
import { chinhSachBaoMatHtml, chinhSachBaoMatUpdatedAt } from "./chinh-sach-bao-mat";
import { chinhSachDocQuyenHtml, chinhSachDocQuyenUpdatedAt } from "./chinh-sach-doc-quyen";
import { camKetQuyenSoHuuHtml, camKetQuyenSoHuuUpdatedAt } from "./cam-ket-quyen-so-huu";
import { chinhSachHoatDongTacGiaHtml, chinhSachHoatDongTacGiaUpdatedAt } from "./chinh-sach-hoat-dong-tac-gia";
import { boQuyTacCommissionHtml, boQuyTacCommissionUpdatedAt } from "./bo-quy-tac-commission";
import { AGREEMENT_META, AGREEMENT_ORDER, type AgreementId, type AgreementMeta } from "./agreement-meta";

export type { AgreementId } from "./agreement-meta";

export type AgreementDefinition = AgreementMeta & {
  html: string;
  /** ISO "yyyy-MM-dd", đọc từ hậu tố "UTD ddMMyyyy" của file .docx nguồn
   *  (xem scripts/convert-legal-docs.mjs) — dùng làm "version": một khi
   *  giá trị này đổi, mọi xác nhận cũ (accepted_version khác) coi như hết
   *  hiệu lực và người dùng phải xác nhận lại. */
  updatedAt: string;
};

// html + updatedAt từ các module sinh ra bởi scripts/convert-legal-docs.mjs.
const CONTENT: Record<AgreementId, { html: string; updatedAt: string }> = {
  "dieu-khoan-su-dung": { html: dieuKhoanSuDungHtml, updatedAt: dieuKhoanSuDungUpdatedAt },
  "chinh-sach-bao-mat": { html: chinhSachBaoMatHtml, updatedAt: chinhSachBaoMatUpdatedAt },
  "chinh-sach-doc-quyen": { html: chinhSachDocQuyenHtml, updatedAt: chinhSachDocQuyenUpdatedAt },
  "cam-ket-quyen-so-huu": { html: camKetQuyenSoHuuHtml, updatedAt: camKetQuyenSoHuuUpdatedAt },
  "chinh-sach-hoat-dong-tac-gia": { html: chinhSachHoatDongTacGiaHtml, updatedAt: chinhSachHoatDongTacGiaUpdatedAt },
  "bo-quy-tac-commission": { html: boQuyTacCommissionHtml, updatedAt: boQuyTacCommissionUpdatedAt },
};

/**
 * Nguồn sự thật duy nhất cho "văn bản thật" trong tab Cam kết & Thỏa thuận
 * (agreements-tab.tsx) — cùng nội dung với LegalLink (footer, form đăng
 * ký/đăng nhập) chứ không phải bản sao riêng, để không có 2 phiên bản
 * "Điều khoản sử dụng" khác nhau trên site.
 *
 * Tên/mô tả/requiredForFeature nằm ở agreement-meta.ts (không kéo HTML) —
 * sửa ở đó. File này import tĩnh HTML của cả 6 văn bản (~160 KB), nên chỉ
 * nên import từ server hoặc từ component client đã được tải lười; component
 * client chỉ cần tên văn bản dùng agreement-meta.ts + loadAgreementHtml().
 */
export const AGREEMENTS: AgreementDefinition[] = AGREEMENT_ORDER.map((id) => ({
  ...AGREEMENT_META[id],
  ...CONTENT[id],
}));

export function getAgreement(id: string): AgreementDefinition | undefined {
  return AGREEMENTS.find((a) => a.id === id);
}
