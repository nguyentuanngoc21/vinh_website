import Link from "next/link";
import { CheckCircleIcon, CircleIcon, MedalIcon, TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { PASSPORT_BADGE_NAME, type Passport, type TodayEventQuest } from "@/lib/contests/passport-service";

/**
 * "Hành trình của bạn" (Slice 3.2) — 7 cột mốc Passport của cuộc thi + nhiệm
 * vụ sự kiện hôm nay nếu ô sự kiện thuộc cuộc thi này (Slice 3.1). Server
 * component; chỉ render cho người đã đăng nhập, trong mùa thi.
 */
export function PassportCard({ passport, eventQuest }: { passport: Passport; eventQuest: TodayEventQuest | null }) {
  const total = passport.milestones.length;
  return (
    <section className="rounded-[18px] border border-cream-gold-border bg-cream-card p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-ink">
          <MedalIcon size={20} weight="fill" className="text-brand-gold-dark" /> Hành trình của bạn
        </h2>
        <span className="text-[13px] font-semibold text-cream-gold-text">
          {passport.completedAt ? `Đã nhận huy hiệu “${PASSPORT_BADGE_NAME}”` : `${passport.doneCount}/${total} cột mốc`}
        </span>
      </div>
      {passport.completedAt && (
        <p className="mt-1 text-xs text-stone-dark">Hoàn thành lúc {formatVnDateTime(passport.completedAt)} — huy hiệu hiện trong hồ sơ của bạn.</p>
      )}

      {eventQuest && (
        <div className="mt-3 flex flex-col gap-2 rounded-[12px] bg-white px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[.6px] text-brand-gold-dark">
              <TrophyIcon size={12} weight="fill" /> NHIỆM VỤ SỰ KIỆN HÔM NAY
            </div>
            <div className="text-sm font-semibold text-ink">{eventQuest.title}</div>
            {eventQuest.description && <div className="text-xs text-stone-alt">{eventQuest.description}</div>}
          </div>
          <Link href="/nhiem-vu" className="shrink-0 self-start text-[13px] font-semibold text-brand-ink no-underline sm:self-auto">
            {eventQuest.claimed ? "Đã nhận thưởng" : eventQuest.completed ? "Nhận thưởng →" : `${eventQuest.progress}/${eventQuest.target} · Mở Nhiệm vụ →`}
          </Link>
        </div>
      )}

      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {passport.milestones.map((m) => (
          <li key={m.code} className={`flex items-start gap-2 rounded-[12px] px-3 py-2.5 ${m.done ? "bg-white" : "bg-white/60"}`}>
            {m.done ? (
              <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-success-form" />
            ) : (
              <CircleIcon size={18} className="mt-0.5 shrink-0 text-stone-light" />
            )}
            <div className="min-w-0">
              <div className={`text-[13px] font-semibold ${m.done ? "text-ink" : "text-stone-dark"}`}>{m.title}</div>
              <div className="text-[11.5px] leading-snug text-stone-alt">
                {m.target > 1 ? `${m.progress}/${m.target} · ` : ""}{m.hint}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
