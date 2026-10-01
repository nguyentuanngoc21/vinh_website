import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAgreement } from "@/lib/legal/registry";
import { revalidatePublicBooks } from "@/lib/cache/public-data";

export async function GET(request: Request) {
  const denied = rejectUnauthorizedCron(request, "authoring/publish-scheduled");
  if (denied) return denied;
  try {
    const agreement = getAgreement("chinh-sach-doc-quyen");
    if (!agreement) return NextResponse.json({ error: "Không tìm thấy phiên bản thỏa thuận hiện tại." }, { status: 500 });
    const { data, error } = await createServiceRoleClient().rpc("run_due_chapter_publications", { p_agreement_version: agreement.updatedAt });
    if (error) throw error;
    // Also refresh after a retry repairs visibility without publishing new chapters.
    revalidatePublicBooks();
    return NextResponse.json({ publishedCount: data });
  } catch (e) {
    console.error("[authoring] scheduled publication failed:", e);
    return NextResponse.json({ error: "Không xử lý được lịch đăng." }, { status: 500 });
  }
}
