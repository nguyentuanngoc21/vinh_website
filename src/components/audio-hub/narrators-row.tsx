import Link from "next/link";
import { formatPlayCount, type NarratorStat } from "@/lib/audio/get-audio-catalog";

const AVATAR_COLORS = [
  "var(--color-brand-ink)",
  "var(--color-success)",
  "var(--color-chart-pink)",
  "var(--color-chart-amber)",
  "var(--color-chart-indigo)",
];

export function NarratorsRow({ narrators }: { narrators: NarratorStat[] }) {
  if (narrators.length === 0) return null;

  return (
    <section className="px-11 pb-2.5 pt-[38px]">
      <h2 className="mb-[18px] text-[21px] font-bold text-brand-ink">
        Giọng đọc nổi bật
      </h2>
      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-5">
        {narrators.map((n, i) => (
          <Link
            key={n.narratorId}
            href={`/ket-noi?p=${n.narratorId}`}
            className="flex flex-col items-center gap-2.5 rounded-2xl bg-[#F7EFD8] p-5 text-center no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.14)]"
          >
            {n.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.avatarUrl} alt="" className="h-[58px] w-[58px] rounded-full object-cover" />
            ) : (
              <div
                style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                className="flex h-[58px] w-[58px] items-center justify-center rounded-full text-[22px] font-bold text-white"
              >
                {n.name[0]}
              </div>
            )}
            <div className="text-[15px] font-semibold text-brand-ink">{n.name}</div>
            <div className="text-[12.5px] text-[#6b5f3a]">
              {n.trackCount} tác phẩm · {formatPlayCount(n.playCount)} nghe
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
