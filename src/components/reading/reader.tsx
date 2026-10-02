"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { recallReadingSource } from "@/lib/reading/reading-source";
import { ReportContentButton } from "@/components/story/report-content-button";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/reading/heartbeat-config";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkSimpleIcon,
  HeadphonesIcon,
  HighlighterIcon,
  ListBulletsIcon,
  ShareNetworkIcon,
  TextAaIcon,
  ShieldCheckIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { ChapterPicker, type ReaderChapterSummary } from "./chapter-picker";
import { VoteButton } from "./vote-button";
import { AuthorPanel } from "./author-panel";
import type { RemoveChapterPayload } from "@/components/admin/remove-chapter-modal";
import { ReadingGate } from "./reading-gate";
import { TropeVotePanel, type TropeCandidate } from "./trope-vote-panel";
import {
  groupParagraphComments,
  PARAGRAPH_COMMENTS_PANEL_WIDTH,
  type ParagraphComment,
} from "@/lib/reading/paragraph-comments";
import { buildHighlightSegments, textOffsetWithin, type Highlight } from "@/lib/reading/highlights";
import { splitParagraphAroundDesignImages } from "@/lib/design/share-link";
import { shareOrCopy } from "@/lib/share";
import { Alert, VinhMark, useToast } from "@/components/ui";
import { supportMailto } from "@/lib/support";
import type { AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";
import { formatPenaltyMessage, useScreenshotPenalty } from "./use-screenshot-penalty";
import { buildAuthorWatermarkTileDataUrl, WATERMARK_TILE_HEIGHT, WATERMARK_TILE_WIDTH } from "./watermark-tile";
import { ProtectedImage } from "@/components/ui/protected-image";

// Modal/panel chỉ mở khi người đọc bấm (và modal gỡ chương chỉ dành cho
// admin) — tải chunk riêng lúc mở thay vì nhét vào bundle trang đọc của
// MỌI độc giả. Cả 3 đều chỉ mount khi đang mở.
const ReadingListModal = dynamic(() => import("./reading-list-modal").then((m) => m.ReadingListModal));
const RemoveChapterModal = dynamic(() =>
  import("@/components/admin/remove-chapter-modal").then((m) => m.RemoveChapterModal)
);
const ParagraphCommentsPanel = dynamic(() =>
  import("./paragraph-comments-panel").then((m) => m.ParagraphCommentsPanel)
);

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

const READER_PREFS_KEY = "vinh_reader_prefs";

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
   * Xem migrations/archive/20260910_add_book_progress_paragraph.sql. */
  initialParagraphIndex?: number | null;
  /** Nhân vật đã gắn với chương này (tác giả gắn qua
   * chapter-characters-panel.tsx) — [] thì panel bình chọn tự ẩn, không
   * bịa danh sách. Xem migrations/archive/20260919_add_characters.sql. */
  tropeCandidates?: TropeCandidate[];
  initialTropeVoteCharacterId?: string | null;
  /** Ảnh thiết kế chèn inline — page.tsx đã resolve sẵn từ marker
   * `[[thiet-ke:<designItemId>]]` trong `content` (xem chapter-editor.tsx
   * "Chèn ảnh thiết kế"). Reader chỉ tra map, không tự gọi API — id không
   * có trong map (ảnh đã xoá/bị gỡ) thì đoạn đó bị bỏ qua, không lỗi. */
  designImages?: Record<string, { imageUrl: string; altText: string | null }>;
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
  tropeCandidates = [],
  initialTropeVoteCharacterId = null,
  designImages = {},
}: ReaderProps) {
  const router = useRouter();
  const toast = useToast();
  const { play } = useNowPlaying();
  const [fontSize, setFontSize] = useState(19);
  const [theme, setTheme] = useState<ThemeName>("cream");
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT);
  const [panelOpen, setPanelOpen] = useState(false);
  const c = THEMES[theme];

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
  // Admin/super_admin được miễn phạt chụp màn hình (cần chụp để làm hướng dẫn).
  const { penalty, isPenaltyActive, warningMessage } = useScreenshotPenalty(paragraphRefs, { exempt: viewerIsAdmin });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Bình luận theo đoạn (tham khảo Wattpad) — 1 lần fetch TOÀN BỘ bình
  // luận của chương này khi mount (không phải 1 API/đoạn), client tự
  // nhóm theo paragraph_index. Xem src/lib/reading/paragraph-comments.ts
  // + api/chapters/[chapterId]/comments/route.ts.
  const [paragraphComments, setParagraphComments] = useState<ParagraphComment[]>([]);
  const [openCommentsParagraph, setOpenCommentsParagraph] = useState<number | null>(null);
  const commentsOpen = openCommentsParagraph !== null;
  // Điện thoại không có hover: NHẤN GIỮ 1 đoạn (~450ms, không kéo) để tô sáng
  // đoạn đó + hiện nút "Bình luận". Chạm nhanh/cuộn thì huỷ.
  const [pressedParagraph, setPressedParagraph] = useState<number | null>(null);
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };
  const startLongPress = (i: number, e: React.TouchEvent) => {
    cancelLongPress();
    const t = e.touches[0];
    longPressRef.current = {
      x: t.clientX,
      y: t.clientY,
      timer: setTimeout(() => {
        longPressRef.current = null;
        setPressedParagraph(i);
      }, 450),
    };
  };
  const moveLongPress = (e: React.TouchEvent) => {
    const lp = longPressRef.current;
    const t = e.touches[0];
    if (lp && (Math.abs(t.clientX - lp.x) > 10 || Math.abs(t.clientY - lp.y) > 10)) cancelLongPress();
  };
  const openParagraphComments = (i: number) => {
    setPressedParagraph(null);
    setOpenCommentsParagraph(i);
  };
  // Đang hiện nút sau khi nhấn giữ: chạm ra ngoài nút hoặc cuộn trang thì ẩn.
  useEffect(() => {
    if (pressedParagraph === null) return;
    const dismiss = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-comment-pill]")) return;
      setPressedParagraph(null);
    };
    const onScroll = () => setPressedParagraph(null);
    document.addEventListener("touchstart", dismiss, { capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("touchstart", dismiss, { capture: true });
      window.removeEventListener("scroll", onScroll);
    };
  }, [pressedParagraph]);
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

  // Ghi nhận tiến trình nhiệm vụ reader_share_story — chỉ khi shareOrCopy()
  // thật sự thành công ("shared" hoặc "copied", không phải "failed"). Best-
  // effort, không cần đăng nhập vẫn gọi được, lỗi/401 bị nuốt im lặng
  // (chia sẻ vẫn thành công với người dùng dù không tính nhiệm vụ). Xem
  // src/app/api/books/[bookId]/share/route.ts.
  const trackShareQuest = () => {
    if (!bookId) return;
    fetch(`/api/books/${bookId}/share`, { method: "POST" }).catch(() => {});
  };

  const handleShareStory = async () => {
    if (!bookSlug || typeof window === "undefined") return;
    const result = await shareOrCopy({
      title: `${chapterTitle} - ${bookTitle} - ${authorName}`,
      text: bookSynopsis ?? "",
      url: `${window.location.origin}/truyen/${bookSlug}`,
    });
    if (result === "copied") toast.show("Đã sao chép liên kết", "success");
    if (result !== "failed") trackShareQuest();
  };

  const handleShareExcerpt = async () => {
    if (!bookSlug || !chapterId || typeof window === "undefined") return;
    const result = await shareOrCopy({
      title: chapterTitle,
      text: visibleParagraph,
      url: `${window.location.origin}/read/${bookSlug}/${chapterId}`,
    });
    if (result === "copied") toast.show("Đã sao chép liên kết", "success");
    if (result !== "failed") trackShareQuest();
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
  // effect "now" trong use-screenshot-penalty.ts và reading-list-modal.tsx.
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
  // trọng). Khách chưa đăng nhập thì bỏ qua hẳn (route chỉ trả 401, gọi
  // cũng vô ích) — isLoggedIn do page.tsx tính sẵn (viewerId !== null).
  // Xem migrations/archive/20260910_add_book_progress_paragraph.sql.
  const progressSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedParagraphRef = useRef<number | null>(null);
  const scheduleProgressSave = (idx: number) => {
    if (!isLoggedIn || !bookId || !chapterId || lastSavedParagraphRef.current === idx) return;
    if (progressSaveTimeoutRef.current) clearTimeout(progressSaveTimeoutRef.current);
    progressSaveTimeoutRef.current = setTimeout(() => {
      lastSavedParagraphRef.current = idx;
      // isLastParagraph — đoạn đang xem là đoạn cuối chương, coi như "đọc
      // hết chương" — kích hoạt ghi reading_history/streak/tiến trình
      // nhiệm vụ ở route (xem comment trong route đó). Chỉ cần TỚI đoạn
      // cuối 1 lần, không cần đọc chậm hết từng đoạn.
      const isLastParagraph = idx >= paragraphs.length - 1;
      fetch(`/api/books/${bookId}/reading-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, paragraphIndex: idx, isLastParagraph }),
      }).catch(() => {
        // best-effort — bỏ qua lỗi mạng/401 (hết phiên đăng nhập)
      });
    }, 3000);
  };

  // Nhịp đọc 60 giây (Contest Engine Phase 2, P1) — POST /api/reading/heartbeat. Chỉ gửi khi
  // tab đang hiển thị VÀ người đọc có tương tác (cuộn/chạm/phím) trong 120 giây gần nhất; server
  // tự đo khoảng thời gian thật giữa 2 nhịp (≤ 90 giây mới được cộng), nên để tab mở rồi bỏ đi
  // hay gửi dồn nhịp đều không tăng thời gian đọc. Nhịp đầu gửi ngay khi mở chương; quay lại
  // tab hoặc tương tác lại sau khi ngừng thì gửi ngay để bắt đầu đo lại. Chỉ khi đọc được toàn
  // bộ chương (accessGate "none") và đã đăng nhập. Nguồn truy cập lấy từ reading-source.ts.
  // Xem migrations/archive/20260926_add_reading_session_tracking.sql.
  const currentParagraphRef = useRef(0);
  useEffect(() => {
    if (!isLoggedIn || accessGate !== "none" || !bookId || !chapterId) return;
    const IDLE_MS = 120_000;
    const source = recallReadingSource(bookId);
    let sessionId: string | null = null;
    let inFlight = false;
    let stopped = false;
    let lastInteraction = Date.now();

    const send = () => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      fetch("/api/reading/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, sessionId, paragraphIndex: currentParagraphRef.current, source }),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = (await res.json()) as { sessionId?: string };
            if (data.sessionId) sessionId = data.sessionId;
          } else if (res.status === 401 || res.status === 403 || res.status === 404) {
            stopped = true; // hết phiên đăng nhập / không còn quyền đọc — ngừng gửi
          }
        })
        .catch(() => {
          // best-effort — mất 1 nhịp chỉ làm mất ≤ 60 giây thời gian đọc
        })
        .finally(() => {
          inFlight = false;
        });
    };

    const onInteract = () => {
      const wasIdle = Date.now() - lastInteraction > IDLE_MS;
      lastInteraction = Date.now();
      if (wasIdle) send();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lastInteraction = Date.now();
        send();
      }
    };

    send();
    const interval = setInterval(() => {
      if (Date.now() - lastInteraction <= IDLE_MS) send();
    }, HEARTBEAT_INTERVAL_MS);
    const events = ["scroll", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onInteract, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearInterval(interval);
      for (const e of events) window.removeEventListener(e, onInteract);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isLoggedIn, accessGate, bookId, chapterId]);

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
          currentParagraphRef.current = idx;
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

  // ---- Bình luận theo đoạn ("Chú thích đoạn văn") ----
  // Khung mỗi đoạn: tô sáng khi hover (desktop), khi đang nhấn giữ (điện
  // thoại) hoặc khi đang mở cột bình luận của chính đoạn đó. -mx/px để nền
  // tô sáng tràn nhẹ ra 2 bên chữ, không làm lệch dòng.
  const paragraphShellProps = (i: number) => {
    const active = openCommentsParagraph === i || pressedParagraph === i;
    return {
      className: `group relative -mx-3 mb-[1.5em] rounded-lg px-3 transition-colors ${
        active ? "bg-info/10" : "sm:hover:bg-info/10"
      }`,
      onTouchStart: (e: React.TouchEvent) => startLongPress(i, e),
      onTouchMove: moveLongPress,
      onTouchEnd: cancelLongPress,
      onTouchCancel: cancelLongPress,
    };
  };

  // Nút "Bình luận" nổi GIỮA cột chữ, ngay trên đoạn: desktop hiện khi hover
  // đoạn (group-hover), điện thoại hiện sau khi nhấn giữ. Lớp pb-2 trong suốt
  // nối nút với đoạn để di chuột từ đoạn lên nút không bị mất hover.
  const renderCommentPill = (i: number) => {
    const shownOnTouch = pressedParagraph === i;
    return (
      <div
        data-comment-pill
        className={`absolute bottom-full left-1/2 z-10 -translate-x-1/2 pb-2 transition-opacity ${
          shownOnTouch
            ? "opacity-100"
            : "pointer-events-none opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100"
        }`}
      >
        <button
          type="button"
          onClick={() => openParagraphComments(i)}
          className="relative cursor-pointer whitespace-nowrap rounded-full bg-brand-ink-dark px-9 py-2.5 font-sans text-[12px] font-semibold tracking-[.6px] text-white shadow-[0_8px_20px_rgba(0,0,0,.22)] transition-colors hover:bg-brand-ink"
        >
          BÌNH LUẬN
          <span
            aria-hidden
            className="absolute left-1/2 top-full size-0 -translate-x-1/2 border-x-[7px] border-t-[7px] border-x-transparent border-t-brand-ink-dark"
          />
        </button>
      </div>
    );
  };

  // Huy hiệu số bình luận ở cuối đoạn — select-none để không lẫn vào chữ khi
  // bôi đen/sao chép. stopPropagation onMouseUp: không kích hoạt luồng bôi
  // đen (handleParagraphSelect) của <p> cha.
  const renderCommentCount = (i: number, count: number) =>
    count > 0 ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openParagraphComments(i);
        }}
        onMouseUp={(e) => e.stopPropagation()}
        aria-label={`${count} bình luận cho đoạn này`}
        className="ml-1.5 inline-flex h-[1.35em] min-w-[1.35em] cursor-pointer select-none items-center justify-center rounded-full bg-stone-light/45 px-1.5 align-[0.1em] font-sans text-[max(11px,0.62em)] font-semibold leading-none text-white transition-colors hover:bg-brand-gold-dark"
      >
        {count}
      </button>
    ) : null;

  return (
    <div
      style={{ background: c.pageBg, ["--comments-w" as string]: `${PARAGRAPH_COMMENTS_PANEL_WIDTH}px` }}
      // Mở "Chú thích đoạn văn" trên desktop: chừa chỗ bên phải cho cột bình
      // luận để trang truyện dồn sang trái (không bị che) — điện thoại thì
      // panel đè lên (xem paragraph-comments-panel.tsx).
      className={`min-h-screen transition-[padding] duration-300 ${commentsOpen ? "lg:pr-[var(--comments-w)]" : ""}`}
    >
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
        {/* Khi cột bình luận mở, bỏ bố cục 3 cột (rail tác giả 2 bên) — không
            đủ chỗ cho 220+720+220 cạnh cột 400px; AuthorPanel dạng inline
            bên dưới hiện thay. */}
        <div
          className={`grid grid-cols-1 ${commentsOpen ? "" : "xl:grid-cols-[220px_720px_220px] xl:justify-center xl:gap-8"}`}
        >
          <aside className={commentsOpen ? "hidden" : "hidden xl:block"}>
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
        <div className={`relative z-[2] mb-6 ${commentsOpen ? "" : "xl:hidden"}`}>
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
            <Alert tone="error" className="mb-6 rounded-[14px] text-sm">
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
            </Alert>
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
                // Ảnh thiết kế chèn inline — marker `[[thiet-ke:<id>]]`
                // (xem chapter-editor.tsx) HOẶC nguyên link chia sẻ, ở
                // BẤT KỲ vị trí nào trong đoạn (không đòi phải chiếm
                // nguyên cả đoạn — quá nhiều tác giả dán link giữa văn
                // bản liền mạch mà không tách dòng trống thật; server
                // không có cách nào biết chắc \n\n có tồn tại hay chỉ do
                // trình duyệt tự xuống dòng lúc hiển thị). Xem
                // splitParagraphAroundDesignImages, src/lib/design/share-link.ts
                // — read/[bookSlug]/[chapterId]/page.tsx trích id giống
                // hệt để tải trước. Đoạn không có link/marker nào ->
                // splitParagraphAroundDesignImages trả về đúng 1 phần
                // text nguyên văn, rơi thẳng xuống pipeline bôi đen/bình
                // luận cũ, không đổi hành vi.
                const parts = splitParagraphAroundDesignImages(p);
                const hasImage = parts.some((part) => part.type === "image");

                if (hasImage) {
                  // Bỏ máy bôi đen cho đoạn có ảnh nhúng (hiếm, và bôi
                  // đen xuyên qua 1 tấm ảnh không có ý nghĩa rõ ràng) —
                  // vẫn giữ nút bình luận theo đúng chỉ số đoạn `i` như
                  // mọi đoạn khác.
                  const count = countByParagraph.get(i) ?? 0;
                  return (
                    <div key={i} {...paragraphShellProps(i)}>
                      {renderCommentPill(i)}
                      {parts.map((part, pi) => {
                        if (part.type === "text") {
                          return part.text ? (
                            <p key={pi} className="whitespace-pre-wrap">
                              {part.text}
                            </p>
                          ) : null;
                        }
                        const image = designImages[part.id];
                        // Chưa validate được (đã bị xoá/gỡ/chưa công khai)
                        // -> giữ lại NGUYÊN VĂN link/marker đã dán, không
                        // âm thầm làm mất nội dung tác giả đã viết.
                        if (!image) return <p key={pi}>{part.raw}</p>;
                        return (
                          <div key={pi} className="mb-[1.5em]">
                            <ProtectedImage
                              src={image.imageUrl}
                              alt={image.altText ?? ""}
                              wrapperClassName="mx-auto w-fit max-w-full"
                              className="max-w-full rounded-xl"
                            />
                          </div>
                        );
                      })}
                      {renderCommentCount(i, count)}
                    </div>
                  );
                }

                const count = countByParagraph.get(i) ?? 0;
                const segments = buildHighlightSegments(p, highlightsByParagraph.get(i) ?? []);
                return (
                  <div key={i} {...paragraphShellProps(i)}>
                    {renderCommentPill(i)}
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
                      {renderCommentCount(i, count)}
                    </p>
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
            {bookId && chapterId && (
              <ReportContentButton bookId={bookId} chapterId={chapterId} triggerStyle={{ borderColor: c.hair, color: c.ink }} />
            )}
          </div>

          <TropeVotePanel
            chapterId={chapterId}
            candidates={tropeCandidates}
            initialVotedCharacterId={initialTropeVoteCharacterId}
            c={c}
          />

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

      {bookId && listModalOpen && (
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
        <div className="fixed inset-x-4 bottom-20 z-[80] mx-auto max-w-[420px] rounded-lg border border-error-border bg-[#fdf1f1] px-4 py-2.5 text-center text-[13px] font-medium text-error shadow-[0_8px_24px_rgba(0,0,0,.15)] sm:bottom-6">
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
