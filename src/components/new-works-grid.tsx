import Link from "next/link";
import { BookCover } from "@/components/covers/book-cover";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

export function NewWorksGrid({ books }: { books: HomepageBook[] }) {
  return (
    <section className="px-11 pb-2 pt-9">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">Truyện mới cập nhật</h2>
        {books.length > 0 && (
          <Link href="/rankings" className="cursor-pointer text-[13px] font-medium text-brand-gold-dark">
            Xem tất cả →
          </Link>
        )}
      </div>
      {books.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#e7e5e4] bg-[#fafaf9] py-10 text-center">
          <div className="text-sm font-semibold text-ink">Chưa có truyện mới</div>
          <div className="text-[13px] text-[#9a9a9a]">Truyện vừa xuất bản sẽ hiện ở đây.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/truyen/${book.slug}`}
              className="cursor-pointer overflow-hidden rounded-xl no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,.12)]"
            >
              <div className="aspect-[2/3] overflow-hidden rounded-xl">
                <BookCover
                  id={book.id}
                  title={book.title}
                  author={book.authorNickname}
                  genre={book.genre}
                  coverUrl={book.coverUrl}
                  className="h-full w-full"
                />
              </div>
              <div className="px-1 py-3">
                <div className="text-[15px] font-semibold text-ink">{book.title}</div>
                <div className="mt-0.5 text-[13px] text-[#9a9a9a]">{book.authorNickname ?? "Ẩn danh"}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
