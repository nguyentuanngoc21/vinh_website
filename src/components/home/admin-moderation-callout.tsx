"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";

// Trước đây "7 tác phẩm chờ duyệt · 2 báo cáo bản quyền" + badge "9" đều
// bịa (dựng từ ngày đầu scaffold dự án) — không có hàng đợi "chờ duyệt"
// nào tồn tại (chương tự xuất bản ngay khi tác giả bấm, không qua duyệt
// trước; xem migrations/20260908_add_chapter_moderation_and_notifications.sql),
// và không có tính năng "báo cáo bản quyền" nào cả. Số THẬT duy nhất có
// sẵn để hiện ở đây là tranh chấp đang mở (đã có trang thật
// /admin/tranh-chap) — nối vào GET /api/admin/disputes (route có sẵn từ
// trước, trước đây không nơi nào gọi tới).
export function AdminModerationCallout() {
  const { isAdmin } = useRole();
  const [openDisputeCount, setOpenDisputeCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/disputes")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setOpenDisputeCount((data.disputes ?? []).length);
      });
  }, [isAdmin]);

  if (!isAdmin || !openDisputeCount) return null;

  return (
    <Link
      href="/admin/tranh-chap"
      className="mb-[18px] flex items-center gap-3.5 rounded-2xl bg-brand-ink px-[18px] py-3.5 no-underline"
    >
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-brand-gold-light/16 text-brand-gold-light">
        <WarningCircleIcon weight="fill" size={20} />
      </div>
      <div className="flex-1">
        <div className="text-[15px] font-semibold text-white">Tranh chấp đang chờ xử lý</div>
        <div className="mt-0.5 text-[12.5px] text-sidebar-text-dim-2">Chỉ quản trị viên thấy mục này</div>
      </div>
      <div className="rounded-full bg-brand-gold-light px-3 py-[5px] text-[12.5px] font-bold text-brand-ink">
        {openDisputeCount}
      </div>
    </Link>
  );
}
