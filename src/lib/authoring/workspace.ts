import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";
import { isExclusivityLocked } from "@/lib/authoring/exclusivity-lock";
import { getChapterAudio } from "@/lib/audio/get-chapter-audio";

type Client = SupabaseClient<Database>;

/**
 * Dữ liệu không gian tác giả cho app mobile — cùng truy vấn với
 * src/app/author/layout.tsx, author/[bookId]/page.tsx và
 * author/[bookId]/[chapterId]/page.tsx. `client` phải là client RLS của
 * chính người gọi (getUserContext), KHÔNG service-role. RLS SELECT trên books
 * cho phép đọc sách đã xuất bản của người khác, nên vẫn tự kiểm author_id
 * giống các trang web.
 *
 * Khác web: tải thêm removed_at/removed_reason_detail để app báo trước chương
 * đang bị gỡ (web chỉ biết khi PATCH trả 403).
 */
export async function listAuthorBooks(client: Client, userId: string) {
  const { data: rows, error } = await client
    .from("books")
    .select("id, title, genre, published, is_exclusive, cover_design_item_id, created_at")
    .eq("author_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const books = rows ?? [];
  const ids = books.map((b) => b.id);
  const [covers, { data: chapters }] = await Promise.all([
    Promise.all(books.map((b) => resolveBookCoverUrl(client, b))),
    ids.length
      ? client.from("chapters").select("book_id, published").in("book_id", ids)
      : Promise.resolve({ data: [] as { book_id: string; published: boolean }[] }),
  ]);
  return books.map((b, i) => {
    const own = (chapters ?? []).filter((c) => c.book_id === b.id);
    return {
      id: b.id,
      title: b.title,
      genre: b.genre,
      published: b.published,
      isExclusive: b.is_exclusive,
      coverUrl: covers[i] ?? null,
      chapterCount: own.length,
      publishedCount: own.filter((c) => c.published).length,
    };
  });
}

async function ownBook(client: Client, userId: string, bookId: string) {
  const { data: book } = await client
    .from("books")
    .select(
      "id, title, synopsis, genre, tags, slug, published, published_at, author_id, is_exclusive, deleted_at, cover_design_item_id, finalized_at"
    )
    .eq("id", bookId)
    .maybeSingle();
  return book && book.author_id === userId && !book.deleted_at ? book : null;
}

export async function getAuthorBook(client: Client, userId: string, bookId: string) {
  const book = await ownBook(client, userId, bookId);
  if (!book) return null;
  const [{ data: chapters }, coverUrl, { data: characters }, { data: grant }] = await Promise.all([
    client
      .from("chapters")
      .select("id, title, order_index, published, price, is_last_chapter, removed_at, removed_reason_detail")
      .eq("book_id", bookId)
      .order("order_index", { ascending: true }),
    resolveBookCoverUrl(client, book),
    client.from("characters").select("id, name, role, trope").eq("book_id", bookId).order("created_at", { ascending: true }),
    // Tối đa 1 lượt chia sẻ bản thảo đang hoạt động/sách (partial unique index) — như author/[bookId]/page.tsx.
    client
      .from("manuscript_access_grants")
      .select("granted_at, locked_at, profiles:granted_to_user_id(username, nickname)")
      .eq("book_id", bookId)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);
  const grantProfile = grant?.profiles as unknown as { username: string; nickname: string | null } | null;
  // Chỉ chương nháp mới xoá được; chương nháp đã có người mua (xuất bản rồi lưu
  // nháp lại) thì app ẩn nút Xoá thay vì chờ route trả 409.
  const draftIds = (chapters ?? []).filter((c) => !c.published).map((c) => c.id);
  const { data: sales } = draftIds.length
    ? await client.from("purchase_transactions").select("chapter_id").in("chapter_id", draftIds)
    : { data: [] as { chapter_id: string }[] };
  const sold = new Set((sales ?? []).map((s) => s.chapter_id));
  return {
    id: book.id,
    title: book.title,
    synopsis: book.synopsis,
    genre: book.genre,
    tags: book.tags ?? [],
    slug: book.slug,
    published: book.published,
    isExclusive: book.is_exclusive,
    exclusivityLocked: isExclusivityLocked({
      isExclusive: book.is_exclusive,
      published: book.published,
      publishedAt: book.published_at,
    }),
    finalized: !!book.finalized_at,
    manuscriptGrant:
      grant && grantProfile
        ? { username: grantProfile.username, nickname: grantProfile.nickname, grantedAt: grant.granted_at, locked: !!grant.locked_at }
        : null,
    coverUrl,
    characters: characters ?? [],
    chapters: (chapters ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      orderIndex: c.order_index,
      published: c.published,
      price: c.price,
      isLastChapter: c.is_last_chapter,
      removed: !!c.removed_at,
      removedReason: c.removed_reason_detail,
      sold: sold.has(c.id),
    })),
  };
}

export async function getAuthorChapter(client: Client, userId: string, chapterId: string) {
  const { data: chapter } = await client
    .from("chapters")
    .select(
      "id, book_id, title, content, published, price, audio_url, audio_price, is_last_chapter, removed_at, removed_reason_detail"
    )
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter) return null;
  const book = await ownBook(client, userId, chapter.book_id);
  if (!book) return null;
  const [linkedAudio, { data: characters }, { data: tagged }] = await Promise.all([
    getChapterAudio(client, chapter.id),
    client.from("characters").select("id, name, role, trope").eq("book_id", book.id).order("created_at", { ascending: true }),
    client.from("chapter_characters").select("character_id").eq("chapter_id", chapter.id),
  ]);
  return {
    book: { id: book.id, title: book.title, isExclusive: book.is_exclusive },
    chapter: {
      id: chapter.id,
      title: chapter.title,
      content: chapter.content,
      published: chapter.published,
      price: chapter.price,
      audioUrl: chapter.audio_url,
      audioPrice: chapter.audio_price,
      isLastChapter: chapter.is_last_chapter,
      removed: !!chapter.removed_at,
      removedReason: chapter.removed_reason_detail,
    },
    linkedAudio: linkedAudio.map((a) => ({ id: a.id, title: a.title, narratorName: a.narratorName })),
    characters: characters ?? [],
    taggedCharacterIds: (tagged ?? []).map((t) => t.character_id),
  };
}
