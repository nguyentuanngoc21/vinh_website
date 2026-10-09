import Link from "next/link";
import { BookCover } from "@/components/covers/book-cover";
import { ExclusiveBadge } from "@/components/story/exclusive-badge";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

export function NewWorksGrid({ books }: { books: HomepageBook[] }) {
  return (
    <section className="px-4 pb-2 pt-9 sm:px-8 lg:px-11">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">Truyện mới cập nhật</h2>
        {books.length > 0 && (
          <Link href="/truyen" className="cursor-pointer text-[13px] font-medium text-brand-gold-dark">
            Xem tất cả →
          </Link>
        )}
      </div>
      {books.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-alt bg-surface-soft-alt py-10 text-center">
          <div className="text-sm font-semibold text-ink">Chưa có truyện mới</div>
          <div className="text-[13px] text-mute">Truyện vừa đăng chương mới sẽ hiện ở đây.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/truyen/${book.id}`}
              className="cursor-pointer overflow-hidden rounded-xl no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,.12)]"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl">
                <BookCover
                  id={book.id}
                  title={book.title}
                  author={book.authorNickname}
                  genre={book.genre}
                  coverUrl={book.coverUrl}
                  ageRating={book.ageRating}
                  className="h-full w-full"
                />
                {book.isExclusive && <ExclusiveBadge variant="overlay" />}
              </div>
              <div className="px-1 py-3">
                <div className="line-clamp-2 min-h-[2.5rem] text-[15px] font-semibold text-ink">{book.title}</div>
                <div className="mt-0.5 text-[13px] text-mute">{book.authorNickname ?? "Ẩn danh"}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
