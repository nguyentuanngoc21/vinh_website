"use client";

import { useState } from "react";
import {
  FlameIcon,
  BookOpenIcon,
  ChatCircleTextIcon,
  HeadphonesIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react/dist/ssr";
import { DAILY_TASKS } from "@/lib/profile";

const TASK_ICONS = {
  book: BookOpenIcon,
  comment: ChatCircleTextIcon,
  headphones: HeadphonesIcon,
  share: ShareNetworkIcon,
};

export function DailyTasksTab() {
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});

  const doneCount = DAILY_TASKS.filter((t) => t.progress >= 1).length;
  const pendingReward = DAILY_TASKS.filter((t) => t.progress < 1).reduce(
    (sum, t) => sum + t.reward,
    0
  );

  const claim = (id: string) => setClaimed((prev) => ({ ...prev, [id]: true }));

  return (
    <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#F0E3C4] bg-cream-card px-6 py-5">
        <div>
          <div className="text-lg font-bold text-brand-ink">Nhiệm vụ hôm nay</div>
          <div className="mt-1.5 text-[13.5px] text-stone-dark">
            Hoàn thành {doneCount}/4 · Nhận thêm {pendingReward} token nữa
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-full border border-[#F0E3C4] bg-white px-[18px] py-2.5">
          <FlameIcon weight="fill" size={18} color="var(--color-brand-gold)" />
          <div className="text-[13.5px] font-semibold text-ink">Chuỗi 12 ngày</div>
        </div>
      </div>

      <div className="mt-[18px] flex flex-col gap-3">
        {DAILY_TASKS.map((task) => {
          const done = task.progress >= 1;
          const isClaimed = !!claimed[task.id];
          const Icon = TASK_ICONS[task.icon];
          return (
            <div
              key={task.id}
              style={{ background: done && !isClaimed ? "#FCFAF4" : "#fff" }}
              className="flex items-center gap-4 rounded-2xl border border-cream px-5 py-[18px]"
            >
              <div
                style={{ background: done ? "var(--color-brand-ink)" : "#f2f1ee", color: done ? "var(--color-brand-gold-light)" : "var(--color-stone)" }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              >
                <Icon size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-ink">{task.title}</div>
                <div className="mt-1 text-[12.5px] text-stone">{task.desc}</div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#f0efec]">
                  <div
                    style={{ width: `${task.progress * 100}%`, background: done ? "var(--color-brand-gold)" : "#C9A86A" }}
                    className="h-full rounded-full transition-[width] duration-300"
                  />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="text-[13px] font-bold text-brand-gold-dark">+{task.reward} token</div>
                <button
                  type="button"
                  onClick={() => claim(task.id)}
                  disabled={!done || isClaimed}
                  style={{
                    background: done && !isClaimed ? "var(--color-brand-gold)" : "#fff",
                    color: done && !isClaimed ? "var(--color-brand-ink)" : "#a8a29e",
                    borderColor: done && !isClaimed ? "var(--color-brand-gold)" : "var(--color-cream)",
                  }}
                  className="cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-[12.5px] font-semibold disabled:cursor-default"
                >
                  {isClaimed ? "Đã nhận" : done ? "Nhận thưởng" : "Chưa xong"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
