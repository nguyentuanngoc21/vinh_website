/**
 * "Mục tiêu viết mỗi ngày" — words per day come from the record_chapter_words
 * trigger (migrations/20261009_author_daily_words.sql). Days are UTC dates,
 * the same 07:00 (VN) reset as daily quests. Pure helpers.
 */
export const GOAL_MIN = 50;
export const GOAL_MAX = 50000;
export const HISTORY_DAYS = 60;

export type DayWords = { day: string; words: number };
export type WritingGoalSummary = {
  /** Personal daily target; null = not set. */
  goal: number | null;
  today: number;
  /** Consecutive days reaching the goal, ending today (or yesterday while today is still open). */
  streak: number;
  last7: DayWords[];
  last30: DayWords[];
  stats: WritingStats;
  isAuthor: boolean;
};
export type WritingStats = {
  /** Words in the current (UTC) calendar month. */
  month: number;
  total30: number;
  activeDays30: number;
  /** Average over days with any writing, last 30 days. */
  avgActive30: number;
  best: DayWords | null;
};

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, delta: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDay(d);
};

export function parseGoal(value: unknown): number | null | "invalid" {
  if (value === null || value === 0) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < GOAL_MIN || value > GOAL_MAX) return "invalid";
  return value;
}

export function summarize(rows: DayWords[], goal: number | null, today: string): Omit<WritingGoalSummary, "isAuthor"> {
  const byDay = new Map(rows.map(r => [r.day, r.words]));
  const words = (day: string) => byDay.get(day) ?? 0;
  let streak = 0;
  if (goal) {
    // Today still open: an unmet today doesn't break yesterday's streak.
    let day = words(today) >= goal ? today : shift(today, -1);
    while (words(day) >= goal && streak < HISTORY_DAYS) { streak++; day = shift(day, -1); }
  }
  const range = (n: number) => Array.from({ length: n }, (_, i) => { const day = shift(today, i - n + 1); return { day, words: words(day) }; });
  const last30 = range(30);
  const active = last30.filter(d => d.words > 0);
  const total30 = active.reduce((n, d) => n + d.words, 0);
  const best = rows.reduce<DayWords | null>((b, r) => (r.words > 0 && (!b || r.words > b.words) ? r : b), null);
  const stats: WritingStats = {
    month: rows.filter(r => r.day.slice(0, 7) === today.slice(0, 7)).reduce((n, r) => n + r.words, 0),
    total30, activeDays30: active.length,
    avgActive30: active.length ? Math.round(total30 / active.length) : 0,
    best,
  };
  return { goal, today: words(today), streak, last7: last30.slice(-7), last30, stats };
}
