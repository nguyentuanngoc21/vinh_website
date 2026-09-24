# Vịnh Mobile

Ứng dụng iOS/Android dùng Expo SDK 57, Expo Router, TypeScript và NativeWind v4.
Khởi tạo bằng `npx create-expo-app@latest mobile-vinh --template tabs`.

## Chạy ứng dụng

Yêu cầu Node.js 22.13+ (đã kiểm tra bằng Node 24), npm và Expo Go tương thích SDK 57
hoặc development build. Chạy các lệnh sau trong `mobile-vinh`:

```powershell
npm ci
Copy-Item .env.example .env.local # Chỉ khi chưa có .env.local
npm start -- --go
```

Điền ba biến trong `.env.local`:

- `EXPO_PUBLIC_SUPABASE_URL`: URL dự án Supabase đang dùng cho web.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key hoặc legacy anon key.
- `EXPO_PUBLIC_API_URL`: địa chỉ backend Next.js, không thêm `/api`.

Mobile hiện dùng hai biến PUBLIC từ `.env.prod`; không sao chép service-role key.
Trong `.env.local` của backend gốc, `MOBILE_SUPABASE_URL` và
`MOBILE_SUPABASE_PUBLISHABLE_KEY` trỏ đến cùng dự án với mobile. Route Reader
ưu tiên cặp này; nếu không cấu hình thì dùng cặp `NEXT_PUBLIC_SUPABASE_*`.
Điều này cho phép web local tiếp tục dùng database phát triển. Khi triển khai
backend, luôn bảo đảm Reader và mobile cùng trỏ đến một dự án Supabase.
API URL dùng IP LAN của máy khi thử trên điện thoại.
API Tin nhắn dùng Bearer qua `/api/mobile/messages`. Backend cần
`MOBILE_SUPABASE_SERVICE_ROLE_KEY` khớp `MOBILE_SUPABASE_URL` nếu mobile dùng
database khác web local. Biến này chỉ nằm trong env backend gốc, tuyệt đối không
đặt trong mobile hoặc dùng tiền tố `EXPO_PUBLIC_`. Cấu hình local đã được nối với
credential production hiện có; cần khởi động lại backend để nhận biến mới.
Không commit `.env.local`, không đưa service-role key vào bất kỳ biến `EXPO_PUBLIC_*` nào.

Ở thư mục gốc repository, mở terminal riêng để chạy backend:

```powershell
npm run dev -- --hostname 127.0.0.1
```

Để dùng điện thoại thật, đặt API URL thành địa chỉ HTTPS của backend đã có route mới,
hoặc IP LAN của máy phát triển trong cùng Wi-Fi; trường hợp LAN cần tự chạy backend
với `--hostname 0.0.0.0` và cấu hình firewall phù hợp. `localhost` trên điện thoại
trỏ đến điện thoại, không phải máy tính. Android emulator thường dùng `10.0.2.2:3000`.
Khởi động lại Expo sau khi sửa biến môi trường. `npm run web` mở bản xem trước trình duyệt.

## Phạm vi đã triển khai

- Trang chủ: dữ liệu `books` thật qua Supabase và RLS, truyện được đọc nhiều,
  truyện mới xuất bản, lọc thể loại trong tối đa 60 truyện tải về,
  kéo làm mới, trạng thái tải/lỗi/rỗng và mở chi tiết truyện.
- Tìm kiếm: chạm ô tìm kiếm Trang chủ để tìm tên trực tiếp trong toàn bộ truyện
  công khai trên database; bấm Tìm kiếm, tải thêm từng 20 kết quả, mới nhất trước.
  Không phân biệt hoa/thường, vẫn phân biệt dấu tiếng Việt; chưa tìm theo tác giả
  hoặc nội dung. Không nhận ký tự `*`; `%` và `_` được tìm như ký tự thông thường.
- Chi tiết truyện: giới thiệu, thể loại, lượt xem, lưu vào Tủ sách, đọc/tiếp tục
  chương đã lưu; mục lục tải từng 50 chương theo thứ tự, hiển thị giá chương.
  Reader có nút Mục lục để chọn chương. Mục lục chỉ tải thông tin, không tải nội dung chương.
