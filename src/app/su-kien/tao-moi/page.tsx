import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { EventForm } from "@/components/events/event-form";
import { getAuthedUserId } from "@/lib/wallet/session";
export const metadata = { title: "Tạo sự kiện — Vịnh", robots: { index: false, follow: false } };
export default async function CreateEventPage() {
  if (!await getAuthedUserId()) redirect("/dang-nhap?next=/su-kien/tao-moi");
  return <div className="flex-1 bg-surface-muted"><SiteHeader showSearch={false} /><main className="mx-auto max-w-3xl px-5 py-10"><Link href="/su-kien/quan-ly" className="text-sm text-stone">← Sự kiện của tôi</Link><h1 className="mb-3 mt-5 text-3xl font-bold text-brand-ink">Tạo một cuộc hẹn mới</h1><p className="mb-8 text-sm leading-relaxed text-stone">Mang câu chuyện của bạn đến gần hơn với cộng đồng.</p><EventForm /></main></div>;
}
