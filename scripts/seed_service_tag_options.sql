-- Seed dữ liệu cho service_tag_options — CHẠY LẠI file này sau khi đã
-- chạy migrations/20260901_add_service_tag_option_metadata.sql (thêm cột
-- tier/rule/multi/optional/warn_text). Idempotent nhờ
-- unique(service_type, group_key, label) + ON CONFLICT DO UPDATE (cập
-- nhật lại metadata nếu hàng đã tồn tại từ lần seed cũ thiếu cột).
--
-- Nguồn: TAG_GROUPS/VOICE_GROUPS trong Vịnh Cá nhân.dc.html (nguyên văn
-- tier/title/rule/options/warnOn) — bản seed trước đó (lần đầu viết) bị
-- sai/thiếu so với thiết kế gốc: "Mức độ hoàn thiện" dùng nhầm 5 lựa chọn
-- tự nghĩ thay vì đúng 4 lựa chọn thiết kế, "Nội dung nhận" thiếu 2 lựa
-- chọn ("Gore/máu me", "Fanart có bản quyền bên thứ ba") và toàn bộ cảnh
-- báo pháp lý đi kèm.

-- Xoá sạch seed cũ (nếu có) trước khi seed lại — options/tier/rule đổi
-- khác hẳn bản đầu, update tại chỗ dễ sót hàng thừa hơn là xoá-rồi-seed.
delete from public.service_tag_options;

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

-- Lưu ý: ghostwriting KHÔNG có tag nào trong thiết kế gốc (TAXONOMY chỉ
-- có 'cover'/'voice') — không seed gì cho service_type='ghostwriting'.
-- Bản seed đầu tiên có seed nhầm content_rating cho ghostwriting, hàng đó
-- đã bị xoá bởi DELETE ở đầu file này.
