import { CoinsIcon, ReceiptIcon, UserPlusIcon, ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import type { OverviewStats } from "@/lib/admin/get-overview-stats";

// Trước đây PRIMARY_KPIS/SECONDARY_KPIS bịa hoàn toàn — cả số lẫn %
// tăng/giảm so với "tháng trước" (dựng từ ngày đầu scaffold dự án, chưa
// từng đấu nối dữ liệu thật). Giờ 3 số đầu lấy thật từ
// getOverviewStats() — KHÔNG kèm delta/xu hướng vì không có baseline
// thật để so sánh (bịa % tăng/giảm cũng sai y như bịa số gốc). Những chỉ
// số cần hạ tầng theo dõi hoạt động chưa tồn tại (retention cohort,
// DAU/MAU, tỉ lệ chuyển đổi free→trả phí) hoặc chưa có định nghĩa kế
// toán rõ ràng (chi trả tác giả — gộp payout thật từ những loại giao
// dịch nào?) thì hiện rõ "Chưa có dữ liệu" thay vì bịa tiếp.
function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + "₫";
}

export function OverviewKpis({ stats }: { stats: OverviewStats }) {
  const primaryKpis = [
    {
      label: "Doanh thu 30 ngày",
      value: formatVnd(stats.revenueVnd30d),
      icon: CoinsIcon,
      iconColor: "var(--color-brand-gold)",
    },
    {
      label: "Giao dịch (30 ngày)",
      value: stats.transactionsCount30d.toLocaleString("vi-VN"),
      icon: ReceiptIcon,
      iconColor: "#2C5870",
    },
    {
      label: "Người đăng ký mới (30 ngày)",
      value: stats.newSignups30d.toLocaleString("vi-VN"),
      icon: UserPlusIcon,
      iconColor: "#2C5870",
    },
    {
      label: "Retention D30",
      value: "Chưa có dữ liệu",
      icon: ArrowsClockwiseIcon,
      iconColor: "#2C5870",
      unavailable: true,
    },
  ];

  const secondaryKpis = [
    { label: "Chi trả tác giả" },
    { label: "DAU / MAU" },
    { label: "Chuyển đổi free→trả phí" },
    { label: "Tác giả hoạt động" },
  ];

  return (
    <>
      <div className="mb-[18px] grid grid-cols-4 gap-[18px]">
        {primaryKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-[14px] border border-cream-border bg-white p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-stone-alt">{kpi.label}</span>
                <Icon size={18} color={kpi.iconColor} />
              </div>
              <div
                className={`my-2 text-[28px] font-bold ${
                  kpi.unavailable ? "text-stone-alt/60" : "text-brand-ink"
                }`}
              >
                {kpi.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6 grid grid-cols-4 gap-[18px]">
        {secondaryKpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[14px] border border-cream-border bg-white px-5 py-4"
          >
            <div className="text-xs font-medium text-stone-alt">{kpi.label}</div>
            <div className="mt-[5px] text-[21px] font-bold text-stone-alt/60">Chưa có dữ liệu</div>
          </div>
        ))}
      </div>
    </>
  );
}
