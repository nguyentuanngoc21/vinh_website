import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { verifyCccdAgainstImages } from "@/lib/ocr";

export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("cccd_verified, cccd_last4")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  return NextResponse.json({
    cccdVerified: data.cccd_verified,
    // Không trả số CCCD đầy đủ hay ảnh ra client — giữ đúng tinh thần
    // "không over-select dữ liệu nhạy cảm" đã ghi trong schema.sql.
    cccdNumberMasked: data.cccd_last4 ? `********${data.cccd_last4}` : null,
  });
}

export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const cccd = String(form.get("cccd") ?? "").trim();
  const front = form.get("cccdFront");
  const back = form.get("cccdBack");

  if (!/^\d{12}$/.test(cccd)) {
    return NextResponse.json({ error: "Số căn cước công dân phải gồm đúng 12 chữ số." }, { status: 400 });
  }
  if (!(front instanceof File) || front.size === 0 || !(back instanceof File) || back.size === 0) {
    return NextResponse.json({ error: "Thiếu ảnh CCCD." }, { status: 400 });
  }

  // Mirror register/route.ts: xác minh tự động qua OCR khớp ảnh, không có
  // màn hình admin duyệt tay ở bản này. Không khớp thì không ghi gì cả.
  const isIdentityMatch = await verifyCccdAgainstImages(cccd, front, back);
  if (!isIdentityMatch) {
    return NextResponse.json(
      { error: "Không thể xác thực số CCCD từ ảnh tải lên. Vui lòng kiểm tra lại hình ảnh hoặc nhập đúng số." },
      { status: 400 }
    );
  }

  const frontPath = `${userId}/front-${Date.now()}.jpg`;
  const backPath = `${userId}/back-${Date.now()}.jpg`;

  const { error: frontUploadError } = await supabase.storage.from("identity-documents").upload(frontPath, front);
  if (frontUploadError) {
    console.error("[profile/identity] upload cccdFront failed:", frontUploadError);
    return NextResponse.json({ error: `Tải ảnh mặt trước thất bại: ${frontUploadError.message}` }, { status: 500 });
  }

  const { error: backUploadError } = await supabase.storage.from("identity-documents").upload(backPath, back);
  if (backUploadError) {
    console.error("[profile/identity] upload cccdBack failed:", backUploadError);
    return NextResponse.json({ error: `Tải ảnh mặt sau thất bại: ${backUploadError.message}` }, { status: 500 });
  }

  const { error: verificationError } = await supabase.from("identity_verifications").insert({
    user_id: userId,
    cccd_number: cccd,
    cccd_front_path: frontPath,
    cccd_back_path: backPath,
    status: "approved",
  });
  if (verificationError) {
    console.error("[profile/identity] insert identity_verifications failed:", verificationError);
    return NextResponse.json({ error: `Lưu thông tin xác minh thất bại: ${verificationError.message}` }, { status: 500 });
  }

  // Dùng service role (bypass RLS) — trigger enforce_cccd_verified_authority
  // (migrations/20260826_add_profile_bank_info.sql) chỉ cho context tin
  // cậy như thế này đổi cccd_verified, chặn user tự set qua policy
  // "update own profile" thường.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ cccd_last4: cccd.slice(-4), cccd_verified: true })
    .eq("id", userId);
  if (profileError) {
    console.error("[profile/identity] update profiles failed:", profileError);
    return NextResponse.json({ error: `Cập nhật hồ sơ thất bại: ${profileError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cccdVerified: true, cccdNumberMasked: `********${cccd.slice(-4)}` });
}
