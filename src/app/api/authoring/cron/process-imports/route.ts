import { createServiceRoleClient } from "@/lib/supabase/server";
import { cleanExpiredImports, processOneManuscript } from "@/lib/authoring/manuscript-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Fail closed in development as well; this route handles private manuscript files.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({}, { status: 401 });
  try {
    const client = createServiceRoleClient();
    const cleaned = await cleanExpiredImports(client);
    const outcome = process.env.MANUSCRIPT_QUEUE_ENABLED === "true" ? await processOneManuscript(client) : { processed: 0 };
    return Response.json({ cleaned, ...outcome }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Chưa xử lý được tác vụ nhập." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
