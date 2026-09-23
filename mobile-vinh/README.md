# Vịnh Mobile

Ứng dụng iOS/Android dùng Expo SDK 57, Expo Router, TypeScript và NativeWind v4.
Khởi tạo bằng `npx create-expo-app@latest mobile-vinh --template tabs`.

## Chạy ứng dụng

Yêu cầu Node.js 22.13+ (đã kiểm tra bằng Node 24), npm và Expo Go tương thích SDK 57
hoặc development build. Chạy các lệnh sau trong `mobile-vinh`:

```powershell
npm ci
Copy-Item .env.example .env.local # Chỉ khi chưa có .env.local
npm start
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
  truyện mới xuất bản, tìm tên/lọc thể loại trong tối đa 60 truyện tải về,
  kéo làm mới, trạng thái tải/lỗi/rỗng và mở chương đầu.
- Reader: `FlatList` theo đoạn, chương trước/sau, font có chân/không chân,
  cỡ chữ 14–32, giãn dòng, nền sáng/tối/giấy vàng, lưu tùy chỉnh trên thiết bị.
- Supabase Auth client lưu phiên bằng SecureStore trên iOS/Android và quản lý
  auto-refresh theo AppState. Bản web chỉ giữ phiên/tùy chỉnh trong bộ nhớ.
- Tab Cá nhân: đăng nhập email/mật khẩu cho tài khoản web hiện có, gửi/xác nhận
  OTP, đếm thời gian gửi lại, khôi phục phiên và đăng xuất trên thiết bị này.
  Phiên dài được chia nhỏ để tránh giới hạn kích thước mỗi mục SecureStore.
  Reader tải lại theo người dùng khi đăng nhập/đăng xuất.
- API `GET /api/mobile/chapters/[chapterId]` nhận Bearer JWT, xác minh bằng
  `auth.getUser`, giữ RLS, kiểm tra quyền mua và cắt phần đọc thử ở máy chủ.
  Không cache response, không tải nội dung trả phí trước khi xác minh quyền.
- Types được import type-only từ `../src/lib/supabase/types.ts` của web
  (file hiện tại của repo là handwritten, chưa phải schema generated).

Tab Tủ sách và Audio hiện là khung ghi rõ “Sắp ra mắt”. Đăng ký tài khoản mới, IAP,
audio nền, offline, bình luận, khôi phục vị trí đọc và ảnh thiết kế inline chưa triển khai.
Các API web khác chưa được nâng cấp sang Bearer. Không có dữ liệu truyện giả để thay thế lỗi kết nối.
Icon/splash hiện dùng asset mẫu Expo, cần thay trước khi phát hành.

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

Route mới giữ quy tắc đọc của web, nhưng không thay đổi các policy database sẵn
có. Việc siết quyền truy cập trực tiếp `chapters.content` qua REST cần đánh giá
riêng trước khi phát hành nội dung trả phí.

Tài liệu tham chiếu: [Expo Router](https://docs.expo.dev/router/introduction/),
[NativeWind v4](https://www.nativewind.dev/docs/getting-started/installation),
[Supabase React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native).
