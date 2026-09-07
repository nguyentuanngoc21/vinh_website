"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon, HeadphonesIcon } from "@phosphor-icons/react/dist/ssr";
import { NavBarContent } from "@/components/nav-bar-content";
import { BookCover } from "@/components/covers/book-cover";
import { buildCoverSpec } from "@/lib/covers/build-cover-spec";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

const VISIBLE_DEPTH = 3;
const STAGE_WIDTH = 1160;
const STAGE_HEIGHT = 470;

function mod(i: number, n: number) {
  return ((i % n) + n) % n;
}

// Độ dịch ngang (px) của 1 bìa cách active `c` bước — dùng chung cho
// wrapStyle (bìa 3D thật) và lớp bắt click phẳng bên dưới, để 2 bên luôn
// khớp toạ độ nhau.
function cardOffsetX(c: number) {
  return c * 118 - (c > 1 ? (c - 1) * 26 : 0);
}

function buildSlide(books: HomepageBook[], index: number, active: number, n: number) {
  let d = index - active;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  const abs = Math.abs(d);
  const sgn = Math.sign(d);
  const c = Math.min(abs, VISIBLE_DEPTH);
  const hidden = abs > VISIBLE_DEPTH;
  const teleport = abs >= n / 2 - 0.01;

  const wrapStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 230,
    height: 330,
    marginLeft: -115,
    marginTop: -165,
    transform: `translateX(${sgn * cardOffsetX(c)}px) translateZ(${-c * 78}px) rotateY(${-sgn * c * 20}deg) scale(${1 - c * 0.07})`,
    backfaceVisibility: "hidden",
    transformStyle: "preserve-3d",
    zIndex: 50 - c,
    opacity: hidden ? 0 : 1 - (c > 2 ? 0.55 : 0),
    pointerEvents: hidden ? "none" : "auto",
    transition: teleport
      ? "opacity .3s ease"
      : "transform .55s cubic-bezier(.25,.8,.3,1), opacity .45s ease",
    cursor: "pointer",
  };

  // Bìa tự động sinh theo genre (src/lib/covers/*) khi sách chưa gắn bìa
  // thật (coverUrl null) — book.gradient không còn tồn tại (data thật
  // không có field này), chỉ còn dùng lại palette do buildCoverSpec()
  // chọn để phản chiếu bên dưới khớp đúng màu bìa đang hiện.
  const book = books[index];
  const coverSpec = buildCoverSpec({
    id: book.id,
    title: book.title,
    author: book.authorNickname,
    genre: book.genre,
  });

  const coverStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: 14,
    boxShadow: abs === 0 ? "0 26px 50px rgba(0,0,0,.38)" : "0 14px 30px rgba(0,0,0,.22)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    padding: 20,
    color: "#fff",
    position: "relative",
    overflow: "hidden",
    filter: abs === 0 ? "none" : `brightness(${1 - abs * 0.16}) saturate(${1 - abs * 0.15})`,
    transition: "filter .5s ease, box-shadow .5s ease",
  };

  const reflStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 334,
    width: "100%",
    height: 58,
    borderRadius: 14,
    background: `linear-gradient(${coverSpec.palette.from}, ${coverSpec.palette.to})`,
    opacity: hidden || c > 2 ? 0 : 0.16,
    transform: "scaleY(-1)",
    WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 92%)",
    maskImage: "linear-gradient(to bottom, #000 0%, transparent 92%)",
    pointerEvents: "none",
    transition: "opacity .45s ease",
  };

  return { wrapStyle, coverStyle, reflStyle };
}

