import { mobileApi } from './api';

type CreatorTag = 'author' | 'illustrator' | 'narrator' | 'blogger';
export type WorkItem = { id: string; title: string; meta: string; date: string; href: string | null; imageUrl: string | null; audioUrl?: string | null };
export type ConnectService = {
  id: string; serviceType: 'illustration' | 'voice' | 'ghostwriting'; name: string; minPrice: number | null; deliveryDays: number | null;
  commissionStatus: 'available' | 'busy' | 'off'; activeCommissionCount: number; monthlyCommissionLimit: number | null;
};
export type Person = {
  id: string; nickname: string; username: string; avatarUrl: string | null; coverImageUrl: string | null; bio: string | null;
  joined: string; creatorTags: CreatorTag[]; followerCount: number; isFollowingByViewer: boolean;
  services: ConnectService[]; works: { truyen: WorkItem[]; audio: WorkItem[]; design: WorkItem[] };
};
export type ListingSample = { id: string; kind: 'image' | 'audio' | 'book' | 'link'; title: string | null; url: string | null; source: 'upload' | 'auto' | 'external'; unverified: boolean };
export type PublicListing = {
  id: string; serviceType: ConnectService['serviceType']; name: string; scopeDescription: string;
  priceTiers: { index: number; label: string; price: number }[]; depositPct: number | null; deliveryDays: number | null; revisionsMax: number | null;
  refundPolicy: { before_draft?: number; draft_pending?: number; draft_approved?: number; delivered?: number } | null;
  acceptedContent: string; rejectedContent: string; defaultUsageScope: string | null; lostContactDays: number;
  isAcceptingOrders: boolean; commissionStatus: ConnectService['commissionStatus']; activeCommissionCount: number; monthlyCommissionLimit: number | null;
  isOwn: boolean; seller: { id: string; nickname: string | null; username: string | null; avatarUrl: string | null }; samples: ListingSample[];
};

// The directory is one request (same 60 people as the web); profiles opened from it reuse it.
let cached: { userId: string; people: Person[] } | null = null;
export async function getDirectory(userId: string, refresh = false) {
  if (!refresh && cached?.userId === userId) return cached.people;
  const { people } = await mobileApi<{ people: Person[] }>('connect', userId);
  cached = { userId, people };
  return people;
}
export function updateCachedPerson(userId: string, personId: string, patch: Partial<Person>) {
  if (cached?.userId !== userId) return;
  cached = { userId, people: cached.people.map(p => (p.id === personId ? { ...p, ...patch } : p)) };
}
export function toggleFollow(userId: string, personId: string) {
  return mobileApi<{ following: boolean }>(`people/${encodeURIComponent(personId)}/follow`, userId, {});
}
export function getListing(userId: string, listingId: string) {
  return mobileApi<{ listing: PublicListing }>(`listings/${encodeURIComponent(listingId)}`, userId).then(r => r.listing);
}
/** The server re-reads price and terms from the listing; the app only chooses the tier. */
export function orderService(userId: string, listingId: string, priceTierIndex: number) {
  return mobileApi<{ order: { id: string } }>('orders', userId, { listingId, priceTierIndex }).then(r => r.order);
}

// Same labels and derivation as the web's connect-directory.tsx (tagsOf).
const TAG_LABELS: Record<CreatorTag, string> = { author: 'Tác giả', illustrator: 'Họa sĩ', narrator: 'Lồng tiếng', blogger: 'Blogger' };
export const FILTERS = ['Tất cả', 'Đọc giả', 'Tác giả', 'Họa sĩ', 'Lồng tiếng', 'Blogger'] as const;
export function tagsOf(p: Pick<Person, 'creatorTags' | 'works'>) {
  const tags = new Set(p.creatorTags.map(t => TAG_LABELS[t]));
  if (p.works.truyen.length) tags.add('Tác giả');
  if (p.works.audio.length) tags.add('Lồng tiếng');
  if (p.works.design.length) tags.add('Họa sĩ');
  return tags.size ? [...tags] : ['Đọc giả'];
}
export function filterPeople(people: Person[], filter: string, query: string) {
  const q = query.trim().toLowerCase();
  return people.filter(p => (filter === 'Tất cả' || tagsOf(p).includes(filter))
    && (!q || p.nickname.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)));
}
export const SERVICE_LABELS: Record<ConnectService['serviceType'], string> = { illustration: 'Minh họa', voice: 'Thu âm', ghostwriting: 'Viết thuê' };
// Same wording as the web tooltip; nothing is shown when commissions are off.
export function commissionLabel(s: Pick<ConnectService, 'commissionStatus' | 'activeCommissionCount' | 'monthlyCommissionLimit'>) {
  if (s.commissionStatus === 'off') return '';
  return `${s.commissionStatus === 'available' ? 'Có thể nhận comm' : 'Đang bận'} — đang xử lý ${s.activeCommissionCount}/${s.monthlyCommissionLimit} comm`;
}
