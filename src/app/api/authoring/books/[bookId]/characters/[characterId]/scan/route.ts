import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { scanCharacterMentions } from "@/lib/authoring/character-scan";
import { isUuid } from "@/lib/validation/uuid";

// Reads every unreviewed chapter of the author's books.
export const maxDuration = 60;

/** POST — "Nhận diện nhân vật": suggestions only; nothing is tagged until the author confirms. */
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string; characterId: string }> }) {
  const { bookId, characterId } = await params;
  if (!isUuid(bookId) || !isUuid(characterId)) return NextResponse.json({ error: "Nhân vật không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  try {
    const result = await scanCharacterMentions(auth.supabase, auth.admin(), auth.userId, bookId, characterId);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[characters/scan] failed:", e);
    return NextResponse.json({ error: "Không quét được truyện. Vui lòng thử lại." }, { status: 500 });
  }
}
