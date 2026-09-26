import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiamondIcon, EyeSlashIcon, InfoIcon, SparkleIcon, TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BookCover } from "@/components/covers/book-cover";
import { ContestHero } from "@/components/contests/contest-hero";
import { EntryGrid } from "@/components/contests/entry-grid";
import { EntryRow } from "@/components/contests/entry-row";
import { RandomPick } from "@/components/contests/random-pick";
import { RankingBoard, type RankingKindTab } from "@/components/contests/ranking-board";
import { genres } from "@/lib/books";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId, getAuthedUserId } from "@/lib/wallet/session";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { ContestError } from "@/lib/contests/errors";
import { getContestEntries, getPopularRanking, getTopEntries, type EntrySort } from "@/lib/contests/feeds";
import { CONTEST_STATUS_LABEL } from "@/lib/contests/labels";
import { isFinished, PHASE_COPY, resolveTab, tabsFor, type TabKey } from "@/lib/contests/phase-copy";
import { listPublicAwards, loadContestPage, type ContestPageData, type PublicAward } from "@/lib/contests/public-view";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; sort?: string; genre?: string }>;
};

const GENRE_LABELS = genres.map((g) => g.label);
const SORTS: EntrySort[] = ["discover", "new", "az"];
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await createServiceRoleClient().from("contests").select("title, short_description, status").eq("slug", slug).maybeSingle();
  if (!data || data.status === "draft") return { title: "Cuộc thi — Vịnh" };
  return { title: `${data.title} — Cuộc thi Vịnh`, description: data.short_description || undefined };
}

/**
 * Microsite cuộc thi — đơn vị bền vững: URL không đổi suốt vòng đời, khi kết
 * thúc chỉ đổi bộ tab (đặc tả UX mục 1). Tab là ?tab= để chia sẻ link được;
 * dữ liệu tab đang mở được nạp ở server. CTA / nút bình chọn chỉ render theo
 * capability server trả về.
 */
