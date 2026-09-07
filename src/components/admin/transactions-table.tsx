import { transactionTypeLabel } from "@/lib/profile";
import type { RecentTransaction } from "@/lib/admin/get-overview-stats";
import type { TransactionStatus } from "@/lib/supabase/types";

// Trước đây TRANSACTIONS bịa hoàn toàn (tên người dùng, mã GD, số tiền
// đều dựng sẵn từ ngày đầu scaffold dự án) — giờ nhận props thật từ
// getOverviewStats() (xem src/app/admin/page.tsx).
const STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  available: "Khả dụng",
  completed: "Thành công",
  failed: "Thất bại",
  reversed: "Đã hoàn",
};

function badgeStyle(status: TransactionStatus) {
  if (status === "completed" || status === "available") return { bg: "#DBF3E8", ink: "#2C7453" };
  if (status === "pending" || status === "processing") return { bg: "#FFE6CC", ink: "#894701" };
  return { bg: "#F8D7DA", ink: "#B02A37" };
}

const GRID_COLS = "grid-cols-[1fr_1fr_130px_100px]";

export function TransactionsTable({ transactions }: { transactions: RecentTransaction[] }) {
  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="text-base font-bold text-brand-ink">Giao dịch gần đây</div>
      </div>
      <div
        className={`grid ${GRID_COLS} gap-3 border-b border-cream-border px-2.5 pb-2.5 text-xs font-semibold text-stone-alt`}
      >
        <div>Người dùng</div>
        <div>Nội dung</div>
        <div>Số token</div>
        <div>Trạng thái</div>
      </div>
      {transactions.length === 0 && (
        <div className="px-2.5 py-6 text-center text-sm text-stone-alt">Chưa có giao dịch nào.</div>
      )}
      {transactions.map((t) => {
        const { bg, ink } = badgeStyle(t.status);
        return (
          <div
            key={t.id}
            className={`grid ${GRID_COLS} items-center gap-3 border-b border-[#F1ECE0] px-2.5 py-[13px] text-sm font-medium text-[#3a352e] transition-colors hover:bg-[#FBF8F1]`}
          >
            <div>{t.userName}</div>
            <div className="text-stone-alt">{transactionTypeLabel(t.type)}</div>
            <div className="font-semibold">
              {t.amount >= 0 ? "+" : ""}
              {t.amount.toLocaleString("vi-VN")}
            </div>
            <div>
              <span
                style={{ background: bg, color: ink }}
                className="rounded-full px-[11px] py-1 text-[11px] font-semibold"
              >
                {STATUS_LABELS[t.status]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