- Reader: `FlatList` theo đoạn, chương trước/sau, font có chân/không chân,
  cỡ chữ 14–32, giãn dòng, nền sáng/tối/giấy vàng, lưu tùy chỉnh trên thiết bị.
- Tủ sách: hai mục Đang đọc/Đã lưu, đồng bộ `book_progress`, `reading_lists`
  và `reading_list_items` với web qua Supabase RLS. Trong Reader, bấm Lưu truyện
  để chọn/tạo danh sách hoặc bỏ lưu. Một truyện có thể thuộc nhiều danh sách.
- Khi đã đăng nhập và có quyền đọc chương, tự lưu đoạn đang xem sau 1,5 giây
  dừng cuộn, khi rời Reader hoặc đưa app xuống nền. Mở lại từ Tủ sách hoặc
  Trang chủ sẽ tiếp tục đúng chương; Reader khôi phục đoạn đã lưu. Dùng đúng
  cách chia đoạn của web để đồng bộ chỉ số. Không lưu tiến độ cho chương khóa.
- Audio: danh sách thật từ `public_audio_narrations`, tên người kể, tìm kiếm
  tên/thể loại; player chung toàn app với mini-player trên thanh tab, phát/tạm
  dừng, tua ±15 giây, tốc độ 1–2×, chọn bản thu trong danh sách, hẹn giờ tắt.
  Dùng `expo-audio` theo lựa chọn cập nhật của chủ dự án, thay Track Player.
  Yêu cầu đăng nhập để nghe; đăng xuất/đổi tài khoản dừng và xóa nguồn phát.
  Đã cấu hình audio nền và điều khiển màn hình khóa, không xin quyền micro.
- Supabase Auth client lưu phiên bằng SecureStore trên iOS/Android và quản lý
  auto-refresh theo AppState. Bản web chỉ giữ phiên/tùy chỉnh trong bộ nhớ.
- Tab Cá nhân: đăng nhập email/mật khẩu cho tài khoản web hiện có, gửi/xác nhận
  OTP, đếm thời gian gửi lại, khôi phục phiên và đăng xuất trên thiết bị này.
  Phiên dài được chia nhỏ để tránh giới hạn kích thước mỗi mục SecureStore.
  Reader tải lại theo người dùng khi đăng nhập/đăng xuất.
- Cá nhân hiển thị nickname, username, giới thiệu, số dư xu khả dụng/chờ xử lý
  từ `profiles` và 20 giao dịch mới nhất từ `transactions`. Tự tải lại khi quay về
  tab, có nút Làm mới; lỗi tải hồ sơ và lịch sử được hiển thị riêng. Dữ liệu chỉ
  đọc qua phiên người dùng và RLS; chưa hỗ trợ nạp/rút xu hoặc mua chương trong app.
- API `GET /api/mobile/chapters/[chapterId]` nhận Bearer JWT, xác minh bằng
  `auth.getUser`, giữ RLS, kiểm tra quyền mua và cắt phần đọc thử ở máy chủ.
  Không cache response, không tải nội dung trả phí trước khi xác minh quyền.
- Types được import type-only từ `../src/lib/supabase/types.ts` của web
  (file hiện tại của repo là handwritten, chưa phải schema generated).

