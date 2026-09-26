import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { resolveReviewFlag } from "@/lib/contests/admin-service";
import { ContestError } from "@/lib/contests/errors";
import { contestErrorResponse, readJson } from "@/lib/contests/route-helpers";

const RESOLUTIONS = ["fixed", "dismissed", "escalated"] as const;

/** PATCH .../flags/:flagId { resolution: fixed | dismissed | escalated } */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ contestId: string; submissionId: string; flagId: string }> }
) {
  const { contestId, submissionId, flagId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await readJson(request);
    const resolution = RESOLUTIONS.find((r) => r === body.resolution);
    if (!resolution) throw new ContestError("invalid_flag");
    const submission = await resolveReviewFlag(supabase, { contestId, submissionId, flagId, adminId, resolution });
    return NextResponse.json({ submission });
  } catch (error) {
    return contestErrorResponse(error, "admin resolve review flag");
  }
}
