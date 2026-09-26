"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowSquareOutIcon, FlagIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Checkbox, Field } from "@/components/ui";
import { formatVnDateTime, vnLocalToIso } from "@/lib/contests/datetime";
import {
  ADMIN_NEXT_SUBMISSION_STATUSES,
  COMMON_FLAG_CODES,
  REASON_REQUIRED,
  SUBMISSION_STATUS_LABEL,
} from "@/lib/contests/labels";
import type { AdminSubmission } from "@/lib/contests/admin-service";
import type { ContestSubmissionStatus } from "@/lib/supabase/types";

const STATUS_TONE: Record<ContestSubmissionStatus, string> = {
  submitted: "bg-cream-card-alt text-stone-dark",
  eligible: "bg-success-form-border text-success-form",
  shortlisted: "bg-brand-ink text-white",
  ineligible: "bg-error-bg text-error",
  disqualified: "bg-error text-white",
  withdrawn: "bg-neutral-bg text-stone-dark",
};

const FILTERS: { value: ContestSubmissionStatus | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "eligible", label: "Hợp lệ" },
  { value: "shortlisted", label: "Vào vòng trong" },
  { value: "ineligible", label: "Không hợp lệ" },
  { value: "disqualified", label: "Bị loại" },
  { value: "withdrawn", label: "Đã rút" },
];

const PAGE_SIZE = 50;

