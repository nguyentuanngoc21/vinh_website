import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";

export type BreadcrumbItem = { label: string; href?: string };

/**
 * Trail for pages nested under a section (e.g. Cá nhân › Thông tin cá nhân
 * › Nạp token). The last item always renders as plain bold text — it's the
 * current page, never a link, regardless of whether it has an `href`.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-stone-dark">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-1.5">
            {i > 0 && <CaretRightIcon size={12} />}
            {item.href && !isLast ? (
              <Link href={item.href} className="text-stone-dark no-underline hover:text-brand-gold-dark">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-semibold text-ink" : ""}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
