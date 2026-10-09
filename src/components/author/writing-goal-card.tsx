"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FlameIcon, PencilSimpleLineIcon } from "@phosphor-icons/react/dist/ssr";
import { GOAL_MAX, GOAL_MIN, type WritingGoalSummary } from "@/lib/authoring/writing-goal";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Mục tiêu viết mỗi ngày (GET/PUT /api/authoring/writing-goal). */
export function useWritingGoal() {
  const [summary, setSummary] = useState<WritingGoalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/authoring/writing-goal");
      const data = await res.json().catch(() => null);
      if (res.ok && data) setSummary(data);
    } catch { /* không chặn trang; lần lưu sau tự thử lại */ }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  const setGoal = async (dailyWords: number | null): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch("/api/authoring/writing-goal", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailyWords }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error || "Không lưu được mục tiêu."); return false; }
      setSummary(data);
      return true;
    } catch { setError("Không kết nối được máy chủ."); return false; }
  };
  return { summary, refresh, setGoal, error };
}

/** Ô nhập mục tiêu dùng chung cho thẻ ở /nhiem-vu và dòng trong trình soạn thảo. */
export function GoalInput({ initial, onSave, onCancel }: { initial: number | null; onSave: (n: number | null) => Promise<boolean>; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial ? String(initial) : "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = Number(draft.replace(/\D/g, "")) || 0;
    setBusy(true);
    if (await onSave(n > 0 ? n : null)) onCancel();
    setBusy(false);
  };
  return <span className="flex flex-wrap items-center gap-1.5">
    <input aria-label="Số chữ mỗi ngày" inputMode="numeric" autoFocus value={draft} placeholder="vd 1000"
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") void save(); if (e.key === "Escape") onCancel(); }}
      className="min-h-9 w-24 rounded-md border border-border-light bg-surface px-2 text-brand-ink" />
    <span className="text-[12px] text-stone-alt">chữ/ngày</span>
    <button type="button" disabled={busy} className="min-h-9 px-1 font-semibold text-brand-gold-dark disabled:opacity-50" onClick={save}>Lưu</button>
    {initial && <button type="button" disabled={busy} className="min-h-9 px-1 text-stone-alt disabled:opacity-50" onClick={async () => { setBusy(true); if (await onSave(null)) onCancel(); setBusy(false); }}>Tắt</button>}
    <button type="button" className="min-h-9 px-1 text-stone-alt" onClick={onCancel}>Huỷ</button>
  </span>;
}

