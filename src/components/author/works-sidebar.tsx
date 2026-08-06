import Link from "next/link";
import { PlusIcon, GearIcon } from "@phosphor-icons/react/dist/ssr";

const WORKS = [
  {
    title: "Vũng Vịnh Cuối Trời",
    meta: "36 chương · Đang ra",
    gradient: "linear-gradient(150deg,#2563a8,#1f8a6b)",
    active: true,
  },
  {
    title: "Lặng Im Của Sóng",
    meta: "Hoàn thành",
    gradient: "linear-gradient(150deg,#7c3aed,#4338ca)",
  },
  {
    title: "Cửa Biển",
    meta: "Bản nháp",
    gradient: "linear-gradient(150deg,#0d9488,#115e59)",
  },
];

export function WorksSidebar() {
  return (
    <aside className="flex flex-col overflow-hidden bg-brand-ink-dark text-sidebar-text">
      <div className="flex items-center gap-[9px] border-b border-white/8 px-5 py-[18px]">
        <Link href="/" className="flex flex-1 items-center gap-[9px] no-underline">
          <svg width="30" height="30" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="var(--color-brand-ink)" />
            <path
              d="M50,98 A48,48 0 0 1 50,2 A24,24 0 0 1 50,50 A24,24 0 0 0 50,98 Z"
              fill="var(--color-cream-card-alt)"
            />
            <circle cx="44" cy="24" r="3" fill="var(--color-brand-ink)" />
          </svg>
          <span className="text-[19px] font-extrabold text-white">Vịnh</span>
        </Link>
        <span className="ml-auto rounded-[5px] border border-brand-gold-light/40 px-[7px] py-0.5 text-[11px] font-medium text-brand-gold-light">
          Tác giả
        </span>
      </div>

      <div className="px-3.5 pb-2 pt-4 text-[11px] font-bold tracking-wide text-[#6f8794]">
        TÁC PHẨM CỦA TÔI
      </div>
      <div className="flex flex-col gap-0.5 px-2.5">
        {WORKS.map((work) => (
          <div
            key={work.title}
            className={`flex items-center gap-[11px] rounded-[9px] p-3 transition-colors ${
              work.active
                ? "bg-brand-gold-light/14"
                : "cursor-pointer hover:bg-info-bg/10"
            }`}
          >
            <div
              style={{ background: work.gradient }}
              className="h-[46px] w-[34px] shrink-0 rounded-[5px]"
            />
            <div className="min-w-0">
              <div
                className={`overflow-hidden truncate text-sm font-semibold ${
                  work.active ? "text-white" : "text-[#dbe4e8]"
                }`}
              >
                {work.title}
              </div>
              <div
                className={`text-xs ${
                  work.active ? "text-sidebar-text-dim" : "text-[#6f8794]"
                }`}
              >
                {work.meta}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-4 mt-3.5 cursor-pointer rounded-[9px] border border-dashed border-white/22 p-[11px] text-center text-[13px] font-semibold text-sidebar-text-dim">
        <PlusIcon className="inline" /> Tác phẩm mới
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/8 px-[18px] py-4">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#c8a86a] text-sm font-bold text-white">
          M
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white">Minh Khôi</div>
          <div className="text-[11px] text-[#6f8794]">@minhkhoi</div>
        </div>
        <GearIcon
          size={18}
          className="ml-auto shrink-0 cursor-pointer rounded-md p-1 transition-colors hover:bg-info-bg/10"
        />
      </div>
    </aside>
  );
}
