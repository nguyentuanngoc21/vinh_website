import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { LedgerService } from "@/lib/wallet/ledger-service";
import { HOLD_PERIOD_DAYS, DEFAULT_AUTHOR_SHARE_RATE } from "@/lib/wallet/config";

/**
 * POST /api/chapters/:chapterId/purchase — mua 1 chương VIP (chapters.price
 * > 0) bằng token, mở khoá đọc vĩnh viễn cho buyer. Trước route này,
 * `create_purchase()` (docs/supabase/schema.sql phần 6e) tồn tại sẵn ở DB
 * nhưng KHÔNG route/component nào trong app từng gọi tới — chapters.price
 * chỉ là giá niêm yết tác giả tự set, không hề được enforce lúc đọc (xem
 * src/app/read/[bookSlug]/[chapterId]/page.tsx trước bản vá này). Route
 * này + rào ở page.tsx (accessGate="purchase") đóng lỗ hổng đó lại.
 *
 * Dùng service-role + getAuthedUserId() (giống vote/route.ts, penalty/route.ts)
 * thay vì auth.uid()/RLS — LedgerService yêu cầu service-role client (xem
 * comment ở ledger-service.ts: "there is deliberately no RLS insert policy
 * on `transactions`").
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = createServiceRoleClient();
  const buyerId = await getAuthedUserId(supabase);
  if (!buyerId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để mua chương này." }, { status: 401 });
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, price, published, book_id")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter || !chapter.published) {
    return NextResponse.json({ error: "Không tìm thấy chương." }, { status: 404 });
  }
  if (chapter.price <= 0) {
    // Chương free — không có gì để mua, tránh gọi create_purchase với
    // amount=0 (RPC apply_transaction từ chối amount<=0 ở nhánh pending,
    // và chẳng có ý nghĩa gì ở nhánh completed).
    return NextResponse.json({ error: "Chương này miễn phí, không cần mua." }, { status: 400 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, author_id, published")
    .eq("id", chapter.book_id)
    .maybeSingle();
  if (!book || !book.published) {
    return NextResponse.json({ error: "Không tìm thấy sách." }, { status: 404 });
  }
  if (book.author_id === buyerId) {
    return NextResponse.json({ error: "Bạn không thể mua chương của chính mình." }, { status: 400 });
  }

  // Idempotency check trước (UX: trả lời nhanh, không tốn 1 lượt gọi RPC
  // cho trường hợp phổ biến "bấm mua lại chương đã mua"). Đây KHÔNG phải
  // chốt chặn race duy nhất — 2 request gần như đồng thời vẫn có thể cùng
  // lọt qua bước này; chốt thật là unique index
  // purchase_transactions_buyer_chapter_key (migrations/20260909_add_purchase_transactions_unique_buyer_chapter.sql),
  // bắt ở catch bên dưới qua mã lỗi 23505.
  const { data: existing } = await supabase
    .from("purchase_transactions")
    .select("id")
    .eq("chapter_id", chapter.id)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ purchased: true, alreadyOwned: true });
  }

  const amount = chapter.price;
  const authorShare = Math.round(amount * DEFAULT_AUTHOR_SHARE_RATE);
  const platformShare = amount - authorShare;

  try {
    await LedgerService.createPurchase(supabase, {
      buyerId,
      authorId: book.author_id,
      chapterId: chapter.id,
      amount,
      authorShare,
      platformShare,
      holdDays: HOLD_PERIOD_DAYS,
    });
  } catch (error) {
    // Postgres error object mang `code` (vd "23505") — không phải Error
    // thuần, xem qua unknown trước khi đọc field.
    const code = (error as { code?: string } | null)?.code;
    const message = error instanceof Error ? error.message : String(error);
    if (code === "23505") {
      // Race 2 request gần như đồng thời, cả 2 đều qua được bước "existing"
      // ở trên — request thua chỉ cần coi như đã mua, KHÔNG báo lỗi.
      return NextResponse.json({ purchased: true, alreadyOwned: true });
    }
    if (message.includes("Insufficient balance")) {
      return NextResponse.json({ error: "Số dư token không đủ để mua chương này." }, { status: 402 });
    }
    console.error("[chapters/purchase] create_purchase failed:", error);
    return NextResponse.json({ error: "Không thể mua chương. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ purchased: true, alreadyOwned: false });
}
