// "BÊN A"/"BÊN B" cho Hợp đồng khai thác tác phẩm độc quyền (registry.ts
// id 'chinh-sach-doc-quyen') — CHỈ văn bản này cần điền 2 bên; các văn
// bản khác (điều khoản, chính sách...) không có khái niệm này nên không
// cần một field chung trong AgreementDefinition — nơi gọi tự kiểm
// `agreementId === EXCLUSIVITY_CONTRACT_AGREEMENT_ID` (xem
// agreement-document-viewer.tsx).

export const EXCLUSIVITY_CONTRACT_AGREEMENT_ID = "chinh-sach-doc-quyen";

/** Field "BÊN A: TÁC GIẢ/CHỦ SỞ HỮU TÁC PHẨM" — thứ tự và nhãn khớp đúng
 *  văn bản gốc. Giá trị lấy từ GET /api/profile/contract-info (khoá theo
 *  đúng tên field của response đó). */
export const AUTHOR_PARTY_FIELD_LABELS: { key: "realName" | "dateOfBirth" | "cccdNumber" | "cccdIssuedAt" | "address" | "phone" | "email" | "penName"; label: string }[] = [
  { key: "realName", label: "Họ và tên" },
  { key: "dateOfBirth", label: "Ngày sinh" },
  { key: "cccdNumber", label: "Số CCCD/Hộ chiếu" },
  { key: "cccdIssuedAt", label: "Cấp ngày" },
  { key: "address", label: "Địa chỉ" },
  { key: "phone", label: "Điện thoại" },
  { key: "email", label: "Email" },
  { key: "penName", label: "Bút danh" },
];

/**
 * "BÊN B: BÊN KHAI THÁC" — đứng tên CÁ NHÂN (không phải pháp nhân doanh
 * nghiệp) nên không có "Đại diện bởi"/"Chức vụ" — bỏ tạm 2 field này cho
 * bản hiện tại; thêm lại nếu sau này Bên B chuyển sang đứng tên công ty.
 *
 * name/idNumber/address/phone lấy ĐỘNG từ hồ sơ super_admin (real_name,
 * identity_verifications.cccd_number, address, phone) — xem
 * GET /api/profile/contract-info — KHÔNG hardcode ở đây nữa, vì đó vẫn
 * là "thông tin cá nhân" của người đứng tên Bên B, cùng field/cùng chỗ
 * chỉnh sửa (Thông tin cá nhân) như bất kỳ tác giả nào khác (Bên A).
 * email/website là sự kiện CỦA TỔ CHỨC, không phải field trong hồ sơ cá
 * nhân (không có cột "email liên hệ doanh nghiệp"/"website" nào trên
 * profiles) nên vẫn là hằng số cố định ở đây.
 *
 * Giả định: đúng 1 tài khoản role='super_admin' đại diện Bên B (lấy
 * hàng cũ nhất nếu có nhiều — xem route). Nếu sau này có nhiều
 * super_admin không cùng là Bên B, thay bằng 1 cột đánh dấu riêng trên
 * đúng 1 hồ sơ thay vì suy luận theo role.
 */
export const PLATFORM_PARTY_FIELD_LABELS: {
  key: "name" | "idNumber" | "address" | "phone" | "email" | "website";
  label: string;
}[] = [
  { key: "name", label: "Tên tổ chức/cá nhân" },
  { key: "idNumber", label: "Mã số doanh nghiệp/CCCD" },
  { key: "address", label: "Địa chỉ" },
  { key: "phone", label: "Điện thoại" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website/Ứng dụng" },
];

/** 2 field không thuộc hồ sơ cá nhân nào — sự kiện cố định của tổ chức. */
export const PLATFORM_FIXED_INFO = {
  email: "vinhcauchuyen@gmail.com",
  website: "vinhcauchuyen.vn",
};
