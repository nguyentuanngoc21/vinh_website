import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { verifyCccdAgainstImages } from "@/lib/ocr";

export async function GET(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("cccd_verified, cccd_last4")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  // cccd_issued_at ("cấp ngày") sống ở identity_verifications, không phải
  // profiles — chỉ có khi đã xác minh, nên chỉ cần query khi verified.
  let cccdIssuedAt: string | null = null;
  if (data.cccd_verified) {
    const { data: verification } = await supabase
      .from("identity_verifications")
      .select("cccd_issued_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    cccdIssuedAt = verification?.cccd_issued_at ?? null;
  }

  return NextResponse.json({
    cccdVerified: data.cccd_verified,
    // Không trả số CCCD đầy đủ hay ảnh ra client — giữ đúng tinh thần
    // "không over-select dữ liệu nhạy cảm" đã ghi trong schema.sql. Số
    // đầy đủ chỉ trả qua GET /api/profile/contract-info (chủ hồ sơ tự
    // xem lại để điền hợp đồng độc quyền), không phải ở đây.
    cccdNumberMasked: data.cccd_last4 ? `********${data.cccd_last4}` : null,
    cccdIssuedAt,
  });
}

export async function POST(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const cccd = String(form.get("cccd") ?? "").trim();
  const front = form.get("cccdFront");
  const back = form.get("cccdBack");
  // "Cấp ngày" — không bắt buộc (nhiều người không nhớ/không mang thẻ để
  // tra), chỉ dùng để tự điền Hợp đồng khai thác tác phẩm độc quyền sau
  // này; thiếu vẫn xác minh CCCD bình thường.
  const cccdIssuedAtRaw = String(form.get("cccdIssuedAt") ?? "").trim();
  const cccdIssuedAt = /^\d{4}-\d{2}-\d{2}$/.test(cccdIssuedAtRaw) ? cccdIssuedAtRaw : null;

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

  // 1 user chỉ nên có 1 dòng "đang hiệu lực" (status khác 'rejected') tại 1
  // thời điểm — mọi nơi đọc bảng này (GET ở trên, contract-info-service.ts)
  // đều chỉ lấy dòng mới nhất, chưa từng cần lịch sử nhiều dòng. Trước đây
  // route này luôn insert() dòng mới mỗi lần xác minh lại, để lại các dòng
  // cũ 'pending'/'approved' không dùng tới — vô hại cho tới khi thêm
  // identity_verifications_cccd_number_active_idx (migrations/
  // 20260916_add_realtime_signup_checks.sql): user xác minh lại ĐÚNG số
  // CCCD cũ của chính mình sẽ vỡ unique index vì dòng cũ chưa 'rejected'.
  // Xoá dòng cũ (nếu có) trước khi insert dòng mới — KHÔNG dùng update():
  // types.ts cố tình khai Update: never cho bảng này (reviewed_by/
  // reviewed_at chỉ được đổi qua luồng admin duyệt tay xây riêng sau, chưa
  // có RPC nào ở bản schema hiện tại) — xoá+insert giữ đúng ràng buộc đó,
  // không cần nới Update ra chỉ để phục vụ route này.
  const { data: existingVerification } = await supabase
    .from("identity_verifications")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingVerification) {
    const { error: deleteError } = await supabase
      .from("identity_verifications")
      .delete()
      .eq("id", existingVerification.id);
    if (deleteError) {
      console.error("[profile/identity] delete previous identity_verifications failed:", deleteError);
      return NextResponse.json({ error: `Lưu thông tin xác minh thất bại: ${deleteError.message}` }, { status: 500 });
    }
  }

  const { error: verificationError } = await supabase.from("identity_verifications").insert({
    user_id: userId,
    cccd_number: cccd,
    cccd_issued_at: cccdIssuedAt,
    cccd_front_path: frontPath,
    cccd_back_path: backPath,
    status: "approved",
  });
  if (verificationError) {
    console.error("[profile/identity] insert identity_verifications failed:", verificationError);
    // "23505" = unique_violation trên identity_verifications_cccd_number_active_idx
    // — số CCCD đang hiệu lực ở tài khoản khác (cùng thông báo với đăng ký).
    if (verificationError.code === "23505") {
      return NextResponse.json({ error: "Số CCCD này đã được dùng để đăng ký một tài khoản khác." }, { status: 409 });
    }
    return NextResponse.json({ error: `Lưu thông tin xác minh thất bại: ${verificationError.message}` }, { status: 500 });
  }

  // Dùng service role (bypass RLS) — trigger enforce_cccd_verified_authority
  // (migrations/archive/20260826_add_profile_bank_info.sql) chỉ cho context tin
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

  return NextResponse.json({
    ok: true,
    cccdVerified: true,
    cccdNumberMasked: `********${cccd.slice(-4)}`,
    cccdIssuedAt,
  });
}

