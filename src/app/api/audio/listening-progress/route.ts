import { createClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { getListeningProgress } from "@/lib/audio/get-listening-progress";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET() {
  try {
    const viewerId = await getAuthedUserId();
    if (!viewerId) return Response.json({ error: "Vui lòng đăng nhập." }, { status: 401, headers });
    const client = await createClient();
    const items = await getListeningProgress(client, viewerId, 4);
    return Response.json({ items }, { headers });
  } catch {
    return Response.json({ error: "Không tải được tiến độ nghe." }, { status: 503, headers });
  }
}
