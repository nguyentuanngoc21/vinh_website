export type Book = {
  title: string;
  author: string;
  tag: string;
  gradient: string;
};

export const books: Book[] = [
  { title: "Lặng Im Của Sóng", author: "Hạ Vũ", tag: "Ngôn tình", gradient: "linear-gradient(160deg,#7c3aed,#4338ca)" },
  { title: "Người Gác Hải Đăng", author: "An Nhiên", tag: "Trinh thám", gradient: "linear-gradient(160deg,#0891b2,#0e7490)" },
  { title: "Thư Gửi Tháng Sáu", author: "Lam", tag: "Tản văn", gradient: "linear-gradient(160deg,#db2777,#9d174d)" },
  { title: "Vũng Vịnh Cuối Trời", author: "Minh Khôi", tag: "Văn học", gradient: "linear-gradient(160deg,#2563a8,#1f8a6b)" },
  { title: "Mùa Gió Chướng", author: "Trúc Ly", tag: "Lịch sử", gradient: "linear-gradient(160deg,#ea580c,#9a3412)" },
  { title: "Đảo Của Người Câm", author: "Vũ Hạ", tag: "Kỳ ảo", gradient: "linear-gradient(160deg,#0f766e,#134e4a)" },
  { title: "Bến Không Chồng Mới", author: "Hoài An", tag: "Văn học", gradient: "linear-gradient(160deg,#475569,#1e293b)" },
  { title: "Tiếng Còi Tàu Đêm", author: "Bảo Chi", tag: "Trinh thám", gradient: "linear-gradient(160deg,#b45309,#78350f)" },
  { title: "Nơi Sóng Bắt Đầu", author: "Duy Khang", tag: "Ngôn tình", gradient: "linear-gradient(160deg,#1d4ed8,#1e3a8a)" },
];

export const rankings = [
  { rank: 1, rankColor: "var(--color-brand-gold)", title: "Lặng Im Của Sóng", author: "Hạ Vũ", reads: "1.2M đọc", tag: "Ngôn tình", gradient: "linear-gradient(#7c3aed,#4338ca)" },
  { rank: 2, rankColor: "#C9A86A", title: "Người Gác Hải Đăng", author: "An Nhiên", reads: "980k đọc", tag: "Văn học", gradient: "linear-gradient(#0891b2,#0e7490)" },
  { rank: 3, rankColor: "#f0b429", title: "Thư Gửi Tháng Sáu", author: "Lam", reads: "745k đọc", tag: "Tản văn", gradient: "linear-gradient(#db2777,#9d174d)" },
  { rank: 4, rankColor: "#9a9a9a", title: "Bến Không Chồng", author: "Vũ Hà", reads: "612k đọc", tag: "Lịch sử", gradient: "linear-gradient(#0d9488,#115e59)" },
];

export const genres = [
  { label: "Ngôn tình", active: false },
  { label: "Trinh thám", active: false },
  { label: "Văn học", active: true },
  { label: "Kỳ ảo", active: false },
  { label: "Tản văn", active: false },
  { label: "Lịch sử", active: false },
  { label: "Kinh dị", active: false },
  { label: "Phiêu lưu", active: false },
];

export const newWorks = [
  { title: "Đêm Trên Vịnh Bắc", author: "Hoài An", gradient: "linear-gradient(150deg,#334155,#0f172a)" },
  { title: "Mùa Cát Trắng", author: "Diệu Linh", gradient: "linear-gradient(150deg,#7c2d12,#b45309)" },
  { title: "Lời Của Gió", author: "Nam Phong", gradient: "linear-gradient(150deg,#1e3a5f,#3b82a0)" },
  { title: "Khói Lam Chiều", author: "Thu Hà", gradient: "linear-gradient(150deg,#4a044e,#86198f)" },
  { title: "Cửa Biển", author: "Quang Huy", gradient: "linear-gradient(150deg,#064e3b,#047857)" },
];
