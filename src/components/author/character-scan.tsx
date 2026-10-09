"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, RadioGroup } from "@/components/ui";
import type { ScanBook, ScanResult } from "@/lib/authoring/character-scan";
import type { AppearanceBook } from "@/components/story/character-appearance-popover";

type Chapter = { id: string; title: string; order_index: number; published: boolean };
/** GET /api/authoring/books/:bookId/characters/:characterId */
export type AuthorAppearances = {
  chapters: Chapter[];
  otherBooks?: { id: string; title: string; appearance: "main" | "cameo"; chapters: Chapter[] }[];
  dismissed?: { chapters: (Chapter & { book_id: string; book_title: string | null })[]; books: { id: string; title: string }[] };
};
type BookDecision = "main" | "cameo" | "dismissed" | "later";
type Review = Partial<Record<"confirmChapterIds" | "dismissChapterIds" | "resetChapterIds" | "mainBookIds" | "cameoBookIds" | "dismissBookIds" | "resetBookIds", string[]>>;

const chapterTitle = (c: { title: string }) => c.title || "Chương chưa đặt tên";

export async function loadAuthorAppearances(bookId: string, characterId: string): Promise<AuthorAppearances> {
  const res = await fetch(`/api/authoring/books/${bookId}/characters/${characterId}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.chapters) throw new Error(data?.error || "Không tải được chương.");
  return data;
}

/** Shape for CharacterAppearancePopover in the author's manager (drafts included). */
export function toPopoverBooks(bookId: string, a: AuthorAppearances): AppearanceBook[] {
  return [
    { id: bookId, title: "Truyện này", appearance: "own", chapters: a.chapters },
    ...(a.otherBooks ?? []),
  ];
}

export async function saveReview(bookId: string, characterId: string, review: Review) {
  const res = await fetch(`/api/authoring/books/${bookId}/characters/${characterId}/appearances`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(review),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Không lưu được xác nhận.");
}

function HitRow({ hit, checked, onToggle, disabled }: { hit: ScanBook["chapters"][number]; checked: boolean; onToggle: () => void; disabled: boolean }) {
  return <li className="rounded-lg border border-cream-border p-3">
    <Checkbox checked={checked} onChange={onToggle} disabled={disabled}>
      <span className="font-semibold text-brand-ink">{chapterTitle(hit)}</span>
      {!hit.published && <span className="text-stone-alt"> (Nháp)</span>}
      <span className="text-stone-alt"> · {hit.count} lần</span>
      <span className="mt-1 block break-words text-xs text-stone-alt">{hit.snippet}</span>
    </Checkbox>
  </li>;
}

/**
 * Result of "Nhận diện nhân vật". Checked chapters are tagged, unchecked ones
 * are remembered as dismissed (listed under "Đã bỏ qua"); other books need a
 * decision — main (pick chapters), cameo (title only), dismissed or later.
 */
export function CharacterScanPanel({ bookId, characterId, characterName, result, onClose, onSaved }: {
  bookId: string; characterId: string; characterName: string; result: ScanResult;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const allHits = [result.ownBook, ...result.otherBooks].flatMap(b => b.chapters.map(c => c.id));
  const [checked, setChecked] = useState(() => new Set(allHits));
  const [decisions, setDecisions] = useState<Record<string, BookDecision>>(() =>
    Object.fromEntries(result.otherBooks.map(b => [b.id, b.appearance === "main" ? "main" : "later"])));
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setChecked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const setAll = (book: ScanBook, on: boolean) => setChecked(prev => {
    const next = new Set(prev); for (const c of book.chapters) if (on) next.add(c.id); else next.delete(c.id); return next;
  });
  const reviewedBooks = [result.ownBook, ...result.otherBooks.filter(b => decisions[b.id] === "main")];
  const confirm = reviewedBooks.flatMap(b => b.chapters.filter(c => checked.has(c.id)).map(c => c.id));
  const dismiss = reviewedBooks.flatMap(b => b.chapters.filter(c => !checked.has(c.id)).map(c => c.id));
  const byDecision = (d: BookDecision) => result.otherBooks.filter(b => decisions[b.id] === d).map(b => b.id);
  const nothingToSave = !confirm.length && !dismiss.length && !byDecision("main").length && !byDecision("cameo").length && !byDecision("dismissed").length;

  const save = async () => {
    if (lock.current || nothingToSave) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await saveReview(bookId, characterId, {
        confirmChapterIds: confirm, dismissChapterIds: dismiss,
        mainBookIds: byDecision("main"), cameoBookIds: byDecision("cameo"), dismissBookIds: byDecision("dismissed"),
      });
      onSaved(`Đã gắn “${characterName}” vào ${confirm.length} chương${dismiss.length ? `, bỏ qua ${dismiss.length} chương` : ""}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ."); }
    finally { lock.current = false; setBusy(false); }
  };

  const bookList = (book: ScanBook) => <>
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <button type="button" disabled={busy} onClick={() => setAll(book, true)} className="min-h-9 font-semibold text-brand-gold-dark">Chọn tất cả</button>
      <button type="button" disabled={busy} onClick={() => setAll(book, false)} className="min-h-9 font-semibold text-brand-gold-dark">Bỏ chọn tất cả</button>
    </div>
    <ul className="flex flex-col gap-2">{book.chapters.map(hit =>
      <HitRow key={hit.id} hit={hit} checked={checked.has(hit.id)} onToggle={() => toggle(hit.id)} disabled={busy} />)}</ul>
  </>;

  const empty = !result.ownBook.chapters.length && !result.otherBooks.length;
  return <div className="mt-3 rounded-xl border border-cream-border bg-cream-card p-4 text-sm">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h4 className="font-bold">Kết quả nhận diện “{characterName}”</h4>
        <p className="text-xs text-stone-alt">Đã quét {result.scannedChapters} chương chưa xác nhận
          {result.skipped.dismissedChapters > 0 && ` · bỏ qua ${result.skipped.dismissedChapters} chương đã loại`}
          {result.skipped.decidedBooks > 0 && ` · ${result.skipped.decidedBooks} truyện đã quyết định`}.</p>
      </div>
      <button type="button" onClick={onClose} disabled={busy} className="min-h-9 shrink-0 text-stone-alt">Đóng</button>
    </div>
    {error && <p role="alert" className="mb-3 text-error">{error}</p>}
    {empty ? <p>Không tìm thấy chương mới nào có tên hoặc biệt danh của nhân vật này.</p> : <>
      <p className="mb-3 text-xs text-stone-alt">Chương được tích sẽ được gắn nhân vật. Chương bỏ tích sẽ được ghi nhớ và không gợi ý lại (xem trong “Đã bỏ qua”).</p>
      <section className="mb-4">
        <h5 className="mb-2 font-semibold">{result.ownBook.title} <span className="font-normal text-stone-alt">({result.ownBook.chapters.length} chương)</span></h5>
        {result.ownBook.chapters.length ? bookList(result.ownBook) : <p className="text-stone-alt">Không có chương mới.</p>}
      </section>
      {result.otherBooks.map(book => <section key={book.id} className="mb-4 rounded-lg border border-cream-border bg-surface p-3">
        <h5 className="mb-1 font-semibold">Cũng xuất hiện trong truyện “{book.title}”</h5>
        <p className="mb-2 text-xs text-stone-alt">{book.chapters.length} chương có tên nhân vật.</p>
        <RadioGroup<BookDecision> label={null} aria-label={`Cách xuất hiện trong ${book.title}`} disabled={busy}
          value={decisions[book.id]} onChange={v => setDecisions(prev => ({ ...prev, [book.id]: v }))}
          options={[
            { value: "main", label: "Xuất hiện chính", description: "Chọn chương; độc giả thấy danh sách chương." },
            { value: "cameo", label: "Khách mời", description: "Độc giả chỉ thấy tên truyện." },
            { value: "dismissed", label: "Không phải nhân vật này", description: "Không gợi ý truyện này nữa." },
            { value: "later", label: "Để sau" },
          ]} />
        {decisions[book.id] === "main" && <div className="mt-3">{bookList(book)}</div>}
      </section>)}
    </>}
    <div className="flex flex-col gap-2 sm:flex-row">
      {!empty && <Button size="sm" fullWidth={false} disabled={busy || nothingToSave} onClick={save}>
        {busy ? "Đang lưu…" : `Xác nhận (${confirm.length} gắn · ${dismiss.length} bỏ qua)`}
      </Button>}
      <Button size="sm" variant="ghost" fullWidth={false} disabled={busy} onClick={onClose}>{empty ? "Đóng" : "Huỷ"}</Button>
    </div>
  </div>;
}

