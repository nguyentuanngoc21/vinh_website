import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { verifyCccdAgainstImages } from "@/lib/ocr";
import { resolveRedirectTarget } from "@/lib/redirect-target";

type Client = SupabaseClient<Database>;

/**
 * Nghiệp vụ đăng ký dùng chung cho web (/api/auth/register) và mobile
 * (/api/mobile/auth/register). Tách ra để hai nơi không lệch quy tắc; mỗi
 * route tự rate-limit và tự chọn client:
 * - `authClient`: client gọi auth.signUp(). Web dùng SSR client (createClient()
 *   ở server) để lưu code_verifier PKCE vào cookie — link xác nhận trong mail
 *   mới đổi được code ở /api/auth/confirm. Mobile dùng client không session
 *   của dự án mobile; người dùng xác nhận bằng mã OTP trong cùng email.
 * - `admin`: service-role client CÙNG dự án với authClient (insert profiles/
 *   identity_verifications, upload ảnh CCCD, rollback auth user).
 * - `origin`: gốc URL cho emailRedirectTo (/api/auth/confirm).
 */
export async function registerAccount(
  form: FormData,
  { authClient, admin, origin }: { authClient: Client; admin: Client; origin: string }
): Promise<Response> {
  // Toàn bộ "Xác minh danh tính" (tên thật, số điện thoại, CCCD + ảnh) đều
  // tùy chọn ở bước đăng ký — chỉ bắt buộc nếu người dùng đã gửi kèm ít
  // nhất 1 trong 3 field CCCD, để tránh nửa vời (có số mà thiếu ảnh, hoặc
  // ngược lại). realname/phone có thể bổ sung sau trong Thông tin cá nhân.
  const required = ["email", "username", "nickname", "password"];
  const missing = required.filter((key) => !String(form.get(key) ?? "").trim());

  const cccdRaw = String(form.get("cccd") ?? "").trim();
  const front = form.get("cccdFront");
  const back = form.get("cccdBack");
  const hasFront = front instanceof File && front.size > 0;
  const hasBack = back instanceof File && back.size > 0;
  const cccdSubmitted = !!cccdRaw || hasFront || hasBack;

  if (cccdSubmitted) {
    if (!cccdRaw) missing.push("cccd");
    if (!hasFront) missing.push("cccdFront");
    if (!hasBack) missing.push("cccdBack");
  }

  if (missing.length > 0) {
    return Response.json({ error: "Thiếu thông tin bắt buộc: " + missing.join(", ") }, { status: 400 });
  }

  const email = String(form.get("email"));
  const username = String(form.get("username"));
  const nickname = String(form.get("nickname"));
  const password = String(form.get("password"));
  // Tùy chọn — bỏ trống thì không set vào profiles (xem insert bên dưới).
  const realname = String(form.get("realname") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();

  if (cccdSubmitted && !/^\d{12}$/.test(cccdRaw)) {
    return Response.json({ error: "Số căn cước công dân phải gồm đúng 12 chữ số." }, { status: 400 });
  }

  // TypeScript không giữ narrowing front/back từ các nhánh if phía trên.
  if (cccdSubmitted && (!(front instanceof File) || !(back instanceof File))) {
    return Response.json({ error: "Thiếu ảnh CCCD." }, { status: 400 });
  }

  if (cccdSubmitted && front instanceof File && back instanceof File) {
    const isIdentityMatch = await verifyCccdAgainstImages(cccdRaw, front, back);
    if (!isIdentityMatch) {
      return Response.json(
        { error: "Không thể xác thực số CCCD từ ảnh tải lên. Vui lòng kiểm tra lại hình ảnh hoặc nhập đúng số." },
        { status: 400 }
      );
    }
  }

  // Kiểm tra trùng username SỚM, trước khi tạo auth.users — "username text
  // unique" ở bảng profiles nghĩa là insert profiles bên dưới sẽ vỡ ràng buộc
  // unique nếu trùng, để lại tài khoản auth mồ côi (không có profile).
  const { data: existingUsername } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existingUsername) {
    return Response.json({ error: "Tên tài khoản đã được sử dụng. Vui lòng chọn tên khác." }, { status: 409 });
  }

  // Cùng lý do với username: chặn CCCD trùng TRƯỚC khi tạo auth.users —
  // partial unique index identity_verifications_cccd_number_active_idx
  // (migrations/20260916_add_realtime_signup_checks.sql, bỏ qua status =
  // 'rejected'). KHÔNG public real-time cho field này (xem
  // check-availability/route.ts) — chỉ xác nhận trùng ở đây, sau rate-limit.
  if (cccdSubmitted) {
    const { data: existingCccd } = await admin
      .from("identity_verifications")
      .select("user_id")
      .eq("cccd_number", cccdRaw)
      .neq("status", "rejected")
      .limit(1);
    if (existingCccd && existingCccd.length > 0) {
      return Response.json({ error: "Số CCCD này đã được dùng để đăng ký một tài khoản khác." }, { status: 409 });
    }
  }

  // Trang cần quay lại sau khi xác nhận — chỉ nhận đường dẫn nội bộ (tránh
  // open redirect), rơi về "/" nếu thiếu/không hợp lệ.
  const next = resolveRedirectTarget(String(form.get("next") ?? ""));

  // flow=signup để /api/auth/confirm biết đây là luồng đăng ký và đăng nhập
  // (set vinh_session) ngay khi đổi code thành công.
  const { data: authData, error: authError } = await authClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/api/auth/confirm?next=${encodeURIComponent(next)}&flow=signup`,
    },
  });
  if (authError || !authData.user) {
    return Response.json({ error: authError?.message ?? "Đăng ký thất bại." }, { status: 400 });
  }

  // Email ĐÃ tồn tại và đã xác nhận: Supabase không báo lỗi mà trả "fake
  // user" (identities rỗng, id không có thật trong auth.users) để chống dò
  // email. Chặn ở đây thay vì để insert profiles vỡ khoá ngoại thành lỗi 500.
  if (authData.user.identities && authData.user.identities.length === 0) {
    return Response.json(
      { error: "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng chức năng quên mật khẩu." },
      { status: 400 }
    );
  }

  // Từ đây dùng service role: tài khoản vừa signUp() CHƯA có session thật
  // (bật "Confirm email"), client thường sẽ bị RLS chặn. Mọi ghi bên dưới
  // nhắm đúng authData.user.id do Supabase Auth sinh ra, không do client gửi.
  // Dọn auth.users nếu bất kỳ bước nào thất bại — profiles "on delete
  // cascade" tới auth.users nên xoá auth user là đủ, không để tài khoản mồ côi.
  const newUserId = authData.user.id;
  const rollbackAuthUser = () => admin.auth.admin.deleteUser(newUserId).catch(() => {});

  // OCR đã khớp ảnh với số CCCD phía trên — coi là xác minh tự động, giống
  // luồng cập nhật CCCD sau này (src/app/api/profile/identity/route.ts).
  const cccdVerified = cccdSubmitted;

  const { error: profileError } = await admin.from("profiles").insert({
    id: newUserId,
    username,
    nickname,
    ...(realname ? { real_name: realname } : {}),
    ...(phone ? { phone } : {}),
    ...(cccdVerified ? { cccd_last4: cccdRaw.slice(-4), cccd_verified: true } : {}),
  });
  if (profileError) {
    console.error("[register] insert profiles failed:", profileError);
    await rollbackAuthUser();
    // "23505" = unique_violation — race hiếm khi 2 request cùng username lọt precheck.
    const isDuplicateUsername = profileError.code === "23505";
    return Response.json(
      {
        error: isDuplicateUsername
          ? "Tên tài khoản đã được sử dụng. Vui lòng chọn tên khác."
          : `Tạo hồ sơ thất bại: ${profileError.message}`,
      },
      { status: isDuplicateUsername ? 409 : 500 }
    );
  }

  if (cccdSubmitted) {
    if (!(front instanceof File) || !(back instanceof File)) {
      return Response.json({ error: "Thiếu ảnh CCCD." }, { status: 400 });
    }

    // Upload ảnh CCCD vào bucket riêng tư — KHÔNG dùng bucket công khai.
    const frontPath = `${newUserId}/front-${Date.now()}.jpg`;
    const backPath = `${newUserId}/back-${Date.now()}.jpg`;

    const { error: frontUploadError } = await admin.storage.from("identity-documents").upload(frontPath, front);
    if (frontUploadError) {
      console.error("[register] upload cccdFront failed:", frontUploadError);
      await rollbackAuthUser();
      return Response.json({ error: `Tải ảnh mặt trước thất bại: ${frontUploadError.message}` }, { status: 500 });
    }

    const { error: backUploadError } = await admin.storage.from("identity-documents").upload(backPath, back);
    if (backUploadError) {
      console.error("[register] upload cccdBack failed:", backUploadError);
      await rollbackAuthUser();
      return Response.json({ error: `Tải ảnh mặt sau thất bại: ${backUploadError.message}` }, { status: 500 });
    }

    const { error: verificationError } = await admin.from("identity_verifications").insert({
      user_id: newUserId,
      cccd_number: cccdRaw,
      cccd_front_path: frontPath,
      cccd_back_path: backPath,
      status: "approved",
    });
    if (verificationError) {
      console.error("[register] insert identity_verifications failed:", verificationError);
      await rollbackAuthUser();
      const isDuplicateCccd = verificationError.code === "23505";
      return Response.json(
        {
          error: isDuplicateCccd
            ? "Số CCCD này đã được dùng để đăng ký một tài khoản khác."
            : `Lưu thông tin xác minh thất bại: ${verificationError.message}`,
        },
        { status: isDuplicateCccd ? 409 : 500 }
      );
    }
  }

  // KHÔNG đăng nhập ở đây — email chưa xác nhận. Web đăng nhập ở
  // /api/auth/confirm (link) hoặc /api/auth/verify-otp (mã); mobile gọi
  // verifyOtp() trực tiếp với Supabase Auth.
  return Response.json({ pendingConfirmation: true });
}

/** Kiểm tra username/email đã dùng chưa — KHÔNG hỗ trợ CCCD (xem check-availability/route.ts). */
export async function checkSignupAvailability(admin: Client, field: string | null, rawValue: string | null) {
  const value = (rawValue ?? "").trim();
  if (field !== "username" && field !== "email") {
    return Response.json({ error: "field không hợp lệ." }, { status: 400 });
  }
  if (!value) return Response.json({ available: true });
  if (field === "username") {
    const { data } = await admin.from("profiles").select("id").eq("username", value).maybeSingle();
    return Response.json({ available: !data });
  }
  const { data: isRegistered, error } = await admin.rpc("is_email_registered", { p_email: value });
  if (error) {
    console.error("[check-availability] is_email_registered failed:", error);
    return Response.json({ error: "Không thể kiểm tra lúc này." }, { status: 500 });
  }
  return Response.json({ available: !isRegistered });
}
