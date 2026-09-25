import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { getChapterAudio } from '@/lib/audio/get-chapter-audio';

type Client = SupabaseClient<Database>;

/**
 * The reader's interaction state for one chapter — what the web read page
 * (src/app/read/[bookSlug]/[chapterId]/page.tsx) loads server-side: vote count and my vote,
 * trope candidates (characters tagged to the chapter) and my trope vote, the book's author and
 * whether I follow them. Comments and highlights come from their own routes.
 */
export async function getChapterInteractions(client: Client, chapterId: string, userId: string) {
  const { data: chapter } = await client.from('chapters').select('id,book_id').eq('id', chapterId).maybeSingle();
  if (!chapter) return null;
  const { data: book } = await client.from('books').select('id,slug,title,author_id').eq('id', chapter.book_id).maybeSingle();
  if (!book) return null;
  const [count, myVote, tagged, myTrope, author, follow, linkedAudio] = await Promise.all([
    client.from('chapter_vote_counts').select('vote_count').eq('chapter_id', chapterId).maybeSingle(),
    client.from('chapter_votes').select('chapter_id').eq('chapter_id', chapterId).eq('user_id', userId).maybeSingle(),
    client.from('chapter_characters').select('character_id').eq('chapter_id', chapterId),
    client.from('character_trope_votes').select('character_id').eq('chapter_id', chapterId).eq('user_id', userId).maybeSingle(),
    client.from('author_public_profiles').select('id,nickname,avatar_url').eq('id', book.author_id).maybeSingle(),
    client.from('author_follows').select('author_id').eq('author_id', book.author_id).eq('follower_id', userId).maybeSingle(),
    // Narrations linked to this chapter (the web reader's "Nghe" button).
    getChapterAudio(client, chapterId),
  ]);
  const ids = (tagged.data ?? []).map(t => t.character_id);
  const { data: characters } = ids.length
    ? await client.from('characters').select('id,name,role,trope').in('id', ids)
    : { data: [] as { id: string; name: string; role: string; trope: string | null }[] };
  return {
    bookId: book.id, bookSlug: book.slug, bookTitle: book.title,
    voteCount: count.data?.vote_count ?? 0,
    voted: !!myVote.data,
    tropeCandidates: (characters ?? []).map(c => ({ id: c.id, name: c.name, role: c.role, trope: c.trope })),
    myTropeCharacterId: myTrope.data?.character_id ?? null,
    author: { id: book.author_id, nickname: author.data?.nickname ?? null, avatarUrl: author.data?.avatar_url ?? null },
    isOwnBook: book.author_id === userId,
    followingAuthor: !!follow.data,
    linkedAudio: linkedAudio.map(t => ({ id: t.id, title: t.title, narratorName: t.narratorName, durationSeconds: t.durationSeconds, audioUrl: t.audioUrl })),
  };
}
