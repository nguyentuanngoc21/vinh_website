# Sự kiện cộng đồng

## Phạm vi

- `/su-kien`: sự kiện công khai, banner tiêu biểu và thẻ tên/thời gian/địa điểm/giá vé.
- `/su-kien/[eventId]`: banner, người tổ chức, thời gian, tổng quan, đường đi Google Maps,
  cột vé/game sticky trên desktop. Không có mục Good to know.
- `/su-kien/quan-ly`, `/su-kien/tao-moi`: đăng nhập để tạo, sửa, lưu nháp và xuất bản.
  Bấm **Lưu nháp** trên sự kiện đã công khai để ngừng công bố.
- `/admin/su-kien`: xem cả bản nháp, ẩn/hiện sự kiện và gắn game đã đăng ký trong code.
- Giá vé là thông tin VNĐ. Liên kết đăng ký HTTPS là tuỳ chọn; chưa có checkout, thu tiền,
  phát hành vé, giới hạn chỗ hay đăng ký tham dự trực tiếp trên Vịnh.

## Triển khai

1. Chạy `migrations/20261015_community_events.sql` trên dev/staging.
2. Chạy `docs/supabase/tests/20261015_community_events.test.sql` trên staging có tài khoản thử.
   Test rollback dữ liệu, kiểm RLS: chỉ thấy published + không hidden, browser không ghi trực tiếp.
3. Test hai tài khoản: A tạo nháp, B không xem/sửa được; khách không thấy nháp.
   A xuất bản → khách thấy; A chuyển nháp → khách không thấy. Kiểm tra admin ẩn → A không tự hiện lại.
4. Test ảnh JPG/PNG/WebP dưới 10 MB, ảnh vượt giới hạn và đường dẫn thuộc người khác.
   File đi trực tiếp tới Storage bằng signed token, không đi qua Vercel.
5. Test banner, thẻ, địa chỉ Google Maps, các phương tiện, múi giờ, sidebar khi cuộn;
   kiểm tra ở màn hình nhỏ. Không tạo dữ liệu mẫu trên production.
6. Sau khi staging đạt, chạy migration trên production rồi deploy code cùng thay đổi types.
   Global Storage file size limit cần >= 10 MiB; cấu hình audio 50 MiB hiện tại đã đủ.

Baseline `17_community_events.sql` dành cho project mới; schema tổng hợp được sinh bằng
`npm run build-schema`. Database mới: `community_events` và bucket `event-banners`.
Ảnh trong bucket là public; ảnh của bản nháp cũng có URL public nếu biết đường dẫn.
Các upload bị bỏ dở có thể để lại ảnh chưa dùng; chưa có tác vụ dọn riêng cho bucket này.

## Chọn sự kiện tiêu biểu

Đặt UUID sự kiện vào `FEATURED_EVENT_SLUG` trong `src/lib/events/catalog.ts` rồi deploy.
UUID được dùng làm segment URL. Chỉ sự kiện published và không hidden mới được hiện.
Không tự chọn sự kiện đầu tiên khi chưa có lựa chọn biên tập.

## Gắn game sau này

1. Thêm metadata (id, title, description) vào `src/lib/events/game-definitions.ts`.
2. Thêm component vào `src/components/events/games/registry.tsx` (dùng `next/dynamic`
   nếu game lớn). Component nhận `{ eventId, onClose }`; game tự quản lý phần chơi.
3. Admin chọn game trong `/admin/su-kien`. Người tạo không thể chèn script/iframe/URL game.
4. Click game mở native dialog rộng 80vw, cao 80dvh, backdrop tối/mờ; khoá cuộn nền,
   focus được giữ trong dialog, đóng bằng Escape/nút X/click nền và trả focus về nút mở.
5. Test game riêng: mở/đóng, bàn phím, kích thước nhỏ, reset và cleanup khi unmount.

Chưa tích hợp code game hay bảng điểm/phần thưởng; registry hiện trống theo yêu cầu.
