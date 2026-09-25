import { mobileApi, readApi } from './api';

export type HomepageBook = { id: string; slug: string; title: string; genre: string | null; viewCount: number; authorNickname: string | null; chapterCount: number; coverUrl: string | null };
export type Discover = { featured: HomepageBook[]; newest: HomepageBook[]; weeklyRanking: HomepageBook[]; recommended: HomepageBook[] };
export type BookResult = { id: string; slug: string; title: string; genre: string | null; authorNickname: string | null; coverUrl: string | null };
export type AudioResult = { id: string; title: string; narratorNickname: string | null; durationSeconds: number | null; audioUrl: string | null };
export type DesignResult = { id: string; title: string; category: string | null; illustratorNickname: string | null; imageUrl: string | null };
export type RankedBook = HomepageBook & { authorId: string; reads: number; delta: number | null; isNew: boolean };
export type RankingPeriod = { range: string; list: RankedBook[]; leaders: { name: string; meta: string; color: string }[] };
export type PeriodId = 'tuan' | 'thang' | 'quy' | 'toanthoigian';
export const PERIODS: [PeriodId, string][] = [['tuan', 'Tuần'], ['thang', 'Tháng'], ['quy', 'Quý'], ['toanthoigian', 'Toàn thời gian']];

export function getDiscover() { return readApi<Discover>('discover'); }
/** Same as the web /tim-kiem: title or creator nickname, up to 24 per type. */
export function searchAll(query: string) {
  return readApi<{ books: BookResult[]; audio: AudioResult[]; designs: DesignResult[] }>(`search?q=${encodeURIComponent(query.trim())}`);
}
export function getRankings() { return readApi<Record<PeriodId, RankingPeriod>>('rankings'); }
/** Quest reader_view_recommendations (web: ?from=goi-y). Best-effort; signed-in only. */
export function markRecommendationView(userId: string, bookId: string) {
  return mobileApi(`books/${encodeURIComponent(bookId)}/recommendation-view`, userId, {}).catch(() => undefined);
}
