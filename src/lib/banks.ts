// Danh sách ngân hàng Việt Nam đóng gói tĩnh — dùng cho BankSelect
// (src/components/ui/bank-select.tsx) và validate ở
// src/app/api/profile/bank/route.ts. Đóng gói tĩnh thay vì gọi API ngoài
// (ví dụ VietQR) lúc chạy — không phụ thuộc mạng, không thể lỗi/chậm vì
// dịch vụ bên thứ ba. Cần thêm ngân hàng mới thì thêm 1 dòng vào đây.
export type VietnamBank = { code: string; name: string; shortName: string };

export const VIETNAM_BANKS: VietnamBank[] = [
  { code: "VCB", name: "Ngân hàng TMCP Ngoại Thương Việt Nam", shortName: "Vietcombank" },
  { code: "VBA", name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam", shortName: "Agribank" },
  { code: "CTG", name: "Ngân hàng TMCP Công Thương Việt Nam", shortName: "VietinBank" },
  { code: "BIDV", name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam", shortName: "BIDV" },
  { code: "TCB", name: "Ngân hàng TMCP Kỹ Thương Việt Nam", shortName: "Techcombank" },
  { code: "MB", name: "Ngân hàng TMCP Quân Đội", shortName: "MBBank" },
  { code: "ACB", name: "Ngân hàng TMCP Á Châu", shortName: "ACB" },
  { code: "VPB", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng", shortName: "VPBank" },
  { code: "STB", name: "Ngân hàng TMCP Sài Gòn Thương Tín", shortName: "Sacombank" },
  { code: "HDB", name: "Ngân hàng TMCP Phát triển TP.HCM", shortName: "HDBank" },
  { code: "TPB", name: "Ngân hàng TMCP Tiên Phong", shortName: "TPBank" },
  { code: "VIB", name: "Ngân hàng TMCP Quốc Tế Việt Nam", shortName: "VIB" },
  { code: "SHB", name: "Ngân hàng TMCP Sài Gòn - Hà Nội", shortName: "SHB" },
  { code: "EIB", name: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam", shortName: "Eximbank" },
  { code: "MSB", name: "Ngân hàng TMCP Hàng Hải Việt Nam", shortName: "MSB" },
  { code: "SEAB", name: "Ngân hàng TMCP Đông Nam Á", shortName: "SeABank" },
  { code: "OCB", name: "Ngân hàng TMCP Phương Đông", shortName: "OCB" },
  { code: "LPB", name: "Ngân hàng TMCP Lộc Phát Việt Nam", shortName: "LPBank" },
  { code: "NAB", name: "Ngân hàng TMCP Nam Á", shortName: "Nam A Bank" },
  { code: "ABB", name: "Ngân hàng TMCP An Bình", shortName: "ABBank" },
  { code: "VAB", name: "Ngân hàng TMCP Việt Á", shortName: "VietABank" },
  { code: "BAB", name: "Ngân hàng TMCP Bắc Á", shortName: "BacABank" },
  { code: "PGB", name: "Ngân hàng TMCP Xăng dầu Petrolimex", shortName: "PGBank" },
  { code: "KLB", name: "Ngân hàng TMCP Kiên Long", shortName: "KienlongBank" },
  { code: "SGB", name: "Ngân hàng TMCP Sài Gòn Công Thương", shortName: "SaigonBank" },
  { code: "VRB", name: "Ngân hàng Liên doanh Việt - Nga", shortName: "VRB" },
  { code: "SCB", name: "Ngân hàng TMCP Sài Gòn", shortName: "SCB" },
  { code: "PVCB", name: "Ngân hàng TMCP Đại Chúng Việt Nam", shortName: "PVcomBank" },
  { code: "NCB", name: "Ngân hàng TMCP Quốc Dân", shortName: "NCB" },
  { code: "VIETBANK", name: "Ngân hàng TMCP Việt Nam Thương Tín", shortName: "VietBank" },
  { code: "BVB", name: "Ngân hàng TMCP Bảo Việt", shortName: "BaoVietBank" },
  { code: "GPB", name: "Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu", shortName: "GPBank" },
  { code: "OCEANBANK", name: "Ngân hàng Thương mại TNHH MTV Đại Dương", shortName: "OceanBank" },
  { code: "CBB", name: "Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam", shortName: "CBBank" },
  { code: "COOPBANK", name: "Ngân hàng Hợp tác xã Việt Nam", shortName: "Co-opBank" },
  { code: "DONGABANK", name: "Ngân hàng TMCP Đông Á", shortName: "DongA Bank" },
  { code: "HLBVN", name: "Ngân hàng TNHH MTV Hong Leong Việt Nam", shortName: "Hong Leong Bank" },
  { code: "HSBC", name: "Ngân hàng TNHH MTV HSBC Việt Nam", shortName: "HSBC" },
  { code: "SCVN", name: "Ngân hàng TNHH MTV Standard Chartered Việt Nam", shortName: "Standard Chartered" },
  { code: "SHBVN", name: "Ngân hàng TNHH MTV Shinhan Việt Nam", shortName: "Shinhan Bank" },
  { code: "PBVN", name: "Ngân hàng TNHH MTV Public Việt Nam", shortName: "PublicBank" },
  { code: "UOB", name: "Ngân hàng TNHH MTV United Overseas Bank Việt Nam", shortName: "UOB" },
  { code: "CIMB", name: "Ngân hàng TNHH MTV CIMB Việt Nam", shortName: "CIMB" },
  { code: "WOO", name: "Ngân hàng TNHH MTV Woori Việt Nam", shortName: "Woori Bank" },
  { code: "IBK", name: "Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh Hà Nội", shortName: "IBK" },
];

/** Tìm ngân hàng theo mã — dùng để validate bankCode gửi lên khi lưu hồ sơ. */
export function findBankByCode(code: string): VietnamBank | undefined {
  return VIETNAM_BANKS.find((bank) => bank.code === code);
}
