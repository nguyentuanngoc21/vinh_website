import { Skeleton } from "./skeleton";

/**
 * 3 hình dạng skeleton dùng cho các route `loading.tsx` mới (xem
 * src/app/*\/loading.tsx) — KHÔNG dùng lại `LoadingScreen` (overlay đen mờ
 * 20%, xem loading-screen.tsx) cho việc này: `loading.tsx` là Suspense
 * fallback THAY THẾ hẳn nội dung route đang chờ, không phải phủ LÊN TRÊN
 * trang cũ — 1 overlay trong suốt kỳ vọng "nhìn xuyên qua trang cũ" render
 * ra ở đây sẽ chỉ thấy nền trắng trống phía sau, đúng bug đã bỏ
 * `app/loading.tsx` gốc trước đây để chuyển hẳn sang NavigationOverlay
 * (xem comment đầu navigation-overlay.tsx). Skeleton ở đây ĐẶC (opaque),
 * không dựa vào nhìn xuyên, nên không lặp lại bug đó — đây là 1 tầng khác,
 * chỉ hiện trong lúc Server Component của route đích đang chờ dữ liệu,
 * sau khi NavigationOverlay đã tắt (pathname đã đổi xong).
 *
 * Không cần khớp pixel-perfect với từng trang thật — chỉ cần đúng HÌNH
 * DẠNG chung (lưới thẻ / danh sách dòng / cột nội dung đơn) để không giật
 * cục bố cục quá nhiều khi nội dung thật thế chỗ.
 */

export function GridPageSkeleton({ cards = 12 }: { cards?: number }) {
  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8 lg:px-11">
      <Skeleton className="mb-2 h-8 w-64 rounded-[var(--radius-sm)]" />
      <Skeleton className="mb-6 h-4 w-40 rounded-[var(--radius-sm)]" />
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[2/3] w-full rounded-[10px]" />
            <Skeleton className="mt-2 h-4 w-full rounded-[var(--radius-sm)]" />
            <Skeleton className="mt-1.5 h-3 w-2/3 rounded-[var(--radius-sm)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListPageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8 lg:px-11">
      <Skeleton className="mb-6 h-8 w-64 rounded-[var(--radius-sm)]" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="mx-auto min-h-screen max-w-[800px] bg-white px-4 py-8 sm:px-8">
      <Skeleton className="mb-4 h-56 w-40 rounded-[10px]" />
      <Skeleton className="mb-2 h-7 w-3/4 rounded-[var(--radius-sm)]" />
      <Skeleton className="mb-6 h-4 w-1/2 rounded-[var(--radius-sm)]" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="mb-3 h-4 w-full rounded-[var(--radius-sm)]" />
      ))}
    </div>
  );
}
