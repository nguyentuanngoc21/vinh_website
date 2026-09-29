-- =======================================================================
-- Baseline 99 — Seed data  (99_seed_data.sql)
-- =======================================================================
-- Phạm vi: Dữ liệu danh mục cố định: task_templates, achievement_templates,
-- streak_milestones, service_tag_options.
--
-- Đối tượng tạo trong file này:
--   (chỉ INSERT — không tạo đối tượng mới)
--
-- Gộp từ migration (migrations/archive/):
--   20260917_add_design_audio_comments.sql,
--   20260917_seed_phase1_quests_achievements.sql,
--   20260918_add_streak_quests_and_time_windows.sql,
--   20260918_seed_recommendation_quest.sql,
--   20260919_add_bookmark_and_tag_achievements.sql,
--   20260919_add_characters.sql,
--   20260919_add_reading_behavior_achievements.sql
--   + scripts/seed_service_tag_options.sql (bỏ DELETE dọn seed cũ ở đầu script)
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql,
--   02_books_and_chapters.sql, 03_reading.sql, 04_wallet_and_payments.sql,
--   05_quests_and_achievements.sql, 06_social_and_messaging.sql,
--   09_orders_and_services.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- =======================================================================
-- SEED DATA — dữ liệu danh mục cố định (không phải dữ liệu người dùng),
-- gom từ các migration seed + scripts/seed_service_tag_options.sql để 1
-- project trống dựng xong là dùng được ngay. Giữ nguyên ON CONFLICT nên
-- chạy lại an toàn. KHÔNG chứa data fix 1 lần nào (UPDATE/DELETE backfill).
-- 5 task_templates gốc đã có ở 05_quests_and_achievements.sql (phần 7), seed
-- nhiệm vụ sự kiện cuộc thi ở 11_contests.sql (Slice 3.1).
-- =======================================================================

-- task_templates: từ migrations/archive/20260917_seed_phase1_quests_achievements.sql
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

-- achievement_templates: từ migrations/archive/20260917_seed_phase1_quests_achievements.sql
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

-- task_templates: từ migrations/archive/20260917_add_design_audio_comments.sql
INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('designer_interact_readers', 'Thiết kế thân thiện', 'Trả lời hoặc thả tim ít nhất 2 bình luận về thiết kế của bạn.', 'designer', 'engagement', NULL, 2, 15, true),
  ('narrator_interact_listeners', 'Giọng đọc thân thiện', 'Trả lời ít nhất 2 bình luận về audio của bạn.', 'narrator', 'engagement', NULL, 2, 15, true)
ON CONFLICT (code) DO NOTHING;

-- task_templates: từ migrations/archive/20260918_add_streak_quests_and_time_windows.sql
INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('reader_night_owl_read', 'Cú đêm mê đọc', 'Đọc ít nhất 1 chương sách trong khoảng từ 22:00 - 02:00 sáng.', NULL, 'discovery', NULL, 1, 12, true),
  ('reader_morning_fly', 'Đón ngày mới cùng sách', 'Đọc 1 chương sách trong khoảng từ 06:00 - 09:00 sáng.', NULL, 'discovery', NULL, 1, 10, true),
  ('reader_tea_time', 'Độc giả giờ nghỉ', 'Đọc 1 chương sách trong khoảng từ 11:00 - 14:00.', NULL, 'discovery', NULL, 1, 10, true),
  ('reader_peak_hour_session', 'Giờ vàng của bạn', 'Mở ứng dụng/web và đọc trong khung giờ cố định (Sáng 7-9h hoặc Đêm 22-1h).', NULL, 'engagement', NULL, 1, 10, true),
  ('reader_3day_reading_streak', '3 ngày liên tiếp', 'Đọc ít nhất 1 chương mỗi ngày, 3 ngày liên tiếp.', NULL, 'engagement', NULL, 3, 20, true)
ON CONFLICT (code) DO NOTHING;

-- achievement_templates: từ migrations/archive/20260918_add_streak_quests_and_time_windows.sql
INSERT INTO public.achievement_templates (code, for_role, title, description, icon, color_token, metric, threshold, reward_tokens, active)
VALUES
  ('reader_streak_7d', NULL, 'Bền bỉ 7 ngày', 'Đọc sách liên tục 7 ngày không ngắt quãng.', 'flame', 'reader', NULL, NULL, 0, true),
  ('reader_streak_30d', NULL, 'Đam mê bất tận', 'Đọc sách liên tục 30 ngày không ngắt quãng.', 'flame', 'reader', NULL, NULL, 0, true),
  ('reader_streak_100d', NULL, 'Huyền thoại kiên trì', 'Đọc sách liên tục 100 ngày không ngắt quãng.', 'flame', 'reader', NULL, NULL, 0, true)
