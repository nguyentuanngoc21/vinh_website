-- Sửa dữ liệu: ảnh bìa đang gắn vào sách nhưng chưa có published_at.
--
-- Nguyên nhân: từ migrations/archive/20260921_add_design_item_publish_state.sql,
-- view public_design_items chỉ trả ảnh có published_at. Route tải bìa của tác
-- giả (POST /api/authoring/books/[bookId]/cover) tạo design_items mà không set
-- cột này, nên bìa tải lên sau 21/09/2026 không hiện ở trang công khai — thẻ
-- truyện rơi về bìa sinh tự động. Route đã được sửa (set published_at lúc tạo);
-- file này sửa các hàng đã bị ảnh hưởng.
--
-- Chỉ đụng ảnh ĐANG là bìa của 1 sách và chưa bị xoá. Idempotent: chạy lại
-- không đổi gì (chỉ cập nhật hàng còn published_at IS NULL).
-- Là sửa dữ liệu 1 lần — KHÔNG mirror vào migrations/baseline/.

update public.design_items d
set published_at = d.created_at
where d.published_at is null
  and d.deleted_at is null
  and exists (
    select 1 from public.books b where b.cover_design_item_id = d.id
  );

-- Kiểm tra sau khi chạy (phải trả 0 dòng):
-- select b.title, b.slug
-- from public.books b
-- join public.design_items d on d.id = b.cover_design_item_id
-- where d.published_at is null and d.deleted_at is null;
