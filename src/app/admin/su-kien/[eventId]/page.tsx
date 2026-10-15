import { notFound, redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { toEvents } from "@/lib/events/data";
import { UUID } from "@/lib/events/input";
import { EventDetail } from "@/components/events/event-detail";
import { AdminEventControls } from "@/components/events/admin-event-controls";
export default async function AdminEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const client = createServiceRoleClient();
  if (!await getAuthedAdminId(client)) redirect("/dang-nhap");
  const { eventId } = await params;
  if (!UUID.test(eventId)) notFound();
  const { data, error } = await client.from("community_events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw new Error("Không tải được sự kiện.");
  if (!data) notFound();
  const view = (await toEvents(client, [data]))[0];
  return <><AdminEventControls id={data.id} hidden={data.hidden} gameIds={data.games.map((game) => game.id)} /><EventDetail event={view} preview /></>;
}
