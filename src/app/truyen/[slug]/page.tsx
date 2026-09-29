import type { Metadata } from "next";
import { Lora } from "next/font/google";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { EyeIcon, StarIcon, StackIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BookCover } from "@/components/covers/book-cover";
import { Pill } from "@/components/ui";
import { StoryCtaButtons } from "@/components/story/story-cta-buttons";
import { StoryTabs } from "@/components/story/story-tabs";
import { StoryContestCards } from "@/components/contests/story-contest-cards";
import { ReadingSourceMarker } from "@/components/reading/reading-source-marker";
import { readingSourceFromParam } from "@/lib/reading/reading-source";
import { getStoryContestCards } from "@/lib/contests/public-view";
import { computeBookStatus } from "@/lib/story/status";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { RewardEngine } from "@/lib/quests/reward-engine";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

// Query sách dùng chung cho generateMetadata và page — cache() dedupe
// trong cùng 1 request nên chỉ chạy 1 lần. Trả row thô (kể cả chưa
// publish): metadata vẫn dùng như cũ, page tự kiểm `published` để 404.
const getBookBySlug = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("books")
    .select("id, slug, title, synopsis, genre, tags, view_count, author_id, cover_design_item_id, published")
    .eq("slug", slug)
    .maybeSingle();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/truyen/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookBySlug(slug);

  return {
    title: book ? `${book.title} — Vịnh` : "Truyện — Vịnh",
    description: book?.synopsis ?? undefined,
    // Xem giải thích đầy đủ ở generateMetadata của
    // src/app/read/[bookSlug]/[chapterId]/page.tsx — cùng lý do áp dụng
    // cho trang giới thiệu truyện (có tóm tắt là text công khai).
    other: { robots: "noai, noimageai" },
  };
}

