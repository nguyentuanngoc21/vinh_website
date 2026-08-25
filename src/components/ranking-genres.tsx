import Link from "next/link";
import { BookmarkSimpleIcon, FingerprintIcon } from "@phosphor-icons/react/dist/ssr";
import { genres } from "@/lib/books";
import { AdminModerationCallout } from "@/components/home/admin-moderation-callout";
import { BookCover } from "@/components/covers/book-cover";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

const RANK_COLORS = ["var(--color-brand-gold)", "#C9A86A", "#f0b429", "#9a9a9a"];

export function RankingGenres({ weeklyRanking }: { weeklyRanking: HomepageBook[] }) {
  return (
    <section className="grid grid-cols-1 gap-12 px-11 pb-2 pt-6 md:grid-cols-2">
      <div>
        <div className="mb-[18px] flex items-center justify-between">
          <h3 className="text-xl font-bold">Bảng xếp hạng tuần</h3>
          <Link href="/rankings" className="text-[13px] font-medium text-brand-gold-dark">
            Xem tất cả →
          </Link>
        </div>

        <AdminModerationCallout />

        {weeklyRanking.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#e7e5e4] bg-[#fafaf9] py-10 text-center">
            <div className="text-sm font-semibold text-ink">Chưa có dữ liệu xếp hạng</div>
            <div className="text-[13px] text-[#9a9a9a]">Cần ít nhất 1 truyện được xuất bản để tính bảng xếp hạng.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {weeklyRanking.map((book, i) => (
              <Link
                key={book.id}
                href={`/truyen/${book.slug}`}
                className="flex items-center gap-4 no-underline"
              >
                <div className="w-[26px] text-2xl font-extrabold" style={{ color: RANK_COLORS[i] ?? "#9a9a9a" }}>
                  {i + 1}
                </div>
                <div className="h-[60px] w-11 shrink-0 overflow-hidden rounded-md">
                  <BookCover
                    id={book.id}
                    title={book.title}
                    author={book.authorNickname}
                    genre={book.genre}
                    coverUrl={book.coverUrl}
                    className="h-full w-full"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-base font-semibold text-ink">{book.title}</div>
                  <div className="text-[13px] text-[#9a9a9a]">
                    {book.authorNickname ?? "Ẩn danh"} · {book.viewCount.toLocaleString("vi-VN")} đọc
                    {book.genre ? ` · ${book.genre}` : ""}
                  </div>
                </div>
                <BookmarkSimpleIcon
                  size={20}
                  className="cursor-default text-[#cfcfcf] transition-colors hover:text-brand-gold-dark"
                />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-[18px] text-xl font-bold">Khám phá thể loại</h3>
        <div className="flex flex-wrap gap-2.5">
          {genres.map((genre) => (
            <span
              key={genre.label}
              className={
                "cursor-default rounded-full px-[18px] py-2.5 text-sm font-medium transition-colors hover:text-brand-gold-dark " +
                (genre.active
                  ? "bg-[#F7EFD8] font-semibold text-brand-gold-dark"
                  : "bg-neutral-bg text-ink")
              }
            >
              {genre.label}
            </span>
          ))}
        </div>
        <div className="mt-[26px] flex items-center gap-4 rounded-2xl border border-[#EBDCB4] bg-[#F7EFD8] p-[22px]">
          <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-xl bg-brand-ink text-brand-gold-light">
            <FingerprintIcon weight="fill" size={24} />
          </div>
          <div>
            <div className="text-base font-semibold text-brand-ink">
              Watermark động theo phiên đọc
            </div>
            <div className="text-[13px] leading-[1.5] text-[#6b5f3a]">
              Mỗi trang đọc mang dấu chìm riêng gắn với tài khoản, truy được
              nguồn khi nội dung bị rò rỉ.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
