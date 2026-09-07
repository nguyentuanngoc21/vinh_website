"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon, CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Role } from "@/lib/supabase/types";

export type UserRow = {
  id: string;
  username: string;
  nickname: string;
  role: Role;
  tokenBalance: number;
  cccdVerified: boolean;
  createdAt: string;
};

const ROLE_LABELS: Record<Role, string> = {
  user: "Người dùng",
  admin: "Admin",
  super_admin: "Super Admin",
};

const GRID_COLS = "grid-cols-[1fr_140px_120px_110px_130px]";

/** Bảng danh sách cho src/app/admin/nguoi-dung/page.tsx — tìm kiếm lọc ở
 * CLIENT trong danh sách đã tải (page.tsx giới hạn 200 dòng mới nhất,
 * cùng convention content-table.tsx). Đổi role/cấp thưởng nằm ở trang
 * chi tiết (bấm vào 1 dòng), không làm ở đây để bảng list gọn. */
export function UserTable({
  rows,
  truncated,
  fetchLimit,
}: {
  rows: UserRow[];
  truncated: boolean;
  fetchLimit: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.username.toLowerCase().includes(q) || r.nickname.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="mb-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 rounded-lg border border-cream-border px-3 py-2">
          <MagnifyingGlassIcon size={15} color="var(--color-stone-alt)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo username hoặc tên hiển thị…"
            className="w-[280px] bg-transparent text-sm outline-none"
          />
        </div>
        <div className="text-xs text-stone-alt">
          {filtered.length}/{rows.length} người dùng
          {truncated && ` (chỉ tải ${fetchLimit} người mới nhất — có thể còn tài khoản cũ hơn không hiện ở đây)`}
        </div>
      </div>

      <div className={`grid ${GRID_COLS} gap-3 border-b border-cream-border px-2.5 pb-2.5 text-xs font-semibold text-stone-alt`}>
        <div>Người dùng</div>
        <div>Quyền</div>
        <div>Token</div>
        <div>CCCD</div>
        <div>Tham gia</div>
      </div>

      {filtered.map((r) => (
        <Link
          key={r.id}
          href={`/admin/nguoi-dung/${r.id}`}
          className={`grid ${GRID_COLS} items-center gap-3 border-b border-[#F1ECE0] px-2.5 py-[13px] text-sm font-medium text-[#3a352e] no-underline transition-colors hover:bg-[#FBF8F1]`}
        >
          <div className="min-w-0">
            <div className="truncate">{r.nickname}</div>
            <div className="truncate text-xs text-stone-alt">@{r.username}</div>
          </div>
          <div>
            <span
              className={`rounded-full px-[11px] py-1 text-[11px] font-semibold ${
                r.role === "super_admin"
                  ? "bg-brand-ink text-white"
                  : r.role === "admin"
                    ? "bg-[#DBE8F3] text-[#2C5870]"
                    : "bg-cream-card-alt text-stone-dark"
              }`}
            >
              {ROLE_LABELS[r.role]}
            </span>
          </div>
          <div className="text-stone-alt">{r.tokenBalance.toLocaleString("vi-VN")}</div>
          <div>
            {r.cccdVerified ? (
              <CheckCircleIcon weight="fill" size={17} color="#2C7453" />
            ) : (
              <span className="text-stone-alt">—</span>
            )}
          </div>
          <div className="text-xs text-stone-alt">{new Date(r.createdAt).toLocaleDateString("vi-VN")}</div>
        </Link>
      ))}

      {filtered.length === 0 && (
        <div className="px-2.5 py-6 text-center text-sm text-stone-light">Không có người dùng nào khớp.</div>
      )}
    </div>
  );
}
