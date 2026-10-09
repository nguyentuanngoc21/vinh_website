"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDownIcon, CaretUpIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import {
  DEFAULT_TOOLBAR, moveItem, toggleHidden, TOOLBAR_LABEL, type ToolbarItemId, type ToolbarPrefs,
} from "@/lib/authoring/toolbar-prefs";
import { Button, Checkbox } from "@/components/ui";
import type { FindOptions, Match } from "@/lib/authoring/find-replace";
import type { WritingGoalSummary } from "@/lib/authoring/writing-goal";
import { GoalInput } from "@/components/author/writing-goal-card";

const iconBtn = "flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-brand-ink transition-colors hover:bg-info-bg disabled:cursor-default disabled:opacity-35";
const input = "min-h-10 w-full min-w-0 rounded-lg border border-border-light bg-surface px-3 text-[14px] text-brand-ink outline-none focus:border-brand-ink";

export type FindState = { query: string; replacement: string; options: FindOptions; current: number; showReplace: boolean };
export const INITIAL_FIND: FindState = {
  query: "", replacement: "", current: 0, showReplace: false,
  options: { matchCase: false, matchDiacritics: true, wholeWord: false },
};

/** Tìm & thay thế (Ctrl+F / Ctrl+H). Kết quả được tô ở lớp nền dưới textarea. */
export function FindReplacePanel({ state, onChange, matches, onGo, onReplace, onReplaceAll, onClose, message }: {
  state: FindState;
  onChange: (next: FindState) => void;
  matches: Match[];
  onGo: (index: number) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
  message: string | null;
}) {
  const findRef = useRef<HTMLInputElement>(null);
  // Mở lại (Ctrl+F khi đang mở) cũng đưa con trỏ về ô tìm.
  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
  }, [state.showReplace]);

  const total = matches.length;
  const go = (delta: number) => total && onGo((state.current + delta + total) % total);
  const setOpt = (key: keyof FindOptions) => onChange({ ...state, current: 0, options: { ...state.options, [key]: !state.options[key] } });
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Enter" && e.currentTarget === findRef.current) { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
  };

  return <div role="search" aria-label="Tìm và thay thế" className="mb-2 rounded-lg border border-cream-border bg-surface p-2.5 text-[13px]">
    <div className="flex items-center gap-1.5">
      <input ref={findRef} aria-label="Tìm" placeholder="Tìm trong chương…" className={input} value={state.query}
        onChange={e => onChange({ ...state, query: e.target.value, current: 0 })} onKeyDown={onKey} />
      <span className="w-16 shrink-0 text-center text-stone-alt" aria-live="polite">
        {state.query ? (total ? `${Math.min(state.current + 1, total)}/${total}` : "0 kết quả") : ""}
      </span>
      <button type="button" className={iconBtn} aria-label="Kết quả trước (Shift+Enter)" disabled={!total} onClick={() => go(-1)}><CaretUpIcon size={16} /></button>
      <button type="button" className={iconBtn} aria-label="Kết quả sau (Enter)" disabled={!total} onClick={() => go(1)}><CaretDownIcon size={16} /></button>
      <button type="button" className={iconBtn} aria-label="Đóng (Esc)" onClick={onClose}><XIcon size={16} /></button>
    </div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      <Checkbox checked={state.options.matchCase} onChange={() => setOpt("matchCase")}>Phân biệt hoa thường</Checkbox>
      <Checkbox checked={state.options.matchDiacritics} onChange={() => setOpt("matchDiacritics")}>Đúng dấu</Checkbox>
      <Checkbox checked={state.options.wholeWord} onChange={() => setOpt("wholeWord")}>Nguyên từ</Checkbox>
      <button type="button" className="min-h-9 font-semibold text-brand-gold-dark" onClick={() => onChange({ ...state, showReplace: !state.showReplace })}>
        {state.showReplace ? "Ẩn thay thế" : "Thay thế…"}
      </button>
    </div>
    {state.showReplace && <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
      <input aria-label="Thay bằng" placeholder="Thay bằng…" className={input} value={state.replacement}
        onChange={e => onChange({ ...state, replacement: e.target.value })} onKeyDown={onKey} />
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" fullWidth={false} disabled={!total} onClick={onReplace} className="min-h-10 whitespace-nowrap">Thay</Button>
        <Button size="sm" fullWidth={false} disabled={!total} onClick={onReplaceAll} className="min-h-10 whitespace-nowrap">Thay tất cả ({total})</Button>
      </div>
    </div>}
    {message && <p role="status" className="mt-2 text-stone-alt">{message}</p>}
  </div>;
}

