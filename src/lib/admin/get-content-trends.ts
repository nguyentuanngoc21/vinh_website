import { fetchAllRows } from "./query-utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type MonthlyPostsPoint = { label: string; chapters: number; audio: number };
export type WeeklySignupsPoint = { label: string; count: number };

const MONTHS_BACK = 12;
const WEEKS_BACK = 5;

function monthKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).format(d);
}

/** "Bài đăng mỗi tháng" thật (admin/posts-chart.tsx) — đếm chương đã
 * xuất bản + bản thu audio theo tháng tạo, 12 tháng gần nhất. Trước đây
 * MONTHLY_POSTS bịa hoàn toàn (dựng từ ngày đầu scaffold, chưa từng đấu
 * nối dữ liệu thật). Tải cột created_at rồi tự bucket theo tháng ở JS —
 * đúng kiểu "list rồi tự xử lý" đang dùng ở chỗ khác trong repo (không
 * có SQM date_trunc() aggregate qua PostgREST select thường). */
export async function getMonthlyPostsTrend(supabase: SupabaseClient<Database>): Promise<MonthlyPostsPoint[]> {
  const localNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  const cutoff = new Date(Date.UTC(year, month - (MONTHS_BACK - 1), 1) - 7 * 60 * 60 * 1000);

  const [chaptersRes, audioRes] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("chapters").select("created_at").eq("published", true).gte("created_at", cutoff.toISOString()).order("id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("audio_narrations").select("created_at").gte("created_at", cutoff.toISOString()).order("id").range(from, to)),
  ]);

  const chapterCounts = new Map<string, number>();
  for (const row of chaptersRes) {
    const key = monthKey(new Date(row.created_at));
    chapterCounts.set(key, (chapterCounts.get(key) ?? 0) + 1);
  }
  const audioCounts = new Map<string, number>();
  for (const row of audioRes) {
    const key = monthKey(new Date(row.created_at));
    audioCounts.set(key, (audioCounts.get(key) ?? 0) + 1);
  }

  const points: MonthlyPostsPoint[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const key = monthKey(d);
    points.push({
      label: `T${d.getUTCMonth() + 1}`,
      chapters: chapterCounts.get(key) ?? 0,
      audio: audioCounts.get(key) ?? 0,
    });
  }
  return points;
}

/** "Người đăng ký mới" theo tuần (admin/signups-chart.tsx) — trước đây
 * là 1 polyline SVG viết tay (points="0,98 56,84 ...") không phải dữ
 * liệu thật. Chia đúng 30 ngày thành 4 nhóm 7 ngày và nhóm cuối 2 ngày. */
export async function getWeeklySignupsTrend(supabase: SupabaseClient<Database>): Promise<WeeklySignupsPoint[]> {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const data = await fetchAllRows((from, to) => supabase.from("profiles").select("created_at").gte("created_at", cutoff.toISOString()).lte("created_at", new Date(now).toISOString()).order("id").range(from, to));

  const counts = new Array(WEEKS_BACK).fill(0);
  for (const row of data ?? []) {
    const elapsed = new Date(row.created_at).getTime() - cutoff.getTime();
    const weekIndex = Math.min(WEEKS_BACK - 1, Math.floor(elapsed / weekMs));
    if (weekIndex >= 0 && weekIndex < WEEKS_BACK) counts[weekIndex]++;
  }

  return counts.map((count, i) => ({ label: i === 4 ? "Ngày 29–30" : `Ngày ${i * 7 + 1}–${(i + 1) * 7}`, count }));
}
