import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * GET /api/reading-lists?bookId=<uuid?> — danh sách đọc (playlist) của
 * user hiện tại, mỗi mục kèm `containsBook` (sách `bookId` đã nằm trong
 * danh sách đó chưa) để render checkbox trong modal "Thêm". Không truyền
 * `bookId` thì `containsBook` luôn false (dùng cho các nơi chỉ cần liệt
 * kê danh sách, không cần biết trạng thái với 1 sách cụ thể).
 */
export async function GET(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const bookId = new URL(request.url).searchParams.get("bookId");

  const { data: lists, error } = await supabase
    .from("reading_lists")
    .select("id, name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[reading-lists] list failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách đọc." }, { status: 500 });
  }

  let bookListIds = new Set<string>();
  if (bookId && lists && lists.length > 0) {
    const { data: items } = await supabase
      .from("reading_list_items")
      .select("list_id")
      .eq("book_id", bookId)
      .in("list_id", lists.map((l) => l.id));
    bookListIds = new Set((items ?? []).map((i) => i.list_id));
  }

  return NextResponse.json({
    lists: (lists ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.created_at,
      containsBook: bookListIds.has(l.id),
    })),
  });
}

/** POST /api/reading-lists — tạo danh sách đọc mới cho user hiện tại. */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Vui lòng đặt tên cho danh sách." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reading_lists")
    .insert({ user_id: userId, name })
    .select("id, name, created_at")
    .single();

  if (error || !data) {
    console.error("[reading-lists] create failed:", error);
    return NextResponse.json({ error: "Không tạo được danh sách. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, name: data.name, createdAt: data.created_at });
}