/** "Chỉnh định dạng" — xem src/lib/authoring/tidy-text.ts. */
export function TidyPanel({ onApply, onClose }: { onApply: (linesAsParagraphs: boolean) => string; onClose: () => void }) {
  const [lines, setLines] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <div className="mb-2 rounded-lg border border-cream-border bg-surface p-3 text-[13px]">
    <div className="mb-2 flex items-start justify-between gap-2">
      <p className="leading-[1.6] text-brand-ink">
        Bỏ khoảng trắng thừa, sửa khoảng cách quanh dấu câu (<span className="whitespace-nowrap">“chữ ,” → “chữ,”</span>), gộp dòng trống thừa,
        chuẩn hoá chữ có dấu khi dán từ Word. Không đổi cách bạn dùng dấu câu.
      </p>
      <button type="button" className={iconBtn} aria-label="Đóng" onClick={onClose}><XIcon size={16} /></button>
    </div>
    <Checkbox checked={lines} onChange={() => setLines(v => !v)}>
      Mỗi lần xuống dòng là một đoạn mới (dùng khi dán văn bản các đoạn chỉ cách nhau 1 dòng)
    </Checkbox>
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Button size="sm" fullWidth={false} className="min-h-10" onClick={() => setMessage(onApply(lines))}>Áp dụng</Button>
      {message && <span role="status" className="text-stone-alt">{message}</span>}
    </div>
  </div>;
}

/**
 * Dòng số chữ dưới tên chương: số chữ của chương, "+N phiên này", và mục tiêu
 * viết MỖI NGÀY của tác giả (lưu trên tài khoản — writing-goal-card.tsx).
 */
export function WordGoal({ words, sessionWords, daily }: {
  words: number;
  sessionWords: number;
  daily?: { summary: WritingGoalSummary | null; setGoal: (n: number | null) => Promise<boolean> };
}) {
  const [editing, setEditing] = useState(false);
  const fmt = (n: number) => n.toLocaleString("vi-VN");
  const summary = daily?.summary;
  const goal = summary?.goal ?? null;
  const reached = !!goal && !!summary && summary.today >= goal;
  return <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <span>{fmt(words)} chữ</span>
    {sessionWords !== 0 && <span title="So với lúc mở trang">({sessionWords > 0 ? "+" : ""}{fmt(sessionWords)} phiên này)</span>}
    {daily && summary && <>
      <span>·</span>
      {editing ? <GoalInput initial={goal} onSave={daily.setGoal} onCancel={() => setEditing(false)} /> : goal ? <>
        <span className={reached ? "font-semibold text-success-text" : undefined} title="Chữ mới đã lưu hôm nay / mục tiêu mỗi ngày">
          Hôm nay {fmt(summary.today)}/{fmt(goal)}{reached && " ✓"}
        </span>
        <span aria-hidden="true" className="h-1.5 w-14 overflow-hidden rounded-full bg-cream-border">
          <span className={`block h-full ${reached ? "bg-success-text" : "bg-brand-gold"}`} style={{ width: `${Math.min(100, (summary.today / goal) * 100)}%` }} />
        </span>
        {summary.streak > 0 && <span title="Chuỗi ngày đạt mục tiêu">🔥 {summary.streak}</span>}
        <button type="button" className="min-h-9 font-semibold text-brand-gold-dark" onClick={() => setEditing(true)}>Đổi</button>
      </> : <button type="button" className="min-h-9 font-semibold text-brand-gold-dark" onClick={() => setEditing(true)}>Đặt mục tiêu mỗi ngày</button>}
    </>}
  </span>;
}