Đăng ký tài khoản mới, IAP, offline, bình luận và ảnh thiết kế inline chưa triển khai.
Thông báo: Cá nhân → Thông báo hiển thị 30 mục mới nhất của tài khoản; kéo làm
mới, đánh dấu từng mục đã đọc và đồng bộ với web qua RLS. Số chưa đọc chỉ tính
trong danh sách này. Liên kết nội dung liên quan hiện cần xem trên website Vịnh;
thông báo đẩy khi app đóng chưa có. Không tự đánh dấu
khi mở màn hình và không tạo thông báo mẫu trên database thật.
Tin nhắn: Cá nhân → Tin nhắn, xem hội thoại hiện có trên web, đọc/gửi văn bản
tối đa 4.000 ký tự, tách hòm thư cá nhân/kiểm duyệt. Thông báo có liên kết hội
thoại mở được trực tiếp trong app. Nút Làm mới tải tin mới; chưa có realtime/push,
có tìm chính xác username để bắt đầu cuộc trò chuyện; chưa có thẻ đơn hàng trong chat.
Danh sách suy ra từ 300 tin gần nhất; mỗi hội thoại tải 200 tin mới nhất,
chưa phân trang lịch sử cũ. Khi gửi bị timeout, làm mới kiểm tra trước khi gửi lại.
API xác minh JWT và chọn đúng database mobile; không tự gửi tin thật trong kiểm thử.
Audio chưa lưu vị trí nghe lên database hoặc tự phát bản tiếp theo. Hẹn giờ
dùng đồng hồ JavaScript và kiểm tra lại khi app hoạt động/trạng thái phát đổi;
không bảo đảm dừng đúng giây khi hệ điều hành tạm ngưng JavaScript ở nền.
Tủ sách và lưu vị trí cần mạng; khi ghi thất bại, Reader báo lỗi và cho bấm lưu
lại. Chưa có hàng đợi offline; tắt cưỡng bức ứng dụng trước khi đồng bộ có thể
mất vị trí mới nhất. Ghi tiến độ mobile chưa cộng thưởng nhiệm vụ/reading_history.
Các API web khác chưa được nâng cấp sang Bearer. Không có dữ liệu truyện giả để thay thế lỗi kết nối.
Icon/splash hiện dùng asset mẫu Expo, cần thay trước khi phát hành.

## Dịch vụ của tôi

Dịch vụ của tôi: tạo gói Minh họa/Thu âm/Viết thuê ở trạng thái tạm ngừng;
sửa tên, phạm vi, nội dung nhận/từ chối, nhiều mức giá (xu), ngày giao, tỷ lệ cọc,
số lần sửa và thời hạn mất liên lạc. Chỉnh quyền sử dụng (cá nhân/thương mại giới
hạn/toàn phần), sản phẩm riêng tư và bốn tỷ lệ hoàn tiền khi khách hủy. Không tự
điền chính sách hoàn: trống cả bốn là chưa khai; nếu khai phải đủ và trong 0–100%.
Chỉ lưu khi bấm Lưu thay đổi; Hủy bỏ bản sửa.
Hiển thị trường còn thiếu; bật/tạm ngừng nhận đơn qua kiểm tra quyền sở hữu,
thông tin bắt buộc và Bộ quy tắc Commission của web. Sửa thiếu thông tin sẽ tự
tắt nhận đơn và thông báo. App hỗ trợ đặt hạn mức commission/tháng và bật/tắt
nhận commission riêng với nhận đơn. Hạn mức là số nguyên dương; phải tắt nhận
commission trước khi xóa hạn mức. Mỗi gói hiển thị số commission đang thực hiện
(`in_progress`) và trạng thái có thể nhận/đang bận theo quy tắc web. Bộ đếm này
không phải tổng đơn nhận trong tháng; bấm Làm mới để cập nhật. Nếu đếm lỗi, app
báo chưa tải được thay vì hiển thị 0. Gói minh họa/thu âm có thể chỉnh phân loại
từ danh mục database, hỗ trợ chọn một/chọn nhiều và lưu ý từng lựa chọn.
Phân loại chỉ lưu khi bấm Lưu thay đổi; server kiểm tra danh mục hiện hành.
Trong danh sách gói, chọn **Mẫu sản phẩm** để tải ảnh JPG/PNG/WebP (minh họa)
hoặc MP3/WAV (thu âm), tối đa 15 MB. Chọn tệp rồi bấm Tải mẫu lên; gỡ mẫu cần
xác nhận và có hiệu lực ngay. Ảnh có xem trước, audio mở bằng liên kết mẫu.
Liên kết hết hạn có thể lấy lại bằng Làm mới. Gỡ chỉ bỏ mẫu khỏi gói, chưa xóa
object storage, cùng cách web đang hoạt động. Mẫu tự động và quản lý đơn hàng
vẫn cần web. Đã thêm `expo-document-picker`; nếu dùng development build cũ,
cần build lại để có module native mới. Chưa kiểm thử upload trên điện thoại
thật hoặc ghi vào production. Khởi động lại backend
để nhận API mới; kiểm thử tự động không thay đổi trạng thái dịch vụ production.

