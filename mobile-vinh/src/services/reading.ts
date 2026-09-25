import { Share } from 'react-native';
import { mobileApi } from './api';

export type ParagraphComment = {
  id: string; paragraphIndex: number | null; content: string; parentCommentId: string | null; createdAt: string;
  authorId: string; authorName?: string; authorAvatarUrl?: string | null; isOwn: boolean;
};
export type Highlight = { id: string; paragraphIndex: number | null; charStart: number; charEnd: number };
export type TropeCandidate = { id: string; name: string; role: string; trope: string | null };
export type ChapterInteractions = {
  bookId: string; bookSlug: string; bookTitle: string; voteCount: number; voted: boolean; tropeCandidates: TropeCandidate[]; myTropeCharacterId: string | null;
  author: { id: string; nickname: string | null; avatarUrl: string | null }; isOwnBook: boolean; followingAuthor: boolean;
  comments: ParagraphComment[]; highlights: Highlight[];
  linkedAudio: { id: string; title: string; narratorName: string; durationSeconds: number | null; audioUrl: string }[];
};

const path = (chapterId: string) => `chapters/${encodeURIComponent(chapterId)}/interactions`;
export function getInteractions(userId: string, chapterId: string) {
  return mobileApi<ChapterInteractions>(path(chapterId), userId);
}
type Action = 'comment' | 'delete-comment' | 'highlight' | 'remove-highlight' | 'vote' | 'trope-vote' | 'share' | 'follow-author';
/** All writes go through the web routes, which check that the user can read the chapter. */
export function interact<T = unknown>(userId: string, chapterId: string, action: Action, fields: Record<string, unknown> = {}) {
  return mobileApi<T>(path(chapterId), userId, { action, ...fields });
}

// Same role labels as the web (characters.role).
export const ROLE_LABELS: Record<string, string> = { hero: 'Chính diện', villain: 'Phản diện', neutral: 'Trung lập' };
export function tropeLabel(c: TropeCandidate) { return c.trope ? `${c.name} — ${c.trope}` : `${c.name} (${ROLE_LABELS[c.role] ?? c.role})`; }

/** Top-level threads per paragraph with their replies; the count includes replies, like the web. */
export function groupComments(comments: ParagraphComment[]) {
  const byParagraph = new Map<number, { top: ParagraphComment; replies: ParagraphComment[] }[]>();
  const counts = new Map<number, number>();
  const top = comments.filter(c => !c.parentCommentId && c.paragraphIndex != null);
  for (const t of top) {
    const replies = comments.filter(c => c.parentCommentId === t.id);
    const index = t.paragraphIndex as number;
    byParagraph.set(index, [...(byParagraph.get(index) ?? []), { top: t, replies }]);
    counts.set(index, (counts.get(index) ?? 0) + 1 + replies.length);
  }
  return { byParagraph, counts };
}

/** Split a paragraph into plain/highlighted runs; overlapping ranges are merged (as buildHighlightSegments). */
export function highlightSegments(text: string, ranges: { charStart: number; charEnd: number }[]) {
  const sorted = ranges.map(r => ({ start: Math.max(0, r.charStart), end: Math.min(text.length, r.charEnd) }))
    .filter(r => r.end > r.start).sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end); else merged.push({ ...r });
  }
  const segments: { text: string; marked: boolean }[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), marked: false });
    segments.push({ text: text.slice(r.start, r.end), marked: true });
    cursor = r.end;
  }
  if (cursor < text.length || !segments.length) segments.push({ text: text.slice(cursor), marked: false });
  return segments;
}

/** Public web link for sharing, only when EXPO_PUBLIC_SITE_URL is set (EXPO_PUBLIC_API_URL may be a LAN address). */
export function webLink(pathname: string) {
  const site = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '');
  return site && /^https:\/\//.test(site) ? `${site}${pathname}` : null;
}

/** Opens the system share sheet; quest progress is recorded only for a completed share, not a dismissal. */
export async function shareAndRecord(userId: string, chapterId: string, bookId: string, message: string) {
  const result = await Share.share({ message });
  if (result.action !== Share.sharedAction) return false;
  await interact(userId, chapterId, 'share', { bookId }).catch(() => undefined);
  return true;
}
