"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkSimpleIcon,
  HeadphonesIcon,
  ListBulletsIcon,
  ShareNetworkIcon,
  TextAaIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import { ChapterPicker, type ReaderChapterSummary } from "./chapter-picker";
import { VoteButton } from "./vote-button";
import { AuthorPanel } from "./author-panel";
import { ReadingListModal } from "./reading-list-modal";
import { shareOrCopy } from "@/lib/share";

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
    wmColor: "rgba(20,59,77,.07)",
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
    wmColor: "rgba(92,69,36,.08)",
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
    wmColor: "rgba(233,192,116,.07)",
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

const WATERMARK_TEXT = "Minh Khôi · @minhkhoi · ID 88245    ".repeat(60);
const PENALTY_STORAGE_KEY = "vinh_screenshot_penalty";

type PenaltyRule = { percent: number; durationDays: number };
type NextPenalty = PenaltyRule | { ban: true; durationDays: number };

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

  const rule = PENALTY_RULES[penalty.count - 1];
  if (!rule || !penalty.expiresAt) return null;
  const expiry = new Date(penalty.expiresAt).toLocaleDateString("vi-VN");
  const baseMessage = `Lần ${penalty.count}: tính thêm ${rule.percent}% token để mở khóa truyện đến ${expiry}.`;
  if (penalty.deductedAmount) {
    return `${baseMessage} Đã trừ ${penalty.deductedAmount} token cho lần vi phạm này.`;
  }
  return baseMessage;
}

