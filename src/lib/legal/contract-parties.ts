import type { AgreementId } from "./registry";

// Field cần tự điền cho "Bên A"/"Bên B" khi 1 văn bản có chỗ trống kiểu
// "Họ và tên: ....." trong chính nội dung của nó — CHỈ những văn bản có
// thật sự cần (không phải mọi văn bản, vd Điều khoản sử dụng/Chính sách
// bảo mật là quy định chung, không có ô nào để điền). Khai báo TỪNG văn
// bản riêng ở AGREEMENT_PARTY_INFO bên dưới, vì tập field và CÁCH GHI
// NHÃN khác nhau giữa các văn bản (vd Hợp đồng khai thác... tách riêng
// "Số CCCD/Hộ chiếu" + "Cấp ngày" và có khối Bên B, còn Cam kết quyền sở
// hữu gộp chung "CCCD/Hộ chiếu/Mã định danh" thành 1 dòng và không có
// Bên B) — dùng đúng chữ trong file .docx nguồn, không suy ra máy móc.

export type AuthorInfoKey =
  | "realName"
  | "dateOfBirth"
  | "cccdNumber"
  | "cccdIssuedAt"
  | "address"
  | "phone"
  | "email"
  | "penName";

export type PlatformInfoKey = "name" | "idNumber" | "address" | "phone" | "email" | "website";

type PartyFieldSpec<K extends string> = {
  /** Field CHÍNH — dùng cho khối tóm tắt "Thông tin các bên"
   * (agreement-document-viewer.tsx), check thiếu field trước khi cho xác
   * nhận (.../accept/route.ts), và deep-link/scroll tới đúng ô ở trang
   * Thông tin cá nhân (edit-profile-tab.tsx). */
  key: K;
  /** Nhãn hiển thị — ĐÚNG như dòng trống thật trong văn bản (dùng làm mốc
   * cho fillOne() ở fill-party-blanks.ts) khi không có `mergedWith`; khi
   * có `mergedWith`, đây là nhãn ĐẦY ĐỦ của dòng trống gộp (vd "Số
   * CCCD/Hộ chiếu, cấp ngày"), không phải nhãn riêng của `key`. */
  label: string;
  /**
   * CHỈ set khi dòng trống THẬT trong văn bản gộp `key` với 1 field KHÁC
   * vào CHUNG 1 dòng (vd hợp đồng khai thác độc quyền gộp "Số CCCD/Hộ
   * chiếu" + "Cấp ngày" cũ thành 1 dòng "Số CCCD/Hộ chiếu, cấp ngày:
   * ....."). fillPartyBlanksIntoHtml() dùng `join` để ghép 2 giá trị
   * thành 1 chuỗi điền vào ĐÚNG 1 chỗ trống đó (không tách 2 lần fillOne
   * riêng vì văn bản chỉ còn 1 chỗ trống thật). Các nơi khác (khối tóm
   * tắt, check thiếu field, deep-link) coi field phụ này ngang hàng
   * field chính: thiếu 1 trong 2 vẫn tính là thiếu, và có `label` riêng
   * để liệt kê đúng tên khi báo "Cần điền: ...".
   */
  mergedWith?: {
    key: K;
    label: string;
    join: (primary: string, extra: string) => string;
  };
};