/**
 * Ngoại lệ duy nhất cho quy tắc "sửa CCCD phải tải ảnh mới + OCR đối chiếu"
 * (POST ở trên): tài khoản ĐÃ xác minh nhưng CHƯA có "cấp ngày" (vd đăng ký
 * trước khi form đăng ký hỏi field này) được BỔ SUNG ngày cấp mà không cần
 * tải lại ảnh. Chỉ thêm khi đang trống — đổi ngày đã có, hay đổi số CCCD,
 * vẫn phải qua POST (xác minh lại từ đầu).
 *
 * identity_verifications cố tình không cho update (types.ts khai
 * Update: never, xem comment ở POST) — dùng cùng cách xoá+insert như POST,
 * chép nguyên số/ảnh/trạng thái của dòng đang hiệu lực, chỉ thêm
 * cccd_issued_at. Xoá trước rồi mới insert (insert trước sẽ vỡ
 * identity_verifications_cccd_number_active_idx vì trùng số); insert lỗi
 * thì chèn lại đúng dòng cũ để không mất xác minh.
 */
export async function PATCH(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const cccdIssuedAt = String(body?.cccdIssuedAt ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cccdIssuedAt) || Number.isNaN(Date.parse(cccdIssuedAt))) {
    return NextResponse.json({ error: "Ngày cấp không hợp lệ." }, { status: 400 });
  }
  if (cccdIssuedAt > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "Ngày cấp không được sau hôm nay." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cccd_verified, cccd_last4")
    .eq("id", userId)
    .single();
  const { data: current } = await supabase
    .from("identity_verifications")
    .select("id, cccd_number, cccd_issued_at, cccd_front_path, cccd_back_path, status")
    .eq("user_id", userId)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile?.cccd_verified || !current) {
    return NextResponse.json({ error: "Tài khoản chưa xác minh CCCD." }, { status: 400 });
  }
  if (current.cccd_issued_at) {
    return NextResponse.json(
      { error: "Ngày cấp đã có — muốn sửa, vui lòng xác minh lại CCCD kèm ảnh mới nhất." },
      { status: 409 }
    );
  }

  const { id: currentId, ...currentFields } = current;
  const { error: deleteError } = await supabase.from("identity_verifications").delete().eq("id", currentId);
  if (deleteError) {
    console.error("[profile/identity] PATCH delete failed:", deleteError);
    return NextResponse.json({ error: `Lưu ngày cấp thất bại: ${deleteError.message}` }, { status: 500 });
  }

  const { error: insertError } = await supabase
    .from("identity_verifications")
    .insert({ user_id: userId, ...currentFields, cccd_issued_at: cccdIssuedAt });
  if (insertError) {
    console.error("[profile/identity] PATCH insert failed:", insertError);
    const { error: restoreError } = await supabase
      .from("identity_verifications")
      .insert({ user_id: userId, ...currentFields });
    if (restoreError) console.error("[profile/identity] PATCH restore FAILED:", restoreError);
    return NextResponse.json({ error: `Lưu ngày cấp thất bại: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cccdVerified: true,
    cccdNumberMasked: profile.cccd_last4 ? `********${profile.cccd_last4}` : null,
    cccdIssuedAt,
  });
}
