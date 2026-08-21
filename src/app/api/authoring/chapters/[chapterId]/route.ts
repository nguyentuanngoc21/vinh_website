import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/authoring/chapters/:chapterId — dùng cho cả "Lưu nháp"
 * (published: false) và "Xuất bản" (published: true) ở
 * chapter-editor.tsx/publish-panel.tsx, cùng việc lưu Độc quyền/Giá
 * chương (is_exclusive/price — migrations/20260820_add_chapter_price.sql).
 * Không tự check ownership tay — policy "authors update chapters on
 * their own books" (docs/supabase/schema.sql) đã chặn qua RLS.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const update: {
    title?: string;
    content?: string;
    published?: boolean;
    price?: number;
    is_exclusive?: boolean;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.content === "string") update.content = body.content;
  if (typeof body.published === "boolean") update.published = body.published;
  if (typeof body.price === "number" && Number.isFinite(body.price) && body.price >= 0) {
    update.price = Math.round(body.price);
  }
  if (typeof body.is_exclusive === "boolean") update.is_exclusive = body.is_exclusive;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chapters")
    .update(update)
    .eq("id", chapterId)
    .select("id, title, content, published, price, is_exclusive")
    .maybeSingle();

  if (error) {
    console.error("[authoring] update chapter failed:", error);
    return NextResponse.json({ error: "Lưu thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Không tìm thấy chương hoặc bạn không có quyền sửa." },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
