"use client";

import { useState } from "react";
import Link from "next/link";
import { PushPinIcon, PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, Field, Modal } from "@/components/ui";
import { TERM_KIND_LABEL, type QuickItem, type StoryTerm, type StoryTermKind, type Suggestion } from "@/lib/story-terms";

export type QuickAddKind = "character" | StoryTermKind;
const KIND_OPTIONS: [QuickAddKind, string][] = [["character", "Nhân vật"], ...(Object.entries(TERM_KIND_LABEL) as [StoryTermKind, string][])];
const kindLabel = (k: QuickAddKind) => (k === "character" ? "Nhân vật" : TERM_KIND_LABEL[k]);

/** Dấu câu khó gõ trên bàn phím điện thoại. `pair` = bọc vùng chọn / đặt con trỏ ở giữa. */
export const PUNCTUATION: { label: string; open: string; close?: string; title: string }[] = [
  { label: "“ ”", open: "“", close: "”", title: "Ngoặc kép" },
  { label: "「 」", open: "「", close: "」", title: "Ngoặc vuông góc" },
  { label: "…", open: "…", title: "Ba chấm" },
  { label: "—", open: "—", title: "Gạch ngang dài" },
  { label: "~", open: "~", title: "Dấu ngã" },
  { label: "!", open: "!", title: "Chấm than" },
  { label: "?", open: "?", title: "Chấm hỏi" },
];

// Bấm chip không được lấy focus khỏi textarea — giữ con trỏ và bàn phím điện thoại.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();
const chip = "min-h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3 text-[13px] transition-colors";

/**
 * Thanh dưới toolbar của trình soạn thảo: gợi ý tên đang gõ, dấu câu nhanh,
 * và "Nhập nhanh" tên nhân vật / địa danh / thuật ngữ (src/lib/story-terms.ts).
 */
export function QuickInsertBar({
  items, suggestions, onInsert, onPunctuation, onAcceptSuggestion, canAdd, onAdd, onManage, getSelectedText,
}: {
  items: QuickItem[];
  suggestions: Suggestion[];
  onInsert: (item: QuickItem) => void;
  onPunctuation: (open: string, close?: string) => void;
  onAcceptSuggestion: (s: Suggestion) => void;
  /** false ở màn tạo truyện mới (chưa có truyện để lưu tên). */
  canAdd: boolean;
  onAdd: (name: string, kind: QuickAddKind) => Promise<string | null>;
  onManage: () => void;
  getSelectedText: () => string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<QuickAddKind>("character");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAdd = () => {
    setName(getSelectedText().trim().slice(0, 60));
    setError(null);
    setAdding(true);
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const err = await onAdd(name, kind);
    setBusy(false);
    if (err) setError(err);
    else { setAdding(false); setName(""); }
  };

  return <div className="flex flex-col gap-1.5 border-b border-cream-border bg-surface-warm pb-2">
    {suggestions.length > 0 && <div role="listbox" aria-label="Gợi ý tên" className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-[12px] text-stone-alt">Gợi ý <kbd className="rounded border border-cream-border px-1">Tab</kbd></span>
      {suggestions.map((s, i) => <button key={s.item.key} type="button" role="option" aria-selected={i === 0}
        onMouseDown={keepFocus} onClick={() => onAcceptSuggestion(s)}
        className={`${chip} ${i === 0 ? "bg-brand-navy text-white" : "bg-cream-card text-brand-ink hover:bg-info-bg"}`}>
        {s.item.text}
      </button>)}
    </div>}

    <div className="flex items-center gap-1 overflow-x-auto" aria-label="Dấu câu nhanh">
      {PUNCTUATION.map(p => <button key={p.label} type="button" title={p.title} aria-label={p.title}
        onMouseDown={keepFocus} onClick={() => onPunctuation(p.open, p.close)}
        className="min-h-9 min-w-9 shrink-0 cursor-pointer rounded-md px-2 font-[family-name:var(--font-lora)] text-[15px] text-brand-ink transition-colors hover:bg-info-bg">
        {p.label}
      </button>)}
    </div>

    <div className="flex items-center gap-1.5 overflow-x-auto" aria-label="Nhập nhanh">
      <span className="shrink-0 text-[12px] font-semibold text-stone-alt">Nhập nhanh</span>
      {canAdd && <button type="button" onMouseDown={keepFocus} onClick={adding ? () => setAdding(false) : openAdd}
        className={`${chip} flex items-center gap-1 border border-brand-gold-dark font-semibold text-brand-gold-dark`}>
        <PlusIcon size={12} weight="bold" /> Thêm
      </button>}
      {items.map(item => <button key={item.key} type="button" title={kindLabel(item.kind)}
        onMouseDown={keepFocus} onClick={() => onInsert(item)}
        className={`${chip} bg-cream-card text-brand-ink hover:bg-info-bg`}>
        {item.pinned && <PushPinIcon size={11} weight="fill" className="mr-1 inline text-brand-gold-dark" />}{item.label}
      </button>)}
      {!items.length && <span className="shrink-0 text-[12px] text-stone-alt">
        {canAdd ? "Chưa có tên nào — bôi đen 1 tên trong bài rồi bấm Thêm." : "Tạo truyện xong để lưu tên nhân vật, địa danh."}
      </span>}
      {canAdd && <button type="button" onClick={onManage} className="ml-auto min-h-9 shrink-0 px-2 text-[13px] font-semibold text-brand-gold-dark">Quản lý</button>}
    </div>

    {adding && <div className="flex flex-col gap-2 rounded-lg border border-cream-border bg-surface p-2.5 sm:flex-row sm:items-end">
      <Field label="Tên" size="sm" wrapperClassName="min-w-0 flex-1" value={name} maxLength={60} autoFocus
        onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }} />
      <label className="text-[13px] text-stone-alt">Loại
        <select value={kind} onChange={e => setKind(e.target.value as QuickAddKind)}
          className="mt-1 block min-h-10 w-full rounded-lg border border-border-light bg-surface px-2 text-brand-ink sm:w-36">
          {KIND_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <Button size="sm" fullWidth={false} disabled={busy || !name.trim()} onClick={submit} className="min-h-10">{busy ? "Đang lưu…" : "Lưu"}</Button>
        <Button size="sm" variant="ghost" fullWidth={false} onClick={() => setAdding(false)} className="min-h-10">Huỷ</Button>
      </div>
      {error && <p role="alert" className="text-[12px] text-error sm:basis-full">{error}</p>}
    </div>}
  </div>;
}

