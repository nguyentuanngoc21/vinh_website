import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { slugifyTitle } from "@/lib/authoring/slugify";
import type { BookGenre } from "@/lib/supabase/types";

const VALID_GENRES: readonly BookGenre[] = [
  "Ngôn tình",
  "Trinh thám",
  "Tản văn",
  "Văn học",
  "Lịch sử",
  "Kỳ ảo",
  "Kinh dị",
  "Phiêu lưu",
];

function isBookGenre(value: unknown): value is BookGenre {
  return typeof value === "string" && (VALID_GENRES as readonly string[]).includes(value);
}

/**
 * POST /api/authoring/books — luồng "Viết truyện"/"+ Tác phẩm mới"
 * (src/components/auth-cluster.tsx, src/components/author/works-sidebar.tsx):
 * tạo sách mới + chương đầu tiên trong CÙNG 1 request, trả về cả 2 id để
 * client router.push thẳng vào /author/[bookId]/[chapterId] — không có
 * bước trung gian "sách rỗng chưa có chương nào".
 *
 * Dùng createClient() (RLS thật qua auth.getUser()), KHÔNG service-role —
 * author_id luôn là uuid của chính người gọi, policy "authors manage
 * their own books" (docs/supabase/schema.sql) cho phép insert bình
 * thường, không cần bypass RLS.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const genre = body?.genre;

  if (!title) {
    return NextResponse.json({ error: "Vui lòng nhập tên truyện." }, { status: 400 });
  }
  if (!isBookGenre(genre)) {
    return NextResponse.json({ error: "Vui lòng chọn thể loại." }, { status: 400 });
  }

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
