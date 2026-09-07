// One-off/idempotent: tạo tài khoản hệ thống "Vịnh" — gửi tin nhắn hệ
// thống (lớp B trong đặc tả gỡ chương) thay mặt nền tảng khi admin gỡ 1
// chương. Hội thoại (direct_messages) KHÔNG có khái niệm sender null/ẩn
// danh — sender_id/recipient_id bắt buộc là 1 hàng thật trong auth.users
// + profiles (route GET/POST /api/messages/:userId resolve counterparty
// qua view author_public_profiles, 404 nếu không tìm thấy) — nên phải có
// 1 tài khoản THẬT, đánh dấu bằng profiles.is_system = true để UI
// (chat-tab.tsx) hiện khác biệt (logo Vịnh thay vì chữ cái đầu tên).
//
// Chạy SAU migrations/20260908_add_chapter_moderation_and_notifications.sql
// (cần cột profiles.is_system đã tồn tại). Idempotent — chạy lại nhiều
// lần chỉ in ra "đã tồn tại", không tạo trùng (unique index
// profiles_single_system_idx chặn > 1 hàng is_system=true ở tầng DB, but
// script tự kiểm trước để không gọi auth.admin.createUser() thừa).
//
//   node --env-file=.env.local scripts/create-system-account.mjs
//
// Cần SUPABASE_SERVICE_ROLE_KEY trong .env.local (không phải publishable
// key — auth.admin.createUser() chỉ gọi được bằng service role).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY — chạy bằng:\n" +
      "  node --env-file=.env.local scripts/create-system-account.mjs"
  );
  process.exit(1);
}

const SYSTEM_EMAIL = "he-thong@vinh.internal";
const SYSTEM_USERNAME = "vinh";
const SYSTEM_NICKNAME = "Vịnh";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const { data: existing, error: existingError } = await supabase
  .from("profiles")
  .select("id, username, nickname")
  .eq("is_system", true)
  .maybeSingle();
if (existingError) {
  console.error("Kiểm tra tài khoản hệ thống thất bại:", existingError.message);
  process.exit(1);
}
if (existing) {
  console.log(`Đã có tài khoản hệ thống rồi — id=${existing.id}, username=${existing.username}. Không tạo lại.`);
  process.exit(0);
}

const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email: SYSTEM_EMAIL,
  password: crypto.randomUUID(), // không ai cần đăng nhập bằng tài khoản này
  email_confirm: true,
});
if (authError || !authData.user) {
  console.error("Tạo auth.users cho tài khoản hệ thống thất bại:", authError?.message);
  process.exit(1);
}

const { error: profileError } = await supabase.from("profiles").insert({
  id: authData.user.id,
  username: SYSTEM_USERNAME,
  nickname: SYSTEM_NICKNAME,
  is_system: true,
});
if (profileError) {
  console.error("Tạo profiles cho tài khoản hệ thống thất bại:", profileError.message);
  console.error(
    `Lưu ý: đã tạo auth.users id=${authData.user.id} nhưng insert profiles lỗi — xoá hàng auth.users này thủ công (Supabase Dashboard > Authentication) rồi chạy lại script.`
  );
  process.exit(1);
}

console.log(`Đã tạo tài khoản hệ thống "Vịnh" — id=${authData.user.id}.`);
