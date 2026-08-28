export const CATEGORIES = [
  "Tất cả",
  "Bìa truyện",
  "Minh họa",
  "Fan art",
  "Poster audio",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SORTS = [
  { key: "likes", label: "Lượt thích" },
  { key: "shares", label: "Chia sẻ" },
  { key: "new", label: "Mới nhất" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

export const SORT_DESCRIPTIONS: Record<SortKey, string> = {
  likes: "lượt thích",
  shares: "lượt chia sẻ",
  new: "thời gian đăng",
};

export type DesignPin = {
  id: number;
  title: string;
  artist: string;
  /** Mock id — /thiet-ke vẫn chưa nối Supabase (design_items/illustrator_id
   * thật), nên KHÔNG còn khớp với id thật ở /ket-noi (đã nối DB, xem
   * src/app/ket-noi/page.tsx) như trước. Sửa khi /thiet-ke được nối thật. */
  artistId: string;
  cat: Exclude<Category, "Tất cả">;
  likes: number;
  shares: number;
  height: number;
  gradient: string;
  works: number;
  desc: string;
};

export const DESIGN_PINS: DesignPin[] = [
  { id: 1, title: "Vũng Vịnh Cuối Trời — bìa tái bản", artist: "Hải Đăng", artistId: "haidang", cat: "Bìa truyện", likes: 12400, shares: 3120, height: 300, gradient: "linear-gradient(150deg,#2563a8,#1f8a6b)", works: 42, desc: "Bìa vẽ tay cho bản tái bản 2026: đường chân trời thấp, con thuyền lệch trái, chừa khoảng trống cho tên tác giả." },
  { id: 2, title: "Lặng Im Của Sóng", artist: "Mai Chi", artistId: "maichi", cat: "Bìa truyện", likes: 9800, shares: 2740, height: 380, gradient: "linear-gradient(150deg,#7c3aed,#4338ca)", works: 28, desc: "Bảng màu tím đêm, kết cấu giấy dó quét lại ở 600dpi." },
  { id: 3, title: "Minh họa chương 14 — Đêm không trăng", artist: "Trúc Ly", artistId: "trucly", cat: "Minh họa", likes: 8600, shares: 1980, height: 240, gradient: "linear-gradient(150deg,#0f2e3d,#2c5870)", works: 63, desc: "Minh họa nội văn, in tràn hai trang trong bản giấy." },
  { id: 4, title: "Poster audio: Cửa Biển", artist: "Quốc Bảo", artistId: "quocbao", cat: "Poster audio", likes: 7400, shares: 2410, height: 330, gradient: "linear-gradient(150deg,#0d9488,#115e59)", works: 19, desc: "Poster vuông cho bản audio 24 chương, dùng lại cho ảnh sóng phát trên ứng dụng." },
  { id: 5, title: "Fan art: Thuyền trưởng Lãm", artist: "Nguyên Vũ", artistId: "nguyenvu", cat: "Fan art", likes: 6900, shares: 1520, height: 420, gradient: "linear-gradient(150deg,#b45309,#78350f)", works: 87, desc: "Fan art được tác giả duyệt, dùng làm ảnh nhân vật chính thức." },
  { id: 6, title: "Bộ bìa Trinh thám Vịnh 2026", artist: "Hải Đăng", artistId: "haidang", cat: "Bìa truyện", likes: 6100, shares: 1870, height: 270, gradient: "linear-gradient(150deg,#475569,#1e293b)", works: 42, desc: "Sáu bìa cùng hệ, chỉ khác dải màu và số thứ tự." },
  { id: 7, title: "Chân dung: Bà Tư bán cá", artist: "Mai Chi", artistId: "maichi", cat: "Minh họa", likes: 5400, shares: 990, height: 350, gradient: "linear-gradient(150deg,#db2777,#9d174d)", works: 28, desc: "Chân dung than chì số hóa cho tuyến nhân vật phụ." },
  { id: 8, title: "Nhãn chương audio — mùa mưa", artist: "Thu Hà", artistId: "thuha", cat: "Poster audio", likes: 4800, shares: 1330, height: 250, gradient: "linear-gradient(150deg,#0891b2,#0e7490)", works: 15, desc: "Nhãn hình vuông 1:1 hiển thị trong trình phát." },
  { id: 9, title: "Bìa tản văn: Gió Ngược", artist: "An Nhiên", artistId: "annhien", cat: "Bìa truyện", likes: 4300, shares: 860, height: 390, gradient: "linear-gradient(150deg,#16a34a,#065f46)", works: 33, desc: "Chữ viết tay ghép cùng ảnh chụp bờ kè lúc chiều muộn." },
  { id: 10, title: "Fan art: cảnh chia tay bến Ninh Kiều", artist: "Nguyên Vũ", artistId: "nguyenvu", cat: "Fan art", likes: 3900, shares: 1140, height: 300, gradient: "linear-gradient(150deg,#ea580c,#9a3412)", works: 87, desc: "Được cộng đồng bình chọn là fan art của tháng Bảy." },
  { id: 11, title: "Minh họa bản đồ vùng Vịnh", artist: "Trúc Ly", artistId: "trucly", cat: "Minh họa", likes: 3400, shares: 1620, height: 230, gradient: "linear-gradient(150deg,#1d4ed8,#1e3a8a)", works: 63, desc: "Bản đồ hư cấu kèm chú giải, in ở trang đầu mỗi tập." },
  { id: 12, title: "Poster sự kiện: Đêm đọc Vịnh", artist: "Thu Hà", artistId: "thuha", cat: "Poster audio", likes: 2800, shares: 1290, height: 340, gradient: "linear-gradient(150deg,#4c1d95,#2e1065)", works: 15, desc: "Poster cho buổi đọc trực tiếp tháng Chín tại Đà Nẵng." },
  { id: 13, title: "Bìa nháp: Cát Đợi", artist: "An Nhiên", artistId: "annhien", cat: "Bìa truyện", likes: 2100, shares: 540, height: 260, gradient: "linear-gradient(150deg,#a16207,#713f12)", works: 33, desc: "Ba phương án bìa gửi tác giả chọn." },
  { id: 14, title: "Fan art: Lãm và con mèo cụt đuôi", artist: "Mai Chi", artistId: "maichi", cat: "Fan art", likes: 1700, shares: 430, height: 310, gradient: "linear-gradient(150deg,#be123c,#7f1d1d)", works: 28, desc: "Tranh vui đăng nhân dịp truyện đạt 100.000 lượt đọc." },
];

export function formatCount(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
}
