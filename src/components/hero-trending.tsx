import Link from "next/link";
import { FireIcon, HeadphonesIcon, FingerprintIcon } from "@phosphor-icons/react/dist/ssr";
import { BookCover } from "@/components/covers/book-cover";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

/** Hash tên tác giả để chọn màu từ palette có sẵn — mỗi tên ra một màu
 * riêng, không phải ai cũng cùng màu nư hộp cũ (#c8a86a hardcode). */
const AVATAR_COLORS = [
  "#4338ca", // chart-indigo
  "#0e7490", // chart-teal
  "#9d174d", // chart-pink
  "#0891b2", // chart-cyan
  "#b45309", // chart-amber
  "#7c3aed", // chart-purple
  "#db2777", // chart-rose
  "#16a34a", // chart-green
];

function hashAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function HeroTrending({ book }: { book: HomepageBook | null }) {
  if (!book) {
    return (
      <section className="px-4 pb-7 pt-10 sm:px-8 lg:px-11">
        <div className="grid grid-cols-1 items-center gap-12 rounded-[22px] bg-ink p-8 text-white sm:p-12 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-gold/18 px-3.5 py-1.5 text-xs font-semibold text-brand-gold-light">
              <FireIcon weight="fill" /> CHƯA CÓ TÁC PHẨM NỔI BẬT
            </div>
            <h1 className="mt-5 mb-3.5 text-4xl font-bold leading-[1.08] tracking-[-1.2px] sm:text-[52px]">
              Hãy là người đầu tiên
            </h1>
            <p className="max-w-[540px] text-[17px] leading-[1.65] text-[#c9c3bd]">
              Khi truyện đầu tiên được xuất bản trên Vịnh, đây sẽ là nơi giới
              thiệu tác phẩm đang được đọc nhiều nhất trong tuần.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/author"
                className="rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
              >
                Viết truyện
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pb-7 pt-10 sm:px-8 lg:px-11">
      <div className="grid grid-cols-1 items-center gap-8 rounded-[22px] bg-ink p-5 text-white sm:gap-12 sm:p-8 lg:grid-cols-[1fr_280px] lg:p-12">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-gold/18 px-3.5 py-1.5 text-xs font-semibold text-brand-gold-light">
            <FireIcon weight="fill" /> THỊNH HÀNH #1 TUẦN NÀY
          </div>
          <h1 className="mt-5 mb-3.5 text-2xl font-bold leading-[1.08] tracking-[-1.2px] sm:text-4xl lg:text-[52px]">
            {book.title}
          </h1>
          <div className="mt-[22px] flex flex-wrap items-center gap-3.5 text-sm font-medium text-[#c9c3bd]">
            <div
              style={{ background: hashAvatarColor(book.authorNickname ?? "?") }}
              className="flex h-8 w-8 items-center justify-center rounded-full font-bold text-white"
            >
              {(book.authorNickname ?? "?").charAt(0).toUpperCase()}
            </div>
            {book.authorNickname ?? "Ẩn danh"} · {book.viewCount.toLocaleString("vi-VN")} đọc · {book.chapterCount} chương
          </div>
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Link
              href={`/truyen/${book.slug}`}
              className="w-full sm:w-auto text-center rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
            >
              Đọc ngay
            </Link>
            <Link
              href="/audio/now-playing"
              className="w-full sm:w-auto justify-center flex items-center gap-2 rounded-full border border-white/30 px-[26px] py-3.5 text-[15px] font-semibold text-white no-underline"
            >
              <HeadphonesIcon /> Nghe audio
            </Link>
          </div>
        </div>
        <div className="relative mx-auto w-[180px] sm:w-auto">
          <div className="h-[260px] sm:h-[340px] overflow-hidden rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,.45)]">
            <BookCover
              id={book.id}
              title={book.title}
              author={book.authorNickname}
              genre={book.genre}
              coverUrl={book.coverUrl}
              className="h-full w-full"
            />
          </div>
          <div className="absolute -right-2.5 -top-2.5 flex h-14 w-14 sm:h-16 sm:w-16 flex-col items-center justify-center rounded-full bg-brand-ink text-center text-[10px] sm:text-[11px] font-bold leading-tight text-brand-gold-light shadow-[0_6px_16px_rgba(0,0,0,.3)]">
            <FingerprintIcon weight="fill" size={20} className="sm:hidden" />
            <FingerprintIcon weight="fill" size={22} className="hidden sm:block" />
            ĐÃ BẢO HỘ
          </div>
        </div>
      </div>
    </section>
  );
}
