import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { verifyCccdAgainstImages } from "@/lib/ocr";
import { resolveRedirectTarget } from "@/lib/redirect-target";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Đăng ký là request tốn (OCR CCCD, upload ảnh) và giờ còn là nơi DUY
  // NHẤT biết được 1 số CCCD đã dùng để đăng ký chưa (real-time check ở
  // check-availability/route.ts cố tình KHÔNG lộ CCCD — xem comment ở đó).
  // Giới hạn số lần thử/IP để việc đó không trở thành cách dò CCCD hàng loạt.
  const ip = getClientIp(request);
  if (!checkRateLimit(`register:${ip}`, 10, 10 * 60_000)) {
    return NextResponse.json(
      { error: "Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau ít phút." },
      { status: 429 }
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

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
    return NextResponse.json(
      { error: "Thiếu thông tin bắt buộc: " + missing.join(", ") },
      { status: 400 }
    );
  }

  // Khai báo biến thật từ form data — bản trước chỉ kiểm tra sự tồn tại
  // qua `required.filter(...)`, chưa gán vào biến nào để dùng bên dưới.
  const email = String(form.get("email"));
  const username = String(form.get("username"));
  const nickname = String(form.get("nickname"));
  const password = String(form.get("password"));
  // Tùy chọn — bỏ trống thì không set vào profiles (xem insert bên dưới).
  const realname = String(form.get("realname") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();

  if (cccdSubmitted && !/^\d{12}$/.test(cccdRaw)) {
    return NextResponse.json(
      { error: "Số căn cước công dân phải gồm đúng 12 chữ số." },
      { status: 400 }
    );
  }

  // Qua được `missing`/regex ở trên khi cccdSubmitted nghĩa là front/back
  // đã là File hợp lệ — TypeScript không tự suy luận lại điều đó (kiểm
  // tra nằm ở nhánh if riêng) nên khẳng định lại tường minh trước khi
  // dùng verifyCccdAgainstImages(cccd, front, back) bên dưới.
  if (cccdSubmitted && (!(front instanceof File) || !(back instanceof File))) {
    return NextResponse.json({ error: "Thiếu ảnh CCCD." }, { status: 400 });
  }

  if (cccdSubmitted && front instanceof File && back instanceof File) {
    const isIdentityMatch = await verifyCccdAgainstImages(cccdRaw, front, back);
    if (!isIdentityMatch) {
      return NextResponse.json(
        { error: "Không thể xác thực số CCCD từ ảnh tải lên. Vui lòng kiểm tra lại hình ảnh hoặc nhập đúng số." },
        { status: 400 }
      );
    }
  }

  // Kiểm tra trùng username SỚM, trước khi tạo auth.users — "username text
  // unique" ở bảng profiles (docs/supabase/schema.sql) nghĩa là insert
  // profiles bên dưới sẽ vỡ ràng buộc unique (Postgrest 409) nếu trùng.
  // Không kiểm tra trước thì mỗi lần người dùng gõ trùng username sẽ tạo
  // xong 1 auth.users chưa xác nhận rồi mới vỡ ở bước insert profiles —
  // vừa trả lỗi 500 khó hiểu, vừa để lại tài khoản auth mồ côi (không có
  // profile) mà client không có cách nào dọn lại.
  const precheckAdmin = createServiceRoleClient();
  const { data: existingUsername } = await precheckAdmin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existingUsername) {
    return NextResponse.json(
      { error: "Tên tài khoản đã được sử dụng. Vui lòng chọn tên khác." },
      { status: 409 }
    );
  }

  // Cùng lý do với username ở trên: chặn CCCD trùng TRƯỚC khi tạo auth.users
  // — partial unique index identity_verifications_cccd_number_active_idx
  // (migrations/20260916_add_realtime_signup_checks.sql, bỏ qua status =
  // 'rejected') sẽ vỡ ở bước insert identity_verifications bên dưới nếu
  // không chặn sớm. KHÔNG public real-time cho field này (xem
  // check-availability/route.ts) — số CCCD chỉ được xác nhận trùng/không ở
  // đây, lúc submit thật, sau khi rate-limit ở trên.
  if (cccdSubmitted) {
    const { data: existingCccd } = await precheckAdmin
      .from("identity_verifications")
      .select("user_id")
      .eq("cccd_number", cccdRaw)
      .neq("status", "rejected")
      .limit(1);
    if (existingCccd && existingCccd.length > 0) {
      return NextResponse.json(
        { error: "Số CCCD này đã được dùng để đăng ký một tài khoản khác." },
        { status: 409 }
      );
    }
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;
  // Trang cần quay lại sau khi xác nhận xong (rào đọc/nghe cho khách vãng
  // lai đưa người dùng qua đây kèm ?next=, xem register-form.tsx +
  // src/lib/auth.ts RegisterPayload.next) — validate qua
  // resolveRedirectTarget() (chỉ nhận đường dẫn nội bộ, tránh open
  // redirect), rơi về "/" như cũ nếu thiếu/không hợp lệ.
  const next = resolveRedirectTarget(String(form.get("next") ?? ""));

  // emailRedirectTo giống cách forgot-password/route.ts làm cho luồng quên
  // mật khẩu: không set thì Supabase rơi về Site URL mặc định, link "Xác
  // nhận đăng ký" trong mail sẽ không chạy qua /api/auth/confirm để đổi
  // code lấy session — người dùng bấm vào chỉ thấy trang chủ với ?code=...
  // vô dụng trên URL. flow=signup để /api/auth/confirm biết đây là luồng
  // đăng ký (khác luồng quên mật khẩu) và thật sự đăng nhập (set
  // vinh_session) ngay khi đổi code thành công — trước đó tài khoản đã tạo
  // xong nhưng CHƯA đăng nhập được, xem NextResponse.json ở cuối route này.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/api/auth/confirm?next=${encodeURIComponent(next)}&flow=signup`,
    },
  });
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Đăng ký thất bại." },
      { status: 400 }
    );
  }

  // Project này bật cả "Confirm email" và "Confirm phone" (bắt buộc xác nhận
  // qua OTP/link — xem comment emailRedirectTo phía trên) — theo tài liệu
  // GoTrueClient.signUp(), khi gọi signUp() với 1 email ĐÃ tồn tại VÀ ĐÃ xác
  // nhận từ trước, Supabase KHÔNG báo lỗi mà trả về "obfuscated/fake user
  // object" để tránh lộ thông tin email đã có tài khoản. authError vẫn null
  // và authData.user vẫn có id, NHƯNG id đó không tồn tại thật trong
  // auth.users — insert bên dưới vào profiles (có FK tới auth.users) sẽ vỡ
  // ràng buộc khoá ngoại (profiles_id_fkey), lộ ra như lỗi 500 khó hiểu thay
  // vì cho biết email đã được dùng. Nhận diện case này qua identities rỗng
  // (fake user luôn có identities: []) và chặn sớm, KHÔNG chạm tới bước
  // insert profiles/upload ảnh nữa.
  if (authData.user.identities && authData.user.identities.length === 0) {
    return NextResponse.json(
      { error: "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng chức năng quên mật khẩu." },
      { status: 400 }
    );
  }

  // Dùng service role từ đây trở xuống: nếu project bật "Confirm email"
  // (mặc định của Supabase), tài khoản vừa signUp() CHƯA có session thật
  // — các lệnh ghi dùng client thường (createClient()) sẽ bị RLS chặn vì
  // auth.uid() = null lúc này. Mọi ghi bên dưới đều nhắm đúng
  // authData.user.id (giá trị Supabase Auth vừa sinh ra, không phải do
  // client tự gửi lên) nên an toàn để bỏ qua RLS ở đúng phạm vi hẹp này.
  // Xem comment đầy đủ trong src/lib/supabase/server.ts.
  const admin = createServiceRoleClient();

  // Dọn lại auth.users vừa tạo nếu bất kỳ bước nào bên dưới thất bại —
  // profiles có "on delete cascade" tới auth.users (docs/supabase/schema.sql)
  // nên xoá auth user là đủ dọn sạch cả profile vừa insert, không để lại tài
  // khoản mồ côi (có auth.users, không có/thiếu profiles hoặc
  // identity_verifications) chặn những lần đăng ký sau với cùng email.
  const newUserId = authData.user.id;
  const rollbackAuthUser = () => admin.auth.admin.deleteUser(newUserId).catch(() => {});

  // OCR đã khớp ảnh với số CCCD ở bước kiểm tra phía trên (nếu có gửi) —
  // coi là xác minh tự động, giống hệt luồng cập nhật CCCD sau này trong
  // Thông tin cá nhân (xem src/app/api/profile/identity/route.ts), để
  // không có chuyện xác minh cùng 1 cách nhưng đăng ký thì mãi 'pending'
  // còn cập nhật sau thì 'approved'.
  const cccdVerified = cccdSubmitted;

  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    username,
    nickname,
    ...(realname ? { real_name: realname } : {}),
    ...(phone ? { phone } : {}),
    ...(cccdVerified ? { cccd_last4: cccdRaw.slice(-4), cccd_verified: true } : {}),
  });
  if (profileError) {
    console.error("[register] insert profiles failed:", profileError);
    await rollbackAuthUser();
    // code "23505" = unique_violation của Postgres — race condition hiếm
    // (2 request cùng username lọt qua precheck ở trên gần như cùng lúc).
    const isDuplicateUsername = profileError.code === "23505";
    return NextResponse.json(
      {
        error: isDuplicateUsername
          ? "Tên tài khoản đã được sử dụng. Vui lòng chọn tên khác."
          : `Tạo hồ sơ thất bại: ${profileError.message}`,
      },
      { status: isDuplicateUsername ? 409 : 500 }
    );
  }

  if (cccdSubmitted) {
    // Qua được các kiểm tra ở trên khi cccdSubmitted nghĩa là front/back
    // đã là File hợp lệ — khẳng định lại tường minh vì TypeScript không
    // giữ narrowing đó xuyên suốt hàm (nằm ở nhánh if riêng phía trên).
    if (!(front instanceof File) || !(back instanceof File)) {
      return NextResponse.json({ error: "Thiếu ảnh CCCD." }, { status: 400 });
    }

    // Upload ảnh CCCD vào bucket riêng tư — KHÔNG dùng bucket công khai.
    const frontPath = `${authData.user.id}/front-${Date.now()}.jpg`;
    const backPath = `${authData.user.id}/back-${Date.now()}.jpg`;

    const { error: frontUploadError } = await admin.storage
      .from("identity-documents")
      .upload(frontPath, front);
    if (frontUploadError) {
      console.error("[register] upload cccdFront failed:", frontUploadError);
      await rollbackAuthUser();
      return NextResponse.json(
        { error: `Tải ảnh mặt trước thất bại: ${frontUploadError.message}` },
        { status: 500 }
      );
    }

    const { error: backUploadError } = await admin.storage
      .from("identity-documents")
      .upload(backPath, back);
    if (backUploadError) {
      console.error("[register] upload cccdBack failed:", backUploadError);
      await rollbackAuthUser();
      return NextResponse.json(
        { error: `Tải ảnh mặt sau thất bại: ${backUploadError.message}` },
        { status: 500 }
      );
    }

    const { error: verificationError } = await admin.from("identity_verifications").insert({
      user_id: authData.user.id,
      cccd_number: cccdRaw,
      cccd_front_path: frontPath,
      cccd_back_path: backPath,
      status: "approved",
    });
    if (verificationError) {
      console.error("[register] insert identity_verifications failed:", verificationError);
      await rollbackAuthUser();
      // race condition hiếm: 2 request cùng CCCD lọt qua precheck ở trên
      // gần như cùng lúc, vỡ ở identity_verifications_cccd_number_active_idx.
      const isDuplicateCccd = verificationError.code === "23505";
      return NextResponse.json(
        {
          error: isDuplicateCccd
            ? "Số CCCD này đã được dùng để đăng ký một tài khoản khác."
            : `Lưu thông tin xác minh thất bại: ${verificationError.message}`,
        },
        { status: isDuplicateCccd ? 409 : 500 }
      );
    }
  }

  // KHÔNG đăng nhập ở đây — tài khoản đã tạo đủ (auth.users + profiles +
  // identity_verifications) nhưng email chưa xác nhận. Cố tình không set
  // vinh_session để tránh cho vào app trước khi họ bấm link trong mail.
  // /api/auth/confirm mới là nơi thật sự đăng nhập, sau khi
  // exchangeCodeForSession() xác nhận link hợp lệ — xem route đó.
  return NextResponse.json({ pendingConfirmation: true });
}