# Kết nối Supabase

Trạng thái hiện tại: các file trong `src/lib/supabase/` đã sẵn sàng
(`client.ts`, `server.ts`, `types.ts`), schema ở `docs/supabase/schema.sql`,
nhưng **chưa được nối vào** `/api/auth/login` và `/api/auth/register` —
hai route đó vẫn trả 501 như trước. Đây là phần còn lại để nối dây thật.

## 1. Tạo project & lấy khoá

1. Tạo project tại [supabase.com](https://supabase.com/dashboard).
2. Vào **Project Settings → API**, copy `Project URL` và
   `anon` / `publishable` key vào `.env.local` (xem `.env.example`).
3. Vào **SQL Editor**, dán toàn bộ nội dung `docs/supabase/schema.sql` và
   chạy. Việc này tạo bảng `profiles`, `identity_verifications`, `books`,
   `chapters`, 2 storage bucket (`identity-documents` — riêng tư,
   `book-covers` — công khai), và toàn bộ RLS policy.
4. Vào **Authentication → Providers**, bật Email (mặc định đã bật).

## 2. Nối `/api/auth/register`

Thay phần `TODO` trong `src/app/api/auth/register/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

// sau khi đã validate xong các field ở trên...
const supabase = await createClient();

const { data: authData, error: authError } = await supabase.auth.signUp({
  email,
  password,
});
if (authError || !authData.user) {
  return NextResponse.json({ error: authError?.message ?? "Đăng ký thất bại." }, { status: 400 });
}

// upload ảnh CCCD vào bucket riêng tư — KHÔNG dùng bucket công khai
const frontPath = `${authData.user.id}/front-${Date.now()}.jpg`;
const backPath = `${authData.user.id}/back-${Date.now()}.jpg`;
await supabase.storage.from("identity-documents").upload(frontPath, front);
await supabase.storage.from("identity-documents").upload(backPath, back);

await supabase.from("profiles").insert({
  id: authData.user.id,
  username,
  nickname,
  real_name: realname,
  phone,
});
await supabase.from("identity_verifications").insert({
  user_id: authData.user.id,
  cccd_number: cccd,
  cccd_front_path: frontPath,
  cccd_back_path: backPath,
});

const session: Session = { email, name: realname, handle: username, role: "reader" };
return setSessionCookie(NextResponse.json(session), session, true);
```

## 3. Nối `/api/auth/login`

```ts
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data.user) {
  return NextResponse.json({ error: "Sai email hoặc mật khẩu." }, { status: 401 });
}

const { data: profile } = await supabase
  .from("profiles")
  .select("username, nickname, role")
  .eq("id", data.user.id)
  .single();

const session: Session = {
  email: data.user.email!,
  name: profile?.nickname ?? "",
  handle: profile?.username ?? "",
  role: profile?.role ?? "reader",
};
return setSessionCookie(NextResponse.json(session), session, remember);
```

## 4. Hai lớp session cùng tồn tại — bình thường, không phải bug

Sau bước 2–3, có **hai cookie** cùng chạy song song:

- Cookie Supabase (`sb-*`) — do `@supabase/ssr` tự quản lý, dùng khi bạn
  gọi trực tiếp `supabase.auth.getUser()` ở Server Component hoặc RLS.
- Cookie `vinh_session` (`src/lib/session.ts`) — cookie tự ký hiện tại,
  dùng cho `proxy.ts` và `requireAdmin()`.

Đây là lựa chọn có chủ đích để không phải viết lại toàn bộ `proxy.ts` và
`role.tsx` cùng lúc với việc nối Supabase. Khi đã ổn định, có thể gộp về
một nguồn duy nhất — sửa `proxy.ts` để đọc trực tiếp session Supabase:

```ts
// src/proxy.ts, thay decodeSession(...) bằng:
import { createServerClient } from "@supabase/ssr";
// ... tạo client trong proxy với request/response cookies (xem hướng dẫn
// "Setting up Server-Side Auth for Next.js" trên supabase.com/docs), rồi:
const { data: { user } } = await supabase.auth.getUser();
// đọc role từ user.app_metadata.role (đồng bộ qua trigger) thay vì bảng profiles
// để tránh 1 query DB thêm trên mỗi request.
```

Không bắt buộc làm ngay — hệ thống cookie tự ký hiện tại vẫn an toàn và
độc lập, gộp lại chỉ để giảm phức tạp về lâu dài.

## 5. Quên mật khẩu / đặt lại mật khẩu

Luồng đã code sẵn (3 route + 2 trang), nhưng **cần cấu hình 1 chỗ trên
Supabase Dashboard trước khi chạy được**, nếu không `resetPasswordForEmail`
sẽ âm thầm rớt `redirectTo` về Site URL mặc định:

1. Vào **Authentication → URL Configuration → Redirect URLs**, thêm:
   - `http://localhost:3000/api/auth/confirm` (dev)
   - `https://<domain-thật>/api/auth/confirm` (production)

   (Vẫn cần khai báo dù giờ không còn email nào trỏ tới `/api/auth/confirm`
   nữa — xem lý do bên dưới — vì Supabase vẫn kiểm tra `redirectTo`/
   `emailRedirectTo` mà `signUp()`/`resetPasswordForEmail()` gửi lên có nằm
   trong danh sách này hay không, dù `{{ .ConfirmationURL }}` không được
   hiển thị trong template.)
2. Dán template ở [`docs/supabase/email-templates/`](./supabase/email-templates/README.md)
   vào Dashboard (bắt buộc, không phải tuỳ chọn) — template mặc định của
   Supabase chỉ có nút bấm/link, không có `{{ .Token }}`, nên nếu không dán
   lại thì người dùng không có cách nào nhập mã.

**Chỉ dùng mã OTP, không dùng link** — bản trước từng có cả nút bấm
(link PKCE) song song với mã, nhưng đã bỏ nút đó khỏi email: link PKCE chỉ
đổi được session nếu mở ĐÚNG browser đã gửi request `resetPasswordForEmail`/
`signUp` (cần cookie `code_verifier` của browser đó). Trên mobile, bấm link
từ app Gmail/Outlook thường mở sang browser khác của máy → luôn báo "hết hạn
hoặc không hợp lệ" dù mail vừa gửi (đây gần như luôn là nguyên nhân thật của
lỗi 400 ở `POST /auth/v1/token?grant_type=pkce` trong Supabase Auth Logs, chứ
không phải mã thật sự hết hạn) — có cả 2 lựa chọn trong 1 email mà 1 luôn
lỗi gây nhầm lẫn hơn là giúp. Độ dài mã do setting **OTP Length** của
project quyết định (Supabase Dashboard → Authentication → Sign In /
Providers → mở provider **Email**) — không hardcode đúng 1 số cụ thể ở FE,
vì setting này đổi được bất cứ lúc nào mà code không biết trước (xem
comment trong register-form.tsx/forgot-password-form.tsx). Luồng hoạt động
(xem comment trong từng file để biết lý do từng bước):

