import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRightIcon, CalendarBlankIcon, MapPinIcon, TicketIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EventBanner } from "@/components/events/event-banner";
import { eventDate, eventPrice, eventTime, getFeaturedEvent } from "@/lib/events/catalog";
import { getEvents } from "@/lib/events/data";

export const metadata: Metadata = { title: "Sự kiện — Vịnh", description: "Gặp gỡ, trải nghiệm và cùng kể những câu chuyện mới tại Vịnh." };

export default async function EventsPage() {
  const events = await getEvents();
  const featured = getFeaturedEvent(events);
  return (
    <div className="flex-1 bg-surface-muted">
      <div className="mx-auto max-w-[1280px] bg-surface">
        <SiteHeader showSearch={false} />
        <main className="px-4 pb-20 pt-7 sm:px-8 lg:px-11">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[.22em] text-brand-gold-dark">Những cuộc hẹn ở Vịnh</p><h1 className="mb-0 mt-2 text-3xl font-extrabold tracking-tight text-brand-ink sm:text-4xl">Sự kiện</h1></div>
            <Link href="/su-kien/quan-ly" className="rounded-full bg-brand-gold px-5 py-3 text-sm font-bold text-brand-navy no-underline">Tạo / quản lý sự kiện</Link>
          </div>
          {featured ? (
            <Link href={`/su-kien/${featured.slug}`} className="group block overflow-hidden rounded-[24px] border border-line text-inherit no-underline transition-shadow hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-gold">
              <EventBanner event={featured} />
              <div className="flex items-center justify-between gap-6 p-6 sm:px-9 sm:py-7">
                <div><p className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-brand-gold-dark">Sự kiện tiêu biểu</p><h2 className="text-xl font-bold text-brand-ink sm:text-2xl">{featured.title}</h2><p className="mb-0 mt-2 max-w-2xl text-sm leading-relaxed text-stone">{featured.summary}</p></div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-ink text-white transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"><ArrowUpRightIcon size={22} /></span>
              </div>
            </Link>
          ) : <div className="rounded-[24px] bg-brand-ink px-7 py-14 text-white sm:px-12"><p className="text-xs uppercase tracking-[.24em] text-brand-gold-light">Cộng đồng Vịnh</p><p className="mt-5 max-w-xl font-serif text-4xl leading-tight">Những câu chuyện hay<br />bắt đầu từ một cuộc gặp.</p><p className="mb-0 mt-5 text-sm text-white/70">Các sự kiện mới sẽ được cập nhật tại đây.</p></div>}
          <section className="mt-12" aria-labelledby="events-heading">
            <div className="mb-6 flex items-center justify-between"><h2 id="events-heading" className="text-2xl font-bold text-brand-ink">Khám phá sự kiện</h2><span className="text-sm text-stone">{events.length} sự kiện</span></div>
            {events.length ? <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">{events.map((event) => <Link key={event.slug} href={`/su-kien/${event.slug}`} className="group overflow-hidden rounded-[20px] border border-line bg-surface text-inherit no-underline transition-all hover:-translate-y-1 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-brand-gold">
              <EventBanner event={event} compact />
              <div className="p-5"><p className="text-[11px] font-bold uppercase tracking-wider text-brand-gold-dark">{event.category}</p><h3 className="mb-4 mt-2 text-lg font-bold leading-snug text-brand-ink group-hover:text-brand-gold-dark">{event.title}</h3><div className="space-y-3 text-sm"><p className="flex items-start gap-2"><CalendarBlankIcon size={18} className="mt-0.5 shrink-0 text-brand-gold-dark" /><span>{eventDate(event.startsAt)}<br /><span className="text-stone">{eventTime(event.startsAt)} · Giờ Việt Nam</span></span></p><p className="flex items-start gap-2 text-stone"><MapPinIcon size={18} className="shrink-0" /><span>{event.venue} · {event.city}</span></p><p className="flex items-center gap-2 border-t border-line pt-4 font-semibold text-brand-ink"><TicketIcon size={18} />{eventPrice(event)}</p></div></div>
            </Link>)}</div> : <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center"><CalendarBlankIcon size={32} className="mx-auto text-brand-gold-dark" /><h3 className="mt-4 font-semibold text-brand-ink">Chưa có sự kiện được công bố</h3><p className="mb-0 mt-2 text-sm text-stone">Hẹn bạn ở những hoạt động tiếp theo của Vịnh.</p></div>}
          </section>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
