import {
  CoinsIcon,
  ReceiptIcon,
  UserPlusIcon,
  ArrowsClockwiseIcon,
  TrendUpIcon,
  TrendDownIcon,
} from "@phosphor-icons/react/dist/ssr";

const PRIMARY_KPIS = [
  {
    label: "Doanh thu tháng",
    value: "₫482,6tr",
    delta: "+12,4% so với tháng trước",
    up: true,
    icon: CoinsIcon,
    iconColor: "var(--color-brand-gold)",
  },
  {
    label: "Giao dịch",
    value: "38.412",
    delta: "+8,1%",
    up: true,
    icon: ReceiptIcon,
    iconColor: "#2C5870",
  },
  {
    label: "Người đăng ký mới",
    value: "9.847",
    delta: "+21,6%",
    up: true,
    icon: UserPlusIcon,
    iconColor: "#2C5870",
  },
  {
    label: "Retention D30",
    value: "41,3%",
    delta: "−1,8%",
    up: false,
    icon: ArrowsClockwiseIcon,
    iconColor: "#2C5870",
  },
];

const SECONDARY_KPIS = [
  { label: "Chi trả tác giả", value: "₫289,5tr" },
  { label: "DAU / MAU", value: "28,4%", suffix: "dính" },
  { label: "Chuyển đổi free→trả phí", value: "4,7%" },
  { label: "Tác giả hoạt động", value: "1.236" },
];

export function OverviewKpis() {
  return (
    <>
      <div className="mb-[18px] grid grid-cols-4 gap-[18px]">
        {PRIMARY_KPIS.map((kpi) => {
          const Icon = kpi.icon;
          const TrendIcon = kpi.up ? TrendUpIcon : TrendDownIcon;
          return (
            <div
              key={kpi.label}
              className="rounded-[14px] border border-cream-border bg-white p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-stone-alt">
                  {kpi.label}
                </span>
                <Icon size={18} color={kpi.iconColor} />
              </div>
              <div className="my-2 text-[28px] font-bold text-brand-ink">
                {kpi.value}
              </div>
              <div
                className={`flex items-center gap-1 text-xs font-semibold ${
                  kpi.up ? "text-[#3B9B6F]" : "text-[#C63B2B]"
                }`}
              >
                <TrendIcon weight="fill" />
                {kpi.delta}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6 grid grid-cols-4 gap-[18px]">
        {SECONDARY_KPIS.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[14px] border border-cream-border bg-white px-5 py-4"
          >
            <div className="text-xs font-medium text-stone-alt">
              {kpi.label}
            </div>
            <div className="mt-[5px] text-[21px] font-bold text-brand-ink">
              {kpi.value}
              {kpi.suffix && (
                <span className="ml-1 text-xs font-medium text-stone-alt">
                  {kpi.suffix}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
