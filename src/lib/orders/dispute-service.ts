import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OrderStatus } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/** Báo cáo vi phạm/Tranh chấp (Module 9 đặc tả) — xem
 * migrations/20260901_add_trust_and_disputes.sql. */
export const DisputeService = {
  async open(supabase: Client, params: { orderId: string; reporterId: string; reasonCategory: string; description: string }) {
    const { data, error } = await supabase.rpc("open_dispute", {
      p_order_id: params.orderId,
      p_reporter_id: params.reporterId,
      p_reason_category: params.reasonCategory,
      p_description: params.description,
    });
    if (error) throw error;
    return data;
  },

  /** Admin-only — role re-validated INSIDE the SQL function (service-role
   * bypasses RLS entirely, same reasoning as grant_platform_bonus). */
  async resolve(
    supabase: Client,
    params: {
      disputeId: string;
      adminId: string;
      resolutionNote: string;
      atFaultUserId?: string | null;
      resumeStatus?: OrderStatus;
      refundAmount?: number;
    }
  ) {
    const { data, error } = await supabase.rpc("resolve_dispute", {
      p_dispute_id: params.disputeId,
      p_admin_id: params.adminId,
      p_resolution_note: params.resolutionNote,
      p_at_fault_user_id: params.atFaultUserId ?? null,
      p_resume_status: params.resumeStatus ?? "cancelled",
      p_refund_amount: params.refundAmount ?? 0,
    });
    if (error) throw error;
    return data;
  },
};
