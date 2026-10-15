import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { EventForm } from "@/components/events/event-form";
import { getOwnedEvent } from "@/lib/events/owner";
export const metadata = { title: "Chỉnh sửa sự kiện — Vịnh", robots: { index: false, follow: false } };
export default async function EditEventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { client, event } = await getOwnedEvent((await params).eventId);
  const banner = event.banner_path ? client.storage.from("event-banners").getPublicUrl(event.banner_path).data.publicUrl : null;
  return <div className="flex-1 bg-surface-muted"><SiteHeader showSearch={false} /><main className="mx-auto max-w-3xl px-5 py-10"><Link href="/su-kien/quan-ly" className="text-sm text-stone">← Sự kiện của tôi</Link><div className="mb-8 mt-5 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold text-brand-ink">Chỉnh sửa sự kiện</h1><Link href={`/su-kien/quan-ly/${event.id}/xem-truoc`} className="text-sm font-semibold text-brand-gold-dark">Xem trước ↗</Link></div>{(await searchParams).saved && <p role="status" className="mb-6 rounded-xl bg-cream-gold p-4 text-sm text-brand-ink">Đã lưu bản nháp.</p>}{event.hidden && <p role="alert" className="mb-6 rounded-xl border border-error p-4 text-sm text-error">Sự kiện đã bị quản trị viên ẩn. Hiện bạn chưa thể chỉnh sửa hoặc xuất bản lại.</p>}<EventForm key={event.id} initial={event} initialBannerUrl={banner} /></main></div>;
}
