"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircleIcon,
  CaretRightIcon,
  ArrowUpRightIcon,
  HeadphonesIcon,
  ArticleIcon,
  TrendUpIcon,
  ArrowDownIcon,
} from "@phosphor-icons/react/dist/ssr";
import { genres as REAL_GENRES } from "@/lib/books";
import { BookCover } from "@/components/covers/book-cover";
import { REAL_PERIODS, type BookRankingsData, type RealPeriodId } from "@/lib/rankings/get-book-rankings";
import {
  KINDS,
  PERIODS,
  BLOG,
  NOVEL,
  LEADERS,
  buildScored,
  formatReads,
  formatDelta,
  type Kind,
  type PeriodId,
} from "@/lib/rankings-data";

const MEDAL_BG = ["var(--color-brand-gold)", "var(--color-sidebar-text-dim-2)", "#C08552"];

// Rows thật (tuần/tháng/quý/toàn thời gian) không có số biến động bịa —
// ▲/▼ là rank change có thật giữa kỳ này và kỳ liền trước (null cho "Toàn
// thời gian", không có kỳ liền trước để so). Xem get-book-rankings.ts.
function formatRealDelta(delta: number | null, isNew: boolean) {
  if (isNew) return { txt: "MỚI", color: "var(--color-chart-green)", weight: 700 };
  if (delta === null || delta === 0) return { txt: "—", color: "#c9c1b6", weight: 600 };
  return {
    txt: delta > 0 ? "▲ " + delta : "▼ " + Math.abs(delta),
    color: delta > 0 ? "var(--color-chart-green)" : "#c0392b",
    weight: 600,
  };
}

