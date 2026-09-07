"use client";

import { useState } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Role } from "@/lib/supabase/types";

export type UserDetail = {
  id: string;
  username: string;
  nickname: string;
  role: Role;
  tokenBalance: number;
  tokenBalancePending: number;
  cccdVerified: boolean;
  screenshotPenaltyBanned: boolean;
  trust: {
    ordersCompleted: number;
    ordersCancelledAtFault: number;
    offPlatformFlags: number;
    violationsResolved: number;
  };
  createdAt: string;
  bookCount: number;
  audioCount: number;
  designCount: number;
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "user", label: "Người dùng" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] border border-cream-border px-4 py-3">
      <div className="text-xs font-medium text-stone-alt">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-brand-ink">{value}</div>
    </div>
  );
}

/** MVP "Người dùng" — xem chi tiết, đổi role, cấp thưởng token (nối UI
 * cho POST /api/admin/bonus — route đã có sẵn backend từ trước, chưa
 * từng có UI nào gọi tới cho đến bản này). KHÔNG có khoá/tạm ngưng tài
 * khoản — chưa có cột "banned" chung trong profiles, cần migration riêng
 * nếu muốn thêm (xem comment ở admin/nguoi-dung/page.tsx). */
export function UserDetailPanel({ user }: { user: UserDetail }) {
  const [role, setRole] = useState(user.role);
  const [rolePending, setRolePending] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSaved, setRoleSaved] = useState(false);

  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusReason, setBonusReason] = useState("");
  const [bonusPending, setBonusPending] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);
  const [bonusSuccess, setBonusSuccess] = useState<string | null>(null);

  const handleRoleChange = async (newRole: Role) => {
    setRolePending(true);
    setRoleError(null);
    setRoleSaved(false);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRoleError((data && typeof data.error === "string" && data.error) || "Đổi quyền thất bại.");
        return;
      }
      setRole(newRole);
      setRoleSaved(true);
    } catch {
      setRoleError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setRolePending(false);
    }
  };

  const handleGrantBonus = async () => {
    const amount = Number(bonusAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBonusError("Số token phải là số dương.");
      return;
    }
    if (!bonusReason.trim()) {
      setBonusError("Vui lòng nhập lý do cấp thưởng.");
      return;
    }
    setBonusPending(true);
    setBonusError(null);
    setBonusSuccess(null);
    try {
      const res = await fetch("/api/admin/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: user.id, amount, reason: bonusReason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setBonusError((data && typeof data.error === "string" && data.error) || "Cấp thưởng thất bại.");
        return;
      }
      setBonusSuccess(`Đã cấp ${amount.toLocaleString("vi-VN")} token.`);
      setBonusAmount("");
      setBonusReason("");
    } catch {
      setBonusError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setBonusPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
        <div className="mb-1 flex items-center gap-2">
          <div className="text-xl font-bold text-brand-ink">{user.nickname}</div>
          {user.cccdVerified && <CheckCircleIcon weight="fill" size={18} color="#2C7453" />}
          {user.screenshotPenaltyBanned && (
            <span className="rounded-full bg-[#F8D7DA] px-2.5 py-0.5 text-[11px] font-semibold text-[#B02A37]">
              Đã cấm do chụp màn hình
            </span>
          )}
        </div>
        <div className="mb-4 text-sm text-stone-alt">
          @{user.username} · Tham gia {new Date(user.createdAt).toLocaleDateString("vi-VN")}
        </div>

        <div className="mb-4 flex items-center gap-3">
          <label className="text-[13px] font-semibold text-stone-dark">Quyền</label>
          <select
            value={role}
            disabled={rolePending}
            onChange={(e) => handleRoleChange(e.target.value as Role)}
            className="rounded-lg border border-cream-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {roleSaved && <span className="text-[12.5px] font-medium text-[#2C7453]">Đã lưu</span>}
          {roleError && <span className="text-[12.5px] font-medium text-[#B02A37]">{roleError}</span>}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Token khả dụng" value={user.tokenBalance.toLocaleString("vi-VN")} />
          <StatCard label="Token đang giữ" value={user.tokenBalancePending.toLocaleString("vi-VN")} />
          <StatCard label="Truyện đã đăng" value={user.bookCount} />
          <StatCard label="Audio/Thiết kế" value={`${user.audioCount} / ${user.designCount}`} />
        </div>
      </div>

      <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
        <div className="mb-3.5 text-base font-bold text-brand-ink">Độ uy tín</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Đơn hoàn thành" value={user.trust.ordersCompleted} />
          <StatCard label="Đơn huỷ (lỗi)" value={user.trust.ordersCancelledAtFault} />
          <StatCard label="Cờ ngoài nền tảng" value={user.trust.offPlatformFlags} />
          <StatCard label="Vi phạm đã xử lý" value={user.trust.violationsResolved} />
        </div>
      </div>

      <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
        <div className="mb-3.5 text-base font-bold text-brand-ink">Cấp thưởng token</div>
        <p className="mb-3 text-[13px] text-stone-alt">
          Cấp thẳng từ ngân sách nền tảng (giải thưởng cuộc thi...) — không trừ vào ai khác, không
          tính vào doanh thu chia sẻ tác giả.
        </p>
        <div className="flex flex-wrap items-end gap-2.5">
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-stone-dark">Số token</label>
            <input
              type="number"
              min={1}
              value={bonusAmount}
              onChange={(e) => setBonusAmount(e.target.value)}
              className="w-32 rounded-lg border border-cream-border px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[12.5px] font-semibold text-stone-dark">Lý do</label>
            <input
              value={bonusReason}
              onChange={(e) => setBonusReason(e.target.value)}
              placeholder="Ví dụ: Giải nhất cuộc thi viết tháng 9"
              className="w-full rounded-lg border border-cream-border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={bonusPending}
            onClick={handleGrantBonus}
            className="rounded-lg bg-brand-gold px-4 py-2 text-[13px] font-semibold text-brand-ink disabled:opacity-50"
          >
            {bonusPending ? "Đang cấp…" : "Cấp thưởng"}
          </button>
        </div>
        {bonusError && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-[#B02A37]">
            <WarningCircleIcon /> {bonusError}
          </div>
        )}
        {bonusSuccess && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-[#2C7453]">
            <CheckCircleIcon weight="fill" /> {bonusSuccess}
          </div>
        )}
      </div>
    </div>
  );
}
