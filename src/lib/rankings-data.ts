export type RawWork = { title: string; author: string; num: number };

function parse(raw: string): RawWork {
  const [title, author, num] = raw.split("|");
  return { title, author, num: Number(num) };
}

function parseBank(bank: Record<string, string[]>): Record<string, RawWork[]> {
  return Object.fromEntries(
    Object.entries(bank).map(([genre, items]) => [genre, items.map(parse)])
  );
}

export const NOVEL = parseBank({
  "Ngôn tình": [
    "Lặng Im Của Sóng|Hạ Vũ|42",
    "Nơi Sóng Bắt Đầu|Duy Khang|26",
    "Mùa Hạ Không Trở Lại|Thu Nguyên|33",
    "Người Đến Sau Cơn Mưa|Hoài An|29",
    "Thư Tình Gửi Biển|Lam|21",
    "Hẹn Ở Mùa Nước Nổi|An Nhiên|35",
  ],
  "Trinh thám": [
    "Người Gác Hải Đăng|An Nhiên|58",
    "Tiếng Còi Tàu Đêm|Bảo Chi|48",
    "Người Vẽ Bản Đồ Cạn|Bảo Chi|52",
    "Đêm Thứ Mười Ba Ở Cửa Lò|Vũ Hạ|44",
    "Xác Thuyền Không Tên|Duy Khang|39",
    "Sáu Lá Thư Không Dấu|Hạ Vũ|41",
  ],
  "Văn học": [
    "Vũng Vịnh Cuối Trời|Minh Khôi|36",
    "Bến Không Chồng Mới|Hoài An|28",
    "Muối Của Biển|Thu Nguyên|34",
    "Những Người Ở Lại|Minh Khôi|31",
    "Đất Mặn|Trúc Ly|45",
    "Tháng Chạp Ở Làng Chài|Lam|24",
  ],
  "Kỳ ảo": [
    "Đảo Của Người Câm|Vũ Hạ|30",
    "Kẻ Đếm Sóng|Vũ Hạ|56",
    "Vương Quốc Dưới Rạn|An Nhiên|61",
    "Người Gọi Gió|Duy Khang|38",
    "Thành Phố Trong Vỏ Ốc|Lam|27",
    "Đèn Của Người Chết Trôi|Bảo Chi|49",
  ],
  "Tản văn": [
    "Thư Gửi Tháng Sáu|Lam|24",
    "Gió Qua Cửa Hẹp|Lam|18",
    "Cà Phê Sáng Ở Bến|Hoài An|16",
    "Chép Lại Mùa Cũ|Thu Nguyên|22",
    "Những Buổi Chiều Rỗng|Hạ Vũ|19",
    "Đi Dọc Bờ Nghe Kể|Trúc Ly|20",
  ],
  "Lịch sử": [
    "Mùa Gió Chướng|Trúc Ly|64",
    "Chợ Nổi Tháng Chạp|Trúc Ly|40",
    "Cửa Biển 1874|Minh Khôi|52",
    "Người Giữ Sổ Thuế|Bảo Chi|47",
    "Thương Thuyền Cuối Cùng|An Nhiên|55",
    "Bản Đồ Của Quan Trấn|Duy Khang|43",
  ],
});

