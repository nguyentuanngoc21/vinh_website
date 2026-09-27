import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ContestFraudStatus } from "@/lib/supabase/types";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { getContestById } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { detectFraudSignals, FRAUD_SCAN_STATUSES, getFraudCounts, listFraudSignals } from "@/lib/contests/fraud-service";
import { contestErrorResponse, requireUuid } from "@/lib/contests/route-helpers";

const FILTERS: (ContestFraudStatus | "all")[] = ["open", "confirmed", "dismissed", "all"];

/** GET /api/admin/contests/:contestId/fraud?status=open|confirmed|dismissed|all — tín hiệu + số đếm theo trạng thái. */
export async function GET(request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = requireUuid(contestId, "contest_not_found");
    const status = (new URL(request.url).searchParams.get("status") ?? "open") as ContestFraudStatus | "all";
    if (!FILTERS.includes(status)) throw new ContestError("invalid_input", ["Trạng thái lọc không hợp lệ"]);
    const [items, counts] = await Promise.all([listFraudSignals(supabase, { contestId: id, status }), getFraudCounts(supabase, id)]);
    return NextResponse.json({ items, counts });
  } catch (error) {
    return contestErrorResponse(error, "admin list fraud signals");
  }
}

/** POST /api/admin/contests/:contestId/fraud — "Quét lại": gắn tín hiệu mới (không bao giờ tự khoá tài khoản). */
export async function POST(_request: Request, { params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const contest = await getContestById(supabase, requireUuid(contestId, "contest_not_found"));
    if (!FRAUD_SCAN_STATUSES.includes(contest.status)) throw new ContestError("not_allowed");
    const created = await detectFraudSignals(supabase, contest.id);
    return NextResponse.json({ created, counts: await getFraudCounts(supabase, contest.id) });
  } catch (error) {
    return contestErrorResponse(error, "admin scan fraud signals");
  }
}
