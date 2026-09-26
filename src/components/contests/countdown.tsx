"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { formatRemaining, type Countdown as CountdownData } from "@/lib/contests/phase-copy";

/**
 * Đếm ngược tới mốc của giai đoạn. Tới mốc (hoặc tới next_change_at của
 * capability) thì làm mới dữ liệu server — UI tự đổi giai đoạn, không cần
 * người dùng tải lại trang (đặc tả UX mục 7, "Deadline").
 */
export function Countdown({
  data,
  refreshAt,
  className = "",
  labelClassName = "",
}: {
  data: CountdownData;
  refreshAt: string | null;
  className?: string;
  labelClassName?: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);

  // Giờ thật chỉ có ở client (server render "—" để không lệch hydrate);
  // lần đầu cập nhật ngay trong callback hẹn giờ, sau đó mỗi 30 giây.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!refreshAt) return;
    const wait = Date.parse(refreshAt) - Date.now();
    if (wait <= 0 || wait > 2_147_000_000) return;
    const id = window.setTimeout(() => router.refresh(), wait + 1_000);
    return () => window.clearTimeout(id);
  }, [refreshAt, router]);

  const value =
    data.mode === "date"
      ? formatVnDateTime(data.target).split(" ").pop()
      : now === null
        ? "—"
        : formatRemaining(Date.parse(data.target) - now);

  return (
    <div className={className}>
      <div className="text-2xl font-bold">{value}</div>
      <div className={`text-xs ${labelClassName}`}>{data.label}</div>
    </div>
  );
}
