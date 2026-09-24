# Đối chiếu chức năng web và app Vịnh

Ngày rà soát: 23/09/2026. Căn cứ: mã nguồn web trong `src/app`, `src/components`,
`src/lib` và mobile trong `mobile-vinh`. Đây là rà soát mã nguồn, không phải kết
quả kiểm thử website đang triển khai hay giao dịch production. Có route/service
không đồng nghĩa đã cấu hình và vận hành thành công trên production.

## Cập nhật sau rà soát — đợt 1

Đã thêm xác thực Bearer dùng chung (`src/lib/mobile/request-context.ts`) và
API mobile cho Tin nhắn, giữ nghiệp vụ hòm thư của web. App có danh sách hội thoại,
tìm username để mở hội thoại mới, đọc/gửi văn bản và mở hội thoại từ thông báo.
Chưa có realtime/push, phân trang tin cũ hoặc thẻ đơn hàng trong chat.
Các bảng bên dưới là mốc rà soát trước đợt này; cam kết, dịch vụ và sự kiện đọc
vẫn là công việc tiếp theo, chưa được đánh dấu hoàn thành.

## Trạng thái hiện tại — 24/09/2026

- Đơn hàng — xem (Phase 4a): danh sách đơn của tôi, thẻ đơn trong Tin nhắn, chi tiết,
  nhật ký, sản phẩm bàn giao. Đã sửa lỗi chèn filter ở `GET /api/orders?withUserId=`
  (`listOrdersForUser` kiểm tra UUID). Thêm migration
  `20260924_enforce_order_payment_amounts.sql` (cọc tối thiểu, không trả vượt giá) —
  **chưa chạy lên database**. Thanh toán đơn trên mobile tạm khóa (làm trên web).
- Nhiệm vụ, chuỗi, thành tựu (Phase 3): danh sách nhiệm vụ hôm nay, tiến độ, nhận
  thưởng, đổi nhiệm vụ, số ngày chuỗi và trang thành tựu theo vai trò, qua
  `/api/mobile/quests*` và `/api/mobile/achievements` bọc route web. Cứu chuỗi bằng xu
  vẫn chưa có giao diện ở cả web và mobile.
- Tài khoản và hồ sơ (Phase 2a): đăng ký (CCCD tùy chọn như web, OTP), quên mật
  khẩu bằng OTP, sửa nickname/giới thiệu/ảnh đại diện/ảnh bìa. Đăng ký web và mobile
  dùng chung `src/lib/registration.ts`.
- Thông tin cá nhân (Phase 2b): thông tin hợp đồng, xác minh CCCD sau đăng ký và
  tài khoản ngân hàng, dùng lại route hồ sơ của web qua `/api/mobile/profile/*`.
  Cam kết mở thẳng màn này khi thiếu thông tin. Phase 2 hoàn tất phần tài khoản;
  thỏa thuận riêng của đơn hàng thuộc Phase 4.
- Sự kiện đọc (Phase 1): mobile lưu tiến độ qua `/api/mobile/books/[bookId]/reading-progress`
  (`src/lib/reading/record-progress.ts`), kiểm tra quyền đọc ở server và ghi
  `reading_history`/chuỗi/nhiệm vụ khi hoàn thành chương. Route web
  `/api/books/[bookId]/reading-progress` dùng chung service này nên cũng đã kiểm tra
  quyền đọc. Mục 3 bên dưới đã được xử lý.

- Tin nhắn: danh sách, tìm username, đọc/gửi văn bản, mở từ thông báo đã có.
- Cam kết: xem văn bản và xác nhận đúng phiên bản đã có.
- Dịch vụ: tạo/sửa gói, nhiều mức giá, quyền sử dụng, riêng tư, chính sách hoàn
  tiền, hạn mức và bật/tắt nhận đơn/commission đã có. App hiển thị số đơn đang
  thực hiện theo từng gói và trạng thái có thể nhận/đang bận theo quy tắc web.
  Số này chỉ tính `in_progress`, không phải tổng đơn nhận trong tháng. Lỗi đếm
  được hiển thị là chưa tải được, không thay bằng 0.
- Phân loại minh họa/thu âm: đã có chọn một/chọn nhiều, hướng dẫn và cảnh báo
  từ danh mục database. Server kiểm tra lựa chọn theo đúng loại dịch vụ;
  có thể bỏ phân loại cũ không còn trong danh mục. Chỉ ghi khi bấm Lưu.
