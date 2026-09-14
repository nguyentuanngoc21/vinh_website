"use client";

import { useEffect, useState } from "react";
import {
  BookOpenIcon,
  FlameIcon,
  MicrophoneIcon,
  PaintBrushIcon,
  TrophyIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Alert, Skeleton } from "@/components/ui";

// Hình dạng khớp JSON trả về bởi GET /api/achievements (AchievementView ở
// achievement-service.ts) — định nghĩa lại ở đây thay vì import thẳng vì
// đó là type phía server (kéo theo supabase-js vào bundle client là không
// cần thiết), giống cách daily-tasks-tab.tsx tự định nghĩa QuestSlot.
type Achievement = {
  id: string;
  code: string;
  forRole: "author" | "narrator" | "designer" | null;
  title: string;
  description: string | null;
  icon: string | null;
  rewardTokens: number;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number } | null;
};

type RoleKey = "reader" | "author" | "narrator" | "designer";

// icon lưu ở achievement_templates.icon là text tự do (admin tự đặt lúc
// tạo thành tựu) — TrophyIcon là fallback hợp lý cho tên chưa khớp map
// này, không phải lỗi.
const ACHIEVEMENT_ICONS: Record<string, PhosphorIcon> = {
  book: BookOpenIcon,
  flame: FlameIcon,
  mic: MicrophoneIcon,
  brush: PaintBrushIcon,
  trophy: TrophyIcon,
};

// Màu theo ROLE (không theo achievement_templates.color_token — cột đó
// để admin tuỳ biến sau này, nhưng v1 lấy màu trực tiếp từ for_role cho
// chắc chắn nhất quán, không phụ thuộc admin gõ đúng 1 chuỗi tự do).
// reader neo vào brand-gold (accent gốc của app, vì đây là role mặc
// định); 3 role còn lại lấy từ đúng bảng chart-* categorical đã có sẵn
// trong globals.css, không phát minh màu mới.
const ROLE_META: Record<RoleKey, { label: string; icon: PhosphorIcon; color: string; bg: string }> = {
  reader: { label: "Đọc giả", icon: FlameIcon, color: "var(--color-brand-gold)", bg: "#fbf1de" },
  author: { label: "Tác giả", icon: BookOpenIcon, color: "var(--color-chart-indigo)", bg: "#edecfb" },
  narrator: { label: "Người thu âm", icon: MicrophoneIcon, color: "var(--color-chart-teal)", bg: "#e6f1f4" },
  designer: { label: "Thiết kế", icon: PaintBrushIcon, color: "var(--color-chart-rose)", bg: "#fbe6f0" },
};
const ROLE_ORDER: RoleKey[] = ["reader", "author", "narrator", "designer"];

function roleOf(a: Achievement): RoleKey {
  return a.forRole ?? "reader";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - percent / 100);
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="absolute inset-0 -rotate-90">
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-cream)" strokeWidth={5} />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

function GroupCard({ role, items, onOpen }: { role: RoleKey; items: Achievement[]; onOpen: (role: RoleKey) => void }) {
  const meta = ROLE_META[role];
  const done = items.filter((a) => a.unlocked).length;
  const percent = items.length > 0 ? Math.round((done / items.length) * 100) : 0;
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(role)}
      className="relative flex cursor-pointer flex-col items-center gap-3.5 rounded-[20px] border border-cream-border bg-cream-card px-[18px] pb-5 pt-6 transition-transform hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(20,59,77,0.28)]"
    >
      <CaretRightIcon size={14} color="var(--color-stone-light)" className="absolute right-4 top-3.5" />
      <div className="relative h-[76px] w-[76px]">
        <ProgressRing percent={percent} color={meta.color} />
        <div
          className="absolute inset-2 flex items-center justify-center rounded-full"
          style={{ background: meta.bg, color: meta.color }}
        >
          <Icon size={26} />
        </div>
      </div>
      <div className="text-center">
        <div className="mb-1 text-[14.5px] font-bold text-ink">{meta.label}</div>
        <div className="text-[12px] text-stone-dark">
          <b className="font-bold" style={{ color: meta.color }}>
            {done}
          </b>{" "}
          / {items.length} thành tựu
        </div>
      </div>
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-cream">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: meta.color }} />
      </div>
    </button>
  );
}

