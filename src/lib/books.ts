export type Book = {
  title: string;
  author: string;
  tag: string;
  gradient: string;
};

// tag khớp đúng 10 giá trị BookGenre chính thức
// (migrations/20260825_update_book_genres.sql) — book-coverflow.tsx cast
// thẳng field này sang BookGenre để sinh bìa tự động (src/lib/covers/*),
// nên phải là 1 trong 10 giá trị đó, không phải chuỗi tự do.
export const books: Book[] = [
  { title: "Lặng Im Của Sóng", author: "Hạ Vũ", tag: "Tình cảm", gradient: "linear-gradient(160deg,#7c3aed,#4338ca)" },
  { title: "Người Gác Hải Đăng", author: "An Nhiên", tag: "Trinh thám", gradient: "linear-gradient(160deg,#0891b2,#0e7490)" },
  { title: "Thư Gửi Tháng Sáu", author: "Lam", tag: "Đời sống - Xã hội", gradient: "linear-gradient(160deg,#db2777,#9d174d)" },
  { title: "Vũng Vịnh Cuối Trời", author: "Minh Khôi", tag: "Đời sống - Xã hội", gradient: "linear-gradient(160deg,#2563a8,#1f8a6b)" },
  { title: "Mùa Gió Chướng", author: "Trúc Ly", tag: "Dã sử", gradient: "linear-gradient(160deg,#ea580c,#9a3412)" },
  { title: "Đảo Của Người Câm", author: "Vũ Hạ", tag: "Kỳ ảo", gradient: "linear-gradient(160deg,#0f766e,#134e4a)" },
  { title: "Bến Không Chồng Mới", author: "Hoài An", tag: "Đời sống - Xã hội", gradient: "linear-gradient(160deg,#475569,#1e293b)" },
  { title: "Tiếng Còi Tàu Đêm", author: "Bảo Chi", tag: "Trinh thám", gradient: "linear-gradient(160deg,#b45309,#78350f)" },
  { title: "Nơi Sóng Bắt Đầu", author: "Duy Khang", tag: "Tình cảm", gradient: "linear-gradient(160deg,#1d4ed8,#1e3a8a)" },
];

export const rankings = [
  { rank: 1, rankColor: "var(--color-brand-gold)", title: "Lặng Im Của Sóng", author: "Hạ Vũ", reads: "1.2M đọc", tag: "Tình cảm", gradient: "linear-gradient(#7c3aed,#4338ca)" },
  { rank: 2, rankColor: "#C9A86A", title: "Người Gác Hải Đăng", author: "An Nhiên", reads: "980k đọc", tag: "Đời sống - Xã hội", gradient: "linear-gradient(#0891b2,#0e7490)" },
  { rank: 3, rankColor: "#f0b429", title: "Thư Gửi Tháng Sáu", author: "Lam", reads: "745k đọc", tag: "Đời sống - Xã hội", gradient: "linear-gradient(#db2777,#9d174d)" },
  { rank: 4, rankColor: "#9a9a9a", title: "Bến Không Chồng", author: "Vũ Hà", reads: "612k đọc", tag: "Dã sử", gradient: "linear-gradient(#0d9488,#115e59)" },
];

// Danh sách hiển thị ở "Khám phá thể loại" (ranking-genres.tsx) — cập
// nhật theo đúng 10 giá trị chính thức, khớp GENRE_STYLES
// (src/lib/covers/genre-styles.ts).
export const genres = [
  { label: "Linh dị", active: false },
  { label: "Cổ tích & Thần thoại", active: false },
  { label: "Dã sử", active: false },
  { label: "Trinh thám", active: false },
  { label: "Tâm lý - tội phạm", active: false },
  { label: "Tình cảm", active: false },
  { label: "Đời sống - Xã hội", active: true },
  { label: "Khoa học viễn tưởng", active: false },
  { label: "Tiên hiệp/ kiếm hiệp", active: false },
  { label: "Kỳ ảo", active: false },
];

export const newWorks = [
  { title: "Đêm Trên Vịnh Bắc", author: "Hoài An", gradient: "linear-gradient(150deg,#334155,#0f172a)" },
  { title: "Mùa Cát Trắng", author: "Diệu Linh", gradient: "linear-gradient(150deg,#7c2d12,#b45309)" },
  { title: "Lời Của Gió", author: "Nam Phong", gradient: "linear-gradient(150deg,#1e3a5f,#3b82a0)" },
  { title: "Khói Lam Chiều", author: "Thu Hà", gradient: "linear-gradient(150deg,#4a044e,#86198f)" },
  { title: "Cửa Biển", author: "Quang Huy", gradient: "linear-gradient(150deg,#064e3b,#047857)" },
];
