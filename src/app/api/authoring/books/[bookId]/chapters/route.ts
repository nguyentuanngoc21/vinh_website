import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_DETECTED_CHAPTERS } from "@/lib/authoring/split-chapters";

// ~4.5MB là giới hạn body thật của Vercel Route Handler (không cấu hình
// được lớn hơn) — chặn sớm ở đây bằng content-length để trả lỗi tiếng Việt
// gọn, thay vì để lộ lỗi 413 thô của platform.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_CONTENT_LENGTH = 200_000; // ~ đủ cho 1 chương rất dài, chặn lạm dụng

type ChapterInput = { title: string; content: string };

function isChapterInput(value: unknown): value is ChapterInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title !== "undefined" &&
    typeof (value as { content?: unknown }).content === "string" &&
    (value as { content: string }).content.length <= MAX_CONTENT_LENGTH
  );
}

/**
 * POST /api/authoring/books/:bookId/chapters — thêm 1 hoặc nhiều chương
 * vào 1 sách ĐÃ CÓ SẴN, nối tiếp order_index hiện tại. Dùng chung cho 3
 * nơi gọi: nhập bản thảo vào truyện có sẵn (nhiều chương), phần chương
 * 2..N khi nhập bản thảo tạo truyện mới (chương 1 đã tạo/patch riêng qua
 * POST /api/authoring/books + PATCH /api/authoring/chapters/:id), và nút
 * "+ Chương mới" thủ công ở trang tổng quan truyện (1 chương rỗng) — nên
 * không cần route riêng cho việc thêm 1 chương tay.
 *
 * Dùng createClient() (RLS thật), KHÔNG service-role — giống mọi route
 * authoring khác. RLS insert trên chapters yêu cầu book_id thuộc 1 sách
 * mà author_id = auth.uid(), nhưng SELECT trên books rộng hơn (cho phép
 * đọc sách đã published của người khác) nên vẫn phải tự kiểm author_id ở
 * đây trước khi tính order_index — không chỉ dựa RLS (giống pattern ở
 * src/app/author/[bookId]/[chapterId]/page.tsx).
 */
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Dữ liệu gửi lên quá lớn." }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  const chaptersInput = Array.isArray(body?.chapters) ? body.chapters : null;

  if (!chaptersInput || chaptersInput.length === 0) {
    return NextResponse.json({ error: "Không có chương nào để thêm." }, { status: 400 });
  }
  if (chaptersInput.length > MAX_DETECTED_CHAPTERS) {
    return NextResponse.json(
      { error: `Chỉ được thêm tối đa ${MAX_DETECTED_CHAPTERS} chương trong 1 lần.` },
      { status: 400 }
    );
  }
  if (!chaptersInput.every(isChapterInput)) {
    return NextResponse.json({ error: "Dữ liệu chương không hợp lệ." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== userData.user.id) {
    return NextResponse.json({ error: "Không tìm thấy truyện hoặc bạn không có quyền sửa." }, { status: 404 });
  }

  const { data: lastChapter } = await supabase
    .from("chapters")
    .select("order_index")
    .eq("book_id", bookId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startIndex = (lastChapter?.order_index ?? 0) + 1;

  const rows = (chaptersInput as ChapterInput[]).map((c, i) => ({
    book_id: bookId,
    title: (typeof c.title === "string" && c.title.trim()) || `Chương ${startIndex + i}`,
    content: c.content,
    order_index: startIndex + i,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("chapters")
    .insert(rows)
    .select("id");

  if (insertError || !inserted) {
    console.error("[authoring] bulk insert chapters failed:", insertError);
    return NextResponse.json({ error: "Không thêm được chương. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ chapterIds: inserted.map((c) => c.id) });
}
