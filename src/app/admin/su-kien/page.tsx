import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { redirect } from "next/navigation";
import { eventDate } from "@/lib/events/catalog";
import { AdminEventControls } from "@/components/events/admin-event-controls";
export const metadata = { title: "Quản lý sự kiện · Vịnh Admin" };
export default async function AdminEventsPage() {
  const client = createServiceRoleClient();
  if (!await getAuthedAdminId(client)) redirect("/dang-nhap");
  const { data, error } = await client.from("community_events").select("id, title, organizer_id, status, hidden, starts_at, games").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error("Không tải được danh sách sự kiện.");
  return <><div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold text-brand-ink">Sự kiện cộng đồng</h1><p className="mt-2 text-sm text-stone">Quản lý hiển thị và trò chơi. Sự kiện tiêu biểu được chọn trong code.</p></div><Link href="/su-kien/tao-moi" className="rounded-full bg-brand-gold px-5 py-3 text-sm font-bold text-brand-navy">Tạo sự kiện</Link></div><div className="space-y-5">{data?.length ? data.map((event) => <section key={event.id} className="rounded-2xl border border-line bg-surface p-6"><p className="text-xs font-semibold text-brand-gold-dark">{event.hidden ? "Đã ẩn bởi quản trị viên" : event.status === "published" ? "Công khai" : "Bản nháp"}</p><Link href={`/admin/su-kien/${event.id}`} className="mt-2 block text-xl font-bold text-brand-ink">{event.title}</Link><p className="mt-2 text-sm text-stone">{eventDate(event.starts_at)}</p><p className="mt-2 break-all text-xs text-stone">ID: {event.id}</p><AdminEventControls id={event.id} hidden={event.hidden} gameIds={event.games.map((game) => game.id)} /></section>) : <p className="rounded-2xl border border-line bg-surface p-8 text-stone">Chưa có sự kiện nào được tạo.</p>}</div></>;
}