export default async function ContestPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  const isAdmin = viewerId ? Boolean(await getAuthedAdminId(supabase)) : false;
  const now = new Date();

  let data: ContestPageData;
  try {
    data = await loadContestPage(supabase, { slug, viewerId, isAdmin, now });
  } catch (error) {
    if (error instanceof ContestError && error.code === "contest_not_found") notFound();
    throw error;
  }
  const { row, contest, capabilities } = data;
  const tab = resolveTab(contest.status, query.tab);
  const phase = PHASE_COPY[contest.status];
  const finished = isFinished(contest.status);
  const baseHref = `/cuoc-thi/${contest.slug}`;

  const { data: entryBooks } = data.viewerEntries.length
    ? await supabase.from("books").select("id, title").in("id", data.viewerEntries.map((e) => e.book_id))
    : { data: [] as { id: string; title: string }[] };
  const bookTitles = new Map((entryBooks ?? []).map((b) => [b.id, b.title]));

  return (
    <div className="flex-1 bg-neutral-bg">
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        {data.isAdminPreview && (
          <div className="flex items-center gap-2 border-b border-cream-gold-border bg-cream-card px-4 py-2.5 text-[13.5px] text-cream-gold-text sm:px-8 lg:px-11">
            <EyeSlashIcon size={16} weight="fill" className="shrink-0 text-brand-gold-dark" /> {PHASE_COPY.draft.banner}
          </div>
        )}
        <ContestHero
          contest={contest}
          capabilities={capabilities}
          counts={data.counts}
          announcedAt={data.announcedAt}
          loggedIn={viewerId !== null}
          reminderOn={data.reminderOn}
          viewerEntries={data.viewerEntries}
          bookTitles={bookTitles}
        />

        <nav className="sticky top-0 z-10 flex gap-6 overflow-x-auto border-b border-border-light bg-white px-4 sm:gap-8 sm:px-8 lg:px-11 [scrollbar-width:none]">
          {tabsFor(contest.status).map((t) => (
            <Link key={t.key} href={`${baseHref}?tab=${t.key}`} scroll={false}
              className={`shrink-0 whitespace-nowrap border-b-[3px] pb-3.5 pt-4 text-[15px] no-underline ${
                t.key === tab ? "border-brand-gold font-bold text-brand-ink" : "border-transparent font-medium text-stone-alt"
              }`}>
              {t.label}
            </Link>
          ))}
        </nav>

        {phase.banner && contest.status !== "draft" && (
          <div className="mx-4 mt-5 flex items-start gap-2.5 rounded-[14px] border border-info-bg bg-info-bg/60 px-4 py-3 text-sm text-brand-ink sm:mx-8 lg:mx-11">
            <InfoIcon size={18} className="mt-px shrink-0" /> {phase.banner}
          </div>
        )}

        <main className="px-4 pb-12 pt-7 sm:px-8 lg:px-11">
          <TabContent tab={tab} data={data} query={query} finished={finished} viewerId={viewerId} now={now} baseHref={baseHref} rowForAwards={row} />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

async function TabContent({
  tab,
  data,
  query,
  finished,
  viewerId,
  now,
  baseHref,
  rowForAwards,
}: {
  tab: TabKey;
  data: ContestPageData;
  query: { sort?: string; genre?: string };
  finished: boolean;
  viewerId: string | null;
  now: Date;
  baseHref: string;
  rowForAwards: ContestPageData["row"];
}) {
  const supabase = createServiceRoleClient();
  const { row, contest, capabilities } = data;

  if (tab === "kham-pha") {
    const hasEntries = capabilities.available_feeds.includes("new");
    if (!hasEntries) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border-light px-6 py-12 text-center">
          <SparkleIcon size={34} className="text-brand-gold-dark" />
          <div className="text-xl font-bold text-ink">Chưa có tác phẩm dự thi</div>
          <div className="max-w-[420px] text-sm leading-relaxed text-stone-alt">
            Cuộc thi mở nhận bài từ {formatVnDateTime(contest.submission_start)}. Trong lúc chờ, đọc thể lệ và chuẩn bị bản thảo của bạn.
          </div>
          <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row">
            <Link href={`${baseHref}?tab=the-le`} scroll={false} className="rounded-full border border-border-light px-5 py-2.5 text-sm font-semibold text-ink no-underline">Đọc thể lệ</Link>
            <Link href="/author" className="rounded-full bg-brand-gold px-5 py-2.5 text-sm font-semibold text-brand-ink no-underline">Mở trình soạn thảo</Link>
          </div>
        </div>
      );
    }
    const [top, newest, discover] = await Promise.all([
      capabilities.available_feeds.includes("top") ? getTopEntries(supabase, { contest: row, capabilities }) : Promise.resolve(null),
      getContestEntries(supabase, { contest: row, capabilities, sort: "new", limit: 10, viewerId, now }),
      getContestEntries(supabase, { contest: row, capabilities, sort: "discover", limit: 20, viewerId, now }),
    ]);
    return (
      <div className="flex flex-col gap-9">
        {top && (
          <EntryRow
            title="Top truyện"
            subtitle={capabilities.popular_values_visible ? "Xếp theo phiếu bình chọn hợp lệ." : "Xếp theo phiếu bình chọn hợp lệ — số phiếu được ẩn đến khi kết thúc bình chọn."}
            icon={<TrophyIcon size={18} weight="fill" className="text-brand-gold-dark" />}
            items={top.items.map((r) => ({ key: r.submission_id, book: r.book, rank: r.rank, meta: r.votes === null ? null : `${r.votes.toLocaleString("vi-VN")} phiếu` }))}
            moreHref={`${baseHref}?tab=bxh`}
          />
        )}
        <EntryRow
          title="Mới tham gia"
          subtitle="Vừa gửi dự thi."
          icon={<SparkleIcon size={18} weight="fill" className="text-brand-gold-dark" />}
          items={newest.items.map((e) => ({ key: e.submission_id, book: e.book }))}
          moreHref={`${baseHref}?tab=${finished ? "tac-pham" : "bai"}&sort=new`}
          empty="Chưa có tác phẩm dự thi."
        />
        <EntryRow
          title="Truyện đề xuất"
          subtitle="Xáo ngẫu nhiên mỗi ngày — không dựa trên lượt đọc."
          icon={<DiamondIcon size={18} weight="fill" className="text-brand-gold-dark" />}
          items={discover.items.slice(0, 10).map((e) => ({ key: e.submission_id, book: e.book }))}
        />
        <RandomPick pool={discover.items.map((e) => e.book)} variant="banner" />
      </div>
    );
  }

  if (tab === "bai" || tab === "tac-pham") {
    const sort = SORTS.includes(query.sort as EntrySort) ? (query.sort as EntrySort) : "discover";
    const genre = query.genre && GENRE_LABELS.includes(query.genre) ? query.genre : null;
    const initial = await getContestEntries(supabase, { contest: row, capabilities, sort, genre, limit: 20, viewerId, now });
    const voting = contest.status === "community_voting";
    return (
      <div className="flex flex-col gap-5">
        {voting && (
          <div className="flex items-start gap-3 rounded-[14px] bg-brand-ink px-4 py-3.5 text-sm text-white sm:items-center">
            <TrophyIcon size={20} weight="fill" className="shrink-0 text-brand-gold-light" />
            <span>
              Mỗi tài khoản bình chọn được <b className="text-brand-gold-light">1 phiếu cho mỗi tác phẩm</b>. Phiếu chỉ hợp lệ khi bạn đã đọc hết ít nhất 1 chương
              của tác phẩm và tài khoản đủ {contest.vote.min_account_age_days} ngày tuổi.
            </span>
          </div>
        )}
        <EntryGrid key={`${sort}-${genre ?? ""}`} slug={contest.slug} baseHref={`${baseHref}?tab=${tab}`} sort={sort} genre={genre}
          genres={GENRE_LABELS} initial={initial} showVote={voting} />
      </div>
    );
  }

  if (tab === "bxh" || tab === "ket-qua") {
    const popularVisible = capabilities.rankings_visible.popular;
    const [ranking, awards] = await Promise.all([
      popularVisible ? getPopularRanking(supabase, { contest: row, capabilities }) : Promise.resolve(null),
      tab === "ket-qua" ? listPublicAwards(supabase, rowForAwards, now) : Promise.resolve([] as PublicAward[]),
    ]);
    const kinds: RankingKindTab[] = [
      {
        key: "popular",
        label: "Độc giả yêu thích",
        locked: popularVisible
          ? null
          : !capabilities.available_feeds.includes("new")
            ? "Bảng xếp hạng xuất hiện khi cuộc thi có tác phẩm dự thi."
            : contest.voting_start
              ? `Mở khi bắt đầu bình chọn (${formatVnDateTime(contest.voting_start)}).`
              : "Mở khi bắt đầu bình chọn.",
      },
      {
        key: "final",
        label: "Chung cuộc",
        locked: capabilities.results_visible
          ? "Cuộc thi này công bố kết quả qua danh sách giải thưởng."
          : `Điểm Ban giám khảo và Chung cuộc được giữ kín đến ngày công bố${contest.result_at ? ` ${formatVnDateTime(contest.result_at)}` : ""} để việc chấm diễn ra độc lập.`,
      },
      {
        key: "jury",
        label: "Ban giám khảo",
        locked: capabilities.results_visible
          ? "Cuộc thi này công bố kết quả qua danh sách giải thưởng."
          : "Điểm Ban giám khảo được giữ kín đến ngày công bố kết quả.",
      },
      { key: "trending", label: "Trending", locked: "Bảng Trending (tốc độ tăng độc giả duy nhất) sẽ sớm có." },
    ];
    return (
      <div className="flex flex-col gap-9">
        {tab === "ket-qua" && <Results awards={awards} publishedAt={contest.results_published_at} visible={capabilities.results_visible} />}
        <RankingBoard slug={contest.slug} kinds={kinds} initial={ranking} />
      </div>
    );
  }

  if (tab === "the-le") {
    const r = contest.eligibility;
    const facts = [
      r.min_published_chapters ? `Tối thiểu ${r.min_published_chapters} chương đã xuất bản` : null,
      r.min_words !== null || r.max_words !== null
        ? `Độ dài ${r.min_words !== null ? r.min_words.toLocaleString("vi-VN") : "0"}${r.max_words !== null ? `–${r.max_words.toLocaleString("vi-VN")}` : "+"} chữ`
        : null,
      r.allowed_genres ? `Thể loại: ${r.allowed_genres.join(", ")}` : null,
      r.required_tags.length ? `Tag bắt buộc: ${r.required_tags.join(", ")}` : null,
      r.first_published_after ? `Đăng lần đầu trên Vịnh từ ${formatVnDateTime(r.first_published_after)}` : null,
      r.max_entries_per_author ? `Mỗi tác giả gửi tối đa ${r.max_entries_per_author} tác phẩm` : null,
      r.min_author_age ? `Tác giả từ ${r.min_author_age} tuổi` : null,
      r.require_exclusive ? "Chỉ nhận truyện Độc quyền trên Vịnh (không tắt được độc quyền đến khi công bố kết quả)" : null,
      r.allow_multi_contest ? null : "Chỉ dự thi cuộc thi này (không đồng thời dự cuộc thi khác)",
      r.no_prior_entries ? "Chưa từng dự cuộc thi nào" : null,
      r.no_prior_awards ? "Chưa từng đạt giải ở cuộc thi khác" : null,
      "Mọi chương miễn phí (cả giá đọc và giá audio) đến khi công bố kết quả",
      `Bình chọn: 1 phiếu / tác phẩm / tài khoản; tài khoản từ ${contest.vote.min_account_age_days} ngày tuổi${contest.vote.require_completed_chapter ? ", đã đọc hết ít nhất 1 chương của tác phẩm" : ""}`,
    ].filter((x): x is string => x !== null);
    const timeline: [string, string | null][] = [
      ["Nhận bài", `${formatVnDateTime(contest.submission_start)} – ${formatVnDateTime(contest.submission_end)}`],
      ["Bình chọn", contest.voting_start ? `${formatVnDateTime(contest.voting_start)} – ${formatVnDateTime(contest.voting_end)}` : null],
      ["Chấm giải", contest.judging_start ? `${formatVnDateTime(contest.judging_start)} – ${formatVnDateTime(contest.judging_end)}` : null],
      ["Công bố", contest.result_at ? formatVnDateTime(contest.result_at) : null],
    ];
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div className="flex flex-col gap-1 text-sm text-slate lg:sticky lg:top-[70px] lg:self-start">
          <span className="font-semibold text-brand-ink">Thể lệ cuộc thi</span>
          <span className="text-xs text-stone-light">{finished ? "Phiên bản cuối · đã khoá" : `Phiên bản ${contest.rules_version}`}</span>
        </div>
        <div className="flex max-w-[720px] flex-col gap-7 text-[15px] leading-[1.7] text-ink">
          <section>
            <h2 className="mb-2 text-lg font-bold">Điều kiện dự thi</h2>
            <ul className="list-disc pl-5">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-bold">Thời gian</h2>
            <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-[14.5px] sm:grid-cols-[160px_1fr]">
              {timeline.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-stone-alt">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
          {contest.rules_content.trim() && (
            <section>
              <h2 className="mb-2 text-lg font-bold">Nội dung thể lệ</h2>
              <div className="whitespace-pre-line">{contest.rules_content}</div>
            </section>
          )}
        </div>
      </div>
    );
  }

  if (tab === "giai") {
    const awards = await listPublicAwards(supabase, rowForAwards, now);
    return (
      <div className="flex flex-col gap-6">
        {contest.prizes_summary.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-light p-10 text-center text-sm text-stone-alt">Ban tổ chức chưa công bố cơ cấu giải.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contest.prizes_summary.map((p, i) => {
              const winners = awards.filter((a) => !a.revoked && a.award_name === p.name);
              return (
                <div key={`${p.name}-${i}`}
                  className={`flex min-h-[190px] flex-col gap-2 rounded-[18px] border p-5 ${i === 0 ? "border-cream-gold-border bg-cream-card" : "border-border-light bg-white"}`}>
                  <div className="flex items-center gap-2 text-[13px] font-bold tracking-[.4px] text-brand-gold-dark"><TrophyIcon size={18} weight="fill" /> {p.name}</div>
                  <div className="text-[26px] font-extrabold tracking-[-.5px] text-brand-ink">{vnd(p.amount_vnd)}</div>
                  {p.extra && <div className="text-[13.5px] leading-normal text-slate">{p.extra}</div>}
                  <div className="mt-auto border-t border-cream-border pt-2.5 text-[12.5px] text-stone-alt">
                    {capabilities.results_visible
                      ? winners.length ? `Trao cho: ${winners.map((w) => `${w.book_title} · ${w.author_name}`).join("; ")}` : "Không trao"
                      : contest.result_at ? `Công bố ${formatVnDateTime(contest.result_at)}` : "Công bố cùng kết quả"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-stone-alt">Giải thưởng được quy đổi thành token và trao vào ví tác giả.</p>
      </div>
    );
  }

  // dau-an
  const { data: events } = await supabase
    .from("contest_status_events")
    .select("to_status, created_at")
    .eq("contest_id", row.id)
    .order("created_at", { ascending: true });
  const stats: [string, string][] = [
    [data.counts.entries.toLocaleString("vi-VN"), "tác phẩm dự thi"],
    [data.counts.authors.toLocaleString("vi-VN"), "tác giả"],
  ];
  return (
    <div className="grid grid-cols-1 gap-9 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section>
        <h2 className="mb-4 text-xl font-bold text-ink">Mùa thi qua những con số</h2>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          {stats.map(([v, k]) => (
            <div key={k} className="rounded-2xl border border-border-light bg-neutral-bg/60 p-4 sm:p-5">
              <div className="text-[26px] font-extrabold tracking-[-.5px] text-brand-ink sm:text-[28px]">{v}</div>
              <div className="mt-0.5 text-[13px] text-stone-alt">{k}</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-4 text-xl font-bold text-ink">Lịch sử cuộc thi</h2>
        <ol className="ml-1.5 flex flex-col border-l-2 border-cream-gold-border">
          {(events ?? []).map((e, i) => (
            <li key={i} className="relative pb-4 pl-5 last:pb-0">
              <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-gold" />
              <div className="text-xs font-semibold text-brand-gold-dark">{formatVnDateTime(e.created_at)}</div>
              <div className="mt-0.5 text-sm text-ink">{CONTEST_STATUS_LABEL[e.to_status]}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Results({ awards, publishedAt, visible }: { awards: PublicAward[]; publishedAt: string | null; visible: boolean }) {
  if (!visible) {
    return <div className="rounded-2xl border border-dashed border-border-light p-10 text-center text-sm text-stone-alt">Kết quả chưa được công bố.</div>;
  }
  const ranked = awards.filter((a) => a.award_rank !== null && a.award_rank <= 3).slice(0, 3);
  const others = awards.filter((a) => !ranked.includes(a));
  // Podium: hạng 2 – hạng 1 – hạng 3 trên desktop; mobile xếp dọc theo hạng.
  const podiumOrder = [ranked.find((a) => a.award_rank === 2), ranked.find((a) => a.award_rank === 1), ranked.find((a) => a.award_rank === 3)].filter(
    (a): a is PublicAward => a !== undefined
  );

  const cover = (a: PublicAward, size: string) =>
    a.book ? (
      <div className={`${size} overflow-hidden rounded-xl shadow-[0_14px_30px_rgb(0_0_0/.2)]`}>
        <BookCover id={a.book.id} title={a.book.title} genre={a.book.genre} coverUrl={a.book.coverUrl} className="h-full w-full" />
      </div>
    ) : (
      <div className={`${size} flex items-center justify-center rounded-xl bg-neutral-bg p-3 text-center text-xs text-stone-alt`}>Tác phẩm không còn khả dụng</div>
    );

  return (
    <section>
      {publishedAt && <div className="text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">CÔNG BỐ {formatVnDateTime(publishedAt).split(" ").pop()}</div>}
      <h2 className="mt-1.5 text-2xl font-bold text-ink">Tác phẩm đạt giải</h2>
      {awards.length === 0 ? (
        <p className="mt-4 text-sm text-stone-alt">Cuộc thi chưa trao giải nào.</p>
      ) : (
        <>
          {podiumOrder.length > 0 && (
            <div className="mt-5 flex flex-col gap-4 md:grid md:grid-cols-[1fr_1.15fr_1fr] md:items-end md:gap-5">
              {podiumOrder.map((a) => {
                const big = a.award_rank === 1;
                const inner = (
                  <>
                    {cover(a, big ? "h-[240px] w-[170px]" : "h-[196px] w-[140px]")}
                    <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-cream-gold px-3 py-1 text-[12.5px] font-bold text-brand-gold-dark">
                      <TrophyIcon size={13} weight="fill" /> {a.award_name}
                    </div>
                    <div className={`mt-2 text-[17px] font-bold ${a.revoked ? "text-stone-alt line-through" : "text-ink"}`}>{a.book_title}</div>
                    <div className="mt-0.5 text-[13px] text-stone-alt">{a.author_name}</div>
                    {a.revoked && <div className="mt-1 rounded-full bg-error-bg px-2 py-0.5 text-[11px] font-semibold text-error">Đã thu hồi</div>}
                  </>
                );
                const cls = `flex flex-col items-center rounded-[20px] border text-center ${big ? "order-first border-cream-gold-border bg-cream-card px-5 pb-6 pt-7 md:order-none" : "border-border-light bg-neutral-bg/60 px-5 pb-5 pt-5"}`;
                return a.book && !a.revoked ? (
                  <Link key={a.id} href={`/truyen/${a.book.slug}`} className={`${cls} no-underline`}>{inner}</Link>
                ) : (
                  <div key={a.id} className={cls}>{inner}</div>
                );
              })}
            </div>
          )}
          {others.length > 0 && (
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-[14px] border border-border-light p-3">
                  {cover(a, "h-[60px] w-[44px] shrink-0")}
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-bold uppercase tracking-[.4px] text-brand-gold-dark">{a.award_name}</div>
                    <div className={`truncate text-sm font-semibold ${a.revoked ? "text-stone-alt line-through" : "text-ink"}`}>{a.book_title}</div>
                    <div className="text-xs text-stone-alt">{a.author_name}{a.revoked ? " · Đã thu hồi" : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
