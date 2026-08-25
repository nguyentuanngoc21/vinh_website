import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { slugifyTitle } from "@/lib/authoring/slugify";
import { BOOK_GENRES } from "@/lib/covers/genre-styles";
import type { BookGenre } from "@/lib/supabase/types";

function isBookGenre(value: unknown): value is BookGenre {
  return typeof value === "string" && (BOOK_GENRES as readonly string[]).includes(value);
}

const DEFAULT_TITLE = "Truyện mới";

/**
 * POST /api/authoring/books — luồng "Viết truyện"/"+ Tác phẩm mới"
 * (src/lib/authoring/use-create-work.ts, dùng chung bởi
 * src/components/auth-cluster.tsx và src/components/author/works-sidebar.tsx):
 * tạo sách mới + chương đầu tiên trong CÙNG 1 request, trả về cả 2 id để
 * client router.push thẳng vào /author/[bookId]/[chapterId] ngay — không
 * còn bước hỏi tên/thể loại nào trước đó (trước đây là 1 modal, bỏ hẳn vì
 * chỉ thêm 1 bước không cần thiết trước khi vào viết). Tên/thể loại đều
 * sửa được ngay trong publish-panel.tsx sau khi đã vào trang viết.
 *
 * Dùng createClient() (RLS thật qua auth.getUser()), KHÔNG service-role —
 * author_id luôn là uuid của chính người gọi, policy "authors manage
 * their own books" (docs/supabase/schema.sql) cho phép insert bình
 * thường, không cần bypass RLS.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  // title/genre đều optional — không còn UI nào hỏi trước lúc tạo.
  // slugifyTitle() luôn thêm hậu tố ngẫu nhiên nên nhiều sách cùng để mặc
  // định "Truyện mới" vẫn ra slug khác nhau, không đụng unique constraint.
  const title = (typeof body?.title === "string" ? body.title.trim() : "") || DEFAULT_TITLE;
  const genre = isBookGenre(body?.genre) ? body.genre : null;

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      author_id: userData.user.id,
      title,
      slug: slugifyTitle(title),
      genre,
    })
    .select("id")
    .single();

  if (bookError || !book) {
    console.error("[authoring] create book failed:", bookError);
    return NextResponse.json({ error: "Không tạo được truyện. Vui lòng thử lại." }, { status: 500 });
  }

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .insert({
      book_id: book.id,
      title: "Chương 1",
      content: "",
      order_index: 1,
    })
    .select("id")
    .single();

  if (chapterError || !chapter) {
    console.error("[authoring] create first chapter failed:", chapterError);
    // Sách đã tạo nhưng chương đầu lỗi — không rollback (chapters insert
    // riêng, không nằm trong 1 transaction). Trả lỗi rõ để tác giả biết
    // và có thể vào lại sách vừa tạo (đã có id) để thêm chương tay.
    return NextResponse.json(
      { error: "Đã tạo truyện nhưng không tạo được chương đầu. Vui lòng thử lại.", bookId: book.id },
      { status: 500 }
    );
  }

  return NextResponse.json({ bookId: book.id, chapterId: chapter.id });
}
