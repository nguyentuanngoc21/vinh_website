import type { WeeklySignupsPoint } from "@/lib/admin/get-content-trends";

// Trước đây là 1 polyline SVG viết tay (points="0,98 56,84 ...") — không
// phải dữ liệu thật. Giờ vẽ từ getWeeklySignupsTrend() thật (xem
// src/app/admin/page.tsx), scale theo max thật thay vì toạ độ cứng.
export function SignupsChart({ points }: { points: WeeklySignupsPoint[] }) {
  const width = 340;
  const height = 130;
  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - (p.count / maxCount) * (height - 12) - 6;
    return { x, y };
  });
  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPoints = `${linePoints} ${width},${height} 0,${height}`;
  const last = coords[coords.length - 1];

  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="text-base font-bold text-brand-ink">
        Người đăng ký mới
      </div>
      <div className="mb-4 mt-1 text-xs text-stone-alt">
        Theo tuần · 30 ngày
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[130px] w-full">
        <polyline fill="none" stroke="var(--color-brand-gold)" strokeWidth={2.5} points={linePoints} />
        <polygon fill="rgba(217,164,65,.12)" points={areaPoints} />
        {last && <circle cx={last.x} cy={last.y} r={4} fill="var(--color-brand-gold)" />}
      </svg>
    </div>
  );
}
