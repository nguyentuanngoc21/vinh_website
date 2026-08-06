# Migration guide — refactor các form còn dùng input thủ công

## Mục tiêu

Các form trong [src/components/login/login-form.tsx](src/components/login/login-form.tsx) và [src/components/register/register-form.tsx](src/components/register/register-form.tsx) đã được dùng làm mẫu để chuyển sang hệ thống UI component chuẩn. Bước tiếp theo là refactor 5 file còn lại vẫn đang dùng `<input>` thủ công.

## Danh sách file cần refactor

- [src/components/profile/edit-profile-tab.tsx](src/components/profile/edit-profile-tab.tsx)
- [src/components/profile/chat-tab.tsx](src/components/profile/chat-tab.tsx)
- [src/components/profile/following-tab.tsx](src/components/profile/following-tab.tsx)
- [src/components/connect/connect-directory.tsx](src/components/connect/connect-directory.tsx)
- [src/components/author/chapter-editor.tsx](src/components/author/chapter-editor.tsx)

## Nguyên tắc refactor chung

Mỗi file nên được xử lý theo cùng một pattern:

1. Import các component UI chuẩn từ [src/components/ui/index.ts](src/components/ui/index.ts):
   ```tsx
   import { Field, Button, Alert, Checkbox } from "@/components/ui";
   ```
2. Thay các khối label + input thủ công bằng `Field`:
   ```tsx
   <label className="block">
     <div className="mb-[7px] text-[13px] font-semibold text-slate">Nhãn</div>
     <input className="w-full rounded-[10px] border border-border-light px-[15px] py-3 ..." />
   </label>
   ```
   thành:
   ```tsx
   <Field label="Nhãn" value={value} onChange={handleChange} />
   ```
3. Nếu input có trạng thái validate như `cccd` hoặc `pw2`, hãy tạo trước một object trạng thái:
   ```tsx
   const status = {
     tone: "error" as const,
     message: "Mật khẩu không khớp",
   };
   ```
   rồi truyền vào prop `status` của `Field`.
4. Dùng `Button` cho nút submit/lưu và `Alert` cho banner lỗi.
5. Sau khi chỉnh xong từng file, chạy:
   ```bash
   npx tsc --noEmit
   ```
   để kiểm tra prop và kiểu dữ liệu. Sau đó so sánh UI trước/sau để đảm bảo giao diện không bị đổi quá nhiều.

## Mẫu tham khảo

Với pattern hiện tại, nên lấy [src/components/register/register-form.tsx](src/components/register/register-form.tsx) làm mẫu chính vì nó đã có cách xử lý trạng thái và lỗi rõ ràng.

## Lưu ý về token màu

Script tokenize hiện tại đã xử lý khoảng 32 màu lặp lại có hệ thống, nhưng vẫn còn khoảng 140 mã hex dùng rất ít lần. Những màu này thường là màu trang trí hoặc màu theo từng ngữ cảnh riêng, nên không nên gộp tự động vào token nếu chưa chắc đó là lỗi thiết kế.

### Các màu cần xem lại bằng người thiết kế

- `stone` (`#8a8178`) và `stone-alt` (`#8a8278`) có chênh lệch 1 ký tự hex, rất có thể là lỗi đánh máy hoặc cần thống nhất.
- Hệ màu kem gồm `cream` (`#eceae7`), `cream-card` (`#fbf7ec`) và `cream-card-alt` (`#f4efe4`) đang được dùng khá lẫn lộn. Cần xác định xem có thực sự cần 3 token hay chỉ nên giữ 2.

## Tham khảo thêm

Xem comment ở đầu [src/app/globals.css](src/app/globals.css) để biết nơi định nghĩa token màu và cấu trúc CSS hiện tại.
