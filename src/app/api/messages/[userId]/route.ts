import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const THREAD_MESSAGE_LIMIT = 200;
const BODY_MAX = 4000;

/**
 * GET /api/messages/:userId — toàn bộ tin nhắn giữa mình và :userId (tối
 * đa THREAD_MESSAGE_LIMIT tin gần nhất, chưa phân trang lùi xa hơn — đủ
 * dùng ở quy mô hiện tại, thêm cursor sau nếu cần). Tự đánh dấu đã đọc
 * mọi tin :userId gửi cho mình ngay khi mở luồng này (matches hành vi
 * "mở hội thoại là coi như đã đọc" quen thuộc, không cần API riêng).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: counterpartyId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: counterparty, error: counterpartyError } = await supabase
    .from("author_public_profiles")
    .select("id, nickname, username, avatar_url")
    .eq("id", counterpartyId)
    .maybeSingle();
  if (counterpartyError || !counterparty) {
    return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("direct_messages")
    .select("id, sender_id, body, created_at")
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${counterpartyId}),and(sender_id.eq.${counterpartyId},recipient_id.eq.${userId})`
    )
    .order("created_at", { ascending: true })
    .limit(THREAD_MESSAGE_LIMIT);
  if (error) {
    console.error("[messages] thread fetch failed:", error);
    return NextResponse.json({ error: "Không tải được hội thoại." }, { status: 500 });
  }

  // Không await — đánh dấu đã đọc là tác dụng phụ, không cần chặn phản
  // hồi GET này (chậm hơn 1 chút cũng không sao, không mất dữ liệu nếu
  // request bị huỷ giữa chừng — chỉ là chưa kịp đánh dấu đọc, tự sửa ở
  // lần GET tiếp theo).
  supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", counterpartyId)
    .eq("recipient_id", userId)
    .is("read_at", null)
    .then(({ error: markReadError }) => {
      if (markReadError) console.error("[messages] mark read failed:", markReadError);
    });

  return NextResponse.json({
    counterparty: {
      userId: counterparty.id,
      nickname: counterparty.nickname,
      username: counterparty.username,
      avatarUrl: counterparty.avatar_url,
    },
    messages: (rows ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      mine: m.sender_id === userId,
    })),
  });
}

/**
 * POST /api/messages/:userId — gửi 1 tin nhắn tới :userId.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: recipientId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (userId === recipientId) {
    return NextResponse.json({ error: "Không thể tự nhắn tin cho chính mình." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Tin nhắn không được để trống." }, { status: 400 });
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json({ error: `Tin nhắn tối đa ${BODY_MAX} ký tự.` }, { status: 400 });
  }

  const { data: recipient } = await supabase
    .from("author_public_profiles")
    .select("id")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) {
    return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  }

  const { data: message, error } = await supabase
    .from("direct_messages")
    .insert({ sender_id: userId, recipient_id: recipientId, body: text })
    .select("id, created_at")
    .single();
  if (error || !message) {
    console.error("[messages] send failed:", error);
    return NextResponse.json({ error: "Gửi tin nhắn thất bại." }, { status: 500 });
  }

  return NextResponse.json({
    message: { id: message.id, body: text, createdAt: message.created_at, mine: true },
  });
}
