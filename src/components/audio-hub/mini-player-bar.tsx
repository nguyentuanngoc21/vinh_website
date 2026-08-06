import Link from "next/link";
import {
  SkipBackIcon,
  SkipForwardIcon,
  PlayIcon,
  SpeakerHighIcon,
  ArrowsOutSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";

export function MiniPlayerBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-5 bg-brand-ink-dark px-11 py-3 text-white">
      <div
        style={{ background: "linear-gradient(155deg,#2563a8,#1f8a6b)" }}
        className="h-[46px] w-[46px] shrink-0 rounded-lg"
      />
      <div className="hidden min-w-[190px] sm:block">
        <div className="text-sm font-semibold">Chương 12 · Đêm Không Đèn</div>
        <div className="text-xs text-sidebar-text-dim">Vũng Vịnh Cuối Trời</div>
      </div>
      <div className="flex items-center gap-4 text-sidebar-text">
        <SkipBackIcon size={20} />
        <Link
          href="/audio/now-playing"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold text-brand-ink"
        >
          <PlayIcon weight="fill" size={17} />
        </Link>
        <SkipForwardIcon size={20} />
      </div>
      <div className="flex flex-1 items-center gap-3">
        <span className="text-xs font-medium text-sidebar-text-dim">12:08</span>
        <div className="h-[5px] flex-1 rounded-full bg-white/16">
          <div className="h-[5px] w-[62%] rounded-full bg-brand-gold" />
        </div>
        <span className="text-xs font-medium text-sidebar-text-dim">19:30</span>
      </div>
      <div className="flex items-center gap-4 text-sidebar-text">
        <SpeakerHighIcon size={19} />
        <Link href="/audio/now-playing" className="flex text-sidebar-text">
          <ArrowsOutSimpleIcon size={19} />
        </Link>
      </div>
    </div>
  );
}
