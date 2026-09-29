# Migration guide — refactor các form còn dùng input thủ công

## Mục tiêu

Các form trong [src/components/login/login-form.tsx](src/components/login/login-form.tsx) và [src/components/register/register-form.tsx](src/components/register/register-form.tsx) đã được dùng làm mẫu để chuyển sang hệ thống UI component chuẩn. Bước tiếp theo là refactor các file còn lại vẫn đang dùng `<input>`/`<label>`/`<select>`/`<textarea>` thủ công.

**Trạng thái (29/09/2026): các form nhập liệu đã chuyển xong.** Đợt này chuyển thêm: design-upload-form, design-manage-gallery, audio-upload-form, chapter-editor, chapter-audio-panel, book-cover-upload, book-overview, import-manuscript-modal, services-tab, order-card, author-name-agreement-panel, user-detail-panel, remove-chapter-modal, dispute-table, content-table, chapter-moderation-table, contest-judging-panel, contest-submissions-panel, contest-awards-panel (trước đó: edit-profile-tab, following-tab, connect-directory, login-form, register-form).

Bổ sung vào kit trong đợt này:

- `Select` — cùng API `label`/`hint`/`status`/`wrapperClassName` với `Field`, bọc `<select>` gốc; truyền `<option>` qua `children`.
- `size="sm"` cho `Field`/`Textarea`/`Select` — bản gọn cho bảng admin, thẻ đơn hàng, hàng giá.
- `className` trên kit giờ **luôn thắng** class mặc định cùng thuộc tính (ghép qua `cn()` = `tailwind-merge`, [src/lib/cn.ts](../src/lib/cn.ts)). Trước đây Tailwind v4 xếp thứ tự CSS theo nội bộ nên `<Button className="py-2 text-xs">` bị `py-[14px] text-[15px]` đè mất. Không cần hậu tố `!` nữa (các chỗ đã dùng `!` vẫn chạy đúng).
- `Alert` nhận `className` (margin ngoài không cần wrapper div).

## Còn dùng thẻ thủ công — có chủ đích

Đếm bằng grep `<input`/`<select`/`<textarea` ngoài `src/components/ui/` (không tính `type="file"`/`range`/`radio`/`hidden`):

- [publish-panel.tsx](../src/components/author/publish-panel.tsx) (2) — ô giá nằm trong hàng có icon xu + hậu tố "token"; `Field` chưa có "prefix/suffix text" để dựng lại đúng hàng đó.
- [author-name-agreement-panel.tsx](../src/components/profile/author-name-agreement-panel.tsx) — 2 lựa chọn `type="radio"`: kit chưa có `Radio`.
- [chapter-editor.tsx](../src/components/author/chapter-editor.tsx) — khung viết nội dung chương toàn trang (không viền, font riêng, cần ref chèn tại con trỏ).
- Ô nhập "inline" kiểu riêng (khung soạn tin/bình luận, ô tìm kiếm, tag input): [chat-tab.tsx](../src/components/profile/chat-tab.tsx), [chat-bubble-window.tsx](../src/components/messenger/chat-bubble-window.tsx), [paragraph-comments-panel.tsx](../src/components/reading/paragraph-comments-panel.tsx), [content-comments-panel.tsx](../src/components/comments/content-comments-panel.tsx), [nav-bar-content.tsx](../src/components/nav-bar-content.tsx), [user-table.tsx](../src/components/admin/user-table.tsx), [content-table.tsx](../src/components/admin/content-table.tsx), [agreements-tab.tsx](../src/components/profile/agreements-tab.tsx), [tag-input.tsx](../src/components/author/tag-input.tsx), [reading-list-modal.tsx](../src/components/reading/reading-list-modal.tsx).
- Thanh trượt `type="range"`: [now-playing.tsx](../src/components/audio/now-playing.tsx), [mini-player-bar.tsx](../src/components/audio-hub/mini-player-bar.tsx).

Còn thiếu trong kit nếu muốn chuyển nốt: `Radio`, `Switch` (nút bật/tắt "Nhận đơn" ở services-tab), biến thể `Button` màu lỗi (nút "Gỡ"/"Tranh chấp"), và `Field` có prefix/suffix dạng chữ.

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
