export const TAGS = ["Tất cả", "Đọc giả", "Tác giả", "Lồng tiếng", "Họa sĩ", "Blogger"] as const;
export type Tag = (typeof TAGS)[number];
export type PersonTag = Exclude<Tag, "Tất cả">;

export const TAG_META: Record<PersonTag, { bg: string; fg: string }> = {
  "Đọc giả": { bg: "var(--color-info-bg)", fg: "#2C5870" },
  "Tác giả": { bg: "#F7EFD8", fg: "#8A6414" },
  "Lồng tiếng": { bg: "#DBF3E8", fg: "#2C7453" },
  "Họa sĩ": { bg: "#F3E8FF", fg: "#6B21A8" },
  Blogger: { bg: "#FFE6CC", fg: "#894701" },
};

export const SECTION_KEYS = ["truyen", "audio", "blog", "design"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_META: Record<
  SectionKey,
  { label: string; sub: string; color: string; bg: string }
> = {
  truyen: { label: "Truyện chữ", sub: "Tác phẩm văn bản đã xuất bản trên Vịnh", color: "#2C5870", bg: "var(--color-info-bg)" },
  audio: { label: "Audio", sub: "Bản thu và chương audio", color: "#2C7453", bg: "#DBF3E8" },
  blog: { label: "Blog", sub: "Bài viết trên blog Vịnh", color: "#894701", bg: "#FFE6CC" },
  design: { label: "Design", sub: "Ảnh bìa, minh họa, poster", color: "#6B21A8", bg: "#F3E8FF" },
};

export type WorkItem = {
  title: string;
  meta: string;
  likes: string;
  date: string;
  gradient: string;
  isNew?: boolean;
};

export type Person = {
  id: string;
  name: string;
  handle: string;
  tags: PersonTag[];
  followers: string;
  joined: string;
  verified: boolean;
  gradient: string;
  bio: string;
  works: Record<SectionKey, WorkItem[]>;
};

export const PEOPLE: Person[] = [
  {
    id: "haidang", name: "Hải Đăng", handle: "@haidang", tags: ["Họa sĩ", "Đọc giả"],
    followers: "18.2k", joined: "03/2023", verified: true, gradient: "linear-gradient(150deg,#2563a8,#1f8a6b)",
    bio: "Vẽ bìa và bộ nhận diện cho truyện dài. Nhận đặt hàng qua tin nhắn, ưu tiên truyện trinh thám và giả tưởng biển.",
    works: {
      truyen: [], audio: [],
      blog: [{ title: "Quy trình vẽ bìa: từ brief tới bản in", meta: "Blog · 6 phút đọc", likes: "1.2k", date: "18/07", gradient: "linear-gradient(150deg,#b45309,#78350f)" }],
      design: [
        { title: "Vũng Vịnh Cuối Trời — bìa tái bản", meta: "Bìa truyện · 12.4k thích", likes: "12.4k", date: "02/08", gradient: "linear-gradient(150deg,#2563a8,#1f8a6b)" },
        { title: "Bộ bìa Trinh thám Vịnh 2026", meta: "Bìa truyện · 6 tác phẩm", likes: "6.1k", date: "28/07", gradient: "linear-gradient(150deg,#475569,#1e293b)" },
        { title: "Nhận diện chuỗi Cửa Biển", meta: "Bộ nhận diện", likes: "3.3k", date: "11/07", gradient: "linear-gradient(150deg,#0d9488,#115e59)" },
      ],
    },
  },
  {
    id: "minhkhoi", name: "Minh Khôi", handle: "@minhkhoi", tags: ["Tác giả", "Blogger"],
    followers: "42.7k", joined: "11/2021", verified: true, gradient: "linear-gradient(150deg,#c8a86a,#8a6414)",
    bio: "Tác giả Vũng Vịnh Cuối Trời. Viết về biển, về người ở lại và những chuyến đi không có ngày về.",
    works: {
      truyen: [
        { title: "Vũng Vịnh Cuối Trời", meta: "36 chương · Đang ra", likes: "128k", date: "04/08", gradient: "linear-gradient(150deg,#2563a8,#1f8a6b)" },
        { title: "Lặng Im Của Sóng", meta: "52 chương · Hoàn thành", likes: "96k", date: "12/2025", gradient: "linear-gradient(150deg,#7c3aed,#4338ca)" },
        { title: "Cửa Biển", meta: "4 chương · Bản nháp", likes: "—", date: "30/07", gradient: "linear-gradient(150deg,#0d9488,#115e59)" },
      ],
      audio: [{ title: "Vũng Vịnh Cuối Trời — bản audio", meta: "Audio · 24 chương · Quốc Bảo đọc", likes: "31k", date: "20/07", gradient: "linear-gradient(150deg,#0891b2,#0e7490)" }],
      blog: [
        { title: "Ba mươi phút mỗi sáng: nhật ký viết", meta: "Blog · 5 phút đọc", likes: "4.4k", date: "22/07", gradient: "linear-gradient(150deg,#ea580c,#9a3412)" },
        { title: "Vì sao tôi bỏ chương mở đầu đầu tiên", meta: "Blog · 7 phút đọc", likes: "2.9k", date: "05/07", gradient: "linear-gradient(150deg,#16a34a,#065f46)" },
      ],
      design: [],
    },
  },
  {
    id: "quocbao", name: "Quốc Bảo", handle: "@quocbao", tags: ["Lồng tiếng", "Đọc giả"],
    followers: "25.4k", joined: "06/2022", verified: true, gradient: "linear-gradient(150deg,#0891b2,#0e7490)",
    bio: "Giọng đọc nam trầm. Đã thu hơn 400 chương audio cho Vịnh. Nhận thu truyện dài tập, thể loại trinh thám và lịch sử.",
    works: {
      truyen: [],
      audio: [
        { title: "Vũng Vịnh Cuối Trời — 24 chương", meta: "Audio · 8 giờ 12 phút", likes: "31k", date: "20/07", gradient: "linear-gradient(150deg,#0891b2,#0e7490)" },
        { title: "Cửa Biển — trọn bộ", meta: "Audio · 5 giờ 40 phút", likes: "18k", date: "02/07", gradient: "linear-gradient(150deg,#0d9488,#115e59)" },
        { title: "Đêm Không Trăng — chương đặc biệt", meta: "Audio · 19 phút", likes: "7.6k", date: "15/06", gradient: "linear-gradient(150deg,#4c1d95,#2e1065)" },
      ],
      blog: [{ title: "Thu âm tại nhà: bốn thứ tôi ước biết sớm hơn", meta: "Blog · 8 phút đọc", likes: "3.1k", date: "10/07", gradient: "linear-gradient(150deg,#1d4ed8,#1e3a8a)" }],
      design: [{ title: "Poster audio: Cửa Biển", meta: "Poster audio · 7.4k thích", likes: "7.4k", date: "01/07", gradient: "linear-gradient(150deg,#0d9488,#115e59)" }],
    },
  },
  {
    id: "maichi", name: "Mai Chi", handle: "@maichi", tags: ["Họa sĩ", "Tác giả"],
    followers: "14.9k", joined: "01/2024", verified: false, gradient: "linear-gradient(150deg,#db2777,#9d174d)",
    bio: "Minh họa nội văn và chân dung nhân vật. Đang viết tập truyện ngắn đầu tay.",
    works: {
      truyen: [{ title: "Những Người Đi Chợ Sớm", meta: "8 truyện ngắn · Đang ra", likes: "12k", date: "28/07", gradient: "linear-gradient(150deg,#db2777,#9d174d)" }],
      audio: [], blog: [],
      design: [
        { title: "Lặng Im Của Sóng", meta: "Bìa truyện · 9.8k thích", likes: "9.8k", date: "25/07", gradient: "linear-gradient(150deg,#7c3aed,#4338ca)" },
        { title: "Chân dung: Bà Tư bán cá", meta: "Minh họa · 5.4k thích", likes: "5.4k", date: "14/07", gradient: "linear-gradient(150deg,#db2777,#9d174d)" },
        { title: "Fan art: Lãm và con mèo cụt đuôi", meta: "Fan art · 1.7k thích", likes: "1.7k", date: "02/07", gradient: "linear-gradient(150deg,#be123c,#7f1d1d)" },
      ],
    },
  },
  {
    id: "trucly", name: "Trúc Ly", handle: "@trucly", tags: ["Họa sĩ", "Blogger"],
    followers: "11.3k", joined: "09/2023", verified: false, gradient: "linear-gradient(150deg,#7c3aed,#4338ca)",
    bio: "Minh họa bản đồ và cảnh nền. Viết blog về nghề vẽ cho truyện web.",
    works: {
      truyen: [], audio: [],
      blog: [{ title: "Vẽ bản đồ cho thế giới hư cấu", meta: "Blog · 9 phút đọc", likes: "2.2k", date: "19/07", gradient: "linear-gradient(150deg,#1d4ed8,#1e3a8a)" }],
      design: [
        { title: "Minh họa chương 14 — Đêm không trăng", meta: "Minh họa · 8.6k thích", likes: "8.6k", date: "21/07", gradient: "linear-gradient(150deg,#0f2e3d,#2c5870)" },
        { title: "Minh họa bản đồ vùng Vịnh", meta: "Minh họa · 3.4k thích", likes: "3.4k", date: "08/07", gradient: "linear-gradient(150deg,#1d4ed8,#1e3a8a)" },
      ],
    },
  },
  {
    id: "thuha", name: "Thu Hà", handle: "@thuha", tags: ["Lồng tiếng", "Họa sĩ"],
    followers: "9.8k", joined: "04/2024", verified: false, gradient: "linear-gradient(150deg,#16a34a,#065f46)",
    bio: "Giọng nữ, chuyên tản văn và truyện thiếu nhi. Tự làm poster cho các bản thu của mình.",
    works: {
      truyen: [],
      audio: [
        { title: "Gió Ngược — tản văn có tiếng", meta: "Audio · 2 giờ 05 phút", likes: "6.2k", date: "26/07", gradient: "linear-gradient(150deg,#16a34a,#065f46)" },
        { title: "Chuyện Kể Trước Giờ Ngủ", meta: "Audio · 12 chương", likes: "4.1k", date: "30/06", gradient: "linear-gradient(150deg,#a16207,#713f12)" },
      ],
      blog: [],
      design: [
        { title: "Nhãn chương audio — mùa mưa", meta: "Poster audio · 4.8k thích", likes: "4.8k", date: "17/07", gradient: "linear-gradient(150deg,#0891b2,#0e7490)" },
        { title: "Poster sự kiện: Đêm đọc Vịnh", meta: "Poster audio · 2.8k thích", likes: "2.8k", date: "05/07", gradient: "linear-gradient(150deg,#4c1d95,#2e1065)" },
      ],
    },
  },
  {
    id: "havu", name: "Hạ Vũ", handle: "@havu", tags: ["Blogger", "Đọc giả"],
    followers: "7.6k", joined: "02/2023", verified: false, gradient: "linear-gradient(150deg,#ea580c,#9a3412)",
    bio: "Phỏng vấn tác giả, điểm sách hằng tuần cho blog Vịnh.",
    works: {
      truyen: [], audio: [],
      blog: [
        { title: "Minh Khôi: “Tôi viết biển như viết về người ở lại”", meta: "Blog · 9 phút đọc", likes: "5.8k", date: "02/08", gradient: "linear-gradient(150deg,#2563a8,#1f8a6b)" },
        { title: "Điểm sách tháng Bảy: sáu truyện đáng đọc", meta: "Blog · 6 phút đọc", likes: "3.4k", date: "31/07", gradient: "linear-gradient(150deg,#475569,#1e293b)" },
      ],
      design: [],
    },
  },
  {
    id: "annhien", name: "An Nhiên", handle: "@annhien", tags: ["Tác giả", "Họa sĩ"],
    followers: "6.2k", joined: "07/2024", verified: false, gradient: "linear-gradient(150deg,#a16207,#713f12)",
    bio: "Tản văn và thơ. Tự vẽ bìa cho tác phẩm của mình.",
    works: {
      truyen: [{ title: "Gió Ngược", meta: "18 tản văn · Hoàn thành", likes: "22k", date: "10/07", gradient: "linear-gradient(150deg,#16a34a,#065f46)" }],
      audio: [], blog: [],
      design: [
        { title: "Bìa tản văn: Gió Ngược", meta: "Bìa truyện · 4.3k thích", likes: "4.3k", date: "09/07", gradient: "linear-gradient(150deg,#16a34a,#065f46)" },
        { title: "Bìa nháp: Cát Đợi", meta: "Bìa truyện · 2.1k thích", likes: "2.1k", date: "27/06", gradient: "linear-gradient(150deg,#a16207,#713f12)" },
      ],
    },
  },
  {
    id: "lamnguyen", name: "Lam Nguyễn", handle: "@lam", tags: ["Đọc giả"],
    followers: "820", joined: "05/2025", verified: false, gradient: "linear-gradient(150deg,#475569,#1e293b)",
    bio: "Đọc 214 truyện trong năm nay. Viết nhận xét ở phần bình luận, thỉnh thoảng đọc thử bản thảo.",
    works: { truyen: [], audio: [], blog: [], design: [] },
  },
  {
    id: "nguyenvu", name: "Nguyên Vũ", handle: "@nguyenvu", tags: ["Họa sĩ", "Đọc giả"],
    followers: "20.1k", joined: "08/2022", verified: true, gradient: "linear-gradient(150deg,#b45309,#78350f)",
    bio: "Fan art và tranh nhân vật. Được nhiều tác giả duyệt làm hình chính thức.",
    works: {
      truyen: [], audio: [], blog: [],
      design: [
        { title: "Fan art: Thuyền trưởng Lãm", meta: "Fan art · 6.9k thích", likes: "6.9k", date: "23/07", gradient: "linear-gradient(150deg,#b45309,#78350f)" },
        { title: "Fan art: cảnh chia tay bến Ninh Kiều", meta: "Fan art · 3.9k thích", likes: "3.9k", date: "13/07", gradient: "linear-gradient(150deg,#ea580c,#9a3412)" },
      ],
    },
  },
];

export const SIMULATED_ITEMS: Record<SectionKey, { title: string; meta: string; gradient: string }> = {
  truyen: { title: "Chương mới vừa đăng", meta: "Truyện chữ · vừa xuất bản", gradient: "linear-gradient(150deg,#2563a8,#1f8a6b)" },
  audio: { title: "Bản thu mới vừa tải lên", meta: "Audio · đang xử lý watermark", gradient: "linear-gradient(150deg,#0891b2,#0e7490)" },
  blog: { title: "Bài blog mới vừa đăng", meta: "Blog · vừa xuất bản", gradient: "linear-gradient(150deg,#ea580c,#9a3412)" },
  design: { title: "Thiết kế mới vừa tải lên", meta: "Design · chờ duyệt kiểm bản quyền", gradient: "linear-gradient(150deg,#7c3aed,#4338ca)" },
};