export const BLOG = parseBank({
  "Nghề viết": [
    "Viết chương mở đầu: bốn cách mở mà biên tập viên không bỏ qua|Lam|8",
    "Đặt tên nhân vật Việt mà không rơi vào sáo rỗng|An Nhiên|6",
    "Ba mươi phút mỗi sáng: nhật ký viết của một tác giả web|Trúc Ly|5",
    "Dựng bối cảnh miền biển bằng năm chi tiết|Minh Khôi|7",
    "Cắt bản thảo: bỏ 20% để giữ người đọc|Hạ Vũ|6",
  ],
  "Bản quyền": [
    "Watermark động: bảo vệ từng trang đọc|Đội ngũ Vịnh|7",
    "Dấu thời gian công bố: bằng chứng khi có tranh chấp|Đội ngũ Vịnh|6",
    "Khi tác phẩm bị đăng lại: xử lý trong 48 giờ|Đội ngũ Vịnh|4",
    "Hợp đồng xuất bản: sáu điều khoản nên đọc kỹ|Bảo Chi|9",
    "Đăng ký quyền tác giả ở Việt Nam, từng bước|Lam|8",
  ],
  "Phỏng vấn": [
    "Minh Khôi: “Tôi viết biển như viết về người ở lại”|Hạ Vũ|9",
    "An Nhiên và mười năm viết trinh thám|Lam|7",
    "Thu Hà: giọng đọc sau ba trăm chương|Quốc Bảo|6",
    "Trúc Ly nói về tiểu thuyết lịch sử|Hoài An|8",
    "Biên tập viên kể chuyện đọc bản thảo|Đội ngũ Vịnh|5",
  ],
  Audio: [
    "Từ bản thảo tới bản thu: quy trình sản xuất audio|Thu Hà|7",
    "Nghe truyện khi chạy bộ: chương dài bao nhiêu là vừa|Quốc Bảo|4",
    "Chọn giọng đọc cho nhân vật nữ chính|Lan Chi|6",
    "Watermark âm thanh hoạt động thế nào|Đội ngũ Vịnh|5",
    "Thu âm tại nhà: thiết bị tối thiểu|Hữu Tài|8",
  ],
  "Cộng đồng": [
    "Bảng xếp hạng quý III: thị hiếu người đọc đang đổi|Đội ngũ Vịnh|5",
    "Nhóm đọc thử: 40 người đọc trước mỗi bản thảo|Hoài An|6",
    "Bình luận tử tế: quy tắc cộng đồng Vịnh|Đội ngũ Vịnh|4",
    "Câu lạc bộ đọc tháng Bảy|Lam|3",
    "Tác giả mới nổi tuần này|Hạ Vũ|4",
  ],
});

export const GRADS = [
  "linear-gradient(160deg,#7c3aed,#4338ca)",
  "linear-gradient(160deg,#0891b2,#0e7490)",
  "linear-gradient(160deg,#db2777,#9d174d)",
  "linear-gradient(160deg,#2563a8,#1f8a6b)",
  "linear-gradient(160deg,#ea580c,#9a3412)",
  "linear-gradient(160deg,#0f766e,#134e4a)",
  "linear-gradient(160deg,#b45309,#78350f)",
  "linear-gradient(160deg,#1d4ed8,#1e3a8a)",
  "linear-gradient(160deg,#475569,#1e293b)",
  "linear-gradient(160deg,#7e22ce,#581c87)",
  "linear-gradient(160deg,#c2410c,#7c2d12)",
  "linear-gradient(160deg,#0d9488,#115e59)",
];

export const NARRATORS = ["Thu Hà", "Quốc Bảo", "Lan Chi", "Hữu Tài", "Mai Trâm"];

export const KINDS = ["Truyện chữ", "Audio", "Blog"] as const;
export type Kind = (typeof KINDS)[number];

