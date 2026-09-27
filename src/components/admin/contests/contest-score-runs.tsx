"use client";

import { useState } from "react";
import { CalculatorIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button } from "@/components/ui";
import { formatVnDateTime } from "@/lib/contests/datetime";
import type { ScoreRunDetail, ScoreRunSummary } from "@/lib/contests/final-scoring-service";

const FLAG_LABEL: Record<string, string> = {
  no_submissions: "Chưa có bài hợp lệ",
  single_submission: "Chỉ có 1 bài hợp lệ — cần admin xem xét trước khi công bố",
  no_active_judges: "Chưa gán giám khảo",
  judging_incomplete: "Còn bài chưa có đủ phiếu chấm đã chốt",
  snapshot_missing: "Có bài chưa có bản chụp",
  award_tie: "Đồng hạng thật ở ranh giới giải — admin quyết định",
  award_unassigned: "Có giải đặc biệt không đủ điều kiện trao",
};

const fmt = (n: number | null, digits = 2) => (n === null ? "—" : n.toLocaleString("vi-VN", { maximumFractionDigits: digits }));
const pct = (n: number) => `${(n * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

/**
 * "Kết quả chấm" (Slice 2.6a): tính thử / tính chính thức bằng version cấu
 * hình đang áp dụng, xem bảng điểm và mọi tầng (thô → điều chỉnh → chuẩn hoá)
 * để giải thích vì sao một bài có số điểm đó. Công bố 1 lượt chính thức làm kết
 * quả (thay kết quả cần lý do); đề xuất giải xác nhận ở tab "Giải thưởng".
 */
export function ContestScoreRuns({
  contestId,
  scoringWindow,
  initialRuns,
}: {
  contestId: string;
  scoringWindow: { start: string | null; end: string | null };
  initialRuns: ScoreRunSummary[];
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [detail, setDetail] = useState<ScoreRunDetail | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const started = scoringWindow.start !== null && now >= Date.parse(scoringWindow.start);
  const finished = scoringWindow.end !== null && now >= Date.parse(scoringWindow.end);

  const call = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  const request = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? "Không thực hiện được.");
    return data;
  };
  const open = (runId: string) =>
    call(async () => {
      setDetail(await request(`/api/admin/contests/${contestId}/score-runs/${runId}`));
      setOpenRow(null);
    });
  const publish = (run: ScoreRunSummary) =>
    call(async () => {
      const replacing = runs.some((r) => r.published_at && !r.superseded_at);
      const warn = run.stale_reasons.length ? `

