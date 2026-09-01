-- Seed dữ liệu ban đầu cho service_tag_options — chạy 1 lần ngay sau
-- migrations/20260901_add_service_tag_catalog.sql (cùng đợt). Idempotent
-- nhờ unique(service_type, group_key, label) + ON CONFLICT DO NOTHING —
-- an toàn chạy lại nhiều lần.
--
-- product_type/art_style lấy đúng danh sách "Thiết kế" ở mega menu Trang
-- chủ; voice_type/instrument lấy đúng danh sách "Audio". finish_level và
-- content_rating là 2 nhóm mới, xem ghi chú trong migration đã dẫn.

insert into public.service_tag_options (service_type, group_key, group_label, label, sort_order) values
  -- illustration: Loại sản phẩm
  ('illustration', 'product_type', 'Loại sản phẩm', 'Bìa truyện/sách', 1),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Nhân vật đơn (character art)', 2),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Nhân vật nhóm / cảnh nhiều người', 3),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Vũ khí / trang bị', 4),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Bối cảnh / phong cảnh', 5),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Linh vật / thú cưng giả tưởng', 6),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Trang phục / thiết kế thời trang', 7),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Chibi / deform', 8),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Biểu tượng cảm xúc (emote pack)', 9),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Logo / huy hiệu / icon', 10),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Fanart', 11),
  ('illustration', 'product_type', 'Loại sản phẩm', 'Tranh đôi / couple art', 12),
  -- illustration: Phong cách nghệ thuật
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Anime / manga', 1),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Bán tả thực', 2),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Tả thực', 3),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Chibi', 4),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Phẳng / vector (flat design)', 5),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Cổ trang / historical', 6),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Dark fantasy / gothic', 7),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Pixel art', 8),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', 'Tranh vẽ tay (painterly / màu nước)', 9),
  ('illustration', 'art_style', 'Phong cách nghệ thuật', '3D / render', 10),
  -- illustration: Mức độ hoàn thiện (ảnh hưởng bảng giá — mỗi mức = 1 dòng giá)
  ('illustration', 'finish_level', 'Mức độ hoàn thiện', 'Phác thảo (sketch)', 1),
  ('illustration', 'finish_level', 'Mức độ hoàn thiện', 'Line art', 2),
  ('illustration', 'finish_level', 'Mức độ hoàn thiện', 'Flat color (tô màu phẳng)', 3),
  ('illustration', 'finish_level', 'Mức độ hoàn thiện', 'Full color + đổ bóng', 4),
  ('illustration', 'finish_level', 'Mức độ hoàn thiện', 'Full color + hiệu ứng nâng cao', 5),
  -- voice: Lồng tiếng
  ('voice', 'voice_type', 'Lồng tiếng', 'Người kể chuyện', 1),
  ('voice', 'voice_type', 'Lồng tiếng', 'Thoại nhân vật một giọng', 2),
  ('voice', 'voice_type', 'Lồng tiếng', 'Thoại nhân vật nhiều giọng', 3),
  -- voice: Nhạc cụ
  ('voice', 'instrument', 'Nhạc cụ', 'Sáo', 1),
  ('voice', 'instrument', 'Nhạc cụ', 'Piano', 2),
  ('voice', 'instrument', 'Nhạc cụ', 'Trống', 3),
  -- content_rating: dùng chung cho cả 3 service_type — NSFW 18+ kích hoạt
  -- xác thực tuổi bắt buộc (Mục 2.2 đặc tả), chặn tạo Order nếu 1 trong 2
  -- bên chưa xác thực tuổi (kiểm tra ở service layer khi tạo Order, xem
  -- ghi chú trong service-listing-service.ts).
  ('illustration', 'content_rating', 'Nội dung nhận', 'SFW (an toàn)', 1),
  ('illustration', 'content_rating', 'Nội dung nhận', 'NSFW nhẹ (gợi cảm, không khỏa thân)', 2),
  ('illustration', 'content_rating', 'Nội dung nhận', 'NSFW 18+ (yêu cầu xác thực tuổi)', 3),
  ('voice', 'content_rating', 'Nội dung nhận', 'SFW (an toàn)', 1),
  ('voice', 'content_rating', 'Nội dung nhận', 'NSFW nhẹ (gợi cảm, không khỏa thân)', 2),
  ('voice', 'content_rating', 'Nội dung nhận', 'NSFW 18+ (yêu cầu xác thực tuổi)', 3),
  ('ghostwriting', 'content_rating', 'Nội dung nhận', 'SFW (an toàn)', 1),
  ('ghostwriting', 'content_rating', 'Nội dung nhận', 'NSFW nhẹ (gợi cảm, không khỏa thân)', 2),
  ('ghostwriting', 'content_rating', 'Nội dung nhận', 'NSFW 18+ (yêu cầu xác thực tuổi)', 3)
on conflict (service_type, group_key, label) do nothing;
