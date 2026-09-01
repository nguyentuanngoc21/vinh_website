import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { slugifyTitle } from "@/lib/authoring/slugify";
import { BOOK_GENRES } from "@/lib/covers/genre-styles";
import {
  hasAcceptedExclusivityPolicy,
  EXCLUSIVITY_AGREEMENT_ERROR,
  EXCLUSIVITY_AGREEMENT_ID,
} from "@/lib/authoring/exclusivity-agreement";
import type { BookGenre } from "@/lib/supabase/types";

function isBookGenre(value: unknown): value is BookGenre {
  return typeof value === "string" && (BOOK_GENRES as readonly string[]).includes(value);
}

const DEFAULT_TITLE = "Truyện mới";
const MAX_TAGS = 20; // khớp CHECK books_tags_length_check

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((t) => typeof t === "string")) return [];
  return Array.from(new Set(value.map((t) => t.trim()).filter(Boolean))).slice(0, MAX_TAGS);
}

/**
 * POST /api/authoring/books — tạo sách mới + chương đầu tiên trong CÙNG
 * 1 request. Trước đây gọi ngay lúc bấm "+ Tác phẩm mới"/"Viết truyện"
 * (chưa viết gì cũng ghi Supabase) — giờ CHỈ được gọi từ
 * src/components/author/new-work-workspace.tsx (route /author/new), lúc
 * tác giả bấm "Lưu nháp"/"Xuất bản" LẦN ĐẦU với nội dung thật đã gõ. "+
 * Tác phẩm mới"/"Viết truyện" giờ chỉ router.push("/author/new") (xem
 * works-sidebar.tsx, auth-cluster.tsx) — không gọi route này nữa cho tới
 * lúc có gì để lưu thật.
 *
 * Mọi field đều optional (giữ tương thích nếu có nơi gọi rỗng `{}` như
 * trước) — thiếu chapterTitle/chapterContent thì tạo "Chương 1" rỗng như
 * hành vi cũ.
 *
 * Dùng createClient() (RLS thật qua auth.getUser()), KHÔNG service-role —
 * author_id luôn là uuid của chính người gọi, policy "authors manage
 * their own books" (docs/supabase/schema.sql) cho phép insert bình
 * thường, không cần bypass RLS.
 */
/** GET /api/authoring/books — danh sách truyện CỦA CHÍNH MÌNH (id/title
 * tối giản) — dùng bởi book-picker khi seller gắn 1 truyện vào đơn
 * ghostwriting (src/components/profile/order-card.tsx). RLS-scoped, dựa
 * hẳn vào policy "authors manage their own books" (chỉ chủ sách select
 * được sách CHƯA published qua nhánh auth.uid()=author_id của policy đó;
 * sách published thì ai cũng select được nhưng ở đây không lọc theo
 * published nên vẫn đúng — chỉ cần đủ 2 field, không rò rỉ gì thêm).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("books")
    .select("id, title")
    .eq("author_id", userData.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[authoring] list books failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách truyện." }, { status: 500 });
  }

  return NextResponse.json({ books: data ?? [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = (typeof body?.title === "string" ? body.title.trim() : "") || DEFAULT_TITLE;
  const genre = isBookGenre(body?.genre) ? body.genre : null;
  const tags = parseTags(body?.tags);
  const isExclusive = typeof body?.isExclusive === "boolean" ? body.isExclusive : true;

  const chapterTitle = (typeof body?.chapterTitle === "string" ? body.chapterTitle.trim() : "") || "Chương 1";
  const chapterContent = typeof body?.chapterContent === "string" ? body.chapterContent : "";
  const chapterPublished = body?.published === true;
  let chapterPrice = 0;
  if (typeof body?.price === "number" && Number.isFinite(body.price) && body.price >= 0) {
    chapterPrice = Math.round(body.price);
  }
  const isLastChapter = body?.isLastChapter === true;

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  if (isExclusive && !(await hasAcceptedExclusivityPolicy(supabase, userData.user.id))) {
    return NextResponse.json(
      { error: EXCLUSIVITY_AGREEMENT_ERROR, missingAgreementIds: [EXCLUSIVITY_AGREEMENT_ID] },
      { status: 403 }
    );
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      author_id: userData.user.id,
      title,
      slug: slugifyTitle(title),
      genre,
      tags,
      is_exclusive: isExclusive,
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
      title: chapterTitle,
      content: chapterContent,
      order_index: 1,
      published: chapterPublished,
      price: chapterPrice,
      is_last_chapter: isLastChapter,
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

  // Cùng side-effect với PATCH /api/authoring/chapters/:id: xuất bản
  // chương đầu tiên (ngay lúc tạo, nếu tác giả bấm "Xuất bản" làm hành
  // động lưu đầu tiên) khiến sách đó công khai — books.published mặc
  // định false lúc insert ở trên.
  if (chapterPublished) {
    const { error: publishError } = await supabase.from("books").update({ published: true }).eq("id", book.id);
    if (publishError) console.error("[authoring] publish book at creation failed:", publishError);
  }

  return NextResponse.json({ bookId: book.id, chapterId: chapter.id });
}
