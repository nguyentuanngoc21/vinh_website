import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { HISTORY_DAYS, isoDay, parseGoal, summarize, type WritingGoalSummary } from "@/lib/authoring/writing-goal";

const noStore = { "Cache-Control": "private, no-store" };

async function load(request: Request): Promise<NextResponse> {
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e) as NextResponse; }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const today = isoDay(new Date());
  const since = new Date(); since.setUTCDate(since.getUTCDate() - HISTORY_DAYS);
  const [goal, days, books] = await Promise.all([
    auth.supabase.from("author_writing_goals").select("daily_words").eq("user_id", auth.userId).maybeSingle(),
    auth.supabase.from("author_daily_words").select("day, words").eq("user_id", auth.userId).gte("day", isoDay(since)),
    auth.supabase.from("books").select("id", { count: "exact", head: true }).eq("author_id", auth.userId).is("deleted_at", null),
  ]);
  if (goal.error || days.error) return NextResponse.json({ error: "Không tải được mục tiêu viết." }, { status: 500 });
  const body: WritingGoalSummary = { ...summarize(days.data ?? [], goal.data?.daily_words ?? null, today), isAuthor: (books.count ?? 0) > 0 };
  return NextResponse.json(body, { headers: noStore });
}

/** GET — mục tiêu, số chữ hôm nay, chuỗi ngày đạt mục tiêu, 7 ngày gần nhất. */
export async function GET(request: Request) {
  return load(request);
}

/** PUT { dailyWords: number | 0 | null } — đặt hoặc tắt mục tiêu (0/null = tắt). */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const goal = parseGoal(body?.dailyWords);
  if (goal === "invalid") return NextResponse.json({ error: "Mục tiêu từ 50 đến 50.000 chữ mỗi ngày." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { error } = goal === null
    ? await auth.supabase.from("author_writing_goals").delete().eq("user_id", auth.userId)
    : await auth.supabase.from("author_writing_goals")
      .upsert({ user_id: auth.userId, daily_words: goal, updated_at: new Date().toISOString() });
  if (error) {
    console.error("[writing-goal] save failed:", error);
    return NextResponse.json({ error: "Không lưu được mục tiêu." }, { status: 500 });
  }
  return load(request);
}