function AchievementCard({ item }: { item: Achievement }) {
  const meta = ROLE_META[roleOf(item)];
  const Icon = (item.icon && ACHIEVEMENT_ICONS[item.icon]) || TrophyIcon;
  const progressPct = item.progress && item.progress.target > 0 ? Math.min(100, Math.round((item.progress.current / item.progress.target) * 100)) : 0;

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-cream-border px-4 py-4"
      style={{ background: item.unlocked ? "#fff" : "var(--color-cream-card)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full"
          style={item.unlocked ? { background: meta.bg, color: meta.color } : { background: "var(--color-cream)", color: "var(--color-stone-light)" }}
        >
          <Icon size={19} />
          {item.unlocked && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-success">
              <CheckIcon size={8} color="#fff" weight="bold" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className={`text-[14.5px] font-bold ${item.unlocked ? "text-ink" : "text-stone-dark"}`}>{item.title}</div>
          {item.description && <div className="mt-0.5 text-[12.5px] leading-[1.45] text-stone-dark">{item.description}</div>}
        </div>
      </div>

      {!item.unlocked && item.progress && item.progress.target > 0 && (
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-cream">
          <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: meta.color }} />
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2">
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold text-brand-gold-dark ${item.rewardTokens > 0 ? "" : "invisible"}`}
          style={{ background: "#fbf1de" }}
        >
          +{item.rewardTokens} token
        </span>
        <span className={`whitespace-nowrap text-[11.5px] ${item.unlocked ? "font-semibold text-success" : "text-stone-light"}`}>
          {item.unlocked
            ? `Đã mở khoá${item.unlockedAt ? " · " + formatDate(item.unlockedAt) : ""}`
            : item.progress
              ? `${item.progress.current}/${item.progress.target}`
              : "Chưa mở khoá"}
        </span>
      </div>
    </div>
  );
}

export function AchievementsPage() {
  const [state, setState] = useState<"loading" | "ready">("loading");
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openRole, setOpenRole] = useState<RoleKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/achievements")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((body: { achievements: Achievement[] }) => {
        if (cancelled) return;
        setAchievements(body.achievements);
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setError("Không tải được thành tựu.");
        setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
        <Skeleton className="mb-6 h-6 w-48 rounded-[var(--radius-sm)]" />
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const byRole = new Map<RoleKey, Achievement[]>(ROLE_ORDER.map((r) => [r, []]));
  for (const a of achievements) byRole.get(roleOf(a))!.push(a);

  const totalDone = achievements.filter((a) => a.unlocked).length;
  const totalTokens = achievements.filter((a) => a.unlocked).reduce((sum, a) => sum + a.rewardTokens, 0);

  return (
    <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-cream-border bg-cream-card px-6 py-5">
        <div>
          <div className="text-lg font-bold text-brand-ink">Thành tựu của bạn</div>
          <div className="mt-1.5 text-[13.5px] text-stone-dark">
            {totalDone}/{achievements.length} huy hiệu đã mở khoá
            {openRole === null ? " · bấm vào 1 nhóm để xem danh sách" : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-extrabold tabular-nums text-brand-ink">{totalTokens}</div>
          <div className="text-[11.5px] text-stone-light">token đã thưởng từ thành tựu</div>
        </div>
      </div>

      {openRole === null ? (
        <div className="mt-[18px] grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {ROLE_ORDER.map((role) => (
            <GroupCard key={role} role={role} items={byRole.get(role)!} onOpen={setOpenRole} />
          ))}
        </div>
      ) : (
        <div className="mt-[18px]">
          <div className="mb-5 flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => setOpenRole(null)}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-cream-border bg-white px-3.5 py-2 text-[13px] font-semibold text-stone-dark hover:border-brand-ink hover:text-brand-ink"
            >
              <CaretLeftIcon size={14} /> Nhóm thành tựu
            </button>
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ background: ROLE_META[openRole].bg, color: ROLE_META[openRole].color }}
            >
              {(() => {
                const Icon = ROLE_META[openRole].icon;
                return <Icon size={20} />;
              })()}
            </div>
            <div>
              <div className="text-[16.5px] font-bold text-ink">{ROLE_META[openRole].label}</div>
              <div className="text-[12.5px] tabular-nums text-stone-light">
                {byRole.get(openRole)!.filter((a) => a.unlocked).length}/{byRole.get(openRole)!.length} thành tựu đã mở khoá
              </div>
            </div>
          </div>

          {byRole.get(openRole)!.length === 0 ? (
            <div className="rounded-2xl border border-cream px-5 py-[18px] text-[13.5px] text-stone-dark">
              Chưa có thành tựu nào ở nhóm này.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byRole.get(openRole)!.map((item) => (
                <AchievementCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