## Cam kết & Thỏa thuận

Cá nhân → Cam kết & Thỏa thuận: xem danh sách, phiên bản, trạng thái xác nhận;
mở văn bản đầy đủ, tự đánh dấu đồng ý rồi xác nhận. Nội dung và thông tin các bên
dùng cùng nguồn với web. Thiếu hồ sơ hợp đồng thì cần cập nhật trên web rồi tải
lại; server từ chối xác nhận phiên bản cũ. Chưa có giao diện sửa thông tin hợp đồng
hoặc thỏa thuận riêng của đơn hàng. Không tự xác nhận văn bản thật trong kiểm thử.
WebView tắt JavaScript, chặn liên kết ngoài; web preview dùng iframe sandbox.
Khởi động lại backend và Expo. Development build cũ chưa có WebView cần build lại;
Expo Go SDK tương thích đã có WebView.

## Cấu hình OTP email

Email/mật khẩu hoạt động với tài khoản đã có. Để đăng nhập OTP, trong Supabase
Dashboard của đúng dự án production, mở Authentication → Email Templates →
Magic Link và dùng mẫu `../docs/supabase/email-templates/magic-link-otp.html`.
Mẫu phải chứa `{{ .Token }}` để người dùng nhận mã thay vì chỉ nhận liên kết.
Mẫu này mới được chuẩn bị trong repo, chưa được áp dụng lên Supabase Dashboard.
Kiểm tra SMTP và hạn mức gửi email của dự án nếu không nhận được thư.
Mobile đặt `shouldCreateUser: false`; không tạo tài khoản thiếu hồ sơ của web.

Sau khi sửa env, dừng và khởi động lại backend cùng Expo (`npx expo start --go --clear`).
Kiểm tra trên điện thoại: đăng nhập tài khoản web → đọc hết chương miễn phí →
đóng/mở app → đăng xuất → Reader quay lại phần đọc thử. Chưa gửi email OTP
hay thử mật khẩu tài khoản thật trong kiểm thử tự động.

## Kiểm tra

```powershell
npm run typecheck
npm run lint
node --test scripts/test-reader-api.cjs
node --test scripts/test-auth-storage.cjs
node --test scripts/test-library.cjs
node --test scripts/test-audio.cjs
node --test scripts/test-book-detail.cjs
node --test scripts/test-account.cjs
node --test scripts/test-notifications.cjs
node --test scripts/test-mobile-messages.cjs
node --test scripts/test-agreements.cjs
node --test scripts/test-services.cjs
npm run check:supabase
node scripts/check-supabase.mjs --reader # Cần backend đang chạy
npx expo install --check
npx expo export --platform all
```

Đã đối chiếu: database phát triển có 1 truyện “Truyện 123”, production có 5 truyện
công khai. Sau khi chuyển cấu hình, truy vấn mobile và API Reader đều đọc được
dữ liệu production; Reader trả phần đọc thử với `gate=login`. Bộ kiểm tra API dùng database giả để
kiểm tra khách, người chưa mua/đã mua, tác giả, token sai và lỗi xác minh quyền;
không tạo tài khoản hay giao dịch trên database thật.

Đã đóng gói JavaScript/Hermes thành công cho Android, iOS và web. Đây không phải
bản APK/IPA đã ký; chưa chạy kiểm thử trên thiết bị thật. Cần kiểm tra trên cả
iOS và Android: mở truyện, đổi font/nền/cỡ chữ, đóng mở lại để xác nhận lưu tùy
chỉnh, thử mất mạng và chương khóa, kiểm tra vùng an toàn và phóng to chữ hệ thống.

