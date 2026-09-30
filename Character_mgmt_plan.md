# Kế hoạch quản lý nhân vật

Cập nhật: 30/09/2026. Phạm vi: web tác giả, độc giả, API dùng chung với mobile và database.

Trạng thái: **đã deploy production ngày 30/09/2026** (commit `10e96aa`), cả hai migration đã áp dụng trên production.

## 1. Bảo toàn dữ liệu và quyền truy cập

- [x] Thay xoá/chèn rời rạc bằng RPC transaction; khoá chương và phát hiện danh sách cũ khi lưu đồng thời.
- [x] Chặn liên kết nhân vật khác truyện tại database; không cho client ghi trực tiếp liên kết/bình chọn/theo dõi ngoài luồng được kiểm tra.
- [x] Kiểm tra đầu vào đầy đủ; không âm thầm bỏ ID sai hoặc cắt tên/mẫu hình.
- [x] Lưu trữ/khôi phục thay xoá vĩnh viễn; giữ liên kết chương, follow, vote và lịch sử điểm.

## 2. Kiểm soát công khai

- [x] Nhân vật mới mặc định riêng tư; giữ trạng thái công khai của dữ liệu cũ khi nâng cấp.
- [x] Cho tác giả công khai/ẩn nhân vật và ẩn chính/phản diện.
- [x] Dữ liệu độc giả lấy từ projection công khai; không trả ghi chú riêng hoặc vai trò đã ẩn qua API/database.
- [x] Theo dõi/bình chọn chỉ nhận nhân vật đang công khai, chưa lưu trữ; lỗi theo dõi có thông báo và liên kết đăng nhập.

## 3. Công cụ cho tác giả

- [x] Hồ sơ: biệt danh, ảnh qua URL HTTPS, mô tả công khai, ghi chú riêng.
- [x] Vai trò cốt truyện riêng: chính/phụ/khách mời, độc lập chính diện/phản diện/trung lập.
- [x] Tìm kiếm, lọc, sắp xếp và cảnh báo trùng tên.
- [x] Xem số chương, chương đầu/cuối và liên kết chương có nhân vật.
- [x] Tạo nhanh ngay trong trình soạn chương.
- [x] Nhãn form, giới hạn ký tự, trạng thái lưu, cảnh báo bỏ thay đổi và khoá thao tác xung đột.

## 4. Kiểm chứng và triển khai

- [x] Cập nhật migration idempotent, baseline, schema tổng hợp, TypeScript và mobile API adapter.
- [x] Unit test validation và API lưu danh sách; SQL regression cho RLS, transaction, lưu trữ, projection.
- [x] Typecheck, lint, test và production build.
- [x] PostgreSQL biệt lập: áp dụng migration hai lần, giữ trạng thái dữ liệu cũ; chạy SQL regression.
- [x] Trình duyệt với API giả: thêm/sửa, cảnh báo trùng tên, tìm kiếm, lưu trữ/khôi phục, chương xuất hiện, tạo nhanh, xử lý 409, follow 401, ẩn vai trò và layout 390px.
- [x] Áp dụng migration + chạy SQL regression; kiểm tra trên bản Preview.

## 5. Bổ sung sau phản hồi

- [x] Nhân vật đã lưu trữ dễ tìm lại: nút "Xem N nhân vật đã lưu trữ", số lượng trong bộ lọc.
- [x] Xoá vĩnh viễn trong 15 phút sau khi tạo (`delete_recent_character`, migration `20260930_character_delete_recent.sql`); từ chối khi đã có độc giả theo dõi/bình chọn; `created_at` do trigger khoá.
- [x] Upload ảnh đại diện: cắt tròn 1:1 (dùng chung `ImageCropModal`), nén, tải lên bucket `avatars` qua signed URL; vẫn giữ ô nhập URL.

## Quyết định thiết kế

- Lưu trữ không xoá lịch sử. Khôi phục giữ nguyên lựa chọn công khai trước đó.
- Ghi chú riêng nằm trong bảng chỉ tác giả đọc; độc giả dùng view chỉ chứa trường được công khai.
- Phiên bản mobile cũ vẫn được thay danh sách một cách nguyên tử; client gửi `expectedCharacterIds` được kiểm tra xung đột và nhận 409 khi dữ liệu đã đổi.
- Mobile trong repo đã gửi `expectedCharacterIds`, tải trạng thái mới khi có 409; hỗ trợ công khai/ẩn vai trò và lưu trữ/khôi phục. Các trường hồ sơ mở rộng và tìm kiếm/chương xuất hiện hiện có trên web; API mobile đã nhận được các trường mới.
- Client cũ không gửi danh sách kỳ vọng vẫn theo quy tắc lần lưu sau cùng thắng. Đã stress test nhiều kết nối đồng thời trên PostgreSQL thật (xem Kết quả kiểm tra).
- Ảnh ở phiên bản này nhập URL HTTPS; tải ảnh lên kho lưu trữ là phần mở rộng sau.
- Không tự chạy migration trên production. Ghi rõ các kiểm tra chưa chạy, không đánh dấu hoàn thành thay cho kết quả thực tế.

## Các file chính

