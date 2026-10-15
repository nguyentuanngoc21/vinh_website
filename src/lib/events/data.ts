import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityEventRow, Database } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import type { VinhEvent } from "./catalog";

export const TRAVEL_MODES = [
  { mode: "driving", label: "Ô tô / xe máy" }, { mode: "transit", label: "Phương tiện công cộng" },
  { mode: "bicycling", label: "Xe đạp" }, { mode: "walking", label: "Đi bộ" },
] as const;

export async function toEvents(client: SupabaseClient<Database>, rows: CommunityEventRow[]): Promise<VinhEvent[]> {
  if (!rows.length) return [];
  const { data: profiles, error } = await client.from("author_public_profiles").select("id, username, nickname, avatar_url, bio").in("id", [...new Set(rows.map((row) => row.organizer_id))]);
  if (error) throw new Error("Không thể tải thông tin người tổ chức.");
  return rows.map((row) => {
    const profile = profiles?.find((person) => person.id === row.organizer_id);
    return {
      slug: row.id, organizerId: row.organizer_id, hidden: row.hidden,
      title: row.title, summary: row.summary, startsAt: row.starts_at, endsAt: row.ends_at,
      venue: row.venue, address: row.address, city: row.city, category: row.category,
      googleMapsUrl: row.google_maps_url ?? undefined,
      priceVnd: row.price_vnd, ticketUrl: row.ticket_url ?? undefined, accent: "sea",
      bannerUrl: row.banner_path ? client.storage.from("event-banners").getPublicUrl(row.banner_path).data.publicUrl : undefined,
      organizer: { name: profile?.nickname || profile?.username || "Người tổ chức", description: profile?.bio || "",
        avatarUrl: profile?.avatar_url ?? undefined },
      overview: [{ heading: "Thông tin tổng quan", paragraphs: row.overview.split(/\n\s*\n/).filter(Boolean) }],
      travel: TRAVEL_MODES.map((item) => ({ ...item, note: row.travel_notes[item.mode] || "Xem tuyến đường phù hợp trên Google Maps." })),
      games: row.games, published: row.status === "published",
    };
  });
}
export async function getEvents(): Promise<VinhEvent[]> {
  const client = await createClient();
  const { data, error } = await client.from("community_events").select("*").eq("status", "published").eq("hidden", false).order("starts_at").limit(200);
  if (error) { console.error("[events] list", error); throw new Error("Không thể tải danh sách sự kiện. Vui lòng thử lại sau."); }
  return toEvents(client, data ?? []);
}
export async function getPublicEvent(id: string): Promise<VinhEvent | null> {
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id)) return null;
  const client = await createClient();
  const { data, error } = await client.from("community_events").select("*").eq("id", id).eq("status", "published").eq("hidden", false).maybeSingle();
  if (error) throw new Error("Không thể tải sự kiện.");
  return data ? (await toEvents(client, [data]))[0] : null;
}
