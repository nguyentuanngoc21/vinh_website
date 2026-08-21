"use client";

import { CoinsIcon } from "@phosphor-icons/react/dist/ssr";
import { CopyrightSettings } from "@/components/author/copyright-settings";
import { GenreSelect } from "@/components/ui";
import type { BookGenre } from "@/lib/supabase/types";

type PublishPanelProps = {
  published: boolean;
  saving: boolean;
  error: string | null;
  onSaveDraft: () => void;
  onPublish: () => void;
  isExclusive: boolean;
  onExclusiveChange: (value: boolean) => void;
  price: number;
  onPriceChange: (value: number) => void;
  genre: BookGenre | null;
  onGenreChange: (genre: BookGenre) => void;
};

/**
 * Bỏ hẳn khối "Trạng thái · Công khai/Hẹn giờ" cũ — 2 <div> đó chưa từng
 * có onClick, và không có cột nào trên `chapters` để lưu (khác
 * published, vốn đã ánh xạ trực tiếp qua nút Lưu nháp/Xuất bản bên
 * dưới). Thêm khối "Thể loại" (GenreSelect) — trước đây trang này không
 * có cách nào chọn genre cho sách.
 */
export function PublishPanel({
  published,
  saving,
  error,
  onSaveDraft,
  onPublish,
  isExclusive,
  onExclusiveChange,
  price,
  onPriceChange,
  genre,
  onGenreChange,
}: PublishPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto border-l border-cream-border bg-white">
      <div className="flex gap-2.5 border-b border-cream-border px-[22px] py-5">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving}
          className="flex-1 cursor-pointer rounded-[9px] border border-brand-ink py-[11px] text-center text-sm font-semibold text-brand-ink transition-opacity disabled:cursor-default disabled:opacity-60"
        >
          {saving ? "Đang lưu…" : "Lưu nháp"}
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          className="flex-1 cursor-pointer rounded-[9px] bg-brand-gold py-[11px] text-center text-sm font-bold text-brand-ink transition-opacity disabled:cursor-default disabled:opacity-60"
        >
          {saving ? "Đang lưu…" : published ? "Cập nhật" : "Xuất bản"}
        </button>
      </div>

      <div className="p-[22px]">
        <div className="mb-3.5 text-xs font-bold tracking-wide text-stone-alt">XUẤT BẢN</div>

        {error && (
          <div className="mb-3.5 rounded-lg border border-[#f3c6c6] bg-[#fdf1f1] px-3 py-2.5 text-[12.5px] font-medium text-[#B02A37]">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-col gap-3.5">
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-[#5C5650]">Thể loại</div>
            <GenreSelect value={genre} onChange={onGenreChange} />
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-[#5C5650]">
              Quyền độc quyền
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onExclusiveChange(true)}
                className={`flex-1 cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  isExclusive
                    ? "bg-brand-ink text-white"
                    : "border border-cream-border bg-white text-stone-alt"
                }`}
              >
                Độc quyền
              </button>
              <button
                type="button"
                onClick={() => onExclusiveChange(false)}
                className={`flex-1 cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  !isExclusive
                    ? "bg-brand-ink text-white"
                    : "border border-cream-border bg-white text-stone-alt"
                }`}
              >
                Không độc quyền
              </button>
            </div>
            <div className="mt-2 text-[12px] text-stone-alt">
              {isExclusive
                ? "Truyện này chỉ được phân phối trên Vịnh. Tác giả giữ quyền tái bản."
                : "Tác giả có thể xuất bản truyện này ở các nền tảng khác."}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-[#5C5650]">Giá chương</div>
            <div className="flex items-center rounded-lg border border-cream-border px-3 py-2.5">
              <CoinsIcon color="var(--color-brand-gold)" />
              <input
                type="number"
                min="0"
                step="1000"
                value={price}
                onChange={(event) => onPriceChange(Math.max(0, Number(event.target.value) || 0))}
                className="ml-2 w-full bg-transparent text-sm font-semibold outline-none"
              />
              <span className="ml-2 text-sm text-stone-alt">token</span>
            </div>
          </div>
        </div>

        <CopyrightSettings />
      </div>
    </div>
  );
}
