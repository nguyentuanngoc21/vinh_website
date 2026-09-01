import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { DisputeTable, type DisputeRow } from "@/components/admin/dispute-table";

export const metadata: Metadata = { title: "Tranh chấp · Vịnh Admin" };

/**
 * Hàng đợi tranh chấp đang mở (Mục 9 đặc tả) — requireAdmin() đã chạy ở
 * src/app/admin/layout.tsx (cha), cùng pattern admin/noi-dung/page.tsx.
 * Service-role vì cần đọc tranh chấp của MỌI order, không chỉ của admin.
 */
export default async function AdminDisputesPage() {
  const supabase = createServiceRoleClient();

  // 2 query riêng + join tay bằng JS thay vì embed orders(...) — hand-written
  // types.ts không khai báo Relationships cho disputes (mảng rỗng), embed
  // qua PostgREST vẫn chạy đúng lúc runtime nhưng type-check gãy (xem
  // ghi chú Relationships: [] ở src/lib/supabase/types.ts), cùng cách
  // ket-noi/page.tsx đã tránh embed cho mọi bảng hand-written ở đây.
  const { data: disputeRows } = await supabase
    .from("disputes")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  const orderIds = Array.from(new Set((disputeRows ?? []).map((d) => d.order_id)));
  const { data: orderRows } = orderIds.length
    ? await supabase.from("orders").select("id, code, buyer_id, seller_id").in("id", orderIds)
    : { data: [] as { id: string; code: string; buyer_id: string; seller_id: string }[] };
  const orderById = new Map((orderRows ?? []).map((o) => [o.id, o]));

  const userIds = Array.from(
    new Set(
      (disputeRows ?? []).flatMap((d) => {
        const o = orderById.get(d.order_id);
        return [d.reporter_id, o?.buyer_id, o?.seller_id].filter(Boolean) as string[];
      })
    )
  );
  const { data: profileRows } = userIds.length
    ? await supabase.from("profiles").select("id, nickname, username").in("id", userIds)
    : { data: [] as { id: string; nickname: string; username: string }[] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const rows: DisputeRow[] = (disputeRows ?? []).map((d) => {
    const o = orderById.get(d.order_id);
    return {
      id: d.id,
      orderId: d.order_id,
      orderCode: o?.code ?? "—",
      buyerId: o?.buyer_id ?? "",
      sellerId: o?.seller_id ?? "",
      buyerLabel: o?.buyer_id ? (profileById.get(o.buyer_id)?.nickname ?? "—") : "—",
      sellerLabel: o?.seller_id ? (profileById.get(o.seller_id)?.nickname ?? "—") : "—",
      reporterLabel: profileById.get(d.reporter_id)?.nickname ?? "—",
      reasonCategory: d.reason_category,
      description: d.description,
      createdAt: d.created_at,
    };
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold text-brand-ink">Tranh chấp</h1>
        <p className="mt-0.5 text-sm text-stone-alt">
          Đơn đang bị mở tranh chấp — mọi hành động khác trên đơn đã tạm khóa cho tới khi xử lý xong.
        </p>
      </div>
      <DisputeTable rows={rows} />
    </>
  );
}
