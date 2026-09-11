import { Skeleton } from "@/components/ui/skeleton";

// Khớp hình dạng thật của UserDetailPanel (user-detail-panel.tsx) — vài
// khối "rounded-[14px] border bg-white p-[22px]" chứa lưới ô số liệu
// grid-cols-2 sm:grid-cols-4 — khác ListPageSkeleton (dạng bảng) mà
// admin/noi-dung/[bookId] dùng, nên viết riêng thay vì tái dùng.
export default function Loading() {
  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8 lg:px-11">
      <Skeleton className="mb-4 h-4 w-24 rounded-[var(--radius-sm)]" />
      {Array.from({ length: 2 }).map((_, panel) => (
        <div key={panel} className="mb-5 rounded-[14px] border border-cream-border bg-white p-[22px]">
          <Skeleton className="mb-4 h-5 w-40 rounded-[var(--radius-sm)]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-[10px]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
