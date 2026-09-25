import { File, Paths } from 'expo-file-system';
import { mobileApi } from './api';

// Same 10 values as BOOK_GENRES (src/lib/covers/genre-styles.ts); the server rejects anything else.
export const BOOK_GENRES = ['Linh dị', 'Cổ tích & Thần thoại', 'Dã sử', 'Trinh thám', 'Tâm lý - tội phạm', 'Tình cảm',
  'Đời sống - Xã hội', 'Khoa học viễn tưởng', 'Tiên hiệp/ kiếm hiệp', 'Kỳ ảo'] as const;
export const MAX_CONTENT = 200_000; // src/lib/authoring/chapter-limits.ts
export const MAX_SYNOPSIS = 2000;
export const MAX_TAGS = 20;
export const EXCLUSIVITY_AGREEMENT_ID = 'chinh-sach-doc-quyen';

export type MyBook = { id: string; title: string; genre: string | null; published: boolean; isExclusive: boolean; coverUrl: string | null; chapterCount: number; publishedCount: number };
export type Character = { id: string; name: string; role: string; trope: string | null };
export type ChapterRow = { id: string; title: string; orderIndex: number; published: boolean; price: number; isLastChapter: boolean; removed: boolean; removedReason: string | null; sold: boolean };
export type BookDetail = {
  id: string; title: string; synopsis: string | null; genre: string | null; tags: string[]; slug: string; published: boolean;
  isExclusive: boolean; exclusivityLocked: boolean; finalized: boolean; coverUrl: string | null; characters: Character[]; chapters: ChapterRow[];
  manuscriptGrant: { username: string; nickname: string | null; grantedAt: string; locked: boolean } | null;
};
export type EditableChapter = {
  book: { id: string; title: string; isExclusive: boolean };
  chapter: { id: string; title: string; content: string; published: boolean; price: number; audioUrl: string | null; audioPrice: number; isLastChapter: boolean; removed: boolean; removedReason: string | null };
  linkedAudio: { id: string; title: string; narratorName: string }[];
  characters: Character[]; taggedCharacterIds: string[];
};
export type BookFields = { title?: string; synopsis?: string; genre?: string; tags?: string[]; is_exclusive?: boolean };
export type ChapterFields = { title?: string; content?: string; published?: boolean; price?: number; is_last_chapter?: boolean };

const bookPath = (bookId: string) => `authoring/books/${encodeURIComponent(bookId)}`;
const chapterPath = (chapterId: string) => `authoring/chapters/${encodeURIComponent(chapterId)}`;

export const listMyBooks = (userId: string) => mobileApi<{ books: MyBook[] }>('authoring/books', userId).then(r => r.books);
export const getMyBook = (userId: string, bookId: string) => mobileApi<{ book: BookDetail }>(bookPath(bookId), userId).then(r => r.book);
export const getMyChapter = (userId: string, chapterId: string) => mobileApi<EditableChapter>(chapterPath(chapterId), userId);

export function createBook(userId: string, fields: { title: string; synopsis?: string; genre?: string; tags?: string[]; isExclusive: boolean; chapterTitle: string; chapterContent: string; published: boolean; price: number; isLastChapter: boolean }) {
  return mobileApi<{ bookId: string; chapterId: string }>('authoring/books', userId, { action: 'create', ...fields });
}
export const updateBook = (userId: string, bookId: string, fields: BookFields) => mobileApi(bookPath(bookId), userId, { action: 'update', ...fields });
export const deleteBook = (userId: string, bookId: string) => mobileApi(bookPath(bookId), userId, { action: 'delete' });
export function addChapters(userId: string, bookId: string, chapters: { title: string; content: string }[]) {
  return mobileApi<{ chapterIds: string[] }>(bookPath(bookId), userId, { action: 'add-chapters', chapters }, { timeoutMs: 60000 });
}
export const reorderChapters = (userId: string, bookId: string, chapterIds: string[]) => mobileApi(bookPath(bookId), userId, { action: 'reorder', chapterIds });
export const saveChapter = (userId: string, chapterId: string, fields: ChapterFields) =>
  mobileApi<{ published: boolean }>(chapterPath(chapterId), userId, { action: 'save', ...fields }, { timeoutMs: 30000 });
export const deleteChapter = (userId: string, chapterId: string) => mobileApi(chapterPath(chapterId), userId, { action: 'delete' });

