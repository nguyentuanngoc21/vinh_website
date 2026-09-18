import Link from "next/link";
import { BookCover } from "@/components/covers/book-cover";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

/**
 * "Gợi ý cho bạn" — cùng khung UI với new-works-grid.tsx (grid bìa +
 * tiêu đề + tác giả), khác nguồn dữ liệu (getRecommendedBooks() thay vì
 * sách mới nhất) và mỗi link có `?from=goi-y` — truyen/[slug]/page.tsx
 * đọc marker này để tính tiến trình nhiệm vụ reader_view_recommendations
 * (xem migrations/20260918_add_recommendations_and_content_tags.sql).
 * Không render gì nếu rỗng (chưa đăng nhập, hoặc recommend_books() không
 * có gì để gợi ý) — không bịa danh sách giả.
 */
export function RecommendedForYou({ books }: { books: HomepageBook[] }) {
  if (books.length === 0) return null;

  return (
    <section className="px-4 pb-2 pt-9 sm:px-8 lg:px-11">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">Gợi ý cho bạn</h2>
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {books.map((book) => (
          <Link
            key={book.id}
            href={`/truyen/${book.slug}?from=goi-y`}
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
              <div className="line-clamp-2 min-h-[2.5rem] text-[15px] font-semibold text-ink">{book.title}</div>
              <div className="mt-0.5 text-[13px] text-[#9a9a9a]">{book.authorNickname ?? "Ẩn danh"}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
