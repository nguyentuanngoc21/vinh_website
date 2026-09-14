import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BookCover } from "@/components/covers/book-cover";
import { createClient } from "@/lib/supabase/server";
import { getBooksByGenre } from "@/lib/search/get-books-by-genre";
import { BOOK_GENRES, GENRE_SLUGS, slugToGenre } from "@/lib/covers/genre-styles";

export const metadata: Metadata = { title: "Truyện chữ theo thể loại — Vịnh" };

/**
 * Danh sách truyện lọc theo thể loại — đích của mục "Thể loại" trong mega
 * menu "Truyện chữ" (xem src/components/nav-strip-links.tsx,
 * src/components/mega-menu.tsx). `?the-loai=` không có/không khớp thể loại
 * nào (link cũ, gõ tay sai, hoặc trước đây mọi mục đều trỏ về "/" — xem
 * git blame nav-strip-links.tsx) rơi về danh sách KHÔNG lọc (sách mới nhất)
 * thay vì trang trắng/404.
 */
export default async function TruyenPage({
  searchParams,
}: {
  searchParams: Promise<{ "the-loai"?: string }>;
}) {
  const { "the-loai": slug } = await searchParams;
  const genre = slug ? (slugToGenre(slug) ?? null) : null;

  const supabase = await createClient();
  const { books } = await getBooksByGenre(supabase, genre);

  return (
    <div className="flex-1 bg-[#f2f2f3]">
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main className="px-4 py-8 sm:px-8 lg:px-11">
          <h1 className="mb-1 text-2xl font-bold text-brand-ink">
            {genre ?? "Tất cả truyện chữ"}
          </h1>
          <p className="mb-6 text-sm text-stone-alt">
            {genre
              ? `Truyện thuộc thể loại "${genre}", sắp xếp theo lượt đọc.`
              : slug
                ? "Không tìm thấy thể loại này — đang hiển thị truyện mới nhất."
                : "Chọn 1 thể loại ở menu \"Truyện chữ\" phía trên để lọc, hoặc xem tất cả bên dưới."}
          </p>

          {/* Lối tắt sang thể loại khác ngay trên trang — không bắt người
              dùng quay lại mega menu để đổi lựa chọn. */}
          <div className="mb-7 flex flex-wrap gap-2">
            <Link
              href="/truyen"
              className={`rounded-full px-[16px] py-2 text-[13.5px] font-medium no-underline transition-colors ${
                !genre ? "bg-brand-ink text-white" : "bg-neutral-bg text-ink hover:text-brand-gold-dark"
              }`}
            >
              Tất cả
            </Link>
            {BOOK_GENRES.map((g) => (
              <Link
                key={g}
                href={`/truyen?the-loai=${GENRE_SLUGS[g]}`}
                className={`rounded-full px-[16px] py-2 text-[13.5px] font-medium no-underline transition-colors ${
                  g === genre ? "bg-brand-ink text-white" : "bg-neutral-bg text-ink hover:text-brand-gold-dark"
                }`}
              >
                {g}
              </Link>
            ))}
          </div>

          {books.length === 0 ? (
            <div className="py-14 text-center text-sm text-stone-alt">
              Chưa có truyện nào {genre ? `thuộc thể loại "${genre}"` : "được xuất bản"}.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
              {books.map((b) => (
                <Link
                  key={b.id}
                  href={`/truyen/${b.slug}`}
                  className="no-underline transition-transform duration-[250ms] hover:-translate-y-1"
                >
                  <div className="aspect-[2/3] overflow-hidden rounded-[10px] bg-neutral-bg">
                    <BookCover
                      id={b.id}
                      title={b.title}
                      author={b.authorNickname}
                      genre={b.genre}
                      coverUrl={b.coverUrl}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-brand-ink">
                    {b.title}
                  </div>
                  <div className="truncate text-xs text-stone-alt">{b.authorNickname ?? "—"}</div>
                </Link>
              ))}
            </div>
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
