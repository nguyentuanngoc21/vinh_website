import type { Metadata } from "next";
import Link from "next/link";
import { HeadphonesIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BookCover } from "@/components/covers/book-cover";
import { createClient } from "@/lib/supabase/server";
import { searchBooks } from "@/lib/search/search-books";
import { searchAudio } from "@/lib/search/search-audio";
import { searchDesign } from "@/lib/search/search-design";
import type { SearchType } from "@/components/nav-bar-content";

export const metadata: Metadata = { title: "Tìm kiếm — Vịnh" };

const TABS: { type: SearchType; label: string }[] = [
  { type: "truyen", label: "Truyện chữ" },
  { type: "audio", label: "Audio" },
  { type: "thiet-ke", label: "Thiết kế" },
];

function isSearchType(value: string | undefined): value is SearchType {
  return value === "truyen" || value === "audio" || value === "thiet-ke";
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  return `${m} phút`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const query = (q ?? "").trim();
  // type=blog (hoặc bất kỳ giá trị lạ nào) rơi về mặc định "truyen" — Blog
  // vẫn là dữ liệu mock (src/lib/blog.ts), không có tab kết quả thật.
  const activeTab: SearchType = isSearchType(type) ? type : "truyen";

  const supabase = await createClient();
  const [books, audio, design] = query
    ? await Promise.all([searchBooks(supabase, query), searchAudio(supabase, query), searchDesign(supabase, query)])
    : [[], [], []];

  const countByTab: Record<SearchType, number> = {
    truyen: books.length,
    audio: audio.length,
    "thiet-ke": design.length,
  };

  return (
    <div className="flex-1 bg-[#f2f2f3]">
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader searchPlaceholder="Tìm truyện, tác giả…" searchType={activeTab} searchDefaultValue={query} />
        <main className="px-4 py-8 sm:px-8 lg:px-11">
          <h1 className="mb-1 text-2xl font-bold text-brand-ink">
            {query ? (
              <>
                Kết quả cho &quot;{query}&quot;
              </>
            ) : (
              "Tìm kiếm"
            )}
          </h1>
          {!query && (
            <p className="text-sm text-stone-alt">Nhập từ khoá vào ô tìm kiếm ở trên để bắt đầu.</p>
          )}

          {query && (
            <>
              <div className="mb-6 mt-4 flex gap-2 border-b border-cream-border">
                {TABS.map((tab) => (
                  <Link
                    key={tab.type}
                    href={`/tim-kiem?q=${encodeURIComponent(query)}${tab.type === "truyen" ? "" : `&type=${tab.type}`}`}
                    className={`border-b-2 px-4 py-2.5 text-sm font-semibold no-underline ${
                      activeTab === tab.type
                        ? "border-brand-gold-dark text-brand-ink"
                        : "border-transparent text-stone-alt hover:text-brand-ink"
                    }`}
                  >
                    {tab.label} ({countByTab[tab.type]})
                  </Link>
                ))}
              </div>

              {activeTab === "truyen" && (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
                  {books.map((b) => (
                    <Link
                      key={b.id}
                      href={`/truyen/${b.slug}`}
                      className="no-underline transition-transform duration-[250ms] hover:-translate-y-1"
                    >
                      <div className="aspect-[2/3] overflow-hidden rounded-[10px] bg-neutral-bg">
                        <BookCover
                          id={b.id}
                          title={b.title}
                          author={b.authorNickname}
                          genre={b.genre}
                          coverUrl={b.coverUrl}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-brand-ink">{b.title}</div>
                      <div className="truncate text-xs text-stone-alt">{b.authorNickname ?? "—"}</div>
                    </Link>
                  ))}
                  {books.length === 0 && <EmptyState label="truyện" />}
                </div>
              )}

              {activeTab === "audio" && (
                <div className="flex flex-col gap-2">
                  {audio.map((a) => (
                    <Link
                      key={a.id}
                      href="/audio"
                      className="flex items-center gap-3.5 rounded-[10px] border border-cream-border px-4 py-3 no-underline transition-colors hover:bg-[#FBF8F1]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-ink text-brand-gold-light">
                        <HeadphonesIcon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-brand-ink">{a.title}</div>
                        <div className="truncate text-xs text-stone-alt">{a.narratorNickname ?? "—"}</div>
                      </div>
                      <div className="shrink-0 text-xs text-stone-alt">{formatDuration(a.durationSeconds)}</div>
                    </Link>
                  ))}
                  {audio.length === 0 && <EmptyState label="audio" />}
                </div>
              )}

              {activeTab === "thiet-ke" && (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                  {design.map((d) => (
                    <Link key={d.id} href="/thiet-ke" className="no-underline">
                      <div className="aspect-square overflow-hidden rounded-[10px] bg-neutral-bg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={d.imageUrl} alt={d.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div className="mt-2 truncate text-sm font-semibold text-brand-ink">{d.title}</div>
                      <div className="truncate text-xs text-stone-alt">{d.illustratorNickname ?? "—"}</div>
                    </Link>
                  ))}
                  {design.length === 0 && <EmptyState label="thiết kế" />}
                </div>
              )}
            </>
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="col-span-full py-12 text-center text-sm text-stone-alt">
      Không tìm thấy {label} nào khớp.
    </div>
  );
}
