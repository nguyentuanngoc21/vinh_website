"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react/dist/ssr";

const STATUS_LABELS: Record<string, string> = {
  draft: "Đang soạn",
  brief_confirmed: "Đã duyệt brief",
  deposit_paid: "Đã đặt cọc",
  in_progress: "Đang thực hiện",
  delivered: "Đã bàn giao",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  disputed: "Đang tranh chấp",
};

function formatVnd(n: number): string {
  return n.toLocaleString("vi-VN") + "₫";
}

export type OrderSummary = {
  id: string;
  code: string;
  status: string;
  price: number;
  paid: number;
  serviceName: string | null;
};

/**
 * Bản CHỈ ĐỌC, thu gọn của OrderCard (order-card.tsx) — dành riêng cho
 * panel bong bóng chat (chat-bubble-window.tsx), nơi không gian chỉ rộng
 * 300px và cao 420px, không đủ chỗ cho toàn bộ máy trạng thái + form của
 * OrderCard gốc. CỐ Ý không có bất kỳ nút hành động nào (đặt cọc/bàn
 * giao/xác nhận/mở tranh chấp...) — bấm nhầm 1 hành động về tiền/đơn hàng
 * trong panel nhỏ, dễ va chạm còn nguy hiểm hơn là thiếu tiện lợi. Muốn
 * thao tác gì với đơn, bấm "Mở đầy đủ" sang tab Hội thoại (có OrderCard
 * thật). Mặc định thu gọn — chỉ 1 dòng trạng thái, tránh chiếm chỗ khung
 * tin nhắn; bấm để xem thêm giá/đã thanh toán.
 */
export function OrderSummaryChip({ order, threadHref }: { order: OrderSummary; threadHref: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-[#f0f0ef] bg-[#FBFAF8] px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 text-left"
      >
        <span className="shrink-0 rounded-full bg-brand-ink px-2 py-0.5 text-[9.5px] font-bold text-white">
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink">
          {order.serviceName ?? "Đơn dịch vụ"}
        </span>
        {expanded ? (
          <CaretUpIcon size={12} className="shrink-0 text-stone" />
        ) : (
          <CaretDownIcon size={12} className="shrink-0 text-stone" />
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[11px] text-stone">
            {order.code} · {formatVnd(order.price)} · đã thanh toán {formatVnd(order.paid)}
          </div>
          <Link href={threadHref} className="shrink-0 text-[11px] font-semibold text-brand-gold-dark no-underline">
            Mở đầy đủ →
          </Link>
        </div>
      )}
    </div>
  );
}
