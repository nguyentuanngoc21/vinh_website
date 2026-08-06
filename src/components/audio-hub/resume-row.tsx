import Link from "next/link";
import { PlayCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { RESUME } from "@/lib/audio-catalog";

export function ResumeRow() {
  return (
    <section className="px-11 pb-2 pt-3.5">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-[21px] font-bold text-brand-ink">Nghe tiếp</h2>
        <Link href="/author" className="text-[13.5px] font-medium">
          Thư viện của tôi
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
        {RESUME.map((r) => (
          <Link
            key={r.title}
            href="/audio/now-playing"
            className="flex items-center gap-3.5 rounded-2xl border border-cream bg-white p-3.5 no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.14)]"
          >
            <div
              style={{ background: r.gradient }}
              className="h-14 w-14 shrink-0 rounded-[10px]"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-ink">
                {r.title}
              </div>
              <div className="mt-[3px] text-[12.5px] text-stone">
                {r.chapter}
              </div>
              <div className="mt-[9px] h-1 rounded-full bg-[#efece8]">
                <div
                  style={{ width: `${r.pct}%` }}
                  className="h-1 rounded-full bg-brand-gold"
                />
              </div>
            </div>
            <PlayCircleIcon weight="fill" size={30} color="var(--color-brand-gold)" />
          </Link>
        ))}
      </div>
    </section>
  );
}
