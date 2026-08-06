import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";

type PenaltyRule = { percent: number; durationDays: number };
type NextPenalty = PenaltyRule | { ban: true; durationDays: number };

const PENALTY_RULES: ReadonlyArray<PenaltyRule> = [
  { percent: 10, durationDays: 3 },
  { percent: 10, durationDays: 7 },
  { percent: 15, durationDays: 14 },
  { percent: 15, durationDays: 30 },
];

const PENALTY_BASE_TOKEN = 1000;

function getNextPenalty(count: number): NextPenalty {
  if (count >= 4) {
    return { ban: true, durationDays: 30 };
  }
  return PENALTY_RULES[count];
}

async function getPenaltyProfile(supabase: ReturnType<typeof createServiceRoleClient>, identifier: { username?: string; userId?: string }) {
  const qb = supabase.from("profiles").select(
    "id, screenshot_penalty_count, screenshot_penalty_expires_at, screenshot_penalty_banned, screenshot_penalty_last_offense_at"
  );
  if (identifier.username) qb.eq("username", identifier.username);
  if (identifier.userId) qb.eq("id", identifier.userId);

  const { data, error } = await qb.single();

  if (error || !data) {
    return { data: null, error: error ?? new Error("Profile not found") };
  }

  return { data, error: null };
}

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export async function GET() {
  const session = await getSession();
  const supabase = createServiceRoleClient();
  let profileResult = null;

  if (session) {
    profileResult = await getPenaltyProfile(supabase, { username: session.handle });
  }

  if (!profileResult || profileResult.error || !profileResult.data) {
    const fallbackClient = await createSupabaseClient();
    const { data: authUser, error: authError } = await fallbackClient.auth.getUser();
    if (authError || !authUser?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    profileResult = await getPenaltyProfile(supabase, { userId: authUser.user.id });
  }

  if (!profileResult || profileResult.error || !profileResult.data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  return NextResponse.json(profileResult.data);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || payload.event !== "screenshot") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const session = await getSession();
  const supabase = createServiceRoleClient();
  let profileResult = null;

  if (session) {
    profileResult = await getPenaltyProfile(supabase, { username: session.handle });
  }

  if (!profileResult || profileResult.error || !profileResult.data) {
    const fallbackClient = await createSupabaseClient();
    const { data: authUser, error: authError } = await fallbackClient.auth.getUser();
    if (authError || !authUser?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    profileResult = await getPenaltyProfile(supabase, { userId: authUser.user.id });
  }

  if (!profileResult || profileResult.error || !profileResult.data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  const currentCount = Number(profileResult.data.screenshot_penalty_count ?? 0);
  const nextCount = currentCount + 1;
  const now = new Date();
  let expiresAt: string | null = null;
  let banned = false;
  let lastDeductedAmount: number | null = null;

  const nextPenalty = getNextPenalty(currentCount);
  if ("ban" in nextPenalty && nextPenalty.ban) {
    banned = true;
  } else {
    const expires = new Date(now.getTime() + nextPenalty.durationDays * 24 * 60 * 60 * 1000);
    expiresAt = expires.toISOString();
    const percent = "percent" in nextPenalty ? nextPenalty.percent : 0;
    lastDeductedAmount = Math.max(1, Math.ceil((PENALTY_BASE_TOKEN * percent) / 100));

    const { data: transaction, error: transactionError } = await supabase.rpc("apply_transaction", {
      p_user_id: profileResult.data.id,
      p_type: "screenshot_penalty",
      p_amount: -lastDeductedAmount,
      p_reference_type: "screenshot_penalty",
      p_reference_id: null,
      p_penalty_percent: percent / 100,
    });
    if (transactionError) {
      // If the DB doesn't have the new signature yet, retry without penalty param
      const missingFn = transactionError.code === "PGRST202" ||
        (typeof transactionError.message === "string" && transactionError.message.includes("p_penalty_percent"));
      if (missingFn) {
        const fallback = await supabase.rpc("apply_transaction", {
          p_user_id: profileResult.data.id,
          p_type: "screenshot_penalty",
          p_amount: -lastDeductedAmount,
          p_reference_type: "screenshot_penalty",
          p_reference_id: null,
        });
        if (fallback.error) {
          if (typeof fallback.error.message === "string" && fallback.error.message.includes("Insufficient balance")) {
            lastDeductedAmount = 0;
          } else {
            return NextResponse.json({ error: fallback.error.message || "Không thể trừ token do lỗi giao dịch." }, { status: 402 });
          }
        }
      } else {
        // If the user has insufficient balance, still persist the penalty
        // state (count/expires/ban) but record that no tokens were deducted.
        if (typeof transactionError.message === "string" && transactionError.message.includes("Insufficient balance")) {
          lastDeductedAmount = 0;
        } else {
          return NextResponse.json(
            { error: transactionError.message || "Không thể trừ token do lỗi giao dịch." },
            { status: 402 }
          );
        }
      }
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({
      screenshot_penalty_count: nextCount,
      screenshot_penalty_expires_at: expiresAt,
      screenshot_penalty_banned: banned,
      screenshot_penalty_last_offense_at: now.toISOString(),
    })
    .eq("id", profileResult.data.id)
    .select(
      "screenshot_penalty_count, screenshot_penalty_expires_at, screenshot_penalty_banned, screenshot_penalty_last_offense_at"
    )
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Không thể cập nhật trạng thái phạt." }, { status: 500 });
  }

  return NextResponse.json({ ...updated, last_deducted_amount: lastDeductedAmount });
}
