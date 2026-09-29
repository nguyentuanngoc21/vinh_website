"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Field, Alert } from "@/components/ui";
import type { Role } from "@/lib/supabase/types";

export type RoleChangeEntry = {
  id: string;
  actorUsername: string | null;
  oldRole: Role;
  newRole: Role;
  createdAt: string;
};

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

function roleLabel(role: Role) {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

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
export function UserDetailPanel({
  user,
  canEditRole,
  roleHistory,
}: {
  user: UserDetail;
  canEditRole: boolean;
  roleHistory: RoleChangeEntry[];
}) {
  const router = useRouter();
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
      // Tải lại dữ liệu server để lịch sử đổi quyền có dòng mới.
      router.refresh();
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
            <span className="rounded-full bg-[#F8D7DA] px-2.5 py-0.5 text-[11px] font-semibold text-error">
              Đã cấm do chụp màn hình
            </span>
          )}
        </div>
        <div className="mb-4 text-sm text-stone-alt">
          @{user.username} · Tham gia {new Date(user.createdAt).toLocaleDateString("vi-VN")}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="text-[13px] font-semibold text-stone-dark">Quyền</label>
          {canEditRole ? (
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
          ) : (
            <>
              <span className="text-sm text-brand-ink">
                {roleLabel(role)}
              </span>
              <span className="text-[12.5px] text-stone-alt">Chỉ Super Admin được đổi quyền</span>
            </>
          )}
          {roleSaved && <span className="text-[12.5px] font-medium text-[#2C7453]">Đã lưu</span>}
          {roleError && <span className="text-[12.5px] font-medium text-error">{roleError}</span>}
        </div>

        {roleHistory.length > 0 && (
          <div className="mb-4">
            <div className="mb-1.5 text-[13px] font-semibold text-stone-dark">Lịch sử đổi quyền</div>
            <ul className="space-y-1">
              {roleHistory.map((h) => (
                <li key={h.id} className="text-[12.5px] text-stone-alt">
                  {new Date(h.createdAt).toLocaleString("vi-VN")} ·{" "}
                  {h.actorUsername ? `@${h.actorUsername}` : "Tài khoản đã xoá"}:{" "}
                  <span className="text-brand-ink">
                    {roleLabel(h.oldRole)} → {roleLabel(h.newRole)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
          <Field
            label="Số token"
            type="number"
            min={1}
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value)}
            wrapperClassName="w-32"
          />
          <Field
            label="Lý do"
            value={bonusReason}
            onChange={(e) => setBonusReason(e.target.value)}
            placeholder="Ví dụ: Giải nhất cuộc thi viết tháng 9"
            wrapperClassName="min-w-[220px] flex-1"
          />
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
          <Alert tone="error" className="mt-2.5">{bonusError}</Alert>
        )}
        {bonusSuccess && (
          <Alert tone="success" className="mt-2.5">{bonusSuccess}</Alert>
        )}
      </div>
    </div>
  );
}
