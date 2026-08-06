import Link from "next/link";
import { NARRATORS } from "@/lib/audio-catalog";

export function NarratorsRow() {
  return (
    <section className="px-11 pb-2.5 pt-[38px]">
      <h2 className="mb-[18px] text-[21px] font-bold text-brand-ink">
        Giọng đọc nổi bật
      </h2>
      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-5">
        {NARRATORS.map((n) => (
          <Link
            key={n.name}
            href="/author"
            className="flex flex-col items-center gap-2.5 rounded-2xl bg-[#F7EFD8] p-5 text-center no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.14)]"
          >
            <div
              style={{ background: n.color }}
              className="flex h-[58px] w-[58px] items-center justify-center rounded-full text-[22px] font-bold text-white"
            >
              {n.name[0]}
            </div>
            <div className="text-[15px] font-semibold text-brand-ink">
              {n.name}
            </div>
            <div className="text-[12.5px] text-[#6b5f3a]">
              {n.books} tác phẩm · {n.plays}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
