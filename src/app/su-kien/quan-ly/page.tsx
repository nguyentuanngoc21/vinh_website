import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { eventDate } from "@/lib/events/catalog";
export const metadata = { title: "Sự kiện của tôi — Vịnh", robots: { index: false, follow: false } };
export default async function MyEventsPage() {
  const client = createServiceRoleClient();
  const userId = await getAuthedUserId(client);
  if (!userId) redirect("/dang-nhap?next=/su-kien/quan-ly");
  const { data, error } = await client.from("community_events").select("id, title, status, hidden, starts_at").eq("organizer_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error("Không tải được sự kiện của bạn.");
  return <div className="flex-1 bg-surface-muted"><div className="mx-auto max-w-[1280px]"><SiteHeader showSearch={false} /><main className="mx-auto max-w-4xl px-5 py-10"><Link href="/su-kien" className="text-sm text-stone">← Khám phá sự kiện</Link><div className="mb-8 mt-5 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold text-brand-ink">Sự kiện của tôi</h1><Link href="/su-kien/tao-moi" className="rounded-full bg-brand-gold px-5 py-3 text-sm font-bold text-brand-navy no-underline">+ Tạo sự kiện</Link></div>{data?.length ? <div className="space-y-4">{data.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5"><div><p className="text-xs font-semibold text-brand-gold-dark">{event.hidden ? "Đã bị quản trị viên ẩn" : event.status === "published" ? "Đã công khai" : "Bản nháp"}</p><h2 className="mt-1 text-lg font-bold text-brand-ink">{event.title}</h2><p className="mt-2 text-sm text-stone">{eventDate(event.starts_at)}</p></div><div className="flex gap-4 text-sm font-semibold"><Link href={`/su-kien/quan-ly/${event.id}/xem-truoc`} className="text-brand-ink">Xem trước</Link><Link href={`/su-kien/quan-ly/${event.id}`} className="text-brand-gold-dark">Quản lý</Link></div></div>)}</div> : <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center"><p className="font-semibold text-brand-ink">Bạn chưa tạo sự kiện nào.</p><p className="mt-2 text-sm text-stone">Bắt đầu một cuộc hẹn với cộng đồng Vịnh.</p></div>}</main></div></div>;
}