export const SHORTCUTS: [string, string][] = [
  ["Ctrl + Z", "Hoàn tác"], ["Ctrl + Shift + Z / Ctrl + Y", "Làm lại"], ["Ctrl + S", "Lưu"],
  ["Ctrl + B / Ctrl + I", "Đậm / Nghiêng"], ["Ctrl + F", "Tìm"], ["Ctrl + H", "Thay thế"],
  ["Ctrl + Shift + F", "Chế độ tập trung"], ["Tab", "Chọn gợi ý tên"], ["Esc", "Ẩn gợi ý / đóng / thoát tập trung"],
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return <div className="mb-2 rounded-lg border border-cream-border bg-surface p-3 text-[13px]">
    <div className="mb-1 flex items-center justify-between">
      <span className="font-semibold text-brand-ink">Phím tắt <span className="font-normal text-stone-alt">(trên Mac dùng ⌘ thay Ctrl)</span></span>
      <button type="button" className={iconBtn} aria-label="Đóng" onClick={onClose}><XIcon size={16} /></button>
    </div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {SHORTCUTS.map(([k, v]) => <div key={k} className="contents"><dt><kbd className="rounded border border-cream-border px-1.5 py-0.5 text-[12px]">{k}</kbd></dt><dd className="text-brand-ink">{v}</dd></div>)}
    </dl>
  </div>;
}

/** "Tuỳ chỉnh thanh công cụ": ẩn/hiện, đổi thứ tự (lưu trên trình duyệt). */
export function ToolbarCustomizer({ prefs, available, onChange, onClose }: {
  prefs: ToolbarPrefs; available: ToolbarItemId[]; onChange: (next: ToolbarPrefs) => void; onClose: () => void;
}) {
  const items = prefs.order.filter(id => available.includes(id));
  return <div className="mb-2 rounded-lg border border-cream-border bg-surface p-3 text-[13px]">
    <div className="mb-2 flex items-start justify-between gap-2">
      <p className="leading-[1.6] text-brand-ink">Chọn nút hiện trên thanh công cụ và thứ tự. Nút ẩn vẫn dùng được bằng phím tắt. Lưu trên trình duyệt này.</p>
      <button type="button" className={iconBtn} aria-label="Đóng" onClick={onClose}><XIcon size={16} /></button>
    </div>
    <ul className="grid gap-1 sm:grid-cols-2">
      {items.map((id, i) => <li key={id} className="flex items-center gap-1 rounded-md bg-cream-card px-2">
        <span className="min-w-0 flex-1">
          <Checkbox checked={!prefs.hidden.includes(id)} onChange={() => onChange(toggleHidden(prefs, id))}>{TOOLBAR_LABEL[id]}</Checkbox>
        </span>
        <button type="button" className={iconBtn} aria-label={`Đưa ${TOOLBAR_LABEL[id]} lên`} disabled={i === 0}
          onClick={() => onChange(moveItem(prefs, id, -1))}><CaretUpIcon size={14} /></button>
        <button type="button" className={iconBtn} aria-label={`Đưa ${TOOLBAR_LABEL[id]} xuống`} disabled={i === items.length - 1}
          onClick={() => onChange(moveItem(prefs, id, 1))}><CaretDownIcon size={14} /></button>
      </li>)}
    </ul>
    <button type="button" className="mt-2 min-h-9 font-semibold text-brand-gold-dark" onClick={() => onChange(DEFAULT_TOOLBAR)}>Khôi phục mặc định</button>
  </div>;
}
