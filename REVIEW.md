# Review & tối ưu code Vịnh — tổng hợp

## Trả lời 3 câu hỏi ban đầu

**1. "Có nên có file quy định style/luật chung không?"** — Có, và đã làm.
Trước khi sửa, project có **1172 mã màu hex hardcode** (175 màu khác
nhau) rải rác trên 6300 dòng code, không có file token/theme nào, không
có folder `ui/`/`shared/` nào. Một mình `register-form.tsx` có 85 mã hex.
Đã tạo:
- `src/app/globals.css` — bảng token `@theme` cho ~32 màu hệ thống
  (brand, neutral, status, chart), có comment giải thích lý do và cách
  đặt tên.
- `src/components/ui/` — `Field`, `Button`, `Alert`, `Checkbox` cho các
  pattern lặp lại nhiều nhất (input có label, nút submit, banner lỗi,
  checkbox tuỳ chỉnh).

**2. "Code đã chia route cho admin/người dùng chưa?"** — **Chưa, và đây là
lỗ hổng thật sự.** Không có `middleware.ts`/`proxy.ts` nào tồn tại trước
đó. `/admin` chỉ là một React layout bình thường — ai gõ đúng URL cũng
vào được, kể cả không đăng nhập, vì `isAdmin` chỉ là 1 biến React dùng để
ẩn/hiện UI trên trình duyệt, không chặn được request tới server. Đã vá
bằng cách thêm cookie httpOnly ký số + `src/proxy.ts` + `requireAdmin()`
(chi tiết ở mục "Bảo vệ route" bên dưới).

**3. "Tối ưu code giúp tôi"** — đã refactor `login-form.tsx`,
`register-form.tsx`, `admin-sidebar.tsx` theo bộ UI kit mới; còn 5 file
khác cần làm tương tự, xem `docs/MIGRATION_GUIDE.md`.

---

## 1. Hệ thống design token

**Trước:** `bg-[#143B4D]` (149 lần), `text-[#D9A441]` (70 lần)... lặp lại
tay khắp nơi. Đổi màu brand nghĩa là tìm-thay trên toàn bộ 85 file, dễ
sót.

**Sau:** `src/app/globals.css` khai báo `@theme` với các biến như
`--color-brand-ink: #143b4d`. Tailwind v4 tự sinh ra `bg-brand-ink`,
`text-brand-ink`, `border-brand-ink`, kể cả với opacity (`bg-brand-ink/40`)
— không cần cấu hình thêm.

Đã viết script (`color_map.json` + `tokenize_colors.py`, để lại trong repo
để bạn dùng nếu muốn mở rộng token) chạy tự động, thay **669 chỗ** trên
**60 file**, chỉ nhắm vào ~32 màu lặp lại có hệ thống (đếm ≥10 lần) —
**không đụng** vào ~140 mã hex còn lại vì phần lớn là màu trang trí có chủ
đích (ví dụ màu thẻ thể loại), tránh làm sai lệch thiết kế.

Đã build production để xác nhận không lỗi (`next build` pass hoàn toàn,
trừ lỗi fetch Google Fonts — do sandbox này chặn mạng ra ngoài, đã kiểm
chứng bằng cách tạm bỏ import font và build lại thành công 100%; máy bạn
có mạng bình thường sẽ không gặp lỗi này).

**Việc cần làm thêm:** 2 cặp màu gần giống nhau (`stone`/`stone-alt`, và
họ màu kem) có thể là lỗi gõ nhầm — cần người thiết kế xác nhận trước khi
gộp. Chi tiết ở `docs/MIGRATION_GUIDE.md`.

## 2. Bộ UI component dùng chung

`src/components/ui/`:
- `Field` — input + label + trạng thái đúng/sai, thay cho khối
  `rounded-[10px] border border-border-light px-[15px] py-3 ...` copy tay
  10+ lần.
