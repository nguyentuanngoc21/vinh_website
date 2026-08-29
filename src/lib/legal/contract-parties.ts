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
 * "BÊN B: BÊN KHAI THÁC" — cố định, KHÔNG phụ thuộc user đang xem hợp
 * đồng. Bên B đứng tên CÁ NHÂN (không phải pháp nhân doanh nghiệp) nên
 * không có "Đại diện bởi"/"Chức vụ" — bỏ tạm 2 field này cho bản hiện
 * tại; thêm lại nếu sau này Bên B chuyển sang đứng tên công ty.
 */
export const PLATFORM_PARTY_INFO: { label: string; value: string }[] = [
  { label: "Tên tổ chức/cá nhân", value: "Nguyễn Tuấn Ngọc" },
  { label: "Mã số doanh nghiệp/CCCD", value: "001201001813" },
  { label: "Địa chỉ", value: "Tầng 3, nhà 48, ngách 99/2 Nguyễn Chí Thanh, phường Láng, Hà Nội" },
  { label: "Điện thoại", value: "0987660581" },
  { label: "Email", value: "vinhcauchuyen@gmail.com" },
  { label: "Website/Ứng dụng", value: "vinhcauchuyen.vn" },
];
