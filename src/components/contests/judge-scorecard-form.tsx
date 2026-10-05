"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { rubricTotal, type RubricCriterion } from "@/lib/contests/final-scoring/config";
import type { JudgeScorecardStatus } from "@/lib/supabase/types";

/**
 * Phiếu chấm của giám khảo (Slice 2.5b) — điểm từng tiêu chí theo rubric của
 * version cấu hình đang dùng. Nháp lưu được khi còn thiếu tiêu chí; chốt cần
 * đủ. Đã chốt thì chỉ admin mở lại được. DB kiểm lại mọi giới hạn và tự tính tổng.
 */
export function JudgeScorecardForm({
  slug,
  submissionId,
  rubric,
  canScore,
  scorecard,
}: {
  slug: string;
  submissionId: string;
  rubric: RubricCriterion[];
  canScore: boolean;
  scorecard: { status: JudgeScorecardStatus; total: number; note: string | null; scores: Record<string, number> } | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rubric.map((r) => [r.code, scorecard?.scores[r.code] !== undefined ? String(scorecard.scores[r.code]) : ""]))
  );
  const [note, setNote] = useState(scorecard?.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const finalized = scorecard?.status === "finalized";
  const readOnly = finalized || !canScore;

  const parsed: Record<string, number> = {};
  const problems: string[] = [];
  for (const r of rubric) {
    const raw = values[r.code]?.trim() ?? "";
    if (raw === "") continue;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > r.max) problems.push(`${r.label}: 0–${r.max}`);
    else parsed[r.code] = n;
  }
  const total = rubricTotal(rubric, parsed);
  const complete = rubric.every((r) => parsed[r.code] !== undefined);

  const save = async (finalize: boolean) => {
    if (problems.length) {
      setError(`Điểm không hợp lệ — ${problems.join("; ")}`);
      return;
    }
    if (finalize && !window.confirm(`Chốt phiếu với tổng ${total.toLocaleString("vi-VN")}/100? Sau khi chốt, chỉ admin mở lại được.`)) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/judging/contests/${slug}/entries/${submissionId}/scorecard`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: parsed, note: note.trim() || null, finalize }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? "Không lưu được phiếu.");
      return;
    }
    setNotice(finalize ? "Đã chốt phiếu." : "Đã lưu nháp.");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-cream-border bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-brand-ink">Phiếu chấm</h2>
        <span className="text-[22px] font-bold text-brand-ink">
          {total.toLocaleString("vi-VN")}<span className="text-sm font-medium text-stone-alt">/100</span>
        </span>
      </div>
      {finalized && (
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-success-form">
          <CheckCircleIcon size={15} weight="fill" /> Đã chốt — liên hệ admin nếu cần sửa.
        </div>
      )}
      {!canScore && !finalized && <Alert tone="info">Chưa tới hoặc đã hết thời gian chấm.</Alert>}

      <div className="flex flex-col gap-2">
        {rubric.map((r) => (
          <div key={r.code} className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-2.5">
            <span className="text-[13.5px] text-ink">{r.label} <span className="text-stone-alt">/ {r.max}</span></span>
            <Field label={null} inputMode="decimal" value={values[r.code] ?? ""} disabled={readOnly} aria-label={r.label}
              onChange={(e) => setValues((prev) => ({ ...prev, [r.code]: e.target.value }))} />
          </div>
        ))}
      </div>
      <Textarea label="Nhận xét riêng (chỉ Ban tổ chức thấy)" rows={3} maxLength={4000} value={note} disabled={readOnly}
        onChange={(e) => setNote(e.target.value)} />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {!readOnly && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="ghost" fullWidth={false} className="px-5 py-2.5 text-sm" disabled={pending} onClick={() => save(false)}>
            Lưu nháp
          </Button>
          <Button type="button" variant="dark" fullWidth={false} className="px-5 py-2.5 text-sm" disabled={pending || !complete} onClick={() => save(true)}>
            Chốt điểm
          </Button>
        </div>
      )}
      {!readOnly && !complete && <p className="text-xs text-stone-alt">Cần chấm đủ mọi tiêu chí mới chốt được.</p>}
    </div>
  );
}
