import "server-only";
import { notFound, redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { UUID } from "./input";
export async function getOwnedEvent(id: string) {
  if (!UUID.test(id)) notFound();
  const client = createServiceRoleClient();
  const userId = await getAuthedUserId(client);
  if (!userId) redirect(`/dang-nhap?next=${encodeURIComponent(`/su-kien/quan-ly/${id}`)}`);
  const { data, error } = await client.from("community_events").select("*").eq("id", id).eq("organizer_id", userId).maybeSingle();
  if (error) throw new Error("Không tải được sự kiện.");
  if (!data) notFound();
  return { client, event: data };
}
