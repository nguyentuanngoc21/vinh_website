import Image from "next/image";
import Link from "next/link";
import { CalendarBlankIcon, MapPinIcon, ArrowUpRightIcon, CarIcon, BusIcon, BicycleIcon, PersonSimpleWalkIcon } from "@phosphor-icons/react/dist/ssr";
import { eventDate, eventTime, mapUrl, type VinhEvent } from "@/lib/events/catalog";
import { EventBanner } from "./event-banner";
import { EventSidebar } from "./event-sidebar";
const TRAVEL_ICONS = { driving: CarIcon, transit: BusIcon, bicycling: BicycleIcon, walking: PersonSimpleWalkIcon };
export function EventDetail({ event, preview = false }: { event: VinhEvent; preview?: boolean }) {
  const map = mapUrl(event);
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 lg:px-11">
      <Link href="/su-kien" className="mb-5 inline-block text-sm text-stone no-underline hover:text-brand-ink">← Tất cả sự kiện</Link>
      {preview && <p role="status" className="mb-5 rounded-xl border border-brand-gold bg-cream-gold p-4 text-sm text-brand-ink">Bản xem trước của bạn · {event.hidden ? "Sự kiện đang bị quản trị viên ẩn." : "Chưa công khai với cộng đồng."}</p>}
      <div className="overflow-hidden rounded-[24px]"><EventBanner event={event} /></div>
      <div className="mt-9 grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-12">
        <article className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-gold-dark">{event.category}</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-brand-ink sm:text-[40px]">{event.title}</h1>
          <p className="mt-4 text-base leading-relaxed text-stone">{event.summary}</p>
          <div className="my-7 flex items-center gap-4 rounded-2xl bg-surface-muted p-4">
            {event.organizer.avatarUrl ? <Image src={event.organizer.avatarUrl} unoptimized width={52} height={52} alt={`Ảnh đại diện ${event.organizer.name}`} className="h-13 w-13 shrink-0 rounded-full object-cover" /> : <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-brand-ink text-xl font-bold text-brand-gold-light">{event.organizer.name.charAt(0)}</span>}
            <div><p className="text-xs text-stone">Được tổ chức bởi</p><p className="mt-1 font-bold text-brand-ink">{event.organizer.name}</p>{event.organizer.description && <p className="mt-1 text-xs leading-relaxed text-stone">{event.organizer.description}</p>}</div>
          </div>
          <div className="space-y-4 border-b border-line pb-8 text-sm"><p className="flex items-start gap-3"><MapPinIcon size={22} className="shrink-0 text-brand-gold-dark" /><span><strong className="block text-brand-ink">{event.venue}</strong><span className="mt-1 block text-stone">{event.address} · {event.city}</span></span></p><p className="flex items-start gap-3"><CalendarBlankIcon size={22} className="shrink-0 text-brand-gold-dark" /><span><strong className="block text-brand-ink">{eventDate(event.startsAt)}</strong><span className="mt-1 block text-stone">{eventTime(event.startsAt)} – {eventDate(event.endsAt) === eventDate(event.startsAt) ? eventTime(event.endsAt) : `${eventTime(event.endsAt)}, ${eventDate(event.endsAt)}`} · Giờ Việt Nam (GMT+7)</span></span></p></div>
          {event.overview.map((section) => <section key={section.heading} className="border-b border-line py-9"><h2 className="mb-5 text-2xl font-bold text-brand-ink">{section.heading}</h2><div className="space-y-5 text-[15px] leading-[1.9] text-ink">{section.paragraphs.map((paragraph, index) => <p className="whitespace-pre-wrap break-words" key={index}>{paragraph}</p>)}</div></section>)}
          <section className="pt-9" aria-labelledby="event-location"><h2 id="event-location" className="mb-5 text-2xl font-bold text-brand-ink">Địa điểm & đường đi</h2><div className="grid gap-6 sm:grid-cols-2"><div><h3 className="font-bold text-brand-ink">{event.venue}</h3><p className="mb-6 mt-2 text-sm leading-relaxed text-stone">{event.address}<br />{event.city}</p><h3 className="mb-4 border-t border-line pt-5 text-sm font-semibold">Bạn muốn đến bằng cách nào?</h3><div className="space-y-4">{event.travel.map((travel) => { const Icon = TRAVEL_ICONS[travel.mode]; const url = mapUrl(event, travel.mode); return <div key={travel.mode}>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-brand-ink no-underline hover:text-brand-gold-dark"><Icon size={20} />{travel.label}<ArrowUpRightIcon size={13} /></a> : <p className="text-sm font-semibold">{travel.label}</p>}<p className="mb-0 ml-7 mt-1 text-xs leading-relaxed text-stone">{travel.note}</p></div>; })}</div></div>
            {map && <a href={map} target="_blank" rel="noopener noreferrer" aria-label={`Mở vị trí ${event.venue} trên Google Maps`} className="group relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl bg-[#e6ece4] no-underline"><svg aria-hidden="true" viewBox="0 0 300 400" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice"><path d="M-40 100L340 260M50-30L250 430M-20 340L350 80" fill="none" stroke="#fff" strokeWidth="25" /><path d="M210-20Q100 160 200 230T100 440" fill="none" stroke="#b0d1dc" strokeWidth="35" /><path d="M-40 100L340 260" fill="none" stroke="#d2d8ce" strokeWidth="2" /></svg><span className="relative flex flex-col items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-ink text-white shadow-lg"><MapPinIcon size={30} weight="fill" /></span><span className="rounded-full bg-white px-5 py-3 text-sm font-bold text-brand-ink shadow-sm group-hover:bg-brand-gold">Mở Google Maps ↗</span><span className="max-w-[200px] text-center text-[11px] text-[#526457]">Sơ đồ minh hoạ · Xem vị trí chính xác trên Google Maps</span></span></a>}
          </div></section>
        </article>
        <EventSidebar event={event} />
      </div>
    </main>
  );
}
