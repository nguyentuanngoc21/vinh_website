-- Index cho các truy vấn nóng mà trước đây chỉ có PK (quét toàn bảng).
-- Nguồn: rà soát tải DB 29/09/2026 — mỗi index ghi rõ đường dẫn code dùng nó.
-- Idempotent (IF NOT EXISTS). Chỉ thêm index, không đổi dữ liệu/quyền.
--
-- Chạy trên dev/staging trước. Các bảng hiện còn nhỏ nên CREATE INDEX
-- thường (khoá ghi rất ngắn) là đủ; nếu bảng đã lớn, chạy từng lệnh riêng
-- lẻ với CREATE INDEX CONCURRENTLY (không được bọc trong transaction).

-- reading_history: record_chapter_read() dedupe, reading-event-service.ts,
-- reward-engine.ts, sync_user_achievements(), recommend_books().
create index if not exists reading_history_user_chapter_read_idx
  on public.reading_history (user_id, chapter_id, read_at);
create index if not exists reading_history_user_read_at_idx
  on public.reading_history (user_id, read_at desc) include (book_id);

-- transactions: lịch sử ví (wallet-service.ts), rút tiền, achievements.
create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

-- chapters: mục lục trang đọc / /truyen/[slug], home, rankings, workspace.
create index if not exists chapters_book_order_idx
  on public.chapters (book_id, order_index);

-- books: sidebar tác giả, workspace, /ket-noi, achievements (theo tác giả).
create index if not exists books_author_created_idx
  on public.books (author_id, created_at desc) where deleted_at is null;

-- purchase_transactions: tra theo chương (unique (buyer_id, chapter_id)
-- không dùng được khi chỉ lọc chapter_id).
create index if not exists purchase_transactions_chapter_idx
  on public.purchase_transactions (chapter_id);

-- orders: đếm đơn đang làm theo gói dịch vụ.
create index if not exists orders_listing_status_idx
  on public.orders (listing_id, status);

-- /ket-noi: tác phẩm theo từng người.
create index if not exists design_items_illustrator_created_idx
  on public.design_items (illustrator_id, created_at desc);
create index if not exists audio_narrations_narrator_created_idx
  on public.audio_narrations (narrator_id, created_at desc);
create index if not exists author_name_agreements_ghostwriter_idx
  on public.author_name_agreements (ghostwriter_id);
create index if not exists author_name_agreements_customer_idx
  on public.author_name_agreements (customer_id);

-- wallet-service.ts: tra giao dịch trả thưởng cuộc thi.
create index if not exists contest_awards_payout_txn_idx
  on public.contest_awards (payout_transaction_id) where payout_transaction_id is not null;

-- Cron purge-deleted-content: chỉ quét hàng đang chờ dọn.
create index if not exists chapters_pending_purge_idx
  on public.chapters (removed_at) where removed_at is not null and content_purged_at is null;
create index if not exists books_pending_purge_idx
  on public.books (deleted_at) where deleted_at is not null and content_purged_at is null;
