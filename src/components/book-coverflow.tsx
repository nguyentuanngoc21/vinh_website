"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookmarkSimpleIcon,
  BookOpenIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  EyeIcon,
  HeadphonesIcon,
  PauseCircleIcon,
  PencilSimpleLineIcon,
  UserIcon,
} from "@phosphor-icons/react/dist/ssr";
import { NavBarContent } from "@/components/nav-bar-content";
import { BookCover } from "@/components/covers/book-cover";
import { ExclusiveBadge } from "@/components/story/exclusive-badge";
import { formatCount } from "@/lib/design/get-design-gallery";
import { BOOK_STATUS_LABEL, type BookStatus } from "@/lib/story/status";
import { truncateWords } from "@/lib/story/truncate-words";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

// Thiết kế "Vịnh Trang chủ" (Claude Design): 1 thẻ lớn cho tác phẩm đang
// chọn + dải bìa MỌI tác phẩm bên dưới (tác phẩm đang chọn ở giữa), tự
// chuyển sau mỗi 15 giây.
const AUTO_ADVANCE_MS = 15_000;
const DESC_MAX_WORDS = 60;
const MAX_ITEMS = 7;
const STRIP_GAP = 20;
// Chiều cao phần chữ (tên + tác giả) dưới mỗi bìa trong dải.
const STRIP_TEXT_HEIGHT = 78;
// Chừa chỗ cho viền vàng (ring + offset) của bìa đang chọn, không bị mép
// trên của dải (overflow-hidden) cắt mất.
const STRIP_RING_SPACE = 6;

// Số "ô" ngang của dải theo bề rộng — phần lẻ (.5) chia đôi thành phần bìa
// lộ ra ở 2 mép, để người đọc biết còn truyện ở trước/sau.
function stripSlotsAcross(width: number) {
  if (width < 640) return 3.5;
  if (width < 1024) return 4.5;
  return 5.5;
}

function mod(i: number, n: number) {
  return ((i % n) + n) % n;
}

const pad = (x: number) => String(x).padStart(2, "0");

const STATUS_CHIP: Record<BookStatus, { className: string; Icon: typeof CheckCircleIcon }> = {
  hoan_thanh: {
    className: "border-success-form-border bg-success-form-bg text-success-form",
    Icon: CheckCircleIcon,
  },
  dang_sang_tac: {
    className: "border-cream-gold-border bg-cream-gold text-brand-gold-dark",
    Icon: PencilSimpleLineIcon,
  },
  tam_ngung: {
    className: "border-cream bg-white text-stone-dark",
    Icon: PauseCircleIcon,
  },
};

const CHIP =
  "flex items-center gap-[5px] whitespace-nowrap rounded-full border px-2.5 py-[5px] text-xs font-medium";

// Bước ngắn nhất (có dấu) để đi từ tác phẩm `from` tới `to` trên vòng n.
function shortestStep(from: number, to: number, n: number) {
  let d = mod(to - from, n);
  if (d > n / 2) d -= n;
  return d;
}