ON CONFLICT (code) DO NOTHING;

-- streak_milestones: từ migrations/archive/20260918_add_streak_quests_and_time_windows.sql
INSERT INTO public.streak_milestones (streak_days, reward_token, badge_id)
VALUES
  (7, 30, (SELECT id FROM public.achievement_templates WHERE code = 'reader_streak_7d')),
  (30, 150, (SELECT id FROM public.achievement_templates WHERE code = 'reader_streak_30d')),
  (100, 300, (SELECT id FROM public.achievement_templates WHERE code = 'reader_streak_100d'))
ON CONFLICT (streak_days) DO UPDATE SET badge_id = excluded.badge_id;

-- task_templates: từ migrations/archive/20260918_seed_recommendation_quest.sql
INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('reader_view_recommendations', 'Xem gợi ý cho bạn', 'Xem trang giới thiệu của 3 tác phẩm trong mục gợi ý.', NULL, 'discovery', NULL, 3, 8, true)
ON CONFLICT (code) DO NOTHING;

-- achievement_templates: từ migrations/archive/20260919_add_reading_behavior_achievements.sql
INSERT INTO public.achievement_templates (code, for_role, title, description, icon, color_token, metric, threshold, reward_tokens, active)
VALUES
  ('reader_finish_story', NULL, 'Hoàn thành một hành trình', 'Đọc hết một truyện hoàn chỉnh.', 'book', 'reader', 'finished_stories_count', 1, 20, true),
  ('reader_read_series', NULL, 'Theo dõi một series', 'Đọc ít nhất 5 chương liên tiếp của cùng một truyện.', 'book', 'reader', 'longest_consecutive_chapters', 5, 15, true),
  ('reader_return_next_day', NULL, 'Quay lại ngày mai', 'Trở lại đọc tiếp sau ngày đầu tiên.', 'trophy', 'reader', 'distinct_reading_days_count', 2, 10, true),
  ('reader_read_multiple_sessions', NULL, 'Đọc nhiều phiên', 'Có ít nhất 3 phiên đọc trong ngày.', 'trophy', 'reader', 'max_reading_sessions_per_day', 3, 10, true),
  ('reader_continue_after_pause', NULL, 'Tiếp tục hành trình', 'Quay lại truyện sau 7 ngày không đọc.', 'trophy', 'reader', 'max_gap_days_same_book', 7, 15, true),
  ('reader_comeback_15d', NULL, 'Không bỏ cuộc', 'Quay lại truyện đã ngưng đọc được 15 ngày.', 'flame', 'reader', 'max_gap_days_same_book', 15, 20, true),
  ('reader_weekend_reader', NULL, 'Cuối tuần cùng truyện', 'Đọc sách trong cả 2 ngày thứ Bảy & Chủ Nhật.', 'flame', 'reader', 'weekend_both_days_read', 1, 15, true),
  ('reader_genre_loyalist', NULL, 'Kẻ săn thể loại', 'Đọc ≥5 truyện cùng thể loại.', 'trophy', 'reader', 'max_books_read_same_genre', 5, 30, true),
  ('reader_genre_switcher', NULL, 'Kẻ đổi vị', 'Đọc 5 thể loại khác nhau trong vòng 15 ngày.', 'trophy', 'reader', 'max_genres_within_15_days', 5, 40, true),
  ('reader_first_topup', NULL, 'Người ủng hộ đầu tiên', 'Thực hiện nạp token lần đầu tiên.', 'trophy', 'reader', 'topup_count', 1, 0, true)
ON CONFLICT (code) DO NOTHING;

-- achievement_templates: từ migrations/archive/20260919_add_bookmark_and_tag_achievements.sql
INSERT INTO public.achievement_templates (code, for_role, title, description, icon, color_token, metric, threshold, reward_tokens, active)
VALUES
  ('reader_tragedy_hunter', NULL, 'Người săn bi kịch', 'Hoàn thành 10 truyện có kết buồn.', 'trophy', 'reader', 'sad_ending_finished_count', 10, 50, true),
  ('reader_underdog_reader', NULL, 'Đi ngược số đông', 'Đọc hết 1 bộ truyện dưới 50 view.', 'trophy', 'reader', 'underrated_finished_count', 1, 20, true),
  ('reader_first_bookmark_collection', NULL, 'Bộ sưu tập đầu tiên', 'Bookmark 5 truyện.', 'trophy', 'reader', 'bookmarked_books_count', 5, 15, true),
  ('reader_genre_bookmark_collector', NULL, 'Nhà sưu tầm thể loại', 'Bookmark 5 truyện cùng genre.', 'trophy', 'reader', 'max_bookmarked_books_same_genre', 5, 20, true),
  ('reader_save_10_quotes', NULL, 'Người giữ ký ức', 'Lưu 10 đoạn yêu thích.', 'book', 'reader', 'saved_highlights_count', 10, 20, true)
