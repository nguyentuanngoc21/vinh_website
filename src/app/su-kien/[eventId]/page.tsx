import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EventDetail } from "@/components/events/event-detail";
import { getPublicEvent } from "@/lib/events/data";
import { cache } from "react";
const getEvent = cache(getPublicEvent);
export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const event = await getEvent((await params).eventId);
  return { title: event ? `${event.title} — Vịnh` : "Không tìm thấy sự kiện — Vịnh", description: event?.summary };
}
export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const event = await getEvent((await params).eventId);
  if (!event) notFound();
  return <div className="flex-1 bg-surface-muted"><div className="mx-auto max-w-[1280px] bg-surface"><SiteHeader sticky={false} showSearch={false} /><EventDetail event={event} /><SiteFooter /></div></div>;
}