export function BookCoverflow({ books: allBooks }: { books: HomepageBook[] }) {
  const books = allBooks.slice(0, MAX_ITEMS);
  const n = books.length;
  // `pos` là vị trí LIÊN TỤC (không quay về 0) trên dải lặp vô hạn — mỗi
  // ô j của dải hiện sách books[j mod n], key theo j. Chuyển tiếp = pos+1:
  // mọi ô đang hiện giữ nguyên key và chỉ trượt sang trái 1 ô, ô mới được
  // mount sẵn NGOÀI mép khung rồi trượt vào — không ô nào nhảy chỗ.
  const [{ pos, dir }, setNav] = useState({ pos: 0, dir: 1 });
  const active = n > 0 ? mod(pos, n) : 0;
  const [paused, setPaused] = useState(false);
  const [stripWidth, setStripWidth] = useState(1180);
  const stripRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const step = (delta: number) =>
    setNav((s) => (delta === 0 ? s : { pos: s.pos + delta, dir: Math.sign(delta) }));
  const goTo = (i: number) => step(shortestStep(active, i, n));

  // Hẹn giờ đặt lại mỗi khi `active` đổi — bấm tay (nút/dot/bìa) cũng tính
  // lại đủ 15 giây cho tác phẩm mới, không bị nhảy tiếp ngay sau khi chọn.
  useEffect(() => {
    if (n <= 1 || paused) return;
    const t = setTimeout(() => setNav((s) => ({ pos: s.pos + 1, dir: 1 })), AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [pos, n, paused]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setStripWidth(entries[0]?.contentRect.width ?? 1180);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const deltaX = e.changedTouches[0].clientX - start.x;
    const deltaY = e.changedTouches[0].clientY - start.y;
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      step(deltaX > 0 ? -1 : 1);
    }
  };

  const current = n > 0 ? books[active] : null;
  const slideFrom = { "--vn-slide-from": `${dir * 28}px` } as CSSProperties;
  const status = current ? STATUS_CHIP[current.status] : null;
  const slotsAcross = stripSlotsAcross(stripWidth);
  const cardWidth = (stripWidth - STRIP_GAP * (Math.ceil(slotsAcross) - 1)) / slotsAcross;
  const coverHeight = cardWidth * 1.5;
  // Số ô mỗi bên cần render: đủ phủ phần nhìn thấy + 1 ô chờ ngoài mép.
  const reach = Math.ceil(slotsAcross / 2) + 1;

  return (
    <section className="bg-gradient-to-b from-[#fafaf9] to-white px-4 pb-2.5 sm:px-8 lg:px-11">
      <nav
        data-tour="tour-nav"
        className="-mx-4 mb-[26px] flex items-center gap-[26px] overflow-x-auto bg-brand-ink px-4 py-3.5 text-[15px] font-medium [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:-mx-11 lg:px-11 [&::-webkit-scrollbar]:hidden"
      >
        <NavBarContent />
      </nav>

      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">ĐỀ XUẤT CHO BẠN</div>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-ink">Tác phẩm nổi bật tuần này</h2>
        </div>
      </div>

      {n === 0 || !current || !status ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#e7e5e4] bg-white/60 py-16 text-center">
          <div className="text-base font-semibold text-ink">Chưa có tác phẩm nào được xuất bản</div>
          <div className="text-sm text-[#78716c]">Mục này sẽ hiện tác phẩm thật ngay khi có sách đầu tiên được publish.</div>
        </div>
      ) : (
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {/* Thẻ lớn: bìa (crossfade) + thông tin tác phẩm đang chọn */}
          <div
            className="relative mt-2.5 flex touch-pan-y flex-col overflow-hidden rounded-[22px] border border-[#efe9df] bg-[#FAF6EE] sm:min-h-[420px] sm:flex-row"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            aria-roledescription="carousel"
          >
            {/* Chỉ 1 bìa — của tác phẩm đang chọn (theo `active`). key đổi
                theo truyện nên mỗi lần chuyển bìa mới remount + fade-in, không
                chồng sẵn mọi bìa rồi đổi opacity. Giữ tỉ lệ 2:3 để không cắt
                mất tên truyện/tác giả trên bìa thật. */}
            <div className="flex shrink-0 justify-center px-5 pt-6 sm:items-center sm:py-6 sm:pr-2 sm:pl-6">
              <Link
                key={pos}
                href={`/truyen/${current.slug}`}
                aria-label={`Đọc ${current.title}`}
                style={slideFrom}
                className="vn-slide-in relative block aspect-[2/3] w-[160px] overflow-hidden rounded-2xl shadow-[0_18px_40px_rgba(0,0,0,.22)] sm:w-[260px]"
              >
                <BookCover
                  id={current.id}
                  title={current.title}
                  author={current.authorNickname}
                  genre={current.genre}
                  coverUrl={current.coverUrl}
                  ageRating={current.ageRating}
                  priority
                />
                {current.isExclusive && <ExclusiveBadge variant="overlay" />}
              </Link>
            </div>

            <div
              key={pos}
              style={slideFrom}
              className="vn-slide-in flex min-w-0 flex-1 flex-col justify-center px-5 py-6 sm:py-9 sm:pr-8 sm:pl-4"
              aria-live="polite"
            >
              <div className="text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">
                {pad(active + 1)} / {pad(n)}
              </div>
              <Link
                href={`/truyen/${current.slug}`}
                className="mt-2.5 text-[28px] leading-[1.1] font-bold tracking-[-0.8px] text-balance text-ink no-underline transition-colors hover:text-brand-gold-dark sm:text-[44px] sm:tracking-[-1.2px]"
              >
                {current.title}
              </Link>
              {current.synopsis && (
                <p className="mt-3.5 max-w-[560px] text-[15px] leading-[1.6] text-pretty text-[#57534e] sm:text-base">
                  {truncateWords(current.synopsis, DESC_MAX_WORDS)}
                </p>
              )}

              <div className="mt-[22px] flex flex-wrap gap-2 text-[#3a3430]">
                {current.genre && (
                  <div className={`${CHIP} border-[#cfc6b8]`}>
                    <BookmarkSimpleIcon />
                    {current.genre}
                  </div>
                )}
                <div className={`${CHIP} font-semibold ${status.className}`}>
                  <status.Icon weight={current.status === "hoan_thanh" ? "fill" : "regular"} />
                  {BOOK_STATUS_LABEL[current.status]}
                </div>
                <div className={`${CHIP} border-[#cfc6b8]`}>
                  <EyeIcon />
                  {formatCount(current.viewCount)}
                </div>
                <div className={`${CHIP} border-[#cfc6b8]`}>
                  <BookOpenIcon />
                  {current.chapterCount} chương
                </div>
                <div className={`${CHIP} border-[#cfc6b8]`}>
                  <UserIcon />
                  {current.authorNickname ?? "Ẩn danh"}
                </div>
              </div>

              <div className="mt-[26px] flex flex-wrap gap-2.5">
                <Link
                  href={`/truyen/${current.slug}`}
                  className="flex items-center gap-2 rounded-full bg-brand-ink px-6 py-3 text-sm font-semibold whitespace-nowrap text-white no-underline"
                >
                  Đọc ngay <CaretRightIcon weight="bold" />
                </Link>
                <Link
                  href="/audio/now-playing"
                  className="flex items-center gap-2 rounded-full border border-[#cfc6b8] px-[22px] py-3 text-sm font-semibold whitespace-nowrap text-ink no-underline"
                >
                  <HeadphonesIcon size={16} /> Nghe
                </Link>
              </div>
            </div>
          </div>

          {/* Dải bìa mọi tác phẩm — tác phẩm đang chọn ở ô giữa, trượt 1 ô
              mỗi lần chuyển; không đủ chỗ thì 2 mép lộ 1 phần bìa trước/sau. */}
          {n > 1 && (
            <div
              ref={stripRef}
              className="relative mt-[22px] touch-pan-y overflow-hidden"
              style={{ height: coverHeight + STRIP_TEXT_HEIGHT + STRIP_RING_SPACE * 2 }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {Array.from({ length: reach * 2 + 1 }, (_, k) => pos - reach + k).map((j) => {
                const i = mod(j, n);
                const book = books[i];
                const d = j - pos;
                const isActive = d === 0;
                const left = stripWidth / 2 - cardWidth / 2 + d * (cardWidth + STRIP_GAP);
                const inView = left + cardWidth > 0 && left < stripWidth;
                // Tải sớm cả ô ngay ngoài mép 2 bên (ô sẽ trượt vào ở lần chuyển
                // kế tiếp) — lazy-load không kịp tải trong lúc trượt nên bìa bị trống.
                const slot = cardWidth + STRIP_GAP;
                const nearView = left + cardWidth > -slot && left < stripWidth + slot;
                const style: CSSProperties = {
                  width: cardWidth,
                  transform: `translate(${left}px, ${STRIP_RING_SPACE}px)`,
                  transition: "transform .6s cubic-bezier(.22,.8,.3,1)",
                };
                const inner = (
                  <>
                    <div
                      className={`relative aspect-[2/3] overflow-hidden rounded-2xl shadow-[0_10px_24px_rgba(0,0,0,.14)] transition-[box-shadow,filter] duration-300 ${
                        isActive ? "ring-3 ring-brand-gold ring-offset-2" : "brightness-[.92]"
                      }`}
                    >
                      <BookCover
                        id={book.id}
                        title={book.title}
                        author={book.authorNickname}
                        genre={book.genre}
                        coverUrl={book.coverUrl}
                        ageRating={book.ageRating}
                        priority={nearView}
                      />
                      {book.isExclusive && <ExclusiveBadge variant="overlay" />}
                      {book.genre && (
                        <div className="absolute top-3 right-3 max-w-[calc(100%-24px)] truncate rounded-full bg-black/[0.34] px-2.5 py-1 text-[10.5px] font-semibold tracking-[.4px] text-white">
                          {book.genre}
                        </div>
                      )}
                    </div>
                    <div
                      className={`mt-3 line-clamp-2 text-sm leading-[1.4] font-semibold sm:text-[15px] ${
                        isActive ? "text-brand-gold-dark" : "text-ink"
                      }`}
                    >
                      {book.title}
                    </div>
                    <div className="mt-1 truncate text-xs text-[#8a8580] sm:text-[13px]">
                      {book.authorNickname ?? "Ẩn danh"}
                    </div>
                  </>
                );
                // Mọi thẻ đều là <button> (cùng loại phần tử) — nếu thẻ đổi
                // loại khi thành "đang chọn", React tạo lại nó và thẻ nhảy
                // thẳng vào chỗ thay vì trượt. Bấm = đưa tác phẩm lên khối
                // nổi bật phía trên, KHÔNG chuyển trang (muốn đọc thì bấm bìa/
                // tên/nút "Đọc" ở khối trên). Không dùng <Link> + preventDefault:
                // NavigationOverlay bắt click vào <a> ở pha capture nên vẫn bật
                // màn hình loading và chờ mãi một lần chuyển trang không xảy ra.
                return (
                  <button
                    key={j}
                    type="button"
                    aria-label={isActive ? `${book.title} (đang hiển thị)` : `Hiển thị ${book.title}`}
                    aria-pressed={isActive}
                    aria-hidden={!inView}
                    tabIndex={inView ? 0 : -1}
                    onClick={() => {
                      if (!isActive) step(d);
                    }}
                    className="absolute top-0 left-0 block cursor-pointer border-0 bg-transparent p-0 text-left"
                    style={style}
                  >
                    {inner}
                  </button>
                );
              })}

              {/* Mũi tên 2 bên dải — căn giữa theo chiều cao bìa */}
              {[
                { dir: -1, label: "Tác phẩm trước", Icon: CaretLeftIcon, side: "left-1 sm:left-2" },
                { dir: 1, label: "Tác phẩm tiếp theo", Icon: CaretRightIcon, side: "right-1 sm:right-2" },
              ].map(({ dir, label, Icon, side }) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => step(dir)}
                  aria-label={label}
                  className={`absolute z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[#e7e5e4] bg-white/95 text-[#57534e] shadow-[0_6px_16px_rgba(0,0,0,.14)] transition-colors hover:border-brand-gold hover:text-brand-gold-dark sm:h-11 sm:w-11 ${side}`}
                  style={{ top: STRIP_RING_SPACE + coverHeight / 2 }}
                >
                  <Icon size={18} weight="bold" />
                </button>
              ))}
            </div>
          )}

          {n > 1 && (
            <div className="mt-[18px] flex items-center justify-center gap-[3px]">
              {books.map((book, i) => (
                <button
                  key={book.id}
                  type="button"
                  aria-label={`Chuyển đến ${book.title}`}
                  aria-current={i === active}
                  onClick={() => goTo(i)}
                  className="flex cursor-pointer items-center justify-center p-2"
                >
                  <span
                    style={{
                      width: i === active ? 22 : 7,
                      height: 7,
                      background: i === active ? "var(--color-brand-gold)" : "#d6d3d1",
                    }}
                    className="block rounded-full transition-all duration-[350ms]"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
