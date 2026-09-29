# Migration guide — refactor các form còn dùng input thủ công

## Mục tiêu

Các form trong [src/components/login/login-form.tsx](src/components/login/login-form.tsx) và [src/components/register/register-form.tsx](src/components/register/register-form.tsx) đã được dùng làm mẫu để chuyển sang hệ thống UI component chuẩn. Bước tiếp theo là refactor các file còn lại vẫn đang dùng `<input>`/`<label>`/`<select>`/`<textarea>` thủ công.

Đã chuyển xong: `edit-profile-tab.tsx`, `following-tab.tsx`, `connect-directory.tsx`.

## Danh sách file cần refactor

Lấy bằng cách grep `<input`/`<label`/`<select`/`<textarea` ngoài `src/components/ui/` (không tính `<input type="file">` và `<label>` chỉ bọc input file). Số trong ngoặc là số chỗ còn dùng thủ công — cập nhật lại danh sách bằng grep sau mỗi lần refactor.

Form nhập liệu (ưu tiên chuyển sang `Field`/`Textarea`/`Checkbox`; kit chưa có `Select` chung — chỉ có `GenreSelect`/`BankSelect`):

- [src/components/design/design-upload-form.tsx](src/components/design/design-upload-form.tsx) (~12)
- [src/components/profile/services-tab.tsx](src/components/profile/services-tab.tsx) (~8)
- [src/components/design/design-manage-gallery.tsx](src/components/design/design-manage-gallery.tsx) (~8)
- [src/components/profile/order-card.tsx](src/components/profile/order-card.tsx) (~7)
- [src/components/admin/user-detail-panel.tsx](src/components/admin/user-detail-panel.tsx) (~6)
- [src/components/profile/author-name-agreement-panel.tsx](src/components/profile/author-name-agreement-panel.tsx) (~4)
- [src/components/admin/remove-chapter-modal.tsx](src/components/admin/remove-chapter-modal.tsx) (~4)
- [src/components/admin/dispute-table.tsx](src/components/admin/dispute-table.tsx) (~4)
- [src/components/admin/contests/contest-judging-panel.tsx](src/components/admin/contests/contest-judging-panel.tsx) (~4)
- [src/components/author/publish-panel.tsx](src/components/author/publish-panel.tsx) (~3)
- [src/components/author/import-manuscript-modal.tsx](src/components/author/import-manuscript-modal.tsx) (~2)
- [src/components/audio-hub/audio-upload-form.tsx](src/components/audio-hub/audio-upload-form.tsx) (~3)
- [src/components/admin/content-table.tsx](src/components/admin/content-table.tsx) (~3)
- [src/components/author/chapter-editor.tsx](src/components/author/chapter-editor.tsx) (~2)
- [src/components/author/chapter-audio-panel.tsx](src/components/author/chapter-audio-panel.tsx) (~2)
- [src/components/author/book-cover-upload.tsx](src/components/author/book-cover-upload.tsx) (~1)
- [src/components/admin/contests/contest-submissions-panel.tsx](src/components/admin/contests/contest-submissions-panel.tsx) (~2)
- [src/components/admin/contests/contest-awards-panel.tsx](src/components/admin/contests/contest-awards-panel.tsx) (~2)
- [src/components/admin/chapter-moderation-table.tsx](src/components/admin/chapter-moderation-table.tsx) (~2)
- [src/components/author/book-overview.tsx](src/components/author/book-overview.tsx) (~1)

Ô nhập "inline" (ô tìm kiếm, khung soạn tin nhắn/bình luận, thanh trượt audio) — kiểu dáng riêng, `Field` hiện chưa hợp; chỉ chuyển nếu kit UI có biến thể phù hợp:

- Khung soạn tin/bình luận: [chat-tab.tsx](src/components/profile/chat-tab.tsx), [chat-bubble-window.tsx](src/components/messenger/chat-bubble-window.tsx), [paragraph-comments-panel.tsx](src/components/reading/paragraph-comments-panel.tsx), [content-comments-panel.tsx](src/components/comments/content-comments-panel.tsx)
- Ô tìm kiếm / nhập nhanh: [nav-bar-content.tsx](src/components/nav-bar-content.tsx), [user-table.tsx](src/components/admin/user-table.tsx), [agreements-tab.tsx](src/components/profile/agreements-tab.tsx), [tag-input.tsx](src/components/author/tag-input.tsx), [reading-list-modal.tsx](src/components/reading/reading-list-modal.tsx)
- Thanh trượt `type="range"`: [now-playing.tsx](src/components/audio/now-playing.tsx), [mini-player-bar.tsx](src/components/audio-hub/mini-player-bar.tsx)

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
