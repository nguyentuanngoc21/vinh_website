"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowSquareOutIcon, GavelIcon, UserMinusIcon, UserPlusIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Checkbox, Field, Select, Textarea } from "@/components/ui";
import { formatVnDateTime } from "@/lib/contests/datetime";
import {
  DEFAULT_FINAL_SCORING_CONFIG,
  SCORE_COMPONENTS,
  type DepthAggregation,
  type EngagementAction,
  type FinalScoringConfig,
  type RateAdjustment,
  type ScoreComponent,
} from "@/lib/contests/final-scoring/config";
import type { NormalizationStrategy, NormalizationType } from "@/lib/contests/final-scoring/normalization";
import type { AdminJudge, JudgingOverview, ScoringConfigState } from "@/lib/contests/judging-service";
import type { ScoreRunSummary } from "@/lib/contests/final-scoring-service";
import { ContestScoreRuns } from "@/components/admin/contests/contest-score-runs";

const COMPONENT_LABEL: Record<ScoreComponent, string> = {
  judge: "Ban giám khảo",
  reader: "Độc giả (Reader)",
  reading_quality: "Chất lượng đọc",
  engagement: "Tương tác",
  vote: "Bình chọn",
};
const ACTION_LABEL: Record<EngagementAction, string> = {
  comment: "Bình luận",
  chapter_vote: "Bình chọn chương",
  character_vote: "Bình chọn nhân vật",
  reading_list: "Lưu vào danh sách đọc",
  author_follow: "Theo dõi tác giả (chỉ khi là độc giả hợp lệ của bài)",
};
const TIE_LABEL: Record<string, string> = {
  judge: "Điểm Ban giám khảo",
  reading_quality: "Chất lượng đọc",
  reader: "Điểm độc giả",
  engagement: "Tương tác",
  vote: "Bình chọn",
  submitted_at: "Nộp sớm hơn",
};
const EVENT_LABEL: Record<string, string> = {
  save_draft: "Lưu nháp",
  finalize: "Chốt phiếu",
  reopen: "Mở lại",
  invalidate: "Huỷ phiếu",
};

const clone = (c: FinalScoringConfig): FinalScoringConfig => JSON.parse(JSON.stringify(c));
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const details = Array.isArray(data?.details) ? `: ${data.details.join("; ")}` : "";
    throw new Error(`${data?.error ?? "Không thực hiện được."}${details}`);
  }
  return data;
}

/**
 * Tab "Chấm điểm" (Slice 2.5b): cấu hình chấm có version, giám khảo, tiến độ
 * chấm + mở lại / huỷ phiếu. Điểm chung cuộc (tính, xếp hạng, đề xuất giải)
 * thuộc Slice 2.6.
 */
export function ContestJudgingPanel({
  contestId,
  contestSlug,
  officialWindow,
  initial,
}: {
  contestId: string;
  contestSlug: string;
  officialWindow: { start: string | null; end: string | null };
  initial: { config: ScoringConfigState; judges: AdminJudge[]; overview: JudgingOverview; runs: ScoreRunSummary[] };
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <h2 className="text-base font-bold text-brand-ink">Khung chấm chính thức</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-dark">
          {officialWindow.start
            ? `${formatVnDateTime(officialWindow.start)} → ${formatVnDateTime(officialWindow.end)}. Chỉ lượt đọc, tương tác và phiếu trong khung này vào điểm chung cuộc; khung bình chọn phải nằm trong khung này.`
            : "Chưa đặt. Đặt ở tab “Thông tin & thể lệ” (sau khi đóng nhận bài; khung bình chọn nằm trong khung chấm). Khoá khi khung chấm bắt đầu."}
        </p>
      </section>
      <ConfigSection contestId={contestId} initial={initial.config} />
      <JudgesSection contestId={contestId} contestSlug={contestSlug} initial={initial.judges} />
      <ProgressSection contestId={contestId} initial={initial.overview} />
      <ContestScoreRuns contestId={contestId} scoringWindow={officialWindow} initialRuns={initial.runs} />
    </div>
  );
}

