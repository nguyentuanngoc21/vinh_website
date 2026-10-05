"use client";

import { useState } from "react";
import { ArrowClockwiseIcon, ShieldWarningIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Field } from "@/components/ui";
import { formatVnDateTime } from "@/lib/contests/datetime";
import type { AdminFraudSignal, FraudCounts } from "@/lib/contests/fraud-service";
import { describeFraudSignal, FRAUD_SEVERITY_LABEL, FRAUD_SIGNAL_LABEL, FRAUD_STATUS_LABEL } from "@/lib/contests/fraud-labels";
import type { ContestFraudSeverity, ContestFraudStatus } from "@/lib/supabase/types";

type Filter = ContestFraudStatus | "all";

const FILTERS: Filter[] = ["open", "confirmed", "dismissed", "all"];

const SEVERITY_TONE: Record<ContestFraudSeverity, string> = {
  low: "bg-neutral-bg text-stone-dark",
  medium: "bg-cream-card text-brand-gold-dark",
  high: "bg-error-bg text-error",
};

const STATUS_TONE: Record<ContestFraudStatus, string> = {
  open: "bg-cream-card-alt text-stone-dark",
  confirmed: "bg-error text-white",
  dismissed: "bg-neutral-bg text-stone-dark",
};

/**
 * Tab "Gian lận" (Slice 2.4 — P10). Hệ thống chỉ gắn tín hiệu; admin xác nhận
 * thì phiếu và lượt đọc của tài khoản bị loại khỏi điểm CUỘC THI NÀY (tính lại
 * ngay). Không khoá tài khoản. Khoá khi đã công bố kết quả (bảng điểm đã chốt).
 */
export function ContestFraudPanel({
  contestId,
  canScan,
  locked,
  initial,
}: {
  contestId: string;
  canScan: boolean;
  locked: boolean;
  initial: { items: AdminFraudSignal[]; counts: FraudCounts };
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const [items, setItems] = useState(initial.items);
  const [counts, setCounts] = useState(initial.counts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/api/admin/contests/${contestId}/fraud`;

  const load = async (next: Filter) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`${base}?status=${next}`);
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? "Không tải được danh sách.");
      return;
    }
    setItems(data.items);
    setCounts(data.counts);
  };

  const applyFilter = (next: Filter) => {
    setFilter(next);
    setNotice(null);
    void load(next);
  };

  const scan = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    const res = await fetch(base, { method: "POST" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? "Không quét được.");
      return;
    }
    setNotice(data.created > 0 ? `Đã gắn ${data.created} tín hiệu mới.` : "Không có tín hiệu mới.");
    await load(filter);
  };

  const onReviewed = (signal: AdminFraudSignal | null, nextCounts: FraudCounts) => {
    setCounts(nextCounts);
    if (!signal) return;
    // Rời bộ lọc hiện tại thì bỏ khỏi danh sách (vd xác nhận khi đang xem "Chờ xét").
    setItems((prev) =>
      filter === "all" || signal.status === filter ? prev.map((s) => (s.id === signal.id ? signal : s)) : prev.filter((s) => s.id !== signal.id)
    );
  };

  return (
    <section className="rounded-[14px] border border-cream-border bg-surface p-4 sm:p-[22px]">
      <div className="mb-4 flex items-start gap-2.5 rounded-[12px] bg-cream-card/60 px-3.5 py-3 text-[13px] leading-relaxed text-stone-dark">
        <ShieldWarningIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-gold-dark" />
        <span>
          Hệ thống chỉ <b>gắn tín hiệu</b> để bạn xem xét. Chỉ khi bạn <b>xác nhận</b>, phiếu và lượt đọc của tài khoản đó mới bị loại khỏi điểm của
          cuộc thi này; bảng điểm được tính lại ngay. Không tài khoản nào bị khoá tự động. Phiếu của người chưa đọc đủ lâu đã được hệ thống tự loại,
          không cần xét.
        </span>
      </div>

      {locked && (
        <div className="mb-3">
          <Alert tone="info">Đã công bố kết quả — bảng điểm đã chốt, không xét lại tín hiệu được nữa.</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => applyFilter(f)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium ${filter === f ? "bg-brand-navy text-white" : "bg-neutral-bg text-ink"}`}>
              {f === "all" ? "Tất cả" : FRAUD_STATUS_LABEL[f]}
              {f !== "all" && <span className="ml-1.5 opacity-70">{counts[f]}</span>}
            </button>
          ))}
        </div>
        {canScan && (
          <Button type="button" variant="ghost" fullWidth={false} size="sm" className="gap-1.5 self-start sm:self-auto"
            disabled={loading} onClick={scan}>
            <ArrowClockwiseIcon size={15} /> Quét lại
          </Button>
        )}
      </div>

      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {notice && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}

      {loading && items.length === 0 ? (
        <div className="text-sm text-stone-alt">Đang tải…</div>
      ) : items.length === 0 ? (
        <Alert tone="info">{filter === "open" ? "Không có tín hiệu nào đang chờ xét." : "Không có tín hiệu nào khớp bộ lọc."}</Alert>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((s) => (
            <SignalRow key={s.id} contestId={contestId} signal={s} locked={locked} onReviewed={onReviewed} />
          ))}
        </div>
      )}
    </section>
  );
}