export function ContestSubmissionsPanel({
  contestId,
  initial,
}: {
  contestId: string;
  initial: { items: AdminSubmission[]; total: number };
}) {
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [status, setStatus] = useState<ContestSubmissionStatus | "">("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    async (next: { status: ContestSubmissionStatus | ""; flaggedOnly: boolean; page: number }) => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ page: String(next.page) });
      if (next.status) qs.set("status", next.status);
      if (next.flaggedOnly) qs.set("flagged", "1");
      const res = await fetch(`/api/admin/contests/${contestId}/submissions?${qs}`);
      const data = await res.json().catch(() => null);
      setLoading(false);
      if (!res.ok) {
        setError(data?.error ?? "Không tải được danh sách.");
        return;
      }
      setItems(data.items);
      setTotal(data.total);
    },
    [contestId]
  );

  const applyFilter = (next: { status?: ContestSubmissionStatus | ""; flaggedOnly?: boolean; page?: number }) => {
    const merged = { status: next.status ?? status, flaggedOnly: next.flaggedOnly ?? flaggedOnly, page: next.page ?? 1 };
    setStatus(merged.status);
    setFlaggedOnly(merged.flaggedOnly);
    setPage(merged.page);
    void load(merged);
  };

  const replace = (updated: AdminSubmission) =>
    setItems((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f.value || "all"} type="button" onClick={() => applyFilter({ status: f.value })}
              className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium ${status === f.value ? "bg-brand-ink text-white" : "bg-neutral-bg text-ink"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <Checkbox checked={flaggedOnly} onChange={() => applyFilter({ flaggedOnly: !flaggedOnly })}>Chỉ bài có cờ</Checkbox>
      </div>

      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      <div className="mb-2 text-xs text-stone-alt">{loading ? "Đang tải…" : `${total} bài`}</div>

      {items.length === 0 && !loading ? (
        <Alert tone="info">Không có bài dự thi nào khớp bộ lọc.</Alert>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((s) => (
            <SubmissionRow key={s.id} contestId={contestId} submission={s} open={openId === s.id}
              onToggle={() => setOpenId(openId === s.id ? null : s.id)} onUpdated={replace} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button type="button" variant="ghost" fullWidth={false} className="px-4 py-2 text-sm" disabled={page <= 1 || loading}
            onClick={() => applyFilter({ page: page - 1 })}>Trước</Button>
          <span className="text-stone-alt">Trang {page}/{pages}</span>
          <Button type="button" variant="ghost" fullWidth={false} className="px-4 py-2 text-sm" disabled={page >= pages || loading}
            onClick={() => applyFilter({ page: page + 1 })}>Sau</Button>
        </div>
      )}
    </section>
  );
}

function SubmissionRow({
  contestId,
  submission: s,
  open,
  onToggle,
  onUpdated,
}: {
  contestId: string;
  submission: AdminSubmission;
  open: boolean;
  onToggle: () => void;
  onUpdated: (s: AdminSubmission) => void;
}) {
  const openFlags = s.review_flags.filter((f) => f.resolved_at === null);
  const nextStatuses = ADMIN_NEXT_SUBMISSION_STATUSES[s.status];
  const [to, setTo] = useState<ContestSubmissionStatus | "">("");
  const [reason, setReason] = useState("");
  const [flagCode, setFlagCode] = useState(COMMON_FLAG_CODES[0].code);
  const [flagMessage, setFlagMessage] = useState("");
  const [flagFixBy, setFlagFixBy] = useState("");
  const [flagVisible, setFlagVisible] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (url: string, method: string, body: unknown) => {
    setPending(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(Array.isArray(data?.details) ? data.details.join("; ") : (data?.error ?? "Không thực hiện được."));
      return null;
    }
    onUpdated(data.submission);
    return data;
  };

  const base = `/api/admin/contests/${contestId}/submissions/${s.id}`;

  const changeStatus = async () => {
    if (!to) return;
    if (REASON_REQUIRED.includes(to) && !reason.trim()) {
      setError("Cần nhập lý do — tác giả sẽ thấy lý do này.");
      return;
    }
    if (await call(`${base}/status`, "POST", { to, reason: reason.trim() || null })) {
      setTo("");
      setReason("");
    }
  };

  const addFlag = async () => {
    const fixBy = flagFixBy ? vnLocalToIso(flagFixBy) : null;
    if (flagFixBy && !fixBy) {
      setError("Hạn bổ sung không hợp lệ.");
      return;
    }
    if (await call(`${base}/flags`, "POST", { code: flagCode, message: flagMessage, fix_by: fixBy, visible_to_author: flagVisible })) {
      setFlagMessage("");
      setFlagFixBy("");
    }
  };

  return (
    <div className="overflow-hidden rounded-[12px] border border-cream-border">
      <button type="button" onClick={onToggle} className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{s.book_title}</span>
            {s.book_removed && <span className="shrink-0 rounded-full bg-error-bg px-2 py-0.5 text-[11px] font-semibold text-error">Sách đã bị gỡ</span>}
          </div>
          <div className="text-xs text-stone-alt">{s.author_name} · gửi {formatVnDateTime(s.submitted_at)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {openFlags.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-cream-card px-2.5 py-1 text-[11px] font-semibold text-brand-gold-dark">
              <FlagIcon size={12} weight="fill" /> {openFlags.length} cờ
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[s.status]}`}>{SUBMISSION_STATUS_LABEL[s.status]}</span>
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-cream-border bg-cream-card/40 px-4 py-4">
          {s.book_slug && !s.book_removed && (
            <Link href={`/truyen/${s.book_slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-brand-gold-dark">
              Xem truyện <ArrowSquareOutIcon size={13} />
            </Link>
          )}
          {s.status_reason && <div className="text-[13px] text-stone-dark">Lý do: {s.status_reason}</div>}

          {s.review_flags.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-slate">Cờ “Cần bổ sung”</div>
              {s.review_flags.map((f) => (
                <div key={f.id} className="flex flex-col gap-2 rounded-[10px] border border-cream-border bg-white p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 text-[13px]">
                    <div className="font-semibold text-ink">{f.message}</div>
                    <div className="text-xs text-stone-alt">
                      {f.code} · {f.source === "system" ? "hệ thống" : "quản trị viên"}
                      {f.fix_by && ` · hạn ${formatVnDateTime(f.fix_by)}`}
                      {!f.visible_to_author && " · tác giả không thấy"}
                      {f.resolved_at && ` · đã xử lý (${f.resolution})`}
                    </div>
                  </div>
                  {f.resolved_at === null && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {(["fixed", "dismissed", "escalated"] as const).map((r) => (
                        <button key={r} type="button" disabled={pending} onClick={() => call(`${base}/flags/${f.id}`, "PATCH", { resolution: r })}
                          className="rounded-full border border-cream-border px-3 py-1.5 text-xs font-semibold text-brand-ink disabled:opacity-50">
                          {r === "fixed" ? "Đã sửa" : r === "dismissed" ? "Bỏ qua" : "Chuyển xử lý loại"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {nextStatuses.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-slate">Đổi trạng thái</div>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((n) => (
                  <button key={n} type="button" onClick={() => setTo(to === n ? "" : n)}
                    className={`rounded-full px-3.5 py-2 text-[13px] font-medium ${to === n ? "bg-brand-ink text-white" : "bg-white text-ink ring-1 ring-cream-border"}`}>
                    {SUBMISSION_STATUS_LABEL[n]}
                  </button>
                ))}
              </div>
              {to && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Field label={REASON_REQUIRED.includes(to) ? "Lý do (tác giả sẽ thấy) *" : "Ghi chú"} wrapperClassName="flex-1"
                    value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
                  <Button type="button" variant="dark" fullWidth={false} className="px-5 py-3 text-sm" disabled={pending} onClick={changeStatus}>
                    Xác nhận
                  </Button>
                </div>
              )}
              {to === "disqualified" && <p className="text-xs text-error">Loại bài là trạng thái cuối — không khôi phục được.</p>}
            </div>
          )}

          {(s.status === "eligible" || s.status === "submitted" || s.status === "shortlisted") && (
            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-slate">Gắn cờ “Cần bổ sung”</div>
              <p className="text-xs text-stone-alt">Bài vẫn hợp lệ, vẫn được đọc và bình chọn. Hết hạn mà chưa sửa thì quyết định giữ hoặc loại bài.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-[7px] text-[13px] font-semibold text-slate">Loại thiếu sót</div>
                  <select value={flagCode} onChange={(e) => setFlagCode(e.target.value)}
                    className="w-full rounded-[10px] border border-border-light bg-white px-[15px] py-3 text-[14.5px] text-ink focus:border-brand-ink focus:outline-none">
                    {COMMON_FLAG_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </label>
                <Field label="Hạn bổ sung (giờ Việt Nam)" type="datetime-local" value={flagFixBy} onChange={(e) => setFlagFixBy(e.target.value)} />
                <Field label="Nội dung gửi tác giả" wrapperClassName="sm:col-span-2" value={flagMessage}
                  placeholder="vd: Bổ sung tóm tắt ≥ 50 chữ để giữ tư cách dự thi" onChange={(e) => setFlagMessage(e.target.value)} maxLength={500} />
              </div>
              <Checkbox checked={flagVisible} onChange={() => setFlagVisible((v) => !v)}>Tác giả thấy cờ này</Checkbox>
              <Button type="button" variant="ghost" fullWidth={false} className="self-start px-5 py-2.5 text-sm" disabled={pending || !flagMessage.trim()} onClick={addFlag}>
                Gắn cờ
              </Button>
            </div>
          )}

          {error && <Alert tone="error">{error}</Alert>}
        </div>
      )}
    </div>
  );
}
