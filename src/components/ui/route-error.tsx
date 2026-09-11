"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "./button";

/**
 * Error boundary dùng chung cho các `error.tsx` cấp route mới thêm (xem
 * src/app/*\/error.tsx) — trước đây KHÔNG route nào có error.tsx, 1 lỗi
 * throw trong Server Component sẽ rơi vào màn hình lỗi mặc định của Next,
 * không theo phong cách thương hiệu. Next 16 đặt tên prop khôi phục là
 * `retry` (KHÔNG phải `reset` như bản Next cũ) — xem
 * node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md,
 * đã xác nhận trước khi viết file này (AGENTS.md: bản Next này có breaking
 * changes, luôn tra docs đóng gói kèm thay vì dùng kiến thức cũ).
 */
export function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center">
      <div className="text-lg font-bold text-brand-ink">Đã có lỗi xảy ra</div>
      <div className="max-w-[420px] text-sm text-stone-dark">
        Không tải được nội dung này. Vui lòng thử lại — nếu vẫn lỗi, hãy quay lại trang chủ.
      </div>
      <div className="mt-2 flex gap-2.5">
        <Button type="button" fullWidth={false} onClick={retry} className="px-6">
          Thử lại
        </Button>
        <Link
          href="/"
          className="flex items-center rounded-[10px] border border-border-light px-6 text-[15px] font-bold text-brand-ink no-underline"
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
