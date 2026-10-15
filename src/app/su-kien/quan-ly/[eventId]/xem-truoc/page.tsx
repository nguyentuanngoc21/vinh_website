import { SiteHeader } from "@/components/site-header";
import { EventDetail } from "@/components/events/event-detail";
import { getOwnedEvent } from "@/lib/events/owner";
import { toEvents } from "@/lib/events/data";
export const metadata = { title: "Xem trước sự kiện — Vịnh", robots: { index: false, follow: false } };
export default async function PreviewEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { client, event } = await getOwnedEvent((await params).eventId);
  const view = (await toEvents(client, [event]))[0];
  return <div className="flex-1 bg-surface-muted"><div className="mx-auto max-w-[1280px] bg-surface"><SiteHeader sticky={false} showSearch={false} /><EventDetail event={view} preview /></div></div>;
}
