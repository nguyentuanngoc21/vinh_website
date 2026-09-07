// Trước đây file này còn export `books`/`rankings`/`newWorks` — mock
// catalog hardcode dùng tạm cho trang chủ lúc chưa có sách thật. Đã bỏ:
// book-coverflow.tsx, hero-trending.tsx, new-works-grid.tsx,
// ranking-genres.tsx giờ nhận data thật từ getHomepageData()
// (src/lib/home/get-homepage-books.ts), gọi từ src/app/page.tsx.
//
// `genres` vẫn ở đây — đây là danh mục thể loại CỐ ĐỊNH của nền tảng
// (không phải sách), dùng cho "Khám phá thể loại" (ranking-genres.tsx).
// Khớp đúng 10 giá trị chính thức, xem
// migrations/20260825_update_book_genres.sql và
// src/lib/covers/genre-styles.ts.
export const genres = [
  { label: "Linh dị", slug: "linh-di", active: false },
  { label: "Cổ tích & Thần thoại", slug: "co-tich-than-thoai", active: false },
  { label: "Dã sử", slug: "da-su", active: false },
  { label: "Trinh thám", slug: "trinh-tham", active: false },
  { label: "Tâm lý - tội phạm", slug: "tam-ly-toi-pham", active: false },
  { label: "Tình cảm", slug: "tinh-cam", active: false },
  { label: "Đời sống - Xã hội", slug: "doi-song-xa-hoi", active: true },
  { label: "Khoa học viễn tưởng", slug: "khoa-hoc-vien-tuong", active: false },
  { label: "Tiên hiệp/ kiếm hiệp", slug: "tien-hiep-kiem-hiep", active: false },
  { label: "Kỳ ảo", slug: "ky-ao", active: false },
];