export function RankingsBoard({ bookRankings }: { bookRankings: BookRankingsData }) {
  const [kind, setKind] = useState<Kind>("Truyện chữ");
  const [periodId, setPeriodId] = useState<RealPeriodId>("tuan");
  const [genre, setGenre] = useState("Tất cả");
  const [limit, setLimit] = useState(7);

  const isReal = kind === "Truyện chữ";
  const mockPeriodId: PeriodId = periodId === "toanthoigian" ? "tuan" : periodId;
  const period = PERIODS.find((p) => p.id === mockPeriodId) ?? PERIODS[0];
  const realPeriod = bookRankings[periodId];
  const isAllTime = periodId === "toanthoigian";

  const cats = isReal
    ? ["Tất cả", ...REAL_GENRES.map((g) => g.label)]
    : ["Tất cả", ...Object.keys(kind === "Blog" ? BLOG : NOVEL)];

  const realRows = realPeriod.list
    .filter((b) => genre === "Tất cả" || b.genre === genre)
    .map((b, i) => ({ ...b, rank: i + 1 }));
  const mockRows = buildScored(kind, mockPeriodId)
    .filter((b) => genre === "Tất cả" || b.genre === genre)
    .map((b, i) => ({ ...b, rank: i + 1 }));
  const listLength = isReal ? realRows.length : mockRows.length;

  const rowCount = Math.max(0, Math.min(limit, listLength - 3));
  const hasRows = rowCount > 0;
  const exhausted = rowCount + 3 >= listLength;

  const heading =
    kind === "Truyện chữ"
      ? "Tác phẩm được đọc nhiều nhất"
      : kind === "Audio"
        ? "Truyện audio được nghe nhiều nhất"
        : "Bài blog được đọc nhiều nhất";
  const periodRange = isReal ? realPeriod.range : period.range;
  const periodLabel = isReal
    ? (REAL_PERIODS.find((p) => p.id === periodId)?.label ?? "").toLowerCase()
    : period.label.toLowerCase();
  const subheading =
    (genre === "Tất cả" ? "Tất cả " + (kind === "Blog" ? "chủ đề" : "thể loại") : genre) +
    " · " +
    periodLabel +
    " · " +
    periodRange +
    " · " +
    listLength +
    " mục";
  const colItem = kind === "Blog" ? "BÀI VIẾT" : "TÁC PHẨM";
  const colGenre = kind === "Blog" ? "CHỦ ĐỀ" : "THỂ LOẠI";
  const colReads = kind === "Audio" ? "GIỜ NGHE" : "LƯỢT ĐỌC";
  const formula1 = !isReal
    ? kind === "Audio"
      ? "50% giờ nghe mới trong kỳ"
      : "50% lượt đọc mới trong kỳ"
    : isAllTime
      ? "Xếp theo tổng lượt đọc từ trước đến nay"
      : "Xếp theo lượt đọc trong " + periodLabel;
  const formula2 = !isReal
    ? kind === "Audio"
      ? "30% tỉ lệ nghe hết chương"
      : "30% thời gian đọc thực tế"
    : isAllTime
      ? "Đánh dấu MỚI cho truyện xuất bản trong 7 ngày gần nhất"
      : "▲/▼ so với " + periodLabel + " liền trước, MỚI = xuất bản trong kỳ này";
  const formula3 = isReal ? "Lọc theo thể loại để xem riêng từng mảng" : "20% lưu, bình luận, đánh giá";
  const leaderTitle = isReal
    ? "Tác giả dẫn đầu " + (isAllTime ? "mọi thời điểm" : periodLabel.replace("top ", ""))
    : (kind === "Audio" ? "Giọng đọc" : "Tác giả") + " dẫn đầu " + periodLabel.replace("top ", "");
  const leaders = isReal ? realPeriod.leaders : kind === "Audio" ? LEADERS.audio : LEADERS.default;
  const updateNote = isAllTime
    ? "Cập nhật theo thời gian thực · theo tổng lượt đọc"
    : "Cập nhật theo thời gian thực · theo lượt đọc trong kỳ đang chọn";

  return (
    <>
      <div className="px-11 pt-[34px]">
        <div className="flex flex-wrap items-end justify-between gap-[18px]">
          <div>
            <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">
              BẢNG XẾP HẠNG VỊNH
            </div>
            <div className="mt-2 font-[family-name:var(--font-lora)] text-[34px] font-bold leading-[1.2] text-brand-ink">
              {heading}
            </div>
            <div className="mt-2 text-sm text-stone">{subheading}</div>
          </div>
          <div className="flex gap-2 rounded-full bg-neutral-bg p-[5px]">
            {KINDS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setKind(label);
                  setGenre("Tất cả");
                  setPeriodId("tuan");
                  setLimit(7);
                }}
                style={{
                  background: label === kind ? "#fff" : "transparent",
                  color: label === kind ? "var(--color-brand-ink)" : "#7c7269",
                  boxShadow: label === kind ? "0 2px 8px rgba(0,0,0,.1)" : "none",
                }}
                className="cursor-pointer rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition-all"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-[26px] flex flex-wrap items-center justify-between gap-4 border-b border-[#f1efec] px-11">
        <div className="flex gap-[30px]">
          {(isReal ? REAL_PERIODS : PERIODS).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPeriodId(p.id as RealPeriodId);
                setLimit(7);
              }}
              style={{
                color: p.id === periodId ? "var(--color-brand-ink)" : "var(--color-stone-light)",
                borderBottom: p.id === periodId ? "3px solid #D9A441" : "3px solid transparent",
              }}
              className="cursor-pointer pb-3 text-[17px] font-bold transition-colors"
            >
              {p.label}
              <div
                style={{ color: p.id === periodId ? "var(--color-stone)" : "#c1b9ae" }}
                className="mt-1 text-xs font-normal"
              >
                {isReal ? bookRankings[p.id as RealPeriodId].range : (p as { range: string }).range}
              </div>
            </button>
          ))}
        </div>
        <div className="pb-3 text-[13px] font-medium text-stone-light">
          {isReal ? updateNote : "Cập nhật 06:00 hôm nay · theo lượt đọc & thời gian đọc thực"}
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5 px-11 pb-1.5 pt-[22px]">
        {cats.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setGenre(label);
              setLimit(7);
            }}
            className={`cursor-pointer rounded-full px-[18px] py-2.5 text-sm font-medium transition-colors ${
              label === genre ? "bg-brand-ink text-white" : "bg-neutral-bg text-[#3a3a3a]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isReal && listLength === 0 ? (
        <div className="mx-11 mt-[22px] flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#e7e5e4] bg-[#fafaf9] py-14 text-center">
          <div className="text-sm font-semibold text-ink">Chưa có dữ liệu xếp hạng</div>
          <div className="text-[13px] text-[#9a9a9a]">
            Cần ít nhất 1 truyện được xuất bản để tính bảng xếp hạng.
          </div>
        </div>
      ) : (
        <>
          <div
            style={{ gridTemplateColumns: `repeat(${Math.max(Math.min(listLength, 3), 1)}, 1fr)` }}
            className="grid items-end gap-[22px] px-11 pt-[22px]"
          >
            {isReal
              ? realRows.slice(0, 3).map((b, i) => {
                  const dl = formatRealDelta(b.delta, b.isNew);
                  return (
                    <Link
                      key={b.id}
                      href={`/truyen/${b.slug}`}
                      style={{
                        background: i === 0 ? "var(--color-brand-ink-dark)" : "var(--color-brand-ink)",
                        minHeight: i === 0 ? "360px" : "330px",
                        border: i === 0 ? "1px solid rgba(217,164,65,.5)" : "1px solid transparent",
                      }}
                      className="relative block rounded-[20px] p-[26px] text-white no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.16)]"
                    >
                      <div
                        style={{ background: MEDAL_BG[i] }}
                        className="absolute right-[18px] top-[18px] flex h-[34px] w-[34px] items-center justify-center rounded-full text-base font-extrabold text-brand-ink"
                      >
                        {b.rank}
                      </div>
                      <div
                        style={{ height: i === 0 ? "190px" : "162px" }}
                        className="overflow-hidden rounded-xl shadow-[0_16px_34px_rgba(0,0,0,.4)]"
                      >
                        <BookCover
                          id={b.id}
                          title={b.title}
                          author={b.authorNickname}
                          genre={b.genre}
                          coverUrl={b.coverUrl}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="mt-4 text-[19px] font-bold leading-[1.3]">{b.title}</div>
                      <div className="mt-[5px] text-[13.5px] text-sidebar-text-dim-2">
                        {(b.authorNickname ?? "Ẩn danh") + " · " + b.chapterCount + " chương"}
                      </div>
                      <div className="mt-3.5 flex items-center gap-3.5 text-[13px] font-semibold text-brand-gold-light">
                        <span>{b.reads.toLocaleString("vi-VN") + " đọc"}</span>
                        <span style={{ color: dl.color === "#c9c1b6" ? "#7d94a0" : dl.color }}>
                          {dl.txt}
                        </span>
                      </div>
                    </Link>
                  );
                })
              : mockRows.slice(0, 3).map((b, i) => {
                  const f = formatReads(kind, b, b.rank);
                  const dl = formatDelta(b.d, b.isNew);
                  return (
                    <Link
                      key={b.title}
                      href="/read"
                      style={{
                        background: i === 0 ? "var(--color-brand-ink-dark)" : "var(--color-brand-ink)",
                        minHeight: i === 0 ? "360px" : "330px",
                        border: i === 0 ? "1px solid rgba(217,164,65,.5)" : "1px solid transparent",
                      }}
                      className="relative block rounded-[20px] p-[26px] text-white no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.16)]"
                    >
                      <div
                        style={{ background: MEDAL_BG[i] }}
                        className="absolute right-[18px] top-[18px] flex h-[34px] w-[34px] items-center justify-center rounded-full text-base font-extrabold text-brand-ink"
                      >
                        {b.rank}
                      </div>
                      <div
                        style={{ background: b.gradient, height: i === 0 ? "190px" : "162px" }}
                        className="rounded-xl shadow-[0_16px_34px_rgba(0,0,0,.4)]"
                      />
                      <div className="mt-4 text-[19px] font-bold leading-[1.3]">{b.title}</div>
                      <div className="mt-[5px] text-[13.5px] text-sidebar-text-dim-2">{f.byline}</div>
                      <div className="mt-3.5 flex items-center gap-3.5 text-[13px] font-semibold text-brand-gold-light">
                        <span>{f.reads}</span>
                        <span style={{ color: dl.color === "#c9c1b6" ? "#7d94a0" : dl.color }}>
                          {dl.txt}
                        </span>
                      </div>
                    </Link>
                  );
                })}
          </div>

          <div className="grid grid-cols-1 gap-11 px-11 pb-2.5 pt-[30px] lg:grid-cols-[1fr_320px]">
            <div>
              {hasRows && (
                <div className="grid grid-cols-[56px_1fr_130px_110px_90px] gap-3.5 border-b border-[#f1efec] px-4 pb-2.5 text-[11.5px] font-semibold tracking-[.7px] text-stone-light">
                  <div>HẠNG</div>
                  <div>{colItem}</div>
                  <div>{colGenre}</div>
                  <div className="text-right">{colReads}</div>
                  <div className="text-right">BIẾN ĐỘNG</div>
                </div>
              )}
              {isReal
                ? realRows.slice(3, rowCount + 3).map((b) => {
                    const dl = formatRealDelta(b.delta, b.isNew);
                    return (
                      <Link
                        key={b.id}
                        href={`/truyen/${b.slug}`}
                        className="grid grid-cols-[56px_1fr_130px_110px_90px] items-center gap-3.5 rounded-[10px] border-b border-[#f6f4f1] px-4 py-3.5 no-underline transition-colors hover:bg-cream-card"
                      >
                        <div className="text-xl font-extrabold text-[#c1b9ae]">{b.rank}</div>
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md">
                            <BookCover
                              id={b.id}
                              title={b.title}
                              author={b.authorNickname}
                              genre={b.genre}
                              coverUrl={b.coverUrl}
                              className="h-full w-full"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[15.5px] font-semibold text-ink">
                              {b.title}
                            </div>
                            <div className="mt-[3px] text-[13px] text-stone">
                              {(b.authorNickname ?? "Ẩn danh") + " · " + b.chapterCount + " chương"}
                            </div>
                          </div>
                        </div>
                        <div className="text-[13px] font-medium text-stone-dark">{b.genre ?? "—"}</div>
                        <div className="text-right text-sm font-semibold text-brand-ink">
                          {b.reads.toLocaleString("vi-VN") + " đọc"}
                        </div>
                        <div
                          style={{ color: dl.color, fontWeight: dl.weight }}
                          className="text-right text-[13px]"
                        >
                          {dl.txt}
                        </div>
                      </Link>
                    );
                  })
                : mockRows.slice(3, rowCount + 3).map((b) => {
                    const f = formatReads(kind, b, b.rank);
                    const dl = formatDelta(b.d, b.isNew);
                    return (
                      <Link
                        key={b.title}
                        href="/read"
                        className="grid grid-cols-[56px_1fr_130px_110px_90px] items-center gap-3.5 rounded-[10px] border-b border-[#f6f4f1] px-4 py-3.5 no-underline transition-colors hover:bg-cream-card"
                      >
                        <div className="text-xl font-extrabold text-[#c1b9ae]">{b.rank}</div>
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div
                            style={{ background: b.gradient }}
                            className="h-14 w-10 shrink-0 rounded-md"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-[15.5px] font-semibold text-ink">
                              {b.title}
                            </div>
                            <div className="mt-[3px] text-[13px] text-stone">{f.byline}</div>
                          </div>
                        </div>
                        <div className="text-[13px] font-medium text-stone-dark">{b.genre}</div>
                        <div className="text-right text-sm font-semibold text-brand-ink">
                          {f.reads}
                        </div>
                        <div
                          style={{ color: dl.color, fontWeight: dl.weight }}
                          className="text-right text-[13px]"
                        >
                          {dl.txt}
                        </div>
                      </Link>
                    );
                  })}

              <div className="flex justify-center pb-1.5 pt-[26px]">
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + 5)}
                  style={{ color: exhausted ? "#b3aaa0" : "var(--color-brand-ink)" }}
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-[#e2ded7] px-7 py-3 text-sm font-semibold"
                >
                  {exhausted
                    ? "Đã hiển thị hết bảng này"
                    : `Xem tiếp hạng ${rowCount + 4}–${Math.min(rowCount + 8, listLength)}`}
                  <ArrowDownIcon />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-[18px] bg-[#F7EFD8] p-[22px]">
                <div className="text-[17px] font-bold text-brand-ink">Cách tính hạng</div>
                <div className="mt-3.5 flex flex-col gap-2.5 text-[13.5px] leading-[1.5] text-[#6b5f3a]">
                  <div className="flex gap-2.5">
                    <CheckCircleIcon weight="fill" size={16} color="var(--color-brand-gold-dark)" className="mt-0.5 shrink-0" />
                    {formula1}
                  </div>
                  <div className="flex gap-2.5">
                    <CheckCircleIcon weight="fill" size={16} color="var(--color-brand-gold-dark)" className="mt-0.5 shrink-0" />
                    {formula2}
                  </div>
                  <div className="flex gap-2.5">
                    <CheckCircleIcon weight="fill" size={16} color="var(--color-brand-gold-dark)" className="mt-0.5 shrink-0" />
                    {formula3}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3.5 text-[17px] font-bold text-brand-ink">{leaderTitle}</div>
                <div className="flex flex-col gap-3">
                  {leaders.length === 0 ? (
                    <div className="text-[13px] text-stone-light">Chưa có dữ liệu.</div>
                  ) : (
                    leaders.map((a) => (
                      <Link key={a.name} href="/author" className="flex items-center gap-3 no-underline">
                        <div
                          style={{ background: a.color }}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                        >
                          {a.name[0]}
                        </div>
                        <div className="flex-1">
                          <div className="text-[14.5px] font-semibold text-ink">{a.name}</div>
                          <div className="text-[12.5px] text-stone">{a.meta}</div>
                        </div>
                        <CaretRightIcon color="#c9c1b6" />
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[18px] border border-cream p-[22px]">
                <div className="text-[17px] font-bold text-brand-ink">Bảng khác</div>
                <div className="mt-3.5 flex flex-col gap-2.5 text-sm font-medium">
                  <Link href="/audio" className="flex items-center justify-between text-brand-ink no-underline">
                    <span className="flex items-center gap-2">
                      <HeadphonesIcon /> Kho truyện audio
                    </span>
                    <ArrowUpRightIcon size={13} />
                  </Link>
                  <Link href="/blog" className="flex items-center justify-between text-brand-ink no-underline">
                    <span className="flex items-center gap-2">
                      <ArticleIcon /> Blog Vịnh
                    </span>
                    <ArrowUpRightIcon size={13} />
                  </Link>
                  <Link href="/" className="flex items-center justify-between text-brand-ink no-underline">
                    <span className="flex items-center gap-2">
                      <TrendUpIcon weight="fill" /> Truyện mới nổi
                    </span>
                    <ArrowUpRightIcon size={13} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