function getNextPenalty(count: number): NextPenalty {
  if (count >= 4) return { ban: true, durationDays: 30 };
  return PENALTY_RULES[count];
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

async function postScreenshotPenaltyToServer(): Promise<PenaltyState | null> {
  try {
    const res = await fetch("/api/penalty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "screenshot" }),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (typeof payload?.screenshot_penalty_count !== "number") return null;
    return normalizePenaltyState(payload);
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
}: ReaderProps) {
  const [fontSize, setFontSize] = useState(19);
  const [theme, setTheme] = useState<ThemeName>("cream");
  const [panelOpen, setPanelOpen] = useState(true);
  const [penalty, setPenalty] = useState<PenaltyState>({ count: 0, expiresAt: null, banned: false, lastOffenseAt: null, deductedAmount: null });
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

  const paragraphs = content.split("\n\n");
  // Cùng công thức với src/components/author/chapter-editor.tsx, để số chữ/
  // thời gian đọc khớp giữa lúc soạn và lúc đọc thật.
  const wordCount = (content.trim().match(/\S+/g) ?? []).length;
  const readMinutes = Math.max(1, Math.round(wordCount / 200));

  // --- State cho chọn chương/vote/danh sách đọc/follow/share — hoàn toàn
  // mới, KHÔNG đụng tới state/effect hệ thống chống chụp màn hình ở trên. ---
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const [voted, setVoted] = useState(initialVoted);
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [voting, setVoting] = useState(false);
  const [following, setFollowing] = useState(isFollowingAuthor);
  const [followPending, setFollowPending] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [copyBubble, setCopyBubble] = useState<string | null>(null);
  const [visibleParagraph, setVisibleParagraph] = useState(paragraphs[0] ?? "");
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  const showCopyBubble = (label: string) => {
    setCopyBubble(label);
    setTimeout(() => setCopyBubble(null), 2200);
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
    if (result === "copied") showCopyBubble("Đã sao chép liên kết");
  };

  const handleShareExcerpt = async () => {
    if (!bookSlug || !chapterId || typeof window === "undefined") return;
    const result = await shareOrCopy({
      title: chapterTitle,
      text: visibleParagraph,
      url: `${window.location.origin}/read/${bookSlug}/${chapterId}`,
    });
    if (result === "copied") showCopyBubble("Đã sao chép liên kết");
  };

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
      const serverState = await postScreenshotPenaltyToServer();
      if (serverState) {
        savePenaltyState(serverState);
        setPenalty(serverState);
        setWarningMessage(
          serverState.banned
            ? "Bạn đã bị cấm vì chụp màn hình."
            : `Đã áp dụng phạt. Số token trừ: ${serverState.deductedAmount ?? 0}`
        );
        return;
      }

      if (penalty.banned) {
        return;
      }

      const now = Date.now();
      const nextCount = penalty.count + 1;
      const next = getNextPenalty(penalty.count);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "PrintScreen" ||
        event.code === "PrintScreen" ||
        event.key === "F13" ||
        ((event.key === "s" || event.key === "S") && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) ||
        (event.key === "s" && event.metaKey && event.shiftKey)
      ) {
        setScreenshotDetected(true);
        setWarningMessage("Hệ thống đã phát hiện hành vi chụp màn hình và đang áp dụng phạt.");
      }
    };

    const onCopy = () => {
      setScreenshotDetected(true);
      setWarningMessage("Hệ thống đã phát hiện hành vi sao chép/chụp màn hình và đang áp dụng phạt.");
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
    };
  }, []);

  // Theo dõi đoạn văn đang hiện giữa khung nhìn lúc cuộn — dùng cho nút
  // chia sẻ ở AuthorPanel ("chia sẻ đoạn đang đọc"). Effect RIÊNG, không
  // chung với 3 effect chống chụp màn hình ở trên.
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
        if (!Number.isNaN(idx) && paragraphs[idx]) setVisibleParagraph(paragraphs[idx]);
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
      <div
        style={{ background: c.barBg, borderColor: c.hair }}
        className="sticky top-0 z-30 flex items-center justify-between border-b px-7 py-3"
      >
        <div className="flex min-w-0 items-center gap-4.5">
          <Link href={bookSlug ? `/truyen/${bookSlug}` : "/"}>
            <ArrowLeftIcon
              size={22}
              style={{ color: c.ink }}
              className="cursor-pointer transition-colors hover:text-brand-gold-dark"
            />
          </Link>
          <div className="flex min-w-0 items-center gap-2.5">
            <svg width="30" height="30" viewBox="0 0 100 100" className="shrink-0">
              <circle cx="50" cy="50" r="48" fill="var(--color-brand-ink)" />
              <path
                d="M50,98 A48,48 0 0 1 50,2 A24,24 0 0 1 50,50 A24,24 0 0 0 50,98 Z"
                fill="var(--color-cream-card-alt)"
              />
              <circle cx="44" cy="24" r="3" fill="var(--color-brand-ink)" />
            </svg>
            <div className="min-w-0">
              <div
                style={{ color: c.ink }}
                className="truncate text-[15px] font-semibold"
              >
                {bookTitle}
              </div>
              <div style={{ color: c.inkSoft }} className="text-xs">
                Chương {chapterPosition} · {chapterTitle}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          <Link
            href="/audio/now-playing"
            style={{ borderColor: c.hair, color: c.ink }}
            className="flex items-center gap-2 rounded-full border px-[15px] py-1.5 text-[13px] font-semibold no-underline transition-colors hover:border-brand-ink"
          >
            <HeadphonesIcon /> Nghe
          </Link>
          <ListBulletsIcon
            size={22}
            role="button"
            aria-label="Chọn chương"
            tabIndex={0}
            style={{ color: c.ink }}
            className="cursor-pointer transition-colors hover:text-brand-gold-dark"
            onClick={() => {
              // 2 panel nổi (chọn chương/cỡ chữ) đè lên nhau nếu cùng mở —
              // loại trừ nhau, giống tab, cho gọn.
              setChapterPickerOpen((v) => !v);
              setPanelOpen(false);
            }}
          />
          <VoteButton variant="compact" voted={voted} voteCount={voteCount} pending={voting} onToggle={handleToggleVote} c={c} />
          <TextAaIcon
            size={23}
            role="button"
            aria-label="Tuỳ chỉnh cỡ chữ và nền"
            tabIndex={0}
            style={{ color: c.ink }}
            className="cursor-pointer transition-colors hover:text-brand-gold-dark"
            onClick={() => {
              setPanelOpen((v) => !v);
              setChapterPickerOpen(false);
            }}
          />
        </div>
      </div>

      <div style={{ background: c.hair }} className="h-[3px]">
        <div className="h-full w-[62%] bg-brand-gold" />
      </div>

      {panelOpen && (
        <div
          style={{ background: c.barBg, borderColor: c.hair }}
          className="fixed right-6 top-[58px] z-40 w-[280px] rounded-[14px] border p-5 shadow-[0_8px_30px_rgba(0,0,0,.18)]"
        >
          <div
            style={{ color: c.inkSoft }}
            className="mb-3 text-[13px] font-bold tracking-wide"
          >
            CỠ CHỮ
          </div>
          <div className="mb-5 flex gap-2.5">
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.max(15, s - 1))}
              style={{ borderColor: c.hair, color: c.ink }}
              className="flex-1 cursor-pointer rounded-lg border py-2.5 text-center text-[15px] font-semibold transition-colors hover:border-brand-ink"
            >
              A−
            </button>
            <div
              style={{ borderColor: c.hair, color: c.inkSoft }}
              className="flex-1 rounded-lg border py-2.5 text-center text-sm font-semibold"
            >
              {fontSize}px
            </div>
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.min(26, s + 1))}
              style={{ borderColor: c.hair, color: c.ink }}
              className="flex-1 cursor-pointer rounded-lg border py-2.5 text-center text-lg font-semibold transition-colors hover:border-brand-ink"
            >
              A+
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

      <div className="mx-auto max-w-[1160px]">
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
                c={c}
              />
            </div>
          </aside>

          <div className="relative mx-auto max-w-[720px] overflow-hidden px-8 py-[54px] pb-20">
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
            c={c}
          />
        </div>
        <div
          aria-hidden="true"
          style={{ inset: "-30% -20%" }}
          className="pointer-events-none absolute z-[1] animate-[vn-drift_26s_ease-in-out_infinite]"
        >
          <div
            style={{
              color: c.wmColor,
              lineHeight: 5,
              wordSpacing: "40px",
              letterSpacing: "1px",
            }}
            className="whitespace-pre-wrap text-[15px] font-semibold"
          >
            {WATERMARK_TEXT}
          </div>
        </div>

        <div className="relative z-[2]">
          <div
            style={{ color: c.inkSoft }}
            className="text-xs font-medium tracking-[2px]"
          >
            CHƯƠNG {chapterPosition}
          </div>
          <h1
            style={{ color: c.ink }}
            className="mb-1.5 mt-2.5 font-[family-name:var(--font-lora)] text-[34px] font-semibold leading-[1.25]"
          >
            {chapterTitle}
          </h1>
          <div
            style={{ color: c.inkSoft }}
            className="mb-2 flex items-center gap-3.5 text-[13px]"
          >
            <span>{authorName}</span>
            <span>·</span>
            <span>{wordCount.toLocaleString("vi-VN")} chữ</span>
            <span>·</span>
            <span>{readMinutes} phút đọc</span>
          </div>

          <div
            style={{ background: c.tintBg, borderColor: c.tintBorder, color: c.tintInk }}
            className="mb-[30px] inline-flex items-center gap-2 rounded-lg border px-[13px] py-2 text-xs font-medium"
          >
            <ShieldCheckIcon /> Nội dung được bảo hộ · render dạng ảnh ·
            watermark theo phiên đọc của bạn
          </div>

