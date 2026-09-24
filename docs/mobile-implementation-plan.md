# Kế hoạch triển khai app mobile Vịnh

Lập ngày 24/09/2026. Căn cứ: `mobile-vinh/README.md`, `docs/mobile-web-feature-audit.md`
và mã nguồn hiện tại. Cập nhật cột Trạng thái khi hoàn thành từng phase.

## Nguyên tắc chung

- Backend: mỗi tính năng có route `/api/mobile/*` dùng `getRequestContext`
  (`src/lib/mobile/request-context.ts`) và gọi lại service sẵn có trong `src/lib/*`.
  Không sao chép nghiệp vụ, giữ nguyên kiểm tra quyền của web.
- Kiểm thử: mỗi phase có `mobile-vinh/scripts/test-*.cjs` dùng DB giả, không ghi production.
- Kiểm tra: `npx tsc --noEmit` + `npm run lint` (web và mobile), `npm run build` (web),
  `npx expo export --platform all` (mobile).
- Cập nhật `mobile-vinh/README.md` và `docs/mobile-web-feature-audit.md` theo từng phase.
- Kết thúc mỗi phase: báo cáo → review → commit → sang phase sau.
- Thay đổi schema: migration theo `docs/DEV_WORKFLOW.md`, báo trước khi làm.

## Tổng quan

| Phase | Nội dung | Quy mô | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| 0 | Chuẩn bị: commit, định danh app, cập nhật audit | Nhỏ | — | Xong (24/09) |
| 1 | Sự kiện đọc hợp lệ | Nhỏ | 0 | Xong (24/09), chờ thử trên thiết bị |
| 2 | Tài khoản và hồ sơ | Vừa | 0 | Xong (24/09) |
| 3 | Nhiệm vụ, chuỗi, thành tựu | Vừa | 1 | Xong (24/09), chủ dự án xác nhận đồng bộ với web |
| 4 | Vòng đời đơn hàng | Lớn | 2b (thông tin hợp đồng) | Xong (24/09): 4a–4c; 4d chuyển sang Phase 5 |
| 5 | Kết nối, tin nhắn nâng cao, push | Vừa | — | Chưa làm |
| 6 | Tương tác đọc, khám phá, audio nâng cao | Vừa | 1 | Chưa làm |
| 7 | Thanh toán | Lớn | Quyết định của công ty | Chờ quyết định |
| 8 | Sáng tác | Lớn | 2 | Chưa làm |
| — | Sẵn sàng phát hành (song song) | Vừa | — | Chưa làm |

## Phase 0 — Chuẩn bị

- Commit phần mobile đang dở.
- Thêm `ios.bundleIdentifier` và `android.package` vào `mobile-vinh/app.json`.
- Cập nhật bảng trong `docs/mobile-web-feature-audit.md` cho khớp thực tế.

Tiêu chí hoàn thành:
- Git sạch; `expo export` thành công.
- File audit phản ánh đúng các tính năng đã có (tin nhắn, cam kết, dịch vụ).

## Phase 1 — Sự kiện đọc hợp lệ

- `POST /api/mobile/books/[bookId]/reading-progress`: xác minh Bearer, kiểm tra
  chương thuộc truyện, đã xuất bản và người dùng có quyền đọc; upsert `book_progress`;
  khi `completed` gọi `ReadingEventService.recordChapterCompletion`
  (service dùng chung: `src/lib/reading/record-progress.ts`).
- Mobile: `saveProgress` gọi API thay vì ghi thẳng Supabase; gửi `completed`
  một lần khi đoạn cuối chương hiện trên màn hình.

Tiêu chí hoàn thành:
- Đọc hết chương trên mobile cập nhật `reading_history`, chuỗi và nhiệm vụ như web.
- Chương khóa/không có quyền không ghi tiến độ hoặc sự kiện.
- Gửi lặp không cộng thưởng hai lần (chống lặp phía server của `ReadingEventService`).

## Phase 2 — Tài khoản và hồ sơ

- 2a: đăng ký (OTP), quên/đặt lại mật khẩu (OTP, theo `docs/SUPABASE_SETUP.md` §5),
  sửa tên/bio/avatar/ảnh bìa có nén ảnh.
- 2b: xác minh CCCD (bucket private, signed URL, OCR có timeout), ngân hàng,
  thông tin hợp đồng.
- Cần `expo-image-picker`, `expo-image-manipulator` → build lại development build.
- Đã chốt (24/09, đính chính): web thực tế để CCCD **tùy chọn** khi đăng ký; mobile giữ
  đúng quy tắc đó (bổ sung sau ở Hồ sơ). Câu hỏi ban đầu dựa trên giả định sai.

## Phase 3 — Nhiệm vụ, chuỗi, thành tựu

- Route mobile cho `quests/pool`, `claim`, `reset`, thành tựu.
- Màn Nhiệm vụ (danh sách, tiến độ, đổi, nhận thưởng), hiển thị chuỗi và mốc, màn Thành tựu.

## Phase 4 — Vòng đời đơn hàng

- 4a Xem: danh sách, chi tiết, dòng sự kiện, thẻ đơn hàng trong chat.
- 4b Luồng chính: brief, phạm vi, bản nháp, duyệt/yêu cầu sửa, giao sản phẩm,
  nghiệm thu, tệp gốc.
- 4c Nhánh phụ: hủy, mất liên lạc, tranh chấp, thỏa thuận tên tác giả.
- 4d Mẫu tự động từ đơn hoàn tất — **chuyển sang Phase 5** (24/09): web cũng chưa có
  (`fetchAutoSamples` không có nơi gọi, chưa rõ hiển thị gì); làm cùng trang dịch vụ công khai.