// Characters (same limits as /api/authoring/books/[bookId]/characters): name ≤ 60, trope ≤ 40.
export const CHARACTER_ROLES = [['hero', 'Chính diện'], ['villain', 'Phản diện'], ['neutral', 'Trung lập']] as const;
export type CharacterFields = { name: string; role: string; trope: string | null };
export const addCharacter = (userId: string, bookId: string, fields: CharacterFields) =>
  mobileApi<{ character: Character }>(bookPath(bookId), userId, { action: 'add-character', ...fields });
export const updateCharacter = (userId: string, bookId: string, characterId: string, fields: CharacterFields) =>
  mobileApi<{ character: Character }>(bookPath(bookId), userId, { action: 'update-character', characterId, ...fields });
export const deleteCharacter = (userId: string, bookId: string, characterId: string) =>
  mobileApi(bookPath(bookId), userId, { action: 'delete-character', characterId });
export const setChapterCharacters = (userId: string, chapterId: string, characterIds: string[]) =>
  mobileApi<{ characterIds: string[] }>(chapterPath(chapterId), userId, { action: 'set-characters', characterIds });

// Manuscript sharing: one account at a time until Hoàn thiện (irreversible — locks the grant).
export const shareManuscript = (userId: string, bookId: string, username: string) => mobileApi(bookPath(bookId), userId, { action: 'share', username });
export const unshareManuscript = (userId: string, bookId: string) => mobileApi(bookPath(bookId), userId, { action: 'unshare' });
export const finalizeBook = (userId: string, bookId: string) => mobileApi(bookPath(bookId), userId, { action: 'finalize' });

// Manuscript import. .docx is converted on the server (mammoth, ≤ 4 MB); .txt is read on the device.
export const MAX_DOCX_BYTES = 4 * 1024 * 1024;
export type HeadingChapter = { no: number; title: string; content: string; words: number };
export function extractDocx(userId: string, file: { uri: string; name: string; mimeType?: string | null }) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as unknown as Blob);
  return mobileApi<{ text: string; headingChapters: HeadingChapter[] }>('authoring/manuscripts/extract', userId, form, { timeoutMs: 90000 });
}
export async function readTextFile(uri: string) {
  return (await new File(uri).text()).replace(/\r\n?/g, '\n');
}
/**
 * Splits chapters into requests under ~3 MB of JSON each (the bulk route rejects > 4 MB and the
 * platform body limit is ~4.5 MB), keeping order. A single chapter is at most 200,000 characters.
 */
export function batchChapters<T extends { title: string; content: string }>(chapters: T[], maxBytes = 3 * 1024 * 1024) {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const c of chapters) {
    // UTF-8 upper bound: Vietnamese letters take up to 3 bytes; JSON escaping adds a little.
    const bytes = (c.title.length + c.content.length) * 3 + 64;
    if (current.length && size + bytes > maxBytes) { batches.push(current); current = []; size = 0; }
    current.push(c); size += bytes;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Web-style tag input: comma-separated, trimmed, no duplicates, at most 20. */
export function parseTags(text: string) {
  return Array.from(new Set(text.split(',').map(t => t.trim()).filter(Boolean))).slice(0, MAX_TAGS);
}
/** Moves one chapter up/down; the last chapter (is_last_chapter) must stay last, as the server enforces. */
export function moveChapter(chapters: ChapterRow[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= chapters.length) return null;
  if (chapters[index].isLastChapter || chapters[target].isLastChapter) return null;
  const next = [...chapters];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// Unsaved edits are kept in a file on the device (too large for SecureStore), per user and chapter,
// so a crash or lost connection doesn't lose them. Cleared after a successful save.
type LocalDraft = { title: string; content: string; savedAt: number };
const draftFile = (userId: string, chapterId: string) => new File(Paths.document, `chapter-draft-${userId}-${chapterId}.json`);
export async function readLocalDraft(userId: string, chapterId: string): Promise<LocalDraft | null> {
  try {
    const file = draftFile(userId, chapterId);
    if (!file.exists) return null;
    const value = JSON.parse(await file.text());
    return typeof value?.title === 'string' && typeof value?.content === 'string' && typeof value?.savedAt === 'number' ? value : null;
  } catch { return null; }
}
export function writeLocalDraft(userId: string, chapterId: string, draft: Omit<LocalDraft, 'savedAt'>) {
  try {
    const file = draftFile(userId, chapterId);
    if (!file.exists) file.create();
    file.write(JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* Best effort: the server copy is still the source of truth. */ }
}
export function clearLocalDraft(userId: string, chapterId: string) {
  try { const file = draftFile(userId, chapterId); if (file.exists) file.delete(); } catch { /* ignore */ }
}
