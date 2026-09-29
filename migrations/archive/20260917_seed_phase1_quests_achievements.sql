-- Migration: Seed Phase 1 — nhiệm vụ ngày + thành tựu "Nhóm A đã lọc lại"
-- từ docs/nhiem-vu-thanh-tuu-hoan-thanh.xlsx (bảng bạn soạn), sau khi rà
-- lại với hệ thống thật (xem thảo luận trong phiên làm việc — mã nào cần
-- hạ tầng mới đã bị loại ra, để dành các phase sau):
--
-- LOẠI RA (chưa import ở đây, cần hạ tầng/tính năng riêng):
--   reader_view_recommendations, reader_try_recommended_story — chưa có
--     "gợi ý" thật (recommend_books() tồn tại nhưng chưa nối vào UI nào).
--   reader_read_minutes, reader_read_minutes_30 — cần đo thời lượng đọc
--     liên tục, Phase 0 chỉ ghi nhận SỰ KIỆN hoàn thành chương, không đo
--     thời gian phiên đọc.
--   reader_night_owl_read, reader_morning_fly, reader_tea_time,
--     reader_peak_hour_session, reader_3day_reading_streak — nhóm
--     "giờ vàng"/streak-ngày, để cùng phase với reader_streak_7d/30d/100d
--     (cần cơ chế set progress trực tiếp từ current_quest_streak, khác mô
--     hình increment tích luỹ thường).
--   reader_lore_hunt_highlight, reader_hidden_detail_hunter,
--     reader_cross_read_2_stories, reader_cross_compare_comment,
--     reader_predict_comment, reader_return_on_release, reader_vote_trope,
--     reader_like_character, reader_three_picks_today — cần nội dung
--     sinh riêng theo chương (AI/quest_examples_pool), khái niệm "nhân
--     vật" (chưa tồn tại), hoặc theo dõi thời điểm ra chương — không phải
--     wiring đơn giản.
--   designer_interact_readers, narrator_interact_listeners — chưa có bảng
--     comment nào cho design_items/audio_narrations.
--   reader_read_all_genres — XOÁ theo đề nghị của bạn (trùng thành tựu
--     reader_genre_explorer, đã active=False sẵn trong file).
--
-- reader_try_recommended_story ĐÃ gộp vào reader_view_recommendations theo
-- yêu cầu — cả 2 đều nằm trong nhóm "chưa import" ở trên, gộp không đổi gì
-- ở migration này (chỉ ảnh hưởng khi soạn nội dung sau này).
--
-- reader_read_underrated/reader_read_top_rated dùng ngưỡng view_count bạn
-- chốt: <50 = ít lượt xem, >300 = rating cao (đổi tên khái niệm — dùng
-- view_count thay vì rating vì nền tảng CHƯA có bảng đánh giá/rating nào).
--
-- reader_avid_reader: file để metric/threshold TRỐNG (thành tựu tĩnh) vì
-- lúc soạn file chưa có metric 'chapters_read'. Threshold 50 khớp CHÍNH
-- XÁC với mô tả ("đọc từ 50 chương trở lên") nên map thẳng sang
-- metric=chapters_read, threshold=50 — tự động tính được, không cần nối
-- tay. Nếu bạn muốn giữ tĩnh (không tự tính) thay vào đó, sửa lại
-- metric/threshold NULL sau khi chạy migration này.
--
-- reward_tokens của reader_100_chapters/reader_500_chapters lấy đúng số
-- trong file (30/80) — không có trong bảng trích dẫn ở ghi chú trên vì
-- không cần giải thích thêm.
--
-- Nối hành động thật cho từng mã (comment, follow, thêm tủ sách, publish
-- chương/audio/design, chia sẻ, đọc chương...) đã làm trong cùng đợt code
-- này (src/lib/quests/reading-event-service.ts + các route liên quan) —
-- migration này CHỈ chèn dữ liệu, không đổi schema.
--
-- Idempotent — ON CONFLICT (code) DO NOTHING, an toàn chạy lại nhiều lần.
-- Chạy SAU migrations/20260917_add_reading_event_log.sql (cần 3 metric
-- mới đã mở ở đó).

