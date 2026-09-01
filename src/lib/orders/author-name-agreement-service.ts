import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/** Đứng tên tác giả thay (Module 5 đặc tả) — xem
 * migrations/20260901_add_ghostwriting_authorship.sql cho toàn bộ logic
 * (statement text sinh ở SQL, không phải ở đây — server DB là nguồn sự
 * thật duy nhất cho câu chữ đã hiển thị lúc xác nhận). */
export const AuthorNameAgreementService = {
  async initiate(
    supabase: Client,
    params: {
      orderId: string;
      actorId: string;
      choice: "customer_name" | "co_authorship";
      ghostwriterSampleVisible: boolean;
      customerProfileVisible: boolean;
    }
  ) {
    const { data, error } = await supabase.rpc("initiate_author_name_agreement", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_choice: params.choice,
      p_ghostwriter_sample_visible: params.ghostwriterSampleVisible,
      p_customer_profile_visible: params.customerProfileVisible,
    });
    if (error) throw error;
    return data;
  },

  async confirm(supabase: Client, params: { agreementId: string; actorId: string }) {
    const { data, error } = await supabase.rpc("confirm_author_name_agreement", {
      p_agreement_id: params.agreementId,
      p_actor_id: params.actorId,
    });
    if (error) throw error;
    return data;
  },
};
