import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type MonthlyPostsPoint = { label: string; chapters: number; audio: number };
export type WeeklySignupsPoint = { label: string; count: number };

const MONTHS_BACK = 12;
const WEEKS_BACK = 5;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** "Bài đăng mỗi tháng" thật (admin/posts-chart.tsx) — đếm chương đã
 * xuất bản + bản thu audio theo tháng tạo, 12 tháng gần nhất. Trước đây
 * MONTHLY_POSTS bịa hoàn toàn (dựng từ ngày đầu scaffold, chưa từng đấu
 * nối dữ liệu thật). Tải cột created_at rồi tự bucket theo tháng ở JS —
 * đúng kiểu "list rồi tự xử lý" đang dùng ở chỗ khác trong repo (không
 * có SQM date_trunc() aggregate qua PostgREST select thường). */
export async function getMonthlyPostsTrend(supabase: SupabaseClient<Database>): Promise<MonthlyPostsPoint[]> {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);

  const [chaptersRes, audioRes] = await Promise.all([
    supabase.from("chapters").select("created_at").eq("published", true).gte("created_at", cutoff.toISOString()),
    supabase.from("audio_narrations").select("created_at").gte("created_at", cutoff.toISOString()),
  ]);

  const chapterCounts = new Map<string, number>();
  for (const row of chaptersRes.data ?? []) {
    const key = monthKey(new Date(row.created_at));
    chapterCounts.set(key, (chapterCounts.get(key) ?? 0) + 1);
  }
  const audioCounts = new Map<string, number>();
  for (const row of audioRes.data ?? []) {
    const key = monthKey(new Date(row.created_at));
    audioCounts.set(key, (audioCounts.get(key) ?? 0) + 1);
  }

  const points: MonthlyPostsPoint[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    points.push({
      label: `T${d.getMonth() + 1}`,
      chapters: chapterCounts.get(key) ?? 0,
      audio: audioCounts.get(key) ?? 0,
    });
  }
  return points;
}

/** "Người đăng ký mới" theo tuần (admin/signups-chart.tsx) — trước đây
 * là 1 polyline SVG viết tay (points="0,98 56,84 ...") không phải dữ
 * liệu thật. Bucket profiles.created_at theo tuần, 5 tuần gần nhất
 * (~30 ngày, khớp khung "30 ngày" đang ghi trên UI). */
export async function getWeeklySignupsTrend(supabase: SupabaseClient<Database>): Promise<WeeklySignupsPoint[]> {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now - WEEKS_BACK * weekMs);

  const { data } = await supabase.from("profiles").select("created_at").gte("created_at", cutoff.toISOString());

  const counts = new Array(WEEKS_BACK).fill(0);
  for (const row of data ?? []) {
    const age = now - new Date(row.created_at).getTime();
    const weekIndex = WEEKS_BACK - 1 - Math.floor(age / weekMs);
    if (weekIndex >= 0 && weekIndex < WEEKS_BACK) counts[weekIndex]++;
  }

  return counts.map((count, i) => ({ label: `Tuần ${i + 1}`, count }));
}