Lưu ý: ${run.stale_reasons.join("; ")}.` : "";
      let reason: string | null = null;
      if (replacing) {
        reason = window.prompt(`Thay kết quả đang công bố bằng lượt này? Nhập lý do (bắt buộc, ghi nhật ký).${warn}`);
        if (!reason || !reason.trim()) return;
      } else if (!window.confirm(`Công bố lượt tính này làm kết quả chính thức?${warn}`)) {
        return;
      }
      const data = await request(`/api/admin/contests/${contestId}/score-runs/${run.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setRuns(data.runs);
    });
  const compute = (kind: "preview" | "final") =>
    call(async () => {
      if (kind === "final" && !window.confirm("Tính kết quả CHÍNH THỨC bằng version cấu hình đang áp dụng?")) return;
      const data = await request(`/api/admin/contests/${contestId}/score-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      setRuns(data.runs);
      setDetail(await request(`/api/admin/contests/${contestId}/score-runs/${data.runId}`));
    });

  return (
    <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
      <h2 className="flex items-center gap-2 text-base font-bold text-brand-ink"><CalculatorIcon size={17} /> Kết quả chấm</h2>
      <p className="mt-1 text-xs leading-relaxed text-stone-alt">
        Luôn tính bằng version cấu hình đang áp dụng — không thử công thức khác trên dữ liệu thật. Tính thử được từ lúc khung chấm bắt đầu;
        kết quả chính thức sau khi hết khung chấm và (nếu cấu hình yêu cầu) đủ phiếu chấm đã chốt.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" fullWidth={false} className="px-4 py-2.5 text-sm" disabled={pending || !started} onClick={() => compute("preview")}>
          Tính thử
        </Button>
        <Button type="button" variant="dark" fullWidth={false} className="px-4 py-2.5 text-sm" disabled={pending || !finished} onClick={() => compute("final")}>
          Tính chính thức
        </Button>
      </div>
      {!scoringWindow.start && <p className="mt-2 text-xs text-stone-alt">Cần đặt khung chấm chính thức trước.</p>}
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

      {runs.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => open(r.id)} disabled={pending}
                className={`flex w-full flex-col gap-0.5 rounded-[10px] border px-3.5 py-2.5 text-left text-[13px] sm:flex-row sm:items-center sm:justify-between ${
                  detail?.run.id === r.id ? "border-brand-ink" : "border-cream-border"
                }`}>
                <span>
                  <b className={r.kind === "final" ? "text-brand-ink" : "text-stone-dark"}>{r.kind === "final" ? "Chính thức" : "Tính thử"}</b>
                  {" · "}v{r.config_version} · {formatVnDateTime(r.computed_at)} · {r.computed_by_name ?? "—"}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {r.published_at && !r.superseded_at && (
                    <span className="rounded-full bg-success-form-bg px-2 py-0.5 text-[11px] font-semibold text-success-form">Đang công bố</span>
                  )}
                  {r.superseded_at && <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-[11px] font-semibold text-stone-dark">Đã thay thế</span>}
                  {r.stale_reasons.length > 0 && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-cream-gold-text">
                      <WarningIcon size={13} weight="fill" /> Cần tính lại
                    </span>
                  )}
                </span>
              </button>
              {r.kind === "final" && !r.published_at && !r.superseded_at && (
                <button type="button" disabled={pending} onClick={() => publish(r)}
                  className="mt-1 text-xs font-semibold text-brand-ink disabled:opacity-50">
                  Công bố lượt này làm kết quả →
                </button>
              )}
              {r.publish_reason && <p className="mt-0.5 text-xs text-stone-alt">Lý do thay kết quả: {r.publish_reason}</p>}
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <div className="mt-5">
          {(() => {
            const summary = runs.find((r) => r.id === detail.run.id);
            const flags = detail.run.flags as { code: string }[];
            return (
              <div className="flex flex-col gap-2">
                {summary?.stale_reasons.map((s) => <Alert key={s} tone="info">{s} — lượt tính này không còn phản ánh dữ liệu hiện tại.</Alert>)}
                {flags.map((f, i) => <Alert key={`${f.code}-${i}`} tone="info">{FLAG_LABEL[f.code] ?? f.code}</Alert>)}
                <p className="text-[11px] text-stone-alt break-all">input_digest {detail.run.input_digest}</p>
              </div>
            );
          })()}
          <div className="mt-3 flex flex-col gap-2">
            {detail.rows.map((r) => (
              <div key={r.submission_id} className="rounded-[10px] border border-cream-border">
                <button type="button" onClick={() => setOpenRow(openRow === r.submission_id ? null : r.submission_id)}
                  className="grid w-full grid-cols-[44px_minmax(0,1fr)_64px] items-center gap-2 px-3 py-2.5 text-left sm:grid-cols-[44px_minmax(0,1fr)_repeat(6,64px)]">
                  <span className="text-lg font-extrabold text-brand-ink">{r.rank}{r.tied && <span className="block text-[10px] font-semibold text-stone-alt">đồng hạng</span>}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{r.book_title}</span>
                    <span className="block truncate text-xs text-stone-alt">
                      {r.author_name}{r.awards.length ? ` · ${r.awards.map((a) => a.name).join(", ")}` : ""}
                    </span>
                  </span>
                  <span className="text-right text-[15px] font-bold text-brand-ink">{fmt(r.final_score)}</span>
                  <span className="hidden text-right text-[13px] sm:block" title="Ban giám khảo">{fmt(r.judge_score)}</span>
                  <span className="hidden text-right text-[13px] sm:block" title="Độc giả">{fmt(r.reader_score, 1)}</span>
                  <span className="hidden text-right text-[13px] sm:block" title="Chất lượng đọc">{fmt(r.reading_quality_score, 1)}</span>
                  <span className="hidden text-right text-[13px] sm:block" title="Tương tác">{fmt(r.engagement_score, 1)}</span>
                  <span className="hidden text-right text-[13px] sm:block" title="Bình chọn">{fmt(r.vote_score, 1)}</span>
                </button>
                {openRow === r.submission_id && (
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-cream-border px-3 py-3 text-[12.5px] text-stone-dark sm:grid-cols-2">
                    <div><dt className="inline font-semibold">Ban giám khảo: </dt><dd className="inline">{fmt(r.judge_score)} ({r.judge_count} phiếu)</dd></div>
                    <div><dt className="inline font-semibold">Hệ thống: </dt><dd className="inline">{fmt(r.system_score)}</dd></div>
                    <div><dt className="inline font-semibold">Độc giả hợp lệ: </dt><dd className="inline">{r.valid_readers} → log {fmt(r.reader_transformed, 4)} → {fmt(r.reader_score)}</dd></div>
                    <div><dt className="inline font-semibold">Depth: </dt><dd className="inline">{r.reader_depth_count} người · tổng hợp {pct(r.aggregated_depth)} → điều chỉnh {pct(r.adjusted_depth)} → {fmt(r.depth_score)}</dd></div>
                    <div><dt className="inline font-semibold">Quay lại: </dt><dd className="inline">{r.returning_readers} · thô {pct(r.raw_return_rate)} → điều chỉnh {pct(r.adjusted_return_rate)} → {fmt(r.return_score)}</dd></div>
                    <div><dt className="inline font-semibold">Chất lượng đọc: </dt><dd className="inline">{fmt(r.reading_quality_score)}</dd></div>
                    <div><dt className="inline font-semibold">Tương tác: </dt><dd className="inline">{r.engaged_readers} · thô {pct(r.raw_engagement_rate)} → điều chỉnh {pct(r.adjusted_engagement_rate)} → {fmt(r.engagement_score)}</dd></div>
                    <div><dt className="inline font-semibold">Bình chọn: </dt><dd className="inline">{r.valid_votes} · thô {pct(r.raw_vote_rate)} → điều chỉnh {pct(r.adjusted_vote_rate)} → {fmt(r.vote_score)}</dd></div>
                  </dl>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-stone-alt sm:hidden">Chạm vào một bài để xem điểm từng thành phần.</p>
          <p className="mt-2 hidden text-[11px] text-stone-alt sm:block">Cột: Chung cuộc · BGK · Độc giả · Chất lượng đọc · Tương tác · Bình chọn. Bấm vào bài để xem từng tầng.</p>
        </div>
      )}
    </section>
  );
}
