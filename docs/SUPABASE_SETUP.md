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

## 5. Ảnh CCCD — lưu ý bắt buộc

- Bucket `identity-documents` đã được tạo **private** trong schema — không
  đổi thành public.
- Chỉ tạo signed URL (`supabase.storage.from(...).createSignedUrl(path, 60)`)
  khi admin thực sự cần xem để đối chiếu tranh chấp bản quyền, thời hạn
  ngắn (schema gợi ý 60 giây), không bao giờ trả path/URL thẳng cho client
  ở luồng bình thường.
- Cần có chính sách xoá dữ liệu theo thời hạn (xem comment trong
  `schema.sql`, mục "Data-retention note") để tuân thủ Nghị định
  13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
