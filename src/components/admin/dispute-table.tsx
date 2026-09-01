"use client";

import { useState } from "react";
import { Alert } from "@/components/ui";

export type DisputeRow = {
  id: string;
  orderId: string;
  orderCode: string;
  buyerId: string;
  sellerId: string;
  buyerLabel: string;
  sellerLabel: string;
  reporterLabel: string;
  reasonCategory: string;
  description: string;
  createdAt: string;
};

const RESUME_OPTIONS = [
  { value: "in_progress", label: "Tiếp tục thực hiện (in_progress)" },
  { value: "delivered", label: "Coi như đã bàn giao (delivered)" },
  { value: "completed", label: "Coi như đã hoàn tất (completed)" },
  { value: "cancelled", label: "Hủy đơn (cancelled)" },
];

/** Bảng xử lý tranh chấp (Mục 9 đặc tả) — mỗi dòng mở rộng ra 1 form
 * quyết định: ghi chú, bên có lỗi (nếu có), trạng thái mở khóa lại, hoàn
 * tiền thủ công nếu cần. Gọi PATCH /api/admin/disputes/:id
 * (resolve_dispute() — cập nhật Trust Score bên có lỗi trong cùng
 * transaction). */
export function DisputeTable({ rows: initialRows }: { rows: DisputeRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [atFault, setAtFault] = useState<"" | "buyer" | "seller">("");
  const [resumeStatus, setResumeStatus] = useState("cancelled");
  const [refundAmount, setRefundAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (row: DisputeRow) => {
    if (!note.trim()) {
      setError("Cần ghi chú quyết định xử lý.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch(`/api/admin/disputes/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resolutionNote: note.trim(),
        atFaultUserId: atFault === "buyer" ? row.buyerId : atFault === "seller" ? row.sellerId : null,
        resumeStatus,
        refundAmount: Number(refundAmount) || 0,
      }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không xử lý được.");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setOpenId(null);
    setNote("");
    setAtFault("");
    setRefundAmount("");
  };

  if (rows.length === 0) {
    return <Alert tone="info">Không có tranh chấp nào đang mở.</Alert>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.id} className="overflow-hidden rounded-[12px] border border-cream-border bg-white">
          <button
            type="button"
            onClick={() => setOpenId(openId === row.id ? null : row.id)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-left"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-brand-ink">
                {row.orderCode} · {row.buyerLabel} ↔ {row.sellerLabel}
              </div>
              <div className="mt-0.5 truncate text-xs text-stone-alt">
                {row.reasonCategory} — báo cáo bởi {row.reporterLabel} · {new Date(row.createdAt).toLocaleString("vi-VN")}
              </div>
            </div>
          </button>
          {openId === row.id && (
            <div className="border-t border-cream-border bg-cream-card px-5 py-4">
              <div className="text-xs leading-[1.6] text-ink">{row.description}</div>
              {error && (
                <div className="mt-2">
                  <Alert tone="error">{error}</Alert>
                </div>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate">Bên có lỗi</div>
                  <select
                    value={atFault}
                    onChange={(e) => setAtFault(e.target.value as typeof atFault)}
                    className="w-full rounded-[9px] border border-border-light px-3 py-2 text-sm"
                  >
                    <option value="">Không quy lỗi</option>
                    <option value="buyer">Buyer ({row.buyerLabel})</option>
                    <option value="seller">Seller ({row.sellerLabel})</option>
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate">Mở khóa đơn về trạng thái</div>
                  <select
                    value={resumeStatus}
                    onChange={(e) => setResumeStatus(e.target.value)}
                    className="w-full rounded-[9px] border border-border-light px-3 py-2 text-sm"
                  >
                    {RESUME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate">Hoàn tiền thủ công cho buyer (0 = không hoàn)</div>
                  <input
                    type="number"
                    min={0}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full rounded-[9px] border border-border-light px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate">Ghi chú quyết định</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-[9px] border border-border-light px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => resolve(row)}
                className="mt-3 cursor-pointer rounded-full bg-brand-ink px-5 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {pending ? "Đang xử lý…" : "Xác nhận xử lý"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
