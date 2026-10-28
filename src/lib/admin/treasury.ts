import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TreasurySnapshotRow, TreasuryBankEntryRow } from "@/lib/supabase/types";

export type TreasuryEntry = TreasuryBankEntryRow & {
  linked_type: "deposit" | "withdrawal" | null; linked_id: string | null;
  expected_vnd: number | null; internal_status: string | null;
  reconciliation_status: "unlinked" | "duplicate_reference" | "missing_reference" | "direction_mismatch" | "amount_mismatch" | "internal_pending" | "matched";
};
export type TreasuryReport = {
  asOf: string; snapshot: TreasurySnapshotRow | null; history: TreasurySnapshotRow[];
  entryCount: number; matchedCount: number; unresolvedCount: number; importedFeesVnd: number;
  entries: TreasuryEntry[];
  unseenCount: number;
  unseen: { reference_type: "deposit" | "withdrawal"; reference_id: string; amount_vnd: number; processed_at: string | null }[];
};
export function reservePosition(balance: number | null, liability: number, feeBuffer: number) {
  if (balance === null) return null;
  const required = liability + feeBuffer;
  return { required, shortfall: Math.max(0, required - balance), surplus: Math.max(0, balance - required),
    coverage: required === 0 ? null : balance / required * 100 };
}
export async function getTreasuryReport(client: SupabaseClient<Database>, page: number) {
  const { data, error } = await client.rpc("admin_treasury_report", { p_page: page });
  if (error || !data) throw new Error("Không tải được dữ liệu ngân quỹ.");
  return data as TreasuryReport;
}
