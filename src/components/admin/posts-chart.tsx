import { CircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { MonthlyPostsPoint } from "@/lib/admin/get-content-trends";

// Trước đây MONTHLY_POSTS bịa hoàn toàn — giờ nhận props thật từ
// getMonthlyPostsTrend() (xem src/app/admin/page.tsx).
export function PostsChart({ points }: { points: MonthlyPostsPoint[] }) {
  const maxValue = Math.max(1, ...points.map((p) => p.chapters + p.audio));

  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="mb-[18px] flex items-center justify-between">
        <div>
          <div className="text-base font-bold text-brand-ink">
            Bài đăng mỗi tháng
          </div>
          <div className="text-xs text-stone-alt">
            Chương xuất bản · 12 tháng gần nhất
          </div>
        </div>
        <div className="flex items-center gap-3.5 text-xs font-medium text-stone-alt">
          <span className="flex items-center gap-1.5">
            <CircleIcon weight="fill" size={9} color="var(--color-brand-ink)" /> Truyện chữ
          </span>
          <span className="flex items-center gap-1.5">
            <CircleIcon weight="fill" size={9} color="var(--color-brand-gold)" /> Audio
          </span>
        </div>
      </div>
      <div className="flex h-[180px] items-end gap-2.5">
        {points.map(({ label, chapters, audio }) => (
          <div
            key={label}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <div className="flex h-full w-full max-w-[26px] flex-col justify-end overflow-hidden rounded-[5px]">
              <div
                style={{ height: `${(audio / maxValue) * 100}%` }}
                className="bg-brand-gold"
              />
              <div
                style={{ height: `${(chapters / maxValue) * 100}%` }}
                className="bg-brand-ink"
              />
            </div>
            <div className="text-[11px] font-medium text-[#a8a29b]">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