const NORMALIZATION_LABEL: Record<NormalizationType, string> = {
  none: "Không chuẩn hoá (thang 100 sẵn)",
  absolute: "ABSOLUTE — tỷ lệ × 100",
  relative_max: "RELATIVE_MAX — so với bài cao nhất",
  log_relative_max: "LOG_RELATIVE_MAX",
  percentile: "PERCENTILE",
  reference_value: "REFERENCE_VALUE — so với mốc chuẩn",
};
const RATE_NORMALIZATIONS: NormalizationType[] = ["relative_max", "absolute", "log_relative_max", "percentile", "reference_value"];

function NormalizationSelect({
  label,
  value,
  disabled,
  options = RATE_NORMALIZATIONS,
  onChange,
}: {
  label: string;
  value: NormalizationStrategy;
  disabled: boolean;
  options?: NormalizationType[];
  onChange: (v: NormalizationStrategy) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Select label={label} value={value.type} disabled={disabled}
        onChange={(e) => {
          const t = e.target.value as NormalizationType;
          onChange(t === "reference_value" ? { type: t, reference: value.type === "reference_value" ? value.reference : 0.3 } : ({ type: t } as NormalizationStrategy));
        }}
        className="disabled:bg-neutral-bg">
        {options.map((o) => <option key={o} value={o}>{NORMALIZATION_LABEL[o]}</option>)}
      </Select>
      {value.type === "reference_value" && (
        <Field label="Mốc chuẩn (reference)" type="number" step="0.01" disabled={disabled} value={String(value.reference)}
          onChange={(e) => onChange({ type: "reference_value", reference: num(e.target.value) })} />
      )}
    </div>
  );
}

function AdjustmentField({ label, value, disabled, onChange }: { label: string; value: RateAdjustment; disabled: boolean; onChange: (v: RateAdjustment) => void }) {
  return (
    <Field label={label} type="number" step="1" disabled={disabled} hint="0 = không điều chỉnh"
      value={value.type === "bayesian" ? String(value.prior_strength) : "0"}
      onChange={(e) => {
        const c = num(e.target.value);
        onChange(Number.isFinite(c) && c > 0 ? { type: "bayesian", prior_strength: c } : { type: "none" });
      }} />
  );
}