Kiểm thử Tủ sách trên thiết bị (cần khởi động lại backend để API trả `bookId`):

1. Đăng nhập, mở truyện → Lưu truyện → tạo/chọn danh sách → Xong.
2. Mở Tủ sách → Đã lưu, kiểm tra tên truyện và danh sách; bỏ lưu rồi kiểm tra lại.
3. Đọc một chương dài, cuộn xuống và chờ “Đã lưu vị trí đọc”, về Tủ sách → Đang
   đọc → Tiếp tục đọc. Kiểm tra đúng chương/đoạn; thử lại sau khi đóng mở app.
4. Đổi font/cỡ chữ và thử chương dài để xác nhận cuộn về đúng đoạn. Khi chuyển
   chương, đoạn của chương cũ không được áp dụng cho chương mới.
5. Đăng xuất/đổi tài khoản: Tủ sách cũ phải biến mất. Tắt mạng khi lưu: phải có
   thông báo lỗi, không hiển thị trạng thái lưu thành công.
6. Đọc trên web rồi mở lại mobile để đối chiếu tiến độ và danh sách chung.

Bộ kiểm tra tự động mô phỏng DB kiểm tra thứ tự ghi, lỗi mạng, đổi tài khoản,
chương bị gỡ, kẹp chỉ số khi nội dung thay đổi và thêm/bỏ lưu đúng danh sách.
Không tự tạo dữ liệu Tủ sách hoặc ghi tiến độ vào tài khoản production để test.

## Thử Audio trên điện thoại

Database production hiện có **0 bản audio công khai** tại thời điểm triển khai.
Màn hình hiện trạng thái trống; không chèn dữ liệu mẫu vào production. Để thử
phát thực tế, dùng luồng xuất bản audio sẵn có trên web để đăng một bản thu
bạn có quyền sử dụng, rồi kéo làm mới tab Audio. Các bản được công khai xuất
hiện qua view `public_audio_narrations` và bucket `audio-narrations` như web.

Expo Go có thể thử giao diện và phát cơ bản: `npx expo start --go --clear`.
Các thay đổi config plugin nghe nền chỉ có hiệu lực sau khi tạo binary riêng.
Đã cài `expo-dev-client` và chuẩn bị `eas.json` với profile development/preview.
Chưa gửi build lên EAS hoặc tạo APK/IPA. Để tạo development build Android:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

EAS sẽ yêu cầu liên kết dự án và application identifier nếu chưa có. Cấu hình
đúng các biến `EXPO_PUBLIC_SUPABASE_*` và API URL cho môi trường build khi cần;
không đưa service-role key vào app. Cài APK development nhận từ EAS lên điện
thoại, rồi mở server bằng QR. iOS dùng `--platform ios`, cần thiết lập ký và
đăng ký thiết bị theo hướng dẫn của EAS. Không thể kiểm chứng nghe nền đầy đủ
chỉ bằng việc export JavaScript hay chạy Expo Go.

Kiểm tra: phát/tạm dừng, tua, tốc độ, đổi nhanh bản thu, rút tai nghe, đổi app,
khóa màn hình trên 5 phút, điều khiển từ thông báo/màn hình khóa, tắt mạng,
đăng xuất khi đang phát và hẹn giờ. Nội dung chỉ nghe được sau khi đăng nhập;
đây không phải cơ chế DRM vì bucket audio của backend hiện đang công khai.

Tham khảo: [Expo Audio SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/audio/).

Route mới giữ quy tắc đọc của web, nhưng không thay đổi các policy database sẵn
có. Việc siết quyền truy cập trực tiếp `chapters.content` qua REST cần đánh giá
riêng trước khi phát hành nội dung trả phí.

Tài liệu tham chiếu: [Expo Router](https://docs.expo.dev/router/introduction/),
[NativeWind v4](https://www.nativewind.dev/docs/getting-started/installation),
[Supabase React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native).
