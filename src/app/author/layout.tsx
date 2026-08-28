import { Lora } from "next/font/google";
import { redirect } from "next/navigation";
import { WorksSidebar, type SidebarBook } from "@/components/author/works-sidebar";
import { createClient } from "@/lib/supabase/server";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

/**
 * Trước đây layout này chỉ render <WorksSidebar/> tĩnh (1 mảng hằng số,
 * không props). Giờ tự query danh sách tác phẩm THẬT của tác giả đang
 * đăng nhập, truyền xuống làm props — WorksSidebar giờ là Client
 * Component (cần usePathname() để biết sách nào đang mở), nên việc query
 * Supabase phải nằm ở đây (Server Component) rồi truyền xuống, không tự
 * query được trong WorksSidebar.
 *
 * Chưa đăng nhập → redirect thẳng, không cho vào khu vực tác giả nào cả
 * (trang mock cũ không có gác nào, đây là bổ sung hợp lý khi đã nối
 * Supabase thật).
 */
export default async function AuthorLayout({ children }: LayoutProps<"/author">) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/dang-nhap");
  }

  const { data: bookRows } = await supabase
    .from("books")
    .select("id, title, genre, slug, published, cover_design_item_id")
    .eq("author_id", userData.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const bookIds = (bookRows ?? []).map((b) => b.id);

  // 1 query/sách (không batch được — resolveBookCoverUrl tự query
  // public_design_items theo từng id) — chấp nhận được, số tác phẩm của
  // 1 tác giả trong sidebar này không lớn.
  const coverUrls = await Promise.all(
    (bookRows ?? []).map((book) => resolveBookCoverUrl(supabase, book))
  );

  // 2 query riêng (không embed chapters(...) qua books) — types.ts hiện
  // hand-written với Relationships: [] cho mọi bảng, embed select không
  // có chỗ dựa để type đúng; join lại bằng JS đơn giản và chắc chắn hơn.
  // Chỉ cần đếm số chương cho `meta` — link mỗi sách giờ trỏ vào
  // /author/[bookId] (trang tổng quan, tự query chương của nó), không còn
  // cần order_index/chương mới nhất ở đây.
  const { data: chapterRows } = bookIds.length
    ? await supabase.from("chapters").select("id, book_id").in("book_id", bookIds)
    : { data: [] as { id: string; book_id: string }[] };

  const books: SidebarBook[] = (bookRows ?? []).map((book, i) => {
    const chapterCount = (chapterRows ?? []).filter((c) => c.book_id === book.id).length;
    return {
      id: book.id,
      title: book.title,
      genre: book.genre,
      slug: book.slug,
      published: book.published,
      coverUrl: coverUrls[i] ?? null,
      meta: `${chapterCount} chương · ${book.published ? "Đang ra" : "Bản nháp"}`,
    };
  });

  return (
    <div
      className={`${lora.variable} flex flex-1 flex-col bg-[#FBF8F1] text-brand-ink lg:grid lg:grid-cols-[264px_1fr] lg:overflow-hidden`}
    >
      <WorksSidebar books={books} />
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[1fr_320px] lg:overflow-hidden">{children}</div>
    </div>
  );
}
