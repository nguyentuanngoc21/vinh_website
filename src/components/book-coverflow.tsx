"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon, HeadphonesIcon } from "@phosphor-icons/react/dist/ssr";
import { books } from "@/lib/books";
import { NavStripLinks } from "@/components/nav-strip-links";
import { BookCover } from "@/components/covers/book-cover";
import { buildCoverSpec } from "@/lib/covers/build-cover-spec";
import type { BookGenre } from "@/lib/supabase/types";

// books[].tag là string tự do (mock, chưa nối Supabase thật — xem
// src/lib/books.ts) nhưng mọi giá trị đang dùng đều khớp đúng 1 trong 8
// BookGenre chính thức (không có "Kinh dị"/"Phiêu lưu" trong mock, chỉ có
// trong danh sách filter genres) — cast an toàn ở đây, không phải ép kiểu
// bừa.
function mockTagToGenre(tag: string): BookGenre {
  return tag as BookGenre;
}

const VISIBLE_DEPTH = 3;
const STAGE_WIDTH = 1160;
const STAGE_HEIGHT = 470;

function mod(i: number, n: number) {
  return ((i % n) + n) % n;
}

function buildSlide(index: number, active: number, n: number) {
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
    transform: `translateX(${sgn * (c * 118 - (c > 1 ? (c - 1) * 26 : 0))}px) translateZ(${-c * 78}px) rotateY(${-sgn * c * 20}deg) scale(${1 - c * 0.07})`,
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

  // Bìa tự động sinh theo genre (src/lib/covers/*) thay cho gradient
  // phẳng cũ — books[].gradient (mock) không còn dùng để vẽ bìa, chỉ còn
  // dùng lại màu (from/to) cho dải phản chiếu bên dưới, để phản chiếu
  // khớp đúng màu bìa thật đang hiện ra (palette được chọn theo hash,
  // không phải luôn giống gradient mock gốc).
  const coverSpec = buildCoverSpec({
    id: books[index].title,
    title: books[index].title,
    author: books[index].author,
    genre: mockTagToGenre(books[index].tag),
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

export function BookCoverflow() {
  const n = books.length;
  const [active, setActive] = useState(3);
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
  const current = books[active];

  return (
    <section className="bg-gradient-to-b from-[#fafaf9] to-white px-11 pb-2.5">
      <nav className="-mx-11 mb-[26px] flex gap-[26px] overflow-x-auto bg-brand-ink px-11 py-3.5 text-[15px] font-medium [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavStripLinks />
      </nav>

      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">
            ĐỀ XUẤT CHO BẠN
          </div>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-ink">
            Tác phẩm nổi bật tuần này
          </h2>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => go(active - 1)}
            aria-label="Tác phẩm trước"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e7e5e4] bg-white text-[#57534e] transition-colors hover:border-brand-gold hover:text-brand-gold-dark"
          >
            <CaretLeftIcon size={18} />
          </button>
          <button
            onClick={() => go(active + 1)}
            aria-label="Tác phẩm tiếp theo"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e7e5e4] bg-white text-[#57534e] transition-colors hover:border-brand-gold hover:text-brand-gold-dark"
          >
            <CaretRightIcon size={18} />
          </button>
        </div>
      </div>

      <div
        ref={stageWrapRef}
        style={{ height: STAGE_HEIGHT * scale }}
        className="relative"
      >
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
          <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
            {books.map((book, i) => {
              const { wrapStyle, coverStyle, reflStyle } = buildSlide(i, active, n);
              return (
                <div key={book.title} style={wrapStyle} onClick={() => go(i)}>
                  <div style={coverStyle}>
                    <div className="absolute inset-0">
                      <BookCover
                        id={book.title}
                        title={book.title}
                        author={book.author}
                        genre={mockTagToGenre(book.tag)}
                      />
                    </div>
                    <div className="absolute top-3.5 left-3.5 rounded-full bg-black/[0.32] px-2.5 py-1 text-[10px] font-semibold tracking-[.6px] uppercase backdrop-blur-[2px]">
                      {book.tag}
                    </div>
                    <div className="relative text-[19px] leading-[1.25] font-bold tracking-[-.2px]">
                      {book.title}
                    </div>
                    <div className="relative mt-1 text-[13px] opacity-[0.82]">{book.author}</div>
                  </div>
                  <div style={reflStyle} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 pt-2">
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight text-ink">
            {current.title}
          </div>
          <div className="mt-1 text-sm text-[#78716c]">
            {current.author} · {current.tag}
          </div>
        </div>
        <div className="flex gap-3">
          <Link
            href="/read"
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
        <div className="mt-0.5 flex items-center gap-[7px]">
          {books.map((book, i) => (
            <button
              key={book.title}
              aria-label={`Chuyển đến ${book.title}`}
              onClick={() => go(i)}
              style={{
                width: i === active ? 22 : 7,
                height: 7,
                background: i === active ? "var(--color-brand-gold)" : "#d6d3d1",
              }}
              className="rounded-full transition-all duration-[350ms]"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
