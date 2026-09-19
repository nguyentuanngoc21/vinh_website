import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ART_STYLES } from "@/lib/design/art-styles";
import type { ArtStyle } from "@/lib/supabase/types";

const ART_STYLE_KEYS = ART_STYLES.map((s) => s.key);

/**
 * PATCH /api/design/albums/:albumId — đổi tên / phong cách nghệ thuật của
 * 1 album đã có (right column trong form đăng). Tách riêng khỏi POST
 * /api/design vì đổi ở đây ảnh hưởng MỌI ảnh đang thuộc album này, không
 * chỉ ảnh đang chọn — resolveOrCreateAlbum() (design-items-service.ts) cố
 * tình không tự đổi style khi chỉ đính thêm 1 ảnh vào album có sẵn.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ albumId: string }> }) {
  const { albumId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const patch: { name?: string; art_style?: ArtStyle; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body?.name === "string") {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "Tên album không được để trống." }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if (typeof body?.artStyle === "string") {
    if (!ART_STYLE_KEYS.includes(body.artStyle as ArtStyle)) {
      return NextResponse.json({ error: "Phong cách nghệ thuật không hợp lệ." }, { status: 400 });
    }
    patch.art_style = body.artStyle as ArtStyle;
  }
  if (!patch.name && !patch.art_style) {
    return NextResponse.json({ error: "Không có gì để sửa." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("design_albums")
    .update(patch)
    .eq("id", albumId)
    .eq("illustrator_id", userData.user.id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[api/design/albums/:id PATCH] update failed:", error);
    return NextResponse.json({ error: "Lưu thay đổi thất bại." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Không tìm thấy album." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