function SignalRow({
  contestId,
  signal: s,
  locked,
  onReviewed,
}: {
  contestId: string;
  signal: AdminFraudSignal;
  locked: boolean;
  onReviewed: (signal: AdminFraudSignal | null, counts: FraudCounts) => void;
}) {
  const [note, setNote] = useState(s.review_note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = describeFraudSignal(s.signal_code, s.evidence);
  const who = s.user_name ?? s.user_username ?? "Tài khoản không còn tồn tại";

  const review = async (status: ContestFraudStatus) => {
    if (status === "confirmed" && !window.confirm(`Xác nhận gian lận: loại mọi phiếu và lượt đọc của ${who} khỏi điểm cuộc thi này?`)) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/admin/contests/${contestId}/fraud/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note.trim() || null }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? "Không thực hiện được.");
      return;
    }
    onReviewed(data.signal, data.counts);
  };

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-cream-border px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{FRAUD_SIGNAL_LABEL[s.signal_code] ?? s.signal_code}</div>
          <div className="text-xs text-stone-alt">
            {who}{s.user_username ? ` · @${s.user_username}` : ""}{s.book_title ? ` · ${s.book_title}` : ""} · phát hiện {formatVnDateTime(s.created_at)}
          </div>
          {summary && <div className="mt-1 text-[13px] text-stone-dark">{summary}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SEVERITY_TONE[s.severity]}`}>Mức {FRAUD_SEVERITY_LABEL[s.severity].toLowerCase()}</span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[s.status]}`}>{FRAUD_STATUS_LABEL[s.status]}</span>
        </div>
      </div>

      {s.status !== "open" && (
        <div className="text-xs text-stone-alt">
          {FRAUD_STATUS_LABEL[s.status]} bởi {s.reviewer_name ?? "—"} lúc {formatVnDateTime(s.reviewed_at)}
          {s.review_note ? ` — ${s.review_note}` : ""}
        </div>
      )}

      {!locked && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {s.status === "open" && (
            <Field label="Ghi chú (không bắt buộc)" wrapperClassName="flex-1" value={note} maxLength={1000}
              onChange={(e) => setNote(e.target.value)} />
          )}
          <div className="flex flex-wrap gap-2">
            {s.status === "open" ? (
              <>
                <Button type="button" variant="dark" fullWidth={false} size="sm" disabled={pending} onClick={() => review("confirmed")}>
                  Xác nhận gian lận
                </Button>
                <Button type="button" variant="ghost" fullWidth={false} size="sm" disabled={pending} onClick={() => review("dismissed")}>
                  Bỏ qua
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" fullWidth={false} size="sm" disabled={pending} onClick={() => review("open")}>
                Mở lại
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