ON CONFLICT (code) DO NOTHING;

-- achievement_templates: từ migrations/archive/20260919_add_characters.sql
INSERT INTO public.achievement_templates (code, for_role, title, description, icon, color_token, metric, threshold, reward_tokens, active)
VALUES
  ('reader_follow_villain', NULL, 'Kẻ tìm kiếm phản diện', 'Theo dõi 1 nhân vật villain.', 'trophy', 'reader', 'villain_followed_count', 1, 10, true),
  ('reader_follow_hero', NULL, 'Người yêu chính nghĩa', 'Theo dõi 1 nhân vật người hùng.', 'trophy', 'reader', 'hero_followed_count', 1, 10, true),
  ('reader_character_guardian', NULL, 'Người bảo hộ nhân vật', 'Follow một nhân vật và đọc toàn bộ chương có nhân vật đó.', 'trophy', 'reader', 'character_guardian_achieved', 1, 30, true)
ON CONFLICT (code) DO NOTHING;

-- task_templates: từ migrations/archive/20260919_add_characters.sql
INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('reader_vote_trope', 'Bắt đúng gu nhân vật', 'Bình chọn mẫu hình nhân vật bạn thích nhất trong chương (vd: Ma vương, Trượng nghĩa, Lạnh lùng).', NULL, 'lore_hunt', NULL, 1, 10, true)
ON CONFLICT (code) DO NOTHING;

-- service_tag_options: từ scripts/seed_service_tag_options.sql (bỏ
-- "delete from public.service_tag_options" ở đầu script đó — chỉ để dọn
-- seed cũ trên DB đã có dữ liệu, không cần cho project trống).
insert into public.service_tag_options
  (service_type, group_key, group_label, label, sort_order, tier, rule, multi, optional, warn_text)
