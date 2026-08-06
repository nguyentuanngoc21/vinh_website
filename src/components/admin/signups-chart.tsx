export function SignupsChart() {
  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="text-base font-bold text-brand-ink">
        Người đăng ký mới
      </div>
      <div className="mb-4 mt-1 text-xs text-stone-alt">
        Theo tuần · 30 ngày
      </div>
      <svg viewBox="0 0 340 130" className="h-[130px] w-full">
        <polyline
          fill="none"
          stroke="var(--color-brand-gold)"
          strokeWidth={2.5}
          points="0,98 56,84 113,90 170,58 226,46 283,30 340,18"
        />
        <polygon
          fill="rgba(217,164,65,.12)"
          points="0,98 56,84 113,90 170,58 226,46 283,30 340,18 340,130 0,130"
        />
        <circle cx={340} cy={18} r={4} fill="var(--color-brand-gold)" />
      </svg>
    </div>
  );
}