- Migration nâng cấp: `migrations/20260930_character_management.sql`.
- Baseline: `migrations/baseline/02_books_and_chapters.sql`; schema tổng hợp: `docs/supabase/schema.sql`.
- RPC: `set_chapter_characters(chapter_id, character_ids, expected_character_ids)`; giữ dữ liệu cũ khi bất kỳ bước nào lỗi.
- View độc giả: `public_characters`; bảng `characters` chỉ cho tác giả đọc qua RLS. View không chứa `private_notes`; trả `role = null` nếu tác giả ẩn phân loại.
- Validation dùng chung: `src/lib/characters.ts`.
- Giao diện: `src/components/author/character-manager.tsx`, `character-form.tsx`, `chapter-characters-panel.tsx`.
- SQL regression: `docs/supabase/tests/20260930_character_management.test.sql` (tự rollback dữ liệu thử).
- Kiểm thử PostgreSQL biệt lập: `scripts/test-character-migration.mjs`.
- Kiểm thử trình duyệt: `scripts/test-character-ui.mjs`.

## Kết quả kiểm tra

- Web Vitest: **233/233 pass**, gồm 10 test mới cho validation/API lưu nhân vật.
- Mobile authoring: **14/14 pass** (`node mobile-vinh/scripts/test-authoring.cjs`). Test harness được bổ sung validator dùng chung và dependency còn thiếu của route chương.
- TypeScript web/mobile và ESLint web/mobile: pass.
- Production build: pass. Có cảnh báo fetch Supabase thất bại ở trang rankings/audio do giới hạn mạng của môi trường kiểm tra; không phải xác nhận dữ liệu các trang đó hoạt động trên production.
- PostgreSQL qua PGlite: migration chạy hai lần không lỗi; các assertion về rollback khi chèn lỗi, stale-write, quyền sở hữu, chặn ghi trực tiếp, ẩn dữ liệu, không liên kết khác truyện và bảo toàn lịch sử đều pass.
- Stress test đồng thời (`scripts/test-character-concurrency.mjs`, PostgreSQL 18.4 embedded, 80 kết nối): cùng snapshot → đúng 1 lần lưu thắng, còn lại 409; client cũ → mọi lần lưu thành công, kết quả cuối đúng bằng 1 danh sách đã gửi; 40 client đọc-sửa-ghi có retry → không mất cập nhật; 1.600 thao tác chéo 10 chương + đổi tên đồng thời → không deadlock/lỗi; lưu trữ vs gắn chương theo cả hai thứ tự → nhất quán; 60 lần ghi trái phép đồng thời → bị chặn. Chạy 3 lần liên tiếp đều pass.
- Browser smoke test dùng Microsoft Edge, component thật và API giả: pass; không tràn ngang ở 390px.
- Các kiểm tra cục bộ không thay thế việc chạy SQL regression trên schema đầy đủ ở dev/staging và kiểm tra với phiên đăng nhập thật.

## Cách chạy lại kiểm thử biệt lập

Không cần sửa dependency của ứng dụng. Từ thư mục gốc (Windows dùng `npm.cmd`):

```powershell
npm.cmd install --prefix .tmp/character-validation --no-save --package-lock=false @electric-sql/pglite playwright
node scripts/test-character-migration.mjs .tmp/character-validation/node_modules/@electric-sql/pglite/dist/index.js
npm.cmd run build
node scripts/test-character-ui.mjs .tmp/character-validation/node_modules/playwright/index.mjs
npm.cmd install --prefix .tmp/character-stress --no-save --package-lock=false embedded-postgres pg
node scripts/test-character-concurrency.mjs .tmp/character-stress/node_modules
```

Test trình duyệt dùng CSS của bản build gần nhất và Microsoft Edge đã cài trên máy. Thư mục `.tmp` là dữ liệu kiểm thử tạm, không commit.

## Checklist đưa lên môi trường thật

1. Áp dụng `20260930_character_management.sql` trên dev/staging trước.
2. Chạy `20260930_character_management.test.sql` với quyền postgres; kiểm tra không có exception và có thông báo PASS.
3. Kiểm tra bằng tài khoản tác giả/độc giả: riêng tư → công khai → ẩn vai trò → lưu trữ → khôi phục; mở hai tab để kiểm tra xung đột.
4. Triển khai migration và code trong cùng đợt. Code mới phụ thuộc các cột/view/RPC mới; code đọc cũ dùng trực tiếp bảng `characters` sẽ không còn thấy nhân vật của người khác sau khi thay RLS. Không chạy migration rồi để phiên bản server cũ hoạt động lâu.
5. Kiểm tra web và mobile sau khi triển khai. Nhân vật cũ giữ trạng thái công khai; nhân vật mới cần tác giả chủ động công khai.

## Nhật ký thực hiện

- Hoàn thành mã nguồn, migration, test và kiểm tra cục bộ.
- 30/09/2026: stress test 80 kết nối đồng thời trên PostgreSQL 18.4 thật: pass.
- 30/09/2026: `20260930_character_delete_recent.test.sql` trên database: ALL PASS.
- 30/09/2026: deploy production (`5cc3255`, `5701147`, `10e96aa`), đồng bộ `main`.
