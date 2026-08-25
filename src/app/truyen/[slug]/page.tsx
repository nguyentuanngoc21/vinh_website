import type { Metadata } from "next";
import { Lora } from "next/font/google";
import { notFound } from "next/navigation";
import { EyeIcon, StarIcon, StackIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BookCover } from "@/components/covers/book-cover";
import { Pill } from "@/components/ui";
import { StoryCtaButtons } from "@/components/story/story-cta-buttons";
import { StoryTabs } from "@/components/story/story-tabs";
import { computeBookStatus } from "@/lib/story/status";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export async function generateMetadata({ params }: PageProps<"/truyen/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: book } = await supabase.from("books").select("title, synopsis").eq("slug", slug).maybeSingle();

  return {
    title: book ? `${book.title} — Vịnh` : "Truyện — Vịnh",
    description: book?.synopsis ?? undefined,
  };
}

export default async function StoryPage({ params }: PageProps<"/truyen/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, slug, title, synopsis, genre, tags, view_count, author_id, cover_design_item_id, published")
    .eq("slug", slug)
    .maybeSingle();

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

  const coverUrl = await resolveBookCoverUrl(supabase, book);

  const publishedChapters = chapters ?? [];
  const firstChapter = publishedChapters[0] ?? null;
  const lastChapter = publishedChapters.at(-1) ?? null;

  const latestCreatedAt = publishedChapters.length
    ? publishedChapters.reduce((max, c) => (c.created_at > max ? c.created_at : max), publishedChapters[0].created_at)
    : null;

  const status = computeBookStatus({
    hasPublishedLastChapter: publishedChapters.some((c) => c.is_last_chapter),
    latestPublishedChapterCreatedAt: latestCreatedAt,
  });

  const chapterIds = publishedChapters.map((c) => c.id);
  const { data: voteRows } = chapterIds.length
    ? await supabase.from("chapter_vote_counts").select("chapter_id, vote_count").in("chapter_id", chapterIds)
    : { data: [] as { chapter_id: string; vote_count: number }[] };
  const voteByChapter = new Map((voteRows ?? []).map((r) => [r.chapter_id, r.vote_count]));
  const totalVoteCount = (voteRows ?? []).reduce((sum, r) => sum + r.vote_count, 0);

  // "Tiếp tục đọc" — chỉ hiện nếu chương đã đọc còn nằm trong danh sách
  // chương published hiện tại (phòng trường hợp tác giả gỡ publish sau đó).
  let continueChapterId: string | null = null;
  if (viewerId) {
    const { data: progress } = await serviceClient
      .from("book_progress")
      .select("chapter_id")
      .eq("book_id", book.id)
      .eq("user_id", viewerId)
      .maybeSingle();
    if (progress?.chapter_id && chapterIds.includes(progress.chapter_id)) {
      continueChapterId = progress.chapter_id;
    }
  }

  const chaptersAscending = publishedChapters.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.created_at,
    voteCount: voteByChapter.get(c.id) ?? 0,
  }));

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main className="px-11 py-9">
          <div className="flex flex-col gap-8 sm:flex-row">
            <div className="w-[200px] shrink-0">
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
              <h1 className="font-[family-name:var(--font-lora)] text-[28px] font-bold leading-tight text-brand-ink">
                {book.title}
              </h1>
              {authorProfile?.nickname && <p className="mt-1 text-sm text-stone-alt">bởi {authorProfile.nickname}</p>}

              <div className="mt-3.5 flex items-center gap-5 text-sm text-stone-alt">
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

              {book.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {book.tags.map((tag) => (
                    <Pill key={tag}>{tag}</Pill>
                  ))}
                </div>
              )}

              {book.synopsis && <p className="mt-4 whitespace-pre-line text-[14.5px] leading-[1.7] text-ink">{book.synopsis}</p>}
            </div>
          </div>

          <div className="mt-10 max-w-[720px]">
            <StoryTabs
              bookSlug={book.slug}
              status={status}
              lastUpdatedLabel={latestCreatedAt ? new Date(latestCreatedAt).toLocaleDateString("vi-VN") : null}
              genre={book.genre}
              chaptersAscending={chaptersAscending}
            />
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
