// Metadata nhẹ (id/tên/mô tả) của các văn bản pháp lý — KHÔNG import nội
// dung HTML. Tách khỏi registry.ts để component client (LegalLink ở footer,
// form đăng nhập/đăng ký...) chỉ cần tên văn bản không phải kéo ~160 KB HTML
// của cả 6 văn bản vào bundle mọi trang. HTML chỉ tải khi thật sự mở popup,
// qua loadAgreementHtml() (dynamic import — mỗi văn bản một chunk riêng).
//
// File này viết tay (KHÔNG do scripts/convert-legal-docs.mjs sinh ra).
// registry.ts ghép metadata ở đây với html/updatedAt từ các module sinh ra.

export type AgreementId =
  | "dieu-khoan-su-dung"
  | "chinh-sach-bao-mat"
  | "chinh-sach-doc-quyen"
  | "cam-ket-quyen-so-huu"
  | "chinh-sach-hoat-dong-tac-gia"
  | "bo-quy-tac-commission";

export type AgreementMeta = {
  id: AgreementId;
  name: string;
  desc: string;
  /** Nhãn tính năng bị khoá nếu chưa xác nhận — hiển thị badge "Bắt buộc
   *  để: ..." ở tab Cam kết & Thỏa thuận. Không có nghĩa là danh sách đầy
   *  đủ mọi nơi việc gating được enforce — enforcement thật nằm ở route
   *  API tương ứng (ví dụ requireExclusivityAgreement() cho is_exclusive). */
  requiredForFeature?: string;
};

export const AGREEMENT_META: Record<AgreementId, AgreementMeta> = {
  "dieu-khoan-su-dung": {
    id: "dieu-khoan-su-dung",
    name: "Điều khoản sử dụng",
    desc: "Quy tắc sử dụng nền tảng: bình luận, bản quyền, tài khoản, thanh toán token.",
  },
  "chinh-sach-bao-mat": {
    id: "chinh-sach-bao-mat",
    name: "Chính sách bảo mật",
    desc: "Cách Vịnh thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn.",
  },
  "chinh-sach-doc-quyen": {
    id: "chinh-sach-doc-quyen",
    // Tên hiển thị khớp ĐÚNG tiêu đề văn bản thật ("HỢP ĐỒNG KHUNG KHAI
    // THÁC TÁC PHẨM ĐỘC QUYỀN") — id giữ nguyên "chinh-sach-doc-quyen" vì
    // lý do lịch sử, xem comment trong scripts/convert-legal-docs.mjs.
    name: "Hợp đồng khai thác tác phẩm độc quyền",
    desc: "Hợp đồng cấp quyền khai thác độc quyền: phạm vi, thời hạn 5 năm, doanh thu 90%, quyền và nghĩa vụ hai bên.",
    requiredForFeature: "Đăng truyện độc quyền",
  },
  "cam-ket-quyen-so-huu": {
    id: "cam-ket-quyen-so-huu",
    name: "Cam kết quyền sở hữu & chống đạo nhái",
    desc: "Cam kết về quyền tác giả, nguồn gốc tác phẩm và không đạo nhái nội dung người khác.",
    // Văn bản tự nêu rõ đây là điều kiện bắt buộc với MỌI tác giả (xem
    // "Chính sách hoạt động cho Tác giả" — mục "Quyền lợi khi trở thành
    // Tác giả": "Ký cam kết tác giả và chống đạo nhái (bắt buộc)"). Hiện
    // chỉ hiển thị badge — CHƯA có route nào chặn tạo/đăng truyện theo
    // đúng cam kết này (khác chinh-sach-doc-quyen, đã có enforcement thật
    // ở exclusivity-agreement.ts); thêm enforcement là việc riêng, cần xác
    // nhận trước vì ảnh hưởng luồng đăng tải của mọi tác giả hiện có.
    requiredForFeature: "Đăng tải tác phẩm (mọi tác giả)",
  },
  "chinh-sach-hoat-dong-tac-gia": {
    id: "chinh-sach-hoat-dong-tac-gia",
    name: "Chính sách hoạt động cho Tác giả",
    desc: "Quyền lợi, nghĩa vụ và quy định vận hành áp dụng cho tác giả trên Vịnh.",
  },
  "bo-quy-tac-commission": {
    id: "bo-quy-tac-commission",
    name: "Bộ quy tắc giao dịch Commission",
    desc: "Quy tắc giao dịch commission (vẽ minh họa, lồng tiếng, viết thuê): thanh toán, hủy đơn, quyền sở hữu và xử lý vi phạm.",
    // Không có chỗ trống cá nhân nào cần điền (giống Điều khoản sử
    // dụng/Chính sách bảo mật) nên KHÔNG có entry ở AGREEMENT_PARTY_INFO.
    // Bắt buộc để bật "Nhận đơn" (cung cấp dịch vụ commission) — enforcement
    // thật nằm ở PATCH /api/profile/services/[listingId]
    // (src/lib/orders/commission-agreement.ts), cùng cơ chế
    // chinh-sach-doc-quyen dùng cho is_exclusive.
    requiredForFeature: "Cung cấp dịch vụ (commission)",
  },
};

/** Thứ tự hiển thị ở tab Cam kết & Thỏa thuận. */
export const AGREEMENT_ORDER: AgreementId[] = [
  "dieu-khoan-su-dung",
  "chinh-sach-bao-mat",
  "chinh-sach-doc-quyen",
  "cam-ket-quyen-so-huu",
  "chinh-sach-hoat-dong-tac-gia",
  "bo-quy-tac-commission",
];

/**
 * Tải HTML một văn bản theo yêu cầu (dynamic import) — dùng ở client khi
 * người dùng mở popup, để HTML không nằm trong bundle ban đầu. Server vẫn
 * dùng registry.ts (import tĩnh, không ảnh hưởng bundle client).
 */
export function loadAgreementHtml(id: AgreementId): Promise<string> {
  switch (id) {
    case "dieu-khoan-su-dung":
      return import("./dieu-khoan-su-dung").then((m) => m.dieuKhoanSuDungHtml);
    case "chinh-sach-bao-mat":
      return import("./chinh-sach-bao-mat").then((m) => m.chinhSachBaoMatHtml);
    case "chinh-sach-doc-quyen":
      return import("./chinh-sach-doc-quyen").then((m) => m.chinhSachDocQuyenHtml);
    case "cam-ket-quyen-so-huu":
      return import("./cam-ket-quyen-so-huu").then((m) => m.camKetQuyenSoHuuHtml);
    case "chinh-sach-hoat-dong-tac-gia":
      return import("./chinh-sach-hoat-dong-tac-gia").then((m) => m.chinhSachHoatDongTacGiaHtml);
    case "bo-quy-tac-commission":
      return import("./bo-quy-tac-commission").then((m) => m.boQuyTacCommissionHtml);
  }
}