export function BookCoverflow({ books }: { books: HomepageBook[] }) {
  const n = books.length;
  const [active, setActive] = useState(0);
  const [scale, setScale] = useState(1);
  const stageWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? STAGE_WIDTH;
      setScale(Math.min(1, width / STAGE_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const go = (i: number) => setActive(mod(i, n));
  const current = n > 0 ? books[active] : null;

  return (
    <section className="bg-gradient-to-b from-[#fafaf9] to-white px-4 pb-2.5 sm:px-8 lg:px-11">
      <nav
        data-tour="tour-nav"
        className="-mx-4 mb-[26px] flex items-center gap-[26px] overflow-x-auto bg-brand-ink px-4 py-3.5 text-[15px] font-medium [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:-mx-11 lg:px-11 [&::-webkit-scrollbar]:hidden"
      >
        <NavBarContent />
      </nav>

      <div className="mb-2">
        <div className="text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">
          ĐỀ XUẤT CHO BẠN
        </div>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-ink">
          Tác phẩm nổi bật tuần này
        </h2>
      </div>

      {n === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#e7e5e4] bg-white/60 py-16 text-center">
          <div className="text-base font-semibold text-ink">Chưa có tác phẩm nào được xuất bản</div>
          <div className="text-sm text-[#78716c]">Mục này sẽ hiện tác phẩm thật ngay khi có sách đầu tiên được publish.</div>
        </div>
      ) : (
        <>
          <div ref={stageWrapRef} style={{ height: STAGE_HEIGHT * scale }} className="relative">
            <div
              style={{
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: "top center",
                perspective: 1400,
                perspectiveOrigin: "50% 42%",
              }}
              className="absolute left-1/2 -translate-x-1/2"
            >
              {/* Lớp hiển thị 3D — chỉ để vẽ, không nhận click cho bìa bên
                  nữa. Đã kiểm chứng bằng DevTools inspect trên production:
                  hover vào bìa bên trả về đúng div.absolute.inset-0 (base
                  ngoài preserve-3d) chứ không phải bìa — hit-test của trình
                  duyệt trên phần tử bị rotateY/translateZ trong perspective
                  + bị scale lại theo bề rộng màn hình (ResizeObserver ở
                  trên) không khớp vị trí hiển thị. Bìa giữa (transform gần
                  như identity) không bị ảnh hưởng nên Link vẫn bấm được
                  bình thường. Click bìa bên được xử lý ở lớp overlay phẳng
                  (2D) bên dưới thay vì dựa vào hit-test 3D không đáng tin. */}
              <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
                {books.map((book, i) => {
                  const { wrapStyle, coverStyle, reflStyle } = buildSlide(books, i, active, n);
                  let d = i - active;
                  if (d > n / 2) d -= n;
                  if (d < -n / 2) d += n;
                  const isCenter = d === 0;

                  const coverInner = (
                    <>
                      <div className="absolute inset-0">
                        <BookCover
                          id={book.id}
                          title={book.title}
                          author={book.authorNickname}
                          genre={book.genre}
                          coverUrl={book.coverUrl}
                        />
                      </div>
                      {book.genre && (
                        <div className="absolute top-3.5 left-3.5 rounded-full bg-black/[0.32] px-2.5 py-1 text-[10px] font-semibold tracking-[.6px] uppercase backdrop-blur-[2px]">
                          {book.genre}
                        </div>
                      )}
                      {/* Không overlay tên truyện/tác giả ở đây —
                          GeneratedBookCover (bên trong BookCover) đã tự vẽ
                          cả 2 ngay trên bìa (title theo layout riêng, tác
                          giả căn giữa ở footer) — thêm chữ trắng đè lên chỉ
                          gây lặp 2 lần cùng nội dung. */}
                    </>
                  );

                  return (
                    <div key={book.id} style={wrapStyle}>
                      {isCenter ? (
                        // Bìa giữa → Link dẫn thẳng tới trang truyện (transform
                        // gần identity nên hit-test 3D vẫn đúng, đã kiểm chứng)
                        <Link
                          href={`/truyen/${book.slug}`}
                          style={coverStyle}
                          className="block no-underline"
                          aria-label={`Đọc ${book.title}`}
                        >
                          {coverInner}
                        </Link>
                      ) : (
                        <div style={coverStyle}>{coverInner}</div>
                      )}
                      <div style={reflStyle} />
                    </div>
                  );
                })}
              </div>

              {/* Lớp bắt click phẳng (2D) cho bìa 2 bên — nằm ngoài
                  preserve-3d, chỉ dùng translateX (giống hệt công thức ở
                  wrapStyle qua cardOffsetX, bỏ translateZ/rotateY) nên
                  hit-test luôn đúng vị trí, không phụ thuộc trình duyệt xử
                  lý 3D thế nào. clipPath giữ lại đúng nửa hướng ra ngoài để
                  không đè lên vùng bìa giữa (bìa liền kề chờm ~1 nửa vào
                  giữa theo thiết kế). */}
              <div className="pointer-events-none absolute inset-0">
                {books.map((book, i) => {
                  if (i === active) return null;
                  let d = i - active;
                  if (d > n / 2) d -= n;
                  if (d < -n / 2) d += n;
                  const abs = Math.abs(d);
                  if (abs > VISIBLE_DEPTH) return null;
                  const sgn = Math.sign(d);
                  const c = Math.min(abs, VISIBLE_DEPTH);
                  return (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => go(i)}
                      aria-label={`Xem ${book.title}`}
                      className="pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0"
                      style={{
                        left: "50%",
                        top: "50%",
                        width: 230,
                        height: 330,
                        marginLeft: -115,
                        marginTop: -165,
                        transform: `translateX(${sgn * cardOffsetX(c)}px)`,
                        clipPath: sgn < 0 ? "inset(0 50% 0 0)" : "inset(0 0 0 50%)",
                        zIndex: 50 - c,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 pt-2">
            {/* Tên truyện: Link dẫn tới trang truyện */}
            <div className="text-center">
              <Link
                href={`/truyen/${current!.slug}`}
                className="text-2xl font-bold tracking-tight text-ink no-underline transition-colors hover:text-brand-gold-dark"
              >
                {current!.title}
              </Link>
              <div className="mt-1 text-sm text-[#78716c]">
                {current!.authorNickname ?? "Ẩn danh"}
                {current!.genre ? ` · ${current!.genre}` : ""}
              </div>
            </div>
            <div className="flex gap-3">
              <Link
                href={`/truyen/${current!.slug}`}
                className="rounded-full bg-brand-gold px-[26px] py-[11px] text-sm font-semibold text-brand-ink no-underline"
              >
                Đọc ngay
              </Link>
              <Link
                href="/audio/now-playing"
                className="flex items-center gap-2 rounded-full border border-[#e7e5e4] px-[22px] py-[11px] text-sm font-semibold text-ink no-underline"
              >
                <HeadphonesIcon size={16} />
                Nghe
              </Link>
            </div>

            {/* Nút ←→ nằm hai bên row dots, đã chuyển từ header xuống đây */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => go(active - 1)}
                aria-label="Tác phẩm trước"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#e7e5e4] bg-white text-[#57534e] transition-colors hover:border-brand-gold hover:text-brand-gold-dark"
              >
                <CaretLeftIcon size={16} />
              </button>

              <div className="flex items-center gap-[3px]">
                {books.map((book, i) => (
                  <button
                    key={book.id}
                    aria-label={`Chuyển đến ${book.title}`}
                    onClick={() => go(i)}
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

              <button
                onClick={() => go(active + 1)}
                aria-label="Tác phẩm tiếp theo"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#e7e5e4] bg-white text-[#57534e] transition-colors hover:border-brand-gold hover:text-brand-gold-dark"
              >
                <CaretRightIcon size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
