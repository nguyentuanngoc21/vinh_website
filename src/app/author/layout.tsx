import { Lora } from "next/font/google";
import { redirect } from "next/navigation";
import { WorksSidebar, type SidebarBook } from "@/components/author/works-sidebar";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, title, genre, published")
    .eq("author_id", userData.user.id)
    .order("created_at", { ascending: false });

  const bookIds = (bookRows ?? []).map((b) => b.id);

  // 2 query riêng (không embed chapters(...) qua books) — types.ts hiện
  // hand-written với Relationships: [] cho mọi bảng, embed select không
  // có chỗ dựa để type đúng; join lại bằng JS đơn giản và chắc chắn hơn.
  const { data: chapterRows } = bookIds.length
    ? await supabase
        .from("chapters")
        .select("id, book_id, order_index")
        .in("book_id", bookIds)
        .order("order_index", { ascending: false })
    : { data: [] as { id: string; book_id: string; order_index: number }[] };

  const books: SidebarBook[] = (bookRows ?? []).map((book) => {
    const chaptersForBook = (chapterRows ?? []).filter((c) => c.book_id === book.id);
    return {
      id: book.id,
      title: book.title,
      genre: book.genre,
      meta: `${chaptersForBook.length} chương · ${book.published ? "Đang ra" : "Bản nháp"}`,
      // chapterRows đã order_index desc — [0] là chương mới nhất.
      latestChapterId: chaptersForBook[0]?.id ?? null,
    };
  });

  return (
    <div
      className={`${lora.variable} grid flex-1 grid-cols-[264px_1fr] overflow-hidden bg-[#FBF8F1] text-brand-ink`}
    >
      <WorksSidebar books={books} />
      <div className="grid grid-cols-[1fr_320px] overflow-hidden">{children}</div>
    </div>
  );
}