- `Button` — 3 biến thể (primary/dark/ghost), có sẵn trạng thái disabled.
- `Alert` — banner lỗi/thành công/thông tin.
- `Checkbox` — ô chọn tuỳ chỉnh (dùng trong "đồng ý điều khoản", "ghi nhớ
  đăng nhập").

Đã áp dụng vào `login-form.tsx`, `register-form.tsx`. Còn 5 file cần làm
tương tự — hướng dẫn chi tiết + ví dụ code ở `docs/MIGRATION_GUIDE.md`.

`admin-sidebar.tsx` cũng được sửa: trước đây "active" bị hardcode cứng
trên mục đầu tiên và các mục còn lại là `<div>` không phải `<Link>` (bấm
không đi đâu cả). Giờ dùng `usePathname()` thật, mục nào chưa có route
thì hiện nhãn "Sắp có" thay vì giả vờ tương tác được.

## 3. Bảo vệ route theo role — thay đổi quan trọng nhất

### Vấn đề gốc
Session chỉ lưu ở `localStorage`/`sessionStorage` (`src/lib/role.tsx`).
Đây là cơ chế **chỉ phía trình duyệt** — server không có cách nào đọc
được để quyết định có cho vào `/admin` hay không trước khi render trang.

### Đã thêm
- **`src/lib/session.ts`** — cookie httpOnly ký bằng HMAC-SHA256 (Web
  Crypto API — chạy được cả Node.js lẫn Edge runtime, không cần thêm thư
  viện). Cookie này client-side JS không đọc/giả mạo được.
- **`src/proxy.ts`** — chặn `/admin/**`, `/author/**`, `/ca-nhan/**` ở
  tầng server, trước khi trang render. (Next.js 16 đổi tên quy ước
  `middleware.ts` → `proxy.ts`, API giữ nguyên — phát hiện qua cảnh báo
  build, đã xác minh trong tài liệu Next.js đóng gói kèm `node_modules`.)
- **`requireAdmin()`** trong `session.ts`, gọi từ `admin/layout.tsx` — lớp
  phòng thủ thứ hai, xác thực lại ngay trong Server Component. Đây là
  pattern chính thức Next.js khuyến nghị: proxy chỉ nên làm "optimistic
  check" (nhanh, không query DB), còn quyết định thật nên nằm ở nơi dữ
  liệu được truy cập.
- Route `/api/auth/logout` — xoá cookie phía server (trước đây `logout()`
  chỉ xoá localStorage, cookie server nếu có sẽ vẫn còn).

### Còn thiếu (do chưa có backend thật)
`/api/auth/login` và `/api/auth/register` hiện vẫn trả lỗi 501 (như thiết
kế ban đầu — "chưa nối DB"). Code set-cookie đã viết sẵn dưới dạng comment
ngay trong 2 file đó, chỉ cần bỏ comment sau khi nối Supabase (xem
`docs/SUPABASE_SETUP.md`, mục 2–3, có đoạn code đầy đủ để copy).

### Về "author"
Hiện `Role` chỉ có `"reader" | "admin"` (`src/lib/auth.ts`) — chưa có vai
trò "author" riêng. `proxy.ts` đang cho **bất kỳ ai đã đăng nhập** vào
`/author/**`. Nếu muốn giới hạn author thật sự (qua duyệt/xác minh), cần
thêm giá trị `"author"` vào `Role` và sửa điều kiện trong `proxy.ts`.

## 4. Lưu ý bảo mật/pháp lý về CCCD

Form đăng ký thu email, mật khẩu, tên thật, SĐT, và **ảnh CCCD 2 mặt** —
đây là dữ liệu cá nhân nhạy cảm theo Nghị định 13/2023/NĐ-CP. Schema
Supabase (`docs/supabase/schema.sql`) đã thiết kế theo hướng:
- Tách bảng `identity_verifications` riêng khỏi `profiles` — bảng
  `profiles` (được query rất thường xuyên cho mọi by-line, comment) không
  bao giờ có cột nhạy cảm.
- Bucket lưu ảnh CCCD là **private**, không public.
- RLS chỉ cho chủ tài khoản và admin xem.
- Có comment nhắc cần chính sách xoá dữ liệu theo thời hạn (RLS chỉ quyết
  định *ai* xem được, không tự động xoá dữ liệu cũ).

Đây là điểm cần bạn (hoặc người phụ trách pháp lý) xác nhận thời hạn lưu
trữ cụ thể trước khi launch thật.

## 5. Backend groundwork

- **Supabase**: `src/lib/supabase/{client,server,types}.ts` đã sẵn sàng,
  cài đặt package xong (`@supabase/ssr`, `@supabase/supabase-js`). Schema
  đầy đủ RLS ở `docs/supabase/schema.sql`. Hướng dẫn nối vào API routes ở
  `docs/SUPABASE_SETUP.md`.
- **Cloudflare**: `docs/DEPLOYMENT_CLOUDFLARE.md` — dùng
  `@opennextjs/cloudflare` + Workers (Cloudflare đã ngưng khuyến nghị
  Pages cho Next.js App Router từ cuối 2025). Gợi ý dùng R2 cho file audio
  (egress miễn phí, quan trọng vì phát lại nhiều lần), giữ Supabase
  Storage cho ảnh CCCD/bìa sách để tận dụng RLS có sẵn.

## 6. Việc nên làm tiếp theo (ưu tiên giảm dần)

1. Nối Supabase vào `/api/auth/login`, `/api/auth/register` thật
   (`docs/SUPABASE_SETUP.md`).
2. Refactor 5 file còn lại theo UI kit (`docs/MIGRATION_GUIDE.md`).
3. Quyết định retention policy cho ảnh CCCD, thêm scheduled job xoá.
4. Nếu cần author role riêng biệt: thêm vào `Role` type + `proxy.ts`.
5. Xây các trang admin còn thiếu (`Giao dịch`, `Nội dung`, `Người dùng`,
   `Bản quyền`, `Cài đặt` — hiện chỉ có `Tổng quan`), nối `href` thật vào
   `admin-sidebar.tsx`.
