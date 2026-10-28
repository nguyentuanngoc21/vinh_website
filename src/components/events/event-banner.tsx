import type { VinhEvent } from "@/lib/events/catalog";
import { publicImageUrl } from "@/lib/media/public-image";

const PALETTES = {
  sea: { background: "#123e49", paper: "#f5dfac", light: "#dbbe73" },
  sunset: { background: "#793f38", paper: "#f4d4bb", light: "#e9ad80" },
  forest: { background: "#334d3e", paper: "#e0e7b9", light: "#b0c284" },
};
/** Original, code-native poster artwork; replace with an approved bannerUrl. */
export function EventBanner({ event, compact = false }: { event: VinhEvent; compact?: boolean }) {
  const color = PALETTES[event.accent];
  return (
    <div className={`relative isolate overflow-hidden ${compact ? "aspect-[16/9]" : "min-h-[300px] sm:aspect-[2.7/1]"}`} style={{ backgroundColor: color.background }}>
      {event.bannerUrl ? (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(publicImageUrl(event.bannerUrl, compact ? 640 : 1280))})` }} />
      ) : (
        <>
          <svg aria-hidden="true" viewBox="0 0 1200 460" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
            <circle cx="960" cy="115" r="184" fill={color.light} opacity=".9" />
            <circle cx="960" cy="115" r="214" fill="none" stroke={color.paper} opacity=".2" />
            <path d="M0 350Q160 260 320 350T640 350T960 350T1280 350V460H0Z" fill={color.paper} opacity=".07" />
            <path d="M0 400Q200 310 400 400T800 400T1200 400" fill="none" stroke={color.paper} opacity=".3" />
            <g transform="translate(760 175) rotate(-12)">
              <path d="M0 0Q85-30 165 10V185Q85 145 0 175Z" fill={color.paper} />
              <path d="M165 10Q245-30 330 0V175Q245 145 165 185Z" fill="#fff7e1" />
              <path d="M165 10V185" stroke={color.background} strokeWidth="3" opacity=".3" />
              {[40, 65, 90, 115].map((y) => <path key={y} d={`M25 ${y}Q85 ${y-15} 140 ${y+5}M190 ${y+5}Q245 ${y-15} 305 ${y}`} fill="none" stroke={color.background} opacity=".22" strokeWidth="3" />)}
            </g>
            <path d="M1060 72l5 14 15 4-15 5-5 15-4-15-15-5 15-4Z" fill="#fff7e1" />
          </svg>
          <div className={`relative flex h-full flex-col justify-center text-[#f9efd7] ${compact ? "min-h-full p-6 sm:p-8" : "min-h-[300px] px-7 py-12 sm:px-14"}`}>
            <span className="text-[10px] font-semibold uppercase tracking-[.3em] sm:text-xs">Vịnh · Cùng nhau kể chuyện</span>
            <div className={`mt-5 line-clamp-3 max-w-[60%] font-sans font-semibold leading-[1.12] tracking-tight ${compact ? "text-2xl" : "text-3xl sm:text-5xl"}`}>{event.title}</div>
            <span className="mt-5 max-w-[55%] text-xs leading-relaxed opacity-75 sm:text-sm">Một cuộc gặp. Muôn câu chuyện.</span>
          </div>
        </>
      )}
    </div>
  );
}
