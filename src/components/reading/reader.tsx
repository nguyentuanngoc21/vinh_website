"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkSimpleIcon,
  ChatCircleTextIcon,
  HeadphonesIcon,
  HighlighterIcon,
  ListBulletsIcon,
  PlusCircleIcon,
  ShareNetworkIcon,
  TextAaIcon,
  ShieldCheckIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { ChapterPicker, type ReaderChapterSummary } from "./chapter-picker";
import { VoteButton } from "./vote-button";
import { AuthorPanel } from "./author-panel";
import { ReadingListModal } from "./reading-list-modal";
import { RemoveChapterModal, type RemoveChapterPayload } from "@/components/admin/remove-chapter-modal";
import { ReadingGate } from "./reading-gate";
import { ParagraphCommentsPanel } from "./paragraph-comments-panel";
import { groupParagraphComments, type ParagraphComment } from "@/lib/reading/paragraph-comments";
import { buildHighlightSegments, textOffsetWithin, type Highlight } from "@/lib/reading/highlights";
import { shareOrCopy } from "@/lib/share";
import { VinhMark, useToast } from "@/components/ui";
import { supportMailto } from "@/lib/support";
import type { AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";

type ThemeName = "cream" | "sepia" | "dark";

// Export cho các component con (chapter-picker/vote-button/author-panel)
// nhận đúng type của `c` (1 mục trong THEMES) mà không phải định nghĩa lại.
export type ThemeColors = {
  pageBg: string;
  barBg: string;
  body: string;
  ink: string;
  inkSoft: string;
  hair: string;
  wmColor: string;
  tintBg: string;
  tintBorder: string;
  tintInk: string;
  swatch: string;
  swatchBorder: string;
};

const THEMES: Record<ThemeName, ThemeColors> = {
  cream: {
    pageBg: "var(--color-cream-card-alt)",
    barBg: "#FBF8F1",
    body: "#2b2925",
    ink: "var(--color-brand-ink)",
    inkSoft: "var(--color-stone-alt)",
    hair: "var(--color-cream-border)",
    wmColor: "rgba(20,59,77,.035)",
    tintBg: "var(--color-info-bg)",
    tintBorder: "var(--color-sidebar-text)",
    tintInk: "#2C5870",
    swatch: "var(--color-cream-card-alt)",
    swatchBorder: "var(--color-brand-ink)",
  },
  sepia: {
    pageBg: "#EADBC2",
    barBg: "#F1E6D2",
    body: "#43382a",
    ink: "#5c4524",
    inkSoft: "#9a8a72",
    hair: "#D6C3A4",
    wmColor: "rgba(92,69,36,.04)",
    tintBg: "#E3D2B4",
    tintBorder: "#cdb893",
    tintInk: "#7a5a2a",
    swatch: "#EADBC2",
    swatchBorder: "var(--color-brand-ink)",
  },
  dark: {
    pageBg: "var(--color-ink)",
    barBg: "#1d1916",
    body: "#d8d2c8",
    ink: "#ece4d6",
    inkSoft: "var(--color-stone-alt)",
    hair: "#2e2823",
    wmColor: "rgba(233,192,116,.04)",
    tintBg: "#231d18",
    tintBorder: "#3a322a",
    tintInk: "var(--color-brand-gold-light)",
    swatch: "var(--color-ink)",
    swatchBorder: "var(--color-brand-gold)",
  },
};

const PARAGRAPHS = [
  "Gió từ vịnh thổi vào, mang theo mùi muối và một thứ im lặng rất cũ. Bà tôi nói biển nhớ tất cả những ai từng ra đi, và cất giữ tên họ dưới đáy nước sâu, nơi không ánh nắng nào với tới.",
  "Đêm ấy không có trăng. Chỉ có ngọn hải đăng ở mũi đất phía tây, cứ mười hai giây lại quét một vòng sáng qua mặt nước đen, rồi tắt. Tôi đếm những lần ấy, như đếm nhịp thở của một người đang ngủ — đều đặn, kiên nhẫn, và buồn không nói thành lời.",
  "Cha tôi ra khơi từ lúc tôi còn chưa biết nhớ mặt người. Mẹ giữ lại cho tôi một chiếc áo của ông, thứ vải đã bạc đi vì nắng và vì những lần giặt bằng nước biển. Mỗi mùa gió chướng, mẹ lại mang nó ra phơi trước hiên, như thể chỉ cần làm vậy thôi là ông sẽ theo mùi nắng mà tìm về.",
  "\"Con có nghe thấy không?\" — bà hỏi, một đêm như đêm nay. Tôi lắng tai. Chỉ có tiếng sóng, đều và chậm. \"Đó là biển đang gọi tên những người nó thương,\" bà nói, giọng nhẹ như sợ làm tan một điều gì mong manh. \"Khi nào con nghe được tên mình trong tiếng sóng, là khi con đã thuộc về nơi này rồi.\"",
  "Tôi ngồi đó, đếm những con sóng, và chờ. Chờ một cái tên. Chờ một người. Chờ cái đêm dài này qua đi, để sáng mai mặt vịnh lại xanh như chưa từng có ai khuất sau đường chân trời.",
  "Nhưng có những đêm dài hơn một đời người. Và có những cái tên, biển giữ mãi không trả.",
];

const PENALTY_STORAGE_KEY = "vinh_screenshot_penalty";
const READER_PREFS_KEY = "vinh_reader_prefs";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const WATERMARK_TILE_WIDTH = 220;
const WATERMARK_TILE_HEIGHT = 110;

/** Ô SVG nhỏ chứa tên tác giả, xoay sẵn -22°, dùng làm `background-image`
 * lặp bằng `background-repeat: repeat` — kỹ thuật giống
 * `buildTiledWatermarkSvg` ở src/lib/orders/watermark.ts (ảnh giao đơn
 * Kết nối), chỉ khác là tile nhỏ để trình duyệt tự lặp vô hạn thay vì vẽ
 * hết mọi ô ra 1 SVG khổ lớn bằng đúng chiều cao nội dung — nhờ vậy phủ
 * kín được chương dài bao nhiêu cũng được, không cần biết trước chiều
 * cao thật của nó. */
function buildAuthorWatermarkTileDataUrl(authorName: string, color: string): string {
  const label = escapeXml(`${authorName} · Vịnh`);
  const svg =
    `<svg width="${WATERMARK_TILE_WIDTH}" height="${WATERMARK_TILE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="${WATERMARK_TILE_WIDTH / 2}" y="${WATERMARK_TILE_HEIGHT / 2}" ` +
    `transform="rotate(-22 ${WATERMARK_TILE_WIDTH / 2} ${WATERMARK_TILE_HEIGHT / 2})" ` +
    `text-anchor="middle" font-size="14" font-weight="600" font-family="sans-serif" ` +
    `fill="${color}">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type ReaderPrefs = { fontSize: number; theme: ThemeName; lineHeight: number };

const DEFAULT_LINE_HEIGHT = 2;

// Nhớ cỡ chữ/nền/giãn dòng người đọc đã chọn giữa các chương — không thì
// mỗi lần sang chương mới, panel lại reset về mặc định (19px/cream/giãn
// dòng 2), rất khó chịu với người quen đọc nền tối/chữ to/dòng thưa.
function getReaderPrefs(): ReaderPrefs | null {
  try {
    const raw = localStorage.getItem(READER_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    if (typeof parsed.fontSize !== "number") return null;
    if (parsed.theme !== "cream" && parsed.theme !== "sepia" && parsed.theme !== "dark") return null;
    // lineHeight là field thêm sau — bản lưu cũ (trước khi có tuỳ chỉnh
    // giãn dòng) sẽ không có field này, rơi về mặc định thay vì coi cả
    // object là hỏng.
    const lineHeight = typeof parsed.lineHeight === "number" ? parsed.lineHeight : DEFAULT_LINE_HEIGHT;
    return { fontSize: parsed.fontSize, theme: parsed.theme, lineHeight };
  } catch {
    return null;
  }
}

function saveReaderPrefs(prefs: ReaderPrefs) {
  try {
    localStorage.setItem(READER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage failures
  }
}

type PenaltyRule = { percent: number; durationDays: number };
type NextPenalty = PenaltyRule | { ban: true; durationDays: number } | { warning: true };

// Đồng bộ TAY với src/app/api/penalty/route.ts (không import chung được —
// route.ts chạy server-only, PENALTY_RULES ở đây chỉ dùng cho nhánh
// fallback offline khi gọi server thất bại, xem applyPenalty bên dưới).
// Lần vi phạm đầu tiên (count=0) = CẢNH BÁO, không nằm trong bảng này —
// PENALTY_RULES[0] giờ ứng với lần vi phạm THỨ 2 (count=1), lệch 1 so với
// trước đây.
const PENALTY_RULES: ReadonlyArray<PenaltyRule> = [
  { percent: 10, durationDays: 3 },
  { percent: 10, durationDays: 7 },
  { percent: 15, durationDays: 14 },
  { percent: 15, durationDays: 30 },
];

type PenaltyState = {
  count: number;
  expiresAt: number | null;
  banned: boolean;
  lastOffenseAt: number | null;
  deductedAmount: number | null;
};

function getPenaltyState(): PenaltyState {
  try {
    const raw = localStorage.getItem(PENALTY_STORAGE_KEY);
    if (!raw) return { count: 0, expiresAt: null, banned: false, lastOffenseAt: null, deductedAmount: null };
    const parsed = JSON.parse(raw) as PenaltyState;
    if (parsed.banned) return parsed;
    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
      return { ...parsed, expiresAt: null, deductedAmount: null };
    }
    return parsed;
  } catch {
    return { count: 0, expiresAt: null, banned: false, lastOffenseAt: null, deductedAmount: null };
  }
}

function savePenaltyState(state: PenaltyState) {
  try {
    localStorage.setItem(PENALTY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

function formatPenaltyMessage(penalty: PenaltyState) {
  if (penalty.banned) {
    return "Tài khoản này đã bị cấm vĩnh viễn vì vi phạm quy tắc chụp màn hình.";
  }

  // count=1 = lần cảnh báo đầu tiên (không có rule/expiresAt thật — xem
  // getNextPenalty) -> rule ở đây luôn undefined cho count=1, trả về null
  // là đúng (banner cảnh báo tức thời warningMessage đã lo phần hiển thị
  // lúc đó, không cần banner thường trực này lặp lại).
  const rule = PENALTY_RULES[penalty.count - 2];
  if (!rule || !penalty.expiresAt) return null;
  const expiry = new Date(penalty.expiresAt).toLocaleDateString("vi-VN");
  const baseMessage = `Lần ${penalty.count}: tính thêm ${rule.percent}% token để mở khóa truyện đến ${expiry}.`;
  if (penalty.deductedAmount) {
    return `${baseMessage} Đã trừ ${penalty.deductedAmount} token cho lần vi phạm này.`;
  }
  return baseMessage;
}

// Phải khớp CHÍNH XÁC logic trong src/app/api/penalty/route.ts (đồng bộ
// tay, xem comment PENALTY_RULES ở trên).
function getNextPenalty(count: number): NextPenalty {
  if (count === 0) return { warning: true };
  if (count >= 5) return { ban: true, durationDays: 30 };
  return PENALTY_RULES[count - 1];
}

function normalizePenaltyState(payload: {
  screenshot_penalty_count?: number;
  screenshot_penalty_expires_at?: string | null;
  screenshot_penalty_banned?: boolean;
  screenshot_penalty_last_offense_at?: string | null;
  last_deducted_amount?: number | null;
  lastDeductedAmount?: number | null;
}): PenaltyState {
  return {
    count: payload.screenshot_penalty_count ?? 0,
    expiresAt: payload.screenshot_penalty_expires_at
      ? new Date(payload.screenshot_penalty_expires_at).getTime()
      : null,
    banned: Boolean(payload.screenshot_penalty_banned),
    lastOffenseAt: payload.screenshot_penalty_last_offense_at
      ? new Date(payload.screenshot_penalty_last_offense_at).getTime()
      : null,
    deductedAmount: payload.last_deducted_amount ?? payload.lastDeductedAmount ?? null,
  };
}

async function fetchPenaltyStateFromServer(): Promise<PenaltyState | null> {
  try {
    const res = await fetch("/api/penalty");
    if (!res.ok) return null;
    const payload = await res.json();
    if (typeof payload?.screenshot_penalty_count !== "number") return null;
    return normalizePenaltyState(payload);
  } catch {
    return null;
  }
}

async function postScreenshotPenaltyToServer(): Promise<{ state: PenaltyState; warningOnly: boolean } | null> {
  try {
    const res = await fetch("/api/penalty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "screenshot" }),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (typeof payload?.screenshot_penalty_count !== "number") return null;
    return { state: normalizePenaltyState(payload), warningOnly: Boolean(payload?.warning_only) };
  } catch {
    return null;
  }
}

export type ReaderProps = {
  bookSlug?: string;
  /** uuid thật của books.id — khác bookSlug, cần cho reading_list_items.book_id
   * (FK trỏ vào books.id, không phải slug). */
  bookId?: string;
  bookTitle?: string;
  bookSynopsis?: string | null;
  authorId?: string | null;
  authorName?: string;
  authorAvatarUrl?: string | null;
  isOwnBook?: boolean;
  showFollowButton?: boolean;
  isFollowingAuthor?: boolean;
  /** id của chapters — cần để gọi route vote và ghép URL chia sẻ đoạn
   * đang đọc. Mặc định "" (chưa từng có ở phase trước) — các hành động
   * mạng tự no-op khi rỗng, để src/app/read/page.tsx (gọi <Reader/> không
   * props) không gọi nhầm /api/chapters//vote. */
  chapterId?: string;
  chapterTitle?: string;
  chapterPosition?: number;
  /** Nội dung thô của chapters.content — chia đoạn bằng "\n\n". Mặc định
   * = PARAGRAPHS mock, để src/app/read/page.tsx (gọi <Reader /> không
   * props) tiếp tục chạy y nguyên như trước khi có route động. */
  content?: string;
  prevChapterId?: string | null;
  nextChapterId?: string | null;
  chapters?: ReaderChapterSummary[];
  initialVoted?: boolean;
  initialVoteCount?: number;
  /** Audio thật đã gắn cho chương này qua chapter_audio_links (xem
   * src/lib/audio/get-chapter-audio.ts) — [] thì nút "Nghe" ẩn hẳn, không
   * dẫn tới trình phát rỗng. */
  linkedAudio?: AudioTrack[];
  /** true khi viewer là admin/super_admin (xem page.tsx —
   * getAuthedAdminId()) — hiện nút "Xóa" ở AuthorPanel để gỡ NGAY chương
   * đang đọc, dùng chung modal + API PATCH /api/admin/chapters/[chapterId]
   * với bảng chương ở admin/noi-dung/[bookId]. */
  viewerIsAdmin?: boolean;
  /** Rào truy nghiệm cho khách vãng lai/chương VIP chưa mua — tính sẵn ở
   * server (page.tsx), vì `content` truyền vào đây CŨNG đã bị cắt tương ứng
   * (xem src/lib/reading/access-gate.ts) — Reader chỉ render, không tự
   * quyết định cắt ở đâu. "none" = đọc được toàn bộ, không hiện rào. */
  accessGate?: "none" | "login" | "purchase";
  /** Giá chương (token) — chỉ có ý nghĩa khi accessGate === "purchase". */
  chapterPrice?: number;
  /** true nếu viewer đã đăng nhập (kể cả khi accessGate === "purchase" và
   * chưa mua) — quyết định ReadingGate hiện nút "Mua ngay" hay "Đăng nhập
   * để mua". */
  isLoggedIn?: boolean;
  /** Đoạn văn đã đọc dở lần trước, CHỈ khi đúng chương này (page.tsx đã
   * tự đối chiếu chapter_id) — null = bắt đầu từ đầu chương (chưa từng
   * đọc, hoặc lần trước dừng ở chương khác). Tự cuộn tới 1 lần lúc mount.
   * Xem migrations/20260910_add_book_progress_paragraph.sql. */
  initialParagraphIndex?: number | null;
};

export function Reader({
  bookSlug = "",
  bookId = "",
  bookTitle = "Vũng Vịnh Cuối Trời",
  bookSynopsis = null,
  authorId = null,
  authorName = "Minh Khôi",
  authorAvatarUrl = null,
  isOwnBook = false,
  showFollowButton = false,
  isFollowingAuthor = false,
  chapterId = "",
  chapterTitle = "Đêm không trăng",
  chapterPosition = 14,
  content = PARAGRAPHS.join("\n\n"),
  prevChapterId = null,
  nextChapterId = null,
  chapters = [],
  initialVoted = false,
  initialVoteCount = 0,
  linkedAudio = [],
  viewerIsAdmin = false,
  accessGate = "none",
  chapterPrice = 0,
  isLoggedIn = false,
  initialParagraphIndex = null,
}: ReaderProps) {
  const router = useRouter();
  const toast = useToast();
  const { play } = useNowPlaying();
  const [fontSize, setFontSize] = useState(19);
  const [theme, setTheme] = useState<ThemeName>("cream");
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT);
  const [panelOpen, setPanelOpen] = useState(false);
  const [penalty, setPenalty] = useState<PenaltyState>({ count: 0, expiresAt: null, banned: false, lastOffenseAt: null, deductedAmount: null });
  // penalty ban đầu luôn count:0 (giá trị thật chỉ tới sau 1 lượt tải từ
  // localStorage/server) — onKeyDown/onCopy bên dưới đăng ký 1 lần lúc
  // mount (deps []), đọc qua ref này thay vì đóng closure lên `penalty`
  // trực tiếp để đoán "lần đầu hay không" luôn dùng giá trị MỚI NHẤT tại
  // thời điểm người dùng thật sự bấm, không phải giá trị lúc effect chạy.
  const penaltyRef = useRef(penalty);
  useEffect(() => {
    penaltyRef.current = penalty;
  }, [penalty]);
  const [screenshotDetected, setScreenshotDetected] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const penaltyAppliedRef = useRef(false);
  // "Giờ hiện tại" cho isPenaltyActive bên dưới — KHÔNG gọi Date.now() trực
  // tiếp lúc render (react-hooks/purity: gọi hàm impure trong render có thể
  // cho kết quả khác nhau giữa các lần render, gây lệch nếu React sau này
  // render lại 1 lần build/commit nhiều lần — vd bật React Compiler).
  // null lúc mount đầu (trước khi effect chạy) — coi như "chưa có phạt" cho
  // tới khi có mốc giờ thật, khớp cách `penalty` cũng khởi tạo rỗng rồi mới
  // nạp state thật ở effect bên dưới.
  const [now, setNow] = useState<number | null>(null);

  const c = THEMES[theme];
  const isPenaltyActive = penalty.banned || (!!penalty.expiresAt && now !== null && penalty.expiresAt > now);

  // content="" khi accessGate="purchase" (chương VIP chưa mua — page.tsx
  // cắt về rỗng, không có gì để hiện) — "".split("\n\n") vẫn ra [""], sẽ vẽ
  // 1 đoạn <p> trống vô nghĩa phía trên ReadingGate nếu không chặn ở đây.
  const paragraphs = content ? content.split("\n\n") : [];
  // Cùng công thức với src/components/author/chapter-editor.tsx, để số chữ/
  // thời gian đọc khớp giữa lúc soạn và lúc đọc thật.
  const wordCount = (content.trim().match(/\S+/g) ?? []).length;
  const readMinutes = Math.max(1, Math.round(wordCount / 200));

  // Watermark mờ chèn tên tác giả thật (trước đây là chuỗi cứng giả lập
  // tên độc giả demo, không đổi theo truyện/tác giả đang đọc, VÀ chỉ lặp
  // đủ 1 lượng ký tự cố định — với chương dài, container cha (auto-height,
  // bằng chiều cao CẢ chương) khiến lớp watermark full-bleed phồng to gấp
  // bội, đẩy phần chữ đã lặp ra ngoài vùng nhìn thấy, y như không có gì).
  // Đổi sang tile SVG lặp bằng CSS background-repeat (kỹ thuật giống
  // buildTiledWatermarkSvg ở src/lib/orders/watermark.ts, dùng cho ảnh
  // giao đơn Kết nối) — mỗi ô đã tự xoay sẵn trong SVG nên phủ kín vô hạn
  // theo chiều cao thật của chương, không phụ thuộc số lần lặp/độ dài tên.
  const watermarkTileUrl = buildAuthorWatermarkTileDataUrl(authorName || "Vịnh", c.wmColor);

  // --- State cho chọn chương/vote/danh sách đọc/follow/share — hoàn toàn
  // mới, KHÔNG đụng tới state/effect hệ thống chống chụp màn hình ở trên. ---
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);

  const playChapterAudio = (track: AudioTrack) => {
    play(track);
    setAudioPickerOpen(false);
    router.push("/audio/now-playing");
  };
  const [voted, setVoted] = useState(initialVoted);
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [voting, setVoting] = useState(false);
  const [following, setFollowing] = useState(isFollowingAuthor);
  const [followPending, setFollowPending] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [visibleParagraph, setVisibleParagraph] = useState(paragraphs[0] ?? "");
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Bình luận theo đoạn (tham khảo Wattpad) — 1 lần fetch TOÀN BỘ bình
  // luận của chương này khi mount (không phải 1 API/đoạn), client tự
  // nhóm theo paragraph_index. Xem src/lib/reading/paragraph-comments.ts
  // + api/chapters/[chapterId]/comments/route.ts.
  const [paragraphComments, setParagraphComments] = useState<ParagraphComment[]>([]);
  const [openCommentsParagraph, setOpenCommentsParagraph] = useState<number | null>(null);
  const { countByParagraph, threadsByParagraph } = useMemo(
    () => groupParagraphComments(paragraphComments),
    [paragraphComments]
  );

  useEffect(() => {
    if (!chapterId) return;
    let cancelled = false;
    fetch(`/api/chapters/${chapterId}/comments`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setParagraphComments(data.comments ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  // Highlight (bôi đen đoạn văn) — RIÊNG TƯ, chỉ của chính viewer (khác
  // paragraphComments công khai) — xem src/lib/reading/highlights.ts +
  // api/chapters/[chapterId]/highlights/route.ts. 1 lần fetch toàn bộ
  // highlight của chương khi mount, giống paragraphComments.
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const highlightsByParagraph = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of highlights) {
      const list = map.get(h.paragraphIndex) ?? [];
      list.push(h);
      map.set(h.paragraphIndex, list);
    }
    return map;
  }, [highlights]);

  useEffect(() => {
    if (!chapterId) return;
    let cancelled = false;
    fetch(`/api/chapters/${chapterId}/highlights`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setHighlights(data.highlights ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  // Nút "Đánh dấu" nổi lên gần vùng vừa bôi đen — toạ độ fixed tính từ
  // getBoundingClientRect() của Range, không phụ thuộc layout cha. null =
  // không có lựa chọn hợp lệ nào (chưa bôi đen, hoặc bôi đen tràn ra
  // ngoài 1 đoạn văn — không hỗ trợ highlight nhiều đoạn cùng lúc).
  const [pendingHighlight, setPendingHighlight] = useState<{
    paragraphIndex: number;
    charStart: number;
    charEnd: number;
    top: number;
    left: number;
  } | null>(null);

  const handleParagraphSelect = (paragraphIndex: number, el: HTMLParagraphElement) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setPendingHighlight(null);
      return;
    }
    const range = selection.getRangeAt(0);
    // Chỉ nhận selection nằm GỌN trong đúng đoạn văn này — bôi đen tràn
    // sang đoạn khác (hoặc UI khác trên trang) bị bỏ qua, không hỗ trợ
    // highlight nhiều đoạn cùng lúc (đơn giản hoá, khớp shape 1
    // paragraph_index/highlight của DB).
    if (!el.contains(range.commonAncestorContainer)) {
      setPendingHighlight(null);
      return;
    }
    const charStart = textOffsetWithin(el, range.startContainer, range.startOffset);
    const charEnd = textOffsetWithin(el, range.endContainer, range.endOffset);
    if (charEnd <= charStart) {
      setPendingHighlight(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setPendingHighlight({ paragraphIndex, charStart, charEnd, top: rect.top, left: rect.left + rect.width / 2 });
  };

  const [highlightPending, setHighlightPending] = useState(false);
  const confirmHighlight = async () => {
    if (!pendingHighlight || !chapterId || highlightPending) return;
    setHighlightPending(true);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paragraphIndex: pendingHighlight.paragraphIndex,
          charStart: pendingHighlight.charStart,
          charEnd: pendingHighlight.charEnd,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.highlight) {
        setHighlights((prev) => [...prev, data.highlight]);
      }
    } finally {
      setHighlightPending(false);
      setPendingHighlight(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const removeHighlight = async (id: string) => {
    if (!chapterId) return;
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    await fetch(`/api/chapters/${chapterId}/highlights/${id}`, { method: "DELETE" }).catch(() => {
      // best-effort — không rollback UI vì đây là thao tác xoá, giữ đã
      // ẩn là hành vi hợp lý hơn kể cả khi request lỗi
    });
  };

  const handleToggleVote = async () => {
    if (voting || !chapterId) return;
    setVoting(true);
    const prevVoted = voted;
    const prevCount = voteCount;
    setVoted(!prevVoted);
    setVoteCount(prevCount + (prevVoted ? -1 : 1));
    try {
      const res = await fetch(`/api/chapters/${chapterId}/vote`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setVoted(!!data.voted);
        setVoteCount(typeof data.voteCount === "number" ? data.voteCount : prevCount);
      } else {
        setVoted(prevVoted);
        setVoteCount(prevCount);
      }
    } catch {
      setVoted(prevVoted);
      setVoteCount(prevCount);
    } finally {
      setVoting(false);
    }
  };

  const handleToggleFollow = async () => {
    if (followPending || !authorId) return;
    setFollowPending(true);
    const prevFollowing = following;
    setFollowing(!prevFollowing);
    try {
      const res = await fetch(`/api/authors/${authorId}/follow`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data) setFollowing(!!data.following);
      else setFollowing(prevFollowing);
    } catch {
      setFollowing(prevFollowing);
    } finally {
      setFollowPending(false);
    }
  };

  const handleShareStory = async () => {
    if (!bookSlug || typeof window === "undefined") return;
    const result = await shareOrCopy({
      title: `${chapterTitle} - ${bookTitle} - ${authorName}`,
      text: bookSynopsis ?? "",
      url: `${window.location.origin}/truyen/${bookSlug}`,
    });
    if (result === "copied") toast.show("Đã sao chép liên kết", "success");
  };

  const handleShareExcerpt = async () => {
    if (!bookSlug || !chapterId || typeof window === "undefined") return;
    const result = await shareOrCopy({
      title: chapterTitle,
      text: visibleParagraph,
      url: `${window.location.origin}/read/${bookSlug}/${chapterId}`,
    });
    if (result === "copied") toast.show("Đã sao chép liên kết", "success");
  };

  // Gỡ chương NGAY từ trang đọc (admin/super_admin only — xem
  // viewerIsAdmin ở page.tsx) — cùng modal + API với chapter-moderation-table.tsx,
  // không phải luồng riêng/đơn giản hoá. Sau khi gỡ thành công, chương
  // không còn published nên rời khỏi trang này ngay (F5 lại sẽ 404).
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleConfirmDeleteChapter = async (payload: RemoveChapterPayload) => {
    if (!chapterId || removePending) return;
    setRemovePending(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRemoveError((data && typeof data.error === "string" && data.error) || "Không gỡ được chương.");
        setRemovePending(false);
        return;
      }
      setRemoveModalOpen(false);
      router.push(bookSlug ? `/truyen/${bookSlug}` : "/");
    } catch {
      setRemoveError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setRemovePending(false);
    }
  };

  // Vuốt trái/phải trên khung đọc để sang chương — chỉ trên cảm ứng (chuột
  // không phát sinh touch event nên không ảnh hưởng desktop). Bỏ qua khi có
  // panel/modal đang mở (tránh xung đột thao tác) và khi vuốt bắt đầu sát
  // mép trái/phải màn hình (nhường cho cử chỉ "back" của trình duyệt/hệ
  // điều hành). Ngưỡng dx so với dy để phân biệt với cuộn dọc thông thường.
  const SWIPE_MIN_DISTANCE = 70;
  const SWIPE_EDGE_GUARD = 24;

  const handleContentTouchStart = (event: React.TouchEvent) => {
    if (panelOpen || chapterPickerOpen || listModalOpen) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleContentTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || !bookSlug) return;
    if (start.x < SWIPE_EDGE_GUARD || start.x > window.innerWidth - SWIPE_EDGE_GUARD) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    if (dx < 0 && nextChapterId) {
      router.push(`/read/${bookSlug}/${nextChapterId}`);
    } else if (dx > 0 && prevChapterId) {
      router.push(`/read/${bookSlug}/${prevChapterId}`);
    }
  };

  // Nạp cỡ chữ/nền/giãn dòng đã lưu từ chương trước (nếu có) — chạy 1 lần
  // lúc mount, TRƯỚC effect ghi ở dưới nên không bị effect ghi đè lại giá
  // trị mặc định. setTimeout(0) thay vì gọi setState đồng bộ ngay trong
  // thân effect — react-hooks/set-state-in-effect, cùng cách xử lý với
  // effect "now" ở dưới và reading-list-modal.tsx.
  //
  // Nếu CHƯA từng lưu gì (lần đầu ghé trang đọc) — dùng theme tối làm mặc
  // định khi hệ điều hành/trình duyệt đang ở chế độ tối, thay vì luôn ép
  // "cream". Chỉ áp dụng cho lần đầu — một khi đã có prefs đã lưu (kể cả
  // do chính effect này lưu mặc định), luôn tôn trọng lựa chọn đã lưu.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const prefs = getReaderPrefs();
      if (prefs) {
        setFontSize(prefs.fontSize);
        setTheme(prefs.theme);
        setLineHeight(prefs.lineHeight);
      } else if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
        setTheme("dark");
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    saveReaderPrefs({ fontSize, theme, lineHeight });
  }, [fontSize, theme, lineHeight]);

  // Đóng panel cỡ chữ/nền hoặc panel chọn chương bằng phím Esc — cùng với
  // backdrop bấm-ra-ngoài-để-đóng bên dưới, đây là 2 cách đóng ngoài việc
  // bấm lại icon đã mở nó.
  useEffect(() => {
    if (!panelOpen && !chapterPickerOpen) return;
    const onEscapeKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanelOpen(false);
      setChapterPickerOpen(false);
    };
    document.addEventListener("keydown", onEscapeKeyDown);
    return () => document.removeEventListener("keydown", onEscapeKeyDown);
  }, [panelOpen, chapterPickerOpen]);

  useEffect(() => {
    const loadPenalty = async () => {
      const serverState = await fetchPenaltyStateFromServer();
      if (serverState) {
        savePenaltyState(serverState);
        setPenalty(serverState);
        return;
      }

      setPenalty(getPenaltyState());
    };

    loadPenalty();
  }, []);

  // Cấp "giờ hiện tại" cho isPenaltyActive từ effect (client-only), không
  // gọi Date.now() lúc render. 30s/lần là đủ mịn — hạn phạt tính theo NGÀY
  // (3/7/14/30 ngày, xem PENALTY_RULES), không cần chính xác tới giây; tick
  // định kỳ giúp phạt tự hết hiệu lực trên UI mà không cần refresh trang.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    // setTimeout(0) thay vì gọi tick() đồng bộ ngay dòng đầu effect —
    // react-hooks/set-state-in-effect không cho setState đồng bộ ngay
    // trong thân effect (xem cùng cách xử lý ở reading-list-modal.tsx).
    const timeout = setTimeout(tick, 0);
    const interval = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!screenshotDetected || penaltyAppliedRef.current) return;
    penaltyAppliedRef.current = true;

    const applyPenalty = async () => {
      const result = await postScreenshotPenaltyToServer();
      if (result) {
        savePenaltyState(result.state);
        setPenalty(result.state);
        setWarningMessage(
          result.warningOnly
            ? "Đây là lần đầu hệ thống phát hiện — chưa trừ token lần này. Lần tới sẽ bị trừ token và khoá nội dung tạm thời."
            : result.state.banned
              ? "Bạn đã bị cấm vì chụp màn hình."
              : `Đã áp dụng phạt. Số token trừ: ${result.state.deductedAmount ?? 0}`
        );
        return;
      }

      if (penalty.banned) {
        return;
      }

      const now = Date.now();
      const nextCount = penalty.count + 1;
      const next = getNextPenalty(penalty.count);

      if ("warning" in next) {
        // Server không phản hồi được — vẫn cho qua với cảnh báo cục bộ,
        // KHÔNG tự trừ token/khoá nội dung phía client (nguồn sự thật là
        // server; chỉ ghi nhận count để lần sau không lặp lại cảnh báo).
        const warnedState: PenaltyState = {
          count: nextCount,
          expiresAt: null,
          banned: false,
          lastOffenseAt: now,
          deductedAmount: null,
        };
        savePenaltyState(warnedState);
        setPenalty(warnedState);
        setWarningMessage(
          "Đây là lần đầu hệ thống phát hiện — chưa trừ token lần này. Lần tới sẽ bị trừ token và khoá nội dung tạm thời."
        );
        return;
      }

      setWarningMessage("Không thể cập nhật phạt đến server. Phạt vẫn được ghi cục bộ.");

      if ("ban" in next && next.ban) {
        const bannedState: PenaltyState = {
          count: nextCount,
          expiresAt: null,
          banned: true,
          lastOffenseAt: now,
          deductedAmount: null,
        };
        savePenaltyState(bannedState);
        setPenalty(bannedState);
        return;
      }

      const expiresAt = now + next.durationDays * 24 * 60 * 60 * 1000;
      const nextState: PenaltyState = {
        count: nextCount,
        expiresAt,
        banned: false,
        lastOffenseAt: now,
        deductedAmount: Math.max(1, Math.ceil((1000 * ("percent" in next ? next.percent : 0)) / 100)),
      };
      savePenaltyState(nextState);
      setPenalty(nextState);
    };

    applyPenalty();
  }, [screenshotDetected, penalty]);

  useEffect(() => {
    // Thông điệp cảnh báo TỨC THỜI (trước khi biết chắc server trả lời gì)
    // — đoán trước dựa trên penaltyRef.current.count (giá trị MỚI NHẤT tại
    // thời điểm bấm, xem khai báo penaltyRef ở trên): count===0 nghĩa là
    // lần vi phạm SẮP TỚI sẽ chỉ là cảnh báo (xem getNextPenalty), count>=1
    // nghĩa là lần này sẽ bị trừ token/khoá thật. applyPenalty ở trên sẽ
    // ghi đè thông điệp này bằng phản hồi thật từ server ngay sau đó — đây
    // chỉ là phản hồi tức thời trong lúc chờ.
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "PrintScreen" ||
        event.code === "PrintScreen" ||
        event.key === "F13" ||
        ((event.key === "s" || event.key === "S") && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) ||
        (event.key === "s" && event.metaKey && event.shiftKey)
      ) {
        setScreenshotDetected(true);
        setWarningMessage(
          penaltyRef.current.count === 0
            ? "Hệ thống đã phát hiện hành vi chụp màn hình — đây là lần đầu nên chỉ cảnh báo."
            : "Hệ thống đã phát hiện hành vi chụp màn hình và đang áp dụng phạt."
        );
      }
    };

    const onCopy = () => {
      setScreenshotDetected(true);
      setWarningMessage(
        penaltyRef.current.count === 0
          ? "Hệ thống đã phát hiện hành vi sao chép/chụp màn hình — đây là lần đầu nên chỉ cảnh báo."
          : "Hệ thống đã phát hiện hành vi sao chép/chụp màn hình và đang áp dụng phạt."
      );
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
    };
  }, []);

  // Tự cuộn tới đoạn đã đọc dở lần trước (initialParagraphIndex, page.tsx
  // đã đối chiếu đúng chapter_id) — CHỈ 1 LẦN lúc mount, không lặp lại
  // mỗi khi paragraphRefs đổi. setTimeout(0) để chắc chắn layout đã xong
  // (ảnh bìa/watermark có thể còn đang load, dịch chiều cao trang) trước
  // khi tính vị trí cuộn — cùng kiểu xử lý với effect nạp reader prefs ở
  // trên.
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (scrollRestoredRef.current) return;
    if (initialParagraphIndex === null || initialParagraphIndex === 0) return;
    scrollRestoredRef.current = true;
    const timeout = setTimeout(() => {
      paragraphRefs.current[initialParagraphIndex]?.scrollIntoView({ block: "start" });
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialParagraphIndex]);

  // Ghi lại tiến độ đọc (đoạn đang xem) — debounce 3s sau khi NGỪNG cuộn
  // (không ghi mỗi lần đổi đoạn, tránh spam API lúc cuộn nhanh), qua
  // src/app/api/books/[bookId]/reading-progress/route.ts. Best-effort —
  // lỗi bỏ qua im lặng (mất 1 lần ghi tiến độ không phải sự cố nghiêm
  // trọng), không cần đăng nhập cũng gọi được, route tự trả 401 và bị
  // nuốt ở catch. Xem migrations/20260910_add_book_progress_paragraph.sql.
  const progressSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedParagraphRef = useRef<number | null>(null);
  const scheduleProgressSave = (idx: number) => {
    if (!bookId || !chapterId || lastSavedParagraphRef.current === idx) return;
    if (progressSaveTimeoutRef.current) clearTimeout(progressSaveTimeoutRef.current);
    progressSaveTimeoutRef.current = setTimeout(() => {
      lastSavedParagraphRef.current = idx;
      fetch(`/api/books/${bookId}/reading-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, paragraphIndex: idx }),
      }).catch(() => {
        // best-effort — bỏ qua lỗi mạng/401 (chưa đăng nhập)
      });
    }, 3000);
  };

  // Theo dõi đoạn văn đang hiện giữa khung nhìn lúc cuộn — dùng cho nút
  // chia sẻ ở AuthorPanel ("chia sẻ đoạn đang đọc") VÀ ghi tiến độ đọc ở
  // trên. Effect RIÊNG, không chung với 3 effect chống chụp màn hình ở
  // trên.
  useEffect(() => {
    if (paragraphs.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const viewportMid = window.innerHeight / 2;
        let best = visible[0];
        let bestDist = Infinity;
        for (const e of visible) {
          const mid = e.boundingClientRect.top + e.boundingClientRect.height / 2;
          const dist = Math.abs(mid - viewportMid);
          if (dist < bestDist) {
            bestDist = dist;
            best = e;
          }
        }
        const idx = Number((best.target as HTMLElement).dataset.paragraphIndex);
        if (!Number.isNaN(idx) && paragraphs[idx]) {
          setVisibleParagraph(paragraphs[idx]);
          scheduleProgressSave(idx);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-40% 0px -40% 0px" }
    );
    const els = paragraphRefs.current;
    els.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return (
    <div style={{ background: c.pageBg }} className="min-h-screen">
      {/* Bọc header + progress bar + 2 panel nổi trong 1 wrapper sticky
          chung: panel định vị bằng "absolute top-full" thay vì toạ độ px
          cứng (top-[58px] cũ) — tự khớp chiều cao thật của header trên mọi
          kích thước màn hình, không vỡ layout khi header xuống dòng/co giãn
          trên điện thoại. */}
      <div className="sticky top-0 z-30">
        <div
          style={{ background: c.barBg, borderColor: c.hair }}
          className="flex items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-7 sm:py-3"
        >
          <div className="flex min-w-0 items-center gap-0.5 sm:gap-4.5">
            <Link
              href={bookSlug ? `/truyen/${bookSlug}` : "/"}
              aria-label="Quay lại"
              className="flex size-11 shrink-0 items-center justify-center sm:h-auto sm:w-auto"
            >
              <ArrowLeftIcon
                size={22}
                style={{ color: c.ink }}
                className="cursor-pointer transition-colors hover:text-brand-gold-dark"
              />
            </Link>
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <VinhMark size={30} style={{ color: c.ink }} className="hidden shrink-0 sm:block" />
              <div className="min-w-0">
                <div
                  style={{ color: c.ink }}
                  className="truncate text-[14px] font-semibold sm:text-[15px]"
                >
                  {bookTitle}
                </div>
                <div style={{ color: c.inkSoft }} className="truncate text-xs">
                  Chương {chapterPosition} · {chapterTitle}
                </div>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-3.5">
            {/* Chỉ hiện khi chương này thật sự có audio gắn qua
                chapter_audio_links (linkedAudio) — không dẫn tới trình
                phát rỗng nữa. 1 bản thu: phát thẳng. Nhiều bản thu (nhiều
                giọng đọc): mở panel chọn, cùng cơ chế loại-trừ với
                chapterPickerOpen/panelOpen ở dưới. */}
            {linkedAudio.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  aria-label="Nghe audio"
                  style={{ borderColor: c.hair, color: c.ink }}
                  className="flex size-11 cursor-pointer items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-colors sm:h-auto sm:w-auto sm:border sm:px-[15px] sm:py-1.5 sm:hover:border-brand-ink"
                  onClick={() => {
                    if (linkedAudio.length === 1) {
                      playChapterAudio(linkedAudio[0]);
                      return;
                    }
                    setAudioPickerOpen((v) => !v);
                    setChapterPickerOpen(false);
                    setPanelOpen(false);
                  }}
                >
                  <HeadphonesIcon size={20} className="sm:hidden" />
                  <HeadphonesIcon className="hidden sm:block" />
                  <span className="hidden sm:inline">Nghe</span>
                </button>
                {audioPickerOpen && linkedAudio.length > 1 && (
                  <div
                    style={{ background: c.barBg, borderColor: c.hair }}
                    className="absolute right-0 top-[calc(100%+8px)] z-40 w-[240px] overflow-hidden rounded-2xl border shadow-[0_14px_34px_rgba(0,0,0,.16)]"
                  >
                    <div style={{ color: c.inkSoft }} className="px-4 pb-1.5 pt-3 text-[11px] font-semibold tracking-[.5px]">
                      CHỌN GIỌNG ĐỌC
                    </div>
                    {linkedAudio.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => playChapterAudio(t)}
                        style={{ color: c.ink }}
                        className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-[13.5px] font-medium transition-colors hover:bg-black/5"
                      >
                        <HeadphonesIcon size={15} />
                        {t.narratorName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              aria-label="Chọn chương"
              style={{ color: c.ink }}
              className="flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors hover:text-brand-gold-dark"
              onClick={() => {
                // 2 panel nổi (chọn chương/cỡ chữ) đè lên nhau nếu cùng mở —
                // loại trừ nhau, giống tab, cho gọn.
                setChapterPickerOpen((v) => !v);
                setPanelOpen(false);
              }}
            >
              <ListBulletsIcon size={22} />
            </button>
            <VoteButton variant="compact" voted={voted} voteCount={voteCount} pending={voting} onToggle={handleToggleVote} c={c} />
            <button
              type="button"
              aria-label="Tuỳ chỉnh cỡ chữ và nền"
              style={{ color: c.ink }}
              className="flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors hover:text-brand-gold-dark"
              onClick={() => {
                setPanelOpen((v) => !v);
                setChapterPickerOpen(false);
              }}
            >
              <TextAaIcon size={23} />
            </button>
          </div>
        </div>

        <div style={{ background: c.hair }} className="h-[3px]">
          <div className="h-full w-[62%] bg-brand-gold" />
        </div>

        {panelOpen && (
          <div
            style={{ background: c.barBg, borderColor: c.hair }}
            className="absolute right-4 top-full z-40 mt-2 w-[min(280px,calc(100vw-32px))] rounded-[14px] border p-5 shadow-[0_8px_30px_rgba(0,0,0,.18)] sm:right-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <div
                style={{ color: c.inkSoft }}
                className="text-[13px] font-bold tracking-wide"
              >
                CỠ CHỮ
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Đóng"
                style={{ color: c.inkSoft }}
                className="-m-2.5 flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors hover:text-brand-gold-dark"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="mb-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.max(15, s - 1))}
                aria-label="Giảm cỡ chữ"
                style={{ borderColor: c.hair, color: c.ink }}
                className="min-h-11 flex-1 cursor-pointer rounded-lg border py-2.5 text-center text-[15px] font-semibold transition-colors hover:border-brand-ink"
              >
                A−
              </button>
              <div
                style={{ borderColor: c.hair, color: c.inkSoft }}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border text-center text-sm font-semibold"
              >
                {fontSize}px
              </div>
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.min(26, s + 1))}
                aria-label="Tăng cỡ chữ"
                style={{ borderColor: c.hair, color: c.ink }}
                className="min-h-11 flex-1 cursor-pointer rounded-lg border py-2.5 text-center text-lg font-semibold transition-colors hover:border-brand-ink"
              >
                A+
              </button>
            </div>
            <div
              style={{ color: c.inkSoft }}
              className="mb-3 text-[13px] font-bold tracking-wide"
            >
              GIÃN DÒNG
            </div>
            <div className="mb-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setLineHeight((v) => Math.round(Math.max(1.5, v - 0.1) * 10) / 10)}
                aria-label="Giảm giãn dòng"
                style={{ borderColor: c.hair, color: c.ink }}
                className="min-h-11 flex-1 cursor-pointer rounded-lg border py-2.5 text-center text-lg font-semibold transition-colors hover:border-brand-ink"
              >
                −
              </button>
              <div
                style={{ borderColor: c.hair, color: c.inkSoft }}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border text-center text-sm font-semibold"
              >
                {lineHeight.toFixed(1)}
              </div>
              <button
                type="button"
                onClick={() => setLineHeight((v) => Math.round(Math.min(2.6, v + 0.1) * 10) / 10)}
                aria-label="Tăng giãn dòng"
                style={{ borderColor: c.hair, color: c.ink }}
                className="min-h-11 flex-1 cursor-pointer rounded-lg border py-2.5 text-center text-lg font-semibold transition-colors hover:border-brand-ink"
              >
                +
              </button>
            </div>
            <div
              style={{ color: c.inkSoft }}
              className="mb-3 text-[13px] font-bold tracking-wide"
            >
              NỀN
            </div>
            <div className="flex gap-2.5">
              {(Object.keys(THEMES) as ThemeName[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setTheme(name)}
                  aria-label={`Nền ${name}`}
                  style={{
                    background: THEMES[name].swatch,
                    borderColor:
                      theme === name ? THEMES[name].swatchBorder : "transparent",
                  }}
                  className="h-[46px] flex-1 cursor-pointer rounded-lg border-2"
                />
              ))}
            </div>
          </div>
        )}

        {chapterPickerOpen && (
          <ChapterPicker
            chapters={chapters}
            currentChapterId={chapterId}
            bookSlug={bookSlug}
            onClose={() => setChapterPickerOpen(false)}
            c={c}
          />
        )}
      </div>

      {/* Backdrop: bấm ra ngoài để đóng panel — z-20, thấp hơn header/panel
          (z-30/40) nên header vẫn dùng được, chỉ nội dung phía dưới bị mờ. */}
      {(panelOpen || chapterPickerOpen) && (
        <div
          aria-hidden="true"
          onClick={() => {
            setPanelOpen(false);
            setChapterPickerOpen(false);
          }}
          className="fixed inset-0 z-20 bg-black/30"
        />
      )}

      <div
        className="mx-auto max-w-[1160px]"
        onTouchStart={handleContentTouchStart}
        onTouchEnd={handleContentTouchEnd}
      >
        <div className="grid grid-cols-1 xl:grid-cols-[220px_720px_220px] xl:justify-center xl:gap-8">
          <aside className="hidden xl:block">
            <div className="sticky top-[90px]">
              <AuthorPanel
                variant="rail"
                authorName={authorName}
                authorAvatarUrl={authorAvatarUrl}
                isOwnBook={isOwnBook}
                showFollowButton={showFollowButton}
                following={following}
                pending={followPending}
                onToggleFollow={handleToggleFollow}
                onShareExcerpt={handleShareExcerpt}
                canModerate={viewerIsAdmin}
                onDeleteChapter={() => setRemoveModalOpen(true)}
                c={c}
              />
            </div>
          </aside>

          <div className="relative mx-auto max-w-[720px] overflow-hidden px-5 py-8 pb-24 sm:px-8 sm:py-[54px] sm:pb-20">
        <div className="relative z-[2] mb-6 xl:hidden">
          <AuthorPanel
            variant="inline"
            authorName={authorName}
            authorAvatarUrl={authorAvatarUrl}
            isOwnBook={isOwnBook}
            showFollowButton={showFollowButton}
            following={following}
            pending={followPending}
            onToggleFollow={handleToggleFollow}
            onShareExcerpt={handleShareExcerpt}
            canModerate={viewerIsAdmin}
            onDeleteChapter={() => setRemoveModalOpen(true)}
            c={c}
          />
        </div>
        <div
          aria-hidden="true"
          style={{
            backgroundImage: `url("${watermarkTileUrl}")`,
            backgroundRepeat: "repeat",
            backgroundSize: `${WATERMARK_TILE_WIDTH}px ${WATERMARK_TILE_HEIGHT}px`,
          }}
          className="pointer-events-none absolute inset-0 z-[1] animate-[vn-drift_26s_ease-in-out_infinite]"
        />

        <div className="relative z-[2]">
          <div
            style={{ color: c.inkSoft }}
            className="text-xs font-medium tracking-[2px]"
          >
            CHƯƠNG {chapterPosition}
          </div>
          <h1
            style={{ color: c.ink }}
            className="mb-1.5 mt-2.5 font-[family-name:var(--font-lora)] text-[26px] font-semibold leading-[1.25] sm:text-[30px] lg:text-[34px]"
          >
            {chapterTitle}
          </h1>
          {/* flex-wrap: hết chỗ thì xuống dòng thay vì tràn/đè lên nhau.
              Nhóm "số chữ · phút đọc" gói trong 1 span whitespace-nowrap để
              2 mục này luôn xuống dòng CÙNG NHAU, tách khỏi tên tác giả —
              tên tác giả dài (điện thoại hẹp) sẽ tự chiếm 1 dòng riêng. */}
          <div
            style={{ color: c.inkSoft }}
            className="mb-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px]"
          >
            <span className="min-w-0 truncate">
              {authorName} <span aria-hidden="true">·</span>
            </span>
            <span className="flex shrink-0 items-center gap-3.5 whitespace-nowrap">
              <span>{wordCount.toLocaleString("vi-VN")} chữ</span>
              <span>·</span>
              <span>{readMinutes} phút đọc</span>
            </span>
          </div>

          <div
            style={{ background: c.tintBg, borderColor: c.tintBorder, color: c.tintInk }}
            className="mb-[26px] inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold"
          >
            <ShieldCheckIcon className="shrink-0" /> Nội dung được bảo hộ
          </div>

          {(warningMessage || penalty.banned || isPenaltyActive) && (
            <div className="mb-6 rounded-[14px] border border-[#F3C6C6] bg-[#FBEDEC] px-4 py-3 text-sm text-[#B02A37]">
              <div>
                {warningMessage
                  ? warningMessage
                  : penalty.banned
                    ? "Tài khoản này đã bị cấm vĩnh viễn vì vi phạm chụp màn hình."
                    : formatPenaltyMessage(penalty)}
              </div>
              {/* Chỉ hiện CTA khi ĐANG có phạt/cấm thật sự đang áp dụng —
                  không hiện cho thông điệp cảnh báo lần đầu (warningMessage
                  có thể đang hiện "chỉ cảnh báo", lúc đó penalty.banned và
                  isPenaltyActive đều false, không cần "liên hệ hỗ trợ" cho
                  1 lời nhắc chưa có hậu quả thật). */}
              {(penalty.banned || isPenaltyActive) && (
                <a
                  href={supportMailto("Hỗ trợ phạt chụp màn hình")}
                  className="mt-2 inline-block font-semibold underline hover:text-brand-ink"
                >
                  Liên hệ hỗ trợ →
                </a>
              )}
            </div>
          )}

          {isPenaltyActive && (
            <div className="mb-6 rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#475569]">
              Với phạt đang áp dụng, truyện này đang bị khóa vì vi phạm chụp màn hình.
            </div>
          )}

          <div
            className="relative"
            onMouseDown={() => setPendingHighlight(null)}
          >
            <div
              style={{ fontSize: `${fontSize}px`, color: c.body, lineHeight }}
              className="font-[family-name:var(--font-lora)]"
            >
              {paragraphs.map((p, i) => {
                const count = countByParagraph.get(i) ?? 0;
                const segments = buildHighlightSegments(p, highlightsByParagraph.get(i) ?? []);
                return (
                  <div key={i} className="group relative mb-[1.5em]">
                    <p
                      ref={(el) => {
                        paragraphRefs.current[i] = el;
                      }}
                      data-paragraph-index={i}
                      onMouseUp={(e) => handleParagraphSelect(i, e.currentTarget)}
                      onTouchEnd={(e) => {
                        const el = e.currentTarget;
                        // setTimeout(0) — 1 số trình duyệt mobile chốt
                        // xong Selection SAU touchend 1 nhịp, đọc ngay lúc
                        // này có thể vẫn thấy selection cũ/rỗng.
                        setTimeout(() => handleParagraphSelect(i, el), 0);
                      }}
                    >
                      {/* Bôi đen (highlight) riêng tư — segment nào thuộc
                          highlightId khác null thì bọc <mark>, bấm vào
                          xoá luôn (đơn giản, không cần menu xác nhận cho
                          1 ghi chú cá nhân). Xem
                          src/lib/reading/highlights.ts. */}
                      {segments.map((seg, si) =>
                        seg.highlightId ? (
                          <mark
                            key={si}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeHighlight(seg.highlightId!);
                            }}
                            title="Bấm để bỏ đánh dấu"
                            style={{ background: "rgba(233,192,116,.45)", color: "inherit" }}
                            className="cursor-pointer rounded-[2px]"
                          >
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={si}>{seg.text}</span>
                        )
                      )}
                    </p>
                    {/* Icon bình luận theo đoạn (tham khảo Wattpad) — luôn
                        hiện nếu đã có bình luận (count>0), chỉ hiện khi
                        hover ở desktop nếu chưa có (tránh rợp icon "+" dày
                        đặc khi chưa cần) — group-hover không có tác dụng
                        trên cảm ứng nên luôn hiện trên mobile qua
                        sm:opacity-0. */}
                    <button
                      type="button"
                      onClick={() => setOpenCommentsParagraph(i)}
                      aria-label={count > 0 ? `${count} bình luận cho đoạn này` : "Bình luận đoạn này"}
                      style={{ color: c.inkSoft }}
                      className={`mt-1 flex items-center gap-1 text-xs transition-opacity hover:text-brand-gold-dark ${
                        count > 0 ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      }`}
                    >
                      {count > 0 ? (
                        <>
                          <ChatCircleTextIcon size={15} /> {count}
                        </>
                      ) : (
                        <PlusCircleIcon size={15} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            {isPenaltyActive && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-[14px] bg-white/90 p-6 text-center text-sm font-semibold text-[#7f1d1d] shadow-[0_10px_30px_rgba(0,0,0,.12)]">
                <div>Nội dung đang bị khóa do vi phạm chụp màn hình. Vui lòng chờ hết hạn phạt hoặc</div>
                <a href={supportMailto("Hỗ trợ phạt chụp màn hình")} className="underline hover:text-brand-ink">
                  liên hệ hỗ trợ
                </a>
              </div>
            )}
          </div>

          {/* accessGate !== "none": `content` (paragraphs ở trên) đã bị cắt
              THẬT ở server (page.tsx + src/lib/reading/access-gate.ts) —
              đây chỉ là phần UI mời đăng nhập/mua, không tự ý ẩn thêm gì
              thêm phía client. Không hiện khi đang bị khoá vì chụp màn hình
              (2 overlay chồng nhau sẽ rối, phạt đang ưu tiên hơn). */}
          {accessGate !== "none" && !isPenaltyActive && (
            <div className="mb-6">
              {accessGate === "purchase" ? (
                <ReadingGate
                  variant="purchase"
                  price={chapterPrice}
                  c={c}
                  bookSlug={bookSlug}
                  chapterId={chapterId}
                  isLoggedIn={isLoggedIn}
                />
              ) : (
                <ReadingGate
                  variant="login"
                  c={c}
                  bookSlug={bookSlug}
                  chapterId={chapterId}
                  isLoggedIn={isLoggedIn}
                />
              )}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setListModalOpen(true)}
              disabled={!bookId}
              style={{ borderColor: c.hair, color: c.ink }}
              className="flex cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:border-brand-ink disabled:cursor-default disabled:opacity-60"
            >
              <BookmarkSimpleIcon /> Thêm
            </button>
            <VoteButton variant="full" voted={voted} voteCount={voteCount} pending={voting} onToggle={handleToggleVote} />
            <button
              type="button"
              onClick={handleShareStory}
              style={{ borderColor: c.hair, color: c.ink }}
              className="flex cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:border-brand-ink"
            >
              <ShareNetworkIcon /> Chia sẻ
            </button>
          </div>

          {/* Ẩn trên mobile — bottom bar cố định (xem <nav> cuối trang) đã
              đảm nhiệm điều hướng chương trước/sau ở đó rồi, để tránh lặp. */}
          <div className="mt-[30px] hidden gap-3.5 sm:flex">
            {prevChapterId ? (
              <Link
                href={`/read/${bookSlug}/${prevChapterId}`}
                style={{ borderColor: c.hair, color: c.ink }}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] border py-[15px] text-sm font-semibold no-underline transition-colors hover:border-brand-ink"
              >
                <ArrowLeftIcon /> Chương trước
              </Link>
            ) : (
              <div
                style={{ borderColor: c.hair, color: c.inkSoft }}
                className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border py-[15px] text-sm font-semibold opacity-55"
              >
                <ArrowLeftIcon /> Chương trước
              </div>
            )}
            {nextChapterId ? (
              <Link
                href={`/read/${bookSlug}/${nextChapterId}`}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-brand-ink bg-brand-ink py-[15px] text-sm font-semibold text-white no-underline"
              >
                Chương sau <ArrowRightIcon />
              </Link>
            ) : (
              <div className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-brand-ink bg-brand-ink py-[15px] text-sm font-semibold text-white opacity-55">
                Chương sau <ArrowRightIcon />
              </div>
            )}
          </div>
        </div>
          </div>

          {/* Cột 3 để trống — chỉ để cột giữa (nội dung) canh tâm đúng
              cách khi cột trái (author rail) đã chiếm chỗ ở xl+. */}
          <div className="hidden xl:block" />
        </div>
      </div>

      {/* Thanh điều hướng nhanh cho điện thoại — chương trước/sau + mở
          panel cỡ chữ/mục lục mà KHÔNG cần cuộn lên đầu trang. 2 panel vẫn
          neo theo header sticky (xem wrapper "sticky top-0" ở trên) nên mở
          từ đây vẫn hiện ngay trong khung nhìn dù trang đang cuộn xuống
          sâu. Ẩn ở sm+ vì đã có đủ điều hướng trong nội dung/header. */}
      <nav
        style={{ background: c.barBg, borderColor: c.hair }}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {prevChapterId ? (
          <Link
            href={`/read/${bookSlug}/${prevChapterId}`}
            style={{ color: c.ink }}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium no-underline"
          >
            <ArrowLeftIcon size={20} />
            Trước
          </Link>
        ) : (
          <div
            style={{ color: c.inkSoft }}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium opacity-40"
          >
            <ArrowLeftIcon size={20} />
            Trước
          </div>
        )}
        <button
          type="button"
          aria-label="Chọn chương"
          onClick={() => {
            setChapterPickerOpen((v) => !v);
            setPanelOpen(false);
          }}
          style={{ color: c.ink }}
          className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium"
        >
          <ListBulletsIcon size={20} />
          Mục lục
        </button>
        <button
          type="button"
          aria-label="Tuỳ chỉnh cỡ chữ và nền"
          onClick={() => {
            setPanelOpen((v) => !v);
            setChapterPickerOpen(false);
          }}
          style={{ color: c.ink }}
          className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium"
        >
          <TextAaIcon size={20} />
          Cỡ chữ
        </button>
        {nextChapterId ? (
          <Link
            href={`/read/${bookSlug}/${nextChapterId}`}
            style={{ color: c.ink }}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium no-underline"
          >
            <ArrowRightIcon size={20} />
            Sau
          </Link>
        ) : (
          <div
            style={{ color: c.inkSoft }}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium opacity-40"
          >
            <ArrowRightIcon size={20} />
            Sau
          </div>
        )}
      </nav>

      {bookId && (
        <ReadingListModal
          open={listModalOpen}
          onClose={() => setListModalOpen(false)}
          bookId={bookId}
          bookTitle={bookTitle}
        />
      )}

      {removeModalOpen && (
        <RemoveChapterModal
          heading={`Gỡ chương "${chapterTitle}"`}
          pending={removePending}
          onCancel={() => {
            if (removePending) return;
            setRemoveModalOpen(false);
            setRemoveError(null);
          }}
          onConfirm={handleConfirmDeleteChapter}
        />
      )}
      {removeError && (
        <div className="fixed inset-x-4 bottom-20 z-[80] mx-auto max-w-[420px] rounded-lg border border-[#f3c6c6] bg-[#fdf1f1] px-4 py-2.5 text-center text-[13px] font-medium text-[#B02A37] shadow-[0_8px_24px_rgba(0,0,0,.15)] sm:bottom-6">
          {removeError}
        </div>
      )}

      {openCommentsParagraph !== null && (
        <ParagraphCommentsPanel
          chapterId={chapterId}
          paragraphIndex={openCommentsParagraph}
          threads={threadsByParagraph.get(openCommentsParagraph) ?? []}
          onClose={() => setOpenCommentsParagraph(null)}
          onCommentCreated={(c) => setParagraphComments((prev) => [...prev, c])}
          onCommentDeleted={(id) =>
            setParagraphComments((prev) => prev.filter((c) => c.id !== id && c.parentCommentId !== id))
          }
        />
      )}

      {/* Nút "Đánh dấu" nổi — render NGOÀI khung đoạn văn (position:fixed
          không cần lồng DOM để định vị) để tránh onMouseDown ở khung đó
          (dùng để tự ẩn nút khi bắt đầu 1 lượt bôi đen mới) vô tình bắt
          luôn sự kiện mousedown của chính nút này trước khi onClick kịp
          chạy. */}
      {pendingHighlight && (
        <button
          type="button"
          disabled={highlightPending}
          onClick={confirmHighlight}
          style={{
            position: "fixed",
            top: Math.max(8, pendingHighlight.top - 42),
            left: pendingHighlight.left,
            transform: "translateX(-50%)",
          }}
          className="z-[70] flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-ink px-3.5 py-2 text-xs font-semibold text-brand-gold-light shadow-[0_8px_20px_rgba(0,0,0,.25)] disabled:opacity-60"
        >
          <HighlighterIcon size={14} weight="fill" /> {highlightPending ? "Đang lưu…" : "Đánh dấu"}
        </button>
      )}
    </div>
  );
}
