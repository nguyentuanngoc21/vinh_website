import { dieuKhoanSuDungHtml, dieuKhoanSuDungUpdatedAt } from "./dieu-khoan-su-dung";
import { chinhSachBaoMatHtml, chinhSachBaoMatUpdatedAt } from "./chinh-sach-bao-mat";
import { chinhSachDocQuyenHtml, chinhSachDocQuyenUpdatedAt } from "./chinh-sach-doc-quyen";
import { camKetQuyenSoHuuHtml, camKetQuyenSoHuuUpdatedAt } from "./cam-ket-quyen-so-huu";
import { chinhSachHoatDongTacGiaHtml, chinhSachHoatDongTacGiaUpdatedAt } from "./chinh-sach-hoat-dong-tac-gia";

export type AgreementId =
  | "dieu-khoan-su-dung"
  | "chinh-sach-bao-mat"
  | "chinh-sach-doc-quyen"
  | "cam-ket-quyen-so-huu"
  | "chinh-sach-hoat-dong-tac-gia";

export type AgreementDefinition = {
  id: AgreementId;
  name: string;
  desc: string;
  html: string;
  /** ISO "yyyy-MM-dd", đọc từ hậu tố "UTD ddMMyyyy" của file .docx nguồn
   *  (xem scripts/convert-legal-docs.mjs) — dùng làm "version": một khi
   *  giá trị này đổi, mọi xác nhận cũ (accepted_version khác) coi như hết
   *  hiệu lực và người dùng phải xác nhận lại. */
  updatedAt: string;
  /** Nhãn tính năng bị khoá nếu chưa xác nhận — hiển thị badge "Bắt buộc
   *  để: ..." ở tab Cam kết & Thỏa thuận. Không có nghĩa là danh sách đầy
   *  đủ mọi nơi việc gating được enforce — enforcement thật nằm ở route
   *  API tương ứng (ví dụ requireExclusivityAgreement() cho is_exclusive). */
  requiredForFeature?: string;
};

/**
 * Nguồn sự thật duy nhất cho "văn bản thật" trong tab Cam kết & Thỏa thuận
 * (agreements-tab.tsx) — cùng nội dung với LegalLink (footer, form đăng
 * ký/đăng nhập) chứ không phải bản sao riêng, để không có 2 phiên bản
 * "Điều khoản sử dụng" khác nhau trên site.
 */
export const AGREEMENTS: AgreementDefinition[] = [
  {
    id: "dieu-khoan-su-dung",
    name: "Điều khoản sử dụng",
    desc: "Quy tắc sử dụng nền tảng: bình luận, bản quyền, tài khoản, thanh toán token.",
    html: dieuKhoanSuDungHtml,
    updatedAt: dieuKhoanSuDungUpdatedAt,
  },
  {
    id: "chinh-sach-bao-mat",
    name: "Chính sách bảo mật",
    desc: "Cách Vịnh thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn.",
    html: chinhSachBaoMatHtml,
    updatedAt: chinhSachBaoMatUpdatedAt,
  },
  {
    id: "chinh-sach-doc-quyen",
    // Tên hiển thị khớp ĐÚNG tiêu đề văn bản thật ("HỢP ĐỒNG KHUNG KHAI
    // THÁC TÁC PHẨM ĐỘC QUYỀN") — id giữ nguyên "chinh-sach-doc-quyen" vì
    // lý do lịch sử, xem comment trong scripts/convert-legal-docs.mjs.
    name: "Hợp đồng khai thác tác phẩm độc quyền",
    desc: "Hợp đồng cấp quyền khai thác độc quyền: phạm vi, thời hạn 5 năm, doanh thu 90%, quyền và nghĩa vụ hai bên.",
    html: chinhSachDocQuyenHtml,
    updatedAt: chinhSachDocQuyenUpdatedAt,
    requiredForFeature: "Đăng truyện độc quyền",
  },
  {
    id: "cam-ket-quyen-so-huu",
    name: "Cam kết quyền sở hữu & chống đạo nhái",
    desc: "Cam kết về quyền tác giả, nguồn gốc tác phẩm và không đạo nhái nội dung người khác.",
    html: camKetQuyenSoHuuHtml,
    updatedAt: camKetQuyenSoHuuUpdatedAt,
    // Văn bản tự nêu rõ đây là điều kiện bắt buộc với MỌI tác giả (xem
    // "Chính sách hoạt động cho Tác giả" — mục "Quyền lợi khi trở thành
    // Tác giả": "Ký cam kết tác giả và chống đạo nhái (bắt buộc)"). Hiện
    // chỉ hiển thị badge — CHƯA có route nào chặn tạo/đăng truyện theo
    // đúng cam kết này (khác chinh-sach-doc-quyen, đã có enforcement thật
    // ở exclusivity-agreement.ts); thêm enforcement là việc riêng, cần xác
    // nhận trước vì ảnh hưởng luồng đăng tải của mọi tác giả hiện có.
    requiredForFeature: "Đăng tải tác phẩm (mọi tác giả)",
  },
  {
    id: "chinh-sach-hoat-dong-tac-gia",
    name: "Chính sách hoạt động cho Tác giả",
    desc: "Quyền lợi, nghĩa vụ và quy định vận hành áp dụng cho tác giả trên Vịnh.",
    html: chinhSachHoatDongTacGiaHtml,
    updatedAt: chinhSachHoatDongTacGiaUpdatedAt,
  },
];

export function getAgreement(id: string): AgreementDefinition | undefined {
  return AGREEMENTS.find((a) => a.id === id);
}
