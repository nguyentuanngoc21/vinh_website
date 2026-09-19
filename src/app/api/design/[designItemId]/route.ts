import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DESIGN_CATEGORIES } from "@/lib/design/get-design-gallery";
import type { Database, DesignItemCategory } from "@/lib/supabase/types";

type DesignItemPatch = Database["public"]["Tables"]["design_items"]["Update"];

const CATEGORY_KEYS = DESIGN_CATEGORIES.map((c) => c.key);

/**
 * PATCH /api/design/:designItemId — sửa 1 field của 1 ảnh đã đăng (form
 * Pinterest-style: mỗi ảnh tự lưu ngay khi chọn ở POST /api/design, sau đó
 * người dùng chỉnh Tên/Mô tả/Loại sản phẩm/Alt text cho từng ảnh riêng qua
 * route này). RLS "illustrators update their own design items" + GRANT
 * cột (migrations/20260919_add_design_albums_and_multi_upload.sql) đủ để
 * chặn — không cần route tự kiểm illustrator_id, update() không match
 * hàng nào của người khác thì trả về rows rỗng, không lỗi.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ designItemId: string }> }) {
  const { designItemId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const patch: DesignItemPatch = {};
  if (typeof body.title === "string") {
    if (!body.title.trim()) {
      return NextResponse.json({ error: "Tiêu đề không được để trống." }, { status: 400 });
    }
    patch.title = body.title.trim();
  }
  if (typeof body.description === "string") {
    patch.description = body.description.trim() || null;
  }
  if (typeof body.altText === "string") {
    patch.alt_text = body.altText.trim() || null;
  }
  if (typeof body.category === "string") {
    if (!CATEGORY_KEYS.includes(body.category as DesignItemCategory)) {
      return NextResponse.json({ error: "Loại sản phẩm không hợp lệ." }, { status: 400 });
    }
    patch.category = body.category;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Không có gì để sửa." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("design_items")
    .update(patch)
    .eq("id", designItemId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[api/design/:id PATCH] update failed:", error);
    return NextResponse.json({ error: "Lưu thay đổi thất bại." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Không tìm thấy tác phẩm." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
