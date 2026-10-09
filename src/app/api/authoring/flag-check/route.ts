import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { findFlaggedTerms, type FlagTerm } from "@/lib/authoring/flag-terms";
import { MAX_CHAPTER_CONTENT_LENGTH } from "@/lib/authoring/chapter-limits";

// The list changes rarely (admins edit it in Supabase); cache briefly per instance.
const CACHE_MS = 60_000;
let cache: { at: number; terms: FlagTerm[] } | null = null;

/**
 * POST { title, content } — từ cần xem lại trước khi xuất bản. Chỉ CẢNH BÁO,
 * không chặn. Trả về đúng các từ có trong văn bản, không bao giờ cả danh sách.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title : "";
  const content = typeof body?.content === "string" ? body.content : null;
  if (content === null || content.length > MAX_CHAPTER_CONTENT_LENGTH || title.length > 500) {
    return NextResponse.json({ error: "Nội dung không hợp lệ." }, { status: 400 });
  }
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });

  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const { data, error } = await auth.admin().from("content_flag_terms").select("term, note").eq("active", true);
    if (error) {
      console.error("[flag-check] load terms failed:", error);
      return NextResponse.json({ matches: [] });
    }
    cache = { at: Date.now(), terms: data ?? [] };
  }
  return NextResponse.json({ matches: findFlaggedTerms(`${title}\n\n${content}`, cache.terms) }, { headers: { "Cache-Control": "private, no-store" } });
}
