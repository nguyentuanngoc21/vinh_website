import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { tokensToVnd } from "@/lib/wallet/config";

export type WalletExposure = {
  asOf: string;
  available: number;
  pending: number;
  processing: number;
  processingVnd: number;
  userCount: number;
  users: {
    id: string;
    username: string;
    nickname: string;
    available: number;
    pending: number;
    processing: number;
    processing_vnd: number;
  }[];
};

export function exposureTotals(stats: Pick<WalletExposure, "available" | "pending" | "processing" | "processingVnd">) {
  return {
    tokens: stats.available + stats.pending + stats.processing,
    // In-flight requests retain their booked VND rate, even if config changes.
    vnd: tokensToVnd(stats.available + stats.pending) + stats.processingVnd,
    availableAndProcessingVnd: tokensToVnd(stats.available) + stats.processingVnd,
  };
}

export async function getWalletExposure(supabase: SupabaseClient<Database>, search: string, page: number) {
  const { data, error } = await supabase.rpc("admin_wallet_exposure", {
    p_search: search, p_page: page, p_page_size: 25,
  });
  if (error || !data) throw new Error("Không tải được số dư và nghĩa vụ chi trả.");
  return data as unknown as WalletExposure;
}
