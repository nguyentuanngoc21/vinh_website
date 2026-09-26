import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { parseHeartbeatBody, recordReadingHeartbeat } from "@/lib/reading/record-heartbeat";

/**
 * POST /api/reading/heartbeat — nhịp đọc 60 giây từ reader.tsx (chỉ khi tab đang hiển thị và
 * người đọc vừa tương tác). Body: { chapterId, sessionId?, paragraphIndex, source? }. Trả
 * { sessionId, activeSeconds } — client gửi lại sessionId ở nhịp sau. Kiểm quyền + ghi nằm
 * trong recordReadingHeartbeat(), dùng chung với /api/mobile/reading/heartbeat.
 */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = parseHeartbeatBody(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Dữ liệu nhịp đọc không hợp lệ." }, { status: 400 });

  const result = await recordReadingHeartbeat(supabase, userId, input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ sessionId: result.sessionId, activeSeconds: result.activeSeconds });
}