/** Thẻ "Mục tiêu viết hôm nay" ở trang nhiệm vụ — chỉ hiện cho tác giả. Không thưởng token. */
export function WritingGoalCard() {
  const { summary, setGoal, error } = useWritingGoal();
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<7 | 30>(7);
  if (!summary || (!summary.isAuthor && !summary.goal)) return null;
  const { goal, today, streak, stats } = summary;
  const days = range === 7 ? summary.last7 : summary.last30;
  const reached = !!goal && today >= goal;
  const peak = Math.max(goal ?? 0, ...days.map(d => d.words), 1);
  const dayLabel = (day: string, i: number) => range === 7
    ? WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()]
    : i % 5 === 4 || i === days.length - 1 ? String(Number(day.slice(8))) : "";

  return <section aria-label="Mục tiêu viết hôm nay" className="mt-[18px] rounded-[18px] border border-gold-soft bg-surface px-5 py-4 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[15px] font-bold text-brand-ink">
          <PencilSimpleLineIcon size={17} /> Mục tiêu viết hôm nay
        </div>
        <div className="mt-1 text-[13.5px] text-stone-dark">
          {goal
            ? <><span className={reached ? "font-semibold text-success-text" : "font-semibold text-brand-ink"}>{fmt(today)}/{fmt(goal)} chữ</span>{reached ? " · Đã đạt ✓" : ` · còn ${fmt(goal - today)} chữ`}</>
            : <>Hôm nay đã viết <span className="font-semibold text-brand-ink">{fmt(today)} chữ</span>. Đặt mục tiêu để theo dõi chuỗi ngày viết.</>}
        </div>
        <p className="mt-1 text-[12px] text-stone-light">Tính chữ mới thêm vào chương khi lưu · sang ngày mới lúc 7:00 sáng</p>
      </div>
      {goal && <div className="flex items-center gap-2 rounded-full border border-gold-soft bg-cream-card px-4 py-2">
        <FlameIcon weight="fill" size={16} color="var(--color-brand-gold)" />
        <span className="text-[13px] font-semibold text-ink">Chuỗi {streak} ngày viết</span>
      </div>}
    </div>

    {goal && <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-cream-border">
      <div className={`h-full ${reached ? "bg-success-text" : "bg-brand-gold"}`} style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
    </div>}

    <div className="mt-4 flex items-center justify-between gap-2">
      <span className="text-[12.5px] font-semibold text-stone-dark">Thống kê viết</span>
      <div role="group" aria-label="Khoảng thời gian" className="flex rounded-full bg-cream-card p-0.5 text-[12px]">
        {([7, 30] as const).map(n => <button key={n} type="button" aria-pressed={range === n} onClick={() => setRange(n)}
          className={`min-h-8 rounded-full px-3 ${range === n ? "bg-surface font-semibold text-brand-ink shadow-sm" : "text-stone-alt"}`}>{n} ngày</button>)}
      </div>
    </div>
    <ol aria-label={`${range} ngày gần nhất`} className={`mt-2 grid gap-1 ${range === 7 ? "grid-cols-7 gap-1.5" : "grid-cols-[repeat(30,minmax(0,1fr))]"}`}>
      {days.map((d, i) => {
        const hit = !!goal && d.words >= goal;
        return <li key={d.day} className="flex flex-col items-center gap-1" title={`${d.day}: ${fmt(d.words)} chữ`}>
          <span className={`flex w-full items-end justify-center rounded-md bg-cream-card ${range === 7 ? "h-14" : "h-12"}`}>
            <span className={`${range === 7 ? "w-3/5" : "w-full"} rounded-sm ${hit ? "bg-success-text" : d.words ? "bg-brand-gold" : ""}`}
              style={{ height: `${Math.max(d.words ? 8 : 0, (d.words / peak) * 100)}%` }} />
          </span>
          <span className="h-4 text-[11px] text-stone-alt">{dayLabel(d.day, i)}</span>
        </li>;
      })}
    </ol>

    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-4">
      <div><dt className="text-stone-alt">Tháng này</dt><dd className="font-semibold text-brand-ink">{fmt(stats.month)} chữ</dd></div>
      <div><dt className="text-stone-alt">30 ngày qua</dt><dd className="font-semibold text-brand-ink">{fmt(stats.total30)} chữ · {stats.activeDays30} ngày viết</dd></div>
      <div><dt className="text-stone-alt">TB mỗi ngày có viết</dt><dd className="font-semibold text-brand-ink">{fmt(stats.avgActive30)} chữ</dd></div>
      <div><dt className="text-stone-alt">Kỷ lục (60 ngày)</dt><dd className="font-semibold text-brand-ink">
        {stats.best ? `${fmt(stats.best.words)} chữ · ${stats.best.day.slice(8)}/${stats.best.day.slice(5, 7)}` : "—"}</dd></div>
    </dl>

    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
      {editing
        ? <GoalInput initial={goal} onSave={setGoal} onCancel={() => setEditing(false)} />
        : <button type="button" className="min-h-9 font-semibold text-brand-gold-dark" onClick={() => setEditing(true)}>
          {goal ? "Đổi mục tiêu" : `Đặt mục tiêu (${fmt(GOAL_MIN)}–${fmt(GOAL_MAX)} chữ/ngày)`}
        </button>}
      <Link href="/author" className="min-h-9 content-center font-semibold text-brand-ink underline">Viết tiếp</Link>
    </div>
    {error && <p role="alert" className="mt-2 text-[13px] text-error">{error}</p>}
  </section>;
}