- Mẫu tải lên: gói minh họa chọn JPG/PNG/WebP, thu âm chọn MP3/WAV, tối đa
  15 MB. Có xem ảnh, mở liên kết mẫu và gỡ có xác nhận. API xác minh chủ gói;
  gỡ mẫu giữ nguyên object storage như web. Chưa có danh sách mẫu tự động từ
  đơn đã hoàn tất/tác phẩm tự đứng tên trên app.
- Còn thiếu trong dịch vụ: mẫu tự động và vòng đời đơn hàng.
- Các bảng và ghi chú lịch sử bên dưới phản ánh thời điểm rà soát ban đầu;
  dùng mục này để xác định tiến độ hiện tại của những nhóm đã triển khai.

Kiểm tra đợt bộ đếm: 15 kiểm thử dịch vụ đạt. Chưa kiểm thử trên điện thoại thật.

## Lịch sử triển khai và các nhóm cần bổ sung

Bảng dưới đã được cập nhật ngày 24/09/2026 cho các nhóm đã triển khai (Tin nhắn,
Dịch vụ, Cam kết, Thông báo, Audio). Kế hoạch các phase tiếp theo: `docs/mobile-implementation-plan.md`.

Cập nhật 24/09: App đã có chỉnh hạn mức commission/tháng và công tắc nhận
commission riêng trong Dịch vụ của tôi. API kiểm tra quyền sở hữu và hạn mức;
chặn xóa hạn mức khi còn bật nhận commission. Bộ đếm commission được bổ sung
ở đợt tiếp theo; quy trình quản lý đơn hàng còn thiếu. Đã kiểm thử tự động, chưa thử
thao tác ghi trên production/điện thoại thật.

Cập nhật tiếp 24/09: tạo gói và sửa thông tin cơ bản/nhiều mức giá trên app đã có.
Chưa có trình chỉnh phân loại, quyền sử dụng, chính sách hoàn tiền, mẫu sản phẩm
và hạn mức commission. Các cấu hình này giữ nguyên khi sửa từ app.

Cập nhật 24/09 — đợt 3: app có Dịch vụ của tôi để xem gói hiện có, trường còn
thiếu và bật/tạm ngừng nhận đơn. Dùng chung kiểm tra chủ sở hữu và quy tắc
Commission của web. Tạo/sửa gói, mẫu sản phẩm, hạn mức commission và vòng đời
đơn hàng chưa được triển khai trong app.

Cập nhật đợt 2: app đã có Cam kết & Thỏa thuận, xem văn bản đầy đủ có điền
thông tin các bên và xác nhận đúng phiên bản qua API dùng chung với web. Chặn
phiên bản cũ và hồ sơ thiếu. Sửa thông tin hợp đồng và thỏa thuận riêng của đơn
hàng vẫn chưa có trên mobile. Không thực hiện xác nhận thật trong kiểm thử.