BEGIN;

INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('reader_read_3_chapters', 'Đọc 3 chương bất kỳ', 'Đọc xong 3 chương của bất kỳ truyện nào hôm nay (ngoại trừ truyện tiên hiệp)', NULL, 'engagement', '!Tiên hiệp/ kiếm hiệp', 3, 10, true),
  ('reader_comment_1', 'Để lại 1 bình luận tốt', 'Bình luận điểm tốt ở bất kỳ chương nào bạn đang đọc.', NULL, 'engagement', NULL, 1, 8, true),
  ('reader_paragraph_comment', 'Soi từng câu chữ', 'Để lại 1 bình luận ngay tại dòng/đoạn văn bạn ấn tượng.', NULL, 'engagement', NULL, 1, 10, true),
  ('author_publish_chapter', 'Ra chương mới', 'Xuất bản 1 chương mới cho 1 trong các truyện của bạn.', 'author', 'discovery', NULL, 1, 20, true),
  ('narrator_upload_audio', 'Thu âm 1 chương', 'Đăng 1 audio lồng tiếng mới.', 'narrator', 'discovery', NULL, 1, 20, true),
  ('designer_upload_design', 'Đăng 1 thiết kế', 'Đăng 1 thiết kế/minh hoạ mới.', 'designer', 'discovery', NULL, 1, 20, true),
  ('reader_read_new_genre', 'Đọc thể loại mới', 'Đọc thử 1 chương thuộc thể loại bạn chưa từng đọc.', NULL, 'discovery', NULL, 1, 10, true),
  ('reader_follow_new_author', 'Theo dõi tác giả mới', 'Follow 1 tác giả bạn chưa từng theo dõi.', NULL, 'discovery', NULL, 1, 8, true),
  ('reader_add_wishlist', 'Thêm vào tủ sách', 'Thêm 1 truyện vào tủ sách/wishlist của bạn.', NULL, 'discovery', NULL, 1, 6, true),
  ('reader_complete_chapter', 'Hoàn thành 1 chương', 'Đọc hết 1 chương bất kỳ.', NULL, 'engagement', NULL, 1, 8, true),
  ('reader_complete_3_chapters', 'Kẻ nghiền chương', 'Đọc hết 3 chương bất kỳ.', NULL, 'engagement', NULL, 3, 12, true),
  ('author_interact_readers', 'Tác giả thân thiện', 'Trả lời ít nhất 2 bình luận của độc giả trong tác phẩm của mình.', 'author', 'engagement', NULL, 2, 15, true),
  ('reader_share_story', 'Chia sẻ truyện yêu thích', 'Chia sẻ 1 truyện bạn đang đọc ra ngoài (mạng xã hội, bạn bè).', NULL, 'engagement', NULL, 1, 10, true),
  ('reader_read_underrated', 'Ẩn danh nhưng hay', 'Đọc một truyện ít lượt xem (dưới 50 lượt xem).', NULL, 'discovery', NULL, 1, 10, true),
  ('reader_read_top_rated', 'Khám phá kho báu', 'Đọc 1 truyện được nhiều người xem (trên 300 lượt xem).', NULL, 'discovery', NULL, 1, 10, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.achievement_templates (code, for_role, title, description, icon, color_token, metric, threshold, reward_tokens, active)
VALUES
  ('author_first_book', 'author', 'Tân binh cầm bút', 'Đăng và xuất bản truyện đầu tiên.', 'book', 'author', 'books_published', 1, 0, true),
  ('author_5_books', 'author', 'Cây bút sung sức', 'Xuất bản 5 truyện trên nền tảng.', 'trophy', 'author', 'books_published', 5, 50, true),
  ('author_10_books', 'author', 'Cây đại thụ', 'Xuất bản 10 truyện trên nền tảng.', 'trophy', 'author', 'books_published', 10, 100, true),
  ('narrator_first_audio', 'narrator', 'Giọng đọc đầu tiên', 'Đăng audio lồng tiếng đầu tiên.', 'mic', 'narrator', 'audio_published', 1, 0, true),
  ('narrator_5_audios', 'narrator', 'Giọng đọc sung sức', 'Đăng 5 audio lồng tiếng.', 'mic', 'narrator', 'audio_published', 5, 50, true),
  ('designer_first_design', 'designer', 'Nét vẽ đầu tay', 'Đăng thiết kế/minh hoạ đầu tiên.', 'brush', 'designer', 'design_published', 1, 0, true),
  ('designer_5_designs', 'designer', 'Cọ vẽ sung sức', 'Đăng 5 thiết kế/minh hoạ.', 'brush', 'designer', 'design_published', 5, 50, true),
  ('reader_genre_explorer', NULL, 'Đa di năng', 'Đọc tác phẩm thuộc 5 thể loại khác nhau.', 'trophy', 'reader', 'genres_read_count', 5, 50, true),
  ('reader_100_chapters', NULL, 'Đọc giả chuyên cần', 'Đọc từ 100 chương trở lên trên Vịnh.', 'book', 'reader', 'chapters_read', 100, 30, true),
  ('reader_500_chapters', NULL, 'Đại đọc giả', 'Đọc từ 500 chương trở lên trên Vịnh.', 'trophy', 'reader', 'chapters_read', 500, 80, true),
  ('reader_night_owl_master', NULL, 'Tri kỷ của đêm', 'Hoàn tất 30 lượt đọc vào khung giờ đêm (22h - 2h).', 'flame', 'reader', 'night_reads_count', 30, 80, true),
  ('reader_avid_reader', NULL, 'Mọt sách', 'Đọc từ 50 chương trở lên trên Vịnh.', 'book', 'reader', 'chapters_read', 50, 0, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Notes:
-- 1. Không cần đổi docs/supabase/schema.sql — migration này chỉ SEED dữ
--    liệu, không đổi cấu trúc bảng nào.
-- 2. Đã wiring xong (cùng đợt code, không nằm trong file SQL này):
--    - src/lib/quests/reading-event-service.ts — reader_complete_chapter,
--      reader_complete_3_chapters, reader_read_3_chapters (loại trừ thể
--      loại "Tiên hiệp/ kiếm hiệp"), reader_read_new_genre,
--      reader_read_underrated, reader_read_top_rated — mọi mã đều tăng
--      tiến trình từ sự kiện hoàn thành chương ở đây.
--    - src/app/api/chapters/[chapterId]/comments/route.ts —
--      reader_comment_1, reader_paragraph_comment (bình luận gốc),
--      author_interact_readers (reply của tác giả, không tự trả lời
--      chính mình).
--    - src/app/api/authors/[authorId]/follow/route.ts — reader_follow_new_author.
--    - src/app/api/reading-lists/[listId]/items/route.ts — reader_add_wishlist.
--    - src/app/api/authoring/chapters/[chapterId]/route.ts — author_publish_chapter
--      (chỉ tính đúng lần chuyển nháp -> xuất bản).
--    - src/app/api/audio/route.ts + src/app/api/authoring/chapters/[chapterId]/audio/record/route.ts
--      — narrator_upload_audio.
--    - src/app/api/design/route.ts — designer_upload_design.
--    - src/app/api/books/[bookId]/share/route.ts (MỚI) + src/components/reading/reader.tsx
--      (handleShareStory/handleShareExcerpt) — reader_share_story.
-- 3. task_templates.genre dùng quy ước MỚI (chưa có trước migration này,
--    tự định nghĩa vì cột này trước giờ không được code nào đọc): trống =
--    mọi thể loại, "!<Genre>" = loại trừ đúng thể loại đó (khớp chính xác
--    1 trong 10 giá trị BookGenre, src/lib/supabase/types.ts), "<Genre>"
--    (không có "!") = CHỈ tính thể loại đó. Chỉ có
--    reading-event-service.ts đọc quy ước này hiện tại.