- Đặt cọc tạm khóa trên app cho tới Phase 7.

Quyết định 24/09/2026 (sau rà soát code đơn hàng):
- Sửa lỗi chèn filter ở `GET /api/orders?withUserId=` trong 4a (đã làm).
- Server cưỡng chế số tiền: lần trả đầu >= round(price × deposit_pct / 100), tổng đã trả
  không vượt price. Không bắt buộc trả đủ trước khi bàn giao. Migration
  `migrations/20260924_enforce_order_payment_amounts.sql`, test
  `docs/supabase/tests/20260924_order_payment_amounts.test.sql` — chạy dev/staging trước,
  kiểm tra đơn cũ lệch số tiền (câu truy vấn trong phần Notes) rồi mới lên production.
- Thanh toán đơn bằng xu trên mobile: tạm khóa, hướng dẫn thanh toán trên web.
- Xem đơn ở cả màn "Đơn hàng của tôi" và thẻ đơn trong Tin nhắn.
- Ghi nhận: route bàn giao cho phép 30 MB nhưng Vercel giới hạn body ~4,5 MB — tệp lớn sẽ
  lỗi trên cả web và mobile; cần chuyển sang signed upload URL (xử lý ở 4b).
- Web hiển thị giá đơn bằng "₫" trong khi thanh toán trừ xu; mobile hiển thị "xu".
- 4b: bàn giao file lớn qua signed upload (`deliver/upload-url` → tải thẳng lên Storage →
  `deliver { uploadPath }`); multipart cũ của web giữ nguyên. Route bàn giao nay từ chối
  trước khi lưu file nếu đơn không ở in_progress (trước đây lưu file thừa rồi RPC mới chặn).
- 4c: 8 route đơn hàng trả thẳng lỗi SQL tiếng Anh; nay qua `src/lib/orders/rpc-errors.ts`
  (dịch sang tiếng Việt, lỗi lạ dùng thông báo chung + log server). Test tự đọc mọi
  `raise exception` của các RPC liên quan để bắt lỗi mới chưa dịch.
- 4b phát hiện: web không tải lại yêu cầu tệp gốc/hủy đang chờ, bên nhận yêu cầu không có
  nút đồng ý. Mobile đọc qua `GET /api/orders/[id]/requests`; web đã sửa cùng cách
  (chủ dự án đồng ý 24/09).

## Phase 5 — Kết nối và tin nhắn nâng cao

- Danh bạ Kết nối, trang hồ sơ người khác.
- Mẫu tự động từ đơn hoàn tất / tác phẩm tự đứng tên (từ 4d) — cho cả web và mobile. Cần chốt
  trước: nội dung hiển thị (ảnh watermark, bản thu, tên truyện…) và quy tắc đồng ý của khách
  (cột `orders.is_private`).
- Realtime tin nhắn, phân trang tin cũ.
- Push (`expo-notifications`) + bảng push token (migration).
- Mở mọi loại liên kết thông báo trong app.

## Phase 6 — Tương tác đọc và khám phá

- Bình luận theo đoạn, highlight, bình chọn chương/trope, theo dõi tác giả/nhân vật,
  danh sách nhân vật.
- Tìm theo tác giả/nội dung, bảng xếp hạng (một số tab web còn là dữ liệu mẫu).
- Audio: lưu vị trí nghe, tự phát bản tiếp theo, ghi lượt phát.

## Phase 7 — Thanh toán (cần quyết định)

- Mua chương bằng xu sẵn có: tương đối độc lập, có thể làm sớm hơn.
- Nạp/rút xu: chờ rà soát chính sách IAP App Store/Google Play, hoàn thiện trang nạp
  web (đang dùng dữ liệu mẫu) và adapter chi trả rút xu.

## Phase 8 — Sáng tác

- Không gian tác giả, Thiết kế, đăng bản thu. Đã chốt (24/09): nằm trong phạm vi app.

## Song song — Sẵn sàng phát hành

- Thay icon/splash mẫu của Expo.
- EAS build; thử trên iOS/Android thật sau mỗi phase thêm module native (2, 5).

## Ghi chú sau Phase 0–1

- Định danh app tạm đặt `vn.vinh.app` (iOS và Android) để thử local. Chủ dự án chưa
  phát hành app; phải chốt giá trị cuối trước lần upload store đầu tiên — sau đó không đổi được.
- Phase 1: app đánh dấu hoàn thành khi đoạn cuối hiện trên màn hình; vị trí lưu vẫn
  là đoạn đầu đang hiển thị. Server kiểm tra chỉ số đoạn nhưng không thể chứng minh
  người dùng đã thực sự đọc — cùng mức tin cậy với Reader web.
- Route web `/api/books/[bookId]/reading-progress` trước đây tin `chapterId` và
  `isLastParagraph` từ client, nên có thể tự gửi request để nhận thưởng cho chương
  chưa mua. Đã chuyển sang `recordReadingProgress` (chủ dự án đồng ý 24/09): chương
  khóa chưa mua, sai truyện, đã gỡ hoặc chỉ số đoạn sai giờ bị từ chối.

## Quyết định đã chốt (24/09/2026)

1. Nhiệm vụ (Phase 3) làm trước Đơn hàng (Phase 4).
2. Đăng ký trên mobile: CCCD tùy chọn, giống web (đính chính sau khi rà soát code web).
3. Phase 8 (Sáng tác) nằm trong phạm vi app.

## Câu hỏi còn mở

1. Định danh app cuối cùng — chốt trước khi phát hành lên store.
