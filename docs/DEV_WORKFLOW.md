# Quy trình phát triển (dev → commit → production)

Đây là quy trình chuẩn cho mọi thay đổi trong repo này — coi như bản CI/CD thủ công (chưa có pipeline tự động, cả team tự làm từng bước). Mục tiêu: không commit thiếu, không đẩy schema lên production mà chưa test RLS, không để lộ dữ liệu qua GRANT/RLS hở.

Có 2 luồng, tuỳ thay đổi có đụng tới schema Supabase hay không.

---

## Luồng A — Có đổi schema Supabase (thêm bảng/cột/policy/function)

```
1. Code + migration
        ↓
2. Test ở dev/staging  (KHÔNG test trên production)
        ↓
3. git status → add → commit
        ↓
4. Chạy migration lên production
```

### 1. Code + migration

- Viết 1 file `.sql` mới trong `migrations/`, đặt tên theo ngày (`YYYYMMDD_mo_ta_ngan.sql`). Migration phải **idempotent** — dùng `IF EXISTS` / `IF NOT EXISTS` / `DROP ... IF EXISTS` rồi `CREATE` lại — để lỡ chạy 2 lần không lỗi.
- Cập nhật **cùng lúc**:
  - [docs/supabase/schema.sql](supabase/schema.sql) — thêm đúng đoạn SQL tương ứng, **đúng vị trí theo thứ tự phụ thuộc** (một cột/bảng phải được tạo trước khi có policy/GRANT nào tham chiếu tới nó — đặt sai chỗ sẽ khiến người chạy `schema.sql` từ đầu trên 1 project mới bị lỗi "column/table does not exist").
  - [src/lib/supabase/types.ts](../src/lib/supabase/types.ts) — thêm type/field tương ứng để code TypeScript có autocomplete/type-check đúng.
- Cuối file migration, ghi rõ phần "Notes" liệt kê chính xác cần cập nhật gì ở 2 file trên + file code nào khác (route API, component) — để không quên bước nào.

### 2. Test ở dev/staging

**Không bao giờ chạy migration chưa test thẳng lên production.**

1. Chạy file migration trong SQL Editor của project **dev/staging**.
2. Test RLS — không cần user/data thật, tự tạo rồi tự dọn trong 1 transaction:
   - Tạo user giả bằng cách `insert` thẳng vào `auth.users` (không cần signup thật — không login, chỉ cần thoả FK).
   - Giả lập danh tính bằng `perform set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true);` rồi `execute 'set local role authenticated';` (hoặc `anon`).
   - Bọc mỗi test case trong `begin ... exception when others then ... end;` (nested block) để 1 câu lỗi không làm dừng cả script — Supabase SQL Editor gửi cả đoạn dán như 1 batch, lỗi 1 câu là dừng luôn phần còn lại nếu không tự bắt lỗi.
   - Ghi kết quả PASS/FAIL vào 1 bảng tạm (`create temporary table ...`), `select` ra ở cuối để xem 1 bảng tổng hợp.
   - Kết thúc bằng `rollback;` — không để lại dữ liệu test nào, chạy lại bao nhiêu lần cũng an toàn.
   - **Nhớ xoá `request.jwt.claims`** (`set_config('request.jwt.claims', '{}', true)`) trước khi đổi sang `anon` nếu trước đó vừa đóng vai 1 user khác — nếu không, `auth.uid()` vẫn mang danh tính cũ dù role đã đổi, cho kết quả test sai (đã gặp đúng lỗi này).
   - Nếu Supabase báo "This query creates a table without enabling RLS" cho bảng **tạm** dùng để in kết quả test — chọn "Run without RLS", vì bảng tạm không bao giờ lộ qua REST API (PostgREST không thấy bảng tạm của phiên khác).
3. Test qua route API / UI thật (không chỉ test DB thuần) — gọi thử `curl` hoặc thao tác trên web xem luồng thật chạy đúng không.
4. Rà lại 1 lần: RLS chỉ chặn được **theo hàng** (ai được đụng), **không chặn được theo cột** (đụng được gì trên hàng đó). Nếu có cột nhạy cảm (điểm số, số dư, lượt xem...) mà không giới hạn qua `GRANT UPDATE (cột...)` cấp cột hoặc bắt đi qua 1 RPC riêng, bất kỳ ai đăng nhập cũng PATCH thẳng được qua REST API của Supabase (anon key vốn công khai trong bundle JS + JWT phiên của chính họ) — không cần vào Supabase dashboard, không cần đặc quyền gì.

### 3. `git status` → `add` → `commit`

- `git status` trước — nếu file đã `git add` trước đó rồi mới sửa tiếp (`MM`/`AM`/`AD` ở cột đầu), staged đang là **bản cũ**. Commit lúc này sẽ đưa bản cũ lên, không phải bản mới nhất.
- `git add` lại đúng các file đã đổi (kể cả file bị xoá).
- `git commit`.

### 4. Chạy migration lên production

- Chỉ sau khi bước 2 đã PASS hết.
- Chạy đúng **thứ tự ngày** trong tên file — nếu nhiều file cùng ngày, kiểm tra file nào phụ thuộc cột/bảng của file khác (đọc phần đầu mỗi file) để chạy đúng thứ tự.
- Nếu Supabase báo "Potential issue detected — destructive operation" (thường do có `DROP POLICY`/`DROP CONSTRAINT` trong migration, kể cả khi có `IF EXISTS` và tạo lại ngay sau) — đọc kỹ nội dung file trước khi bấm Run, không phải cứ thấy cảnh báo là dừng.
- Nếu migration có `UPDATE`/xoá dữ liệu cũ không hợp lệ (ví dụ đổi danh sách genre) — kiểm tra trước xem production đã có dữ liệu thật bị ảnh hưởng chưa.

---

## Luồng B — Chỉ đổi code, không đụng schema

```
1. Code
   ↓
2. Test (build / route / UI)
   ↓
3. git status → add → commit → push
```

Bỏ hẳn phần migration/RLS ở Luồng A. Vẫn giữ nguyên tắc: `git status` trước khi `add`, không commit khi chưa chắc file đã stage đúng bản mới nhất.

---

## Nguyên tắc chung

- **Không tự commit/push nếu không được yêu cầu** — chỉ chuẩn bị thay đổi, để người review quyết định thời điểm commit.
- **Không chạy gì trực tiếp lên production** nếu chưa test ở dev/staging trước — kể cả khi trông có vẻ an toàn/idempotent.
- **Mỗi migration là 1 nguồn sự thật duy nhất về "cần cập nhật gì thêm"** — ghi rõ trong phần Notes cuối file, tránh phải nhớ ngoài đầu.
- **RLS bảo vệ theo hàng, GRANT cấp cột bảo vệ theo cột** — 2 cơ chế độc lập, thiếu 1 trong 2 là còn hở.