/** "Quản lý": sửa / ghim / xoá địa danh, thuật ngữ; nhân vật quản lý ở trang truyện. */
export function TermManagerModal({ open, onClose, bookId, terms, onChange }: {
  open: boolean; onClose: () => void; bookId: string; terms: StoryTerm[]; onChange: (terms: StoryTerm[]) => void;
}) {
  const [editing, setEditing] = useState<StoryTerm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (method: "PATCH" | "DELETE", term: StoryTerm, body?: Partial<StoryTerm>) => {
    if (busy) return false;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}/terms/${term.id}`, {
        method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Không lưu được.");
      onChange(method === "DELETE" ? terms.filter(t => t.id !== term.id) : terms.map(t => (t.id === term.id ? data.term : t)));
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ."); return false; }
    finally { setBusy(false); }
  };

  return <Modal open={open} onClose={onClose} panelClassName="max-w-[560px] p-5 sm:p-6">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-brand-ink">Quản lý nhập nhanh</h2>
        <p className="text-[13px] text-stone-alt">Địa danh, vật phẩm, chiêu thức… chỉ mình bạn thấy. Nhân vật quản lý ở{" "}
          <Link href={`/author/${bookId}`} className="font-semibold text-brand-gold-dark underline">trang truyện</Link>.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Đóng" className="min-h-10 min-w-10 shrink-0 text-stone-alt"><XIcon size={18} /></button>
    </div>
    {error && <p role="alert" className="mb-2 text-sm text-error">{error}</p>}
    {!terms.length && <p className="text-sm text-stone-alt">Chưa có mục nào. Dùng nút “+ Thêm” trong trình soạn thảo.</p>}
    <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
      {terms.map(t => <li key={t.id} className="rounded-lg border border-cream-border p-3 text-sm">
        {editing?.id === t.id ? <div className="flex flex-col gap-2">
          <Field label="Tên" size="sm" value={editing.name} maxLength={60} onChange={e => setEditing({ ...editing, name: e.target.value })} />
          <label className="text-[13px] text-stone-alt">Loại
            <select value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as StoryTermKind })}
              className="mt-1 block min-h-10 w-full rounded-lg border border-border-light bg-surface px-2 text-brand-ink">
              {(Object.entries(TERM_KIND_LABEL) as [StoryTermKind, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <Field label="Tên khác (cách nhau bằng dấu phẩy)" size="sm" value={editing.aliases ?? ""} maxLength={200}
            onChange={e => setEditing({ ...editing, aliases: e.target.value })} />
          <Field label="Ghi chú" size="sm" value={editing.description ?? ""} maxLength={2000}
            onChange={e => setEditing({ ...editing, description: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" fullWidth={false} disabled={busy} className="min-h-10" onClick={async () => {
              if (await call("PATCH", t, { name: editing.name, kind: editing.kind, aliases: editing.aliases, description: editing.description })) setEditing(null);
            }}>Lưu</Button>
            <Button size="sm" variant="ghost" fullWidth={false} className="min-h-10" onClick={() => setEditing(null)}>Huỷ</Button>
          </div>
        </div> : <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 break-words font-semibold text-brand-ink">{t.name}</span>
          <span className="text-[12px] text-stone-alt">{TERM_KIND_LABEL[t.kind]}{t.aliases ? ` · ${t.aliases}` : ""}</span>
          <span className="ml-auto flex gap-1">
            <button type="button" disabled={busy} onClick={() => call("PATCH", t, { pinned: !t.pinned })}
              className="min-h-9 px-2 text-[13px] text-brand-gold-dark disabled:opacity-50">{t.pinned ? "Bỏ ghim" : "Ghim"}</button>
            <button type="button" disabled={busy} onClick={() => setEditing(t)} className="min-h-9 px-2 text-[13px] disabled:opacity-50">Sửa</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Xoá “${t.name}” khỏi nhập nhanh?`)) void call("DELETE", t); }}
              className="min-h-9 px-2 text-[13px] text-error disabled:opacity-50">Xoá</button>
          </span>
          {t.description && <p className="w-full whitespace-pre-wrap break-words text-[13px] text-stone-alt">{t.description}</p>}
        </div>}
      </li>)}
    </ul>
  </Modal>;
}
