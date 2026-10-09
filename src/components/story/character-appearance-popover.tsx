"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

export type AppearanceChapter = { id: string; title: string; order_index: number; published?: boolean };
export type AppearanceBook = { id: string; title: string; appearance: "own" | "main" | "cameo"; chapters: AppearanceChapter[] };

const MAX_CHAPTERS = 30;

/**
 * Character name that reveals the chapters it appears in — on hover (desktop),
 * keyboard focus, or tap (phones have no hover). The list loads on first open.
 * "own"/"main" books list chapters; "cameo" books list only the book title.
 */
export function CharacterAppearancePopover({ label, load, books: provided, chapterHref, bookHref, className = "" }: {
  label: ReactNode;
  load: () => Promise<AppearanceBook[]>;
  /** Already-known list (e.g. the author's manager after a review); skips and overrides `load`. */
  books?: AppearanceBook[];
  chapterHref: (bookId: string, chapterId: string) => string;
  bookHref?: (bookId: string) => string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<AppearanceBook[] | null>(null);
  const books = provided ?? loaded;
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    if (books || loading.current) return;
    loading.current = true; setError(null);
    load().then(setLoaded, e => setError(e instanceof Error ? e.message : "Không tải được danh sách chương."))
      .finally(() => { loading.current = false; });
  };
  const hideSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const withChapters = books?.filter(b => b.appearance !== "cameo" && b.chapters.length) ?? [];
  const cameos = books?.filter(b => b.appearance === "cameo") ?? [];
  const multiBook = withChapters.length > 1 || (withChapters.length === 1 && withChapters[0].appearance !== "own");

  return <span ref={root} className="relative inline-block max-w-full" onMouseEnter={show} onMouseLeave={hideSoon}>
    <button type="button" aria-expanded={open} aria-controls={panelId} onFocus={show}
      onClick={() => (open ? setOpen(false) : show())}
      className={`max-w-full cursor-pointer truncate text-left underline decoration-dotted underline-offset-4 ${className}`}>
      {label}
    </button>
    {open && <div id={panelId} role="dialog" aria-label="Chương có nhân vật"
      className="absolute left-0 top-full z-30 mt-1.5 max-h-80 w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-cream-border bg-surface p-3 text-left text-sm font-normal shadow-lg">
      {error ? <p role="alert" className="text-error">{error}</p>
        : !books ? <p className="text-stone-alt">Đang tải…</p>
        : !withChapters.length && !cameos.length ? <p className="text-stone-alt">Chưa có chương nào được xác nhận.</p>
        : <>
          {withChapters.map(b => <div key={b.id} className="mb-2 last:mb-0">
            {multiBook && <p className="mb-1 text-xs font-semibold text-stone-alt">{b.title}</p>}
            <ul className="flex flex-col">
              {b.chapters.slice(0, MAX_CHAPTERS).map(ch => <li key={ch.id}>
                <Link href={chapterHref(b.id, ch.id)} className="block min-h-9 rounded px-1.5 py-1.5 text-brand-ink hover:bg-cream-card">
                  {ch.title || "Chương chưa đặt tên"}{ch.published === false && <span className="text-stone-alt"> (Nháp)</span>}
                </Link>
              </li>)}
            </ul>
            {b.chapters.length > MAX_CHAPTERS && <p className="px-1.5 text-xs text-stone-alt">… và {b.chapters.length - MAX_CHAPTERS} chương khác</p>}
          </div>)}
          {cameos.length > 0 && <div className={withChapters.length ? "mt-2 border-t border-cream-border pt-2" : ""}>
            <p className="mb-1 text-xs font-semibold text-stone-alt">Cũng xuất hiện trong truyện</p>
            <ul className="flex flex-col">{cameos.map(b => <li key={b.id}>
              {bookHref ? <Link href={bookHref(b.id)} className="block min-h-9 rounded px-1.5 py-1.5 text-brand-ink hover:bg-cream-card">{b.title}</Link>
                : <span className="block px-1.5 py-1.5">{b.title}</span>}
            </li>)}</ul>
          </div>}
        </>}
    </div>}
  </span>;
}

/** Reader-facing loader (public, published chapters only). */
export async function loadPublicAppearances(characterId: string): Promise<AppearanceBook[]> {
  const res = await fetch(`/api/characters/${characterId}/appearances`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.books) throw new Error(data?.error || "Không tải được danh sách chương.");
  return data.books;
}