values
  -- illustration: Tầng 1 — Loại sản phẩm (chọn nhiều)
  ('illustration', 'g1', 'Loại sản phẩm', 'Bìa truyện/sách', 1, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Nhân vật đơn (character art)', 2, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Nhân vật nhóm/cảnh nhiều người', 3, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Vũ khí/trang bị', 4, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Bối cảnh/phong cảnh', 5, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Linh vật/thú cưng giả tưởng', 6, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Trang phục/thiết kế thời trang', 7, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Chibi/deform', 8, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Biểu tượng cảm xúc (emote pack)', 9, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Logo/huy hiệu/icon', 10, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Fanart', 11, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  ('illustration', 'g1', 'Loại sản phẩm', 'Tranh đôi/couple art', 12, 'Tầng 1', 'Chọn nhiều — quyết định gói của bạn xuất hiện ở nhóm tìm kiếm nào.', true, false, null),
  -- illustration: Tầng 2 — Phong cách nghệ thuật (chọn nhiều)
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Anime/manga', 1, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Bán tả thực', 2, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Tả thực', 3, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Chibi', 4, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Phẳng/vector (flat design)', 5, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Cổ trang/historical', 6, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Dark fantasy/gothic', 7, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Pixel art', 8, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', 'Tranh vẽ tay (painterly/màu nước)', 9, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  ('illustration', 'g2', 'Phong cách nghệ thuật', '3D/render', 10, 'Tầng 2', 'Chọn nhiều — chỉ khai đúng năng lực thật, khách đối chiếu với mẫu ở mục 11.', true, false, null),
  -- illustration: Tầng 3 — Mức độ hoàn thiện (chọn ĐÚNG 1 — mỗi mức là 1 gói giá riêng)
  ('illustration', 'g3', 'Mức độ hoàn thiện', 'Line art (chỉ nét)', 1, 'Tầng 3', 'Chọn 1 — mỗi mức giá là một gói riêng, không phải thẻ tự do.', false, false, null),
  ('illustration', 'g3', 'Mức độ hoàn thiện', 'Flat color (tô màu phẳng)', 2, 'Tầng 3', 'Chọn 1 — mỗi mức giá là một gói riêng, không phải thẻ tự do.', false, false, null),
  ('illustration', 'g3', 'Mức độ hoàn thiện', 'Full color + đổ bóng', 3, 'Tầng 3', 'Chọn 1 — mỗi mức giá là một gói riêng, không phải thẻ tự do.', false, false, null),
  ('illustration', 'g3', 'Mức độ hoàn thiện', 'Rendered chi tiết (painterly hoàn thiện cao)', 4, 'Tầng 3', 'Chọn 1 — mỗi mức giá là một gói riêng, không phải thẻ tự do.', false, false, null),
  -- illustration: Tầng 4 — Nội dung nhận (chọn nhiều, BẮT BUỘC, có cảnh báo)
  ('illustration', 'g4', 'Nội dung nhận', 'SFW (an toàn)', 1, 'Tầng 4', 'Bắt buộc khai báo — đây là căn cứ kiểm duyệt, không phải thẻ trang trí.', true, false, null),
  ('illustration', 'g4', 'Nội dung nhận', 'NSFW nhẹ (gợi cảm, không khỏa thân)', 2, 'Tầng 4', 'Bắt buộc khai báo — đây là căn cứ kiểm duyệt, không phải thẻ trang trí.', true, false, null),
  ('illustration', 'g4', 'Nội dung nhận', 'NSFW 18+ (cần xác thực tuổi cả hai bên)', 3, 'Tầng 4', 'Bắt buộc khai báo — đây là căn cứ kiểm duyệt, không phải thẻ trang trí.', true, false, 'Gói 18+ chỉ hiện với tài khoản đã xác thực tuổi. Cả bạn và khách đều phải xác thực trước khi mở đơn.'),
  ('illustration', 'g4', 'Nội dung nhận', 'Gore/máu me', 4, 'Tầng 4', 'Bắt buộc khai báo — đây là căn cứ kiểm duyệt, không phải thẻ trang trí.', true, false, 'Bản giao sẽ bị làm mờ mặc định trong hội thoại và không xuất hiện ở trang chủ.'),
  ('illustration', 'g4', 'Nội dung nhận', 'Fanart có bản quyền bên thứ ba', 5, 'Tầng 4', 'Bắt buộc khai báo — đây là căn cứ kiểm duyệt, không phải thẻ trang trí.', true, false, 'Rủi ro pháp lý về sở hữu trí tuệ thuộc về bạn. Vịnh gắn cảnh báo IP lên gói và không hỗ trợ khi chủ sở hữu khiếu nại.'),
  -- voice: Tầng 1 — Lồng tiếng (chọn nhiều, KHÔNG bắt buộc riêng — xem ANY_OF ở service-listing-service.ts)
  ('voice', 'v1', 'Lồng tiếng', 'Người kể chuyện', 1, 'Tầng 1', 'Chọn nhiều — bỏ trống nếu bạn chỉ nhận nhạc cụ.', true, true, null),
  ('voice', 'v1', 'Lồng tiếng', 'Thoại nhân vật một giọng', 2, 'Tầng 1', 'Chọn nhiều — bỏ trống nếu bạn chỉ nhận nhạc cụ.', true, true, null),
  ('voice', 'v1', 'Lồng tiếng', 'Thoại nhân vật nhiều giọng', 3, 'Tầng 1', 'Chọn nhiều — bỏ trống nếu bạn chỉ nhận nhạc cụ.', true, true, null),
  -- voice: Tầng 2 — Nhạc cụ (chọn nhiều, KHÔNG bắt buộc riêng)
  ('voice', 'v2', 'Nhạc cụ', 'Sáo', 1, 'Tầng 2', 'Chọn nhiều — bỏ trống nếu bạn chỉ nhận lồng tiếng. Cần ít nhất một thẻ ở một trong hai tầng.', true, true, null),
  ('voice', 'v2', 'Nhạc cụ', 'Piano', 2, 'Tầng 2', 'Chọn nhiều — bỏ trống nếu bạn chỉ nhận lồng tiếng. Cần ít nhất một thẻ ở một trong hai tầng.', true, true, null),
  ('voice', 'v2', 'Nhạc cụ', 'Trống', 3, 'Tầng 2', 'Chọn nhiều — bỏ trống nếu bạn chỉ nhận lồng tiếng. Cần ít nhất một thẻ ở một trong hai tầng.', true, true, null)
on conflict (service_type, group_key, label) do update
  set sort_order = excluded.sort_order, tier = excluded.tier, rule = excluded.rule,
      multi = excluded.multi, optional = excluded.optional, warn_text = excluded.warn_text;
