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
    .select("id, name, art_style, description")
    .eq("illustrator_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[api/design/albums GET] query failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách album." }, { status: 500 });
  }

  return NextResponse.json({ albums: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requireSupabaseUser(supabase);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const { resolveOrCreateAlbum } = await import("@/lib/design/design-items-service");
  const { ART_STYLES } = await import("@/lib/design/art-styles");
  if (typeof body?.name !== "string" || !body.name.trim() || !ART_STYLES.some((s) => s.key === body.artStyle)) {
    return NextResponse.json({ error: "Vui lòng nhập tên và chọn phong cách album." }, { status: 400 });
  }
  const result = await resolveOrCreateAlbum({ supabase, userId: auth.user.id, albumId: null,
    albumName: body.name.trim(), artStyle: body.artStyle,
    albumDescription: typeof body.description === "string" ? body.description.trim() : null });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ albumId: result.albumId });
}
