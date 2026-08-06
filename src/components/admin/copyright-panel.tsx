import { ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

const COPYRIGHT_STATS = [
  { label: "NFT đã đúc", value: "2.841" },
  { label: "Độ phủ watermark", value: "98,2%", accent: true },
  { label: "Báo cáo vi phạm", value: "73", note: "12 chờ xử lý" },
  { label: "Đã gỡ nội dung lậu", value: "61" },
];

export function CopyrightPanel() {
  return (
    <div className="rounded-[14px] bg-brand-ink-dark p-[22px] text-sidebar-text">
      <div className="mb-[18px] flex items-center gap-2">
        <ShieldCheckIcon weight="fill" size={18} color="var(--color-brand-gold-light)" />
        <div className="text-base font-bold text-white">Bản quyền</div>
      </div>
      <div className="flex flex-col gap-4">
        {COPYRIGHT_STATS.map((stat) => (
          <div key={stat.label} className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-[#9fb3bd]">
              {stat.label}
            </div>
            <div
              className={`text-xl font-bold ${
                stat.accent ? "text-brand-gold-light" : "text-white"
              }`}
            >
              {stat.value}
              {stat.note && (
                <span className="ml-1.5 text-[11px] font-medium text-[#FF8A72]">
                  · {stat.note}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-[18px] flex items-center gap-1.5 rounded-[10px] border border-brand-gold-light/30 bg-brand-gold-light/12 p-3 text-xs font-medium leading-relaxed text-brand-gold-light">
        <WarningCircleIcon />
        12 báo cáo cần duyệt trong hôm nay
      </div>
    </div>
  );
}
