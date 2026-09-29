import { NextResponse } from "next/server";
import { createClient, requireSupabaseUser } from "@/lib/supabase/server";

/**
 * GET /api/design/albums — album của CHÍNH người gọi, cho ô "Tên album"
 * (datalist gợi ý) trong form đăng thiết kế tự động phân biệt "gõ tên
 * album đã có" (đính thêm ảnh vào, khoá luôn phong cách theo album đó)
 * với "gõ tên mới" (tạo album mới, phải chọn phong cách). design_albums
 * cho public select (không có cột bí mật) nhưng route này vẫn lọc theo
 * illustrator_id — gợi ý chỉ nên là album CỦA CHÍNH họ.
 */
export async function GET() {
  const supabase = await createClient();
  const auth = await requireSupabaseUser(supabase);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { data, error } = await supabase
    .from("design_albums")
    .select("id, name, art_style")
    .eq("illustrator_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[api/design/albums GET] query failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách album." }, { status: 500 });
  }

  return NextResponse.json({ albums: data ?? [] });
}
