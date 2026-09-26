import Link from "next/link";
import { EntryCard } from "@/components/contests/entry-card";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

export type RowItem = { key: string; book: HomepageBook; meta?: string | null; rank?: number | null };

/**
 * Hàng truyện cuộn ngang (thẻ 164px, mobile 128px, snap theo thẻ — đặc tả
 * UX mục 6). Ẩn cả hàng khi không có bài, trừ khi truyền `empty`.
 */
export function EntryRow({
  title,
  subtitle,
  icon,
  items,
  moreHref,
  empty,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  items: RowItem[];
  moreHref?: string;
  empty?: string;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-lg font-bold text-ink sm:text-xl">{title}</h2>
          </div>
          {subtitle && <p className="mt-0.5 text-[13px] text-stone-alt sm:text-[13.5px]">{subtitle}</p>}
        </div>
        {moreHref && items.length > 0 && (
          <Link href={moreHref} className="shrink-0 text-[13px] font-medium text-brand-gold-dark no-underline">Xem tất cả →</Link>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light p-8 text-center text-sm text-stone-alt">{empty}</div>
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1.5 sm:mx-0 sm:gap-[18px] sm:px-0 [scrollbar-width:none]">
          {items.map((it) => (
            <div key={it.key} className="w-[128px] shrink-0 snap-start sm:w-[164px]">
              <EntryCard book={it.book} meta={it.meta} rank={it.rank} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
