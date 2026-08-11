import type { TopupHistoryEntry } from "@/lib/topup";

/** Compact "recent top-ups" list for the order sidebar. */
export function TopupHistoryCard({ history }: { history: TopupHistoryEntry[] }) {
  return (
    <div className="rounded-[18px] border border-cream p-5">
      <div className="mb-3 text-[13px] font-semibold text-ink">Lịch sử nạp gần đây</div>
      {history.map((entry) => (
        <div key={entry.title + entry.meta} className="flex justify-between gap-3 border-t border-[#f5f4f2] py-2.5">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-ink">{entry.title}</div>
            <div className="mt-0.5 text-xs text-stone">{entry.meta}</div>
          </div>
          <div className="whitespace-nowrap text-[13px] font-bold text-[#3B9B6F]">{entry.amount}</div>
        </div>
      ))}
    </div>
  );
}