// fillPartyBlanksIntoHtml() cần hiển thị "Cấp ngày" dạng dd-MM-yyyy giống
// khối tóm tắt "Thông tin các bên" (agreement-document-viewer.tsx dùng
// formatVi() cho việc này) — nhưng contract-parties.ts là module dữ liệu
// thuần, không import từ 1 client component, nên lặp lại đúng 3 dòng logic
// đó ở đây thay vì tách thêm 1 module util chỉ vì 1 chỗ dùng.
function formatIsoDateVi(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

export type AgreementPartyInfo = {
  /** "Bên A"/Tác giả — người đang xem văn bản. */
  author?: PartyFieldSpec<AuthorInfoKey>[];
  /**
   * "Bên B"/Vịnh Câu Chuyện — CHỈ set nếu văn bản có khái niệm 2 bên
   * (hợp đồng song phương); văn bản 1 phía (cam kết đơn phương của tác
   * giả) bỏ trống, không hiện khối này.
   *
   * name/idNumber/address/phone lấy ĐỘNG từ hồ sơ super_admin (đứng tên
   * cá nhân, cùng field/cùng chỗ chỉnh sửa "Chỉnh sửa thông tin cá
   * nhân" như bất kỳ tác giả nào khác) — xem
   * GET /api/profile/contract-info. Giả định đúng 1 tài khoản
   * role='super_admin' đại diện Bên B; nếu sau này có nhiều super_admin
   * không cùng là Bên B, thay bằng 1 cột đánh dấu riêng thay vì suy luận
   * theo role. email/website là sự kiện CỦA TỔ CHỨC, không phải field
   * hồ sơ cá nhân nên vẫn hằng số ở PLATFORM_FIXED_INFO.
   */
  platform?: PartyFieldSpec<PlatformInfoKey>[];
};

/**
 * Nguồn khai báo duy nhất mà agreement-document-viewer.tsx đọc để quyết
 * định: có hiện khối "Thông tin các bên" cho văn bản đang mở không, và
 * nếu có thì hiện field nào, nhãn gì. Thêm văn bản mới cần điền thông
 * tin: thêm 1 entry ở đây theo ĐÚNG nhãn trong .docx nguồn (xem
 * src/lib/legal/*.ts do scripts/convert-legal-docs.mjs sinh ra để đối
 * chiếu) — không cần đổi gì ở viewer.
 */
export const AGREEMENT_PARTY_INFO: Partial<Record<AgreementId, AgreementPartyInfo>> = {
  "chinh-sach-doc-quyen": {
    author: [
      { key: "realName", label: "Họ và tên" },
      { key: "dateOfBirth", label: "Ngày sinh" },
      // Bản UTD 03092026 gộp 2 dòng cũ "Số CCCD/Hộ chiếu" + "Cấp ngày"
      // thành 1 dòng trống duy nhất "Số CCCD/Hộ chiếu, cấp ngày: ....."
      // — xem comment `mergedWith` ở PartyFieldSpec phía trên.
      {
        key: "cccdNumber",
        label: "Số CCCD/Hộ chiếu, cấp ngày",
        mergedWith: {
          key: "cccdIssuedAt",
          label: "Cấp ngày CCCD/Hộ chiếu",
          join: (number, issuedAt) => `${number}, cấp ngày ${formatIsoDateVi(issuedAt)}`,
        },
      },
      { key: "address", label: "Địa chỉ" },
      { key: "phone", label: "Điện thoại" },
      { key: "email", label: "Email" },
      // Đúng nguyên văn "Bút danh (nếu có):" trong văn bản — không rút
      // gọn thành "Bút danh", nếu không sẽ không khớp được dòng trống
      // thật để điền vào (xem fill-party-blanks.ts).
      { key: "penName", label: "Bút danh (nếu có)" },
    ],
    platform: [
      { key: "name", label: "Tên tổ chức/cá nhân" },
      { key: "idNumber", label: "Mã số doanh nghiệp/CCCD" },
      { key: "address", label: "Địa chỉ" },
      { key: "phone", label: "Điện thoại" },
      { key: "email", label: "Email" },
      { key: "website", label: "Website/Ứng dụng" },
    ],
  },
  "cam-ket-quyen-so-huu": {
    // Cam kết ĐƠN PHƯƠNG (chỉ tác giả ký) — không có khối "Bên B" trong
    // văn bản gốc, nên bỏ trống `platform`.
    author: [
      { key: "realName", label: "Họ và tên" },
      { key: "penName", label: "Bút danh/Tên tác giả" },
      { key: "dateOfBirth", label: "Ngày sinh" },
      // Bản UTD 03092026 đổi thành "...Mã định danh cá nhân:" (trước là
      // "...Mã định danh:") — cập nhật đúng theo văn bản mới, nếu không
      // fillOne() (fill-party-blanks.ts) sẽ không khớp được dòng trống.
      { key: "cccdNumber", label: "CCCD/Hộ chiếu/Mã định danh cá nhân" },
      { key: "email", label: "Email" },
    ],
  },
};

/** 2 field Bên B không thuộc hồ sơ cá nhân nào — sự kiện cố định của tổ chức. */
export const PLATFORM_FIXED_INFO = {
  email: "vinhcauchuyen@gmail.com",
  website: "vinhcauchuyen.vn",
};
