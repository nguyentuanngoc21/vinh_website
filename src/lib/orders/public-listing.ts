import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ServiceType } from "@/lib/supabase/types";
import { computeCommissionStatus, fetchAutoSamples, getActiveCommissionCount } from "@/lib/orders/service-listing-service";

type Client = SupabaseClient<Database>;

export type ListingSample = {
  id: string; kind: "image" | "audio" | "book" | "link"; title: string | null; url: string | null;
  source: "upload" | "auto" | "external"; unverified: boolean;
};

/** Who may see a listing (and its samples): the seller always; anyone else only while it
 * accepts orders. `is_private` hides it from Kết nối but keeps it orderable by direct link
 * (services-tab.tsx: "vẫn nhận đơn qua link trực tiếp"), so it does not block viewing here. */
export function canViewListing(listing: { seller_id: string; is_accepting_orders: boolean }, viewerId: string | null) {
  return listing.seller_id === viewerId || listing.is_accepting_orders;
}

/** Uploaded samples first; when the seller uploaded none, the auto samples of Bộ quy tắc
 * Commission Điều 2 mục 1 (see fetchAutoSamples). Sample buckets are public, so public URLs. */
export async function listingSamples(
  supabase: Client,
  listing: { id: string; seller_id: string; service_type: ServiceType }
): Promise<ListingSample[]> {
  const { data } = await supabase.from("service_samples").select("id, source, file_url, unverified_external")
    .eq("listing_id", listing.id).order("created_at", { ascending: false });
  const bucket = listing.service_type === "voice" ? "audio-narrations" : "design-images";
  const uploaded: ListingSample[] = (data ?? []).map((s) => {
    const external = s.source === "external";
    const url = /^https?:\/\//.test(s.file_url) ? s.file_url : supabase.storage.from(bucket).getPublicUrl(s.file_url).data.publicUrl;
    return {
      id: s.id, kind: external ? "link" : listing.service_type === "voice" ? "audio" : "image",
      title: null, url, source: s.source as ListingSample["source"], unverified: external || s.unverified_external,
    };
  });
  if (uploaded.length) return uploaded;
  const auto = await fetchAutoSamples(supabase, { sellerId: listing.seller_id, serviceType: listing.service_type });
  return auto.map((a) => ({ id: a.ref, kind: a.kind, title: a.title, url: a.url, source: "auto", unverified: false }));
}

/** Everything a buyer needs before "Đặt dịch vụ": every price tier and the terms that will be
 * snapshotted into the order (POST /api/orders tos_snapshot), plus seller and samples. */
export async function getListingForViewer(supabase: Client, listingId: string, viewerId: string | null) {
  const { data: listing } = await supabase.from("service_listings")
    .select("id, seller_id, service_type, name, scope_description, price_tiers, deposit_pct, delivery_days, revisions_max, refund_policy, accepted_content, rejected_content, default_usage_scope, lost_contact_days, is_private, is_accepting_orders, is_accepting_commissions, monthly_commission_limit")
    .eq("id", listingId).maybeSingle();
  if (!listing || !canViewListing(listing, viewerId)) return null;
  const [{ data: seller }, activeCount, samples] = await Promise.all([
    supabase.from("author_public_profiles").select("id, nickname, username, avatar_url").eq("id", listing.seller_id).maybeSingle(),
    getActiveCommissionCount(supabase, listing.id),
    listingSamples(supabase, listing),
  ]);
  const tiers = (Array.isArray(listing.price_tiers) ? listing.price_tiers : [])
    .map((t, index) => ({ index, label: String((t as { label?: unknown })?.label ?? ""), price: Number((t as { price?: unknown })?.price) }))
    .filter((t) => Number.isFinite(t.price) && t.price > 0);
  return {
    id: listing.id, serviceType: listing.service_type, name: listing.name, scopeDescription: listing.scope_description,
    // `index` is the position in price_tiers — what POST /api/orders expects as priceTierIndex.
    priceTiers: tiers, depositPct: listing.deposit_pct, deliveryDays: listing.delivery_days, revisionsMax: listing.revisions_max,
    refundPolicy: listing.refund_policy, acceptedContent: listing.accepted_content, rejectedContent: listing.rejected_content,
    defaultUsageScope: listing.default_usage_scope, lostContactDays: listing.lost_contact_days,
    isAcceptingOrders: listing.is_accepting_orders,
    commissionStatus: computeCommissionStatus(listing.is_accepting_commissions, listing.monthly_commission_limit, activeCount),
    activeCommissionCount: activeCount, monthlyCommissionLimit: listing.monthly_commission_limit,
    isOwn: listing.seller_id === viewerId,
    seller: { id: listing.seller_id, nickname: seller?.nickname ?? null, username: seller?.username ?? null, avatarUrl: seller?.avatar_url ?? null },
    samples,
  };
}
