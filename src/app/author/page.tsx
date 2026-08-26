import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * /author (không kèm bookId/chapterId) không còn tự render editor tĩnh —
 * chuyển hẳn thành redirector: vào đúng chương gần nhất của tác giả, hoặc
 * hiện màn trống mời tạo tác phẩm đầu tiên nếu chưa có sách nào.
 * layout.tsx (cha) đã redirect /dang-nhap nếu chưa đăng nhập, nên tới
 * đây chắc chắn đã có user — vẫn tự gọi lại auth.getUser() vì mỗi Server
 * Component tự fetch riêng, không tự nhận dữ liệu từ layout.
 */
export default async function AuthorIndexPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/dang-nhap");
  }

  const { data: book } = await supabase
    .from("books")
    .select("id")
    .eq("author_id", userData.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!book) {
    return (
      <div className="col-span-2 flex flex-col items-center justify-center gap-2 p-10 text-center">
        <div className="text-lg font-semibold text-brand-ink">Bạn chưa có tác phẩm nào</div>
        <div className="text-sm text-stone-alt">
          Bấm &quot;Tác phẩm mới&quot; ở thanh bên trái để bắt đầu viết.
        </div>
      </div>
    );
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id")
    .eq("book_id", book.id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!chapter) {
    // Trường hợp hiếm: sách tồn tại nhưng không còn chương nào (bị xoá
    // tay ngoài luồng tạo bình thường — luồng tạo luôn kèm "Chương 1").
    return (
      <div className="col-span-2 flex flex-col items-center justify-center gap-2 p-10 text-center">
        <div className="text-lg font-semibold text-brand-ink">Sách này chưa có chương nào</div>
        <div className="text-sm text-stone-alt">Tạo 1 tác phẩm mới ở thanh bên trái.</div>
      </div>
    );
  }

  redirect(`/author/${book.id}/${chapter.id}`);
}
