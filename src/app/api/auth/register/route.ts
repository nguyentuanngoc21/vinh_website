import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { verifyCccdAgainstImages } from "@/lib/ocr";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const required = ["email", "username", "nickname", "password", "realname", "phone", "cccd"];
  const missing = required.filter((key) => !String(form.get(key) ?? "").trim());
  const front = form.get("cccdFront");
  const back = form.get("cccdBack");
  if (!(front instanceof File) || front.size === 0) missing.push("cccdFront");
  if (!(back instanceof File) || back.size === 0) missing.push("cccdBack");

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Thiếu thông tin bắt buộc: " + missing.join(", ") },
      { status: 400 }
    );
  }

  // Đến đây `missing` rỗng nghĩa là front/back đã qua kiểm tra `instanceof
  // File` ở trên — nhưng TypeScript không tự suy luận lại điều đó (biến
  // được kiểm tra trong 1 nhánh if riêng, không phải type guard trực tiếp
  // cho phần code này) nên cần khẳng định lại tường minh.
  if (!(front instanceof File) || !(back instanceof File)) {
    return NextResponse.json({ error: "Thiếu ảnh CCCD." }, { status: 400 });
  }

  // Khai báo biến thật từ form data — bản trước chỉ kiểm tra sự tồn tại
  // qua `required.filter(...)`, chưa gán vào biến nào để dùng bên dưới.
  const email = String(form.get("email"));
  const username = String(form.get("username"));
  const nickname = String(form.get("nickname"));
  const password = String(form.get("password"));
  const realname = String(form.get("realname"));
  const phone = String(form.get("phone"));
  const cccd = String(form.get("cccd"));

  if (!/^\d{12}$/.test(cccd)) {
    return NextResponse.json(
      { error: "Số căn cước công dân phải gồm đúng 12 chữ số." },
      { status: 400 }
    );
  }

  const isIdentityMatch = await verifyCccdAgainstImages(cccd, front, back);
  if (!isIdentityMatch) {
    return NextResponse.json(
      { error: "Không thể xác thực số CCCD từ ảnh tải lên. Vui lòng kiểm tra lại hình ảnh hoặc nhập đúng số." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;

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
      emailRedirectTo: `${origin}/api/auth/confirm?next=${encodeURIComponent("/")}&flow=signup`,
    },
  });
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Đăng ký thất bại." },
      { status: 400 }
    );
  }

  // Upload ảnh CCCD vào bucket riêng tư — KHÔNG dùng bucket công khai.
  // Dùng service role từ đây trở xuống: nếu project bật "Confirm email"
  // (mặc định của Supabase), tài khoản vừa signUp() CHƯA có session thật
  // — các lệnh ghi dùng client thường (createClient()) sẽ bị RLS chặn vì
  // auth.uid() = null lúc này. Mọi ghi bên dưới đều nhắm đúng
  // authData.user.id (giá trị Supabase Auth vừa sinh ra, không phải do
  // client tự gửi lên) nên an toàn để bỏ qua RLS ở đúng phạm vi hẹp này.
  // Xem comment đầy đủ trong src/lib/supabase/server.ts.
  const admin = createServiceRoleClient();

  const frontPath = `${authData.user.id}/front-${Date.now()}.jpg`;
  const backPath = `${authData.user.id}/back-${Date.now()}.jpg`;

  const { error: frontUploadError } = await admin.storage
    .from("identity-documents")
    .upload(frontPath, front);
  if (frontUploadError) {
    console.error("[register] upload cccdFront failed:", frontUploadError);
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
    return NextResponse.json(
      { error: `Tải ảnh mặt sau thất bại: ${backUploadError.message}` },
      { status: 500 }
    );
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    username,
    nickname,
    real_name: realname,
    phone,
  });
  if (profileError) {
    console.error("[register] insert profiles failed:", profileError);
    return NextResponse.json(
      { error: `Tạo hồ sơ thất bại: ${profileError.message}` },
      { status: 500 }
    );
  }

  const { error: verificationError } = await admin.from("identity_verifications").insert({
    user_id: authData.user.id,
    cccd_number: cccd,
    cccd_front_path: frontPath,
    cccd_back_path: backPath,
  });
  if (verificationError) {
    console.error("[register] insert identity_verifications failed:", verificationError);
    return NextResponse.json(
      { error: `Lưu thông tin xác minh thất bại: ${verificationError.message}` },
      { status: 500 }
    );
  }

  // KHÔNG đăng nhập ở đây — tài khoản đã tạo đủ (auth.users + profiles +
  // identity_verifications) nhưng email chưa xác nhận. Cố tình không set
  // vinh_session để tránh cho vào app trước khi họ bấm link trong mail.
  // /api/auth/confirm mới là nơi thật sự đăng nhập, sau khi
  // exchangeCodeForSession() xác nhận link hợp lệ — xem route đó.
  return NextResponse.json({ pendingConfirmation: true });
}