import Link from "next/link";
import { WaveformIcon, PlayIcon, BookOpenIcon } from "@phosphor-icons/react/dist/ssr";

export function ContinueListening() {
  return (
    <section className="px-11 pb-5 pt-9">
      <div className="grid grid-cols-[260px_1fr] items-center gap-11 rounded-[22px] bg-brand-ink-dark p-11 text-white">
        <div
          style={{ background: "linear-gradient(155deg,#2563a8,#1f8a6b 55%,#7a2e1c)" }}
          className="flex h-[260px] flex-col justify-end rounded-2xl p-[22px] font-[family-name:var(--font-lora)] text-2xl font-bold leading-[1.2] shadow-[0_24px_48px_rgba(0,0,0,.45)]"
        >
          Vũng Vịnh Cuối Trời
        </div>
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-gold/18 px-3.5 py-1.5 text-xs font-semibold text-brand-gold-light">
            <WaveformIcon weight="fill" /> AUDIO ĐANG NGHE
          </div>
          <h1 className="my-2.5 text-[44px] font-bold leading-[1.1] tracking-[-1px]">
            Chương 12 · Đêm Không Đèn
          </h1>
          <div className="text-[15px] text-sidebar-text-dim-2">
            Minh Khôi · Giọng đọc <b className="font-semibold text-white">Thu Hà</b> · 19:30
          </div>
          <div className="mt-[22px] max-w-[440px]">
            <div className="h-1.5 rounded-full bg-white/16">
              <div className="h-1.5 w-[62%] rounded-full bg-brand-gold" />
            </div>
            <div className="mt-[7px] flex justify-between text-xs font-medium text-sidebar-text-dim">
              <span>12:08</span>
              <span>còn 7:22</span>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Link
              href="/audio/now-playing"
              className="flex items-center gap-[9px] rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
            >
              <PlayIcon weight="fill" /> Nghe tiếp
            </Link>
            <Link
              href="/read"
              className="flex items-center gap-2 rounded-full border border-white/30 px-[26px] py-3.5 text-[15px] font-semibold text-white no-underline"
            >
              <BookOpenIcon /> Đọc bản chữ
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
