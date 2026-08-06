"use client";

import Link from "next/link";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";

export function AdminModerationCallout() {
  const { isAdmin } = useRole();
  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="mb-[18px] flex items-center gap-3.5 rounded-2xl bg-brand-ink px-[18px] py-3.5 no-underline"
    >
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-brand-gold-light/16 text-brand-gold-light">
        <WarningCircleIcon weight="fill" size={20} />
      </div>
      <div className="flex-1">
        <div className="text-[15px] font-semibold text-white">
          Các truyện cần kiểm duyệt
        </div>
        <div className="mt-0.5 text-[12.5px] text-sidebar-text-dim-2">
          7 tác phẩm chờ duyệt · 2 báo cáo bản quyền · chỉ quản trị viên thấy
          mục này
        </div>
      </div>
      <div className="rounded-full bg-brand-gold-light px-3 py-[5px] text-[12.5px] font-bold text-brand-ink">
        9
      </div>
    </Link>
  );
}