export default async function StoryPage({
  params,
  searchParams,
}: PageProps<"/truyen/[slug]"> & { searchParams: Promise<{ from?: string }> }) {
  const { slug } = await params;
  const { from } = await searchParams;
  // Nguồn truy cập cho phiên đọc (analytics) — xem src/lib/reading/reading-source.ts.
  const readingSource = readingSourceFromParam(from);
  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();

  const book = await getBookBySlug(slug);

  // Trang này luôn public-only — 404 cả với chính tác giả nếu chưa
  // publish. Tác giả xem/soạn truyện qua /author, không qua route này.
  if (!book || !book.published) notFound();

  const [viewerId, { data: authorProfile }, { data: chapters }] = await Promise.all([
    // getAuthedUserId() thử cả session cookie tự ký VÀ Supabase Auth thật
    // (src/lib/wallet/session.ts) — nhất quán với các route khác trong
    // repo (penalty, wallet), thay vì chỉ supabase.auth.getUser() (bỏ lọt
    // trường hợp chỉ có session cookie tự ký).
    getAuthedUserId(serviceClient),
    supabase.from("author_public_profiles").select("nickname").eq("id", book.author_id).maybeSingle(),
    supabase
      .from("chapters")
      .select("id, title, order_index, created_at, is_last_chapter")
      .eq("book_id", book.id)
      .eq("published", true)
      .order("order_index", { ascending: true }),
  ]);

  // Nhiệm vụ reader_view_recommendations — chỉ khi đến từ mục "Gợi ý cho
  // bạn" ở trang chủ (?from=goi-y, xem recommended-for-you.tsx), không
  // tính lượt xem thường. Best-effort, kết quả không hiển thị trên trang
  // → chạy trong after() (sau khi response đã trả), không cộng latency.
  // Callback chỉ gọi RPC qua serviceClient, không đụng cookies()/headers().
  if (viewerId && from === "goi-y") {
    after(async () => {
      const result = await RewardEngine.incrementTaskProgress(serviceClient, {
        userId: viewerId,
        taskCode: "reader_view_recommendations",
      });
      if (!result.ok) console.error("[truyen/slug] incrementTaskProgress failed:", result.error);
    });
  }

  const publishedChapters = chapters ?? [];
  const chapterIds = publishedChapters.map((c) => c.id);

  // Các query dưới đây chỉ phụ thuộc book/viewerId/chapterIds, không phụ
  // thuộc lẫn nhau — chạy song song.
  const [contestCards, coverUrl, { data: voteRows }, { data: progress }, characters] = await Promise.all([
    // Contest card (dự thi / đạt giải) — suy ra từ contest_submissions /
    // contest_awards, không lưu cờ trên books. Lỗi ở đây không làm hỏng trang truyện.
    getStoryContestCards(serviceClient, { bookId: book.id, viewerId }).catch((error) => {
      console.error("[truyen/slug] contest cards failed:", error);
      return [];
    }),
    resolveBookCoverUrl(supabase, book),
    chapterIds.length
      ? supabase.from("chapter_vote_counts").select("chapter_id, vote_count").in("chapter_id", chapterIds)
      : Promise.resolve({ data: [] as { chapter_id: string; vote_count: number }[] }),
    // "Tiếp tục đọc" — xem kiểm tra continueChapterId bên dưới.
    viewerId
      ? serviceClient.from("book_progress").select("chapter_id").eq("book_id", book.id).eq("user_id", viewerId).maybeSingle()
      : Promise.resolve({ data: null }),
    loadCharacters(supabase, serviceClient, book.id, viewerId),
  ]);

  const firstChapter = publishedChapters[0] ?? null;
  const lastChapter = publishedChapters.at(-1) ?? null;

  const latestCreatedAt = publishedChapters.length
    ? publishedChapters.reduce((max, c) => (c.created_at > max ? c.created_at : max), publishedChapters[0].created_at)
    : null;

  const status = computeBookStatus({
    hasPublishedLastChapter: publishedChapters.some((c) => c.is_last_chapter),
    latestPublishedChapterCreatedAt: latestCreatedAt,
  });

  const voteByChapter = new Map((voteRows ?? []).map((r) => [r.chapter_id, r.vote_count]));
  const totalVoteCount = (voteRows ?? []).reduce((sum, r) => sum + r.vote_count, 0);

  // "Tiếp tục đọc" — chỉ hiện nếu chương đã đọc còn nằm trong danh sách
  // chương published hiện tại (phòng trường hợp tác giả gỡ publish sau đó).
  const continueChapterId: string | null =
    progress?.chapter_id && chapterIds.includes(progress.chapter_id) ? progress.chapter_id : null;

  const chaptersAscending = publishedChapters.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.created_at,
    voteCount: voteByChapter.get(c.id) ?? 0,
  }));

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader sticky={false} />
        <main className="px-4 py-6 sm:px-8 sm:py-9 lg:px-11">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="mx-auto w-[156px] shrink-0 sm:mx-0 sm:w-[200px]">
              <div className="aspect-[2/3] overflow-hidden rounded-[14px] shadow-[0_8px_24px_rgba(0,0,0,.12)]">
                <BookCover
                  id={book.id}
                  title={book.title}
                  author={authorProfile?.nickname}
                  genre={book.genre}
                  coverUrl={coverUrl}
                  className="h-full w-full"
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="font-[family-name:var(--font-lora)] text-2xl font-bold leading-tight text-brand-ink sm:text-[28px]">
                {book.title}
              </h1>
              {authorProfile?.nickname && <p className="mt-1 text-sm text-stone-alt">bởi {authorProfile.nickname}</p>}

              <div className="mt-3.5 flex flex-wrap items-center gap-3.5 text-sm text-stone-alt sm:gap-5">
                <span className="flex items-center gap-1.5">
                  <EyeIcon size={17} /> {book.view_count.toLocaleString("vi-VN")}
                </span>
                <span className="flex items-center gap-1.5">
                  <StarIcon size={17} weight="fill" className="text-brand-gold-dark" /> {totalVoteCount.toLocaleString("vi-VN")}
                </span>
                <span className="flex items-center gap-1.5">
                  <StackIcon size={17} /> {publishedChapters.length} chương
                </span>
              </div>

              <div className="mt-5">
                <StoryCtaButtons
                  bookSlug={book.slug}
                  firstChapterId={firstChapter?.id ?? null}
                  lastChapterId={lastChapter?.id ?? null}
                  continueChapterId={continueChapterId}
                />
              </div>

              <StoryContestCards cards={contestCards} />
              {readingSource && <ReadingSourceMarker bookId={book.id} source={readingSource} />}

              {book.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {book.tags.map((tag) => (
                    <Pill key={tag}>{tag}</Pill>
                  ))}
                </div>
              )}

              {book.synopsis ? (
                <p className="mt-4 max-w-[900px] whitespace-pre-line text-[14.5px] leading-[1.7] text-ink">{book.synopsis}</p>
              ) : (
                <p className="mt-4 text-[14.5px] italic text-stone-light">Truyện này chưa có mô tả</p>
              )}
            </div>
          </div>

          <div className="mt-8 max-w-[900px] sm:mt-10">
            <StoryTabs
              bookSlug={book.slug}
              status={status}
              lastUpdatedLabel={latestCreatedAt ? new Date(latestCreatedAt).toLocaleDateString("vi-VN") : null}
              genre={book.genre}
              chaptersAscending={chaptersAscending}
              characters={characters}
            />
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

// Nhân vật của truyện + cờ "đang theo dõi" của viewer. 2 bước nối tiếp
// (character_follows cần id nhân vật), gói trong 1 promise để chạy song
// song với các query khác của trang.
async function loadCharacters(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  bookId: string,
  viewerId: string | null
) {
  const { data: characterRows } = await supabase
    .from("characters")
    .select("id, name, role, trope")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });
  const characterIds = (characterRows ?? []).map((c) => c.id);
  const { data: myFollowRows } =
    viewerId && characterIds.length
      ? await serviceClient.from("character_follows").select("character_id").eq("follower_id", viewerId).in("character_id", characterIds)
      : { data: [] as { character_id: string }[] };
  const followedCharacterIds = new Set((myFollowRows ?? []).map((r) => r.character_id));
  return (characterRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    trope: c.trope,
    followedByViewer: followedCharacterIds.has(c.id),
  }));
}