| Nhóm | Bằng chứng phía web | App hiện tại / phần thiếu |
|---|---|---|
| Tin nhắn | `src/components/profile/chat-tab.tsx`, `src/app/api/messages` | **Đã có:** danh sách hội thoại, tìm username, đọc/gửi văn bản, hòm thư cá nhân/kiểm duyệt, mở từ thông báo. **Thiếu:** realtime/push, phân trang tin cũ, thẻ đơn hàng trong chat. |
| Tìm người / kết nối | `src/components/connect/connect-directory.tsx`, `src/app/ket-noi` | Chưa có danh bạ tác giả, người thu âm, họa sĩ và trang hồ sơ người khác. |
| Cung cấp dịch vụ | `src/components/profile/services-tab.tsx`, `src/app/api/profile/services` | **Đã có:** tạo/sửa gói, nhiều mức giá, phân loại, quyền sử dụng, chính sách hoàn tiền, mẫu tải lên, bật/tắt nhận đơn, hạn mức và công tắc commission, bộ đếm `in_progress`. **Thiếu:** mẫu tự động từ đơn hoàn tất. |
| Đặt và thực hiện dịch vụ | `src/components/profile/order-card.tsx`, `src/app/api/orders` | Chưa có brief, phạm vi, đặt cọc, bản nháp, yêu cầu sửa, giao sản phẩm, nghiệm thu, tệp gốc, hủy đơn, mất liên lạc, tranh chấp. |
| Điều khoản / cam kết | `src/lib/legal/registry.ts`, `src/components/profile/agreements-tab.tsx`, `src/app/api/profile/agreements` | **Đã có:** danh sách, phiên bản, đọc văn bản đầy đủ có thông tin bên ký, xác nhận đúng phiên bản. **Thiếu:** sửa thông tin hợp đồng, thỏa thuận riêng của đơn hàng và tên tác giả. |
| Nạp xu | `src/components/topup/topup-page.tsx`, `src/app/api/wallet/deposit` | Chưa có trên app. Web có backend ZaloPay nhưng trang nạp đang dùng dữ liệu mẫu; cần hoàn thiện kết nối thực tế. |
| Rút xu | `src/lib/wallet/withdrawal-service.ts`, `src/app/api/wallet/withdraw` | Chưa có trên app; backend web có nghiệp vụ yêu cầu rút nhưng adapter chi trả thật chưa được chọn trong service. |
| Mua chương | `src/app/api/chapters/[chapterId]/purchase`, `src/components/reading/reading-gate.tsx` | App chỉ đọc chương đã mua trên web; chưa mua bằng xu trong app. |
| Nhiệm vụ | `src/components/profile/daily-tasks-tab.tsx`, `src/app/api/quests` | Chưa có danh sách, tiến độ, đổi nhiệm vụ, nhận thưởng hoặc tích hợp sự kiện đọc/tương tác. |
| Thành tựu | `src/components/achievements/achievements-page.tsx`, `src/lib/quests/achievement-service.ts` | Chưa có tiến độ, phân nhóm vai trò, trạng thái đạt và phần thưởng. |
| Chuỗi ngày đọc | `src/lib/quests/streak-service.ts` | Chưa hiển thị/cập nhật từ hoạt động đọc app. Backend có mốc thưởng, thẻ nghỉ và cứu chuỗi; chưa thấy giao diện web đầy đủ cho toàn bộ luồng này. |
| Tài khoản | `src/app/dang-ky`, `src/app/quen-mat-khau`, `src/app/dat-lai-mat-khau` | Mới đăng nhập tài khoản có sẵn bằng mật khẩu/OTP. Thiếu đăng ký, khôi phục mật khẩu. |
| Sửa hồ sơ / xác minh | `src/components/profile/edit-profile-tab.tsx`, `identity-form.tsx`, `bank-info-form.tsx`, `src/app/api/profile` | App mới xem hồ sơ. Thiếu sửa tên/bio, avatar/ảnh bìa, định danh, ngân hàng, thông tin hợp đồng. |
| Tương tác khi đọc | `src/components/reading/reader.tsx`, `src/app/api/chapters` | Thiếu bình luận theo đoạn, highlight, bình chọn chương/trope, theo dõi tác giả, ghi nhận chia sẻ. |
| Nhân vật / theo dõi | `src/components/story/character-list.tsx`, `src/components/profile/following-tab.tsx`, API follows/characters | Chưa có danh sách nhân vật, theo dõi nhân vật/tác giả và quản lý theo dõi. |
| Khám phá nội dung | `src/lib/recommendations`, `src/lib/search`, `src/app/rankings` | App mới tìm tên truyện; thiếu tìm kiếm nhiều loại nội dung, bảng xếp hạng và đề xuất tương đương web. |
| Thiết kế | `src/app/thiet-ke`, `src/components/design`, `src/app/api/design` | Chưa có thư viện, album, thích/bình luận/chia sẻ, upload/quản lý, bản nháp và xuất bản. |
| Audio mở rộng | `src/components/audio-hub`, `src/app/api/audio`, `src/lib/audio` | **Đã có:** danh sách, player toàn app, mini-player, tốc độ, hẹn giờ, nghe nền. **Thiếu:** đồng bộ vị trí nghe, tiếp tục nghe từ web, đăng/quản lý bản thu, bình luận/chia sẻ và ghi nhận lượt phát qua API. |
| Không gian tác giả | `src/app/author`, `src/components/author`, `src/app/api/authoring` | Chưa tạo/sửa truyện và chương, nhập bản thảo, quản lý nhân vật, bìa/audio, bản quyền, chia sẻ bản thảo và xuất bản. |
| Thông báo | `src/components/notifications/notification-bell.tsx` | **Đã có:** 30 mục mới nhất, đánh dấu đã đọc, mở liên kết hội thoại trong app. **Thiếu:** điều hướng các loại liên kết khác, push trên app (không khẳng định web có push). |
| Nội dung giới thiệu / hướng dẫn | `src/app/blog`, `src/components/onboarding`, `src/components/legal` | Chưa có luồng tương đương đầy đủ trên app. |
| Quản trị | `src/app/admin`, `src/app/api/admin` | Chưa có trên app. Có thể giữ trên web nếu app chỉ dành cho người dùng và người sáng tạo. |

