import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/session";
import type { Session } from "@/lib/auth";
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

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
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

  // role mặc định 'user' (xem schema.sql phần 1) — không set ở đây, để
  // Postgres tự áp default, tránh 1 user tự gửi role khác qua request.
  const session: Session = { email, name: realname, handle: username, role: "user" };
  return setSessionCookie(NextResponse.json(session), session, true);
}