export const PERIODS = [
  { id: "tuan", label: "Top tuần", range: "28/07 – 03/08", factor: 1, mult: 1 },
  { id: "thang", label: "Top tháng", range: "Tháng 7 · 2026", factor: 2, mult: 4.3 },
  { id: "quy", label: "Top quý", range: "Quý III · 2026", factor: 3, mult: 12.8 },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

export type ScoredWork = {
  title: string;
  author: string;
  genre: string;
  num: number;
  gradient: string;
  narrator: string;
  score: number;
  d: number;
  seed: number;
  isNew: boolean;
  mult: number;
};

export function buildScored(kind: Kind, periodId: PeriodId): ScoredWork[] {
  const bank = kind === "Blog" ? BLOG : NOVEL;
  const period = PERIODS.find((p) => p.id === periodId)!;
  const pf = period.factor;
  const mult = period.mult;
  const out: ScoredWork[] = [];
  let k = 0;
  Object.keys(bank).forEach((genre, gi) => {
    bank[genre].forEach((work, i) => {
      const seed = gi * 7 + i * 13 + pf * 29;
      const score =
        1000 -
        (gi * 6 + i * 11) * 3 +
        ((seed * 17) % 41) +
        (pf === 1 ? 0 : ((seed * 7) % 61) - 30);
      const d = (((seed * seed) % 19) + (seed % 11) + i * 3) % 21 - 9;
      out.push({
        title: work.title,
        author: work.author,
        genre,
        num: work.num,
        gradient: GRADS[k % GRADS.length],
        narrator: NARRATORS[(gi + i) % NARRATORS.length],
        score,
        d,
        seed,
        isNew: pf > 1 && seed % 23 === 3,
        mult,
      });
      k++;
    });
  });
  return out.sort((a, b) => b.score - a.score);
}

function unit(k: number): string {
  if (k >= 1000) return (k / 1000).toFixed(1) + "M";
  if (k >= 100) return Math.round(k) + "k";
  return Math.round(k * 10) / 10 + "k";
}

export function formatReads(kind: Kind, item: ScoredWork, rank: number) {
  const jit = 1 + (((item.seed * 13) % 11) - 5) / 100;
  if (kind === "Audio") {
    const k = 96 * Math.pow(0.9, rank - 1) * item.mult * jit;
    return {
      reads: unit(k) + " giờ nghe",
      byline: "Giọng đọc " + item.narrator + " · " + item.num + " chương",
    };
  }
  if (kind === "Blog") {
    const k = 46 * Math.pow(0.91, rank - 1) * item.mult * jit;
    return {
      reads: unit(k) + " đọc",
      byline: item.author + " · " + item.num + " phút đọc",
    };
  }
  const k = 1450 * Math.pow(0.9, rank - 1) * item.mult * jit;
  return {
    reads: unit(k) + " đọc",
    byline: item.author + " · " + item.num + " chương",
  };
}

export function formatDelta(d: number, isNew: boolean) {
  if (isNew) return { txt: "MỚI", color: "var(--color-chart-green)", weight: 700 };
  if (d === 0) return { txt: "—", color: "#c9c1b6", weight: 600 };
  return {
    txt: d > 0 ? "▲ " + d : "▼ " + Math.abs(d),
    color: d > 0 ? "var(--color-chart-green)" : "#c0392b",
    weight: 600,
  };
}

export const LEADERS: Record<"default" | "audio", { name: string; meta: string; color: string }[]> = {
  audio: [
    { name: "Thu Hà", meta: "18 tác phẩm · 4.2M nghe", color: "var(--color-brand-ink)" },
    { name: "Quốc Bảo", meta: "14 tác phẩm · 3.1M nghe", color: "var(--color-chart-teal)" },
    { name: "Lan Chi", meta: "11 tác phẩm · 2.4M nghe", color: "var(--color-chart-pink)" },
    { name: "Hữu Tài", meta: "9 tác phẩm · 1.8M nghe", color: "var(--color-chart-amber)" },
    { name: "Mai Trâm", meta: "7 tác phẩm · 1.2M nghe", color: "var(--color-chart-indigo)" },
  ],
  default: [
    { name: "Hạ Vũ", meta: "12 tác phẩm · 3.4M đọc", color: "var(--color-chart-indigo)" },
    { name: "An Nhiên", meta: "8 tác phẩm · 2.7M đọc", color: "var(--color-chart-teal)" },
    { name: "Minh Khôi", meta: "5 tác phẩm · 2.1M đọc", color: "var(--color-success)" },
    { name: "Trúc Ly", meta: "9 tác phẩm · 1.6M đọc", color: "var(--color-chart-orange)" },
    { name: "Lam", meta: "14 tác phẩm · 1.2M đọc", color: "var(--color-chart-pink)" },
  ],
};
