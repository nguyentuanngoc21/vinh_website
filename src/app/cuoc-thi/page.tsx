import type { Metadata } from "next";
import Link from "next/link";
import { SparkleIcon, TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ContestCard } from "@/components/contests/contest-card";
import { ContestKeyVisual } from "@/components/contests/contest-key-visual";
import { EntryRow } from "@/components/contests/entry-row";
import { HubHero } from "@/components/contests/hub-hero";
import { RandomPick } from "@/components/contests/random-pick";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { listContestsForHub } from "@/lib/contests/contest-service";
import { getContestEntries } from "@/lib/contests/feeds";
import { listArchiveWinners } from "@/lib/contests/public-view";

export const metadata: Metadata = { title: "Cuộc thi viết — Vịnh" };

const ago = (iso: string, now: number) => {
  const h = Math.floor((now - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "vừa xong";
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hôm qua" : `${d} ngày trước`;
};

/**
 * Hub /cuoc-thi — không phải danh sách event (đặc tả UX mục 1): hero (1 cuộc
 * thi / slide) → truyện để đọc → cuộc thi để tham gia → lưu trữ.
 * "Đang được chú ý" / "Viên ngọc ẩn" (cần valid reader) và "Hành trình của
 * bạn" (Passport) thuộc Phase 2–3, chưa hiển thị.
 */
export default async function ContestHubPage() {
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  const now = new Date();

  const [hub, newest, discover] = await Promise.all([
    listContestsForHub(supabase),
    getContestEntries(supabase, { contest: null, capabilities: null, sort: "new", limit: 12, viewerId, now }),
    getContestEntries(supabase, { contest: null, capabilities: null, sort: "discover", limit: 20, viewerId, now }),
  ]);
  const winners = await listArchiveWinners(supabase, hub.finished, now);
  const titleByContest = new Map(hub.running.map((c) => [c.id, c.title]));

  const byYear = new Map<string, typeof hub.finished>();
  for (const c of hub.finished) {
    const year = new Date(c.results_published_at ?? c.submission_end).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), c]);
  }

  return (
    <div className="flex-1 bg-neutral-bg">
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main className="flex flex-col gap-9 px-4 pb-12 pt-7 sm:px-8 lg:px-11">
          <div>
            <div className="text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">CUỘC THI VIẾT</div>
            <h1 className="mt-1.5 text-[22px] font-bold tracking-[-.4px] text-ink sm:text-2xl">Đọc, viết và cùng nhau làm nên một mùa thi</h1>
          </div>

          {hub.featured.length > 0 ? (
            <HubHero contests={hub.featured} />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-border-light p-10 text-center">
              <TrophyIcon size={32} className="text-brand-gold-dark" />
              <div className="text-lg font-bold text-ink">Chưa có cuộc thi nào đang diễn ra</div>
              <div className="text-sm text-stone-alt">Cuộc thi mới sẽ được công bố tại đây.</div>
            </div>
          )}

          <EntryRow
            title="Mới dự thi"
            subtitle="Vừa được gửi vào các cuộc thi đang diễn ra"
            icon={<SparkleIcon size={18} weight="fill" className="text-brand-gold-dark" />}
            items={newest.items.map((e) => ({ key: e.submission_id, book: e.book, meta: ago(e.submitted_at, now.getTime()) }))}
          />

          {discover.items.length > 0 && (
            <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
              <EntryRow
                title="Truyện đề xuất"
                subtitle="Xáo ngẫu nhiên mỗi ngày — không dựa trên lượt đọc."
                items={discover.items.slice(0, 8).map((e) => ({ key: e.submission_id, book: e.book, meta: titleByContest.get(e.contest_id) ?? null }))}
              />
              <RandomPick pool={discover.items.map((e) => e.book)} />
            </div>
          )}

          {hub.running.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-bold text-ink sm:text-xl">Các cuộc thi đang diễn ra</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {hub.running.map((c) => <ContestCard key={c.id} contest={c} now={now.getTime()} />)}
              </div>
            </section>
          )}

          {byYear.size > 0 && (
            <section>
              <div className="text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">LƯU TRỮ</div>
              <h2 className="mb-1.5 mt-1.5 text-lg font-bold text-ink sm:text-xl">Dấu ấn các mùa thi</h2>
              {[...byYear.entries()].map(([year, items]) => (
                <div key={year} className="grid grid-cols-1 gap-3 border-b border-neutral-bg py-5 sm:grid-cols-[80px_minmax(0,1fr)] sm:gap-5">
                  <div className="text-2xl font-extrabold text-brand-ink">{year}</div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((c) => {
                      const w = winners.get(c.id);
                      return (
                        <Link key={c.id} href={`/cuoc-thi/${c.slug}`}
                          className="flex items-center gap-3 rounded-[14px] border border-border-light bg-neutral-bg/60 p-2.5 no-underline">
                          <ContestKeyVisual url={c.key_visual_url} title={c.title} className="h-14 w-14 shrink-0 rounded-lg" />
                          <div className="min-w-0">
                            <div className="truncate text-[14.5px] font-semibold text-ink">{c.title}</div>
                            <div className="text-xs text-stone-alt">{c.entry_count} tác phẩm</div>
                            {w && (
                              <div className="mt-1 flex items-center gap-1 truncate text-xs text-brand-gold-dark">
                                <TrophyIcon size={12} weight="fill" /> {w.award_name}: {w.book_title}
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
