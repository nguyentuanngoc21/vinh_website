import type { Step } from "@/lib/contests/phase-copy";

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }) : "—";

/**
 * LifecycleStepper — 6 chặng công khai trên nền navy. Mobile rút gọn thành
 * "Chặng x/6 · tên" + thanh tiến độ (đặc tả UX mục 6).
 */
export function LifecycleStepper({ steps }: { steps: Step[] }) {
  const currentIdx = steps.findIndex((s) => s.state === "current");
  const doneCount = steps.filter((s) => s.state === "done").length;
  const position = currentIdx >= 0 ? currentIdx + 1 : doneCount;
  const current = currentIdx >= 0 ? steps[currentIdx] : steps[Math.max(0, doneCount - 1)];

  return (
    <>
      <div className="sm:hidden">
        <div className="flex items-center justify-between text-xs text-sidebar-text-dim-2">
          <span>
            Chặng {position}/{steps.length} · <span className="font-semibold text-brand-gold-light">{current?.label}</span>
          </span>
          <span>{day(current?.date ?? null)}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-brand-gold" style={{ width: `${(position / steps.length) * 100}%` }} />
        </div>
      </div>

      <ol className="hidden grid-cols-6 gap-1.5 sm:grid">
        {steps.map((s) => (
          <li key={s.label}>
            <div
              className={`mb-2 h-1 rounded-full ${s.state === "done" ? "bg-brand-gold" : s.state === "current" ? "bg-white/20" : "bg-white/20"}`}
              style={s.state === "current" ? { background: "linear-gradient(90deg, var(--color-brand-gold-light) 50%, rgb(255 255 255 / .2) 50%)" } : undefined}
            />
            <div className={`text-[12.5px] ${s.state === "current" ? "font-bold text-brand-gold-light" : s.state === "done" ? "font-medium text-white" : "font-medium text-sidebar-text-dim-2"}`}>
              {s.label}
            </div>
            <div className="text-[11.5px] text-sidebar-text-dim-2">{day(s.date)}</div>
          </li>
        ))}
      </ol>
    </>
  );
}