function ConfigSection({ contestId, initial }: { contestId: string; initial: ScoringConfigState }) {
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState<FinalScoringConfig>(() => clone(initial.active ?? DEFAULT_FINAL_SCORING_CONFIG));
  const [reason, setReason] = useState("");
  // Mục 14–15 bản cập nhật J3: từ lúc khung chấm bắt đầu cấu hình khoá; chỉ đổi
  // bằng version mới kèm lý do rồi tính lại toàn bộ — phải chủ động mở khoá.
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = state.reasonRequired && !unlocked;

  const update = (fn: (c: FinalScoringConfig) => void) =>
    setDraft((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
  const comp = draft.components;
  const weightSum = SCORE_COMPONENTS.reduce((n, k) => n + (Number.isFinite(comp[k].weight) ? comp[k].weight : 0), 0);
  const rubricSum = draft.rubric.reduce((n, r) => n + (Number.isFinite(r.max) ? r.max : 0), 0);

  const save = async () => {
    if (state.reasonRequired && !reason.trim()) {
      setError("Khung chấm đã bắt đầu — cần nhập lý do thay đổi.");
      return;
    }
    if (state.reasonRequired && !window.confirm("Tạo version cấu hình mới sau khi khung chấm đã bắt đầu? Mọi lượt tính trước đó sẽ phải tính lại toàn bộ.")) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const data = await send(`/api/admin/contests/${contestId}/scoring-config`, "PUT", { config: draft, reason: reason.trim() || null });
      setState(data.state);
      setReason("");
      setUnlocked(false);
      setNotice(`Đã lưu version ${data.version}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const numberField = (label: string, value: number, onChange: (v: number) => void, opts: { step?: string; hint?: string } = {}) => (
    <Field label={label} type="number" step={opts.step ?? "1"} hint={opts.hint} disabled={locked} value={Number.isFinite(value) ? String(value) : ""}
      onChange={(e) => onChange(num(e.target.value))} />
  );

  return (
    <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-bold text-brand-ink">Cấu hình chấm chung cuộc</h2>
        <span className="text-xs text-stone-alt">
          {state.activeVersion ? `Đang dùng version ${state.activeVersion}` : "Chưa lưu — đang hiện giá trị mặc định"}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-stone-alt">
        Mỗi thành phần: dữ liệu thô → điều chỉnh độ tin cậy → chuẩn hoá về 0–100 → × trọng số. Chọn cách chuẩn hoá TRƯỚC khung chấm;
        không đổi công thức sau khi đã thấy kết quả thật. Mỗi lần lưu tạo version mới, version cũ giữ nguyên.
      </p>
      {state.reasonRequired && (
        <div className="mt-3">
          <Alert tone="info">
            Khung chấm đã bắt đầu — cấu hình đang khoá. Chỉ đổi khi bắt buộc: tạo version mới kèm lý do, rồi tính lại toàn bộ cuộc thi.
            {!unlocked && (
              <button type="button" onClick={() => setUnlocked(true)} className="ml-1 font-semibold text-brand-ink underline">
                Mở khoá để tạo version mới
              </button>
            )}
          </Alert>
        </div>
      )}

      <div className="mt-4 text-[13px] font-semibold text-slate">Trọng số (tổng = 1 · hiện {weightSum.toFixed(2)})</div>
      <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {SCORE_COMPONENTS.map((k) => (
          <div key={k}>{numberField(COMPONENT_LABEL[k], comp[k].weight, (v) => update((c) => { c.components[k].weight = v; }), { step: "0.01" })}</div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-cream-border p-3.5">
          <div className="text-[13px] font-bold text-brand-ink">Ban giám khảo</div>
          <p className="text-xs text-stone-alt">Trung bình phiếu đã chốt, thang 100 tuyệt đối — không kéo điểm cao nhất lên 100.</p>
        </div>
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-cream-border p-3.5">
          <div className="text-[13px] font-bold text-brand-ink">Độc giả (số độc giả hợp lệ)</div>
          <Checkbox checked={comp.reader.transformation === "log"} disabled={locked}
            onChange={() => update((c) => { c.components.reader.transformation = c.components.reader.transformation === "log" ? "none" : "log"; })}>
            Biến đổi log(1 + R) trước khi chuẩn hoá
          </Checkbox>
          <NormalizationSelect label="Chuẩn hoá" value={comp.reader.normalization} disabled={locked}
            options={comp.reader.transformation === "log" ? RATE_NORMALIZATIONS.filter((t) => t !== "log_relative_max") : RATE_NORMALIZATIONS}
            onChange={(v) => update((c) => { c.components.reader.normalization = v; })} />
        </div>
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-cream-border p-3.5">
          <div className="text-[13px] font-bold text-brand-ink">Chất lượng đọc — Depth (% nội dung đã đọc)</div>
          <div className="grid grid-cols-2 gap-2.5">
            {numberField("Tỷ trọng trong Chất lượng đọc", comp.reading_quality.depth.weight, (v) => update((c) => { c.components.reading_quality.depth.weight = v; }), { step: "0.05" })}
            <Select label="Tổng hợp" value={comp.reading_quality.depth.aggregation} disabled={locked}
              onChange={(e) => update((c) => { c.components.reading_quality.depth.aggregation = e.target.value as DepthAggregation; })}
              className="disabled:bg-neutral-bg">
              <option value="median">Trung vị (chống outlier)</option>
              <option value="mean">Trung bình</option>
            </Select>
          </div>
          <AdjustmentField label="Co về mức chung (C)" value={comp.reading_quality.depth.adjustment} disabled={locked}
            onChange={(v) => update((c) => { c.components.reading_quality.depth.adjustment = v; })} />
          <NormalizationSelect label="Chuẩn hoá" value={comp.reading_quality.depth.normalization} disabled={locked}
            onChange={(v) => update((c) => { c.components.reading_quality.depth.normalization = v; })} />
        </div>
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-cream-border p-3.5">
          <div className="text-[13px] font-bold text-brand-ink">Chất lượng đọc — Return (tỷ lệ quay lại)</div>
          {numberField("Tỷ trọng trong Chất lượng đọc", comp.reading_quality.return.weight, (v) => update((c) => { c.components.reading_quality.return.weight = v; }), { step: "0.05" })}
          <AdjustmentField label="Bayesian (C)" value={comp.reading_quality.return.adjustment} disabled={locked}
            onChange={(v) => update((c) => { c.components.reading_quality.return.adjustment = v; })} />
          <NormalizationSelect label="Chuẩn hoá" value={comp.reading_quality.return.normalization} disabled={locked}
            onChange={(v) => update((c) => { c.components.reading_quality.return.normalization = v; })} />
        </div>
        {(["engagement", "vote"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-2.5 rounded-[12px] border border-cream-border p-3.5">
            <div className="text-[13px] font-bold text-brand-ink">{k === "vote" ? "Bình chọn (phiếu ÷ độc giả hợp lệ)" : "Tương tác (độc giả tương tác ÷ độc giả hợp lệ)"}</div>
            <AdjustmentField label="Bayesian (C)" value={comp[k].adjustment} disabled={locked}
              onChange={(v) => update((c) => { c.components[k].adjustment = v; })} />
            <NormalizationSelect label="Chuẩn hoá" value={comp[k].normalization} disabled={locked}
              onChange={(v) => update((c) => { c.components[k].normalization = v; })} />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {numberField("Đọc thật: tỷ lệ", draft.valid_reader.meaningful_read_ratio, (v) => update((c) => { c.valid_reader.meaningful_read_ratio = v; }), { step: "0.05" })}
        {numberField("Đọc thật: tối thiểu (giây)", draft.valid_reader.meaningful_read_min_seconds, (v) => update((c) => { c.valid_reader.meaningful_read_min_seconds = v; }))}
        {numberField("Tốc độ ước tính (chữ/phút)", draft.valid_reader.reading_words_per_minute, (v) => update((c) => { c.valid_reader.reading_words_per_minute = v; }))}
        {numberField("Trần tốc độ đọc (chữ/phút)", draft.reading_depth.max_words_per_minute, (v) => update((c) => { c.reading_depth.max_words_per_minute = v; }))}
        {numberField("Lượt ghé mới sau (phút)", draft.return_visit.min_gap_minutes, (v) => update((c) => { c.return_visit.min_gap_minutes = v; }))}
        {numberField("Lượt ghé tối thiểu (giây)", draft.return_visit.min_active_seconds, (v) => update((c) => { c.return_visit.min_active_seconds = v; }))}
      </div>

      <div className="mt-4 text-[13px] font-semibold text-slate">Hành động tính là tương tác</div>
      <div className="mt-2 flex flex-col gap-1.5">
        {(Object.keys(ACTION_LABEL) as EngagementAction[]).map((a) => (
          <Checkbox key={a} checked={draft.engagement_actions.includes(a)} disabled={locked}
            onChange={() => update((c) => { c.engagement_actions = c.engagement_actions.includes(a) ? c.engagement_actions.filter((x) => x !== a) : [...c.engagement_actions, a]; })}>
            {ACTION_LABEL[a]}
          </Checkbox>
        ))}
      </div>

      <div className="mt-4 text-[13px] font-semibold text-slate">
        Tiêu chí chấm (tổng = 100 · hiện {rubricSum}){state.rubricLocked ? " — đã khoá vì đã có phiếu chấm" : ""}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {draft.rubric.map((r, i) => (
          <div key={r.code} className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
            <Field label={null} value={r.label} disabled={locked || state.rubricLocked} maxLength={80}
              onChange={(e) => update((c) => { c.rubric[i].label = e.target.value; })} />
            <Field label={null} type="number" step="0.5" value={Number.isFinite(r.max) ? String(r.max) : ""} disabled={locked || state.rubricLocked}
              onChange={(e) => update((c) => { c.rubric[i].max = num(e.target.value); })} />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-[12.5px] leading-relaxed text-stone-dark sm:grid-cols-3">
        <div><b className="text-slate">Phá hoà:</b> {draft.tie_break.map((k) => TIE_LABEL[k] ?? k).join(" → ")}</div>
        <div><b className="text-slate">Giải chính:</b> {draft.main_awards.map((a) => `${a.name} (hạng ${a.positions.join(", ")})`).join("; ")}</div>
        <div>
          <b className="text-slate">Giải đặc biệt:</b> {draft.special_awards.order.map((a) => a.name).join(" → ")}
          {draft.special_awards.exclude_main_winners ? " · không xét bài đã có giải chính" : ""} · tối đa {draft.special_awards.max_per_submission} giải/bài
        </div>
      </div>
      <div className="mt-3">
        <Checkbox checked={draft.require_all_judges} disabled={locked} onChange={() => update((c) => { c.require_all_judges = !c.require_all_judges; })}>
          Chỉ công bố khi mọi giám khảo đã chốt mọi bài
        </Checkbox>
      </div>

      {!locked && (
        <div className="mt-4">
          <Textarea label={state.reasonRequired ? "Lý do thay đổi *" : "Lý do thay đổi (không bắt buộc trước khung chấm)"} rows={2} maxLength={1000}
            value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      {notice && <div className="mt-3"><Alert tone="success">{notice}</Alert></div>}
      {!locked && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="dark" fullWidth={false} className="px-5 py-2.5 text-sm" disabled={pending} onClick={save}>
            Lưu version mới
          </Button>
          {(state.active || unlocked) && (
            <Button type="button" variant="ghost" fullWidth={false} className="px-5 py-2.5 text-sm" disabled={pending}
              onClick={() => {
                setDraft(clone(state.active ?? DEFAULT_FINAL_SCORING_CONFIG));
                setUnlocked(false);
                setReason("");
              }}>
              Bỏ thay đổi
            </Button>
          )}
        </div>
      )}

      {state.history.length > 0 && (
        <div className="mt-5">
          <div className="text-[13px] font-semibold text-slate">Lịch sử version</div>
          <ul className="mt-1.5 flex flex-col gap-1 text-xs text-stone-dark">
            {state.history.map((h) => (
              <li key={h.version}>
                <b>v{h.version}</b>{h.previous_version ? ` (thay v${h.previous_version})` : ""} · {formatVnDateTime(h.created_at)} · {h.created_by_name ?? "—"}
                {h.reason ? ` — ${h.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function JudgesSection({ contestId, contestSlug, initial }: { contestId: string; contestSlug: string; initial: AdminJudge[] }) {
  const [judges, setJudges] = useState(initial);
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ judges: AdminJudge[] }>) => {
    setPending(true);
    setError(null);
    try {
      setJudges((await fn()).judges);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-bold text-brand-ink">Giám khảo</h2>
        <Link href={`/giam-khao/${contestSlug}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-gold-dark no-underline">
          Mở màn chấm <ArrowSquareOutIcon size={13} />
        </Link>
      </div>
      <p className="mt-1 text-xs text-stone-alt">Tài khoản Vịnh sẵn có, không đổi vai trò. Màn chấm đọc bản chụp và không hiện tên tác giả.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Tên đăng nhập" wrapperClassName="flex-1" placeholder="vd: nguyenvana" value={username} maxLength={60}
          onChange={(e) => setUsername(e.target.value)} />
        <Button type="button" variant="dark" fullWidth={false} className="flex items-center gap-1.5 px-5 py-3 text-sm" disabled={pending || !username.trim()}
          onClick={() => run(async () => {
            const data = await send(`/api/admin/contests/${contestId}/judges`, "POST", { username });
            setUsername("");
            return data;
          })}>
          <UserPlusIcon size={15} /> Gán
        </Button>
      </div>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      <ul className="mt-3 flex flex-col gap-2">
        {judges.length === 0 && <li className="text-sm text-stone-alt">Chưa có giám khảo.</li>}
        {judges.map((j) => (
          <li key={j.user_id} className="flex flex-col gap-1.5 rounded-[10px] border border-cream-border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <span className={`font-semibold ${j.removed_at ? "text-stone-alt line-through" : "text-ink"}`}>{j.name}</span>
              {j.username && <span className="text-stone-alt"> · @{j.username}</span>}
              <div className="text-xs text-stone-alt">
                {j.removed_at ? `Đã gỡ ${formatVnDateTime(j.removed_at)}${j.removed_reason ? ` — ${j.removed_reason}` : ""}` : `Gán ${formatVnDateTime(j.assigned_at)}`}
              </div>
            </div>
            {!j.removed_at && (
              <button type="button" disabled={pending}
                onClick={() => {
                  const reason = window.prompt(`Lý do gỡ ${j.name}? Phiếu của người này sẽ không vào điểm.`);
                  if (reason && reason.trim()) void run(() => send(`/api/admin/contests/${contestId}/judges/${j.user_id}`, "DELETE", { reason }));
                }}
                className="inline-flex items-center gap-1.5 self-start rounded-full border border-cream-border px-3 py-1.5 text-xs font-semibold text-error disabled:opacity-50 sm:self-auto">
                <UserMinusIcon size={13} /> Gỡ
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProgressSection({ contestId, initial }: { contestId: string; initial: JudgingOverview }) {
  const [overview, setOverview] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async (scorecardId: string, action: "reopen" | "invalidate", label: string) => {
    const reason = window.prompt(`Lý do ${label.toLowerCase()} phiếu? (ghi vào nhật ký)`);
    if (!reason || !reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      setOverview(await send(`/api/admin/contests/${contestId}/scorecards/${scorecardId}`, "PATCH", { action, reason }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-brand-ink"><GavelIcon size={17} /> Tiến độ chấm</h2>
        <span className="text-xs text-stone-alt">{overview.progress.finalized}/{overview.progress.required} phiếu đã chốt</span>
      </div>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      {overview.judges.length === 0 ? (
        <p className="mt-3 text-sm text-stone-alt">Gán giám khảo để bắt đầu chấm.</p>
      ) : overview.entries.length === 0 ? (
        <p className="mt-3 text-sm text-stone-alt">Chưa có bài hợp lệ.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {overview.entries.map((e) => (
            <div key={e.submission_id} className="rounded-[10px] border border-cream-border px-3.5 py-2.5">
              <div className="text-sm font-semibold text-ink">{e.book_title}</div>
              <div className="text-xs text-stone-alt">{e.author_name}</div>
              <div className="mt-2 flex flex-col gap-1.5">
                {overview.judges.map((j) => {
                  const c = e.cards[j.user_id];
                  return (
                    <div key={j.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                      <span className="min-w-[120px] text-stone-dark">{j.name}</span>
                      {!c ? (
                        <span className="rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs text-stone-dark">Chưa chấm</span>
                      ) : c.status === "finalized" ? (
                        <>
                          <span className="rounded-full bg-success-form-bg px-2.5 py-0.5 text-xs font-semibold text-success-form">Đã chốt · {c.total}</span>
                          <button type="button" disabled={pending} onClick={() => review(c.id, "reopen", "Mở lại")}
                            className="text-xs font-semibold text-brand-ink disabled:opacity-50">Mở lại</button>
                          <button type="button" disabled={pending} onClick={() => review(c.id, "invalidate", "Huỷ")}
                            className="text-xs font-semibold text-error disabled:opacity-50">Huỷ</button>
                        </>
                      ) : (
                        <>
                          <span className="rounded-full bg-cream-card-alt px-2.5 py-0.5 text-xs text-stone-dark">Nháp · {c.total}</span>
                          <button type="button" disabled={pending} onClick={() => review(c.id, "invalidate", "Huỷ")}
                            className="text-xs font-semibold text-error disabled:opacity-50">Huỷ</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {overview.events.length > 0 && (
        <div className="mt-5">
          <div className="text-[13px] font-semibold text-slate">Nhật ký gần nhất</div>
          <ul className="mt-1.5 flex flex-col gap-1 text-xs text-stone-dark">
            {overview.events.map((ev) => (
              <li key={ev.id}>
                {formatVnDateTime(ev.created_at)} · <b>{EVENT_LABEL[ev.action] ?? ev.action}</b> · {ev.book_title} · {ev.actor_name}
                {ev.reason ? ` — ${ev.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
