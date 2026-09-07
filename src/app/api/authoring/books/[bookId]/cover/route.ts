import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { applyPublicAssetWatermark } from "@/lib/copyright/public-asset-watermark";

const COVER_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Ảnh bìa truyện — dùng đúng cơ chế design_items + link_cover_to_book()
 * đã có sẵn trong schema (phần 9), trước giờ chưa có UI/route nào gọi
 * tới (tác giả không thấy chỗ upload bìa trong "Viết truyện").
 *
 * QUAN TRỌNG: cover_design_item_id bị REVOKE UPDATE khỏi role
 * `authenticated` + chặn thêm bởi trigger enforce_cover_via_function —
 * chỉ set được (giá trị khác null) qua RPC link_cover_to_book(). RPC đó
 * tự kiểm `auth.uid()` bên trong (KHÔNG nhận p_user_id), nên bắt buộc
 * phải gọi bằng client cookie-bound của CHÍNH tác giả (createClient() từ
 * @/lib/supabase/server, dùng session thật qua cookie sb-*) — KHÁC phần
 * lớn route khác trong repo vốn dùng service-role. Dùng service-role ở
 * đây sẽ khiến auth.uid() = null, RPC luôn báo "Bạn không sở hữu sách
 * này". Xem migrations/20260827_restrict_sensitive_rpc_execute_grants.sql
 * (ghi rõ link_cover_to_book nằm trong nhóm hàm "an toàn để client tự
 * gọi trực tiếp").
 *
 * Tác giả tự upload rồi tự link ngay trong 1 lần gọi (không cần bước
 * "dán link chia sẻ" — luồng đó dành cho khi 1 họa sĩ KHÁC vẽ bìa hộ và
 * gửi link, xem comment trong schema.sql phần 9).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, deleted_at")
    .eq("id", bookId)
    .maybeSingle();
  if (bookError || !book || book.author_id !== user.id || book.deleted_at) {
    return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const file = form.get("cover");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Thiếu ảnh bìa." }, { status: 400 });
  }

  const ext = ALLOWED_MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP." },
      { status: 400 }
    );
  }
  if (file.size > COVER_MAX_BYTES) {
    return NextResponse.json({ error: "Ảnh bìa tối đa 8MB." }, { status: 400 });
  }

  // Ép PNG + nhúng XMP "không cho AI huấn luyện" (ẩn, không che ảnh) —
  // xem src/lib/copyright/public-asset-watermark.ts. Văn bản luật (Bộ quy
  // tắc giao dịch Commission) yêu cầu gắn cho "mọi ảnh, link bìa" — bìa
  // truyện là 1 trong số đó.
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  let watermarked: Buffer;
  try {
    watermarked = await applyPublicAssetWatermark(originalBuffer, book.title);
  } catch (err) {
    console.error("[authoring/books/cover] watermark failed:", err);
    return NextResponse.json({ error: "Xử lý ảnh bìa thất bại." }, { status: 500 });
  }

  const path = `${user.id}/cover-${bookId}-${Date.now()}.png`;
  const { error: uploadError } = await supabase.storage
    .from("design-images")
    .upload(path, watermarked, { contentType: "image/png" });
  if (uploadError) {
    console.error("[authoring/books/cover] upload failed:", uploadError);
    return NextResponse.json({ error: `Tải ảnh bìa thất bại: ${uploadError.message}` }, { status: 500 });
  }

  // source: 'story_upload' — tác giả tự tải lên cho chính truyện của
  // mình, khác 'independent' (họa sĩ đăng lên kho Thiết kế /thiet-ke để
  // rao bán/chia sẻ độc lập).
  const { data: item, error: insertError } = await supabase
    .from("design_items")
    .insert({
      illustrator_id: user.id,
      title: `Bìa — ${book.title}`,
      image_url: path,
      source: "story_upload",
    })
    .select("id, share_token")
    .single();
  if (insertError || !item) {
    console.error("[authoring/books/cover] design_items insert failed:", insertError);
    return NextResponse.json({ error: "Lưu ảnh bìa thất bại." }, { status: 500 });
  }

  // Ghi nhận đã bảo hộ — chỉ admin đọc được (RLS), phải dùng service-role
  // (khác `supabase` cookie-bound đang dùng cho phần còn lại của route).
  // Lỗi ở đây không chặn phản hồi — bìa đã lên thật và đã bảo hộ, chỉ là
  // admin dashboard đếm thiếu 1 dòng.
  const { error: protectionError } = await createServiceRoleClient()
    .from("content_protection_status")
    .insert({ content_type: "design", content_id: item.id, method: "xmp_png" });
  if (protectionError) {
    console.error("[authoring/books/cover] content_protection_status insert failed:", protectionError);
  }

  const { error: linkError } = await supabase.rpc("link_cover_to_book", {
    p_book_id: bookId,
    p_design_item_id: item.id,
    p_share_token: item.share_token,
  });
  if (linkError) {
    console.error("[authoring/books/cover] link_cover_to_book failed:", linkError);
    return NextResponse.json({ error: `Gắn ảnh bìa thất bại: ${linkError.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("design-images").getPublicUrl(path);
  return NextResponse.json({ ok: true, coverUrl: urlData.publicUrl });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Xác nhận quyền sở hữu qua client RLS-checked TRƯỚC — cover_design_item_id
  // không nằm trong GRANT UPDATE cho authenticated nên kể cả set về null
  // cũng không update trực tiếp bằng client thường (session của tác giả)
  // được; dùng service-role NGAY SAU đây chỉ để gỡ đúng 1 cột này, target
  // (bookId) đã validate ở trên — đúng tinh thần dùng service-role an
  // toàn (xem doc comment createServiceRoleClient()). Trigger
  // enforce_cover_via_function cho phép set về null không điều kiện, nên
  // không cần set_config('vinh.allow_cover_change', ...) ở đây.
  const { data: book } = await supabase
    .from("books")
    .select("id, author_id, deleted_at")
    .eq("id", bookId)
    .maybeSingle();
  if (!book || book.author_id !== user.id || book.deleted_at) {
    return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });
  }

  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient
    .from("books")
    .update({ cover_design_item_id: null })
    .eq("id", bookId);
  if (error) {
    console.error("[authoring/books/cover] clear failed:", error);
    return NextResponse.json({ error: "Gỡ ảnh bìa thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, coverUrl: null });
}
