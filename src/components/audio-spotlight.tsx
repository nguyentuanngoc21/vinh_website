import Link from "next/link";
import { SkipBackIcon, SkipForwardIcon, PlayIcon } from "@phosphor-icons/react/dist/ssr";

export function AudioSpotlight() {
  return (
    <section className="px-11 pb-2 pt-10">
      <Link
        href="/audio/now-playing"
        className="grid grid-cols-[auto_1fr_auto] items-center gap-6 rounded-[20px] bg-neutral-bg p-8 no-underline"
      >
        <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-[#1d3b4a] to-[#7a2e1c]" />
        <div>
          <div className="text-xs font-semibold tracking-[.5px] text-brand-gold-dark">
            AUDIO NỔI BẬT
          </div>
          <div className="my-1.5 text-xl font-bold text-ink">
            Vũng Vịnh Cuối Trời — Chương 14
          </div>
          <div className="text-sm text-[#6a6a6a]">
            Diễn đọc: Thu Hà · 19 phút
          </div>
          <div className="mt-3.5 h-1.5 w-full max-w-[520px] overflow-hidden rounded-full bg-[#dcdcdc]">
            <div className="h-full w-[62%] bg-brand-gold" />
          </div>
        </div>
        <div className="flex items-center gap-[18px]">
          <SkipBackIcon size={22} color="#6a6a6a" />
          <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-brand-gold text-brand-ink">
            <PlayIcon weight="fill" size={22} />
          </div>
          <SkipForwardIcon size={22} color="#6a6a6a" />
        </div>
      </Link>
    </section>
  );
}