## Những điểm không nên sao chép nguyên trạng

1. **Trang nạp xu web chưa phải luồng thanh toán hoàn chỉnh.**
   `topup-page.tsx` lấy `WALLET_BALANCE`/`TOPUP_HISTORY` từ `src/lib/topup.ts`;
   `onPay={() => setShowSuccess(true)}` chỉ mở modal. Backend deposit có tích hợp
   ZaloPay riêng; cần nối UI, xác minh callback và kiểm thử trước khi coi là chạy thật.
2. **Nhiệm vụ, thành tựu và chuỗi ngày là ba phần liên quan nhưng khác nhau.**
   Nhiệm vụ có pool/claim/reset; thành tựu có service đồng bộ theo chỉ số; chuỗi
   có state machine riêng. `achievement-service.ts` ghi rõ mốc streak chưa hiển thị
   trong cùng hệ thành tựu. Chưa thấy caller của `rescueStreak` ngoài định nghĩa service.
3. **Lưu vị trí đọc không tương đương ghi nhận hoàn thành chương.**
   Mobile ghi `book_progress` trực tiếp. Web đi qua
   `src/app/api/books/[bookId]/reading-progress/route.ts` và
   `src/lib/quests/reading-event-service.ts` để ghi lịch sử, cập nhật nhiệm vụ và chuỗi.
   Phải bổ sung luồng sự kiện hợp lệ từ app, giữ kiểm tra quyền đọc/chống ghi lặp phía server.
4. **Xác nhận văn bản phải giữ đúng phiên bản và điều kiện nghiệp vụ.**
   Registry có sáu văn bản. API so sánh `accepted_version` với phiên bản hiện tại.
   Registry cũng ghi nhận một số điều kiện cam kết tác giả mới là nhãn hiển thị,
   chưa được cưỡng chế đầy đủ; không coi mọi nhãn là một kiểm tra backend đã có.
5. **API web chưa tự nhận phiên đăng nhập của app.**
   `src/lib/wallet/session.ts` đọc cookie web và Supabase session từ server client,
   chưa đọc Authorization Bearer của mobile. Reader có route mobile riêng.
   Các API tin nhắn, nhiệm vụ, thỏa thuận, đơn hàng cần xác thực mobile đúng cách.
   Đồng thời phải bảo đảm token và backend dùng cùng dự án Supabase; cấu hình local
   hiện có thể tách database web và mobile. Không đưa service-role key vào ứng dụng.

## Thứ tự triển khai đề xuất

1. **Nền tảng API mobile:** xác minh Bearer, thống nhất dự án Supabase, dùng chung
   nghiệp vụ với web và kiểm thử quyền của người dùng/chủ đơn/người nhận tin.
2. **Tài khoản và cam kết:** đăng ký, khôi phục mật khẩu, sửa hồ sơ; đọc/xác nhận
   đúng phiên bản văn bản và thông tin hợp đồng cần thiết.
3. **Tin nhắn và kết nối:** danh sách hội thoại, gửi/nhận, hòm thư kiểm duyệt,
   thông báo mở đúng cuộc trò chuyện, tìm người cung cấp dịch vụ.
4. **Dịch vụ và đơn hàng:** hồ sơ dịch vụ → brief/thỏa thuận → đặt cọc → thực hiện
   → bàn giao/nghiệm thu; bổ sung các nhánh hủy và tranh chấp. Thanh toán phải được
   thiết kế đồng bộ trước khi bật đặt cọc thật.
5. **Nhiệm vụ, chuỗi, thành tựu:** tích hợp sự kiện đọc trước hoặc cùng lúc với UI;
   danh sách/tiến độ, nhận thưởng, đổi nhiệm vụ, hiển thị mốc chuỗi.
6. **Thanh toán hoàn chỉnh:** kiểm chứng backend/web hiện có, chốt luồng thanh toán
   cho từng loại nội dung/dịch vụ trên iOS và Android, rồi nạp/mua/rút và đối soát.
   Tài liệu này chưa rà soát chính sách cửa hàng ứng dụng hiện hành.
7. **Phần còn lại:** tương tác đọc, thiết kế, sáng tác, audio nâng cao, xếp hạng,
   onboarding; push/offline là hạng mục mobile bổ sung, không mặc định đã có trên web.

Bước tiếp theo và thứ tự phase: xem `docs/mobile-implementation-plan.md`.
Nền tảng Bearer và luồng tin nhắn đầu tiên đã hoàn thành.
