import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { getNextPenalty, getPenaltyDeduction, PENALTY_DAY_MS } from "@/lib/penalty/rules";

async function getPenaltyProfile(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, screenshot_penalty_count, screenshot_penalty_expires_at, screenshot_penalty_banned, screenshot_penalty_last_offense_at"
    )
    .eq("id", userId)
    .single();

  if (error || !data) {
    return { data: null, error: error ?? new Error("Profile not found") };
  }

  return { data, error: null };
}

// Người gọi: cookie ký tay trước rồi tới phiên Supabase — dùng chung
// getAuthedUserId() (src/lib/wallet/session.ts) thay vì tự dựng lại ở đây.
// null -> 401; có id nhưng không có hồ sơ -> 404 (giữ nguyên như trước).
// Trả NextResponse lỗi, hoặc dòng profiles cần cho GET/POST.
async function resolvePenaltyProfile(supabase: ReturnType<typeof createServiceRoleClient>) {
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }
  const profileResult = await getPenaltyProfile(supabase, userId);
  if (profileResult.error || !profileResult.data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }
  return profileResult.data;
}

export async function GET() {
  const supabase = createServiceRoleClient();
  const profile = await resolvePenaltyProfile(supabase);
  if (profile instanceof NextResponse) return profile;

  return NextResponse.json(profile);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || payload.event !== "screenshot") {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const profile = await resolvePenaltyProfile(supabase);
  if (profile instanceof NextResponse) return profile;

  const currentCount = Number(profile.screenshot_penalty_count ?? 0);
  const nextCount = currentCount + 1;
  const now = new Date();
  let expiresAt: string | null = null;
  let banned = false;
  let lastDeductedAmount: number | null = null;

  const nextPenalty = getNextPenalty(currentCount);
  const warningOnly = "warning" in nextPenalty;
  if ("warning" in nextPenalty) {
    // Lần vi phạm đầu tiên — chỉ cảnh báo, KHÔNG trừ token/không set
    // expiresAt/banned (giữ nguyên giá trị mặc định false/null khai báo ở
    // trên). Nhánh dưới (cập nhật profiles) vẫn chạy để tăng
    // screenshot_penalty_count lên 1, cho lần vi phạm SAU biết đây không
    // còn là lần đầu.
  } else if ("ban" in nextPenalty && nextPenalty.ban) {
    banned = true;
  } else {
    const expires = new Date(now.getTime() + nextPenalty.durationDays * PENALTY_DAY_MS);
    expiresAt = expires.toISOString();
    const percent = "percent" in nextPenalty ? nextPenalty.percent : 0;
    lastDeductedAmount = getPenaltyDeduction(percent);

    const { error: transactionError } = await supabase.rpc("apply_transaction", {
      p_user_id: profile.id,
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
          p_user_id: profile.id,
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
    .eq("id", profile.id)
    .select(
      "screenshot_penalty_count, screenshot_penalty_expires_at, screenshot_penalty_banned, screenshot_penalty_last_offense_at"
    )
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Không thể cập nhật trạng thái phạt." }, { status: 500 });
  }

  return NextResponse.json({ ...updated, last_deducted_amount: lastDeductedAmount, warning_only: warningOnly });
}