```
/dang-ky (submit form → màn "Cần bạn xác thực tài khoản" hiện ra ngay,
          có sẵn ô nhập mã — không cần rời trang)
  → nhập mã → POST /api/auth/verify-otp {email, token, type:"signup"}
  → supabase.auth.verifyOtp() → set cookie vinh_session → đăng nhập luôn
/quen-mat-khau (submit email → màn "Kiểm tra email của bạn", có sẵn ô nhập mã)
  → nhập mã → POST /api/auth/verify-otp {email, token, type:"recovery"}
  → supabase.auth.verifyOtp() → set cookie sb-* → redirect /dat-lai-mat-khau
/dat-lai-mat-khau (form mật khẩu mới)
  → POST /api/auth/reset-password → supabase.auth.updateUser({ password })
  → set lại cookie vinh_session → đăng nhập luôn, redirect về "/"
"Gửi lại mã" → POST /api/auth/resend-otp → supabase.auth.resend() (signup)
  hoặc resetPasswordForEmail() lại (recovery, không có resend() cho type này)
```

`/api/auth/confirm` (route đổi PKCE code cũ) vẫn còn trong code nhưng không
còn email nào trỏ tới nó — giữ lại không hại gì, xoá sau nếu muốn dọn dẹp.

Route `/api/auth/forgot-password` luôn trả về cùng một thông báo thành công
chung chung dù email có tồn tại hay không (giống hành vi mặc định của
`resetPasswordForEmail`) — tránh lộ thông tin email nào đã đăng ký.

## 6. Ảnh CCCD — lưu ý bắt buộc

- Bucket `identity-documents` đã được tạo **private** trong schema — không
  đổi thành public.
- Chỉ tạo signed URL (`supabase.storage.from(...).createSignedUrl(path, 60)`)
  khi admin thực sự cần xem để đối chiếu tranh chấp bản quyền, thời hạn
  ngắn (schema gợi ý 60 giây), không bao giờ trả path/URL thẳng cho client
  ở luồng bình thường.
- Cần có chính sách xoá dữ liệu theo thời hạn (xem comment trong
  `schema.sql`, mục "Data-retention note") để tuân thủ Nghị định
  13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
