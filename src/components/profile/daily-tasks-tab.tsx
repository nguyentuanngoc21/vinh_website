"use client";

import { useEffect, useState } from "react";
import {
  FlameIcon,
  BookOpenIcon,
  ChatCircleTextIcon,
  CompassIcon,
  ScrollIcon,
  ShuffleIcon,
  CoinsIcon,
  TargetIcon,
  ArrowsCounterClockwiseIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui";

type QuestSlot = {
  slotIndex: number;
  taskTemplateId: string;
  userDailyTaskId: string;
  title: string;
  description: string | null;
  questType: string | null;
  targetCount: number;
  rewardTokens: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  resetCount: number;
};

type PoolResponse = {
  poolDate: string | null;
  slots: QuestSlot[];
  resetsUsedToday: number;
  maxResetsPerDay: number;
};

// Icon theo quest_type — KHÔNG dùng bookIcon/comment/headphones/share cũ
// (đó là icon cho mock DAILY_TASKS đã bỏ) — 6 loại này khớp
// task_templates.quest_type thật, xem
// migrations/20260827_extend_task_templates_for_quests.sql.
const QUEST_TYPE_ICONS: Record<string, typeof BookOpenIcon> = {
  discovery: CompassIcon,
  engagement: ChatCircleTextIcon,
  lore_hunt: ScrollIcon,
  cross_compare: ShuffleIcon,
  prediction: BookOpenIcon,
  topup: CoinsIcon,
};

const QUEST_TYPE_LABELS: Record<string, string> = {
  discovery: "Khám phá",
  engagement: "Tương tác",
  lore_hunt: "Truy tìm chi tiết",
  cross_compare: "So sánh",
  prediction: "Dự đoán",
  topup: "Nạp token",
};

type LoadState = "loading" | "ready";

export function DailyTasksTab() {
  const [state, setState] = useState<LoadState>("loading");
  const [slots, setSlots] = useState<QuestSlot[]>([]);
  const [resetsUsedToday, setResetsUsedToday] = useState(0);
  const [maxResetsPerDay, setMaxResetsPerDay] = useState(3);
  const [currentStreak, setCurrentStreak] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // id (userDailyTaskId khi claim, taskTemplateId khi reset) đang chờ
  // request — chỉ khoá đúng nút của quest đó, không khoá cả danh sách.
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function loadPool() {
    const res = await fetch("/api/quests/pool");
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Không tải được nhiệm vụ hôm nay.");
      return;
    }
    const data: PoolResponse = await res.json();
    setSlots(data.slots);
    setResetsUsedToday(data.resetsUsedToday);
    setMaxResetsPerDay(data.maxResetsPerDay);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/quests/pool").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/profile/me").then((res) => (res.ok ? res.json() : null)),
    ]).then(([pool, me]: [PoolResponse | null, { currentQuestStreak?: number } | null]) => {
      if (cancelled) return;
      if (pool) {
        setSlots(pool.slots);
        setResetsUsedToday(pool.resetsUsedToday);
        setMaxResetsPerDay(pool.maxResetsPerDay);
      } else {
        setError("Không tải được nhiệm vụ hôm nay.");
      }
      if (me) setCurrentStreak(me.currentQuestStreak ?? 0);
      setState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClaim(slot: QuestSlot) {
    setPendingId(slot.userDailyTaskId);
    setError(null);
    try {
      const res = await fetch("/api/quests/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: slot.userDailyTaskId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Không thể nhận thưởng.");
        return;
      }
      await loadPool();
    } finally {
      setPendingId(null);
    }
  }

  async function handleReset(slot: QuestSlot) {
    setPendingId(slot.taskTemplateId);
    setError(null);
    try {
      const res = await fetch("/api/quests/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskTemplateId: slot.taskTemplateId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Không thể đổi nhiệm vụ này.");
        return;
      }
      await loadPool();
    } finally {
      setPendingId(null);
    }
  }

  if (state === "loading") {
    return (
      <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
        <div className="text-[13.5px] text-stone-light">Đang tải…</div>
      </div>
    );
  }

  const doneCount = slots.filter((s) => s.completed).length;
  const pendingReward = slots.filter((s) => !s.completed).reduce((sum, s) => sum + s.rewardTokens, 0);
  const resetsRemaining = Math.max(0, maxResetsPerDay - resetsUsedToday);

  return (
    <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#F0E3C4] bg-cream-card px-6 py-5">
        <div>
          <div className="text-lg font-bold text-brand-ink">Nhiệm vụ hôm nay</div>
          <div className="mt-1.5 text-[13.5px] text-stone-dark">
            Hoàn thành {doneCount}/{slots.length} · Nhận thêm {pendingReward} token nữa
          </div>
          <div className="mt-1 text-[12px] text-stone-light">Còn {resetsRemaining}/{maxResetsPerDay} lượt đổi quest hôm nay</div>
        </div>
        {currentStreak !== null && (
          <div className="flex items-center gap-2.5 rounded-full border border-[#F0E3C4] bg-white px-[18px] py-2.5">
            <FlameIcon weight="fill" size={18} color="var(--color-brand-gold)" />
            <div className="text-[13.5px] font-semibold text-ink">Chuỗi {currentStreak} ngày</div>
          </div>
        )}
      </div>

      {slots.length === 0 ? (
        <div className="mt-[18px] rounded-2xl border border-cream px-5 py-[18px] text-[13.5px] text-stone-dark">
          Chưa có nhiệm vụ nào khả dụng hôm nay — quay lại sau nhé.
        </div>
      ) : (
        <div className="mt-[18px] flex flex-col gap-3">
          {slots.map((slot) => {
            const done = slot.completed;
            const fraction = slot.targetCount > 0 ? Math.min(1, slot.progress / slot.targetCount) : 0;
            const Icon = (slot.questType && QUEST_TYPE_ICONS[slot.questType]) || TargetIcon;
            const typeLabel = (slot.questType && QUEST_TYPE_LABELS[slot.questType]) || "Nhiệm vụ";
            const claimPending = pendingId === slot.userDailyTaskId;
            const resetPending = pendingId === slot.taskTemplateId;
            const canReset = !done && resetsRemaining > 0 && !resetPending;

            return (
              <div
                key={slot.taskTemplateId}
                style={{ background: done && !slot.claimed ? "#FCFAF4" : "#fff" }}
                className="flex items-center gap-4 rounded-2xl border border-cream px-5 py-[18px]"
              >
                <div
                  style={{
                    background: done ? "var(--color-brand-ink)" : "#f2f1ee",
                    color: done ? "var(--color-brand-gold-light)" : "var(--color-stone)",
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                >
                  <Icon size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[15px] font-semibold text-ink">{slot.title}</div>
                    <span className="rounded-full bg-[#f2f1ee] px-2 py-0.5 text-[10.5px] font-medium text-stone-dark">
                      {typeLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-[12.5px] text-stone">
                    {slot.description ?? `Đã ${slot.progress}/${slot.targetCount}`}
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#f0efec]">
                    <div
                      style={{ width: `${fraction * 100}%`, background: done ? "var(--color-brand-gold)" : "#C9A86A" }}
                      className="h-full rounded-full transition-[width] duration-300"
                    />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="text-[13px] font-bold text-brand-gold-dark">+{slot.rewardTokens} token</div>
                  <div className="flex items-center gap-1.5">
                    {canReset && (
                      <button
                        type="button"
                        onClick={() => handleReset(slot)}
                        disabled={resetPending}
                        title="Đổi quest này"
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-cream text-stone-dark disabled:cursor-default disabled:opacity-55"
                      >
                        <ArrowsCounterClockwiseIcon size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleClaim(slot)}
                      disabled={!done || slot.claimed || claimPending}
                      style={{
                        background: done && !slot.claimed ? "var(--color-brand-gold)" : "#fff",
                        color: done && !slot.claimed ? "var(--color-brand-ink)" : "#a8a29e",
                        borderColor: done && !slot.claimed ? "var(--color-brand-gold)" : "var(--color-cream)",
                      }}
                      className="cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-[12.5px] font-semibold disabled:cursor-default"
                    >
                      {slot.claimed ? "Đã nhận" : done ? "Nhận thưởng" : "Chưa xong"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