{warningMessage ? (
              <div className="mb-6 rounded-[14px] border border-[#F3C6C6] bg-[#FBEDEC] px-4 py-3 text-sm text-[#B02A37]">
                {warningMessage}
              </div>
            ) : penalty.banned ? (
            <div className="mb-6 rounded-[14px] border border-[#F3C6C6] bg-[#FBEDEC] px-4 py-3 text-sm text-[#B02A37]">
              Tài khoản này đã bị cấm vĩnh viễn vì vi phạm chụp màn hình.
            </div>
          ) : isPenaltyActive ? (
            <div className="mb-6 rounded-[14px] border border-[#F3C6C6] bg-[#FBEDEC] px-4 py-3 text-sm text-[#B02A37]">
              {formatPenaltyMessage(penalty)}
            </div>
          ) : null}

          {isPenaltyActive && (
            <div className="mb-6 rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#475569]">
              Với phạt đang áp dụng, truyện này đang bị khóa vì vi phạm chụp màn hình.
            </div>
          )}

          <div className="relative">
            <div
              style={{ fontSize: `${fontSize}px`, color: c.body }}
              className="font-[family-name:var(--font-lora)] leading-[2]"
            >
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  ref={(el) => {
                    paragraphRefs.current[i] = el;
                  }}
                  data-paragraph-index={i}
                  className="mb-[1.5em]"
                >
                  {p}
                </p>
              ))}
            </div>
            {isPenaltyActive && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[14px] bg-white/90 p-6 text-center text-sm font-semibold text-[#7f1d1d] shadow-[0_10px_30px_rgba(0,0,0,.12)]">
                Nội dung đang bị khóa do vi phạm chụp màn hình. Vui lòng chờ hết hạn phạt hoặc liên hệ hỗ trợ.
              </div>
            )}
          </div>

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
            {copyBubble && <span className="text-xs font-medium text-brand-gold-dark">{copyBubble}</span>}
          </div>

          <div className="mt-[30px] flex gap-3.5">
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

      {bookId && (
        <ReadingListModal
          open={listModalOpen}
          onClose={() => setListModalOpen(false)}
          bookId={bookId}
          bookTitle={bookTitle}
        />
      )}
    </div>
  );
}
