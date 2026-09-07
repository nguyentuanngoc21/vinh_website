import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";
import type { CopyrightCoverage } from "@/lib/admin/get-copyright-coverage";

// Trước đây là COPYRIGHT_STATS bịa hoàn toàn ("NFT đã đúc: 2.841", "Độ
// phủ watermark: 98,2%", "Báo cáo vi phạm: 73"...) — không có tính năng
// NFT hay báo cáo vi phạm nào tồn tại trong repo, các số này chỉ là UI
// tĩnh dựng từ ngày đầu scaffold, chưa từng đấu nối dữ liệu thật. Đã bỏ
// hẳn NFT/báo cáo vi phạm (không xây tính năng đó ở đây); chỉ giữ 2 chỉ
// số THẬT tính được từ content_protection_status (xem
// src/lib/admin/get-copyright-coverage.ts).
function formatPercent(protectedCount: number, total: number): string {
  if (total === 0) return "—";
  return `${((protectedCount / total) * 100).toFixed(1).replace(".", ",")}%`;
}

export function CopyrightPanel({ coverage }: { coverage: CopyrightCoverage }) {
  const stats = [
    {
      label: "Ảnh (bìa + Thiết kế) đã bảo hộ",
      value: formatPercent(coverage.designProtectedCount, coverage.designTotalCount),
      note: `${coverage.designProtectedCount}/${coverage.designTotalCount}`,
    },
    {
      label: "Audio đã tuyên bố bảo hộ",
      value: formatPercent(coverage.audioProtectedCount, coverage.audioTotalCount),
      note: `${coverage.audioProtectedCount}/${coverage.audioTotalCount}`,
    },
  ];

  return (
    <div className="rounded-[14px] bg-brand-ink-dark p-[22px] text-sidebar-text">
      <div className="mb-[18px] flex items-center gap-2">
        <ShieldCheckIcon weight="fill" size={18} color="var(--color-brand-gold-light)" />
        <div className="text-base font-bold text-white">Bản quyền</div>
      </div>
      <div className="flex flex-col gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-[#9fb3bd]">{stat.label}</div>
            <div className="text-xl font-bold text-brand-gold-light">
              {stat.value}
              <span className="ml-1.5 text-[11px] font-medium text-[#9fb3bd]">{stat.note}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-[18px] rounded-[10px] border border-white/10 bg-white/5 p-3 text-xs font-medium leading-relaxed text-[#9fb3bd]">
        Ảnh mới nhúng XMP &quot;không cho AI huấn luyện&quot; lúc upload; audio chỉ
        ghi nhận tuyên bố (chưa nhúng tag vào file). Nội dung upload trước
        khi có tính năng này hiện đúng là &quot;chưa bảo hộ&quot;.
      </div>
    </div>
  );
}