/** Expanded "chương xuất hiện" view: confirmed chapters, other books and the "Đã bỏ qua" list with undo. */
export function CharacterAppearanceDetails({ bookId, characterId, data, busy, onReset }: {
  bookId: string; characterId: string; data: AuthorAppearances; busy: boolean;
  onReset: (review: Review, message: string) => void;
}) {
  const own = data.chapters, others = data.otherBooks ?? [];
  const dismissed = data.dismissed ?? { chapters: [], books: [] };
  return <div className="mt-3 border-t pt-3 text-sm" data-character={characterId}>
    {!own.length ? <p>Chưa gắn vào chương nào.</p> : <>
      <p className="mb-2 text-stone-alt">{own.length} chương · Đầu: {chapterTitle(own[0])} · Cuối: {chapterTitle(own.at(-1)!)}</p>
      <ul className="flex flex-col gap-2">{own.map(ch => <li key={ch.id}><Link href={`/author/${bookId}/${ch.id}`} className="text-brand-gold-dark underline">{chapterTitle(ch)}</Link>{!ch.published && " (Nháp)"}</li>)}</ul>
    </>}
    {others.map(b => <div key={b.id} className="mt-3">
      <p className="font-semibold">{b.title} <span className="font-normal text-stone-alt">· {b.appearance === "main" ? `${b.chapters.length} chương` : "Khách mời"}</span>
        <button type="button" disabled={busy} onClick={() => onReset({ resetBookIds: [b.id], resetChapterIds: b.chapters.map(c => c.id) }, `Đã gỡ liên kết với “${b.title}”.`)}
          className="ml-3 min-h-9 text-xs text-error disabled:opacity-50">Gỡ</button></p>
      {b.appearance === "main" && <ul className="mt-1 flex flex-col gap-1">{b.chapters.map(ch => <li key={ch.id}>
        <Link href={`/author/${b.id}/${ch.id}`} className="text-brand-gold-dark underline">{chapterTitle(ch)}</Link>{!ch.published && " (Nháp)"}
      </li>)}</ul>}
    </div>)}
    {(dismissed.chapters.length > 0 || dismissed.books.length > 0) && <details className="mt-3">
      <summary className="min-h-9 cursor-pointer font-semibold">Đã bỏ qua ({dismissed.chapters.length + dismissed.books.length})</summary>
      <p className="my-2 text-xs text-stone-alt">Khôi phục để lần quét sau gợi ý lại.</p>
      <ul className="flex flex-col gap-1">
        {dismissed.books.map(b => <li key={b.id} className="flex flex-wrap items-center gap-x-3">Truyện “{b.title}”
          <button type="button" disabled={busy} onClick={() => onReset({ resetBookIds: [b.id] }, `Đã khôi phục “${b.title}”.`)} className="min-h-9 text-xs font-semibold text-brand-gold-dark disabled:opacity-50">Khôi phục</button></li>)}
        {dismissed.chapters.map(ch => <li key={ch.id} className="flex flex-wrap items-center gap-x-3">
          <span>{ch.book_title ? `${ch.book_title} · ` : ""}{chapterTitle(ch)}</span>
          <button type="button" disabled={busy} onClick={() => onReset({ resetChapterIds: [ch.id] }, `Đã khôi phục “${chapterTitle(ch)}”.`)} className="min-h-9 text-xs font-semibold text-brand-gold-dark disabled:opacity-50">Khôi phục</button></li>)}
      </ul>
    </details>}
  </div>;
}
