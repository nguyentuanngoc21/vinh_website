export type EventGame = { id: string; title: string; description: string };
export type VinhEvent = {
  slug: string;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  address: string;
  city: string;
  coordinates?: { lat: number; lng: number };
  priceVnd: number | null;
  ticketUrl?: string;
  bannerUrl?: string;
  accent: "sea" | "sunset" | "forest";
  category: string;
  organizer: { name: string; description: string; avatarUrl?: string; profileUrl?: string };
  overview: { heading: string; paragraphs: string[] }[];
  travel: { mode: "driving" | "transit" | "bicycling" | "walking"; label: string; note: string }[];
  games: EventGame[];
  published: boolean;
  organizerId: string;
  hidden: boolean;
};

// Explicit editorial choice: set this to the approved event UUID.
export const FEATURED_EVENT_SLUG: string | null = null;
export function getFeaturedEvent(events: VinhEvent[]): VinhEvent | undefined {
  return events.find((event) => event.slug === FEATURED_EVENT_SLUG);
}
export function eventPrice(event: Pick<VinhEvent, "priceVnd">): string {
  if (event.priceVnd === null) return "Giá vé sẽ được công bố";
  return event.priceVnd === 0 ? "Miễn phí" : new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(event.priceVnd);
}
export function eventDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}
export function eventTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
export function mapUrl(event: VinhEvent, mode?: VinhEvent["travel"][number]["mode"]): string | null {
  // Unannounced addresses must never send visitors to a guessed location.
  if (!event.address.trim()) return null;
  const destination = event.coordinates ? `${event.coordinates.lat},${event.coordinates.lng}` : `${event.venue}, ${event.address}, ${event.city}`;
  const url = new URL(mode ? "https://www.google.com/maps/dir/" : "https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set(mode ? "destination" : "query", destination);
  if (mode) url.searchParams.set("travelmode", mode);
  return url.toString();
}
