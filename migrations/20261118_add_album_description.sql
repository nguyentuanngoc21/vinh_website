-- Thêm description vào design_albums để album có thể lưu mô tả chung
ALTER TABLE public.design_albums
  ADD COLUMN IF NOT EXISTS description text;
