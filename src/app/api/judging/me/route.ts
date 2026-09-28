import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { isActiveJudge } from "@/lib/contests/judging-service";
import { PRIVATE_NO_STORE } from "@/lib/contests/public-route";

/**
 * GET /api/judging/me → { is_judge } — menu avatar chỉ hiện mục "Chấm giải"
 * cho người đang được gán chấm ít nhất 1 cuộc thi (đã công bố). Menu gọi 1
 * lần khi mở lần đầu, không gọi mỗi lần tải trang.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) return NextResponse.json({ is_judge: false }, { headers: PRIVATE_NO_STORE });
  try {
    return NextResponse.json({ is_judge: await isActiveJudge(supabase, userId) }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    console.error("[judging] is judge check failed:", error);
    return NextResponse.json({ is_judge: false }, { headers: PRIVATE_NO_STORE });
  }
}
